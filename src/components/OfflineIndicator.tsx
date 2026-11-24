/**
 * مؤشر حالة عدم الاتصال بالإنترنت لتطبيق الويب التقدمي PWA.
 */
import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl bg-amber-600 text-white px-4 py-2 text-xs sm:text-sm font-bold shadow-lg"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>لا يوجد اتصال بالإنترنت يمكنك تصفح القائمة المحفوظة مؤقتاً</span>
    </div>
  );
};
