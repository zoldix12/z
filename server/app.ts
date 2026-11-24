/**
 * تطبيق Express للـ API الخاص بمطعم zoldix.
 * يعمل مباشرة سواء مع الخادم الكامل (server.ts + WebSocket) أو عبر Netlify Functions (serverless-http).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import express, { type NextFunction, type Request, type Response } from 'express';
import Stripe from 'stripe';
import {
  sendAdminSecurityEmail,
  sendCustomerOtpEmail,
  sendInvitedAdminOtpEmail,
  sendOrderNotificationEmail,
  sendPaymentConfirmationEmail,
  testSmtpConnection,
} from './mailer.ts';
import {
  appendChatMessage,
  createOtpChallenge,
  createSession,
  findDriverByEmail,
  findUserByIdentifier,
  getAdminSecurityEmail,
  getEffectiveSmtpConfig,
  getEffectiveStripeKeys,
  getOrCreateChatThread,
  getOrCreateCustomerAccount,
  getOrCreateDmThread,
  getPrimaryDeveloperEmail,
  getSession,
  getStore,
  hasConfiguredSmtp,
  hasRemotePersistence,
  hashCustomerPassword,
  incrementCouponUsage,
  isAuthorizedAdminEmail,
  isAuthorizedDeveloperEmail,
  isUsernameTaken,
  listUserDmThreads,
  markThreadRead,
  normalizeUsername,
  playChatGameMove,
  recordOrderInStore,
  registerOrUpdateCustomerWithPassword,
  resetSiteConfigToSeed,
  revokeAllSessionsForEmail,
  revokeSession,
  sanitizeCustomerForClient,
  saveStore,
  searchUsersPublic,
  setSessionImpersonation,
  startChatGame,
  updateAdminPassword,
  updateCustomerCart,
  updateCustomerFavorites,
  updateCustomerProfile,
  updateOrderStatusAndDriver,
  validateAndSanitizeSiteConfig,
  validateCouponForOrder,
  verifyAdminPassword,
  verifyCustomerPassword,
  verifyOtpChallenge,
  type SessionRecord,
} from './store.ts';
import type {
  Addon,
  CartEntry,
  Coupon,
  Driver,
  OrderStatus,
  SubmittedOrderReceipt,
} from '../src/types/menu';

export interface ServerRealtimeHooks {
  broadcastAll?: (payload: Record<string, unknown>) => void;
  broadcastChatEvent?: (threadId: string, payload: Record<string, unknown>) => void;
  broadcastToAdmins?: (payload: Record<string, unknown>) => void;
  broadcastOrderUpdate?: (order: SubmittedOrderReceipt) => void;
  kickDisabledUserSockets?: (email: string) => void;
  getWsClientsCount?: () => number;
}

function getCurrentDir(): string {
  try {
    if (typeof __dirname === 'string' && __dirname) {
      return __dirname;
    }
  } catch {
    // ignore in pure ESM
  }
  try {
    if (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // ignore
  }
  return process.cwd();
}

const MODULE_DIR = getCurrentDir();

function resolveRootDir(): string {
  const candidates = [
    path.resolve(MODULE_DIR, '..'),
    path.resolve(MODULE_DIR),
    path.resolve(process.cwd()),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }
  return candidates[0];
}

// Rate limiting per action
const rateBuckets = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const vercelFwd = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelFwd === 'string' && vercelFwd.trim()) {
    return vercelFwd.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - timestamps[0])) / 1000));
    rateBuckets.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return { allowed: true, retryAfterSec: 0 };
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies.zoldix_session || null;
}

function isHttpsRequest(req: Request): boolean {
  const sock = req.socket as { encrypted?: boolean } | undefined;
  const conn = (req as unknown as { connection?: { encrypted?: boolean } }).connection;
  if (sock?.encrypted || conn?.encrypted) return true;
  if (sock && conn && req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  return Boolean(process.env.VERCEL || process.env.NETLIFY);
}

function getPublicOrigin(req: Request): string {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (originHeader && (originHeader.startsWith('https://') || originHeader.startsWith('http://'))) {
    return originHeader.replace(/\/+$/, '');
  }
  const envUrl = (
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  )
    .trim()
    .replace(/\/+$/, '');

  const hostRaw = req.headers['x-forwarded-host'] || req.headers.host || '';
  const host = (Array.isArray(hostRaw) ? hostRaw[0] : hostRaw).split(',')[0].trim();
  if (host) {
    const proto = isHttpsRequest(req) ? 'https' : 'http';
    return `${proto}://${host}`;
  }
  return envUrl;
}

function isAllowedOrigin(origin: string, req: Request): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const reqHostRaw = req.headers['x-forwarded-host'] || req.headers.host || '';
    const reqHost = (Array.isArray(reqHostRaw) ? reqHostRaw[0] : reqHostRaw).split(',')[0].trim();
    if (reqHost && parsed.host.toLowerCase() === reqHost.toLowerCase()) {
      return true;
    }

    const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (extraOrigins.includes(parsed.origin.toLowerCase())) {
      return true;
    }

    if (
      process.env.NODE_ENV !== 'production' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const secure = isHttpsRequest(req);
  if (secure) {
    const maxAgeSec = 60 * 60 * 24 * 7;
    res.setHeader(
      'Set-Cookie',
      `zoldix_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.cookie('zoldix_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }
}

function clearSessionCookie(req: Request, res: Response): void {
  const secure = isHttpsRequest(req);
  if (secure) {
    res.setHeader(
      'Set-Cookie',
      'zoldix_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned'
    );
  } else {
    res.clearCookie('zoldix_session', { path: '/' });
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

function normalizeDigits(val: unknown): string {
  if (typeof val !== 'string') return '';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  let out = '';
  for (const ch of val) {
    const idxA = arabic.indexOf(ch);
    const idxP = persian.indexOf(ch);
    if (idxA !== -1) out += String(idxA);
    else if (idxP !== -1) out += String(idxP);
    else out += ch;
  }
  return out.replace(/[\s\-()]/g, '');
}

function isSafeExternalUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

interface AuthedRequest extends Request {
  session?: SessionRecord;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
    return;
  }
  req.session = session;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  const session = getSession(token);
  if (!session || session.role !== 'admin') {
    res.status(403).json({ error: 'هذا الإجراء متاح للإدارة فقط.' });
    return;
  }
  req.session = session;
  next();
}

function requireDeveloper(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  const session = getSession(token);
  if (!session || !isAuthorizedDeveloperEmail(session.email)) {
    res.status(403).json({ error: 'هذه الأدوات متاحة لحسابات المطورين المعتمدة فقط.' });
    return;
  }
  req.session = session;
  next();
}

function requireDeveloperOrAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  const session = getSession(token);
  if (!session || (session.role !== 'admin' && !isAuthorizedDeveloperEmail(session.email))) {
    res.status(403).json({ error: 'هذا الإجراء متاح للمطورين أو الإدارة فقط.' });
    return;
  }
  req.session = session;
  next();
}

function isValidLuhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let doubleIt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (doubleIt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    doubleIt = !doubleIt;
  }
  return sum % 10 === 0;
}

function getStripeClient(overrideSecret?: string): Stripe | null {
  const key = (overrideSecret ?? getEffectiveStripeKeys().secretKey).trim();
  if (!key) return null;
  return new Stripe(key);
}

interface PendingStripeOrder {
  receipt: SubmittedOrderReceipt;
  mapUrl: string;
  notes: string;
  couponId?: string;
  customerEmail?: string;
  notifyEmail?: string;
  createdAt: number;
}

const pendingStripeOrders = new Map<string, PendingStripeOrder>();
const processedStripeSessions = new Set<string>();

export function createApp(hooks: ServerRealtimeHooks = {}): express.Express {
  const ROOT_DIR = resolveRootDir();
  getStore();

  const broadcastAll = hooks.broadcastAll || (() => {});
  const broadcastChatEvent = hooks.broadcastChatEvent || (() => {});
  const broadcastToAdmins = hooks.broadcastToAdmins || (() => {});
  const broadcastOrderUpdate = hooks.broadcastOrderUpdate || (() => {});
  const kickDisabledUserSockets = hooks.kickDisabledUserSockets || (() => {});
  const getWsClientsCount = hooks.getWsClientsCount || (() => 0);

  const app = express();
  app.set('trust proxy', 1);
  app.use((req, _res, next) => {
    const r = req as Request & { _body?: boolean; readableEnded?: boolean };
    if (r.readableEnded && req.body !== undefined && typeof req.body === 'object') {
      r._body = true;
    }
    next();
  });
  app.use(express.json({ limit: '10mb' }));

  // CORS للمتصفح عند فصل الواجهة أو التشغيل تحت نطاق مخصص دون السماح لـ wildcard مع الجلسات
  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (origin && isAllowedOrigin(origin, req)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // حماية مسارات التعديل المعتمدة على الكوكي ضد CSRF
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api/') &&
      (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')
    ) {
      const hasBearer =
        typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
      const cookies = parseCookies(req.headers.cookie);
      if (!hasBearer && cookies.zoldix_session) {
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
        const hasCustomHeader = Boolean(req.headers['x-requested-with']);
        if (origin && !isAllowedOrigin(origin, req)) {
          res.status(403).json({ error: 'مصدر الطلب غير مصرح به.' });
          return;
        }
        if (!origin && !hasCustomHeader) {
          res.status(403).json({ error: 'تعذر التحقق من مصدر الطلب.' });
          return;
        }
      }
    }
    next();
  });

  // منع الوصول إلى الملفات الحساسة
  app.use((req, res, next) => {
    const blocked = req.path
      .split('/')
      .some((segment) => segment.startsWith('.env') || segment.startsWith('.git') || segment === 'data');
    if (blocked) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    next();
  });

  // =========================================================================
  // مسارات الصحة والموقع والإعدادات العامة
  // =========================================================================

  app.get('/api/health', (_req: Request, res: Response) => {
    const store = getStore();
    const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL);
    const isNetlify = Boolean(process.env.NETLIFY);
    const runtime = isVercel ? 'vercel-serverless' : isNetlify ? 'netlify-functions' : 'node-server';
    res.json({
      ok: true,
      service: store.siteConfig.restaurant.name,
      runtime,
      supportsWs: !isVercel && !isNetlify,
      persistentStorage: hasRemotePersistence() ? 'remote-kv' : isVercel || isNetlify ? 'ephemeral-tmp' : 'local-disk',
      smtpConfigured: hasConfiguredSmtp(),
    });
  });

  app.get('/api/locate', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const isPrivateOrLocal =
      !ip ||
      ip === 'unknown' ||
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('172.') ||
      ip.startsWith('fc') ||
      ip.startsWith('fd');

    if (!isPrivateOrLocal && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const geoRes = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (geoRes.ok) {
          const geo = (await geoRes.json()) as {
            success?: boolean;
            latitude?: number;
            longitude?: number;
            city?: string;
          };
          if (geo.success && typeof geo.latitude === 'number' && typeof geo.longitude === 'number') {
            res.json({
              lat: geo.latitude,
              lng: geo.longitude,
              city: geo.city || 'عمّان',
              approximate: true,
            });
            return;
          }
        }
      } catch {
        // السقوط الآمن إلى عمّان
      }
    }

    res.json({
      lat: 31.985421,
      lng: 35.87521,
      city: 'عمّان',
      approximate: true,
    });
  });

  app.get('/api/site', (_req: Request, res: Response) => {
    res.json(getStore().siteConfig);
  });

  app.get('/api/menu', (_req: Request, res: Response) => {
    res.json(getStore().siteConfig);
  });

  // =========================================================================
  // إنشاء الحساب + تسجيل الدخول بكلمة المرور أو برمز Gmail والتحقق الفوري
  // =========================================================================

  app.post('/api/auth/register/request-otp', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const { allowed, retryAfterSec } = checkRateLimit(`reg:${clientIp}`, 6, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `يرجى الانتظار ${retryAfterSec} ثانية قبل المحاولة مرة أخرى.`,
      });
      return;
    }

    const body = (req.body || {}) as {
      name?: unknown;
      username?: unknown;
      email?: unknown;
      password?: unknown;
    };
    const name = String(body.name || '').trim().slice(0, 80);
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (name.length < 2) {
      res.status(400).json({ error: 'يرجى إدخال اسمك الكامل.' });
      return;
    }
    if (!username) {
      res.status(400).json({
        error: 'يرجى اختيار يوزر فريد (3 إلى 24 حرفاً إنجليزياً صغيراً أو أرقاماً أو _ أو .).',
      });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح.' });
      return;
    }
    if (isUsernameTaken(username, email)) {
      res.status(409).json({ error: 'هذا اليوزر مستخدم بالفعل، يرجى اختيار يوزر آخر.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'يجب أن تكون كلمة المرور ستة أحرف على الأقل.' });
      return;
    }

    const store = getStore();
    const existing = store.users[email];
    if (existing?.disabled) {
      res.status(403).json({ error: 'هذا الحساب معطل حالياً، يرجى التواصل مع الإدارة.' });
      return;
    }
    if (existing?.passwordHash) {
      res.status(409).json({
        error: 'هذا البريد مسجل مسبقاً بكلمة مرور، يمكنك تسجيل الدخول من قسم تسجيل الدخول.',
      });
      return;
    }

    try {
      const passwordHash = hashCustomerPassword(password);
      const { challengeKey, code } = createOtpChallenge('customer_register', email, {
        name,
        username,
        passwordHash,
      });
      await sendCustomerOtpEmail(email, code, store.siteConfig.restaurant.name);
      res.json({
        ok: true,
        challengeKey,
        message: 'تم إرسال رمز تأكيد إنشاء الحساب إلى بريدك الإلكتروني.',
      });
    } catch (err) {
      console.error('Register OTP email error:', err);
      res.status(502).json({
        error: 'تعذر إرسال رمز التأكيد إلى البريد الإلكتروني، يرجى التحقق من إعدادات SMTP والمحاولة مجدداً.',
      });
    }
  });

  app.post('/api/auth/register/verify-otp', (req: Request, res: Response) => {
    const body = (req.body || {}) as { challengeKey?: unknown; email?: unknown; code?: unknown };
    const challengeKey = String(body.challengeKey || '').trim();
    const email = normalizeEmail(body.email);
    const code = normalizeDigits(body.code);

    if (!challengeKey || !isValidEmail(email) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'يرجى إدخال رمز التأكيد المكون من ستة أرقام.' });
      return;
    }

    const check = verifyOtpChallenge(challengeKey, 'customer_register', email, code);
    if (!check.ok || !check.meta?.passwordHash) {
      res.status(400).json({
        error: !check.ok ? check.error : 'بيانات إنشاء الحساب منتهية، يرجى إعادة المحاولة.',
      });
      return;
    }

    const user = registerOrUpdateCustomerWithPassword(
      email,
      check.meta.name || email.split('@')[0],
      check.meta.passwordHash,
      check.meta.username
    );
    const session = createSession('customer', user.email);
    const driverProfile = findDriverByEmail(user.email);
    const isDeveloper = isAuthorizedDeveloperEmail(user.email);
    const isPrimaryDeveloper = user.email.toLowerCase() === getPrimaryDeveloperEmail();
    setSessionCookie(req, res, session.token);

    res.json({
      ok: true,
      token: session.token,
      role: 'customer',
      adminEmail: null,
      user: sanitizeCustomerForClient(user),
      impersonating: false,
      driverProfile,
      isDeveloper,
      isPrimaryDeveloper,
    });
  });

  app.post('/api/auth/login-password', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const { allowed, retryAfterSec } = checkRateLimit(`pwlogin:${clientIp}`, 10, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `محاولات كثيرة، يرجى الانتظار ${retryAfterSec} ثانية ثم المحاولة.`,
      });
      return;
    }

    const body = (req.body || {}) as {
      email?: unknown;
      identifier?: unknown;
      password?: unknown;
      requireOtpConfirmation?: unknown;
    };
    const rawIdentifier = String(body.identifier || body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const requireOtpConfirmation = Boolean(body.requireOtpConfirmation);

    if (!rawIdentifier || !password) {
      res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو اليوزر وكلمة المرور.' });
      return;
    }

    const store = getStore();
    const existing = findUserByIdentifier(rawIdentifier);
    if (!existing) {
      res.status(401).json({ error: 'بيانات الدخول أو كلمة المرور غير صحيحة.' });
      return;
    }
    if (existing.disabled) {
      res.status(403).json({ error: 'هذا الحساب معطل حالياً، يرجى التواصل مع الإدارة.' });
      return;
    }
    if (!existing.passwordHash) {
      res.status(400).json({
        error: 'لم يتم تعيين كلمة مرور لهذا الحساب بعد، يمكنك الدخول عبر رمز البريد الإلكتروني أو إنشاء حساب بكلمة مرور.',
      });
      return;
    }
    if (!verifyCustomerPassword(existing.email, password)) {
      res.status(401).json({ error: 'بيانات الدخول أو كلمة المرور غير صحيحة.' });
      return;
    }

    if (requireOtpConfirmation) {
      try {
        const { challengeKey, code } = createOtpChallenge('customer_login_2fa', existing.email);
        await sendCustomerOtpEmail(existing.email, code, store.siteConfig.restaurant.name);
        res.json({
          ok: true,
          requiresOtp: true,
          challengeKey,
          email: existing.email,
          message: 'تم التحقق من كلمة المرور وإرسال رمز التأكيد إلى بريدك الإلكتروني.',
        });
      } catch (err) {
        console.error('Login 2FA OTP email error:', err);
        res.status(502).json({
          error: 'تعذر إرسال رمز التأكيد إلى البريد الإلكتروني، يرجى التأكد من إعدادات SMTP في لوحة الإدارة أو تعطيل التحقق المزدوج مؤقتاً.',
        });
      }
      return;
    }

    existing.lastLoginAt = new Date().toISOString();
    saveStore();

    const session = createSession('customer', existing.email);
    const driverProfile = findDriverByEmail(existing.email);
    const isDeveloper = isAuthorizedDeveloperEmail(existing.email);
    const isPrimaryDeveloper = existing.email.toLowerCase() === getPrimaryDeveloperEmail();
    setSessionCookie(req, res, session.token);

    res.json({
      ok: true,
      requiresOtp: false,
      token: session.token,
      role: 'customer',
      adminEmail: null,
      user: sanitizeCustomerForClient(existing),
      impersonating: false,
      driverProfile,
      isDeveloper,
      isPrimaryDeveloper,
    });
  });

  app.post('/api/auth/verify-login-2fa', (req: Request, res: Response) => {
    const body = (req.body || {}) as { challengeKey?: unknown; email?: unknown; code?: unknown };
    const challengeKey = String(body.challengeKey || '').trim();
    const email = normalizeEmail(body.email);
    const code = normalizeDigits(body.code);

    if (!challengeKey || !isValidEmail(email) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'يرجى إدخال الرمز المكون من ستة أرقام.' });
      return;
    }

    const store = getStore();
    if (store.users[email]?.disabled) {
      res.status(403).json({ error: 'هذا الحساب معطل حالياً، يرجى التواصل مع الإدارة.' });
      return;
    }

    const check = verifyOtpChallenge(challengeKey, 'customer_login_2fa', email, code);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }

    const user = getOrCreateCustomerAccount(email);
    const session = createSession('customer', user.email);
    const driverProfile = findDriverByEmail(user.email);
    const isDeveloper = isAuthorizedDeveloperEmail(user.email);
    const isPrimaryDeveloper = user.email.toLowerCase() === getPrimaryDeveloperEmail();
    setSessionCookie(req, res, session.token);

    res.json({
      ok: true,
      token: session.token,
      role: 'customer',
      adminEmail: null,
      user: sanitizeCustomerForClient(user),
      impersonating: false,
      driverProfile,
      isDeveloper,
      isPrimaryDeveloper,
    });
  });

  app.post('/api/auth/request-otp', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const { allowed, retryAfterSec } = checkRateLimit(`otp:${clientIp}`, 6, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `يرجى الانتظار ${retryAfterSec} ثانية قبل طلب رمز جديد.`,
      });
      return;
    }

    const email = normalizeEmail((req.body as { email?: unknown })?.email);
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح.' });
      return;
    }

    const store = getStore();
    const existing = store.users[email];
    if (existing?.disabled) {
      res.status(403).json({ error: 'هذا الحساب معطل حالياً، يرجى التواصل مع إدارة المطعم.' });
      return;
    }

    try {
      const { challengeKey, code } = createOtpChallenge('customer_login', email);
      await sendCustomerOtpEmail(email, code, store.siteConfig.restaurant.name);
      res.json({
        ok: true,
        challengeKey,
        message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني بنجاح.',
      });
    } catch (err) {
      console.error('Customer OTP email error:', err);
      res.status(502).json({
        error: 'تعذر إرسال رمز التحقق إلى البريد الإلكتروني، يرجى التحقق من إعدادات SMTP والمحاولة مجدداً.',
      });
    }
  });

  app.post('/api/auth/verify-otp', (req: Request, res: Response) => {
    const body = (req.body || {}) as { challengeKey?: unknown; email?: unknown; code?: unknown };
    const challengeKey = String(body.challengeKey || '').trim();
    const email = normalizeEmail(body.email);
    const code = normalizeDigits(body.code);

    if (!challengeKey || !isValidEmail(email) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'يرجى إدخال الرمز المكون من ستة أرقام بشكل صحيح.' });
      return;
    }

    const store = getStore();
    if (store.users[email]?.disabled) {
      res.status(403).json({ error: 'هذا الحساب معطل حالياً، يرجى التواصل مع الإدارة.' });
      return;
    }

    const check = verifyOtpChallenge(challengeKey, 'customer_login', email, code);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }

    const user = getOrCreateCustomerAccount(email);
    const session = createSession('customer', user.email);
    const driverProfile = findDriverByEmail(user.email);
    const isDeveloper = isAuthorizedDeveloperEmail(user.email);
    const isPrimaryDeveloper = user.email.toLowerCase() === getPrimaryDeveloperEmail();
    setSessionCookie(req, res, session.token);

    res.json({
      ok: true,
      token: session.token,
      role: 'customer',
      adminEmail: null,
      user: sanitizeCustomerForClient(user),
      impersonating: false,
      driverProfile,
      isDeveloper,
      isPrimaryDeveloper,
    });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const token = extractSessionToken(req);
    const session = getSession(token);
    if (!session) {
      res.json({
        ok: true,
        role: 'guest',
        adminEmail: null,
        user: null,
        impersonating: false,
        driverProfile: null,
        isDeveloper: false,
        isPrimaryDeveloper: false,
      });
      return;
    }

    const store = getStore();
    const isDeveloper = isAuthorizedDeveloperEmail(session.email);
    const isPrimaryDeveloper = session.email.toLowerCase() === getPrimaryDeveloperEmail();

    if (session.role === 'admin') {
      const targetUser = session.impersonatingEmail
        ? store.users[session.impersonatingEmail] || null
        : null;
      res.json({
        ok: true,
        role: 'admin',
        adminEmail: session.email,
        token: session.token,
        user: sanitizeCustomerForClient(targetUser),
        impersonating: Boolean(targetUser),
        driverProfile: targetUser ? findDriverByEmail(targetUser.email) : null,
        isDeveloper,
        isPrimaryDeveloper,
      });
      return;
    }

    const user = store.users[session.email] || null;
    if (!user || user.disabled) {
      revokeSession(session.token);
      clearSessionCookie(req, res);
      res.json({
        ok: true,
        role: 'guest',
        adminEmail: null,
        user: null,
        impersonating: false,
        driverProfile: null,
        isDeveloper: false,
        isPrimaryDeveloper: false,
      });
      return;
    }

    res.json({
      ok: true,
      role: 'customer',
      adminEmail: null,
      token: session.token,
      user: sanitizeCustomerForClient(user),
      impersonating: false,
      driverProfile: findDriverByEmail(user.email),
      isDeveloper,
      isPrimaryDeveloper,
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractSessionToken(req);
    if (token) revokeSession(token);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.put('/api/account/cart', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const targetEmail =
      session.role === 'admin' ? session.impersonatingEmail : session.email;
    if (!targetEmail) {
      res.json({ ok: true, user: null });
      return;
    }

    const cart = (req.body as { cart?: unknown })?.cart;
    if (!Array.isArray(cart)) {
      res.status(400).json({ error: 'صيغة السلة غير صالحة.' });
      return;
    }

    const updated = updateCustomerCart(targetEmail, cart as CartEntry[]);
    res.json({ ok: true, user: updated ? sanitizeCustomerForClient(updated) : null });
  });

  app.put('/api/account/favorites', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const targetEmail =
      session.role === 'admin' ? session.impersonatingEmail : session.email;
    if (!targetEmail) {
      res.json({ ok: true, user: null });
      return;
    }

    const favorites = (req.body as { favorites?: unknown })?.favorites;
    if (!Array.isArray(favorites)) {
      res.status(400).json({ error: 'صيغة المفضلة غير صالحة.' });
      return;
    }

    const updated = updateCustomerFavorites(targetEmail, favorites.map(String));
    res.json({ ok: true, user: updated ? sanitizeCustomerForClient(updated) : null });
  });

  app.put('/api/account/profile', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const targetEmail =
      session.role === 'admin' ? session.impersonatingEmail : session.email;
    if (!targetEmail) {
      res.status(400).json({ error: 'لا يوجد حساب عميل محدد.' });
      return;
    }

    const body = (req.body || {}) as {
      name?: string;
      username?: string;
      avatar?: string;
      bio?: string;
      phone?: string;
      area?: string;
      address?: string;
    };
    const result = updateCustomerProfile(targetEmail, body);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json({ ok: true, user: sanitizeCustomerForClient(result.user) });
  });

  app.get('/api/users/check-username', (req: Request, res: Response) => {
    const raw = typeof req.query.username === 'string' ? req.query.username : '';
    const normalized = normalizeUsername(raw);
    if (!normalized) {
      res.json({ ok: true, available: false, normalized: null });
      return;
    }
    const session = getSession(extractSessionToken(req));
    const excludeEmail = session?.impersonatingEmail || session?.email || undefined;
    res.json({
      ok: true,
      available: !isUsernameTaken(normalized, excludeEmail),
      normalized,
    });
  });

  app.get('/api/users/search', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const myEmail = session.role === 'admin' ? session.impersonatingEmail || session.email : session.email;
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const users = searchUsersPublic(q, myEmail);
    const exactMatch = users.find((u) => u.exactMatch) || null;
    res.json({ ok: true, users, exactMatch });
  });

  // =========================================================================
  // التحقق من الكوبون وإتمام الطلب وتتبع الحالة المباشر
  // =========================================================================

  app.post('/api/coupon/validate', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      code?: unknown;
      subtotal?: unknown;
      orderType?: unknown;
    };
    const code = String(body.code || '').trim();
    const subtotal = Math.max(0, Number(body.subtotal || 0));
    const orderType = body.orderType === 'pickup' ? 'pickup' : 'delivery';

    const config = getStore().siteConfig;
    const threshold = config.restaurant.freeDeliveryThreshold;
    const isFreeDelivery =
      orderType === 'pickup' || (threshold !== null && subtotal >= threshold);
    const deliveryFee = isFreeDelivery ? 0 : config.restaurant.deliveryFee;

    const result = validateCouponForOrder(code, subtotal, deliveryFee);
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }

    res.json({
      ok: true,
      coupon: {
        id: result.coupon.id,
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        value: result.coupon.value,
      },
      discountAmount: result.discountAmount,
      waivesDelivery: result.waivesDelivery,
    });
  });

  app.get('/api/orders/:orderId', (req: Request, res: Response) => {
    const orderId = String(req.params.orderId || '').trim();
    const order = getStore().orders.find((o) => o.orderId === orderId);
    if (!order) {
      res.status(404).json({ error: 'الطلب غير موجود.' });
      return;
    }
    res.json({
      ok: true,
      order: {
        orderId: order.orderId,
        timestamp: order.timestamp,
        status: order.status,
        orderTypeLabel: order.orderTypeLabel,
        total: order.total,
        currency: order.currency,
        driverName: order.driverName,
        driverPhone: order.driverPhone,
        items: order.items,
      },
    });
  });

  app.get('/api/payments/config', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      stripeConfigured: Boolean(getStripeClient()),
    });
  });

  app.post('/api/payments/stripe/create-session', async (req: Request, res: Response) => {
    const stripe = getStripeClient();
    if (!stripe) {
      res.json({ ok: true, mode: 'direct_gateway' });
      return;
    }

    const clientIp = getClientIp(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 64) : 'anon';
    const { allowed, retryAfterSec } = checkRateLimit(`stripe:${clientIp}:${deviceId}`, 6, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `يرجى الانتظار ${retryAfterSec} ثانية قبل إنشاء جلسة دفع جديدة.`,
      });
      return;
    }

    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      res.status(400).json({ error: 'تعذر التحقق من الطلب.' });
      return;
    }

    const store = getStore();
    const config = store.siteConfig;
    if (!config.restaurant.acceptingOrders) {
      res.status(403).json({
        error:
          config.restaurant.pausedMessage ||
          'نعتذر، استقبال الطلبات متوقف مؤقتاً بسبب الضغط الحالي.',
      });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = normalizeDigits(body.phone);
    const orderType = body.orderType === 'pickup' ? 'pickup' : 'delivery';
    const area = typeof body.area === 'string' ? body.area.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const mapUrlRaw = typeof body.mapUrl === 'string' ? body.mapUrl.trim() : '';
    const mapUrl = isSafeExternalUrl(mapUrlRaw) ? mapUrlRaw : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 400) : '';
    const couponCodeRaw = typeof body.couponCode === 'string' ? body.couponCode.trim() : '';
    const useLoyaltyPoints = Boolean(body.useLoyaltyPoints);
    const receiptEmailRaw = normalizeEmail(body.receiptEmail);
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (name.length < 2 || !/^07\d{8}$/.test(phone) || rawItems.length === 0) {
      res.status(400).json({ error: 'يرجى استكمال بيانات الطلب الأساسية قبل الدفع.' });
      return;
    }
    if (orderType === 'delivery' && (area.length < 2 || address.length < 4)) {
      res.status(400).json({ error: 'يرجى إدخال المنطقة والعنوان التفصيلي للتوصيل.' });
      return;
    }

    const allProducts = [...config.offers, ...config.items];
    const productsMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsMap = new Map(config.variants.map((v) => [v.id, v]));
    const addonsMap = new Map(config.addons.map((a) => [a.id, a]));

    const computedItems: SubmittedOrderReceipt['items'] = [];
    let subtotal = 0;

    for (const raw of rawItems.slice(0, 50)) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as {
        itemId?: unknown;
        variantId?: unknown;
        quantity?: unknown;
        addonIds?: unknown;
        notes?: unknown;
      };
      const product = productsMap.get(String(entry.itemId || ''));
      if (!product) {
        res.status(400).json({ error: 'أحد الأصناف المختارة غير متوفر حالياً.' });
        return;
      }
      const quantity = Math.max(1, Math.min(50, Math.round(Number(entry.quantity || 1))));
      const variant = entry.variantId ? variantsMap.get(String(entry.variantId)) : undefined;
      const variantDelta = variant ? variant.priceDelta : 0;
      const addonIds = Array.isArray(entry.addonIds) ? entry.addonIds.map(String) : [];
      const chosenAddons: Addon[] = [];
      let addonsCost = 0;
      for (const aid of new Set(addonIds)) {
        const addon = addonsMap.get(aid);
        if (addon) {
          chosenAddons.push(addon);
          addonsCost += addon.price;
        }
      }
      const unitPrice = Number((product.price + variantDelta + addonsCost).toFixed(2));
      const lineTotal = Number((unitPrice * quantity).toFixed(2));
      subtotal += lineTotal;
      computedItems.push({
        itemId: product.id,
        name: product.name,
        variantName: variant?.name,
        quantity,
        unitPrice,
        lineTotal,
        notes: typeof entry.notes === 'string' ? entry.notes.trim().slice(0, 200) : '',
        addons: chosenAddons,
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const threshold = config.restaurant.freeDeliveryThreshold;
    const isFreeDelivery =
      orderType === 'pickup' || (threshold !== null && subtotal >= threshold);
    let deliveryFee = isFreeDelivery ? 0 : config.restaurant.deliveryFee;

    let discountAmount = 0;
    let appliedCoupon: Coupon | null = null;
    if (couponCodeRaw) {
      const couponCheck = validateCouponForOrder(couponCodeRaw, subtotal, deliveryFee);
      if (!couponCheck.ok) {
        res.status(400).json({ error: couponCheck.error });
        return;
      }
      appliedCoupon = couponCheck.coupon;
      if (couponCheck.waivesDelivery) deliveryFee = 0;
      discountAmount = couponCheck.discountAmount;
    }

    const session = getSession(extractSessionToken(req));
    let customerEmail: string | undefined;
    if (session) {
      if (session.role === 'customer') customerEmail = session.email;
      else if (session.role === 'admin' && session.impersonatingEmail) {
        customerEmail = session.impersonatingEmail;
      }
    }

    const afterCoupon = Math.max(
      0,
      subtotal + deliveryFee - (appliedCoupon?.discountType === 'free_delivery' ? 0 : discountAmount)
    );
    let loyaltyPointsUsed = 0;
    let loyaltyDiscount = 0;
    const redeemValue = Math.max(0, config.restaurant.loyaltyRedeemValue || 0.02);

    if (useLoyaltyPoints && customerEmail && redeemValue > 0 && afterCoupon > 0) {
      const customerAccount = store.users[customerEmail];
      if (customerAccount && customerAccount.loyaltyPoints > 0) {
        const maxRedeemablePoints = Math.floor(afterCoupon / redeemValue);
        loyaltyPointsUsed = Math.min(customerAccount.loyaltyPoints, maxRedeemablePoints);
        loyaltyDiscount = Number((loyaltyPointsUsed * redeemValue).toFixed(2));
      }
    }

    const finalTotal = Number(Math.max(0.5, afterCoupon - loyaltyDiscount).toFixed(2));
    const loyaltyPointsEarned = customerEmail
      ? Math.max(0, Math.round(finalTotal * (config.restaurant.loyaltyPointsPerUnit || 10)))
      : 0;

    const notifyEmail =
      (isValidEmail(receiptEmailRaw) ? receiptEmailRaw : '') || customerEmail || undefined;

    const orderId = `ZDX-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const receipt: SubmittedOrderReceipt = {
      orderId,
      timestamp: new Date().toISOString(),
      status: 'received',
      orderTypeLabel: orderType === 'pickup' ? 'استلام من المطعم' : 'توصيل للعنوان',
      paymentMethod: 'Stripe دفع إلكتروني',
      paymentStatus: 'paid',
      paymentProvider: 'Stripe Checkout',
      subtotal,
      deliveryFee,
      discountAmount,
      loyaltyPointsUsed,
      loyaltyDiscount,
      loyaltyPointsEarned,
      couponCode: appliedCoupon?.code,
      total: finalTotal,
      currency: config.restaurant.currency,
      customerEmail,
      receiptEmail: notifyEmail,
      name,
      phone,
      area: orderType === 'delivery' ? area : 'الاستلام من المطعم',
      address: orderType === 'delivery' ? address : config.restaurant.address,
      items: computedItems,
    };

    try {
      const origin = getPublicOrigin(req);
      if (!origin) {
        res.status(400).json({ error: 'تعذر تحديد رابط الموقع العام لإتمام الدفع.' });
        return;
      }

      const stripeSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: notifyEmail,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${config.restaurant.name} — طلب #${orderId}`,
                description: computedItems.map((i) => `${i.name} × ${i.quantity}`).join('، ').slice(0, 200),
              },
              unit_amount: Math.round(finalTotal * 100),
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/?stripe_session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?stripe_cancelled=1`,
        metadata: {
          orderId,
        },
      });

      const pendingRecord: PendingStripeOrder = {
        receipt,
        mapUrl,
        notes,
        couponId: appliedCoupon?.id,
        customerEmail,
        notifyEmail,
        createdAt: Date.now(),
      };
      pendingStripeOrders.set(stripeSession.id, pendingRecord);
      const currentStore = getStore();
      currentStore.pendingStripeOrders = {
        ...(currentStore.pendingStripeOrders || {}),
        [stripeSession.id]: pendingRecord,
      };
      saveStore();

      res.json({
        ok: true,
        mode: 'stripe_checkout',
        url: stripeSession.url,
        sessionId: stripeSession.id,
      });
    } catch (err) {
      console.error('Stripe checkout session error:', err);
      res.status(502).json({ error: 'تعذر إنشاء جلسة الدفع عبر Stripe، يمكنك المحاولة مجدداً.' });
    }
  });

  app.post('/api/payments/stripe/complete-session', async (req: Request, res: Response) => {
    const stripe = getStripeClient();
    const sessionId = String((req.body as { sessionId?: unknown })?.sessionId || '').trim();
    if (!stripe || !sessionId) {
      res.status(400).json({ error: 'جلسة الدفع غير صالحة.' });
      return;
    }

    const storeSnapshot = getStore();
    if (
      processedStripeSessions.has(sessionId) ||
      Boolean(storeSnapshot.processedStripeSessions?.[sessionId])
    ) {
      res.status(409).json({ error: 'تم تأكيد هذا الدفع مسبقاً.' });
      return;
    }

    const pending =
      pendingStripeOrders.get(sessionId) || storeSnapshot.pendingStripeOrders?.[sessionId];
    if (!pending) {
      res.status(404).json({ error: 'لم يتم العثور على بيانات الطلب المرتبط بجلسة الدفع.' });
      return;
    }

    try {
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      if (stripeSession.payment_status !== 'paid') {
        res.status(400).json({ error: 'لم تكتمل عملية الدفع في Stripe بعد.' });
        return;
      }

      processedStripeSessions.add(sessionId);
      pendingStripeOrders.delete(sessionId);
      if (storeSnapshot.pendingStripeOrders) {
        delete storeSnapshot.pendingStripeOrders[sessionId];
      }
      storeSnapshot.processedStripeSessions = {
        ...(storeSnapshot.processedStripeSessions || {}),
        [sessionId]: Date.now() + 1000 * 60 * 60 * 24 * 7,
      };
      saveStore();

      const receipt: SubmittedOrderReceipt = {
        ...pending.receipt,
        paymentStatus: 'paid',
        paymentProvider: 'Stripe Checkout',
        paymentTransactionId: String(stripeSession.payment_intent || stripeSession.id),
        paidAt: new Date().toISOString(),
      };

      const brand = getStore().siteConfig.restaurant.name;
      await sendOrderNotificationEmail(receipt, brand, {
        mapUrl: pending.mapUrl,
        notes: pending.notes,
      });
      if (pending.notifyEmail) {
        sendPaymentConfirmationEmail(pending.notifyEmail, receipt, brand).catch((err) =>
          console.error('Customer Stripe receipt email error:', err)
        );
      }

      if (pending.couponId) {
        incrementCouponUsage(pending.couponId);
      }
      recordOrderInStore(receipt, pending.customerEmail);
      broadcastToAdmins({ type: 'order:created', order: receipt });

      const rawUpdated = pending.customerEmail ? getStore().users[pending.customerEmail] || null : null;
      const updatedUser = rawUpdated ? sanitizeCustomerForClient(rawUpdated) : null;
      res.json({ ok: true, order: receipt, user: updatedUser });
    } catch (err) {
      console.error('Stripe session verification error:', err);
      res.status(502).json({ error: 'تعذر التحقق من حالة الدفع في Stripe.' });
    }
  });

  app.post('/api/order', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 64) : 'anon';

    const { allowed, retryAfterSec } = checkRateLimit(`order:${clientIp}:${deviceId}`, 5, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `تم إرسال عدة طلبات متتالية، يرجى الانتظار ${retryAfterSec} ثانية ثم المحاولة.`,
      });
      return;
    }

    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      res.status(400).json({ error: 'تعذر التحقق من الطلب.' });
      return;
    }

    const store = getStore();
    const config = store.siteConfig;
    if (!config.restaurant.acceptingOrders) {
      res.status(403).json({
        error:
          config.restaurant.pausedMessage ||
          'نعتذر، استقبال الطلبات متوقف مؤقتاً بسبب الضغط الحالي وسنعود بعد قليل.',
      });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = normalizeDigits(body.phone);
    const orderType = body.orderType === 'pickup' ? 'pickup' : 'delivery';
    const paymentMethodRaw = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'cash';
    const area = typeof body.area === 'string' ? body.area.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const mapUrlRaw = typeof body.mapUrl === 'string' ? body.mapUrl.trim() : '';
    const mapUrl = isSafeExternalUrl(mapUrlRaw) ? mapUrlRaw : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 400) : '';
    const couponCodeRaw = typeof body.couponCode === 'string' ? body.couponCode.trim() : '';
    const useLoyaltyPoints = Boolean(body.useLoyaltyPoints);
    const receiptEmailRaw = normalizeEmail(body.receiptEmail);
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (name.length < 2) {
      res.status(400).json({ error: 'يرجى إدخال الاسم الكامل.' });
      return;
    }
    if (!/^07\d{8}$/.test(phone)) {
      res.status(400).json({ error: 'يرجى إدخال رقم هاتف أردني صحيح يبدأ بـ 07.' });
      return;
    }
    if (orderType === 'delivery' && (area.length < 2 || address.length < 4)) {
      res.status(400).json({ error: 'يرجى إدخال المنطقة والعنوان التفصيلي للتوصيل.' });
      return;
    }
    if (rawItems.length === 0) {
      res.status(400).json({ error: 'سلة الطلبات فارغة.' });
      return;
    }

    const allProducts = [...config.offers, ...config.items];
    const productsMap = new Map(allProducts.map((p) => [p.id, p]));
    const variantsMap = new Map(config.variants.map((v) => [v.id, v]));
    const addonsMap = new Map(config.addons.map((a) => [a.id, a]));

    const computedItems: SubmittedOrderReceipt['items'] = [];
    let subtotal = 0;

    for (const raw of rawItems.slice(0, 50)) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as {
        itemId?: unknown;
        variantId?: unknown;
        quantity?: unknown;
        addonIds?: unknown;
        notes?: unknown;
      };
      const product = productsMap.get(String(entry.itemId || ''));
      if (!product) {
        res.status(400).json({ error: 'أحد الأصناف المختارة غير متوفر حالياً.' });
        return;
      }

      const quantity = Math.max(1, Math.min(50, Math.round(Number(entry.quantity || 1))));
      const variant = entry.variantId ? variantsMap.get(String(entry.variantId)) : undefined;
      const variantDelta = variant ? variant.priceDelta : 0;

      const addonIds = Array.isArray(entry.addonIds) ? entry.addonIds.map(String) : [];
      const chosenAddons: Addon[] = [];
      let addonsCost = 0;
      for (const aid of new Set(addonIds)) {
        const addon = addonsMap.get(aid);
        if (addon) {
          chosenAddons.push(addon);
          addonsCost += addon.price;
        }
      }

      const unitPrice = Number((product.price + variantDelta + addonsCost).toFixed(2));
      const lineTotal = Number((unitPrice * quantity).toFixed(2));
      subtotal += lineTotal;

      computedItems.push({
        itemId: product.id,
        name: product.name,
        variantName: variant?.name,
        quantity,
        unitPrice,
        lineTotal,
        notes: typeof entry.notes === 'string' ? entry.notes.trim().slice(0, 200) : '',
        addons: chosenAddons,
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const threshold = config.restaurant.freeDeliveryThreshold;
    const isFreeDelivery =
      orderType === 'pickup' || (threshold !== null && subtotal >= threshold);
    let deliveryFee = isFreeDelivery ? 0 : config.restaurant.deliveryFee;

    let discountAmount = 0;
    let appliedCoupon: Coupon | null = null;
    if (couponCodeRaw) {
      const couponCheck = validateCouponForOrder(couponCodeRaw, subtotal, deliveryFee);
      if (!couponCheck.ok) {
        res.status(400).json({ error: couponCheck.error });
        return;
      }
      appliedCoupon = couponCheck.coupon;
      if (couponCheck.waivesDelivery) {
        deliveryFee = 0;
      }
      discountAmount = couponCheck.discountAmount;
    }

    const isElectronicPayment = paymentMethodRaw === 'stripe' || paymentMethodRaw === 'card_online';
    let paymentMethodLabel = 'كاش عند الاستلام';
    let paymentStatus: 'paid' | 'pending_cod' = 'pending_cod';
    let paymentProvider: string | undefined;
    let paymentTransactionId: string | undefined;
    let paidAt: string | undefined;

    if (paymentMethodRaw === 'pos_card') {
      paymentMethodLabel = 'بطاقة عند المندوب';
    } else if (isElectronicPayment) {
      const cardDigits = normalizeDigits(body.cardNumber || '');
      const cardExpiry = typeof body.cardExpiry === 'string' ? body.cardExpiry.trim() : '';
      if (cardDigits && !isValidLuhn(cardDigits)) {
        res.status(400).json({ error: 'رقم البطاقة المدخل غير صالح، يرجى التحقق والمحاولة مجدداً.' });
        return;
      }
      if (cardExpiry) {
        const matchExp = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(cardExpiry);
        if (!matchExp) {
          res.status(400).json({ error: 'صيغة تاريخ انتهاء البطاقة غير صحيحة.' });
          return;
        }
        const expMonth = Number(matchExp[1]);
        const expYear = 2000 + Number(matchExp[2]);
        const now = new Date();
        if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
          res.status(400).json({ error: 'تاريخ صلاحية البطاقة منتهي.' });
          return;
        }
      }
      const cardBrand = typeof body.cardBrand === 'string' ? body.cardBrand.slice(0, 24) : 'Visa';
      const cardLast4 =
        cardDigits.length >= 4
          ? cardDigits.slice(-4)
          : typeof body.cardLast4 === 'string'
            ? body.cardLast4.replace(/\D/g, '').slice(-4)
            : '';
      paymentMethodLabel = cardLast4
        ? `دفع إلكتروني Stripe (${cardBrand} •••• ${cardLast4})`
        : 'دفع إلكتروني عبر Stripe';
      paymentStatus = 'paid';
      paymentProvider = 'Stripe Electronic Pay';
      paymentTransactionId = `STR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      paidAt = new Date().toISOString();
    }

    const session = getSession(extractSessionToken(req));
    let customerEmail: string | undefined;
    if (session) {
      if (session.role === 'customer') customerEmail = session.email;
      else if (session.role === 'admin' && session.impersonatingEmail) {
        customerEmail = session.impersonatingEmail;
      }
    }

    const notifyCustomerEmail =
      (isValidEmail(receiptEmailRaw) ? receiptEmailRaw : '') || customerEmail || undefined;

    const afterCoupon = Math.max(0, subtotal + deliveryFee - (appliedCoupon?.discountType === 'free_delivery' ? 0 : discountAmount));
    let loyaltyPointsUsed = 0;
    let loyaltyDiscount = 0;
    const redeemValue = Math.max(0, config.restaurant.loyaltyRedeemValue || 0.02);

    if (useLoyaltyPoints && customerEmail && redeemValue > 0 && afterCoupon > 0) {
      const customerAccount = store.users[customerEmail];
      if (customerAccount && customerAccount.loyaltyPoints > 0) {
        const maxRedeemablePoints = Math.floor(afterCoupon / redeemValue);
        loyaltyPointsUsed = Math.min(customerAccount.loyaltyPoints, maxRedeemablePoints);
        loyaltyDiscount = Number((loyaltyPointsUsed * redeemValue).toFixed(2));
      }
    }

    const finalTotal = Number(Math.max(0, afterCoupon - loyaltyDiscount).toFixed(2));
    const loyaltyPointsEarned = customerEmail
      ? Math.max(0, Math.round(finalTotal * (config.restaurant.loyaltyPointsPerUnit || 10)))
      : 0;

    const orderId = `ZDX-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    const receipt: SubmittedOrderReceipt = {
      orderId,
      timestamp: new Date().toISOString(),
      status: 'received',
      orderTypeLabel: orderType === 'pickup' ? 'استلام من المطعم' : 'توصيل للعنوان',
      paymentMethod: paymentMethodLabel,
      paymentStatus,
      paymentProvider,
      paymentTransactionId,
      paidAt,
      receiptEmail: notifyCustomerEmail,
      subtotal,
      deliveryFee,
      discountAmount,
      loyaltyPointsUsed,
      loyaltyDiscount,
      loyaltyPointsEarned,
      couponCode: appliedCoupon?.code,
      total: finalTotal,
      currency: config.restaurant.currency,
      customerEmail,
      name,
      phone,
      area: orderType === 'delivery' ? area : 'الاستلام من المطعم',
      address: orderType === 'delivery' ? address : config.restaurant.address,
      items: computedItems,
    };

    try {
      await sendOrderNotificationEmail(receipt, config.restaurant.name, { mapUrl, notes });
      if (notifyCustomerEmail && (isElectronicPayment || customerEmail)) {
        sendPaymentConfirmationEmail(notifyCustomerEmail, receipt, config.restaurant.name).catch(
          (err) => console.error('Customer order confirmation email error:', err)
        );
      }
    } catch (err) {
      console.error('Order email error:', err);
      res.status(502).json({
        error: 'تعذر إرسال الطلب إلى بريد المطعم، يرجى التحقق من إعدادات SMTP في لوحة الإدارة.',
      });
      return;
    }

    if (appliedCoupon) {
      incrementCouponUsage(appliedCoupon.id);
    }
    recordOrderInStore(receipt, customerEmail);
    broadcastToAdmins({ type: 'order:created', order: receipt });

    const rawUpdated = customerEmail ? getStore().users[customerEmail] || null : null;
    const updatedUser = rawUpdated ? sanitizeCustomerForClient(rawUpdated) : null;
    res.json({ ok: true, order: receipt, user: updatedUser });
  });

  // =========================================================================
  // مصادقة الإدارة الحصرية
  // =========================================================================

  app.post('/api/admin/login', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const { allowed, retryAfterSec } = checkRateLimit(`admin-login:${clientIp}`, 6, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `محاولات متعددة، يرجى الانتظار ${retryAfterSec} ثانية قبل إعادة المحاولة.`,
      });
      return;
    }

    const password = String((req.body as { password?: unknown })?.password || '');
    if (!password || !verifyAdminPassword(password)) {
      res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
      return;
    }

    const securityEmail = getAdminSecurityEmail();
    if (!securityEmail) {
      res.status(500).json({ error: 'بريد الأمان للإدارة غير مهيأ على الخادم.' });
      return;
    }

    try {
      const store = getStore();
      const { challengeKey, code } = createOtpChallenge('admin_login', securityEmail);
      await sendAdminSecurityEmail('login_code', store.siteConfig.restaurant.name, {
        code,
        ip: clientIp,
        time: new Date().toLocaleString('ar-JO'),
      });
      res.json({
        ok: true,
        requiresOtp: true,
        challengeKey,
        maskedEmail: maskEmail(securityEmail),
        message: 'تم إرسال رمز تأكيد الدخول إلى بريد الإدارة المعتمد.',
      });
    } catch (err) {
      console.error('Admin login OTP error:', err);
      res.status(502).json({ error: 'تعذر إرسال رمز تأكيد الدخول إلى بريد الإدارة.' });
    }
  });

  app.post('/api/admin/verify-login', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const body = (req.body || {}) as { challengeKey?: unknown; code?: unknown };
    const challengeKey = String(body.challengeKey || '').trim();
    const code = normalizeDigits(body.code);
    const securityEmail = getAdminSecurityEmail();

    if (!challengeKey || !/^\d{6}$/.test(code) || !securityEmail) {
      res.status(400).json({ error: 'يرجى إدخال رمز التأكيد المكون من ستة أرقام.' });
      return;
    }

    const check = verifyOtpChallenge(challengeKey, 'admin_login', securityEmail, code);
    if (!check.ok) {
      res.status(401).json({ error: check.error });
      return;
    }

    const session = createSession('admin', securityEmail);
    setSessionCookie(req, res, session.token);

    sendAdminSecurityEmail('login_alert', getStore().siteConfig.restaurant.name, {
      ip: clientIp,
      time: new Date().toLocaleString('ar-JO'),
    }).catch((err) => console.error('Admin login alert failed:', err));

    res.json({
      ok: true,
      token: session.token,
      role: 'admin',
      adminEmail: session.email,
      isDeveloper: isAuthorizedDeveloperEmail(session.email),
      isPrimaryDeveloper: session.email.toLowerCase() === getPrimaryDeveloperEmail(),
    });
  });

  app.post('/api/admin/email-login', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const { allowed, retryAfterSec } = checkRateLimit(`admin-email-login:${clientIp}`, 6, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `محاولات متعددة، يرجى الانتظار ${retryAfterSec} ثانية قبل إعادة المحاولة.`,
      });
      return;
    }

    const email = normalizeEmail((req.body as { email?: unknown })?.email);
    if (!isValidEmail(email) || !isAuthorizedAdminEmail(email)) {
      res.status(403).json({ error: 'هذا البريد غير مدرج ضمن قائمة المشرفين المعتمدين.' });
      return;
    }

    try {
      const store = getStore();
      const { challengeKey, code } = createOtpChallenge('admin_email_login', email);
      await sendInvitedAdminOtpEmail(email, code, store.siteConfig.restaurant.name);
      res.json({
        ok: true,
        challengeKey,
        maskedEmail: maskEmail(email),
        message: 'تم إرسال رمز دخول المشرف إلى بريدك الإلكتروني.',
      });
    } catch (err) {
      console.error('Invited admin OTP error:', err);
      res.status(502).json({ error: 'تعذر إرسال رمز الدخول إلى بريد المشرف.' });
    }
  });

  app.post('/api/admin/verify-email-login', (req: Request, res: Response) => {
    const body = (req.body || {}) as { challengeKey?: unknown; email?: unknown; code?: unknown };
    const challengeKey = String(body.challengeKey || '').trim();
    const email = normalizeEmail(body.email);
    const code = normalizeDigits(body.code);

    if (!challengeKey || !isValidEmail(email) || !/^\d{6}$/.test(code) || !isAuthorizedAdminEmail(email)) {
      res.status(400).json({ error: 'يرجى التحقق من البريد والرمز المكون من ستة أرقام.' });
      return;
    }

    const check = verifyOtpChallenge(challengeKey, 'admin_email_login', email, code);
    if (!check.ok) {
      res.status(401).json({ error: check.error });
      return;
    }

    const session = createSession('admin', email);
    setSessionCookie(req, res, session.token);

    res.json({
      ok: true,
      token: session.token,
      role: 'admin',
      adminEmail: session.email,
      isDeveloper: isAuthorizedDeveloperEmail(session.email),
      isPrimaryDeveloper: session.email.toLowerCase() === getPrimaryDeveloperEmail(),
    });
  });

  app.post('/api/admin/password/request-code', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const { allowed, retryAfterSec } = checkRateLimit(`admin-reset:${clientIp}`, 4, 60_000);
    if (!allowed) {
      res.status(429).json({
        error: `يرجى الانتظار ${retryAfterSec} ثانية قبل طلب رمز جديد.`,
      });
      return;
    }

    const securityEmail = getAdminSecurityEmail();
    if (!securityEmail) {
      res.status(500).json({ error: 'بريد الأمان للإدارة غير مضبوط.' });
      return;
    }

    try {
      const { challengeKey, code } = createOtpChallenge('admin_password_reset', securityEmail);
      await sendAdminSecurityEmail('password_reset_code', getStore().siteConfig.restaurant.name, {
        code,
        ip: clientIp,
        time: new Date().toLocaleString('ar-JO'),
      });
      res.json({
        ok: true,
        challengeKey,
        maskedEmail: maskEmail(securityEmail),
        message: 'تم إرسال رمز تغيير كلمة المرور حصرياً إلى البريد المعتمد.',
      });
    } catch (err) {
      console.error('Admin password reset OTP error:', err);
      res.status(502).json({ error: 'تعذر إرسال رمز تغيير كلمة المرور.' });
    }
  });

  app.post('/api/admin/password/confirm', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    const body = (req.body || {}) as {
      challengeKey?: unknown;
      code?: unknown;
      newPassword?: unknown;
    };
    const challengeKey = String(body.challengeKey || '').trim();
    const code = normalizeDigits(body.code);
    const newPassword = String(body.newPassword || '');
    const securityEmail = getAdminSecurityEmail();

    if (!challengeKey || !/^\d{6}$/.test(code) || !securityEmail) {
      res.status(400).json({ error: 'يرجى إدخال رمز التحقق الصحيح.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون ثمانية أحرف على الأقل.' });
      return;
    }

    const check = verifyOtpChallenge(challengeKey, 'admin_password_reset', securityEmail, code);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }

    updateAdminPassword(newPassword);
    sendAdminSecurityEmail('password_changed', getStore().siteConfig.restaurant.name, {
      ip: clientIp,
      time: new Date().toLocaleString('ar-JO'),
    }).catch((err) => console.error('Admin password changed email failed:', err));

    res.json({ ok: true, message: 'تم تغيير كلمة مرور الإدارة وحفظها بنجاح.' });
  });

  // =========================================================================
  // لوحة الإدارة الشاملة
  // =========================================================================

  app.put('/api/admin/site', requireAdmin, (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const result = validateAndSanitizeSiteConfig(req.body, store.siteConfig);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    store.siteConfig = result.config;
    saveStore();
    broadcastAll({ type: 'config:updated', siteConfig: store.siteConfig });

    res.json({ ok: true, siteConfig: store.siteConfig });
  });

  app.post('/api/admin/site/reset', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const resetConfig = resetSiteConfigToSeed();
    broadcastAll({ type: 'config:updated', siteConfig: resetConfig });
    res.json({ ok: true, siteConfig: resetConfig });
  });

  app.get('/api/admin/admins', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const store = getStore();
    res.json({
      ok: true,
      primaryAdminEmail: getAdminSecurityEmail(),
      adminEmails: store.adminEmails,
    });
  });

  app.post('/api/admin/admins', requireAdmin, (req: AuthedRequest, res: Response) => {
    const email = normalizeEmail((req.body as { email?: unknown })?.email);
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح للمشرف.' });
      return;
    }
    const primary = getAdminSecurityEmail();
    const store = getStore();
    if (email !== primary && !store.adminEmails.includes(email)) {
      store.adminEmails.push(email);
      saveStore();
    }
    res.json({ ok: true, adminEmails: store.adminEmails, primaryAdminEmail: primary });
  });

  app.delete('/api/admin/admins/:email', requireAdmin, (req: AuthedRequest, res: Response) => {
    const email = normalizeEmail(decodeURIComponent(req.params.email || ''));
    const primary = getAdminSecurityEmail();
    if (email === primary) {
      res.status(400).json({ error: 'لا يمكن إزالة المشرف الرئيسي للنظام.' });
      return;
    }
    const store = getStore();
    store.adminEmails = store.adminEmails.filter((e) => e !== email);
    saveStore();
    revokeAllSessionsForEmail(email);
    res.json({ ok: true, adminEmails: store.adminEmails, primaryAdminEmail: primary });
  });

  app.get('/api/admin/users', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const store = getStore();
    const list = Object.values(store.users)
      .sort((a, b) => new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime())
      .map((u) => sanitizeCustomerForClient(u));
    res.json({ ok: true, users: list });
  });

  app.patch('/api/admin/users/:email/status', requireAdmin, (req: AuthedRequest, res: Response) => {
    const email = normalizeEmail(decodeURIComponent(req.params.email || ''));
    const disabled = Boolean((req.body as { disabled?: unknown })?.disabled);
    const store = getStore();
    const user = store.users[email];
    if (!user) {
      res.status(404).json({ error: 'الحساب غير موجود.' });
      return;
    }

    user.disabled = disabled;
    saveStore();

    if (disabled) {
      revokeAllSessionsForEmail(email);
      kickDisabledUserSockets(email);
    }

    res.json({ ok: true, user: sanitizeCustomerForClient(user) });
  });

  app.post('/api/admin/impersonate', requireAdmin, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const rawEmail = (req.body as { email?: unknown })?.email;
    if (!rawEmail) {
      const updated = setSessionImpersonation(session.token, null);
      const nextToken = updated?.token || session.token;
      setSessionCookie(req, res, nextToken);
      res.json({ ok: true, impersonating: false, user: null, token: nextToken });
      return;
    }

    const email = normalizeEmail(rawEmail);
    const user = getStore().users[email];
    if (!user) {
      res.status(404).json({ error: 'حساب العميل غير موجود.' });
      return;
    }

    const updated = setSessionImpersonation(session.token, user.email);
    const nextToken = updated?.token || session.token;
    setSessionCookie(req, res, nextToken);
    res.json({
      ok: true,
      impersonating: true,
      user: sanitizeCustomerForClient(user),
      token: nextToken,
    });
  });

  app.get('/api/admin/orders', requireAdmin, (_req: AuthedRequest, res: Response) => {
    res.json({ ok: true, orders: getStore().orders });
  });

  app.post('/api/admin/orders/:orderId/status', requireAdmin, (req: AuthedRequest, res: Response) => {
    const orderId = String(req.params.orderId || '').trim();
    const body = (req.body || {}) as { status?: unknown; driverId?: unknown };
    const status = String(body.status || '') as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['received', 'preparing', 'on_the_way', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ error: 'حالة الطلب غير صالحة.' });
      return;
    }
    const driverIdArg =
      body.driverId === undefined ? undefined : body.driverId ? String(body.driverId) : null;
    const updated = updateOrderStatusAndDriver(orderId, status, driverIdArg);
    if (!updated) {
      res.status(404).json({ error: 'الطلب غير موجود.' });
      return;
    }
    broadcastOrderUpdate(updated);
    res.json({ ok: true, order: updated });
  });

  app.get('/api/admin/drivers', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const drivers = Object.values(getStore().drivers).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ ok: true, drivers });
  });

  app.post('/api/admin/drivers', requireAdmin, (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as {
      name?: unknown;
      phone?: unknown;
      email?: unknown;
      vehicle?: unknown;
    };
    const name = String(body.name || '').trim().slice(0, 80);
    const phone = normalizeDigits(body.phone);
    const email = normalizeEmail(body.email);
    const vehicle = String(body.vehicle || 'دراجة توصيل').trim().slice(0, 80);

    if (name.length < 2 || !phone) {
      res.status(400).json({ error: 'يرجى إدخال اسم السائق ورقم هاتفه.' });
      return;
    }
    if (email && !isValidEmail(email)) {
      res.status(400).json({ error: 'صيغة البريد الإلكتروني للسائق غير صحيحة.' });
      return;
    }

    const store = getStore();
    const driver: Driver = {
      id: `drv_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      name,
      phone,
      email,
      vehicle,
      active: true,
      createdAt: new Date().toISOString(),
    };
    store.drivers[driver.id] = driver;
    saveStore();
    res.json({ ok: true, driver });
  });

  app.patch('/api/admin/drivers/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id || '').trim();
    const store = getStore();
    const driver = store.drivers[id];
    if (!driver) {
      res.status(404).json({ error: 'السائق غير موجود.' });
      return;
    }
    const body = (req.body || {}) as {
      name?: unknown;
      phone?: unknown;
      email?: unknown;
      vehicle?: unknown;
      active?: unknown;
    };
    if (typeof body.name === 'string' && body.name.trim()) driver.name = body.name.trim().slice(0, 80);
    if (typeof body.phone === 'string' && body.phone.trim()) driver.phone = normalizeDigits(body.phone);
    if (typeof body.email === 'string') driver.email = normalizeEmail(body.email);
    if (typeof body.vehicle === 'string') driver.vehicle = body.vehicle.trim().slice(0, 80);
    if (typeof body.active === 'boolean') driver.active = body.active;
    saveStore();
    res.json({ ok: true, driver });
  });

  app.delete('/api/admin/drivers/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id || '').trim();
    const store = getStore();
    if (!store.drivers[id]) {
      res.status(404).json({ error: 'السائق غير موجود.' });
      return;
    }
    delete store.drivers[id];
    saveStore();
    res.json({ ok: true });
  });

  app.get('/api/admin/coupons', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const coupons = Object.values(getStore().coupons).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ ok: true, coupons });
  });

  app.post('/api/admin/coupons', requireAdmin, (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as {
      code?: unknown;
      discountType?: unknown;
      value?: unknown;
      maxUses?: unknown;
      minOrder?: unknown;
      expiresAt?: unknown;
    };
    const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 32);
    if (code.length < 2) {
      res.status(400).json({ error: 'يرجى كتابة كود كوبون صالح.' });
      return;
    }
    const store = getStore();
    if (Object.values(store.coupons).some((c) => c.code.toUpperCase() === code)) {
      res.status(400).json({ error: 'يوجد كوبون بنفس هذا الكود مسبقاً.' });
      return;
    }
    const discountType =
      body.discountType === 'fixed' || body.discountType === 'free_delivery'
        ? body.discountType
        : 'percent';
    const value = Math.max(0, Number(body.value || 0));
    const maxUses = Math.max(0, Math.round(Number(body.maxUses || 0)));
    const minOrder = Math.max(0, Number(body.minOrder || 0));
    const expiresAtRaw = typeof body.expiresAt === 'string' ? body.expiresAt.trim() : '';
    const expiresAt =
      expiresAtRaw && !Number.isNaN(new Date(expiresAtRaw).getTime())
        ? new Date(expiresAtRaw).toISOString()
        : '';

    const coupon: Coupon = {
      id: `cpn_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      code,
      discountType,
      value,
      maxUses,
      usedCount: 0,
      minOrder,
      expiresAt,
      active: true,
      createdAt: new Date().toISOString(),
    };
    store.coupons[coupon.id] = coupon;
    saveStore();
    res.json({ ok: true, coupon });
  });

  app.patch('/api/admin/coupons/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id || '').trim();
    const store = getStore();
    const coupon = store.coupons[id];
    if (!coupon) {
      res.status(404).json({ error: 'الكوبون غير موجود.' });
      return;
    }
    const body = (req.body || {}) as {
      active?: unknown;
      maxUses?: unknown;
      expiresAt?: unknown;
      value?: unknown;
      minOrder?: unknown;
    };
    if (typeof body.active === 'boolean') coupon.active = body.active;
    if (body.maxUses !== undefined) coupon.maxUses = Math.max(0, Math.round(Number(body.maxUses || 0)));
    if (body.value !== undefined) coupon.value = Math.max(0, Number(body.value || 0));
    if (body.minOrder !== undefined) coupon.minOrder = Math.max(0, Number(body.minOrder || 0));
    if (typeof body.expiresAt === 'string') {
      const trimmed = body.expiresAt.trim();
      coupon.expiresAt =
        trimmed && !Number.isNaN(new Date(trimmed).getTime()) ? new Date(trimmed).toISOString() : '';
    }
    saveStore();
    res.json({ ok: true, coupon });
  });

  app.delete('/api/admin/coupons/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id || '').trim();
    const store = getStore();
    if (!store.coupons[id]) {
      res.status(404).json({ error: 'الكوبون غير موجود.' });
      return;
    }
    delete store.coupons[id];
    saveStore();
    res.json({ ok: true });
  });

  // مسارات بوابة السائق المسجل
  app.get('/api/driver/orders', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const driver = findDriverByEmail(session.email);
    if (!driver) {
      res.status(403).json({ error: 'هذا الحساب غير مسجل كسائق توصيل.' });
      return;
    }
    const assignedOrders = getStore().orders.filter((o) => o.driverId === driver.id);
    res.json({ ok: true, driver, orders: assignedOrders });
  });

  app.post('/api/driver/orders/:orderId/status', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const driver = findDriverByEmail(session.email);
    if (!driver) {
      res.status(403).json({ error: 'هذا الحساب غير مسجل كسائق توصيل.' });
      return;
    }
    const orderId = String(req.params.orderId || '').trim();
    const order = getStore().orders.find((o) => o.orderId === orderId && o.driverId === driver.id);
    if (!order) {
      res.status(404).json({ error: 'الطلب غير مسند لك أو غير موجود.' });
      return;
    }
    const nextStatus = String((req.body as { status?: unknown })?.status || '') as OrderStatus;
    if (nextStatus !== 'on_the_way' && nextStatus !== 'delivered') {
      res.status(400).json({ error: 'يمكن للسائق تحديث الحالة إلى في الطريق أو تم التوصيل فقط.' });
      return;
    }
    const updated = updateOrderStatusAndDriver(orderId, nextStatus);
    if (updated) {
      broadcastOrderUpdate(updated);
    }
    res.json({ ok: true, order: updated });
  });

  // =========================================================================
  // الشات المباشر بين العميل، الأشخاص، السائقين، والإدارة + لعبة إكس أوه (X / O)
  // =========================================================================

  app.get('/api/chat/threads', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const myEmail = (
      session.role === 'admin' ? session.impersonatingEmail || session.email : session.email
    )
      .trim()
      .toLowerCase();
    const userAccount = getStore().users[myEmail];
    const restaurantThread = getOrCreateChatThread(
      `user:${myEmail}`,
      userAccount?.name,
      myEmail,
      'customer'
    );
    const dmThreads = listUserDmThreads(myEmail);
    res.json({ ok: true, myEmail, restaurantThread, dmThreads });
  });

  app.post('/api/chat/dm/open', requireAuth, (req: AuthedRequest, res: Response) => {
    const session = req.session!;
    const myEmail = (
      session.role === 'admin' ? session.impersonatingEmail || session.email : session.email
    )
      .trim()
      .toLowerCase();
    const rawTarget = String((req.body as { username?: unknown })?.username || '').trim();
    if (!rawTarget) {
      res.status(400).json({ error: 'يرجى إدخال يوزر الشخص لبدء المحادثة.' });
      return;
    }
    const targetUser = findUserByIdentifier(rawTarget);
    if (!targetUser || targetUser.disabled) {
      res.status(404).json({ error: 'لم يتم العثور على مستخدم نشط بهذا اليوزر.' });
      return;
    }
    if (targetUser.email.toLowerCase() === myEmail) {
      res.status(400).json({ error: 'لا يمكنك فتح محادثة مع حسابك الشخصي.' });
      return;
    }
    if (!getStore().users[myEmail]) {
      getOrCreateCustomerAccount(myEmail);
    }
    const thread = getOrCreateDmThread(myEmail, targetUser.email);
    res.json({ ok: true, thread });
  });

  app.get('/api/chat/thread', (req: Request, res: Response) => {
    const session = getSession(extractSessionToken(req));
    const queryThreadId = typeof req.query.threadId === 'string' ? req.query.threadId.trim() : '';
    const myEmail = session
      ? (session.role === 'admin' ? session.impersonatingEmail || session.email : session.email)
          .trim()
          .toLowerCase()
      : '';

    if (queryThreadId.startsWith('dm:')) {
      const existing = getStore().chats[queryThreadId];
      if (!session || !existing || existing.threadType !== 'dm' || !existing.participants?.includes(myEmail)) {
        res.status(403).json({ error: 'هذه المحادثة الخاصة غير متاحة لك.' });
        return;
      }
      res.json({ ok: true, thread: existing });
      return;
    }

    let threadId = queryThreadId;
    let customerName: string | undefined;
    let customerEmail: string | undefined;
    let threadType: 'customer' | 'driver' = 'customer';

    if (queryThreadId.startsWith('driver:')) {
      const drvId = queryThreadId.slice('driver:'.length);
      const drv = getStore().drivers[drvId];
      const sessionDriver = session?.email ? findDriverByEmail(session.email) : null;
      const isAllowed =
        session?.role === 'admin' || (sessionDriver && sessionDriver.id === drvId);
      if (!isAllowed || !drv) {
        res.status(403).json({ error: 'محادثة السائق غير مصرح بها.' });
        return;
      }
      threadId = `driver:${drv.id}`;
      customerName = `السائق ${drv.name}`;
      customerEmail = drv.email || drv.phone;
      threadType = 'driver';
    } else if (queryThreadId.startsWith('user:')) {
      const ownerEmail = queryThreadId.slice('user:'.length).toLowerCase();
      const isAllowed = session?.role === 'admin' || (myEmail && myEmail === ownerEmail);
      if (!isAllowed) {
        res.status(403).json({ error: 'غير مصرح بالوصول إلى هذه المحادثة.' });
        return;
      }
      threadId = `user:${ownerEmail}`;
      const account = getStore().users[ownerEmail];
      customerName = account?.name;
      customerEmail = ownerEmail;
    } else if (session?.role === 'customer') {
      threadId = `user:${session.email}`;
      const account = getStore().users[session.email];
      customerName = account?.name;
      customerEmail = session.email;
    } else if (session?.role === 'admin' && session.impersonatingEmail) {
      threadId = `user:${session.impersonatingEmail}`;
      const account = getStore().users[session.impersonatingEmail];
      customerName = account?.name;
      customerEmail = session.impersonatingEmail;
    }

    if (!threadId) {
      res.status(400).json({ error: 'معرف المحادثة مطلوب.' });
      return;
    }

    const thread = getOrCreateChatThread(threadId, customerName, customerEmail, threadType);
    res.json({ ok: true, thread });
  });

  app.get('/api/admin/chats', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const store = getStore();
    for (const driver of Object.values(store.drivers)) {
      const dThreadId = `driver:${driver.id}`;
      if (!store.chats[dThreadId]) {
        getOrCreateChatThread(dThreadId, `السائق ${driver.name}`, driver.email || driver.phone, 'driver');
      }
    }
    const threads = Object.values(store.chats)
      .filter((t) => t.threadType !== 'dm' && !t.threadId.startsWith('dm:'))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json({ ok: true, threads });
  });

  app.post('/api/chat/send', (req: Request, res: Response) => {
    const session = getSession(extractSessionToken(req));
    const body = (req.body || {}) as {
      threadId?: unknown;
      text?: unknown;
      senderName?: unknown;
      asAdmin?: unknown;
      asDriver?: unknown;
    };

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'يرجى كتابة نص الرسالة.' });
      return;
    }

    const reqThreadId = typeof body.threadId === 'string' ? body.threadId.trim() : '';

    if (reqThreadId.startsWith('dm:')) {
      if (!session) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول للمراسلة بين الأشخاص.' });
        return;
      }
      const myEmail = (
        session.role === 'admin' ? session.impersonatingEmail || session.email : session.email
      )
        .trim()
        .toLowerCase();
      const existing = getStore().chats[reqThreadId];
      if (!existing || existing.threadType !== 'dm' || !existing.participants?.includes(myEmail)) {
        res.status(403).json({ error: 'ليست لديك صلاحية الإرسال في هذه المحادثة.' });
        return;
      }
      const senderAccount = getStore().users[myEmail] || getOrCreateCustomerAccount(myEmail);
      const senderLabel = senderAccount.username
        ? `${senderAccount.name} (@${senderAccount.username})`
        : senderAccount.name;
      const { thread, message } = appendChatMessage(
        reqThreadId,
        'customer',
        senderLabel,
        text,
        myEmail,
        myEmail
      );
      broadcastChatEvent(thread.threadId, {
        type: 'chat:message',
        threadId: thread.threadId,
        message,
        thread,
      });
      res.json({ ok: true, thread, message });
      return;
    }

    const isAdminSender = Boolean(body.asAdmin);
    if (isAdminSender) {
      if (!session || session.role !== 'admin') {
        res.status(403).json({ error: 'إرسال الرد كإدارة متاح للمشرفين فقط.' });
        return;
      }
      if (!reqThreadId || reqThreadId.startsWith('dm:')) {
        res.status(400).json({ error: 'يرجى تحديد المحادثة المطلوبة.' });
        return;
      }
      const brand = getStore().siteConfig.restaurant.name;
      const { thread, message } = appendChatMessage(reqThreadId, 'admin', `إدارة ${brand}`, text);
      broadcastChatEvent(thread.threadId, {
        type: 'chat:message',
        threadId: thread.threadId,
        message,
        thread,
      });
      res.json({ ok: true, thread, message });
      return;
    }

    const isDriverSender = Boolean(body.asDriver);
    if (isDriverSender) {
      const driver = session?.email ? findDriverByEmail(session.email) : null;
      if (!driver) {
        res.status(403).json({ error: 'هذا الحساب غير مسجل كسائق.' });
        return;
      }
      const driverThreadId = `driver:${driver.id}`;
      const { thread, message } = appendChatMessage(
        driverThreadId,
        'driver',
        `السائق ${driver.name}`,
        text,
        driver.email || driver.phone,
        driver.email || undefined
      );
      broadcastChatEvent(thread.threadId, {
        type: 'chat:message',
        threadId: thread.threadId,
        message,
        thread,
      });
      res.json({ ok: true, thread, message });
      return;
    }

    let threadId = reqThreadId;
    let senderLabel = typeof body.senderName === 'string' && body.senderName.trim()
      ? body.senderName.trim()
      : 'عميل زائر';
    let customerEmail: string | undefined;

    if (session?.role === 'customer') {
      threadId = `user:${session.email}`;
      const account = getStore().users[session.email];
      senderLabel = account?.name || session.email.split('@')[0];
      customerEmail = session.email;
    } else if (session?.role === 'admin' && session.impersonatingEmail) {
      threadId = `user:${session.impersonatingEmail}`;
      const account = getStore().users[session.impersonatingEmail];
      senderLabel = account?.name || session.impersonatingEmail.split('@')[0];
      customerEmail = session.impersonatingEmail;
    }

    if (!threadId || threadId.startsWith('driver:')) {
      res.status(400).json({ error: 'معرف المحادثة مطلوب.' });
      return;
    }

    const { thread, message } = appendChatMessage(
      threadId,
      'customer',
      senderLabel,
      text,
      customerEmail,
      customerEmail
    );
    broadcastChatEvent(thread.threadId, {
      type: 'chat:message',
      threadId: thread.threadId,
      message,
      thread,
    });
    res.json({ ok: true, thread, message });
  });

  app.post('/api/chat/read', (req: Request, res: Response) => {
    const session = getSession(extractSessionToken(req));
    const body = (req.body || {}) as { threadId?: unknown; asAdmin?: unknown };
    const threadId = String(body.threadId || '').trim();
    if (!threadId) {
      res.json({ ok: true });
      return;
    }
    const myEmail = session
      ? (session.role === 'admin' ? session.impersonatingEmail || session.email : session.email)
          .trim()
          .toLowerCase()
      : undefined;

    if (threadId.startsWith('dm:')) {
      const existing = getStore().chats[threadId];
      if (!myEmail || !existing?.participants?.includes(myEmail)) {
        res.status(403).json({ error: 'غير مصرح.' });
        return;
      }
      const thread = markThreadRead(threadId, 'customer', myEmail);
      if (thread) {
        broadcastChatEvent(thread.threadId, {
          type: 'chat:read',
          threadId: thread.threadId,
          thread,
        });
      }
      res.json({ ok: true, thread });
      return;
    }

    const readerRole: 'customer' | 'admin' =
      body.asAdmin && session?.role === 'admin' ? 'admin' : 'customer';
    const thread = markThreadRead(threadId, readerRole, myEmail);
    if (thread) {
      broadcastChatEvent(thread.threadId, {
        type: 'chat:read',
        threadId: thread.threadId,
        thread,
      });
    }
    res.json({ ok: true, thread });
  });

  app.post('/api/chat/game/start', (req: Request, res: Response) => {
    const session = getSession(extractSessionToken(req));
    const body = (req.body || {}) as {
      threadId?: unknown;
      guestId?: unknown;
      asAdmin?: unknown;
    };
    const threadId = String(body.threadId || '').trim();
    const guestId = String(body.guestId || '').trim();
    const asAdmin = Boolean(body.asAdmin);
    if (!threadId) {
      res.status(400).json({ error: 'معرف المحادثة مطلوب.' });
      return;
    }

    const store = getStore();
    const brand = store.siteConfig.restaurant.name;
    const myEmail = session
      ? (session.role === 'admin' ? session.impersonatingEmail || session.email : session.email)
          .trim()
          .toLowerCase()
      : '';

    let playerX: { id: string; label: string };
    let playerO: { id: string; label: string };

    if (threadId.startsWith('dm:')) {
      const thread = store.chats[threadId];
      if (!session || !thread || thread.threadType !== 'dm' || !thread.participants?.includes(myEmail)) {
        res.status(403).json({ error: 'غير مصرح ببدء اللعبة في هذه المحادثة.' });
        return;
      }
      const partnerEmail = thread.participants.find((p) => p !== myEmail) || myEmail;
      const myUser = store.users[myEmail];
      const partnerUser = store.users[partnerEmail];
      playerX = {
        id: myEmail,
        label: myUser?.username ? `@${myUser.username}` : myUser?.name || myEmail.split('@')[0],
      };
      playerO = {
        id: partnerEmail,
        label: partnerUser?.username
          ? `@${partnerUser.username}`
          : partnerUser?.name || partnerEmail.split('@')[0],
      };
    } else if (threadId.startsWith('user:')) {
      const targetEmail = threadId.slice('user:'.length).toLowerCase();
      if (asAdmin && session?.role === 'admin') {
        const targetUser = store.users[targetEmail];
        playerX = { id: 'restaurant_admin', label: `إدارة ${brand}` };
        playerO = {
          id: targetEmail,
          label: targetUser?.username ? `@${targetUser.username}` : targetUser?.name || targetEmail.split('@')[0],
        };
      } else {
        if (!myEmail || myEmail !== targetEmail) {
          res.status(403).json({ error: 'غير مصرح ببدء اللعبة هنا.' });
          return;
        }
        const myUser = store.users[targetEmail];
        playerX = {
          id: targetEmail,
          label: myUser?.username ? `@${myUser.username}` : myUser?.name || targetEmail.split('@')[0],
        };
        playerO = { id: 'restaurant_admin', label: `إدارة ${brand}` };
      }
    } else if (threadId.startsWith('guest:')) {
      const targetGuestId = threadId.slice('guest:'.length);
      const existing = store.chats[threadId];
      if (asAdmin && session?.role === 'admin') {
        playerX = { id: 'restaurant_admin', label: `إدارة ${brand}` };
        playerO = { id: threadId, label: existing?.customerName || 'زائر الموقع' };
      } else {
        if (!guestId || guestId !== targetGuestId) {
          res.status(403).json({ error: 'غير مصرح ببدء اللعبة لهذا الزائر.' });
          return;
        }
        playerX = { id: threadId, label: existing?.customerName || 'زائر الموقع' };
        playerO = { id: 'restaurant_admin', label: `إدارة ${brand}` };
      }
    } else if (threadId.startsWith('driver:')) {
      const drvId = threadId.slice('driver:'.length);
      const drv = store.drivers[drvId];
      const drvSess = session?.email ? findDriverByEmail(session.email) : null;
      if (!drv) {
        res.status(404).json({ error: 'السائق غير موجود.' });
        return;
      }
      if (asAdmin && session?.role === 'admin') {
        playerX = { id: 'restaurant_admin', label: `إدارة ${brand}` };
        playerO = { id: threadId, label: `السائق ${drv.name}` };
      } else if (drvSess && drvSess.id === drvId) {
        playerX = { id: threadId, label: `السائق ${drv.name}` };
        playerO = { id: 'restaurant_admin', label: `إدارة ${brand}` };
      } else {
        res.status(403).json({ error: 'غير مصرح ببدء اللعبة في محادثة السائق.' });
        return;
      }
    } else {
      res.status(400).json({ error: 'نوع المحادثة غير مدعوم للعبة.' });
      return;
    }

    const updatedThread = startChatGame(threadId, playerX, playerO);
    broadcastChatEvent(updatedThread.threadId, {
      type: 'chat:game',
      threadId: updatedThread.threadId,
      game: updatedThread.game,
      thread: updatedThread,
    });
    res.json({ ok: true, game: updatedThread.game, thread: updatedThread });
  });

  app.post('/api/chat/game/move', (req: Request, res: Response) => {
    const session = getSession(extractSessionToken(req));
    const body = (req.body || {}) as {
      threadId?: unknown;
      cellIndex?: unknown;
      guestId?: unknown;
      asAdmin?: unknown;
    };
    const threadId = String(body.threadId || '').trim();
    const guestId = String(body.guestId || '').trim();
    const asAdmin = Boolean(body.asAdmin);
    const cellIndex = Number(body.cellIndex);
    if (!threadId) {
      res.status(400).json({ error: 'معرف المحادثة مطلوب.' });
      return;
    }

    const myEmail = session
      ? (session.role === 'admin' ? session.impersonatingEmail || session.email : session.email)
          .trim()
          .toLowerCase()
      : '';

    let callerId = '';
    if (threadId.startsWith('dm:')) {
      const thread = getStore().chats[threadId];
      if (!session || !thread || thread.threadType !== 'dm' || !thread.participants?.includes(myEmail)) {
        res.status(403).json({ error: 'غير مصرح باللعب في هذه المحادثة.' });
        return;
      }
      callerId = myEmail;
    } else if (threadId.startsWith('user:')) {
      const targetEmail = threadId.slice('user:'.length).toLowerCase();
      if (asAdmin && session?.role === 'admin') {
        callerId = 'restaurant_admin';
      } else if (myEmail && myEmail === targetEmail) {
        callerId = targetEmail;
      } else {
        res.status(403).json({ error: 'غير مصرح باللعب في هذه المحادثة.' });
        return;
      }
    } else if (threadId.startsWith('guest:')) {
      const targetGuestId = threadId.slice('guest:'.length);
      if (asAdmin && session?.role === 'admin') {
        callerId = 'restaurant_admin';
      } else if (guestId && guestId === targetGuestId) {
        callerId = threadId;
      } else {
        res.status(403).json({ error: 'غير مصرح باللعب في هذه المحادثة.' });
        return;
      }
    } else if (threadId.startsWith('driver:')) {
      const drvId = threadId.slice('driver:'.length);
      const drvSess = session?.email ? findDriverByEmail(session.email) : null;
      if (asAdmin && session?.role === 'admin') {
        callerId = 'restaurant_admin';
      } else if (drvSess && drvSess.id === drvId) {
        callerId = threadId;
      } else {
        res.status(403).json({ error: 'غير مصرح باللعب في هذه المحادثة.' });
        return;
      }
    } else {
      res.status(400).json({ error: 'نوع المحادثة غير مدعوم.' });
      return;
    }

    const result = playChatGameMove(threadId, callerId, cellIndex);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    broadcastChatEvent(result.thread.threadId, {
      type: 'chat:game',
      threadId: result.thread.threadId,
      game: result.thread.game,
      thread: result.thread,
    });
    res.json({ ok: true, game: result.thread.game, thread: result.thread });
  });

  // =========================================================================
  // بوابة المطورين الحصرية وتنزيل ملف الموقع كامل ZIP
  // =========================================================================

  app.get('/api/developer/status', requireDeveloper, (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const paidOnlineCount = store.orders.filter((o) => o.paymentStatus === 'paid').length;
    const smtp = getEffectiveSmtpConfig();
    res.json({
      ok: true,
      currentEmail: req.session!.email,
      primaryDeveloperEmail: getPrimaryDeveloperEmail(),
      developerEmails: store.developerEmails,
      metrics: {
        wsClientsCount: getWsClientsCount(),
        ordersCount: store.orders.length,
        paidOnlineCount,
        usersCount: Object.keys(store.users).length,
        couponsCount: Object.keys(store.coupons).length,
        driversCount: Object.keys(store.drivers).length,
        smtpConfigured: Boolean(smtp.host && smtp.user && smtp.pass),
        stripeConfigured: Boolean(getStripeClient()),
        nodeVersion: process.version,
        uptimeSec: Math.round(process.uptime()),
      },
    });
  });

  app.get('/api/admin/integrations', requireDeveloperOrAdmin, (req: AuthedRequest, res: Response) => {
    const smtp = getEffectiveSmtpConfig();
    const stripeKeys = getEffectiveStripeKeys();
    const store = getStore();
    res.json({
      ok: true,
      canEditIntegrations: isAuthorizedDeveloperEmail(req.session!.email) || req.session!.role === 'admin',
      isDeveloper: isAuthorizedDeveloperEmail(req.session!.email),
      smtp: {
        host: smtp.host,
        port: smtp.port,
        user: smtp.user,
        hasPass: Boolean(smtp.pass),
        orderTo: smtp.orderTo,
        adminNotifyEmail: smtp.adminNotifyEmail,
      },
      stripe: {
        publishableKey: stripeKeys.publishableKey,
        hasSecretKey: Boolean(stripeKeys.secretKey),
        secretKeyMasked: stripeKeys.secretKey
          ? `${stripeKeys.secretKey.slice(0, 7)}••••${stripeKeys.secretKey.slice(-4)}`
          : '',
      },
      updatedAt: store.integrations?.updatedAt || null,
    });
  });

  app.post('/api/admin/integrations/test-smtp', requireDeveloperOrAdmin, async (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as {
      host?: unknown;
      port?: unknown;
      user?: unknown;
      pass?: unknown;
    };
    const effective = getEffectiveSmtpConfig();
    const host = String(body.host ?? effective.host).trim();
    const port = Number(body.port ?? effective.port ?? 465);
    const user = String(body.user ?? effective.user).trim();
    const rawPass = String(body.pass ?? '').trim();
    const pass = rawPass || effective.pass;

    if (!host || !user || !pass || !Number.isFinite(port)) {
      res.status(400).json({ ok: false, error: 'يرجى تعبئة بيانات خادم البريد SMTP كاملة للاختبار.' });
      return;
    }

    const result = await testSmtpConnection({ host, port, user, pass });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: `فشل اتصال SMTP: ${result.error}` });
      return;
    }
    res.json({ ok: true, message: 'تم الاتصال بنجاح والتحقق من خادم البريد الإلكتروني SMTP SSL.' });
  });

  app.post('/api/admin/integrations/test-stripe', requireDeveloperOrAdmin, async (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as { secretKey?: unknown };
    const effective = getEffectiveStripeKeys();
    const secretKey = String(body.secretKey ?? '').trim() || effective.secretKey;

    if (!secretKey) {
      res.status(400).json({ ok: false, error: 'يرجى إدخال مفتاح Stripe السري (sk_...) للاختبار.' });
      return;
    }

    try {
      const client = getStripeClient(secretKey);
      if (!client) {
        res.status(400).json({ ok: false, error: 'مفتاح Stripe غير صالح.' });
        return;
      }
      await client.balance.retrieve();
      res.json({
        ok: true,
        message: 'تم الاتصال ببوابة Stripe بنجاح والتحقق من صلاحية المفتاح السري.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر التحقق من مفتاح Stripe';
      res.status(400).json({ ok: false, error: `فشل اختبار Stripe: ${msg}` });
    }
  });

  app.put('/api/admin/integrations', requireDeveloperOrAdmin, async (req: AuthedRequest, res: Response) => {
    const body = (req.body || {}) as {
      smtpHost?: unknown;
      smtpPort?: unknown;
      smtpUser?: unknown;
      smtpPass?: unknown;
      orderTo?: unknown;
      adminNotifyEmail?: unknown;
      stripeSecretKey?: unknown;
      stripePublishableKey?: unknown;
      clearStripeSecret?: unknown;
      verifyBeforeSave?: unknown;
    };

    const effectiveSmtp = getEffectiveSmtpConfig();
    const effectiveStripe = getEffectiveStripeKeys();

    const nextSmtpHost = String(body.smtpHost ?? effectiveSmtp.host).trim().slice(0, 120);
    const nextSmtpPort = Math.max(1, Math.min(65535, Math.round(Number(body.smtpPort ?? effectiveSmtp.port ?? 465))));
    const nextSmtpUser = String(body.smtpUser ?? effectiveSmtp.user).trim().slice(0, 160);
    const rawSmtpPass = typeof body.smtpPass === 'string' ? body.smtpPass.trim() : '';
    const nextSmtpPass = rawSmtpPass || effectiveSmtp.pass;
    const nextOrderTo = String(body.orderTo ?? effectiveSmtp.orderTo).trim().slice(0, 160);
    const nextAdminNotify = String(body.adminNotifyEmail ?? effectiveSmtp.adminNotifyEmail)
      .trim()
      .toLowerCase()
      .slice(0, 160);

    const clearStripe = Boolean(body.clearStripeSecret);
    const rawStripeSecret = typeof body.stripeSecretKey === 'string' ? body.stripeSecretKey.trim() : '';
    const nextStripeSecret = clearStripe ? '' : rawStripeSecret || effectiveStripe.secretKey;
    const nextStripePub = String(body.stripePublishableKey ?? effectiveStripe.publishableKey)
      .trim()
      .slice(0, 200);

    const verifyBeforeSave = body.verifyBeforeSave !== false;
    if (verifyBeforeSave) {
      if (nextSmtpHost && nextSmtpUser && nextSmtpPass) {
        const smtpCheck = await testSmtpConnection({
          host: nextSmtpHost,
          port: nextSmtpPort,
          user: nextSmtpUser,
          pass: nextSmtpPass,
        });
        if (!smtpCheck.ok) {
          res.status(400).json({
            error: `لم يتم الحفظ لأن اختبار SMTP فشل: ${smtpCheck.error}`,
          });
          return;
        }
      }
      if (nextStripeSecret) {
        try {
          const client = getStripeClient(nextStripeSecret);
          if (!client) throw new Error('مفتاح Stripe غير صالح');
          await client.balance.retrieve();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'مفتاح Stripe غير صالح';
          res.status(400).json({
            error: `لم يتم الحفظ لأن اختبار Stripe فشل: ${msg}`,
          });
          return;
        }
      }
    }

    const store = getStore();
    store.integrations = {
      smtpHost: nextSmtpHost,
      smtpPort: nextSmtpPort,
      smtpUser: nextSmtpUser,
      smtpPass: nextSmtpPass,
      orderTo: nextOrderTo,
      adminNotifyEmail: nextAdminNotify,
      stripeSecretKey: nextStripeSecret,
      stripePublishableKey: nextStripePub,
      updatedAt: new Date().toISOString(),
    };
    saveStore();

    res.json({
      ok: true,
      message: 'تم التحقق من الإعدادات وحفظها وتفعيلها فوراً.',
      stripeConfigured: Boolean(nextStripeSecret),
      updatedAt: store.integrations.updatedAt,
    });
  });

  app.post('/api/developer/accounts', requireDeveloper, (req: AuthedRequest, res: Response) => {
    const email = normalizeEmail((req.body as { email?: unknown })?.email);
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح لحساب المطور.' });
      return;
    }
    const primary = getPrimaryDeveloperEmail();
    const store = getStore();
    if (email !== primary && !store.developerEmails.includes(email)) {
      store.developerEmails.push(email);
      saveStore();
    }
    res.json({
      ok: true,
      primaryDeveloperEmail: primary,
      developerEmails: store.developerEmails,
    });
  });

  app.delete('/api/developer/accounts/:email', requireDeveloper, (req: AuthedRequest, res: Response) => {
    const email = normalizeEmail(decodeURIComponent(req.params.email || ''));
    const primary = getPrimaryDeveloperEmail();
    if (email === primary) {
      res.status(400).json({ error: 'لا يمكن إزالة حساب المطور الأساسي.' });
      return;
    }
    const store = getStore();
    store.developerEmails = store.developerEmails.filter((e) => e !== email);
    saveStore();
    res.json({
      ok: true,
      primaryDeveloperEmail: primary,
      developerEmails: store.developerEmails,
    });
  });

  app.put('/api/developer/site', requireDeveloper, (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const result = validateAndSanitizeSiteConfig(req.body, store.siteConfig);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    store.siteConfig = result.config;
    saveStore();
    broadcastAll({ type: 'config:updated', siteConfig: store.siteConfig });
    res.json({ ok: true, siteConfig: store.siteConfig });
  });

  app.post('/api/developer/site/reset', requireDeveloper, (_req: AuthedRequest, res: Response) => {
    const resetConfig = resetSiteConfigToSeed();
    broadcastAll({ type: 'config:updated', siteConfig: resetConfig });
    res.json({ ok: true, siteConfig: resetConfig });
  });

  app.get('/api/developer/download-zip', requireDeveloper, async (_req: AuthedRequest, res: Response) => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `zoldix-complete-site-${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on('error', (err: Error) => {
      console.error('ZIP archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'تعذر تجهيز ملف الموقع المضغوط.' });
      } else {
        res.end();
      }
    });

    archive.pipe(res);

    const excludedTop = new Set([
      '.env',
      'node_modules',
      '.git',
      '.aistudio',
      'dev-dist',
      'dist',
      '.netlify',
    ]);
    const excludedRelPrefixes = ['src/assets', 'public/assets/aistudio'];

    const addDirectoryRecursive = (dirPath: string, relBase: string) => {
      const resolvedDir = path.resolve(dirPath);
      if (resolvedDir !== ROOT_DIR && !resolvedDir.startsWith(ROOT_DIR + path.sep)) {
        return;
      }
      const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.endsWith('.tmp') || entry.name === '.DS_Store') continue;
        const entryAbs = path.join(resolvedDir, entry.name);
        const entryRel = relBase ? `${relBase}/${entry.name}` : entry.name;
        const topName = entryRel.split('/')[0];
        if (excludedTop.has(topName)) continue;
        if (excludedRelPrefixes.some((p) => entryRel === p || entryRel.startsWith(`${p}/`))) {
          continue;
        }

        if (entry.isDirectory()) {
          addDirectoryRecursive(entryAbs, entryRel);
        } else if (entry.isFile()) {
          if (entryRel === 'data/store.json') {
            // الاحتفاظ بحسابات المستخدمين وتشفير كلمات المرور (scrypt) مع تصفير الأسرار والمفاتيح وتوليد sessionSecret جديد للنسخة
            const currentStore = getStore();
            const safeUsers: Record<string, unknown> = {};
            for (const [k, u] of Object.entries(currentStore.users)) {
              safeUsers[k] = {
                ...u,
                hasPassword: Boolean(u.passwordHash || u.hasPassword),
              };
            }
            const safeStore = {
              ...currentStore,
              sessionSecret: crypto.randomBytes(32).toString('hex'),
              adminCredentialHash: null,
              integrations: {},
              users: safeUsers,
              revokedBeforeByEmail: {},
              revokedSessionJtis: {},
              consumedOtpJtis: {},
              pendingStripeOrders: {},
              processedStripeSessions: {},
            };
            archive.append(JSON.stringify(safeStore, null, 2), { name: 'data/store.json' });
          } else {
            archive.file(entryAbs, { name: entryRel });
          }
        }
      }
    };

    try {
      addDirectoryRecursive(ROOT_DIR, '');

      const deployNote = [
        'zoldix Full Standalone Website Package',
        '=======================================',
        'Option A — Vercel (Recommended Serverless Full-Stack via vercel.json + api/index.ts):',
        '1. Push this extracted folder to GitHub and import the repository in Vercel.',
        '2. Vercel detects vercel.json automatically (build: `npm run build`, output: `dist`, API: `/api/index.ts`).',
        '3. Add Environment Variables in Vercel Project Settings -> Environment Variables:',
        '   - Required for Gmail OTP/emails: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER, SMTP_PASS (Gmail App Password), ORDER_TO, ADMIN_NOTIFY_EMAIL',
        '   - Recommended for persistent data across cold starts: KV_REST_API_URL & KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN)',
        '   - Security: SESSION_SECRET, ADMIN_PASSWORD, DEVELOPER_PRIMARY_EMAIL, optional STRIPE_SECRET_KEY',
        '',
        'Option B — Netlify (Full-Stack via netlify.toml + netlify/functions/api.ts):',
        '1. Push to GitHub or deploy via Netlify CLI (`netlify deploy --prod`).',
        '2. Set the same Environment Variables in Netlify Site Settings.',
        '',
        'Option C — Standard Node.js Server (VPS / Render / Railway):',
        '1. Copy .env.example to .env and configure SMTP, ADMIN_PASSWORD, ADMIN_NOTIFY_EMAIL, ORDER_TO, SESSION_SECRET.',
        '2. Run: npm install && npm run build && npm start',
        '',
      ].join('\n');
      archive.append(deployNote, { name: 'DEPLOY_GUIDE.txt' });
    } catch (err) {
      console.error('ZIP build file tree error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'تعذر قراءة ملفات الموقع للضغط.' });
      } else {
        res.end();
      }
      return;
    }

    res.on('close', () => {
      if (!res.writableFinished && !archive.writableEnded) {
        archive.abort();
      }
    });

    try {
      await archive.finalize();
    } catch (err) {
      console.error('ZIP finalize error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'تعذر إنهاء ضغط ملف الموقع.' });
      }
    }
  });

  return app;
}
