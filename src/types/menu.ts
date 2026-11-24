/**
 * تعريفات الأنواع الشاملة لمطعم zoldix:
 * القائمة، الثيم المريح، الحسابات، المفضلة، النقاط، الكوبونات، السائقين، تتبع الطلبات، والمحادثة.
 */

export interface RestaurantInfo {
  name: string;
  shortName: string;
  logoUrl?: string;
  tagline: string;
  heroSubtitle: string;
  currency: string;
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  phone: string;
  phoneDisplay: string;
  address: string;
  hours: string;
  estimatedDeliveryMinutes: string;
  about: string;
  acceptingOrders: boolean;
  pausedMessage: string;
  loyaltyPointsPerUnit: number;
  loyaltyRedeemValue: number;
  heroPrimaryCtaLabel?: string;
  heroPrimaryCtaUrl?: string;
  siteRedirectUrl?: string;
}

export interface SiteTheme {
  canvas: string;
  surface: string;
  subtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSecondary: string;
}

export interface HeroChapter {
  id: string;
  title: string;
  subtitle: string;
  startFrame: number;
  endFrame: number;
  productId: string;
}

export interface MidShowcaseConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  productId: string;
  primaryImage?: string;
  secondaryImage?: string;
}

export interface CustomSection {
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  image?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  accentStyle?: 'warm' | 'gold' | 'minimal';
}

export interface DeliveryArea {
  name: string;
  lat: number;
  lng: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface VariantOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
}

export interface OfferItem {
  id: string;
  name: string;
  description: string;
  originalPrice: number;
  price: number;
  discountLabel: string;
  image: string;
  variantIds?: string[];
  addonIds: string[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image: string;
  variantIds?: string[];
  addonIds: string[];
}

export type OrderableProduct = (MenuItem | OfferItem) & {
  originalPrice?: number;
  discountLabel?: string;
};

export interface SiteConfig {
  restaurant: RestaurantInfo;
  theme: SiteTheme;
  heroChapters: HeroChapter[];
  midShowcase: MidShowcaseConfig;
  deliveryAreas: DeliveryArea[];
  categories: Category[];
  variants: VariantOption[];
  addons: Addon[];
  quickNotes: string[];
  offers: OfferItem[];
  items: MenuItem[];
  customSections?: CustomSection[];
}

export interface CartEntry {
  cartKey: string;
  itemId: string;
  name: string;
  image: string;
  basePrice: number;
  variantId?: string;
  variantName?: string;
  variantDelta?: number;
  quantity: number;
  addonIds: string[];
  addons: Addon[];
  notes: string;
  unitPrice: number;
}

export type OrderType = 'delivery' | 'pickup';
export type PaymentMethod = 'cash' | 'pos_card' | 'stripe' | 'card_online';
export type OrderStatus = 'received' | 'preparing' | 'on_the_way' | 'delivered' | 'cancelled';

export interface SubmittedOrderReceipt {
  orderId: string;
  timestamp: string;
  status: OrderStatus;
  orderTypeLabel: string;
  paymentMethod: string;
  paymentStatus?: 'paid' | 'pending_cod';
  paymentProvider?: string;
  paymentTransactionId?: string;
  paidAt?: string;
  receiptEmail?: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  loyaltyPointsUsed: number;
  loyaltyDiscount: number;
  loyaltyPointsEarned: number;
  couponCode?: string;
  total: number;
  currency: string;
  customerEmail?: string;
  name?: string;
  phone?: string;
  area?: string;
  address?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  items: Array<{
    itemId: string;
    name: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    notes: string;
    addons: Addon[];
  }>;
}

export interface CustomerAccount {
  email: string;
  username?: string;
  avatar?: string;
  bio?: string;
  name: string;
  phone: string;
  area: string;
  address: string;
  disabled: boolean;
  hasPassword?: boolean;
  createdAt: string;
  lastLoginAt: string;
  cart: CartEntry[];
  favorites: string[];
  loyaltyPoints: number;
  orders: SubmittedOrderReceipt[];
  lastOrder: SubmittedOrderReceipt | null;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed' | 'free_delivery';
  value: number;
  maxUses: number;
  usedCount: number;
  minOrder: number;
  expiresAt: string;
  active: boolean;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicle: string;
  active: boolean;
  createdAt: string;
}

export interface TicTacToeGameState {
  gameId: string;
  board: Array<'X' | 'O' | null>;
  playerX: { id: string; label: string };
  playerO: { id: string; label: string };
  turn: 'X' | 'O';
  status: 'playing' | 'won' | 'draw';
  winner: 'X' | 'O' | null;
  winningLine: number[] | null;
  xWins: number;
  oWins: number;
  draws: number;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderRole: 'customer' | 'admin' | 'driver';
  senderEmail?: string;
  senderLabel: string;
  text: string;
  createdAt: string;
}

export interface ChatThread {
  threadId: string;
  threadType?: 'customer' | 'driver' | 'dm';
  customerEmail?: string;
  customerName: string;
  participants?: string[];
  participantNames?: Record<string, string>;
  participantUsernames?: Record<string, string>;
  participantAvatars?: Record<string, string>;
  unreadByUser?: Record<string, number>;
  updatedAt: string;
  unreadByAdmin: number;
  unreadByCustomer: number;
  messages: ChatMessage[];
  game?: TicTacToeGameState | null;
}

export interface AuthState {
  role: 'guest' | 'customer' | 'admin';
  token: string | null;
  adminEmail: string | null;
  user: CustomerAccount | null;
  impersonating: boolean;
  driverProfile: Driver | null;
  isDeveloper: boolean;
  isPrimaryDeveloper: boolean;
  developerMode: boolean;
}
