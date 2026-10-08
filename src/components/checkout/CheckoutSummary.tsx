'use client';

import Link from 'next/link';

import { OrderSummary, PreliminaryBreakdown } from '@/components/cart/OrderSummary';
import { PromoCodeField } from '@/components/cart/PromoCodeField';
import { toPricedLine } from '@/components/cart/cart-model';
import type { CartModel } from '@/components/cart/cart-model';
import { TechText } from '@/components/product/SpecLine';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/catalog';
import { lineTotal } from '@/lib/demo-pricing';
import { POSITION_FORMS, countLabel, formatPieces } from '@/lib/format';

/**
 * Сводка заявки (DESIGN §2.10, §5.9.29 `variant="checkout"`): компактный состав, расчёт,
 * промокод и «Изменить корзину». На < lg — свёрнутый `<details>` над формой, на ≥ lg — колонка
 * справа, липкая. Обе формы — белая панель с рамкой `line` (DESIGN § R.4), как форма рядом.
 */

function SummaryBody({ model, editable }: { model: CartModel; editable: boolean }) {
  return (
    <>
      <ul className="mb-3 divide-y divide-line-subtle border-y border-line-subtle">
        {model.available.map((line) => {
          const total = lineTotal(toPricedLine(line));
          return (
            <li
              key={line.item.productId}
              className="flex items-start justify-between gap-4 py-2.5 text-small"
            >
              <span className="min-w-0 text-ink">
                {line.product ? <TechText text={line.product.name} /> : null}
                <span className="whitespace-nowrap text-ink-secondary">
                  {' '}
                  × {formatPieces(line.item.quantity)}
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {total === null ? (
                  <span className="text-ink-secondary">по запросу</span>
                ) : (
                  formatPrice(total)
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <PreliminaryBreakdown totals={model.totals} />
      {editable ? (
        <PromoCodeField
          onlyRequestItems={model.totals.onlyRequestItems}
          className="mt-4 border-t border-line-subtle pt-4"
        />
      ) : null}
      <p className="mt-4 text-small">
        <Link href="/cart" className="text-link inline-flex min-h-11 items-center lg:min-h-0">
          Изменить корзину
        </Link>
      </p>
    </>
  );
}

/** Колонка справа (≥ lg). */
export function CheckoutSummary({ model, editable }: { model: CartModel; editable: boolean }) {
  return (
    <OrderSummary title="Сумма заявки">
      <SummaryBody model={model} editable={editable} />
    </OrderSummary>
  );
}

/** Свёрнутая сводка над формой (< lg). */
export function CheckoutSummaryDisclosure({
  model,
  editable,
  className,
}: {
  model: CartModel;
  editable: boolean;
  className?: string;
}) {
  const amount =
    model.totals.total === null ? 'стоимость уточнит менеджер' : formatPrice(model.totals.total);
  return (
    <details className={`group rounded-md border border-line bg-surface ${className ?? ''}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-small font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span>
          Состав заявки · {countLabel(model.available.length, POSITION_FORMS)} · {amount}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className="shrink-0 text-ink-muted transition-transform duration-fast group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-line px-4 pt-3 pb-4">
        <SummaryBody model={model} editable={editable} />
      </div>
    </details>
  );
}
