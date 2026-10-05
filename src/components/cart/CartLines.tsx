'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CategoryGlyph } from '@/components/ui/CategoryGlyph';
import { IconButton } from '@/components/ui/IconButton';
import { Price } from '@/components/ui/Price';
import { QuantitySelector } from '@/components/ui/QuantitySelector';
import { lineTotal } from '@/lib/demo-pricing';
import { useCart } from '@/lib/store/cart';
import { toast } from '@/lib/store/toast';
import type { Product } from '@/types/catalog';

import { toPricedLine } from './cart-model';
import type { CartLine } from './cart-model';

/**
 * Строки корзины (DESIGN §5.9.27): ≥ md — таблица, < md — карточки. Количество меняется сразу
 * (ввод с клавиатуры — через 300 мс); удаление — Toast «Позиция удалена» с «Вернуть».
 * Недоступная позиция — «Позиция больше недоступна» и «Убрать».
 */

const TH =
  'py-2.5 px-3 text-left font-medium text-ink-muted whitespace-nowrap border-b border-line';

function useRemoveLine() {
  const remove = useCart((state) => state.remove);
  const restore = useCart((state) => state.restore);
  return (productId: string, onRemoved?: () => void) => {
    const removed = remove(productId);
    if (removed === null) return;
    onRemoved?.();
    toast({
      message: 'Позиция удалена',
      action: { label: 'Вернуть', onAction: () => restore(removed.item, removed.index) },
    });
  };
}

function ProductThumb({ product }: { product: Product }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-ink-muted">
      <CategoryGlyph categoryId={product.categoryPath[0]} size={24} />
    </span>
  );
}

function UnitPrice({ product }: { product: Product }) {
  if (product.priceType !== 'fixed' || product.price === null) {
    return <Badge tone="neutral">По запросу</Badge>;
  }
  return <Price amount={product.price} size="sm" />;
}

function LineSum({ line }: { line: CartLine }) {
  const total = lineTotal(toPricedLine(line));
  if (total === null) {
    return <span className="text-small text-ink-secondary">уточнит менеджер</span>;
  }
  return <Price amount={total} size="md" />;
}

export function CartLines({
  lines,
  onLineRemoved,
}: {
  lines: readonly CartLine[];
  /** После удаления строки — вернуть фокус в понятное место (строк стало меньше). */
  onLineRemoved?: () => void;
}) {
  const setQuantity = useCart((state) => state.setQuantity);
  const removeLine = useRemoveLine();

  return (
    <>
      <table className="hidden w-full text-small md:table">
        <caption className="sr-only">Позиции корзины</caption>
        <thead>
          <tr>
            <th scope="col" className={`${TH} pl-0`}>
              Товар
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Цена
            </th>
            <th scope="col" className={TH}>
              Количество
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Сумма
            </th>
            <th scope="col" className={`${TH} pr-0`}>
              <span className="sr-only">Удалить</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) =>
            line.product === null ? (
              <tr key={line.item.productId} className="border-b border-line-subtle">
                <td colSpan={4} className="py-3 pr-3 pl-0 align-middle text-ink-secondary">
                  Позиция больше недоступна
                </td>
                <td className="py-3 pr-0 pl-3 text-right align-middle">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => removeLine(line.item.productId, onLineRemoved)}
                  >
                    Убрать
                  </Button>
                </td>
              </tr>
            ) : (
              <tr key={line.item.productId} className="border-b border-line-subtle">
                <td className="py-3 pr-3 pl-0 align-top">
                  <div className="flex items-start gap-3">
                    <ProductThumb product={line.product} />
                    <div className="min-w-0">
                      <Link
                        href={`/product/${line.product.slug}`}
                        className="text-body font-medium text-ink hover:underline"
                      >
                        {line.product.name}
                      </Link>
                      <p className="mt-0.5 font-mono text-caption text-ink-muted">
                        {line.product.code}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right align-top whitespace-nowrap">
                  <UnitPrice product={line.product} />
                </td>
                <td className="px-3 py-3 align-top">
                  <QuantitySelector
                    size="sm"
                    value={line.item.quantity}
                    productName={line.product.name}
                    commitDelayMs={300}
                    onChange={(quantity) => setQuantity(line.item.productId, quantity)}
                  />
                </td>
                <td className="px-3 py-3 text-right align-top whitespace-nowrap">
                  <LineSum line={line} />
                </td>
                <td className="py-3 pr-0 pl-3 text-right align-top">
                  <IconButton
                    icon="trash-2"
                    size="sm"
                    label={`Удалить «${line.product.name}» из корзины`}
                    onClick={() => removeLine(line.item.productId, onLineRemoved)}
                  />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      <ul className="border-t border-line-subtle md:hidden">
        {lines.map((line) =>
          line.product === null ? (
            <li
              key={line.item.productId}
              className="flex items-center justify-between gap-3 border-b border-line-subtle py-4"
            >
              <span className="text-small text-ink-secondary">Позиция больше недоступна</span>
              <Button
                variant="link"
                size="sm"
                onClick={() => removeLine(line.item.productId, onLineRemoved)}
              >
                Убрать
              </Button>
            </li>
          ) : (
            <li
              key={line.item.productId}
              className="flex flex-col gap-3 border-b border-line-subtle py-4"
            >
              <div className="flex items-start gap-3">
                <ProductThumb product={line.product} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/product/${line.product.slug}`}
                    className="text-body font-medium text-ink hover:underline"
                  >
                    {line.product.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-muted">
                    <span className="font-mono">{line.product.code}</span>
                    <span aria-hidden>·</span>
                    <span className="flex items-center gap-1">
                      <span>Цена за шт.:</span>
                      <UnitPrice product={line.product} />
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <QuantitySelector
                  size="md"
                  value={line.item.quantity}
                  productName={line.product.name}
                  commitDelayMs={300}
                  onChange={(quantity) => setQuantity(line.item.productId, quantity)}
                />
                <div className="ml-auto text-right">
                  <LineSum line={line} />
                </div>
                <IconButton
                  icon="trash-2"
                  size="lg"
                  label={`Удалить «${line.product.name}» из корзины`}
                  onClick={() => removeLine(line.item.productId, onLineRemoved)}
                />
              </div>
            </li>
          ),
        )}
      </ul>
    </>
  );
}
