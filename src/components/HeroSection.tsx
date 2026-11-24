/**
 * واجهة البطولة الرئيسية بأسلوب MotionSites السينمائي الكامل:
 * خلفية الشاشة الكاملة (100dvh) تعمل مباشرة عبر مئة إطار من فيديو Veo 3
 * وتتحرك بسلاسة تامة مع تمرير الصفحة دون أي أزرار تشغيل أو أشرطة تقديم جانبية.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Flame, Heart, ImagePlus, UtensilsCrossed } from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { OrderableProduct } from '../types/menu';

const TOTAL_FRAMES = 100;

function getFrameUrl(index: number): string {
  const clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, index));
  return `/frames/frame-${String(clamped + 1).padStart(3, '0')}.webp`;
}

interface HeroSectionProps {
  onSelectProduct: (product: OrderableProduct) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onSelectProduct }) => {
  const { siteConfig, auth, isEditMode, setDraftConfig, favorites, toggleFavorite } = useSite();
  const { restaurant, heroChapters } = siteConfig;

  const trackRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<Array<HTMLImageElement | null>>(new Array(TOTAL_FRAMES).fill(null));
  const targetFloatFrameRef = useRef(0);
  const currentFloatFrameRef = useRef(0);
  const lastRenderedIntRef = useRef(-1);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  const productById = useMemo(() => {
    const all: OrderableProduct[] = [...siteConfig.offers, ...siteConfig.items];
    return Object.fromEntries(all.map((p) => [p.id, p]));
  }, [siteConfig.offers, siteConfig.items]);

  const drawFrame = useCallback((frameIdx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let img = framesRef.current[frameIdx];
    if (!img || !img.complete || img.naturalWidth === 0) {
      // البحث عن أقرب إطار محمّل لتفادي أي وميض أثناء التمرير السريع
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const back = framesRef.current[frameIdx - offset];
        if (back && back.complete && back.naturalWidth > 0) {
          img = back;
          break;
        }
        const fwd = framesRef.current[frameIdx + offset];
        if (fwd && fwd.complete && fwd.naturalWidth > 0) {
          img = fwd;
          break;
        }
      }
    }

    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }, []);

  // تحميل الإطارات بالتدريج مع أولوية فورية للإطار الأول وتغطية متدرجة
  useEffect(() => {
    let active = true;
    const loadOrder: number[] = [0];
    for (let i = 1; i < TOTAL_FRAMES; i += 4) loadOrder.push(i);
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      if (i % 4 !== 0) loadOrder.push(i);
    }

    loadOrder.forEach((i) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = getFrameUrl(i);
      img.onload = () => {
        if (!active) return;
        framesRef.current[i] = img;
        if (i === 0 || Math.round(currentFloatFrameRef.current) === i) {
          drawFrame(Math.round(currentFloatFrameRef.current));
        }
      };
    });

    return () => {
      active = false;
    };
  }, [drawFrame]);

  // ملاءمة الكانفس لأبعاد شاشة الهاتف والتابلت والكمبيوتر بدقة عالية
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width * dpr));
      const h = Math.max(240, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        drawFrame(Math.max(0, lastRenderedIntRef.current));
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [drawFrame]);

  // ربط موضع التمرير مباشرة بجميع الإطارات المئة بأسلوب MotionSites الانسيابي
  useEffect(() => {
    const updateFromScroll = () => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const maxScrollable = Math.max(1, track.offsetHeight - window.innerHeight);
      const rawProgress = Math.max(0, Math.min(1, -rect.top / maxScrollable));
      targetFloatFrameRef.current = rawProgress * (TOTAL_FRAMES - 1);
      setScrollProgress(rawProgress);
    };

    updateFromScroll();
    window.addEventListener('scroll', updateFromScroll, { passive: true });
    window.addEventListener('resize', updateFromScroll, { passive: true });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;

    const renderLoop = () => {
      const target = targetFloatFrameRef.current;
      if (reducedMotion) {
        currentFloatFrameRef.current = target;
      } else {
        currentFloatFrameRef.current += (target - currentFloatFrameRef.current) * 0.16;
      }

      const nextInt = Math.max(
        0,
        Math.min(TOTAL_FRAMES - 1, Math.round(currentFloatFrameRef.current))
      );

      if (nextInt !== lastRenderedIntRef.current) {
        lastRenderedIntRef.current = nextInt;
        setCurrentFrame(nextInt);
        drawFrame(nextInt);
      }

      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateFromScroll);
      window.removeEventListener('resize', updateFromScroll);
    };
  }, [drawFrame]);

  const activeChapter = useMemo(() => {
    const found = heroChapters.find(
      (ch) => currentFrame >= ch.startFrame && currentFrame <= ch.endFrame
    );
    return found || heroChapters[0];
  }, [heroChapters, currentFrame]);

  const activeChapterIdx = heroChapters.findIndex((ch) => ch.id === activeChapter?.id);
  const activeProduct = activeChapter ? productById[activeChapter.productId] : undefined;
  const isFirstPhase = scrollProgress < 0.34;

  return (
    <section
      id="top"
      ref={trackRef}
      className="relative h-[290dvh] sm:h-[320dvh] w-full border-b border-[var(--border-hairline)]"
      aria-label={`استعراض مطعم ${restaurant.name}`}
    >
      {/* المسرح المثبت بكامل الشاشة كخلفية رئيسية للموقع */}
      <div className="safari-sticky top-0 h-[100dvh] w-full overflow-hidden bg-[var(--bg-canvas)]">
        {/* صورة الإطار الأول للظهور الفوري ريثما يكتمل رسم الكانفس */}
        <img
          src="/frames/frame-001.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* كانفس الفريمات الكامل المتجاوب مع التمرير */}
        <canvas
          ref={canvasRef}
          className="relative z-10 block w-full h-full"
          aria-hidden="true"
        />

        {/* تدرج سينمائي هادئ يضمن وضوح النصوص العربية وراحة العين فوق المشهد */}
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,16,14,0.52) 0%, rgba(19,16,14,0.18) 38%, rgba(19,16,14,0.72) 82%, var(--bg-canvas) 100%)',
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              'radial-gradient(circle at 80% 45%, rgba(19,16,14,0.55) 0%, transparent 58%)',
          }}
          aria-hidden="true"
        />

        {/* المحتوى الرئيسي العائم بأسلوب MotionSites */}
        <div className="absolute inset-0 z-30 flex flex-col justify-end pb-10 sm:pb-14 pt-24 px-4 sm:px-8 lg:px-12 max-w-7xl mx-auto">
          {isFirstPhase ? (
            <div className="max-w-3xl space-y-4 sm:space-y-5 text-right transition-opacity duration-300">
              <div className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[var(--accent-gold)]">
                <Flame className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{restaurant.name} تجربة الشواء الحية</span>
              </div>

              {(auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode ? (
                <div className="space-y-2.5 bg-black/75 safari-blur p-4 rounded-2xl border border-[var(--accent-gold)]/60">
                  <input
                    type="text"
                    value={restaurant.tagline}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        restaurant: { ...prev.restaurant, tagline: e.target.value },
                      }))
                    }
                    className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 font-display font-black text-xl text-[#EFE7DC]"
                  />
                  <textarea
                    rows={2}
                    value={restaurant.heroSubtitle}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        restaurant: { ...prev.restaurant, heroSubtitle: e.target.value },
                      }))
                    }
                    className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 text-sm text-[#E6DDD0]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <input
                      type="text"
                      value={restaurant.heroPrimaryCtaLabel || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          restaurant: { ...prev.restaurant, heroPrimaryCtaLabel: e.target.value },
                        }))
                      }
                      placeholder="نص الزر الرئيسي (تصفح المنيو واطلب الآن)"
                      className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[#EFE7DC]"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      value={restaurant.heroPrimaryCtaUrl || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          restaurant: { ...prev.restaurant, heroPrimaryCtaUrl: e.target.value },
                        }))
                      }
                      placeholder="#menu أو https://..."
                      className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-left text-xs text-[#EFE7DC]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <label className="min-h-[36px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold text-[#EFE7DC] inline-flex items-center gap-1.5 cursor-pointer">
                      <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
                      <span>تغيير صورة الشعار</span>
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
                                restaurant: { ...prev.restaurant, logoUrl: reader.result as string },
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
                      value={restaurant.logoUrl || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          restaurant: { ...prev.restaurant, logoUrl: e.target.value },
                        }))
                      }
                      placeholder="رابط صورة الشعار"
                      className="flex-1 min-w-[160px] rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-left text-xs text-[#EFE7DC]"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="font-display font-black text-3xl sm:text-5xl lg:text-6xl leading-[1.18] text-[#EFE7DC] drop-shadow-sm">
                    {restaurant.tagline}
                  </h1>

                  <p className="text-sm sm:text-lg text-[#E6DDD0] leading-relaxed max-w-2xl">
                    {restaurant.heroSubtitle}
                  </p>
                </>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href={restaurant.heroPrimaryCtaUrl || '#menu'}
                  className="min-h-[48px] px-6 py-3 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-sm sm:text-base inline-flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
                >
                  <span>{restaurant.heroPrimaryCtaLabel || 'تصفح المنيو واطلب الآن'}</span>
                </a>

                <a
                  href="#offers"
                  className="min-h-[48px] px-5 py-3 rounded-2xl bg-black/45 hover:bg-black/65 safari-blur text-[#EFE7DC] border border-white/20 font-display font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <span>العروض المميزة</span>
                </a>
              </div>
            </div>
          ) : (
            activeChapter && (
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 transition-opacity duration-300">
                <div className="max-w-2xl space-y-2.5 text-right">
                  <div className="text-xs sm:text-sm font-extrabold text-[var(--accent-gold)]">
                    {restaurant.name}
                  </div>
                  {(auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) &&
                  isEditMode &&
                  activeChapterIdx >= 0 ? (
                    <div className="space-y-2 bg-black/70 safari-blur p-3.5 rounded-2xl border border-[var(--accent-gold)]/60">
                      <input
                        type="text"
                        value={activeChapter.title}
                        onChange={(e) => {
                          const next = [...heroChapters];
                          next[activeChapterIdx] = { ...activeChapter, title: e.target.value };
                          setDraftConfig((p) => ({ ...p, heroChapters: next }));
                        }}
                        className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 font-display font-black text-lg text-[#EFE7DC]"
                      />
                      <input
                        type="text"
                        value={activeChapter.subtitle}
                        onChange={(e) => {
                          const next = [...heroChapters];
                          next[activeChapterIdx] = { ...activeChapter, subtitle: e.target.value };
                          setDraftConfig((p) => ({ ...p, heroChapters: next }));
                        }}
                        className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-sm text-[#E6DDD0]"
                      />
                    </div>
                  ) : (
                    <>
                      <h2 className="font-display font-black text-2xl sm:text-4xl lg:text-5xl leading-tight text-[#EFE7DC]">
                        {activeChapter.title}
                      </h2>
                      <p className="text-sm sm:text-lg text-[#E6DDD0] leading-relaxed">
                        {activeChapter.subtitle}
                      </p>
                    </>
                  )}
                </div>

                {activeProduct && (
                  <div className="sm:max-w-xs w-full p-4 rounded-2xl bg-black/55 safari-blur border border-white/15 space-y-2.5 shrink-0">
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-[var(--accent-gold)]">
                      <span className="inline-flex items-center gap-1.5">
                        <UtensilsCrossed className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>طبق المشهد</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-sm font-black text-[#EFE7DC]">
                          {formatPrice(activeProduct.price, restaurant.currency)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleFavorite(activeProduct.id)}
                          aria-label={
                            favorites.includes(activeProduct.id)
                              ? `إزالة ${activeProduct.name} من المفضلة`
                              : `إضافة ${activeProduct.name} للمفضلة`
                          }
                          className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              favorites.includes(activeProduct.id)
                                ? 'fill-[var(--accent-fire)] text-[var(--accent-fire)]'
                                : 'text-white'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <div className="font-display font-extrabold text-base text-[#EFE7DC]">
                      {activeProduct.name}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectProduct(activeProduct)}
                      className="w-full min-h-[44px] rounded-xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-sm transition-colors"
                    >
                      اطلب هذا الطبق الآن
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {/* مؤشر التمرير الهادئ في الأسفل وشريط التقدم الرقيق */}
          <div className="mt-6 flex items-center justify-between gap-4 text-xs text-[#C7B9A8]">
            <a
              href="#offers"
              className="inline-flex items-center gap-1.5 font-bold hover:text-white transition-colors"
            >
              <ArrowDown className="w-4 h-4 text-[var(--accent-gold)] animate-bounce" aria-hidden="true" />
              <span>مرّر للأسفل لمواصلة المشاهدة والانتقال إلى القائمة</span>
            </a>

            <div
              className="w-28 sm:w-40 h-1 rounded-full bg-white/15 overflow-hidden shrink-0"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-[var(--accent-gold)] transition-all duration-100"
                style={{ width: `${Math.round(scrollProgress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
