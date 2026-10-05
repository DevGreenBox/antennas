'use client';

import Link from 'next/link';
import { useState } from 'react';

import { QuantitySelector } from '@/components/ui/QuantitySelector';
import { cn } from '@/lib/cn';
import { formatPieces } from '@/lib/format';
import { useCartQuantity } from '@/lib/store/cart';

import { AddToCartButton } from './AddToCartButton';
import { FavoriteButton } from './FavoriteButton';

/**
 * Покупка на странице товара (DESIGN §2.6 п.7): количество → «В корзину» (прибавляет выбранное
 * количество к уже лежащему) → закладка; ниже — «В корзине: N шт. · Перейти в корзину».
 * Позиции «по запросу» добавляются так же — цену уточнит менеджер.
 *
 * Строка состояния — live-регион (`role="status"`), поэтому она есть в разметке всегда, а
 * наполняется только когда товар в корзине: появление нового узла с ролью скринридеры не
 * объявляют. До чтения корзины из localStorage количество — 0 (как на сервере), гидратация не
 * расходится.
 *
 * На мобильном — одной строкой: количество + «В корзину» на остаток ширины + закладка.
 * Все три — размер lg: 48 px с рамкой на всех ширинах, верх и низ ряда совпадают (§5.9.5, §5.9.6,
 * §5.9.26 — одна шкала 32/40/48).
 */
export function ProductPurchase({
  productId,
  productName,
  className,
}: {
  productId: string;
  productName: string;
  className?: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const inCart = useCartQuantity(productId);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
          className="flex-1 sm:flex-none"
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
    </div>
  );
}
