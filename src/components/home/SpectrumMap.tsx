import Link from 'next/link';
import type { CSSProperties } from 'react';

import { bandPosition, bandStyle, bandTicks, productBand } from '@/lib/band-scale';
import type { ProductBand } from '@/lib/band-scale';
import { cn } from '@/lib/cn';
import { POSITION_FORMS, countLabel } from '@/lib/format';
import type { CategoryNode } from '@/lib/repository';
import type { Product } from '@/types/catalog';

/**
 * Карта диапазонов каталога (DESIGN § R.6) — первый экран главной, ≥ md. Для каждой категории
 * верхнего уровня, у позиций которой есть частота, — строка на той же логарифмической оси,
 * что у шкалы BandScale (50 МГц … 10 ГГц): отрезки — объединение диапазонов её позиций. Видно,
 * где по спектру есть оборудование, и одним щелчком — категория.
 *
 * Только реальные значения: частоты в МГц со статусом confirmed или inferred (`productBand`),
 * спорные («6000–8000 ГГц») не рисуются. Полосы — `aria-hidden`; доступное имя строки-ссылки —
 * категория, число позиций и общий диапазон текстом.
 */

interface SpectrumRow {
  id: string;
  href: string;
  name: string;
  /** Сколько позиций с частотой. */
  count: number;
  /** Объединённые диапазоны, МГц, по возрастанию. */
  spans: { min: number; max: number }[];
  min: number;
  max: number;
}

/**
 * Объединение диапазонов: пересекающиеся и почти смежные (зазор меньше 1 % оси) сливаются —
 * иначе на экране остаются щели в доли пикселя.
 */
function mergeBands(bands: readonly ProductBand[]): { min: number; max: number }[] {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  const spans: { min: number; max: number }[] = [];
  for (const band of sorted) {
    const last = spans.at(-1);
    if (last && bandPosition(band.min) - bandPosition(last.max) < 0.01) {
      last.max = Math.max(last.max, band.max);
    } else {
      spans.push({ min: band.min, max: band.max });
    }
  }
  return spans;
}

function rowsFor(tree: readonly CategoryNode[], products: readonly Product[]): SpectrumRow[] {
  return tree.flatMap((node) => {
    const bands = products
      .filter((product) => product.categoryPath.includes(node.id))
      .flatMap((product) => {
        const band = productBand(product);
        return band === null ? [] : [band];
      });
    if (bands.length === 0) return [];
    return [
      {
        id: node.id,
        href: node.href,
        name: node.name,
        count: bands.length,
        spans: mergeBands(bands),
        min: Math.min(...bands.map((band) => band.min)),
        max: Math.max(...bands.map((band) => band.max)),
      },
    ];
  });
}

const NUMBER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

/** Граница диапазона строки: до 1000 МГц — в МГц, выше — в ГГц («9 ГГц»). */
const mhz = (value: number) =>
  value >= 1000 ? `${NUMBER.format(value / 1000)} ГГц` : `${NUMBER.format(value)} МГц`;

export function SpectrumMap({
  tree,
  products,
  className,
}: {
  tree: readonly CategoryNode[];
  products: readonly Product[];
  className?: string;
}) {
  const rows = rowsFor(tree, products);
  if (rows.length === 0) return null;
  const ticks = bandTicks();
  return (
    <figure className={cn('flex flex-col', className)} aria-labelledby="spectrum-title">
      <figcaption id="spectrum-title" className="eyebrow">
        Частотные диапазоны позиций
      </figcaption>
      <ul className="mt-4 border-t border-line">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-line">
            <Link
              href={row.href}
              className="group/spectrum grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-4 py-3.5 transition-colors duration-fast hover:bg-surface xl:grid-cols-[13rem_minmax(0,1fr)]"
            >
              <span className="min-w-0 pl-1">
                <span className="block text-small font-medium text-ink group-hover/spectrum:underline">
                  {row.name}
                </span>
                <span className="block font-mono text-caption text-ink-muted">
                  {mhz(row.min)} – {mhz(row.max)} · {countLabel(row.count, POSITION_FORMS)}
                </span>
              </span>
              <span aria-hidden className="relative block h-7 pr-1">
                {ticks.map((tick) => (
                  <span
                    key={tick.label}
                    className="absolute inset-y-0 w-px bg-line-subtle"
                    style={{ left: `${tick.left}%` }}
                  />
                ))}
                <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                {row.spans.map((span) => {
                  const { start, width } = bandStyle(span.min, span.max);
                  return (
                    <span
                      key={span.min}
                      className="absolute top-1/2 h-2 -translate-y-1/2 rounded-[1px] bg-ink-secondary transition-colors duration-fast group-hover/spectrum:bg-brand"
                      style={{ left: start, width: `max(${width}, 2px)` } as CSSProperties}
                    />
                  );
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {/* Ось: те же деления, что у шкалы на странице товара. */}
      <div
        aria-hidden
        className="grid grid-cols-[10rem_minmax(0,1fr)] gap-4 pt-2 xl:grid-cols-[13rem_minmax(0,1fr)]"
      >
        <span />
        <span className="relative block h-4 pr-1">
          {ticks.map((tick) => (
            <span
              key={tick.label}
              // Подпись у правого края оси — по правому краю, чтобы не выходить за колонку.
              className={cn(
                'absolute font-mono text-caption whitespace-nowrap text-ink-muted',
                tick.left > 95 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </span>
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        Отрезки — диапазоны, которые покрывают позиции категории; шкала логарифмическая.
      </p>
    </figure>
  );
}
