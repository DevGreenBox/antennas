import Link from 'next/link';

import { ProductBandScale } from '@/components/ui/BandScale';
import { Price } from '@/components/ui/Price';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/catalog';

import { AddToCartButton } from './AddToCartButton';
import { FavoriteButton } from './FavoriteButton';
import { ProductMedia } from './ProductMedia';
import { ProductCode } from './ProductRow';
import { SpecLine, TechText } from './SpecLine';

/**
 * Карточка товара — плитка (DESIGN § R.7): главная, вид «Плитка» каталога, «К этому товару
 * подойдёт». Сверху вниз: медиа 4:3 (фото или заглушка) → категория → название → код →
 * ключевые параметры (`getSpecLine`) и шкала частоты → цена → «В корзину» + закладка.
 *
 * Карточка целиком не ссылка: ссылка — название; медиа — её дубль вне Tab и дерева доступности.
 * Рамка 1 px и радиус 6 px, без тени; при наведении темнеет рамка.
 *
 *   <ProductCard product={p} />                                   // плитка категории
 *   <ProductCard product={p} categoryName="Рупорные" />           // смешанный вариант
 *
 * Кнопки на < lg — цель нажатия 44 px, на десктопе — 40.
 */
export interface ProductCardProps {
  product: Product;
  /** Листовая категория над названием. */
  categoryName?: string;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

export function ProductCard({
  product,
  categoryName,
  headingLevel = 'h3',
  className,
}: ProductCardProps) {
  const Heading = headingLevel;
  const href = `/product/${product.slug}`;
  return (
    <article
      className={cn(
        'group/card flex flex-col overflow-hidden rounded-md border border-line bg-surface transition-colors duration-fast hover:border-line-emphasis',
        className,
      )}
    >
      <Link href={href} tabIndex={-1} aria-hidden className="block border-b border-line-subtle">
        <ProductMedia
          product={product}
          variant="card"
          className="transition-opacity duration-fast group-hover/card:opacity-85"
        />
      </Link>
      <div className="flex flex-1 flex-col p-4 lg:p-5">
        {categoryName ? (
          <p className="mb-1.5 text-caption text-ink-muted">
            <TechText text={categoryName} />
          </p>
        ) : null}
        <Heading className="text-body font-semibold">
          <Link href={href} className="decoration-1 underline-offset-[0.2em] hover:underline">
            <TechText text={product.name} />
          </Link>
        </Heading>
        <p className="mt-0.5 text-caption text-ink-muted">
          <ProductCode code={product.code} />
        </p>
        <SpecLine product={product} variant="list" className="mt-4" />
        <ProductBandScale product={product} size="sm" className="mt-3 max-w-48" />
        <div className="mt-auto flex flex-col gap-3 pt-5">
          <Price amount={product.priceType === 'fixed' ? product.price : null} size="lg" />
          <div className="flex items-center gap-1.5">
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              size="md"
              className="flex-1 max-lg:h-11"
            />
            <FavoriteButton
              productId={product.id}
              productName={product.name}
              size="md"
              variant="secondary"
              className="max-lg:size-11"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
