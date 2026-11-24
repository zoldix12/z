/**
 * الخادم الرئيسي لمطعم zoldix على المنفذ 3000.
 * يجمع تطبيق Express (/server/app.ts) + WebSocket الحقيقي للتحديث الفوري للجميع والمحادثة المباشرة
 * مع تقديم واجهة Vite في التطوير أو ملفات dist في الإنتاج.
 */
import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createApp, extractSessionToken as _unusedExtract, parseCookies } from './server/app.ts';
import { findDriverByEmail, getSession, getStore } from './server/store.ts';
import type { SubmittedOrderReceipt } from './src/types/menu';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

interface WsClientMeta {
  ws: WebSocket;
  role: 'guest' | 'customer' | 'admin';
  email: string | null;
  threadId: string | null;
  orderId: string | null;
}

async function startServer() {
  getStore();

  const wsClients = new Set<WsClientMeta>();

  function broadcastAll(payload: Record<string, unknown>): void {
    const raw = JSON.stringify(payload);
    for (const client of wsClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  }

  function broadcastChatEvent(threadId: string, payload: Record<string, unknown>): void {
    const raw = JSON.stringify(payload);
    const thread = getStore().chats[threadId];
    const isDm = threadId.startsWith('dm:') || thread?.threadType === 'dm';

    for (const client of wsClients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (isDm) {
        const participants = thread?.participants || [];
        if (client.email && participants.includes(client.email.toLowerCase())) {
          client.ws.send(raw);
        }
        continue;
      }
      const clientDriver = client.email ? findDriverByEmail(client.email) : null;
      if (
        client.role === 'admin' ||
        client.threadId === threadId ||
        (client.email && `user:${client.email}` === threadId) ||
        (clientDriver && `driver:${clientDriver.id}` === threadId)
      ) {
        client.ws.send(raw);
      }
    }
  }

  function broadcastToAdmins(payload: Record<string, unknown>): void {
    const raw = JSON.stringify(payload);
    for (const client of wsClients) {
      if (client.ws.readyState === WebSocket.OPEN && client.role === 'admin') {
        client.ws.send(raw);
      }
    }
  }

  function broadcastOrderUpdate(order: SubmittedOrderReceipt): void {
    const raw = JSON.stringify({ type: 'order:updated', order });
    const assignedDriver = order.driverId ? getStore().drivers[order.driverId] : null;
    const assignedDriverEmail = assignedDriver?.email?.trim().toLowerCase() || null;

    for (const client of wsClients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (
        client.role === 'admin' ||
        (client.email && order.customerEmail && client.email === order.customerEmail.toLowerCase()) ||
        (client.email && assignedDriverEmail && client.email === assignedDriverEmail) ||
        (client.orderId && client.orderId === order.orderId)
      ) {
        client.ws.send(raw);
      }
    }
  }

  function kickDisabledUserSockets(email: string): void {
    const clean = email.trim().toLowerCase();
    const raw = JSON.stringify({
      type: 'account:disabled',
      message: 'تم تعطيل هذا الحساب من قبل إدارة المطعم.',
    });
    for (const client of wsClients) {
      if (client.email === clean && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
        client.role = 'guest';
        client.email = null;
      }
    }
  }

  const app = createApp({
    broadcastAll,
    broadcastChatEvent,
    broadcastToAdmins,
    broadcastOrderUpdate,
    kickDisabledUserSockets,
    getWsClientsCount: () => wsClients.size,
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const queryToken = url.searchParams.get('token');
    const queryThreadId = url.searchParams.get('threadId');
    const cookies = parseCookies(req.headers.cookie);
    const session = getSession(queryToken || cookies.zoldix_session);

    const activeEmail = session?.impersonatingEmail || session?.email || null;
    const meta: WsClientMeta = {
      ws,
      role: session ? session.role : 'guest',
      email: activeEmail,
      threadId: session?.role === 'customer' && activeEmail ? `user:${activeEmail}` : queryThreadId || null,
      orderId: url.searchParams.get('orderId') || null,
    };
    wsClients.add(meta);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString('utf8')) as {
          type?: string;
          token?: string;
          threadId?: string;
          orderId?: string;
        };
        if (msg.type === 'auth') {
          const nextSess = getSession(msg.token);
          if (nextSess) {
            meta.role = nextSess.role;
            meta.email = nextSess.impersonatingEmail || nextSess.email;
            if (nextSess.role === 'customer') {
              meta.threadId = `user:${nextSess.email}`;
            }
          } else {
            meta.role = 'guest';
            meta.email = null;
          }
        } else if (msg.type === 'subscribe_thread' && typeof msg.threadId === 'string') {
          meta.threadId = msg.threadId.slice(0, 180);
        } else if (msg.type === 'subscribe_order' && typeof msg.orderId === 'string') {
          meta.orderId = msg.orderId.slice(0, 64);
        }
      } catch {
        // تجاهل الرسائل غير الصالحة
      }
    });

    ws.on('close', () => {
      wsClients.delete(meta);
    });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir, { maxAge: '1d' }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`zoldix restaurant server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
