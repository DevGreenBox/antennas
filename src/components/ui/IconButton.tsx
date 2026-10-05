import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * Квадратная кнопка-иконка (DESIGN §5.9.6). `label` обязателен → `aria-label`; тултипов нет.
 * Переключатель — `pressed` → `aria-pressed`; выбранное состояние меняет форму (`filledWhenPressed`
 * у закладки), у `secondary` ещё и рамку на `border-ink`.
 *
 *   <IconButton icon="x" label="Закрыть" onClick={close} />
 *   <IconButton icon="bookmark" label="Убрать из избранного" pressed filledWhenPressed variant="secondary" size="lg" />
 *
 * Размеры — та же шкала, что у Button и QuantitySelector: sm 32, md 40, lg 48 (иконка 16 / 20 / 20),
 * поэтому в одном ряду с ними края совпадают (страница товара: количество lg + «В корзину» lg +
 * закладка lg). `header` — 44: шапка на < lg (§5.9.6 «в шапке 44×44», вровень с HeaderActions).
 * На < lg в шапке и списках — не меньше md; где нужна цель 44 на < lg при sm на десктопе —
 * `className="max-lg:min-h-11 max-lg:min-w-11"` (min-* не спорит с size-*).
 * `inverse` — на тёмной подложке (Toast).
 */

export type IconButtonSize = 'sm' | 'md' | 'lg' | 'header';
export type IconButtonVariant = 'ghost' | 'secondary' | 'inverse';

const SIZE: Record<IconButtonSize, string> = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-12',
  header: 'size-11',
};
const ICON: Record<IconButtonSize, 16 | 20> = { sm: 16, md: 20, lg: 20, header: 20 };

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  /** Состояние переключателя → aria-pressed. */
  pressed?: boolean;
  /** Залить иконку при `pressed` (закладка). */
  filledWhenPressed?: boolean;
}

export function iconButtonClasses({
  size = 'md',
  variant = 'ghost',
  pressed = false,
  disabled = false,
}: {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  pressed?: boolean;
  disabled?: boolean;
}): string {
  return cn(
    'inline-flex items-center justify-center shrink-0 rounded-sm border transition-colors duration-fast ease-standard',
    SIZE[size],
    disabled
      ? 'text-ink-disabled border-transparent cursor-not-allowed'
      : variant === 'inverse'
        ? 'text-ink-inverse border-transparent cursor-pointer hover:bg-ink-secondary'
        : variant === 'secondary'
          ? cn(
              'bg-surface text-ink cursor-pointer hover:bg-surface-muted active:bg-line-subtle',
              pressed ? 'border-ink' : 'border-line-strong',
            )
          : 'bg-transparent text-ink border-transparent cursor-pointer hover:bg-surface-muted active:bg-line-subtle',
  );
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  pressed,
  filledWhenPressed = false,
  disabled,
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(iconButtonClasses({ size, variant, pressed, disabled }), className)}
      {...rest}
    >
      <Icon name={icon} size={ICON[size]} filled={filledWhenPressed && pressed === true} />
    </button>
  );
}
