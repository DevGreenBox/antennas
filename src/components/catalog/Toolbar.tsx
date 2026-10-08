'use client';

import { useId } from 'react';

import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Input';
import { SORT_KEYS, SORT_LABELS } from '@/lib/catalog';
import type { SortKey, ViewMode } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { PRODUCT_FORMS, countLabel } from '@/lib/format';

/**
 * Toolbar выдачи (DESIGN §5.9.20): счётчик результатов — единственный live-регион выдачи,
 * SortSelect и ViewToggle (на < lg они живут в CatalogMobileBar).
 */

export function ResultCount({ total, className }: { total: number; className?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn('text-small text-ink-secondary tabular-nums', className)}
    >
      Найдено: <span className="font-medium text-ink">{countLabel(total, PRODUCT_FORMS)}</span>
    </p>
  );
}

/** Подпись сортировки: в поиске `default` — «По релевантности» (§4.6, одно место). */
export function sortLabel(key: SortKey, searching: boolean): string {
  return key === 'default' && searching ? 'По релевантности' : SORT_LABELS[key];
}

export function SortSelect({
  value,
  searching,
  onChange,
  size,
  className,
}: {
  value: SortKey;
  searching: boolean;
  onChange: (sort: SortKey) => void;
  size: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <label
        htmlFor={id}
        className="sr-only text-small whitespace-nowrap text-ink-secondary sm:not-sr-only"
      >
        Сортировка
      </label>
      <Select
        id={id}
        size={size}
        value={value}
        // На самых узких экранах длинная подпись обрезается многоточием, а не посреди слова.
        className="truncate"
        wrapperClassName="min-w-0 flex-1"
        onChange={(event) => onChange(event.target.value as SortKey)}
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {sortLabel(key, searching)}
          </option>
        ))}
      </Select>
    </div>
  );
}

const VIEW_OPTIONS: readonly { value: ViewMode; icon: 'rows-3' | 'layout-grid' }[] = [
  { value: 'list', icon: 'rows-3' },
  { value: 'grid', icon: 'layout-grid' },
];

/**
 * Вид выдачи: «Список» и «Плитка» — кнопки-переключатели (`aria-pressed`), визуально как
 * Segmented. Текст виден с md; `iconsOnly` — в мобильной панели (только иконки + aria-label).
 */
export function ViewToggle({
  value,
  onChange,
  iconsOnly = false,
  className,
}: {
  value: ViewMode;
  onChange: (view: ViewMode) => void;
  iconsOnly?: boolean;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Вид списка"
      className={cn(
        'inline-flex shrink-0 gap-0.5 rounded-sm border border-line-emphasis bg-surface p-0.5',
        // < lg (iconsOnly) — цели нажатия 44 px.
        iconsOnly ? 'h-11' : 'h-9',
        className,
      )}
    >
      {VIEW_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={iconsOnly ? (option.value === 'list' ? 'Список' : 'Плитка') : undefined}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            className={cn(
              'inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-xs text-small font-medium transition-colors duration-fast',
              iconsOnly ? 'w-11' : 'min-w-8 px-2 md:px-3',
              selected
                ? 'bg-ink text-ink-inverse'
                : 'text-ink-secondary hover:bg-surface-muted hover:text-ink',
            )}
          >
            <Icon name={option.icon} size={16} />
            {iconsOnly ? null : (
              <span className="sr-only md:not-sr-only">
                {option.value === 'list' ? 'Список' : 'Плитка'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
