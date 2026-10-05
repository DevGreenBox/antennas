import Link from 'next/link';

import { ProductBandScale } from '@/components/ui/BandScale';
import { NoPhoto } from '@/components/ui/NoPhoto';
import { Price } from '@/components/ui/Price';
import { rootCategoryOf } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/catalog';

import { AddToCartButton } from './AddToCartButton';
import { FavoriteButton } from './FavoriteButton';
import { ProductPhoto } from './ProductPhoto';
import { ProductCode } from './ProductRow';
import { SpecLine, TechText } from './SpecLine';

/**
 * Карточка товара — плитка (DESIGN §5.9.22). Карточка целиком не ссылка: ссылка — название.
 * Сверху вниз: [фото 4:3, если есть] → мета (значок категории NoPhoto `thumb`, если фото нет;
 * код; в смешанном варианте перед ним листовая категория) → название → ключевые характеристики
 * (`getSpecLine`) → BandScale → цена → «В корзину» + закладка.
 *
 * Без фото заглушка — значок 40 px в строке мета, а не плашка 4:3: серый блок занимал ~40 %
 * карточки и отодвигал название, характеристики и цену.
 *
 * Кнопки на < lg — цель нажатия 44 px (§5.7), на десктопе — sm 32: `max-lg:min-*` не спорит с
 * размером кнопки.
 *
 *   <ProductCard product={p} />                                   // плитка каталога (view=grid)
 *   <ProductCard product={p} categoryName="Рупорные" />           // смешанный вариант (поиск, весь каталог)
 *   <ProductCard product={p} variant="compact" />                 // рекомендации: без фото и значка
 *
 * Сетки — ResultsGrid (§4.7): `grid gap-4 lg:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`.
 */
export interface ProductCardProps {
  product: Product;
  variant?: 'default' | 'compact';
  /** Листовая категория в мете — смешанный вариант (каталог целиком, поиск). */
  categoryName?: string;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

export function ProductCard({
  product,
  variant = 'default',
  categoryName,
  headingLevel = 'h3',
  className,
}: ProductCardProps) {
  const Heading = headingLevel;
  const full = variant === 'default';
  const photo = full ? (product.images[0] ?? null) : null;
  return (
    <article
      className={cn(
        'relative flex flex-col gap-3 rounded-md border border-line bg-surface p-4 transition-colors duration-fast hover:border-line-strong',
        className,
      )}
    >
      {photo !== null ? (
        <ProductPhoto
          src={photo}
          alt={product.name}
          sizes="(min-width: 80rem) 25vw, (min-width: 40rem) 50vw, 100vw"
        />
      ) : null}
      <div className="flex items-center gap-3">
        {full && photo === null ? <NoPhoto categoryId={rootCategoryOf(product)} /> : null}
        <p className="min-w-0 text-caption text-ink-muted">
          {categoryName ? <>{categoryName} · </> : null}
          <ProductCode code={product.code} />
        </p>
      </div>
      <Heading className="text-body font-semibold">
        <Link href={`/product/${product.slug}`} className="hover:underline">
          <TechText text={product.name} />
        </Link>
      </Heading>
      <SpecLine product={product} variant="list" />
      <ProductBandScale product={product} size="sm" className="max-w-60" />
      <div className="mt-auto flex flex-col gap-3 pt-1">
        <Price amount={product.priceType === 'fixed' ? product.price : null} size="lg" />
        <div className="flex items-center gap-2">
          <AddToCartButton
            productId={product.id}
            productName={product.name}
            size="sm"
            className="flex-1 max-lg:min-h-11"
          />
          <FavoriteButton
            productId={product.id}
            productName={product.name}
            size="sm"
            className="max-lg:min-h-11 max-lg:min-w-11"
          />
        </div>
      </div>
    </article>
  );
}
