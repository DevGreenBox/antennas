'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Checkbox, Radio, группа выбора и Segmented (DESIGN §5.9.10, §5.9.11). Нативные `<input>` —
 * клавиатура, стрелки в радиогруппе и формы работают без своего кода.
 *
 *   <Checkbox label="N-female" count={4} checked={…} onChange={…} />      // строка опции подбора
 *   <Checkbox label="Даю согласие на обработку персональных данных" textSize="body" invalid={…} />
 *   <ChoiceGroup legend="Режим"><Radio name="fmode" label="Есть пересечение" … /></ChoiceGroup>
 *   <Segmented legend="Покупатель" name="buyer" value={type} onChange={setType}
 *     options={[{ value: 'person', label: 'Частное лицо' }, { value: 'company', label: 'Организация' }]} />
 *
 * Вся строка `<label>` кликабельна (и наведение на неё подсвечивает рамку контрола —
 * `globals.css`); высота ≥ 32 px (`comfortable` — 44 px: Drawer, формы < lg).
 */

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  /** Счётчик справа (опции подбора). Входит в доступное имя: «N-female, 4». */
  count?: number;
  /** Пояснение под подписью. */
  description?: ReactNode;
  /** Размер подписи: small — подбор, body — формы. */
  textSize?: 'small' | 'body';
  /** Строка 44 px (Drawer, формы на < lg). */
  comfortable?: boolean;
  invalid?: boolean;
  className?: string;
}

function ChoiceRow({
  kind,
  label,
  count,
  description,
  textSize = 'small',
  comfortable = false,
  invalid = false,
  disabled,
  className,
  ...rest
}: ChoiceProps & { kind: 'checkbox' | 'radio' }) {
  return (
    <label
      className={cn(
        'flex items-start gap-2.5',
        comfortable ? 'min-h-11 py-2.5' : 'min-h-8 py-1.5',
        disabled ? 'cursor-not-allowed text-ink-disabled' : 'cursor-pointer text-ink',
        textSize === 'body' ? 'text-body' : 'text-small',
        className,
      )}
    >
      <input
        type={kind}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={cn(
          kind === 'checkbox' ? 'ui-checkbox' : 'ui-radio',
          textSize === 'body' ? 'mt-[3px]' : 'mt-px',
        )}
        {...rest}
      />
      <span className="min-w-0 flex-1">
        <span>{label}</span>
        {count !== undefined ? <span className="sr-only">, {count}</span> : null}
        {description ? (
          <span className="mt-0.5 block text-small text-ink-secondary">{description}</span>
        ) : null}
      </span>
      {count !== undefined ? (
        // Счётчик приглушён и табличный; у неактивной опции (0) гаснет вместе с подписью.
        <span
          aria-hidden
          className={cn(
            'ml-auto pl-2 text-small tabular-nums',
            disabled ? 'text-ink-disabled' : 'text-ink-muted',
          )}
        >
          {count}
        </span>
      ) : null}
    </label>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <ChoiceRow kind="checkbox" {...props} />;
}

export function Radio(props: ChoiceProps) {
  return <ChoiceRow kind="radio" {...props} />;
}

/** Группа чекбоксов или радио: `<fieldset>` + `<legend>`. */
export function ChoiceGroup({
  legend,
  legendHidden = false,
  className,
  children,
}: {
  legend: ReactNode;
  legendHidden?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className={cn('mb-2 text-small font-semibold text-ink', legendHidden && 'sr-only')}>
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Доступное имя, если в `label` только иконка. */
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string> {
  legend: ReactNode;
  legendHidden?: boolean;
  name: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** На всю ширину, сегменты поровну. */
  block?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  legend,
  legendHidden = false,
  name,
  value,
  options,
  onChange,
  size = 'md',
  block = false,
  className,
}: SegmentedProps<T>) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className={cn('mb-1.5 text-small font-medium text-ink', legendHidden && 'sr-only')}>
        {legend}
      </legend>
      <div
        className={cn(
          'rounded-sm border border-line-strong bg-surface p-0.5 gap-0.5',
          block ? 'flex w-full' : 'inline-flex',
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-center justify-center gap-1.5 px-3 rounded-xs text-small font-medium cursor-pointer transition-colors duration-fast',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-2',
                // md на < lg — 44 px (цель нажатия).
                size === 'sm' ? 'h-8' : 'h-11 lg:h-10',
                block && 'flex-1',
                selected
                  ? 'bg-ink text-ink-inverse'
                  : 'text-ink-secondary hover:bg-surface-muted hover:text-ink',
              )}
            >
              <input
                type="radio"
                className="sr-only peer"
                name={name}
                value={option.value}
                checked={selected}
                aria-label={option.ariaLabel}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
