/**
 * Состояние выдачи ↔ параметры URL (ТЗ §6: поиск, фильтры, сортировка и страница — в URL).
 *
 * Параметры: q, sort, page, view (grid|list), freq (МГц: «1000», «900-1100»), fmode=cover,
 * strict=1, price=1000-20000 (рубли, «1000-» / «-20000» — открытая граница), request=1, ключи
 * фильтров из FILTER_PARAM_KINDS: многозначные — через запятую (conn=n-female,sma-female), флаги —
 * «1» (ip67=1), диапазоны — как price (gain=10-15).
 *
 * Значения по умолчанию в URL не пишутся. parse(serialize(s)) глубоко равно s для любого
 * состояния, которое может дать parse. Невалидное значение отбрасывается без падения: ссылку
 * мог исказить кто угодно, а страница всё равно должна открыться.
 */

import { tokenize } from '../search-normalize.ts';
import { parseFrequencyInput, serializeFrequencyQuery } from './frequency.ts';
import { FILTER_PARAM_KINDS } from './filters.ts';
import {
  createCatalogState,
  DEFAULT_VIEW,
  FLAG_VALUE,
  parseNumericRange,
  serializeNumericRange,
  SORT_KEYS,
  VIEW_MODES,
} from './state.ts';
import type { CatalogState, NumericRange, SortKey, ViewMode } from './state.ts';

/** URLSearchParams, ReadonlyURLSearchParams или объект searchParams из props страницы Next. */
export type SearchParamsInput =
  | Pick<URLSearchParams, 'getAll'>
  | Readonly<Record<string, string | readonly string[] | undefined>>;

const MAX_QUERY_LENGTH = 200;
const MAX_PAGE = 100000;
const MAX_VALUES_PER_FILTER = 50;
/** Значение опции: латиница, цифры, точка, дефис (см. optionKey в filters.ts). */
const OPTION_VALUE = /^[a-z0-9](?:[a-z0-9.-]{0,63})$/;

function hasGetAll(input: SearchParamsInput): input is Pick<URLSearchParams, 'getAll'> {
  return typeof (input as { getAll?: unknown }).getAll === 'function';
}

function readAll(input: SearchParamsInput, key: string): string[] {
  if (hasGetAll(input)) return input.getAll(key);
  const value = (input as Readonly<Record<string, unknown>>)[key];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function readFirst(input: SearchParamsInput, key: string): string | null {
  const values = readAll(input, key);
  return values.length > 0 ? values[0] : null;
}

function isTrue(value: string | null): boolean {
  return value === '1' || value === 'true';
}

function plainNumber(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

/** Целые рубли: «1000-20000», «1000-», «-20000». */
function parsePrice(text: string | null): NumericRange | null {
  if (text === null || !/^\d*-\d*$/.test(text.trim())) return null;
  return parseNumericRange(text);
}

function parseOptionValues(input: SearchParamsInput, key: string): string[] {
  const out: string[] = [];
  for (const raw of readAll(input, key)) {
    for (const part of raw.split(',')) {
      const value = part.trim().toLowerCase();
      if (OPTION_VALUE.test(value) && !out.includes(value)) out.push(value);
      if (out.length >= MAX_VALUES_PER_FILTER) return out;
    }
  }
  return out;
}

/** Состояние из параметров URL. Никогда не бросает исключений. */
export function parseCatalogState(input: SearchParamsInput): CatalogState {
  const state = createCatalogState();

  const q = readFirst(input, 'q');
  if (q !== null) {
    // Управляющие и невидимые символы (NUL, U+200B) — как пробел, мягкий перенос убирается: так
    // же их понимает нормализация поиска, а в заголовке «по запросу «…»» их всё равно не видно.
    const text = q
      .replace(/\u00ad/g, '')
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_QUERY_LENGTH)
      .trim();
    // Запрос только из знаков препинания, невидимых и управляющих символов («. , -», «%00»,
    // «%E2%80%8B», «📡») после нормализации поиска пуст — это не поиск: иначе выдача «Найдено: 118»
    // с сортировкой «По релевантности» по запросу, который ничему не соответствует.
    if (tokenize(text).length > 0) state.q = text;
  }

  const sort = readFirst(input, 'sort');
  if (sort !== null && (SORT_KEYS as readonly string[]).includes(sort))
    state.sort = sort as SortKey;

  const page = readFirst(input, 'page');
  if (page !== null && /^[1-9]\d*$/.test(page)) state.page = Math.min(Number(page), MAX_PAGE);

  const view = readFirst(input, 'view');
  if (view !== null && (VIEW_MODES as readonly string[]).includes(view))
    state.view = view as ViewMode;

  const freq = readFirst(input, 'freq');
  if (freq !== null) state.freq = parseFrequencyInput(freq.slice(0, 64));

  const fmode = readFirst(input, 'fmode');
  if (fmode === 'cover') state.fmode = 'cover';

  state.strict = isTrue(readFirst(input, 'strict'));
  state.price = parsePrice(readFirst(input, 'price'));
  state.request = isTrue(readFirst(input, 'request'));

  for (const [key, kind] of Object.entries(FILTER_PARAM_KINDS)) {
    if (kind === 'flag') {
      if (isTrue(readFirst(input, key))) state.options[key] = [FLAG_VALUE];
    } else if (kind === 'options') {
      const values = parseOptionValues(input, key);
      if (values.length > 0) state.options[key] = values;
    } else {
      const raw = readFirst(input, key);
      const range = raw === null ? null : parseNumericRange(raw);
      if (range !== null) state.ranges[key] = range;
    }
  }
  return state;
}

/** Параметры URL из состояния; значения по умолчанию не пишутся. */
export function serializeCatalogState(state: CatalogState): URLSearchParams {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q !== '') params.set('q', q);
  if (state.freq !== null) params.set('freq', serializeFrequencyQuery(state.freq));
  if (state.fmode !== 'overlap') params.set('fmode', state.fmode);
  if (state.strict) params.set('strict', '1');
  if (state.price !== null) {
    params.set(
      'price',
      `${state.price.min === null ? '' : Math.round(state.price.min)}-${
        state.price.max === null ? '' : Math.round(state.price.max)
      }`,
    );
  }
  if (state.request) params.set('request', '1');

  for (const [key, kind] of Object.entries(FILTER_PARAM_KINDS)) {
    if (kind === 'range') {
      const range = state.ranges[key];
      if (range !== undefined && (range.min !== null || range.max !== null)) {
        params.set(key, serializeNumericRange(range));
      }
      continue;
    }
    const values = (state.options[key] ?? []).filter((value) => OPTION_VALUE.test(value));
    if (values.length === 0) continue;
    if (kind === 'flag') {
      if (values.includes(FLAG_VALUE)) params.set(key, '1');
    } else {
      params.set(key, values.join(','));
    }
  }

  if (state.sort !== 'default') params.set('sort', state.sort);
  if (state.view !== DEFAULT_VIEW) params.set('view', state.view);
  if (state.page > 1) params.set('page', plainNumber(Math.floor(state.page)));
  return params;
}

/**
 * Строка запроса для ссылки: «?conn=n-female,sma-female&sort=price-asc» или «» без параметров.
 * Запятая между значениями оставлена читаемой: в query-части URL она допустима как есть.
 */
export function catalogQueryString(state: CatalogState): string {
  const query = serializeCatalogState(state).toString().replace(/%2C/gi, ',');
  return query === '' ? '' : `?${query}`;
}

/** Короткие имена из постановки: parse / serialize. */
export { parseCatalogState as parse, serializeCatalogState as serialize };
