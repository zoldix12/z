/**
 * هوك إدارة سلة التسوق المرتبط بالأسعار الحية للموقع وبحساب العميل على الخادم.
 * يحفظ سلة الضيف محلياً ويحفظ سلة العميل المسجل تلقائياً في حسابه.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSite } from '../context/SiteContext';
import type { Addon, CartEntry, OrderType, OrderableProduct } from '../types/menu';

const CART_STORAGE_KEY = 'zoldix_cart_v1';
const ORDER_TYPE_STORAGE_KEY = 'zoldix_order_type_v1';
const DEVICE_ID_STORAGE_KEY = 'zoldix_device_id_v1';

function readStoredCart(): CartEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readStoredOrderType(): OrderType {
  if (typeof window === 'undefined') return 'delivery';
  try {
    const val = window.localStorage.getItem(ORDER_TYPE_STORAGE_KEY);
    return val === 'pickup' ? 'pickup' : 'delivery';
  } catch {
    return 'delivery';
  }
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!id) {
      id = `dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'browser-session';
  }
}

export function useCart() {
  const { siteConfig, auth, apiFetch, updateUserState } = useSite();
  const [items, setItems] = useState<CartEntry[]>(readStoredCart);
  const [orderType, setOrderType] = useState<OrderType>(readStoredOrderType);
  const loadedUserEmailRef = useRef<string | null>(null);
  const skipNextRemoteSyncRef = useRef(false);

  // تحميل سلة العميل من الخادم بمجرد تسجيل الدخول أو عند دخول الإدارة لحساب العميل
  useEffect(() => {
    const targetEmail = auth.user?.email || null;
    if (!targetEmail) {
      if (loadedUserEmailRef.current) {
        loadedUserEmailRef.current = null;
        setItems(readStoredCart());
      }
      return;
    }

    if (loadedUserEmailRef.current !== targetEmail) {
      loadedUserEmailRef.current = targetEmail;
      skipNextRemoteSyncRef.current = true;
      const serverCart = Array.isArray(auth.user?.cart) ? auth.user.cart : [];
      if (serverCart.length > 0) {
        setItems(serverCart);
      } else if (auth.role === 'customer') {
        // إذا كان الضيف لديه أصناف قبل تسجيل الدخول ندمجها ونحفظها في حسابه
        const guestCart = readStoredCart();
        if (guestCart.length > 0) {
          skipNextRemoteSyncRef.current = false;
          setItems(guestCart);
        } else {
          setItems([]);
        }
      } else {
        setItems([]);
      }
    }
  }, [auth.user, auth.role]);

  // حفظ سلة الضيف في المتصفح وحفظ سلة العميل المسجل على الخادم
  useEffect(() => {
    if (!auth.user) {
      try {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      } catch {
        // تجاهل أخطاء التصفح الخاص
      }
      return;
    }

    if (skipNextRemoteSyncRef.current) {
      skipNextRemoteSyncRef.current = false;
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetch('/api/account/cart', {
          method: 'PUT',
          body: JSON.stringify({ cart: items }),
        });
        if (res.ok) {
          const data = (await res.json()) as { user?: typeof auth.user };
          if (data.user) {
            updateUserState(data.user);
          }
        }
      } catch {
        // المحاولة في التعديل التالي
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [items, auth.user?.email, apiFetch, updateUserState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ORDER_TYPE_STORAGE_KEY, orderType);
    } catch {
      // تجاهل أخطاء التخزين
    }
  }, [orderType]);

  const variantsById = useMemo(
    () => Object.fromEntries(siteConfig.variants.map((v) => [v.id, v])),
    [siteConfig.variants]
  );

  const addonsById = useMemo(
    () => Object.fromEntries(siteConfig.addons.map((a) => [a.id, a])),
    [siteConfig.addons]
  );

  const addToCart = useCallback(
    (
      product: OrderableProduct,
      quantity: number,
      addonIds: string[],
      notes: string,
      variantId?: string
    ) => {
      const normalizedAddons = [...new Set(addonIds)].sort();
      const cleanedNotes = notes.trim();
      const chosenVariant = variantId ? variantsById[variantId] : undefined;
      const vKey = chosenVariant ? chosenVariant.id : '';
      const cartKey = `${product.id}__${vKey}__${normalizedAddons.join(',')}__${cleanedNotes}`;

      const addons: Addon[] = normalizedAddons
        .map((id) => addonsById[id])
        .filter((a): a is Addon => Boolean(a));
      const addonsCost = addons.reduce((acc, a) => acc + a.price, 0);
      const variantDelta = chosenVariant ? chosenVariant.priceDelta : 0;
      const unitPrice = Number((product.price + variantDelta + addonsCost).toFixed(2));

      setItems((prev) => {
        const existingIdx = prev.findIndex((entry) => entry.cartKey === cartKey);
        if (existingIdx !== -1) {
          const updated = [...prev];
          const existing = updated[existingIdx];
          updated[existingIdx] = {
            ...existing,
            quantity: Math.min(50, existing.quantity + quantity),
          };
          return updated;
        }
        return [
          ...prev,
          {
            cartKey,
            itemId: product.id,
            name: product.name,
            image: product.image,
            basePrice: product.price,
            variantId: chosenVariant?.id,
            variantName: chosenVariant?.name,
            variantDelta,
            quantity: Math.max(1, Math.min(50, quantity)),
            addonIds: normalizedAddons,
            addons,
            notes: cleanedNotes,
            unitPrice,
          },
        ];
      });
    },
    [variantsById, addonsById]
  );

  const updateQuantity = useCallback((cartKey: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((entry) => {
          if (entry.cartKey !== cartKey) return entry;
          const nextQty = entry.quantity + delta;
          if (nextQty <= 0) return null;
          return { ...entry, quantity: Math.min(50, nextQty) };
        })
        .filter((entry): entry is CartEntry => entry !== null)
    );
  }, []);

  const removeItem = useCallback((cartKey: string) => {
    setItems((prev) => prev.filter((entry) => entry.cartKey !== cartKey));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const replaceCart = useCallback((nextEntries: CartEntry[]) => {
    setItems(nextEntries);
  }, []);

  const countByItemId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of items) {
      map[entry.itemId] = (map[entry.itemId] || 0) + entry.quantity;
    }
    return map;
  }, [items]);

  const totals = useMemo(() => {
    const totalCount = items.reduce((sum, entry) => sum + entry.quantity, 0);
    const subtotal = Number(
      items.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0).toFixed(2)
    );
    const threshold = siteConfig.restaurant.freeDeliveryThreshold;
    const isFreeDelivery =
      orderType === 'pickup' ||
      items.length === 0 ||
      (threshold !== null && subtotal >= threshold);
    const deliveryFee = isFreeDelivery ? 0 : siteConfig.restaurant.deliveryFee;
    const total = Number((subtotal + deliveryFee).toFixed(2));

    return {
      totalCount,
      subtotal,
      deliveryFee,
      total,
      isFreeDeliveryByThreshold:
        orderType === 'delivery' && threshold !== null && subtotal >= threshold,
      remainingForFreeDelivery:
        orderType === 'delivery' && threshold !== null && subtotal > 0 && subtotal < threshold
          ? Number((threshold - subtotal).toFixed(2))
          : 0,
    };
  }, [items, orderType, siteConfig.restaurant.deliveryFee, siteConfig.restaurant.freeDeliveryThreshold]);

  return {
    items,
    countByItemId,
    orderType,
    setOrderType,
    addToCart,
    updateQuantity,
    removeItem,
    clearCart,
    replaceCart,
    ...totals,
  };
}
