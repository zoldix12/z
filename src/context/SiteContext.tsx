/**
 * سياق الموقع الموحد:
 * - يجلب الإعدادات الحية من الخادم ويحدّث الألوان والمحتوى لجميع الزوار فوراً عبر WebSocket.
 * - يدير جلسة العميل والـ Driver والمشرفين المتعددين، وتصفح الإدارة المباشر.
 * - يدير المفضلة، وتتبع حالة الطلب المباشر، والتنبيه الصوتي والمرئي للإدارة، ووضع التعديل المباشر.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SEED_SITE_CONFIG } from '../config/restaurant';
import type {
  AuthState,
  ChatMessage,
  ChatThread,
  CustomerAccount,
  Driver,
  SiteConfig,
  SiteTheme,
  SubmittedOrderReceipt,
  TicTacToeGameState,
} from '../types/menu';

type WsListener = (event: {
  type: string;
  threadId?: string;
  message?: ChatMessage;
  thread?: ChatThread;
  game?: TicTacToeGameState | null;
  order?: unknown;
}) => void;

export function getApiBaseUrl(): string {
  try {
    const envUrl =
      (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || '';
    const savedUrl =
      typeof window !== 'undefined' ? window.localStorage.getItem('zoldix_api_base') || '' : '';
    return (envUrl || savedUrl).trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function resolveApiUrl(url: string): string {
  if (!url.startsWith('/api')) return url;
  const base = getApiBaseUrl();
  return base ? `${base}${url}` : url;
}

export async function readApiJson<T>(res: Response): Promise<T> {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    const bodyText = await res.text().catch(() => '');
    const looksLikeHtml =
      ct.includes('text/html') || bodyText.trimStart().toLowerCase().startsWith('<!doctype');
    if (looksLikeHtml || res.status === 404) {
      throw new Error(
        'الخادم الخلفي (/api) غير متاح على هذه الاستضافة؛ تأكد من رفع المشروع كاملاً مع ملفات vercel.json و api/index.ts (على Vercel) أو netlify.toml (على Netlify) أو تشغيل الخادم عبر npm start.'
      );
    }
    throw new Error('استجابة غير متوقعة من الخادم، يرجى المحاولة مجدداً.');
  }
  return (await res.json()) as T;
}

interface SiteContextValue {
  siteConfig: SiteConfig;
  setSiteConfig: React.Dispatch<React.SetStateAction<SiteConfig>>;
  refreshSiteConfig: () => Promise<void>;
  auth: AuthState;
  authLoading: boolean;
  setCustomerSession: (
    token: string,
    user: CustomerAccount,
    driverProfile?: Driver | null,
    developerMeta?: { isDeveloper?: boolean; isPrimaryDeveloper?: boolean }
  ) => void;
  setAdminSession: (
    token: string,
    adminEmail?: string | null,
    developerMeta?: { isDeveloper?: boolean; isPrimaryDeveloper?: boolean }
  ) => void;
  setDeveloperMode: (enabled: boolean) => void;
  updateUserState: (user: CustomerAccount | null) => void;
  impersonateUser: (email: string | null) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  wsConnected: boolean;
  subscribeWs: (listener: WsListener) => () => void;
  sendWsPayload: (payload: Record<string, unknown>) => void;
  disabledNotice: string | null;
  clearDisabledNotice: () => void;

  // المفضلة
  favorites: string[];
  toggleFavorite: (productId: string) => void;

  // تتبع الطلب المباشر
  activeTrackedOrder: SubmittedOrderReceipt | null;
  setTrackedOrder: (order: SubmittedOrderReceipt | null) => void;

  // مساحة عمل الإدارة والتعديل المباشر والريستارت
  isEditMode: boolean;
  setIsEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  draftConfig: SiteConfig;
  setDraftConfig: React.Dispatch<React.SetStateAction<SiteConfig>>;
  hasUnsavedDraft: boolean;
  savingGlobal: boolean;
  saveDraftConfigGlobal: () => Promise<{ ok: boolean; error?: string }>;
  resetSiteToFactory: () => Promise<{ ok: boolean; error?: string }>;
  adminAlertCount: number;
  clearAdminAlerts: () => void;
  soundMuted: boolean;
  setSoundMuted: React.Dispatch<React.SetStateAction<boolean>>;
}

const SiteContext = createContext<SiteContextValue | null>(null);

const GUEST_FAVORITES_KEY = 'zoldix_favorites_v1';
const TRACKED_ORDER_KEY = 'zoldix_tracked_order_v1';

function playAdminChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.setValueAtTime(880, now + 0.11); // A5
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.14, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.38);
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 500);
  } catch {
    // تجاهل تقييد التشغيل التلقائي للصوت قبل تفاعل المستخدم
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function hexToRgba(hex: string, alpha: number, fallback: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function darkenHex(hex: string, ratio = 0.14): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.max(0, Math.round(rgb.r * (1 - ratio)));
  const g = Math.max(0, Math.round(rgb.g * (1 - ratio)));
  const b = Math.max(0, Math.round(rgb.b * (1 - ratio)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function applyThemeToDocument(theme: SiteTheme, brandName: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  root.setProperty('--bg-canvas', theme.canvas);
  root.setProperty('--bg-surface', theme.surface);
  root.setProperty('--bg-subtle', theme.subtle);
  root.setProperty('--bg-header', hexToRgba(theme.canvas, 0.88, 'rgba(19, 16, 14, 0.88)'));
  root.setProperty('--bg-bottom-bar', hexToRgba(theme.surface, 0.96, 'rgba(27, 22, 19, 0.96)'));

  root.setProperty('--text-primary', theme.textPrimary);
  root.setProperty('--text-secondary', theme.textSecondary);
  root.setProperty('--text-muted', theme.textMuted);

  root.setProperty('--border-hairline', hexToRgba(theme.textPrimary, 0.1, 'rgba(239, 231, 220, 0.10)'));
  root.setProperty('--border-strong', hexToRgba(theme.textPrimary, 0.22, 'rgba(239, 231, 220, 0.22)'));

  root.setProperty('--accent-fire', theme.accent);
  root.setProperty('--accent-fire-hover', darkenHex(theme.accent, 0.12));
  root.setProperty('--accent-fire-soft', hexToRgba(theme.accent, 0.16, 'rgba(201, 106, 59, 0.16)'));

  root.setProperty('--accent-gold', theme.accentSecondary);
  root.setProperty('--accent-gold-soft', hexToRgba(theme.accentSecondary, 0.15, 'rgba(221, 161, 94, 0.15)'));

  document.title = `${brandName} للطلبات وتجربة الشواء`;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', theme.canvas);
  }
}

export const SiteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [siteConfig, setSiteConfig] = useState<SiteConfig>(SEED_SITE_CONFIG);
  const [draftConfig, setDraftConfig] = useState<SiteConfig>(SEED_SITE_CONFIG);
  const [isEditMode, setIsEditMode] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);

  const [auth, setAuth] = useState<AuthState>({
    role: 'guest',
    token: null,
    adminEmail: null,
    user: null,
    impersonating: false,
    driverProfile: null,
    isDeveloper: false,
    isPrimaryDeveloper: false,
    developerMode: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [disabledNotice, setDisabledNotice] = useState<string | null>(null);

  const [guestFavorites, setGuestFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(GUEST_FAVORITES_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [activeTrackedOrder, setActiveTrackedOrder] = useState<SubmittedOrderReceipt | null>(() => {
    try {
      const saved = sessionStorage.getItem(TRACKED_ORDER_KEY);
      return saved ? (JSON.parse(saved) as SubmittedOrderReceipt) : null;
    } catch {
      return null;
    }
  });

  const [adminAlertCount, setAdminAlertCount] = useState(0);
  const [soundMuted, setSoundMuted] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = auth.token;
  const authRoleRef = useRef(auth.role);
  authRoleRef.current = auth.role;
  const soundMutedRef = useRef(soundMuted);
  soundMutedRef.current = soundMuted;

  const wsRef = useRef<WebSocket | null>(null);
  const wsListenersRef = useRef<Set<WsListener>>(new Set());

  const activeConfig = useMemo(
    () =>
      (auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode
        ? draftConfig
        : siteConfig,
    [auth.role, auth.isDeveloper, auth.developerMode, isEditMode, draftConfig, siteConfig]
  );

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (tokenRef.current && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${tokenRef.current}`);
    }
    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const base = getApiBaseUrl();
    return fetch(resolveApiUrl(url), {
      ...options,
      headers,
      credentials: base ? 'include' : 'same-origin',
    });
  }, []);

  const refreshSiteConfig = useCallback(async () => {
    try {
      const res = await fetch(resolveApiUrl('/api/site'), { cache: 'no-store' });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = (await res.json()) as SiteConfig;
        setSiteConfig(data);
        setDraftConfig(data);
      }
    } catch {
      // الاحتفاظ بالنسخة المخزنة مؤقتاً
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as {
          role?: 'guest' | 'customer' | 'admin';
          adminEmail?: string | null;
          token?: string;
          user?: CustomerAccount | null;
          impersonating?: boolean;
          driverProfile?: Driver | null;
          isDeveloper?: boolean;
          isPrimaryDeveloper?: boolean;
        };
        const isDev = Boolean(data.isDeveloper);
        setAuth({
          role: data.role || 'guest',
          token: data.token || tokenRef.current || null,
          adminEmail: data.adminEmail || null,
          user: data.user || null,
          impersonating: Boolean(data.impersonating),
          driverProfile: data.driverProfile || null,
          isDeveloper: isDev,
          isPrimaryDeveloper: Boolean(data.isPrimaryDeveloper),
          developerMode: isDev,
        });
      }
    } catch {
      // تجاهل أخطاء الشبكة الأولية
    } finally {
      setAuthLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    applyThemeToDocument(activeConfig.theme, activeConfig.restaurant.name);
  }, [activeConfig.theme, activeConfig.restaurant.name]);

  useEffect(() => {
    refreshSiteConfig();
    refreshSession();
  }, [refreshSiteConfig, refreshSession]);

  // مزامنة آخر طلب نشط من حساب العميل عند تسجيل الدخول
  useEffect(() => {
    if (
      auth.user?.lastOrder &&
      auth.user.lastOrder.status !== 'delivered' &&
      auth.user.lastOrder.status !== 'cancelled' &&
      !activeTrackedOrder
    ) {
      setActiveTrackedOrder(auth.user.lastOrder);
    }
  }, [auth.user?.lastOrder, activeTrackedOrder]);

  // حفظ الطلب المتتبع وتحديثه في حال تغيره
  const setTrackedOrder = useCallback((order: SubmittedOrderReceipt | null) => {
    setActiveTrackedOrder(order);
    try {
      if (order) sessionStorage.setItem(TRACKED_ORDER_KEY, JSON.stringify(order));
      else sessionStorage.removeItem(TRACKED_ORDER_KEY);
    } catch {
      // تجاهل قيود التخزين
    }
  }, []);

  // اتصال WebSocket للتحديث الحي للموقع، الطلبات، والشات للجميع (مع التراجع السلس على الاستضافات بدون WS)
  useEffect(() => {
    let active = true;
    let reconnectTimer: number | null = null;
    let consecutiveFailures = 0;

    const getWsUrl = () => {
      const apiBase = getApiBaseUrl();
      const tokenParam = tokenRef.current ? `?token=${encodeURIComponent(tokenRef.current)}` : '';
      if (apiBase) {
        try {
          const parsed = new URL(apiBase);
          const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${wsProto}//${parsed.host}/ws${tokenParam}`;
        } catch {
          // fallback below
        }
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws${tokenParam}`;
    };

    const connect = () => {
      if (!active) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(getWsUrl());
      } catch {
        setWsConnected(false);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        consecutiveFailures = 0;
        setWsConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data) as {
            type: string;
            siteConfig?: SiteConfig;
            message?: ChatMessage | string;
            threadId?: string;
            thread?: ChatThread;
            order?: SubmittedOrderReceipt;
          };

          if (payload.type === 'config:updated' && payload.siteConfig) {
            setSiteConfig(payload.siteConfig);
            setDraftConfig(payload.siteConfig);
          } else if (payload.type === 'account:disabled') {
            setAuth({
              role: 'guest',
              token: null,
              adminEmail: null,
              user: null,
              impersonating: false,
              driverProfile: null,
              isDeveloper: false,
              isPrimaryDeveloper: false,
              developerMode: false,
            });
            setDisabledNotice(
              typeof payload.message === 'string'
                ? payload.message
                : 'تم تعطيل هذا الحساب من قبل إدارة المطعم.'
            );
          } else if (payload.type === 'order:updated' && payload.order) {
            const updatedOrder = payload.order;
            setActiveTrackedOrder((prev) => {
              if (prev && prev.orderId === updatedOrder.orderId) {
                try {
                  sessionStorage.setItem(TRACKED_ORDER_KEY, JSON.stringify(updatedOrder));
                } catch {
                  // تجاهل
                }
                return updatedOrder;
              }
              return prev;
            });
            setAuth((prev) => {
              if (!prev.user) return prev;
              const matchesOrder = prev.user.orders.some((o) => o.orderId === updatedOrder.orderId);
              if (!matchesOrder) return prev;
              return {
                ...prev,
                user: {
                  ...prev.user,
                  orders: prev.user.orders.map((o) =>
                    o.orderId === updatedOrder.orderId ? updatedOrder : o
                  ),
                  lastOrder:
                    prev.user.lastOrder?.orderId === updatedOrder.orderId
                      ? updatedOrder
                      : prev.user.lastOrder,
                },
              };
            });
          } else if (payload.type === 'order:created' && authRoleRef.current === 'admin') {
            setAdminAlertCount((c) => c + 1);
            if (!soundMutedRef.current) playAdminChime();
          } else if (
            payload.type === 'chat:message' &&
            payload.message &&
            typeof payload.message === 'object' &&
            payload.message.senderRole !== 'admin' &&
            authRoleRef.current === 'admin'
          ) {
            setAdminAlertCount((c) => c + 1);
            if (!soundMutedRef.current) playAdminChime();
          }

          for (const listener of wsListenersRef.current) {
            listener(payload as Parameters<WsListener>[0]);
          }
        } catch {
          // تجاهل الرسائل غير المفهومة
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setWsConnected(false);
        consecutiveFailures += 1;
        // إذا فشلت المحاولات المتتالية (استضافة Serverless بدون WS)، نوقف الإعادة المتكررة ونعتمد على HTTP polling
        if (active && consecutiveFailures <= 3) {
          const delay = Math.min(15000, 2500 * consecutiveFailures);
          reconnectTimer = window.setTimeout(connect, delay);
        }
      };
    };

    const initRealtime = async () => {
      try {
        const healthRes = await fetch(resolveApiUrl('/api/health'));
        if (healthRes.ok && (healthRes.headers.get('content-type') || '').includes('application/json')) {
          const healthData = (await healthRes.json()) as { supportsWs?: boolean };
          if (healthData.supportsWs === false) {
            setWsConnected(false);
            return;
          }
        }
      } catch {
        // المتابعة بمحاولة الاتصال الاعتيادية عند عدم توفر نقطة الفحص
      }
      if (active) connect();
    };

    void initRealtime();

    return () => {
      active = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const sendWsPayload = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  useEffect(() => {
    sendWsPayload({ type: 'auth', token: auth.token || '' });
  }, [auth.token, auth.role, sendWsPayload]);

  useEffect(() => {
    if (activeTrackedOrder?.orderId) {
      sendWsPayload({ type: 'subscribe_order', orderId: activeTrackedOrder.orderId });
    }
  }, [activeTrackedOrder?.orderId, sendWsPayload]);

  const subscribeWs = useCallback((listener: WsListener) => {
    wsListenersRef.current.add(listener);
    return () => {
      wsListenersRef.current.delete(listener);
    };
  }, []);

  const setCustomerSession = useCallback(
    (
      token: string,
      user: CustomerAccount,
      driverProfile?: Driver | null,
      developerMeta?: { isDeveloper?: boolean; isPrimaryDeveloper?: boolean }
    ) => {
      const isDev = Boolean(developerMeta?.isDeveloper);
      setAuth({
        role: 'customer',
        token,
        adminEmail: null,
        user,
        impersonating: false,
        driverProfile: driverProfile || null,
        isDeveloper: isDev,
        isPrimaryDeveloper: Boolean(developerMeta?.isPrimaryDeveloper),
        developerMode: isDev,
      });
      setDisabledNotice(null);
    },
    []
  );

  const setAdminSession = useCallback(
    (
      token: string,
      adminEmail?: string | null,
      developerMeta?: { isDeveloper?: boolean; isPrimaryDeveloper?: boolean }
    ) => {
      const isDev = Boolean(developerMeta?.isDeveloper);
      setAuth({
        role: 'admin',
        token,
        adminEmail: adminEmail || null,
        user: null,
        impersonating: false,
        driverProfile: null,
        isDeveloper: isDev,
        isPrimaryDeveloper: Boolean(developerMeta?.isPrimaryDeveloper),
        developerMode: isDev,
      });
      setDisabledNotice(null);
    },
    []
  );

  const setDeveloperMode = useCallback((enabled: boolean) => {
    setAuth((prev) => ({
      ...prev,
      developerMode: prev.isDeveloper ? enabled : false,
    }));
    if (!enabled) {
      setIsEditMode(false);
    }
  }, []);

  const updateUserState = useCallback((user: CustomerAccount | null) => {
    setAuth((prev) => ({ ...prev, user }));
  }, []);

  const impersonateUser = useCallback(
    async (email: string | null): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await apiFetch('/api/admin/impersonate', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        const data = await readApiJson<{
          ok?: boolean;
          error?: string;
          impersonating?: boolean;
          user?: CustomerAccount | null;
          token?: string;
        }>(res);
        if (!res.ok || !data.ok) {
          return { ok: false, error: data.error || 'تعذر الدخول إلى الحساب.' };
        }
        setAuth((prev) => ({
          ...prev,
          token: data.token || prev.token,
          user: data.user || null,
          impersonating: Boolean(data.impersonating),
        }));
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error && err.message && err.message !== 'Failed to fetch'
              ? err.message
              : 'تعذر الاتصال بالخادم.',
        };
      }
    },
    [apiFetch]
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // تجاهل أخطاء الشبكة عند تسجيل الخروج
    }
    setIsEditMode(false);
    setAdminAlertCount(0);
    setAuth({
      role: 'guest',
      token: null,
      adminEmail: null,
      user: null,
      impersonating: false,
      driverProfile: null,
      isDeveloper: false,
      isPrimaryDeveloper: false,
      developerMode: false,
    });
  }, [apiFetch]);

  const clearDisabledNotice = useCallback(() => {
    setDisabledNotice(null);
  }, []);

  // إدارة المفضلة للضيف والعميل المسجل
  const favorites = useMemo(
    () => (auth.user ? auth.user.favorites || [] : guestFavorites),
    [auth.user, guestFavorites]
  );

  const toggleFavorite = useCallback(
    (productId: string) => {
      if (auth.user) {
        const exists = (auth.user.favorites || []).includes(productId);
        const nextFavs = exists
          ? (auth.user.favorites || []).filter((id) => id !== productId)
          : [...(auth.user.favorites || []), productId];

        setAuth((prev) =>
          prev.user ? { ...prev, user: { ...prev.user, favorites: nextFavs } } : prev
        );
        apiFetch('/api/account/favorites', {
          method: 'PUT',
          body: JSON.stringify({ favorites: nextFavs }),
        }).catch(() => {});
      } else {
        setGuestFavorites((prev) => {
          const exists = prev.includes(productId);
          const next = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
          try {
            localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(next));
          } catch {
            // تجاهل
          }
          return next;
        });
      }
    },
    [auth.user, apiFetch]
  );

  const hasUnsavedDraft = useMemo(
    () => JSON.stringify(draftConfig) !== JSON.stringify(siteConfig),
    [draftConfig, siteConfig]
  );

  const saveDraftConfigGlobal = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setSavingGlobal(true);
    try {
      const endpoint =
        auth.role === 'admin' ? '/api/admin/site' : '/api/developer/site';
      const res = await apiFetch(endpoint, {
        method: 'PUT',
        body: JSON.stringify(draftConfig),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        siteConfig?: SiteConfig;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.siteConfig) {
        return { ok: false, error: data.error || 'تعذر حفظ التعديلات.' };
      }
      setSiteConfig(data.siteConfig);
      setDraftConfig(data.siteConfig);
      return { ok: true };
    } catch {
      return { ok: false, error: 'تعذر الاتصال بالخادم.' };
    } finally {
      setSavingGlobal(false);
    }
  }, [apiFetch, draftConfig, auth.role]);

  const resetSiteToFactory = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setSavingGlobal(true);
    try {
      const endpoint =
        auth.role === 'admin' ? '/api/admin/site/reset' : '/api/developer/site/reset';
      const res = await apiFetch(endpoint, { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        siteConfig?: SiteConfig;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.siteConfig) {
        return { ok: false, error: data.error || 'تعذر إعادة تعيين الموقع.' };
      }
      setSiteConfig(data.siteConfig);
      setDraftConfig(data.siteConfig);
      return { ok: true };
    } catch {
      return { ok: false, error: 'تعذر الاتصال بالخادم.' };
    } finally {
      setSavingGlobal(false);
    }
  }, [apiFetch, auth.role]);

  const clearAdminAlerts = useCallback(() => {
    setAdminAlertCount(0);
  }, []);

  const value = useMemo<SiteContextValue>(
    () => ({
      siteConfig: activeConfig,
      setSiteConfig,
      refreshSiteConfig,
      auth,
      authLoading,
      setCustomerSession,
      setAdminSession,
      setDeveloperMode,
      updateUserState,
      impersonateUser,
      logout,
      apiFetch,
      wsConnected,
      subscribeWs,
      sendWsPayload,
      disabledNotice,
      clearDisabledNotice,
      favorites,
      toggleFavorite,
      activeTrackedOrder,
      setTrackedOrder,
      isEditMode,
      setIsEditMode,
      draftConfig,
      setDraftConfig,
      hasUnsavedDraft,
      savingGlobal,
      saveDraftConfigGlobal,
      resetSiteToFactory,
      adminAlertCount,
      clearAdminAlerts,
      soundMuted,
      setSoundMuted,
    }),
    [
      activeConfig,
      refreshSiteConfig,
      auth,
      authLoading,
      setCustomerSession,
      setAdminSession,
      setDeveloperMode,
      updateUserState,
      impersonateUser,
      logout,
      apiFetch,
      wsConnected,
      subscribeWs,
      sendWsPayload,
      disabledNotice,
      clearDisabledNotice,
      favorites,
      toggleFavorite,
      activeTrackedOrder,
      setTrackedOrder,
      isEditMode,
      draftConfig,
      hasUnsavedDraft,
      savingGlobal,
      saveDraftConfigGlobal,
      resetSiteToFactory,
      adminAlertCount,
      clearAdminAlerts,
      soundMuted,
    ]
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
};

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) {
    throw new Error('useSite must be used within SiteProvider');
  }
  return ctx;
}
