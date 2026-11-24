/**
 * لوحة الإدارة الشاملة لمطعم zoldix:
 * - دخول بكلمة المرور (بدون أي تلميحات) + رمز تأكيد حصري أو دخول مشرف مضاف بالبريد الإلكتروني
 * - تغيير كلمة المرور حصرياً عبر البريد المعتمد
 * - إدارة الهوية والألوان وحالة استقبال الطلبات ونقاط الولاء ومشهد المنتصف
 * - إدارة العروض والمنيو، تتبع حالة الطلبات وتعيين السائقين
 * - إنشاء الكوبونات بتحديد الحد الأقصى ووقت الانتهاء الدقيق
 * - إدارة السائقين والتواصل المباشر معهم، وإضافة مشرفين إضافيين بالبريد
 * - حفظ ونشر التعديلات لجميع الزوار أو عمل ريستارت لإعادة الموقع من جديد
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Ban,
  CheckCircle2,
  Code2,
  CreditCard,
  Eye,
  Gamepad2,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type {
  ChatThread,
  Coupon,
  CustomerAccount,
  Driver,
  OrderStatus,
  SiteTheme,
  SubmittedOrderReceipt,
} from '../types/menu';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDeveloper?: () => void;
}

type AdminTab =
  | 'brand'
  | 'catalog'
  | 'orders_frames'
  | 'coupons'
  | 'drivers'
  | 'users'
  | 'chats'
  | 'integrations'
  | 'security';

const STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: 'received', label: 'تم الاستلام' },
  { value: 'preparing', label: 'قيد التحضير' },
  { value: 'on_the_way', label: 'مع السائق في الطريق' },
  { value: 'delivered', label: 'تم التوصيل' },
  { value: 'cancelled', label: 'ملغي' },
];

const COMFORT_PALETTES: Array<{ label: string; theme: SiteTheme }> = [
  {
    label: 'خشب الجوز والعنبر الدافئ',
    theme: {
      canvas: '#13100E',
      surface: '#1B1613',
      subtle: '#241D19',
      textPrimary: '#EFE7DC',
      textSecondary: '#C7B9A8',
      textMuted: '#9A8B7A',
      accent: '#C96A3B',
      accentSecondary: '#DDA15E',
    },
  },
  {
    label: 'الزيتون الهادئ والرمال',
    theme: {
      canvas: '#101411',
      surface: '#171D18',
      subtle: '#202822',
      textPrimary: '#ECEFE9',
      textSecondary: '#BFC9BE',
      textMuted: '#8D9A8E',
      accent: '#7A9A65',
      accentSecondary: '#C8B273',
    },
  },
  {
    label: 'القهوة المحمصة والكراميل',
    theme: {
      canvas: '#141112',
      surface: '#1D1819',
      subtle: '#272022',
      textPrimary: '#F2E9E4',
      textSecondary: '#C9B8B2',
      textMuted: '#9A8782',
      accent: '#B56B52',
      accentSecondary: '#E0AA70',
    },
  },
];

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  onOpenDeveloper,
}) => {
  const {
    auth,
    apiFetch,
    setAdminSession,
    impersonateUser,
    logout,
    subscribeWs,
    draftConfig,
    setDraftConfig,
    savingGlobal,
    saveDraftConfigGlobal,
    resetSiteToFactory,
    clearAdminAlerts,
  } = useSite();

  // حالات تسجيل الدخول (المشرف الرئيسي + المشرف الإضافي بالبريد + تغيير كلمة المرور)
  const [loginMethod, setLoginMethod] = useState<'primary' | 'invited'>('primary');
  const [authMode, setAuthMode] = useState<
    'password' | 'otp' | 'invited_otp' | 'reset_confirm'
  >('password');
  const [passwordInput, setPasswordInput] = useState('');
  const [invitedEmailInput, setInvitedEmailInput] = useState('');
  const [loginChallengeKey, setLoginChallengeKey] = useState('');
  const [loginOtpCode, setLoginOtpCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  const [resetChallengeKey, setResetChallengeKey] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // حالات لوحة الإدارة
  const [activeTab, setActiveTab] = useState<AdminTab>('brand');
  const [saveNotice, setSaveNotice] = useState('');
  const [saveError, setSaveError] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);

  // العملاء، المشرفون، السائقون، الكوبونات، الطلبات، المحادثات
  const [usersList, setUsersList] = useState<CustomerAccount[]>([]);
  const [usersFilter, setUsersFilter] = useState('');
  const [primaryAdminEmail, setPrimaryAdminEmail] = useState('');
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmailInput, setNewAdminEmailInput] = useState('');

  const [driversList, setDriversList] = useState<Driver[]>([]);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverEmail, setNewDriverEmail] = useState('');
  const [newDriverVehicle, setNewDriverVehicle] = useState('دراجة توصيل');

  const [couponsList, setCouponsList] = useState<Coupon[]>([]);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percent' | 'fixed' | 'free_delivery'>(
    'percent'
  );
  const [newCouponValue, setNewCouponValue] = useState('15');
  const [newCouponMaxUses, setNewCouponMaxUses] = useState('50');
  const [newCouponMinOrder, setNewCouponMinOrder] = useState('0');
  const [newCouponExpiresAt, setNewCouponExpiresAt] = useState('');

  const [ordersList, setOrdersList] = useState<SubmittedOrderReceipt[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [adminChatReply, setAdminChatReply] = useState('');
  const [showAdminGame, setShowAdminGame] = useState(false);
  const [adminGameBusy, setAdminGameBusy] = useState(false);
  const [adminGameError, setAdminGameError] = useState('');
  const [loadingAdminData, setLoadingAdminData] = useState(false);

  // إعدادات الربط الديناميكية SMTP و Stripe API
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpHasPass, setSmtpHasPass] = useState(false);
  const [smtpOrderTo, setSmtpOrderTo] = useState('');
  const [smtpAdminNotifyEmail, setSmtpAdminNotifyEmail] = useState('');

  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [stripeHasSecret, setStripeHasSecret] = useState(false);
  const [stripeSecretMasked, setStripeSecretMasked] = useState('');
  const [clearStripeSecret, setClearStripeSecret] = useState(false);
  const [integrationsUpdatedAt, setIntegrationsUpdatedAt] = useState<string | null>(null);

  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [integrationsBanner, setIntegrationsBanner] = useState<{ ok: boolean; msg: string } | null>(
    null
  );

  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (auth.role === 'admin') {
      clearAdminAlerts();
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, auth.role, onClose, clearAdminAlerts]);

  const loadAdminResources = async () => {
    if (auth.role !== 'admin') return;
    setLoadingAdminData(true);
    try {
      const [usersRes, ordersRes, chatsRes, adminsRes, driversRes, couponsRes, integrationsRes] =
        await Promise.all([
          apiFetch('/api/admin/users', { cache: 'no-store' }),
          apiFetch('/api/admin/orders', { cache: 'no-store' }),
          apiFetch('/api/admin/chats', { cache: 'no-store' }),
          apiFetch('/api/admin/admins', { cache: 'no-store' }),
          apiFetch('/api/admin/drivers', { cache: 'no-store' }),
          apiFetch('/api/admin/coupons', { cache: 'no-store' }),
          apiFetch('/api/admin/integrations', { cache: 'no-store' }),
        ]);
      if (usersRes.ok) {
        const uData = (await usersRes.json()) as { users?: CustomerAccount[] };
        setUsersList(uData.users || []);
      }
      if (ordersRes.ok) {
        const oData = (await ordersRes.json()) as { orders?: SubmittedOrderReceipt[] };
        setOrdersList(oData.orders || []);
      }
      if (chatsRes.ok) {
        const cData = (await chatsRes.json()) as { threads?: ChatThread[] };
        const threads = cData.threads || [];
        setChatThreads(threads);
        if (!selectedThreadId && threads.length > 0) {
          setSelectedThreadId(threads[0].threadId);
        }
      }
      if (adminsRes.ok) {
        const aData = (await adminsRes.json()) as {
          primaryAdminEmail?: string;
          adminEmails?: string[];
        };
        setPrimaryAdminEmail(aData.primaryAdminEmail || '');
        setAdminEmails(aData.adminEmails || []);
      }
      if (driversRes.ok) {
        const dData = (await driversRes.json()) as { drivers?: Driver[] };
        setDriversList(dData.drivers || []);
      }
      if (couponsRes.ok) {
        const cpnData = (await couponsRes.json()) as { coupons?: Coupon[] };
        setCouponsList(cpnData.coupons || []);
      }
      if (integrationsRes.ok) {
        const iData = (await integrationsRes.json()) as {
          smtp?: {
            host?: string;
            port?: number;
            user?: string;
            hasPass?: boolean;
            orderTo?: string;
            adminNotifyEmail?: string;
          };
          stripe?: {
            publishableKey?: string;
            hasSecretKey?: boolean;
            secretKeyMasked?: string;
          };
          updatedAt?: string | null;
        };
        if (iData.smtp) {
          setSmtpHost(iData.smtp.host || '');
          setSmtpPort(String(iData.smtp.port || 465));
          setSmtpUser(iData.smtp.user || '');
          setSmtpHasPass(Boolean(iData.smtp.hasPass));
          setSmtpOrderTo(iData.smtp.orderTo || '');
          setSmtpAdminNotifyEmail(iData.smtp.adminNotifyEmail || '');
        }
        if (iData.stripe) {
          setStripePublishableKey(iData.stripe.publishableKey || '');
          setStripeHasSecret(Boolean(iData.stripe.hasSecretKey));
          setStripeSecretMasked(iData.stripe.secretKeyMasked || '');
        }
        setIntegrationsUpdatedAt(iData.updatedAt || null);
      }
    } catch {
      // تجاهل الأخطاء المؤقتة
    } finally {
      setLoadingAdminData(false);
    }
  };

  useEffect(() => {
    if (isOpen && auth.role === 'admin') {
      loadAdminResources();
    }
  }, [isOpen, auth.role]);

  useEffect(() => {
    if (auth.role !== 'admin') return;
    return subscribeWs((evt) => {
      if ((evt.type === 'chat:message' || evt.type === 'chat:game' || evt.type === 'chat:read') && evt.thread) {
        if (evt.thread.threadType === 'dm' || evt.thread.threadId.startsWith('dm:')) return;
        setChatThreads((prev) => {
          const rest = prev.filter((t) => t.threadId !== evt.thread!.threadId);
          return [evt.thread!, ...rest];
        });
      } else if (evt.type === 'order:created' && evt.order) {
        setOrdersList((prev) => [evt.order as SubmittedOrderReceipt, ...prev]);
      } else if (evt.type === 'order:updated' && evt.order) {
        const updated = evt.order as SubmittedOrderReceipt;
        setOrdersList((prev) => prev.map((o) => (o.orderId === updated.orderId ? updated : o)));
      }
    });
  }, [auth.role, subscribeWs]);

  const handleAdminPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    if (!passwordInput) {
      setAuthError('يرجى إدخال كلمة المرور');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        challengeKey?: string;
        maskedEmail?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.challengeKey) {
        setAuthError(data.error || 'تعذر التحقق من كلمة المرور');
        setAuthLoading(false);
        return;
      }
      setLoginChallengeKey(data.challengeKey);
      setMaskedEmail(data.maskedEmail || '');
      setAuthMessage(data.message || 'تم إرسال رمز التأكيد إلى البريد المعتمد');
      setAuthMode('otp');
      setPasswordInput('');
    } catch {
      setAuthError('تعذر الاتصال بالخادم');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleInvitedAdminRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    const clean = invitedEmailInput.trim().toLowerCase();
    if (!clean) {
      setAuthError('يرجى إدخال بريد المشرف');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await apiFetch('/api/admin/email-login', {
        method: 'POST',
        body: JSON.stringify({ email: clean }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        challengeKey?: string;
        maskedEmail?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.challengeKey) {
        setAuthError(data.error || 'البريد غير مدرج ضمن المشرفين');
        setAuthLoading(false);
        return;
      }
      setLoginChallengeKey(data.challengeKey);
      setMaskedEmail(data.maskedEmail || clean);
      setAuthMessage(data.message || 'تم إرسال رمز الدخول إلى بريدك');
      setAuthMode('invited_otp');
    } catch {
      setAuthError('تعذر الاتصال بالخادم');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const cleanCode = loginOtpCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setAuthError('يرجى إدخال الرمز المكون من ستة أرقام');
      return;
    }
    setAuthLoading(true);
    try {
      const endpoint =
        authMode === 'invited_otp' ? '/api/admin/verify-email-login' : '/api/admin/verify-login';
      const payload =
        authMode === 'invited_otp'
          ? {
              challengeKey: loginChallengeKey,
              email: invitedEmailInput.trim().toLowerCase(),
              code: cleanCode,
            }
          : { challengeKey: loginChallengeKey, code: cleanCode };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        adminEmail?: string;
        isDeveloper?: boolean;
        isPrimaryDeveloper?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.token) {
        setAuthError(data.error || 'رمز التأكيد غير صحيح');
        setAuthLoading(false);
        return;
      }
      setAdminSession(data.token, data.adminEmail || null, {
        isDeveloper: data.isDeveloper,
        isPrimaryDeveloper: data.isPrimaryDeveloper,
      });
      setLoginOtpCode('');
      setAuthMode('password');
      setAuthMessage('');
    } catch {
      setAuthError('تعذر الاتصال بالخادم');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRequestPasswordResetCode = async () => {
    setAuthError('');
    setAuthMessage('');
    setAuthLoading(true);
    try {
      const res = await apiFetch('/api/admin/password/request-code', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        challengeKey?: string;
        maskedEmail?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.challengeKey) {
        setAuthError(data.error || 'تعذر إرسال رمز تغيير كلمة المرور');
        setAuthLoading(false);
        return;
      }
      setResetChallengeKey(data.challengeKey);
      setMaskedEmail(data.maskedEmail || '');
      setAuthMessage(data.message || 'تم إرسال رمز التغيير إلى البريد المعتمد فقط');
      setAuthMode('reset_confirm');
    } catch {
      setAuthError('تعذر الاتصال بالخادم');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setAuthError('يرجى إدخال رمز التحقق المكون من ستة أرقام');
      return;
    }
    if (newPassword.length < 8) {
      setAuthError('كلمة المرور الجديدة يجب أن تكون ثمانية أحرف على الأقل');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await apiFetch('/api/admin/password/confirm', {
        method: 'POST',
        body: JSON.stringify({
          challengeKey: resetChallengeKey,
          code: resetCode.trim(),
          newPassword,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setAuthError(data.error || 'تعذر تغيير كلمة المرور');
        setAuthLoading(false);
        return;
      }
      setResetCode('');
      setNewPassword('');
      setAuthMode('password');
      setAuthMessage(data.message || 'تم تحديث كلمة المرور بنجاح');
    } catch {
      setAuthError('تعذر الاتصال بالخادم');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveGlobal = async () => {
    setSaveNotice('');
    setSaveError('');
    const res = await saveDraftConfigGlobal();
    if (!res.ok) {
      setSaveError(res.error || 'تعذر حفظ التعديلات');
    } else {
      setSaveNotice('تم حفظ جميع التعديلات ونشرها لجميع الزوار فوراً');
      window.setTimeout(() => setSaveNotice(''), 3000);
    }
  };

  const handleResetFactory = async () => {
    setSaveNotice('');
    setSaveError('');
    const res = await resetSiteToFactory();
    setConfirmRestart(false);
    if (!res.ok) {
      setSaveError(res.error || 'تعذر إعادة ضبط الموقع');
    } else {
      setSaveNotice('تم عمل ريستارت وإعادة الموقع للحالة الأصلية للجميع');
      window.setTimeout(() => setSaveNotice(''), 3000);
    }
  };

  const handleImageUpload = (file: File | undefined, onResult: (dataUrl: string) => void) => {
    if (!file) return;
    if (file.size > 1_500_000) {
      setSaveError('حجم الصورة كبير جداً يرجى اختيار صورة أصغر من 1.5 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onResult(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateOrderStatus = async (
    orderId: string,
    status: OrderStatus,
    driverId?: string
  ) => {
    try {
      const res = await apiFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          ...(driverId !== undefined ? { driverId: driverId || null } : {}),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { order?: SubmittedOrderReceipt };
        if (data.order) {
          setOrdersList((prev) =>
            prev.map((o) => (o.orderId === data.order!.orderId ? data.order! : o))
          );
        }
      }
    } catch {
      // تجاهل
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setSaveNotice('');
    try {
      const res = await apiFetch('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: newCouponCode,
          discountType: newCouponType,
          value: Number(newCouponValue || 0),
          maxUses: Number(newCouponMaxUses || 0),
          minOrder: Number(newCouponMinOrder || 0),
          expiresAt: newCouponExpiresAt ? new Date(newCouponExpiresAt).toISOString() : '',
        }),
      });
      const data = (await res.json()) as { ok?: boolean; coupon?: Coupon; error?: string };
      if (!res.ok || !data.ok || !data.coupon) {
        setSaveError(data.error || 'تعذر إنشاء الكوبون');
        return;
      }
      setCouponsList((prev) => [data.coupon!, ...prev]);
      setNewCouponCode('');
      setSaveNotice('تم إنشاء الكوبون بنجاح');
    } catch {
      setSaveError('تعذر الاتصال بالخادم');
    }
  };

  const handleToggleCoupon = async (coupon: Coupon) => {
    const res = await apiFetch(`/api/admin/coupons/${encodeURIComponent(coupon.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !coupon.active }),
    });
    if (res.ok) {
      const data = (await res.json()) as { coupon?: Coupon };
      if (data.coupon) {
        setCouponsList((prev) => prev.map((c) => (c.id === data.coupon!.id ? data.coupon! : c)));
      }
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    const res = await apiFetch(`/api/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setCouponsList((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    try {
      const res = await apiFetch('/api/admin/drivers', {
        method: 'POST',
        body: JSON.stringify({
          name: newDriverName,
          phone: newDriverPhone,
          email: newDriverEmail,
          vehicle: newDriverVehicle,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; driver?: Driver; error?: string };
      if (!res.ok || !data.ok || !data.driver) {
        setSaveError(data.error || 'تعذر إضافة السائق');
        return;
      }
      setDriversList((prev) => [data.driver!, ...prev]);
      setNewDriverName('');
      setNewDriverPhone('');
      setNewDriverEmail('');
      loadAdminResources();
    } catch {
      setSaveError('تعذر الاتصال بالخادم');
    }
  };

  const handleToggleDriver = async (driver: Driver) => {
    const res = await apiFetch(`/api/admin/drivers/${encodeURIComponent(driver.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: !driver.active }),
    });
    if (res.ok) {
      const data = (await res.json()) as { driver?: Driver };
      if (data.driver) {
        setDriversList((prev) => prev.map((d) => (d.id === data.driver!.id ? data.driver! : d)));
      }
    }
  };

  const handleDeleteDriver = async (id: string) => {
    const res = await apiFetch(`/api/admin/drivers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setDriversList((prev) => prev.filter((d) => d.id !== id));
    }
  };

  const handleOpenDriverChat = async (driver: Driver) => {
    const threadId = `driver:${driver.id}`;
    try {
      const res = await apiFetch(`/api/chat/thread?threadId=${encodeURIComponent(threadId)}`);
      if (res.ok) {
        const data = (await res.json()) as { thread?: ChatThread };
        if (data.thread) {
          setChatThreads((prev) => {
            const exists = prev.some((t) => t.threadId === data.thread!.threadId);
            return exists ? prev : [data.thread!, ...prev];
          });
        }
      }
    } catch {
      // تجاهل
    }
    setSelectedThreadId(threadId);
    setActiveTab('chats');
  };

  const handleAddInvitedAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    try {
      const res = await apiFetch('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({ email: newAdminEmailInput }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        adminEmails?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setSaveError(data.error || 'تعذر إضافة المشرف');
        return;
      }
      setAdminEmails(data.adminEmails || []);
      setNewAdminEmailInput('');
    } catch {
      setSaveError('تعذر الاتصال بالخادم');
    }
  };

  const handleRemoveInvitedAdmin = async (email: string) => {
    const res = await apiFetch(`/api/admin/admins/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = (await res.json()) as { adminEmails?: string[] };
      setAdminEmails(data.adminEmails || []);
    }
  };

  const toggleUserDisabled = async (account: CustomerAccount) => {
    try {
      const res = await apiFetch(
        `/api/admin/users/${encodeURIComponent(account.email)}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ disabled: !account.disabled }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { user?: CustomerAccount };
        if (data.user) {
          setUsersList((prev) =>
            prev.map((u) => (u.email === data.user!.email ? data.user! : u))
          );
        }
      }
    } catch {
      // تجاهل الأخطاء المؤقتة
    }
  };

  const handleEnterCustomerAccount = async (email: string) => {
    const res = await impersonateUser(email);
    if (res.ok) {
      onClose();
    }
  };

  const handleAdminSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThreadId || !adminChatReply.trim()) return;
    try {
      const res = await apiFetch('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          threadId: selectedThreadId,
          text: adminChatReply.trim(),
          asAdmin: true,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { thread?: ChatThread };
        setAdminChatReply('');
        if (data.thread) {
          setChatThreads((prev) => {
            const rest = prev.filter((t) => t.threadId !== data.thread!.threadId);
            return [data.thread!, ...rest];
          });
        }
      }
    } catch {
      // تجاهل الخطأ المؤقت
    }
  };

  const handleAdminStartGame = async (threadId: string) => {
    if (adminGameBusy) return;
    setAdminGameBusy(true);
    setAdminGameError('');
    try {
      const res = await apiFetch('/api/chat/game/start', {
        method: 'POST',
        body: JSON.stringify({ threadId, asAdmin: true }),
      });
      const data = (await res.json()) as { ok?: boolean; thread?: ChatThread; error?: string };
      if (!res.ok || !data.ok || !data.thread) {
        setAdminGameError(data.error || 'تعذر بدء اللعبة');
      } else {
        setShowAdminGame(true);
        setChatThreads((prev) => {
          const rest = prev.filter((t) => t.threadId !== data.thread!.threadId);
          return [data.thread!, ...rest];
        });
      }
    } catch {
      setAdminGameError('تعذر الاتصال بالخادم');
    } finally {
      setAdminGameBusy(false);
    }
  };

  const handleAdminGameMove = async (threadId: string, cellIndex: number) => {
    if (adminGameBusy) return;
    setAdminGameBusy(true);
    setAdminGameError('');
    try {
      const res = await apiFetch('/api/chat/game/move', {
        method: 'POST',
        body: JSON.stringify({ threadId, cellIndex, asAdmin: true }),
      });
      const data = (await res.json()) as { ok?: boolean; thread?: ChatThread; error?: string };
      if (!res.ok || !data.ok || !data.thread) {
        setAdminGameError(data.error || 'تعذر تنفيذ الحركة');
      } else {
        setChatThreads((prev) => {
          const rest = prev.filter((t) => t.threadId !== data.thread!.threadId);
          return [data.thread!, ...rest];
        });
      }
    } catch {
      setAdminGameError('تعذر الاتصال بالخادم');
    } finally {
      setAdminGameBusy(false);
    }
  };

  const handleTestSmtpConnection = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    setIntegrationsBanner(null);
    try {
      const res = await apiFetch('/api/admin/integrations/test-smtp', {
        method: 'POST',
        body: JSON.stringify({
          host: smtpHost.trim(),
          port: Number(smtpPort || 465),
          user: smtpUser.trim(),
          pass: smtpPass.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      setSmtpTestResult({
        ok: Boolean(res.ok && data.ok),
        msg:
          data.message ||
          data.error ||
          (res.ok ? 'تم الاتصال بخادم SMTP بنجاح' : 'فشل الاتصال بخادم SMTP'),
      });
    } catch {
      setSmtpTestResult({ ok: false, msg: 'تعذر الاتصال بالخادم لاختبار SMTP' });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTestStripeConnection = async () => {
    setTestingStripe(true);
    setStripeTestResult(null);
    setIntegrationsBanner(null);
    try {
      const res = await apiFetch('/api/admin/integrations/test-stripe', {
        method: 'POST',
        body: JSON.stringify({
          secretKey: stripeSecretKey.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      setStripeTestResult({
        ok: Boolean(res.ok && data.ok),
        msg:
          data.message ||
          data.error ||
          (res.ok ? 'تم الاتصال ببوابة Stripe بنجاح' : 'فشل التحقق من مفتاح Stripe'),
      });
    } catch {
      setStripeTestResult({ ok: false, msg: 'تعذر الاتصال بالخادم لاختبار Stripe' });
    } finally {
      setTestingStripe(false);
    }
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingIntegrations(true);
    setIntegrationsBanner(null);
    try {
      const res = await apiFetch('/api/admin/integrations', {
        method: 'PUT',
        body: JSON.stringify({
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort || 465),
          smtpUser: smtpUser.trim(),
          ...(smtpPass.trim() ? { smtpPass: smtpPass.trim() } : {}),
          orderTo: smtpOrderTo.trim(),
          adminNotifyEmail: smtpAdminNotifyEmail.trim(),
          stripePublishableKey: stripePublishableKey.trim(),
          ...(stripeSecretKey.trim() ? { stripeSecretKey: stripeSecretKey.trim() } : {}),
          clearStripeSecret,
          verifyBeforeSave: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        updatedAt?: string;
      };
      if (!res.ok || !data.ok) {
        setIntegrationsBanner({
          ok: false,
          msg: data.error || 'تعذر حفظ إعدادات الربط، يرجى التحقق من صحة البيانات',
        });
      } else {
        setIntegrationsBanner({
          ok: true,
          msg: data.message || 'تم اختبار الاتصال وحفظ إعدادات SMTP و Stripe بنجاح',
        });
        setSmtpPass('');
        setStripeSecretKey('');
        setClearStripeSecret(false);
        if (data.updatedAt) setIntegrationsUpdatedAt(data.updatedAt);
        loadAdminResources();
      }
    } catch {
      setIntegrationsBanner({ ok: false, msg: 'تعذر الاتصال بالخادم أثناء الحفظ' });
    } finally {
      setSavingIntegrations(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = usersFilter.trim().toLowerCase();
    if (!q) return usersList;
    return usersList.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.phone.includes(q)
    );
  }, [usersList, usersFilter]);

  const activeChatThread = useMemo(
    () => chatThreads.find((t) => t.threadId === selectedThreadId) || chatThreads[0] || null,
    [chatThreads, selectedThreadId]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 safari-blur p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-modal-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="w-full sm:max-w-5xl max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-[var(--shadow-modal)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* الرأس */}
            <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[var(--accent-gold)]" aria-hidden="true" />
                <div>
                  <h2 id="admin-modal-title" className="font-display font-black text-xl">
                    {auth.role === 'admin' ? 'لوحة الإدارة والتحكم الكامل' : 'دخول الإدارة'}
                  </h2>
                  {auth.role === 'admin' && auth.adminEmail && (
                    <div className="text-[11px] text-[var(--text-muted)]" dir="ltr">
                      {auth.adminEmail}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {auth.role === 'admin' && (
                  <button
                    type="button"
                    onClick={logout}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>تسجيل خروج</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="إغلاق لوحة الإدارة"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {auth.role !== 'admin' ? (
              <div className="p-6 sm:p-8 max-w-md mx-auto w-full space-y-5 overflow-y-auto pb-safe">
                {(authMode === 'password' || authMode === 'invited_otp') && (
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod('primary');
                        setAuthMode('password');
                        setAuthError('');
                        setAuthMessage('');
                      }}
                      className={`min-h-[40px] rounded-xl text-xs font-extrabold transition-colors ${
                        loginMethod === 'primary'
                          ? 'bg-[var(--accent-fire)] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      كلمة مرور الإدارة
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginMethod('invited');
                        setAuthMode('password');
                        setAuthError('');
                        setAuthMessage('');
                      }}
                      className={`min-h-[40px] rounded-xl text-xs font-extrabold transition-colors ${
                        loginMethod === 'invited'
                          ? 'bg-[var(--accent-gold)] text-[#13100E]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      مشرف مضاف بالبريد
                    </button>
                  </div>
                )}

                {authMessage && (
                  <div className="p-3.5 rounded-2xl bg-[var(--accent-gold-soft)] border border-[var(--accent-gold)]/40 text-xs sm:text-sm font-bold">
                    {authMessage} {maskedEmail ? `(${maskedEmail})` : ''}
                  </div>
                )}

                {loginMethod === 'primary' && authMode === 'password' && (
                  <form onSubmit={handleAdminPasswordLogin} className="space-y-4">
                    <div>
                      <label htmlFor="admin-pass" className="block text-sm font-bold mb-1.5">
                        كلمة مرور الإدارة
                      </label>
                      <input
                        id="admin-pass"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-[var(--text-primary)]"
                      />
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full min-h-[48px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {authLoading && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}
                      <span>متابعة وتأكيد الدخول</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRequestPasswordResetCode}
                      disabled={authLoading}
                      className="w-full min-h-[44px] text-xs font-bold text-[var(--accent-gold)] underline"
                    >
                      تغيير كلمة مرور الإدارة عبر البريد المعتمد
                    </button>
                  </form>
                )}

                {loginMethod === 'invited' && authMode === 'password' && (
                  <form onSubmit={handleInvitedAdminRequestOtp} className="space-y-4">
                    <div>
                      <label htmlFor="invited-admin-email" className="block text-sm font-bold mb-1.5">
                        البريد الإلكتروني للمشرف المعتمد
                      </label>
                      <input
                        id="invited-admin-email"
                        type="email"
                        dir="ltr"
                        required
                        value={invitedEmailInput}
                        onChange={(e) => setInvitedEmailInput(e.target.value)}
                        placeholder="admin@gmail.com"
                        className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-left text-[var(--text-primary)]"
                      />
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full min-h-[48px] rounded-2xl bg-[var(--accent-gold)] text-[#13100E] font-display font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {authLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Mail className="w-5 h-5" aria-hidden="true" />
                      )}
                      <span>إرسال رمز دخول المشرف</span>
                    </button>
                  </form>
                )}

                {(authMode === 'otp' || authMode === 'invited_otp') && (
                  <form onSubmit={handleAdminOtpVerify} className="space-y-4">
                    <div>
                      <label htmlFor="admin-otp" className="block text-sm font-bold mb-1.5">
                        رمز تأكيد الدخول المرسل إلى بريد المشرف
                      </label>
                      <input
                        id="admin-otp"
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={6}
                        required
                        value={loginOtpCode}
                        onChange={(e) => setLoginOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full min-h-[52px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-center font-mono text-2xl tracking-[0.4em]"
                      />
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                        {authError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="min-h-[48px] rounded-2xl bg-[var(--accent-fire)] text-white font-display font-extrabold text-sm flex items-center justify-center gap-2"
                      >
                        {authLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                        <span>تأكيد الدخول</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('password');
                          setAuthError('');
                        }}
                        className="min-h-[48px] rounded-2xl bg-[var(--bg-subtle)] text-sm font-bold"
                      >
                        رجوع
                      </button>
                    </div>
                  </form>
                )}

                {authMode === 'reset_confirm' && (
                  <form onSubmit={handleConfirmPasswordChange} className="space-y-4">
                    <div>
                      <label htmlFor="reset-otp" className="block text-sm font-bold mb-1.5">
                        رمز التحقق المرسل للبريد المعتمد
                      </label>
                      <input
                        id="reset-otp"
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        maxLength={6}
                        required
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2 text-center font-mono text-xl tracking-[0.35em]"
                      />
                    </div>

                    <div>
                      <label htmlFor="reset-pass" className="block text-sm font-bold mb-1.5">
                        كلمة المرور الجديدة
                      </label>
                      <input
                        id="reset-pass"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2"
                      />
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                        {authError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="min-h-[48px] rounded-2xl bg-[var(--accent-fire)] text-white font-display font-extrabold text-sm"
                      >
                        حفظ كلمة المرور الجديدة
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('password');
                          setAuthError('');
                        }}
                        className="min-h-[48px] rounded-2xl bg-[var(--bg-subtle)] text-sm font-bold"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* شريط تبويبات لوحة الإدارة */}
                <div className="px-4 sm:px-6 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] shrink-0">
                  <div className="touch-scroll-x flex items-center gap-2">
                    {[
                      { id: 'brand', label: 'الهوية والألوان', icon: Palette },
                      { id: 'catalog', label: 'العروض والمنيو', icon: Layers },
                      { id: 'orders_frames', label: 'الطلبات والمشاهد', icon: ShoppingBag },
                      { id: 'coupons', label: 'الكوبونات', icon: Tag },
                      { id: 'drivers', label: 'السائقين', icon: Truck },
                      { id: 'users', label: 'العملاء والمشرفون', icon: Users },
                      { id: 'chats', label: 'الشات المباشر', icon: MessageCircle },
                      { id: 'integrations', label: 'إعدادات الربط API', icon: Settings2 },
                      { id: 'security', label: 'الأمان والريستارت', icon: KeyRound },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id as AdminTab)}
                          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors ${
                            active
                              ? 'bg-[var(--accent-fire)] text-white'
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]'
                          }`}
                        >
                          <Icon className="w-4 h-4" aria-hidden="true" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* محتوى التبويب النشط */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
                  {activeTab === 'brand' && (
                    <div className="space-y-6">
                      {/* حالة استقبال الطلبات ونظام نقاط الولاء */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-display font-black text-lg">استقبال الطلبات ونقاط الولاء</h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                              تحكم بإيقاف الطلبات مؤقتاً أثناء الضغط واضبط معدل ربح النقاط
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                restaurant: {
                                  ...prev.restaurant,
                                  acceptingOrders: !prev.restaurant.acceptingOrders,
                                },
                              }))
                            }
                            className={`min-h-[44px] px-4 rounded-xl text-xs font-extrabold border transition-colors ${
                              draftConfig.restaurant.acceptingOrders
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                                : 'bg-[var(--accent-fire)] border-[var(--accent-fire)] text-white'
                            }`}
                          >
                            {draftConfig.restaurant.acceptingOrders
                              ? 'المطعم يستقبل الطلبات الآن'
                              : 'الطلبات متوقفة مؤقتاً'}
                          </button>
                        </div>

                        <div>
                          <label className="block text-xs font-bold mb-1">رسالة التوقف المؤقت للزوار</label>
                          <input
                            type="text"
                            value={draftConfig.restaurant.pausedMessage}
                            onChange={(e) =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                restaurant: { ...prev.restaurant, pausedMessage: e.target.value },
                              }))
                            }
                            className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1">
                              نقاط الولاء لكل دينار شراء
                            </label>
                            <input
                              type="number"
                              value={draftConfig.restaurant.loyaltyPointsPerUnit}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: {
                                    ...prev.restaurant,
                                    loyaltyPointsPerUnit: Math.max(0, Number(e.target.value || 0)),
                                  },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">
                              قيمة كل نقطة عند الاستبدال
                            </label>
                            <input
                              type="number"
                              step="0.005"
                              value={draftConfig.restaurant.loyaltyRedeemValue}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: {
                                    ...prev.restaurant,
                                    loyaltyRedeemValue: Math.max(0, Number(e.target.value || 0)),
                                  },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* الهوية والشعار */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <h3 className="font-display font-black text-lg">اسم المطعم والشعار</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold mb-1">اسم المطعم</label>
                            <input
                              type="text"
                              value={draftConfig.restaurant.name}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: {
                                    ...prev.restaurant,
                                    name: e.target.value,
                                    shortName: e.target.value,
                                  },
                                }))
                              }
                              className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">رابط أو رفع صورة الشعار</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                dir="ltr"
                                value={draftConfig.restaurant.logoUrl || ''}
                                onChange={(e) =>
                                  setDraftConfig((prev) => ({
                                    ...prev,
                                    restaurant: { ...prev.restaurant, logoUrl: e.target.value },
                                  }))
                                }
                                placeholder="https://..."
                                className="flex-1 min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-left"
                              />
                              <input
                                ref={logoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleImageUpload(e.target.files?.[0], (url) =>
                                    setDraftConfig((prev) => ({
                                      ...prev,
                                      restaurant: { ...prev.restaurant, logoUrl: url },
                                    }))
                                  )
                                }
                              />
                              <button
                                type="button"
                                onClick={() => logoInputRef.current?.click()}
                                className="min-h-[46px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Upload className="w-4 h-4" aria-hidden="true" />
                                <span>رفع</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold mb-1">العنوان الرئيسي في الواجهة</label>
                          <input
                            type="text"
                            value={draftConfig.restaurant.tagline}
                            onChange={(e) =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                restaurant: { ...prev.restaurant, tagline: e.target.value },
                              }))
                            }
                            className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold mb-1">الوصف الترحيبي</label>
                          <textarea
                            rows={2}
                            value={draftConfig.restaurant.heroSubtitle}
                            onChange={(e) =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                restaurant: { ...prev.restaurant, heroSubtitle: e.target.value },
                              }))
                            }
                            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1">العملة</label>
                            <input
                              type="text"
                              value={draftConfig.restaurant.currency}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: { ...prev.restaurant, currency: e.target.value },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">رسوم التوصيل</label>
                            <input
                              type="number"
                              step="0.05"
                              value={draftConfig.restaurant.deliveryFee}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: {
                                    ...prev.restaurant,
                                    deliveryFee: Number(e.target.value || 0),
                                  },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">حد التوصيل المجاني</label>
                            <input
                              type="number"
                              step="0.5"
                              value={draftConfig.restaurant.freeDeliveryThreshold ?? 0}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: {
                                    ...prev.restaurant,
                                    freeDeliveryThreshold:
                                      Number(e.target.value) > 0 ? Number(e.target.value) : null,
                                  },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1">رقم الهاتف</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={draftConfig.restaurant.phone}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: {
                                    ...prev.restaurant,
                                    phone: e.target.value,
                                    phoneDisplay: e.target.value,
                                  },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-right"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">ساعات العمل</label>
                            <input
                              type="text"
                              value={draftConfig.restaurant.hours}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: { ...prev.restaurant, hours: e.target.value },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-bold mb-1">عنوان الفرع</label>
                            <input
                              type="text"
                              value={draftConfig.restaurant.address}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  restaurant: { ...prev.restaurant, address: e.target.value },
                                }))
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2"
                            />
                          </div>
                        </div>
                      </div>

                      {/* الألوان المريحة للعين */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-display font-black text-lg">ألوان الموقع المريحة للعين</h3>
                          <div className="flex flex-wrap gap-2">
                            {COMFORT_PALETTES.map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() =>
                                  setDraftConfig((prev) => ({ ...prev, theme: preset.theme }))
                                }
                                className="min-h-[38px] px-3 py-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-bold hover:border-[var(--accent-gold)]"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { key: 'canvas', label: 'لون الخلفية العام' },
                            { key: 'surface', label: 'لون البطاقات' },
                            { key: 'subtle', label: 'لون العناصر الثانوية' },
                            { key: 'accent', label: 'اللون الرئيسي' },
                            { key: 'accentSecondary', label: 'اللون المكمل الدافئ' },
                            { key: 'textPrimary', label: 'لون النص الأساسي' },
                            { key: 'textSecondary', label: 'لون النص الثانوي' },
                            { key: 'textMuted', label: 'لون النص الهادئ' },
                          ].map((field) => {
                            const key = field.key as keyof SiteTheme;
                            return (
                              <label
                                key={field.key}
                                className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-between gap-2 text-xs font-bold cursor-pointer"
                              >
                                <span>{field.label}</span>
                                <input
                                  type="color"
                                  value={draftConfig.theme[key]}
                                  onChange={(e) =>
                                    setDraftConfig((prev) => ({
                                      ...prev,
                                      theme: { ...prev.theme, [key]: e.target.value },
                                    }))
                                  }
                                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'catalog' && (
                    <div className="space-y-6">
                      {/* العروض */}
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display font-black text-lg">العروض المميزة</h3>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                offers: [
                                  {
                                    id: `offer_${Date.now().toString(36)}`,
                                    name: 'عرض جديد',
                                    description: 'وصف العرض الجديد',
                                    originalPrice: 8,
                                    price: 5.5,
                                    discountLabel: 'خصم خاص',
                                    image: '/images/zoldix-signature.jpg',
                                    variantIds: prev.variants.slice(0, 2).map((v) => v.id),
                                    addonIds: prev.addons.slice(0, 3).map((a) => a.id),
                                  },
                                  ...prev.offers,
                                ],
                              }))
                            }
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--accent-gold)] text-[#13100E] text-xs font-extrabold inline-flex items-center gap-1"
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                            <span>إضافة عرض</span>
                          </button>
                        </div>

                        <div className="space-y-3">
                          {draftConfig.offers.map((offer, idx) => (
                            <div
                              key={offer.id}
                              className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-3"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                <input
                                  type="text"
                                  value={offer.name}
                                  onChange={(e) => {
                                    const next = [...draftConfig.offers];
                                    next[idx] = { ...offer, name: e.target.value };
                                    setDraftConfig((p) => ({ ...p, offers: next }));
                                  }}
                                  placeholder="اسم العرض"
                                  className="sm:col-span-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm"
                                />
                                <input
                                  type="number"
                                  step="0.05"
                                  value={offer.price}
                                  onChange={(e) => {
                                    const next = [...draftConfig.offers];
                                    next[idx] = { ...offer, price: Number(e.target.value || 1) };
                                    setDraftConfig((p) => ({ ...p, offers: next }));
                                  }}
                                  placeholder="السعر"
                                  className="min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm"
                                />
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={offer.discountLabel}
                                    onChange={(e) => {
                                      const next = [...draftConfig.offers];
                                      next[idx] = { ...offer, discountLabel: e.target.value };
                                      setDraftConfig((p) => ({ ...p, offers: next }));
                                    }}
                                    placeholder="شارة الخصم"
                                    className="flex-1 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftConfig((p) => ({
                                        ...p,
                                        offers: p.offers.filter((o) => o.id !== offer.id),
                                      }))
                                    }
                                    aria-label={`حذف ${offer.name}`}
                                    className="min-h-[42px] min-w-[42px] rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] flex items-center justify-center"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <input
                                  type="text"
                                  value={offer.description}
                                  onChange={(e) => {
                                    const next = [...draftConfig.offers];
                                    next[idx] = { ...offer, description: e.target.value };
                                    setDraftConfig((p) => ({ ...p, offers: next }));
                                  }}
                                  placeholder="وصف العرض"
                                  className="min-h-[40px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                                />
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={offer.image}
                                  onChange={(e) => {
                                    const next = [...draftConfig.offers];
                                    next[idx] = { ...offer, image: e.target.value };
                                    setDraftConfig((p) => ({ ...p, offers: next }));
                                  }}
                                  placeholder="رابط الصورة"
                                  className="min-h-[40px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-left"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* أصناف القائمة */}
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-display font-black text-lg">أصناف قائمة الطعام</h3>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                items: [
                                  {
                                    id: `item_${Date.now().toString(36)}`,
                                    categoryId: prev.categories[0]?.id || 'shawarma',
                                    name: 'طبق جديد',
                                    description: 'وصف الطبق الجديد',
                                    price: 3.5,
                                    image: '/images/zoldix-signature.jpg',
                                    variantIds: prev.variants.slice(0, 2).map((v) => v.id),
                                    addonIds: prev.addons.slice(0, 3).map((a) => a.id),
                                  },
                                  ...prev.items,
                                ],
                              }))
                            }
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--accent-gold)] text-[#13100E] text-xs font-extrabold inline-flex items-center gap-1"
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                            <span>إضافة صنف</span>
                          </button>
                        </div>

                        <div className="space-y-3">
                          {draftConfig.items.map((item, idx) => (
                            <div
                              key={item.id}
                              className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-2.5"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => {
                                    const next = [...draftConfig.items];
                                    next[idx] = { ...item, name: e.target.value };
                                    setDraftConfig((p) => ({ ...p, items: next }));
                                  }}
                                  placeholder="اسم الصنف"
                                  className="sm:col-span-2 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm"
                                />
                                <select
                                  value={item.categoryId}
                                  onChange={(e) => {
                                    const next = [...draftConfig.items];
                                    next[idx] = { ...item, categoryId: e.target.value };
                                    setDraftConfig((p) => ({ ...p, items: next }));
                                  }}
                                  className="min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-sm"
                                >
                                  {draftConfig.categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.05"
                                    value={item.price}
                                    onChange={(e) => {
                                      const next = [...draftConfig.items];
                                      next[idx] = { ...item, price: Number(e.target.value || 1) };
                                      setDraftConfig((p) => ({ ...p, items: next }));
                                    }}
                                    className="flex-1 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraftConfig((p) => ({
                                        ...p,
                                        items: p.items.filter((i) => i.id !== item.id),
                                      }))
                                    }
                                    aria-label={`حذف ${item.name}`}
                                    className="min-h-[42px] min-w-[42px] rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] flex items-center justify-center"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => {
                                    const next = [...draftConfig.items];
                                    next[idx] = { ...item, description: e.target.value };
                                    setDraftConfig((p) => ({ ...p, items: next }));
                                  }}
                                  placeholder="وصف الصنف"
                                  className="min-h-[40px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs"
                                />
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={item.image}
                                  onChange={(e) => {
                                    const next = [...draftConfig.items];
                                    next[idx] = { ...item, image: e.target.value };
                                    setDraftConfig((p) => ({ ...p, items: next }));
                                  }}
                                  placeholder="رابط الصورة"
                                  className="min-h-[40px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-left"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'orders_frames' && (
                    <div className="space-y-6">
                      {/* سجل الطلبات وإدارة الحالة وتعيين السائقين */}
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                        <h3 className="font-display font-black text-lg">
                          الطلبات الواردة وتحديث الحالة ({ordersList.length})
                        </h3>
                        {ordersList.length === 0 ? (
                          <p className="text-sm text-[var(--text-muted)]">لا توجد طلبات مسجلة حتى الآن</p>
                        ) : (
                          <div className="space-y-3 max-h-[380px] overflow-y-auto">
                            {ordersList.map((ord) => (
                              <div
                                key={ord.orderId}
                                className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-3 text-sm"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="font-bold">
                                      طلب #{ord.orderId} باسم {ord.name || 'عميل'}
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)]">
                                      الهاتف {ord.phone || ''} {ord.area ? `المنطقة ${ord.area}` : ''}
                                    </div>
                                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                                      {ord.items.map((i) => `${i.name} × ${i.quantity}`).join('، ')}
                                    </div>
                                  </div>
                                  <div className="text-left">
                                    <div className="font-display font-black text-base text-[var(--accent-gold)]">
                                      {formatPrice(ord.total, ord.currency)}
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)]">
                                      {ord.paymentMethod}
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[var(--border-hairline)]">
                                  <div>
                                    <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                                      حالة الطلب المباشرة
                                    </label>
                                    <select
                                      value={ord.status || 'received'}
                                      onChange={(e) =>
                                        handleUpdateOrderStatus(
                                          ord.orderId,
                                          e.target.value as OrderStatus,
                                          ord.driverId || ''
                                        )
                                      }
                                      className="w-full min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 text-xs font-bold"
                                    >
                                      {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                                      تعيين السائق المسؤول
                                    </label>
                                    <select
                                      value={ord.driverId || ''}
                                      onChange={(e) =>
                                        handleUpdateOrderStatus(
                                          ord.orderId,
                                          ord.status || 'received',
                                          e.target.value
                                        )
                                      }
                                      className="w-full min-h-[40px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 text-xs font-bold"
                                    >
                                      <option value="">بدون سائق محدد</option>
                                      {driversList.map((drv) => (
                                        <option key={drv.id} value={drv.id}>
                                          {drv.name} ({drv.phone})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* فصول فريمات الفيديو */}
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                        <h3 className="font-display font-black text-lg">فصول فريمات العرض</h3>
                        {draftConfig.heroChapters.map((ch, idx) => (
                          <div
                            key={ch.id}
                            className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                          >
                            <input
                              type="text"
                              value={ch.title}
                              onChange={(e) => {
                                const next = [...draftConfig.heroChapters];
                                next[idx] = { ...ch, title: e.target.value };
                                setDraftConfig((p) => ({ ...p, heroChapters: next }));
                              }}
                              placeholder="عنوان المشهد"
                              className="min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm"
                            />
                            <input
                              type="text"
                              value={ch.subtitle}
                              onChange={(e) => {
                                const next = [...draftConfig.heroChapters];
                                next[idx] = { ...ch, subtitle: e.target.value };
                                setDraftConfig((p) => ({ ...p, heroChapters: next }));
                              }}
                              placeholder="وصف المشهد"
                              className="min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'coupons' && (
                    <div className="space-y-6">
                      <form
                        onSubmit={handleCreateCoupon}
                        className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4"
                      >
                        <h3 className="font-display font-black text-lg">
                          إنشاء كوبون خصم بحد أقصى ووقت انتهاء
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1">كود الكوبون</label>
                            <input
                              type="text"
                              dir="ltr"
                              required
                              value={newCouponCode}
                              onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                              placeholder="ZOLDIX20"
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left font-mono uppercase text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold mb-1">نوع الخصم</label>
                            <select
                              value={newCouponType}
                              onChange={(e) =>
                                setNewCouponType(
                                  e.target.value as 'percent' | 'fixed' | 'free_delivery'
                                )
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                            >
                              <option value="percent">نسبة مئوية (%)</option>
                              <option value="fixed">مبلغ ثابت ({draftConfig.restaurant.currency})</option>
                              <option value="free_delivery">توصيل مجاني</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold mb-1">قيمة الخصم</label>
                            <input
                              type="number"
                              step="0.1"
                              disabled={newCouponType === 'free_delivery'}
                              value={newCouponValue}
                              onChange={(e) => setNewCouponValue(e.target.value)}
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm disabled:opacity-50"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold mb-1">
                              الحد الأقصى لعدد الاستخدامات (صفر بدون حد)
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={newCouponMaxUses}
                              onChange={(e) => setNewCouponMaxUses(e.target.value)}
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold mb-1">الحد الأدنى للطلب</label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={newCouponMinOrder}
                              onChange={(e) => setNewCouponMinOrder(e.target.value)}
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold mb-1">تاريخ ووقت الانتهاء</label>
                            <input
                              type="datetime-local"
                              dir="ltr"
                              value={newCouponExpiresAt}
                              onChange={(e) => setNewCouponExpiresAt(e.target.value)}
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-extrabold text-sm inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" aria-hidden="true" />
                          <span>إضافة الكوبون الآن</span>
                        </button>
                      </form>

                      <div className="space-y-3">
                        <h3 className="font-display font-black text-lg">
                          الكوبونات الحالية ({couponsList.length})
                        </h3>
                        {couponsList.length === 0 ? (
                          <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-dashed border-[var(--border-hairline)] text-xs text-center text-[var(--text-muted)]">
                            لا توجد كوبونات مضافة حتى الآن
                          </div>
                        ) : (
                          couponsList.map((cpn) => (
                            <div
                              key={cpn.id}
                              className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-base text-[var(--accent-gold)]">
                                    {cpn.code}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                      cpn.active
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : 'bg-[var(--accent-fire-soft)] text-[var(--accent-fire)]'
                                    }`}
                                  >
                                    {cpn.active ? 'مفعل' : 'متوقف'}
                                  </span>
                                </div>
                                <div className="text-xs text-[var(--text-secondary)]">
                                  الخصم{' '}
                                  {cpn.discountType === 'free_delivery'
                                    ? 'توصيل مجاني'
                                    : cpn.discountType === 'percent'
                                      ? `${cpn.value}%`
                                      : `${cpn.value} ${draftConfig.restaurant.currency}`}{' '}
                                  مرات الاستخدام {cpn.usedCount} من{' '}
                                  {cpn.maxUses > 0 ? cpn.maxUses : 'غير محدود'}
                                </div>
                                {cpn.expiresAt && (
                                  <div className="text-[11px] text-[var(--text-muted)]">
                                    ينتهي في {new Date(cpn.expiresAt).toLocaleString('ar-JO')}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCoupon(cpn)}
                                  className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-bold"
                                >
                                  {cpn.active ? 'إيقاف' : 'تفعيل'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCoupon(cpn.id)}
                                  aria-label={`حذف كوبون ${cpn.code}`}
                                  className="min-h-[38px] min-w-[38px] rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] flex items-center justify-center"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'drivers' && (
                    <div className="space-y-6">
                      <form
                        onSubmit={handleAddDriver}
                        className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4"
                      >
                        <h3 className="font-display font-black text-lg">إضافة سائق توصيل جديد</h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          عند دخول السائق بنفس بريده الإلكتروني عبر الموقع تظهر له بوابة السائق والطلبات المسندة له والشات المباشر معك
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="text"
                            required
                            value={newDriverName}
                            onChange={(e) => setNewDriverName(e.target.value)}
                            placeholder="اسم السائق الكامل"
                            className="min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm"
                          />
                          <input
                            type="tel"
                            dir="ltr"
                            required
                            value={newDriverPhone}
                            onChange={(e) => setNewDriverPhone(e.target.value)}
                            placeholder="0791234567"
                            className="min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-right text-sm"
                          />
                          <input
                            type="email"
                            dir="ltr"
                            value={newDriverEmail}
                            onChange={(e) => setNewDriverEmail(e.target.value)}
                            placeholder="driver@gmail.com"
                            className="min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-sm"
                          />
                          <input
                            type="text"
                            value={newDriverVehicle}
                            onChange={(e) => setNewDriverVehicle(e.target.value)}
                            placeholder="نوع المركبة"
                            className="min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm"
                          />
                        </div>

                        <button
                          type="submit"
                          className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-extrabold text-sm inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" aria-hidden="true" />
                          <span>إضافة السائق</span>
                        </button>
                      </form>

                      <div className="space-y-3">
                        <h3 className="font-display font-black text-lg">
                          قائمة السائقين ({driversList.length})
                        </h3>
                        {driversList.length === 0 ? (
                          <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-dashed border-[var(--border-hairline)] text-xs text-center text-[var(--text-muted)]">
                            لا يوجد سائقون مضافون حالياً
                          </div>
                        ) : (
                          driversList.map((drv) => (
                            <div
                              key={drv.id}
                              className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-display font-bold text-base">
                                    {drv.name}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                      drv.active
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : 'bg-[var(--accent-fire-soft)] text-[var(--accent-fire)]'
                                    }`}
                                  >
                                    {drv.active ? 'نشط' : 'موقوف'}
                                  </span>
                                </div>
                                <div className="text-xs text-[var(--text-secondary)]">
                                  {drv.phone} {drv.vehicle}
                                </div>
                                {drv.email && (
                                  <div className="text-xs text-[var(--text-muted)]" dir="ltr">
                                    {drv.email}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDriverChat(drv)}
                                  className="min-h-[40px] px-3.5 rounded-xl bg-[var(--accent-fire)] text-white text-xs font-extrabold inline-flex items-center gap-1.5"
                                >
                                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                                  <span>تواصل مع السائق</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleDriver(drv)}
                                  className="min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-bold"
                                >
                                  {drv.active ? 'تعطيل' : 'تنشيط'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDriver(drv.id)}
                                  aria-label={`حذف السائق ${drv.name}`}
                                  className="min-h-[40px] min-w-[40px] rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] flex items-center justify-center"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'users' && (
                    <div className="space-y-6">
                      {/* إدارة المشرفين المتعددين عبر البريد */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-gold)]/40 space-y-4">
                        <div>
                          <h3 className="font-display font-black text-lg">
                            المشرفون المعتمدون عبر البريد الإلكتروني
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)]">
                            يمكنك تعيين أكثر من مشرف لإدارة الموقع وسيتمكن كل منهم من الدخول عبر رمز التحقق على بريده
                          </p>
                        </div>

                        <form onSubmit={handleAddInvitedAdmin} className="flex flex-wrap gap-2">
                          <input
                            type="email"
                            dir="ltr"
                            required
                            value={newAdminEmailInput}
                            onChange={(e) => setNewAdminEmailInput(e.target.value)}
                            placeholder="co-admin@gmail.com"
                            className="flex-1 min-w-[220px] min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left text-sm"
                          />
                          <button
                            type="submit"
                            className="min-h-[44px] px-4 rounded-xl bg-[var(--accent-gold)] text-[#13100E] text-xs font-extrabold inline-flex items-center gap-1.5"
                          >
                            <Plus className="w-4 h-4" />
                            <span>إضافة مشرف</span>
                          </button>
                        </form>

                        <div className="space-y-2">
                          {primaryAdminEmail && (
                            <div className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-between gap-2 text-xs">
                              <span dir="ltr" className="font-bold">
                                {primaryAdminEmail}
                              </span>
                              <span className="px-2 py-0.5 rounded-lg bg-[var(--accent-gold-soft)] text-[var(--accent-gold)] font-bold">
                                المشرف الرئيسي
                              </span>
                            </div>
                          )}

                          {adminEmails.map((admEmail) => (
                            <div
                              key={admEmail}
                              className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-between gap-2 text-xs"
                            >
                              <span dir="ltr" className="font-bold">
                                {admEmail}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveInvitedAdmin(admEmail)}
                                className="px-2.5 py-1 rounded-lg bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] font-bold"
                              >
                                إزالة
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* حسابات العملاء */}
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="font-display font-black text-lg">
                            حسابات العملاء المسجلين ({usersList.length})
                          </h3>
                          <input
                            type="text"
                            value={usersFilter}
                            onChange={(e) => setUsersFilter(e.target.value)}
                            placeholder="ابحث بالبريد أو الاسم أو الهاتف"
                            className="min-h-[42px] w-full sm:w-72 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3.5 py-1.5 text-sm"
                          />
                        </div>

                        {loadingAdminData ? (
                          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
                            جاري تحميل الحسابات
                          </div>
                        ) : filteredUsers.length === 0 ? (
                          <div className="p-6 rounded-2xl bg-[var(--bg-canvas)] border border-dashed border-[var(--border-hairline)] text-center text-sm text-[var(--text-muted)]">
                            لا يوجد عملاء مسجلون مطابقون للبحث
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {filteredUsers.map((account) => (
                              <div
                                key={account.email}
                                className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-display font-bold text-base">
                                      {account.name}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                        account.disabled
                                          ? 'bg-[var(--accent-fire-soft)] text-[var(--accent-fire)]'
                                          : 'bg-emerald-500/15 text-emerald-300'
                                      }`}
                                    >
                                      {account.disabled ? 'معطل' : 'نشط'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-[var(--text-muted)]" dir="ltr">
                                    {account.email}
                                  </div>
                                  <div className="text-xs text-[var(--text-secondary)]">
                                    الطلبات {account.orders.length} النقاط {account.loyaltyPoints || 0} السلة{' '}
                                    {account.cart.reduce((s, i) => s + i.quantity, 0)}
                                    {account.lastOrder
                                      ? ` آخر شراء ${formatPrice(account.lastOrder.total, account.lastOrder.currency)}`
                                      : ''}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleEnterCustomerAccount(account.email)}
                                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--accent-gold)] text-[#13100E] text-xs font-extrabold inline-flex items-center gap-1.5"
                                  >
                                    <Eye className="w-4 h-4" aria-hidden="true" />
                                    <span>دخول للحساب</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => toggleUserDisabled(account)}
                                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                                      account.disabled
                                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                                        : 'bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] border border-[var(--accent-fire)]/40'
                                    }`}
                                  >
                                    {account.disabled ? (
                                      <>
                                        <UserCheck className="w-4 h-4" aria-hidden="true" />
                                        <span>تنشيط الحساب</span>
                                      </>
                                    ) : (
                                      <>
                                        <Ban className="w-4 h-4" aria-hidden="true" />
                                        <span>تعطيل الحساب</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'chats' && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 min-h-[380px]">
                      <div className="md:col-span-4 space-y-2 max-h-[420px] overflow-y-auto">
                        {chatThreads.length === 0 ? (
                          <div className="p-4 rounded-xl bg-[var(--bg-canvas)] text-xs text-[var(--text-muted)] text-center">
                            لا توجد محادثات بعد
                          </div>
                        ) : (
                          chatThreads.map((t) => {
                            const selected = activeChatThread?.threadId === t.threadId;
                            const isDriver = t.threadId.startsWith('driver:') || t.threadType === 'driver';
                            return (
                              <button
                                key={t.threadId}
                                type="button"
                                onClick={() => setSelectedThreadId(t.threadId)}
                                className={`w-full text-right p-3 rounded-xl border transition-colors ${
                                  selected
                                    ? 'bg-[var(--bg-subtle)] border-[var(--accent-gold)]'
                                    : 'bg-[var(--bg-canvas)] border-[var(--border-hairline)]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-sm truncate">
                                    {t.customerName}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isDriver && (
                                      <span className="px-1.5 py-0.5 rounded bg-[var(--accent-gold-soft)] text-[var(--accent-gold)] text-[10px] font-bold">
                                        سائق
                                      </span>
                                    )}
                                    {t.unreadByAdmin > 0 && (
                                      <span className="px-2 py-0.5 rounded-full bg-[var(--accent-fire)] text-white text-[10px] font-black">
                                        {t.unreadByAdmin}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                                  {t.customerEmail || 'زائر الموقع'}
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="md:col-span-8 flex flex-col rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] overflow-hidden">
                        {!activeChatThread ? (
                          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)] p-6">
                            اختر محادثة من القائمة للرد المباشر على العميل أو السائق
                          </div>
                        ) : (
                          <>
                            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-sm">
                                محادثة {activeChatThread.customerName}
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowAdminGame((v) => !v)}
                                className={`min-h-[34px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                                  showAdminGame || activeChatThread.game?.status === 'playing'
                                    ? 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--accent-gold)]'
                                    : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] text-[var(--text-secondary)]'
                                }`}
                              >
                                <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>
                                  {showAdminGame || activeChatThread.game ? 'لعبة إكس أوه' : 'لعب X / O'}
                                </span>
                              </button>
                            </div>

                            {(showAdminGame || activeChatThread.game) && (
                              <div className="p-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-extrabold text-[var(--accent-gold)]">
                                    لعبة إكس أوه مع {activeChatThread.customerName}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={adminGameBusy}
                                    onClick={() => handleAdminStartGame(activeChatThread.threadId)}
                                    className="min-h-[30px] px-2.5 rounded-lg bg-[var(--accent-fire)] text-white text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                                    <span>{activeChatThread.game ? 'جولة جديدة' : 'ابدأ اللعب'}</span>
                                  </button>
                                </div>

                                {activeChatThread.game && (
                                  <div className="flex flex-wrap items-center justify-center gap-4">
                                    <div className="grid grid-cols-3 gap-1.5 w-36" dir="ltr">
                                      {activeChatThread.game.board.map((cell, idx) => {
                                        const adminSymbol =
                                          activeChatThread.game!.playerX.id === 'restaurant_admin'
                                            ? 'X'
                                            : 'O';
                                        const isAdminTurn =
                                          activeChatThread.game!.status === 'playing' &&
                                          activeChatThread.game!.turn === adminSymbol;
                                        const canPlay = isAdminTurn && cell === null && !adminGameBusy;
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            disabled={!canPlay}
                                            onClick={() =>
                                              handleAdminGameMove(activeChatThread.threadId, idx)
                                            }
                                            className={`h-10 rounded-lg border font-display font-black text-base flex items-center justify-center ${
                                              activeChatThread.game!.winningLine?.includes(idx)
                                                ? 'bg-[var(--accent-gold-soft)] border-[var(--accent-gold)]'
                                                : 'bg-[var(--bg-canvas)] border-[var(--border-hairline)]'
                                            } ${
                                              cell === 'X'
                                                ? 'text-[var(--accent-fire)]'
                                                : cell === 'O'
                                                  ? 'text-[var(--accent-gold)]'
                                                  : ''
                                            }`}
                                          >
                                            {cell || ''}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="text-xs space-y-1">
                                      <div className="font-bold">
                                        X ({activeChatThread.game.playerX.label}):{' '}
                                        {activeChatThread.game.xWins}
                                      </div>
                                      <div className="font-bold">
                                        O ({activeChatThread.game.playerO.label}):{' '}
                                        {activeChatThread.game.oWins}
                                      </div>
                                      <div className="font-extrabold text-[var(--accent-gold)]">
                                        {activeChatThread.game.status === 'won'
                                          ? `الفائز: ${
                                              activeChatThread.game.winner === 'X'
                                                ? activeChatThread.game.playerX.label
                                                : activeChatThread.game.playerO.label
                                            }`
                                          : activeChatThread.game.status === 'draw'
                                            ? 'تعادل'
                                            : activeChatThread.game.turn ===
                                                (activeChatThread.game.playerX.id === 'restaurant_admin'
                                                  ? 'X'
                                                  : 'O')
                                              ? 'دور الإدارة الآن'
                                              : 'بانتظار العميل'}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {adminGameError && (
                                  <div className="text-[11px] font-bold text-[var(--accent-fire)]">
                                    {adminGameError}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[300px]">
                              {activeChatThread.messages.map((m) => (
                                <div
                                  key={m.id}
                                  className={`max-w-[82%] p-3 rounded-2xl text-sm ${
                                    m.senderRole === 'admin'
                                      ? 'mr-auto bg-[var(--accent-fire)] text-white'
                                      : 'ml-auto bg-[var(--bg-surface)] border border-[var(--border-hairline)]'
                                  }`}
                                >
                                  <div className="text-[10px] opacity-75 mb-0.5">{m.senderLabel}</div>
                                  <div>{m.text}</div>
                                </div>
                              ))}
                            </div>
                            <form
                              onSubmit={handleAdminSendChat}
                              className="p-3 border-t border-[var(--border-hairline)] flex items-center gap-2"
                            >
                              <input
                                type="text"
                                value={adminChatReply}
                                onChange={(e) => setAdminChatReply(e.target.value)}
                                placeholder="اكتب رد الإدارة الفوري هنا"
                                className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm"
                              />
                              <button
                                type="submit"
                                className="min-h-[44px] px-4 rounded-xl bg-[var(--accent-fire)] text-white font-bold text-sm inline-flex items-center gap-1.5"
                              >
                                <Send className="w-4 h-4" aria-hidden="true" />
                                <span>إرسال</span>
                              </button>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'integrations' && (
                    <form onSubmit={handleSaveIntegrations} className="space-y-6">
                      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-gold)]/45 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="font-display font-black text-lg">
                              إعدادات الربط الديناميكية (SMTP و Stripe API)
                            </h3>
                            <p className="text-xs text-[var(--text-secondary)]">
                              عدّل بيانات خادم البريد ومفاتيح Stripe مباشرة مع التحقق التلقائي من صحة الاتصال قبل الحفظ
                            </p>
                          </div>
                          {auth.isDeveloper && onOpenDeveloper && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenDeveloper();
                              }}
                              className="min-h-[40px] px-3.5 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-extrabold text-xs inline-flex items-center gap-1.5"
                            >
                              <Code2 className="w-4 h-4" aria-hidden="true" />
                              <span>بوابة المطورين وتنزيل ZIP</span>
                            </button>
                          )}
                        </div>
                        {integrationsUpdatedAt && (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            آخر تحديث للإعدادات {new Date(integrationsUpdatedAt).toLocaleString('ar-JO')}
                          </div>
                        )}
                      </div>

                      {/* إعدادات البريد الإلكتروني SMTP SSL */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-display font-black text-base">
                            <Mail className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                            <span>إعدادات خادم البريد الإلكتروني (SMTP)</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleTestSmtpConnection}
                            disabled={testingSmtp}
                            className="min-h-[40px] px-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/55 text-xs font-extrabold text-[var(--accent-gold)] inline-flex items-center gap-1.5 disabled:opacity-60"
                          >
                            {testingSmtp && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>اختبار اتصال SMTP الآن</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1">خادم SMTP Host</label>
                            <input
                              type="text"
                              dir="ltr"
                              value={smtpHost}
                              onChange={(e) => setSmtpHost(e.target.value)}
                              placeholder="smtp.gmail.com"
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">المنفذ Port</label>
                            <input
                              type="number"
                              dir="ltr"
                              value={smtpPort}
                              onChange={(e) => setSmtpPort(e.target.value)}
                              placeholder="465"
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">بريد الإرسال SMTP User</label>
                            <input
                              type="email"
                              dir="ltr"
                              value={smtpUser}
                              onChange={(e) => setSmtpUser(e.target.value)}
                              placeholder="orders@gmail.com"
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">
                              كلمة مرور التطبيقات SMTP Pass
                            </label>
                            <input
                              type="password"
                              dir="ltr"
                              value={smtpPass}
                              onChange={(e) => setSmtpPass(e.target.value)}
                              placeholder={
                                smtpHasPass
                                  ? 'اتركه فارغاً للإبقاء على كلمة السر الحالية'
                                  : 'أدخل كلمة مرور التطبيقات'
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">بريد استقبال الطلبات Order To</label>
                            <input
                              type="email"
                              dir="ltr"
                              value={smtpOrderTo}
                              onChange={(e) => setSmtpOrderTo(e.target.value)}
                              placeholder="restaurant@gmail.com"
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">بريد تنبيهات الأمان والإدارة</label>
                            <input
                              type="email"
                              dir="ltr"
                              value={smtpAdminNotifyEmail}
                              onChange={(e) => setSmtpAdminNotifyEmail(e.target.value)}
                              placeholder="admin@gmail.com"
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-sm"
                            />
                          </div>
                        </div>

                        {smtpTestResult && (
                          <div
                            className={`p-3 rounded-xl text-xs font-bold border ${
                              smtpTestResult.ok
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--text-primary)]'
                            }`}
                          >
                            {smtpTestResult.msg}
                          </div>
                        )}
                      </div>

                      {/* إعدادات Stripe API */}
                      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-display font-black text-base">
                            <CreditCard className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                            <span>إعدادات بوابة الدفع الإلكتروني (Stripe API)</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleTestStripeConnection}
                            disabled={testingStripe}
                            className="min-h-[40px] px-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/55 text-xs font-extrabold text-[var(--accent-gold)] inline-flex items-center gap-1.5 disabled:opacity-60"
                          >
                            {testingStripe && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>اختبار اتصال Stripe الآن</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold mb-1">
                              المفتاح العام Publishable Key
                            </label>
                            <input
                              type="text"
                              dir="ltr"
                              value={stripePublishableKey}
                              onChange={(e) => setStripePublishableKey(e.target.value)}
                              placeholder="pk_live_... أو pk_test_..."
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left font-mono text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold mb-1">
                              المفتاح السري Secret Key {stripeHasSecret && stripeSecretMasked ? `(${stripeSecretMasked})` : ''}
                            </label>
                            <input
                              type="password"
                              dir="ltr"
                              value={stripeSecretKey}
                              onChange={(e) => {
                                setStripeSecretKey(e.target.value);
                                if (e.target.value.trim()) setClearStripeSecret(false);
                              }}
                              placeholder={
                                stripeHasSecret
                                  ? 'اتركه فارغاً للإبقاء على المفتاح السري المحفوظ'
                                  : 'sk_live_... أو sk_test_...'
                              }
                              className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-left font-mono text-xs"
                            />
                          </div>
                        </div>

                        {stripeHasSecret && (
                          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={clearStripeSecret}
                              onChange={(e) => setClearStripeSecret(e.target.checked)}
                              className="w-4 h-4 accent-[var(--accent-fire)]"
                            />
                            <span>إزالة المفتاح السري المحفوظ والاعتماد على البوابة المباشرة</span>
                          </label>
                        )}

                        {stripeTestResult && (
                          <div
                            className={`p-3 rounded-xl text-xs font-bold border ${
                              stripeTestResult.ok
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--text-primary)]'
                            }`}
                          >
                            {stripeTestResult.msg}
                          </div>
                        )}
                      </div>

                      {integrationsBanner && (
                        <div
                          className={`p-3.5 rounded-2xl text-xs sm:text-sm font-bold border ${
                            integrationsBanner.ok
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--text-primary)]'
                          }`}
                        >
                          {integrationsBanner.msg}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={savingIntegrations}
                        className="min-h-[48px] px-6 py-2.5 rounded-2xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-display font-black text-sm inline-flex items-center gap-2 shadow-md disabled:opacity-60"
                      >
                        {savingIntegrations ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Save className="w-4 h-4" aria-hidden="true" />
                        )}
                        <span>
                          {savingIntegrations
                            ? 'جاري اختبار الاتصال وحفظ الإعدادات'
                            : 'اختبار صحة الاتصال وحفظ إعدادات SMTP و Stripe'}
                        </span>
                      </button>
                    </form>
                  )}

                  {activeTab === 'security' && (
                    <div className="space-y-6 max-w-lg">
                      <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <h3 className="font-display font-black text-lg">أمان حساب الإدارة</h3>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                          يتم إرسال رموز تأكيد الدخول وتغيير كلمة المرور حصرياً إلى البريد الإلكتروني المعتمد للإدارة فقط
                        </p>

                        {authMode !== 'reset_confirm' ? (
                          <button
                            type="button"
                            onClick={handleRequestPasswordResetCode}
                            disabled={authLoading}
                            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-extrabold text-sm inline-flex items-center gap-2"
                          >
                            <KeyRound className="w-4 h-4" aria-hidden="true" />
                            <span>إرسال رمز تغيير كلمة المرور الآن</span>
                          </button>
                        ) : (
                          <form onSubmit={handleConfirmPasswordChange} className="space-y-3">
                            {authMessage && (
                              <div className="text-xs font-bold text-[var(--accent-gold)]">
                                {authMessage} ({maskedEmail})
                              </div>
                            )}
                            <input
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              maxLength={6}
                              required
                              value={resetCode}
                              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              placeholder="الرمز المكون من ستة أرقام"
                              className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-center font-mono"
                            />
                            <input
                              type="password"
                              required
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="كلمة المرور الجديدة"
                              className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2"
                            />
                            {authError && (
                              <div className="text-xs font-bold text-[var(--accent-fire)]">{authError}</div>
                            )}
                            <button
                              type="submit"
                              disabled={authLoading}
                              className="min-h-[46px] px-5 py-2 rounded-xl bg-[var(--accent-fire)] text-white font-bold text-sm"
                            >
                              اعتماد كلمة المرور الجديدة
                            </button>
                          </form>
                        )}
                      </div>

                      <div className="p-5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-fire)]/45 space-y-3">
                        <h3 className="font-display font-black text-lg text-[var(--accent-fire)]">
                          إعادة ضبط الموقع من جديد
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          يعيد الألوان والشعار والنصوص وقائمة الطعام الافتراضية لجميع الزوار دون حذف حسابات العملاء أو الطلبات المسجلة
                        </p>
                        {!confirmRestart ? (
                          <button
                            type="button"
                            onClick={() => setConfirmRestart(true)}
                            className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-[var(--accent-fire)] font-extrabold text-sm inline-flex items-center gap-2"
                          >
                            <RotateCcw className="w-4 h-4" aria-hidden="true" />
                            <span>ريستارت وإعادة من أول جديد</span>
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={handleResetFactory}
                              className="min-h-[42px] px-4 rounded-xl bg-[var(--accent-fire)] text-white font-extrabold text-xs"
                            >
                              تأكيد إعادة الضبط للجميع
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRestart(false)}
                              className="min-h-[42px] px-4 rounded-xl bg-[var(--bg-subtle)] text-xs font-bold"
                            >
                              إلغاء
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* شريط الحفظ العالمي الثابت أسفل لوحة الإدارة */}
                <div className="px-5 py-3.5 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] pb-safe flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="text-xs sm:text-sm font-bold">
                    {saveNotice && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300">
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>{saveNotice}</span>
                      </span>
                    )}
                    {saveError && (
                      <span className="text-[var(--accent-fire)]">{saveError}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveGlobal}
                    disabled={savingGlobal}
                    className="min-h-[46px] px-6 py-2.5 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-sm inline-flex items-center gap-2 shadow-md disabled:opacity-60"
                  >
                    {savingGlobal ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span>حفظ وتطبيق عند الجميع</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
