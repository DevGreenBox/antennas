'use client';

import Link from 'next/link';

import { INFERRED_FOOTNOTE, StatusValue, TechText } from '@/components/product/SpecLine';
import { Badge } from '@/components/ui/Badge';
import { Price } from '@/components/ui/Price';
import { formatPrice } from '@/lib/catalog';
import { displayedQuote, orderItemSpec, specPointsOf } from '@/lib/demo-orders';
import { lineTotal } from '@/lib/demo-pricing';
import { formatPieces } from '@/lib/format';
import type { Product } from '@/types/catalog';
import type { DemoOrder, OrderSpecPoint } from '@/types/order';

/**
 * Состав заказа (DESIGN §3.8, §5.9.30), только чтение. До первой версии согласования — снимок
 * заявки (`order.items`), после — строки действующей версии (или последней аннулированной).
 * Названия, коды и характеристики — из снимка: изменения каталога историю не меняют. Ссылка на
 * товар — только если он ещё есть в каталоге.
 *
 * Характеристики показываются со статусами значений (§4.10), как в каталоге: inferred — «*» и
 * сноска под составом, needs-review — «Уточняется». Та же разметка попадает в печатную сводку.
 */

interface ItemRow {
  key: string;
  name: string;
  code: string;
  spec: OrderSpecPoint[];
  /** Адрес товара, если он есть в каталоге. */
  href: string | null;
  /** null — «по запросу». */
  unitPrice: number | null;
  quantity: number;
  /** null — «уточнит менеджер». */
  total: number | null;
  /** «в заявке: …» — цена согласована и отличается от снимка. */
  snapshotNote: string | null;
  addedByManager: boolean;
}

function buildRows(order: DemoOrder, productsById: ReadonlyMap<string, Product>) {
  const quote = displayedQuote(order);
  const hrefFor = (productId: string) => {
    const product = productsById.get(productId);
    return product ? `/product/${product.slug}` : null;
  };
  if (quote === null) {
    const rows: ItemRow[] = order.items.map((item) => ({
      key: item.lineId,
      name: item.name,
      code: item.code,
      spec: orderItemSpec(item, productsById.get(item.productId)),
      href: hrefFor(item.productId),
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      total: lineTotal(item),
      snapshotNote: null,
      addedByManager: false,
    }));
    return { rows, removed: [] as { name: string; quantity: number }[] };
  }
  const snapshots = new Map(order.items.map((item) => [item.lineId, item]));
  const rows: ItemRow[] = quote.lines.map((line) => {
    const snapshot = line.origin === 'request' ? snapshots.get(line.lineId) : undefined;
    const catalogProduct = productsById.get(line.productId);
    const snapshotNote =
      snapshot !== undefined && snapshot.unitPrice !== line.unitPrice
        ? `в заявке: ${snapshot.unitPrice === null ? 'по запросу' : formatPrice(snapshot.unitPrice)}`
        : null;
    return {
      key: line.lineId,
      name: snapshot?.name ?? line.name,
      code: snapshot?.code ?? line.code,
      // У добавленной менеджером позиции снимка заявки нет — параметры из каталога, если есть.
      spec:
        snapshot !== undefined
          ? orderItemSpec(snapshot, catalogProduct)
          : catalogProduct
            ? specPointsOf(catalogProduct)
            : [],
      href: hrefFor(line.productId),
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      total: line.lineTotal,
      snapshotNote,
      addedByManager: line.origin === 'added-by-manager',
    };
  });
  const removed = quote.removedLineIds.flatMap((lineId) => {
    const item = snapshots.get(lineId);
    return item ? [{ name: item.name, quantity: item.quantity }] : [];
  });
  return { rows, removed };
}

function NameCell({ row }: { row: ItemRow }) {
  return (
    <div className="min-w-0">
      {row.href ? (
        <Link
          href={row.href}
          className="text-body font-semibold text-ink decoration-1 underline-offset-[0.2em] hover:underline"
        >
          <TechText text={row.name} />
        </Link>
      ) : (
        <span className="text-body font-semibold text-ink">
          <TechText text={row.name} />
        </span>
      )}
      <p className="mt-0.5 font-mono text-caption text-ink-muted">{row.code}</p>
      {row.spec.length > 0 ? (
        <p className="mt-0.5 text-caption text-ink-secondary">
          {row.spec.map((point, index) => (
            <span key={index}>
              {index > 0 ? ' · ' : null}
              <StatusValue text={point.text} status={point.status} note={point.note} />
            </span>
          ))}
        </p>
      ) : null}
      {row.addedByManager ? (
        <p className="mt-1 text-caption text-ink-muted">Добавлено менеджером</p>
      ) : null}
    </div>
  );
}

function UnitPriceCell({ row }: { row: ItemRow }) {
  return (
    <>
      {row.unitPrice === null ? (
        <Badge tone="neutral">По запросу</Badge>
      ) : (
        <Price amount={row.unitPrice} size="sm" />
      )}
      {row.snapshotNote ? (
        <p className="mt-0.5 text-caption whitespace-nowrap text-ink-muted">{row.snapshotNote}</p>
      ) : null}
    </>
  );
}

function TotalCell({ row }: { row: ItemRow }) {
  return row.total === null ? (
    <span className="text-small text-ink-secondary">уточнит менеджер</span>
  ) : (
    <Price amount={row.total} size="md" />
  );
}

/** Шапка таблицы — подписи как `spec-label` (DESIGN § R.3), без заливки; строки — линии 1 px. */
const TH =
  'pb-2 px-3 text-left text-caption font-normal text-ink-muted whitespace-nowrap border-b border-line';

export function OrderItemsTable({
  order,
  productsById,
}: {
  order: DemoOrder;
  productsById: ReadonlyMap<string, Product>;
}) {
  const { rows, removed } = buildRows(order, productsById);
  const hasInferred = rows.some((row) => row.spec.some((point) => point.status === 'inferred'));
  return (
    <div>
      <table className="hidden w-full text-small md:table">
        <caption className="sr-only">Состав заказа {order.number}</caption>
        <thead>
          <tr>
            <th scope="col" className={`${TH} pl-0`}>
              Товар
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Цена
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Кол-во
            </th>
            <th scope="col" className={`${TH} pr-0 text-right`}>
              Сумма
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line-subtle last:border-line">
              <td className="py-3.5 pr-3 pl-0 align-top">
                <NameCell row={row} />
              </td>
              <td className="px-3 py-3.5 text-right align-top">
                <UnitPriceCell row={row} />
              </td>
              <td className="px-3 py-3.5 text-right align-top whitespace-nowrap tabular-nums">
                {formatPieces(row.quantity)}
              </td>
              <td className="py-3.5 pr-0 pl-3 text-right align-top whitespace-nowrap">
                <TotalCell row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line-subtle border-y border-line md:hidden">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-col gap-2 py-4">
            <NameCell row={row} />
            <div className="flex items-start justify-between gap-3 text-small">
              <div>
                <p className="flex flex-wrap items-center gap-x-1.5">
                  {row.unitPrice === null ? (
                    <Badge tone="neutral">По запросу</Badge>
                  ) : (
                    <Price amount={row.unitPrice} size="sm" />
                  )}
                  <span className="text-ink-secondary">× {formatPieces(row.quantity)}</span>
                </p>
                {row.snapshotNote ? (
                  <p className="mt-0.5 text-caption text-ink-muted">{row.snapshotNote}</p>
                ) : null}
              </div>
              <TotalCell row={row} />
            </div>
          </li>
        ))}
      </ul>

      {removed.length > 0 ? (
        <p className="mt-3 text-small text-ink-secondary">
          Исключено при согласовании:{' '}
          {removed.map((item) => `${item.name} × ${formatPieces(item.quantity)}`).join(', ')}
        </p>
      ) : null}
      {hasInferred ? <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p> : null}
    </div>
  );
}
