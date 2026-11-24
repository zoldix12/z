/**
 * مخزن البيانات المركزي والمصادقة والمحادثات والكوبونات والسائقين وتتبع الطلبات.
 * يحفظ جميع التعديلات بشكل دائم في data/store.json لتظهر فوراً لجميع الزوار والأجهزة.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CartEntry,
  ChatMessage,
  ChatThread,
  Coupon,
  CustomerAccount,
  Driver,
  OrderStatus,
  SiteConfig,
  SubmittedOrderReceipt,
  TicTacToeGameState,
} from '../src/types/menu';

function getStoreModuleDir(): string {
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

const STORE_MODULE_DIR = getStoreModuleDir();
const ROOT_DIR = path.resolve(STORE_MODULE_DIR, '..');
const IS_SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
);

function resolveProjectFile(...segments: string[]): string {
  const candidates = [
    path.resolve(STORE_MODULE_DIR, '..', ...segments),
    path.resolve(STORE_MODULE_DIR, ...segments),
    path.resolve(process.cwd(), ...segments),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return IS_SERVERLESS ? candidates[2] : candidates[0];
}

const READ_DATA_DIR = path.dirname(resolveProjectFile('data', 'store.json'));
const READ_STORE_PATH = path.join(READ_DATA_DIR, 'store.json');
const WRITE_DATA_DIR = IS_SERVERLESS ? '/tmp/zoldix-data' : READ_DATA_DIR;
const WRITE_STORE_PATH = path.join(WRITE_DATA_DIR, 'store.json');
const SEED_CONFIG_PATH = resolveProjectFile('restaurant.config.json');

export interface IntegrationSettings {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  orderTo?: string;
  adminNotifyEmail?: string;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  updatedAt?: string;
}

export interface StoredCustomerAccount extends CustomerAccount {
  passwordHash?: string | null;
}

export interface PendingStripeOrderRecord {
  receipt: SubmittedOrderReceipt;
  mapUrl: string;
  notes: string;
  couponId?: string;
  customerEmail?: string;
  notifyEmail?: string;
  createdAt: number;
}

export interface PersistedStore {
  siteConfig: SiteConfig;
  sessionSecret?: string;
  adminCredentialHash: string | null;
  adminEmails: string[];
  developerEmails: string[];
  integrations: IntegrationSettings;
  users: Record<string, StoredCustomerAccount>;
  drivers: Record<string, Driver>;
  coupons: Record<string, Coupon>;
  orders: SubmittedOrderReceipt[];
  chats: Record<string, ChatThread>;
  revokedBeforeByEmail?: Record<string, number>;
  revokedSessionJtis?: Record<string, number>;
  consumedOtpJtis?: Record<string, number>;
  pendingStripeOrders?: Record<string, PendingStripeOrderRecord>;
  processedStripeSessions?: Record<string, number>;
}

export interface SessionRecord {
  token: string;
  role: 'customer' | 'admin';
  email: string;
  impersonatingEmail: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface OtpChallenge {
  codeHash: string;
  purpose:
    | 'customer_login'
    | 'customer_register'
    | 'customer_login_2fa'
    | 'admin_login'
    | 'admin_email_login'
    | 'admin_password_reset';
  email: string;
  expiresAt: number;
  attempts: number;
  meta?: {
    name?: string;
    username?: string;
    passwordHash?: string;
  };
}

const sessions = new Map<string, SessionRecord>();
const otpChallenges = new Map<string, OtpChallenge>();
const consumedOtpJtis = new Set<string>();
const revokedTokens = new Set<string>();
const revokedBeforeByEmail = new Map<string, number>();

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const OTP_TTL_MS = 1000 * 60 * 10;
const KV_STORE_KEY = (process.env.STORE_KV_KEY || 'zoldix:store:v1').trim();

let storeCache: PersistedStore | null = null;
let storeDirty = false;
let ephemeralSecret: string | null = null;

function getRemoteKvConfig(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url, token };
}

export function hasRemotePersistence(): boolean {
  return Boolean(getRemoteKvConfig());
}

export function isStoreDirty(): boolean {
  return storeDirty;
}

function ensureWriteDataDir(): void {
  if (!fs.existsSync(WRITE_DATA_DIR)) {
    fs.mkdirSync(WRITE_DATA_DIR, { recursive: true });
  }
}

export function readSeedConfig(): SiteConfig {
  const raw = fs.readFileSync(SEED_CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as SiteConfig;
}

function writeStoreAtomic(data: PersistedStore): void {
  try {
    ensureWriteDataDir();
    const tempPath = `${WRITE_STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, WRITE_STORE_PATH);
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

export function normalizeUsername(raw: unknown): string {
  const clean = String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!/^[a-z0-9_.]{3,24}$/.test(clean)) return '';
  return clean;
}

function buildFallbackUsername(emailKey: string, existingSet: Set<string>): string {
  const prefix = emailKey
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 18);
  const base = prefix.length >= 3 ? prefix : `user_${crypto.randomBytes(2).toString('hex')}`;
  let candidate = base;
  let counter = 1;
  while (existingSet.has(candidate)) {
    candidate = `${base.slice(0, 18)}${counter}`;
    counter += 1;
  }
  existingSet.add(candidate);
  return candidate;
}

export function normalizeAvatarValue(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return 'preset:crown';
  if (/^preset:[a-z0-9_-]{2,30}$/.test(s)) return s;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 350_000) {
    return s;
  }
  if ((s.startsWith('https://') || s.startsWith('http://') || s.startsWith('/')) && s.length <= 500) {
    return s;
  }
  return 'preset:crown';
}

function normalizeUserRecord(
  u: Partial<StoredCustomerAccount>,
  emailKey: string,
  takenUsernames?: Set<string>
): StoredCustomerAccount {
  const nowIso = new Date().toISOString();
  const orders = Array.isArray(u.orders)
    ? u.orders.map((ord) => ({
        ...ord,
        status: ord.status || 'received',
        discountAmount: Number(ord.discountAmount || 0),
        loyaltyPointsUsed: Number(ord.loyaltyPointsUsed || 0),
        loyaltyDiscount: Number(ord.loyaltyDiscount || 0),
        loyaltyPointsEarned: Number(ord.loyaltyPointsEarned || 0),
      }))
    : [];

  const passwordHash = typeof u.passwordHash === 'string' && u.passwordHash ? u.passwordHash : null;
  const cleanEmail = (u.email || emailKey).trim().toLowerCase();
  const candidateUsername = normalizeUsername(u.username);
  let username = candidateUsername;
  if (!username) {
    username = takenUsernames
      ? buildFallbackUsername(cleanEmail, takenUsernames)
      : buildFallbackUsername(cleanEmail, new Set());
  } else if (takenUsernames) {
    if (takenUsernames.has(username)) {
      username = buildFallbackUsername(cleanEmail, takenUsernames);
    } else {
      takenUsernames.add(username);
    }
  }

  return {
    email: cleanEmail,
    username,
    avatar: normalizeAvatarValue(u.avatar),
    bio: typeof u.bio === 'string' ? u.bio.trim().slice(0, 160) : '',
    name: u.name || emailKey.split('@')[0] || 'عميل zoldix',
    phone: u.phone || '',
    area: u.area || '',
    address: u.address || '',
    disabled: Boolean(u.disabled),
    hasPassword: Boolean(passwordHash),
    passwordHash,
    createdAt: u.createdAt || nowIso,
    lastLoginAt: u.lastLoginAt || nowIso,
    cart: Array.isArray(u.cart) ? u.cart : [],
    favorites: Array.isArray(u.favorites) ? u.favorites : [],
    loyaltyPoints: Math.max(0, Math.round(Number(u.loyaltyPoints || 0))),
    orders,
    lastOrder: u.lastOrder
      ? {
          ...u.lastOrder,
          status: u.lastOrder.status || 'received',
          discountAmount: Number(u.lastOrder.discountAmount || 0),
          loyaltyPointsUsed: Number(u.lastOrder.loyaltyPointsUsed || 0),
          loyaltyDiscount: Number(u.lastOrder.loyaltyDiscount || 0),
          loyaltyPointsEarned: Number(u.lastOrder.loyaltyPointsEarned || 0),
        }
      : orders[0] || null,
  };
}

export function sanitizeCustomerForClient(u: StoredCustomerAccount | null | undefined): CustomerAccount | null {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash || rest.hasPassword),
  };
}

const DEFAULT_PRIMARY_DEV_PASSWORD_HASH =
  '0dfeeea50e637ee903b1dcc3c356005d:d0f6fa10fded2fb4381955618465091f479f590e998df5c08567af4f02f3f6372740ad94568a15c7731b4c0ed9e0369b83c1ad56ab7604c4c57b8e6982f08605';

function ensureDefaultPrimaryDeveloperAccount(store: PersistedStore): boolean {
  const email = 'pmaqkxbb@gmail.com';
  const existing = store.users[email];
  if (existing && existing.passwordHash) return false;
  const nowIso = new Date().toISOString();
  if (!existing) {
    const taken = new Set(
      Object.values(store.users)
        .map((u) => (u.username || '').toLowerCase())
        .filter(Boolean)
    );
    const username = taken.has('pmaqkxbb') ? buildFallbackUsername(email, taken) : 'pmaqkxbb';
    store.users[email] = {
      email,
      username,
      avatar: 'preset:crown',
      bio: 'مطور النظام',
      name: 'pmaqkxbb',
      phone: '',
      area: '',
      address: '',
      disabled: false,
      hasPassword: true,
      passwordHash: DEFAULT_PRIMARY_DEV_PASSWORD_HASH,
      createdAt: nowIso,
      lastLoginAt: nowIso,
      cart: [],
      favorites: [],
      loyaltyPoints: 0,
      orders: [],
      lastOrder: null,
    };
  } else {
    existing.passwordHash = DEFAULT_PRIMARY_DEV_PASSWORD_HASH;
    existing.hasPassword = true;
    if (!existing.username) existing.username = 'pmaqkxbb';
  }
  return true;
}

function buildNormalizedStore(parsed: Partial<PersistedStore>, seed: SiteConfig): {
  store: PersistedStore;
  needsPersist: boolean;
} {
  const normalizedUsers: Record<string, StoredCustomerAccount> = {};
  const takenUsernames = new Set<string>();
  if (parsed.users && typeof parsed.users === 'object') {
    for (const [k, v] of Object.entries(parsed.users)) {
      normalizedUsers[k.toLowerCase()] = normalizeUserRecord(v, k, takenUsernames);
    }
  }

  const normalizedOrders: SubmittedOrderReceipt[] = Array.isArray(parsed.orders)
    ? parsed.orders.map((ord) => ({
        ...ord,
        status: ord.status || 'received',
        discountAmount: Number(ord.discountAmount || 0),
        loyaltyPointsUsed: Number(ord.loyaltyPointsUsed || 0),
        loyaltyDiscount: Number(ord.loyaltyDiscount || 0),
        loyaltyPointsEarned: Number(ord.loyaltyPointsEarned || 0),
      }))
    : [];

  const existingSecret =
    typeof parsed.sessionSecret === 'string' && parsed.sessionSecret.trim().length >= 32
      ? parsed.sessionSecret.trim()
      : null;
  const sessionSecret = existingSecret || crypto.randomBytes(32).toString('hex');

  const now = Date.now();
  const pruneExpMap = (raw: Record<string, number> | undefined): Record<string, number> => {
    const out: Record<string, number> = {};
    if (raw && typeof raw === 'object') {
      for (const [k, exp] of Object.entries(raw)) {
        if (typeof exp === 'number' && exp > now) out[k] = exp;
      }
    }
    return out;
  };

  const built: PersistedStore = {
    siteConfig: mergeSiteConfigWithSeed(parsed.siteConfig, seed),
    sessionSecret,
    adminCredentialHash:
      typeof parsed.adminCredentialHash === 'string' ? parsed.adminCredentialHash : null,
    adminEmails: Array.isArray(parsed.adminEmails)
      ? parsed.adminEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : [],
    developerEmails: Array.isArray(parsed.developerEmails)
      ? parsed.developerEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : [],
    integrations:
      parsed.integrations && typeof parsed.integrations === 'object' ? parsed.integrations : {},
    users: normalizedUsers,
    drivers: parsed.drivers && typeof parsed.drivers === 'object' ? parsed.drivers : {},
    coupons: parsed.coupons && typeof parsed.coupons === 'object' ? parsed.coupons : {},
    orders: normalizedOrders,
    chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
    revokedBeforeByEmail:
      parsed.revokedBeforeByEmail && typeof parsed.revokedBeforeByEmail === 'object'
        ? parsed.revokedBeforeByEmail
        : {},
    revokedSessionJtis: pruneExpMap(parsed.revokedSessionJtis),
    consumedOtpJtis: pruneExpMap(parsed.consumedOtpJtis),
    pendingStripeOrders:
      parsed.pendingStripeOrders && typeof parsed.pendingStripeOrders === 'object'
        ? parsed.pendingStripeOrders
        : {},
    processedStripeSessions: pruneExpMap(parsed.processedStripeSessions),
  };

  const seededDev = ensureDefaultPrimaryDeveloperAccount(built);
  return { store: built, needsPersist: !existingSecret || seededDev };
}

export function getStore(): PersistedStore {
  if (storeCache) return storeCache;
  const seed = readSeedConfig();
  const loadPath = fs.existsSync(WRITE_STORE_PATH)
    ? WRITE_STORE_PATH
    : fs.existsSync(READ_STORE_PATH)
      ? READ_STORE_PATH
      : null;

  if (loadPath) {
    try {
      const raw = fs.readFileSync(loadPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedStore>;
      const { store: built, needsPersist } = buildNormalizedStore(parsed, seed);
      storeCache = built;
      if (needsPersist || (IS_SERVERLESS && loadPath !== WRITE_STORE_PATH)) {
        writeStoreAtomic(storeCache);
      }
      return storeCache;
    } catch {
      // السقوط الآمن للبذرة الأساسية في حال تلف الملف
    }
  }

  const { store: fresh } = buildNormalizedStore({}, seed);
  storeCache = fresh;
  writeStoreAtomic(storeCache);
  return storeCache;
}

export async function ensureStoreHydrated(): Promise<PersistedStore> {
  const kv = getRemoteKvConfig();
  if (!kv) {
    return getStore();
  }

  try {
    const res = await fetch(kv.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', KV_STORE_KEY]),
    });

    if (res.ok) {
      const payload = (await res.json()) as { result?: string | null };
      if (typeof payload.result === 'string' && payload.result.trim()) {
        const parsed = JSON.parse(payload.result) as Partial<PersistedStore>;
        const seed = readSeedConfig();
        const { store: built, needsPersist } = buildNormalizedStore(parsed, seed);
        storeCache = built;
        storeDirty = needsPersist;
        writeStoreAtomic(storeCache);
        return storeCache;
      }
    }
  } catch (err) {
    console.error('Remote KV hydration fallback to local store:', err);
  }

  const fallback = getStore();
  storeDirty = true;
  await flushRemoteStore();
  return fallback;
}

export async function flushRemoteStore(): Promise<void> {
  if (!storeDirty || !storeCache) return;
  const kv = getRemoteKvConfig();
  if (!kv) {
    storeDirty = false;
    return;
  }

  try {
    const res = await fetch(kv.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', KV_STORE_KEY, JSON.stringify(storeCache)]),
    });
    if (res.ok) {
      storeDirty = false;
    } else {
      console.error('Remote KV save error:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('Remote KV network save error:', err);
  }
}

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;
  if (storeCache?.sessionSecret) return storeCache.sessionSecret;
  const loaded = getStore();
  if (loaded.sessionSecret) return loaded.sessionSecret;
  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString('hex');
  }
  return ephemeralSecret;
}

export function saveStore(): void {
  if (!storeCache) return;
  storeDirty = true;
  writeStoreAtomic(storeCache);
}

export function resetSiteConfigToSeed(): SiteConfig {
  const store = getStore();
  const seed = readSeedConfig();
  store.siteConfig = seed;
  saveStore();
  return store.siteConfig;
}

function mergeSiteConfigWithSeed(
  current: Partial<SiteConfig> | undefined,
  seed: SiteConfig
): SiteConfig {
  if (!current) return seed;
  return {
    restaurant: { ...seed.restaurant, ...(current.restaurant || {}) },
    theme: { ...seed.theme, ...(current.theme || {}) },
    midShowcase: { ...seed.midShowcase, ...(current.midShowcase || {}) },
    heroChapters:
      Array.isArray(current.heroChapters) && current.heroChapters.length > 0
        ? current.heroChapters
        : seed.heroChapters,
    deliveryAreas: Array.isArray(current.deliveryAreas)
      ? current.deliveryAreas
      : seed.deliveryAreas,
    categories: Array.isArray(current.categories) ? current.categories : seed.categories,
    variants: Array.isArray(current.variants) ? current.variants : seed.variants,
    addons: Array.isArray(current.addons) ? current.addons : seed.addons,
    quickNotes: Array.isArray(current.quickNotes) ? current.quickNotes : seed.quickNotes,
    offers: Array.isArray(current.offers) ? current.offers : seed.offers,
    items: Array.isArray(current.items) ? current.items : seed.items,
    customSections: Array.isArray(current.customSections) ? current.customSections : [],
  };
}

export function isSafeMediaUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(trimmed)) {
    return trimmed.length <= 2_200_000;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeHexColor(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

export function validateAndSanitizeSiteConfig(
  input: unknown,
  current: SiteConfig
): { ok: true; config: SiteConfig } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'صيغة بيانات الموقع غير صالحة.' };
  }
  const raw = input as Partial<SiteConfig>;

  const r = raw.restaurant || current.restaurant;
  const name = String(r.name || current.restaurant.name).trim().slice(0, 80);
  if (!name) return { ok: false, error: 'اسم المطعم مطلوب.' };

  const logoUrl = String(r.logoUrl ?? '').trim();
  if (logoUrl && !isSafeMediaUrl(logoUrl)) {
    return { ok: false, error: 'رابط أو صورة الشعار غير صالحة.' };
  }

  const t = raw.theme || current.theme;
  const theme = {
    canvas: sanitizeHexColor(t.canvas, current.theme.canvas),
    surface: sanitizeHexColor(t.surface, current.theme.surface),
    subtle: sanitizeHexColor(t.subtle, current.theme.subtle),
    textPrimary: sanitizeHexColor(t.textPrimary, current.theme.textPrimary),
    textSecondary: sanitizeHexColor(t.textSecondary, current.theme.textSecondary),
    textMuted: sanitizeHexColor(t.textMuted, current.theme.textMuted),
    accent: sanitizeHexColor(t.accent, current.theme.accent),
    accentSecondary: sanitizeHexColor(t.accentSecondary, current.theme.accentSecondary),
  };

  const sanitizeImage = (val: unknown, fallback: string) => {
    const str = String(val || '').trim();
    return str && isSafeMediaUrl(str) ? str : fallback;
  };

  const categories = Array.isArray(raw.categories)
    ? raw.categories
        .filter((c) => c && String(c.id || '').trim() && String(c.name || '').trim())
        .map((c) => ({
          id: String(c.id).trim().slice(0, 48),
          name: String(c.name).trim().slice(0, 60),
        }))
    : current.categories;

  const variants = Array.isArray(raw.variants)
    ? raw.variants
        .filter((v) => v && String(v.id || '').trim() && String(v.name || '').trim())
        .map((v) => ({
          id: String(v.id).trim().slice(0, 48),
          name: String(v.name).trim().slice(0, 80),
          priceDelta: Math.max(0, Number(Number(v.priceDelta || 0).toFixed(2))),
        }))
    : current.variants;

  const addons = Array.isArray(raw.addons)
    ? raw.addons
        .filter((a) => a && String(a.id || '').trim() && String(a.name || '').trim())
        .map((a) => ({
          id: String(a.id).trim().slice(0, 48),
          name: String(a.name).trim().slice(0, 80),
          price: Math.max(0, Number(Number(a.price || 0).toFixed(2))),
        }))
    : current.addons;

  const offers = Array.isArray(raw.offers)
    ? raw.offers
        .filter((o) => o && String(o.id || '').trim() && String(o.name || '').trim())
        .map((o) => ({
          id: String(o.id).trim().slice(0, 48),
          name: String(o.name).trim().slice(0, 90),
          description: String(o.description || '').trim().slice(0, 320),
          originalPrice: Math.max(0, Number(Number(o.originalPrice || 0).toFixed(2))),
          price: Math.max(0.05, Number(Number(o.price || 1).toFixed(2))),
          discountLabel: String(o.discountLabel || '').trim().slice(0, 40),
          image: sanitizeImage(o.image, '/images/zoldix-signature.jpg'),
          variantIds: Array.isArray(o.variantIds) ? o.variantIds.map(String) : [],
          addonIds: Array.isArray(o.addonIds) ? o.addonIds.map(String) : [],
        }))
    : current.offers;

  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((i) => i && String(i.id || '').trim() && String(i.name || '').trim())
        .map((i) => ({
          id: String(i.id).trim().slice(0, 48),
          categoryId: String(i.categoryId || categories[0]?.id || 'shawarma').trim().slice(0, 48),
          name: String(i.name).trim().slice(0, 90),
          description: String(i.description || '').trim().slice(0, 320),
          price: Math.max(0.05, Number(Number(i.price || 1).toFixed(2))),
          image: sanitizeImage(i.image, '/images/zoldix-signature.jpg'),
          variantIds: Array.isArray(i.variantIds) ? i.variantIds.map(String) : [],
          addonIds: Array.isArray(i.addonIds) ? i.addonIds.map(String) : [],
        }))
    : current.items;

  const heroChapters =
    Array.isArray(raw.heroChapters) && raw.heroChapters.length > 0
      ? raw.heroChapters.map((ch, idx) => ({
          id: String(ch.id || `ch-${idx + 1}`).trim().slice(0, 40),
          title: String(ch.title || '').trim().slice(0, 90),
          subtitle: String(ch.subtitle || '').trim().slice(0, 220),
          startFrame: Math.max(0, Math.min(99, Math.round(Number(ch.startFrame || 0)))),
          endFrame: Math.max(0, Math.min(99, Math.round(Number(ch.endFrame ?? 99)))),
          productId: String(ch.productId || items[0]?.id || '').trim().slice(0, 48),
        }))
      : current.heroChapters;

  const sanitizeLinkUrl = (val: unknown): string => {
    const str = String(val || '').trim().slice(0, 400);
    if (!str) return '';
    if (str.startsWith('#') || (str.startsWith('/') && !str.startsWith('//'))) return str;
    try {
      const u = new URL(str);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
    } catch {
      return '';
    }
  };

  const m = raw.midShowcase || current.midShowcase;
  const midShowcase = {
    eyebrow: String(m.eyebrow || current.midShowcase.eyebrow).trim().slice(0, 60),
    title: String(m.title || current.midShowcase.title).trim().slice(0, 120),
    subtitle: String(m.subtitle || current.midShowcase.subtitle).trim().slice(0, 240),
    productId: String(m.productId || current.midShowcase.productId || 'ds-kunafa').trim().slice(0, 48),
    primaryImage: sanitizeImage(m.primaryImage, current.midShowcase.primaryImage || '/images/zoldix-kunafa.jpg'),
    secondaryImage: sanitizeImage(
      m.secondaryImage,
      current.midShowcase.secondaryImage || '/images/mint-lemonade.webp'
    ),
  };

  const deliveryAreas = Array.isArray(raw.deliveryAreas)
    ? raw.deliveryAreas
        .filter((a) => a && String(a.name || '').trim())
        .map((a) => ({
          name: String(a.name).trim().slice(0, 60),
          lat: Number(a.lat || 31.9854),
          lng: Number(a.lng || 35.8752),
        }))
    : current.deliveryAreas;

  const quickNotes = Array.isArray(raw.quickNotes)
    ? raw.quickNotes.map((n) => String(n).trim().slice(0, 60)).filter(Boolean)
    : current.quickNotes;

  const customSections = Array.isArray(raw.customSections)
    ? raw.customSections
        .filter((sec) => sec && String(sec.id || '').trim() && String(sec.title || '').trim())
        .slice(0, 24)
        .map((sec) => ({
          id: String(sec.id).trim().slice(0, 48),
          eyebrow: String(sec.eyebrow || '').trim().slice(0, 60),
          title: String(sec.title).trim().slice(0, 140),
          description: String(sec.description || '').trim().slice(0, 600),
          image: sec.image && isSafeMediaUrl(sec.image) ? String(sec.image).trim() : '',
          ctaLabel: String(sec.ctaLabel || '').trim().slice(0, 60),
          ctaUrl: sanitizeLinkUrl(sec.ctaUrl),
          accentStyle:
            sec.accentStyle === 'gold' || sec.accentStyle === 'minimal' ? sec.accentStyle : ('warm' as const),
        }))
    : current.customSections || [];

  const nextConfig: SiteConfig = {
    restaurant: {
      name,
      shortName: String(r.shortName || name).trim().slice(0, 30),
      logoUrl,
      tagline: String(r.tagline || '').trim().slice(0, 140),
      heroSubtitle: String(r.heroSubtitle || '').trim().slice(0, 350),
      currency: String(r.currency || 'د.أ').trim().slice(0, 12),
      deliveryFee: Math.max(0, Number(Number(r.deliveryFee ?? 1.5).toFixed(2))),
      freeDeliveryThreshold:
        r.freeDeliveryThreshold === null ||
        r.freeDeliveryThreshold === undefined ||
        Number(r.freeDeliveryThreshold) <= 0
          ? null
          : Number(Number(r.freeDeliveryThreshold).toFixed(2)),
      phone: String(r.phone || '').trim().slice(0, 30),
      phoneDisplay: String(r.phoneDisplay || r.phone || '').trim().slice(0, 30),
      address: String(r.address || '').trim().slice(0, 180),
      hours: String(r.hours || '').trim().slice(0, 140),
      estimatedDeliveryMinutes: String(r.estimatedDeliveryMinutes || '').trim().slice(0, 80),
      about: String(r.about || '').trim().slice(0, 600),
      acceptingOrders: r.acceptingOrders !== false,
      pausedMessage: String(r.pausedMessage || current.restaurant.pausedMessage).trim().slice(0, 240),
      loyaltyPointsPerUnit: Math.max(0, Math.round(Number(r.loyaltyPointsPerUnit ?? 10))),
      loyaltyRedeemValue: Math.max(0, Number(Number(r.loyaltyRedeemValue ?? 0.02).toFixed(4))),
      heroPrimaryCtaLabel: String(r.heroPrimaryCtaLabel || '').trim().slice(0, 60),
      heroPrimaryCtaUrl: sanitizeLinkUrl(r.heroPrimaryCtaUrl),
      siteRedirectUrl: sanitizeLinkUrl(r.siteRedirectUrl),
    },
    theme,
    heroChapters,
    midShowcase,
    deliveryAreas,
    categories,
    variants,
    addons,
    quickNotes,
    offers,
    items,
    customSections,
  };

  return { ok: true, config: nextConfig };
}

// =========================================================================
// دوال التشفير وكلمات المرور والمشرفين المتعددين وأكواد التحقق
// =========================================================================

function hashWithSalt(value: string, saltHex?: string): string {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(value, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyScryptHash(value: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(value, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function verifyAdminPassword(candidate: string): boolean {
  const store = getStore();
  if (store.adminCredentialHash) {
    return verifyScryptHash(candidate, store.adminCredentialHash);
  }
  const envPass = process.env.ADMIN_PASSWORD || '';
  if (!envPass) return false;
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(envPass, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function updateAdminPassword(newPassword: string): void {
  const store = getStore();
  store.adminCredentialHash = hashWithSalt(newPassword);
  saveStore();
}

export function getEffectiveSmtpConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  orderTo: string;
  adminNotifyEmail: string;
} {
  const integ = getStore().integrations || {};
  const user = (integ.smtpUser || process.env.SMTP_USER || '').trim();
  const rawHost = (integ.smtpHost || process.env.SMTP_HOST || '').trim();
  const host = rawHost || (user.toLowerCase().endsWith('@gmail.com') ? 'smtp.gmail.com' : '');
  const port = Number(integ.smtpPort || process.env.SMTP_PORT || 465);
  const pass = (integ.smtpPass || process.env.SMTP_PASS || '').trim();
  const fromEmail = (process.env.SMTP_FROM || user).trim();
  const orderTo = (
    integ.orderTo ||
    process.env.ORDER_TO ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    user
  ).trim();
  const adminNotifyEmail = (
    integ.adminNotifyEmail ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    process.env.ORDER_TO ||
    ''
  )
    .trim()
    .toLowerCase();

  return { host, port, user, pass, fromEmail, orderTo, adminNotifyEmail };
}

export function hasConfiguredSmtp(): boolean {
  const cfg = getEffectiveSmtpConfig();
  return Boolean(cfg.host && cfg.user && cfg.pass);
}

export function getEffectiveStripeKeys(): {
  secretKey: string;
  publishableKey: string;
} {
  const integ = getStore().integrations || {};
  return {
    secretKey: (integ.stripeSecretKey || process.env.STRIPE_SECRET_KEY || '').trim(),
    publishableKey: (integ.stripePublishableKey || process.env.STRIPE_PUBLISHABLE_KEY || '').trim(),
  };
}

export function getAdminSecurityEmail(): string {
  return getEffectiveSmtpConfig().adminNotifyEmail;
}

export function isAuthorizedAdminEmail(email: string): boolean {
  const clean = email.trim().toLowerCase();
  if (!clean) return false;
  if (clean === getAdminSecurityEmail()) return true;
  return getStore().adminEmails.includes(clean);
}

export function getPrimaryDeveloperEmail(): string {
  return (
    process.env.DEVELOPER_PRIMARY_EMAIL ||
    getEffectiveSmtpConfig().adminNotifyEmail ||
    'pmaqkxbb@gmail.com'
  )
    .trim()
    .toLowerCase();
}

export function isAuthorizedDeveloperEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (!clean) return false;
  const primary = getPrimaryDeveloperEmail();
  if (primary && clean === primary) return true;
  return getStore().developerEmails.includes(clean);
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

interface SignedOtpPayload {
  v: 1;
  jti: string;
  purpose: OtpChallenge['purpose'];
  email: string;
  codeHash: string;
  exp: number;
  meta?: OtpChallenge['meta'];
}

interface SignedSessionPayload {
  v: 1;
  jti: string;
  role: 'customer' | 'admin';
  email: string;
  imp?: string | null;
  iat: number;
  exp: number;
}

function signTokenPayload<T>(payload: T, prefix: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`${prefix}.${body}`)
    .digest('base64url');
  return `${prefix}.${body}.${sig}`;
}

function verifySignedTokenPayload<T>(token: string, prefix: string): T | null {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== prefix) return null;
  const body = parts[1];
  const sig = parts[2];
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`${prefix}.${body}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function createOtpChallenge(
  purpose: OtpChallenge['purpose'],
  email: string,
  meta?: OtpChallenge['meta']
): { challengeKey: string; code: string } {
  const cleanEmail = email.trim().toLowerCase();
  const code = generateSixDigitOtp();
  const jti = crypto.randomBytes(12).toString('hex');
  const codeHash = hashWithSalt(`${purpose}:${cleanEmail}:${code}`);
  const exp = Date.now() + OTP_TTL_MS;

  const challengeKey = signTokenPayload<SignedOtpPayload>(
    {
      v: 1,
      jti,
      purpose,
      email: cleanEmail,
      codeHash,
      exp,
      meta,
    },
    'otp1'
  );

  otpChallenges.set(jti, {
    codeHash,
    purpose,
    email: cleanEmail,
    expiresAt: exp,
    attempts: 0,
    meta,
  });

  const now = Date.now();
  for (const [k, item] of otpChallenges.entries()) {
    if (item.expiresAt < now) otpChallenges.delete(k);
  }

  return { challengeKey, code };
}

export function verifyOtpChallenge(
  challengeKey: string,
  purpose: OtpChallenge['purpose'],
  email: string,
  code: string
): { ok: true; meta?: OtpChallenge['meta'] } | { ok: false; error: string } {
  const cleanEmail = email.trim().toLowerCase();
  let lookupKey = challengeKey;
  let challenge: OtpChallenge | undefined;

  if (challengeKey.startsWith('otp1.')) {
    const payload = verifySignedTokenPayload<SignedOtpPayload>(challengeKey, 'otp1');
    const persistedConsumed = Boolean(payload?.jti && getStore().consumedOtpJtis?.[payload.jti]);
    if (!payload || payload.v !== 1 || consumedOtpJtis.has(payload.jti) || persistedConsumed) {
      return { ok: false, error: 'رمز التحقق منتهي الصلاحية أو غير موجود، يرجى طلب رمز جديد.' };
    }
    lookupKey = payload.jti;
    challenge = otpChallenges.get(lookupKey) || {
      codeHash: payload.codeHash,
      purpose: payload.purpose,
      email: payload.email,
      expiresAt: payload.exp,
      attempts: 0,
      meta: payload.meta,
    };
    otpChallenges.set(lookupKey, challenge);
  } else {
    challenge = otpChallenges.get(challengeKey);
  }

  if (!challenge) {
    return { ok: false, error: 'رمز التحقق منتهي الصلاحية أو غير موجود، يرجى طلب رمز جديد.' };
  }
  if (Date.now() > challenge.expiresAt) {
    otpChallenges.delete(lookupKey);
    return { ok: false, error: 'انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد.' };
  }
  if (challenge.purpose !== purpose || challenge.email !== cleanEmail) {
    return { ok: false, error: 'بيانات التحقق غير متطابقة.' };
  }
  challenge.attempts += 1;
  if (challenge.attempts > 5) {
    otpChallenges.delete(lookupKey);
    consumedOtpJtis.add(lookupKey);
    const store = getStore();
    store.consumedOtpJtis = { ...(store.consumedOtpJtis || {}), [lookupKey]: challenge.expiresAt };
    saveStore();
    return { ok: false, error: 'تم تجاوز عدد المحاولات المسموحة، يرجى طلب رمز جديد.' };
  }
  const valid = verifyScryptHash(`${purpose}:${cleanEmail}:${code.trim()}`, challenge.codeHash);
  if (!valid) {
    return { ok: false, error: 'رمز التحقق غير صحيح، يرجى التأكد من البريد الإلكتروني.' };
  }
  const meta = challenge.meta;
  const expTs = challenge.expiresAt;
  otpChallenges.delete(lookupKey);
  consumedOtpJtis.add(lookupKey);
  if (consumedOtpJtis.size > 5000) consumedOtpJtis.clear();
  const store = getStore();
  store.consumedOtpJtis = { ...(store.consumedOtpJtis || {}), [lookupKey]: expTs };
  saveStore();
  return { ok: true, meta };
}

// =========================================================================
// الجلسات وحسابات العملاء والمفضلة والنقاط
// =========================================================================

export function createSession(
  role: 'customer' | 'admin',
  email: string,
  impersonatingEmail: string | null = null
): SessionRecord {
  const now = Date.now();
  const cleanEmail = email.trim().toLowerCase();
  const cleanImp = impersonatingEmail ? impersonatingEmail.trim().toLowerCase() : null;
  const expiresAt = now + SESSION_TTL_MS;
  const token = signTokenPayload<SignedSessionPayload>(
    {
      v: 1,
      jti: crypto.randomBytes(12).toString('hex'),
      role,
      email: cleanEmail,
      imp: cleanImp,
      iat: now,
      exp: expiresAt,
    },
    'v1'
  );
  const record: SessionRecord = {
    token,
    role,
    email: cleanEmail,
    impersonatingEmail: cleanImp,
    createdAt: now,
    expiresAt,
  };
  sessions.set(token, record);
  return record;
}

export function setSessionImpersonation(
  token: string,
  impersonatingEmail: string | null
): SessionRecord | null {
  const existing = getSession(token);
  if (!existing || existing.role !== 'admin') return null;
  const cleanImp = impersonatingEmail ? impersonatingEmail.trim().toLowerCase() : null;
  const inMem = sessions.get(token);
  if (inMem) {
    inMem.impersonatingEmail = cleanImp;
  }
  const refreshedToken = signTokenPayload<SignedSessionPayload>(
    {
      v: 1,
      jti: crypto.randomBytes(12).toString('hex'),
      role: 'admin',
      email: existing.email,
      imp: cleanImp,
      iat: existing.createdAt,
      exp: existing.expiresAt,
    },
    'v1'
  );
  const updatedRecord: SessionRecord = {
    ...existing,
    token: refreshedToken,
    impersonatingEmail: cleanImp,
  };
  sessions.set(refreshedToken, updatedRecord);
  return updatedRecord;
}

export function getSession(token: string | undefined | null): SessionRecord | null {
  if (!token || revokedTokens.has(token)) return null;

  let session = sessions.get(token) || null;
  let tokenJti: string | null = null;
  if (token.startsWith('v1.')) {
    const payload = verifySignedTokenPayload<SignedSessionPayload>(token, 'v1');
    if (payload && payload.v === 1 && payload.email && (payload.role === 'customer' || payload.role === 'admin')) {
      tokenJti = payload.jti || null;
      if (!session) {
        session = {
          token,
          role: payload.role,
          email: payload.email.trim().toLowerCase(),
          impersonatingEmail: payload.imp ? payload.imp.trim().toLowerCase() : null,
          createdAt: payload.iat,
          expiresAt: payload.exp,
        };
      }
    }
  }

  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  const store = getStore();
  if (tokenJti && store.revokedSessionJtis?.[tokenJti]) {
    sessions.delete(token);
    return null;
  }

  const revokedBefore = Math.max(
    revokedBeforeByEmail.get(session.email) || 0,
    store.revokedBeforeByEmail?.[session.email] || 0
  );
  if (revokedBefore && session.createdAt < revokedBefore) {
    sessions.delete(token);
    return null;
  }

  if (session.role === 'customer') {
    const account = store.users[session.email];
    if (!account || account.disabled) {
      sessions.delete(token);
      return null;
    }
  } else if (session.role === 'admin' && !isAuthorizedAdminEmail(session.email)) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function revokeSession(token: string): void {
  sessions.delete(token);
  if (token) {
    revokedTokens.add(token);
    if (revokedTokens.size > 5000) revokedTokens.clear();
    if (token.startsWith('v1.')) {
      const payload = verifySignedTokenPayload<SignedSessionPayload>(token, 'v1');
      if (payload?.jti) {
        const store = getStore();
        store.revokedSessionJtis = {
          ...(store.revokedSessionJtis || {}),
          [payload.jti]: payload.exp || Date.now() + SESSION_TTL_MS,
        };
        saveStore();
      }
    }
  }
}

export function revokeAllSessionsForEmail(email: string): void {
  const target = email.trim().toLowerCase();
  const cutoff = Date.now() + 1;
  revokedBeforeByEmail.set(target, cutoff);
  const store = getStore();
  store.revokedBeforeByEmail = { ...(store.revokedBeforeByEmail || {}), [target]: cutoff };
  saveStore();
  for (const [token, sess] of sessions.entries()) {
    if (sess.email === target) {
      sessions.delete(token);
      revokedTokens.add(token);
    }
    if (sess.role === 'admin' && sess.impersonatingEmail === target) {
      sess.impersonatingEmail = null;
    }
  }
}

export function hashCustomerPassword(password: string): string {
  return hashWithSalt(password);
}

export function verifyCustomerPassword(email: string, candidate: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  const user = getStore().users[cleanEmail];
  if (!user || !user.passwordHash) return false;
  return verifyScryptHash(candidate, user.passwordHash);
}

export function isUsernameTaken(username: string, excludeEmail?: string): boolean {
  const clean = normalizeUsername(username);
  if (!clean) return false;
  const exclude = excludeEmail ? excludeEmail.trim().toLowerCase() : '';
  const store = getStore();
  return Object.values(store.users).some(
    (u) => u.email.toLowerCase() !== exclude && (u.username || '').toLowerCase() === clean
  );
}

export function findUserByIdentifier(identifier: string): StoredCustomerAccount | null {
  const raw = String(identifier || '').trim().toLowerCase();
  if (!raw) return null;
  const store = getStore();
  if (raw.includes('@') && !raw.startsWith('@')) {
    return store.users[raw] || null;
  }
  const cleanUsername = normalizeUsername(raw);
  if (!cleanUsername) return null;
  return (
    Object.values(store.users).find((u) => (u.username || '').toLowerCase() === cleanUsername) ||
    null
  );
}

export function searchUsersPublic(
  query: string,
  excludeEmail?: string
): Array<{ username: string; name: string; avatar: string; bio: string; exactMatch: boolean }> {
  const cleanQ = String(query || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  const exclude = excludeEmail ? excludeEmail.trim().toLowerCase() : '';
  const store = getStore();
  const activeUsers = Object.values(store.users).filter(
    (u) => !u.disabled && u.email.toLowerCase() !== exclude && Boolean(u.username)
  );
  const filtered = cleanQ
    ? activeUsers.filter(
        (u) =>
          (u.username || '').toLowerCase().includes(cleanQ) ||
          u.name.toLowerCase().includes(cleanQ)
      )
    : activeUsers;

  const score = (u: StoredCustomerAccount): number => {
    if (!cleanQ) return 0;
    const uname = (u.username || '').toLowerCase();
    const nm = u.name.toLowerCase();
    if (uname === cleanQ) return 0;
    if (uname.startsWith(cleanQ)) return 1;
    if (nm.startsWith(cleanQ)) return 2;
    if (uname.includes(cleanQ)) return 3;
    return 4;
  };

  const sorted = [...filtered].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return (a.username || '').localeCompare(b.username || '');
  });

  return sorted.slice(0, 40).map((u) => ({
    username: u.username!,
    name: u.name,
    avatar: normalizeAvatarValue(u.avatar),
    bio: u.bio || '',
    exactMatch: Boolean(cleanQ && (u.username || '').toLowerCase() === cleanQ),
  }));
}

export function registerOrUpdateCustomerWithPassword(
  email: string,
  name: string,
  passwordHash: string,
  desiredUsername?: string
): StoredCustomerAccount {
  const cleanEmail = email.trim().toLowerCase();
  const store = getStore();
  let user = store.users[cleanEmail];
  const nowIso = new Date().toISOString();
  const taken = new Set(
    Object.values(store.users)
      .filter((u) => u.email.toLowerCase() !== cleanEmail && u.username)
      .map((u) => (u.username || '').toLowerCase())
  );
  const cleanDesired = normalizeUsername(desiredUsername);
  const assignedUsername =
    cleanDesired && !taken.has(cleanDesired)
      ? cleanDesired
      : user?.username && !taken.has(user.username.toLowerCase())
        ? user.username
        : buildFallbackUsername(cleanEmail, taken);

  if (!user) {
    user = {
      email: cleanEmail,
      username: assignedUsername,
      avatar: 'preset:crown',
      bio: '',
      name: name.trim().slice(0, 80) || cleanEmail.split('@')[0] || 'عميل zoldix',
      phone: '',
      area: '',
      address: '',
      disabled: false,
      hasPassword: true,
      passwordHash,
      createdAt: nowIso,
      lastLoginAt: nowIso,
      cart: [],
      favorites: [],
      loyaltyPoints: 0,
      orders: [],
      lastOrder: null,
    };
    store.users[cleanEmail] = user;
  } else {
    if (name.trim()) user.name = name.trim().slice(0, 80);
    user.username = assignedUsername;
    if (!user.avatar) user.avatar = 'preset:crown';
    user.passwordHash = passwordHash;
    user.hasPassword = true;
    user.lastLoginAt = nowIso;
  }
  saveStore();
  return user;
}

export function getOrCreateCustomerAccount(email: string): StoredCustomerAccount {
  const cleanEmail = email.trim().toLowerCase();
  const store = getStore();
  let user = store.users[cleanEmail];
  const nowIso = new Date().toISOString();
  if (!user) {
    const taken = new Set(
      Object.values(store.users)
        .filter((u) => u.username)
        .map((u) => (u.username || '').toLowerCase())
    );
    user = {
      email: cleanEmail,
      username: buildFallbackUsername(cleanEmail, taken),
      avatar: 'preset:crown',
      bio: '',
      name: cleanEmail.split('@')[0] || 'عميل zoldix',
      phone: '',
      area: '',
      address: '',
      disabled: false,
      hasPassword: false,
      passwordHash: null,
      createdAt: nowIso,
      lastLoginAt: nowIso,
      cart: [],
      favorites: [],
      loyaltyPoints: 0,
      orders: [],
      lastOrder: null,
    };
    store.users[cleanEmail] = user;
  } else {
    if (!user.username) {
      const taken = new Set(
        Object.values(store.users)
          .filter((u) => u.email.toLowerCase() !== cleanEmail && u.username)
          .map((u) => (u.username || '').toLowerCase())
      );
      user.username = buildFallbackUsername(cleanEmail, taken);
    }
    if (!user.avatar) user.avatar = 'preset:crown';
    user.lastLoginAt = nowIso;
  }
  saveStore();
  return user;
}

export function updateCustomerCart(email: string, cart: CartEntry[]): CustomerAccount | null {
  const cleanEmail = email.trim().toLowerCase();
  const store = getStore();
  const user = store.users[cleanEmail];
  if (!user) return null;
  user.cart = Array.isArray(cart) ? cart.slice(0, 60) : [];
  saveStore();
  return user;
}

export function updateCustomerFavorites(
  email: string,
  favorites: string[]
): CustomerAccount | null {
  const cleanEmail = email.trim().toLowerCase();
  const store = getStore();
  const user = store.users[cleanEmail];
  if (!user) return null;
  user.favorites = [...new Set(favorites.map(String))].slice(0, 100);
  saveStore();
  return user;
}

export function updateCustomerProfile(
  email: string,
  profile: {
    name?: string;
    username?: string;
    avatar?: string;
    bio?: string;
    phone?: string;
    area?: string;
    address?: string;
  }
): { ok: true; user: StoredCustomerAccount } | { ok: false; error: string } {
  const cleanEmail = email.trim().toLowerCase();
  const store = getStore();
  const user = store.users[cleanEmail];
  if (!user) return { ok: false, error: 'الحساب غير موجود.' };

  if (typeof profile.username === 'string' && profile.username.trim()) {
    const cleanUsername = normalizeUsername(profile.username);
    if (!cleanUsername) {
      return {
        ok: false,
        error: 'اسم المستخدم يجب أن يتكون من 3 إلى 24 حرفاً إنجليزياً صغيراً أو أرقاماً أو (_) أو (.) فقط.',
      };
    }
    if (isUsernameTaken(cleanUsername, cleanEmail)) {
      return {
        ok: false,
        error: 'هذا اليوزر مستخدم لشخص آخر بالفعل، لا يمكنك تغييره إلى نفس اليوزر.',
      };
    }
    user.username = cleanUsername;
    for (const thread of Object.values(store.chats)) {
      if (thread.threadType === 'dm' && thread.participants?.includes(cleanEmail)) {
        thread.participantUsernames = {
          ...(thread.participantUsernames || {}),
          [cleanEmail]: cleanUsername,
        };
      }
    }
  }

  if (typeof profile.avatar === 'string' && profile.avatar.trim()) {
    const safeAvatar = normalizeAvatarValue(profile.avatar);
    user.avatar = safeAvatar;
    for (const thread of Object.values(store.chats)) {
      if (thread.threadType === 'dm' && thread.participants?.includes(cleanEmail)) {
        thread.participantAvatars = {
          ...(thread.participantAvatars || {}),
          [cleanEmail]: safeAvatar,
        };
      }
    }
  }

  if (typeof profile.bio === 'string') {
    user.bio = profile.bio.trim().slice(0, 160);
  }

  if (typeof profile.name === 'string' && profile.name.trim()) {
    user.name = profile.name.trim().slice(0, 80);
    for (const thread of Object.values(store.chats)) {
      if (thread.threadType === 'dm' && thread.participants?.includes(cleanEmail)) {
        thread.participantNames = {
          ...(thread.participantNames || {}),
          [cleanEmail]: user.name,
        };
      }
    }
  }
  if (typeof profile.phone === 'string') {
    user.phone = profile.phone.trim().slice(0, 24);
  }
  if (typeof profile.area === 'string') {
    user.area = profile.area.trim().slice(0, 80);
  }
  if (typeof profile.address === 'string') {
    user.address = profile.address.trim().slice(0, 240);
  }
  saveStore();
  return { ok: true, user };
}

// =========================================================================
// الكوبونات (حد أقصى + تاريخ انتهاء)
// =========================================================================

export function validateCouponForOrder(
  rawCode: string,
  subtotal: number,
  deliveryFee: number
):
  | { ok: true; coupon: Coupon; discountAmount: number; waivesDelivery: boolean }
  | { ok: false; error: string } {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: 'يرجى إدخال كود الخصم.' };

  const store = getStore();
  const coupon = Object.values(store.coupons).find((c) => c.code.toUpperCase() === code);
  if (!coupon || !coupon.active) {
    return { ok: false, error: 'كود الخصم غير موجود أو غير مفعل حالياً.' };
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now()) {
    return { ok: false, error: 'انتهت صلاحية كود الخصم هذا.' };
  }

  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: 'وصل كود الخصم إلى الحد الأقصى لعدد الاستخدامات.' };
  }

  if (coupon.minOrder > 0 && subtotal < coupon.minOrder) {
    return {
      ok: false,
      error: `الحد الأدنى للطلب لاستخدام هذا الكود هو ${coupon.minOrder.toFixed(2)}.`,
    };
  }

  let discountAmount = 0;
  let waivesDelivery = false;

  if (coupon.discountType === 'percent') {
    discountAmount = Number(((subtotal * Math.min(100, coupon.value)) / 100).toFixed(2));
  } else if (coupon.discountType === 'fixed') {
    discountAmount = Number(Math.min(subtotal, coupon.value).toFixed(2));
  } else if (coupon.discountType === 'free_delivery') {
    waivesDelivery = true;
    discountAmount = deliveryFee;
  }

  return { ok: true, coupon, discountAmount, waivesDelivery };
}

export function incrementCouponUsage(couponId: string): void {
  const store = getStore();
  const coupon = store.coupons[couponId];
  if (!coupon) return;
  coupon.usedCount += 1;
  saveStore();
}

// =========================================================================
// السائقين وتحديث حالة الطلب المباشر
// =========================================================================

export function findDriverByEmail(email: string | undefined | null): Driver | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  return (
    Object.values(getStore().drivers).find((d) => d.email.trim().toLowerCase() === clean) ||
    null
  );
}

export function recordOrderInStore(
  receipt: SubmittedOrderReceipt,
  customerEmail?: string | null
): void {
  const store = getStore();
  store.orders.unshift(receipt);
  if (store.orders.length > 500) {
    store.orders.length = 500;
  }
  if (customerEmail) {
    const cleanEmail = customerEmail.trim().toLowerCase();
    const user = store.users[cleanEmail];
    if (user) {
      if (receipt.name && (!user.name || user.name === cleanEmail.split('@')[0])) {
        user.name = receipt.name;
      }
      if (receipt.phone) user.phone = receipt.phone;
      if (receipt.area) user.area = receipt.area;
      if (receipt.address) user.address = receipt.address;
      user.loyaltyPoints = Math.max(
        0,
        user.loyaltyPoints - receipt.loyaltyPointsUsed + receipt.loyaltyPointsEarned
      );
      user.orders.unshift(receipt);
      if (user.orders.length > 100) user.orders.length = 100;
      user.lastOrder = receipt;
      user.cart = [];
    }
  }
  saveStore();
}

export function updateOrderStatusAndDriver(
  orderId: string,
  status: OrderStatus,
  driverId?: string | null
): SubmittedOrderReceipt | null {
  const store = getStore();
  const order = store.orders.find((o) => o.orderId === orderId);
  if (!order) return null;

  order.status = status;
  if (driverId !== undefined) {
    if (!driverId) {
      order.driverId = undefined;
      order.driverName = undefined;
      order.driverPhone = undefined;
    } else {
      const driver = store.drivers[driverId];
      if (driver) {
        order.driverId = driver.id;
        order.driverName = driver.name;
        order.driverPhone = driver.phone;
      }
    }
  }

  if (order.customerEmail) {
    const user = store.users[order.customerEmail.toLowerCase()];
    if (user) {
      const userOrder = user.orders.find((o) => o.orderId === orderId);
      if (userOrder) {
        userOrder.status = order.status;
        userOrder.driverId = order.driverId;
        userOrder.driverName = order.driverName;
        userOrder.driverPhone = order.driverPhone;
      }
      if (user.lastOrder && user.lastOrder.orderId === orderId) {
        user.lastOrder = { ...order };
      }
    }
  }

  saveStore();
  return order;
}

// =========================================================================
// المحادثة المباشرة (المطعم + السائقون + المحادثات الخاصة ولعبة X/O المباشرة)
// =========================================================================

export function buildDmThreadId(emailA: string, emailB: string): string {
  const [a, b] = [emailA.trim().toLowerCase(), emailB.trim().toLowerCase()].sort();
  return `dm:${Buffer.from(a, 'utf8').toString('base64url')}_${Buffer.from(b, 'utf8').toString('base64url')}`;
}

export function getOrCreateDmThread(emailA: string, emailB: string): ChatThread {
  const store = getStore();
  const a = emailA.trim().toLowerCase();
  const b = emailB.trim().toLowerCase();
  const threadId = buildDmThreadId(a, b);
  const userA = store.users[a];
  const userB = store.users[b];
  const participantNames: Record<string, string> = {
    [a]: userA?.name || a.split('@')[0],
    [b]: userB?.name || b.split('@')[0],
  };
  const participantUsernames: Record<string, string> = {
    [a]: userA?.username || a.split('@')[0],
    [b]: userB?.username || b.split('@')[0],
  };
  const participantAvatars: Record<string, string> = {
    [a]: normalizeAvatarValue(userA?.avatar),
    [b]: normalizeAvatarValue(userB?.avatar),
  };

  let thread = store.chats[threadId];
  if (!thread) {
    thread = {
      threadId,
      threadType: 'dm',
      customerName: `${participantNames[a]} و ${participantNames[b]}`,
      participants: [a, b].sort(),
      participantNames,
      participantUsernames,
      participantAvatars,
      unreadByUser: { [a]: 0, [b]: 0 },
      updatedAt: new Date().toISOString(),
      unreadByAdmin: 0,
      unreadByCustomer: 0,
      messages: [],
      game: null,
    };
    store.chats[threadId] = thread;
    saveStore();
  } else {
    thread.participantNames = participantNames;
    thread.participantUsernames = participantUsernames;
    thread.participantAvatars = participantAvatars;
    saveStore();
  }
  return thread;
}

export function listUserDmThreads(email: string): ChatThread[] {
  const clean = email.trim().toLowerCase();
  const store = getStore();
  return Object.values(store.chats)
    .filter((t) => t.threadType === 'dm' && t.participants?.includes(clean))
    .map((t) => {
      const nextAvatars: Record<string, string> = { ...(t.participantAvatars || {}) };
      for (const p of t.participants || []) {
        const u = store.users[p];
        if (u) nextAvatars[p] = normalizeAvatarValue(u.avatar);
      }
      t.participantAvatars = nextAvatars;
      return t;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getOrCreateChatThread(
  threadId: string,
  customerName?: string,
  customerEmail?: string,
  threadType: 'customer' | 'driver' | 'dm' = 'customer'
): ChatThread {
  const store = getStore();
  const cleanId = threadId.trim().slice(0, 180);
  let thread = store.chats[cleanId];
  if (!thread) {
    thread = {
      threadId: cleanId,
      threadType,
      customerEmail: customerEmail || undefined,
      customerName: (customerName || customerEmail?.split('@')[0] || 'عميل جديد').slice(0, 80),
      updatedAt: new Date().toISOString(),
      unreadByAdmin: 0,
      unreadByCustomer: 0,
      messages: [],
      game: null,
    };
    store.chats[cleanId] = thread;
    saveStore();
  } else {
    if (customerEmail && !thread.customerEmail) {
      thread.customerEmail = customerEmail;
    }
    if (customerName && thread.customerName !== customerName && thread.threadType !== 'dm') {
      thread.customerName = customerName.slice(0, 80);
    }
    if (!thread.threadType) {
      thread.threadType = threadType;
    }
    saveStore();
  }
  return thread;
}

export function appendChatMessage(
  threadId: string,
  senderRole: 'customer' | 'admin' | 'driver',
  senderLabel: string,
  text: string,
  customerEmail?: string,
  senderEmail?: string
): { thread: ChatThread; message: ChatMessage } {
  const threadType: 'customer' | 'driver' | 'dm' = threadId.startsWith('driver:')
    ? 'driver'
    : threadId.startsWith('dm:')
      ? 'dm'
      : 'customer';
  const thread = getOrCreateChatThread(
    threadId,
    senderRole === 'admin' ? undefined : senderLabel,
    customerEmail,
    threadType
  );
  const message: ChatMessage = {
    id: `msg_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
    threadId: thread.threadId,
    senderRole,
    senderEmail: senderEmail ? senderEmail.trim().toLowerCase() : undefined,
    senderLabel: senderLabel.slice(0, 60),
    text: text.trim().slice(0, 1200),
    createdAt: new Date().toISOString(),
  };
  thread.messages.push(message);
  if (thread.messages.length > 200) {
    thread.messages = thread.messages.slice(-200);
  }
  thread.updatedAt = message.createdAt;
  if (thread.threadType === 'dm' && thread.participants && senderEmail) {
    const cleanSender = senderEmail.trim().toLowerCase();
    const unreadMap = { ...(thread.unreadByUser || {}) };
    for (const participant of thread.participants) {
      if (participant !== cleanSender) {
        unreadMap[participant] = (unreadMap[participant] || 0) + 1;
      }
    }
    thread.unreadByUser = unreadMap;
  } else if (senderRole === 'customer' || senderRole === 'driver') {
    thread.unreadByAdmin += 1;
    thread.customerName = senderLabel.slice(0, 80);
  } else {
    thread.unreadByCustomer += 1;
  }
  saveStore();
  return { thread, message };
}

export function markThreadRead(
  threadId: string,
  readerRole: 'customer' | 'admin',
  readerEmail?: string
): ChatThread | null {
  const store = getStore();
  const thread = store.chats[threadId];
  if (!thread) return null;
  if (thread.threadType === 'dm' && readerEmail) {
    const clean = readerEmail.trim().toLowerCase();
    thread.unreadByUser = { ...(thread.unreadByUser || {}), [clean]: 0 };
  } else if (readerRole === 'admin') {
    thread.unreadByAdmin = 0;
  } else {
    thread.unreadByCustomer = 0;
  }
  saveStore();
  return thread;
}

const WIN_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function startChatGame(
  threadId: string,
  playerX: { id: string; label: string },
  playerO: { id: string; label: string }
): ChatThread {
  const store = getStore();
  const thread = store.chats[threadId] || getOrCreateChatThread(threadId);
  const prev = thread.game;
  const samePair =
    prev &&
    ((prev.playerX.id === playerX.id && prev.playerO.id === playerO.id) ||
      (prev.playerX.id === playerO.id && prev.playerO.id === playerX.id));

  const nextGame: TicTacToeGameState = {
    gameId: `xo_${Date.now().toString(36)}`,
    board: Array(9).fill(null) as Array<'X' | 'O' | null>,
    playerX,
    playerO,
    turn: 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
    xWins: samePair ? prev.xWins : 0,
    oWins: samePair ? prev.oWins : 0,
    draws: samePair ? prev.draws : 0,
    updatedAt: new Date().toISOString(),
  };

  thread.game = nextGame;
  thread.updatedAt = nextGame.updatedAt;
  saveStore();
  return thread;
}

export function playChatGameMove(
  threadId: string,
  callerId: string,
  cellIndex: number
): { ok: true; thread: ChatThread } | { ok: false; error: string } {
  const store = getStore();
  const thread = store.chats[threadId];
  if (!thread || !thread.game) {
    return { ok: false, error: 'لا توجد جولة نشطة حالياً، اضغط بدء لعبة جديدة.' };
  }
  const game = thread.game;
  if (game.status !== 'playing') {
    return { ok: false, error: 'انتهت هذه الجولة، اضغط جولة جديدة للمتابعة.' };
  }
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) {
    return { ok: false, error: 'الخانة المحددة غير صالحة.' };
  }
  const expectedPlayerId = game.turn === 'X' ? game.playerX.id : game.playerO.id;
  if (callerId !== expectedPlayerId) {
    return { ok: false, error: 'ليس دورك الآن، بانتظار حركة الطرف الآخر.' };
  }
  if (game.board[cellIndex] !== null) {
    return { ok: false, error: 'هذه الخانة ممتلئة بالفعل.' };
  }

  const nextBoard = [...game.board];
  nextBoard[cellIndex] = game.turn;
  let status: TicTacToeGameState['status'] = 'playing';
  let winner: 'X' | 'O' | null = null;
  let winningLine: number[] | null = null;
  let xWins = game.xWins;
  let oWins = game.oWins;
  let draws = game.draws;

  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (nextBoard[a] && nextBoard[a] === nextBoard[b] && nextBoard[a] === nextBoard[c]) {
      status = 'won';
      winner = nextBoard[a];
      winningLine = line;
      if (winner === 'X') xWins += 1;
      else oWins += 1;
      break;
    }
  }

  if (status === 'playing' && nextBoard.every((cell) => cell !== null)) {
    status = 'draw';
    draws += 1;
  }

  const nextTurn: 'X' | 'O' = game.turn === 'X' ? 'O' : 'X';
  const nowIso = new Date().toISOString();
  thread.game = {
    ...game,
    board: nextBoard,
    turn: status === 'playing' ? nextTurn : game.turn,
    status,
    winner,
    winningLine,
    xWins,
    oWins,
    draws,
    updatedAt: nowIso,
  };
  thread.updatedAt = nowIso;
  saveStore();
  return { ok: true, thread };
}
