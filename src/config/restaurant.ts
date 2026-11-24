/**
 * محمّل الإعدادات الافتراضية والدوال المساعدة للتعامل مع إعدادات المطعم الحية.
 */
import rawConfig from '../../restaurant.config.json';
import type {
  Addon,
  OrderableProduct,
  SiteConfig,
  VariantOption,
} from '../types/menu';

export const SEED_SITE_CONFIG = rawConfig as SiteConfig;

export function formatPrice(
  amount: number,
  currency = SEED_SITE_CONFIG.restaurant.currency
): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function getAddonsForProduct(
  product: OrderableProduct,
  addonsList: Addon[] = SEED_SITE_CONFIG.addons
): Addon[] {
  const map = Object.fromEntries(addonsList.map((a) => [a.id, a]));
  return (product.addonIds || [])
    .map((id) => map[id])
    .filter((addon): addon is Addon => Boolean(addon));
}

export function getVariantsForProduct(
  product: OrderableProduct,
  variantsList: VariantOption[] = SEED_SITE_CONFIG.variants
): VariantOption[] {
  const map = Object.fromEntries(variantsList.map((v) => [v.id, v]));
  return (product.variantIds || [])
    .map((id) => map[id])
    .filter((variant): variant is VariantOption => Boolean(variant));
}
