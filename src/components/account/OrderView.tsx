'use client';

import type { ReactNode } from 'react';

import { OrderSummary, PreliminaryBreakdown, QuoteBreakdown } from '@/components/cart/OrderSummary';
import type { ClientCategory } from '@/components/cart/catalog-data';
import { useProductsById } from '@/components/cart/cart-model';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { DemoNotice } from '@/components/ui/Notice';
import { Skeleton, SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { site } from '@/config/site';
import { displayedQuote, formatPhone } from '@/lib/demo-orders';
import { preliminaryTotals } from '@/lib/demo-pricing';
import { formatDateFull } from '@/lib/format';
import { isPaidOrLater } from '@/lib/order-status';
import { useMyOrder } from '@/lib/store/orders';
import type { Product } from '@/types/catalog';
import type { DemoOrder } from '@/types/order';

import { DemoManagerPanel } from './DemoManagerPanel';
import { OrderItemsTable } from './OrderItemsTable';
import { QuoteVersions } from './QuoteVersions';
import { StatusCallout } from './StatusCallout';
import { StatusTimeline } from './StatusTimeline';
import { useAccountGuard } from './useAccountGuard';

/**
 * Заказ в ЛК (DESIGN §2.14, §3.8). Чужой заказ (другой email) и несуществующий номер дают
 * одинаковый ответ «Заказ не найден» — существование чужого заказа не раскрывается
 * (`useMyOrder` ищет только среди заказов email сессии).
 *
 * На < lg порядок: заголовок → сообщение о статусе → таймлайн → состав → сводка → версии →
 * данные заявки → документы → демо-панель; на ≥ lg таймлайн — в правой колонке.
 *
 * Все блоки основной колонки — одной ширины (на всю колонку): разная ширина (таблица на всю,
 * сводка и данные заявки в max-w-xl, панель снова на всю) давала «скачущий» правый край.
 * Ограничена только ширина строк текста (`max-w-text`).
 */
export function OrderView({
  number,
  products,
  categories,
}: {
  number: string;
  products: readonly Product[];
  categories: readonly ClientCategory[];
}) {
  const guard = useAccountGuard(`/account/orders/${encodeURIComponent(number)}`);
  const { order } = useMyOrder(number);
  const productsById = useProductsById(products);

  if (!guard.ready) return <OrderSkeleton number={number} />;
  if (order === null) return <OrderNotFound />;

  const quote = displayedQuote(order);
  const { telegram } = site.contacts;

  return (
    <>
      <PageHeader
        title={`Заказ ${order.number}`}
        titleAddon={<StatusBadge status={order.status} />}
        meta={`Оформлен ${formatDateFull(order.createdAt)}`}
      />
      <div data-print="hidden">
        <StorageNotice className="mb-4" />
        <DemoNotice className="mb-4">
          Демо: статусы меняются кнопками в блоке «Действия менеджера (демонстрация)».{' '}
          <a href="#manager-demo" className="text-link">
            Перейти к действиям менеджера
          </a>
        </DemoNotice>
      </div>
      <StatusCallout order={order} className="mb-8 lg:mb-10" />

      <div className="grid gap-10 lg:grid-cols-golden-reverse lg:gap-8 xl:gap-12">
        <aside aria-labelledby="order-status" className="lg:col-start-2 lg:row-start-1">
          <h2 id="order-status" className="mb-4">
            Статус
          </h2>
          <StatusTimeline order={order} />
          <p className="mt-6 text-small text-ink-secondary" data-print="hidden">
            Чтобы изменить или отменить заявку, напишите менеджеру в Telegram{' '}
            <a href={telegram.url} target="_blank" rel="noopener noreferrer" className="text-link">
              {telegram.handle}
              <span className="sr-only"> (откроется в новой вкладке)</span>
            </a>
            .
          </p>
        </aside>

        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-1 lg:gap-12">
          <section aria-labelledby="order-items">
            <h2 id="order-items">Состав заказа</h2>
            <p className="mt-1 mb-4 text-small text-ink-muted">
              {quote === null
                ? 'Цены — на момент заявки'
                : `Цены — по согласованию, версия ${quote.version}`}
            </p>
            <OrderItemsTable order={order} productsById={productsById} />
          </section>

          {quote === null ? (
            <OrderSummary title="Предварительный расчёт">
              <PreliminaryBreakdown totals={preliminaryTotals(order.items, order.promo)} />
              {order.promo ? (
                <p className="mt-3 text-caption text-ink-muted">
                  Промокод {order.promo.code} (демо): скидка предварительная, окончательную сумму
                  фиксирует согласование.
                </p>
              ) : null}
            </OrderSummary>
          ) : (
            <OrderSummary title="Расчёт по согласованию">
              <QuoteBreakdown quote={quote} paid={isPaidOrLater(order.status)} />
            </OrderSummary>
          )}

          {order.quotes.length > 0 ? (
            <section aria-labelledby="order-quotes">
              <h2 id="order-quotes" className="mb-4">
                Версии согласования
              </h2>
              <QuoteVersions order={order} />
            </section>
          ) : null}

          <BuyerDetails order={order} />

          <section aria-labelledby="order-docs">
            <h2 id="order-docs" className="mb-4">
              Документы
            </h2>
            <p className="max-w-text text-small text-ink-secondary">
              Счёт и документы по заказу появятся здесь после подключения рабочей системы. В демо
              документы не формируются.
            </p>
            <div className="mt-4 flex flex-wrap items-start gap-3 rounded-md border border-line p-4">
              <Icon name="file-text" size={24} className="mt-0.5 text-ink-muted" />
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-body font-medium text-ink">Сводка заказа {order.number}</p>
                <p className="mt-0.5 text-caption text-ink-muted">
                  Внутренний документ для демонстрации. Сводка — не счёт и не накладная.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon="printer"
                data-print="hidden"
                onClick={() => window.print()}
              >
                Распечатать сводку
              </Button>
            </div>
          </section>

          <DemoManagerPanel order={order} products={products} categories={categories} />
        </div>
      </div>
    </>
  );
}

/** Данные из заявки: кто и как просил связаться (снимок на момент отправки). */
function BuyerDetails({ order }: { order: DemoOrder }) {
  const { buyer } = order;
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Покупатель', value: buyer.type === 'company' ? 'Организация' : 'Частное лицо' },
    ...(buyer.type === 'company'
      ? [
          { label: 'Организация', value: buyer.companyName },
          { label: 'ИНН', value: buyer.inn },
        ]
      : []),
    { label: 'Имя', value: buyer.name },
    { label: 'Email', value: buyer.email },
    { label: 'Телефон', value: buyer.phone === null ? null : formatPhone(buyer.phone) },
    { label: 'Комментарий', value: buyer.comment },
  ];
  return (
    <section aria-labelledby="order-buyer">
      <h2 id="order-buyer" className="mb-4">
        Данные заявки
      </h2>
      <dl className="grid gap-x-6 sm:grid-cols-[9rem_minmax(0,1fr)]">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid border-b border-line-subtle py-2 sm:col-span-2 sm:grid-cols-subgrid"
          >
            <dt className="text-small text-ink-secondary">{row.label}</dt>
            <dd className="text-small break-words text-ink">
              {row.value === null || row.value === '' ? (
                <span className="text-ink-muted">
                  <span aria-hidden>—</span>
                  <span className="sr-only">не указано</span>
                </span>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function OrderNotFound() {
  return (
    <EmptyState
      headingLevel="h1"
      title="Заказ не найден"
      actions={
        <ButtonLink href="/account" variant="primary" size="md">
          Все заказы
        </ButtonLink>
      }
    >
      Проверьте номер или войдите под email, на который оформлена заявка.
    </EmptyState>
  );
}

export function OrderSkeleton({ number }: { number: string }) {
  return (
    <>
      <PageHeader title={`Заказ ${number}`} />
      <div className="grid gap-10 lg:grid-cols-golden-reverse lg:gap-8 xl:gap-12">
        <SkeletonRows rows={3} />
        <SkeletonGroup className="hidden lg:block">
          <Skeleton className="h-64 w-full rounded-md" />
        </SkeletonGroup>
      </div>
    </>
  );
}
