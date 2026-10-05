import { cn } from '@/lib/cn';

/**
 * Схемные знаки категорий (DESIGN §5.8): условные обозначения в духе электрических схем, а не
 * картинки товаров. Знак выбирается по корневой категории (`product.categoryPath[0]`).
 *
 *   <CategoryGlyph categoryId={product.categoryPath[0]} size={48} />
 *
 * Размеры: 72 (заглушка фото товара на ≥ lg), 40 (плитка категории), 32 (значок товара на < lg
 * в боксе 48), 24 (значок карточки и строки корзины в боксе 40). Цвет — наследуется
 * (`text-ink-muted` у контейнера).
 */

const GLYPHS = {
  antenna: 'M24 42V8M12 8L24 22L36 8M17 42H31',
  cover: 'M6 42H42M10 42V22A14 14 0 0 1 38 22V42M24 38V20M19 20L24 26L29 20',
  mast: 'M24 4V44M24 14L11 44M24 14L37 44M6 44H42M21 24H27M21 34H27',
  amplifier: 'M14 10V38L38 24ZM4 24H14M38 24H44',
  filter: 'M10 12H38V36H10ZM2 24H10M38 24H46M15 31C19 31 20 17 24 17C28 17 29 31 33 31',
  cable: 'M3 18H12V30H3ZM36 18H45V30H36ZM12 24C18 24 18 12 24 12C30 12 30 24 36 24',
  attenuator: 'M10 16H38V32H10ZM2 24H10M38 24H46M15 37L33 11M26 11H33V18',
  generic: 'M8 14H40V38H8ZM8 14L14 8H34L40 14',
} as const;

export type GlyphName = keyof typeof GLYPHS;

const BY_ROOT_CATEGORY: Readonly<Record<string, GlyphName>> = {
  antennas: 'antenna',
  covers: 'cover',
  masts: 'mast',
  lna: 'amplifier',
  'rf-filters': 'filter',
  cables: 'cable',
  attenuators: 'attenuator',
};

/** Знак корневой категории; неизвестная — generic. */
export function glyphForCategory(rootCategoryId: string | null | undefined): GlyphName {
  return (rootCategoryId && BY_ROOT_CATEGORY[rootCategoryId]) || 'generic';
}

export interface CategoryGlyphProps {
  /** id корневой категории (`categoryPath[0]`). */
  categoryId: string | null | undefined;
  size?: number;
  className?: string;
}

export function CategoryGlyph({ categoryId, size = 48, className }: CategoryGlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={cn('shrink-0', className)}
    >
      <path d={GLYPHS[glyphForCategory(categoryId)]} />
    </svg>
  );
}
