/**
 * نافذة تفاصيل الصنف وتخصيص نوع الخبز والحجم والإضافات والملاحظات السريعة.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Minus, Plus, ShoppingBag, Zap, X, Check } from 'lucide-react';
import {
  formatPrice,
  getAddonsForProduct,
  getVariantsForProduct,
} from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { OrderableProduct } from '../types/menu';
import { FoodImage } from './FoodImage';

interface ItemModalProps {
  product: OrderableProduct | null;
  onClose: () => void;
  onAddToCart: (
    product: OrderableProduct,
    quantity: number,
    addonIds: string[],
    notes: string,
    variantId?: string
  ) => void;
  onOrderNow: (
    product: OrderableProduct,
    quantity: number,
    addonIds: string[],
    notes: string,
    variantId?: string
  ) => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onOrderNow,
}) => {
  const { siteConfig, favorites, toggleFavorite } = useSite();
  const currency = siteConfig.restaurant.currency;
  const isFav = product ? favorites.includes(product.id) : false;

  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const availableVariants = useMemo(
    () => (product ? getVariantsForProduct(product, siteConfig.variants) : []),
    [product, siteConfig.variants]
  );

  const availableAddons = useMemo(
    () => (product ? getAddonsForProduct(product, siteConfig.addons) : []),
    [product, siteConfig.addons]
  );

  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setSelectedVariant(availableVariants[0]?.id || '');
    setSelectedAddons([]);
    setNotes('');
  }, [product, availableVariants]);

  useEffect(() => {
    if (!product) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [product, onClose]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    const vDelta =
      availableVariants.find((v) => v.id === selectedVariant)?.priceDelta || 0;
    const addonsSum = availableAddons
      .filter((a) => selectedAddons.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0);
    return Number((product.price + vDelta + addonsSum).toFixed(2));
  }, [product, availableVariants, selectedVariant, availableAddons, selectedAddons]);

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleQuickNote = (chip: string) => {
    setNotes((prev) => {
      const parts = prev
        .split('،')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.includes(chip)) {
        return parts.filter((s) => s !== chip).join('، ');
      }
      return [...parts, chip].join('، ');
    });
  };

  const totalLinePrice = Number((unitPrice * quantity).toFixed(2));

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 safari-blur p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-modal-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="w-full sm:max-w-xl max-h-[93dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-[var(--shadow-modal)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-44 sm:h-52 w-full shrink-0 bg-[var(--bg-subtle)]">
              <FoodImage src={product.image} alt={product.name} className="w-full h-full" />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25"
                aria-hidden="true"
              />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="إغلاق النافذة"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/85 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(product.id)}
                  aria-pressed={isFav}
                  aria-label={isFav ? `إزالة ${product.name} من المفضلة` : `إضافة ${product.name} للمفضلة`}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/65 text-white hover:bg-black/85 transition-colors"
                >
                  <Heart
                    className={`w-5 h-5 ${
                      isFav ? 'fill-[var(--accent-fire)] text-[var(--accent-fire)]' : 'text-white'
                    }`}
                  />
                </button>
              </div>
              {product.discountLabel && (
                <div className="absolute top-3 right-3 rounded-xl bg-[var(--accent-fire)] text-white px-3 py-1 text-xs font-extrabold">
                  {product.discountLabel}
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h2 id="item-modal-title" className="font-display font-black text-xl sm:text-2xl">
                    {product.name}
                  </h2>
                  <div className="text-left shrink-0">
                    {product.originalPrice && product.originalPrice > product.price && (
                      <div className="tabular-nums text-xs text-[var(--text-muted)] line-through">
                        {formatPrice(product.originalPrice, currency)}
                      </div>
                    )}
                    <div className="tabular-nums font-display font-black text-xl text-[var(--accent-gold)]">
                      {formatPrice(product.price, currency)}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  {product.description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-[var(--bg-subtle)]">
                <span className="font-display font-bold text-sm sm:text-base">الكمية</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="إنقاص الكمية"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="tabular-nums font-display font-black text-lg min-w-[28px] text-center">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(50, q + 1))}
                    aria-label="زيادة الكمية"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {availableVariants.length > 0 && (
                <div>
                  <h3 className="font-display font-bold text-base mb-2.5">
                    اختر نوع الخبز والحجم
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {availableVariants.map((variant) => {
                      const active = selectedVariant === variant.id;
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => setSelectedVariant(variant.id)}
                          aria-pressed={active}
                          className={`min-h-[44px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-right text-xs sm:text-sm font-bold transition-colors ${
                            active
                              ? 'border-[var(--accent-fire)] bg-[var(--accent-fire-soft)] text-[var(--accent-gold)]'
                              : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                          }`}
                        >
                          <span>{variant.name}</span>
                          <span className="tabular-nums shrink-0">
                            {variant.priceDelta > 0
                              ? `+${formatPrice(variant.priceDelta, currency)}`
                              : 'مشمول'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {availableAddons.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <h3 className="font-display font-bold text-base">
                      إضافات المايونيز والشاورما والصوصات
                    </h3>
                    {selectedAddons.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedAddons([])}
                        className="min-h-[44px] px-2 text-xs font-bold text-[var(--accent-gold)] underline"
                      >
                        مسح الكل ({selectedAddons.length})
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {availableAddons.map((addon) => {
                      const checked = selectedAddons.includes(addon.id);
                      return (
                        <button
                          key={addon.id}
                          type="button"
                          onClick={() => toggleAddon(addon.id)}
                          aria-pressed={checked}
                          className={`min-h-[46px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors ${
                            checked
                              ? 'border-[var(--accent-fire)] bg-[var(--accent-fire-soft)]'
                              : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 ${
                                checked
                                  ? 'bg-[var(--accent-fire)] border-[var(--accent-fire)] text-white'
                                  : 'border-[var(--border-strong)]'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5" />}
                            </span>
                            <span className="font-bold text-xs sm:text-sm truncate">
                              {addon.name}
                            </span>
                          </span>
                          <span className="tabular-nums text-xs font-extrabold text-[var(--accent-gold)] whitespace-nowrap shrink-0">
                            +{formatPrice(addon.price, currency)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="item-notes-input"
                  className="block font-display font-bold text-base mb-2"
                >
                  ملاحظات سريعة وتوصيات التحضير
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {siteConfig.quickNotes.map((chip) => {
                    const active = notes.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleQuickNote(chip)}
                        aria-pressed={active}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors ${
                          active
                            ? 'bg-[var(--accent-gold)] text-[#13100E] border-[var(--accent-gold)]'
                            : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {chip}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  id="item-notes-input"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={200}
                  placeholder="اكتب أي ملاحظة إضافية للمطبخ"
                  className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-fire)]"
                />
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] pb-safe space-y-2.5">
              <div className="flex items-center justify-between text-sm font-bold text-[var(--text-secondary)] mb-1">
                <span>المجموع لهذا الصنف</span>
                <span className="tabular-nums font-display font-black text-lg text-[var(--text-primary)]">
                  {formatPrice(totalLinePrice, currency)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onOrderNow(
                      product,
                      quantity,
                      selectedAddons,
                      notes,
                      selectedVariant || undefined
                    )
                  }
                  className="min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all"
                >
                  <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>اطلب وتوصيل الآن</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onAddToCart(
                      product,
                      quantity,
                      selectedAddons,
                      notes,
                      selectedVariant || undefined
                    )
                  }
                  className="min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-display font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>إضافة للسلة</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
