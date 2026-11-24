/**
 * هوك تحديد الموقع التلقائي متعدد المراحل باستخدام مناطق التوصيل الحية.
 */
import { useCallback, useState } from 'react';
import { resolveApiUrl, useSite } from '../context/SiteContext';
import type { DeliveryArea } from '../types/menu';

export type LocationSource = 'idle' | 'gps' | 'network' | 'area';

interface LocateResult {
  mapUrl: string;
  areaSuggestion?: string;
  source: LocationSource;
  message: string;
}

function findNearestArea(areas: DeliveryArea[], lat: number, lng: number): string | undefined {
  if (!areas.length) return undefined;
  let best: DeliveryArea | undefined;
  let bestDist = Infinity;
  for (const area of areas) {
    const dLat = area.lat - lat;
    const dLng = area.lng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = area;
    }
  }
  if (best && bestDist < 0.08) {
    return best.name;
  }
  return undefined;
}

export function useAutoLocation() {
  const { siteConfig } = useSite();
  const deliveryAreas = siteConfig.deliveryAreas;

  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<LocationSource>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const getPosition = (options: PositionOptions): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  const detectLocation = useCallback(
    async (isAutoAttempt = false): Promise<LocateResult | null> => {
      setLoading(true);
      setErrorMessage('');

      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        try {
          let pos: GeolocationPosition;
          try {
            pos = await getPosition({
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 60000,
            });
          } catch {
            pos = await getPosition({
              enableHighAccuracy: false,
              timeout: 6500,
              maximumAge: 300000,
            });
          }

          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const nearest = findNearestArea(deliveryAreas, lat, lng);
          const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
          const msg = nearest
            ? `تم تحديد موقعك تلقائياً بالقرب من ${nearest}`
            : 'تم تحديد إحداثيات موقعك بنجاح';

          setSource('gps');
          setStatusMessage(msg);
          setLoading(false);
          return { mapUrl, areaSuggestion: nearest, source: 'gps', message: msg };
        } catch {
          // الانتقال لتحديد الموقع الاحتياطي عبر الخادم
        }
      }

      try {
        const res = await fetch(resolveApiUrl('/api/locate'));
        if (res.ok) {
          const data = (await res.json()) as {
            lat?: number;
            lng?: number;
            city?: string;
            approximate?: boolean;
          };
          if (typeof data.lat === 'number' && typeof data.lng === 'number') {
            const lat = Number(data.lat.toFixed(6));
            const lng = Number(data.lng.toFixed(6));
            const nearest = findNearestArea(deliveryAreas, lat, lng) || data.city;
            const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;
            const msg = data.approximate
              ? 'تم تحديد النطاق التقريبي تلقائياً اختر منطقتك أدناه للدقة الكاملة'
              : `تم تحديد موقعك تلقائياً (${nearest || 'عمّان'})`;

            setSource('network');
            setStatusMessage(msg);
            setLoading(false);
            return { mapUrl, areaSuggestion: nearest, source: 'network', message: msg };
          }
        }
      } catch {
        // تجاهل خطأ الشبكة
      }

      setLoading(false);
      if (!isAutoAttempt) {
        setErrorMessage('تعذر الوصول للموقع من المتصفح يمكنك اختيار منطقتك من الأزرار السريعة أدناه');
      }
      return null;
    },
    [deliveryAreas]
  );

  const selectPresetArea = useCallback((area: DeliveryArea): LocateResult => {
    const mapUrl = `https://maps.google.com/?q=${area.lat},${area.lng}`;
    const msg = `تم تحديد منطقة ${area.name} على الخريطة`;
    setSource('area');
    setStatusMessage(msg);
    setErrorMessage('');
    return { mapUrl, areaSuggestion: area.name, source: 'area', message: msg };
  }, []);

  return {
    loading,
    source,
    statusMessage,
    errorMessage,
    detectLocation,
    selectPresetArea,
    setStatusMessage,
    setErrorMessage,
  };
}
