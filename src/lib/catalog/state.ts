/**
 * Состояние выдачи каталога: поиск, фильтры, сортировка, страница, вид. Его же сериализует URL
 * (url-state.ts) — состояние, а не DOM, источник правды; ссылка воспроизводит выдачу.
 *
 * Помощники ниже возвращают новое состояние и сбрасывают страницу на первую при любом изменении
 * фильтров: иначе после сужения выдачи можно оказаться на несуществующей странице.
 */

import type { FrequencyMode, FrequencyQuery } from './frequency.ts';

export type SortKey = 'default' | 'price-asc' | 'price-desc' | 'name';
export type ViewMode = 'grid' | 'list';

export const SORT_KEYS: readonly SortKey[] = ['default', 'price-asc', 'price-desc', 'name'];
export const VIEW_MODES: readonly ViewMode[] = ['grid', 'list'];

export const SORT_LABELS: Readonly<Record<SortKey, string>> = {
  default: 'По порядку прайса',
  'price-asc': 'Сначала дешевле',
  'price-desc': 'Сначала дороже',
  name: 'По названию',
};

/** Размер страницы — совпадает с site.catalog.pageSize (проверяется тестом). */
export const DEFAULT_PAGE_SIZE = 24;
/** Вид по умолчанию — совпадает с site.catalog.defaultView (проверяется тестом). */
export const DEFAULT_VIEW: ViewMode = 'list';

/** Числовой диапазон фильтра; null — граница открыта. Хотя бы одна граница задана. */
export interface NumericRange {
  min: number | null;
  max: number | null;
}

export interface CatalogState {
  /** Поисковый запрос как его ввели (пробелы схлопнуты). */
  q: string;
  sort: SortKey;
  /** Номер страницы с 1. */
  page: number;
  view: ViewMode;
  /** Частотный подбор, МГц. */
  freq: FrequencyQuery | null;
  fmode: FrequencyMode;
  /** Только подтверждённые значения: inferred не участвует в фильтрах. */
  strict: boolean;
  /** Диапазон цены в рублях; только товары с фиксированной ценой. */
  price: NumericRange | null;
  /** Только товары «по запросу». */
  request: boolean;
  /**
   * Многозначные фильтры и флаги: ключ → выбранные значения (OR внутри ключа). Флаг (IP67)
   * хранится как ['1']. Пустых массивов нет.
   */
  options: Record<string, string[]>;
  /** Диапазонные фильтры (КУ, дБи): ключ → диапазон. */
  ranges: Record<string, NumericRange>;
}

export function createCatalogState(patch: Partial<CatalogState> = {}): CatalogState {
  return {
    q: '',
    sort: 'default',
    page: 1,
    view: DEFAULT_VIEW,
    freq: null,
    fmode: 'overlap',
    strict: false,
    price: null,
    request: false,
    options: {},
    ranges: {},
    ...patch,
  };
}

/** Активный параметр выдачи — для «чипа» с удалением по одному. */
export interface ActiveChip {
  /** Ключ параметра URL: 'conn', 'gain', 'freq', 'price', 'request', 'strict'… */
  key: string;
  /** Значение в форме URL: 'n-female', '10-15', '1000'. */
  value: string;
  /** Подпись: «Разъём: N-female», «Частота: 1000 МГц». */
  label: string;
}

export const FLAG_VALUE = '1';

/** Число для URL: без экспоненты, хвостов плавающей точки и «-0». */
function plainNumber(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded === 0 ? 0 : rounded);
}

/** Диапазон в URL: «10-15», «10-» (от), «-15» (до). */
export function serializeNumericRange(range: NumericRange): string {
  const min = range.min === null ? '' : plainNumber(range.min);
  const max = range.max === null ? '' : plainNumber(range.max);
  return `${min}-${max}`;
}

const RANGE_PARAM = /^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/;

/**
 * Диапазон из URL: «10-15», «10-», «-15»; десятичная точка или запятая. Отрицательных значений
 * в фильтрах нет. Пустой, перевёрнутый (min > max) или нечисловой → null.
 */
export function parseNumericRange(text: string): NumericRange | null {
  const match = RANGE_PARAM.exec(text.trim().replace(/,/g, '.'));
  if (match === null || (match[1] === undefined && match[2] === undefined)) return null;
  const min = match[1] === undefined ? null : Number(match[1]);
  const max = match[2] === undefined ? null : Number(match[2]);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)))
    return null;
  if (min !== null && max !== null && min > max) return null;
  return { min, max };
}

export function hasActiveFilters(state: CatalogState): boolean {
  return (
    state.freq !== null ||
    state.strict ||
    state.price !== null ||
    state.request ||
    Object.keys(state.options).length > 0 ||
    Object.keys(state.ranges).length > 0
  );
}

/** Включить/выключить значение многозначного фильтра (или флаг: value = '1'). */
export function toggleFilterValue(state: CatalogState, key: string, value: string): CatalogState {
  const current = state.options[key] ?? [];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  const options = { ...state.options };
  if (next.length === 0) delete options[key];
  else options[key] = next;
  return { ...state, options, page: 1 };
}

export function setRangeFilter(
  state: CatalogState,
  key: string,
  range: NumericRange | null,
): CatalogState {
  const ranges = { ...state.ranges };
  if (range === null || (range.min === null && range.max === null)) delete ranges[key];
  else ranges[key] = range;
  return { ...state, ranges, page: 1 };
}

export function setFrequency(
  state: CatalogState,
  freq: FrequencyQuery | null,
  fmode: FrequencyMode = state.fmode,
): CatalogState {
  return { ...state, freq, fmode, page: 1 };
}

export function setPriceRange(state: CatalogState, price: NumericRange | null): CatalogState {
  const empty = price === null || (price.min === null && price.max === null);
  return { ...state, price: empty ? null : price, page: 1 };
}

export function setRequestOnly(state: CatalogState, request: boolean): CatalogState {
  return { ...state, request, page: 1 };
}

export function setStrict(state: CatalogState, strict: boolean): CatalogState {
  return { ...state, strict, page: 1 };
}

/** Убрать один активный параметр (чип). */
export function removeChip(state: CatalogState, chip: ActiveChip): CatalogState {
  switch (chip.key) {
    case 'freq':
      return { ...state, freq: null, fmode: 'overlap', page: 1 };
    case 'strict':
      return setStrict(state, false);
    case 'price':
      return setPriceRange(state, null);
    case 'request':
      return setRequestOnly(state, false);
  }
  if (chip.key in state.ranges) return setRangeFilter(state, chip.key, null);
  if (state.options[chip.key]?.includes(chip.value)) {
    return toggleFilterValue(state, chip.key, chip.value);
  }
  return state;
}

/** Общий сброс фильтров: поиск, сортировка и вид остаются. */
export function resetFilters(state: CatalogState): CatalogState {
  return createCatalogState({ q: state.q, sort: state.sort, view: state.view });
}
