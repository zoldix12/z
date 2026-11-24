/**
 * نقطة دخول Vercel Serverless Function لجميع مسارات /api/*.
 * مستقلة تماماً عن بيئة AI Studio وتدعم تخزين البيانات الدائم عبر REST KV ومزامنة Express.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.ts';
import { ensureStoreHydrated, flushRemoteStore, isStoreDirty } from '../server/store.ts';

const app = createApp();

export function normalizeVercelApiUrl(rawUrl: string | undefined): string {
  const input = rawUrl || '/api/health';
  try {
    const parsed = new URL(input, 'https://zoldix.invalid');
    const rewrittenPath = parsed.searchParams.get('__path');
    if (rewrittenPath !== null) {
      parsed.searchParams.delete('__path');
      const cleanSub = rewrittenPath.replace(/^\/+/, '');
      const qs = parsed.searchParams.toString();
      return `/api/${cleanSub || 'health'}${qs ? `?${qs}` : ''}`;
    }
    if (
      parsed.pathname === '/api' ||
      parsed.pathname === '/api/' ||
      parsed.pathname === '/api/index' ||
      parsed.pathname === '/api/index/'
    ) {
      const qs = parsed.searchParams.toString();
      return `/api/health${qs ? `?${qs}` : ''}`;
    }
    const qs = parsed.searchParams.toString();
    return `${parsed.pathname}${qs ? `?${qs}` : ''}`;
  } catch {
    return input;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  req.url = normalizeVercelApiUrl(req.url);
  await ensureStoreHydrated();

  await new Promise<void>((resolve) => {
    const origEnd = res.end.bind(res);
    let finished = false;

    const finalize = () => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };

    res.once('close', finalize);

    res.end = function (...args: unknown[]) {
      if (!isStoreDirty()) {
        const ret = (origEnd as (...a: unknown[]) => ServerResponse)(...args);
        finalize();
        return ret;
      }

      flushRemoteStore()
        .catch((err) => {
          console.error('Vercel remote store flush error:', err);
        })
        .finally(() => {
          (origEnd as (...a: unknown[]) => ServerResponse)(...args);
          finalize();
        });
      return res;
    } as typeof res.end;

    app(req as never, res as never);
  });
}
