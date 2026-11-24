/**
 * الشريط السفلي الثابت للسلة على الجوال ودرج السلة المنزلق من الأسفل.
 */
import React, { useEffect } from 'react';
import { ShoppingBag, ChevronUp, X } from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { CartEntry, OrderType } from '../types/menu';
import { CartPanel } from './CartPanel';

interface MobileBottomCartBarProps {
  totalCount: number;
  total: number;
  isSheetOpen: boolean;
  onOpenSheet: () => void;
  onCloseSheet: () => void;
  items: CartEntry[];
  orderType: OrderType;
  subtotal: number;
  deliveryFee: number;
  remainingForFreeDelivery: number;
  isFreeDeliveryByThreshold: boolean;
  onChangeOrderType: (type: OrderType) => void;
  onUpdateQuantity: (cartKey: string, delta: number) => void;
  onRemoveItem: (cartKey: string) => void;
  onCheckout: () => void;
}

export const MobileBottomCartBar: React.FC<MobileBottomCartBarProps> = ({
  totalCount,
  total,
  isSheetOpen,
  onOpenSheet,
  onCloseSheet,
  items,
  orderType,
  subtotal,
  deliveryFee,
  remainingForFreeDelivery,
  isFreeDeliveryByThreshold,
  onChangeOrderType,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}) => {
  const { siteConfig } = useSite();
  const currency = siteConfig.restaurant.currency;

  useEffect(() => {
    if (!isSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseSheet();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSheetOpen, onCloseSheet]);

  return (
    <>
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-bottom-bar)] safari-blur border-t border-[var(--border-hairline)] pt-2.5 bottom-bar-safe shadow-[0_-8px_28px_rgba(0,0,0,0.22)]">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={onOpenSheet}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white flex items-center justify-between gap-3 shadow-md active:scale-[0.99] transition-transform"
          >
            <span className="flex items-center gap-2.5">
              <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-xl bg-black/20">
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="font-display font-extrabold text-sm sm:text-base">
                سلة الطلبات ({totalCount})
              </span>
            </span>

            <span className="flex items-center gap-2">
              <span className="tabular-nums font-display font-black text-base">
                {formatPrice(total, currency)}
              </span>
              <ChevronUp className="w-4 h-4 opacity-90" aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>

      {/* درج السلة المنزلق من الأسفل */}
      {isSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 safari-blur"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-cart-title"
          onClick={onCloseSheet}
        >
          <div
            className="w-full max-w-2xl max-h-[88dvh] flex flex-col rounded-t-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border-t border-[var(--border-hairline)] shadow-[var(--shadow-modal)] animate-sheet-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* مقبض السحب والعنوان */}
            <div className="pt-3 px-5 pb-3 border-b border-[var(--border-hairline)]">
              <div
                className="w-10 h-1.5 rounded-full bg-[var(--border-strong)] mx-auto mb-3"
                aria-hidden="true"
              />
              <div className="flex items-center justify-between gap-4">
                <h2 id="mobile-cart-title" className="font-display font-black text-xl">
                  سلة طلباتك ({totalCount})
                </h2>
                <button
                  type="button"
                  onClick={onCloseSheet}
                  aria-label="إغلاق السلة"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto pb-safe">
              <CartPanel
                items={items}
                orderType={orderType}
                subtotal={subtotal}
                deliveryFee={deliveryFee}
                total={total}
                remainingForFreeDelivery={remainingForFreeDelivery}
                isFreeDeliveryByThreshold={isFreeDeliveryByThreshold}
                onChangeOrderType={onChangeOrderType}
                onUpdateQuantity={onUpdateQuantity}
                onRemoveItem={onRemoveItem}
                onCheckout={() => {
                  onCloseSheet();
                  onCheckout();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
