'use client';

import type { InputHTMLAttributes, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { useFieldControl } from './Field';
import { Icon } from './Icon';

/**
 * Поля ввода (DESIGN §5.9.8): Input, Textarea, Select. Текст всегда 16 px (iOS не масштабирует).
 * Внутри Field получают id и aria-атрибуты сами; вне Field — передать `aria-label`/`id`.
 *
 *   <Input size="sm" inputMode="decimal" prefix="от" suffix="МГц" />
 *   <Textarea maxLength={1000} />
 *   <Select size="md" value={sort} onChange={…}><option value="default">По порядку прайса</option></Select>
 *
 * Числовые поля — `type="text"` + `inputMode` (без спиннеров). Префикс/суффикс — внутри поля.
 */

export type InputSize = 'sm' | 'md' | 'lg';

const SIZE: Record<InputSize, string> = {
  sm: 'h-9 px-2.5',
  md: 'h-10 px-3',
  lg: 'h-11 px-3',
};

/** Общие классы поля; `invalid` — рамка danger 2 px визуально. */
export function inputClasses({
  size = 'lg',
  invalid = false,
  className,
}: {
  size?: InputSize;
  invalid?: boolean;
  className?: string;
} = {}): string {
  return cn(
    'w-full rounded-sm border bg-surface text-body text-ink transition-colors duration-fast',
    'hover:border-ink-secondary',
    'disabled:bg-surface-muted disabled:text-ink-disabled disabled:border-line disabled:cursor-not-allowed disabled:hover:border-line',
    // Правка агента каталога: <select> в Chromium всегда совпадает с :read-only, и все Select
    // получали фон «только чтение» и рамку line (1,42:1 < 3:1, §5.2) — select исключён.
    '[&:read-only:not(select)]:bg-surface-subtle [&:read-only:not(select)]:border-line [&:read-only:not(select)]:hover:border-line',
    invalid
      ? 'border-danger shadow-[inset_0_0_0_1px_var(--color-danger)] hover:border-danger'
      : 'border-line-strong',
    SIZE[size],
    className,
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: InputSize;
  invalid?: boolean;
  /** Текст слева внутри поля («от»). */
  prefix?: string;
  /** Текст справа внутри поля («МГц», «₽»). */
  suffix?: string;
  ref?: Ref<HTMLInputElement>;
  /** Классы обёртки (когда есть префикс/суффикс). */
  wrapperClassName?: string;
}

export function Input({
  size = 'lg',
  invalid,
  prefix,
  suffix,
  className,
  wrapperClassName,
  type = 'text',
  ...rest
}: InputProps) {
  const field = useFieldControl();
  const isInvalid = invalid ?? field?.['aria-invalid'] === true;
  const input = (
    <input
      type={type}
      {...field}
      {...rest}
      aria-invalid={isInvalid || undefined}
      className={inputClasses({
        size,
        invalid: isInvalid,
        className: cn(prefix && 'pl-9', suffix && 'pr-12', className),
      })}
    />
  );
  if (!prefix && !suffix) return input;
  return (
    <div className={cn('relative', wrapperClassName)}>
      {input}
      {prefix ? (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-small text-ink-muted">
          {prefix}
        </span>
      ) : null}
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-small text-ink-muted">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  const field = useFieldControl();
  const isInvalid = invalid ?? field?.['aria-invalid'] === true;
  return (
    <textarea
      {...field}
      {...rest}
      aria-invalid={isInvalid || undefined}
      className={inputClasses({
        size: 'lg',
        invalid: isInvalid,
        className: cn('h-auto min-h-24 py-2.5 resize-y', className),
      })}
    />
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: InputSize;
  invalid?: boolean;
  ref?: Ref<HTMLSelectElement>;
  wrapperClassName?: string;
}

/** Нативный `<select>` (optgroup, клавиатура и мобильные списки — от браузера). */
export function Select({
  size = 'lg',
  invalid,
  className,
  wrapperClassName,
  children,
  ...rest
}: SelectProps) {
  const field = useFieldControl();
  const isInvalid = invalid ?? field?.['aria-invalid'] === true;
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        {...field}
        {...rest}
        aria-invalid={isInvalid || undefined}
        className={inputClasses({
          size,
          invalid: isInvalid,
          className: cn('appearance-none pr-9 cursor-pointer', className),
        })}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}
