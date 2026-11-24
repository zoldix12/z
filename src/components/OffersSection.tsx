/**
 * قسم العروض المميزة المقروء مباشرة من إعدادات الموقع الحية،
 * مع زر المفضلة وتعديلات الإدارة المباشرة على الصفحة.
 */
import React from 'react';
import { motion } from 'motion/react';
import { Flame, Heart, ImagePlus, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { OfferItem, OrderableProduct } from '../types/menu';
import { FoodImage } from './FoodImage';

interface OffersSectionProps {
  countByItemId: Record<string, number>;
  onSelectProduct: (product: OrderableProduct) => void;
  onQuickAdd: (product: OrderableProduct) => void;
}

export const OffersSection: React.FC<OffersSectionProps> = ({
  countByItemId,
  onSelectProduct,
  onQuickAdd,
}) => {
  const { siteConfig, favorites, toggleFavorite, auth, isEditMode, setDraftConfig } = useSite();
  const offers = siteConfig.offers;
  const currency = siteConfig.restaurant.currency;

  const isEditable =
    (auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode;

  if (offers.length === 0 && !isEditable) return null;

  const handleAddOffer = () => {
    const newOffer: OfferItem = {
      id: `offer_${Date.now()}`,
      name: 'عرض شواء جديد',
      description: 'وجبة شواء متكاملة مع البطاطا والمشروب البارد',
      originalPrice: 9.5,
      price: 7.5,
      discountLabel: 'عرض خاص',
      image: '/images/zoldix-signature.jpg',
      addonIds: [],
    };
    setDraftConfig((p) => ({ ...p, offers: [newOffer, ...p.offers] }));
  };

  return (
    <section id="offers" className="scroll-mt-20 py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[var(--accent-gold)] mb-1">
              <Flame className="w-4 h-4" aria-hidden="true" />
              <span>تشكيلة منتقاة بعناية</span>
            </div>
            <h2 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)]">
              العروض المميزة
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--text-secondary)]">
              أضف العرض مباشرة أو خصصه بالمايونيز والصوصات المفضلة
            </p>
            {isEditable && (
              <button
                type="button"
                onClick={handleAddOffer}
                className="min-h-[40px] px-3.5 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-black text-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>إضافة عرض جديد</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {offers.map((offer, idx) => {
            const countInCart = countByItemId[offer.id] || 0;
            const isFav = favorites.includes(offer.id);
            const editable =
              (auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode;

            return (
              <motion.article
                key={offer.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.3, delay: idx * 0.05 }}
                whileHover={{ y: editable ? 0 : -4 }}
                onClick={() => {
                  if (!editable) onSelectProduct(offer);
                }}
                className={`group flex flex-col justify-between rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] overflow-hidden shadow-[var(--shadow-card)] ${
                  editable ? 'ring-1 ring-[var(--accent-gold)]/50' : 'cursor-pointer'
                }`}
              >
                <div>
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-subtle)]">
                    <FoodImage
                      src={offer.image}
                      alt={offer.name}
                      className="w-full h-full group-hover:scale-[1.04] transition-transform duration-300"
                    />
                    {offer.discountLabel && (
                      <div className="absolute top-3 right-3 rounded-xl bg-[var(--accent-fire)] text-white px-3 py-1.5 text-xs font-extrabold shadow-md">
                        {offer.discountLabel}
                      </div>
                    )}

                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(offer.id);
                        }}
                        aria-label={isFav ? `إزالة ${offer.name} من المفضلة` : `إضافة ${offer.name} للمفضلة`}
                        className="w-10 h-10 rounded-xl bg-black/55 safari-blur border border-white/15 flex items-center justify-center text-white hover:scale-105 transition-transform"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            isFav ? 'fill-[var(--accent-fire)] text-[var(--accent-fire)]' : 'text-white'
                          }`}
                        />
                      </button>

                      {countInCart > 0 && (
                        <div className="rounded-xl bg-[var(--accent-gold)] text-[#13100E] px-2.5 py-1.5 text-xs font-black shadow-md tabular-nums">
                          بالسلة {countInCart}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-5">
                    {editable ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0">
                            <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
                            <span>تغيير الصورة</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file || file.size > 1_500_000) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  if (typeof reader.result === 'string') {
                                    const next = [...offers];
                                    next[idx] = { ...offer, image: reader.result };
                                    setDraftConfig((p) => ({ ...p, offers: next }));
                                  }
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={offer.image}
                            onChange={(e) => {
                              const next = [...offers];
                              next[idx] = { ...offer, image: e.target.value };
                              setDraftConfig((p) => ({ ...p, offers: next }));
                            }}
                            placeholder="رابط الصورة"
                            className="flex-1 min-w-0 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-left text-[11px]"
                          />
                        </div>
                        <input
                          type="text"
                          value={offer.name}
                          onChange={(e) => {
                            const next = [...offers];
                            next[idx] = { ...offer, name: e.target.value };
                            setDraftConfig((p) => ({ ...p, offers: next }));
                          }}
                          className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 font-display font-bold text-sm"
                        />
                        <textarea
                          rows={2}
                          value={offer.description}
                          onChange={(e) => {
                            const next = [...offers];
                            next[idx] = { ...offer, description: e.target.value };
                            setDraftConfig((p) => ({ ...p, offers: next }));
                          }}
                          className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            step="0.05"
                            value={offer.price}
                            onChange={(e) => {
                              const next = [...offers];
                              next[idx] = { ...offer, price: Number(e.target.value || 1) };
                              setDraftConfig((p) => ({ ...p, offers: next }));
                            }}
                            className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                          />
                          <input
                            type="text"
                            value={offer.discountLabel}
                            onChange={(e) => {
                              const next = [...offers];
                              next[idx] = { ...offer, discountLabel: e.target.value };
                              setDraftConfig((p) => ({ ...p, offers: next }));
                            }}
                            placeholder="شارة العرض"
                            className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-display font-extrabold text-lg sm:text-xl text-[var(--text-primary)] mb-2">
                          {offer.name}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                          {offer.description}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="px-4 sm:px-5 pb-4 pt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--border-hairline)] mt-auto">
                  <div className="flex flex-col">
                    {offer.originalPrice > offer.price && (
                      <span className="tabular-nums text-xs text-[var(--text-muted)] line-through">
                        {formatPrice(offer.originalPrice, currency)}
                      </span>
                    )}
                    <span className="tabular-nums font-display font-black text-xl text-[var(--accent-gold)]">
                      {formatPrice(offer.price, currency)}
                    </span>
                  </div>

                  {editable ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftConfig((p) => ({
                          ...p,
                          offers: p.offers.filter((o) => o.id !== offer.id),
                        }))
                      }
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] font-bold text-xs inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      <span>حذف العرض</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectProduct(offer);
                        }}
                        aria-label={`تخصيص ${offer.name}`}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--border-hairline)] text-[var(--text-primary)] font-bold text-xs sm:text-sm active:scale-[0.97] transition-transform whitespace-nowrap"
                      >
                        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                        <span>تخصيص</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickAdd(offer);
                        }}
                        className="inline-flex items-center justify-center gap-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-extrabold text-xs sm:text-sm active:scale-[0.97] transition-transform whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4" aria-hidden="true" />
                        <span>أضف فوراً</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
