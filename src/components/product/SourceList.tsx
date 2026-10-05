import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatCellAddress } from '@/lib/format';
import type { SourceRecord, SourceResolution } from '@/types/catalog';

/**
 * «Строки прайса (n)» (DESIGN §2.6 п.12, §5.9.16 SourceList): из каких строк исходного файла
 * собрана карточка — текст и цена буквально, без исправлений.
 *
 * Строки `conflict-attached` (лист 2, расходящийся с листом 1) сюда НЕ попадают и в счётчик не
 * входят: публичная страница не показывает значения листа 2 (решение координатора, §2.6 п.3).
 * Фильтр — здесь, а не только в странице: компонент безопасен при любом входе.
 *
 * ≥ md — таблица «Ячейка · Исходный текст · Цена в прайсе · Роль строки»; < md — те же поля
 * списком (четыре колонки моноширинного текста на 360 px не помещаются без горизонтальной
 * прокрутки, §5.4).
 */

const ROLE_LABELS: Partial<Record<SourceResolution, string>> = {
  created: 'Основная строка',
  'merged-duplicate': 'Повтор — объединён с основной',
};

export function publicSourceRows(records: readonly SourceRecord[]): SourceRecord[] {
  return records.filter((record) => record.resolution !== 'conflict-attached');
}

const cellOf = (record: SourceRecord) => formatCellAddress(`${record.sheet}!${record.nameCell}`);

function RawPrice({ record }: { record: SourceRecord }) {
  if (record.rawPrice.trim() === '') {
    return <span className="font-sans text-ink-muted">не указана</span>;
  }
  return <>{record.rawPrice}</>;
}

export function SourceList({
  records,
  productName,
  className,
}: {
  records: readonly SourceRecord[];
  productName: string;
  className?: string;
}) {
  const rows = publicSourceRows(records);
  if (rows.length === 0) return null;

  return (
    <details
      id="source-rows"
      className={cn('group/rows border-y border-line', className)}
      data-testid="source-rows"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-body font-semibold text-ink [&::-webkit-details-marker]:hidden">
        Строки прайса ({rows.length})
        <Icon
          name="chevron-down"
          size={20}
          className="text-ink-muted transition-transform duration-fast group-open/rows:rotate-180"
        />
      </summary>
      <div className="pb-4">
        <p className="mb-3 max-w-text text-small text-ink-secondary">
          Строки исходного прайса, из которых собрана позиция. Текст и цена — как в файле, без
          исправлений.
        </p>
        <table className="hidden w-full text-small md:table">
          <caption className="sr-only">Строки прайса: {productName}</caption>
          <thead>
            <tr>
              {['Ячейка', 'Исходный текст', 'Цена в прайсе', 'Роль строки'].map((title, index) => (
                <th
                  key={title}
                  scope="col"
                  className={cn(
                    'border-b border-line px-3 py-2.5 text-left font-medium whitespace-nowrap text-ink-muted',
                    index === 0 && 'pl-0',
                    index === 3 && 'pr-0',
                  )}
                >
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.id} className="border-b border-line-subtle last:border-b-0">
                <td className="py-3 pr-3 pl-0 align-top whitespace-nowrap text-ink-secondary">
                  {cellOf(record)}
                </td>
                <td className="px-3 py-3 align-top font-mono break-words text-ink">
                  {record.rawText}
                </td>
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
        <ul className="divide-y divide-line-subtle text-small md:hidden">
          {rows.map((record) => (
            <li key={record.id} className="py-3 first:pt-0">
              <p className="text-caption text-ink-muted">
                {cellOf(record)} · {ROLE_LABELS[record.resolution] ?? '—'}
              </p>
              <p className="mt-1 font-mono break-words text-ink">{record.rawText}</p>
              <p className="mt-1 text-ink-secondary">
                Цена в прайсе:{' '}
                <span className="font-mono text-ink">
                  <RawPrice record={record} />
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
