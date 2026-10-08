import type { ReactNode } from 'react';

import { Price } from '@/components/ui/Price';
import { formatPrice } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import type { PreliminaryTotals } from '@/lib/demo-pricing';
import { formatDateShort, formatPieces } from '@/lib/format';
import type { QuoteVersion } from '@/types/order';

/**
 * Сводка суммы (DESIGN §5.9.29): корзина и заявка («Сумма заявки»), заказ до согласования
 * («Предварительный расчёт») и после («Расчёт по согласованию»). Суммы не считаются здесь —
 * приходят из `preliminaryTotals()` (demo-pricing) или из версии согласования.
 *
 *   <OrderSummary title="Сумма заявки">
 *     <PreliminaryBreakdown totals={totals} />
 *     <PromoCodeField … />
 *   </OrderSummary>
 *   <OrderSummary title="Расчёт по согласованию"><QuoteBreakdown quote={quote} paid={…} /></OrderSummary>
 *
 * Правило «по запросу» (§3.4): при таких позициях полного итога нет — «Стоимость уточнит
 * менеджер» и отдельно «Известная часть»; доставка до согласования — «рассчитает менеджер».
 *
 * Подписи значений не переносятся внутри («уточнит / менеджер» при выравнивании вправо читалось
 * плохо): в строке переносится подпись слева, а итог при нехватке места целиком уходит на
 * следующую строку. «Цены в рублях — предварительно» под сводкой не дублируется — она в подвале.
 *
 * Панель (DESIGN § R.1, § R.4): белая поверхность, рамка `line`, радиус 6, без тени — это одна из
 * немногих настоящих панелей потока покупки (рядом — только форма заявки). Внутри панели других
 * рамок и подложек нет: строки разделяют тонкие линии.
 */

export interface OrderSummaryProps {
  title: string;
  className?: string;
  children: ReactNode;
}

export function OrderSummary({ title, className, children }: OrderSummaryProps) {
  return (
    <section className={cn('rounded-md border border-line bg-surface p-5 lg:p-6', className)}>
      <h2 className="mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function SummaryRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-small">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-right whitespace-nowrap text-ink tabular-nums">{children}</dd>
    </div>
  );
}

export function SummaryTotal({
  label,
  caption,
  children,
}: {
  label: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    // Подпись итога — отдельный dd на всю ширину: иначе длинная подпись («Версия согласования 1
    // от …») задавала ширину значения, и на узком экране итог уезжал под заголовок.
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-4">
      <dt className="text-body font-semibold">{label}</dt>
      <dd className="ml-auto text-right">{children}</dd>
      {caption ? (
        <dd className="basis-full text-right text-caption text-ink-muted">{caption}</dd>
      ) : null}
    </div>
  );
}

/** Строки предварительного расчёта: корзина, заявка, заказ до согласования. */
export function PreliminaryBreakdown({
  totals,
  className,
}: {
  totals: PreliminaryTotals;
  className?: string;
}) {
  const knownPart = totals.knownItemsTotal - totals.discount;
  return (
    <dl className={className}>
      {totals.knownLinesCount > 0 ? (
        <SummaryRow label={`Позиции с ценой (${formatPieces(totals.knownQuantity)})`}>
          {formatPrice(totals.knownItemsTotal)}
        </SummaryRow>
      ) : null}
      {totals.requestLinesCount > 0 ? (
        <SummaryRow label={`Позиции «по запросу» (${formatPieces(totals.requestQuantity)})`}>
          <span className="text-ink-secondary">уточнит менеджер</span>
        </SummaryRow>
      ) : null}
      {totals.promo !== null ? (
        <SummaryRow label="Скидка по промокоду (предварительно)">
          {totals.onlyRequestItems ? (
            <span className="text-ink-secondary">при согласовании</span>
          ) : (
            formatPrice(-totals.discount)
          )}
        </SummaryRow>
      ) : null}
      <SummaryRow label="Доставка">
        <span className="text-ink-secondary">рассчитает менеджер</span>
      </SummaryRow>
      {totals.total !== null ? (
        <SummaryTotal label="Предварительно">
          <Price amount={totals.total} size="lg" />
        </SummaryTotal>
      ) : (
        <SummaryTotal
          label="Итого"
          caption={
            totals.knownLinesCount > 0 ? `Известная часть: ${formatPrice(knownPart)}` : undefined
          }
        >
          <span className="text-small font-semibold whitespace-nowrap text-ink">
            Стоимость уточнит менеджер
          </span>
        </SummaryTotal>
      )}
    </dl>
  );
}

/**
 * Строки версии согласования. `paid` — заказ оплачен или дальше: итог подписан «Оплачено».
 * Аннулированная версия (заказ снова на согласовании или отменён) явно помечена: её итог к
 * оплате больше не относится.
 */
export function QuoteBreakdown({
  quote,
  paid,
  className,
}: {
  quote: QuoteVersion;
  paid: boolean;
  className?: string;
}) {
  const annulled = quote.status === 'annulled';
  const totalLabel = annulled ? 'Итого по версии' : paid ? 'Оплачено' : 'Итого к оплате';
  const caption = `Версия согласования ${quote.version} от ${formatDateShort(quote.createdAt)}${
    annulled ? ' — аннулирована' : ''
  }`;
  return (
    <dl className={className}>
      <SummaryRow label="Товары">{formatPrice(quote.itemsTotal)}</SummaryRow>
      {quote.discount > 0 ? (
        <SummaryRow label={`Скидка${quote.discountNote ? ` — ${quote.discountNote}` : ''}`}>
          {formatPrice(-quote.discount)}
        </SummaryRow>
      ) : null}
      <SummaryRow label={`Доставка${quote.deliveryNote ? ` — ${quote.deliveryNote}` : ''}`}>
        {formatPrice(quote.delivery)}
      </SummaryRow>
      <SummaryTotal label={totalLabel} caption={caption}>
        <Price
          amount={quote.total}
          size="lg"
          className={cn(annulled && 'text-ink-muted line-through')}
        />
      </SummaryTotal>
    </dl>
  );
}
