/**
 * شريط الإدارة العائم القابل للتحريك بالسحب في أي مكان على الشاشة:
 * يظهر للمشرف المسجل فقط، ويتيح التنقل كأي مستخدم عادي، أو تفعيل التعديل المباشر على الصفحة،
 * وحفظ التغييرات للجميع، أو إعادة ضبط الموقع من البداية (ريستارت)، مع تنبيهات الطلبات والرسائل.
 */
import React, { useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Code2,
  GripVertical,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useSite } from '../context/SiteContext';

interface FloatingAdminBarProps {
  onOpenAdminPanel: () => void;
  onOpenDeveloper?: () => void;
}

export const FloatingAdminBar: React.FC<FloatingAdminBarProps> = ({
  onOpenAdminPanel,
  onOpenDeveloper,
}) => {
  const {
    auth,
    isEditMode,
    setIsEditMode,
    hasUnsavedDraft,
    savingGlobal,
    saveDraftConfigGlobal,
    resetSiteToFactory,
    adminAlertCount,
    clearAdminAlerts,
    soundMuted,
    setSoundMuted,
    setDeveloperMode,
  } = useSite();

  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 84 });
  const [minimized, setMinimized] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    dragging: boolean;
  }>({ startX: 0, startY: 0, origX: 16, origY: 84, dragging: false });

  const canShowBar = auth.role === 'admin' || (auth.isDeveloper && auth.developerMode);
  if (!canShowBar) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      dragging: true,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextX = Math.max(8, Math.min(window.innerWidth - 260, dragRef.current.origX + dx));
    const nextY = Math.max(8, Math.min(window.innerHeight - 100, dragRef.current.origY + dy));
    setPos({ x: nextX, y: nextY });
  };

  const handlePointerUp = () => {
    dragRef.current.dragging = false;
  };

  const handleGlobalSave = async () => {
    const res = await saveDraftConfigGlobal();
    if (res.ok) {
      setStatusMsg('تم الحفظ ونشر التعديلات للجميع');
      window.setTimeout(() => setStatusMsg(''), 2600);
    } else {
      setStatusMsg(res.error || 'تعذر الحفظ');
    }
  };

  const handleRestart = async () => {
    const res = await resetSiteToFactory();
    setConfirmRestart(false);
    if (res.ok) {
      setIsEditMode(false);
      setStatusMsg('تمت إعادة الموقع من البداية للجميع');
      window.setTimeout(() => setStatusMsg(''), 2600);
    } else {
      setStatusMsg(res.error || 'تعذر إعادة الضبط');
    }
  };

  return (
    <div
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, touchAction: 'none' }}
      className="fixed z-45 rounded-2xl bg-[#1B1613]/95 safari-blur border border-[var(--accent-gold)]/55 shadow-2xl text-[var(--text-primary)] max-w-[92vw]"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-hairline)]">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none text-xs font-extrabold text-[var(--accent-gold)]"
          title="اسحب لتحريك الشريط"
        >
          <GripVertical className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{auth.isDeveloper ? 'وضع المطورين المباشر' : 'تحكم المشرف'}</span>
        </div>

        <div className="flex items-center gap-1">
          {auth.role === 'admin' && (
            <button
              type="button"
              onClick={() => setSoundMuted((m) => !m)}
              aria-label={soundMuted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'}
              className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? 'توسيع الشريط' : 'تصغير الشريط'}
            className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center text-xs font-bold"
          >
            {minimized ? '+' : '−'}
          </button>

          {auth.isDeveloper && auth.role !== 'admin' && (
            <button
              type="button"
              onClick={() => {
                setIsEditMode(false);
                setDeveloperMode(false);
              }}
              aria-label="إخفاء شريط المطورين مؤقتاً"
              className="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!minimized && (
        <div className="p-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditMode((v) => !v)}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors ${
              isEditMode
                ? 'bg-[var(--accent-gold)] text-[#13100E]'
                : 'bg-[var(--bg-canvas)] border border-[var(--border-hairline)] text-[var(--text-primary)]'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isEditMode ? 'إيقاف التعديل المباشر' : 'تعديل الموقع مباشرة'}</span>
          </button>

          {auth.isDeveloper && onOpenDeveloper && (
            <button
              type="button"
              onClick={onOpenDeveloper}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--accent-gold)] hover:brightness-95 text-[#13100E] text-xs font-black inline-flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>أدوات المطور و ZIP</span>
            </button>
          )}

          {auth.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                clearAdminAlerts();
                onOpenAdminPanel();
              }}
              className="relative min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--border-hairline)] text-xs font-extrabold inline-flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent-gold)]" aria-hidden="true" />
              <span>لوحة الإدارة</span>
              {adminAlertCount > 0 && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--accent-fire)] text-white text-[10px] font-black tabular-nums">
                  <Bell className="w-2.5 h-2.5" aria-hidden="true" />
                  {adminAlertCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleGlobalSave}
            disabled={savingGlobal}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors ${
              hasUnsavedDraft
                ? 'bg-[var(--accent-fire)] text-white shadow-md'
                : 'bg-emerald-600/85 hover:bg-emerald-600 text-white'
            }`}
          >
            {savingGlobal ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>حفظ للجميع</span>
          </button>

          {!confirmRestart ? (
            <button
              type="button"
              onClick={() => setConfirmRestart(true)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-hairline)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent-fire)] inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>ريستارت</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] px-2.5 py-1 rounded-xl">
              <span className="text-[11px] font-bold">إعادة الموقع للأصل؟</span>
              <button
                type="button"
                onClick={handleRestart}
                className="px-2 py-1 rounded-lg bg-[var(--accent-fire)] text-white text-[11px] font-extrabold"
              >
                نعم
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestart(false)}
                className="p-1 text-[var(--text-secondary)]"
                aria-label="إلغاء الريستارت"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {statusMsg && (
            <div className="w-full text-[11px] font-bold text-emerald-300 inline-flex items-center gap-1 pt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{statusMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
