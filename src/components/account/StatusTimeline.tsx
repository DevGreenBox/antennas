'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { statusTimeline } from '@/lib/demo-orders';
import type { TimelineStepState } from '@/lib/demo-orders';
import { formatDateFull } from '@/lib/format';
import { ORDER_STATUS_LABELS } from '@/lib/order-status';
import type { DemoOrder } from '@/types/order';

/**
 * Таймлайн статусов (DESIGN §5.9.32): путь §3.1, время — последний вход в статус
 * (`statusTimeline()` ядра). При отмене — пройденные шаги и «Отменён» с причиной.
 * Состояние шага передаётся формой маркера и sr-текстом, не только цветом.
 *
 * Описание текущего статуса здесь не повторяется: его уже говорит StatusCallout под заголовком
 * заказа (DESIGN § R.1 — без дублей); таймлайн — компактная история: статус и время.
 */

const SR_STATE: Record<TimelineStepState, string> = {
  done: ' — выполнено',
  current: ' — текущий этап',
  upcoming: ' — предстоит',
  cancelled: ' — текущий этап',
};

function Marker({ state }: { state: TimelineStepState }) {
  switch (state) {
    case 'done':
      return (
        <span className="flex size-4 items-center justify-center rounded-full bg-ink text-ink-inverse">
          <Icon name="check" size={12} />
        </span>
      );
    case 'current':
      return <span className="block size-4 rounded-full border-2 border-ink bg-brand" />;
    case 'cancelled':
      return (
        <span className="flex size-4 items-center justify-center rounded-full bg-danger text-ink-inverse">
          <Icon name="x" size={12} />
        </span>
      );
    default:
      return <span className="block size-4 rounded-full border border-line-strong bg-surface" />;
  }
}

export function StatusTimeline({ order }: { order: DemoOrder }) {
  const steps = statusTimeline(order);
  return (
    <ol>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const active = step.state === 'current' || step.state === 'cancelled';
        return (
          <li
            key={step.status}
            aria-current={active ? 'step' : undefined}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {last ? null : (
              <span
                aria-hidden
                className={cn(
                  'absolute top-5 bottom-0 left-[7px] w-0.5',
                  step.state === 'done' ? 'bg-ink' : 'bg-line-subtle',
                )}
              />
            )}
            <span aria-hidden className="mt-0.5 w-4 shrink-0">
              <Marker state={step.state} />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-small',
                  step.state === 'upcoming' ? 'text-ink-muted' : 'font-medium text-ink',
                )}
              >
                {ORDER_STATUS_LABELS[step.status]}
                <span className="sr-only">{SR_STATE[step.state]}</span>
              </p>
              {step.at !== null ? (
                <p className="text-caption text-ink-muted">
                  <time dateTime={step.at}>{formatDateFull(step.at)}</time>
                </p>
              ) : null}
              {step.state === 'cancelled' && order.cancelReason ? (
                <p className="mt-1 text-small text-ink-secondary">Причина: {order.cancelReason}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
