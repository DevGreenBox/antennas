import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { ImportReport } from '@/types/catalog';

/**
 * Сводка отчёта импорта (DESIGN §2.20 п.3): `dl` сеткой, `dt` подпись, `dd` число. Все числа — из
 * `ImportReport.counts`, руками не вписываются. Строки «Товарных строк», «Проблемы» и «Отправлено
 * на проверку» занимают две колонки: в них разбивка, а не одно число.
 *
 * Вид — DESIGN § R, как указатель категорий главной: одна рамка, ячейки разделены зазором 1 px на
 * фоне `line` (`gap-px bg-line`), а не отдельными карточками. Сетка всегда заполнена без пустот
 * (1 / 2 / 4 колонки, широкие ячейки — `grid-flow-dense`), иначе пустая ячейка залилась бы цветом
 * линии.
 */
export function ImportSummary({ counts }: { counts: ImportReport['counts'] }) {
  const { productRows, issuesBySeverity } = counts;
  const issuesTotal = issuesBySeverity.conflict + issuesBySeverity.review + issuesBySeverity.info;
  return (
    <div>
      <dl className="grid grid-flow-dense gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <SummaryItem label="Строк прочитано" note="непустых, с заголовками и примечаниями">
          {counts.rowsRead}
        </SummaryItem>
        <SummaryItem
          label="Товарных строк (лист 1 / лист 2)"
          wide
          note={`лист 1: B/C ${productRows.byBlock['B/C']} · E/F ${productRows.byBlock['E/F']} · H/I ${productRows.byBlock['H/I']}; лист 2: C/D ${productRows.byBlock['C/D']}`}
        >
          <span data-testid="rows-sheet-1">{productRows.bySheet['1']}</span>
          <Muted> / </Muted>
          <span data-testid="rows-sheet-2">{productRows.bySheet['2']}</span>
          <Muted> = </Muted>
          <span data-testid="rows-total">{productRows.total}</span>
        </SummaryItem>
        <SummaryItem label="Заголовков исключено" note="не стали товарами">
          {counts.headersExcluded}
        </SummaryItem>
        <SummaryItem label="Примечаний" note="групповые, не товары">
          {counts.notes}
        </SummaryItem>
        <SummaryItem label="Товаров создано" note="в витрине — лист 1 и уникальные строки листа 2">
          <span data-testid="products-created">{counts.productsCreated}</span>
        </SummaryItem>
        <SummaryItem label="Повторов объединено" note="второе происхождение у того же товара">
          {counts.mergedDuplicates}
        </SummaryItem>
        <SummaryItem label="Конфликтов листа 2" note="строки сохранены, карточки не созданы">
          {counts.conflictsAttached}
        </SummaryItem>
        <SummaryItem
          label="Проблемы (конфликт / проверка / справочно)"
          wide
          note={`всего ${issuesTotal}`}
        >
          {issuesBySeverity.conflict}
          <Muted> / </Muted>
          {issuesBySeverity.review}
          <Muted> / </Muted>
          {issuesBySeverity.info}
        </SummaryItem>
        <SummaryItem
          label="Отправлено на проверку (товаров / строк прайса)"
          wide
          note="товары с проблемой «конфликт» или «проверка» / строки с любой проблемой"
        >
          {counts.productsWithReviewIssues}
          <Muted> / </Muted>
          {counts.sourceRowsWithIssues}
        </SummaryItem>
      </dl>
      <p className="mt-4 text-small text-ink-secondary">
        Сверка: товарные строки ({productRows.total}) − повторы ({counts.mergedDuplicates}) −
        конфликтные строки листа 2 ({counts.conflictsAttached}) ={' '}
        <span className="font-semibold text-ink">
          {productRows.total - counts.mergedDuplicates - counts.conflictsAttached}
        </span>{' '}
        {productRows.total - counts.mergedDuplicates - counts.conflictsAttached ===
        counts.productsCreated
          ? '— совпадает с числом созданных товаров.'
          : `— не совпадает с числом созданных товаров (${counts.productsCreated}).`}
      </p>
    </div>
  );
}

function SummaryItem({
  label,
  note,
  wide = false,
  children,
}: {
  label: string;
  note?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col bg-surface p-4 lg:p-5', wide ? 'sm:col-span-2' : null)}>
      <dt className="text-small text-ink-secondary">{label}</dt>
      <dd className="order-first mb-2 text-heading tabular-nums">{children}</dd>
      {note ? <dd className="mt-1 text-caption text-ink-muted">{note}</dd> : null}
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-ink-muted">{children}</span>;
}
