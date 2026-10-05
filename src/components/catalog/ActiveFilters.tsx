'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { ActiveChip } from '@/lib/catalog';

/**
 * Выбранные параметры (DESIGN §4.5, §5.9.19): чипы из `QueryResult.activeChips` — подписи
 * движка, удаление по одному; последним — «Сбросить всё». Без активных параметров не рендерится.
 *
 * Фокус после удаления чипа (§7): на следующий чип, если его нет — на предыдущий, если чипов не
 * осталось — на `#{focusFallbackId}` (заголовок выдачи).
 */
export function ActiveFilters({
  chips,
  onRemove,
  onReset,
  focusFallbackId,
}: {
  chips: readonly ActiveChip[];
  onRemove: (chip: ActiveChip) => void;
  onReset: () => void;
  focusFallbackId: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  /** Индекс удалённого чипа — после перерисовки фокус встанет на соседа. */
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-chip]') ?? [];
    const target =
      buttons.length === 0
        ? document.getElementById(focusFallbackId)
        : buttons[Math.min(index, buttons.length - 1)];
    target?.focus();
  }, [chips, focusFallbackId]);

  if (chips.length === 0) return null;

  return (
    <div
      ref={listRef}
      role="group"
      aria-label="Выбранные параметры"
      className="mb-3 flex flex-wrap items-center gap-2"
    >
      {chips.map((chip, index) => (
        <button
          key={`${chip.key}=${chip.value}`}
          type="button"
          data-chip
          aria-label={`Убрать: ${chip.label}`}
          onClick={() => {
            pendingFocus.current = index;
            onRemove(chip);
          }}
          className="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1 rounded-sm border border-line-strong bg-surface py-1 pr-1.5 pl-3 text-left text-small text-ink transition-colors duration-fast hover:bg-surface-muted"
        >
          <span className="min-w-0">{chip.label}</span>
          <Icon name="x" size={16} className="shrink-0" />
        </button>
      ))}
      <Button
        variant="link"
        size="sm"
        onClick={() => {
          onReset();
          document.getElementById(focusFallbackId)?.focus();
        }}
      >
        Сбросить всё
      </Button>
    </div>
  );
}
