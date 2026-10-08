import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { formatProductAttributes } from '@/lib/catalog';
import type { FormattedAttribute } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatCellAddress } from '@/lib/format';
import type { Product, SourceRecord, SourceResolution } from '@/types/catalog';

/**
 * «Техническая информация об источнике данных» (DESIGN § R.8) — происхождение значений
 * характеристик и строки исходного прайса. Покупателю это не нужно для решения, поэтому всё
 * собрано в одном закрытом `<details>` под характеристиками: нативно доступен с клавиатуры
 * (Enter/Space на summary) и работает без JS. Данные и правила те же, что раньше были под
 * значениями, — изменилась только подача.
 *
 * Внутри:
 * - «Происхождение значений» (`data-testid="spec-source"`): если два и больше значений взяты из
 *   одной строки прайса (обычно — строка самого товара), её ячейка, исходный текст и фрагмент
 *   каждого значения — один раз; значения с другим источником (заголовок группы, групповое
 *   примечание, ручная правка, другая строка) — каждое отдельной записью;
 * - «Строки прайса (n)» (`#source-rows`): из каких строк собрана позиция — текст и цена
 *   буквально. Строки `conflict-attached` (лист 2, расходящийся с листом 1) сюда НЕ попадают и в
 *   счётчик не входят: публичная страница не показывает значения листа 2 (решение координатора).
 *
 * Повторы не выводятся: фрагмент, совпадающий с текстом ячейки целиком, не дублируется.
 */

const ROLE_LABELS: Partial<Record<SourceResolution, string>> = {
  created: 'Основная строка',
  'merged-duplicate': 'Повтор — объединён с основной',
};

export function publicSourceRows(records: readonly SourceRecord[]): SourceRecord[] {
  return records.filter((record) => record.resolution !== 'conflict-attached');
}

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

/** «Из строки прайса», «Из заголовка группы «…»» и т. п. */
function originText(row: Pick<FormattedAttribute, 'origin' | 'raw'>, cellText?: string): string {
  const quoted = cellText ?? row.raw;
  switch (row.origin.kind) {
    case 'row':
      return 'Из строки прайса';
    case 'group-header':
      return `Из заголовка группы «${quoted}»`;
    case 'group-note':
      return `Из примечания к группе «${quoted}»`;
    default:
      return 'Уточнено вручную';
  }
}

const TERM = 'text-caption text-ink-muted';
const MONO = 'font-mono break-words text-ink';

function Pair({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className={TERM}>{term}</dt>
      <dd className="min-w-0 text-small">{children}</dd>
    </div>
  );
}

const cellOf = (record: SourceRecord) => formatCellAddress(`${record.sheet}!${record.nameCell}`);

function RawPrice({ record }: { record: SourceRecord }) {
  if (record.rawPrice.trim() === '') {
    return <span className="font-sans text-ink-muted">не указана</span>;
  }
  return <>{record.rawPrice}</>;
}

export interface ProductSourceInfoProps {
  product: Product;
  /** Текст ячеек прайса по адресу «1!B4» (строки, заголовки групп, примечания). */
  sourceTexts: ReadonlyMap<string, string>;
  records: readonly SourceRecord[];
  className?: string;
}

export function ProductSourceInfo({
  product,
  sourceTexts,
  records,
  className,
}: ProductSourceInfoProps) {
  const attrs = formatProductAttributes(product);
  const sourceRows = publicSourceRows(records);
  if (attrs.length === 0 && sourceRows.length === 0) return null;

  const shared = sharedRowCell(attrs);
  const fromShared = (row: FormattedAttribute) =>
    shared !== null && row.origin.kind === 'row' && row.origin.cell === shared;
  const sharedRows = attrs.filter(fromShared);
  const ownRows = attrs.filter((row) => !fromShared(row));
  const sharedText = shared === null ? undefined : sourceTexts.get(shared);
  const fragments = sharedRows.filter(
    (row) =>
      row.raw.trim() !== '' && (sharedText === undefined || row.raw.trim() !== sharedText.trim()),
  );

  return (
    <details
      id="product-source"
      className={cn('group/source border-y border-line', className)}
      data-testid="product-source"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-small font-medium text-ink-secondary transition-colors duration-fast hover:text-ink [&::-webkit-details-marker]:hidden">
        Техническая информация об источнике данных
        <Icon
          name="chevron-down"
          size={20}
          className="text-ink-muted transition-transform duration-fast group-open/source:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-8 pt-2 pb-8">
        <p className="max-w-text text-small text-ink-secondary">
          Откуда взяты значения характеристик: адрес ячейки и текст исходного прайса — как в файле,
          без исправлений. Для сверки с прайсом.
        </p>

        {attrs.length > 0 ? (
          <section aria-labelledby="spec-source-title" data-testid="spec-source">
            <h3 id="spec-source-title" className="eyebrow">
              Происхождение значений
            </h3>
            <dl className="mt-2 divide-y divide-line-subtle border-y border-line-subtle">
              {shared !== null ? (
                <>
                  <Pair
                    term={
                      ownRows.length > 0 ? 'Источник остальных значений' : 'Источник всех значений'
                    }
                  >
                    {formatCellAddress(shared)} · Из строки прайса
                  </Pair>
                  {sharedText !== undefined ? (
                    <Pair term="Исходный текст">
                      <span className={MONO}>«{sharedText}»</span>
                    </Pair>
                  ) : null}
                  {fragments.length > 0 ? (
                    <Pair term="Фрагменты">
                      <ul className="flex flex-col gap-1">
                        {fragments.map((row) => (
                          <li key={row.code} className="text-ink">
                            {row.label}: <span className={MONO}>«{row.raw}»</span>
                          </li>
                        ))}
                      </ul>
                    </Pair>
                  ) : null}
                </>
              ) : null}
              {ownRows.map((row) => {
                const cell = row.origin.kind === 'manual' ? null : row.origin.cell;
                const cellText = cell === null ? undefined : sourceTexts.get(cell);
                return (
                  <Pair key={row.code} term={row.label}>
                    <span className="text-ink">
                      {cell === null ? 'Ручная правка' : formatCellAddress(cell)} ·{' '}
                      {originText(row, cellText)}
                    </span>
                    {row.origin.kind === 'row' && cellText !== undefined ? (
                      <span className={cn('mt-1 block', MONO)}>«{cellText}»</span>
                    ) : null}
                  </Pair>
                );
              })}
            </dl>
          </section>
        ) : null}

        {sourceRows.length > 0 ? (
          <section id="source-rows" aria-labelledby="source-rows-title">
            <h3 id="source-rows-title" className="eyebrow">
              Строки прайса ({sourceRows.length})
            </h3>
            <table className="mt-2 hidden w-full text-small md:table">
              <caption className="sr-only">Строки прайса: {product.name}</caption>
              <thead>
                <tr>
                  {['Ячейка', 'Исходный текст', 'Цена в прайсе', 'Роль строки'].map(
                    (title, index) => (
                      <th
                        key={title}
                        scope="col"
                        className={cn(
                          'border-y border-line-subtle px-3 py-2.5 text-left text-caption font-normal whitespace-nowrap text-ink-muted',
                          index === 0 && 'pl-0',
                          index === 3 && 'pr-0',
                        )}
                      >
                        {title}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sourceRows.map((record) => (
                  <tr key={record.id} className="border-b border-line-subtle">
                    <td className="py-3 pr-3 pl-0 align-top whitespace-nowrap text-ink-secondary">
                      {cellOf(record)}
                    </td>
                    <td className={cn('px-3 py-3 align-top', MONO)}>{record.rawText}</td>
                    <td className="px-3 py-3 align-top font-mono whitespace-nowrap text-ink">
                      <RawPrice record={record} />
                    </td>
                    <td className="py-3 pr-0 pl-3 align-top text-ink-secondary">
                      {ROLE_LABELS[record.resolution] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-2 divide-y divide-line-subtle border-y border-line-subtle text-small md:hidden">
              {sourceRows.map((record) => (
                <li key={record.id} className="py-3">
                  <p className={TERM}>
                    {cellOf(record)} · {ROLE_LABELS[record.resolution] ?? '—'}
                  </p>
                  <p className={cn('mt-1', MONO)}>{record.rawText}</p>
                  <p className="mt-1 text-ink-secondary">
                    Цена в прайсе:{' '}
                    <span className="font-mono text-ink">
                      <RawPrice record={record} />
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
