/**
 * Импорт каталога из выгрузки Excel «список v11.xlsx» (source/Catalog_v11_for_Claude.md).
 *
 * Спецификация — docs/DATA-RULES.md, контракт — src/types/catalog.ts.
 * Запуск: `npm run import:catalog`. Выход: src/data/*.generated.json и docs/IMPORT-REPORT.md.
 *
 * Детерминизм: ни дат, ни случайных чисел, порядок — порядок прайса. Повторный запуск на том же
 * источнике и том же overrides.json даёт побайтно те же файлы.
 * Корень проекта берётся от расположения скрипта: тесты запускают копию скрипта во временной
 * копии проекта и не трогают рабочие файлы.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_FILE = 'source/Catalog_v11_for_Claude.md';
const OVERRIDES_FILE = 'src/data/overrides.json';
const SEARCH_MODULE = 'src/lib/search-normalize.ts';
const OUTPUT = {
  products: 'src/data/products.generated.json',
  categories: 'src/data/categories.generated.json',
  sourceRecords: 'src/data/source-records.generated.json',
  issues: 'src/data/import-issues.generated.json',
  report: 'src/data/import-report.generated.json',
  recommendations: 'src/data/recommendations.generated.json',
  markdown: 'docs/IMPORT-REPORT.md',
};

/**
 * Контрольные числа выгрузки v11 (ТЗ §4, DATA-RULES §1–2). Расхождение означает ошибку разбора
 * или новую выгрузку — импорт останавливается, а не публикует недосчитанный каталог.
 */
const EXPECTED_ROWS_BY_BLOCK = { 'B/C': 44, 'E/F': 54, 'H/I': 15, 'C/D': 19 };
const EXPECTED_ROWS_BY_SHEET = { 1: 113, 2: 19 };
const EXPECTED_ROWS_TOTAL = 132;
const EXPECTED_PRODUCTS = 118;

/** Лист временной витрины (DATA-RULES §2): строки других листов сверяются с ним. */
const SHOWCASE_SHEET = '1';

const BLOCKS = { 1: { B: 'B/C', E: 'E/F', H: 'H/I' }, 2: { C: 'C/D' } };

const CATEGORIES = [
  ['antennas', 'antennas', 'Антенны', null],
  ['antennas-log-periodic', 'log-periodic', 'Логопериодические', 'antennas'],
  ['antennas-corner', 'corner', 'Уголковые', 'antennas'],
  ['antennas-yagi', 'yagi', 'Волновой канал', 'antennas'],
  ['antennas-horn', 'horn', 'Рупорные', 'antennas'],
  ['antennas-micro-horn', 'micro-horn', 'Микро-рупорные', 'antennas'],
  ['antennas-mini', 'mini', 'Мини-антенны', 'antennas'],
  ['covers', 'covers', 'Чехлы для антенн', null],
  ['masts', 'masts', 'Карбоновые мачты', null],
  ['lna', 'lna', 'МШУ — малошумящие усилители', null],
  ['rf-filters', 'rf-filters', 'Радиочастотные фильтры', null],
  ['rf-filters-bandpass', 'bandpass', 'Полосовые', 'rf-filters'],
  ['rf-filters-channel', 'channel', 'Канальные', 'rf-filters'],
  ['rf-filters-cavity', 'cavity', 'На объёмных резонаторах', 'rf-filters'],
  ['cables', 'cables', 'Кабельные сборки', null],
  ['attenuators', 'attenuators', 'Аттенюаторы', null],
].map(([id, slug, name, parentId], index) => ({
  id,
  slug,
  name,
  parentId,
  description: '',
  sortIndex: index + 1,
}));
const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

/** Префикс внутреннего кода по корневой категории (DATA-RULES §5). */
const CODE_PREFIX = {
  antennas: 'ANT',
  covers: 'CVR',
  masts: 'MST',
  lna: 'LNA',
  'rf-filters': 'FLT',
  cables: 'CBL',
  attenuators: 'ATT',
};

const ANTENNA_DESIGNS = [
  { text: 'логопериодическая', label: 'логопериодическая', categoryId: 'antennas-log-periodic' },
  { text: 'уголковая', label: 'уголковая', categoryId: 'antennas-corner' },
  { text: 'волновой канал', label: '«волновой канал»', categoryId: 'antennas-yagi' },
  { text: 'рупорная', label: 'рупорная', categoryId: 'antennas-horn' },
  { text: 'микро-рупорная', label: 'микро-рупорная', categoryId: 'antennas-micro-horn' },
];

/** Порядок характеристик в карточке — фиксированный, чтобы JSON не зависел от порядка разбора. */
const ATTR_ORDER = [
  'model',
  'antenna_design',
  'compatible_model',
  'filter_group',
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
  'ip67',
  'power_connector',
  'size',
  'height',
  'weight',
  'max_load',
  'material',
  'attenuation_range',
  'max_power',
  'insertion_loss',
  'rejection',
];

const UNIT_LABEL = {
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

const NOTE_INFERRED_MHZ = 'Единица в прайсе не указана — принята МГц по контексту';
const NOTE_DISPUTED_GHZ = 'В прайсе указано ГГц — единица уточняется';
const NOTE_UNKNOWN_UNIT = 'Единица в прайсе не указана';
const NOTE_AMBIGUOUS_CONNECTOR = 'Неоднозначно: N или SMA — требуется уточнение';
const NOTE_CABLE_VARIANTS = 'В строке два типа кабеля — модель вариантов не подтверждена';

const SEVERITY_ORDER = ['conflict', 'review', 'info'];

class ImportError extends Error {}

// ---------------------------------------------------------------------------
// Мелкие помощники.
// ---------------------------------------------------------------------------

const NUM = '(\\d+(?:[.,]\\d+)?)';
const DASH = '[-‐‑‒–—―−]';

function toNumber(raw) {
  return Number(raw.replace(',', '.'));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function cellRef(record, cell = record.nameCell) {
  return `${record.sheet}!${cell}`;
}

function formatNumber(value) {
  return String(value);
}

/** Сумма в рублях с неразрывными пробелами: 1300000 коп. → «13 000 ₽». */
function formatRub(kopecks) {
  if (kopecks === null) return 'по запросу';
  const rub = String(Math.trunc(kopecks / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const rest = kopecks % 100;
  return `${rub}${rest ? `,${String(rest).padStart(2, '0')}` : ''}\u00a0₽`;
}

function slugNumber(value) {
  return formatNumber(value).replace('.', 'p');
}

const TRANSLIT = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function translit(text) {
  let out = '';
  for (const ch of text.toLowerCase()) out += TRANSLIT[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Фрагменты строки через запятую. Делим только по «, » (запятая + пробел/конец строки), чтобы
 * «КУ=18,5 дБи» не распалось; пустые фрагменты («КУ=20 дБ, , IP67» в B38) отбрасываем.
 */
function splitSegments(text) {
  return text
    .split(/,(?=\s|$)/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

// ---------------------------------------------------------------------------
// Значения характеристик.
// ---------------------------------------------------------------------------

const range = (min, max, unit) => ({ kind: 'range', min, max, unit });
const num = (value, unit) => ({ kind: 'number', value, unit });
const text = (value) => ({ kind: 'text', value });
const list = (values) => ({ kind: 'list', values });
const flag = () => ({ kind: 'flag' });

function attr(code, value, raw, origin, { status = 'confirmed', note } = {}) {
  const attribute = { code, value, status, origin, raw };
  if (note !== undefined) attribute.note = note;
  return attribute;
}

const rowOrigin = (record) => ({ kind: 'row', cell: cellRef(record) });

function findAttr(attributes, code) {
  return attributes.find((attribute) => attribute.code === code) ?? null;
}

/** Значение характеристики для названий, отчёта и поиска: «700–1100 МГц», «12 дБи», «IP67». */
function formatAttrValue(attribute) {
  const value = attribute.value;
  const unit = (u) => (u ? ` ${UNIT_LABEL[u]}` : '');
  switch (value.kind) {
    case 'range':
      return `${formatNumber(value.min)}–${formatNumber(value.max)}${unit(value.unit)}`;
    case 'number':
      return `${formatNumber(value.value)}${unit(value.unit)}`;
    case 'text':
      return value.value;
    case 'list':
      return value.values.join(' / ');
    case 'flag':
      return attribute.code === 'ip67' ? 'IP67' : attribute.code;
    default:
      throw new ImportError(`неизвестный вид значения ${JSON.stringify(value)}`);
  }
}

/** Для отчёта: принятая по контексту единица помечается, чтобы не выглядеть подтверждённой. */
function formatAttrForReport(attribute) {
  if (attribute === null) return null;
  const formatted = formatAttrValue(attribute);
  if (attribute.status === 'inferred' && attribute.value.kind === 'range') {
    const { min, max, unit } = attribute.value;
    return `${formatNumber(min)}–${formatNumber(max)} (${UNIT_LABEL[unit]} — по контексту)`;
  }
  if (attribute.status === 'needs-review') return `${formatted} (на проверке)`;
  return formatted;
}

// ---------------------------------------------------------------------------
// Разбор фрагментов строки.
// ---------------------------------------------------------------------------

const FREQUENCY_RE = new RegExp(`^${NUM}\\s*${DASH}\\s*${NUM}(?:\\s*(МГц|ГГц|MHz|GHz))?$`, 'iu');

function parseFrequency(segment, origin) {
  const m = FREQUENCY_RE.exec(segment);
  if (!m) return null;
  const min = toNumber(m[1]);
  const max = toNumber(m[2]);
  const unit = m[3]?.toLowerCase();
  if (unit === undefined) {
    return attr('frequency', range(min, max, 'MHz'), segment, origin, {
      status: 'inferred',
      note: NOTE_INFERRED_MHZ,
    });
  }
  if (unit === 'мгц' || unit === 'mhz')
    return attr('frequency', range(min, max, 'MHz'), segment, origin);
  // «6000–8000 ГГц» (B43–B45) — 6–8 ТГц, для этого ассортимента неправдоподобно. Не пересчитываем
  // молча: храним как написано и исключаем из числовой фильтрации до ответа заказчика (ТЗ §4 п.8).
  if (max >= 1000) {
    return attr('frequency', range(min, max, 'GHz'), segment, origin, {
      status: 'needs-review',
      note: NOTE_DISPUTED_GHZ,
    });
  }
  const toMhz = (ghz) => Math.round(ghz * 1_000_000) / 1000;
  return attr('frequency', range(toMhz(min), toMhz(max), 'MHz'), segment, origin);
}

const GAIN_RE = new RegExp(`^КУ\\s*=\\s*${NUM}(?:\\s*${DASH}\\s*${NUM})?\\s*(дБи|дБ)$`, 'u');

/** КУ в дБи и усиление в дБ — разные характеристики (ТЗ §4 п.10): дБ не превращается в дБи. */
function parseGain(segment, origin) {
  const m = GAIN_RE.exec(segment);
  if (!m) return null;
  const unit = m[3] === 'дБи' ? 'dBi' : 'dB';
  const value =
    m[2] === undefined ? num(toNumber(m[1]), unit) : range(toNumber(m[1]), toNumber(m[2]), unit);
  return attr(unit === 'dBi' ? 'gain_dbi' : 'gain_db', value, segment, origin);
}

const CONNECTOR_RE = /^(N|sma)[-\s](мама|папа|female|male|f|m)$/iu;
const AMBIGUOUS_CONNECTOR_RE = /^(N|sma)\/(N|sma)[-\s](мама|папа|female|male|f|m)$/iu;

/** «N-мама»/«N-f» → «N-female», «sma-m»/«sma male» → «SMA-male»; нераспознанное → null. */
function normalizeConnector(raw) {
  const m = CONNECTOR_RE.exec(raw.trim());
  if (!m) return null;
  const family = m[1].toLowerCase() === 'n' ? 'N' : 'SMA';
  const gender = /^(мама|female|f)$/iu.test(m[2]) ? 'female' : 'male';
  return `${family}-${gender}`;
}

function parseConnector(segment, origin) {
  const normalized = normalizeConnector(segment);
  if (normalized) return attr('connector', text(normalized), segment, origin);
  // Тип8 «N/sma-мама»: один разъём текстом на проверке — не два разъёма и не два SKU (ТЗ §4 п.11).
  if (AMBIGUOUS_CONNECTOR_RE.test(segment)) {
    return attr('connector', text(segment), segment, origin, {
      status: 'needs-review',
      note: NOTE_AMBIGUOUS_CONNECTOR,
    });
  }
  return null;
}

const WEIGHT_RE = new RegExp(`^${NUM}\\s*(г|кг)\\.?$`, 'u');

function parseWeight(segment, origin) {
  const m = WEIGHT_RE.exec(segment);
  if (!m) return null;
  const grams = m[2] === 'кг' ? Math.round(toNumber(m[1]) * 1000) : toNumber(m[1]);
  return attr('weight', num(grams, 'g'), segment, origin);
}

const SIZE_RE = new RegExp(`^${NUM}\\s*(метров|метра|метр|м)$`, 'u');

/** Тип4 «2.5 метра» — в ТЗ «размер», не длина и не высота (ТЗ §4 п.14). */
function parseSize(segment, origin) {
  const m = SIZE_RE.exec(segment);
  if (!m) return null;
  return attr('size', num(toNumber(m[1]), 'm'), segment, origin);
}

function parseSegments(record, segments, parsers) {
  const origin = rowOrigin(record);
  const attributes = [];
  for (const segment of segments) {
    let parsed = null;
    for (const parser of parsers) {
      parsed = parser(segment, origin);
      if (parsed) break;
    }
    if (!parsed) {
      throw new ImportError(
        `${cellRef(record)}: не распознан фрагмент «${segment}» в строке «${record.rawText}»`,
      );
    }
    if (findAttr(attributes, parsed.code)) {
      throw new ImportError(`${cellRef(record)}: характеристика ${parsed.code} указана дважды`);
    }
    attributes.push(parsed);
  }
  return attributes;
}

/** Концы кабеля/фильтра: «sma-m прямой - N-m», «N-f - N-f», «sma-m прямой- sma-m угловой». */
function parsePorts(record, segment) {
  // Разделитель концов — дефис с пробелом хотя бы с одной стороны; дефис внутри «sma-m» — нет.
  const ends = segment.split(/\s*-\s+|\s+-\s*/);
  if (ends.length !== 2) return null;
  const origin = rowOrigin(record);
  const attributes = [];
  for (const [index, end] of ends.entries()) {
    const m = /^(\S+)(?:\s+(прямой|угловой))?$/u.exec(end.trim());
    const connector = m ? normalizeConnector(m[1]) : null;
    if (!connector) return null;
    const port = `port${index + 1}`;
    attributes.push(attr(`${port}_connector`, text(connector), m[1], origin));
    if (m[2]) attributes.push(attr(`${port}_shape`, text(m[2]), m[2], origin));
  }
  return attributes;
}

function portSlug(attributes, port) {
  const connector = findAttr(attributes, `${port}_connector`).value.value;
  const shape = findAttr(attributes, `${port}_shape`)?.value.value;
  const [family, gender] = connector.toLowerCase().split('-');
  const shapeSlug = shape ? `-${shape === 'прямой' ? 'straight' : 'angled'}` : '';
  return `${family}-${gender[0]}${shapeSlug}`;
}

function portLabel(attributes, port) {
  const connector = findAttr(attributes, `${port}_connector`).value.value;
  const shape = findAttr(attributes, `${port}_shape`)?.value.value;
  return shape ? `${connector} ${shape}` : connector;
}

/** Характеристика из заголовка группы («Фильтры полосовые:» → группа фильтра «полосовой»). */
function headerAttr(code, value, header) {
  return attr(code, text(value), header.rawText, { kind: 'group-header', cell: cellRef(header) });
}

function frequencyLabel(frequency) {
  const { min, max, unit } = frequency.value;
  // Единица в названии — только если она есть в исходной строке (DATA-RULES §5).
  const unitLabel = frequency.status === 'inferred' ? '' : ` ${UNIT_LABEL[unit]}`;
  return `${formatNumber(min)}–${formatNumber(max)}${unitLabel}`;
}

function requireAttr(record, attributes, code) {
  const found = findAttr(attributes, code);
  if (!found)
    throw new ImportError(`${cellRef(record)}: нет характеристики ${code} в «${record.rawText}»`);
  return found;
}

// ---------------------------------------------------------------------------
// Разбор строк по группам. Каждый разборщик возвращает ParsedRow:
// { kind, categoryId, model, name, slug, attributes, notes, matchKey }.
// matchKey — ключ сопоставления строк разных листов: модель, если она есть, иначе slug.
// ---------------------------------------------------------------------------

function parseAntennaGroupRow(record) {
  const raw = record.rawText.trim();
  if (/^Чехол\s/iu.test(raw)) return parseCover(record, raw);
  if (/^Антенна\s+"/u.test(raw)) return parseNamedAntenna(record, raw);
  return parseTypedAntenna(record, raw);
}

function parseTypedAntenna(record, raw) {
  const m = /^(Тип\s*(\d+))\s*(.*?)\s*\((.+)\)$/u.exec(raw);
  if (!m) throw new ImportError(`${cellRef(record)}: не распознана строка антенны «${raw}»`);
  const [, rawModel, number, designText, inner] = m;
  const model = `Тип${number}`;
  const origin = rowOrigin(record);
  const attributes = [attr('model', text(model), rawModel, origin)];
  let categoryId = 'antennas';
  let design = null;
  if (designText !== '') {
    design = ANTENNA_DESIGNS.find((candidate) => candidate.text === designText);
    if (!design)
      throw new ImportError(`${cellRef(record)}: неизвестная конструкция «${designText}»`);
    categoryId = design.categoryId;
    attributes.push(attr('antenna_design', text(design.text), designText, origin));
  }
  attributes.push(
    ...parseSegments(record, splitSegments(inner), [
      parseFrequency,
      parseGain,
      parseConnector,
      parseWeight,
      parseSize,
    ]),
  );
  requireAttr(record, attributes, 'frequency');
  return {
    kind: 'antenna',
    categoryId,
    model,
    name: design ? `Антенна ${design.label} ${model}` : `Антенна ${model}`,
    slug: `antenna-tip${number}`,
    attributes,
    notes: [],
    matchKey: `antenna:${model}`,
  };
}

/** «Антенна "египетская сила" …» — конструкция не указана, по догадке не классифицируем (ТЗ §5). */
function parseNamedAntenna(record, raw) {
  const m = /^Антенна\s+"([^"]+)"\s+(.+)$/u.exec(raw);
  if (!m) throw new ImportError(`${cellRef(record)}: не распознана строка антенны «${raw}»`);
  const [, title, rest] = m;
  const attributes = parseSegments(record, splitSegments(rest), [parseFrequency, parseWeight]);
  const slug = `antenna-${translit(title)}`;
  return {
    kind: 'antenna',
    categoryId: 'antennas',
    model: null,
    name: `Антенна «${title}»`,
    slug,
    attributes,
    notes: [],
    matchKey: `antenna:${slug}`,
  };
}

function parseCover(record, raw) {
  const m = /^Чехол для\s+(тип\s*(\d+))$/iu.exec(raw);
  if (!m) throw new ImportError(`${cellRef(record)}: не распознан чехол «${raw}»`);
  const model = `Тип${m[2]}`;
  return {
    kind: 'cover',
    categoryId: 'covers',
    model: null,
    name: `Чехол для антенны ${model}`,
    slug: `cover-tip${m[2]}`,
    attributes: [attr('compatible_model', text(model), m[1], rowOrigin(record))],
    notes: [],
    matchKey: `cover:${model}`,
  };
}

function parseMiniAntenna(record) {
  const raw = record.rawText.trim();
  // «М8» в B32 набрана кириллицей — модель приводится к латинской «M8», исходник остаётся в raw.
  const m = /^([MМ])(\d+)\s*\((.+)\)$/u.exec(raw);
  if (!m) throw new ImportError(`${cellRef(record)}: не распознана мини-антенна «${raw}»`);
  const model = `M${m[2]}`;
  const rawModel = `${m[1]}${m[2]}`;
  const attributes = [
    attr(
      'model',
      text(model),
      rawModel,
      rowOrigin(record),
      rawModel === model ? {} : { note: `В прайсе записано кириллицей: «${rawModel}»` },
    ),
    ...parseSegments(record, splitSegments(m[3]), [parseFrequency, parseGain]),
  ];
  requireAttr(record, attributes, 'frequency');
  return {
    kind: 'mini',
    categoryId: 'antennas-mini',
    model,
    name: `Мини-антенна ${model}`,
    slug: `mini-antenna-m${m[2]}`,
    attributes,
    notes: [],
    matchKey: `mini:${model}`,
  };
}

/** «12 метров (6 кг, нагрузка до 12 кг)»: высота, масса и нагрузка — разные поля (ТЗ §4 п.14). */
function parseMast(record, header) {
  const raw = record.rawText.trim();
  const m = new RegExp(`^(${NUM}\\s*(?:метров|метра|метр|м))\\s*\\((.+)\\)$`, 'u').exec(raw);
  if (!m) throw new ImportError(`${cellRef(record)}: не распознана мачта «${raw}»`);
  const origin = rowOrigin(record);
  const height = toNumber(m[2]);
  const attributes = [attr('height', num(height, 'm'), m[1], origin)];
  const loadRe = new RegExp(`^нагрузка до\\s*${NUM}\\s*кг$`, 'u');
  const parseLoad = (segment, segmentOrigin) => {
    const load = loadRe.exec(segment);
    return load ? attr('max_load', num(toNumber(load[1]), 'kg'), segment, segmentOrigin) : null;
  };
  attributes.push(...parseSegments(record, splitSegments(m[3]), [parseWeight, parseLoad]));
  const carbon = /карбонов/iu.test(header.rawText);
  if (carbon) attributes.push(headerAttr('material', 'карбон', header));
  return {
    kind: 'mast',
    categoryId: 'masts',
    model: null,
    name: `Мачта${carbon ? ' карбоновая' : ''} ${formatNumber(height)} м`,
    slug: `mast${carbon ? '-carbon' : ''}-${slugNumber(height)}m`,
    attributes,
    notes: [],
    matchKey: `mast:${slugNumber(height)}`,
  };
}

function parseLna(record) {
  const raw = record.rawText.trim();
  const parseIp67 = (segment, origin) =>
    /^IP67$/iu.test(segment) ? attr('ip67', flag(), segment, origin) : null;
  const parseXt60 = (segment, origin) =>
    /^XT60$/iu.test(segment) ? attr('power_connector', text('XT60'), segment, origin) : null;
  const attributes = parseSegments(record, splitSegments(raw), [
    parseFrequency,
    parseGain,
    parseIp67,
    parseXt60,
  ]);
  const frequency = requireAttr(record, attributes, 'frequency');
  const gain = findAttr(attributes, 'gain_db') ?? findAttr(attributes, 'gain_dbi');
  const ip67 = findAttr(attributes, 'ip67');
  const xt60 = findAttr(attributes, 'power_connector');
  const nameParts = [`МШУ ${frequencyLabel(frequency)}`];
  const slugParts = ['lna', slugNumber(frequency.value.min), slugNumber(frequency.value.max)];
  if (gain) {
    nameParts.push(formatAttrValue(gain));
    const g = gain.value;
    const gainSlug =
      g.kind === 'range' ? `${slugNumber(g.min)}-${slugNumber(g.max)}` : slugNumber(g.value);
    slugParts.push(`${gainSlug}${gain.code === 'gain_dbi' ? 'dbi' : 'db'}`);
  }
  if (ip67) {
    nameParts.push('IP67');
    slugParts.push('ip67');
  }
  if (xt60) {
    nameParts.push('XT60');
    slugParts.push('xt60');
  }
  const slug = slugParts.join('-');
  return {
    kind: 'lna',
    categoryId: 'lna',
    model: null,
    name: nameParts.join(', '),
    slug,
    attributes,
    notes: [],
    matchKey: `lna:${slug}`,
  };
}

function parseCable(record) {
  const raw = record.rawText.trim();
  const origin = rowOrigin(record);
  const attributes = [];
  const notes = [];
  let lengthLabel = null;
  let lengthSlug = null;
  let types = null;
  for (const segment of splitSegments(raw)) {
    const length = new RegExp(`^${NUM}\\s*(см|м)$`, 'u').exec(segment);
    if (length) {
      const value = toNumber(length[1]);
      const cm = length[2] === 'м' ? Math.round(value * 100) : value;
      attributes.push(attr('cable_length', num(cm, 'cm'), segment, origin));
      lengthLabel = `${formatNumber(value)} ${length[2]}`;
      lengthSlug = `${slugNumber(value)}${length[2] === 'м' ? 'm' : 'cm'}`;
      continue;
    }
    if (/^RG/iu.test(segment)) {
      // «RG-142 - под рупор !» (B57): пометка после « - » — заметка строки, не тип кабеля.
      const [typesPart, ...noteParts] = segment.split(/\s+-\s+/);
      if (noteParts.length > 0) {
        notes.push({
          text: noteParts.join(' - '),
          cell: cellRef(record),
          kind: 'row-note',
          scopeConfirmed: true,
        });
      }
      types = typesPart.split(/\s*\/\s*/).map((type) => type.trim());
      attributes.push(
        types.length === 1
          ? attr('cable_type', text(types[0]), typesPart, origin)
          : attr('cable_type', list(types), typesPart, origin, {
              status: 'needs-review',
              note: NOTE_CABLE_VARIANTS,
            }),
      );
      continue;
    }
    const ports = parsePorts(record, segment);
    if (!ports) {
      throw new ImportError(`${cellRef(record)}: не распознан фрагмент кабеля «${segment}»`);
    }
    attributes.push(...ports);
  }
  if (lengthLabel === null || types === null || !findAttr(attributes, 'port2_connector')) {
    throw new ImportError(`${cellRef(record)}: неполная строка кабельной сборки «${raw}»`);
  }
  const typesSlug = types.map((type) => type.toLowerCase().replace(/[^a-z0-9]/g, '')).join('-');
  const slug = `cable-${lengthSlug}-${portSlug(attributes, 'port1')}-${portSlug(attributes, 'port2')}-${typesSlug}`;
  return {
    kind: 'cable',
    categoryId: 'cables',
    model: null,
    name: `Кабельная сборка ${lengthLabel}, ${portLabel(attributes, 'port1')} — ${portLabel(attributes, 'port2')}, ${types.join(' / ')}`,
    slug,
    attributes,
    notes,
    matchKey: `cable:${slug}`,
  };
}

/** Фильтры: полосовые (E/F), канальные (H/I), на объёмных резонаторах (лист 2). */
function makeFilterParser({ group, categoryId, slugPrefix, namePrefix }) {
  return (record, header) => {
    let raw = record.rawText.trim();
    const notes = [];
    // «(на управу)» в E5–E9 — пометка строки непонятного смысла, в название не идёт.
    const note = /^(.*?)\s*\(([^()]+)\)$/u.exec(raw);
    if (note) {
      raw = note[1];
      notes.push({ text: note[2], cell: cellRef(record), kind: 'row-note', scopeConfirmed: true });
    }
    const lossRe = new RegExp(`^${NUM}\\s+затухание$`, 'u');
    const rejectionRe = new RegExp(`^ослаб\\.?\\s*${NUM}\\s*дБ$`, 'u');
    const parseLoss = (segment, origin) => {
      const m = lossRe.exec(segment);
      // «0.4 затухание» — единица не указана: число без единицы на проверке (ТЗ §4 п.15).
      return m
        ? attr('insertion_loss', num(toNumber(m[1]), null), segment, origin, {
            status: 'needs-review',
            note: NOTE_UNKNOWN_UNIT,
          })
        : null;
    };
    const parseRejection = (segment, origin) => {
      const m = rejectionRe.exec(segment);
      return m ? attr('rejection', num(toNumber(m[1]), 'dB'), segment, origin) : null;
    };
    const parsePortPair = (segment) => parsePorts(record, segment);
    const attributes = [headerAttr('filter_group', group, header)];
    for (const segment of splitSegments(raw)) {
      const origin = rowOrigin(record);
      const parsed =
        parseFrequency(segment, origin) ??
        parseLoss(segment, origin) ??
        parseRejection(segment, origin) ??
        parsePortPair(segment);
      if (!parsed) {
        throw new ImportError(`${cellRef(record)}: не распознан фрагмент фильтра «${segment}»`);
      }
      attributes.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    }
    const frequency = requireAttr(record, attributes, 'frequency');
    const slugParts = [
      slugPrefix,
      slugNumber(frequency.value.min),
      slugNumber(frequency.value.max),
    ];
    let name = `${namePrefix} ${frequencyLabel(frequency)}`;
    if (findAttr(attributes, 'port1_connector')) {
      const port1 = portLabel(attributes, 'port1');
      const port2 = portLabel(attributes, 'port2');
      name += `, ${port1} — ${port2}`;
      const slug1 = findAttr(attributes, 'port1_connector').value.value.toLowerCase();
      const slug2 = findAttr(attributes, 'port2_connector').value.value.toLowerCase();
      slugParts.push(slug1 === slug2 ? slug1 : `${slug1}-${slug2}`);
    }
    const slug = slugParts.join('-');
    return {
      kind: 'filter',
      categoryId,
      model: null,
      name,
      slug,
      attributes,
      notes,
      matchKey: `filter:${slug}`,
    };
  };
}

function parseAttenuator(record) {
  const raw = record.rawText.trim();
  const rangeRe = new RegExp(`^регулировка от\\s*${NUM}\\s*до\\s*${NUM}\\s*дБ$`, 'u');
  const powerRe = new RegExp(`^до\\s*${NUM}\\s*Вт$`, 'u');
  const parseRange = (segment, origin) => {
    const m = rangeRe.exec(segment);
    return m
      ? attr('attenuation_range', range(toNumber(m[1]), toNumber(m[2]), 'dB'), segment, origin)
      : null;
  };
  const parsePower = (segment, origin) => {
    const m = powerRe.exec(segment);
    return m ? attr('max_power', num(toNumber(m[1]), 'W'), segment, origin) : null;
  };
  const attributes = parseSegments(record, splitSegments(raw), [parseRange, parsePower]);
  const attenuation = requireAttr(record, attributes, 'attenuation_range').value;
  const power = findAttr(attributes, 'max_power')?.value;
  const slug = [
    'attenuator',
    `${slugNumber(attenuation.min)}-${slugNumber(attenuation.max)}db`,
    ...(power ? [`${slugNumber(power.value)}w`] : []),
  ].join('-');
  return {
    kind: 'attenuator',
    categoryId: 'attenuators',
    model: null,
    name: `Аттенюатор ${formatNumber(attenuation.min)}–${formatNumber(attenuation.max)} дБ${power ? `, до ${formatNumber(power.value)} Вт` : ''}`,
    slug,
    attributes,
    notes: [],
    matchKey: `attenuator:${slug}`,
  };
}

/** Разборщик по тексту заголовка группы. Неизвестная группа — ошибка, а не молчаливый пропуск. */
const GROUP_PARSERS = {
  антенны: parseAntennaGroupRow,
  'антенны мини': parseMiniAntenna,
  'мачты карбоновые': parseMast,
  мшу: parseLna,
  'кабельные сборки': parseCable,
  'фильтры полосовые': makeFilterParser({
    group: 'полосовой',
    categoryId: 'rf-filters-bandpass',
    slugPrefix: 'bandpass-filter',
    namePrefix: 'Фильтр полосовой',
  }),
  'фильтры канальные': makeFilterParser({
    group: 'канальный',
    categoryId: 'rf-filters-channel',
    slugPrefix: 'channel-filter',
    namePrefix: 'Фильтр канальный',
  }),
  'фильтры на объёмных резонаторах': makeFilterParser({
    group: 'на объёмных резонаторах',
    categoryId: 'rf-filters-cavity',
    slugPrefix: 'cavity-filter',
    namePrefix: 'Фильтр на объёмных резонаторах',
  }),
  аттенюатор: parseAttenuator,
};

function groupParser(header) {
  const key = header.rawText.trim().replace(/:$/, '').trim().toLowerCase();
  const parser = GROUP_PARSERS[key];
  if (!parser) {
    throw new ImportError(
      `${cellRef(header)}: неизвестная группа «${header.rawText}» — нет правила разбора`,
    );
  }
  return parser;
}

function parsePrice(record) {
  const raw = record.rawPrice.trim();
  if (/^\d[\d\s\u00a0]*$/.test(raw)) {
    return { priceType: 'fixed', price: Number(raw.replace(/[\s\u00a0]/g, '')) * 100 };
  }
  // «По запросу» — отдельный тип цены, не 0 (ТЗ §4 п.7).
  if (/^по запросу$/iu.test(raw)) return { priceType: 'request', price: null };
  throw new ImportError(
    `${cellRef(record, record.priceCell)}: не распознана цена «${record.rawPrice}»`,
  );
}

// ---------------------------------------------------------------------------
// Чтение выгрузки: markdown-таблицы по листам.
// ---------------------------------------------------------------------------

/** Ячейка markdown-таблицы без одного пробела-отступа с каждой стороны: хвостовые пробелы текста целы. */
function unpadCell(cell) {
  let out = cell;
  if (out.startsWith(' ')) out = out.slice(1);
  if (out.endsWith(' ')) out = out.slice(0, -1);
  return out;
}

function nextColumn(column) {
  if (!/^[A-Y]$/.test(column)) throw new ImportError(`неподдерживаемая колонка ${column}`);
  return String.fromCharCode(column.charCodeAt(0) + 1);
}

function readSourceRows(markdown) {
  const rows = [];
  let sheet = null;
  for (const [index, line] of markdown.split('\n').entries()) {
    const lineNo = index + 1;
    const sheetHeading = /^## Лист `([^`]+)`\s*$/u.exec(line);
    if (sheetHeading) {
      sheet = sheetHeading[1];
      if (!(sheet in BLOCKS))
        throw new ImportError(`строка ${lineNo}: неизвестный лист «${sheet}»`);
      continue;
    }
    if (line.startsWith('## ')) {
      sheet = null;
      continue;
    }
    if (sheet === null || !line.startsWith('|')) continue;
    if (!line.trimEnd().endsWith('|'))
      throw new ImportError(`строка ${lineNo}: оборванная строка таблицы`);
    const cells = line.trimEnd().slice(1, -1).split('|').map(unpadCell);
    if (cells.length !== 5) {
      throw new ImportError(`строка ${lineNo}: ожидалось 5 колонок, найдено ${cells.length}`);
    }
    const [rowCell, nameCell, rawText, priceCell, rawPrice] = cells;
    if (rowCell.trim() === 'Строка Excel' || /^-+$/.test(rowCell.trim())) continue;
    const row = Number(rowCell.trim());
    const name = /^([A-Z])(\d+)$/.exec(nameCell.trim());
    const price = /^([A-Z])(\d+)$/.exec(priceCell.trim());
    if (
      !Number.isInteger(row) ||
      !name ||
      !price ||
      Number(name[2]) !== row ||
      Number(price[2]) !== row
    ) {
      throw new ImportError(`строка ${lineNo}: адреса ячеек не согласованы со строкой Excel`);
    }
    if (price[1] !== nextColumn(name[1])) {
      throw new ImportError(
        `строка ${lineNo}: цена ${price[0]} не в соседней колонке с ${name[0]}`,
      );
    }
    const block = BLOCKS[sheet][name[1]];
    if (!block)
      throw new ImportError(
        `строка ${lineNo}: колонка ${name[1]} не входит в блоки листа ${sheet}`,
      );
    if (rawText.trim() === '' && rawPrice.trim() === '') continue;
    rows.push({ sheet, block, row, nameCell: name[0], priceCell: price[0], rawText, rawPrice });
  }
  return rows;
}

/**
 * Заголовок: в цене — заголовок колонки «Цена» (B3/C3) или текст на «:» без цены; одно слово без
 * цены («Аттенюатор», E59) — тоже заголовок. Прочий текст без цены — примечание (B46, E57).
 */
function classifyRow(rawText, rawPrice) {
  const label = rawText.trim();
  const price = rawPrice.trim();
  if (price === 'Цена') return 'group-header';
  if (price !== '') return 'product';
  if (label.endsWith(':') || /^[\p{L}-]+$/u.test(label)) return 'group-header';
  return 'note';
}

function buildSourceRecords(rows) {
  const records = [];
  const currentHeader = new Map();
  for (const row of rows) {
    const kind = classifyRow(row.rawText, row.rawPrice);
    const blockKey = `${row.sheet}|${row.block}`;
    let groupHeader = null;
    if (kind === 'group-header') {
      currentHeader.set(blockKey, row.rawText);
    } else {
      groupHeader = currentHeader.get(blockKey) ?? null;
      if (groupHeader === null) {
        throw new ImportError(
          `${row.sheet}!${row.nameCell}: строка стоит вне группы (нет заголовка выше)`,
        );
      }
    }
    records.push({
      id: `s${row.sheet}-${row.nameCell}`,
      sheet: row.sheet,
      block: row.block,
      row: row.row,
      nameCell: row.nameCell,
      priceCell: row.priceCell,
      rawText: row.rawText,
      rawPrice: row.rawPrice,
      kind,
      groupHeader,
      resolution: kind === 'group-header' ? 'excluded-header' : 'created',
      productId: null,
      issueIds: [],
    });
  }
  return records;
}

function countProductRows(records) {
  const byBlock = { 'B/C': 0, 'E/F': 0, 'H/I': 0, 'C/D': 0 };
  const bySheet = { 1: 0, 2: 0 };
  for (const record of records) {
    if (record.kind !== 'product') continue;
    byBlock[record.block] += 1;
    bySheet[record.sheet] += 1;
  }
  return { total: bySheet[1] + bySheet[2], bySheet, byBlock };
}

function checkRowCounts(counts) {
  const problems = [];
  for (const [block, expected] of Object.entries(EXPECTED_ROWS_BY_BLOCK)) {
    if (counts.byBlock[block] !== expected) {
      problems.push(
        `блок ${block}: ${counts.byBlock[block]} товарных строк, ожидалось ${expected}`,
      );
    }
  }
  for (const [sheet, expected] of Object.entries(EXPECTED_ROWS_BY_SHEET)) {
    if (counts.bySheet[sheet] !== expected) {
      problems.push(
        `лист ${sheet}: ${counts.bySheet[sheet]} товарных строк, ожидалось ${expected}`,
      );
    }
  }
  if (counts.total !== EXPECTED_ROWS_TOTAL) {
    problems.push(`всего ${counts.total} товарных строк, ожидалось ${EXPECTED_ROWS_TOTAL}`);
  }
  if (problems.length > 0) {
    throw new ImportError(
      `счёт товарных строк не сходится с контрольным (ТЗ §4: 113 = 44 + 54 + 15 на листе 1, 19 на листе 2):\n  - ${problems.join('\n  - ')}\n` +
        'Проверьте классификацию строк (заголовок/примечание/товар) в docs/DATA-RULES.md §1. ' +
        'Если это новая выгрузка — обновите контрольные числа в scripts/import-catalog.mjs осознанно.',
    );
  }
}

// ---------------------------------------------------------------------------
// Товары.
// ---------------------------------------------------------------------------

function categoryPath(categoryId) {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) throw new ImportError(`нет категории ${categoryId}`);
  return category.parentId ? [category.parentId, category.id] : [category.id];
}

function sortAttributes(attributes) {
  return [...attributes].sort((a, b) => ATTR_ORDER.indexOf(a.code) - ATTR_ORDER.indexOf(b.code));
}

function buildGroups(records) {
  const groups = [];
  const current = new Map();
  for (const record of records) {
    const blockKey = `${record.sheet}|${record.block}`;
    if (record.kind === 'group-header') {
      const group = { header: record, products: [], notes: [] };
      groups.push(group);
      current.set(blockKey, group);
      continue;
    }
    const group = current.get(blockKey);
    (record.kind === 'note' ? group.notes : group.products).push(record);
  }
  return groups;
}

/**
 * Групповое примечание о разъёмах («на МШУ стоят оба sma-female», «на фильтрах стоят разъёмы
 * sma male - sma female»). Применяется к товарам группы, только если не противоречит разъёмам,
 * явно указанным в строках той же группы. Противоречие (E57 против N-f - N-f в E4–E9) означает,
 * что область действия не подтверждена: примечание остаётся заметкой и в характеристики не идёт.
 */
function parseConnectorNote(note) {
  const m = /^на\s+\S+\s+стоят\s+(оба\s+|разъёмы\s+)(.+)$/u.exec(note.rawText.trim());
  if (!m) return null;
  const parts = m[1].startsWith('оба') ? [m[2], m[2]] : m[2].split(/\s+-\s+/);
  if (parts.length !== 2) return null;
  const connectors = parts.map((part) => normalizeConnector(part));
  return connectors.every(Boolean) ? connectors : null;
}

function applyGroupNotes(group, productsByRecord) {
  const results = [];
  for (const note of group.notes) {
    const connectors = parseConnectorNote(note);
    if (!connectors) {
      throw new ImportError(
        `${cellRef(note)}: не распознано примечание «${note.rawText}» — нет правила`,
      );
    }
    // Только товары витрины этой группы: конфликтные строки другого листа в productsByRecord не попадают.
    const products = [
      ...new Set(group.products.map((record) => productsByRecord.get(record.id)).filter(Boolean)),
    ];
    const explicit = products.filter((product) => findAttr(product.attributes, 'port1_connector'));
    const contradicts = explicit.some(
      (product) =>
        findAttr(product.attributes, 'port1_connector').value.value !== connectors[0] ||
        findAttr(product.attributes, 'port2_connector')?.value.value !== connectors[1],
    );
    const targets = products.filter((product) => !explicit.includes(product));
    if (!contradicts) {
      const origin = { kind: 'group-note', cell: cellRef(note) };
      const noteText = `Из примечания к группе «${group.header.rawText.trim()}» (${cellRef(note)})`;
      for (const product of targets) {
        product.attributes.push(
          attr('port1_connector', text(connectors[0]), note.rawText, origin, { note: noteText }),
          attr('port2_connector', text(connectors[1]), note.rawText, origin, { note: noteText }),
        );
        product.attributes = sortAttributes(product.attributes);
      }
      note.resolution = 'group-note-applied';
    } else {
      for (const product of targets) {
        product.notes.push({
          text: note.rawText,
          cell: cellRef(note),
          kind: 'group-note',
          scopeConfirmed: false,
        });
      }
      note.resolution = 'group-note-pending';
    }
    results.push({ note, group, applied: !contradicts, targets, explicit });
  }
  return results;
}

function buildProducts(records) {
  const products = [];
  const meta = new Map();
  const productsByRecord = new Map();
  const bySlug = new Map();
  const duplicates = [];
  const conflicts = [];
  const groupNotes = [];
  const seenRows = new Map();
  // Разбор каждой товарной строки (и повторов, и конфликтных) — для SourceRecord.parsed.
  const rowParses = new Map();

  for (const group of buildGroups(records)) {
    const parser = groupParser(group.header);
    for (const record of group.products) {
      const parsed = parser(record, group.header);
      const price = parsePrice(record);
      rowParses.set(record.id, { price, attributes: parsed.attributes });

      // Точный повтор строки того же блока (E49–E52 повторяют E44, E46, E47, E48): второе
      // происхождение того же товара, а не вторая карточка.
      const rowKey = `${record.sheet}|${record.block}|${record.rawText}|${record.rawPrice}`;
      const original = seenRows.get(rowKey);
      if (original) {
        const product = productsByRecord.get(original.id);
        if (!product) {
          throw new ImportError(
            `${cellRef(record)}: повтор строки ${cellRef(original)}, у которой нет своей карточки (${original.resolution})`,
          );
        }
        record.resolution = 'merged-duplicate';
        record.productId = product.id;
        product.sourceIds.push(record.id);
        productsByRecord.set(record.id, product);
        duplicates.push({ original, duplicate: record, product });
        continue;
      }
      seenRows.set(rowKey, record);

      if (record.sheet !== SHOWCASE_SHEET) {
        // Строка другого листа с той же моделью — конфликт с товаром витрины, не новая карточка.
        const matches = products.filter(
          (product) =>
            meta.get(product.id).record.sheet === SHOWCASE_SHEET &&
            meta.get(product.id).parsed.matchKey === parsed.matchKey,
        );
        if (matches.length > 1) {
          throw new ImportError(
            `${cellRef(record)}: «${record.rawText}» совпадает с несколькими товарами листа ${SHOWCASE_SHEET} (${matches.map((p) => p.id).join(', ')})`,
          );
        }
        if (matches.length === 1) {
          const product = matches[0];
          record.resolution = 'conflict-attached';
          record.productId = product.id;
          product.sourceIds.push(record.id);
          conflicts.push({
            product,
            sheet1: meta.get(product.id),
            sheet2: { record, parsed, price },
          });
          continue;
        }
      }

      if (bySlug.has(parsed.slug)) {
        throw new ImportError(
          `${cellRef(record)}: slug «${parsed.slug}» уже занят товаром из ${cellRef(meta.get(parsed.slug).record)} — правило имён не различает позиции`,
        );
      }
      const product = {
        id: parsed.slug,
        slug: parsed.slug,
        code: '',
        name: parsed.name,
        categoryId: parsed.categoryId,
        categoryPath: categoryPath(parsed.categoryId),
        model: parsed.model,
        priceType: price.priceType,
        price: price.price,
        currency: 'RUB',
        attributes: sortAttributes(parsed.attributes),
        notes: parsed.notes,
        images: [],
        sourceIds: [record.id],
        issueIds: [],
        sortIndex: products.length + 1,
        searchText: '',
      };
      record.productId = product.id;
      products.push(product);
      bySlug.set(product.slug, product);
      productsByRecord.set(record.id, product);
      meta.set(product.id, { record, parsed, price, group, generatedName: parsed.name });
    }
    groupNotes.push(...applyGroupNotes(group, productsByRecord));
  }

  if (products.length !== EXPECTED_PRODUCTS) {
    throw new ImportError(
      `создано ${products.length} товаров, ожидалось ${EXPECTED_PRODUCTS} (DATA-RULES §2: 132 строки − 4 повтора − 10 конфликтов листа 2)`,
    );
  }

  // parsed: характеристики строки + применённое к её группе примечание (у конфликтной строки листа 2
  // своего примечания нет — характеристики товара листа 1 ей не приписываются).
  for (const record of records) {
    const own = rowParses.get(record.id);
    if (!own) continue;
    const fromNotes =
      record.resolution === 'conflict-attached'
        ? []
        : productsByRecord
            .get(record.id)
            .attributes.filter((attribute) => attribute.origin.kind === 'group-note');
    record.parsed = {
      priceType: own.price.priceType,
      price: own.price.price,
      attributes: sortAttributes([...own.attributes, ...fromNotes]),
    };
  }

  const counters = new Map();
  for (const product of products) {
    const prefix = CODE_PREFIX[product.categoryPath[0]];
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    product.code = `${prefix}-${String(next).padStart(3, '0')}`;
  }

  return { products, meta, duplicates, conflicts, groupNotes };
}

// ---------------------------------------------------------------------------
// Проблемы импорта.
// ---------------------------------------------------------------------------

/** «Цена» → «цена», аббревиатуры («КУ») не трогаем. */
function lowerFirst(label) {
  return label === label.toUpperCase() ? label : label[0].toLowerCase() + label.slice(1);
}

/** «1!E4–1!E9» для строк одной колонки, иначе перечисление. */
function cellSpan(records) {
  if (records.length === 0) return '—';
  const sameColumn = records.every(
    (r) => r.sheet === records[0].sheet && r.nameCell[0] === records[0].nameCell[0],
  );
  if (records.length === 1 || !sameColumn) return cellsList(records);
  return `${cellRef(records[0])}–${cellRef(records.at(-1))}`;
}

function cellsList(records) {
  return records.map((record) => cellRef(record)).join(', ');
}

/** Сравнение строк листов: цена, частота, КУ (с единицей), разъём и что ещё есть в строках. */
function conflictFields(conflict) {
  const { sheet1, sheet2 } = conflict;
  const pick = (attributes, code) =>
    code === 'gain'
      ? (findAttr(attributes, 'gain_dbi') ?? findAttr(attributes, 'gain_db'))
      : findAttr(attributes, code);
  const field = (fieldCode, label, a, b) => ({
    field: fieldCode,
    label,
    sheet1: a,
    sheet2: b,
    differs: a !== b,
  });
  const fields = [
    field('rawText', 'Исходный текст', sheet1.record.rawText, sheet2.record.rawText),
    field('price', 'Цена', formatRub(sheet1.price.price), formatRub(sheet2.price.price)),
  ];
  const always = [
    ['frequency', 'Частота'],
    ['gain', 'КУ'],
    ['connector', 'Разъём'],
  ];
  const whenPresent = [
    ['antenna_design', 'Конструкция'],
    ['compatible_model', 'Совместимая модель'],
  ];
  for (const [code, label] of always) {
    fields.push(
      field(
        code,
        label,
        formatAttrForReport(pick(sheet1.parsed.attributes, code)),
        formatAttrForReport(pick(sheet2.parsed.attributes, code)),
      ),
    );
  }
  for (const [code, label] of whenPresent) {
    const a = formatAttrForReport(pick(sheet1.parsed.attributes, code));
    const b = formatAttrForReport(pick(sheet2.parsed.attributes, code));
    if (a !== null || b !== null) fields.push(field(code, label, a, b));
  }
  return fields;
}

function conflictLabel(conflict) {
  const { parsed } = conflict.sheet1;
  if (parsed.model) return parsed.model;
  const compatible = findAttr(parsed.attributes, 'compatible_model');
  if (compatible) return `Чехол для ${compatible.value.value}`;
  return conflict.product.name;
}

function buildIssues({ records, products, meta, duplicates, conflicts, groupNotes }) {
  const issues = [];
  const recordById = new Map(records.map((record) => [record.id, record]));
  const add = (code, severity, sources, productIds, title, details, extra = {}) => {
    issues.push({
      id: `${code}-${sources[0].id}`,
      severity,
      code,
      title,
      details,
      sourceIds: sources.map((record) => record.id),
      productIds,
      ...extra,
    });
  };
  const primary = (product) => meta.get(product.id).record;
  const groupBy = (items, keyOf) => {
    const map = new Map();
    for (const item of items) {
      const key = keyOf(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.values()];
  };

  for (const conflict of conflicts) {
    const fields = conflictFields(conflict);
    const differing = fields.filter((f) => f.differs && f.field !== 'rawText');
    const a = conflict.sheet1.record;
    const b = conflict.sheet2.record;
    add(
      'sheet-conflict',
      'conflict',
      [a, b],
      [conflict.product.id],
      `${conflictLabel(conflict)}: лист 1 и лист 2 расходятся`,
      `Витрина показывает строку листа 1 (${cellRef(a)}). Строка листа 2 (${cellRef(b)}) сохранена для ` +
        `сопоставления, отдельная карточка не создана. Расходятся: ` +
        `${differing.map((f) => `${lowerFirst(f.label)} (${f.sheet1 ?? 'не указано'} / ${f.sheet2 ?? 'не указано'})`).join('; ')}. ` +
        'Назначение листов не подтверждено — победитель не выбран.',
      { fields },
    );
  }

  for (const { original, duplicate, product } of duplicates) {
    add(
      'duplicate-row',
      'review',
      [original, duplicate],
      [product.id],
      `Повтор строки: ${cellRef(duplicate)} = ${cellRef(original)}`,
      `«${duplicate.rawText}» с ценой ${duplicate.rawPrice} буквально повторяет ${cellRef(original)}. ` +
        'Вторая карточка не создана: у товара два происхождения. Отличия вариантов не выдумываются — нужен ответ заказчика.',
    );
  }

  const withFrequency = products
    .map((product) => ({ product, frequency: findAttr(product.attributes, 'frequency') }))
    .filter(({ frequency }) => frequency !== null);

  const disputed = withFrequency.filter(
    ({ frequency }) => frequency.value.unit === 'GHz' && frequency.status === 'needs-review',
  );
  for (const group of groupBy(disputed, ({ product }) => meta.get(product.id).group.header.id)) {
    const sources = group.map(({ product }) => primary(product));
    add(
      'disputed-unit',
      'review',
      sources,
      group.map(({ product }) => product.id),
      `Спорная единица частоты: «${group[0].frequency.raw}»`,
      `В ${cellsList(sources)} частота записана в ГГц. Значение сохранено как есть, не пересчитано в МГц ` +
        'и не участвует в числовом фильтре частоты до подтверждения единицы заказчиком.',
    );
  }

  const inferred = withFrequency.filter(({ frequency }) => frequency.status === 'inferred');
  for (const group of groupBy(inferred, ({ product }) => meta.get(product.id).group.header.id)) {
    const sources = group.map(({ product }) => primary(product));
    const header = meta.get(group[0].product.id).group.header;
    add(
      'inferred-unit',
      'review',
      sources,
      group.map(({ product }) => product.id),
      `Единица частоты не указана — принята МГц (группа «${header.rawText.trim()}»)`,
      `В ${cellsList(sources)} частота записана без единицы. МГц принята по контексту группы, ` +
        'статус характеристики — inferred (не подтверждено). В названии единица не показывается.',
    );
  }

  for (const product of products) {
    const connector = findAttr(product.attributes, 'connector');
    if (connector?.status !== 'needs-review') continue;
    add(
      'ambiguous-connector',
      'review',
      [primary(product)],
      [product.id],
      `Неоднозначный разъём: ${product.model ?? product.name} «${connector.raw}»`,
      'Разъём сохранён текстом со статусом needs-review. Два разъёма или два SKU не созданы; ' +
        'в фильтре разъёмов позиция не участвует до уточнения.',
    );
  }

  // Область группового примечания: товары той же корневой категории вне его группы тоже могут
  // подразумеваться («на фильтрах» — и канальные, и резонаторные; «на МШУ» — и МШУ листа 2).
  // Это не утверждается, а выносится на уточнение.
  for (const result of groupNotes) {
    const roots = new Set(result.targets.concat(result.explicit).map((p) => p.categoryPath[0]));
    const outside = products.filter(
      (p) => roots.has(p.categoryPath[0]) && meta.get(p.id).group !== result.group,
    );
    const outsideText = groupBy(outside, (p) => meta.get(p.id).group.header.id)
      .map((items) => {
        const header = meta.get(items[0].id).group.header;
        return `«${header.rawText.trim()}» листа ${header.sheet} — ${cellSpan(items.map(primary))} (${items.length})`;
      })
      .join('; ');
    const groupName = `«${result.group.header.rawText.trim()}» листа ${result.group.header.sheet}`;
    if (!result.applied) {
      add(
        'group-note-scope',
        'review',
        [result.note],
        result.targets.map((product) => product.id),
        `Примечание ${cellRef(result.note)} не применено: область действия неясна`,
        `«${result.note.rawText}» — область действия по ТЗ неясна (§4 п.12). Примечание стоит в группе ` +
          `${groupName}, но противоречит разъёмам, явно указанным в ${cellSpan(result.explicit.map(primary))} ` +
          `этой группы.${outsideText ? ` Потенциально в области также: ${outsideText}.` : ''} ` +
          'Ни к одному товару не применено — в характеристики и фильтр разъёмов не попадает; ' +
          `у ${result.targets.length} товаров группы без явных разъёмов сохранено заметкой (scopeConfirmed: false).`,
      );
      continue;
    }
    if (outside.length === 0) continue;
    add(
      'group-note-scope',
      'info',
      [result.note, ...outside.map(primary)],
      outside.map((product) => product.id),
      `Примечание ${cellRef(result.note)} применено только к своей группе — область на ${outside.length === 1 ? 'товар' : 'товары'} вне группы уточнить`,
      `«${result.note.rawText}» применено к группе ${groupName} (${cellSpan(result.targets.map(primary))}, ` +
        `${result.targets.length} товаров) с происхождением group-note. На ${outsideText} не распространено: ` +
        `разъёмы ${outside.length === 1 ? 'у этого товара' : 'у этих товаров'} не заполнены. Относится ли примечание ` +
        `и ${outside.length === 1 ? 'к нему' : 'к ним'} — в прайсе не указано, уточнить у заказчика.`,
    );
  }

  for (const product of products) {
    const cable = findAttr(product.attributes, 'cable_type');
    if (cable?.value.kind !== 'list') continue;
    add(
      'cable-variants',
      'review',
      [primary(product)],
      [product.id],
      `Несколько типов кабеля в одной строке: «${cable.raw}»`,
      'Сохранено списком со статусом needs-review. Один товар с выбором кабеля или отдельные товары — ' +
        'решение после уточнения у заказчика (ТЗ §4 п.13).',
    );
  }

  const unknownUnit = products.filter((product) => {
    const loss = findAttr(product.attributes, 'insertion_loss');
    return loss !== null && loss.value.unit === null;
  });
  for (const group of groupBy(unknownUnit, (product) => meta.get(product.id).group.header.id)) {
    const sources = group.map(primary);
    add(
      'unknown-unit',
      'review',
      sources,
      group.map((product) => product.id),
      `«${findAttr(group[0].attributes, 'insertion_loss').raw}» — единица не указана`,
      `В ${cellsList(sources)} затухание записано без единицы: сохранено числом без единицы ` +
        '(needs-review) и не участвует в фильтрации. Ослабление с единицей дБ — подтверждено.',
    );
  }

  const rowNotes = products.flatMap((product) =>
    product.notes.filter((note) => note.kind === 'row-note').map((note) => ({ note, product })),
  );
  for (const group of groupBy(rowNotes, ({ note }) => note.text)) {
    const sources = group.map(({ product }) => primary(product));
    add(
      'unclear-note',
      'review',
      sources,
      group.map(({ product }) => product.id),
      `Пометка «${group[0].note.text}»: смысл не ясен`,
      `Пометка в ${cellsList(sources)} сохранена заметкой товара и в название не включена. Смысл уточняется у заказчика.`,
    );
  }

  for (const product of products) {
    if (meta.get(product.id).parsed.kind !== 'antenna' || product.categoryId !== 'antennas')
      continue;
    add(
      'unclassified',
      'review',
      [primary(product)],
      [product.id],
      `Конструкция не указана: ${product.name}`,
      'Конструкция антенны в строке не указана и по догадке не назначается (ТЗ §5): товар лежит в разделе ' +
        '«Антенны» без подкатегории, характеристики antenna_design нет.',
    );
  }

  for (const product of products) {
    if (product.priceType !== 'request') continue;
    add(
      'price-on-request',
      'info',
      [primary(product)],
      [product.id],
      `Цена «по запросу»: ${product.name}`,
      'Отдельный тип цены: price = null, не 0. Позиция добавляется в заявку, сумму согласует менеджер; ' +
        'в сортировке по цене — в конце.',
    );
  }

  // Одинаковый диапазон у разных фильтров — разные товары (ТЗ §4 п.6); у антенн различает модель.
  const filters = withFrequency.filter(({ product }) => product.categoryPath[0] === 'rf-filters');
  const byRange = groupBy(filters, ({ frequency }) => {
    const { min, max, unit } = frequency.value;
    return `${min}|${max}|${unit}`;
  }).filter((group) => group.length > 1);
  for (const group of byRange) {
    const sources = group.map(({ product }) => primary(product));
    add(
      'same-range-different-items',
      'info',
      sources,
      group.map(({ product }) => product.id),
      `Одинаковый диапазон ${frequencyLabel(group[0].frequency)} у разных фильтров`,
      'Совпадение частоты не означает одинаковый товар — позиции не объединены: ' +
        `${group.map(({ product }) => `${product.name} (${cellRef(primary(product))}, ${formatRub(product.price)})`).join('; ')}.`,
    );
  }

  const ordered = issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.issue.severity) - SEVERITY_ORDER.indexOf(b.issue.severity) ||
        a.index - b.index,
    )
    .map(({ issue }) => issue);

  const ids = new Set();
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const issue of ordered) {
    if (ids.has(issue.id)) throw new ImportError(`повтор id проблемы ${issue.id}`);
    ids.add(issue.id);
    for (const sourceId of issue.sourceIds) recordById.get(sourceId).issueIds.push(issue.id);
    for (const productId of issue.productIds) productById.get(productId).issueIds.push(issue.id);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Ручной слой overrides.json.
// ---------------------------------------------------------------------------

const isComment = (key) => key.startsWith('$');
const RECOMMENDATION_FIELDS = ['productId', 'recommendedId', 'position', 'note', 'status'];
const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function loadOverrides() {
  const file = path.join(ROOT, OVERRIDES_FILE);
  if (!existsSync(file)) return { hash: '', products: new Map(), recommendations: [] };
  const buffer = readFileSync(file);
  let json;
  try {
    json = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new ImportError(`${OVERRIDES_FILE}: некорректный JSON — ${error.message}`);
  }
  const fail = (where, message) => {
    throw new ImportError(`${OVERRIDES_FILE}: ${where} — ${message}`);
  };
  if (!isPlainObject(json)) fail('корень', 'ожидается объект');
  for (const key of Object.keys(json)) {
    if (!isComment(key) && key !== 'products' && key !== 'recommendations') {
      fail(key, 'неизвестный раздел (допустимы products, recommendations и комментарии $…)');
    }
  }

  const products = new Map();
  const rawProducts = json.products ?? {};
  if (!isPlainObject(rawProducts)) fail('products', 'ожидается объект «id товара → правка»');
  for (const [id, edit] of Object.entries(rawProducts)) {
    if (isComment(id)) continue;
    const where = `products.${id}`;
    if (!isPlainObject(edit)) fail(where, 'ожидается объект');
    const clean = {};
    for (const [field, value] of Object.entries(edit)) {
      if (isComment(field)) continue;
      if (field === 'name') {
        if (typeof value !== 'string' || value.trim() === '')
          fail(`${where}.name`, 'непустая строка');
        clean.name = value;
      } else if (field === 'hidden') {
        if (typeof value !== 'boolean') fail(`${where}.hidden`, 'true или false');
        clean.hidden = value;
      } else if (field === 'images') {
        if (
          !Array.isArray(value) ||
          value.some((item) => typeof item !== 'string' || item.trim() === '')
        ) {
          fail(`${where}.images`, 'массив непустых строк-путей');
        }
        clean.images = [...value];
      } else {
        fail(`${where}.${field}`, 'неизвестное поле (допустимы name, hidden, images)');
      }
    }
    products.set(id, clean);
  }

  const recommendations = [];
  const rawRecommendations = json.recommendations ?? [];
  if (!Array.isArray(rawRecommendations)) fail('recommendations', 'ожидается массив');
  for (const [index, item] of rawRecommendations.entries()) {
    const where = `recommendations[${index}]`;
    if (!isPlainObject(item)) fail(where, 'ожидается объект');
    for (const field of Object.keys(item)) {
      if (!isComment(field) && !RECOMMENDATION_FIELDS.includes(field)) {
        fail(
          `${where}.${field}`,
          `неизвестное поле (допустимы ${RECOMMENDATION_FIELDS.join(', ')})`,
        );
      }
    }
    if (typeof item.productId !== 'string' || item.productId === '')
      fail(`${where}.productId`, 'id товара');
    if (typeof item.recommendedId !== 'string' || item.recommendedId === '') {
      fail(`${where}.recommendedId`, 'id товара');
    }
    if (item.position !== undefined && (!Number.isInteger(item.position) || item.position < 1)) {
      fail(`${where}.position`, 'целое ≥ 1 (или не указывать)');
    }
    if (item.note !== undefined && typeof item.note !== 'string') fail(`${where}.note`, 'строка');
    if (item.status !== undefined && item.status !== 'approved' && item.status !== 'draft') {
      fail(`${where}.status`, '«approved» или «draft»');
    }
    recommendations.push({
      index,
      productId: item.productId,
      recommendedId: item.recommendedId,
      position: item.position ?? null,
      note: item.note ?? null,
      // Связь, которую менеджер вписал сам, — проверена им; «draft» можно указать явно.
      status: item.status ?? 'approved',
    });
  }
  return { hash: sha256(buffer), products, recommendations };
}

function applyProductOverrides(products, overrides, warnings) {
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const id of overrides.products.keys()) {
    if (!byId.has(id)) warnings.push(`products.${id}: товара с таким id нет — правка пропущена`);
  }
  const hidden = new Set();
  const renamed = [];
  const withImages = [];
  for (const product of products) {
    const edit = overrides.products.get(product.id);
    if (!edit) continue;
    if (edit.name !== undefined && edit.name !== product.name) {
      product.name = edit.name;
      renamed.push(product.id);
    }
    if (edit.images !== undefined) {
      product.images = edit.images;
      withImages.push(product.id);
    }
    if (edit.hidden === true) hidden.add(product.id);
  }
  return { hidden, renamed, withImages };
}

// ---------------------------------------------------------------------------
// Рекомендации.
// ---------------------------------------------------------------------------

/**
 * Связи из названий прайса (чехол ↔ антенна той же модели, двусторонние) — черновые (status
 * 'draft', ТЗ §7). Запись overrides.json для той же пары подтверждает черновую связь (status,
 * пояснение и позиция — из записи, basis остаётся 'source-name'); для другой пары — добавляет
 * ручную (basis 'manager', по умолчанию 'approved'). Связи с несуществующим, скрытым или тем же
 * товаром отбрасываются с предупреждением. Порядок у товара: с позицией из overrides — по ней,
 * затем ручные без позиции, затем связи из названий — в порядке прайса; позиции 1..n.
 */
function buildRecommendations(products, meta, overrides, hidden, warnings) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const problemOf = (productId, recommendedId) =>
    !byId.has(productId)
      ? `товара ${productId} нет`
      : !byId.has(recommendedId)
        ? `рекомендуемого товара ${recommendedId} нет`
        : productId === recommendedId
          ? 'товар не может рекомендовать сам себя'
          : hidden.has(productId)
            ? `товар ${productId} скрыт`
            : hidden.has(recommendedId)
              ? `рекомендуемый товар ${recommendedId} скрыт`
              : null;
  const links = [];
  const byPair = new Map();
  const addLink = (link) => {
    links.push(link);
    byPair.set(`${link.productId}|${link.recommendedId}`, link);
  };

  const antennasByModel = new Map(
    products
      .filter((product) => meta.get(product.id).parsed.kind === 'antenna' && product.model)
      .map((product) => [product.model, product]),
  );
  for (const cover of products) {
    const compatible = findAttr(cover.attributes, 'compatible_model');
    const antenna = compatible ? antennasByModel.get(compatible.value.value) : undefined;
    if (!antenna) continue;
    const note = `Из названия в прайсе: «${meta.get(cover.id).record.rawText.trim()}»`;
    for (const [productId, recommendedId] of [
      [cover.id, antenna.id],
      [antenna.id, cover.id],
    ]) {
      const problem = problemOf(productId, recommendedId);
      if (problem) {
        warnings.push(`связь из названия ${productId} → ${recommendedId}: отброшена — ${problem}`);
        continue;
      }
      addLink({
        productId,
        recommendedId,
        note,
        basis: 'source-name',
        status: 'draft',
        position: null,
        fromOverrides: false,
      });
    }
  }

  for (const item of overrides.recommendations) {
    const label = `recommendations[${item.index}] ${item.productId} → ${item.recommendedId}`;
    const problem = problemOf(item.productId, item.recommendedId);
    if (problem) {
      warnings.push(`${label}: отброшена — ${problem}`);
      continue;
    }
    const existing = byPair.get(`${item.productId}|${item.recommendedId}`);
    if (existing?.fromOverrides) {
      warnings.push(`${label}: отброшена — такая связь уже задана выше`);
      continue;
    }
    if (existing) {
      existing.status = item.status;
      if (item.note !== null) existing.note = item.note;
      existing.position = item.position;
      existing.fromOverrides = true;
      continue;
    }
    addLink({
      productId: item.productId,
      recommendedId: item.recommendedId,
      note: item.note ?? '',
      basis: 'manager',
      status: item.status,
      position: item.position,
      fromOverrides: true,
    });
  }

  const rank = (link) => (link.position !== null ? 0 : link.basis === 'manager' ? 1 : 2);
  const result = [];
  const productOrder = [...new Set(links.map((link) => link.productId))].sort(
    (a, b) => byId.get(a).sortIndex - byId.get(b).sortIndex,
  );
  for (const productId of productOrder) {
    const own = links
      .filter((link) => link.productId === productId)
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.position ?? 0) - (b.position ?? 0) ||
          byId.get(a.recommendedId).sortIndex - byId.get(b.recommendedId).sortIndex,
      );
    own.forEach((link, index) => {
      result.push({
        productId,
        recommendedId: link.recommendedId,
        position: index + 1,
        note: link.note,
        basis: link.basis,
        status: link.status,
      });
    });
  }
  return {
    recommendations: result,
    managerApplied: links.filter((link) => link.basis === 'manager').length,
    approvedFromSource: links.filter(
      (link) => link.basis === 'source-name' && link.fromOverrides && link.status === 'approved',
    ).length,
  };
}

// ---------------------------------------------------------------------------
// Поиск.
// ---------------------------------------------------------------------------

/**
 * В поиск идут название (и исходное, если менеджер переименовал), модель, текст строк витрины
 * (created/merged-duplicate), значения характеристик и категории. Конфликтные строки листа 2 и
 * групповые заметки с неподтверждённой областью — нет: иначе «10 дБ» находило бы Тип1 с 12 дБи,
 * а «sma» — фильтры, у которых разъёмы не подтверждены.
 */
function buildProductSearchText(product, meta, recordById, buildSearchText) {
  const parts = [product.name];
  const generatedName = meta.get(product.id).generatedName;
  if (generatedName !== product.name) parts.push(generatedName);
  if (product.model) parts.push(product.model);
  for (const sourceId of product.sourceIds) {
    const record = recordById.get(sourceId);
    if (record.resolution === 'created' || record.resolution === 'merged-duplicate')
      parts.push(record.rawText);
  }
  // Неподтверждённое значение — только исходным фрагментом: принятая по контексту «МГц» не должна
  // находиться поиском как написанная в прайсе.
  for (const attribute of product.attributes) {
    parts.push(attribute.status === 'confirmed' ? formatAttrValue(attribute) : attribute.raw);
  }
  for (const categoryId of product.categoryPath) parts.push(CATEGORY_BY_ID.get(categoryId).name);
  return buildSearchText(parts);
}

// ---------------------------------------------------------------------------
// Отчёт docs/IMPORT-REPORT.md.
// ---------------------------------------------------------------------------

function md(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const RESOLUTION_LABEL = {
  created: 'создан товар',
  'merged-duplicate': 'повтор — объединён',
  'conflict-attached': 'конфликт — приложен к товару листа 1, карточка не создана',
  'excluded-header': 'заголовок — исключён',
  'group-note-applied': 'примечание — применено к группе',
  'group-note-pending': 'примечание — не применено, сохранено заметкой',
};

const SEVERITY_TITLE = {
  conflict: 'conflict — конфликты данных',
  review: 'review — требуют проверки',
  info: 'info — справочно',
};

function buildMarkdown(ctx) {
  const {
    report,
    records,
    allProducts,
    hidden,
    issues,
    conflicts,
    duplicates,
    groupNotes,
    recommendations,
  } = ctx;
  const productById = new Map(allProducts.map((product) => [product.id, product]));
  const recordById = new Map(records.map((record) => [record.id, record]));
  const productLabel = (id) => {
    if (id === null) return '—';
    const product = productById.get(id);
    return `${product.code} ${md(product.name)} (\`${id}\`)${hidden.has(id) ? ' — **скрыт** в overrides.json' : ''}`;
  };
  const duplicateOf = new Map(duplicates.map((d) => [d.duplicate.id, d.original]));
  const conflictOf = new Map(conflicts.map((c) => [c.sheet2.record.id, c.sheet1.record]));
  const noteResult = new Map(groupNotes.map((result) => [result.note.id, result]));
  const decision = (record) => {
    if (record.resolution === 'merged-duplicate') {
      return `повтор ${cellRef(duplicateOf.get(record.id))} — объединён с ним`;
    }
    if (record.resolution === 'conflict-attached') {
      return `конфликт с ${cellRef(conflictOf.get(record.id))} — приложен, карточка не создана`;
    }
    if (record.resolution === 'group-note-applied') {
      return `применено: port1/port2_connector у ${noteResult.get(record.id).targets.length} товаров группы «${record.groupHeader.trim()}» (origin group-note)`;
    }
    if (record.resolution === 'group-note-pending') {
      return `не применено: область неясна, противоречит явным разъёмам группы; заметка у ${noteResult.get(record.id).targets.length} товаров`;
    }
    if (record.resolution === 'excluded-header') {
      return record.rawPrice.trim() === 'Цена'
        ? 'заголовок группы; в ячейке цены — заголовок колонки'
        : 'заголовок группы';
    }
    return RESOLUTION_LABEL[record.resolution];
  };
  const c = report.counts;
  const visible = allProducts.length - hidden.size;
  const sourceNameRecs = recommendations.filter((r) => r.basis === 'source-name').length;
  const draftRecs = recommendations.filter((r) => r.status === 'draft').length;
  const lines = [];
  const push = (...items) => lines.push(...items);

  push(
    '# Отчёт импорта каталога',
    '',
    '> Сгенерировано `npm run import:catalog` (`scripts/import-catalog.mjs`) — руками не править.',
    '> Правила разбора — `docs/DATA-RULES.md`, ручные правки — `src/data/overrides.json`.',
    '',
    `- Источник: \`${report.sourceFile}\` (выгрузка «список v11.xlsx», адреса ячеек сохранены).`,
    `- sha256 источника: \`${report.sourceHash}\`.`,
    `- sha256 \`${OVERRIDES_FILE}\`: ${report.overrides.hash ? `\`${report.overrides.hash}\`` : 'файла нет'}.`,
    '- Цены — в копейках в JSON; валюта RUB — предположение (в прайсе не указана).',
    '',
    '**Временная витрина = лист 1 + уникальные позиции листа 2.** Это решение для макета (ТЗ §4 п.4):',
    'назначение листов заказчиком не подтверждено. Строки листа 2, расходящиеся с листом 1, карточками',
    'не стали — они сохранены и сравниваются в разделе «Конфликты листов».',
    '',
    '## Сводка',
    '',
    '| Показатель | Значение |',
    '|---|---:|',
    `| Непустых строк прочитано (с заголовками и примечаниями) | ${c.rowsRead} |`,
    `| Товарных строк, лист 1 | ${c.productRows.bySheet[1]} (B/C ${c.productRows.byBlock['B/C']}, E/F ${c.productRows.byBlock['E/F']}, H/I ${c.productRows.byBlock['H/I']}) |`,
    `| Товарных строк, лист 2 (C/D) | ${c.productRows.bySheet[2]} |`,
    `| Товарных строк всего | ${c.productRows.total} |`,
    `| Заголовков исключено | ${c.headersExcluded} |`,
    `| Примечаний (не товары) | ${c.notes} |`,
    `| Товаров создано | ${c.productsCreated} |`,
    `| Повторов объединено (merged-duplicate) | ${c.mergedDuplicates} |`,
    `| Строк листа 2 приложено как конфликт (conflict-attached) | ${c.conflictsAttached} |`,
    `| Скрыто через overrides.json | ${hidden.size} |`,
    `| Товаров в витрине | ${visible} |`,
    `| Отправлено на проверку: товаров с проблемой review или conflict | ${c.productsWithReviewIssues} |`,
    `| Отправлено на проверку: строк-источников с проблемами | ${c.sourceRowsWithIssues} |`,
    `| Рекомендаций | ${recommendations.length}: из названий ${sourceNameRecs} (черновых ${draftRecs}), от менеджера ${report.overrides.recommendationsApplied} |`,
    `| Проблем | ${issues.length}: conflict ${c.issuesBySeverity.conflict}, review ${c.issuesBySeverity.review}, info ${c.issuesBySeverity.info} |`,
    '',
    `Сверка: товарные строки (${c.productRows.total}) − повторы (${c.mergedDuplicates}) − конфликтные строки листа 2 (${c.conflictsAttached}) = товары (${c.productsCreated}).`,
    '',
    `## Товарные строки (${c.productRows.total})`,
    '',
    '| № | Ячейка | Исходный текст | Исходная цена | Решение | Товар |',
    '|---:|---|---|---|---|---|',
  );
  let index = 0;
  for (const record of records) {
    if (record.kind !== 'product') continue;
    index += 1;
    push(
      `| ${index} | ${cellRef(record)} | ${md(record.rawText)} | ${md(record.rawPrice)} | ${decision(record)} | ${productLabel(record.productId)} |`,
    );
  }

  const nonProducts = records.filter((record) => record.kind !== 'product');
  push(
    '',
    `## Заголовки и примечания — не товары (${nonProducts.length})`,
    '',
    '| Ячейка | Исходный текст | Исходная цена | Вид | Решение |',
    '|---|---|---|---|---|',
  );
  for (const record of nonProducts) {
    push(
      `| ${cellRef(record)} | ${md(record.rawText)} | ${md(record.rawPrice)} | ${record.kind === 'note' ? 'примечание' : 'заголовок'} | ${decision(record)} |`,
    );
  }

  push(
    '',
    `## Конфликты листов (${conflicts.length})`,
    '',
    'Слева — строка листа 1 (её показывает витрина), справа — строка листа 2 (сохранена для',
    'сопоставления). Победитель не выбран: назначение листов уточняется у заказчика (ТЗ §15 п.1).',
    '',
  );
  for (const conflict of conflicts) {
    const issue = issues.find(
      (item) =>
        item.code === 'sheet-conflict' && item.sourceIds.includes(conflict.sheet2.record.id),
    );
    push(
      `### ${md(conflictLabel(conflict))}: ${cellRef(conflict.sheet1.record)} ↔ ${cellRef(conflict.sheet2.record)}`,
      '',
      `Товар витрины: ${productLabel(conflict.product.id)}. Проблема \`${issue.id}\`.`,
      '',
      '| Поле | Лист 1 | Лист 2 | Расходится |',
      '|---|---|---|---|',
    );
    for (const field of issue.fields) {
      push(
        `| ${field.label} | ${md(field.sheet1)} | ${md(field.sheet2)} | ${field.differs ? '**да**' : 'нет'} |`,
      );
    }
    push('');
  }

  push(`## Проблемы импорта (${issues.length})`, '');
  for (const severity of SEVERITY_ORDER) {
    const group = issues.filter((issue) => issue.severity === severity);
    push(`### ${SEVERITY_TITLE[severity]} (${group.length})`, '');
    if (group.length === 0) push('Нет.', '');
    for (const issue of group) {
      const cells = issue.sourceIds.map((id) => cellRef(recordById.get(id))).join(', ');
      const productsList =
        issue.productIds.length > 6
          ? `${issue.productIds
              .slice(0, 6)
              .map((id) => `\`${id}\``)
              .join(', ')} и ещё ${issue.productIds.length - 6}`
          : issue.productIds.map((id) => `\`${id}\``).join(', ');
      push(
        `- **${md(issue.title)}** — \`${issue.code}\`, \`${issue.id}\``,
        `  - ${md(issue.details)}`,
        `  - Ячейки: ${cells}. Товары (${issue.productIds.length}): ${productsList || '—'}.`,
      );
    }
    push('');
  }

  const o = report.overrides;
  const idsOrNone = (ids) => (ids.length ? ids.map((id) => `\`${id}\``).join(', ') : 'нет');
  push(
    '## Ручной слой (overrides.json)',
    '',
    `- Скрыто из витрины: ${idsOrNone(o.hiddenProductIds)}.${o.hiddenProductIds.length ? ' Их строки-источники и проблемы остаются в отчёте.' : ''}`,
    `- Переименовано: ${idsOrNone(o.renamedProductIds)}.`,
    `- Фото заданы: ${idsOrNone(o.imagesProductIds)}.`,
    `- Рекомендаций менеджера принято: ${o.recommendationsApplied}; черновых связей из названий подтверждено: ${o.recommendationsApproved}.`,
    `- Предупреждения: ${o.warnings.length ? '' : 'нет.'}`,
  );
  for (const warning of o.warnings) push(`  - ${md(warning)}`);

  push(
    '',
    `## Рекомендации (${recommendations.length})`,
    '',
    'Связи из названий прайса — черновые (status draft, ТЗ §7): совместимость подтверждает менеджер в overrides.json.',
    '',
    '| Товар | Позиция | Рекомендуется | Основание | Статус | Пояснение |',
    '|---|---:|---|---|---|---|',
  );
  for (const rec of recommendations) {
    push(
      `| ${productLabel(rec.productId)} | ${rec.position} | ${productLabel(rec.recommendedId)} | ${rec.basis === 'manager' ? 'менеджер' : 'название в прайсе'} | ${rec.status === 'approved' ? 'подтверждена' : 'черновая'} | ${md(rec.note)} |`,
    );
  }
  push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Запуск.
// ---------------------------------------------------------------------------

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeIfChanged(relativePath, content) {
  const file = path.join(ROOT, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  writeFileSync(file, content);
  return true;
}

/** «создано/изменено/без изменений/удалено» по id товаров относительно прошлого products.generated.json. */
function productDelta(nextProducts) {
  const file = path.join(ROOT, OUTPUT.products);
  if (!existsSync(file))
    return `товары: прошлого ${OUTPUT.products} нет — все ${nextProducts.length} новые`;
  let previous;
  try {
    previous = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return `товары: прошлый ${OUTPUT.products} не читается как JSON — сравнение пропущено`;
  }
  const before = new Map(previous.map((product) => [product.id, JSON.stringify(product)]));
  const after = new Map(nextProducts.map((product) => [product.id, JSON.stringify(product)]));
  const created = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const changed = [...after.keys()].filter(
    (id) => before.has(id) && before.get(id) !== after.get(id),
  );
  const unchanged = after.size - created.length - changed.length;
  const ids = (list) =>
    list.length === 0 ? '' : ` (${list.slice(0, 8).join(', ')}${list.length > 8 ? ', …' : ''})`;
  return (
    `товары относительно прошлого запуска: создано ${created.length}${ids(created)}, ` +
    `изменено ${changed.length}${ids(changed)}, без изменений ${unchanged}, ` +
    `удалено ${removed.length}${ids(removed)}`
  );
}

async function loadSearchModule() {
  // package.json проекта без "type": "module" (Next.js он не нужен), и Node при импорте .ts
  // печатает MODULE_TYPELESS_PACKAGE_JSON. Это шум, а не проблема данных — глушим только его.
  const defaultListeners = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
    for (const listener of defaultListeners) listener.call(process, warning);
  });
  try {
    return await import(pathToFileURL(path.join(ROOT, SEARCH_MODULE)).href);
  } catch (error) {
    throw new ImportError(
      `не удалось загрузить ${SEARCH_MODULE} (${error.message}). Нужен Node.js с type stripping ` +
        '(22.18+ или 23.6+).',
    );
  }
}

async function main() {
  const { buildSearchText } = await loadSearchModule();

  const sourceBuffer = readFileSync(path.join(ROOT, SOURCE_FILE));
  const sourceHash = sha256(sourceBuffer);
  const records = buildSourceRecords(readSourceRows(sourceBuffer.toString('utf8')));
  const productRows = countProductRows(records);
  checkRowCounts(productRows);

  const built = buildProducts(records);
  const { products, meta, duplicates, conflicts, groupNotes } = built;
  const issues = buildIssues({ records, ...built });

  const overrides = loadOverrides();
  const warnings = [];
  const { hidden, renamed, withImages } = applyProductOverrides(products, overrides, warnings);
  const { recommendations, managerApplied, approvedFromSource } = buildRecommendations(
    products,
    meta,
    overrides,
    hidden,
    warnings,
  );

  const recordById = new Map(records.map((record) => [record.id, record]));
  for (const product of products) {
    product.searchText = buildProductSearchText(product, meta, recordById, buildSearchText);
  }

  const issuesBySeverity = { conflict: 0, review: 0, info: 0 };
  for (const issue of issues) issuesBySeverity[issue.severity] += 1;
  const severityById = new Map(issues.map((issue) => [issue.id, issue.severity]));
  const report = {
    sourceHash,
    sourceFile: SOURCE_FILE,
    counts: {
      rowsRead: records.length,
      productRows,
      headersExcluded: records.filter((record) => record.kind === 'group-header').length,
      notes: records.filter((record) => record.kind === 'note').length,
      productsCreated: products.length,
      mergedDuplicates: duplicates.length,
      conflictsAttached: conflicts.length,
      issuesBySeverity,
      productsWithReviewIssues: products.filter((product) =>
        product.issueIds.some((id) => severityById.get(id) !== 'info'),
      ).length,
      sourceRowsWithIssues: records.filter((record) => record.issueIds.length > 0).length,
    },
    overrides: {
      hash: overrides.hash,
      hiddenProductIds: products
        .filter((product) => hidden.has(product.id))
        .map((product) => product.id),
      renamedProductIds: renamed,
      imagesProductIds: withImages,
      recommendationsApplied: managerApplied,
      recommendationsApproved: approvedFromSource,
      warnings,
    },
  };

  const visibleProducts = products.filter((product) => !hidden.has(product.id));
  const markdown = buildMarkdown({
    report,
    records,
    allProducts: products,
    hidden,
    issues,
    conflicts,
    duplicates,
    groupNotes,
    recommendations,
  });

  const outputs = [
    [OUTPUT.products, json(visibleProducts)],
    [OUTPUT.categories, json(CATEGORIES)],
    [OUTPUT.sourceRecords, json(records)],
    [OUTPUT.issues, json(issues)],
    [OUTPUT.report, json(report)],
    [OUTPUT.recommendations, json(recommendations)],
    [OUTPUT.markdown, markdown],
  ];
  // Сверка с прошлым запуском — только в консоль: в JSON и отчёт она не попадает, иначе повторный
  // импорт того же источника перестал бы давать побайтно те же файлы.
  const delta = productDelta(visibleProducts);
  const changed = outputs
    .filter(([file, content]) => writeIfChanged(file, content))
    .map(([file]) => file);

  const c = report.counts;
  console.log(`Импорт каталога: ${SOURCE_FILE} (sha256 ${sourceHash.slice(0, 12)}…)`);
  console.log(
    `  строк прочитано: ${c.rowsRead}; товарных: ${c.productRows.total} ` +
      `(лист 1 — ${c.productRows.bySheet[1]}: B/C ${c.productRows.byBlock['B/C']}, E/F ${c.productRows.byBlock['E/F']}, ` +
      `H/I ${c.productRows.byBlock['H/I']}; лист 2 — ${c.productRows.bySheet[2]})`,
  );
  console.log(
    `  товаров создано: ${c.productsCreated}; в витрине: ${visibleProducts.length}; ` +
      `повторов объединено: ${c.mergedDuplicates}; конфликтов листа 2: ${c.conflictsAttached}`,
  );
  console.log(
    `  проблем: ${issues.length} (conflict ${issuesBySeverity.conflict}, review ${issuesBySeverity.review}, ` +
      `info ${issuesBySeverity.info}); рекомендаций: ${recommendations.length}`,
  );
  console.log(
    `  отправлено на проверку: товаров с проблемами review/conflict — ${c.productsWithReviewIssues}; ` +
      `строк-источников с проблемами — ${c.sourceRowsWithIssues}`,
  );
  console.log(`  ${delta}`);
  console.log(changed.length ? `  обновлено: ${changed.join(', ')}` : '  файлы не изменились');
  for (const warning of warnings) console.warn(`Предупреждение overrides: ${warning}`);
}

main().catch((error) => {
  if (error instanceof ImportError) {
    console.error(`Импорт каталога остановлен: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
