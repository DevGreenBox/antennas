import { PRICE_ON_REQUEST_LABEL, formatPrice } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { PRICE_ON_REQUEST_SHORT } from '@/lib/format';

/**
 * Цена (DESIGN §5.9.22, §4.9). Деньги — копейки; `null` — «по запросу» (никогда «0 ₽»).
 *
 *   <Price amount={product.price} size="lg" />                       // карточка: «Цена по запросу»
 *   <Price amount={product.price} size="md" requestForm="compact" /> // таблица: «По запросу»
 *   <Price amount={-discount} size="sm" />                           // скидка: «−5 400 ₽»
 *
 * Размеры: sm — строки корзины, md — таблицы и списки, lg — карточка и итог сводки,
 * xl — страница товара и оплаты.
 */

export type PriceSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<PriceSize, string> = {
  sm: 'text-small font-semibold',
  md: 'text-body font-semibold',
  lg: 'text-title font-semibold',
  xl: 'text-heading',
};

const REQUEST_SIZE: Record<PriceSize, string> = {
  sm: 'text-small',
  md: 'text-body',
  lg: 'text-body',
  xl: 'text-title',
};

export interface PriceProps {
  /** Копейки; null — цена по запросу. */
  amount: number | null;
  size?: PriceSize;
  /** Форма «по запросу»: full — «Цена по запросу» (карточка, товар), compact — «По запросу». */
  requestForm?: 'full' | 'compact';
  className?: string;
}

export function Price({ amount, size = 'md', requestForm = 'full', className }: PriceProps) {
  if (amount === null) {
    return (
      <span
        className={cn(
          'whitespace-nowrap font-medium text-ink-secondary',
          REQUEST_SIZE[size],
          className,
        )}
      >
        {requestForm === 'full' ? PRICE_ON_REQUEST_LABEL : PRICE_ON_REQUEST_SHORT}
      </span>
    );
  }
  return (
    <data
      value={(amount / 100).toFixed(2)}
      className={cn('whitespace-nowrap tabular-nums text-ink', SIZE[size], className)}
    >
      {formatPrice(amount)}
    </data>
  );
}
