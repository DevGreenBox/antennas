import 'server-only';

import { LOGO_MARK_COLOR, LOGO_MARK_PARAMS } from '@/components/brand/logo-geometry.generated';

import measurements from '../../../docs/logo-measurements.json';

/**
 * Таблица «измерено → принято» для `/brand` (DESIGN §2.21 п.3, docs/LOGO.md §3).
 *
 * «Измерено» читается из `docs/logo-measurements.json` (его пишет scripts/measure-logo.mjs по
 * растру исходника), «принято» — из `LOGO_MARK_PARAMS`, которые генератор логотипа записал в
 * `logo-geometry.generated.ts`. Руками числа не вписываются: после перестройки знака
 * (`npm run logo`) страница покажет новые значения. Модуль только серверный — JSON замеров
 * (≈ 30 КБ) в браузер не попадает, страница статическая.
 */

const { summary, groups, gapsBetweenGroups, arcs, color, image } = measurements;
const avg = summary.averages;
const params = LOGO_MARK_PARAMS;

/**
 * Модуль u в px исходника: МНК-масштаб по пяти радиусам (r0, r1i, r1o, r2i, r2o) —
 * минимум Σ(измерено − s·принято)², s = Σ(m·p) / Σ(p²). Так же он получен в docs/LOGO.md (35,50).
 */
const radiusPairs: readonly (readonly [measured: number, chosen: number])[] = [
  [avg.r0, params.r0],
  [avg.r1i, params.r1i],
  [avg.r1o, params.r1o],
  [avg.r2i, params.r2i],
  [avg.r2o, params.r2o],
];
export const PX_PER_U =
  radiusPairs.reduce((sum, [m, p]) => sum + m * p, 0) /
  radiusPairs.reduce((sum, [, p]) => sum + p * p, 0);

const number = (digits: number) =>
  new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const px = (value: number) => `${number(1).format(value)} px`;
const u = (value: number) => number(2).format(value / PX_PER_U);
const deg = (value: number, digits = 1) => `${number(digits).format(value)}°`;
const range = (values: readonly number[], format: (v: number) => string) =>
  `${format(Math.min(...values))}–${format(Math.max(...values))}`;
const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const capDeviations = arcs.flatMap((arc) =>
  arc.caps.map((cap) => Math.abs(cap.deviationFromRadialDeg)),
);
const groupGaps = gapsBetweenGroups.flatMap((ring) => ring.gapsDeg.map((gap) => gap.deg));
const axesChosen = params.axesDeg.map((axis) => `${axis}°`).join('; ');

export interface LogoParamRow {
  label: string;
  /** Обозначение в генераторе и на схеме (r0, t, g0…). */
  symbol?: string;
  measured: string;
  chosen: string;
}

export const LOGO_PARAM_ROWS: readonly LogoParamRow[] = [
  {
    label: 'Радиус круга',
    symbol: 'r0',
    measured: `${px(avg.r0)} = ${u(avg.r0)} u`,
    chosen: `${params.r0} u`,
  },
  {
    label: 'Кольцо 1, внутренняя кромка',
    symbol: 'r1i',
    measured: `${px(avg.r1i)} = ${u(avg.r1i)} u`,
    chosen: `${params.r1i} u`,
  },
  {
    label: 'Кольцо 1, внешняя кромка',
    symbol: 'r1o',
    measured: `${px(avg.r1o)} = ${u(avg.r1o)} u`,
    chosen: `${params.r1o} u`,
  },
  {
    label: 'Кольцо 2, внутренняя кромка',
    symbol: 'r2i',
    measured: `${px(avg.r2i)} = ${u(avg.r2i)} u`,
    chosen: `${params.r2i} u`,
  },
  {
    label: 'Кольцо 2, внешняя кромка',
    symbol: 'r2o',
    measured: `${px(avg.r2o)} = ${u(avg.r2o)} u`,
    chosen: `${params.r2o} u`,
  },
  {
    label: 'Толщина дуги, кольцо 1 / кольцо 2',
    symbol: 't',
    measured: `${px(avg.t1)} / ${px(avg.t2)} = ${u(avg.t1)} / ${u(avg.t2)} u`,
    chosen: `${params.t} u у обоих`,
  },
  {
    label: 'Промежуток круг → кольцо 1',
    symbol: 'g0',
    measured: `${px(avg.gap01)} = ${u(avg.gap01)} u`,
    chosen: `${params.gap0} u`,
  },
  {
    label: 'Промежуток кольцо 1 → кольцо 2',
    symbol: 'g1',
    measured: `${px(avg.gap12)} = ${u(avg.gap12)} u`,
    chosen: `${params.gap1} u`,
  },
  {
    label: 'Размах группы по средней линии, кольцо 1 / кольцо 2',
    measured: `${deg(avg.span1MidDeg)} / ${deg(avg.span2MidDeg)}`,
    chosen: `${params.spanDeg}° у обоих колец`,
  },
  {
    label: 'Промежуток между группами',
    measured: `${range(groupGaps, (v) => deg(v))}, среднее ${deg(mean(groupGaps))}`,
    chosen: `${120 - params.spanDeg}°`,
  },
  {
    label: 'Оси групп',
    measured: groups.map((group) => deg(group.midAzimuthDeg, 2)).join('; '),
    chosen: axesChosen,
  },
  {
    label: 'Торцы: отклонение от радиального луча',
    measured: `${range(capDeviations, (v) => deg(v))}, среднее ${deg(mean(capDeviations))}`,
    chosen: 'радиальные (0°)',
  },
  {
    label: 'Центры дуг относительно центра круга',
    measured: `${range([summary.centerOffsetPx.min, summary.centerOffsetPx.max], (v) => number(0).format(v))} px = ${range([summary.centerOffsetPx.min, summary.centerOffsetPx.max], (v) => number(1).format(v / PX_PER_U))} u`,
    chosen: 'совпадают: один центр C',
  },
  {
    label: 'Цвет',
    measured: `${color.dominant} (${number(2).format(color.top[0].sharePct)} % пикселей)`,
    chosen: LOGO_MARK_COLOR,
  },
];

/** Факты замера цвета для секции «Цвет». */
export const LOGO_COLOR_MEASUREMENT = {
  hex: color.dominant,
  sharePct: number(2).format(color.top[0].sharePct),
  pixels: number(0).format(color.top[0].pixels),
  opaquePixels: number(0).format(color.opaquePixels),
  runnersUp: color.top.slice(1, 3).map((entry) => ({
    hex: entry.hex,
    sharePct: number(3).format(entry.sharePct),
  })),
  raster: `${image.width}×${image.height}`,
  method: color.method,
} as const;

/** Масштаб и смещения — для подписи под таблицей. */
export const LOGO_SCALE_NOTE = {
  pxPerU: number(2).format(PX_PER_U),
  centerOffsetMeanPx: number(0).format(summary.centerOffsetPx.mean),
} as const;
