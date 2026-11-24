/**
 * قسم الأقسام المخصصة ورابط تحويل الموقع:
 * - يعرض شريط التحويل أو الربط الخارجي عند تفعيله من نظام المطورين أو الإدارة
 * - يعرض الأقسام المضافة عبر منشئ المواقع مع إمكانية التعديل والإضافة والحذف ورفع الصور مباشرة من الواجهة
 */
import React from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  ImagePlus,
  Link2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useSite } from '../context/SiteContext';
import type { CustomSection } from '../types/menu';
import { FoodImage } from './FoodImage';

function readImageFile(file: File | undefined, onDone: (dataUrl: string) => void): void {
  if (!file) return;
  if (file.size > 1_500_000) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      onDone(reader.result);
    }
  };
  reader.readAsDataURL(file);
}

export const CustomSections: React.FC = () => {
  const { siteConfig, auth, isEditMode, setDraftConfig } = useSite();
  const sections = siteConfig.customSections || [];
  const redirectUrl = siteConfig.restaurant.siteRedirectUrl || '';
  const editable =
    (auth.role === 'admin' || (auth.isDeveloper && auth.developerMode)) && isEditMode;

  if (sections.length === 0 && !redirectUrl && !editable) {
    return null;
  }

  const updateSections = (updater: (prev: CustomSection[]) => CustomSection[]) => {
    setDraftConfig((prev) => ({
      ...prev,
      customSections: updater(prev.customSections || []),
    }));
  };

  const handleAddSection = () => {
    const newSec: CustomSection = {
      id: `sec_${Date.now()}`,
      eyebrow: 'قسم جديد',
      title: 'تجربة ضيافة خاصة من zoldix',
      description: 'أضف وصفاً مخصصاً لهذا القسم أو اربطه بصفحة طلب أو موقع خارجي مباشرة.',
      image: '/images/zoldix-signature.jpg',
      ctaLabel: 'اكتشف المزيد',
      ctaUrl: '#menu',
      accentStyle: 'warm',
    };
    updateSections((prev) => [...prev, newSec]);
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    updateSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  return (
    <section
      id="custom-sections"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"
      aria-label="أقسام إضافية وروابط الموقع"
    >
      {/* شريط تحويل أو ربط الموقع الخارجي */}
      {(redirectUrl || editable) && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#241D19] to-[#171310] border border-[var(--accent-gold)]/45 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--accent-gold)]">
              <Link2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{editable ? 'رابط تحويل الموقع الرئيسي' : 'الانتقال إلى الموقع الرسمي'}</span>
            </div>

            {editable ? (
              <div className="space-y-1.5 pt-1">
                <input
                  type="text"
                  dir="ltr"
                  value={redirectUrl}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      restaurant: { ...prev.restaurant, siteRedirectUrl: e.target.value },
                    }))
                  }
                  placeholder="https://example.com أو اتركه فارغاً للإبقاء على المتجر"
                  className="w-full min-h-[42px] rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-left text-xs sm:text-sm text-[var(--text-primary)]"
                />
                <p className="text-[11px] text-[var(--text-muted)]">
                  عند إضافة رابط هنا يظهر شريط تحويل بارز للزوار للانتقال إلى موقعك المستهدف
                </p>
              </div>
            ) : (
              <p className="text-sm font-bold text-[var(--text-primary)] truncate" dir="ltr">
                {redirectUrl}
              </p>
            )}
          </div>

          {redirectUrl && (
            <a
              href={redirectUrl}
              className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-display font-black text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-all"
            >
              <span>الانتقال إلى الموقع</span>
              <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {/* رأس شريط التعديل للأقسام المخصصة */}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/50">
          <div>
            <div className="font-display font-black text-base text-[var(--accent-gold)]">
              إدارة الأقسام المخصصة من الواجهة
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              أضف أقساماً جديدة، عدّل الصور والنصوص، أو انقل وأزل أي قسم بشكل فوري ومتزامن مع نظام المطورين
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddSection}
            className="min-h-[42px] px-4 rounded-xl bg-[var(--accent-gold)] text-[#13100E] font-display font-black text-xs sm:text-sm inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>إضافة قسم جديد</span>
          </button>
        </div>
      )}

      {/* عرض الأقسام المخصصة */}
      <div className="space-y-6">
        {sections.map((sec, idx) => {
          const cardTone =
            sec.accentStyle === 'gold'
              ? 'bg-gradient-to-br from-[#261E18] to-[#171310] border-[var(--accent-gold)]/45'
              : sec.accentStyle === 'minimal'
                ? 'bg-[var(--bg-canvas)] border-[var(--border-hairline)]'
                : 'bg-[var(--bg-surface)] border-[var(--border-hairline)]';

          return (
            <article
              key={sec.id}
              className={`rounded-3xl border overflow-hidden shadow-[var(--shadow-card)] ${cardTone}`}
            >
              {editable ? (
                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-hairline)]">
                    <span className="font-display font-black text-sm text-[var(--accent-gold)]">
                      قسم #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => moveSection(idx, -1)}
                        disabled={idx === 0}
                        aria-label="نقل للأعلى"
                        className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center disabled:opacity-40"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(idx, 1)}
                        disabled={idx === sections.length - 1}
                        aria-label="نقل للأسفل"
                        className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center disabled:opacity-40"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSections((prev) => prev.filter((item) => item.id !== sec.id))
                        }
                        className="min-h-[36px] px-3 rounded-xl bg-[var(--accent-fire-soft)] text-[var(--accent-fire)] text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>حذف القسم</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-5 space-y-2.5">
                      {sec.image && (
                        <div className="aspect-[16/10] rounded-2xl overflow-hidden bg-[var(--bg-subtle)] border border-[var(--border-hairline)]">
                          <FoodImage src={sec.image} alt={sec.title} className="w-full h-full" />
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                          <ImagePlus className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
                          <span>رفع صورة القسم</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              readImageFile(e.target.files?.[0], (url) => {
                                updateSections((prev) =>
                                  prev.map((s) => (s.id === sec.id ? { ...s, image: url } : s))
                                );
                              });
                            }}
                          />
                        </label>
                        {sec.image && (
                          <button
                            type="button"
                            onClick={() =>
                              updateSections((prev) =>
                                prev.map((s) => (s.id === sec.id ? { ...s, image: '' } : s))
                              )
                            }
                            className="min-h-[38px] px-3 rounded-xl bg-[var(--bg-canvas)] text-xs font-bold text-[var(--text-muted)]"
                          >
                            إزالة الصورة
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        dir="ltr"
                        value={sec.image || ''}
                        onChange={(e) =>
                          updateSections((prev) =>
                            prev.map((s) => (s.id === sec.id ? { ...s, image: e.target.value } : s))
                          )
                        }
                        placeholder="رابط الصورة https://..."
                        className="w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-1.5 text-left text-xs"
                      />
                    </div>

                    <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={sec.eyebrow || ''}
                        onChange={(e) =>
                          updateSections((prev) =>
                            prev.map((s) =>
                              s.id === sec.id ? { ...s, eyebrow: e.target.value } : s
                            )
                          )
                        }
                        placeholder="العنوان الفرعي الصغير"
                        className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 text-xs font-bold"
                      />
                      <select
                        value={sec.accentStyle || 'warm'}
                        onChange={(e) =>
                          updateSections((prev) =>
                            prev.map((s) =>
                              s.id === sec.id
                                ? {
                                    ...s,
                                    accentStyle: e.target.value as 'warm' | 'gold' | 'minimal',
                                  }
                                : s
                            )
                          )
                        }
                        className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 text-xs font-bold"
                      >
                        <option value="warm">تصميم دافئ</option>
                        <option value="gold">تصميم ذهبي بارز</option>
                        <option value="minimal">تصميم هادئ</option>
                      </select>

                      <input
                        type="text"
                        value={sec.title}
                        onChange={(e) =>
                          updateSections((prev) =>
                            prev.map((s) => (s.id === sec.id ? { ...s, title: e.target.value } : s))
                          )
                        }
                        placeholder="عنوان القسم الرئيسي"
                        className="sm:col-span-2 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 font-display font-bold text-sm"
                      />

                      <textarea
                        rows={2}
                        value={sec.description}
                        onChange={(e) =>
                          updateSections((prev) =>
                            prev.map((s) =>
                              s.id === sec.id ? { ...s, description: e.target.value } : s
                            )
                          )
                        }
                        placeholder="وصف القسم"
                        className="sm:col-span-2 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 text-xs"
                      />

                      <input
                        type="text"
                        value={sec.ctaLabel || ''}
                        onChange={(e) =>
                          updateSections((prev) =>
                            prev.map((s) =>
                              s.id === sec.id ? { ...s, ctaLabel: e.target.value } : s
                            )
                          )
                        }
                        placeholder="نص الزر"
                        className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={sec.ctaUrl || ''}
                        onChange={(e) =>
                          updateSections((prev) =>
                            prev.map((s) =>
                              s.id === sec.id ? { ...s, ctaUrl: e.target.value } : s
                            )
                          )
                        }
                        placeholder="#menu أو https://..."
                        className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3 py-2 text-left text-xs"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 items-center">
                  <div
                    className={`p-6 sm:p-8 space-y-3 ${
                      sec.image ? 'md:col-span-7' : 'md:col-span-12'
                    }`}
                  >
                    {sec.eyebrow && (
                      <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--accent-gold)]">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{sec.eyebrow}</span>
                      </div>
                    )}
                    <h2 className="font-display font-black text-2xl sm:text-3xl text-[var(--text-primary)]">
                      {sec.title}
                    </h2>
                    <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                      {sec.description}
                    </p>
                    {sec.ctaLabel && sec.ctaUrl && (
                      <div className="pt-2">
                        <a
                          href={sec.ctaUrl}
                          className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-sm inline-flex items-center gap-2 transition-colors"
                        >
                          <span>{sec.ctaLabel}</span>
                          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                        </a>
                      </div>
                    )}
                  </div>

                  {sec.image && (
                    <div className="md:col-span-5 h-56 sm:h-72 w-full bg-[var(--bg-subtle)]">
                      <FoodImage src={sec.image} alt={sec.title} className="w-full h-full" />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
