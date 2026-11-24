/**
 * نافذة حساب العميل وبوابة السائق:
 * - تسجيل الدخول عبر رمز Gmail التحقق
 * - حفظ السلة، المفضلة، نقاط الولاء، سجل المشتريات وآخر طلب مع زر إعادة الطلب
 * - بوابة السائق المسجل: استقبال الطلبات المسندة وتحديث حالتها والشات المباشر مع الإدارة
 */
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  Heart,
  History,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Package,
  Phone,
  RotateCcw,
  Save,
  Send,
  ShoppingBag,
  Truck,
  Upload,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { readApiJson, useSite } from '../context/SiteContext';
import type {
  CartEntry,
  ChatMessage,
  ChatThread,
  CustomerAccount,
  Driver,
  OrderStatus,
  OrderableProduct,
  SubmittedOrderReceipt,
} from '../types/menu';
import { FoodImage } from './FoodImage';
import {
  PRESET_AVATARS,
  UserAvatar,
  compressImageFileToAvatarDataUrl,
} from './UserAvatar';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReorderLastPurchase: (entries: CartEntry[]) => void;
  onOpenDeveloper?: () => void;
  onSelectProduct?: (product: OrderableProduct) => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'تم الاستلام',
  preparing: 'قيد التحضير',
  on_the_way: 'في الطريق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onReorderLastPurchase,
  onOpenDeveloper,
  onSelectProduct,
}) => {
  const {
    siteConfig,
    auth,
    apiFetch,
    setCustomerSession,
    updateUserState,
    impersonateUser,
    logout,
    favorites,
    toggleFavorite,
    setTrackedOrder,
    wsConnected,
    subscribeWs,
    sendWsPayload,
  } = useSite();

  const favoriteProducts = [...siteConfig.offers, ...siteConfig.items].filter((p) =>
    favorites.includes(p.id)
  );

  const currency = siteConfig.restaurant.currency;

  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [registerStep, setRegisterStep] = useState<'form' | 'otp'>('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requireOtpConfirmation, setRequireOtpConfirmation] = useState(true);

  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [code, setCode] = useState('');
  const [challengeKey, setChallengeKey] = useState('');
  const [pending2faLogin, setPending2faLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const [activeView, setActiveView] = useState<'account' | 'driver'>('account');

  // بيانات الحساب القابلة للتعديل
  const [profileName, setProfileName] = useState('');
  const [profileUsername, setProfileUsername] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('preset:crown');
  const [profileBio, setProfileBio] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileArea, setProfileArea] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [profileUsernameStatus, setProfileUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [regUsernameStatus, setRegUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');

  // بيانات بوابة السائق والمحادثة المباشرة مع الإدارة
  const [driverOrders, setDriverOrders] = useState<SubmittedOrderReceipt[]>([]);
  const [driverMessages, setDriverMessages] = useState<ChatMessage[]>([]);
  const [driverChatInput, setDriverChatInput] = useState('');
  const [loadingDriver, setLoadingDriver] = useState(false);

  useEffect(() => {
    if (!auth.user) return;
    setProfileName(auth.user.name || '');
    setProfileUsername(auth.user.username || '');
    setProfileAvatar(auth.user.avatar || 'preset:crown');
    setProfileBio(auth.user.bio || '');
    setProfilePhone(auth.user.phone || '');
    setProfileArea(auth.user.area || '');
    setProfileAddress(auth.user.address || '');
    setProfileUsernameStatus('idle');
  }, [auth.user]);

  // فحص فوري لتوفر اليوزر أثناء التسجيل حتى لا يختار يوزراً مأخوذاً
  useEffect(() => {
    const clean = regUsername.trim().toLowerCase();
    if (!clean) {
      setRegUsernameStatus('idle');
      return;
    }
    if (!/^[a-z0-9_.]{3,24}$/.test(clean)) {
      setRegUsernameStatus('invalid');
      return;
    }
    let active = true;
    setRegUsernameStatus('checking');
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/api/users/check-username?username=${encodeURIComponent(clean)}`
        );
        if (res.ok && active) {
          const data = (await res.json()) as { available?: boolean };
          setRegUsernameStatus(data.available ? 'available' : 'taken');
        }
      } catch {
        if (active) setRegUsernameStatus('idle');
      }
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [regUsername, apiFetch]);

  // فحص فوري لتوفر اليوزر في تعديل البروفايل (يمنع أخذ يوزر شخص آخر)
  useEffect(() => {
    if (!auth.user) return;
    const clean = profileUsername.trim().toLowerCase();
    const current = (auth.user.username || '').trim().toLowerCase();
    if (!clean || clean === current) {
      setProfileUsernameStatus('idle');
      return;
    }
    if (!/^[a-z0-9_.]{3,24}$/.test(clean)) {
      setProfileUsernameStatus('invalid');
      return;
    }
    let active = true;
    setProfileUsernameStatus('checking');
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/api/users/check-username?username=${encodeURIComponent(clean)}`
        );
        if (res.ok && active) {
          const data = (await res.json()) as { available?: boolean };
          setProfileUsernameStatus(data.available ? 'available' : 'taken');
        }
      } catch {
        if (active) setProfileUsernameStatus('idle');
      }
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [profileUsername, auth.user, apiFetch]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // تحميل طلبات السائق ومحادثته عند التبديل لبوابة السائق
  useEffect(() => {
    if (!isOpen || !auth.driverProfile) return;
    const driverThreadId = `driver:${auth.driverProfile.id}`;
    sendWsPayload({ type: 'subscribe_thread', threadId: driverThreadId });

    let active = true;
    const loadDriver = async () => {
      setLoadingDriver(true);
      try {
        const [ordRes, chatRes] = await Promise.all([
          apiFetch('/api/driver/orders', { cache: 'no-store' }),
          apiFetch(`/api/chat/thread?threadId=${encodeURIComponent(driverThreadId)}`, {
            cache: 'no-store',
          }),
        ]);
        if (ordRes.ok && active) {
          const d = (await ordRes.json()) as { orders?: SubmittedOrderReceipt[] };
          setDriverOrders(d.orders || []);
        }
        if (chatRes.ok && active) {
          const c = (await chatRes.json()) as { thread?: ChatThread };
          setDriverMessages(c.thread?.messages || []);
        }
      } catch {
        // تجاهل
      } finally {
        if (active) setLoadingDriver(false);
      }
    };
    loadDriver();
    const pollTimer = !wsConnected ? window.setInterval(loadDriver, 4000) : null;
    return () => {
      active = false;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [isOpen, auth.driverProfile, apiFetch, sendWsPayload, wsConnected]);

  useEffect(() => {
    if (!auth.driverProfile) return;
    const driverThreadId = `driver:${auth.driverProfile.id}`;
    return subscribeWs((evt) => {
      if (evt.type === 'chat:message' && evt.threadId === driverThreadId && evt.message) {
        setDriverMessages((prev) =>
          prev.some((m) => m.id === evt.message!.id) ? prev : [...prev, evt.message!]
        );
      } else if (evt.type === 'order:updated' && evt.order) {
        const updated = evt.order as SubmittedOrderReceipt;
        setDriverOrders((prev) =>
          prev.map((o) => (o.orderId === updated.orderId ? updated : o))
        );
      }
    });
  }, [auth.driverProfile, subscribeWs]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    const clean = email.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setErrorMsg('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email: clean }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        challengeKey?: string;
        message?: string;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok || !data.challengeKey) {
        setErrorMsg(data.error || 'تعذر إرسال رمز التحقق حالياً');
        setLoading(false);
        return;
      }
      setChallengeKey(data.challengeKey);
      setPending2faLogin(false);
      setStep('code');
      setInfoMsg(data.message || 'تم إرسال الرمز إلى بريدك الإلكتروني');
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'تعذر الاتصال بالخادم يرجى المحاولة مجدداً'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    const clean = email.trim().toLowerCase();
    if (!clean) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني أو اليوزر');
      return;
    }
    if (!password) {
      setErrorMsg('يرجى إدخال كلمة المرور');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/login-password', {
        method: 'POST',
        body: JSON.stringify({
          identifier: clean,
          email: clean,
          password,
          requireOtpConfirmation,
        }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        requiresOtp?: boolean;
        challengeKey?: string;
        email?: string;
        message?: string;
        token?: string;
        user?: CustomerAccount;
        driverProfile?: Driver | null;
        isDeveloper?: boolean;
        isPrimaryDeveloper?: boolean;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'تعذر تسجيل الدخول');
        setLoading(false);
        return;
      }

      if (data.requiresOtp && data.challengeKey) {
        if (data.email) setEmail(data.email);
        setChallengeKey(data.challengeKey);
        setPending2faLogin(true);
        setStep('code');
        setInfoMsg(data.message || 'تم إرسال رمز تأكيد الدخول إلى بريدك الإلكتروني');
        setLoading(false);
        return;
      }

      if (data.token && data.user) {
        setCustomerSession(data.token, data.user, data.driverProfile || null, {
          isDeveloper: data.isDeveloper,
          isPrimaryDeveloper: data.isPrimaryDeveloper,
        });
        setPassword('');
        setCode('');
        setStep('email');
        setInfoMsg('');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'تعذر الاتصال بالخادم يرجى المحاولة مجدداً'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('يرجى إدخال رمز التحقق المكون من ستة أرقام');
      return;
    }

    setLoading(true);
    try {
      const endpoint = pending2faLogin ? '/api/auth/verify-login-2fa' : '/api/auth/verify-otp';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          challengeKey,
          email: email.trim().toLowerCase(),
          code: cleanCode,
        }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        token?: string;
        user?: CustomerAccount;
        driverProfile?: Driver | null;
        isDeveloper?: boolean;
        isPrimaryDeveloper?: boolean;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok || !data.token || !data.user) {
        setErrorMsg(data.error || 'رمز التحقق غير صحيح');
        setLoading(false);
        return;
      }
      setCustomerSession(data.token, data.user, data.driverProfile || null, {
        isDeveloper: data.isDeveloper,
        isPrimaryDeveloper: data.isPrimaryDeveloper,
      });
      setCode('');
      setPassword('');
      setPending2faLogin(false);
      setStep('email');
      setInfoMsg('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'تعذر التحقق من الرمز يرجى المحاولة مرة أخرى'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    const cleanName = regName.trim();
    const cleanUsername = regUsername.trim().replace(/^@+/, '').toLowerCase();
    const cleanEmail = regEmail.trim().toLowerCase();
    if (cleanName.length < 2) {
      setErrorMsg('يرجى إدخال الاسم الكامل');
      return;
    }
    if (!/^[a-z0-9_.]{3,24}$/.test(cleanUsername)) {
      setErrorMsg('يرجى اختيار يوزر بالإنجليزية (3 إلى 24 حرفاً/أرقاماً أو _ أو .)');
      return;
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMsg('يجب أن تكون كلمة المرور ستة أحرف على الأقل');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register/request-otp', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          username: cleanUsername,
          email: cleanEmail,
          password: regPassword,
        }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        challengeKey?: string;
        message?: string;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok || !data.challengeKey) {
        setErrorMsg(data.error || 'تعذر إرسال رمز تأكيد إنشاء الحساب');
        setLoading(false);
        return;
      }
      setChallengeKey(data.challengeKey);
      setCode('');
      setRegisterStep('otp');
      setInfoMsg(data.message || 'تم إرسال رمز تأكيد الحساب إلى بريدك الإلكتروني');
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'تعذر الاتصال بالخادم يرجى المحاولة مجدداً'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('يرجى إدخال رمز التأكيد المكون من ستة أرقام');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/register/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          challengeKey,
          email: regEmail.trim().toLowerCase(),
          code: cleanCode,
        }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        token?: string;
        user?: CustomerAccount;
        driverProfile?: Driver | null;
        isDeveloper?: boolean;
        isPrimaryDeveloper?: boolean;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok || !data.token || !data.user) {
        setErrorMsg(data.error || 'رمز التأكيد غير صحيح');
        setLoading(false);
        return;
      }
      setCustomerSession(data.token, data.user, data.driverProfile || null, {
        isDeveloper: data.isDeveloper,
        isPrimaryDeveloper: data.isPrimaryDeveloper,
      });
      setCode('');
      setRegPassword('');
      setRegConfirmPassword('');
      setRegisterStep('form');
      setInfoMsg('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'تعذر تأكيد إنشاء الحساب يرجى المحاولة مجدداً'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    setErrorMsg('');
    try {
      const dataUrl = await compressImageFileToAvatarDataUrl(file);
      setProfileAvatar(dataUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر معالجة صورة البروفايل');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    if (profileUsernameStatus === 'taken') {
      setErrorMsg('هذا اليوزر مستخدم لشخص آخر بالفعل، لا يمكنك تغييره إلى نفس اليوزر');
      return;
    }
    if (profileUsernameStatus === 'invalid') {
      setErrorMsg('اسم المستخدم يجب أن يكون 3 إلى 24 حرفاً إنجليزياً صغيراً أو أرقاماً أو _ أو .');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiFetch('/api/account/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: profileName.trim(),
          username: profileUsername.trim(),
          avatar: profileAvatar,
          bio: profileBio.trim(),
          phone: profilePhone.trim(),
          area: profileArea.trim(),
          address: profileAddress.trim(),
        }),
      });
      const data = await readApiJson<{
        ok?: boolean;
        user?: CustomerAccount;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok || !data.user) {
        setErrorMsg(data.error || 'تعذر حفظ البيانات');
      } else {
        updateUserState(data.user);
        setProfileUsernameStatus('idle');
        setInfoMsg('تم حفظ بيانات البروفايل والحساب بنجاح');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'تعذر الاتصال بالخادم'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDriverOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await apiFetch(`/api/driver/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = (await res.json()) as { order?: SubmittedOrderReceipt };
        if (data.order) {
          setDriverOrders((prev) =>
            prev.map((o) => (o.orderId === data.order!.orderId ? data.order! : o))
          );
        }
      }
    } catch {
      // تجاهل
    }
  };

  const handleDriverSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.driverProfile || !driverChatInput.trim()) return;
    try {
      const res = await apiFetch('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          text: driverChatInput.trim(),
          asDriver: true,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { message?: ChatMessage };
        setDriverChatInput('');
        if (data.message) {
          setDriverMessages((prev) =>
            prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!]
          );
        }
      }
    } catch {
      // تجاهل
    }
  };

  const handleReorder = (order: SubmittedOrderReceipt) => {
    const allProducts = [...siteConfig.offers, ...siteConfig.items];
    const productById = Object.fromEntries(allProducts.map((p) => [p.id, p]));
    const restored: CartEntry[] = order.items.map((item, idx) => {
      const prod = productById[item.itemId];
      return {
        cartKey: `${item.itemId}__reorder_${Date.now()}_${idx}`,
        itemId: item.itemId,
        name: item.name,
        image: prod?.image || '/images/zoldix-signature.jpg',
        basePrice: item.unitPrice,
        variantName: item.variantName,
        quantity: item.quantity,
        addonIds: item.addons.map((a) => a.id),
        addons: item.addons,
        notes: item.notes,
        unitPrice: item.unitPrice,
      };
    });
    onReorderLastPurchase(restored);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 safari-blur p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="w-full sm:max-w-xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-[var(--shadow-modal)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-[var(--accent-gold)]" aria-hidden="true" />
                <h2 id="account-modal-title" className="font-display font-black text-xl">
                  {auth.user ? `حساب ${auth.user.name}` : 'تسجيل الدخول وحفظ المشتريات'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق نافذة الحساب"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {auth.user && auth.driverProfile && (
              <div className="px-5 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveView('account')}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold ${
                    activeView === 'account'
                      ? 'bg-[var(--accent-fire)] text-white'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  حسابي والمشتريات
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('driver')}
                  className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 ${
                    activeView === 'driver'
                      ? 'bg-[var(--accent-gold)] text-[#13100E]'
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Truck className="w-4 h-4" aria-hidden="true" />
                  <span>بوابة السائق ({driverOrders.length})</span>
                </button>
              </div>
            )}

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 pb-safe">
              {!auth.user ? (
                <div className="space-y-4">
                  {/* تبويب تسجيل الدخول أو إنشاء حساب جديد */}
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('login');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className={`min-h-[42px] rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        authTab === 'login'
                          ? 'bg-[var(--accent-fire)] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <KeyRound className="w-4 h-4" aria-hidden="true" />
                      <span>تسجيل الدخول</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('register');
                        setErrorMsg('');
                        setInfoMsg('');
                      }}
                      className={`min-h-[42px] rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        authTab === 'register'
                          ? 'bg-[var(--accent-gold)] text-[#13100E]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      <span>إنشاء حساب جديد</span>
                    </button>
                  </div>

                  {authTab === 'login' ? (
                    step === 'email' ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLoginMethod('password');
                              setErrorMsg('');
                              setInfoMsg('');
                            }}
                            className={`min-h-[38px] rounded-xl text-xs font-bold border transition-colors ${
                              loginMethod === 'password'
                                ? 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--accent-gold)]'
                                : 'bg-[var(--bg-canvas)] border-[var(--border-hairline)] text-[var(--text-secondary)]'
                            }`}
                          >
                            كلمة المرور وتأكيد Gmail
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLoginMethod('otp');
                              setErrorMsg('');
                              setInfoMsg('');
                            }}
                            className={`min-h-[38px] rounded-xl text-xs font-bold border transition-colors ${
                              loginMethod === 'otp'
                                ? 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--accent-gold)]'
                                : 'bg-[var(--bg-canvas)] border-[var(--border-hairline)] text-[var(--text-secondary)]'
                            }`}
                          >
                            رمز Gmail السريع
                          </button>
                        </div>

                        {loginMethod === 'password' ? (
                          <form onSubmit={handlePasswordLogin} className="space-y-4">
                            <div>
                              <label htmlFor="login-email" className="block text-sm font-bold mb-1.5">
                                البريد الإلكتروني أو اليوزر (@username)
                              </label>
                              <input
                                id="login-email"
                                type="text"
                                dir="ltr"
                                autoComplete="username"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@gmail.com or @username"
                                className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-left text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                              />
                            </div>

                            <div>
                              <label htmlFor="login-pass" className="block text-sm font-bold mb-1.5">
                                كلمة المرور
                              </label>
                              <div className="relative">
                                <input
                                  id="login-pass"
                                  type={showPassword ? 'text' : 'password'}
                                  autoComplete="current-password"
                                  required
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  placeholder="أدخل كلمة المرور"
                                  className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 pl-12 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((v) => !v)}
                                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] cursor-pointer text-xs sm:text-sm">
                              <input
                                type="checkbox"
                                checked={requireOtpConfirmation}
                                onChange={(e) => setRequireOtpConfirmation(e.target.checked)}
                                className="w-4 h-4 accent-[var(--accent-fire)] shrink-0"
                              />
                              <span className="font-bold text-[var(--text-secondary)]">
                                طلب رمز تأكيد عبر Gmail عند تسجيل الدخول (حماية إضافية)
                              </span>
                            </label>

                            {errorMsg && (
                              <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                                {errorMsg}
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full min-h-[48px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                            >
                              {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                              ) : (
                                <KeyRound className="w-5 h-5" aria-hidden="true" />
                              )}
                              <span>
                                {loading
                                  ? 'جاري التحقق'
                                  : requireOtpConfirmation
                                    ? 'متابعة وإرسال رمز التأكيد'
                                    : 'دخول مباشر'}
                              </span>
                            </button>
                          </form>
                        ) : (
                          <form onSubmit={handleRequestOtp} className="space-y-4">
                            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                              أدخل بريدك الإلكتروني ليصلك رمز دخول فوري مكون من ستة أرقام
                            </p>
                            <div>
                              <label htmlFor="otp-email" className="block text-sm font-bold mb-1.5">
                                البريد الإلكتروني
                              </label>
                              <input
                                id="otp-email"
                                type="email"
                                dir="ltr"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@gmail.com"
                                className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-left text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                              />
                            </div>

                            {errorMsg && (
                              <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                                {errorMsg}
                              </div>
                            )}

                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full min-h-[48px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                            >
                              {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                              ) : (
                                <Mail className="w-5 h-5" aria-hidden="true" />
                              )}
                              <span>{loading ? 'جاري إرسال الرمز' : 'إرسال رمز الدخول إلى البريد'}</span>
                            </button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={handleVerifyOtp} className="space-y-4">
                        <div className="p-3.5 rounded-2xl bg-[var(--accent-gold-soft)] border border-[var(--accent-gold)]/40 text-xs sm:text-sm font-bold">
                          {infoMsg || `تم إرسال رمز التحقق إلى ${email}`}
                        </div>

                        <div>
                          <label htmlFor="otp-code" className="block text-sm font-bold mb-1.5">
                            أدخل رمز التحقق المكون من ستة أرقام
                          </label>
                          <input
                            id="otp-code"
                            type="text"
                            inputMode="numeric"
                            dir="ltr"
                            maxLength={6}
                            required
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="123456"
                            className="w-full min-h-[52px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-center font-mono text-2xl tracking-[0.4em] text-[var(--text-primary)]"
                          />
                        </div>

                        {errorMsg && (
                          <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                            {errorMsg}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="submit"
                            disabled={loading}
                            className="min-h-[48px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {loading ? (
                              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                            )}
                            <span>تأكيد والدخول</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setStep('email');
                              setPending2faLogin(false);
                              setErrorMsg('');
                            }}
                            className="min-h-[48px] rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] font-bold text-sm"
                          >
                            رجوع
                          </button>
                        </div>
                      </form>
                    )
                  ) : registerStep === 'form' ? (
                    <form onSubmit={handleRegisterRequestOtp} className="space-y-3.5">
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        أنشئ حسابك بكلمة سر خاصة مع تأكيد البريد الإلكتروني عبر Gmail لحفظ سلتك ومشترياتك ونقاطك
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="reg-name" className="block text-sm font-bold mb-1">
                            الاسم الكامل
                          </label>
                          <input
                            id="reg-name"
                            type="text"
                            required
                            value={regName}
                            onChange={(e) => setRegName(e.target.value)}
                            placeholder="أدخل اسمك الكامل"
                            className="w-full min-h-[46px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2 text-[var(--text-primary)]"
                          />
                        </div>

                        <div>
                          <label htmlFor="reg-username" className="block text-sm font-bold mb-1">
                            اختر يوزر (@username)
                          </label>
                          <input
                            id="reg-username"
                            type="text"
                            dir="ltr"
                            required
                            value={regUsername}
                            onChange={(e) =>
                              setRegUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase())
                            }
                            placeholder="username"
                            className="w-full min-h-[46px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2 text-left text-[var(--text-primary)]"
                          />
                          {regUsernameStatus === 'taken' && (
                            <p className="text-[11px] font-bold text-[var(--accent-fire)] mt-1">
                              هذا اليوزر مستخدم لشخص آخر بالفعل، يرجى اختيار يوزر مختلف
                            </p>
                          )}
                          {regUsernameStatus === 'available' && (
                            <p className="text-[11px] font-bold text-emerald-300 mt-1">
                              هذا اليوزر متاح للاستخدام
                            </p>
                          )}
                          {regUsernameStatus === 'invalid' && (
                            <p className="text-[11px] font-bold text-[var(--accent-gold)] mt-1">
                              3 إلى 24 حرفاً إنجليزياً أو أرقاماً أو _ أو .
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reg-email" className="block text-sm font-bold mb-1">
                          البريد الإلكتروني (Gmail)
                        </label>
                        <input
                          id="reg-email"
                          type="email"
                          dir="ltr"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="name@gmail.com"
                          className="w-full min-h-[46px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2 text-left text-[var(--text-primary)]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="reg-pass" className="block text-xs font-bold mb-1">
                            كلمة السر (6 أحرف فأكثر)
                          </label>
                          <input
                            id="reg-pass"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder="••••••"
                            className="w-full min-h-[46px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2 text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label htmlFor="reg-pass2" className="block text-xs font-bold mb-1">
                            تأكيد كلمة السر
                          </label>
                          <input
                            id="reg-pass2"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={regConfirmPassword}
                            onChange={(e) => setRegConfirmPassword(e.target.value)}
                            placeholder="••••••"
                            className="w-full min-h-[46px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2 text-[var(--text-primary)]"
                          />
                        </div>
                      </div>

                      {errorMsg && (
                        <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                          {errorMsg}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full min-h-[48px] rounded-2xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-display font-black text-base flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                      >
                        {loading ? (
                          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                        ) : (
                          <UserPlus className="w-5 h-5" aria-hidden="true" />
                        )}
                        <span>{loading ? 'جاري إرسال رمز التأكيد' : 'إرسال رمز التأكيد إلى Gmail'}</span>
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegisterVerifyOtp} className="space-y-4">
                      <div className="p-3.5 rounded-2xl bg-[var(--accent-gold-soft)] border border-[var(--accent-gold)]/40 text-xs sm:text-sm font-bold">
                        {infoMsg || `أدخل الرمز المرسل إلى ${regEmail} لتأكيد إنشاء الحساب`}
                      </div>

                      <div>
                        <label htmlFor="reg-otp-code" className="block text-sm font-bold mb-1.5">
                          رمز تأكيد البريد الإلكتروني
                        </label>
                        <input
                          id="reg-otp-code"
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          maxLength={6}
                          required
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          className="w-full min-h-[52px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-center font-mono text-2xl tracking-[0.4em] text-[var(--text-primary)]"
                        />
                      </div>

                      {errorMsg && (
                        <div className="p-3 rounded-xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold">
                          {errorMsg}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="submit"
                          disabled={loading}
                          className="min-h-[48px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-base flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                          )}
                          <span>تأكيد وإنشاء الحساب</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRegisterStep('form');
                            setErrorMsg('');
                          }}
                          className="min-h-[48px] rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-primary)] font-bold text-sm"
                        >
                          تعديل البيانات
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : activeView === 'driver' && auth.driverProfile ? (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-gold)]/40 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-display font-black text-base text-[var(--accent-gold)]">
                        مرحباً بالكابتن {auth.driverProfile.name}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {auth.driverProfile.vehicle}
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                      {auth.driverProfile.active ? 'متاح للتوصيل' : 'غير نشط'}
                    </span>
                  </div>

                  {/* الطلبات المسندة للسائق */}
                  <div className="space-y-3">
                    <h3 className="font-display font-bold text-base">
                      الطلبات المسندة إليك ({driverOrders.length})
                    </h3>
                    {loadingDriver ? (
                      <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                        جاري تحميل الطلبات
                      </div>
                    ) : driverOrders.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-dashed border-[var(--border-hairline)] text-xs text-center text-[var(--text-muted)]">
                        لا توجد طلبات مسندة لك حالياً
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {driverOrders.map((ord) => (
                          <div
                            key={ord.orderId}
                            className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-display font-black text-sm text-[var(--accent-gold)]">
                                طلب #{ord.orderId}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-[var(--bg-subtle)] text-xs font-bold">
                                {STATUS_LABELS[ord.status] || ord.status}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] space-y-1">
                              <div>العميل {ord.name} في {ord.area}</div>
                              <div>العنوان {ord.address}</div>
                              <div>المطلوب تحصيله {formatPrice(ord.total, ord.currency)}</div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {ord.phone && (
                                <a
                                  href={`tel:${ord.phone}`}
                                  dir="ltr"
                                  className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs font-bold inline-flex items-center gap-1"
                                >
                                  <Phone className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                                  <span>{ord.phone}</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDriverOrderStatus(ord.orderId, 'on_the_way')}
                                className="min-h-[38px] px-3 rounded-xl bg-[var(--accent-fire)] text-white text-xs font-extrabold"
                              >
                                في الطريق الآن
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDriverOrderStatus(ord.orderId, 'delivered')}
                                className="min-h-[38px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-extrabold"
                              >
                                تم التوصيل
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* تواصل السائق المباشر مع الإدارة */}
                  <div className="rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] flex items-center gap-2 font-display font-bold text-sm">
                      <MessageCircle className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                      <span>تواصل مباشر مع إدارة المطعم</span>
                    </div>
                    <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                      {driverMessages.length === 0 ? (
                        <div className="text-xs text-center text-[var(--text-muted)] py-4">
                          لا توجد رسائل مع الإدارة بعد
                        </div>
                      ) : (
                        driverMessages.map((m) => (
                          <div
                            key={m.id}
                            className={`max-w-[82%] p-2.5 rounded-xl text-xs ${
                              m.senderRole === 'driver'
                                ? 'mr-auto bg-[var(--accent-fire)] text-white'
                                : 'ml-auto bg-[var(--bg-surface)] border border-[var(--border-hairline)]'
                            }`}
                          >
                            <div className="opacity-75 text-[10px] mb-0.5">{m.senderLabel}</div>
                            <div>{m.text}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <form
                      onSubmit={handleDriverSendChat}
                      className="p-2.5 border-t border-[var(--border-hairline)] flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={driverChatInput}
                        onChange={(e) => setDriverChatInput(e.target.value)}
                        placeholder="أرسل رسالة لإدارة المطعم"
                        className="flex-1 min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs"
                      />
                      <button
                        type="submit"
                        className="min-h-[42px] px-3.5 rounded-xl bg-[var(--accent-fire)] text-white font-bold text-xs inline-flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>إرسال</span>
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {auth.isDeveloper && onOpenDeveloper && (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-[#241D19] to-[#171310] border border-[var(--accent-gold)]/55 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-display font-black text-sm text-[var(--accent-gold)]">
                          وضع المطورين مفعل تلقائياً لهذا الحساب
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          يمكنك تعديل الموقع، إضافة حسابات مطورين، وتنزيل الموقع كامل بصيغة ZIP
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDeveloper();
                        }}
                        className="min-h-[42px] px-4 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-black text-xs inline-flex items-center gap-1.5"
                      >
                        <Code2 className="w-4 h-4" aria-hidden="true" />
                        <span>بوابة المطورين و ZIP</span>
                      </button>
                    </div>
                  )}

                  {/* بطاقة معلومات الحساب والنقاط والمفضلة */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar
                          avatar={auth.user.avatar}
                          name={auth.user.name}
                          size="lg"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="font-display font-black text-base truncate">
                            {auth.user.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate" dir="ltr">
                            {auth.user.email}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {auth.user.username && (
                              <span
                                dir="ltr"
                                className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[var(--accent-gold-soft)] text-[var(--accent-gold)] font-mono font-bold text-xs"
                              >
                                @{auth.user.username}
                              </span>
                            )}
                            {auth.user.bio && (
                              <span className="text-xs text-[var(--text-secondary)] truncate">
                                {auth.user.bio}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {auth.impersonating ? (
                        <button
                          type="button"
                          onClick={() => {
                            impersonateUser(null);
                            onClose();
                          }}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--accent-fire)] text-white text-xs font-bold inline-flex items-center gap-1"
                        >
                          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>الخروج من الحساب</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={logout}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold inline-flex items-center gap-1"
                        >
                          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>خروج</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-hairline)]">
                      <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] text-center">
                        <div className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-gold)] font-bold">
                          <Award className="w-3.5 h-3.5" />
                          <span>نقاط الولاء</span>
                        </div>
                        <div className="font-display font-black text-base tabular-nums mt-0.5">
                          {auth.user.loyaltyPoints || 0}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] text-center">
                        <div className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-fire)] font-bold">
                          <Heart className="w-3.5 h-3.5" />
                          <span>المفضلة</span>
                        </div>
                        <div className="font-display font-black text-base tabular-nums mt-0.5">
                          {favorites.length}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] text-center">
                        <div className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)] font-bold">
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>السلة</span>
                        </div>
                        <div className="font-display font-black text-base tabular-nums mt-0.5">
                          {auth.user.cart.reduce((s, c) => s + c.quantity, 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* قسم قائمة المفضلة للوصول السريع للوجبات المحفوظة */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-fire)]/35 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-display font-black text-base text-[var(--text-primary)]">
                        <Heart className="w-4 h-4 fill-[var(--accent-fire)] text-[var(--accent-fire)]" aria-hidden="true" />
                        <span>قائمة المفضلة ({favoriteProducts.length})</span>
                      </div>
                      <span className="text-[11px] font-bold text-[var(--text-muted)]">
                        وصول سريع لوجباتك
                      </span>
                    </div>

                    {favoriteProducts.length === 0 ? (
                      <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-dashed border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] text-center">
                        لا توجد وجبات محفوظة في المفضلة بعد، اضغط على زر القلب على أي وجبة لإضافتها هنا
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pl-1">
                        {favoriteProducts.map((prod) => (
                          <div
                            key={prod.id}
                            className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-14 h-14 rounded-xl overflow-hidden bg-[var(--bg-subtle)] shrink-0">
                                <FoodImage src={prod.image} alt={prod.name} className="w-full h-full" />
                              </div>
                              <div className="min-w-0">
                                <div className="font-display font-extrabold text-sm truncate">
                                  {prod.name}
                                </div>
                                <div className="tabular-nums text-xs font-black text-[var(--accent-gold)] mt-0.5">
                                  {formatPrice(prod.price, currency)}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {onSelectProduct && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectProduct(prod);
                                    onClose();
                                  }}
                                  className="min-h-[36px] px-3 rounded-xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white text-xs font-extrabold whitespace-nowrap"
                                >
                                  طلب سريع
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleFavorite(prod.id)}
                                aria-label={`إزالة ${prod.name} من المفضلة`}
                                className="w-9 h-9 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] flex items-center justify-center"
                              >
                                <Heart className="w-4 h-4 fill-[var(--accent-fire)]" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* آخر عملية شراء محفوظة مع الحالة المباشرة وزر إعادة الطلب */}
                  {auth.user.lastOrder && (
                    <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-gold)]/50 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-display font-black text-base text-[var(--accent-gold)]">
                          <Package className="w-4 h-4" aria-hidden="true" />
                          <span>آخر عملية شراء لك</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-lg bg-[var(--accent-fire-soft)] text-[var(--accent-gold)] text-xs font-extrabold">
                          {STATUS_LABELS[auth.user.lastOrder.status || 'received']}
                        </span>
                      </div>

                      <div className="text-xs text-[var(--text-secondary)] space-y-1">
                        <div>
                          رقم الطلب #{auth.user.lastOrder.orderId} بقيمة{' '}
                          {formatPrice(auth.user.lastOrder.total, auth.user.lastOrder.currency || currency)}
                        </div>
                        <div>
                          الأصناف {auth.user.lastOrder.items.map((i) => `${i.name} × ${i.quantity}`).join('، ')}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleReorder(auth.user!.lastOrder!)}
                          className="min-h-[44px] rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-extrabold text-sm inline-flex items-center justify-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4" aria-hidden="true" />
                          <span>إعادة الطلب</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTrackedOrder(auth.user!.lastOrder!);
                            onClose();
                          }}
                          className="min-h-[44px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs font-bold"
                        >
                          تتبع هذا الطلب الآن
                        </button>
                      </div>
                    </div>
                  )}

                  {/* تعديل البروفايل واختيار الصورة واليوزر */}
                  <form onSubmit={handleSaveProfile} className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display font-black text-base">تعديل البروفايل واليوزر</h3>
                      <span className="text-[11px] font-bold text-[var(--text-muted)]">
                        لكل حساب يوزر فريد واحد فقط
                      </span>
                    </div>

                    {/* اختيار صورة البروفايل الجاهزة أو رفع صورة خاصة */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            avatar={profileAvatar}
                            name={profileName || auth.user.name}
                            size="md"
                          />
                          <div>
                            <div className="text-xs font-extrabold text-[var(--text-primary)]">
                              صورة البروفايل المختارة
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)]">
                              اختر أي صورة من القائمة أو ارفع صورتك الخاصة
                            </div>
                          </div>
                        </div>

                        <label className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
                          <span>{uploadingAvatar ? 'جاري التجهيز' : 'رفع صورة من جهازك'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {PRESET_AVATARS.map((preset) => {
                          const selected = profileAvatar === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setProfileAvatar(preset.id)}
                              title={preset.label}
                              className={`p-1.5 rounded-2xl border flex flex-col items-center gap-1 transition-all ${
                                selected
                                  ? 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] scale-[1.03]'
                                  : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                              }`}
                            >
                              <UserAvatar avatar={preset.id} name={preset.label} size="sm" />
                              <span className="text-[10px] font-bold truncate max-w-full">
                                {preset.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                          الاسم الظاهر في البروفايل
                        </label>
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="الاسم الكامل"
                          className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-[var(--text-primary)]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                          اليوزر الفريد (@username)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          required
                          value={profileUsername}
                          onChange={(e) =>
                            setProfileUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase())
                          }
                          placeholder="username"
                          className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left font-mono text-[var(--text-primary)]"
                        />
                        {profileUsernameStatus === 'taken' && (
                          <p className="text-[11px] font-bold text-[var(--accent-fire)] mt-1">
                            نفس هذا اليوزر مملوك لشخص آخر ولا يمكنك تغييره إليه
                          </p>
                        )}
                        {profileUsernameStatus === 'available' && (
                          <p className="text-[11px] font-bold text-emerald-300 mt-1">
                            هذا اليوزر متاح ويمكنك اعتماده
                          </p>
                        )}
                        {profileUsernameStatus === 'invalid' && (
                          <p className="text-[11px] font-bold text-[var(--accent-gold)] mt-1">
                            3 إلى 24 حرفاً إنجليزياً صغيراً أو أرقاماً أو _ أو .
                          </p>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1">
                          نبذة البروفايل (اختياري)
                        </label>
                        <input
                          type="text"
                          maxLength={160}
                          value={profileBio}
                          onChange={(e) => setProfileBio(e.target.value)}
                          placeholder="اكتب جملة قصيرة تظهر في ملفك عند البحث عنك"
                          className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-[var(--text-primary)]"
                        />
                      </div>

                      <input
                        type="tel"
                        dir="ltr"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="رقم الهاتف"
                        className="min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-right text-[var(--text-primary)]"
                      />
                      <input
                        type="text"
                        value={profileArea}
                        onChange={(e) => setProfileArea(e.target.value)}
                        placeholder="المنطقة"
                        className="min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-[var(--text-primary)]"
                      />
                      <input
                        type="text"
                        value={profileAddress}
                        onChange={(e) => setProfileAddress(e.target.value)}
                        placeholder="العنوان التفصيلي"
                        className="sm:col-span-2 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-[var(--text-primary)]"
                      />
                    </div>

                    {infoMsg && (
                      <div className="text-xs font-bold text-emerald-300">{infoMsg}</div>
                    )}
                    {errorMsg && (
                      <div className="text-xs font-bold text-[var(--accent-fire)]">{errorMsg}</div>
                    )}

                    <button
                      type="submit"
                      disabled={savingProfile || profileUsernameStatus === 'taken' || profileUsernameStatus === 'invalid'}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] disabled:opacity-50 text-white text-sm font-extrabold inline-flex items-center gap-2 transition-colors"
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      <span>{savingProfile ? 'جاري الحفظ' : 'حفظ البروفايل والبيانات'}</span>
                    </button>
                  </form>

                  {/* سجل جميع المشتريات السابقة */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 font-display font-bold text-base">
                      <History className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                      <span>سجل المشتريات ({auth.user.orders.length})</span>
                    </div>

                    {auth.user.orders.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-dashed border-[var(--border-hairline)] text-xs sm:text-sm text-[var(--text-secondary)] text-center">
                        لا توجد طلبات مسجلة بعد في هذا الحساب
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-56 overflow-y-auto pl-1">
                        {auth.user.orders.map((ord) => (
                          <div
                            key={ord.orderId}
                            className="p-3.5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-[var(--text-primary)]">
                                طلب #{ord.orderId} ({STATUS_LABELS[ord.status || 'received']})
                              </div>
                              <div className="text-xs text-[var(--text-muted)] truncate">
                                {ord.items.map((i) => `${i.name} × ${i.quantity}`).join('، ')}
                              </div>
                            </div>
                            <div className="text-left shrink-0 space-y-1">
                              <div className="tabular-nums font-bold text-sm text-[var(--accent-gold)]">
                                {formatPrice(ord.total, ord.currency || currency)}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleReorder(ord)}
                                className="text-xs font-bold text-[var(--accent-fire)] underline"
                              >
                                إعادة الطلب
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
