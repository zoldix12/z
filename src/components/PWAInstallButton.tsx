/**
 * زر تثبيت التطبيق على الشاشة الرئيسية (أندرويد، ويندوز، ماك، وآيفون Safari).
 */
import React, { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { siteConfig } = useSite();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] active:scale-[0.98] transition-transform"
      >
        <Download className="w-4 h-4 text-[var(--accent-fire)]" aria-hidden="true" />
        <span>{compact ? 'تثبيت' : 'تثبيت التطبيق'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] active:scale-[0.98] transition-transform"
        >
          <PlusSquare className="w-4 h-4 text-[var(--accent-fire)]" aria-hidden="true" />
          <span>{compact ? 'أضف للشاشة' : 'أضف للشاشة الرئيسية'}</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 safari-blur p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-md rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] p-6 shadow-2xl animate-modal-in pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 id="ios-pwa-title" className="text-lg font-extrabold font-display">
                  إضافة {siteConfig.restaurant.name} لشاشة الآيفون
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="إغلاق"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="space-y-3 text-sm sm:text-base text-[var(--text-secondary)] list-decimal list-inside">
                <li>
                  اضغط على زر <strong>المشاركة</strong>{' '}
                  <Share className="inline w-4 h-4 mx-1 text-[var(--accent-fire)]" aria-hidden="true" />{' '}
                  في شريط متصفح Safari بالأسفل.
                </li>
                <li>
                  مرر للأسفل واختر <strong>إضافة إلى الصفحة الرئيسية (Add to Home Screen)</strong>.
                </li>
                <li>اضغط على <strong>إضافة</strong> ليظهر كتطبيق مستقل على جهازك.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[48px] rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-bold text-base transition-colors"
              >
                فهمت، إغلاق
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
