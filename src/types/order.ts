/**
 * Модель демо-заказа и состояния браузера (docs/DESIGN.md §3.3, §9).
 *
 * В рабочей версии заказы, оплата и уведомления живут в Admik; в макете — в localStorage этого
 * браузера. Поля заказа — ровно те, что зафиксированы в DESIGN §3.3: при сращивании с Admik
 * меняется слой хранения (`src/lib/store/*`), а не форма данных в интерфейсе.
 *
 * Деньги — целые копейки. Даты — ISO-строки. Email — нормализованный: trim().toLowerCase().
 */

import type { AttrStatus, PriceType } from '@/types/catalog';

// ---------------------------------------------------------------------------
// Заказ.
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'received'
  | 'negotiation'
  | 'awaiting-payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'completed'
  | 'cancelled';

export type BuyerType = 'person' | 'company';

/**
 * Пункт строки параметров в снимке позиции: текст значения и его статус (DESIGN §4.7, §4.10).
 * inferred — «*» и сноска «Единица не указана в прайсе, принята по контексту»; needs-review —
 * Badge «Уточняется» и пояснение `note`. Статус хранится вместе с текстом: без него снимок
 * выдавал бы «6000–8000 ГГц» или «N/sma-мама» за подтверждённые значения.
 */
export interface OrderSpecPoint {
  text: string;
  status: AttrStatus;
  note?: string;
}

/** Снимок позиции на момент заявки. Не меняется никогда. */
export interface OrderItemSnapshot {
  /** 'l1', 'l2', … внутри заказа. */
  lineId: string;
  productId: string;
  slug: string;
  /** «Код в каталоге» на момент заявки. */
  code: string;
  name: string;
  categoryId: string;
  /** Ключевые параметры (§4.7) на момент заявки — «700–1100 МГц · 12 дБи · N-female» по пунктам. */
  spec: OrderSpecPoint[];
  /**
   * Только у заказов, сохранённых до появления `spec`: та же строка одним текстом, без статусов.
   * Новые снимки поле не пишут; показ — `orderItemSpec()` из `@/lib/demo-orders`.
   */
  specSummary?: string;
  priceType: PriceType;
  /** Цена за штуку в копейках; null — «по запросу». */
  unitPrice: number | null;
  quantity: number;
}

/** Строка версии согласования. Цена обязательна. */
export interface QuoteLine {
  /** = lineId снимка или новый 'm1', 'm2', … для добавленной менеджером. */
  lineId: string;
  productId: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /** unitPrice × quantity. */
  lineTotal: number;
  origin: 'request' | 'added-by-manager';
}

export type QuoteStatus = 'issued' | 'annulled' | 'paid';

export interface QuoteVersion {
  /** 1, 2, … */
  version: number;
  createdAt: string;
  lines: QuoteLine[];
  /** Позиции заявки, исключённые при согласовании. */
  removedLineIds: string[];
  itemsTotal: number;
  /** 0 ≤ discount ≤ itemsTotal. */
  discount: number;
  /** «Промокод DEMO10» или пусто. */
  discountNote: string;
  /** ≥ 0. */
  delivery: number;
  /** «Доставка до Москвы» или пусто. */
  deliveryNote: string;
  /** itemsTotal − discount + delivery. */
  total: number;
  managerComment: string;
  status: QuoteStatus;
  annulledAt: string | null;
  annulReason: string | null;
  paidAt: string | null;
}

export interface PaymentAttempt {
  id: string;
  version: number;
  /** = QuoteVersion.total на момент создания. */
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: string;
  resolvedAt: string | null;
  /** «Провайдер отказал» | «Ссылка аннулирована». */
  failureReason: string | null;
}

export type OrderEventType =
  | 'created'
  | 'status'
  | 'quote-issued'
  | 'quote-annulled'
  | 'payment-confirmed'
  | 'payment-failed'
  | 'cancelled';

export interface OrderEvent {
  id: string;
  at: string;
  type: OrderEventType;
  /** Статус после события. */
  status: OrderStatus;
  /** Текст для журнала (§6.7). */
  title: string;
  notify: { buyerEmail: boolean; managerTelegram: boolean };
}

export interface DemoOrder {
  /** 'DEMO-0001'. */
  number: string;
  createdAt: string;
  idempotencyKey: string;
  status: OrderStatus;
  buyer: {
    type: BuyerType;
    name: string;
    email: string;
    phone: string | null;
    /** Только для 'company'. */
    companyName: string | null;
    /** Только для 'company'. */
    inn: string | null;
    comment: string | null;
  };
  items: OrderItemSnapshot[];
  promo: { code: string; percent: number } | null;
  preliminary: {
    /** Сумма строк с ценой. */
    knownItemsTotal: number;
    /** Строк «по запросу». */
    requestItemsCount: number;
    /** Предварительная скидка по промокоду. */
    discount: number;
    /** null — есть позиции «по запросу», полного итога нет. */
    total: number | null;
  };
  quotes: QuoteVersion[];
  /** Версия в статусе issued или paid; null — нет. */
  activeVersion: number | null;
  payments: PaymentAttempt[];
  events: OrderEvent[];
  cancelReason: string | null;
}

export interface DemoNotification {
  id: string;
  at: string;
  email: string;
  orderNumber: string;
  title: string;
  body: string;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Хранилища браузера (ключи — site.storageKeys, §3.3 «Хранилища»).
// ---------------------------------------------------------------------------

/** Позиция корзины. Цена не хранится — берётся из каталога на момент показа и заявки. */
export interface CartItem {
  productId: string;
  quantity: number;
  addedAt: string;
}

/** `cart`. */
export interface CartData {
  items: CartItem[];
  promoCode: string | null;
}

/** `favorites` — новые в начале. */
export interface FavoritesData {
  ids: string[];
}

/** `demoSession`. */
export interface DemoSession {
  email: string;
  startedAt: string;
}

/** Элемент `demoProfiles` (ключ записи — нормализованный email). */
export interface DemoProfile {
  name: string;
  phone: string | null;
  buyerType: BuyerType;
  companyName: string | null;
  inn: string | null;
  cart: CartItem[];
  promoCode: string | null;
  favorites: string[];
}

/** `demoOrders` — номер заказа = orderNumberPrefix + String(seq).padStart(4, '0'). */
export interface DemoOrdersData {
  seq: number;
  orders: DemoOrder[];
  notifications: DemoNotification[];
}

/** `demoLoginChallenge`. */
export interface LoginChallenge {
  email: string;
  code: string;
  expiresAt: string;
  attemptsLeft: number;
  resendAvailableAt: string;
}
