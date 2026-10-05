/**
 * Нормализация текста для поиска по каталогу (docs/DATA-RULES.md §6).
 *
 * Одна и та же функция строит `Product.searchText` при импорте (scripts/import-catalog.mjs)
 * и нормализует запрос в интерфейсе — поэтому «М8» в прайсе и «M8» в запросе, «N-мама» и
 * «n female», «18,5» и «18.5» сходятся в одинаковые токены.
 *
 * Модуль импортирует Node-скрипт напрямую (type stripping), поэтому здесь только «стираемый»
 * TypeScript: без enum, namespace и parameter properties, без импортов.
 */

/** Граница «слова»: соседний символ — не буква и не цифра. Для \b нужна латиница, у нас кириллица. */
const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_WORD_AFTER = '(?![\\p{L}\\p{N}])';

/** Все виды тире и дефисов, включая минус и полноширинный дефис. */
const DASHES = /[‐-―−﹘﹣－]/g;

/** Единицы: варианты написания → каноническое (кириллица, как в прайсе). */
const UNIT_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(`${NOT_WORD_BEFORE}(?:мгц|mhz)${NOT_WORD_AFTER}`, 'gu'), 'мгц'],
  [new RegExp(`${NOT_WORD_BEFORE}(?:ггц|ghz)${NOT_WORD_AFTER}`, 'gu'), 'ггц'],
  [new RegExp(`${NOT_WORD_BEFORE}(?:кгц|khz)${NOT_WORD_AFTER}`, 'gu'), 'кгц'],
  // дБи раньше дБ не обязателен: граница слова не даёт «дб» совпасть внутри «дби».
  [new RegExp(`${NOT_WORD_BEFORE}(?:дби|dbi)${NOT_WORD_AFTER}`, 'gu'), 'дби'],
  [new RegExp(`${NOT_WORD_BEFORE}(?:дб|db)${NOT_WORD_AFTER}`, 'gu'), 'дб'],
];

/** Число, слипшееся с единицей («1000mhz») — разделяем, чтобы единица стала отдельным токеном. */
const NUMBER_UNIT_GLUE = new RegExp(
  `(\\d)(?=(?:мгц|mhz|ггц|ghz|кгц|khz|дби|dbi|дб|db)${NOT_WORD_AFTER})`,
  'gu',
);

/**
 * Префиксы ВЧ-разъёмов. Одиночные «f»/«m» превращаются в female/male только после них —
 * иначе «m» в «M1» (модель) или «м» (метры) испортились бы.
 * Кириллическая «н» — частая опечатка вместо латинской N.
 */
const CONNECTOR_PREFIX = '(rp-sma|rpsma|sma|bnc|tnc|n|н)';
const CONNECTOR_FEMALE = new RegExp(
  `(?<![\\p{L}\\p{N}-])${CONNECTOR_PREFIX}[-\\s](?:f|female)${NOT_WORD_AFTER}`,
  'gu',
);
const CONNECTOR_MALE = new RegExp(
  `(?<![\\p{L}\\p{N}-])${CONNECTOR_PREFIX}[-\\s](?:m|male)${NOT_WORD_AFTER}`,
  'gu',
);

/** «мама»/«папа» однозначны в этом ассортименте — заменяем везде, не только после префикса. */
const MAMA = new RegExp(`${NOT_WORD_BEFORE}мама${NOT_WORD_AFTER}`, 'gu');
const PAPA = new RegExp(`${NOT_WORD_BEFORE}папа${NOT_WORD_AFTER}`, 'gu');

/** «Тип 1», «тип-1», «tip1», «type 1» → «тип1». */
const MODEL_TIP = new RegExp(`${NOT_WORD_BEFORE}(?:тип|tip|type)\\s*-?\\s*(?=\\d)`, 'gu');

/**
 * Кириллические буквы, которые выглядят как латинские. Заменяются только в начале токена-модели
 * (буквы, сразу за ними цифра): «М8» → «m8», «ХТ60» → «xt60». Обычные слова не трогаются:
 * в «тип1» есть «и» и «п», у которых латинских двойников нет.
 */
const CYRILLIC_TWINS: Readonly<Record<string, string>> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  х: 'x',
};
const MODEL_PREFIX = new RegExp(`${NOT_WORD_BEFORE}([авекмнорстхabekmhopctx]+)(?=\\d)`, 'gu');

function latinizeModelPrefix(run: string): string {
  let out = '';
  for (const ch of run) out += CYRILLIC_TWINS[ch] ?? ch;
  return out;
}

function connectorPrefix(prefix: string): string {
  return prefix === 'н' ? 'n' : prefix;
}

/**
 * Каноническая форма текста для поиска: токены через один пробел.
 *
 * Правила (DATA-RULES §6): нижний регистр; ё→е; все тире → «-»; запятая в числе → точка;
 * «Тип 1»/«tip1»/«type1» → «тип1»; кириллические двойники латиницы в моделях («М8» → «m8»);
 * мгц/mhz → «мгц», ггц/ghz → «ггц», дБи/dbi → «дби», дБ/db → «дб»; «мама»/f/female у разъёма →
 * «female», «папа»/m/male → «male» («sma-f» → «sma-female», «N-m» → «n-male»); прочая
 * пунктуация — разделитель; пробелы схлопываются.
 */
export function normalizeSearchText(input: string): string {
  let s = input.normalize('NFKC').toLowerCase().replace(/ё/g, 'е');
  // Мягкий перенос (U+00AD) невидим и не должен разрывать слово при поиске — убираем.
  s = s.replace(/\u00ad/g, '').replace(DASHES, '-');
  // Запятая между цифрами — десятичный разделитель: «18,5» → «18.5».
  s = s.replace(/(\d),(?=\d)/g, '$1.');
  // Всё, кроме букв, цифр, точки и дефиса, — разделитель (скобки, «=», «/», кавычки, «!»).
  s = s.replace(/[^\p{L}\p{N}.-]+/gu, ' ');
  // Точка значима только внутри числа («2.5»); «150 г.» и «ослаб.» её теряют.
  s = s.replace(/\.(?!\d)|(?<!\d)\./g, ' ');
  // Диапазон: пробелы вокруг дефиса между числами не важны — «700 - 1100» → «700-1100».
  s = s.replace(/(\d)\s*-+\s*(?=\d)/g, '$1-');
  // Дефис, оторванный от слова хотя бы с одной стороны, — разделитель концов кабеля:
  // «sma-m прямой- sma-m угловой», «N-f - N-f».
  s = s.replace(/(^|\s)-+/g, '$1 ').replace(/-+(?=\s|$)/g, ' ');
  s = s.replace(/-{2,}/g, '-');

  s = s.replace(MODEL_TIP, 'тип');
  s = s.replace(NUMBER_UNIT_GLUE, '$1 ');
  for (const [pattern, canonical] of UNIT_ALIASES) s = s.replace(pattern, canonical);

  s = s.replace(MAMA, 'female').replace(PAPA, 'male');
  s = s.replace(CONNECTOR_FEMALE, (_m, prefix: string) => `${connectorPrefix(prefix)}-female`);
  s = s.replace(CONNECTOR_MALE, (_m, prefix: string) => `${connectorPrefix(prefix)}-male`);

  // Двойники — после разъёмов: «н-мама» уже стала «n-female» и не превратится в «h».
  s = s.replace(MODEL_PREFIX, (run: string) => latinizeModelPrefix(run));

  return s.replace(/\s+/g, ' ').trim();
}

/** Нормализованные токены строки (пустая строка → пустой массив). */
export function tokenize(input: string): string[] {
  const normalized = normalizeSearchText(input);
  return normalized === '' ? [] : normalized.split(' ');
}

/**
 * `searchText` товара: нормализованные фрагменты без повторов токенов, порядок — по первому
 * появлению (детерминированно, чтобы повторный импорт давал тот же JSON).
 */
export function buildSearchText(parts: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    for (const token of tokenize(part)) {
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out.join(' ');
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/**
 * Токен запроса совпадает с началом слова (или частью слова после дефиса). Если запрос
 * кончается цифрой, следующая цифра в слове запрещена: «тип1» не находит «тип10», «m1» — «m10»,
 * «6» — «6.5». Вариант без дефисов покрывает «rg316» ↔ «rg-316», «микрорупорная».
 */
function matchesWordParts(word: string, query: string): boolean {
  const endsWithDigit = isDigit(query[query.length - 1]);
  const fits = (start: number): boolean => {
    if (!word.startsWith(query, start)) return false;
    if (!endsWithDigit) return true;
    const next = word[start + query.length];
    return !isDigit(next) && !(next === '.' && isDigit(word[start + query.length + 1]));
  };
  // Начало слова и каждая позиция после дефиса: «1100» находит «700-1100», «female» — «sma-female».
  let start = 0;
  while (start >= 0) {
    if (fits(start)) return true;
    const hyphen = word.indexOf('-', start);
    start = hyphen < 0 ? -1 : hyphen + 1;
  }
  return false;
}

function tokenMatches(word: string, query: string): boolean {
  if (matchesWordParts(word, query)) return true;
  if (!word.includes('-') && !query.includes('-')) return false;
  const compactQuery = query.replace(/-/g, '');
  return compactQuery !== '' && matchesWordParts(word.replace(/-/g, ''), compactQuery);
}

/**
 * Совпадение для поиска в интерфейсе: каждый токен запроса находит слово в `searchText`
 * (AND между токенами). `searchText` — уже нормализованная строка из импорта.
 * Пустой запрос совпадает со всем.
 */
export function matchesSearch(searchText: string, query: string): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return true;
  const words = searchText === '' ? [] : searchText.split(' ');
  return queryTokens.every((q) => words.some((w) => tokenMatches(w, q)));
}
