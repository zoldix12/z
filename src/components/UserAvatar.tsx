/**
 * مكون صورة البروفايل ومعرض الصور الجاهزة وضغط صور البروفايل المرفوعة.
 */
import React from 'react';
import {
  ChefHat,
  Compass,
  Crown,
  Flame,
  Gem,
  Moon,
  Sparkles,
  Utensils,
} from 'lucide-react';

export interface PresetAvatarOption {
  id: string;
  label: string;
  bgClass: string;
  iconKey: 'crown' | 'flame' | 'chef' | 'moon' | 'gem' | 'utensils' | 'compass' | 'sparkles';
}

export const PRESET_AVATARS: PresetAvatarOption[] = [
  {
    id: 'preset:crown',
    label: 'التاج الملكي',
    bgClass: 'from-[#C96A3B] to-[#DDA15E] text-[#13100E]',
    iconKey: 'crown',
  },
  {
    id: 'preset:flame',
    label: 'نار الشاورما',
    bgClass: 'from-[#B84A27] to-[#E28448] text-white',
    iconKey: 'flame',
  },
  {
    id: 'preset:chef',
    label: 'الشيف',
    bgClass: 'from-[#2F2520] to-[#6B4E3D] text-[#F7D7A8]',
    iconKey: 'chef',
  },
  {
    id: 'preset:moon',
    label: 'ليالي دمشق',
    bgClass: 'from-[#1D2432] to-[#3A4D6E] text-[#F5D28E]',
    iconKey: 'moon',
  },
  {
    id: 'preset:gem',
    label: 'الزمرد',
    bgClass: 'from-[#1C3D32] to-[#36755D] text-[#E6F7EE]',
    iconKey: 'gem',
  },
  {
    id: 'preset:utensils',
    label: 'الذوّاق',
    bgClass: 'from-[#4A2535] to-[#8C435D] text-[#FCE7EF]',
    iconKey: 'utensils',
  },
  {
    id: 'preset:compass',
    label: 'الرحالة',
    bgClass: 'from-[#28362B] to-[#5E7A56] text-[#F1F5EC]',
    iconKey: 'compass',
  },
  {
    id: 'preset:sparkles',
    label: 'النجم الذهبي',
    bgClass: 'from-[#3D2E18] to-[#B68938] text-[#FFF6DF]',
    iconKey: 'sparkles',
  },
];

function renderPresetIcon(
  iconKey: PresetAvatarOption['iconKey'],
  iconClass: string
): React.ReactNode {
  switch (iconKey) {
    case 'crown':
      return <Crown className={iconClass} aria-hidden="true" />;
    case 'flame':
      return <Flame className={iconClass} aria-hidden="true" />;
    case 'chef':
      return <ChefHat className={iconClass} aria-hidden="true" />;
    case 'moon':
      return <Moon className={iconClass} aria-hidden="true" />;
    case 'gem':
      return <Gem className={iconClass} aria-hidden="true" />;
    case 'utensils':
      return <Utensils className={iconClass} aria-hidden="true" />;
    case 'compass':
      return <Compass className={iconClass} aria-hidden="true" />;
    case 'sparkles':
      return <Sparkles className={iconClass} aria-hidden="true" />;
  }
}

export async function compressImageFileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة صالح');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة الصورة'));
      el.src = objectUrl;
    });
    const targetSize = 200;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('المتصفح لا يدعم معالجة الصور');
    }
    const minSide = Math.min(img.width, img.height);
    const sx = Math.max(0, (img.width - minSide) / 2);
    const sy = Math.max(0, (img.height - minSide) / 2);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface UserAvatarProps {
  avatar?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, { box: string; icon: string; text: string }> = {
  xs: { box: 'w-6 h-6 rounded-lg', icon: 'w-3.5 h-3.5', text: 'text-[11px]' },
  sm: { box: 'w-9 h-9 rounded-xl', icon: 'w-4 h-4', text: 'text-xs' },
  md: { box: 'w-11 h-11 rounded-2xl', icon: 'w-5 h-5', text: 'text-sm' },
  lg: { box: 'w-14 h-14 rounded-2xl', icon: 'w-7 h-7', text: 'text-lg' },
  xl: { box: 'w-16 h-16 rounded-2xl', icon: 'w-8 h-8', text: 'text-xl' },
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatar,
  name,
  size = 'md',
  className = '',
}) => {
  const dims = SIZE_CLASSES[size];
  const cleanAvatar = (avatar || '').trim();
  const preset = PRESET_AVATARS.find((p) => p.id === cleanAvatar);

  if (preset) {
    return (
      <div
        className={`${dims.box} bg-gradient-to-br ${preset.bgClass} flex items-center justify-center shrink-0 border border-white/10 shadow-sm ${className}`}
      >
        {renderPresetIcon(preset.iconKey, dims.icon)}
      </div>
    );
  }

  if (
    cleanAvatar &&
    (cleanAvatar.startsWith('data:image/') ||
      cleanAvatar.startsWith('http://') ||
      cleanAvatar.startsWith('https://') ||
      cleanAvatar.startsWith('/'))
  ) {
    return (
      <img
        src={cleanAvatar}
        alt={name || 'صورة البروفايل'}
        className={`${dims.box} object-cover shrink-0 border border-[var(--border-strong)] bg-[var(--bg-subtle)] ${className}`}
      />
    );
  }

  const initial = (name || 'م').trim().charAt(0).toUpperCase() || 'م';
  return (
    <div
      className={`${dims.box} bg-gradient-to-br from-[#2B221D] to-[#4A3528] text-[var(--accent-gold)] font-display font-black ${dims.text} flex items-center justify-center shrink-0 border border-[var(--border-strong)] ${className}`}
    >
      {initial}
    </div>
  );
};
