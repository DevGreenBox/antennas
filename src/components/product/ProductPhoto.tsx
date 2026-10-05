import Image from 'next/image';

import { cn } from '@/lib/cn';

/**
 * Фото товара — первое из `product.images` (пути задаются в `src/data/overrides.json`; в прайсе
 * фото нет). Те же 4:3, что у заглушки NoPhoto `product`, поэтому раскладка с фото и без него
 * одинакова. `object-contain`: фото товара не обрезается — разъёмы и маркировка бывают у края.
 *
 *   <ProductPhoto src={product.images[0]} alt={product.name} sizes="(min-width: 64rem) 38vw, 100vw" />
 */
export function ProductPhoto({
  src,
  alt,
  sizes,
  preload = false,
  className,
}: {
  src: string;
  alt: string;
  /** Ширина показа для next/image (srcset). */
  sizes: string;
  /** Фото — главный элемент первого экрана страницы товара. */
  preload?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('relative aspect-[4/3] overflow-hidden rounded-md bg-surface-muted', className)}
    >
      <Image src={src} alt={alt} fill sizes={sizes} preload={preload} className="object-contain" />
    </div>
  );
}
