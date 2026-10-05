/**
 * Характеристики для людей: подписи по коду, порядок в таблице по категории, форматирование
 * значений и короткая строка параметров для карточки.
 *
 * Типографика: десятичная запятая («18,5 дБи»), неразрывный пробел U+00A0 перед единицей и после
 * «до», en dash без пробелов в диапазоне («700–1100 МГц»). Значения хранятся в единицах импорта
 * (масса — г, длина кабеля — см), а показываются в удобных: 16000 г → «16 кг», 100 см → «1 м».
 *
 * Статус не теряется: formatAttribute возвращает status/note/origin/raw, а UI решает, как
 * показать сноску (inferred) и «уточняется» (needs-review). Здесь статус в текст не вшивается.
 */

import type {
  AttrCode,
  AttrOrigin,
  AttrStatus,
  AttrValue,
  Product,
  ProductAttribute,
  Unit,
} from '@/types/catalog';

/** Неразрывный пробел — один на весь движок (цены, единицы, «до»). */
export const NBSP = ' ';

export const UNIT_LABELS: Readonly<Record<Unit, string>> = {
  MHz: 'МГц',
  GHz: 'ГГц',
  dBi: 'дБи',
  dB: 'дБ',
  g: 'г',
  m: 'м',
  cm: 'см',
  kg: 'кг',
  W: 'Вт',
};

export const ATTRIBUTE_LABELS: Readonly<Record<AttrCode, string>> = {
  frequency: 'Частотный диапазон',
  gain_dbi: 'КУ',
  gain_db: 'Усиление',
  antenna_design: 'Конструкция',
  model: 'Модель',
  connector: 'Разъём',
  port1_connector: 'Разъём 1-го конца',
  port2_connector: 'Разъём 2-го конца',
  port1_shape: 'Форма 1-го конца',
  port2_shape: 'Форма 2-го конца',
  cable_type: 'Кабель',
  cable_length: 'Длина кабеля',
  ip67: 'Защита',
  power_connector: 'Разъём питания',
  weight: 'Масса',
  size: 'Размер',
  height: 'Высота',
  max_load: 'Допустимая нагрузка',
  material: 'Материал',
  attenuation_range: 'Диапазон ослабления',
  max_power: 'Макс. мощность',
  insertion_loss: 'Затухание',
  rejection: 'Ослабление',
  filter_group: 'Группа',
  compatible_model: 'Совместимая модель',
};

/**
 * «Конец» есть только у кабеля. У МШУ и фильтров два порта, но какой из них вход, в прайсе не
 * сказано — поэтому нейтрально «порт 1/2», без «вход/выход».
 */
const LABEL_OVERRIDES: Readonly<Record<string, Partial<Record<AttrCode, string>>>> = {
  lna: { port1_connector: 'Разъём порта 1', port2_connector: 'Разъём порта 2' },
  'rf-filters': { port1_connector: 'Разъём порта 1', port2_connector: 'Разъём порта 2' },
};

/** Порядок строк таблицы характеристик по корневой категории. */
const ORDER_BY_CATEGORY: Readonly<Record<string, readonly AttrCode[]>> = {
  antennas: [
    'model',
    'antenna_design',
    'frequency',
    'gain_dbi',
    'gain_db',
    'connector',
    'size',
    'weight',
  ],
  covers: ['compatible_model'],
  masts: ['height', 'weight', 'max_load', 'material'],
  lna: ['frequency', 'gain_db', 'port1_connector', 'port2_connector', 'ip67', 'power_connector'],
  'rf-filters': [
    'filter_group',
    'frequency',
    'port1_connector',
    'port2_connector',
    'insertion_loss',
    'rejection',
  ],
  cables: [
    'cable_length',
    'cable_type',
    'port1_connector',
    'port1_shape',
    'port2_connector',
    'port2_shape',
  ],
  attenuators: ['attenuation_range', 'max_power'],
};

/** Запасной порядок для кодов, которых нет в списке категории (новые данные не теряются). */
const DEFAULT_ORDER: readonly AttrCode[] = [
  'model',
  'antenna_design',
  'filter_group',
  'compatible_model',
  'frequency',
  'gain_dbi',
  'gain_db',
  'connector',
  'port1_connector',
  'port1_shape',
  'port2_connector',
  'port2_shape',
  'cable_length',
  'cable_type',
  'insertion_loss',
  'rejection',
  'attenuation_range',
  'max_power',
  'ip67',
  'power_connector',
  'height',
  'size',
  'weight',
  'max_load',
  'material',
];

/** Значения-«потолки»: показываются с «до» («до 5 Вт», «до 12 кг»). */
const UPPER_BOUND_CODES: ReadonlySet<AttrCode> = new Set(['max_load', 'max_power']);

const FLAG_TEXT: Partial<Record<AttrCode, string>> = { ip67: 'IP67' };

export interface FormattedAttribute {
  code: AttrCode;
  label: string;
  /** Значение для людей: «700–1100 МГц». Статус в текст не вшит. */
  text: string;
  status: AttrStatus;
  note?: string;
  origin: AttrOrigin;
  raw: string;
}

/** Корневая категория товара — по ней выбираются подписи, порядок и строка карточки. */
export function rootCategoryOf(product: Pick<Product, 'categoryPath' | 'categoryId'>): string {
  return product.categoryPath[0] ?? product.categoryId;
}

export function attributeLabel(code: AttrCode, rootCategoryId?: string | null): string {
  const override = rootCategoryId ? LABEL_OVERRIDES[rootCategoryId]?.[code] : undefined;
  return override ?? ATTRIBUTE_LABELS[code];
}

export function attributeOrder(rootCategoryId?: string | null): readonly AttrCode[] {
  const own = rootCategoryId ? (ORDER_BY_CATEGORY[rootCategoryId] ?? []) : [];
  return [...own, ...DEFAULT_ORDER.filter((code) => !own.includes(code))];
}

/** Число по-русски: десятичная запятая, без хвостов плавающей точки. 18.5 → «18,5». */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded).replace('.', ',').replace('-', '−');
}

/** Пересчёт в удобную единицу показа: г → кг от 1000 г, см → м от 100 см. */
function displayScale(magnitude: number, unit: Unit | null): { factor: number; unit: Unit | null } {
  if (unit === 'g' && Math.abs(magnitude) >= 1000) return { factor: 1000, unit: 'kg' };
  if (unit === 'cm' && Math.abs(magnitude) >= 100) return { factor: 100, unit: 'm' };
  return { factor: 1, unit };
}

function withUnit(body: string, unit: Unit | null): string {
  return unit === null ? body : `${body}${NBSP}${UNIT_LABELS[unit]}`;
}

/** Число с единицей для людей: (150, 'g') → «150 г», (100, 'cm') → «1 м», (0.4, null) → «0,4». */
export function formatQuantity(value: number, unit: Unit | null): string {
  const scale = displayScale(value, unit);
  return withUnit(formatNumber(value / scale.factor), scale.unit);
}

/** Диапазон для людей: (700, 1100, 'MHz') → «700–1100 МГц». */
export function formatRange(min: number, max: number, unit: Unit | null): string {
  const scale = displayScale(Math.max(Math.abs(min), Math.abs(max)), unit);
  const body = `${formatNumber(min / scale.factor)}–${formatNumber(max / scale.factor)}`;
  return withUnit(body, scale.unit);
}

/** Текст значения характеристики. Код нужен для «до …» и подписи флага. */
export function formatAttrValue(code: AttrCode, value: AttrValue): string {
  switch (value.kind) {
    case 'range':
      return formatRange(value.min, value.max, value.unit);
    case 'number': {
      const text = formatQuantity(value.value, value.unit);
      return UPPER_BOUND_CODES.has(code) ? `до${NBSP}${text}` : text;
    }
    case 'text':
      return value.value;
    case 'list':
      return value.values.join(' / ');
    case 'flag':
      return FLAG_TEXT[code] ?? 'есть';
  }
}

export function formatAttribute(
  attr: ProductAttribute,
  rootCategoryId?: string | null,
): FormattedAttribute {
  const formatted: FormattedAttribute = {
    code: attr.code,
    label: attributeLabel(attr.code, rootCategoryId),
    text: formatAttrValue(attr.code, attr.value),
    status: attr.status,
    origin: attr.origin,
    raw: attr.raw,
  };
  if (attr.note !== undefined) formatted.note = attr.note;
  return formatted;
}

/** Таблица характеристик товара в порядке его категории. */
export function formatProductAttributes(product: Product): FormattedAttribute[] {
  const root = rootCategoryOf(product);
  const order = attributeOrder(root);
  const rank = (code: AttrCode) => {
    const index = order.indexOf(code);
    return index < 0 ? order.length : index;
  };
  return product.attributes
    .map((attr, index) => ({ attr, index }))
    .sort((a, b) => rank(a.attr.code) - rank(b.attr.code) || a.index - b.index)
    .map(({ attr }) => formatAttribute(attr, root));
}

// ---------------------------------------------------------------------------
// Строка параметров карточки.
// ---------------------------------------------------------------------------

export interface SpecLineItem {
  /** Код характеристики или составной ключ («ports», «ends», «ip67+power_connector»). */
  key: string;
  label: string;
  text: string;
  /** Худший статус входящих значений: needs-review > inferred > confirmed. */
  status: AttrStatus;
  note?: string;
}

const STATUS_RANK: Readonly<Record<AttrStatus, number>> = {
  confirmed: 0,
  inferred: 1,
  'needs-review': 2,
};

function findAttr(product: Product, code: AttrCode): ProductAttribute | undefined {
  return product.attributes.find((attr) => attr.code === code);
}

function itemOf(attr: ProductAttribute, root: string, text?: string): SpecLineItem {
  const item: SpecLineItem = {
    key: attr.code,
    label: attributeLabel(attr.code, root),
    text: text ?? formatAttrValue(attr.code, attr.value),
    status: attr.status,
  };
  if (attr.note !== undefined) item.note = attr.note;
  return item;
}

/** Несколько характеристик в одном пункте строки: статус худший, пояснения через «; ». */
function combined(
  key: string,
  label: string,
  parts: readonly { attr: ProductAttribute; text: string }[],
  separator: string,
): SpecLineItem | null {
  if (parts.length === 0) return null;
  let status: AttrStatus = 'confirmed';
  const notes: string[] = [];
  for (const { attr } of parts) {
    if (STATUS_RANK[attr.status] > STATUS_RANK[status]) status = attr.status;
    if (attr.note !== undefined && !notes.includes(attr.note)) notes.push(attr.note);
  }
  const item: SpecLineItem = {
    key,
    label,
    text: parts.map((part) => part.text).join(separator),
    status,
  };
  if (notes.length > 0) item.note = notes.join('; ');
  return item;
}

/**
 * 2–3 ключевых параметра для карточки товара по категории:
 * антенны — частота · КУ · разъём (если чего-то нет — масса/размер);
 * МШУ — частота · усиление · IP67/XT60 (если указаны);
 * РЧ-фильтры — частота · разъёмы (если указаны в строке);
 * кабели — длина · концы · кабель; чехлы — для модели;
 * мачта — высота · масса · нагрузка; аттенюатор — диапазон · мощность.
 * Значения со статусом inferred/needs-review не скрываются — статус в пункте, UI помечает.
 */
export function getSpecLine(product: Product): SpecLineItem[] {
  const root = rootCategoryOf(product);
  const pick = (...codes: AttrCode[]): SpecLineItem[] =>
    codes.flatMap((code) => {
      const attr = findAttr(product, code);
      return attr === undefined ? [] : [itemOf(attr, root)];
    });
  /** Части составного пункта: найденные характеристики с текстом. */
  const parts = (...codes: AttrCode[]) =>
    codes.flatMap((code) => {
      const attr = findAttr(product, code);
      return attr === undefined ? [] : [{ attr, text: formatAttrValue(code, attr.value) }];
    });
  const items: (SpecLineItem | null)[] = [];

  switch (root) {
    case 'antennas': {
      items.push(...pick('frequency'));
      items.push(...pick('gain_dbi').concat(pick('gain_db')).slice(0, 1));
      items.push(...pick('connector'));
      for (const extra of pick('weight', 'size')) if (items.length < 3) items.push(extra);
      break;
    }
    case 'lna': {
      items.push(...pick('frequency', 'gain_db'));
      const extras = parts('ip67', 'power_connector');
      items.push(combined('ip67+power_connector', 'Защита и питание', extras, ', '));
      break;
    }
    case 'rf-filters': {
      items.push(...pick('frequency'));
      items.push(combined('ports', 'Разъёмы', parts('port1_connector', 'port2_connector'), ' — '));
      break;
    }
    case 'cables': {
      items.push(...pick('cable_length'));
      const end1 = parts('port1_connector', 'port1_shape');
      const end2 = parts('port2_connector', 'port2_shape');
      const ends = combined('ends', 'Концы', [...end1, ...end2], ' ');
      if (ends !== null) {
        // «SMA-male прямой — SMA-male угловой»: внутри конца — пробел, между концами — тире.
        ends.text = [end1, end2]
          .filter((end) => end.length > 0)
          .map((end) => end.map((part) => part.text).join(' '))
          .join(' — ');
        items.push(ends);
      }
      items.push(...pick('cable_type'));
      break;
    }
    case 'covers': {
      const compat = findAttr(product, 'compatible_model');
      if (compat !== undefined) {
        items.push(itemOf(compat, root, `для ${formatAttrValue(compat.code, compat.value)}`));
      }
      break;
    }
    case 'masts':
      items.push(...pick('height', 'weight', 'max_load'));
      break;
    case 'attenuators':
      items.push(...pick('attenuation_range', 'max_power'));
      break;
    default:
      items.push(
        ...formatProductAttributes(product)
          .slice(0, 3)
          .map((f) => {
            const item: SpecLineItem = {
              key: f.code,
              label: f.label,
              text: f.text,
              status: f.status,
            };
            if (f.note !== undefined) item.note = f.note;
            return item;
          }),
      );
  }
  return items.filter((item): item is SpecLineItem => item !== null);
}

/** Строка карточки одной строкой: «700–1100 МГц · 12 дБи · N-female». */
export function formatSpecLine(items: readonly SpecLineItem[]): string {
  return items.map((item) => item.text).join(' · ');
}
