/**
 * Цены. Деньги — в копейках (Product.price), «по запросу» — отдельный тип цены с price === null,
 * не ноль (ТЗ §4 п.7). Разделитель разрядов и пробел перед «₽» — неразрывный U+00A0, как у
 * Intl.NumberFormat('ru-RU') и отчёта импорта; свой формат, а не Intl, — чтобы сервер и браузер
 * гарантированно давали одну строку (без расхождений гидратации из-за ICU).
 */

import type { PriceType, Product } from '@/types/catalog';

import { NBSP } from './attributes.ts';

export const PRICE_ON_REQUEST_LABEL = 'Цена по запросу';

function groupDigits(integer: number): string {
  return String(integer).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Целые рубли без знака валюты: 20000 → «20 000» (для диапазонов «1 000–20 000 ₽»). */
export function formatRubleAmount(rubles: number): string {
  const sign = rubles < 0 ? '−' : '';
  return `${sign}${groupDigits(Math.round(Math.abs(rubles)))}`;
}

/** Сумма в копейках → «13 000 ₽», «13 000,50 ₽». */
export function formatPrice(kopecks: number): string {
  if (!Number.isFinite(kopecks)) throw new RangeError(`Некорректная сумма: ${kopecks}`);
  const total = Math.round(kopecks);
  const sign = total < 0 ? '−' : '';
  const abs = Math.abs(total);
  const rest = abs % 100;
  const fraction = rest === 0 ? '' : `,${String(rest).padStart(2, '0')}`;
  return `${sign}${groupDigits(Math.trunc(abs / 100))}${fraction}${NBSP}₽`;
}

/** Целые рубли (фильтр цены, URL) → «20 000 ₽». */
export function formatRubles(rubles: number): string {
  return formatPrice(rubles * 100);
}

/** Цена товара для людей: «13 000 ₽» или «Цена по запросу». */
export function formatProductPrice(product: Pick<Product, 'priceType' | 'price'>): string {
  if (product.priceType === 'request' || product.price === null) return PRICE_ON_REQUEST_LABEL;
  return formatPrice(product.price);
}

export interface PriceLine {
  /** Цена за единицу в копейках; null — по запросу. */
  price: number | null;
  priceType: PriceType;
  qty: number;
}

export interface PreliminaryTotal {
  /** Сумма позиций с известной ценой, копейки. */
  knownTotal: number;
  /** Число позиций (строк) с известной ценой. */
  knownCount: number;
  /** Число позиций (строк) «по запросу» — их цену назовёт менеджер. */
  requestCount: number;
  /**
   * Есть позиции «по запросу»: knownTotal — не полный итог. UI пишет «от …» / «+ позиции по
   * запросу» и не показывает knownTotal как итог заявки.
   */
  hasRequestItems: boolean;
}

/**
 * Предварительный итог корзины/заявки. Позиции «по запросу» (и fixed без цены) не превращаются
 * в ноль, а считаются отдельно. Строки с количеством меньше 1 или не целым не учитываются.
 */
export function preliminaryTotal(lines: readonly PriceLine[]): PreliminaryTotal {
  let knownTotal = 0;
  let knownCount = 0;
  let requestCount = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) continue;
    if (line.priceType === 'request' || line.price === null || !Number.isFinite(line.price)) {
      requestCount += 1;
      continue;
    }
    knownTotal += line.price * line.qty;
    knownCount += 1;
  }
  return { knownTotal, knownCount, requestCount, hasRequestItems: requestCount > 0 };
}
