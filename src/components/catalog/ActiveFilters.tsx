'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { ActiveChip } from '@/lib/catalog';

/**
 * Выбранные параметры (DESIGN §4.5, §5.9.19, § R.7): строка чипов над результатами — подписи
 * движка, удаление по одному; последним — «Сбросить всё». Без активных параметров не рендерится.
 *
 * Подпись движка «Разъём 2-го конца: N-male» показывается в два тона: параметр — `ink-secondary`,
 * значение — `ink`: в строке из нескольких чипов глаз сразу находит значения. Доступное имя —
 * целиком («Убрать: Разъём 2-го конца: N-male»). Чип — белый, рамка `line-emphasis` (как у
 * вторичной кнопки), радиус 4; на < lg высота 44 px — цель нажатия (§ R.9).
 *
 * Фокус после удаления чипа (§7): на следующий чип, если его нет — на предыдущий, если чипов не
 * осталось — на `#{focusFallbackId}` (заголовок выдачи).
 */

/** «Частота: 1000 МГц» → ['Частота', '1000 МГц']; подпись без параметра («IP67») — [null, …]. */
function splitChipLabel(label: string): [string | null, string] {
  const index = label.indexOf(': ');
  return index > 0 ? [label.slice(0, index), label.slice(index + 2)] : [null, label];
}

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
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      {chips.map((chip, index) => {
        const [name, value] = splitChipLabel(chip.label);
        return (
          <button
            key={`${chip.key}=${chip.value}`}
            type="button"
            data-chip
            aria-label={`Убрать: ${chip.label}`}
            onClick={() => {
              pendingFocus.current = index;
              onRemove(chip);
            }}
            className="group/chip inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-sm border border-line-emphasis bg-surface py-1 pr-2 pl-3 text-left text-small text-ink transition-colors duration-fast hover:border-ink-muted lg:min-h-8"
          >
            <span className="min-w-0">
              {name !== null ? <span className="text-ink-secondary">{name}: </span> : null}
              <span className="tabular-nums">{value}</span>
            </span>
            <Icon
              name="x"
              size={16}
              className="shrink-0 text-ink-muted transition-colors duration-fast group-hover/chip:text-ink"
            />
          </button>
        );
      })}
      <Button
        variant="link"
        size="sm"
        className="ml-1 min-h-11 lg:min-h-8"
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
