'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';

import type { ClientCategory } from '@/components/cart/catalog-data';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { DemoNotice, Notice } from '@/components/ui/Notice';
import { formatPrice } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { activeQuote, managerMessage, paymentHref } from '@/lib/demo-orders';
import type { OrderOpResult } from '@/lib/demo-orders';
import { formatDateFull } from '@/lib/format';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import { demoManager } from '@/lib/store/orders';
import type { Product } from '@/types/catalog';
import type { DemoOrder } from '@/types/order';

import { CancelOrderDialog } from './CancelOrderDialog';
import { QuoteForm } from './QuoteForm';

/**
 * Демо-панель «Действия менеджера (демонстрация)» (DESIGN §3.9). В рабочей версии всё это
 * делает менеджер в Admik; здесь кнопки нужны, чтобы проиграть сценарий целиком. Набор действий
 * — строго по статусу (таблица переходов §3.2); каждое действие идёт через `demoManager`
 * (ядро `demo-orders.ts`), панель статус напрямую не меняет.
 *
 * Двойной клик не проходит два статуса: после смены статуса на месте нажатой кнопки появляется
 * кнопка следующего шага («Передать в обработку» → «Отметить отправку»), и второй клик попадал
 * в неё. Поэтому второй клик серии (`event.detail > 1`) и любые нажатия в первые
 * `ACTION_LOCK_MS` после нажатия, запустившего действие, игнорируются.
 */
const ACTION_LOCK_MS = 400;

export function DemoManagerPanel({
  order,
  products,
  categories,
}: {
  order: DemoOrder;
  products: readonly Product[];
  categories: readonly ClientCategory[];
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  // Время последнего нажатия, запустившего действие (event.timeStamp), — для блокировки повтора.
  const lastActionAt = useRef(Number.NEGATIVE_INFINITY);
  const active = activeQuote(order);

  /** Нажатие кнопки панели с защитой от двойного клика (см. ACTION_LOCK_MS). */
  const guarded = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    if (event.detail > 1) return;
    if (event.timeStamp - lastActionAt.current < ACTION_LOCK_MS) return;
    lastActionAt.current = event.timeStamp;
    action();
  };

  /** Результат действия: ошибка — в Notice; успех — объявление и фокус в начало панели. */
  const handle = (result: OrderOpResult) => {
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setError(null);
    setAnnouncement(`Статус заказа: ${ORDER_STATUS_LABELS[result.order.status]}`);
    // Нажатая кнопка исчезает вместе со статусом — фокус не должен потеряться.
    requestAnimationFrame(() => bodyRef.current?.focus());
    return true;
  };

  /** «Отменить заказ»; `edge` — кнопка первая в ряду: текст по краю контента (-ml-4). */
  const cancelButton = (edge = false) => (
    <Button
      variant="ghost"
      tone="danger"
      size="md"
      className={cn('max-lg:h-11', edge && '-ml-4')}
      onClick={(event) => guarded(event, () => setCancelOpen(true))}
    >
      Отменить заказ
    </Button>
  );

  let content;
  switch (order.status) {
    case 'received':
      content = (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="md"
            className="max-lg:h-11"
            onClick={(event) =>
              guarded(event, () => handle(demoManager.takeIntoWork(order.number)))
            }
          >
            Взять в работу
          </Button>
          {cancelButton()}
        </div>
      );
      break;
    case 'negotiation':
      content = (
        <div className="flex flex-col gap-6">
          <QuoteForm
            key={order.quotes.length}
            order={order}
            products={products}
            categories={categories}
            onIssue={(draft) => {
              const result = demoManager.issueQuote(order.number, draft);
              if (result.ok) {
                handle(result);
                return null;
              }
              if (result.quoteErrors) return result.quoteErrors;
              setError(result.message);
              return null;
            }}
          />
          <div className="border-t border-line-subtle pt-4">{cancelButton(true)}</div>
        </div>
      );
      break;
    case 'awaiting-payment':
      content = (
        <div className="flex flex-col gap-4">
          {active ? (
            <p className="text-body text-ink">
              Выставлено к оплате:{' '}
              <strong className="font-semibold">{formatPrice(active.total)}</strong>{' '}
              <span className="text-ink-secondary">(версия согласования {active.version})</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="md"
              className="max-lg:h-11"
              onClick={(event) => guarded(event, () => setReopenOpen(true))}
            >
              Изменить сумму
            </Button>
            {cancelButton()}
          </div>
          <p className="text-small text-ink-secondary">
            Оплата — на странице оплаты покупателя: там же кнопки ответа провайдера.{' '}
            {active ? (
              <Link href={paymentHref(order.number, active.version)} className="text-link">
                Открыть страницу оплаты
              </Link>
            ) : null}
          </p>
        </div>
      );
      break;
    case 'paid':
      content = (
        <div className="flex flex-col gap-3">
          <div>
            <Button
              variant="primary"
              size="md"
              className="max-lg:h-11"
              onClick={(event) =>
                guarded(event, () => handle(demoManager.advance(order.number, 'processing')))
              }
            >
              Передать в обработку
            </Button>
          </div>
          <p className="text-small text-ink-secondary">
            Оплаченный заказ не редактируется. Корректировки — через возврат или доплату в рабочей
            системе.
          </p>
        </div>
      );
      break;
    case 'processing':
      content = (
        <Button
          variant="primary"
          size="md"
          className="max-lg:h-11"
          onClick={(event) =>
            guarded(event, () => handle(demoManager.advance(order.number, 'shipped')))
          }
        >
          Отметить отправку
        </Button>
      );
      break;
    case 'shipped':
      content = (
        <Button
          variant="primary"
          size="md"
          className="max-lg:h-11"
          onClick={(event) =>
            guarded(event, () => handle(demoManager.advance(order.number, 'completed')))
          }
        >
          Завершить заказ
        </Button>
      );
      break;
    default:
      content = <p className="text-body text-ink-secondary">Заказ закрыт. Действий нет.</p>;
  }

  return (
    // Панель — не часть сводки заказа: при печати скрыта.
    <div data-print="hidden">
      <DemoNotice
        variant="panel"
        id="manager-demo"
        title="Действия менеджера (демонстрация)"
        className="scroll-mt-4"
      >
        <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-5 outline-none">
          <p className="text-small text-ink-secondary">
            В рабочей версии эти действия выполняет менеджер в Admik. Здесь они нужны, чтобы
            показать сценарий целиком. Привязка заказа к покупателю в демо — по email автоматически.
          </p>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          {error ? (
            <Notice tone="danger" live>
              {error}
            </Notice>
          ) : null}
          {content}
          <EventLog order={order} />
        </div>

        <CancelOrderDialog
          open={cancelOpen}
          number={order.number}
          onClose={() => setCancelOpen(false)}
          onConfirm={(reason) => handle(demoManager.cancel(order.number, reason))}
        />
        <ConfirmDialog
          open={reopenOpen}
          onClose={() => setReopenOpen(false)}
          title="Изменить сумму заказа?"
          confirmLabel="Изменить сумму"
          confirmVariant="primary"
          onConfirm={() => {
            setReopenOpen(false);
            handle(demoManager.reopenQuote(order.number));
          }}
        >
          Версия согласования {active?.version ?? ''} будет аннулирована, ссылка на оплату
          перестанет действовать. Заказ вернётся на согласование, после правок его нужно выставить к
          оплате заново.
        </ConfirmDialog>
      </DemoNotice>
    </div>
  );
}

/** Журнал событий (демо): что в рабочей версии ушло бы покупателю и менеджеру. */
function EventLog({ order }: { order: DemoOrder }) {
  return (
    <details className="group border-t border-line-subtle pt-1 lg:pt-4">
      <summary className="cursor-pointer py-3 text-small font-medium text-ink lg:py-0">
        Журнал событий ({order.events.length})
      </summary>
      <ol className="mt-3 flex flex-col gap-3">
        {order.events.map((event) => {
          const telegram = managerMessage(order, event);
          return (
            <li key={event.id} className="text-small">
              <p className="text-ink">
                <time dateTime={event.at}>{formatDateFull(event.at)}</time> — {event.title}
              </p>
              {event.notify.buyerEmail ? (
                <p className="text-caption text-ink-muted">Покупателю: email — не отправлено</p>
              ) : null}
              {event.notify.managerTelegram ? (
                <p className="text-caption text-ink-muted">
                  Менеджеру: Telegram — не отправлено{telegram ? ` («${telegram}»)` : ''}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
