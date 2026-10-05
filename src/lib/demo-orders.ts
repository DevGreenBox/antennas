/**
 * Демо-заказы: заявка → согласование → оплата (docs/DESIGN.md §3.2–§3.10).
 *
 * Чистое ядро без React и localStorage: каждая операция принимает снимок данных
 * (`DemoOrdersData`) и возвращает новый — исходный объект не меняется. Хранение (zustand persist,
 * синхронизация вкладок) — в `src/lib/store/orders.ts`; компоненты вызывают операции оттуда,
 * статус напрямую не меняют и суммы не считают (правило ТЗ «суммы считаются на сервере»).
 * В рабочей версии всё это делает Admik: модуль заменяется вызовами Storefront API, форма данных
 * (`src/types/order.ts`) остаётся.
 *
 * Гарантии (покрыты scripts/tests/orders.test.mjs):
 * - переход возможен только по таблице `ORDER_TRANSITIONS`; иначе ошибка и данные не меняются;
 * - двойная отправка заявки с тем же ключом идемпотентности не создаёт второй заказ;
 * - заказ доступен только по email покупателя — чужой email получает «не найден»;
 * - «Изменить сумму» аннулирует действующую версию и её ссылку оплаты;
 * - подтверждение оплаты — только по ожидающей попытке действующей версии и только один раз;
 *   повтор ничего не меняет, аннулированная ссылка отклоняется.
 *
 * Время и идентификаторы приходят в `OpContext` — тесты задают их явно.
 */

import type { AttrStatus, PriceType, Product } from '@/types/catalog';
import type {
  BuyerType,
  DemoNotification,
  DemoOrder,
  DemoOrdersData,
  OrderEvent,
  OrderEventType,
  OrderItemSnapshot,
  OrderSpecPoint,
  OrderStatus,
  PaymentAttempt,
  QuoteLine,
  QuoteStatus,
  QuoteVersion,
} from '@/types/order';

import { site } from '../config/site.ts';
import { formatPrice } from './catalog/price.ts';
import { NBSP, getSpecLine } from './catalog/attributes.ts';
import {
  MAX_LINE_QUANTITY,
  preliminaryTotals,
  suggestPromoDiscount,
  toOrderPreliminary,
  validateQuoteDraft,
} from './demo-pricing.ts';
import type { QuoteDraft, QuoteDraftError, QuoteDraftLine } from './demo-pricing.ts';
import { isValidEmail, normalizeEmail, normalizePhone } from './format.ts';
import { HAPPY_PATH, ORDER_STATUSES, canTransition, isPaidOrLater } from './order-status.ts';

// ---------------------------------------------------------------------------
// Контекст и общие типы.
// ---------------------------------------------------------------------------

export interface OpContext {
  /** Текущее время, ISO. */
  now: string;
  /** Новый уникальный id (события, уведомления, попытки оплаты). */
  newId: () => string;
}

/** Случайный id без зависимости от crypto.randomUUID (его нет вне защищённого контекста). */
export function randomId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function systemContext(): OpContext {
  return { now: new Date().toISOString(), newId: randomId };
}

export function emptyOrdersData(): DemoOrdersData {
  return { seq: 0, orders: [], notifications: [] };
}

/** Заказ ищется по номеру и email покупателя (сессии). */
export interface OrderRef {
  number: string;
  email: string;
}

export type OrderOpError =
  | 'not-found'
  | 'invalid-transition'
  | 'invalid-quote'
  | 'reason-required'
  | 'not-awaiting-payment'
  | 'unknown-version'
  | 'stale-link';

export type OrderOpResult =
  | { ok: true; data: DemoOrdersData; order: DemoOrder }
  | {
      ok: false;
      error: OrderOpError;
      message: string;
      /** Ошибки формы согласования — у 'invalid-quote'. */
      quoteErrors?: QuoteDraftError[];
    };

const NOT_FOUND = {
  ok: false,
  error: 'not-found',
  message: 'Заказ не найден',
} as const satisfies OrderOpResult;

// ---------------------------------------------------------------------------
// Чтение.
// ---------------------------------------------------------------------------

const newestFirst = (
  a: { createdAt?: string; at?: string },
  b: { createdAt?: string; at?: string },
) => (b.createdAt ?? b.at ?? '').localeCompare(a.createdAt ?? a.at ?? '');

/**
 * Заказ покупателя или null. Чужой email получает null — тот же ответ, что и для
 * несуществующего номера (существование чужого заказа не раскрывается, §2.14).
 */
export function findOrder(
  data: DemoOrdersData,
  number: string,
  email: string | null | undefined,
): DemoOrder | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  return (
    data.orders.find((order) => order.number === number && order.buyer.email === normalized) ?? null
  );
}

export function findOrderByIdempotencyKey(data: DemoOrdersData, key: string): DemoOrder | null {
  return data.orders.find((order) => order.idempotencyKey === key) ?? null;
}

/** Заказы покупателя, новые сверху. */
export function ordersForEmail(
  data: DemoOrdersData,
  email: string | null | undefined,
): DemoOrder[] {
  if (!email) return [];
  const normalized = normalizeEmail(email);
  return data.orders
    .filter((order) => order.buyer.email === normalized)
    .sort((a, b) => newestFirst(a, b) || b.number.localeCompare(a.number));
}

/** Уведомления покупателя, новые сверху. */
export function notificationsForEmail(
  data: DemoOrdersData,
  email: string | null | undefined,
): DemoNotification[] {
  if (!email) return [];
  const normalized = normalizeEmail(email);
  return data.notifications.filter((n) => n.email === normalized).sort(newestFirst);
}

export function unreadCount(data: DemoOrdersData, email: string | null | undefined): number {
  return notificationsForEmail(data, email).filter((n) => !n.read).length;
}

/** Действующая версия согласования (issued или paid). */
export function activeQuote(order: DemoOrder): QuoteVersion | null {
  if (order.activeVersion === null) return null;
  return order.quotes.find((quote) => quote.version === order.activeVersion) ?? null;
}

export function lastAnnulledQuote(order: DemoOrder): QuoteVersion | null {
  const annulled = order.quotes.filter((quote) => quote.status === 'annulled');
  return annulled.length === 0 ? null : annulled[annulled.length - 1];
}

/**
 * Версия, по которой показывается состав (§3.8): действующая, иначе последняя аннулированная;
 * null — до первой версии показывается снимок заявки (`order.items`).
 */
export function displayedQuote(order: DemoOrder): QuoteVersion | null {
  return activeQuote(order) ?? lastAnnulledQuote(order);
}

/** Ссылка на оплату версии: `/account/orders/{number}/pay?v={version}`. */
export function paymentHref(number: string, version: number): `/${string}` {
  return `/account/orders/${encodeURIComponent(number)}/pay?v=${version}`;
}

/** Ожидающая попытка оплаты версии (новую при её наличии создавать нельзя). */
export function pendingAttempt(order: DemoOrder, version: number): PaymentAttempt | null {
  return (
    order.payments.find((attempt) => attempt.version === version && attempt.status === 'pending') ??
    null
  );
}

/** Время последнего входа заказа в статус (по журналу) или null. */
export function statusReachedAt(order: DemoOrder, status: OrderStatus): string | null {
  for (let i = order.events.length - 1; i >= 0; i -= 1) {
    if (order.events[i].status === status) return order.events[i].at;
  }
  return null;
}

export type TimelineStepState = 'done' | 'current' | 'upcoming' | 'cancelled';

export interface TimelineStep {
  status: OrderStatus;
  state: TimelineStepState;
  /** Время входа в статус; null — у предстоящих. */
  at: string | null;
}

/**
 * Шаги StatusTimeline (§5.9.32): путь §3.1; при отмене — выполненные шаги и шаг «Отменён»,
 * остальные не показываются.
 */
export function statusTimeline(order: DemoOrder): TimelineStep[] {
  if (order.status === 'cancelled') {
    const reached = HAPPY_PATH.filter((status) => statusReachedAt(order, status) !== null);
    return [
      ...reached.map((status) => ({
        status,
        state: 'done' as const,
        at: statusReachedAt(order, status),
      })),
      { status: 'cancelled', state: 'cancelled', at: statusReachedAt(order, 'cancelled') },
    ];
  }
  const currentIndex = HAPPY_PATH.indexOf(order.status);
  return HAPPY_PATH.map((status, index) => {
    // Последний шаг пути выполнен, если заказ завершён: текущего «впереди» нет.
    const state: TimelineStepState =
      index < currentIndex || (order.status === 'completed' && index === currentIndex)
        ? 'done'
        : index === currentIndex
          ? 'current'
          : 'upcoming';
    return { status, state, at: state === 'upcoming' ? null : statusReachedAt(order, status) };
  });
}

/** Сумма заказа для списков (§2.13). */
export type OrderAmount =
  /** После согласования: итог версии (оплачен — `paid`). */
  | { kind: 'quote'; total: number; version: number; paid: boolean }
  /** До согласования, без позиций «по запросу»: «{сумма} предварительно». */
  | { kind: 'preliminary'; total: number }
  /** До согласования, есть позиции «по запросу»: «Уточняется». */
  | { kind: 'pending'; knownItemsTotal: number };

export function orderAmount(order: DemoOrder): OrderAmount {
  const quote = displayedQuote(order);
  if (quote !== null) {
    return {
      kind: 'quote',
      total: quote.total,
      version: quote.version,
      paid: quote.status === 'paid',
    };
  }
  if (order.preliminary.total !== null) {
    return { kind: 'preliminary', total: order.preliminary.total };
  }
  return { kind: 'pending', knownItemsTotal: order.preliminary.knownItemsTotal };
}

/**
 * Состояние страницы оплаты `/pay?v=` (§2.15), проверки сверху вниз:
 * C — уже оплачен; X — отменён; B — версия v аннулирована; A — заказ на согласовании;
 * D — форма оплаты (v — действующая версия); E — версии v в заказе нет.
 * Без `v` страница сначала делает replace на `?v={activeVersion}`.
 */
export type PaymentPageState =
  | { code: 'C'; paidAt: string | null }
  | { code: 'X' }
  | { code: 'B'; version: number; active: QuoteVersion | null }
  | { code: 'A' }
  | { code: 'D'; quote: QuoteVersion; pending: PaymentAttempt | null }
  | { code: 'E'; active: QuoteVersion | null };

export function paymentPageState(order: DemoOrder, version: number | null): PaymentPageState {
  if (isPaidOrLater(order.status)) {
    const paid = order.quotes.find((quote) => quote.status === 'paid');
    return { code: 'C', paidAt: paid?.paidAt ?? statusReachedAt(order, 'paid') };
  }
  if (order.status === 'cancelled') return { code: 'X' };
  const requested =
    version === null ? null : (order.quotes.find((quote) => quote.version === version) ?? null);
  if (requested !== null && requested.status === 'annulled') {
    return { code: 'B', version: requested.version, active: activeQuote(order) };
  }
  if (order.status === 'received' || order.status === 'negotiation') return { code: 'A' };
  const active = activeQuote(order);
  if (requested !== null && active !== null && requested.version === active.version) {
    return { code: 'D', quote: active, pending: pendingAttempt(order, active.version) };
  }
  return { code: 'E', active };
}

// ---------------------------------------------------------------------------
// Внутренние помощники записи.
// ---------------------------------------------------------------------------

function orderNumber(seq: number): string {
  return `${site.demo.orderNumberPrefix}${String(seq).padStart(4, '0')}`;
}

function makeEvent(
  ctx: OpContext,
  type: OrderEventType,
  status: OrderStatus,
  title: string,
  notify: Partial<OrderEvent['notify']> = {},
): OrderEvent {
  return {
    id: ctx.newId(),
    at: ctx.now,
    type,
    status,
    title,
    notify: {
      buyerEmail: notify.buyerEmail ?? false,
      managerTelegram: notify.managerTelegram ?? false,
    },
  };
}

function makeNotification(
  ctx: OpContext,
  order: DemoOrder,
  title: string,
  body: string,
): DemoNotification {
  return {
    id: ctx.newId(),
    at: ctx.now,
    email: order.buyer.email,
    orderNumber: order.number,
    title,
    body,
    read: false,
  };
}

/** Заменить заказ в данных и добавить уведомления. */
function commit(
  data: DemoOrdersData,
  order: DemoOrder,
  notifications: DemoNotification[] = [],
): { ok: true; data: DemoOrdersData; order: DemoOrder } {
  return {
    ok: true,
    order,
    data: {
      ...data,
      orders: data.orders.map((existing) => (existing.number === order.number ? order : existing)),
      notifications: [...data.notifications, ...notifications],
    },
  };
}

function invalidTransition(order: DemoOrder, to: OrderStatus): OrderOpResult {
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[demo-orders] Переход ${order.status} → ${to} запрещён (заказ ${order.number}).`);
  }
  return {
    ok: false,
    error: 'invalid-transition',
    message: 'Это действие недоступно в текущем статусе заказа.',
  };
}

/** Аннулировать версию и провалить её ожидающие попытки оплаты. */
function annulActiveQuote(order: DemoOrder, reason: string, ctx: OpContext): DemoOrder {
  const active = order.activeVersion;
  if (active === null) return order;
  return {
    ...order,
    activeVersion: null,
    quotes: order.quotes.map((quote) =>
      quote.version === active && quote.status === 'issued'
        ? { ...quote, status: 'annulled', annulledAt: ctx.now, annulReason: reason }
        : quote,
    ),
    payments: order.payments.map((attempt) =>
      attempt.version === active && attempt.status === 'pending'
        ? {
            ...attempt,
            status: 'failed',
            resolvedAt: ctx.now,
            failureReason: 'Ссылка аннулирована',
          }
        : attempt,
    ),
  };
}

// ---------------------------------------------------------------------------
// Создание заявки.
// ---------------------------------------------------------------------------

export interface CreateOrderLine {
  productId: string;
  /** Товар из каталога; null/undefined — позиция больше недоступна. */
  product: Product | null | undefined;
  quantity: number;
}

export interface CreateOrderInput {
  /** Ключ идемпотентности — генерируется при монтировании формы заявки. */
  idempotencyKey: string;
  buyer: {
    type: BuyerType;
    name: string;
    email: string;
    phone?: string | null;
    companyName?: string | null;
    inn?: string | null;
    comment?: string | null;
  };
  lines: readonly CreateOrderLine[];
  promoCode: string | null;
}

export type CreateOrderError =
  'empty-cart' | 'unavailable-items' | 'invalid-quantity' | 'invalid-buyer' | 'invalid-key';

export type CreateOrderResult =
  | {
      ok: true;
      data: DemoOrdersData;
      order: DemoOrder;
      /** false — заказ с этим ключом уже был (двойной клик, повторная отправка). */
      created: boolean;
    }
  | { ok: false; error: CreateOrderError; message: string };

const emptyToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/** Строка параметров товара по пунктам со статусами — для снимка позиции (§4.7, §4.10). */
export function specPointsOf(product: Product): OrderSpecPoint[] {
  return getSpecLine(product).map(({ text, status, note }) =>
    note === undefined ? { text, status } : { text, status, note },
  );
}

/**
 * Параметры позиции заказа для показа. Новые снимки хранят пункты со статусами (`spec`). У
 * заказов, сохранённых раньше, есть только строка `specSummary`: её пункты сверяются с текущей
 * строкой товара в каталоге, и совпавшие получают свой статус — «3100–4500 МГц» у Тип7 снова
 * со «*», «6000–8000 ГГц» — «Уточняется». Пункт, которого в каталоге уже нет, показывается как
 * был сохранён (статус неизвестен — без пометки, как и раньше).
 */
export function orderItemSpec(
  item: Pick<OrderItemSnapshot, 'spec' | 'specSummary'>,
  product?: Product | null,
): OrderSpecPoint[] {
  if (item.spec.length > 0 || !item.specSummary) return item.spec;
  const current = product ? specPointsOf(product) : [];
  return item.specSummary
    .split(' · ')
    .filter((text) => text !== '')
    .map((text) => current.find((point) => point.text === text) ?? { text, status: 'confirmed' });
}

/** Снимок позиции: название, код, характеристики и цена на момент заявки. */
export function snapshotItem(product: Product, quantity: number, index: number): OrderItemSnapshot {
  return {
    lineId: `l${index + 1}`,
    productId: product.id,
    slug: product.slug,
    code: product.code,
    name: product.name,
    categoryId: product.categoryId,
    spec: specPointsOf(product),
    priceType: product.priceType,
    unitPrice: product.priceType === 'fixed' ? product.price : null,
    quantity,
  };
}

/**
 * «Отправить заявку» (— → received). Идемпотентно: заказ с тем же ключом возвращается как есть
 * (`created: false`), номер не расходуется. Уведомления: покупателю (email) и менеджеру
 * (Telegram) — в демо помечены «не отправлено».
 */
export function createOrder(
  data: DemoOrdersData,
  input: CreateOrderInput,
  ctx: OpContext,
): CreateOrderResult {
  if (input.idempotencyKey.trim() === '') {
    return {
      ok: false,
      error: 'invalid-key',
      message: 'Не удалось отправить заявку. Обновите страницу.',
    };
  }
  const existing = findOrderByIdempotencyKey(data, input.idempotencyKey);
  if (existing !== null) return { ok: true, data, order: existing, created: false };

  if (input.lines.length === 0) {
    return { ok: false, error: 'empty-cart', message: 'Сначала добавьте позиции в корзину.' };
  }
  if (input.lines.some((line) => !line.product)) {
    return {
      ok: false,
      error: 'unavailable-items',
      message: 'Уберите недоступные позиции, чтобы оформить заявку',
    };
  }
  if (
    input.lines.some(
      (line) =>
        !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY,
    )
  ) {
    return {
      ok: false,
      error: 'invalid-quantity',
      message: 'Количество в строке — от 1 до 999 шт.',
    };
  }
  const name = input.buyer.name.trim();
  const email = normalizeEmail(input.buyer.email);
  if (name === '' || !isValidEmail(email)) {
    return { ok: false, error: 'invalid-buyer', message: 'Проверьте имя и email.' };
  }

  const items = input.lines.map((line, index) =>
    snapshotItem(line.product as Product, line.quantity, index),
  );
  const totals = preliminaryTotals(items, input.promoCode);
  const seq = data.seq + 1;
  const number = orderNumber(seq);
  const isCompany = input.buyer.type === 'company';
  const phone = emptyToNull(input.buyer.phone);
  const title = `Заявка ${number} получена`;

  const order: DemoOrder = {
    number,
    createdAt: ctx.now,
    idempotencyKey: input.idempotencyKey,
    status: 'received',
    buyer: {
      type: input.buyer.type,
      name,
      email,
      phone: phone === null ? null : normalizePhone(phone),
      companyName: isCompany ? emptyToNull(input.buyer.companyName) : null,
      inn: isCompany ? emptyToNull(input.buyer.inn) : null,
      comment: emptyToNull(input.buyer.comment),
    },
    items,
    promo: totals.promo,
    preliminary: toOrderPreliminary(totals),
    quotes: [],
    activeVersion: null,
    payments: [],
    events: [
      makeEvent(ctx, 'created', 'received', title, { buyerEmail: true, managerTelegram: true }),
    ],
    cancelReason: null,
  };
  const notification = makeNotification(
    ctx,
    order,
    title,
    'Мы получили заявку. Менеджер свяжется с вами для согласования.',
  );
  return {
    ok: true,
    created: true,
    order,
    data: {
      seq,
      orders: [...data.orders, order],
      notifications: [...data.notifications, notification],
    },
  };
}

/** Текст журнала менеджера (Telegram, демо) для события заказа или null (§6.7). */
export function managerMessage(order: DemoOrder, event: OrderEvent): string | null {
  if (!event.notify.managerTelegram) return null;
  if (event.type === 'created') {
    return `Новая заявка ${order.number}: ${order.buyer.name}, ${order.buyer.email}, позиций ${order.items.length}`;
  }
  if (event.type === 'payment-confirmed') {
    const paid = order.quotes.find((quote) => quote.status === 'paid');
    return `Оплачен заказ ${order.number}${paid ? `: ${formatPrice(paid.total)}` : ''}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Действия менеджера (демо-панель, §3.9).
// ---------------------------------------------------------------------------

/** «Взять в работу»: received → negotiation. Уведомление покупателю не создаётся. */
export function startNegotiation(
  data: DemoOrdersData,
  ref: OrderRef,
  ctx: OpContext,
): OrderOpResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) return NOT_FOUND;
  if (order.status !== 'received' || !canTransition(order.status, 'negotiation')) {
    return invalidTransition(order, 'negotiation');
  }
  return commit(data, {
    ...order,
    status: 'negotiation',
    events: [
      ...order.events,
      makeEvent(ctx, 'status', 'negotiation', `Заявка ${order.number} на согласовании`),
    ],
  });
}

/**
 * Предзаполнение формы согласования (§3.9): цены — из последней аннулированной версии, иначе из
 * снимка, иначе пусто; скидка — по промокоду заказа; доставка — из аннулированной версии.
 */
export function initialQuoteDraft(order: DemoOrder): QuoteDraft {
  const annulled = lastAnnulledQuote(order);
  if (annulled !== null) {
    const removed = new Set(annulled.removedLineIds);
    const fromQuote = new Map(annulled.lines.map((line) => [line.lineId, line]));
    const lines: QuoteDraftLine[] = order.items.map((item) => {
      const quoted = fromQuote.get(item.lineId);
      return {
        lineId: item.lineId,
        productId: item.productId,
        code: item.code,
        name: item.name,
        quantity: quoted?.quantity ?? item.quantity,
        unitPrice: quoted?.unitPrice ?? item.unitPrice,
        origin: 'request',
        excluded: removed.has(item.lineId) || quoted === undefined,
      };
    });
    for (const line of annulled.lines) {
      if (line.origin !== 'added-by-manager') continue;
      lines.push({
        lineId: line.lineId,
        productId: line.productId,
        code: line.code,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        origin: 'added-by-manager',
        excluded: false,
      });
    }
    return {
      lines,
      discount: annulled.discount,
      discountNote: annulled.discountNote,
      delivery: annulled.delivery,
      deliveryNote: annulled.deliveryNote,
      managerComment: annulled.managerComment,
    };
  }
  const lines: QuoteDraftLine[] = order.items.map((item) => ({
    lineId: item.lineId,
    productId: item.productId,
    code: item.code,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    origin: 'request',
    excluded: false,
  }));
  return {
    lines,
    discount: suggestPromoDiscount(lines, order),
    discountNote: order.promo === null ? '' : `Промокод ${order.promo.code}`,
    delivery: null,
    deliveryNote: '',
    managerComment: '',
  };
}

/** Следующий id строки, добавленной менеджером: 'm1', 'm2', … */
export function nextManagerLineId(lines: readonly { lineId: string }[]): string {
  const used = lines
    .map((line) => /^m(\d+)$/.exec(line.lineId))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]));
  return `m${used.length === 0 ? 1 : Math.max(...used) + 1}`;
}

/**
 * «Выставить к оплате»: negotiation → awaiting-payment. Создаёт версию N+1 (`issued`) и её
 * ссылку оплаты; если по ошибке осталась действующая версия — она аннулируется.
 */
export function issueQuote(
  data: DemoOrdersData,
  ref: OrderRef,
  draft: QuoteDraft,
  ctx: OpContext,
): OrderOpResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) return NOT_FOUND;
  if (order.status !== 'negotiation' || !canTransition(order.status, 'awaiting-payment')) {
    return invalidTransition(order, 'awaiting-payment');
  }
  const check = validateQuoteDraft(draft);
  if (!check.ok) {
    return {
      ok: false,
      error: 'invalid-quote',
      message: check.errors[0].message,
      quoteErrors: check.errors,
    };
  }
  const base = annulActiveQuote(order, 'Сумма изменена', ctx);
  const version = base.quotes.reduce((max, quote) => Math.max(max, quote.version), 0) + 1;
  const included = draft.lines.filter((line) => !line.excluded);
  const lines: QuoteLine[] = included.map((line) => ({
    lineId: line.lineId,
    productId: line.productId,
    code: line.code,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice as number,
    lineTotal: (line.unitPrice as number) * line.quantity,
    origin: line.origin,
  }));
  const quotedIds = new Set(lines.map((line) => line.lineId));
  const removedLineIds = order.items
    .map((item) => item.lineId)
    .filter((lineId) => !quotedIds.has(lineId));
  const quote: QuoteVersion = {
    version,
    createdAt: ctx.now,
    lines,
    removedLineIds,
    itemsTotal: check.totals.itemsTotal,
    discount: check.totals.discount,
    discountNote: draft.discountNote.trim(),
    delivery: check.totals.delivery,
    deliveryNote: draft.deliveryNote.trim(),
    total: check.totals.total,
    managerComment: draft.managerComment.trim(),
    status: 'issued',
    annulledAt: null,
    annulReason: null,
    paidAt: null,
  };
  const title = `Заказ ${order.number} ожидает оплаты`;
  const next: DemoOrder = {
    ...base,
    status: 'awaiting-payment',
    quotes: [...base.quotes, quote],
    activeVersion: version,
    events: [
      ...base.events,
      makeEvent(ctx, 'quote-issued', 'awaiting-payment', title, { buyerEmail: true }),
    ],
  };
  return commit(data, next, [
    makeNotification(
      ctx,
      next,
      title,
      `Заказ согласован. К оплате ${formatPrice(quote.total)}. Оплатить можно в личном кабинете.`,
    ),
  ]);
}

/**
 * «Изменить сумму»: awaiting-payment → negotiation. Действующая версия аннулируется (причина
 * «Сумма изменена»), её ссылка перестаёт действовать, ожидающие попытки — `failed`.
 */
export function reopenQuote(data: DemoOrdersData, ref: OrderRef, ctx: OpContext): OrderOpResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) return NOT_FOUND;
  if (order.status !== 'awaiting-payment' || !canTransition(order.status, 'negotiation')) {
    return invalidTransition(order, 'negotiation');
  }
  const base = annulActiveQuote(order, 'Сумма изменена', ctx);
  const title = `Сумма заказа ${order.number} меняется`;
  const next: DemoOrder = {
    ...base,
    status: 'negotiation',
    events: [
      ...base.events,
      makeEvent(ctx, 'quote-annulled', 'negotiation', title, { buyerEmail: true }),
    ],
  };
  return commit(data, next, [
    makeNotification(
      ctx,
      next,
      title,
      'Прежняя ссылка на оплату больше не действует. Менеджер выставит заказ к оплате заново.',
    ),
  ]);
}

const ADVANCE_TEXT = {
  processing: { title: 'в обработке', body: () => 'Заказ комплектуют и готовят к отправке.' },
  shipped: {
    title: 'отправлен',
    body: (order: DemoOrder) => {
      const note = activeQuote(order)?.deliveryNote ?? '';
      return `Заказ передан в доставку.${note === '' ? '' : ` ${note}`}`;
    },
  },
  completed: { title: 'выполнен', body: () => 'Спасибо за заказ.' },
} as const;

export type AdvanceStatus = keyof typeof ADVANCE_TEXT;

/** «Передать в обработку» / «Отметить отправку» / «Завершить заказ». */
export function advanceOrder(
  data: DemoOrdersData,
  ref: OrderRef,
  to: AdvanceStatus,
  ctx: OpContext,
): OrderOpResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) return NOT_FOUND;
  if (!canTransition(order.status, to)) return invalidTransition(order, to);
  const title = `Заказ ${order.number} ${ADVANCE_TEXT[to].title}`;
  const next: DemoOrder = {
    ...order,
    status: to,
    events: [...order.events, makeEvent(ctx, 'status', to, title, { buyerEmail: true })],
  };
  return commit(data, next, [makeNotification(ctx, next, title, ADVANCE_TEXT[to].body(order))]);
}

/**
 * «Отменить заказ» из received / negotiation / awaiting-payment. Причина обязательна. При
 * awaiting-payment действующая версия аннулируется («Заказ отменён»).
 */
export function cancelOrder(
  data: DemoOrdersData,
  ref: OrderRef,
  reason: string,
  ctx: OpContext,
): OrderOpResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) return NOT_FOUND;
  if (!canTransition(order.status, 'cancelled')) return invalidTransition(order, 'cancelled');
  const cause = reason.trim();
  if (cause === '') {
    return { ok: false, error: 'reason-required', message: 'Укажите причину отмены' };
  }
  const base = annulActiveQuote(order, 'Заказ отменён', ctx);
  const title = `Заказ ${order.number} отменён`;
  const next: DemoOrder = {
    ...base,
    status: 'cancelled',
    cancelReason: cause,
    events: [...base.events, makeEvent(ctx, 'cancelled', 'cancelled', title, { buyerEmail: true })],
  };
  return commit(data, next, [makeNotification(ctx, next, title, `Причина: ${cause}.`)]);
}

// ---------------------------------------------------------------------------
// Оплата (демо-провайдер, §3.7).
// ---------------------------------------------------------------------------

export type StartPaymentResult =
  | { ok: true; data: DemoOrdersData; order: DemoOrder; attempt: PaymentAttempt; created: boolean }
  | { ok: false; error: OrderOpError; message: string };

/**
 * «Оплатить {сумма}»: попытка `pending` по действующей версии. Если у версии уже есть ожидающая
 * попытка — возвращается она, вторая не создаётся.
 */
export function startPayment(
  data: DemoOrdersData,
  ref: OrderRef,
  version: number,
  ctx: OpContext,
): StartPaymentResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) return NOT_FOUND;
  if (order.status !== 'awaiting-payment') {
    return {
      ok: false,
      error: 'not-awaiting-payment',
      message: isPaidOrLater(order.status)
        ? 'Заказ уже оплачен. Повторная оплата не нужна.'
        : 'Оплата сейчас недоступна.',
    };
  }
  const quote = order.quotes.find((item) => item.version === version);
  if (quote === undefined) {
    return { ok: false, error: 'unknown-version', message: 'Ссылка на оплату неверна.' };
  }
  if (quote.status !== 'issued' || order.activeVersion !== version) {
    return {
      ok: false,
      error: 'stale-link',
      message: `Эта ссылка на оплату больше не действует: сумма заказа изменена (версия ${version} аннулирована).`,
    };
  }
  const existing = pendingAttempt(order, version);
  if (existing !== null) return { ok: true, data, order, attempt: existing, created: false };
  const attempt: PaymentAttempt = {
    id: ctx.newId(),
    version,
    amount: quote.total,
    status: 'pending',
    createdAt: ctx.now,
    resolvedAt: null,
    failureReason: null,
  };
  const next = { ...order, payments: [...order.payments, attempt] };
  return { ...commit(data, next), attempt, created: true };
}

export type PaymentConfirmCode =
  'confirmed' | 'already-paid' | 'not-pending' | 'stale-link' | 'amount-mismatch' | 'not-found';

export interface PaymentConfirmResult {
  code: PaymentConfirmCode;
  /** Текст для Notice (§3.7, §6.7). */
  message: string;
  /** Данные после проверки (при stale-link / amount-mismatch попытка уже `failed`). */
  data: DemoOrdersData;
  order: DemoOrder | null;
}

/**
 * «Провайдер подтвердил оплату» — проверки по порядку §3.7. Статус «Оплачен» ставится только
 * здесь; повторное подтверждение (в том числе другой попытки) ничего не меняет.
 */
export function confirmPayment(
  data: DemoOrdersData,
  ref: OrderRef,
  attemptId: string,
  ctx: OpContext,
): PaymentConfirmResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) {
    return { code: 'not-found', message: 'Заказ не найден', data, order: null };
  }
  if (isPaidOrLater(order.status)) {
    return {
      code: 'already-paid',
      message: 'Оплата уже подтверждена ранее. Повторное подтверждение ничего не изменило.',
      data,
      order,
    };
  }
  const attempt = order.payments.find((item) => item.id === attemptId);
  if (attempt === undefined || attempt.status !== 'pending') {
    return { code: 'not-pending', message: 'Эта попытка оплаты уже обработана.', data, order };
  }
  const quote = order.quotes.find((item) => item.version === attempt.version);
  const failAttempt = (reason: string): DemoOrder => ({
    ...order,
    payments: order.payments.map((item) =>
      item.id === attempt.id
        ? { ...item, status: 'failed', resolvedAt: ctx.now, failureReason: reason }
        : item,
    ),
  });
  if (
    quote === undefined ||
    quote.status !== 'issued' ||
    order.activeVersion !== attempt.version ||
    order.status !== 'awaiting-payment'
  ) {
    const next = failAttempt('Ссылка аннулирована');
    return {
      code: 'stale-link',
      message: `Подтверждение отклонено: ссылка на оплату устарела (версия ${attempt.version} аннулирована).`,
      data: commit(data, next).data,
      order: next,
    };
  }
  if (attempt.amount !== quote.total) {
    const next = failAttempt('Сумма не совпадает с выставленной');
    return {
      code: 'amount-mismatch',
      message: 'Подтверждение отклонено: сумма не совпадает с выставленной.',
      data: commit(data, next).data,
      order: next,
    };
  }
  if (!canTransition(order.status, 'paid')) {
    invalidTransition(order, 'paid');
    return { code: 'not-pending', message: 'Эта попытка оплаты уже обработана.', data, order };
  }
  const title = `Заказ ${order.number} оплачен`;
  const next: DemoOrder = {
    ...order,
    status: 'paid',
    quotes: order.quotes.map((item) =>
      item.version === quote.version ? { ...item, status: 'paid', paidAt: ctx.now } : item,
    ),
    payments: order.payments.map((item) =>
      item.id === attempt.id ? { ...item, status: 'confirmed', resolvedAt: ctx.now } : item,
    ),
    events: [
      ...order.events,
      makeEvent(ctx, 'payment-confirmed', 'paid', title, {
        buyerEmail: true,
        managerTelegram: true,
      }),
    ],
  };
  const committed = commit(data, next, [
    makeNotification(ctx, next, title, `Оплата ${formatPrice(quote.total)} подтверждена.`),
  ]);
  return {
    code: 'confirmed',
    message: `Оплата подтверждена. Заказ ${order.number} оплачен.`,
    data: committed.data,
    order: committed.order,
  };
}

export type PaymentDeclineResult =
  | { ok: true; data: DemoOrdersData; order: DemoOrder; message: string }
  | { ok: false; code: 'not-found' | 'already-paid' | 'not-pending'; message: string };

/** «Провайдер отказал»: попытка → failed, статус прежний, уведомление «Оплата не прошла». */
export function declinePayment(
  data: DemoOrdersData,
  ref: OrderRef,
  attemptId: string,
  ctx: OpContext,
): PaymentDeclineResult {
  const order = findOrder(data, ref.number, ref.email);
  if (order === null) return { ok: false, code: 'not-found', message: 'Заказ не найден' };
  if (isPaidOrLater(order.status)) {
    return {
      ok: false,
      code: 'already-paid',
      message: 'Оплата уже подтверждена ранее. Повторное подтверждение ничего не изменило.',
    };
  }
  const attempt = order.payments.find((item) => item.id === attemptId);
  if (attempt === undefined || attempt.status !== 'pending') {
    return { ok: false, code: 'not-pending', message: 'Эта попытка оплаты уже обработана.' };
  }
  const title = `Оплата заказа ${order.number} не прошла`;
  const next: DemoOrder = {
    ...order,
    payments: order.payments.map((item) =>
      item.id === attempt.id
        ? { ...item, status: 'failed', resolvedAt: ctx.now, failureReason: 'Провайдер отказал' }
        : item,
    ),
    events: [
      ...order.events,
      makeEvent(ctx, 'payment-failed', order.status, title, { buyerEmail: true }),
    ],
  };
  const committed = commit(data, next, [
    makeNotification(ctx, next, title, 'Провайдер отказал в оплате. Можно попробовать снова.'),
  ]);
  return {
    ...committed,
    message: 'Оплата не прошла: провайдер отказал. Можно попробовать снова.',
  };
}

// ---------------------------------------------------------------------------
// Уведомления.
// ---------------------------------------------------------------------------

/**
 * Отметить прочитанными уведомления покупателя: все, по списку id или по номеру заказа
 * (переход по ссылке «Заказ {№}»). Чужие уведомления не трогаются.
 */
export function markNotificationsRead(
  data: DemoOrdersData,
  email: string,
  filter: { ids?: readonly string[]; orderNumber?: string } = {},
): DemoOrdersData {
  const normalized = normalizeEmail(email);
  const ids = filter.ids === undefined ? null : new Set(filter.ids);
  let changed = false;
  const notifications = data.notifications.map((n) => {
    if (n.read || n.email !== normalized) return n;
    if (ids !== null && !ids.has(n.id)) return n;
    if (filter.orderNumber !== undefined && n.orderNumber !== filter.orderNumber) return n;
    changed = true;
    return { ...n, read: true };
  });
  return changed ? { ...data, notifications } : data;
}

// ---------------------------------------------------------------------------
// Данные из хранилища браузера.
// ---------------------------------------------------------------------------

/*
 * localStorage правят руками, другие версии сайта и расширения браузера, поэтому прочитанное
 * не доверяется: заказ без обязательных полей, битая версия или событие отбрасываются, а не
 * роняют страницу (`order.items.map` по null — это «Не удалось загрузить страницу» на весь ЛК).
 * Принцип: отбрасывается наименьшая битая часть — элемент списка, а не весь список.
 */

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isInt = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const stringOrNull = (value: unknown): string | null => (isString(value) ? value : null);
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  isString(value) && (allowed as readonly string[]).includes(value);

/** Элементы списка, прошедшие проверку; не массив — пустой список. */
function listOf<T>(value: unknown, read: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = read(item);
    return parsed === null ? [] : [parsed];
  });
}

const ATTR_STATUSES: readonly AttrStatus[] = ['confirmed', 'inferred', 'needs-review'];
const PRICE_TYPES: readonly PriceType[] = ['fixed', 'request'];
const BUYER_TYPES: readonly BuyerType[] = ['person', 'company'];
const QUOTE_STATUSES: readonly QuoteStatus[] = ['issued', 'annulled', 'paid'];
const EVENT_TYPES: readonly OrderEventType[] = [
  'created',
  'status',
  'quote-issued',
  'quote-annulled',
  'payment-confirmed',
  'payment-failed',
  'cancelled',
];

function readSpecPoint(raw: unknown): OrderSpecPoint | null {
  if (!isRecord(raw) || !isString(raw.text) || !oneOf(raw.status, ATTR_STATUSES)) return null;
  return isString(raw.note)
    ? { text: raw.text, status: raw.status, note: raw.note }
    : { text: raw.text, status: raw.status };
}

function readItem(raw: unknown): OrderItemSnapshot | null {
  if (!isRecord(raw)) return null;
  const { lineId, productId, slug, code, name, categoryId, priceType, unitPrice, quantity } = raw;
  if (
    !isString(lineId) ||
    !isString(productId) ||
    !isString(slug) ||
    !isString(code) ||
    !isString(name) ||
    !isString(categoryId) ||
    !oneOf(priceType, PRICE_TYPES) ||
    !(unitPrice === null || isInt(unitPrice, 0)) ||
    !isInt(quantity, 1, MAX_LINE_QUANTITY)
  ) {
    return null;
  }
  const item: OrderItemSnapshot = {
    lineId,
    productId,
    slug,
    code,
    name,
    categoryId,
    spec: listOf(raw.spec, readSpecPoint),
    priceType,
    unitPrice,
    quantity,
  };
  // Заказы, сохранённые до появления `spec`, — строка без статусов (см. orderItemSpec).
  if (isString(raw.specSummary)) item.specSummary = raw.specSummary;
  return item;
}

function readQuoteLine(raw: unknown): QuoteLine | null {
  if (!isRecord(raw)) return null;
  const { lineId, productId, code, name, quantity, unitPrice, lineTotal, origin } = raw;
  if (
    !isString(lineId) ||
    !isString(productId) ||
    !isString(code) ||
    !isString(name) ||
    !isInt(quantity, 1, MAX_LINE_QUANTITY) ||
    !isInt(unitPrice, 0) ||
    !isInt(lineTotal, 0) ||
    !oneOf(origin, ['request', 'added-by-manager'] as const)
  ) {
    return null;
  }
  return { lineId, productId, code, name, quantity, unitPrice, lineTotal, origin };
}

function readQuote(raw: unknown): QuoteVersion | null {
  if (!isRecord(raw)) return null;
  const { version, createdAt, itemsTotal, discount, delivery, total, status } = raw;
  if (
    !isInt(version, 1) ||
    !isString(createdAt) ||
    !isInt(itemsTotal, 0) ||
    !isInt(discount, 0) ||
    !isInt(delivery, 0) ||
    !isInt(total, Number.MIN_SAFE_INTEGER) ||
    !oneOf(status, QUOTE_STATUSES)
  ) {
    return null;
  }
  return {
    version,
    createdAt,
    lines: listOf(raw.lines, readQuoteLine),
    removedLineIds: listOf(raw.removedLineIds, (id) => (isString(id) ? id : null)),
    itemsTotal,
    discount,
    discountNote: isString(raw.discountNote) ? raw.discountNote : '',
    delivery,
    deliveryNote: isString(raw.deliveryNote) ? raw.deliveryNote : '',
    total,
    managerComment: isString(raw.managerComment) ? raw.managerComment : '',
    status,
    annulledAt: stringOrNull(raw.annulledAt),
    annulReason: stringOrNull(raw.annulReason),
    paidAt: stringOrNull(raw.paidAt),
  };
}

function readPayment(raw: unknown): PaymentAttempt | null {
  if (!isRecord(raw)) return null;
  const { id, version, amount, status, createdAt } = raw;
  if (
    !isString(id) ||
    !isInt(version, 1) ||
    !isInt(amount, 0) ||
    !oneOf(status, ['pending', 'confirmed', 'failed'] as const) ||
    !isString(createdAt)
  ) {
    return null;
  }
  return {
    id,
    version,
    amount,
    status,
    createdAt,
    resolvedAt: stringOrNull(raw.resolvedAt),
    failureReason: stringOrNull(raw.failureReason),
  };
}

function readEvent(raw: unknown): OrderEvent | null {
  if (!isRecord(raw)) return null;
  const { id, at, type, status, title } = raw;
  if (
    !isString(id) ||
    !isString(at) ||
    !oneOf(type, EVENT_TYPES) ||
    !oneOf(status, ORDER_STATUSES) ||
    !isString(title)
  ) {
    return null;
  }
  const notify = isRecord(raw.notify) ? raw.notify : {};
  return {
    id,
    at,
    type,
    status,
    title,
    notify: {
      buyerEmail: notify.buyerEmail === true,
      managerTelegram: notify.managerTelegram === true,
    },
  };
}

function readOrder(raw: unknown): DemoOrder | null {
  if (!isRecord(raw) || !isRecord(raw.buyer) || !isRecord(raw.preliminary)) return null;
  const { number, createdAt, idempotencyKey, status, buyer, preliminary } = raw;
  if (
    !isString(number) ||
    number === '' ||
    !isString(createdAt) ||
    !isString(idempotencyKey) ||
    !oneOf(status, ORDER_STATUSES) ||
    !oneOf(buyer.type, BUYER_TYPES) ||
    !isString(buyer.name) ||
    !isString(buyer.email) ||
    !isInt(preliminary.knownItemsTotal, 0) ||
    !isInt(preliminary.requestItemsCount, 0) ||
    !isInt(preliminary.discount, 0) ||
    !(preliminary.total === null || isInt(preliminary.total, Number.MIN_SAFE_INTEGER))
  ) {
    return null;
  }
  const quotes = listOf(raw.quotes, readQuote);
  const active = raw.activeVersion;
  const promo = raw.promo;
  return {
    number,
    createdAt,
    idempotencyKey,
    status,
    buyer: {
      type: buyer.type,
      name: buyer.name,
      // Доступ к заказу — по точному совпадению email (findOrder): храним нормализованным.
      email: normalizeEmail(buyer.email),
      phone: stringOrNull(buyer.phone),
      companyName: stringOrNull(buyer.companyName),
      inn: stringOrNull(buyer.inn),
      comment: stringOrNull(buyer.comment),
    },
    items: listOf(raw.items, readItem),
    promo:
      isRecord(promo) && isString(promo.code) && isInt(promo.percent, 0, 100)
        ? { code: promo.code, percent: promo.percent }
        : null,
    preliminary: {
      knownItemsTotal: preliminary.knownItemsTotal,
      requestItemsCount: preliminary.requestItemsCount,
      discount: preliminary.discount,
      total: preliminary.total,
    },
    quotes,
    // Ссылка на версию, которой нет (отброшена как битая), — «действующей версии нет».
    activeVersion:
      isInt(active, 1) && quotes.some((quote) => quote.version === active) ? active : null,
    payments: listOf(raw.payments, readPayment),
    events: listOf(raw.events, readEvent),
    cancelReason: stringOrNull(raw.cancelReason),
  };
}

function readNotification(raw: unknown): DemoNotification | null {
  if (!isRecord(raw)) return null;
  const { id, at, email, orderNumber, title, body } = raw;
  if (
    !isString(id) ||
    !isString(at) ||
    !isString(email) ||
    !isString(orderNumber) ||
    !isString(title) ||
    !isString(body)
  ) {
    return null;
  }
  return {
    id,
    at,
    email: normalizeEmail(email),
    orderNumber,
    title,
    body,
    read: raw.read === true,
  };
}

/**
 * Данные демо-заказов из localStorage в форме `DemoOrdersData`. Не объект — пустые данные; битые
 * заказы и уведомления отбрасываются, повторный номер — тоже (оставляется первый). Счётчик
 * номеров не меньше уже выданных: новая заявка не получит номер существующего заказа.
 */
export function sanitizeOrdersData(raw: unknown): DemoOrdersData {
  if (!isRecord(raw)) return emptyOrdersData();
  const seen = new Set<string>();
  const orders = listOf(raw.orders, readOrder).filter((order) => {
    if (seen.has(order.number)) return false;
    seen.add(order.number);
    return true;
  });
  const prefix = site.demo.orderNumberPrefix;
  const issued = orders.reduce((max, order) => {
    const tail = order.number.startsWith(prefix) ? order.number.slice(prefix.length) : '';
    return /^\d+$/.test(tail) ? Math.max(max, Number(tail)) : max;
  }, 0);
  return {
    seq: Math.max(isInt(raw.seq, 0) ? raw.seq : 0, issued),
    orders,
    notifications: listOf(raw.notifications, readNotification),
  };
}

// ---------------------------------------------------------------------------
// Показ данных покупателя.
// ---------------------------------------------------------------------------

/**
 * Телефон для показа. Хранится без маски (`normalizePhone`: цифры и ведущий «+»); российский
 * номер показывается группами: «+79001234567» → «+7 900 123-45-67», «89001234567» →
 * «8 900 123-45-67» (неразрывные пробелы — номер не переносится). Остальное — как сохранено.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const international = phone.trim().startsWith('+');
  const match = /^([78])(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits);
  if (match === null || (international && match[1] !== '7')) return phone;
  const [, country, area, first, second, third] = match;
  const head = international || country === '7' ? '+7' : '8';
  return `${head}${NBSP}${area}${NBSP}${first}-${second}-${third}`;
}
