import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { CopyButton } from '@/components/service/CopyButton';
import { DuplicatesTable } from '@/components/service/DuplicatesTable';
import type { DuplicatePair } from '@/components/service/DuplicatesTable';
import { ImportSummary } from '@/components/service/ImportSummary';
import { IssueArticle } from '@/components/service/IssueArticle';
import { ServiceSection } from '@/components/service/ServiceSection';
import { SourceRecordsTable } from '@/components/service/SourceRecordsTable';
import type { SourceRow } from '@/components/service/source-filters';
import { SEVERITY_ORDER, SEVERITY_SECTION, cellRef } from '@/components/service/labels';
import type { ProductRef } from '@/components/service/labels';
import { Badge } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';
import { getAllIssues, getAllSourceRecords, getImportReport, getProducts } from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';
import type { ImportIssue, SourceRecord } from '@/types/catalog';

/**
 * Служебная страница «Отчёт импорта каталога» (DESIGN §2.20): счётчики, проблемы по серьёзности,
 * сравнение листов, повторы, все строки прайса с фильтрами, ручной слой. noindex, вне sitemap и
 * навигации шапки — ссылка только в подвале «Служебное». Статическая: данные берутся из
 * репозитория при сборке, фильтры таблицы работают в браузере.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Отчёт импорта каталога',
  description:
    'Служебная страница: как прайс из двух листов превратился в каталог — счётчики, конфликты ' +
    'листов, повторы, проблемы импорта и все строки источника.',
  path: '/import-report',
  robots: 'noindex',
});

const HASH_PREVIEW_LENGTH = 12;

/** Строка «Ручных правок»: подпись слева, число справа, тонкая линия снизу. */
const OVERRIDE_ROW =
  'grid gap-x-6 gap-y-1 border-b border-line-subtle py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]';

export default async function ImportReportPage() {
  const [report, records, issues, products] = await Promise.all([
    getImportReport(),
    getAllSourceRecords(),
    getAllIssues(),
    getProducts(),
  ]);

  const productRefs = new Map<string, ProductRef>(
    products.map((product) => [
      product.id,
      { id: product.id, code: product.code, name: product.name, href: `/product/${product.slug}` },
    ]),
  );
  const recordById = new Map(records.map((record) => [record.id, record]));
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));

  // Товар скрыт в overrides.json — в отчёте остаётся его id без ссылки.
  const productRefOrMissing = (id: string) => productRefs.get(id) ?? { missingId: id };
  const cellsOf = (issue: ImportIssue) =>
    issue.sourceIds.map((id) => {
      const record = recordById.get(id);
      return record ? cellRef(record) : id;
    });

  const rows: SourceRow[] = records.map((record) => ({
    id: record.id,
    sheet: record.sheet,
    block: record.block,
    cell: cellRef(record),
    nameCell: record.nameCell,
    priceCell: record.priceCell,
    rawText: record.rawText,
    rawPrice: record.rawPrice,
    kind: record.kind,
    resolution: record.resolution,
    product: record.productId ? (productRefs.get(record.productId) ?? null) : null,
    hiddenProductId:
      record.productId && !productRefs.has(record.productId) ? record.productId : null,
    issues: record.issueIds.flatMap((id) => {
      const issue = issueById.get(id);
      return issue ? [{ id: issue.id, severity: issue.severity, title: issue.title }] : [];
    }),
  }));

  const issuesBySeverity = Object.fromEntries(
    SEVERITY_ORDER.map((severity) => [
      severity,
      issues.filter((issue) => issue.severity === severity),
    ]),
  ) as Record<ImportIssue['severity'], ImportIssue[]>;

  const duplicatePairs = issues
    .filter((issue) => issue.code === 'duplicate-row')
    .flatMap((issue): DuplicatePair[] => {
      const linked = issue.sourceIds
        .map((id) => recordById.get(id))
        .filter((record): record is SourceRecord => record !== undefined);
      const duplicate = linked.find((record) => record.resolution === 'merged-duplicate');
      const original = linked.find((record) => record !== duplicate);
      if (!duplicate || !original) return [];
      return [
        {
          issueId: issue.id,
          duplicateCell: cellRef(duplicate),
          originalCell: cellRef(original),
          rawText: duplicate.rawText,
          rawPrice: duplicate.rawPrice,
          product: duplicate.productId ? productRefOrMissing(duplicate.productId) : null,
        },
      ];
    });

  const overrides = report.overrides;
  // Оглавление — в порядке секций на странице (DESIGN §2.20 п.4 + повторы, строки, ручной слой).
  const severityLink = (severity: ImportIssue['severity']) => ({
    href: `#${SEVERITY_SECTION[severity].anchor}`,
    label: `${SEVERITY_SECTION[severity].title} (${issuesBySeverity[severity].length})`,
  });
  const toc = [
    severityLink('conflict'),
    { href: '#duplicates', label: `Повторы строк (${duplicatePairs.length})` },
    severityLink('review'),
    severityLink('info'),
    { href: '#source-rows', label: `Все строки прайса (${records.length})` },
    { href: '#overrides', label: 'Ручные правки' },
  ];

  return (
    <>
      <PageHeader
        title="Отчёт импорта каталога"
        titleAddon={<Badge tone="neutral">Служебная страница</Badge>}
      />

      <dl className="max-w-[60rem] border-t border-line-subtle text-small">
        <MetaRow label="Файл-источник">
          <code className="font-mono break-all text-ink">{report.sourceFile}</code>
          <span className="text-ink-secondary">
            {' '}
            — выгрузка «список v11.xlsx», адреса ячеек сохранены
          </span>
        </MetaRow>
        <MetaRow label="sha256 источника" ddClassName="flex flex-wrap items-center gap-x-3 gap-y-1">
          <code className="font-mono text-ink" data-testid="source-hash">
            {report.sourceHash.slice(0, HASH_PREVIEW_LENGTH)}…
          </code>
          <CopyButton
            value={report.sourceHash}
            accessibleLabel="Скопировать sha256 источника полностью"
            successMessage="sha256 источника скопирован"
          />
        </MetaRow>
        <MetaRow label="Как получен" ddClassName="text-ink-secondary">
          Генерируется командой <code className="font-mono text-ink">npm run import:catalog</code>;
          повторный импорт того же файла даёт тот же результат.
        </MetaRow>
      </dl>

      <Notice tone="info" className="mt-6 max-w-text">
        Временная витрина = лист 1 + уникальные позиции листа 2. Назначение листов не подтверждено
        заказчиком; конфликтующие строки листа 2 сохранены и перечислены ниже.
      </Notice>

      <ReportSection id="summary" title="Сводка">
        <ImportSummary counts={report.counts} />
      </ReportSection>

      {/* Оглавление — одна строка: подпись eyebrow и ссылки на разделы с количествами, как
          «Служебное» в подвале. Без своих линий: следующий раздел начинается с линии. */}
      <nav
        aria-labelledby="report-toc-title"
        className="mt-10 flex flex-col gap-x-8 gap-y-3 lg:mt-12 lg:flex-row lg:items-baseline"
      >
        <h2 id="report-toc-title" className="eyebrow shrink-0">
          Разделы отчёта
        </h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-small">
          {toc.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="text-link">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ReportSection
        id={SEVERITY_SECTION.conflict.anchor}
        title={`Конфликты листов (${issuesBySeverity.conflict.length})`}
        description="Слева — строка листа 1, её показывает витрина; справа — строка листа 2, сохранённая для сопоставления. Победитель не выбран: назначение листов уточняется у заказчика."
      >
        <IssueList
          issues={issuesBySeverity.conflict}
          cellsOf={cellsOf}
          refOf={productRefOrMissing}
        />
      </ReportSection>

      <ReportSection
        id="duplicates"
        title={`Повторы строк (${duplicatePairs.length})`}
        description="Строка буквально повторяет другую строку того же блока — текстом и ценой. Вторая карточка не создана: у товара два происхождения."
      >
        <Notice tone="warning" title="Поправка к ТЗ" className="mb-6 max-w-text">
          ТЗ (§4 п.5) называет оригиналами повторов E49–E52 строки E44–E47. По выгрузке пары другие:
          E49 = E44, E50 = E46, E51 = E47, E52 = E48; у E45 (6300–6500 МГц) повтора нет. Диапазоны в
          ТЗ перечислены верно, неточен только диапазон ячеек. Импорт сопоставляет строки по тексту
          и цене, поэтому от адресов не зависит.
        </Notice>
        <DuplicatesTable pairs={duplicatePairs} />
      </ReportSection>

      <ReportSection
        id={SEVERITY_SECTION.review.anchor}
        title={`${SEVERITY_SECTION.review.title} (${issuesBySeverity.review.length})`}
        description="Значения сохранены как в прайсе и помечены для проверки: спорные единицы, неоднозначные разъёмы, повторы, пометки с неясным смыслом."
      >
        <IssueList
          issues={issuesBySeverity.review}
          cellsOf={cellsOf}
          refOf={productRefOrMissing}
          twoColumns
        />
      </ReportSection>

      <ReportSection
        id={SEVERITY_SECTION.info.anchor}
        title={`${SEVERITY_SECTION.info.title} (${issuesBySeverity.info.length})`}
        description="Решения импорта, о которых полезно знать: они не требуют исправления данных."
      >
        <IssueList
          issues={issuesBySeverity.info}
          cellsOf={cellsOf}
          refOf={productRefOrMissing}
          twoColumns
        />
      </ReportSection>

      <ReportSection
        id="source-rows"
        title={`Все строки прайса (${records.length})`}
        description="Каждая непустая строка обоих листов — товарные, заголовки и примечания. Текст и цена — буквально, как в ячейке."
      >
        <SourceRecordsTable rows={rows} />
      </ReportSection>

      <ReportSection
        id="overrides"
        title="Ручные правки"
        description={
          <>
            Ручной слой — <code className="font-mono text-ink">src/data/overrides.json</code>.
            Импорт накладывает его поверх разбора и никогда не перезаписывает.
          </>
        }
      >
        {overrides ? (
          <dl className="max-w-text border-t border-line-subtle text-small">
            <OverrideRow label="Скрыто из витрины" ids={overrides.hiddenProductIds} />
            <OverrideRow label="Переименовано" ids={overrides.renamedProductIds} />
            <OverrideRow label="Заданы фото" ids={overrides.imagesProductIds} />
            <OverrideRow
              label="Рекомендаций от менеджера"
              count={overrides.recommendationsApplied}
            />
            <OverrideRow
              label="Подтверждено связей из названий прайса"
              count={overrides.recommendationsApproved}
            />
            <OverrideRow label="Предупреждений" ids={overrides.warnings} plain />
            <div className={OVERRIDE_ROW}>
              <dt className="text-ink-secondary">sha256 overrides.json</dt>
              <dd className="flex flex-wrap items-center gap-x-3 sm:justify-end">
                {overrides.hash ? (
                  <>
                    <code className="font-mono text-ink">
                      {overrides.hash.slice(0, HASH_PREVIEW_LENGTH)}…
                    </code>
                    <CopyButton
                      value={overrides.hash}
                      accessibleLabel="Скопировать sha256 overrides.json полностью"
                      successMessage="sha256 overrides.json скопирован"
                    />
                  </>
                ) : (
                  <span className="text-ink-muted">файла нет</span>
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-small text-ink-muted">Сведений о ручном слое в отчёте нет.</p>
        )}
      </ReportSection>
    </>
  );
}

/** Раздел отчёта — общий `ServiceSection` служебных страниц (линия сверху, h2, описание). */
const ReportSection = ServiceSection;

/** Строка «подпись — значение» мета-блока над сводкой; разделители — тонкие линии. */
function MetaRow({
  label,
  ddClassName,
  children,
}: {
  label: string;
  ddClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-b border-line-subtle py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn('min-w-0', ddClassName)}>{children}</dd>
    </div>
  );
}

function IssueList({
  issues,
  cellsOf,
  refOf,
  twoColumns = false,
}: {
  issues: readonly ImportIssue[];
  cellsOf: (issue: ImportIssue) => string[];
  refOf: (id: string) => ProductRef | { missingId: string };
  /** Короткие карточки без таблиц — по две в ряд на ≥ lg; конфликты листов — в одну колонку. */
  twoColumns?: boolean;
}) {
  if (issues.length === 0) {
    return <p className="text-small text-ink-muted">Проблем этого уровня нет.</p>;
  }
  // Строки списка с тонкими разделителями, не карточки (DESIGN § R): в две колонки строки одного
  // ряда растягиваются до общей высоты, поэтому линии колонок совпадают.
  return (
    <ul
      className={cn(
        'grid gap-x-12 border-t border-line-subtle',
        twoColumns ? 'lg:grid-cols-2' : null,
      )}
    >
      {issues.map((issue) => (
        <li key={issue.id} className="flex min-w-0 flex-col border-b border-line-subtle">
          <IssueArticle
            issue={issue}
            cells={cellsOf(issue)}
            products={issue.productIds.map(refOf)}
          />
        </li>
      ))}
    </ul>
  );
}

function OverrideRow({
  label,
  ids,
  count,
  plain = false,
}: {
  label: string;
  ids?: readonly string[];
  count?: number;
  /** Строки предупреждений — обычным текстом, не моноширинным id. */
  plain?: boolean;
}) {
  const value = count ?? ids?.length ?? 0;
  return (
    <div className={OVERRIDE_ROW}>
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="tabular-nums text-ink sm:text-right">
        {value}
        {ids && ids.length > 0 ? (
          <ul className={cn('mt-1 text-left', plain ? null : 'font-mono text-caption')}>
            {ids.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        ) : null}
      </dd>
    </div>
  );
}
