import { cn } from '@/lib/cn';

import { CategoryGlyph } from './CategoryGlyph';

/**
 * Плейсхолдер фото (DESIGN §5.9.22): в данных фото нет — схемный знак категории на нейтральной
 * плашке, а не выдуманная картинка. Товар важнее декора: большой плашкой заглушка бывает только
 * там, где у неё своё место в раскладке, остальное время это небольшой значок.
 *
 *   <NoPhoto categoryId={rootCategoryOf(product)} variant="product" />  // товар, левая колонка ≥ lg, 4:3
 *   <NoPhoto categoryId={rootCategoryOf(product)} variant="thumb" />    // значок 40 px: карточка
 *   <NoPhoto categoryId={rootCategoryOf(product)} variant="thumb" size={48} />  // товар на < lg
 *
 * Когда у товара есть `images`, вместо заглушки — ProductPhoto (next/image, те же 4:3); значок
 * `thumb` тогда не выводится.
 */
export interface NoPhotoProps {
  categoryId: string | null | undefined;
  variant?: 'product' | 'thumb';
  /** Сторона значка `thumb`, px: 40 (знак 24) или 48 (знак 32). */
  size?: 40 | 48;
  className?: string;
}

export function NoPhoto({ categoryId, variant = 'thumb', size = 40, className }: NoPhotoProps) {
  if (variant === 'product') {
    return (
      <div
        role="img"
        aria-label="Фото товара пока нет"
        className={cn(
          'flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md bg-surface-muted text-ink-muted',
          className,
        )}
      >
        <CategoryGlyph categoryId={categoryId} size={72} />
        <span aria-hidden className="text-small">
          Фото пока нет
        </span>
      </div>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-sm bg-surface-muted text-ink-muted',
        size === 48 ? 'size-12' : 'size-10',
        className,
      )}
    >
      <CategoryGlyph categoryId={categoryId} size={size === 48 ? 32 : 24} />
    </span>
  );
}
