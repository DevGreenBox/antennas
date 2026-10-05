import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * Кнопки (DESIGN §5.9.5). Действие — `<Button>` (`type="button"` по умолчанию), навигация —
 * `<ButtonLink href>` с теми же классами, внешняя ссылка — `<ButtonLink href external>`
 * (новая вкладка, sr «(откроется в новой вкладке)»).
 *
 *   <Button variant="primary" size="lg" icon="shopping-cart">В корзину</Button>
 *   <Button variant="primary" type="submit" loading={sending} loadingText="Отправляем…">Отправить заявку</Button>
 *   <Button variant="ghost" tone="danger">Отменить заказ</Button>
 *   <ButtonLink href="/cart" variant="secondary" size="sm" icon="check">В корзине</ButtonLink>
 *   <ButtonLink href={site.contacts.telegram.url} external variant="secondary" icon="send">Написать в Telegram</ButtonLink>
 *
 * primary — одна на экран/модальное окно. Неактивная ссылка — `disabled` (aria-disabled, без href).
 * `fullWidth="mobile"` — `w-full` на < md (главные кнопки форм).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Тон danger у ghost и link: «Отменить заказ», «Сбросить демо-данные»; inverse у link — белая
   * ссылка на тёмной подложке (действие в Toast).
   */
  tone?: 'default' | 'danger' | 'inverse';
  disabled?: boolean;
  fullWidth?: boolean | 'mobile';
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 gap-1.5 text-small',
  md: 'h-10 px-4 gap-2 text-small',
  lg: 'h-12 px-6 gap-2 text-body',
};

const ICON_SIZE: Record<ButtonSize, 16 | 20> = { sm: 16, md: 20, lg: 20 };

const VARIANT: Record<Exclude<ButtonVariant, 'link'>, string> = {
  primary: 'bg-brand text-on-brand border-transparent hover:bg-brand-hover active:bg-brand-active',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-muted active:bg-line-subtle',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-surface-muted active:bg-line-subtle',
  danger:
    'bg-danger text-ink-inverse border-transparent hover:bg-danger-hover active:bg-danger-hover',
};

/** Классы кнопки — для элементов, которые не могут быть Button/ButtonLink. */
export function buttonClasses({
  variant = 'secondary',
  size = 'md',
  tone = 'default',
  disabled = false,
  fullWidth = false,
}: ButtonStyleOptions = {}): string {
  const width = fullWidth === true ? 'w-full' : fullWidth === 'mobile' ? 'w-full md:w-auto' : '';
  if (variant === 'link') {
    return cn(
      'inline-flex items-center gap-1.5 font-medium text-left underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-fast',
      size === 'lg' ? 'text-body' : 'text-small',
      disabled
        ? 'text-ink-disabled no-underline cursor-not-allowed'
        : cn(
            tone === 'danger'
              ? 'text-danger'
              : tone === 'inverse'
                ? 'text-ink-inverse'
                : 'text-ink',
            'cursor-pointer hover:decoration-2',
          ),
      width,
    );
  }
  return cn(
    'inline-flex items-center justify-center rounded-sm border font-medium whitespace-nowrap select-none transition-colors duration-fast ease-standard',
    SIZE[size],
    disabled
      ? 'bg-surface-muted text-ink-disabled border-line cursor-not-allowed'
      : cn(
          'cursor-pointer',
          variant === 'ghost' && tone === 'danger'
            ? 'bg-transparent text-danger border-transparent hover:bg-danger-subtle active:bg-danger-subtle'
            : VARIANT[variant],
        ),
    width,
  );
}

interface ContentProps {
  icon?: IconName;
  iconEnd?: IconName;
  size: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
}

/** Подпись с иконками; при загрузке — спиннер и текст загрузки без скачка ширины. */
function ButtonContent({ icon, iconEnd, size, loading, loadingText, children }: ContentProps) {
  const iconSize = ICON_SIZE[size];
  const leading = loading ? 'loader-circle' : icon;
  return (
    <>
      {leading ? (
        <Icon name={leading} size={iconSize} className={loading ? 'animate-spin' : undefined} />
      ) : null}
      {loadingText ? (
        // Обе подписи в одной ячейке сетки: ширина = большей из них, кнопка не прыгает.
        <span className="inline-grid">
          <span className={cn('[grid-area:1/1]', loading && 'invisible')}>{children}</span>
          <span aria-hidden={!loading} className={cn('[grid-area:1/1]', !loading && 'invisible')}>
            {loadingText}
          </span>
        </span>
      ) : (
        children
      )}
      {iconEnd && !loading ? <Icon name={iconEnd} size={iconSize} /> : null}
    </>
  );
}

export interface ButtonProps
  extends Omit<ButtonStyleOptions, 'disabled'>, ButtonHTMLAttributes<HTMLButtonElement> {
  /** Иконка перед подписью (при загрузке её место занимает спиннер). */
  icon?: IconName;
  /** Иконка после подписи. */
  iconEnd?: IconName;
  /** Загрузка: спиннер, `aria-busy`, кнопка неактивна. */
  loading?: boolean;
  /** Подпись во время загрузки («Отправляем…», §6.1). */
  loadingText?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  tone,
  fullWidth,
  icon,
  iconEnd,
  loading = false,
  loadingText,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const inactive = Boolean(disabled) || loading;
  return (
    <button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={cn(
        buttonClasses({ variant, size, tone, fullWidth, disabled: Boolean(disabled) }),
        // Во время загрузки кнопка выглядит активной: состояние показывает спиннер.
        loading && 'cursor-progress',
        className,
      )}
      {...rest}
    >
      <ButtonContent
        icon={icon}
        iconEnd={iconEnd}
        size={size}
        loading={loading}
        loadingText={loadingText}
      >
        {children}
      </ButtonContent>
    </button>
  );
}

export interface ButtonLinkProps
  extends
    Omit<ButtonStyleOptions, 'disabled'>,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  /** Внешняя ссылка: новая вкладка, `rel="noopener noreferrer"`, sr-пометка. */
  external?: boolean;
  /** Неактивная ссылка: `aria-disabled`, без href. */
  disabled?: boolean;
  icon?: IconName;
  iconEnd?: IconName;
  /** Для внутренних ссылок: прокрутка наверх после перехода (next/link). */
  scroll?: boolean;
  replace?: boolean;
  prefetch?: boolean;
}

export function ButtonLink({
  href,
  external = false,
  disabled = false,
  variant = 'secondary',
  size = 'md',
  tone,
  fullWidth,
  icon,
  iconEnd,
  scroll,
  replace,
  prefetch,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = cn(buttonClasses({ variant, size, tone, fullWidth, disabled }), className);
  const content = (
    <ButtonContent icon={icon} iconEnd={iconEnd} size={size}>
      {children}
      {external ? <span className="sr-only"> (откроется в новой вкладке)</span> : null}
    </ButtonContent>
  );
  if (disabled) {
    return (
      <a role="link" aria-disabled="true" className={classes} {...rest}>
        {content}
      </a>
    );
  }
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link
      href={href}
      scroll={scroll}
      replace={replace}
      prefetch={prefetch}
      className={classes}
      {...rest}
    >
      {content}
    </Link>
  );
}
