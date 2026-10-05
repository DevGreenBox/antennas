'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { MAX_LINE_QUANTITY } from '@/lib/demo-pricing';

import { Icon } from './Icon';

/**
 * Количество «− поле +» (DESIGN §5.9.26). Пределы 1–999: пустое/0/не число на blur → прежнее
 * значение; > 999 → 999 и подсказка «Не больше 999 шт. — для крупных партий напишите менеджеру».
 *
 *   <QuantitySelector value={qty} onChange={setQty} productName={product.name} size="lg" />  // товар
 *   <QuantitySelector value={line.quantity} onChange={(n) => setQuantity(id, n)} productName={name}
 *     size="sm" commitDelayMs={300} />   // корзина: ввод с клавиатуры применяется с задержкой
 *
 * Высота — полная, вместе с рамкой (border-box), по шкале Button/IconButton: sm 32, md 40, lg 48 —
 * в одном ряду с кнопкой и закладкой того же размера края совпадают. md на < lg — 48: кнопки «−»/«+»
 * — цели нажатия, на сенсорных ширинах не меньше 44 (§5.7). Кнопки квадратные (сторона = высота
 * внутри рамки).
 *
 * Кнопки применяют сразу. Внешнее изменение `value` (другая вкладка) обновляет поле, если в нём
 * не идёт ввод.
 */
export type QuantitySelectorSize = 'sm' | 'md' | 'lg';

/** Высота обёртки с рамкой (border-box): кнопки и поле растягиваются на высоту внутри рамки. */
const HEIGHT: Record<QuantitySelectorSize, string> = {
  sm: 'h-8',
  md: 'h-12 lg:h-10',
  lg: 'h-12',
};

export interface QuantitySelectorProps {
  value: number;
  onChange: (quantity: number) => void;
  /** Для sr-подписи «Количество: {name}». */
  productName: string;
  /** Полная высота с рамкой: sm — 32; md — 40 (на < lg — 48); lg — 48. */
  size?: QuantitySelectorSize;
  /** Задержка применения ввода с клавиатуры, мс; без неё — на blur и Enter. */
  commitDelayMs?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}

const LIMIT_HINT = 'Не больше 999 шт. — для крупных партий напишите менеджеру';

export function QuantitySelector({
  value,
  onChange,
  productName,
  size = 'md',
  commitDelayMs,
  disabled = false,
  id,
  className,
}: QuantitySelectorProps) {
  const generatedId = useId();
  const inputId = id ?? `qty-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const [draft, setDraft] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  const [editing, setEditing] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const timer = useRef<number | null>(null);

  // Внешнее изменение значения — обновить поле (паттерн «состояние из пропсов» без эффекта).
  if (value !== lastValue) {
    setLastValue(value);
    if (!editing) setDraft(String(value));
  }

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const commit = (next: number) => {
    const clamped = Math.min(MAX_LINE_QUANTITY, Math.max(1, next));
    setLimitHit(next > MAX_LINE_QUANTITY);
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  const parse = (text: string): number | null => {
    const digits = text.replace(/\s/g, '');
    if (!/^\d+$/.test(digits)) return null;
    const n = Number(digits);
    return n >= 1 ? n : null;
  };

  const commitDraft = (text: string) => {
    const n = parse(text);
    if (n === null) setDraft(String(value));
    else commit(n);
  };

  const step = (delta: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const base = parse(draft) ?? value;
    commit(base + delta);
  };

  const buttonClass = cn(
    'inline-flex aspect-square h-full shrink-0 items-center justify-center text-ink transition-colors duration-fast',
    'enabled:cursor-pointer enabled:hover:bg-surface-muted enabled:active:bg-line-subtle',
    'disabled:cursor-not-allowed disabled:text-ink-disabled',
  );

  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      <div
        className={cn(
          'inline-flex items-stretch self-start rounded-sm border border-line-strong bg-surface',
          HEIGHT[size],
          disabled && 'bg-surface-muted',
        )}
      >
        <button
          type="button"
          className={cn(buttonClass, 'rounded-l-sm')}
          aria-label="Уменьшить количество"
          disabled={disabled || value <= 1}
          onClick={() => step(-1)}
        >
          <Icon name="minus" size={16} />
        </button>
        <label htmlFor={inputId} className="sr-only">
          Количество: {productName}
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={draft}
          aria-describedby={limitHit ? hintId : undefined}
          onFocus={() => setEditing(true)}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            if (commitDelayMs === undefined) return;
            if (timer.current !== null) window.clearTimeout(timer.current);
            const n = parse(text);
            if (n !== null) timer.current = window.setTimeout(() => commit(n), commitDelayMs);
          }}
          onBlur={(event) => {
            setEditing(false);
            if (timer.current !== null) window.clearTimeout(timer.current);
            commitDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft(event.currentTarget.value);
            }
          }}
          className={cn(
            'w-12 border-x border-line bg-transparent text-center text-body text-ink tabular-nums focus-inset',
            'disabled:text-ink-disabled',
          )}
        />
        <button
          type="button"
          className={cn(buttonClass, 'rounded-r-sm')}
          aria-label="Увеличить количество"
          disabled={disabled || value >= MAX_LINE_QUANTITY}
          onClick={() => step(1)}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      {limitHit ? (
        <p id={hintId} role="status" className="text-small text-ink-secondary">
          {LIMIT_HINT}
        </p>
      ) : null}
    </div>
  );
}
