'use client';

import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { formatPrice } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { paymentHref } from '@/lib/demo-orders';
import { formatDateFull, formatDateShort } from '@/lib/format';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_TONES } from '@/lib/order-status';
import type { DemoOrder } from '@/types/order';

/** «Сумма изменена» → «сумма изменена» — причина идёт после двоеточия. */
function lowerFirst(text: string | null): string {
  const value = text ?? 'Сумма изменена';
  return value.charAt(0).toLocaleLowerCase('ru-RU') + value.slice(1);
}

/**
 * Версии согласования (DESIGN §3.6, §5.9.30), новые сверху. Аннулированная версия зачёркнута
 * и объясняет, почему её ссылка на оплату больше не действует.
 */
export function QuoteVersions({ order }: { order: DemoOrder }) {
  const versions = [...order.quotes].sort((a, b) => b.version - a.version);
  return (
    <ol className="border-t border-line-subtle">
      {versions.map((quote) => {
        const annulled = quote.status === 'annulled';
        return (
          <li
            key={quote.version}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line-subtle py-3"
          >
            <span className="text-small font-semibold text-ink">Версия {quote.version}</span>
            <Badge tone={QUOTE_STATUS_TONES[quote.status]}>
              {QUOTE_STATUS_LABELS[quote.status]}
            </Badge>
            <span
              className={cn(
                'text-small tabular-nums',
                annulled ? 'text-ink-muted line-through' : 'text-ink',
              )}
            >
              {formatPrice(quote.total)}
            </span>
            <time dateTime={quote.createdAt} className="text-caption text-ink-muted">
              {formatDateShort(quote.createdAt)}
            </time>
            {quote.status === 'issued' && order.status === 'awaiting-payment' ? (
              <ButtonLink
                href={paymentHref(order.number, quote.version)}
                variant="link"
                size="sm"
                className="ml-auto"
              >
                Оплатить
                <span className="sr-only"> версию {quote.version}</span>
              </ButtonLink>
            ) : null}
            {annulled && quote.annulledAt ? (
              <p className="w-full text-caption text-ink-secondary">
                Аннулирована {formatDateFull(quote.annulledAt)}: {lowerFirst(quote.annulReason)}.
                Ссылка на оплату больше не действует.
              </p>
            ) : null}
            {quote.managerComment ? (
              <p className="w-full text-caption text-ink-secondary">
                Комментарий менеджера: {quote.managerComment}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
