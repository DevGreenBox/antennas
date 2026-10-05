'use client';

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { site } from '@/config/site';
import {
  advanceOrder,
  cancelOrder,
  confirmPayment,
  createOrder,
  declinePayment,
  emptyOrdersData,
  findOrder,
  issueQuote,
  markNotificationsRead,
  notificationsForEmail,
  ordersForEmail,
  reopenQuote,
  sanitizeOrdersData,
  startNegotiation,
  startPayment,
  systemContext,
  unreadCount,
} from '@/lib/demo-orders';
import type {
  AdvanceStatus,
  CreateOrderInput,
  CreateOrderResult,
  OrderOpResult,
  PaymentConfirmResult,
  PaymentDeclineResult,
  StartPaymentResult,
} from '@/lib/demo-orders';
import type { QuoteDraft } from '@/lib/demo-pricing';
import type { DemoNotification, DemoOrder, DemoOrdersData } from '@/types/order';

import { useCart } from './cart';
import {
  clearProfiles,
  currentSessionEmail,
  rememberSubmittedOrder,
  saveBuyerProfile,
  useSessionEmail,
  useSessionHydrated,
} from './session';
import { refresh, safePersistOptions, syncAcrossTabs, usePersistHydrated } from './storage';

/**
 * Хранилище демо-заказов (ключ `site.storageKeys.demoOrders`) и действия над ними. Вся логика —
 * в `src/lib/demo-orders.ts`; здесь только чтение свежих данных (другие вкладки), запись и
 * привязка к демо-сессии. Компоненты статус напрямую не меняют.
 *
 * Чтение (только заказы email текущей сессии — чужие не видны):
 *   const { ready, email, orders } = useMyOrders();
 *   const { ready, order } = useMyOrder(number);      // order === null → «Заказ не найден»
 *   const { ready, notifications, unread } = useMyNotifications();
 * Заявка:
 *   const result = await submitOrder(input);           // идемпотентно по input.idempotencyKey
 * Демо-панель менеджера и оплата (email берётся из сессии):
 *   demoManager.takeIntoWork(number); demoManager.issueQuote(number, draft); …
 *   startPayment(number, version); confirmPayment(number, attemptId); declinePayment(…)
 */

export const useDemoOrdersStore = create<DemoOrdersData>()(
  persist(
    () => emptyOrdersData(),
    // `orders: null`, заказ без полей, битая версия — отбрасываются при чтении (ядро).
    safePersistOptions<DemoOrdersData, DemoOrdersData>({
      name: site.storageKeys.demoOrders,
      initial: emptyOrdersData,
      sanitize: sanitizeOrdersData,
    }),
  ),
);

syncAcrossTabs(site.storageKeys.demoOrders, useDemoOrdersStore);

/** Прочитаны и заказы, и сессия — можно решать «пусто / не найдено / охрана ЛК». */
export function useDemoOrdersHydrated(): boolean {
  const orders = usePersistHydrated(useDemoOrdersStore);
  const session = useSessionHydrated();
  return orders && session;
}

/** Свежие данные (из localStorage — другая вкладка могла записать только что). */
function freshData(): DemoOrdersData {
  refresh(useDemoOrdersStore);
  const { seq, orders, notifications } = useDemoOrdersStore.getState();
  return { seq, orders, notifications };
}

function save(data: DemoOrdersData): void {
  useDemoOrdersStore.setState({
    seq: data.seq,
    orders: data.orders,
    notifications: data.notifications,
  });
}

const NO_SESSION = {
  ok: false,
  error: 'not-found',
  message: 'Заказ не найден',
} as const satisfies OrderOpResult;

// ---------------------------------------------------------------------------
// Чтение.
// ---------------------------------------------------------------------------

export interface MyOrders {
  /** Хранилища прочитаны — можно решать «пусто / не найдено / охрана». */
  ready: boolean;
  email: string | null;
  orders: DemoOrder[];
}

/** Заказы текущей сессии, новые сверху. */
export function useMyOrders(): MyOrders {
  const email = useSessionEmail();
  const orders = useDemoOrdersStore((state) => state.orders);
  const ready = useDemoOrdersHydrated();
  return useMemo(
    () => ({ ready, email, orders: ordersForEmail({ seq: 0, orders, notifications: [] }, email) }),
    [ready, email, orders],
  );
}

/** Заказ по номеру — только если он оформлен на email сессии; иначе null. */
export function useMyOrder(number: string): {
  ready: boolean;
  email: string | null;
  order: DemoOrder | null;
} {
  const email = useSessionEmail();
  const orders = useDemoOrdersStore((state) => state.orders);
  const ready = useDemoOrdersHydrated();
  return useMemo(
    () => ({
      ready,
      email,
      order: findOrder({ seq: 0, orders, notifications: [] }, number, email),
    }),
    [ready, email, orders, number],
  );
}

export function useMyNotifications(): {
  ready: boolean;
  notifications: DemoNotification[];
  unread: number;
} {
  const email = useSessionEmail();
  const notifications = useDemoOrdersStore((state) => state.notifications);
  const ready = useDemoOrdersHydrated();
  return useMemo(() => {
    const data = { seq: 0, orders: [], notifications };
    return {
      ready,
      notifications: notificationsForEmail(data, email),
      unread: unreadCount(data, email),
    };
  }, [ready, email, notifications]);
}

/** Непрочитанные уведомления сессии — счётчик в AccountNav (в шапке не показывается, §3.10). */
export function useUnreadNotificationsCount(): number {
  const email = useSessionEmail();
  return useDemoOrdersStore((state) =>
    unreadCount({ seq: 0, orders: [], notifications: state.notifications }, email),
  );
}

// ---------------------------------------------------------------------------
// Заявка.
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<CreateOrderResult>>();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * «Отправить заявку»: имитация сети (`site.demo.submitDelayMs`), создание заказа, отметка «заявку
 * отправили из этой вкладки» (страница успеха покажет ей подробности без входа), очистка корзины
 * и промокода, сохранение данных покупателя в профиль email. Повторный вызов с тем же ключом —
 * во время отправки или после — возвращает тот же заказ (`created: false`), второй не создаётся.
 * Строки — позиции корзины с товарами из каталога (`product: null` — недоступна → ошибка).
 */
export function submitOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const pending = inFlight.get(input.idempotencyKey);
  if (pending !== undefined) return pending;
  const run = (async () => {
    await wait(site.demo.submitDelayMs);
    const result = createOrder(freshData(), input, systemContext());
    if (result.ok) {
      if (result.created) save(result.data);
      // Страница «Заявка отправлена» покажет подробности этой вкладке и без входа.
      rememberSubmittedOrder(result.order.number);
      useCart.getState().clear();
      const { buyer } = result.order;
      saveBuyerProfile(buyer.email, {
        name: buyer.name,
        phone: buyer.phone,
        buyerType: buyer.type,
        companyName: buyer.companyName,
        inn: buyer.inn,
      });
    }
    return result;
  })();
  inFlight.set(input.idempotencyKey, run);
  void run.finally(() => inFlight.delete(input.idempotencyKey));
  return run;
}

// ---------------------------------------------------------------------------
// Демо-панель менеджера (§3.9) — действует от email текущей сессии.
// ---------------------------------------------------------------------------

function withOrder(
  number: string,
  op: (data: DemoOrdersData, ref: { number: string; email: string }) => OrderOpResult,
): OrderOpResult {
  const email = currentSessionEmail();
  if (email === null) return NO_SESSION;
  const result = op(freshData(), { number, email });
  if (result.ok) save(result.data);
  return result;
}

export const demoManager = {
  /** «Взять в работу»: received → negotiation. */
  takeIntoWork: (number: string) =>
    withOrder(number, (data, ref) => startNegotiation(data, ref, systemContext())),
  /** «Выставить к оплате»: новая версия и ссылка оплаты. Ошибки формы — `quoteErrors`. */
  issueQuote: (number: string, draft: QuoteDraft) =>
    withOrder(number, (data, ref) => issueQuote(data, ref, draft, systemContext())),
  /** «Изменить сумму»: действующая версия и её ссылка аннулируются. */
  reopenQuote: (number: string) =>
    withOrder(number, (data, ref) => reopenQuote(data, ref, systemContext())),
  /** «Передать в обработку» / «Отметить отправку» / «Завершить заказ». */
  advance: (number: string, to: AdvanceStatus) =>
    withOrder(number, (data, ref) => advanceOrder(data, ref, to, systemContext())),
  /** «Отменить заказ» с причиной. */
  cancel: (number: string, reason: string) =>
    withOrder(number, (data, ref) => cancelOrder(data, ref, reason, systemContext())),
};

// ---------------------------------------------------------------------------
// Оплата (демо-провайдер, §3.7).
// ---------------------------------------------------------------------------

/** «Оплатить {сумма}»: попытка pending (существующая не дублируется). */
export function startOrderPayment(number: string, version: number): StartPaymentResult {
  const email = currentSessionEmail();
  if (email === null) return NO_SESSION;
  const result = startPayment(freshData(), { number, email }, version, systemContext());
  if (result.ok && result.created) save(result.data);
  return result;
}

/** «Провайдер подтвердил оплату». Повтор ничего не меняет (`already-paid` / `not-pending`). */
export function confirmOrderPayment(number: string, attemptId: string): PaymentConfirmResult {
  const email = currentSessionEmail();
  const data = freshData();
  if (email === null) return { code: 'not-found', message: 'Заказ не найден', data, order: null };
  const result = confirmPayment(data, { number, email }, attemptId, systemContext());
  if (result.data !== data) save(result.data);
  return result;
}

/** «Провайдер отказал»: попытка failed, статус прежний. */
export function declineOrderPayment(number: string, attemptId: string): PaymentDeclineResult {
  const email = currentSessionEmail();
  if (email === null) return { ok: false, code: 'not-found', message: 'Заказ не найден' };
  const result = declinePayment(freshData(), { number, email }, attemptId, systemContext());
  if (result.ok) save(result.data);
  return result;
}

// ---------------------------------------------------------------------------
// Уведомления и сброс.
// ---------------------------------------------------------------------------

/** Отметить прочитанными: все, по id или по номеру заказа (переход по ссылке «Заказ {№}»). */
export function markMyNotificationsRead(
  filter: { ids?: string[]; orderNumber?: string } = {},
): void {
  const email = currentSessionEmail();
  if (email === null) return;
  const data = freshData();
  const next = markNotificationsRead(data, email, filter);
  if (next !== data) save(next);
}

/**
 * «Сбросить демо-данные» (§6.6): удаляются все демо-заказы, уведомления и профили в этом
 * браузере. Корзина, избранное и текущая сессия остаются.
 */
export function resetDemoData(): void {
  save(emptyOrdersData());
  clearProfiles();
}
