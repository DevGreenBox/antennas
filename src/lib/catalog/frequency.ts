/**
 * Частотный подбор (ТЗ §6, docs/DATA-RULES.md §3 «Частота»).
 *
 * Формулы ТЗ, границы включительные:
 * - одна частота f: f_min ≤ f ≤ f_max;
 * - диапазон [a, b], режим 'overlap' (по умолчанию, «есть пересечение»): f_min ≤ b И f_max ≥ a;
 * - диапазон [a, b], режим 'cover' («покрывает весь диапазон»): f_min ≤ a И f_max ≥ b.
 * Одна частота — частный случай диапазона [f, f]: обе формулы дают f_min ≤ f ≤ f_max.
 *
 * Участвуют только частоты в МГц со статусом confirmed, плюс inferred (единица принята по
 * контексту), если не включён строгий режим. needs-review («6000–8000 ГГц» у МШУ) не участвует
 * никогда: единица спорная, любое число из неё было бы догадкой.
 */

import type { Product } from '@/types/catalog';

import { normalizeSearchText } from '../search-normalize.ts';

export type FrequencyMode = 'overlap' | 'cover';

/** Запрос покупателя в МГц, min ≤ max (одна частота — min === max). */
export interface FrequencyQuery {
  min: number;
  max: number;
}

/** Частотный диапазон товара в МГц, границы включительно. */
export interface FrequencyRange {
  min: number;
  max: number;
}

export interface FrequencyOptions {
  /** true — только подтверждённые значения (inferred не участвует). */
  strict?: boolean;
}

const UNIT_FACTORS: Readonly<Record<string, number>> = { мгц: 1, ггц: 1000 };

/**
 * После normalizeSearchText и удаления пробелов: число, необязательная единица, необязательно
 * «-» и второе число со своей единицей. «2,4 ГГц» → «2.4ггц», «900–1100» → «900-1100».
 */
const FREQUENCY_INPUT = /^(\d+(?:\.\d+)?)(мгц|ггц)?(?:-(\d+(?:\.\d+)?)(мгц|ггц)?)?$/;

/** Округление после пересчёта ГГц → МГц: 2.45 × 1000 не должно дать 2450.0000000000005. */
function roundMHz(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Разбор ввода частоты в МГц: «1000», «900-1100», «900–1100», «2,4 ГГц», «2.4ghz», «2400 MHz»,
 * «2,4–2,5 ГГц». Без единицы — МГц. Невалидное (пусто, текст, отрицательное, ноль) → null.
 * Перевёрнутый диапазон «1100-900» упорядочивается.
 */
export function parseFrequencyInput(input: string): FrequencyQuery | null {
  const trimmed = input.trim();
  // normalizeSearchText отрывает висящий дефис как разделитель — отрицательное число («-5») и
  // недописанный диапазон («900-») отсекаем до неё, иначе они молча превратились бы в 5 и 900.
  if (trimmed === '' || /^[-‐-―−]|[-‐-―−]$/.test(trimmed)) return null;
  const compact = normalizeSearchText(trimmed).replace(/\s+/g, '');
  const match = FREQUENCY_INPUT.exec(compact);
  if (match === null) return null;
  const [, first, firstUnit, second, secondUnit] = match;
  // Единица в конце относится к обеим границам: «2,4–2,5 ГГц».
  const unitA = firstUnit ?? secondUnit ?? 'мгц';
  const unitB = secondUnit ?? firstUnit ?? 'мгц';
  const a = roundMHz(Number(first) * UNIT_FACTORS[unitA]);
  const b = second === undefined ? a : roundMHz(Number(second) * UNIT_FACTORS[unitB]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (max <= 0) return null;
  return { min, max };
}

/** Совпадение диапазона товара с запросом по формулам ТЗ §6. */
export function frequencyMatches(
  range: FrequencyRange,
  query: FrequencyQuery,
  mode: FrequencyMode = 'overlap',
): boolean {
  if (mode === 'cover') return range.min <= query.min && range.max >= query.max;
  return range.min <= query.max && range.max >= query.min;
}

/**
 * Частота товара, участвующая в подборе, или null: нет частоты, единица не МГц (спорные ГГц),
 * статус needs-review, inferred в строгом режиме.
 */
export function getProductFrequency(
  product: Product,
  options: FrequencyOptions = {},
): FrequencyRange | null {
  const strict = options.strict ?? false;
  for (const attr of product.attributes) {
    if (attr.code !== 'frequency') continue;
    if (attr.status === 'needs-review') continue;
    if (attr.status === 'inferred' && strict) continue;
    const value = attr.value;
    if (value.kind === 'range' && value.unit === 'MHz') return { min: value.min, max: value.max };
    if (value.kind === 'number' && value.unit === 'MHz')
      return { min: value.value, max: value.value };
  }
  return null;
}

/** Товар проходит частотный подбор. Без участвующей частоты — никогда (неизвестное ≠ совпадение). */
export function productMatchesFrequency(
  product: Product,
  query: FrequencyQuery,
  options: FrequencyOptions & { mode?: FrequencyMode } = {},
): boolean {
  const range = getProductFrequency(product, options);
  return range !== null && frequencyMatches(range, query, options.mode ?? 'overlap');
}

/** Число для URL: без экспоненты и хвостов плавающей точки. */
function plainNumber(value: number): string {
  return String(roundMHz(value));
}

/** Значение параметра `freq` в URL: «1000» или «900-1100» (МГц). */
export function serializeFrequencyQuery(query: FrequencyQuery): string {
  return query.min === query.max
    ? plainNumber(query.min)
    : `${plainNumber(query.min)}-${plainNumber(query.max)}`;
}

/** Подпись запроса для людей: «1000 МГц», «900–1100 МГц» (десятичная запятая, неразрывный пробел). */
export function formatFrequencyQuery(query: FrequencyQuery): string {
  const fmt = (value: number) => plainNumber(value).replace('.', ',');
  const body = query.min === query.max ? fmt(query.min) : `${fmt(query.min)}–${fmt(query.max)}`;
  return `${body} МГц`;
}
