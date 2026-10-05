import type { CSSProperties } from 'react';

import { bandStyle, bandTicks, productBand } from '@/lib/band-scale';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/catalog';

/**
 * Спектральная шкала (DESIGN §5.10) — сигнатурный элемент каталога: где на логарифмической оси
 * 50 МГц … 10 ГГц работает позиция. Только дублирует текстовое значение — `aria-hidden`.
 *
 * Тон (`tone`): оранжевый (`brand`) — умеренный акцент, поэтому он только на странице товара
 * (`size="lg"`, одна шкала на экране). В таблицах, списках и плитке (`size="sm"`, десятки шкал на
 * экране) — нейтральный: заливка `line-strong` на треке `line-subtle`. По умолчанию тон
 * выбирается по размеру.
 *
 * inferred (единица принята по контексту): у `brand` — штриховка, у `neutral` — пунктир
 * `ink-muted` (штрих 3 px, просвет 2 px): на высоте 4 px мелкая диагональ читалась как артефакт.
 *
 *   <ProductBandScale product={product} size="sm" className="max-w-40" />  // таблица
 *   <ProductBandScale product={product} size="sm" className="max-w-60" />  // список, карточка
 *   <ProductBandScale product={product} size="lg" />                         // товар: с делениями
 *   <BandScale min={700} max={1100} status="confirmed" size="sm" />
 *
 * У needs-review («6000–8000 ГГц») и без частоты `ProductBandScale` ничего не рендерит.
 */

export type BandScaleTone = 'brand' | 'neutral';

export interface BandScaleProps {
  /** Частота, МГц. Одиночная — min === max (заливка минимум 3 px). */
  min: number;
  max: number;
  status: 'confirmed' | 'inferred';
  size?: 'sm' | 'lg';
  /** Тон заливки; по умолчанию `brand` у `lg`, `neutral` у `sm`. */
  tone?: BandScaleTone;
  className?: string;
}

/**
 * Нейтральный тон: переопределяет токен `--color-band-fill` для шкалы (стили `.band-scale` в
 * globals.css читают его), пунктир inferred — утилитой поверх штриховки компонента; в режиме
 * высокой контрастности остаётся сплошная заливка `CanvasText` из globals.css.
 */
const NEUTRAL_TRACK = '[--color-band-fill:var(--color-line-strong)]';
const NEUTRAL_INFERRED_FILL =
  'bg-[image:repeating-linear-gradient(90deg,var(--color-ink-muted)_0_3px,transparent_3px_5px)] forced-colors:bg-none';

export function BandScale({ min, max, status, size = 'sm', tone, className }: BandScaleProps) {
  const { start, width } = bandStyle(min, max);
  const style = { '--band-start': start, '--band-width': width } as CSSProperties;
  const neutral = (tone ?? (size === 'lg' ? 'brand' : 'neutral')) === 'neutral';
  const bar = (
    <div
      className={cn('band-scale', neutral && NEUTRAL_TRACK)}
      data-size={size}
      data-tone={neutral ? 'neutral' : 'brand'}
    >
      <div
        className={cn(
          'band-scale__fill',
          neutral && status === 'inferred' && NEUTRAL_INFERRED_FILL,
        )}
        data-status={status}
        style={style}
      />
    </div>
  );
  if (size === 'sm') {
    return (
      <div aria-hidden className={cn('w-full', className)}>
        {bar}
      </div>
    );
  }
  const ticks = bandTicks();
  return (
    <div aria-hidden className={cn('w-full max-w-[28rem]', className)}>
      {bar}
      <div className="relative mt-1 h-5">
        {ticks.map((tick, index) => {
          const last = index === ticks.length - 1;
          return (
            <div
              key={tick.label}
              className="absolute top-0 flex flex-col"
              style={
                last
                  ? { right: `${100 - tick.left}%`, alignItems: 'flex-end' }
                  : { left: `${tick.left}%`, transform: 'translateX(-50%)', alignItems: 'center' }
              }
            >
              <span className="h-1 w-px bg-line-strong" />
              <span className="whitespace-nowrap text-caption text-ink-muted">{tick.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Шкала частоты товара или ничего (нет частоты в МГц, статус needs-review). */
export function ProductBandScale({
  product,
  size = 'sm',
  tone,
  className,
}: {
  product: Pick<Product, 'attributes'>;
  size?: 'sm' | 'lg';
  tone?: BandScaleTone;
  className?: string;
}) {
  const band = productBand(product);
  if (band === null) return null;
  return (
    <BandScale
      min={band.min}
      max={band.max}
      status={band.status}
      size={size}
      tone={tone}
      className={className}
    />
  );
}
