import Image from 'next/image';

import { NoPhoto } from '@/components/ui/NoPhoto';
import { rootCategoryOf } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/catalog';

/**
 * Медиа товара (DESIGN § R.6): первое фото из `product.images` (пути — в `src/data/overrides.json`;
 * в прайсе фото нет) или нейтральная заглушка NoPhoto. Фото не обрезается (`object-contain`):
 * разъёмы и маркировка бывают у края.
 *
 *   <ProductMedia product={p} variant="thumb" className="size-20" />   // строка списка: квадрат
 *   <ProductMedia product={p} variant="card" />                        // плитка: 4:3
 *   <ProductMedia product={p} variant="product" preload />             // страница товара: 4:3
 *
 * У `thumb` и `card` медиа декоративное: рядом всегда есть название-ссылка; у `product` фото
 * получает alt = название товара, заглушка — «Фото товара пока нет».
 */
const SIZES = {
  thumb: '5rem',
  card: '(min-width: 80rem) 22rem, (min-width: 40rem) 50vw, 100vw',
  product: '(min-width: 84rem) 46rem, (min-width: 64rem) 55vw, 100vw',
} as const;

export function ProductMedia({
  product,
  variant,
  preload = false,
  className,
}: {
  product: Product;
  variant: 'thumb' | 'card' | 'product';
  /** Фото — главный элемент первого экрана страницы товара. */
  preload?: boolean;
  className?: string;
}) {
  const photo = product.images[0] ?? null;
  const frame = cn(
    'overflow-hidden bg-surface-muted',
    variant === 'product' ? 'rounded-md' : variant === 'thumb' ? 'rounded-sm' : null,
    className,
  );
  if (photo === null) {
    return <NoPhoto categoryId={rootCategoryOf(product)} variant={variant} className={frame} />;
  }
  return (
    <div
      className={cn('relative', variant === 'thumb' ? 'size-full' : 'aspect-[4/3] w-full', frame)}
    >
      <Image
        src={photo}
        alt={variant === 'product' ? product.name : ''}
        fill
        sizes={SIZES[variant]}
        preload={preload}
        className="object-contain"
      />
    </div>
  );
}
