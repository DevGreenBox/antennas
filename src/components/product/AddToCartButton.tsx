'use client';

import { Button, ButtonLink } from '@/components/ui/Button';
import type { ButtonSize } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatPieces } from '@/lib/format';
import { useCart, useCartQuantity } from '@/lib/store/cart';
import { toast } from '@/lib/store/toast';

/**
 * «В корзину» (DESIGN §5.9.22, §2.6, §6.1). Позиции «по запросу» добавляются так же.
 * Toast «Добавлено в корзину: {name} — {N} шт.» + «Перейти в корзину».
 *
 *   <AddToCartButton productId={p.id} productName={p.name} size="sm" />            // списки: после добавления — ссылка «В корзине»
 *   <AddToCartButton productId={p.id} productName={p.name} quantity={qty}
 *     variant="primary" size="lg" mode="add-more" />                                 // товар: прибавляет к лежащему
 *
 * До гидратации всегда «В корзину» (корзина ещё не прочитана — разметка как на сервере).
 */
export interface AddToCartButtonProps {
  productId: string;
  productName: string;
  /** Сколько добавить (страница товара — из QuantitySelector). */
  quantity?: number;
  variant?: 'primary' | 'secondary';
  size?: ButtonSize;
  /**
   * link-when-added — в списках: товар в корзине → ссылка «В корзине» (check) на /cart;
   * add-more — на странице товара: кнопка остаётся и прибавляет количество.
   */
  mode?: 'link-when-added' | 'add-more';
  /** Иконка `shopping-cart` (по умолчанию — у primary). */
  withIcon?: boolean;
  /**
   * Иконка только с sm, а на < sm у кнопки отступы px-4: в ряду «количество · В корзину ·
   * закладка» страницы товара подпись тогда помещается в одну строку до 360 px.
   */
  compactOnMobile?: boolean;
  className?: string;
}

export function AddToCartButton({
  productId,
  productName,
  quantity = 1,
  variant = 'secondary',
  size = 'sm',
  mode = 'link-when-added',
  withIcon = variant === 'primary',
  compactOnMobile = false,
  className,
}: AddToCartButtonProps) {
  const inCart = useCartQuantity(productId);
  const add = useCart((state) => state.add);
  // В списках у каждой строки своя кнопка — название в доступном имени различает их.
  const srName =
    mode === 'link-when-added' ? <span className="sr-only">: {productName}</span> : null;

  if (mode === 'link-when-added' && inCart > 0) {
    return (
      <ButtonLink href="/cart" variant="secondary" size={size} icon="check" className={className}>
        В корзине
        {srName}
      </ButtonLink>
    );
  }
  return (
    <Button
      variant={variant}
      size={size}
      icon={withIcon && !compactOnMobile ? 'shopping-cart' : undefined}
      // Вариант с префиксом идёт в CSS после базового px-*, поэтому перекрывает его без конфликта.
      className={cn(compactOnMobile && 'max-sm:px-4', className)}
      onClick={() => {
        add(productId, quantity);
        toast({
          message: `Добавлено в корзину: ${productName} — ${formatPieces(quantity)}`,
          action: { label: 'Перейти в корзину', href: '/cart' },
        });
      }}
    >
      {withIcon && compactOnMobile ? (
        <Icon name="shopping-cart" size={size === 'sm' ? 16 : 20} className="max-sm:hidden" />
      ) : null}
      В корзину
      {srName}
    </Button>
  );
}
