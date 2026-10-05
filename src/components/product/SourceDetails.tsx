import { Icon } from '@/components/ui/Icon';
import type { FormattedAttribute } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatCellAddress } from '@/lib/format';

/**
 * Происхождение значений характеристик (DESIGN §5.9.16 SourceDetails, §4.10). `<details>` —
 * нативно доступен с клавиатуры (Enter/Space на summary) и работает без JS; подсказок по наведению
 * нет (§5.7).
 *
 * - SourceDetails — раскрытие «Источник: лист 1, B33» под значением, чей источник отличается от
 *   общего (заголовок группы, групповое примечание, ручная правка, другая строка).
 * - SharedSourceDetails — один раз под таблицей «Источник всех значений: лист 1, B4», когда
 *   несколько значений взяты из одной строки прайса: повторять одну и ту же ячейку под каждым
 *   значением — шум. Внутри — исходный текст строки и фрагмент каждого значения.
 *
 * Повторы не выводятся: у значений из заголовка группы или группового примечания текст ячейки уже
 * процитирован в «Происхождении», а фрагмент часто совпадает с исходным текстом целиком —
 * показывать одну строку дважды значит заставлять сверять глазами.
 */

const SUMMARY =
  'inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-xs text-caption text-ink-muted transition-colors duration-fast hover:text-ink [&::-webkit-details-marker]:hidden';

function Summary({ children, group }: { children: string; group: 'source' | 'shared' }) {
  return (
    <summary className={SUMMARY}>
      {children}
      <Icon
        name="chevron-down"
        size={16}
        className={cn(
          'transition-transform duration-fast',
          group === 'source' ? 'group-open/source:rotate-180' : 'group-open/shared:rotate-180',
        )}
      />
    </summary>
  );
}

const PANEL = 'mt-2 flex flex-col gap-2 rounded-sm bg-surface-subtle p-3 text-small';

export function SourceDetails({
  attribute,
  cellText,
}: {
  attribute: Pick<FormattedAttribute, 'origin' | 'raw'>;
  /** Текст ячейки-источника (`origin.cell`) буквально; undefined — ячейка не найдена. */
  cellText: string | undefined;
}) {
  const { origin, raw } = attribute;
  const cell = origin.kind === 'manual' ? null : origin.cell;
  const manual = cell === null;
  const summary = manual ? 'Источник: ручная правка' : `Источник: ${formatCellAddress(cell)}`;

  // Текст ячейки не нашёлся — цитируется сам фрагмент (и тогда он не повторяется отдельно).
  const quotedCell = cellText ?? raw;
  const originText =
    origin.kind === 'row'
      ? 'Из строки прайса'
      : origin.kind === 'group-header'
        ? `Из заголовка группы «${quotedCell}»`
        : origin.kind === 'group-note'
          ? `Из примечания к группе «${quotedCell}»`
          : 'Уточнено вручную';

  const pairs: { term: string; value: string; mono: boolean }[] = [];
  if (!manual && origin.kind === 'row' && cellText !== undefined) {
    pairs.push({ term: 'Исходный текст', value: `«${cellText}»`, mono: true });
  }
  // Фрагмент — если он не повторяет уже показанный текст ячейки (у групповых — процитированный
  // в «Происхождении»).
  const fragmentShown =
    cellText !== undefined ? raw.trim() !== cellText.trim() : origin.kind === 'row';
  if (!manual && raw.trim() !== '' && fragmentShown) {
    pairs.push({ term: 'Фрагмент', value: `«${raw}»`, mono: true });
  }
  pairs.push({ term: 'Происхождение', value: originText, mono: false });

  return (
    <details className="group/source mt-1">
      <Summary group="source">{summary}</Summary>
      <dl className={PANEL}>
        {pairs.map((pair) => (
          <div key={pair.term}>
            <dt className="text-caption text-ink-muted">{pair.term}</dt>
            <dd className={pair.mono ? 'font-mono break-words text-ink' : 'text-ink'}>
              {pair.value}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function SharedSourceDetails({
  cell,
  cellText,
  rows,
  partial,
  className,
}: {
  /** Общая ячейка-строка прайса, «1!B4». */
  cell: string;
  /** Текст этой ячейки буквально; undefined — ячейка не найдена. */
  cellText: string | undefined;
  /** Значения из этой строки — подпись и фрагмент (в порядке таблицы). */
  rows: readonly Pick<FormattedAttribute, 'code' | 'label' | 'raw'>[];
  /** У части значений свой источник (показан под ними) — тогда «остальных значений». */
  partial: boolean;
  className?: string;
}) {
  const address = formatCellAddress(cell);
  const summary = partial
    ? `Источник остальных значений: ${address}`
    : `Источник всех значений: ${address}`;
  // Фрагмент, совпадающий с текстом ячейки целиком, не повторяется.
  const fragments = rows.filter(
    (row) =>
      row.raw.trim() !== '' && (cellText === undefined || row.raw.trim() !== cellText.trim()),
  );

  return (
    <details className={cn('group/shared', className)} data-testid="spec-source">
      <Summary group="shared">{summary}</Summary>
      <dl className={PANEL}>
        {cellText !== undefined ? (
          <div>
            <dt className="text-caption text-ink-muted">Исходный текст</dt>
            <dd className="font-mono break-words text-ink">«{cellText}»</dd>
          </div>
        ) : null}
        {fragments.length > 0 ? (
          <div>
            <dt className="text-caption text-ink-muted">Фрагменты</dt>
            <dd>
              <ul className="flex flex-col gap-1">
                {fragments.map((row) => (
                  <li key={row.code} className="text-ink">
                    {row.label}: <span className="font-mono break-words">«{row.raw}»</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-caption text-ink-muted">Происхождение</dt>
          <dd className="text-ink">Из строки прайса</dd>
        </div>
      </dl>
    </details>
  );
}
