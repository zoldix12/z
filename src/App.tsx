/**
 * التطبيق الرئيسي لمطعم zoldix مع مزامنة السلة، الحساب، الشات الفوري، ولوحة الإدارة.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { AboutFooter } from './components/AboutFooter';
import { AccountModal } from './components/AccountModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { CartPanel } from './components/CartPanel';
import { ChatDrawer } from './components/ChatDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { CustomSections } from './components/CustomSections';
import { DeveloperModal } from './components/DeveloperModal';
import { FloatingAdminBar } from './components/FloatingAdminBar';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { ItemModal } from './components/ItemModal';
import { MenuSection } from './components/MenuSection';
import { MidPageShowcase } from './components/MidPageShowcase';
import { MobileBottomCartBar } from './components/MobileBottomCartBar';
import { OffersSection } from './components/OffersSection';
import { OfflineIndicator } from './components/OfflineIndicator';
import { OrderTrackerBanner } from './components/OrderTrackerBanner';
import { useSite } from './context/SiteContext';
import { useCart } from './hooks/useCart';
import type { CartEntry, CustomerAccount, OrderableProduct, SubmittedOrderReceipt } from './types/menu';

export default function App() {
  const {
    disabledNotice,
    clearDisabledNotice,
    apiFetch,
    updateUserState,
    setTrackedOrder,
  } = useSite();
  const {
    items,
    countByItemId,
    orderType,
    setOrderType,
    addToCart,
    updateQuantity,
    removeItem,
    clearCart,
    replaceCart,
    totalCount,
    subtotal,
    deliveryFee,
    total,
    remainingForFreeDelivery,
    isFreeDeliveryByThreshold,
  } = useCart();

  const [selectedProduct, setSelectedProduct] = useState<OrderableProduct | null>(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isDeveloperOpen, setIsDeveloperOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const desktopCartRef = useRef<HTMLElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // استكمال تأكيد الدفع عند العودة من بوابة Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeSessionId = params.get('stripe_session_id');
    const stripeCancelled = params.get('stripe_cancelled');

    if (stripeCancelled) {
      showToast('تم إلغاء عملية الدفع الإلكتروني، سلتك ما زالت محفوظة');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (!stripeSessionId) return;
    let active = true;
    apiFetch('/api/payments/stripe/complete-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId: stripeSessionId }),
    })
      .then(async (res) => ({
        ok: res.ok,
        data: (await res.json()) as {
          ok?: boolean;
          order?: SubmittedOrderReceipt;
          user?: CustomerAccount | null;
          error?: string;
        },
      }))
      .then(({ ok, data }) => {
        if (!active) return;
        window.history.replaceState({}, '', window.location.pathname);
        if (ok && data.ok && data.order) {
          if (data.user) updateUserState(data.user);
          setTrackedOrder(data.order);
          clearCart();
          showToast('تم تأكيد الدفع الإلكتروني وإرسال طلبك بنجاح');
        } else {
          showToast(data.error || 'تعذر التحقق من جلسة الدفع الإلكتروني');
        }
      })
      .catch(() => {
        if (active) {
          window.history.replaceState({}, '', window.location.pathname);
          showToast('تعذر الاتصال للتحقق من الدفع الإلكتروني');
        }
      });

    return () => {
      active = false;
    };
  }, [apiFetch, clearCart, setTrackedOrder, showToast, updateUserState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.code === 'KeyZ' || e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        setIsAdminOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddToCart = useCallback(
    (
      product: OrderableProduct,
      quantity: number,
      addonIds: string[],
      notes: string,
      variantId?: string
    ) => {
      addToCart(product, quantity, addonIds, notes, variantId);
      setSelectedProduct(null);
      showToast(`تمت إضافة ${product.name} إلى السلة`);
    },
    [addToCart, showToast]
  );

  const handleQuickAdd = useCallback(
    (product: OrderableProduct) => {
      const defaultVariantId = product.variantIds?.[0];
      addToCart(product, 1, [], '', defaultVariantId);
      showToast(`تمت إضافة ${product.name} إلى السلة`);
    },
    [addToCart, showToast]
  );

  const handleOrderNow = useCallback(
    (
      product: OrderableProduct,
      quantity: number,
      addonIds: string[],
      notes: string,
      variantId?: string
    ) => {
      addToCart(product, quantity, addonIds, notes, variantId);
      setSelectedProduct(null);
      setIsMobileCartOpen(false);
      setIsCheckoutOpen(true);
    },
    [addToCart]
  );

  const handleReorderLastPurchase = useCallback(
    (entries: CartEntry[]) => {
      replaceCart(entries);
      showToast('تمت إعادة تعبئة آخر وجبة في سلتك');
      setIsCheckoutOpen(true);
    },
    [replaceCart, showToast]
  );

  const handleHeaderCartClick = useCallback(() => {
    if (window.innerWidth < 1024) {
      setIsMobileCartOpen(true);
    } else if (desktopCartRef.current) {
      desktopCartRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <OfflineIndicator />

      {disabledNotice && (
        <div
          role="alert"
          className="fixed top-16 inset-x-4 z-50 bg-[var(--accent-fire)] text-white px-4 py-3 rounded-2xl text-sm font-bold flex items-center justify-between gap-4 shadow-xl"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{disabledNotice}</span>
          </div>
          <button
            type="button"
            onClick={clearDisabledNotice}
            className="underline text-xs font-extrabold"
          >
            إغلاق
          </button>
        </div>
      )}

      <Header
        cartCount={totalCount}
        unreadChatCount={unreadChatCount}
        onOpenCart={handleHeaderCartClick}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenChat={() => setIsChatOpen(true)}
        onOpenDeveloper={() => setIsDeveloperOpen(true)}
      />

      <main className="flex-1">
        <HeroSection onSelectProduct={setSelectedProduct} />

        <OrderTrackerBanner />

        <OffersSection
          countByItemId={countByItemId}
          onSelectProduct={setSelectedProduct}
          onQuickAdd={handleQuickAdd}
        />

        <MidPageShowcase onSelectProduct={setSelectedProduct} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 min-w-0">
              <MenuSection
                countByItemId={countByItemId}
                onSelectProduct={setSelectedProduct}
                onQuickAdd={handleQuickAdd}
              />
            </div>

            <aside
              ref={desktopCartRef}
              aria-label="سلة الطلبات"
              className="hidden lg:block lg:col-span-4 safari-sticky top-[80px] rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] p-6 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-[var(--border-hairline)]">
                <h2 className="font-display font-black text-xl text-[var(--text-primary)]">
                  سلة الطلبات
                </h2>
                <span className="tabular-nums text-xs font-bold text-[var(--text-secondary)]">
                  {totalCount} أصناف
                </span>
              </div>

              <CartPanel
                items={items}
                orderType={orderType}
                subtotal={subtotal}
                deliveryFee={deliveryFee}
                total={total}
                remainingForFreeDelivery={remainingForFreeDelivery}
                isFreeDeliveryByThreshold={isFreeDeliveryByThreshold}
                onChangeOrderType={setOrderType}
                onUpdateQuantity={updateQuantity}
                onRemoveItem={removeItem}
                onCheckout={() => setIsCheckoutOpen(true)}
              />
            </aside>
          </div>
        </div>

        <CustomSections />
      </main>

      <AboutFooter onSecretOpenAdmin={() => setIsAdminOpen(true)} />

      <MobileBottomCartBar
        totalCount={totalCount}
        total={total}
        isSheetOpen={isMobileCartOpen}
        onOpenSheet={() => setIsMobileCartOpen(true)}
        onCloseSheet={() => setIsMobileCartOpen(false)}
        items={items}
        orderType={orderType}
        subtotal={subtotal}
        deliveryFee={deliveryFee}
        remainingForFreeDelivery={remainingForFreeDelivery}
        isFreeDeliveryByThreshold={isFreeDeliveryByThreshold}
        onChangeOrderType={setOrderType}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onCheckout={() => setIsCheckoutOpen(true)}
      />

      <ItemModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onOrderNow={handleOrderNow}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        items={items}
        orderType={orderType}
        subtotal={subtotal}
        deliveryFee={deliveryFee}
        total={total}
        onChangeOrderType={setOrderType}
        onClose={() => setIsCheckoutOpen(false)}
        onOrderSuccess={clearCart}
      />

      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        onReorderLastPurchase={handleReorderLastPurchase}
        onOpenDeveloper={() => setIsDeveloperOpen(true)}
        onSelectProduct={setSelectedProduct}
      />

      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onUnreadChange={setUnreadChatCount}
      />

      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onOpenDeveloper={() => setIsDeveloperOpen(true)}
      />

      <DeveloperModal
        isOpen={isDeveloperOpen}
        onClose={() => setIsDeveloperOpen(false)}
      />

      <FloatingAdminBar
        onOpenAdminPanel={() => setIsAdminOpen(true)}
        onOpenDeveloper={() => setIsDeveloperOpen(true)}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-[#EFE7DC] text-[#13100E] px-4 py-2.5 text-sm font-bold shadow-xl animate-modal-in whitespace-nowrap"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
