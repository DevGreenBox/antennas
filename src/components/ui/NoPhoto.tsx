import { cn } from '@/lib/cn';

import { CategoryGlyph } from './CategoryGlyph';

/**
 * Нейтральный плейсхолдер фото (DESIGN § R.6): в данных фото нет — схемный знак категории на
 * спокойной подложке, а не выдуманная картинка оборудования. Форма та же, что у фото
 * (ProductPhoto), поэтому раскладка с фото и без него одинакова.
 *
 *   <NoPhoto categoryId={root} variant="product" />   // страница товара: 4:3, доступное имя
 *   <NoPhoto categoryId={root} variant="card" />      // плитка: 4:3, декоративный
 *   <NoPhoto categoryId={root} variant="thumb" />     // строка списка, корзина: квадрат по родителю
 *
 * Обычно не вызывается напрямую — через ProductMedia, который выбирает фото или заглушку.
 */
export interface NoPhotoProps {
  categoryId: string | null | undefined;
  variant?: 'product' | 'card' | 'thumb';
  className?: string;
}

const GLYPH_SIZE = { product: 112, card: 56, thumb: 32 } as const;

export function NoPhoto({ categoryId, variant = 'thumb', className }: NoPhotoProps) {
  const product = variant === 'product';
  return (
    <div
      {...(product
        ? { role: 'img', 'aria-label': 'Фото товара пока нет' }
        : { 'aria-hidden': true })}
      className={cn(
        'relative flex items-center justify-center bg-surface-muted text-ink-muted',
        variant === 'thumb' ? 'size-full' : 'aspect-[4/3] w-full',
        className,
      )}
    >
      <CategoryGlyph categoryId={categoryId} size={GLYPH_SIZE[variant]} />
      {product ? (
        <span aria-hidden className="eyebrow absolute bottom-4 left-4">
          Фото пока нет
        </span>
      ) : null}
    </div>
  );
}
