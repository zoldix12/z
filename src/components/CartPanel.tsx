/**
 * لوحة سلة الطلبات الجانبية أو السفلية مع حساب الأسعار والعملة من الإعدادات الحية.
 */
import React from 'react';
import { Minus, Plus, Trash2, ShoppingBag, Truck, Store, CreditCard } from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { CartEntry, OrderType } from '../types/menu';
import { FoodImage } from './FoodImage';

interface CartPanelProps {
  items: CartEntry[];
  orderType: OrderType;
  subtotal: number;
  deliveryFee: number;
  total: number;
  remainingForFreeDelivery: number;
  isFreeDeliveryByThreshold: boolean;
  onChangeOrderType: (type: OrderType) => void;
  onUpdateQuantity: (cartKey: string, delta: number) => void;
  onRemoveItem: (cartKey: string) => void;
  onCheckout: () => void;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  items,
  orderType,
  subtotal,
  deliveryFee,
  total,
  remainingForFreeDelivery,
  isFreeDeliveryByThreshold,
  onChangeOrderType,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}) => {
  const { siteConfig } = useSite();
  const { restaurant } = siteConfig;
  const currency = restaurant.currency;

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[var(--bg-subtle)] mb-4">
        <button
          type="button"
          onClick={() => onChangeOrderType('delivery')}
          aria-pressed={orderType === 'delivery'}
          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
            orderType === 'delivery'
              ? 'bg-[var(--bg-surface)] text-[var(--accent-gold)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Truck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>توصيل للعنوان</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeOrderType('pickup')}
          aria-pressed={orderType === 'pickup'}
          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
            orderType === 'pickup'
              ? 'bg-[var(--bg-surface)] text-[var(--accent-gold)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Store className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>استلام من المطعم</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-2xl bg-[var(--bg-subtle)]/50 border border-dashed border-[var(--border-strong)]">
          <ShoppingBag
            className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <p className="font-display font-bold text-base text-[var(--text-primary)] mb-1">
            سلة طلباتك فارغة حالياً
          </p>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            اختر من العروض أو المنيو لإضافة أطباقك المفضلة إلى طلبك
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 overflow-y-auto max-h-[44dvh] lg:max-h-[48dvh] pl-1">
            {items.map((entry) => (
              <div
                key={entry.cartKey}
                className="flex gap-3 p-3 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)]"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-[var(--bg-subtle)]">
                  <FoodImage src={entry.image} alt={entry.name} className="w-full h-full" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-display font-bold text-sm text-[var(--text-primary)] truncate">
                      {entry.name}
                    </h4>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(entry.cartKey)}
                      aria-label={`حذف ${entry.name}`}
                      className="min-h-[44px] min-w-[44px] -mt-2 -ml-2 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--accent-fire)] hover:bg-[var(--accent-fire-soft)] transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {entry.variantName && (
                    <p className="text-xs font-bold text-[var(--accent-gold)] mt-0.5 truncate">
                      {entry.variantName}
                    </p>
                  )}

                  {entry.addons.length > 0 && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                      مع {entry.addons.map((a) => a.name).join('، ')}
                    </p>
                  )}

                  {entry.notes && (
                    <p className="text-xs text-[var(--accent-gold)] mt-0.5 line-clamp-2">
                      ملاحظة {entry.notes}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 mt-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(entry.cartKey, -1)}
                        aria-label={`إنقاص كمية ${entry.name}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] active:scale-95"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="tabular-nums font-bold text-sm min-w-[24px] text-center">
                        {entry.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(entry.cartKey, 1)}
                        aria-label={`زيادة كمية ${entry.name}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="tabular-nums font-display font-extrabold text-sm text-[var(--text-primary)]">
                      {formatPrice(entry.unitPrice * entry.quantity, currency)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {remainingForFreeDelivery > 0 && (
            <div className="mt-3 p-2.5 rounded-xl bg-[var(--accent-gold-soft)] text-xs font-bold text-[var(--text-primary)] text-center">
              أضف بقيمة {formatPrice(remainingForFreeDelivery, currency)} للحصول على توصيل مجاني
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-[var(--border-hairline)] space-y-2 text-sm">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>المجموع الفرعي</span>
              <span className="tabular-nums font-bold text-[var(--text-primary)]">
                {formatPrice(subtotal, currency)}
              </span>
            </div>

            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>
                {orderType === 'pickup' ? 'رسوم الاستلام من الفرع' : 'رسوم التوصيل'}
              </span>
              <span className="tabular-nums font-bold text-[var(--text-primary)]">
                {deliveryFee === 0
                  ? orderType === 'delivery' && isFreeDeliveryByThreshold
                    ? 'مجاني'
                    : formatPrice(0, currency)
                  : formatPrice(deliveryFee, currency)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-dashed border-[var(--border-strong)]">
              <span className="font-display font-black text-base">المجموع النهائي</span>
              <span className="tabular-nums font-display font-black text-xl text-[var(--accent-gold)]">
                {formatPrice(total, currency)}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1 text-xs font-bold text-[var(--text-secondary)]">
              <CreditCard className="w-4 h-4 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
              <span>دفع مرن كاش أو بطاقة عند الإتمام</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onCheckout}
            className="mt-4 w-full min-h-[48px] px-5 py-3 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-base shadow-md active:scale-[0.98] transition-all"
          >
            إتمام الطلب ({formatPrice(total, currency)})
          </button>
        </>
      )}

      {items.length === 0 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <CreditCard className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
          <span>توصيل {restaurant.estimatedDeliveryMinutes}</span>
        </div>
      )}
    </div>
  );
};
