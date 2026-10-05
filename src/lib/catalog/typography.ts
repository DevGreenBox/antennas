/**
 * Неразрывность технических значений в тексте: названия товаров («МШУ 700–6100 МГц, 10 дБ»),
 * значения характеристик («SMA-male прямой — N-male», «RG-316 / RG-142»), подписи категорий
 * («Микро-рупорные»). Общий помощник для h1 страницы товара, строк таблицы и списка выдачи.
 *
 * Символы данных не подменяются: дефисы, тире, буквы и цифры остаются как есть (поиск по
 * странице и копирование работают). Меняется только обычный пробел на неразрывный U+00A0:
 * - между числом и единицей: «10 дБ», «1 м», «15 см» — единица не отрывается от числа;
 * - после «до»/«от» перед числом: «до 5 Вт»;
 * - перед разделителем « — », « · », « / »: строка не начинается с «— N-female» или «/ RG-142».
 *
 * Дефисные коды («SMA-male», «N-female», «RG-316», «N/sma-мама») и диапазоны («700–6100 МГц»)
 * браузер переносит сразу после дефиса или тире — символ U+2011 подменил бы данные, поэтому
 * такие фрагменты отдаются отдельными сегментами `keep: true`, а интерфейс оборачивает их в
 * `white-space: nowrap` (`TechText` в src/components/product/SpecLine.tsx).
 *
 *   nonBreakingText('МШУ 700–6100 МГц, 10 дБ')        // «МШУ 700–6100 МГц, 10 дБ» с U+00A0
 *   technicalSegments('Сборка 1 м, N-male — N-male')  // [{ text: 'Сборка 1 м, ' }, { text: 'N-male', keep: true }, …]
 */

import { NBSP } from './attributes.ts';

/** Единицы, перед которыми пробел после числа — неразрывный. */
const UNITS = ['МГц', 'ГГц', 'кГц', 'дБи', 'дБ', 'Вт', 'кг', 'см', 'мм', 'м', 'г', 'шт.', '₽'];
const UNIT_GROUP = `(?:${UNITS.map((unit) => unit.replace('.', '\\.')).join('|')})`;

/** Число и пробел перед единицей (единица — целым словом: «1 м», но не «1 мачта»). */
const NUMBER_UNIT = new RegExp(`(\\d) (?=${UNIT_GROUP}(?![\\p{L}\\p{N}]))`, 'gu');
/** «до 5 Вт», «от 3 000» — предлог не остаётся в конце строки. */
const BOUND_WORD = /(^|[\s(])(до|от) (?=\d)/giu;
/** Разделители, которые не должны начинать строку. */
const SEPARATOR = / (?=[—·/] )/g;

/** Текст с неразрывными пробелами (без обёрток) — для h1, атрибутов и строк без разметки. */
export function nonBreakingText(text: string): string {
  return text
    .replace(NUMBER_UNIT, `$1${NBSP}`)
    .replace(BOUND_WORD, `$1$2${NBSP}`)
    .replace(SEPARATOR, NBSP);
}

export interface TextSegment {
  text: string;
  /** Не переносить внутри: дефисный код или диапазон. */
  keep: boolean;
}

const NUMBER = '\\d+(?:[.,]\\d+)?';
/**
 * Атомы, внутри которых переноса быть не должно:
 * - диапазон с необязательной единицей: «700–6100 МГц», «136–174», «0–31 дБ»;
 * - слово с дефисом или косой чертой без пробелов: «SMA-male», «RG-316», «N/sma-мама», «Микро-рупорные».
 */
const ATOM = new RegExp(
  `${NUMBER}[–—−-]${NUMBER}(?:${NBSP}${UNIT_GROUP}(?![\\p{L}\\p{N}]))?` +
    `|[\\p{L}\\p{N}]+(?:[-‐‑/][\\p{L}\\p{N}]+)+`,
  'gu',
);

/** Сегменты текста: обычные (переносятся по пробелам) и неразрывные атомы. */
export function technicalSegments(text: string): TextSegment[] {
  const source = nonBreakingText(text);
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of source.matchAll(ATOM)) {
    const start = match.index;
    if (start > last) segments.push({ text: source.slice(last, start), keep: false });
    segments.push({ text: match[0], keep: true });
    last = start + match[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last), keep: false });
  return segments;
}
