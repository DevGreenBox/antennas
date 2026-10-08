import { cn } from '@/lib/cn';

import { LiteralText } from './LiteralText';
import { CellChip, MissingProductRef, ProductRefLink } from './ReportLinks';
import { SERVICE_TABLE } from './ServiceSection';
import type { ProductRef } from './labels';

/**
 * Повторы строк внутри блока (проблемы `duplicate-row`): пара «повтор → оригинал» по фактическим
 * адресам из данных. Страница выводит рядом поправку к ТЗ: §4 п.5 называет оригиналами E44–E47,
 * а по выгрузке это E44, E46, E47, E48 (импорт сопоставляет по тексту и цене, не по адресам).
 */

export interface DuplicatePair {
  issueId: string;
  duplicateCell: string;
  originalCell: string;
  rawText: string;
  rawPrice: string;
  product: ProductRef | { missingId: string } | null;
}

export function DuplicatesTable({ pairs }: { pairs: readonly DuplicatePair[] }) {
  return (
    <div
      role="region"
      aria-labelledby="duplicates-caption"
      tabIndex={0}
      className={cn('focus-inset', SERVICE_TABLE.frame)}
    >
      <table className="w-full min-w-[40rem] text-small">
        <caption id="duplicates-caption" className="sr-only">
          Повторы строк: повтор, оригинал, исходный текст, цена, товар
        </caption>
        <thead className={SERVICE_TABLE.head}>
          <tr className={SERVICE_TABLE.headRow}>
            <th scope="col" className={cn(SERVICE_TABLE.th, 'w-28')}>
              Повтор
            </th>
            <th scope="col" className={cn(SERVICE_TABLE.th, 'w-28')}>
              Оригинал
            </th>
            <th scope="col" className={SERVICE_TABLE.th}>
              Исходный текст
            </th>
            <th scope="col" className={cn(SERVICE_TABLE.th, 'w-28')}>
              Цена в прайсе
            </th>
            <th scope="col" className={SERVICE_TABLE.th}>
              Товар (два происхождения)
            </th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => (
            <tr key={pair.issueId} data-testid="duplicate-pair" className={SERVICE_TABLE.row}>
              <td className="px-3 py-3">
                <CellChip cell={pair.duplicateCell} />
              </td>
              <td className="px-3 py-3">
                <CellChip cell={pair.originalCell} />
              </td>
              <td className="px-3 py-3 text-ink">
                <LiteralText text={pair.rawText} />
              </td>
              <td className="px-3 py-3 text-ink">
                <LiteralText text={pair.rawPrice} />
              </td>
              <td className="px-3 py-3">
                {pair.product === null ? (
                  <span className="text-ink-muted">—</span>
                ) : 'missingId' in pair.product ? (
                  <MissingProductRef id={pair.product.missingId} />
                ) : (
                  <ProductRefLink product={pair.product} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
