/**
 * شريط متابعة حالة الطلب المباشر للعميل عبر WebSocket مع اسم ورقم السائق.
 */
import React from 'react';
import { CheckCircle2, ChefHat, ClipboardCheck, Phone, Truck, X } from 'lucide-react';
import { formatPrice } from '../config/restaurant';
import { useSite } from '../context/SiteContext';
import type { OrderStatus } from '../types/menu';

const STEPS: Array<{ status: OrderStatus; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { status: 'received', label: 'تم الاستلام', icon: ClipboardCheck },
  { status: 'preparing', label: 'قيد التحضير', icon: ChefHat },
  { status: 'on_the_way', label: 'في الطريق إليك', icon: Truck },
  { status: 'delivered', label: 'تم التوصيل', icon: CheckCircle2 },
];

function getStepIndex(status: OrderStatus): number {
  const idx = STEPS.findIndex((s) => s.status === status);
  return idx === -1 ? 0 : idx;
}

export const OrderTrackerBanner: React.FC = () => {
  const { activeTrackedOrder, setTrackedOrder, siteConfig } = useSite();

  if (!activeTrackedOrder) return null;

  const isCancelled = activeTrackedOrder.status === 'cancelled';
  const currentStep = getStepIndex(activeTrackedOrder.status);

  return (
    <section
      aria-label="تتبع الطلب المباشر"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6"
    >
      <div className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--accent-gold)]/45 p-5 sm:p-6 shadow-[var(--shadow-card)] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[var(--accent-gold)]">
              تتبع حالة طلبك مباشرة
            </div>
            <h3 className="font-display font-black text-lg sm:text-xl text-[var(--text-primary)]">
              طلب رقم #{activeTrackedOrder.orderId} بقيمة{' '}
              {formatPrice(
                activeTrackedOrder.total,
                activeTrackedOrder.currency || siteConfig.restaurant.currency
              )}
            </h3>
          </div>

          <button
            type="button"
            onClick={() => setTrackedOrder(null)}
            aria-label="إخفاء شريط التتبع"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isCancelled ? (
          <div className="p-3.5 rounded-2xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] text-sm font-bold text-[var(--text-primary)]">
            تم إلغاء هذا الطلب من قبل المطعم، يرجى التواصل معنا عبر الشات لأي استفسار.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const completed = index <= currentStep;
              const isCurrent = index === currentStep;
              return (
                <div
                  key={step.status}
                  className={`p-3 rounded-2xl border transition-all flex items-center gap-2.5 ${
                    isCurrent
                      ? 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--text-primary)]'
                      : completed
                        ? 'bg-[var(--accent-gold-soft)] border-[var(--accent-gold)]/50 text-[var(--text-primary)]'
                        : 'bg-[var(--bg-canvas)] border-[var(--border-hairline)] text-[var(--text-muted)]'
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isCurrent
                        ? 'bg-[var(--accent-fire)] text-white'
                        : completed
                          ? 'bg-[var(--accent-gold)] text-[#13100E]'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="font-bold text-xs sm:text-sm">{step.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {activeTrackedOrder.driverName && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-hairline)] text-xs sm:text-sm">
            <span className="text-[var(--text-secondary)] font-bold">
              السائق المسؤول عن طلبك: <strong className="text-[var(--text-primary)]">{activeTrackedOrder.driverName}</strong>
            </span>
            {activeTrackedOrder.driverPhone && (
              <a
                href={`tel:${activeTrackedOrder.driverPhone}`}
                dir="ltr"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] text-[var(--accent-gold)] font-extrabold"
              >
                <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{activeTrackedOrder.driverPhone}</span>
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
