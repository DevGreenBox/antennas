import { NeedsReviewBadge } from '@/components/ui/Badge';
import { formatProductAttributes } from '@/lib/catalog';
import { capitalize } from '@/lib/format';
import type { AttrValue, Product } from '@/types/catalog';

import { INFERRED_FOOTNOTE } from './SpecLine';

/**
 * Характеристики товара (DESIGN § R.8): пары «подпись — значение», строки разделены тонкой
 * линией, без рамок ячеек. Строки, порядок и подписи — ровно `formatProductAttributes(product)`
 * движка; здесь только разметка статусов. Происхождение значений — отдельно, в закрытом блоке
 * «Техническая информация об источнике данных» (ProductSourceInfo).
 *
 * - inferred — «*» (aria-hidden) + sr «(единица принята по контексту)» и сноска под таблицей;
 * - needs-review — значение как в прайсе + «Уточняется» и пояснение `note` под значением.
 *
 * Семантика — таблица из двух колонок (`th scope="row"` + `td`): так пары читаются скринридером
 * построчно. Подпись и значение выровнены по базовой линии (`align-baseline`). Длинный текст
 * переносится — таблица не прокручивается по горизонтали.
 */
export interface SpecTableProps {
  product: Product;
  className?: string;
}

/**
 * Заглавная буква — только у словесных значений («Логопериодическая», «Карбон»): у чисел
 * подпись «до 12 кг» начинается со строчной, а модели и разъёмы и так пишутся как в данных.
 */
const isWordy = (value: AttrValue | undefined) =>
  value !== undefined && (value.kind === 'text' || value.kind === 'list');

export function SpecTable({ product, className }: SpecTableProps) {
  const rows = formatProductAttributes(product);
  if (rows.length === 0) {
    return <p className="text-body text-ink-secondary">Характеристики в прайсе не указаны.</p>;
  }
  const valueByCode = new Map(product.attributes.map((attr) => [attr.code, attr.value]));
  const hasInferred = rows.some((row) => row.status === 'inferred');

  return (
    <div className={className}>
      <table className="w-full border-t border-line-subtle" data-testid="spec-table">
        <caption className="sr-only">Характеристики: {product.name}</caption>
        <tbody>
          {rows.map((row) => {
            const text = isWordy(valueByCode.get(row.code)) ? capitalize(row.text) : row.text;
            return (
              <tr key={row.code} className="border-b border-line-subtle">
                <th
                  scope="row"
                  className="w-2/5 py-3.5 pr-6 text-left align-baseline text-small font-normal text-ink-muted"
                >
                  {row.label}
                </th>
                <td className="py-3.5 align-baseline text-body text-ink">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words">
                      {text}
                      {row.status === 'inferred' ? (
                        <>
                          <span aria-hidden>*</span>
                          <span className="sr-only"> (единица принята по контексту)</span>
                        </>
                      ) : null}
                    </span>
                    {row.status === 'needs-review' ? <NeedsReviewBadge /> : null}
                  </div>
                  {row.status === 'needs-review' && row.note ? (
                    <p className="mt-1 text-small text-ink-secondary">{row.note}</p>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasInferred ? <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p> : null}
    </div>
  );
}
