/**
 * Логарифмическая ось спектральной шкалы BandScale (docs/DESIGN.md §5.10).
 *
 * p(f) = (log10(f) − log10(min)) / (log10(max) − log10(min)), ограничено [0, 1]; ось —
 * `site.catalog.bandScale` (50 … 10 000 МГц). Шкала рисуется только у частоты в МГц со статусом
 * confirmed или inferred; у needs-review («6000–8000 ГГц») шкалы нет — единица спорная.
 *
 * Чистые функции: одинаковый результат на сервере и в браузере (проценты округлены).
 */

import type { AttrStatus, Product } from '@/types/catalog';

import { site } from '../config/site.ts';

export interface ProductBand {
  min: number;
  max: number;
  status: Extract<AttrStatus, 'confirmed' | 'inferred'>;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Положение частоты на оси, 0…1. */
export function bandPosition(mhz: number): number {
  const { minMHz, maxMHz } = site.catalog.bandScale;
  if (!(mhz > 0)) return 0;
  const p = (Math.log10(mhz) - Math.log10(minMHz)) / (Math.log10(maxMHz) - Math.log10(minMHz));
  return Math.min(1, Math.max(0, p));
}

/** CSS-переменные заливки: `--band-start`, `--band-width` в процентах. */
export function bandStyle(min: number, max: number): { start: string; width: string } {
  const a = bandPosition(Math.min(min, max));
  const b = bandPosition(Math.max(min, max));
  return { start: `${round(a * 100)}%`, width: `${round((b - a) * 100)}%` };
}

/** Деления шкалы `lg`: положение в процентах и подпись. */
export function bandTicks(): { left: number; label: string }[] {
  return site.catalog.bandScale.ticks.map((tick) => ({
    left: round(bandPosition(tick.mhz) * 100),
    label: tick.label,
  }));
}

/** Частота товара для шкалы или null (нет частоты, не МГц, needs-review). */
export function productBand(product: Pick<Product, 'attributes'>): ProductBand | null {
  for (const attr of product.attributes) {
    if (attr.code !== 'frequency') continue;
    if (attr.status !== 'confirmed' && attr.status !== 'inferred') continue;
    const value = attr.value;
    if (value.kind === 'range' && value.unit === 'MHz') {
      return { min: value.min, max: value.max, status: attr.status };
    }
    if (value.kind === 'number' && value.unit === 'MHz') {
      return { min: value.value, max: value.value, status: attr.status };
    }
  }
  return null;
}
