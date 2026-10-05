'use client';

import { createContext, useContext, useId } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * Поле формы (DESIGN §5.9.7): Label → Hint → Error → контрол (+ счётчик символов справа).
 * Контрол (Input, Textarea, Select) берёт из контекста id, `aria-describedby`, `aria-invalid`,
 * `aria-required` — вручную их не задавать.
 *
 *   <Field label="Email" hint="На этот адрес придёт код…" error={errors.email}>
 *     <Input type="email" autoComplete="email" size="lg" value={email} onChange={…} />
 *   </Field>
 *   <Field label="Телефон" optional>…</Field>                    // «Телефон (необязательно)»
 *   <Field label="Комментарий к заявке" optional counter={{ value: text.length, max: 1000 }}>
 *     <Textarea maxLength={1000} … />
 *   </Field>
 *
 * Ошибка показывается после первой попытки отправки (решает форма), с sr-префиксом «Ошибка: ».
 * Обязательность не отмечается звёздочкой — фраза в начале формы.
 */

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

const FieldContext = createContext<FieldControlProps | null>(null);

/** Атрибуты контрола из ближайшего Field (null — контрол вне Field). */
export function useFieldControl(): FieldControlProps | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Текст ошибки (без «Ошибка: » — префикс добавляется для скринридеров). */
  error?: string | null;
  /** Необязательное поле: « (необязательно)» в подписи. */
  optional?: boolean;
  /** id контрола; по умолчанию генерируется. Нужен для ссылок из ErrorSummary (`#id`). */
  id?: string;
  /** Подпись только для скринридеров. */
  labelHidden?: boolean;
  counter?: { value: number; max: number };
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  optional = false,
  id,
  labelHidden = false,
  counter,
  className,
  children,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? `field-${generated}`;
  const hintId = hint ? `${controlId}-hint` : null;
  const errorId = error ? `${controlId}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');
  const control: FieldControlProps = {
    id: controlId,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(optional ? {} : { 'aria-required': true as const }),
  };
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={controlId}
        className={cn('text-small font-medium text-ink', labelHidden && 'sr-only')}
      >
        {label}
        {optional ? <span className="font-normal text-ink-muted"> (необязательно)</span> : null}
      </label>
      {hint ? (
        <p id={hintId ?? undefined} className="text-small text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId ?? undefined}>{error}</FieldError> : null}
      <FieldContext.Provider value={control}>{children}</FieldContext.Provider>
      {counter ? (
        <p className="text-caption text-ink-muted text-right tabular-nums" aria-hidden>
          {counter.value} / {counter.max}
        </p>
      ) : null}
    </div>
  );
}

/** Текст ошибки поля или группы (используется Field, RangeFilter и т. п.). */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-small text-danger">
      <Icon name="circle-alert" size={16} className="mt-0.5" />
      <span>
        <span className="sr-only">Ошибка: </span>
        {children}
      </span>
    </p>
  );
}

export interface ErrorSummaryItem {
  /** id поля — ссылка `#id`, клик фокусирует поле. */
  fieldId: string;
  message: string;
}

/**
 * Сводка ошибок над формой после неудачной отправки (§5.9.9): `role="alert"`, `tabIndex={-1}` —
 * форма переводит на неё фокус (`ref.current?.focus()`).
 */
export function ErrorSummary({
  items,
  title = 'Проверьте форму',
  ref,
  className,
}: {
  items: readonly ErrorSummaryItem[];
  title?: string;
  ref?: React.Ref<HTMLDivElement>;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn('rounded-md bg-danger-subtle p-4', className)}
    >
      <h2 className="text-body font-semibold text-ink">{title}</h2>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.fieldId}>
            <a
              href={`#${item.fieldId}`}
              className="text-link text-small text-danger"
              onClick={(event) => {
                const field = document.getElementById(item.fieldId);
                if (field === null) return;
                event.preventDefault();
                field.focus();
              }}
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
