/**
 * استعراض منتصف الصفحة بأسلوب MotionSites السينمائي:
 * خلفية كاملة تتبدل فيها لقطات الحلويات والعصائر بنعومة تامة أثناء تمرير الصفحة،
 * مع دعم التعديل المباشر للإدارة في وضع التحرير.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, ImagePlus, Pencil, Sparkles } from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { OrderableProduct } from '../types/menu';

interface MidPageShowcaseProps {
  onSelectProduct: (product: OrderableProduct) => void;
}

export const MidPageShowcase: React.FC<MidPageShowcaseProps> = ({ onSelectProduct }) => {
  const { siteConfig, auth, isEditMode, setDraftConfig, favorites, toggleFavorite } = useSite();
  const { midShowcase, restaurant } = siteConfig;
  const containerRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const totalTravel = rect.height + window.innerHeight;
      const current = window.innerHeight - rect.top;
      const p = Math.max(0, Math.min(1, current / Math.max(1, totalTravel)));
      setProgress(p);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const linkedProduct = useMemo(() => {
    const all: OrderableProduct[] = [...siteConfig.offers, ...siteConfig.items];
    return all.find((p) => p.id === midShowcase.productId) || siteConfig.items[0];
  }, [siteConfig.offers, siteConfig.items, midShowcase.productId]);

  const crossfade = Math.max(0, Math.min(1, (progress - 0.3) * 2.2));
  const scalePrimary = 1.08 - progress * 0.08;
  const scaleSecondary = 1.12 - progress * 0.1;

  return (
    <section
      ref={containerRef}
      className="relative min-h-[72dvh] sm:min-h-[82dvh] w-full overflow-hidden my-8 border-y border-[var(--border-hairline)] flex items-end"
      aria-label={midShowcase.title}
    >
      {/* اللقطة الأولى */}
      <img
        src={midShowcase.primaryImage || '/images/zoldix-kunafa.jpg'}
        alt={midShowcase.title}
        style={{ transform: `scale(${scalePrimary.toFixed(3)})` }}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-150 will-change-transform"
      />

      {/* اللقطة الثانية المتداخلة مع التمرير */}
      <img
        src={midShowcase.secondaryImage || '/images/mint-lemonade.webp'}
        alt="مشروبات باردة طبيعية"
        style={{
          opacity: crossfade,
          transform: `scale(${scaleSecondary.toFixed(3)})`,
        }}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-150 will-change-transform"
      />

      {/* تدرج لوني دافئ مريح للعين يبرز النص بوضوح */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(19,16,14,0.45) 0%, rgba(19,16,14,0.32) 40%, rgba(19,16,14,0.86) 88%, var(--bg-canvas) 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[var(--accent-gold)]">
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
              {(auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode ? (
                <input
                  type="text"
                  value={midShowcase.eyebrow}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      midShowcase: { ...prev.midShowcase, eyebrow: e.target.value },
                    }))
                  }
                  className="bg-black/60 border border-[var(--accent-gold)] rounded-lg px-2.5 py-1 text-xs text-[#EFE7DC]"
                />
              ) : (
                <span>{midShowcase.eyebrow}</span>
              )}
            </div>

            {(auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode ? (
              <div className="space-y-2.5 bg-black/65 safari-blur p-4 rounded-2xl border border-[var(--accent-gold)]/50">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-gold)]">
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>تعديل مباشر لمشهد المنتصف</span>
                </div>
                <input
                  type="text"
                  value={midShowcase.title}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      midShowcase: { ...prev.midShowcase, title: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 font-display font-black text-xl text-[#EFE7DC]"
                />
                <textarea
                  rows={2}
                  value={midShowcase.subtitle}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      midShowcase: { ...prev.midShowcase, subtitle: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 text-sm text-[#E6DDD0]"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <label className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[11px] font-bold text-[#EFE7DC] inline-flex items-center gap-1 cursor-pointer shrink-0">
                      <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
                      <span>صورة 1</span>
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
                              setDraftConfig((prev) => ({
                                ...prev,
                                midShowcase: { ...prev.midShowcase, primaryImage: reader.result as string },
                              }));
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={midShowcase.primaryImage || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          midShowcase: { ...prev.midShowcase, primaryImage: e.target.value },
                        }))
                      }
                      placeholder="/images/zoldix-kunafa.jpg"
                      className="flex-1 min-w-0 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-left text-[11px] text-[#EFE7DC]"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[11px] font-bold text-[#EFE7DC] inline-flex items-center gap-1 cursor-pointer shrink-0">
                      <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
                      <span>صورة 2</span>
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
                              setDraftConfig((prev) => ({
                                ...prev,
                                midShowcase: { ...prev.midShowcase, secondaryImage: reader.result as string },
                              }));
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={midShowcase.secondaryImage || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          midShowcase: { ...prev.midShowcase, secondaryImage: e.target.value },
                        }))
                      }
                      placeholder="/images/mint-lemonade.webp"
                      className="flex-1 min-w-0 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-2.5 py-1.5 text-left text-[11px] text-[#EFE7DC]"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <h2 className="font-display font-black text-3xl sm:text-5xl text-[#EFE7DC] leading-tight">
                  {midShowcase.title}
                </h2>
                <p className="text-sm sm:text-lg text-[#E6DDD0] leading-relaxed">
                  {midShowcase.subtitle}
                </p>
              </>
            )}
          </div>

          {linkedProduct && (
            <div className="sm:max-w-xs w-full p-5 rounded-3xl bg-black/55 safari-blur border border-white/15 space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[var(--accent-gold)]">اختيار السهرة</span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-display font-black text-base text-[#EFE7DC]">
                    {formatPrice(linkedProduct.price, restaurant.currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(linkedProduct.id)}
                    aria-label={
                      favorites.includes(linkedProduct.id)
                        ? `إزالة ${linkedProduct.name} من المفضلة`
                        : `إضافة ${linkedProduct.name} للمفضلة`
                    }
                    className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        favorites.includes(linkedProduct.id)
                          ? 'fill-[var(--accent-fire)] text-[var(--accent-fire)]'
                          : 'text-white'
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="font-display font-extrabold text-lg text-[#EFE7DC]">
                {linkedProduct.name}
              </div>
              <button
                type="button"
                onClick={() => onSelectProduct(linkedProduct)}
                className="w-full min-h-[46px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-sm transition-colors"
              >
                أضف إلى طلبك الآن
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
