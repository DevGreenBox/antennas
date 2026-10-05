/**
 * Поиск по каталогу поверх Product.searchText (docs/DATA-RULES.md §6).
 *
 * Нормализация и сопоставление токенов — только из src/lib/search-normalize.ts (тот же код
 * строит searchText при импорте), поэтому «Тип 1»/«Тип1», «M8»/«М8», «sma мама»/SMA-female,
 * «18,5»/«18.5», «MHz»/«МГц» сходятся без отдельной логики здесь.
 *
 * Правила:
 * - все токены запроса должны найтись (AND);
 * - числовой токен («2400», «2400 МГц», «2,4 ГГц», «900-1100») дополнительно совпадает по частоте:
 *   диапазон товара покрывает значение (режим 'cover' из frequency.ts; для одной частоты это
 *   f_min ≤ f ≤ f_max). Спорные «6000–8000 ГГц» по частоте не находятся — только по тексту, если
 *   его набрали буквально. Число перед дБ/дБи/г/кг/м/см/Вт — не частота («150 г»);
 * - единица сопоставляется целым словом, а не началом слова: «10 дБ» не находит «10–12 дБи»
 *   (дБ и дБи — разные величины), «1 м» — «мини». Целым словом — единица после числа и
 *   однозначные единицы сами по себе (дБ, дБи, МГц, ГГц, кГц); одиночные «м», «г» без числа —
 *   по-прежнему начало слова («м» → «мачта», «мини»);
 * - релевантность: точное совпадение модели > все токены в названии > прочее; при равенстве —
 *   порядок прайса. Товары не объединяются: каждая позиция — отдельный результат.
 */

import type { Category, Product } from '@/types/catalog';

import { matchesSearch, normalizeSearchText, tokenize } from '../search-normalize.ts';
import { frequencyMatches, getProductFrequency } from './frequency.ts';
import type { FrequencyQuery } from './frequency.ts';
import { formatProductPrice } from './price.ts';

const FREQUENCY_UNIT_FACTORS: Readonly<Record<string, number>> = { мгц: 1, ггц: 1000 };
/** Единицы, после которых число — не частота. */
const OTHER_UNITS: ReadonlySet<string> = new Set(['дби', 'дб', 'г', 'кг', 'м', 'см', 'вт', 'кгц']);
/** Единицы, которые и без числа означают только единицу — всегда целым словом. */
const UNAMBIGUOUS_UNITS: ReadonlySet<string> = new Set(['дби', 'дб', 'мгц', 'ггц', 'кгц']);
const NUMBER_TOKEN = /^\d+(?:\.\d+)?$/;
const RANGE_TOKEN = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;

export interface SearchTerm {
  /** Нормализованные токены, которые должны найтись в тексте (число + единица — оба). */
  tokens: string[];
  /** Токены из `tokens`, которые совпадают только целым словом (единицы). */
  wholeWords?: string[];
  /** Частота, которой токен может совпасть вместо текста (МГц); null — не частота. */
  frequency: FrequencyQuery | null;
}

export interface ParsedSearchQuery {
  /** Нормализованный запрос целиком. */
  normalized: string;
  terms: SearchTerm[];
}

export interface SearchOptions {
  /** Строгий режим: inferred-частоты не участвуют и в поиске по числу. */
  strict?: boolean;
}

export interface SearchHit {
  product: Product;
  score: number;
}

function numericFrequency(token: string, factor: number): FrequencyQuery | null {
  const round = (value: number) => Math.round(value * factor * 1e6) / 1e6;
  if (NUMBER_TOKEN.test(token)) {
    const value = round(Number(token));
    return value > 0 ? { min: value, max: value } : null;
  }
  const range = RANGE_TOKEN.exec(token);
  if (range === null) return null;
  const a = round(Number(range[1]));
  const b = round(Number(range[2]));
  return Math.max(a, b) > 0 ? { min: Math.min(a, b), max: Math.max(a, b) } : null;
}

/** Разбор запроса на термы: текстовые токены и числа-частоты (с единицей МГц/ГГц или без). */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const tokens = tokenize(query);
  const terms: SearchTerm[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    const numeric = NUMBER_TOKEN.test(token) || RANGE_TOKEN.test(token);
    if (!numeric) {
      terms.push(
        UNAMBIGUOUS_UNITS.has(token)
          ? { tokens: [token], wholeWords: [token], frequency: null }
          : { tokens: [token], frequency: null },
      );
      continue;
    }
    if (next !== undefined && next in FREQUENCY_UNIT_FACTORS) {
      // «2400 мгц» — один терм: по тексту нужны оба токена, по частоте — единица из запроса.
      terms.push({
        tokens: [token, next],
        wholeWords: [next],
        frequency: numericFrequency(token, FREQUENCY_UNIT_FACTORS[next]),
      });
      i += 1;
      continue;
    }
    if (next !== undefined && OTHER_UNITS.has(next)) {
      // «10 дб», «150 г» — один терм: число не частота, единица — целым словом («дб» ≠ «дби»).
      terms.push({ tokens: [token, next], wholeWords: [next], frequency: null });
      i += 1;
      continue;
    }
    terms.push({ tokens: [token], frequency: numericFrequency(token, 1) });
  }
  return { normalized: tokens.join(' '), terms };
}

interface ProductSearchCache {
  name: string;
  model: string | null;
}

const cache = new WeakMap<Product, ProductSearchCache>();

function searchFields(product: Product): ProductSearchCache {
  let fields = cache.get(product);
  if (fields === undefined) {
    fields = {
      name: normalizeSearchText(product.name),
      model: product.model === null ? null : normalizeSearchText(product.model),
    };
    cache.set(product, fields);
  }
  return fields;
}

/** Токен целым словом в нормализованном тексте (слова — через один пробел). */
function hasWord(text: string, token: string): boolean {
  return ` ${text} `.includes(` ${token} `);
}

function textMatches(text: string, term: SearchTerm): boolean {
  return term.tokens.every((token) =>
    term.wholeWords?.includes(token) ? hasWord(text, token) : matchesSearch(text, token),
  );
}

/**
 * Оценка релевантности товара или null, если товар не подходит. Пустой запрос подходит всем с 0.
 */
export function scoreProduct(
  product: Product,
  parsed: ParsedSearchQuery,
  options: SearchOptions = {},
): number | null {
  if (parsed.terms.length === 0) return 0;
  let textHits = 0;
  let frequencyHits = 0;
  let frequency: ReturnType<typeof getProductFrequency> | undefined;
  for (const term of parsed.terms) {
    if (textMatches(product.searchText, term)) {
      textHits += 1;
      continue;
    }
    if (term.frequency === null) return null;
    frequency ??= getProductFrequency(product, { strict: options.strict });
    if (frequency === null || !frequencyMatches(frequency, term.frequency, 'cover')) return null;
    frequencyHits += 1;
  }

  const fields = searchFields(product);
  let score = textHits * 2 + frequencyHits;
  if (fields.model !== null) {
    if (parsed.normalized === fields.model) score += 1000;
    else if (parsed.terms.some((t) => t.tokens.length === 1 && t.tokens[0] === fields.model)) {
      score += 500;
    }
  }
  if (matchesSearch(fields.name, parsed.normalized)) score += 100;
  else score += 10 * parsed.terms.filter((term) => textMatches(fields.name, term)).length;
  return score;
}

/**
 * Найденные товары по убыванию релевантности, при равенстве — порядок прайса.
 * Пустой запрос возвращает все товары в порядке прайса.
 */
export function searchProducts(
  products: readonly Product[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const parsed = parseSearchQuery(query);
  const hits: SearchHit[] = [];
  for (const product of products) {
    const score = scoreProduct(product, parsed, options);
    if (score !== null) hits.push({ product, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.product.sortIndex - b.product.sortIndex);
}

// ---------------------------------------------------------------------------
// Подсказки в шапке.
// ---------------------------------------------------------------------------

export interface SearchSource {
  products: readonly Product[];
  categories: readonly Category[];
}

export type Suggestion =
  | {
      kind: 'category';
      id: string;
      name: string;
      /** Название родителя для подписи («Антенны › Рупорные»); null у корневой. */
      parentName: string | null;
      /** Сегменты URL от корня: ['antennas', 'horn'] → /catalog/antennas/horn. */
      slugPath: string[];
      productCount: number;
    }
  | {
      kind: 'product';
      id: string;
      slug: string;
      name: string;
      code: string;
      priceText: string;
    };

/** Не больше стольких категорий в подсказках — остальное место товарам. */
const MAX_CATEGORY_SUGGESTIONS = 3;

/**
 * Подсказки: сначала категории (совпадение с названием категории вместе с родителем —
 * «рупорные антенны»), затем товары по релевантности. Пустой запрос — пустой список.
 */
export function suggest(query: string, limit: number, source: SearchSource): Suggestion[] {
  const parsed = parseSearchQuery(query);
  if (parsed.terms.length === 0 || limit <= 0) return [];
  const byId = new Map(source.categories.map((category) => [category.id, category]));

  const categories: Suggestion[] = [];
  const ordered = [...source.categories].sort((a, b) => a.sortIndex - b.sortIndex);
  for (const category of ordered) {
    if (categories.length >= Math.min(MAX_CATEGORY_SUGGESTIONS, limit)) break;
    const parent = category.parentId === null ? undefined : byId.get(category.parentId);
    const text = normalizeSearchText(`${parent?.name ?? ''} ${category.name}`);
    if (!parsed.terms.every((term) => textMatches(text, term))) continue;
    const productCount = source.products.filter((p) => p.categoryPath.includes(category.id)).length;
    if (productCount === 0) continue;
    const slugPath: string[] = [];
    // Глубина ограничена: цикл в родителях (ошибка данных) не должен подвесить шапку.
    for (let node: Category | undefined = category; node && slugPath.length < 8;) {
      slugPath.unshift(node.slug);
      node = node.parentId === null ? undefined : byId.get(node.parentId);
    }
    categories.push({
      kind: 'category',
      id: category.id,
      name: category.name,
      parentName: parent?.name ?? null,
      slugPath,
      productCount,
    });
  }

  const products: Suggestion[] = searchProducts(source.products, query)
    .slice(0, limit - categories.length)
    .map(({ product }) => ({
      kind: 'product',
      id: product.id,
      slug: product.slug,
      name: product.name,
      code: product.code,
      priceText: formatProductPrice(product),
    }));

  return [...categories, ...products];
}
