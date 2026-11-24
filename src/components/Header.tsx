/**
 * الشريط العلوي المتجاوب لمطعم zoldix على الهاتف والتابلت والكمبيوتر.
 * يعرض الشعار القابل للتخصيص، روابط الأقسام، حساب العميل أو السائق، الشات المباشر، والسلة،
 * مع إخفاء أي أزرار ظاهرة للإدارة (يتم فتح الإدارة بالاختصار Ctrl + Z) وإظهار شريط واضح عند التوقف المؤقت للطلبات.
 */
import React from 'react';
import { MessageCircle, ShoppingBag, User, LogOut, AlertCircle, Code2 } from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { UserAvatar } from './UserAvatar';

interface HeaderProps {
  cartCount: number;
  unreadChatCount?: number;
  onOpenCart: () => void;
  onOpenAccount: () => void;
  onOpenChat: () => void;
  onOpenDeveloper?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  unreadChatCount = 0,
  onOpenCart,
  onOpenAccount,
  onOpenChat,
  onOpenDeveloper,
}) => {
  const { siteConfig, auth, impersonateUser } = useSite();
  const { restaurant } = siteConfig;

  return (
    <header className="fixed top-0 inset-x-0 z-40 pt-safe border-b border-white/10 bg-[var(--bg-header)] safari-blur">
      {!restaurant.acceptingOrders && (
        <div className="bg-[#4D2818] text-[#EFE7DC] px-4 py-2 text-xs sm:text-sm font-bold border-b border-[var(--accent-fire)]/40">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-center">
            <AlertCircle className="w-4 h-4 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
            <span>
              {restaurant.pausedMessage || 'استقبال الطلبات متوقف مؤقتاً وسنعود لاستقبال طلباتكم بعد قليل'}
            </span>
          </div>
        </div>
      )}

      {auth.role === 'admin' && auth.impersonating && auth.user && (
        <div className="bg-[var(--accent-fire)] text-white px-4 py-2 text-xs sm:text-sm font-bold">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span>
              تتصفح الآن حساب العميل {auth.user.name} بالبريد {auth.user.email}
            </span>
            <button
              type="button"
              onClick={() => impersonateUser(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-black/25 hover:bg-black/40 px-3 py-1 text-xs font-extrabold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>العودة لحساب الإدارة</span>
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* الشعار والاسم المخصص */}
        <a
          href="#top"
          className="flex items-center gap-2.5 min-w-0 min-h-[44px]"
          aria-label={`العودة لأعلى صفحة ${restaurant.name}`}
        >
          {restaurant.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt={restaurant.name}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover border border-[var(--border-strong)] shrink-0"
            />
          ) : (
            <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--accent-fire)] text-[var(--text-primary)] flex items-center justify-center shadow-sm shrink-0 border border-[var(--border-hairline)]">
              <svg
                viewBox="0 0 32 32"
                className="w-6 h-6"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M7 9.5H24.5L9 22.5H25"
                  stroke="currentColor"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="24" cy="9.5" r="2.2" fill="var(--accent-gold)" />
              </svg>
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <span className="block font-display font-black text-base sm:text-xl tracking-tight text-[var(--text-primary)] truncate">
              {restaurant.name}
            </span>
            <span className="hidden md:block text-[11px] font-medium text-[var(--text-muted)] truncate">
              طعم متقن وتجربة دافئة
            </span>
          </div>
        </a>

        {/* روابط التنقل على الشاشات المتوسطة والكبيرة */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden lg:flex items-center gap-6 text-sm font-bold text-[var(--text-secondary)]"
        >
          <a href="#top" className="hover:text-[var(--text-primary)] transition-colors py-2">
            التجربة
          </a>
          <a href="#offers" className="hover:text-[var(--text-primary)] transition-colors py-2">
            العروض
          </a>
          <a href="#menu" className="hover:text-[var(--text-primary)] transition-colors py-2">
            المنيو
          </a>
          <a href="#contact" className="hover:text-[var(--text-primary)] transition-colors py-2">
            التواصل
          </a>
        </nav>

        {/* أزرار الحساب والشات والسلة وزر المطورين الحصري */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {auth.isDeveloper && onOpenDeveloper && (
            <button
              type="button"
              onClick={onOpenDeveloper}
              aria-label="وضع المطورين وتنزيل الموقع"
              className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] font-display font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <Code2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">وضع المطورين</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenChat}
            aria-label="المحادثة المباشرة مع المطعم"
            className="relative min-h-[44px] min-w-[44px] sm:px-3.5 px-2.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">الشات</span>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full bg-[var(--accent-fire)] text-white text-[10px] font-black flex items-center justify-center px-1 tabular-nums">
                {unreadChatCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenAccount}
            aria-label="حساب العميل والمشتريات"
            className="min-h-[44px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors max-w-[160px] sm:max-w-[210px]"
          >
            {auth.user ? (
              <UserAvatar avatar={auth.user.avatar} name={auth.user.name} size="xs" />
            ) : (
              <User className="w-4 h-4 text-[var(--accent-gold)] shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {auth.user
                ? auth.driverProfile
                  ? `${auth.user.name} (سائق)`
                  : auth.user.name
                : 'دخول'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            aria-label={`فتح السلة، يحتوي على ${cartCount} أصناف`}
            className="relative min-h-[44px] px-3 sm:px-4 py-2 rounded-xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white font-display font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-[0.97] transition-all"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">السلة</span>
            <span className="tabular-nums font-black">{cartCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
