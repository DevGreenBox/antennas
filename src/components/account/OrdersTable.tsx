'use client';

import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { paymentHref } from '@/lib/demo-orders';
import { formatDateShort } from '@/lib/format';
import type { DemoOrder } from '@/types/order';

import { orderAmountText } from './order-display';

/**
 * Заявки и заказы (DESIGN §2.13, §5.9.30): ≥ md — таблица, < md — карточки с теми же полями.
 * Новые сверху (порядок задаёт `ordersForEmail`). У «Ожидает оплаты» действие — «Оплатить».
 */

const TH =
  'py-2.5 px-3 text-left font-medium text-ink-muted whitespace-nowrap border-b border-line';

function orderHref(order: DemoOrder) {
  return `/account/orders/${encodeURIComponent(order.number)}`;
}

function OrderAction({
  order,
  size,
  ghostClassName,
}: {
  order: DemoOrder;
  size: 'sm' | 'md';
  /** Классы ghost-кнопки «Открыть» (у «Оплатить» есть рамка — её край и так по контенту). */
  ghostClassName?: string;
}) {
  if (order.status === 'awaiting-payment' && order.activeVersion !== null) {
    return (
      <ButtonLink
        href={paymentHref(order.number, order.activeVersion)}
        variant="secondary"
        size={size}
      >
        Оплатить<span className="sr-only"> заказ {order.number}</span>
      </ButtonLink>
    );
  }
  return (
    <ButtonLink href={orderHref(order)} variant="ghost" size={size} className={ghostClassName}>
      Открыть<span className="sr-only"> заказ {order.number}</span>
    </ButtonLink>
  );
}

export function OrdersTable({ orders }: { orders: readonly DemoOrder[] }) {
  return (
    <>
      <table className="hidden w-full text-small md:table">
        <caption className="sr-only">Заявки и заказы</caption>
        <thead>
          <tr>
            <th scope="col" className={`${TH} pl-0`}>
              №
            </th>
            <th scope="col" className={TH}>
              Дата
            </th>
            <th scope="col" className={TH}>
              Статус
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Сумма
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              <span className="sr-only">Действие</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.number} className="border-b border-line-subtle">
              <td className="py-3 pr-3 pl-0 align-middle">
                <Link
                  href={orderHref(order)}
                  className="font-mono text-body font-medium text-ink hover:underline"
                >
                  {order.number}
                </Link>
              </td>
              <td className="px-3 py-3 align-middle whitespace-nowrap text-ink-secondary">
                <time dateTime={order.createdAt}>{formatDateShort(order.createdAt)}</time>
              </td>
              <td className="px-3 py-3 align-middle">
                <StatusBadge status={order.status} />
              </td>
              <td className="px-3 py-3 text-right align-middle whitespace-nowrap tabular-nums text-ink">
                {orderAmountText(order)}
              </td>
              <td className="py-3 pr-0 pl-3 text-right align-middle">
                <OrderAction order={order} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="border-t border-line-subtle md:hidden">
        {orders.map((order) => (
          <li key={order.number} className="flex flex-col gap-2 border-b border-line-subtle py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={orderHref(order)}
                className="font-mono text-body font-medium text-ink hover:underline"
              >
                {order.number}
              </Link>
              <StatusBadge status={order.status} />
            </div>
            <p className="flex flex-wrap justify-between gap-x-3 text-small text-ink-secondary">
              <time dateTime={order.createdAt}>{formatDateShort(order.createdAt)}</time>
              <span className="tabular-nums text-ink">{orderAmountText(order)}</span>
            </p>
            <div>
              {/* -ml-4 у ghost «Открыть»: текст по левому краю карточки, как номер и дата. */}
              <OrderAction order={order} size="md" ghostClassName="-ml-4" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
