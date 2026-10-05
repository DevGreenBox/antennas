/**
 * Фильтры каталога по категориям (ТЗ §6, таблица групп) и фасетные счётчики.
 *
 * Правила, общие для всех фильтров:
 * - внутри многозначного фильтра — OR, между фильтрами — AND;
 * - неизвестное значение (характеристики нет) никогда не совпадает с выбранным значением и не
 *   трактуется как false/0: МШУ без IP67 в строке не попадает в выдачу «IP67» и при этом не
 *   считается «без IP67» — опции «нет IP67» просто не существует;
 * - needs-review не участвует ни в одном фильтре. Поэтому Тип8 «N/sma-мама» нет в фильтре
 *   разъёмов, а кабельная сборка 15 см «RG-316 / RG-142» (модель вариантов не подтверждена) не
 *   попадает ни в «RG-316», ни в «RG-142»: выбор кабеля показывает только сборки с одним
 *   подтверждённым типом. Сколько товаров так выпало, фасет сообщает в excludedCount — UI может
 *   написать «у 1 товара значение уточняется»;
 * - inferred (частота без единицы) участвует по умолчанию, строгий режим (strict) его исключает;
 * - числовое значение без единицы (затухание «0.4») — не фильтр: сравнивать не с чем;
 * - фильтр скрыт, если в текущем наборе (контекст категории + поиск, без фильтров) у него меньше
 *   двух различающих значений; товар без значения — тоже «значение» (выбрать его нельзя), поэтому
 *   «IP67» у МШУ виден: часть МШУ с IP67, часть без указания. Фильтр с активным выбором виден всегда;
 * - счётчик опции — сколько будет результатов, если её выбрать при остальных активных фильтрах
 *   (кроме своего).
 *
 * Цена: диапазон в рублях — только товары с фиксированной ценой; «по запросу» при активном
 * диапазоне исключаются, потому что их цена неизвестна. Переключатель «Цена по запросу»
 * показывает только товары с ценой по запросу и виден, лишь если такие товары есть в контексте.
 * Диапазон и переключатель — одно измерение «цена»: если включены оба, это OR («от 1 000 до
 * 20 000 ₽ или по запросу»), как опции одного многозначного фильтра; иначе их сочетание всегда
 * давало бы пустую выдачу.
 */

import type { AttrCode, Category, Product, ProductAttribute, Unit } from '@/types/catalog';

import {
  ATTRIBUTE_LABELS,
  UNIT_LABELS,
  formatAttrValue,
  formatNumber,
  NBSP,
} from './attributes.ts';
import {
  formatFrequencyQuery,
  frequencyMatches,
  getProductFrequency,
  serializeFrequencyQuery,
} from './frequency.ts';
import type { FrequencyMode, FrequencyQuery } from './frequency.ts';
import { formatRubleAmount, PRICE_ON_REQUEST_LABEL } from './price.ts';
import { FLAG_VALUE, serializeNumericRange } from './state.ts';
import type { ActiveChip, CatalogState, NumericRange } from './state.ts';

// ---------------------------------------------------------------------------
// Участие значений.
// ---------------------------------------------------------------------------

/** Значение участвует в фильтрах: confirmed всегда, inferred — если не strict, needs-review — никогда. */
export function participates(attr: ProductAttribute, strict: boolean): boolean {
  if (attr.status === 'needs-review') return false;
  if (attr.status === 'inferred') return !strict;
  return true;
}

// prettier-ignore
const TRANSLIT: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Стабильное значение опции для URL: транслит как у slug импорта. «N-female» → «n-female»,
 * «Тип1» → «tip1», «на объёмных резонаторах» → «na-obemnykh-rezonatorakh». Разные тексты с одним
 * ключом склеились бы в одну опцию — в данных v11 таких нет.
 */
export function optionKey(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) out += TRANSLIT[ch] ?? ch;
  return out.replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Определения фильтров.
// ---------------------------------------------------------------------------

export interface FilterEnv {
  /** Строгий режим: inferred не участвует. */
  strict: boolean;
  /** Категория-контекст; null — весь каталог (поиск). */
  categoryId: string | null;
  categoriesById: ReadonlyMap<string, Category>;
}

export interface OptionChoice {
  /** Значение для URL. */
  value: string;
  label: string;
  /** Порядок для сортировки 'order' (число, категория). */
  order?: number;
}

/** 'appearance' — порядок прайса (первое появление), 'order' — по числу, 'collate' — по подписи. */
type OptionSort = 'appearance' | 'order' | 'collate';

interface BaseFilterDef {
  key: string;
  label: string;
  /** Коды характеристик фильтра — для подсчёта выпавших (excluded) значений. */
  codes: readonly AttrCode[];
}

export interface OptionsFilterDef extends BaseFilterDef {
  kind: 'options';
  sort: OptionSort;
  /** Участвующие значения товара; пустой массив — значения нет (не выбирается). */
  values(product: Product, env: FilterEnv): OptionChoice[];
}

export interface FlagFilterDef extends BaseFilterDef {
  kind: 'flag';
  has(product: Product, env: FilterEnv): boolean;
}

export interface RangeFilterDef extends BaseFilterDef {
  kind: 'range';
  unitLabel: string;
  range(product: Product, env: FilterEnv): { min: number; max: number } | null;
}

export type AttributeFilterDef = OptionsFilterDef | FlagFilterDef | RangeFilterDef;

function participating(product: Product, codes: readonly AttrCode[], strict: boolean) {
  return product.attributes.filter(
    (attr) => codes.includes(attr.code) && participates(attr, strict),
  );
}

function pushUnique(out: OptionChoice[], choice: OptionChoice): void {
  if (choice.value !== '' && !out.some((item) => item.value === choice.value)) out.push(choice);
}

/** Текстовые значения (разъём, конструкция, модель, тип кабеля). */
function textFilter(
  key: string,
  label: string,
  codes: readonly AttrCode[],
  sort: OptionSort = 'appearance',
): OptionsFilterDef {
  return {
    kind: 'options',
    key,
    label,
    codes,
    sort,
    values(product, env) {
      const out: OptionChoice[] = [];
      for (const attr of participating(product, codes, env.strict)) {
        const texts =
          attr.value.kind === 'text'
            ? [attr.value.value]
            : attr.value.kind === 'list'
              ? attr.value.values
              : [];
        for (const text of texts) pushUnique(out, { value: optionKey(text), label: text });
      }
      return out;
    },
  };
}

/**
 * Числа и диапазоны с единицей как список опций (масса, длина, усиление дБ, ослабление).
 * Значение без единицы (затухание «0.4») не участвует: неизвестно, что с чем сравнивать.
 */
function quantityFilter(key: string, label: string, codes: readonly AttrCode[]): OptionsFilterDef {
  return {
    kind: 'options',
    key,
    label,
    codes,
    sort: 'order',
    values(product, env) {
      const out: OptionChoice[] = [];
      for (const attr of participating(product, codes, env.strict)) {
        const value = attr.value;
        if (value.kind === 'number' && value.unit !== null) {
          pushUnique(out, {
            value: String(value.value),
            label: formatAttrValue(attr.code, value),
            order: value.value,
          });
        } else if (value.kind === 'range' && value.unit !== null) {
          pushUnique(out, {
            value: `${value.min}-${value.max}`,
            label: formatAttrValue(attr.code, value),
            order: value.min,
          });
        }
      }
      return out;
    },
  };
}

function flagFilter(key: string, label: string, code: AttrCode): FlagFilterDef {
  return {
    kind: 'flag',
    key,
    label,
    codes: [code],
    has: (product, env) =>
      participating(product, [code], env.strict).some((attr) => attr.value.kind === 'flag'),
  };
}

/** Диапазонный фильтр: значение товара [min, max] пересекается с выбранным диапазоном. */
function rangeFilter(key: string, label: string, code: AttrCode, unit: Unit): RangeFilterDef {
  return {
    kind: 'range',
    key,
    label,
    unitLabel: UNIT_LABELS[unit],
    codes: [code],
    range(product, env) {
      for (const attr of participating(product, [code], env.strict)) {
        const value = attr.value;
        // Единица обязана совпасть: дБ и дБи — разные величины (ТЗ §4 п.10).
        if (value.kind === 'number' && value.unit === unit) {
          return { min: value.value, max: value.value };
        }
        if (value.kind === 'range' && value.unit === unit)
          return { min: value.min, max: value.max };
      }
      return null;
    },
  };
}

/**
 * Подкатегория внутри контекста: в «Антеннах» — логопериодические, рупорные…; во всём каталоге —
 * корневые категории. Товар прямо в контексте (Антенна «египетская сила») значения не имеет.
 */
const categoryFilter: OptionsFilterDef = {
  kind: 'options',
  key: 'cat',
  label: 'Категория',
  codes: [],
  sort: 'order',
  values(product, env) {
    const path = product.categoryPath;
    const index = env.categoryId === null ? 0 : path.indexOf(env.categoryId) + 1;
    if (index <= 0 && env.categoryId !== null) return [];
    const child = env.categoriesById.get(path[index] ?? '');
    return child === undefined
      ? []
      : [{ value: child.slug, label: child.name, order: child.sortIndex }];
  },
};

const FILTER_DEFS: Readonly<Record<string, AttributeFilterDef>> = {
  cat: categoryFilter,
  // Антенны.
  design: textFilter('design', 'Конструкция', ['antenna_design']),
  model: textFilter('model', 'Модель', ['model'], 'collate'),
  gain: rangeFilter('gain', 'КУ', 'gain_dbi', 'dBi'),
  // КУ в дБ (как на листе 2) — отдельно от дБи; в витрине v11 таких антенн нет, фильтр скрыт.
  gaindb: quantityFilter('gaindb', 'Усиление', ['gain_db']),
  conn: textFilter('conn', 'Разъём', ['connector']),
  weight: quantityFilter('weight', 'Масса', ['weight']),
  // МШУ и РЧ-фильтры: ВЧ-разъёмы обоих портов одним списком.
  rf: textFilter('rf', 'Разъёмы', ['port1_connector', 'port2_connector']),
  ip67: flagFilter('ip67', 'IP67', 'ip67'),
  pconn: textFilter('pconn', 'Разъём питания', ['power_connector']),
  // РЧ-фильтры.
  group: textFilter('group', 'Группа', ['filter_group']),
  rejection: quantityFilter('rejection', 'Ослабление', ['rejection']),
  // Затухание в v11 без единицы — значений нет, фильтр скрыт; появится с единицей в данных.
  loss: quantityFilter('loss', 'Затухание', ['insertion_loss']),
  // Кабельные сборки.
  length: quantityFilter('length', 'Длина кабеля', ['cable_length']),
  cable: textFilter('cable', 'Кабель', ['cable_type']),
  end1: textFilter('end1', 'Разъём 1-го конца', ['port1_connector']),
  shape1: textFilter('shape1', 'Форма 1-го конца', ['port1_shape']),
  end2: textFilter('end2', 'Разъём 2-го конца', ['port2_connector']),
  shape2: textFilter('shape2', 'Форма 2-го конца', ['port2_shape']),
  // Чехлы.
  compat: textFilter('compat', 'Совместимая модель', ['compatible_model'], 'collate'),
  // Мачты.
  height: quantityFilter('height', 'Высота', ['height']),
  load: quantityFilter('load', 'Допустимая нагрузка', ['max_load']),
  // Аттенюаторы.
  att: quantityFilter('att', 'Диапазон ослабления', ['attenuation_range']),
  power: quantityFilter('power', 'Макс. мощность', ['max_power']),
};

/** Ключи URL фильтров и их вид — для url-state. Зарезервированы: q, sort, page, view, freq, fmode, strict, price, request. */
export const FILTER_PARAM_KINDS: Readonly<Record<string, AttributeFilterDef['kind']>> =
  Object.fromEntries(Object.entries(FILTER_DEFS).map(([key, def]) => [key, def.kind]));

export type FilterGroupId =
  | 'all'
  | 'antennas'
  | 'antennas-mini'
  | 'covers'
  | 'masts'
  | 'lna'
  | 'rf-filters'
  | 'cables'
  | 'attenuators'
  | 'other';

type LayoutEntry = string | readonly [key: string, label: string];

/**
 * Состав и порядок панели по группе (ТЗ §6). 'freq', 'price', 'request' — особые фильтры.
 * В РЧ-фильтрах подкатегорию заменяет «Группа»: значения filter_group совпадают с подкатегориями,
 * два одинаковых фильтра подряд запутали бы.
 */
const GROUP_LAYOUT: Readonly<Record<FilterGroupId, readonly LayoutEntry[]>> = {
  all: ['cat', 'freq', 'price', 'request'],
  antennas: [
    'cat',
    'design',
    'model',
    'freq',
    'gain',
    'gaindb',
    'conn',
    'weight',
    'price',
    'request',
  ],
  'antennas-mini': ['model', 'freq', 'gain', 'price', 'request'],
  covers: ['compat', 'price', 'request'],
  masts: ['height', 'weight', 'load', 'price', 'request'],
  lna: ['freq', 'gaindb', ['rf', 'RF-разъёмы'], 'ip67', 'pconn', 'price', 'request'],
  'rf-filters': ['group', 'freq', 'rf', 'rejection', 'loss', 'price', 'request'],
  cables: ['length', 'cable', 'end1', 'shape1', 'end2', 'shape2', 'price', 'request'],
  attenuators: ['att', 'power', 'price', 'request'],
  other: ['cat', 'price', 'request'],
};

const SPECIAL_KEYS = new Set(['freq', 'price', 'request']);

/** Группа фильтров для категории-контекста: по корневой категории, у мини-антенн — своя. */
export function filterGroupFor(
  categoryId: string | null,
  categoriesById: ReadonlyMap<string, Category>,
): FilterGroupId {
  if (categoryId === null) return 'all';
  if (categoryId === 'antennas-mini') return 'antennas-mini';
  let root = categoriesById.get(categoryId);
  for (let depth = 0; root?.parentId && depth < 8; depth += 1) {
    root = categoriesById.get(root.parentId);
  }
  const id = root?.id;
  return id !== undefined && id !== 'all' && id !== 'other' && id in GROUP_LAYOUT
    ? (id as FilterGroupId)
    : 'other';
}

function layoutOf(group: FilterGroupId): { key: string; label: string | null }[] {
  return GROUP_LAYOUT[group].map((entry) =>
    typeof entry === 'string' ? { key: entry, label: null } : { key: entry[0], label: entry[1] },
  );
}

// ---------------------------------------------------------------------------
// Фасеты.
// ---------------------------------------------------------------------------

export interface FacetOption {
  value: string;
  label: string;
  /** Сколько будет результатов, если выбрать опцию (при остальных активных фильтрах). */
  count: number;
  selected: boolean;
}

interface FacetCounters {
  /** Товаров без значения (при остальных активных фильтрах). */
  missingCount: number;
  /** Товаров, чьё значение есть, но не участвует (needs-review; inferred в строгом режиме). */
  excludedCount: number;
}

export interface OptionsFacet extends FacetCounters {
  kind: 'options';
  key: string;
  label: string;
  options: FacetOption[];
}

export interface FlagFacet extends FacetCounters {
  kind: 'flag';
  key: string;
  /** Подпись чекбокса и чипа: «IP67». */
  label: string;
  /** Видимый заголовок группы — подпись характеристики, как у колонки таблицы: «Защита». */
  groupLabel: string;
  count: number;
  selected: boolean;
}

export interface RangeFacet extends FacetCounters {
  kind: 'range';
  key: string;
  label: string;
  unitLabel: string;
  /** Крайние значения в текущем наборе. */
  bounds: { min: number; max: number };
  selected: NumericRange | null;
}

export interface FrequencyFacet extends FacetCounters {
  kind: 'frequency';
  key: 'freq';
  label: string;
  selected: FrequencyQuery | null;
  mode: FrequencyMode;
  strict: boolean;
  /** Крайние участвующие частоты в текущем наборе, МГц. */
  bounds: { min: number; max: number } | null;
  /** Товаров с частотой без единицы (inferred) — для переключателя «только подтверждённые». */
  inferredCount: number;
}

export interface PriceFacet {
  kind: 'price';
  key: 'price';
  label: string;
  /** Крайние фиксированные цены в текущем наборе, рубли. */
  bounds: { min: number; max: number } | null;
  selected: NumericRange | null;
}

export interface RequestFacet {
  kind: 'request';
  key: 'request';
  label: string;
  count: number;
  selected: boolean;
}

export type Facet =
  OptionsFacet | FlagFacet | RangeFacet | FrequencyFacet | PriceFacet | RequestFacet;

export interface FilterRun {
  /** Товары базы, прошедшие все фильтры (порядок базы сохранён). */
  matched: Product[];
  /** Видимые фасеты в порядке панели. */
  facets: Facet[];
  activeChips: ActiveChip[];
  /** Состояние без неприменимых к контексту и невалидных значений. */
  state: CatalogState;
  /** В текущем наборе есть значения inferred — переключатель strict имеет смысл. */
  strictAvailable: boolean;
}

interface Dimension {
  key: string;
  test(product: Product): boolean;
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

function validRange(range: NumericRange | null | undefined): range is NumericRange {
  if (range === null || range === undefined) return false;
  const { min, max } = range;
  if (min === null && max === null) return false;
  if (min !== null && !Number.isFinite(min)) return false;
  if (max !== null && !Number.isFinite(max)) return false;
  return min === null || max === null || min <= max;
}

function overlaps(value: { min: number; max: number }, selected: NumericRange): boolean {
  return (
    (selected.max === null || value.min <= selected.max) &&
    (selected.min === null || value.max >= selected.min)
  );
}

function priceInRange(product: Product, range: NumericRange): boolean {
  if (product.priceType !== 'fixed' || product.price === null) return false;
  return (
    (range.min === null || product.price >= range.min * 100) &&
    (range.max === null || product.price <= range.max * 100)
  );
}

/** «10–15 дБи», «от 10 дБи», «до 15 дБи», «1 000–20 000 ₽». */
function formatOpenRange(
  range: NumericRange,
  formatValue: (value: number) => string,
  unitLabel: string,
): string {
  const { min, max } = range;
  let body: string;
  if (min !== null && max !== null) {
    body = min === max ? formatValue(min) : `${formatValue(min)}–${formatValue(max)}`;
  } else if (min !== null) body = `от${NBSP}${formatValue(min)}`;
  else body = `до${NBSP}${formatValue(max ?? 0)}`;
  return `${body}${NBSP}${unitLabel}`;
}

/** Все возможные опции фильтра в наборе с подписями и порядком (strict не учитывается). */
function collectChoices(
  def: OptionsFilterDef,
  products: readonly Product[],
  env: FilterEnv,
): Map<string, OptionChoice & { firstIndex: number }> {
  const choices = new Map<string, OptionChoice & { firstIndex: number }>();
  const loose = { ...env, strict: false };
  for (const product of products) {
    for (const choice of def.values(product, loose)) {
      const known = choices.get(choice.value);
      if (known === undefined)
        choices.set(choice.value, { ...choice, firstIndex: product.sortIndex });
      else known.firstIndex = Math.min(known.firstIndex, product.sortIndex);
    }
  }
  return choices;
}

function sortChoices(def: OptionsFilterDef, choices: (OptionChoice & { firstIndex: number })[]) {
  return choices.sort((a, b) => {
    if (def.sort === 'order') return (a.order ?? 0) - (b.order ?? 0) || a.firstIndex - b.firstIndex;
    if (def.sort === 'collate') return collator.compare(a.label, b.label);
    return a.firstIndex - b.firstIndex;
  });
}

function hasAnyCode(product: Product, codes: readonly AttrCode[]): boolean {
  return product.attributes.some((attr) => codes.includes(attr.code));
}

/** Товары без значения / со значением, которое не участвует. */
function counters(
  products: readonly Product[],
  codes: readonly AttrCode[],
  hasValue: (product: Product) => boolean,
): FacetCounters {
  let missingCount = 0;
  let excludedCount = 0;
  for (const product of products) {
    if (hasValue(product)) continue;
    if (codes.length > 0 && hasAnyCode(product, codes)) excludedCount += 1;
    else missingCount += 1;
  }
  return { missingCount, excludedCount };
}

/**
 * Применить фильтры к базе (контекст категории + поиск) и посчитать фасеты.
 * contextSet — товары категории-контекста без поиска: по нему проверяется, что выбранное
 * значение вообще существует (мусор из URL отбрасывается).
 */
export function runFilters(
  base: readonly Product[],
  contextSet: readonly Product[],
  state: CatalogState,
  env: FilterEnv,
): FilterRun {
  const group = filterGroupFor(env.categoryId, env.categoriesById);
  const layout = layoutOf(group);
  const inLayout = new Set(layout.map((entry) => entry.key));
  const labelOf = (key: string) =>
    layout.find((entry) => entry.key === key)?.label ?? FILTER_DEFS[key]?.label ?? key;

  // --- Очистка состояния: только применимые к контексту ключи и существующие значения. ---
  const choiceCache = new Map<string, Map<string, OptionChoice & { firstIndex: number }>>();
  const contextChoices = (def: OptionsFilterDef) => {
    let choices = choiceCache.get(def.key);
    if (choices === undefined) {
      choices = collectChoices(def, contextSet, env);
      choiceCache.set(def.key, choices);
    }
    return choices;
  };

  const options: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(state.options)) {
    const def = FILTER_DEFS[key];
    if (def === undefined || !inLayout.has(key) || !Array.isArray(values)) continue;
    if (def.kind === 'flag') {
      if (values.includes(FLAG_VALUE)) options[key] = [FLAG_VALUE];
    } else if (def.kind === 'options') {
      const known = contextChoices(def);
      const kept = values.filter((value, i) => known.has(value) && values.indexOf(value) === i);
      if (kept.length > 0) options[key] = kept;
    }
  }
  const ranges: Record<string, NumericRange> = {};
  for (const [key, range] of Object.entries(state.ranges)) {
    const def = FILTER_DEFS[key];
    if (def?.kind === 'range' && inLayout.has(key) && validRange(range)) ranges[key] = range;
  }
  const hasRequestInContext = contextSet.some((product) => product.priceType === 'request');
  const freq =
    inLayout.has('freq') &&
    state.freq !== null &&
    Number.isFinite(state.freq.min) &&
    Number.isFinite(state.freq.max) &&
    state.freq.min <= state.freq.max
      ? state.freq
      : null;
  const clean: CatalogState = {
    ...state,
    freq,
    price: validRange(state.price) ? state.price : null,
    request: state.request && hasRequestInContext,
    options,
    ranges,
  };

  // --- Активные измерения. ---
  const dims: Dimension[] = [];
  for (const [key, values] of Object.entries(options)) {
    const def = FILTER_DEFS[key];
    if (def.kind === 'flag') dims.push({ key, test: (p) => def.has(p, env) });
    else if (def.kind === 'options') {
      const selected = new Set(values);
      dims.push({ key, test: (p) => def.values(p, env).some((v) => selected.has(v.value)) });
    }
  }
  for (const [key, range] of Object.entries(ranges)) {
    const def = FILTER_DEFS[key] as RangeFilterDef;
    dims.push({
      key,
      test: (p) => {
        const value = def.range(p, env);
        return value !== null && overlaps(value, range);
      },
    });
  }
  if (freq !== null) {
    const mode = clean.fmode;
    dims.push({
      key: 'freq',
      test: (p) => {
        const range = getProductFrequency(p, { strict: env.strict });
        return range !== null && frequencyMatches(range, freq, mode);
      },
    });
  }
  if (clean.price !== null || clean.request) {
    const price = clean.price;
    const request = clean.request;
    dims.push({
      key: 'price',
      test: (p) =>
        (price !== null && priceInRange(p, price)) || (request && p.priceType === 'request'),
    });
  }

  const matched = base.filter((product) => dims.every((dim) => dim.test(product)));
  const except = (key: string) =>
    base.filter((product) => dims.every((dim) => dim.key === key || dim.test(product)));

  // --- Фасеты и чипы в порядке панели. ---
  const facets: Facet[] = [];
  const chips: ActiveChip[] = [];

  for (const { key } of layout) {
    const label = labelOf(key);

    if (key === 'freq') {
      const own = except('freq');
      const freqs = base.map((p) => getProductFrequency(p, { strict: env.strict }));
      const present = freqs.filter((r): r is { min: number; max: number } => r !== null);
      const distinct = new Set(present.map((r) => `${r.min}-${r.max}`)).size;
      const visible = freq !== null || distinct + (present.length < base.length ? 1 : 0) >= 2;
      if (freq !== null) {
        const wholeRange = clean.fmode === 'cover' && freq.min !== freq.max;
        chips.push({
          key: 'freq',
          value: serializeFrequencyQuery(freq),
          label: `Частота: ${formatFrequencyQuery(freq)}${wholeRange ? ', весь диапазон' : ''}`,
        });
      }
      if (!visible) continue;
      facets.push({
        kind: 'frequency',
        key: 'freq',
        label: 'Частота',
        selected: freq,
        mode: clean.fmode,
        strict: env.strict,
        bounds:
          present.length === 0
            ? null
            : {
                min: Math.min(...present.map((r) => r.min)),
                max: Math.max(...present.map((r) => r.max)),
              },
        inferredCount: base.filter((p) =>
          p.attributes.some((a) => a.code === 'frequency' && a.status === 'inferred'),
        ).length,
        ...counters(
          own,
          ['frequency'],
          (p) => getProductFrequency(p, { strict: env.strict }) !== null,
        ),
      });
      continue;
    }

    if (key === 'price') {
      const fixed = base.flatMap((p) =>
        p.priceType === 'fixed' && p.price !== null ? [p.price] : [],
      );
      const distinct = new Set(fixed).size + (fixed.length < base.length ? 1 : 0);
      if (clean.price !== null) {
        chips.push({
          key: 'price',
          value: serializeNumericRange(clean.price),
          label: `Цена: ${formatOpenRange(clean.price, formatRubleAmount, '₽')}`,
        });
      }
      if (clean.price === null && distinct < 2) continue;
      facets.push({
        kind: 'price',
        key: 'price',
        label: 'Цена',
        bounds:
          fixed.length === 0
            ? null
            : {
                min: Math.floor(Math.min(...fixed) / 100),
                max: Math.ceil(Math.max(...fixed) / 100),
              },
        selected: clean.price,
      });
      continue;
    }

    if (key === 'request') {
      const inBase = base.filter((p) => p.priceType === 'request').length;
      if (clean.request)
        chips.push({ key: 'request', value: FLAG_VALUE, label: PRICE_ON_REQUEST_LABEL });
      if (!clean.request && !(inBase > 0 && inBase < base.length)) continue;
      facets.push({
        kind: 'request',
        key: 'request',
        label: PRICE_ON_REQUEST_LABEL,
        count: except('price').filter((p) => p.priceType === 'request').length,
        selected: clean.request,
      });
      continue;
    }

    if (SPECIAL_KEYS.has(key)) continue;
    const def = FILTER_DEFS[key];
    if (def === undefined) continue;

    if (def.kind === 'options') {
      const selected = options[key] ?? [];
      const known = contextChoices(def);
      const own = except(key);
      const baseCounts = new Map<string, number>();
      const ownCounts = new Map<string, number>();
      for (const product of base) {
        for (const choice of def.values(product, env)) {
          baseCounts.set(choice.value, (baseCounts.get(choice.value) ?? 0) + 1);
        }
      }
      for (const product of own) {
        for (const choice of def.values(product, env)) {
          ownCounts.set(choice.value, (ownCounts.get(choice.value) ?? 0) + 1);
        }
      }
      for (const value of selected) {
        chips.push({ key, value, label: `${label}: ${known.get(value)?.label ?? value}` });
      }
      const discriminates = [...baseCounts.values()].some((n) => n > 0 && n < base.length);
      if (selected.length === 0 && !discriminates) continue;
      const listed = [...known.values()].filter(
        (choice) => baseCounts.has(choice.value) || selected.includes(choice.value),
      );
      facets.push({
        kind: 'options',
        key,
        label,
        options: sortChoices(def, listed).map((choice) => ({
          value: choice.value,
          label: choice.label,
          count: ownCounts.get(choice.value) ?? 0,
          selected: selected.includes(choice.value),
        })),
        ...counters(own, def.codes, (p) => def.values(p, env).length > 0),
      });
      continue;
    }

    if (def.kind === 'flag') {
      const selected = options[key] !== undefined;
      const inBase = base.filter((p) => def.has(p, env)).length;
      if (selected) chips.push({ key, value: FLAG_VALUE, label });
      if (!selected && !(inBase > 0 && inBase < base.length)) continue;
      const own = except(key);
      facets.push({
        kind: 'flag',
        key,
        label,
        groupLabel: ATTRIBUTE_LABELS[def.codes[0]] ?? label,
        count: own.filter((p) => def.has(p, env)).length,
        selected,
        ...counters(own, def.codes, (p) => def.has(p, env)),
      });
      continue;
    }

    // Диапазонный фильтр.
    const selected = ranges[key] ?? null;
    const values = base.map((p) => def.range(p, env));
    const present = values.filter((v): v is { min: number; max: number } => v !== null);
    const distinct =
      new Set(present.map((v) => `${v.min}-${v.max}`)).size +
      (present.length < base.length ? 1 : 0);
    if (selected !== null) {
      chips.push({
        key,
        value: serializeNumericRange(selected),
        label: `${label}: ${formatOpenRange(selected, formatNumber, def.unitLabel)}`,
      });
    }
    if (selected === null && (distinct < 2 || present.length === 0)) continue;
    const own = except(key);
    facets.push({
      kind: 'range',
      key,
      label,
      unitLabel: def.unitLabel,
      bounds:
        present.length === 0
          ? { min: 0, max: 0 }
          : {
              min: Math.min(...present.map((v) => v.min)),
              max: Math.max(...present.map((v) => v.max)),
            },
      selected,
      ...counters(own, def.codes, (p) => def.range(p, env) !== null),
    });
  }

  const strictAvailable = base.some((p) => p.attributes.some((a) => a.status === 'inferred'));
  if (clean.strict) {
    chips.push({ key: 'strict', value: FLAG_VALUE, label: 'Только подтверждённые значения' });
  }

  // «Конструкция» почти дублирует подкатегории антенн (логопериодические, рупорные…): когда
  // виден фильтр подкатегорий, второй такой же список только загромождает панель. С активным
  // выбором фасет остаётся — иначе выбранное значение нельзя было бы снять.
  const hasCategoryFacet = facets.some((facet) => facet.key === 'cat');
  const visibleFacets = facets.filter(
    (facet) => !(facet.key === 'design' && hasCategoryFacet && options.design === undefined),
  );

  return { matched, facets: visibleFacets, activeChips: chips, state: clean, strictAvailable };
}
