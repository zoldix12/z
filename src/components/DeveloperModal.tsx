/**
 * استوديو المطورين الشامل الموحد (متزامن لحظياً مع التعديل المباشر على الواجهة):
 * - تبويب 1: النسخة الكاملة ZIP + وضع التعديل المباشر + إدارة حسابات المطورين + المؤشرات الحية
 * - تبويب 2: منشئ الموقع وتحويله (الهوية، الشعار، تحويل الروابط والأزرار، الثيم، الأقسام المخصصة ومشهد المنتصف)
 * - تبويب 3: إدارة الأقسام والعروض والأصناف والصور بسهولة تامة (رفع من الجهاز أو عبر رابط)
 * - تبويب 4: إعدادات SMTP و Stripe API الديناميكية مع اختبار الاتصال قبل الحفظ
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Code2,
  CreditCard,
  Download,
  ImagePlus,
  Layers,
  Link2,
  Loader2,
  Mail,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { useSite } from '../context/SiteContext';
import type { CustomSection, MenuItem, OfferItem, SiteTheme } from '../types/menu';
import { FoodImage } from './FoodImage';

interface DeveloperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAdminPanel?: () => void;
}

type DevTab = 'overview' | 'builder' | 'catalog' | 'integrations';

interface DeveloperStatusResponse {
  ok?: boolean;
  currentEmail?: string;
  primaryDeveloperEmail?: string;
  developerEmails?: string[];
  metrics?: {
    wsClientsCount: number;
    ordersCount: number;
    paidOnlineCount: number;
    usersCount: number;
    couponsCount: number;
    driversCount: number;
    smtpConfigured: boolean;
    stripeConfigured: boolean;
    nodeVersion: string;
    uptimeSec: number;
  };
  error?: string;
}

const DEV_PALETTES: Array<{ label: string; theme: SiteTheme }> = [
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

export const DeveloperModal: React.FC<DeveloperModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    auth,
    apiFetch,
    isEditMode,
    setIsEditMode,
    draftConfig,
    setDraftConfig,
    hasUnsavedDraft,
    savingGlobal,
    saveDraftConfigGlobal,
    resetSiteToFactory,
    setDeveloperMode,
  } = useSite();

  const [activeTab, setActiveTab] = useState<DevTab>('overview');
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<DeveloperStatusResponse | null>(null);
  const [newDevEmail, setNewDevEmail] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // تصفية الأصناف في الاستوديو
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState<string>('all');

  // إعدادات SMTP & Stripe الديناميكية للمطورين
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

  const handleImageUpload = (file: File | undefined, onResult: (dataUrl: string) => void) => {
    if (!file) return;
    if (file.size > 1_500_000) {
      setErrorMsg('حجم الصورة كبير جداً يرجى اختيار صورة أصغر من 1.5 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setErrorMsg('');
        onResult(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const loadDeveloperData = async () => {
    if (!auth.isDeveloper) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const [statusRes, integrationsRes] = await Promise.all([
        apiFetch('/api/developer/status', { cache: 'no-store' }),
        apiFetch('/api/admin/integrations', { cache: 'no-store' }),
      ]);
      const data = (await statusRes.json()) as DeveloperStatusResponse;
      if (statusRes.ok && data.ok) {
        setStatusData(data);
      } else {
        setErrorMsg(data.error || 'تعذر تحميل بيانات المطورين');
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
      setErrorMsg('تعذر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadDeveloperData();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !downloadingZip) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, auth.isDeveloper]);

  const handleAddDeveloper = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newDevEmail.trim().toLowerCase();
    if (!clean) return;
    setSavingAccount(true);
    setErrorMsg('');
    setNotice('');
    try {
      const res = await apiFetch('/api/developer/accounts', {
        method: 'POST',
        body: JSON.stringify({ email: clean }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        primaryDeveloperEmail?: string;
        developerEmails?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'تعذر إضافة حساب المطور');
      } else {
        setStatusData((prev) => ({
          ...(prev || {}),
          primaryDeveloperEmail: data.primaryDeveloperEmail || prev?.primaryDeveloperEmail,
          developerEmails: data.developerEmails || [],
        }));
        setNewDevEmail('');
        setNotice(`تم منح صلاحية وضع المطورين للحساب ${clean}`);
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleRemoveDeveloper = async (email: string) => {
    setErrorMsg('');
    setNotice('');
    try {
      const res = await apiFetch(`/api/developer/accounts/${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        primaryDeveloperEmail?: string;
        developerEmails?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'تعذر إزالة الحساب');
      } else {
        setStatusData((prev) => ({
          ...(prev || {}),
          primaryDeveloperEmail: data.primaryDeveloperEmail || prev?.primaryDeveloperEmail,
          developerEmails: data.developerEmails || [],
        }));
        setNotice(`تمت إزالة صلاحية المطور عن ${email}`);
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم');
    }
  };

  const handleDownloadFullZip = async () => {
    if (downloadingZip) return;
    setDownloadingZip(true);
    setErrorMsg('');
    setNotice('');
    try {
      const res = await apiFetch('/api/developer/download-zip', {
        method: 'GET',
      });
      if (!res.ok) {
        const maybeJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMsg(maybeJson?.error || 'تعذر تنزيل ملف الموقع المضغوط');
        setDownloadingZip(false);
        return;
      }

      const blob = await res.blob();
      if (blob.size < 100) {
        setErrorMsg('تعذر إنشاء أرشيف ZIP صالح، يرجى المحاولة مرة أخرى');
        setDownloadingZip(false);
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `zoldix-complete-site-${today}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);
      setNotice(`بدأ تنزيل ملف الموقع الكامل ZIP (${sizeMb} ميجابايت) شاملاً الكود والأصول والفريمات`);
    } catch {
      setErrorMsg('تعذر تحميل ملف الموقع الكامل، يرجى المحاولة مجدداً');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleSaveGlobal = async () => {
    setNotice('');
    setErrorMsg('');
    const res = await saveDraftConfigGlobal();
    if (res.ok) {
      setNotice('تم حفظ ونشر جميع تعديلات الموقع للزوار فوراً');
    } else {
      setErrorMsg(res.error || 'تعذر حفظ التعديلات');
    }
  };

  const handleResetFactory = async () => {
    setNotice('');
    setErrorMsg('');
    const res = await resetSiteToFactory();
    setConfirmReset(false);
    if (res.ok) {
      setNotice('تمت إعادة الموقع إلى حالته الأصلية للجميع');
    } else {
      setErrorMsg(res.error || 'تعذر إعادة تعيين الموقع');
    }
  };

  const handleTestSmtpConnection = async () => {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    setNotice('');
    setErrorMsg('');
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
    setNotice('');
    setErrorMsg('');
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
    setNotice('');
    setErrorMsg('');
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
        setErrorMsg(data.error || 'تعذر حفظ إعدادات الربط، يرجى التحقق من صحة البيانات');
      } else {
        setNotice(data.message || 'تم اختبار الاتصال وحفظ إعدادات SMTP و Stripe بنجاح');
        setSmtpPass('');
        setStripeSecretKey('');
        setClearStripeSecret(false);
        if (data.updatedAt) setIntegrationsUpdatedAt(data.updatedAt);
        loadDeveloperData();
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم أثناء الحفظ');
    } finally {
      setSavingIntegrations(false);
    }
  };

  // عمليات مساعدة للأقسام والعروض والمنيو داخل الاستوديو
  const customSections = draftConfig.customSections || [];
  const filteredCatalogItems = useMemo(() => {
    if (catalogCategoryFilter === 'all') return draftConfig.items;
    return draftConfig.items.filter((i) => i.categoryId === catalogCategoryFilter);
  }, [draftConfig.items, catalogCategoryFilter]);

  const addCustomSection = () => {
    const sec: CustomSection = {
      id: `sec_${Date.now()}`,
      eyebrow: 'قسم جديد',
      title: 'تجربة ضيافة خاصة من zoldix',
      description: 'أضف محتوى مميزاً أو اربطه بعرض خاص أو موقع إلكتروني آخر.',
      image: '/images/zoldix-signature.jpg',
      ctaLabel: 'تصفح الطلبات',
      ctaUrl: '#menu',
      accentStyle: 'warm',
    };
    setDraftConfig((prev) => ({
      ...prev,
      customSections: [...(prev.customSections || []), sec],
    }));
  };

  const moveCustomSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= customSections.length) return;
    const next = [...customSections];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    setDraftConfig((prev) => ({ ...prev, customSections: next }));
  };

  if (!auth.isDeveloper) return null;

  const activeEmail = statusData?.currentEmail || auth.user?.email || auth.adminEmail || '';
  const metrics = statusData?.metrics;

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
          aria-labelledby="developer-modal-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="w-full sm:max-w-4xl max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--accent-gold)]/45 shadow-[var(--shadow-modal)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* الرأس الموحد لاستوديو المطورين */}
            <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-[var(--accent-gold)] text-[#13100E] flex items-center justify-center shrink-0">
                  <Code2 className="w-5 h-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="developer-modal-title" className="font-display font-black text-lg sm:text-xl">
                    استوديو المطورين المتقدم
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--accent-gold)]">
                    <span dir="ltr">{activeEmail}</span>
                    {hasUnsavedDraft && (
                      <span className="px-2 py-0.5 rounded-lg bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] text-[10px]">
                        تغييرات بانتظار الحفظ
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeveloperMode(true);
                    setIsEditMode((v) => !v);
                  }}
                  className={`min-h-[38px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 border transition-colors ${
                    isEditMode
                      ? 'bg-[var(--accent-gold)] text-[#13100E] border-[var(--accent-gold)]'
                      : 'bg-[var(--bg-canvas)] border-[var(--border-strong)] text-[var(--text-primary)]'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isEditMode ? 'إيقاف تعديل الواجهة' : 'تعديل الواجهة مباشرة'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveGlobal}
                  disabled={savingGlobal}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {savingGlobal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>حفظ ونشر للجميع</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="إغلاق نافذة المطورين"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* شريط التبويبات */}
            <div className="px-5 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] touch-scroll-x flex items-center gap-2 shrink-0">
              {(
                [
                  { id: 'overview', label: 'المشروع و ZIP والمطورون', icon: Archive },
                  { id: 'builder', label: 'منشئ الأقسام وتحويل الموقع', icon: Layers },
                  { id: 'catalog', label: 'المنيو والعروض والصور', icon: ShoppingBag },
                  { id: 'integrations', label: 'إعدادات SMTP و Stripe', icon: Settings2 },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[var(--accent-gold)] text-[#13100E]'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 pb-safe flex-1">
              {notice && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs sm:text-sm font-bold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{notice}</span>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="p-3.5 rounded-2xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-xs sm:text-sm font-bold text-[var(--text-primary)]"
                >
                  {errorMsg}
                </div>
              )}

              {/* التبويب 1: المشروع الكامل ZIP وحسابات المطورين */}
              {activeTab === 'overview' && (
                <div className="space-y-5">
                  <div className="p-5 rounded-3xl bg-gradient-to-br from-[#241D19] to-[#171310] border border-[var(--accent-gold)]/55 space-y-3.5">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--accent-gold)]">
                        <Archive className="w-4 h-4" aria-hidden="true" />
                        <span>النسخة الكاملة للمشروع</span>
                      </div>
                      <h3 className="font-display font-black text-lg sm:text-xl text-[var(--text-primary)]">
                        تنزيل ملف الموقع كامل بصيغة ZIP
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        يشمل الحزمة البرمجية الكاملة بدون نقص الواجهة الأمامية والخادم وملفات التصميم والصور ومئة فريم الفيديو وإعدادات المطعم والبيانات ونسخة البناء الجاهزة
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadFullZip}
                      disabled={downloadingZip}
                      className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-display font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg transition-all disabled:opacity-65"
                    >
                      {downloadingZip ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                          <span>جاري تجميع وضغط جميع ملفات الموقع</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" aria-hidden="true" />
                          <span>تنزيل الموقع كامل الآن (ZIP)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* أدوات التحرير والمزامنة الموحدة */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-display font-bold text-sm">
                          التعديل الثنائي المتزامن (الواجهة المباشرة + الاستوديو)
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          أي تعديل تقوم به من هنا أو مباشرة على بطاقات الموقع يتحدث لحظياً معاً قبل النشر للجميع
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeveloperMode(!auth.developerMode)}
                        className={`min-h-[36px] px-3 rounded-xl text-xs font-extrabold transition-colors ${
                          auth.developerMode
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {auth.developerMode ? 'شريط المطورين نشط' : 'تفعيل شريط المطورين'}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      {!confirmReset ? (
                        <button
                          type="button"
                          onClick={() => setConfirmReset(true)}
                          className="min-h-[40px] px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1.5 text-[var(--accent-gold)]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>إعادة ضبط الموقع للأصل</span>
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleResetFactory}
                            className="min-h-[40px] px-4 rounded-xl bg-[var(--accent-fire)] text-white text-xs font-extrabold"
                          >
                            تأكيد إعادة الضبط للجميع
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmReset(false)}
                            className="min-h-[40px] px-3 rounded-xl bg-[var(--bg-subtle)] text-xs font-bold"
                          >
                            إلغاء
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* إدارة حسابات المطورين بالبريد الإلكتروني */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex items-center gap-2 font-display font-bold text-sm">
                      <ShieldCheck className="w-4 h-4 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
                      <span>حسابات المطورين المعتمدة</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      الحساب الرئيسي يفعل وضع المطورين تلقائياً فور الدخول، ويمكنك إضافة أي بريد إلكتروني آخر ليحصل على نفس الصلاحيات
                    </p>

                    <form onSubmit={handleAddDeveloper} className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="email"
                        dir="ltr"
                        required
                        value={newDevEmail}
                        onChange={(e) => setNewDevEmail(e.target.value)}
                        placeholder="developer@gmail.com"
                        className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left text-sm"
                      />
                      <button
                        type="submit"
                        disabled={savingAccount}
                        className="min-h-[44px] px-4 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-60"
                      >
                        {savingAccount ? (
                          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Plus className="w-4 h-4" aria-hidden="true" />
                        )}
                        <span>إضافة مطور</span>
                      </button>
                    </form>

                    {loading ? (
                      <div className="py-4 text-center text-xs text-[var(--text-muted)]">
                        جاري التحميل
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        {statusData?.primaryDeveloperEmail && (
                          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/40 text-xs sm:text-sm">
                            <span className="font-mono font-bold truncate" dir="ltr">
                              {statusData.primaryDeveloperEmail}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-[var(--accent-gold-soft)] text-[var(--accent-gold)] text-[11px] font-extrabold shrink-0">
                              الحساب الرئيسي
                            </span>
                          </div>
                        )}

                        {(statusData?.developerEmails || []).map((devEmail) => (
                          <div
                            key={devEmail}
                            className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs sm:text-sm"
                          >
                            <span className="font-mono truncate" dir="ltr">
                              {devEmail}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDeveloper(devEmail)}
                              aria-label={`إزالة ${devEmail}`}
                              className="min-h-[34px] px-2.5 rounded-lg bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] text-xs font-bold inline-flex items-center gap-1 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>إزالة</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                      <div className="p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                        <div className="text-[11px] text-[var(--text-muted)] font-bold">الطلبات المدفوعة</div>
                        <div className="font-display font-black text-base text-[var(--accent-gold)] tabular-nums">
                          {metrics.paidOnlineCount} من {metrics.ordersCount}
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                        <div className="text-[11px] text-[var(--text-muted)] font-bold">المتصلون حالياً</div>
                        <div className="font-display font-black text-base text-[var(--text-primary)] tabular-nums">
                          {metrics.wsClientsCount}
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                        <div className="text-[11px] text-[var(--text-muted)] font-bold">بريد SMTP</div>
                        <div className="font-display font-black text-xs text-emerald-300 mt-1">
                          {metrics.smtpConfigured ? 'متصل وجاهز' : 'غير مهيأ'}
                        </div>
                      </div>
                      <div className="p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)]">
                        <div className="text-[11px] text-[var(--text-muted)] font-bold">بوابة Stripe</div>
                        <div className="font-display font-black text-xs text-[var(--accent-gold)] mt-1">
                          {metrics.stripeConfigured ? 'مفتاح مباشر' : 'بوابة البطاقة'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* التبويب 2: منشئ الموقع وتحويل الروابط والأقسام */}
              {activeTab === 'builder' && (
                <div className="space-y-5">
                  {/* الهوية والشعار وتحويل الموقع */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                    <div className="flex items-center gap-2 font-display font-black text-base text-[var(--accent-gold)]">
                      <Link2 className="w-4 h-4" aria-hidden="true" />
                      <span>هوية الموقع والشعار وتحويل الوجهة</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold mb-1">اسم المطعم / العلامة</label>
                        <input
                          type="text"
                          value={draftConfig.restaurant.name}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, name: e.target.value },
                            }))
                          }
                          className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">الاسم المختصر</label>
                        <input
                          type="text"
                          value={draftConfig.restaurant.shortName}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, shortName: e.target.value },
                            }))
                          }
                          className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold mb-1">العنوان الرئيسي (Hero)</label>
                        <input
                          type="text"
                          value={draftConfig.restaurant.tagline}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, tagline: e.target.value },
                            }))
                          }
                          className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold mb-1">الوصف الترحيبي</label>
                        <textarea
                          rows={2}
                          value={draftConfig.restaurant.heroSubtitle}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, heroSubtitle: e.target.value },
                            }))
                          }
                          className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs sm:text-sm"
                        />
                      </div>

                      {/* الشعار */}
                      <div className="sm:col-span-2 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex flex-wrap items-center gap-3">
                        <img
                          src={draftConfig.restaurant.logoUrl || '/images/zoldix-logo.png'}
                          alt={draftConfig.restaurant.name}
                          className="w-12 h-12 rounded-xl object-cover bg-[var(--bg-subtle)] shrink-0"
                        />
                        <label className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                          <ImagePlus className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                          <span>رفع شعار جديد</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleImageUpload(e.target.files?.[0], (url) =>
                                setDraftConfig((p) => ({
                                  ...p,
                                  restaurant: { ...p.restaurant, logoUrl: url },
                                }))
                              )
                            }
                          />
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={draftConfig.restaurant.logoUrl || ''}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, logoUrl: e.target.value },
                            }))
                          }
                          placeholder="/images/zoldix-logo.png أو رابط صورة"
                          className="flex-1 min-w-[180px] min-h-[38px] rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 text-left text-xs"
                        />
                      </div>

                      {/* تحويل زر الواجهة الرئيسي وتحويل الموقع */}
                      <div>
                        <label className="block text-xs font-bold mb-1">نص زر الواجهة الرئيسي</label>
                        <input
                          type="text"
                          value={draftConfig.restaurant.heroPrimaryCtaLabel || ''}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, heroPrimaryCtaLabel: e.target.value },
                            }))
                          }
                          placeholder="تصفح المنيو واطلب الآن"
                          className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-xs sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">رابط الزر الرئيسي (تحويل الزر لموقع)</label>
                        <input
                          type="text"
                          dir="ltr"
                          value={draftConfig.restaurant.heroPrimaryCtaUrl || ''}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, heroPrimaryCtaUrl: e.target.value },
                            }))
                          }
                          placeholder="#menu أو https://..."
                          className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold mb-1">
                          رابط تحويل الموقع بالكامل (اتركه فارغاً لإبقاء المتجر كما هو)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={draftConfig.restaurant.siteRedirectUrl || ''}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              restaurant: { ...p.restaurant, siteRedirectUrl: e.target.value },
                            }))
                          }
                          placeholder="https://my-new-site.com"
                          className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* لوحة الألوان السريعة */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex items-center gap-2 font-display font-bold text-sm">
                      <Palette className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                      <span>قوالب الألوان الفورية</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {DEV_PALETTES.map((pal) => (
                        <button
                          key={pal.label}
                          type="button"
                          onClick={() => setDraftConfig((p) => ({ ...p, theme: pal.theme }))}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs font-bold flex items-center gap-2 hover:border-[var(--accent-gold)]"
                        >
                          <span
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: pal.theme.accent }}
                          />
                          <span className="truncate">{pal.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* صور ونصوص مشهد المنتصف */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="font-display font-bold text-sm text-[var(--accent-gold)]">
                      مشهد منتصف الصفحة والصور الخلفية
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={draftConfig.midShowcase.title}
                        onChange={(e) =>
                          setDraftConfig((p) => ({
                            ...p,
                            midShowcase: { ...p.midShowcase, title: e.target.value },
                          }))
                        }
                        placeholder="عنوان مشهد المنتصف"
                        className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs font-bold"
                      />
                      <input
                        type="text"
                        value={draftConfig.midShowcase.eyebrow}
                        onChange={(e) =>
                          setDraftConfig((p) => ({
                            ...p,
                            midShowcase: { ...p.midShowcase, eyebrow: e.target.value },
                          }))
                        }
                        placeholder="العنوان الفرعي"
                        className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <label className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0">
                          <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                          <span>رفع صورة 1</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleImageUpload(e.target.files?.[0], (url) =>
                                setDraftConfig((p) => ({
                                  ...p,
                                  midShowcase: { ...p.midShowcase, primaryImage: url },
                                }))
                              )
                            }
                          />
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={draftConfig.midShowcase.primaryImage || ''}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              midShowcase: { ...p.midShowcase, primaryImage: e.target.value },
                            }))
                          }
                          placeholder="/images/zoldix-kunafa.jpg"
                          className="flex-1 min-w-0 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-left text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0">
                          <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                          <span>رفع صورة 2</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleImageUpload(e.target.files?.[0], (url) =>
                                setDraftConfig((p) => ({
                                  ...p,
                                  midShowcase: { ...p.midShowcase, secondaryImage: url },
                                }))
                              )
                            }
                          />
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={draftConfig.midShowcase.secondaryImage || ''}
                          onChange={(e) =>
                            setDraftConfig((p) => ({
                              ...p,
                              midShowcase: { ...p.midShowcase, secondaryImage: e.target.value },
                            }))
                          }
                          placeholder="/images/mint-lemonade.webp"
                          className="flex-1 min-w-0 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 py-2 text-left text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* إدارة الأقسام المخصصة */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-gold)]/40 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-display font-black text-sm text-[var(--accent-gold)]">
                          الأقسام المخصصة ({customSections.length})
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          أضف أقساماً جديدة للموقع أو أزلها أو رتبها مع رفع صورها وروابطها
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={addCustomSection}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-black text-xs inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" aria-hidden="true" />
                        <span>إضافة قسم جديد</span>
                      </button>
                    </div>

                    {customSections.length === 0 ? (
                      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-dashed border-[var(--border-hairline)] text-center text-xs text-[var(--text-muted)]">
                        لا توجد أقسام مخصصة بعد، اضغط إضافة قسم جديد لإنشاء قسم خاص في الصفحة
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {customSections.map((sec, idx) => (
                          <div
                            key={sec.id}
                            className="p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-[var(--accent-gold)]">
                                قسم #{idx + 1}: {sec.title || 'بدون عنوان'}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveCustomSection(idx, -1)}
                                  disabled={idx === 0}
                                  className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center disabled:opacity-40"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveCustomSection(idx, 1)}
                                  disabled={idx === customSections.length - 1}
                                  className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center disabled:opacity-40"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftConfig((p) => ({
                                      ...p,
                                      customSections: (p.customSections || []).filter(
                                        (s) => s.id !== sec.id
                                      ),
                                    }))
                                  }
                                  className="min-h-[32px] px-2.5 rounded-lg bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] text-xs font-bold inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <input
                                type="text"
                                value={sec.eyebrow || ''}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((s) =>
                                      s.id === sec.id ? { ...s, eyebrow: e.target.value } : s
                                    ),
                                  }))
                                }
                                placeholder="الشارة الفرعية"
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                              />
                              <select
                                value={sec.accentStyle || 'warm'}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((s) =>
                                      s.id === sec.id
                                        ? {
                                            ...s,
                                            accentStyle: e.target.value as 'warm' | 'gold' | 'minimal',
                                          }
                                        : s
                                    ),
                                  }))
                                }
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold"
                              >
                                <option value="warm">نمط دافئ</option>
                                <option value="gold">نمط ذهبي</option>
                                <option value="minimal">نمط هادئ</option>
                              </select>
                              <input
                                type="text"
                                value={sec.title}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((s) =>
                                      s.id === sec.id ? { ...s, title: e.target.value } : s
                                    ),
                                  }))
                                }
                                placeholder="عنوان القسم"
                                className="sm:col-span-2 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 font-bold text-xs sm:text-sm"
                              />
                              <textarea
                                rows={2}
                                value={sec.description}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((s) =>
                                      s.id === sec.id ? { ...s, description: e.target.value } : s
                                    ),
                                  }))
                                }
                                placeholder="وصف القسم"
                                className="sm:col-span-2 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={sec.ctaLabel || ''}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((s) =>
                                      s.id === sec.id ? { ...s, ctaLabel: e.target.value } : s
                                    ),
                                  }))
                                }
                                placeholder="نص الزر"
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                dir="ltr"
                                value={sec.ctaUrl || ''}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    customSections: (p.customSections || []).map((s) =>
                                      s.id === sec.id ? { ...s, ctaUrl: e.target.value } : s
                                    ),
                                  }))
                                }
                                placeholder="#menu أو https://..."
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-left text-xs"
                              />
                              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                                <label className="min-h-[36px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                                  <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                                  <span>رفع صورة للقسم</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) =>
                                      handleImageUpload(e.target.files?.[0], (url) =>
                                        setDraftConfig((p) => ({
                                          ...p,
                                          customSections: (p.customSections || []).map((s) =>
                                            s.id === sec.id ? { ...s, image: url } : s
                                          ),
                                        }))
                                      )
                                    }
                                  />
                                </label>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={sec.image || ''}
                                  onChange={(e) =>
                                    setDraftConfig((p) => ({
                                      ...p,
                                      customSections: (p.customSections || []).map((s) =>
                                        s.id === sec.id ? { ...s, image: e.target.value } : s
                                      ),
                                    }))
                                  }
                                  placeholder="رابط صورة القسم"
                                  className="flex-1 min-w-[160px] rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-left text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* التبويب 3: إدارة الأقسام والعروض والمنيو والصور */}
              {activeTab === 'catalog' && (
                <div className="space-y-6">
                  {/* أقسام المنيو */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-black text-sm text-[var(--accent-gold)]">
                        تصنيفات المنيو ({draftConfig.categories.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftConfig((p) => ({
                            ...p,
                            categories: [
                              ...p.categories,
                              { id: `cat_${Date.now()}`, name: 'قسم جديد' },
                            ],
                          }))
                        }
                        className="min-h-[36px] px-3 rounded-xl bg-[var(--accent-gold)] text-[#13100E] text-xs font-black inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة تصنيف</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {draftConfig.categories.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={cat.name}
                            onChange={(e) =>
                              setDraftConfig((p) => ({
                                ...p,
                                categories: p.categories.map((c) =>
                                  c.id === cat.id ? { ...c, name: e.target.value } : c
                                ),
                              }))
                            }
                            className="flex-1 min-h-[38px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-xs font-bold"
                          />
                          {draftConfig.categories.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftConfig((p) => ({
                                  ...p,
                                  categories: p.categories.filter((c) => c.id !== cat.id),
                                  items: p.items.filter((i) => i.categoryId !== cat.id),
                                }))
                              }
                              aria-label={`حذف ${cat.name}`}
                              className="w-9 h-9 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] flex items-center justify-center shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* العروض المميزة وصورها */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-black text-sm text-[var(--accent-gold)]">
                        العروض المميزة ({draftConfig.offers.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const offer: OfferItem = {
                            id: `offer_${Date.now()}`,
                            name: 'عرض شواء جديد',
                            description: 'وجبة شواء متكاملة مع البطاطا والمشروب',
                            originalPrice: 9.5,
                            price: 7.5,
                            discountLabel: 'عرض جديد',
                            image: '/images/zoldix-signature.jpg',
                            addonIds: [],
                          };
                          setDraftConfig((p) => ({ ...p, offers: [offer, ...p.offers] }));
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-[var(--accent-gold)] text-[#13100E] text-xs font-black inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة عرض</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {draftConfig.offers.map((offer) => (
                        <div
                          key={offer.id}
                          className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] grid grid-cols-1 sm:grid-cols-12 gap-3 items-start"
                        >
                          <div className="sm:col-span-4 space-y-2">
                            <div className="aspect-[16/10] rounded-xl overflow-hidden bg-[var(--bg-subtle)]">
                              <FoodImage src={offer.image} alt={offer.name} className="w-full h-full" />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="min-h-[32px] px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0">
                                <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                                <span>رفع صورة</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) =>
                                    handleImageUpload(e.target.files?.[0], (url) =>
                                      setDraftConfig((p) => ({
                                        ...p,
                                        offers: p.offers.map((o) =>
                                          o.id === offer.id ? { ...o, image: url } : o
                                        ),
                                      }))
                                    )
                                  }
                                />
                              </label>
                              <input
                                type="text"
                                dir="ltr"
                                value={offer.image}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    offers: p.offers.map((o) =>
                                      o.id === offer.id ? { ...o, image: e.target.value } : o
                                    ),
                                  }))
                                }
                                className="flex-1 min-w-0 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2 py-1 text-left text-[11px]"
                              />
                            </div>
                          </div>

                          <div className="sm:col-span-8 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={offer.name}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    offers: p.offers.map((o) =>
                                      o.id === offer.id ? { ...o, name: e.target.value } : o
                                    ),
                                  }))
                                }
                                className="flex-1 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    offers: p.offers.filter((o) => o.id !== offer.id),
                                  }))
                                }
                                className="min-h-[34px] px-2.5 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              value={offer.description}
                              onChange={(e) =>
                                setDraftConfig((p) => ({
                                  ...p,
                                  offers: p.offers.map((o) =>
                                    o.id === offer.id ? { ...o, description: e.target.value } : o
                                  ),
                                }))
                              }
                              className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                            />
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="number"
                                step="0.05"
                                value={offer.price}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    offers: p.offers.map((o) =>
                                      o.id === offer.id
                                        ? { ...o, price: Number(e.target.value || 1) }
                                        : o
                                    ),
                                  }))
                                }
                                placeholder="السعر"
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs"
                              />
                              <input
                                type="number"
                                step="0.05"
                                value={offer.originalPrice}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    offers: p.offers.map((o) =>
                                      o.id === offer.id
                                        ? { ...o, originalPrice: Number(e.target.value || 1) }
                                        : o
                                    ),
                                  }))
                                }
                                placeholder="قبل الخصم"
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs"
                              />
                              <input
                                type="text"
                                value={offer.discountLabel}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    offers: p.offers.map((o) =>
                                      o.id === offer.id
                                        ? { ...o, discountLabel: e.target.value }
                                        : o
                                    ),
                                  }))
                                }
                                placeholder="الشارة"
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* أصناف المنيو وصورها */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display font-black text-sm text-[var(--accent-gold)]">
                        أصناف المنيو ({draftConfig.items.length})
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={catalogCategoryFilter}
                          onChange={(e) => setCatalogCategoryFilter(e.target.value)}
                          className="min-h-[36px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-xs font-bold"
                        >
                          <option value="all">كل التصنيفات</option>
                          {draftConfig.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const catId =
                              catalogCategoryFilter !== 'all'
                                ? catalogCategoryFilter
                                : draftConfig.categories[0]?.id || 'signature';
                            const item: MenuItem = {
                              id: `item_${Date.now()}`,
                              categoryId: catId,
                              name: 'وجبة جديدة',
                              description: 'وصف شهي محضر طازجاً على الفحم',
                              price: 4.5,
                              image: '/images/zoldix-signature.jpg',
                              addonIds: [],
                            };
                            setDraftConfig((p) => ({ ...p, items: [item, ...p.items] }));
                          }}
                          className="min-h-[36px] px-3 rounded-xl bg-[var(--accent-fire)] text-white text-xs font-black inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة وجبة</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[420px] overflow-y-auto pl-1">
                      {filteredCatalogItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] grid grid-cols-1 sm:grid-cols-12 gap-3 items-start"
                        >
                          <div className="sm:col-span-4 space-y-2">
                            <div className="aspect-[16/10] rounded-xl overflow-hidden bg-[var(--bg-subtle)]">
                              <FoodImage src={item.image} alt={item.name} className="w-full h-full" />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="min-h-[32px] px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0">
                                <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                                <span>رفع صورة</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) =>
                                    handleImageUpload(e.target.files?.[0], (url) =>
                                      setDraftConfig((p) => ({
                                        ...p,
                                        items: p.items.map((it) =>
                                          it.id === item.id ? { ...it, image: url } : it
                                        ),
                                      }))
                                    )
                                  }
                                />
                              </label>
                              <input
                                type="text"
                                dir="ltr"
                                value={item.image}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    items: p.items.map((it) =>
                                      it.id === item.id ? { ...it, image: e.target.value } : it
                                    ),
                                  }))
                                }
                                className="flex-1 min-w-0 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2 py-1 text-left text-[11px]"
                              />
                            </div>
                          </div>

                          <div className="sm:col-span-8 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    items: p.items.map((it) =>
                                      it.id === item.id ? { ...it, name: e.target.value } : it
                                    ),
                                  }))
                                }
                                className="flex-1 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    items: p.items.filter((it) => it.id !== item.id),
                                  }))
                                }
                                className="min-h-[34px] px-2.5 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              value={item.description}
                              onChange={(e) =>
                                setDraftConfig((p) => ({
                                  ...p,
                                  items: p.items.map((it) =>
                                    it.id === item.id ? { ...it, description: e.target.value } : it
                                  ),
                                }))
                              }
                              className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="number"
                                step="0.05"
                                value={item.price}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    items: p.items.map((it) =>
                                      it.id === item.id
                                        ? { ...it, price: Number(e.target.value || 1) }
                                        : it
                                    ),
                                  }))
                                }
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs"
                              />
                              <select
                                value={item.categoryId}
                                onChange={(e) =>
                                  setDraftConfig((p) => ({
                                    ...p,
                                    items: p.items.map((it) =>
                                      it.id === item.id ? { ...it, categoryId: e.target.value } : it
                                    ),
                                  }))
                                }
                                className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-xs font-bold"
                              >
                                {draftConfig.categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* التبويب 4: إعدادات SMTP و Stripe API الديناميكية */}
              {activeTab === 'integrations' && (
                <form onSubmit={handleSaveIntegrations} className="space-y-5">
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-black text-base text-[var(--accent-gold)]">
                        إعدادات الربط الديناميكية (SMTP و Stripe API)
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        تحديث إعدادات البريد والدفع الإلكتروني ديناميكياً مع التحقق المباشر من صحة الاتصال قبل الحفظ
                      </p>
                    </div>
                    {integrationsUpdatedAt && (
                      <span className="text-[11px] font-bold text-[var(--text-muted)]">
                        آخر تحديث {new Date(integrationsUpdatedAt).toLocaleString('ar-JO')}
                      </span>
                    )}
                  </div>

                  {/* قسم SMTP */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-display font-bold text-sm">
                        <Mail className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                        <span>خادم البريد الإلكتروني (SMTP)</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestSmtpConnection}
                        disabled={testingSmtp}
                        className="min-h-[38px] px-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/50 text-xs font-extrabold text-[var(--accent-gold)] inline-flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {testingSmtp && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>اختبار اتصال SMTP</span>
                      </button>
                    </div>

                    {smtpTestResult && (
                      <div
                        className={`p-2.5 rounded-xl text-xs font-bold ${
                          smtpTestResult.ok
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                            : 'bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] border border-[var(--accent-fire)]/50'
                        }`}
                      >
                        {smtpTestResult.msg}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        dir="ltr"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.gmail.com"
                        className="min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                      <input
                        type="number"
                        dir="ltr"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                        placeholder="465"
                        className="min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                      <input
                        type="email"
                        dir="ltr"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        placeholder="SMTP User / Gmail"
                        className="min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                      <input
                        type="password"
                        dir="ltr"
                        value={smtpPass}
                        onChange={(e) => setSmtpPass(e.target.value)}
                        placeholder={
                          smtpHasPass ? 'كلمة مرور التطبيق محفوظة (اتركها فارغة للإبقاء)' : 'App Password'
                        }
                        className="min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                      <input
                        type="email"
                        dir="ltr"
                        value={smtpOrderTo}
                        onChange={(e) => setSmtpOrderTo(e.target.value)}
                        placeholder="بريد استقبال الطلبات"
                        className="min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                      <input
                        type="email"
                        dir="ltr"
                        value={smtpAdminNotifyEmail}
                        onChange={(e) => setSmtpAdminNotifyEmail(e.target.value)}
                        placeholder="بريد إشعارات الإدارة"
                        className="min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  {/* قسم Stripe */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-display font-bold text-sm">
                        <CreditCard className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                        <span>بوابة الدفع الإلكتروني (Stripe API)</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleTestStripeConnection}
                        disabled={testingStripe}
                        className="min-h-[38px] px-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/50 text-xs font-extrabold text-[var(--accent-gold)] inline-flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {testingStripe && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>اختبار مفتاح Stripe</span>
                      </button>
                    </div>

                    {stripeTestResult && (
                      <div
                        className={`p-2.5 rounded-xl text-xs font-bold ${
                          stripeTestResult.ok
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                            : 'bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] border border-[var(--accent-fire)]/50'
                        }`}
                      >
                        {stripeTestResult.msg}
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={stripePublishableKey}
                        onChange={(e) => setStripePublishableKey(e.target.value)}
                        placeholder="Stripe Publishable Key (pk_...)"
                        className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                      <input
                        type="password"
                        dir="ltr"
                        value={stripeSecretKey}
                        onChange={(e) => {
                          setStripeSecretKey(e.target.value);
                          setClearStripeSecret(false);
                        }}
                        placeholder={
                          stripeHasSecret
                            ? `المفتاح السري محفوظ (${stripeSecretMasked || 'sk_***'})`
                            : 'Stripe Secret Key (sk_...)'
                        }
                        className="w-full min-h-[42px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-3 text-left text-xs sm:text-sm"
                      />
                      {stripeHasSecret && (
                        <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={clearStripeSecret}
                            onChange={(e) => setClearStripeSecret(e.target.checked)}
                            className="accent-[var(--accent-fire)]"
                          />
                          <span>مسح مفتاح Stripe واستخدام بوابة البطاقة المباشرة المدمجة</span>
                        </label>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingIntegrations}
                    className="w-full min-h-[48px] rounded-2xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-display font-black text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {savingIntegrations ? (
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="w-5 h-5" aria-hidden="true" />
                    )}
                    <span>اختبار وحفظ إعدادات SMTP و Stripe الآن</span>
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
