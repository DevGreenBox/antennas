import { NeedsReviewBadge } from '@/components/ui/Badge';
import { formatProductAttributes } from '@/lib/catalog';
import type { FormattedAttribute } from '@/lib/catalog';
import { capitalize } from '@/lib/format';
import type { AttrValue, Product } from '@/types/catalog';

import { SharedSourceDetails, SourceDetails } from './SourceDetails';
import { INFERRED_FOOTNOTE } from './SpecLine';

/**
 * Таблица характеристик товара (DESIGN §5.9.16, §4.9, §4.10). Строки, порядок и подписи — ровно
 * `formatProductAttributes(product)` движка; здесь только разметка статусов и происхождения.
 *
 * - inferred — «*» (aria-hidden) + sr «(единица принята по контексту)» и сноска под таблицей;
 * - needs-review — значение как в прайсе + «Уточняется» и пояснение `note` под значением;
 * - происхождение: если два и больше значений взяты из одной строки прайса (обычно — строка
 *   самого товара), её ячейка показывается один раз под таблицей (SharedSourceDetails: исходный
 *   текст и фрагмент каждого значения); SourceDetails под значением — только у значений с другим
 *   источником (заголовок группы, групповое примечание, ручная правка, другая строка).
 *
 * Подпись 14 px и значение 16 px выровнены по базовой линии первой строки (`align-baseline` у
 * ячеек). Две колонки на всех ширинах (`th` 40 %), длинный исходный текст переносится — таблица
 * не прокручивается по горизонтали.
 */
export interface SpecTableProps {
  product: Product;
  /** Текст ячеек прайса по адресу «1!B4» (строки, заголовки групп, примечания). */
  sourceTexts: ReadonlyMap<string, string>;
  className?: string;
}

/**
 * Заглавная буква — только у словесных значений («Логопериодическая», «Карбон»): у чисел
 * подпись «до 12 кг» по §4.9 начинается со строчной, а модели и разъёмы и так пишутся как в данных.
 */
const isWordy = (value: AttrValue | undefined) =>
  value !== undefined && (value.kind === 'text' || value.kind === 'list');

/** Ячейка строки прайса, из которой взяты ≥ 2 значения (самая частая); null — такой нет. */
function sharedRowCell(rows: readonly FormattedAttribute[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.origin.kind !== 'row' || row.origin.cell === null) continue;
    counts.set(row.origin.cell, (counts.get(row.origin.cell) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 1;
  for (const [cell, count] of counts) {
    if (count > bestCount) {
      best = cell;
      bestCount = count;
    }
  }
  return best;
}

export function SpecTable({ product, sourceTexts, className }: SpecTableProps) {
  const rows = formatProductAttributes(product);
  if (rows.length === 0) {
    return <p className="text-body text-ink-secondary">Характеристики в прайсе не указаны.</p>;
  }
  const valueByCode = new Map(product.attributes.map((attr) => [attr.code, attr.value]));
  const hasInferred = rows.some((row) => row.status === 'inferred');
  const shared = sharedRowCell(rows);
  const fromShared = (row: FormattedAttribute) =>
    shared !== null && row.origin.kind === 'row' && row.origin.cell === shared;
  const sharedRows = rows.filter(fromShared);

  return (
    <div className={className}>
      <table className="w-full" data-testid="spec-table">
        <caption className="sr-only">Характеристики: {product.name}</caption>
        <tbody>
          {rows.map((row) => {
            const text = isWordy(valueByCode.get(row.code)) ? capitalize(row.text) : row.text;
            return (
              <tr key={row.code} className="border-b border-line-subtle">
                <th
                  scope="row"
                  className="w-2/5 py-3 pr-4 text-left align-baseline text-small font-normal text-ink-secondary"
                >
                  {row.label}
                </th>
                <td className="py-3 align-baseline text-body text-ink">
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
                  {fromShared(row) ? null : (
                    <SourceDetails
                      attribute={row}
                      cellText={
                        row.origin.cell === null ? undefined : sourceTexts.get(row.origin.cell)
                      }
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {shared !== null ? (
        <SharedSourceDetails
          cell={shared}
          cellText={sourceTexts.get(shared)}
          rows={sharedRows}
          partial={sharedRows.length < rows.length}
          className="mt-3"
        />
      ) : null}
      {hasInferred ? <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p> : null}
    </div>
  );
}
