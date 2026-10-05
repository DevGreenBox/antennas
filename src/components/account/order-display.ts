/**
 * Подписи заказа для списков ЛК (DESIGN §2.13). Суммы не считаются — берутся из
 * `orderAmount()` ядра демо-заказов, здесь только выбор формулировки.
 */

import { formatPrice } from '@/lib/catalog';
import { orderAmount } from '@/lib/demo-orders';
import type { DemoOrder } from '@/types/order';

/**
 * «Сумма» в таблице заказов: до согласования — «{сумма} предварительно» или «Уточняется»
 * (есть позиции «по запросу»); после — итог действующей (или оплаченной) версии. Пока версия
 * аннулирована и новой нет — снова «Уточняется»; у отменённого заказа суммы нет.
 */
export function orderAmountText(order: DemoOrder): string {
  if (order.status === 'cancelled') return '—';
  const amount = orderAmount(order);
  switch (amount.kind) {
    case 'quote':
      return order.activeVersion === null ? 'Уточняется' : formatPrice(amount.total);
    case 'preliminary':
      return `${formatPrice(amount.total)} предварительно`;
    case 'pending':
      return 'Уточняется';
  }
}
