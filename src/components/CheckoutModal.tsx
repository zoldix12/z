/**
 * نافذة إتمام الطلب المتكاملة مع تحديد الموقع التلقائي، كوبونات الخصم، نقاط الولاء، الدفع المرن،
 * وحالة استقبال الطلبات، مع تتبع فوري للطلب بعد الإرسال.
 */
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  Award,
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Store,
  Tag,
  Truck,
  X,
} from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import { useAutoLocation } from '../hooks/useAutoLocation';
import { getOrCreateDeviceId } from '../hooks/useCart';
import type {
  CartEntry,
  CustomerAccount,
  OrderType,
  PaymentMethod,
  SubmittedOrderReceipt,
} from '../types/menu';

interface CheckoutModalProps {
  isOpen: boolean;
  items: CartEntry[];
  orderType: OrderType;
  subtotal: number;
  deliveryFee: number;
  total: number;
  onChangeOrderType: (type: OrderType) => void;
  onClose: () => void;
  onOrderSuccess: () => void;
}

interface FormErrors {
  name?: string;
  phone?: string;
  area?: string;
  address?: string;
  cardNumber?: string;
  cardHolder?: string;
  cardExpiry?: string;
  cardCvv?: string;
  submit?: string;
}

interface AppliedCouponPreview {
  code: string;
  discountAmount: number;
  waivesDelivery: boolean;
}

function normalizeDigits(val: string): string {
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

function detectCardBrand(digits: string): 'Visa' | 'Mastercard' | 'بطاقة بنكية' {
  if (digits.startsWith('4')) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  return 'بطاقة بنكية';
}

function formatCardNumberDisplay(digits: string): string {
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : '';
}

function isValidLuhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function isFutureCardExpiry(expiry: string): boolean {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry.trim());
  if (!match) return false;
  const expMonth = Number(match[1]);
  const expYear = 2000 + Number(match[2]);
  const now = new Date();
  if (expYear < now.getFullYear()) return false;
  if (expYear === now.getFullYear() && expMonth < now.getMonth() + 1) return false;
  return true;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  items,
  orderType,
  subtotal,
  deliveryFee,
  total,
  onChangeOrderType,
  onClose,
  onOrderSuccess,
}) => {
  const { siteConfig, auth, apiFetch, updateUserState, setTrackedOrder } = useSite();
  const restaurant = siteConfig.restaurant;
  const deliveryAreas = siteConfig.deliveryAreas;
  const currency = restaurant.currency;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [honeypot, setHoneypot] = useState('');

  // كوبون الخصم ونقاط الولاء
  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCouponPreview | null>(null);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  const [errors, setErrors] = useState<FormErrors & { receiptEmail?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<SubmittedOrderReceipt | null>(null);

  const {
    loading: geoLoading,
    statusMessage: geoStatus,
    errorMessage: geoError,
    detectLocation,
    selectPresetArea,
    setStatusMessage: setGeoStatus,
  } = useAutoLocation();

  // التحقق من توفر بوابة Stripe الحية عند فتح نافذة الدفع
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    apiFetch('/api/payments/config', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { stripeConfigured?: boolean } | null) => {
        if (active && data) {
          setStripeConfigured(Boolean(data.stripeConfigured));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, apiFetch]);

  // تعبئة بيانات العميل المحفوظة تلقائياً عند فتح نافذة الطلب
  useEffect(() => {
    if (!isOpen || !auth.user) return;
    setName((prev) => prev || auth.user?.name || '');
    setPhone((prev) => prev || auth.user?.phone || '');
    setArea((prev) => prev || auth.user?.area || '');
    setAddress((prev) => prev || auth.user?.address || '');
    setReceiptEmail((prev) => prev || auth.user?.email || '');
  }, [isOpen, auth.user]);

  useEffect(() => {
    if (!isOpen || orderType !== 'delivery' || receipt || mapUrl) return;
    let active = true;
    detectLocation(true).then((result) => {
      if (!active || !result) return;
      setMapUrl(result.mapUrl);
      if (result.areaSuggestion) {
        setArea((prev) => prev || result.areaSuggestion || '');
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen, orderType, receipt, mapUrl, detectLocation]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const effectiveDeliveryFee = appliedCoupon?.waivesDelivery ? 0 : deliveryFee;
  const couponDeduction =
    appliedCoupon && !appliedCoupon.waivesDelivery ? appliedCoupon.discountAmount : 0;
  const afterCouponTotal = Math.max(0, subtotal + effectiveDeliveryFee - couponDeduction);

  const userPoints = auth.user?.loyaltyPoints || 0;
  const redeemValue = restaurant.loyaltyRedeemValue || 0.02;
  const maxLoyaltyDiscount = Number((userPoints * redeemValue).toFixed(2));
  const loyaltyDiscountPreview =
    useLoyaltyPoints && auth.user && userPoints > 0
      ? Number(Math.min(afterCouponTotal, maxLoyaltyDiscount).toFixed(2))
      : 0;
  const finalPreviewTotal = Number(
    Math.max(0, afterCouponTotal - loyaltyDiscountPreview).toFixed(2)
  );

  const handleClose = () => {
    if (isSubmitting) return;
    if (receipt) {
      setReceipt(null);
      setErrors({});
    }
    onClose();
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError('يرجى كتابة كود الخصم أولاً');
      return;
    }
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await apiFetch('/api/coupon/validate', {
        method: 'POST',
        body: JSON.stringify({ code, subtotal, orderType }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        coupon?: { code: string };
        discountAmount?: number;
        waivesDelivery?: boolean;
      };
      if (!res.ok || !data.ok || !data.coupon) {
        setCouponError(data.error || 'كود الخصم غير صالح');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.coupon.code,
          discountAmount: Number(data.discountAmount || 0),
          waivesDelivery: Boolean(data.waivesDelivery),
        });
      }
    } catch {
      setCouponError('تعذر التحقق من الكوبون حالياً');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleManualLocate = async () => {
    const res = await detectLocation(false);
    if (res) {
      setMapUrl(res.mapUrl);
      if (res.areaSuggestion) {
        setArea(res.areaSuggestion);
      }
    }
  };

  const isElectronicMethod = paymentMethod === 'stripe' || paymentMethod === 'card_online';

  const validateForm = (): boolean => {
    const nextErrors: FormErrors & { receiptEmail?: string } = {};
    if (name.trim().length < 2) {
      nextErrors.name = 'يرجى إدخال الاسم الكامل';
    }

    const cleanedPhone = normalizeDigits(phone);
    if (!/^07\d{8}$/.test(cleanedPhone)) {
      nextErrors.phone = 'يرجى إدخال رقم هاتف يبدأ بـ 07 ومكون من عشرة أرقام';
    }

    if (orderType === 'delivery') {
      if (area.trim().length < 2) {
        nextErrors.area = 'يرجى اختيار أو كتابة اسم المنطقة';
      }
      if (address.trim().length < 4) {
        nextErrors.address = 'يرجى كتابة العنوان التفصيلي';
      }
    }

    if (isElectronicMethod) {
      const cleanEmail = receiptEmail.trim().toLowerCase();
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        nextErrors.receiptEmail = 'يرجى إدخال بريد إلكتروني صحيح لاستلام إيصال الدفع';
      }

      if (!stripeConfigured) {
        const cardDigits = normalizeDigits(cardNumber);
        if (!/^\d{16}$/.test(cardDigits) || !isValidLuhn(cardDigits)) {
          nextErrors.cardNumber = 'يرجى إدخال رقم بطاقة صالح مكون من ستة عشر رقماً';
        }
        if (cardHolder.trim().length < 3) {
          nextErrors.cardHolder = 'يرجى كتابة الاسم المطبوع على البطاقة';
        }
        if (!isFutureCardExpiry(cardExpiry)) {
          nextErrors.cardExpiry = 'يرجى كتابة تاريخ انتهاء ساري الصلاحية بصيغة شهر/سنة';
        }
        const cvvDigits = normalizeDigits(cardCvv);
        if (!/^\d{3,4}$/.test(cvvDigits)) {
          nextErrors.cardCvv = 'يرجى إدخال رمز الأمان للبطاقة';
        }
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!restaurant.acceptingOrders) {
      setErrors({
        submit: restaurant.pausedMessage || 'استقبال الطلبات متوقف مؤقتاً وسنعود قريباً',
      });
      return;
    }

    if (items.length === 0) {
      setErrors({ submit: 'سلة الطلبات فارغة يرجى إضافة صنف واحد على الأقل' });
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors({});

    const cardDigits = normalizeDigits(cardNumber);
    const basePayload = {
      name: name.trim(),
      phone: normalizeDigits(phone),
      orderType,
      paymentMethod,
      receiptEmail: receiptEmail.trim().toLowerCase(),
      area: orderType === 'delivery' ? area.trim() : 'الاستلام من المطعم',
      address: orderType === 'delivery' ? address.trim() : restaurant.address,
      mapUrl: mapUrl.trim(),
      notes: notes.trim(),
      couponCode: appliedCoupon?.code || '',
      useLoyaltyPoints: Boolean(useLoyaltyPoints && auth.user && userPoints > 0),
      website: honeypot,
      deviceId: getOrCreateDeviceId(),
      items: items.map((entry) => ({
        itemId: entry.itemId,
        variantId: entry.variantId || '',
        quantity: entry.quantity,
        addonIds: entry.addonIds,
        notes: entry.notes,
      })),
    };

    try {
      if (isElectronicMethod && stripeConfigured) {
        const stripeRes = await apiFetch('/api/payments/stripe/create-session', {
          method: 'POST',
          body: JSON.stringify(basePayload),
        });
        const stripeData = (await stripeRes.json()) as {
          ok?: boolean;
          mode?: string;
          url?: string;
          error?: string;
        };
        if (stripeRes.ok && stripeData.ok && stripeData.mode === 'stripe_checkout' && stripeData.url) {
          window.location.assign(stripeData.url);
          return;
        }
        if (!stripeRes.ok && stripeData.mode !== 'direct_gateway') {
          setErrors({
            submit: stripeData.error || 'تعذر بدء جلسة الدفع الإلكتروني عبر Stripe',
          });
          setIsSubmitting(false);
          return;
        }
      }

      const payload = {
        ...basePayload,
        ...(isElectronicMethod
          ? {
              cardNumber: cardDigits,
              cardExpiry: cardExpiry.trim(),
              cardLast4: cardDigits.slice(-4),
              cardBrand: detectCardBrand(cardDigits),
            }
          : {}),
      };

      const res = await apiFetch('/api/order', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        order?: SubmittedOrderReceipt;
        user?: CustomerAccount | null;
      };

      if (!res.ok || !data.ok || !data.order) {
        setErrors({
          submit: data.error || 'تعذر إرسال الطلب حالياً يرجى المحاولة مرة أخرى',
        });
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        updateUserState(data.user);
      }

      setTrackedOrder(data.order);
      setReceipt(data.order);
      setIsSubmitting(false);
      setNotes('');
      setCouponInput('');
      setAppliedCoupon(null);
      setUseLoyaltyPoints(false);
      setCardNumber('');
      setCardHolder('');
      setCardExpiry('');
      setCardCvv('');
      onOrderSuccess();
    } catch {
      setErrors({
        submit: 'تعذر الاتصال بالخادم يرجى التحقق من اتصال الإنترنت',
      });
      setIsSubmitting(false);
    }
  };

  const rawCardDigits = normalizeDigits(cardNumber).slice(0, 16);
  const cardBrand = detectCardBrand(rawCardDigits);

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
          aria-labelledby="checkout-modal-title"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="w-full sm:max-w-xl max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-[var(--shadow-modal)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-4 shrink-0">
              <h2 id="checkout-modal-title" className="font-display font-black text-xl sm:text-2xl">
                {receipt ? 'تم تأكيد طلبك' : 'إتمام الطلب والدفع'}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                aria-label="إغلاق"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)] disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {receipt ? (
              <div className="p-6 sm:p-8 overflow-y-auto text-center space-y-5 pb-safe">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" aria-hidden="true" />
                </div>

                <div>
                  <h3 className="font-display font-black text-2xl text-[var(--text-primary)] mb-2">
                    تم استلام طلبك وسنتواصل معك قريباً
                  </h3>
                  <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                    شكراً لطلبك من مطعم {restaurant.name}، يمكنك متابعة مراحل تحضير الطلب مباشرة من الصفحة الرئيسية
                  </p>
                </div>

                <div className="rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] p-4 sm:p-5 text-right space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">رقم الطلب</span>
                    <span className="font-display font-black text-base text-[var(--accent-gold)] tabular-nums">
                      #{receipt.orderId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">نوع الطلب</span>
                    <span className="font-bold">{receipt.orderTypeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">طريقة الدفع</span>
                    <span className="font-bold">{receipt.paymentMethod}</span>
                  </div>
                  {receipt.paymentStatus === 'paid' && (
                    <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-emerald-300">
                      <span>تم تأكيد الدفع الإلكتروني بنجاح</span>
                      {receipt.paymentTransactionId && (
                        <span dir="ltr" className="font-mono text-[11px]">
                          {receipt.paymentTransactionId}
                        </span>
                      )}
                    </div>
                  )}
                  {receipt.receiptEmail && (
                    <div className="text-xs text-[var(--text-secondary)]">
                      تم إرسال إيصال وتأكيد الدفع عبر البريد الإلكتروني إلى{' '}
                      <span dir="ltr" className="font-mono font-bold text-[var(--text-primary)]">
                        {receipt.receiptEmail}
                      </span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-[var(--border-hairline)] space-y-1.5 text-sm">
                    {receipt.items.map((item, idx) => (
                      <div key={`${item.itemId}-${idx}`} className="flex justify-between gap-3">
                        <span>
                          {item.name}
                          {item.variantName ? ` (${item.variantName})` : ''} × {item.quantity}
                        </span>
                        <span className="tabular-nums font-bold">
                          {formatPrice(item.lineTotal, receipt.currency)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {receipt.discountAmount > 0 && (
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                      <span>خصم الكوبون {receipt.couponCode || ''}</span>
                      <span>-{formatPrice(receipt.discountAmount, receipt.currency)}</span>
                    </div>
                  )}

                  {receipt.loyaltyDiscount > 0 && (
                    <div className="flex items-center justify-between text-xs font-bold text-[var(--accent-gold)]">
                      <span>استبدال {receipt.loyaltyPointsUsed} نقطة ولاء</span>
                      <span>-{formatPrice(receipt.loyaltyDiscount, receipt.currency)}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-dashed border-[var(--border-strong)] flex items-center justify-between font-display font-black text-lg">
                    <span>المجموع النهائي</span>
                    <span className="tabular-nums text-[var(--accent-gold)]">
                      {formatPrice(receipt.total, receipt.currency)}
                    </span>
                  </div>

                  {receipt.loyaltyPointsEarned > 0 && (
                    <div className="text-xs font-bold text-[var(--accent-gold)] pt-1">
                      مبروك حصلت على {receipt.loyaltyPointsEarned} نقطة ولاء في حسابك
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full min-h-[48px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-base transition-colors"
                >
                  متابعة حالة الطلب الآن
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
                  {!restaurant.acceptingOrders && (
                    <div className="rounded-2xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] p-4 flex items-start gap-2.5 text-sm font-bold text-[var(--text-primary)]">
                      <AlertCircle className="w-5 h-5 text-[var(--accent-fire)] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        {restaurant.pausedMessage || 'استقبال الطلبات متوقف مؤقتاً بسبب الضغط الحالي'}
                      </span>
                    </div>
                  )}

                  {auth.user && (
                    <div className="rounded-2xl bg-[var(--accent-gold-soft)] border border-[var(--accent-gold)]/40 px-4 py-2.5 text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                      سيتم حفظ هذا الطلب في سجل مشتريات {auth.user.email} وحصولك على نقاط الولاء
                    </div>
                  )}

                  <div>
                    <span className="block text-sm font-bold mb-2">طريقة استلام الطلب</span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => onChangeOrderType('delivery')}
                        aria-pressed={orderType === 'delivery'}
                        className={`min-h-[48px] px-3 py-2.5 rounded-2xl border font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                          orderType === 'delivery'
                            ? 'border-[var(--accent-fire)] bg-[var(--accent-fire-soft)] text-[var(--accent-gold)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>توصيل للعنوان</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onChangeOrderType('pickup')}
                        aria-pressed={orderType === 'pickup'}
                        className={`min-h-[48px] px-3 py-2.5 rounded-2xl border font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                          orderType === 'pickup'
                            ? 'border-[var(--accent-fire)] bg-[var(--accent-fire-soft)] text-[var(--accent-gold)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <Store className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>استلام من المطعم</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="checkout-name" className="block text-sm font-bold mb-1.5">
                      الاسم الكامل
                    </label>
                    <input
                      id="checkout-name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="أدخل اسمك الكامل"
                      className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                    {errors.name && (
                      <p role="alert" className="mt-1.5 text-xs font-bold text-[var(--accent-fire)]">
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="checkout-phone" className="block text-sm font-bold mb-1.5">
                      رقم الهاتف الأردني
                    </label>
                    <input
                      id="checkout-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0791234567"
                      className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-right text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                    {errors.phone && (
                      <p role="alert" className="mt-1.5 text-xs font-bold text-[var(--accent-fire)]">
                        {errors.phone}
                      </p>
                    )}
                  </div>

                  {orderType === 'delivery' ? (
                    <>
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-display font-bold text-sm">
                            <MapPin className="w-4 h-4 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
                            <span>تحديد الموقع التلقائي على الخريطة</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleManualLocate}
                            disabled={geoLoading}
                            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-extrabold text-xs sm:text-sm transition-all disabled:opacity-60"
                          >
                            {geoLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <RefreshCw className="w-4 h-4" aria-hidden="true" />
                            )}
                            <span>{geoLoading ? 'جاري التحديد' : 'تحديد موقعي الآن'}</span>
                          </button>
                        </div>

                        {geoStatus && (
                          <div className="text-xs font-bold text-emerald-300 bg-emerald-500/15 px-3 py-2 rounded-xl">
                            {geoStatus}
                          </div>
                        )}

                        {mapUrl && (
                          <div className="flex items-center justify-between gap-2 text-xs bg-[var(--bg-subtle)] px-3 py-2 rounded-xl">
                            <span className="truncate font-bold text-[var(--text-primary)]">
                              تم إرفاق رابط الموقع الجغرافي
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <a
                                href={mapUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[var(--accent-gold)] underline font-bold"
                              >
                                <span>فتح الخريطة</span>
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  setMapUrl('');
                                  setGeoStatus('');
                                }}
                                className="text-[var(--text-muted)] font-bold underline"
                              >
                                مسح
                              </button>
                            </div>
                          </div>
                        )}

                        {geoError && (
                          <p role="alert" className="text-xs font-bold text-[var(--accent-fire)]">
                            {geoError}
                          </p>
                        )}

                        {deliveryAreas.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-[var(--text-secondary)] mb-2">
                              أو اختر منطقتك بلمسة واحدة لتعبئة الموقع تلقائياً
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {deliveryAreas.map((preset) => {
                                const selected = area.trim() === preset.name;
                                return (
                                  <button
                                    key={preset.name}
                                    type="button"
                                    onClick={() => {
                                      const res = selectPresetArea(preset);
                                      setArea(preset.name);
                                      setMapUrl(res.mapUrl);
                                    }}
                                    className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                      selected
                                        ? 'bg-[var(--accent-fire)] text-white border-[var(--accent-fire)]'
                                        : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline)] hover:bg-[var(--bg-subtle)]'
                                    }`}
                                  >
                                    {preset.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label htmlFor="checkout-area" className="block text-sm font-bold mb-1.5">
                          اسم المنطقة أو الحي
                        </label>
                        <input
                          id="checkout-area"
                          type="text"
                          required
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                          placeholder="مثال تلاع العلي أو خلدا أو الشميساني"
                          className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                        {errors.area && (
                          <p role="alert" className="mt-1.5 text-xs font-bold text-[var(--accent-fire)]">
                            {errors.area}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="checkout-address" className="block text-sm font-bold mb-1.5">
                          العنوان التفصيلي
                        </label>
                        <input
                          id="checkout-address"
                          type="text"
                          autoComplete="street-address"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="اسم الشارع ورقم البناية والطابق"
                          className="w-full min-h-[48px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                        {errors.address && (
                          <p role="alert" className="mt-1.5 text-xs font-bold text-[var(--accent-fire)]">
                            {errors.address}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] text-sm">
                      <div className="font-bold text-[var(--text-primary)] mb-1">
                        عنوان الاستلام من المطعم
                      </div>
                      <div className="text-[var(--text-secondary)]">{restaurant.address}</div>
                    </div>
                  )}

                  {/* كوبون الخصم */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-2.5">
                    <div className="flex items-center gap-2 font-display font-bold text-sm">
                      <Tag className="w-4 h-4 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
                      <span>هل لديك كوبون خصم</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        dir="ltr"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="ZOLDIX10"
                        disabled={Boolean(appliedCoupon)}
                        className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left font-mono uppercase text-sm disabled:opacity-70"
                      />
                      {appliedCoupon ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCoupon(null);
                            setCouponInput('');
                            setCouponError('');
                          }}
                          className="min-h-[44px] px-4 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] font-bold text-xs"
                        >
                          إزالة
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading}
                          className="min-h-[44px] px-4 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5"
                        >
                          {couponLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>تطبيق</span>
                        </button>
                      )}
                    </div>
                    {couponError && (
                      <div className="text-xs font-bold text-[var(--accent-fire)]">{couponError}</div>
                    )}
                    {appliedCoupon && (
                      <div className="text-xs font-bold text-emerald-300">
                        تم تفعيل الكوبون {appliedCoupon.code} بخصم{' '}
                        {appliedCoupon.waivesDelivery
                          ? 'توصيل مجاني'
                          : formatPrice(appliedCoupon.discountAmount, currency)}
                      </div>
                    )}
                  </div>

                  {/* استبدال نقاط الولاء للعميل المسجل */}
                  {auth.user && userPoints > 0 && (
                    <label className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--accent-gold)]/40 cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <Award className="w-5 h-5 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
                        <div>
                          <div className="font-bold text-sm text-[var(--text-primary)]">
                            استبدال نقاط الولاء ({userPoints} نقطة)
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            يوفر لك خصماً يصل إلى {formatPrice(maxLoyaltyDiscount, currency)} على هذا الطلب
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={useLoyaltyPoints}
                        onChange={(e) => setUseLoyaltyPoints(e.target.checked)}
                        className="w-5 h-5 accent-[var(--accent-fire)]"
                      />
                    </label>
                  )}

                  <div className="pt-2 space-y-3">
                    <span className="block text-sm font-display font-bold">اختر طريقة الدفع</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        aria-pressed={paymentMethod === 'cash'}
                        className={`min-h-[48px] px-3 py-2.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                          paymentMethod === 'cash'
                            ? 'border-[var(--accent-fire)] bg-[var(--accent-fire-soft)] text-[var(--accent-gold)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <Banknote className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>كاش عند الاستلام</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('pos_card')}
                        aria-pressed={paymentMethod === 'pos_card'}
                        className={`min-h-[48px] px-3 py-2.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                          paymentMethod === 'pos_card'
                            ? 'border-[var(--accent-fire)] bg-[var(--accent-fire-soft)] text-[var(--accent-gold)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>بطاقة عند المندوب</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('stripe')}
                        aria-pressed={isElectronicMethod}
                        className={`min-h-[48px] px-3 py-2.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                          isElectronicMethod
                            ? 'border-[var(--accent-fire)] bg-[var(--accent-fire-soft)] text-[var(--accent-gold)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>دفع إلكتروني (Stripe)</span>
                      </button>
                    </div>

                    {isElectronicMethod && (
                      <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-4">
                        <div>
                          <label htmlFor="receipt-email" className="block text-xs font-bold mb-1">
                            البريد الإلكتروني لاستلام إيصال وتأكيد الدفع (اختياري)
                          </label>
                          <input
                            id="receipt-email"
                            type="email"
                            dir="ltr"
                            value={receiptEmail}
                            onChange={(e) => setReceiptEmail(e.target.value)}
                            placeholder="name@gmail.com"
                            className="w-full min-h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left text-sm"
                          />
                          {errors.receiptEmail && (
                            <p role="alert" className="mt-1 text-xs font-bold text-[var(--accent-fire)]">
                              {errors.receiptEmail}
                            </p>
                          )}
                        </div>

                        {stripeConfigured ? (
                          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 text-xs sm:text-sm text-emerald-200 space-y-1">
                            <div className="font-extrabold">بوابة Stripe Checkout المفعلة</div>
                            <div className="text-[var(--text-secondary)] leading-relaxed">
                              عند الضغط على تأكيد وإرسال الطلب سيتم توجيهك إلى صفحة الدفع الآمنة في Stripe وإرسال إيصال الدفع عبر البريد الإلكتروني فور الإتمام
                            </div>
                          </div>
                        ) : (
                          <>
                        <div className="mx-auto max-w-[330px]" style={{ perspective: '1000px' }}>
                          <div
                            className="relative h-44 w-full transition-transform duration-500"
                            style={{
                              transformStyle: 'preserve-3d',
                              transform: isCardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                            }}
                          >
                            <div
                              className="absolute inset-0 rounded-2xl p-5 text-white flex flex-col justify-between shadow-xl bg-gradient-to-br from-[#241D19] via-[#7A3E24] to-[#C96A3B] border border-white/15"
                              style={{ backfaceVisibility: 'hidden' }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[#EFE7DC]">
                                  {restaurant.name}
                                </span>
                                <span className="font-display font-black text-sm tracking-wider">
                                  {cardBrand}
                                </span>
                              </div>
                              <div
                                dir="ltr"
                                className="font-mono text-lg sm:text-xl tracking-widest text-center tabular-nums"
                              >
                                {formatCardNumberDisplay(rawCardDigits.padEnd(16, '•'))}
                              </div>
                              <div className="flex items-end justify-between text-xs">
                                <div>
                                  <div className="opacity-70 text-[10px]">حامل البطاقة</div>
                                  <div className="font-bold truncate max-w-[160px]">
                                    {cardHolder || 'الاسم على البطاقة'}
                                  </div>
                                </div>
                                <div dir="ltr" className="text-left">
                                  <div className="opacity-70 text-[10px]">الانتهاء</div>
                                  <div className="font-mono font-bold">
                                    {cardExpiry || '08/28'}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div
                              className="absolute inset-0 rounded-2xl p-5 text-white flex flex-col justify-between shadow-xl bg-gradient-to-br from-[#13100E] to-[#3B251B] border border-white/15"
                              style={{
                                backfaceVisibility: 'hidden',
                                transform: 'rotateY(180deg)',
                              }}
                            >
                              <div className="h-8 -mx-5 bg-black/80 mt-2" />
                              <div className="bg-white/90 text-[#13100E] rounded-lg px-3 py-2 flex items-center justify-between">
                                <span className="text-xs font-bold">CVV</span>
                                <span dir="ltr" className="font-mono font-black tracking-widest">
                                  {cardCvv || '•••'}
                                </span>
                              </div>
                              <div className="text-[11px] text-white/75 text-center">
                                يتم التحقق بأمان دون حفظ رمز الأمان السري
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label htmlFor="card-num" className="block text-xs font-bold mb-1">
                              رقم البطاقة
                            </label>
                            <input
                              id="card-num"
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              maxLength={19}
                              value={formatCardNumberDisplay(rawCardDigits)}
                              onFocus={() => setIsCardFlipped(false)}
                              onChange={(e) => setCardNumber(normalizeDigits(e.target.value))}
                              placeholder="4532 1234 5678 9012"
                              className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left font-mono"
                            />
                            {errors.cardNumber && (
                              <p role="alert" className="mt-1 text-xs font-bold text-[var(--accent-fire)]">
                                {errors.cardNumber}
                              </p>
                            )}
                          </div>

                          <div>
                            <label htmlFor="card-holder" className="block text-xs font-bold mb-1">
                              اسم حامل البطاقة
                            </label>
                            <input
                              id="card-holder"
                              type="text"
                              value={cardHolder}
                              onFocus={() => setIsCardFlipped(false)}
                              onChange={(e) => setCardHolder(e.target.value)}
                              placeholder="AHMAD AL OMARI"
                              className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2"
                            />
                            {errors.cardHolder && (
                              <p role="alert" className="mt-1 text-xs font-bold text-[var(--accent-fire)]">
                                {errors.cardHolder}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label htmlFor="card-exp" className="block text-xs font-bold mb-1">
                                شهر وسنة الانتهاء
                              </label>
                              <input
                                id="card-exp"
                                type="text"
                                inputMode="numeric"
                                dir="ltr"
                                maxLength={5}
                                value={cardExpiry}
                                onFocus={() => setIsCardFlipped(false)}
                                onChange={(e) => {
                                  const d = normalizeDigits(e.target.value).slice(0, 4);
                                  setCardExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                                }}
                                placeholder="08/28"
                                className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left font-mono"
                              />
                              {errors.cardExpiry && (
                                <p role="alert" className="mt-1 text-xs font-bold text-[var(--accent-fire)]">
                                  {errors.cardExpiry}
                                </p>
                              )}
                            </div>

                            <div>
                              <label htmlFor="card-cvv" className="block text-xs font-bold mb-1">
                                رمز الأمان
                              </label>
                              <input
                                id="card-cvv"
                                type="password"
                                inputMode="numeric"
                                dir="ltr"
                                maxLength={4}
                                value={cardCvv}
                                onFocus={() => setIsCardFlipped(true)}
                                onBlur={() => setIsCardFlipped(false)}
                                onChange={(e) => setCardCvv(normalizeDigits(e.target.value).slice(0, 4))}
                                placeholder="123"
                                className="w-full min-h-[46px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2 text-left font-mono"
                              />
                              {errors.cardCvv && (
                                <p role="alert" className="mt-1 text-xs font-bold text-[var(--accent-fire)]">
                                  {errors.cardCvv}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="checkout-notes" className="block text-sm font-bold mb-1.5">
                      ملاحظات إضافية اختيارية
                    </label>
                    <textarea
                      id="checkout-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={400}
                      placeholder="أي تفاصيل أخرى للمندوب أو المطبخ"
                      className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                  </div>

                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: '-9999px',
                      width: '1px',
                      height: '1px',
                      overflow: 'hidden',
                    }}
                  >
                    <label htmlFor="hp-website">الموقع الإلكتروني</label>
                    <input
                      id="hp-website"
                      name="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  {errors.submit && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-2xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-sm font-bold text-[var(--text-primary)]"
                    >
                      {errors.submit}
                    </div>
                  )}
                </div>

                <div className="p-4 sm:p-5 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] pb-safe shrink-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
                    <span>
                      {items.reduce((s, i) => s + i.quantity, 0)} أصناف والتوصيل{' '}
                      {effectiveDeliveryFee === 0 ? 'مجاني' : formatPrice(effectiveDeliveryFee, currency)}
                    </span>
                    <span className="tabular-nums font-display font-black text-lg text-[var(--text-primary)]">
                      المجموع {formatPrice(appliedCoupon || useLoyaltyPoints ? finalPreviewTotal : total, currency)}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || !restaurant.acceptingOrders}
                    className="w-full min-h-[52px] px-6 py-3 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] disabled:opacity-55 text-white font-display font-black text-lg flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.99] transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                        <span>جاري إرسال الطلب</span>
                      </>
                    ) : (
                      <span>تأكيد وإرسال الطلب</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
