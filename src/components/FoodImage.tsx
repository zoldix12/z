/**
 * مكوّن عرض صور الطعام مع دعم التحميل الكسول (Lazy Loading)
 * وصورة بديلة أنيقة في حال تعذر تحميل الصورة.
 */
import React, { useState } from 'react';

interface FoodImageProps {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

export const FoodImage: React.FC<FoodImageProps> = ({
  src,
  alt,
  className = '',
  eager = false,
}) => {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#2b1a14] via-[#4a1812] to-[#1a120e] text-[#f5b731] p-4 text-center ${className}`}
      >
        <svg
          className="w-10 h-10 mb-2 opacity-85"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3c2.5 3 4 5.5 4 8a4 4 0 11-8 0c0-2.5 1.5-5 4-8z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 20h12" />
        </svg>
        <span className="text-xs font-bold text-[#fbf7f2] line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`block object-cover ${className}`}
    />
  );
};
