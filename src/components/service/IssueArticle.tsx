import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { ImportIssue, IssueFieldDiff } from '@/types/catalog';

import { LiteralText } from './LiteralText';
import { CellChips, MissingProductRef, ProductRefLink } from './ReportLinks';
import { SEVERITY_SHORT, SEVERITY_TONE } from './labels';
import type { ProductRef } from './labels';

/**
 * Проблема импорта (DESIGN §2.20 п.5): `article` с рамкой — заголовок, код `font-mono`, пояснение,
 * чипы ячеек (якоря строк в таблице прайса), ссылки на товары. У `sheet-conflict` — построчное
 * сравнение листов из `ImportIssue.fields`: расхождение отмечено «≠» и начертанием значений,
 * подсветка строки — только дополнение (DESIGN §7 «не только цвет»).
 */

/** Сколько товаров показывать сразу; длинный список (E57 — 43 товара) сворачивается. */
const PRODUCTS_INLINE = 6;

export interface IssueArticleProps {
  issue: ImportIssue;
  /** Адреса ячеек строк-источников (`1!B4`) в порядке `issue.sourceIds`. */
  cells: readonly string[];
  /** Товары в порядке `issue.productIds`: ссылка или id скрытого товара. */
  products: readonly (ProductRef | { missingId: string })[];
}

export function IssueArticle({ issue, cells, products }: IssueArticleProps) {
  const titleId = `issue-${issue.id}-title`;
  return (
    <article
      id={`issue-${issue.id}`}
      aria-labelledby={titleId}
      className="flex-1 scroll-mt-4 rounded-md border border-line bg-surface p-4 target:border-ink lg:p-5"
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <h3 id={titleId} className="min-w-0 flex-1 basis-64">
          {issue.title}
        </h3>
        <Badge tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_SHORT[issue.severity]}</Badge>
      </header>
      <p className="mt-1 font-mono text-caption break-all text-ink-muted">
        {issue.code} · {issue.id}
      </p>
      <p className="mt-3 max-w-text text-small text-ink-secondary">{issue.details}</p>

      {issue.fields && issue.fields.length > 0 ? (
        <ConflictComparison
          fields={issue.fields}
          sheet1Cell={cells[0] ?? null}
          sheet2Cell={cells[1] ?? null}
          caption={`Сравнение строк листа 1 и листа 2: ${issue.title}`}
        />
      ) : null}

      <dl className="mt-4 grid gap-x-4 gap-y-3 text-small sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-ink-secondary sm:pt-0.5">
          {cells.length === 1 ? 'Ячейка' : `Ячейки (${cells.length})`}
        </dt>
        <dd>
          <CellChips cells={cells} />
        </dd>
        {products.length > 0 ? (
          <>
            <dt className="text-ink-secondary">
              {products.length === 1 ? 'Товар' : `Товары (${products.length})`}
            </dt>
            <dd>
              <ProductList products={products} />
            </dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}

function ProductList({ products }: { products: IssueArticleProps['products'] }) {
  const items = (list: IssueArticleProps['products']) => (
    <ul className="flex flex-col gap-1">
      {list.map((product) =>
        'missingId' in product ? (
          <li key={product.missingId}>
            <MissingProductRef id={product.missingId} />
          </li>
        ) : (
          <li key={product.id}>
            <ProductRefLink product={product} />
          </li>
        ),
      )}
    </ul>
  );
  if (products.length <= PRODUCTS_INLINE) return items(products);
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-small font-medium text-ink underline decoration-1 underline-offset-[0.2em] hover:decoration-2 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Показать все ({products.length})</span>
        <span className="hidden group-open:inline">Свернуть</span>
      </summary>
      <div className="mt-2">{items(products)}</div>
    </details>
  );
}

/** Таблица «Поле · Лист 1 · Лист 2 · ≠» (DESIGN §2.20 п.5). */
export function ConflictComparison({
  fields,
  sheet1Cell,
  sheet2Cell,
  caption,
}: {
  fields: readonly IssueFieldDiff[];
  sheet1Cell: string | null;
  sheet2Cell: string | null;
  caption: string;
}) {
  // < sm таблица перестраивается в строки «поле ≠ / Лист 1: … / Лист 2: …» (CSS-сетка у tr):
  // четыре колонки на 320–390 px не помещаются, а прокрутка прятала бы как раз лист 2.
  return (
    <div className="relative mt-4 overflow-x-auto rounded-sm border border-line">
      <table className="w-full text-small sm:min-w-[34rem] sm:table-fixed">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-subtle text-left text-ink-secondary max-sm:sr-only">
          <tr className="border-b border-line">
            <th scope="col" className="w-36 px-3 py-2 font-medium">
              Поле
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Лист 1{sheet1Cell ? <span className="font-mono"> · {sheet1Cell}</span> : null}
              <span className="block text-caption font-normal text-ink-muted">в витрине</span>
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Лист 2{sheet2Cell ? <span className="font-mono"> · {sheet2Cell}</span> : null}
              <span className="block text-caption font-normal text-ink-muted">
                сохранено для сопоставления
              </span>
            </th>
            <th scope="col" className="w-12 px-3 py-2 text-center font-medium">
              <span aria-hidden>≠</span>
              <span className="sr-only">Расходится</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr
              key={field.field}
              data-differs={field.differs || undefined}
              className={cn(
                'border-b border-line-subtle align-top last:border-b-0',
                'max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:py-1.5',
                field.differs ? 'bg-warning-subtle' : null,
              )}
            >
              <th
                scope="row"
                className="px-3 py-2 text-left font-normal text-ink-secondary max-sm:pb-0.5"
              >
                {field.label}
              </th>
              <FieldValue
                sheet="1"
                value={field.sheet1}
                differs={field.differs}
                raw={field.field === 'rawText'}
              />
              <FieldValue
                sheet="2"
                value={field.sheet2}
                differs={field.differs}
                raw={field.field === 'rawText'}
              />
              <td className="px-3 py-2 text-center max-sm:col-start-2 max-sm:row-start-1 max-sm:pb-0.5">
                {field.differs ? (
                  <>
                    <span aria-hidden className="font-semibold text-ink">
                      ≠
                    </span>
                    <span className="sr-only">да</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden className="text-ink-muted">
                      =
                    </span>
                    <span className="sr-only">нет</span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldValue({
  sheet,
  value,
  differs,
  raw,
}: {
  sheet: '1' | '2';
  value: string | null;
  differs: boolean;
  /** Исходный текст строки — буквально, моноширинно. */
  raw: boolean;
}) {
  return (
    <td
      className={cn(
        'px-3 py-2 text-ink max-sm:col-span-2 max-sm:flex max-sm:gap-2 max-sm:py-0.5',
        differs ? 'font-semibold' : null,
      )}
    >
      {/* Подпись листа видна только в построчной раскладке; скринридер берёт её из thead. */}
      <span aria-hidden className="w-14 shrink-0 font-normal text-ink-muted sm:hidden">
        Лист {sheet}
      </span>
      {value === null ? (
        <span className="font-normal text-ink-muted">
          <span aria-hidden>—</span>
          <span className="sr-only">не указано</span>
        </span>
      ) : raw ? (
        <LiteralText text={value} />
      ) : (
        value
      )}
    </td>
  );
}
