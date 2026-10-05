'use client';

import { IconButton } from '@/components/ui/IconButton';
import type { IconButtonSize } from '@/components/ui/IconButton';
import { useFavorites, useIsFavorite } from '@/lib/store/favorites';

/**
 * Закладка «Избранное» (DESIGN §5.9.6): `aria-pressed`, выбранная — залитая иконка (у secondary
 * ещё рамка ink). В списках название товара входит в подпись: «Добавить «{name}» в избранное».
 *
 *   <FavoriteButton productId={p.id} productName={p.name} size="sm" />                  // таблица, карточка
 *   <FavoriteButton productId={p.id} size="lg" variant="secondary" />                   // страница товара
 */
export function FavoriteButton({
  productId,
  productName,
  size = 'sm',
  variant = 'ghost',
  className,
}: {
  productId: string;
  /** Есть — в подписи («Добавить «{name}» в избранное»); нет — общая подпись (страница товара). */
  productName?: string;
  size?: IconButtonSize;
  variant?: 'ghost' | 'secondary';
  className?: string;
}) {
  const active = useIsFavorite(productId);
  const toggle = useFavorites((state) => state.toggle);
  const label = active
    ? productName
      ? `Убрать «${productName}» из избранного`
      : 'Убрать из избранного'
    : productName
      ? `Добавить «${productName}» в избранное`
      : 'Добавить в избранное';
  return (
    <IconButton
      icon="bookmark"
      label={label}
      size={size}
      variant={variant}
      pressed={active}
      filledWhenPressed
      className={className}
      onClick={() => toggle(productId)}
    />
  );
}
