/**
 * قسم من نحن وساعات العمل والموقع ورقم الهاتف مع إخفاء بوابة الإدارة تماماً عن الزوار.
 */
import React, { useRef } from 'react';
import { Clock, MapPin, Phone } from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { PWAInstallButton } from './PWAInstallButton';

interface AboutFooterProps {
  onSecretOpenAdmin?: () => void;
}

export const AboutFooter: React.FC<AboutFooterProps> = ({ onSecretOpenAdmin }) => {
  const { siteConfig } = useSite();
  const { restaurant } = siteConfig;
  const tapCounterRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });

  // إيماءة سرية غير مرئية على الهاتف فقط (خمس نقرات سريعة على سطر الحقوق) بالإضافة إلى الاختصار Ctrl + Z
  const handleHiddenMobileGesture = () => {
    if (!onSecretOpenAdmin) return;
    const now = Date.now();
    if (now - tapCounterRef.current.lastAt > 1800) {
      tapCounterRef.current = { count: 1, lastAt: now };
    } else {
      tapCounterRef.current.count += 1;
      tapCounterRef.current.lastAt = now;
      if (tapCounterRef.current.count >= 5) {
        tapCounterRef.current = { count: 0, lastAt: 0 };
        onSecretOpenAdmin();
      }
    }
  };

  return (
    <footer className="mt-10 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] pb-24 lg:pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div id="about" className="lg:col-span-6 space-y-3">
            <h2 className="font-display font-black text-2xl text-[var(--text-primary)]">
              قصة مطعم {restaurant.name}
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
              {restaurant.about}
            </p>
            <div className="pt-2">
              <PWAInstallButton />
            </div>
          </div>

          <div id="contact" className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-1.5">
              <div className="flex items-center gap-2 font-display font-bold text-sm text-[var(--accent-gold)]">
                <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>ساعات العمل</span>
              </div>
              <p className="text-sm text-[var(--text-primary)] font-medium">
                {restaurant.hours}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-1.5">
              <div className="flex items-center gap-2 font-display font-bold text-sm text-[var(--accent-gold)]">
                <Phone className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>رقم الهاتف للطلبات والاستفسار</span>
              </div>
              <a
                href={`tel:${restaurant.phone}`}
                dir="ltr"
                className="inline-flex items-center min-h-[44px] font-display font-black text-lg text-[var(--text-primary)] hover:text-[var(--accent-gold)] transition-colors"
              >
                {restaurant.phoneDisplay}
              </a>
            </div>

            <div className="sm:col-span-2 p-4 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] space-y-1.5">
              <div className="flex items-center gap-2 font-display font-bold text-sm text-[var(--accent-gold)]">
                <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>الموقع</span>
              </div>
              <p className="text-sm text-[var(--text-primary)] font-medium">
                {restaurant.address}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm text-[var(--text-muted)]">
          <span
            onClick={handleHiddenMobileGesture}
            className="select-none"
          >
            جميع الحقوق محفوظة لمطعم {restaurant.name} {new Date().getFullYear()}
          </span>
          <span>الأسعار بالعملة المحلية ({restaurant.currency})</span>
        </div>
      </div>
    </footer>
  );
};
