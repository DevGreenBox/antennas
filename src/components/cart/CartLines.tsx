'use client';

import Link from 'next/link';

import { ProductMedia } from '@/components/product/ProductMedia';
import { ProductCode } from '@/components/product/ProductRow';
import { TechText } from '@/components/product/SpecLine';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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
 * Строки корзины (DESIGN §5.9.27, § R.7). Тот же язык, что у `ProductList`: строки между тонкими
 * линиями, без карточек и шапки таблицы — миниатюра (`ProductMedia variant="thumb"`) · название
 * и код, цена за штуку · количество, сумма строки, удаление.
 *
 * Раскладка — по ширине самого списка (container queries), а не окна: рядом со сводкой колонка
 * строк на 1024 px уже 36rem. Узкий список (< 40rem) — миниатюра 64 px рядом с названием, ряд
 * «количество · сумма · удалить» ниже на всю ширину; широкий — всё в одну строку, миниатюра 80 px.
 * Цели нажатия на < lg — 48 px (количество и «Удалить» одной высоты).
 *
 * Количество меняется сразу (ввод с клавиатуры — через 300 мс); удаление — Toast «Позиция
 * удалена» с «Вернуть». Недоступная позиция — «Позиция больше недоступна» и «Убрать».
 */

const ROW =
  'grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 py-4 @min-[40rem]:grid-cols-[5rem_minmax(0,1fr)_auto] @min-[40rem]:gap-x-6';
/** Ряд действий: на узком списке — во всю ширину под названием, на широком — правая колонка. */
const ACTIONS =
  'col-span-2 flex items-center gap-3 @min-[40rem]:col-span-1 @min-[40rem]:gap-5 @min-[40rem]:self-start';

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

function UnitPrice({ product }: { product: Product }) {
  if (product.priceType !== 'fixed' || product.price === null) {
    return <Badge tone="neutral">По запросу</Badge>;
  }
  return (
    <span className="text-small text-ink-secondary">
      <Price amount={product.price} size="sm" /> за шт.
    </span>
  );
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
    <ul className="@container divide-y divide-line border-y border-line">
      {lines.map((line) => {
        const { product, item } = line;
        if (product === null) {
          return (
            <li key={item.productId} className={ROW}>
              <span
                aria-hidden
                className="size-16 rounded-sm bg-surface-muted @min-[40rem]:size-20"
              />
              <p className="self-center text-body text-ink-secondary">Позиция больше недоступна</p>
              <div className={ACTIONS}>
                <Button
                  variant="secondary"
                  size="sm"
                  className="max-lg:h-11"
                  onClick={() => removeLine(item.productId, onLineRemoved)}
                >
                  Убрать
                </Button>
              </div>
            </li>
          );
        }
        const href = `/product/${product.slug}`;
        return (
          <li key={item.productId} className={ROW}>
            {/* Миниатюра — дубль ссылки-названия: вне порядка Tab и дерева доступности. */}
            <Link
              href={href}
              tabIndex={-1}
              aria-hidden
              className="block size-16 @min-[40rem]:size-20"
            >
              <ProductMedia product={product} variant="thumb" />
            </Link>

            <div className="min-w-0">
              <p className="text-body font-semibold">
                <Link
                  href={href}
                  className="text-ink decoration-1 underline-offset-[0.2em] hover:underline"
                >
                  <TechText text={product.name} />
                </Link>
              </p>
              <p className="mt-0.5 text-caption text-ink-muted">
                <ProductCode code={product.code} />
              </p>
              <p className="mt-2">
                <UnitPrice product={product} />
              </p>
            </div>

            <div className={ACTIONS}>
              <QuantitySelector
                size="md"
                value={item.quantity}
                productName={product.name}
                commitDelayMs={300}
                onChange={(quantity) => setQuantity(item.productId, quantity)}
              />
              {/* Ширина колонки суммы одна у всех строк — суммы стоят друг под другом. */}
              <div className="ml-auto min-w-[7.5rem] text-right @min-[40rem]:ml-0 @min-[40rem]:w-[8.5rem]">
                <LineSum line={line} />
              </div>
              <IconButton
                icon="trash-2"
                size="md"
                className="max-lg:size-12"
                label={`Удалить «${product.name}» из корзины`}
                onClick={() => removeLine(item.productId, onLineRemoved)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
