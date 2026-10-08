'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Price } from '@/components/ui/Price';
import { QuantitySelector } from '@/components/ui/QuantitySelector';
import { cn } from '@/lib/cn';
import { formatPieces } from '@/lib/format';
import { useCartQuantity } from '@/lib/store/cart';

import { AddToCartButton } from './AddToCartButton';
import { FavoriteButton } from './FavoriteButton';

/**
 * Покупка на странице товара (DESIGN § R.8): количество → «В корзину» (прибавляет выбранное
 * количество к уже лежащему) → закладка; ниже — «В корзине: N шт. · Перейти в корзину».
 * Позиции «по запросу» добавляются так же — цену уточнит менеджер.
 *
 * Строка состояния — live-регион (`role="status"`), поэтому она есть в разметке всегда, а
 * наполняется только когда товар в корзине: появление нового узла с ролью скринридеры не
 * объявляют. До чтения корзины из localStorage количество — 0 (как на сервере), гидратация не
 * расходится.
 *
 * Все три контрола — размер lg: 48 px с рамкой на всех ширинах, верх и низ ряда совпадают.
 *
 * На < lg, когда ряд покупки ушёл вверх за край экрана, снизу появляется липкая панель «цена ·
 * В корзину» с тем же количеством. Пока ряд виден, панели нет вовсе (`hidden`): на экране и в
 * дереве доступности одна кнопка «В корзину».
 */
export function ProductPurchase({
  productId,
  productName,
  price,
  className,
}: {
  productId: string;
  productName: string;
  /** Копейки; null — по запросу. Для липкой панели на < lg. */
  price: number | null;
  className?: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const inCart = useCartQuantity(productId);
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowAbove, setRowAbove] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      // Только ушедший вверх: ниже края экрана ряд ещё впереди — панель не нужна.
      setRowAbove(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={className}>
      <div ref={rowRef} className="flex flex-wrap items-center gap-2 sm:gap-3">
        <QuantitySelector
          value={quantity}
          onChange={setQuantity}
          productName={productName}
          size="lg"
        />
        <AddToCartButton
          productId={productId}
          productName={productName}
          quantity={quantity}
          variant="primary"
          size="lg"
          mode="add-more"
          compactOnMobile
          className="flex-1 sm:flex-none sm:px-8"
        />
        <FavoriteButton productId={productId} size="lg" variant="secondary" />
      </div>
      <p
        role="status"
        data-testid="product-in-cart"
        className={cn('text-small text-ink', inCart > 0 && 'mt-3')}
      >
        {inCart > 0 ? (
          <>
            В корзине: {formatPieces(inCart)} ·{' '}
            <Link href="/cart" className="text-link font-medium">
              Перейти в корзину
            </Link>
          </>
        ) : null}
      </p>

      <div
        hidden={!rowAbove}
        data-print="hidden"
        className="fixed inset-x-0 bottom-0 z-sticky bg-surface shadow-sticky lg:hidden"
      >
        <div className="page-container flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-caption text-ink-muted">{productName}</p>
            <Price amount={price} size="md" requestForm="compact" />
          </div>
          <AddToCartButton
            productId={productId}
            productName={productName}
            quantity={quantity}
            variant="primary"
            size="lg"
            mode="add-more"
            className="shrink-0"
          />
        </div>
      </div>
    </div>
  );
}
