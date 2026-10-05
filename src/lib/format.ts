/**
 * Форматирование и проверки, которых нет в движке каталога (docs/DESIGN.md §4.9, §6.5):
 * склонения, «шт.», даты по-русски, адрес ячейки прайса, демо-код входа, email/телефон/ИНН.
 *
 * Цены и характеристики сюда НЕ дублируются — это `formatPrice`, `formatProductPrice`,
 * `formatAttrValue`, `formatSpecLine` из `src/lib/catalog`.
 *
 * Модуль чистый и «стираемый» TypeScript с относительными импортами `.ts`: его подключают
 * юнит-тесты в Node (scripts/tests/*.test.mjs) и логика демо-заказов.
 *
 * Даты (`formatDateFull`, `formatDateShort`) зависят от часового пояса и ICU среды — вызывать
 * только в клиентских компонентах (демо-данные всё равно живут в браузере), иначе разметка
 * сервера и браузера разойдётся.
 */

import { NBSP } from './catalog/attributes.ts';

export { NBSP };

/** Краткая форма «по запросу» — таблицы, строки корзины и заказа (полная — PRICE_ON_REQUEST_LABEL). */
export const PRICE_ON_REQUEST_SHORT = 'По запросу';

// ---------------------------------------------------------------------------
// Склонения.
// ---------------------------------------------------------------------------

/** Формы слова: [1 товар, 2 товара, 5 товаров]. */
export type PluralForms = readonly [one: string, few: string, many: string];

export const PRODUCT_FORMS: PluralForms = ['товар', 'товара', 'товаров'];
export const POSITION_FORMS: PluralForms = ['позиция', 'позиции', 'позиций'];
export const SUGGESTION_FORMS: PluralForms = ['подсказка', 'подсказки', 'подсказок'];
export const ORDER_FORMS: PluralForms = ['заказ', 'заказа', 'заказов'];
export const NOTIFICATION_FORMS: PluralForms = ['уведомление', 'уведомления', 'уведомлений'];
export const UNREAD_FORMS: PluralForms = ['непрочитанное', 'непрочитанных', 'непрочитанных'];

const pluralRules = new Intl.PluralRules('ru-RU');

/**
 * Форма слова для числа: one → [0], few → [1], many → [2], other (дроби) → [1].
 * `plural(5, PRODUCT_FORMS)` → «товаров».
 */
export function plural(count: number, forms: PluralForms): string {
  switch (pluralRules.select(count)) {
    case 'one':
      return forms[0];
    case 'many':
      return forms[2];
    default:
      return forms[1];
  }
}

/** Число и слово: `countLabel(5, PRODUCT_FORMS)` → «5 товаров». */
export function countLabel(count: number, forms: PluralForms): string {
  return `${count} ${plural(count, forms)}`;
}

/** Количество штук: 2 → «2 шт.» (неразрывный пробел). */
export function formatPieces(quantity: number): string {
  return `${quantity}${NBSP}шт.`;
}

/** Счётчик в шапке и меню: больше 99 — «99+». */
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

// ---------------------------------------------------------------------------
// Текст.
// ---------------------------------------------------------------------------

/** Первая буква заглавная (ячейки таблиц, опции подбора): «логопериодическая» → «Логопериодическая». */
export function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toLocaleUpperCase('ru-RU') + text.slice(1);
}

/** Адрес ячейки прайса: «1!B4» → «лист 1, B4». Непохожее на адрес возвращается как есть. */
export function formatCellAddress(cell: string): string {
  const match = /^(\d+)!([A-Z]+\d+)$/.exec(cell);
  return match === null ? cell : `лист ${match[1]}, ${match[2]}`;
}

/** Демо-код входа группами по 3: «481526» → «481 526». */
export function formatLoginCode(code: string): string {
  return code.replace(/(\d{3})(?=\d)/g, `$1${NBSP}`);
}

/** Обратный отсчёт «м:сс»: 42 → «0:42», 75 → «1:15». */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Даты (только клиентские компоненты — см. шапку файла).
// ---------------------------------------------------------------------------

const dateFull = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateShort = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** «5 октября 2026 г. в 14:32». */
export function formatDateFull(iso: string): string {
  return dateFull.format(new Date(iso));
}

/** «5 окт. 2026 г.». */
export function formatDateShort(iso: string): string {
  return dateShort.format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Проверки полей (§6.5).
// ---------------------------------------------------------------------------

/** Email хранится нормализованным: trim().toLowerCase() (§3.3). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Телефон без маски: цифры и ведущий «+» (пробелы, скобки, дефисы отбрасываются). */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** 10–15 цифр после удаления всего, кроме цифр и ведущего «+». */
export function isValidPhone(phone: string): boolean {
  const digits = normalizePhone(phone).replace('+', '');
  return digits.length >= 10 && digits.length <= 15;
}

/** ИНН — только цифры, 10 (организация) или 12 (ИП). Контрольные суммы не проверяются. */
export function isValidInn(inn: string): boolean {
  return /^(\d{10}|\d{12})$/.test(inn.trim());
}
