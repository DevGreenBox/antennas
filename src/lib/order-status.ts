/**
 * Статусы демо-заказа: подписи, описания, тона бейджей и таблица допустимых переходов
 * (docs/DESIGN.md §3.1, §3.2). Любой переход, которого нет в таблице, запрещён: кнопка не
 * рендерится, а операция в `demo-orders.ts` возвращает ошибку и ничего не меняет.
 *
 * Чистый «стираемый» TypeScript — модуль подключают юнит-тесты в Node.
 *
 * Пример: `<Badge tone={ORDER_STATUS_TONES[s]} dot>{ORDER_STATUS_LABELS[s]}</Badge>`
 * (готовый компонент — `StatusBadge` из `src/components/ui/Badge.tsx`).
 */

import type { BadgeTone } from '@/components/ui/Badge';
import type { OrderStatus, QuoteStatus } from '@/types/order';

/** Все статусы в порядке «счастливого пути», отмена — последней. */
export const ORDER_STATUSES: readonly OrderStatus[] = [
  'received',
  'negotiation',
  'awaiting-payment',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled',
];

/** Путь для таймлайна (§3.1): без отмены. */
export const HAPPY_PATH: readonly OrderStatus[] = [
  'received',
  'negotiation',
  'awaiting-payment',
  'paid',
  'processing',
  'shipped',
  'completed',
];

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  received: 'Заявка получена',
  negotiation: 'Согласование',
  'awaiting-payment': 'Ожидает оплаты',
  paid: 'Оплачен',
  processing: 'В обработке',
  shipped: 'Отправлен',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

/** Описание для покупателя (таймлайн, текущий шаг). У «Отменён» причина дописывается отдельно. */
export const ORDER_STATUS_DESCRIPTIONS: Readonly<Record<OrderStatus, string>> = {
  received: 'Менеджер получил заявку и свяжется с вами для согласования.',
  negotiation:
    'Менеджер уточняет состав, цены и доставку. Оплата станет доступна после согласования.',
  'awaiting-payment': 'Заказ согласован. Проверьте состав и сумму и оплатите заказ.',
  paid: 'Оплата подтверждена. Скоро заказ передадут в обработку.',
  processing: 'Заказ комплектуют и готовят к отправке.',
  shipped: 'Заказ передан в доставку.',
  completed: 'Заказ выполнен.',
  cancelled: 'Заказ отменён.',
};

/** Тон StatusBadge (§3.1). */
export const ORDER_STATUS_TONES: Readonly<Record<OrderStatus, BadgeTone>> = {
  received: 'neutral',
  negotiation: 'info',
  'awaiting-payment': 'brand',
  paid: 'success',
  processing: 'info',
  shipped: 'info',
  completed: 'neutral',
  // Отмена — состояние, а не ошибка: красный только для настоящих ошибок (DESIGN § R.2).
  cancelled: 'neutral',
};

/** Допустимые переходы (§3.2). Создание заказа (→ received) — отдельная операция. */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  received: ['negotiation', 'cancelled'],
  negotiation: ['awaiting-payment', 'cancelled'],
  // → negotiation — «Изменить сумму»: действующая версия аннулируется.
  'awaiting-payment': ['paid', 'negotiation', 'cancelled'],
  // paid → cancelled в демо нет: отмена оплаченного — возврат денег, процедура Admik.
  paid: ['processing'],
  processing: ['shipped'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

const PAID_OR_LATER: ReadonlySet<OrderStatus> = new Set([
  'paid',
  'processing',
  'shipped',
  'completed',
]);

/** Оплачен или дальше: заказ не редактируется, повторная оплата не нужна. */
export function isPaidOrLater(status: OrderStatus): boolean {
  return PAID_OR_LATER.has(status);
}

/** Закрыт: действий в демо-панели нет. */
export function isClosed(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/** До согласования: суммы предварительные, состав — снимок заявки. */
export function isBeforeQuote(status: OrderStatus): boolean {
  return status === 'received' || status === 'negotiation';
}

/** Бейдж версии согласования (§5.9.30). */
export const QUOTE_STATUS_LABELS: Readonly<Record<QuoteStatus, string>> = {
  issued: 'Действует',
  paid: 'Оплачена',
  annulled: 'Аннулирована',
};

export const QUOTE_STATUS_TONES: Readonly<Record<QuoteStatus, BadgeTone>> = {
  issued: 'info',
  paid: 'success',
  annulled: 'neutral',
};

/** Причины отмены в демо-панели (§3.9); «Другое» требует уточнения. */
export const CANCEL_REASONS = [
  'По просьбе покупателя',
  'Нет возможности поставить',
  'Другое',
] as const;
