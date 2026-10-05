/**
 * Расчёт сумм заявки и версии согласования (docs/DESIGN.md §3.4, §3.5, §3.9). Чистые функции,
 * деньги — целые копейки. Компоненты ничего не считают сами: корзина, сводка заявки, демо-панель
 * менеджера и `demo-orders.ts` берут суммы только отсюда (в рабочей версии это делает сервер).
 *
 * Правила:
 * - позиция «по запросу» не имеет суммы (не 0 ₽): предварительного итога нет, есть «известная
 *   часть» (`preliminaryTotals().total === null`);
 * - скидка по промокоду — `Math.round(суммаПозицийСЦеной × percent / 100)`, на «по запросу» не
 *   начисляется; округление только в одном месте;
 * - итог версии согласования = товары − скидка + доставка — единственное «Итого к оплате».
 *
 * Чистый «стираемый» TypeScript с относительными импортами `.ts` — подключается юнит-тестами.
 */

import type { DemoPromoCode } from '@/config/site';
import type { PriceType } from '@/types/catalog';
import type { DemoOrder } from '@/types/order';

import { site } from '../config/site.ts';
import { preliminaryTotal } from './catalog/price.ts';

/** Наибольшее количество в одной строке (QuantitySelector, корзина, демо-панель). */
export const MAX_LINE_QUANTITY = 999;

export interface AppliedPromo {
  code: string;
  percent: number;
}

// ---------------------------------------------------------------------------
// Промокод (§3.5).
// ---------------------------------------------------------------------------

/** Нормализация ввода: trim() и верхний регистр. */
export function normalizePromoCode(input: string): string {
  return input.trim().toUpperCase();
}

/** Промокод из `site.demo.promoCodes` или null. */
export function findPromoCode(input: string | null | undefined): DemoPromoCode | null {
  if (input === null || input === undefined) return null;
  const code = normalizePromoCode(input);
  if (code === '') return null;
  return site.demo.promoCodes.find((promo) => promo.code === code) ?? null;
}

export type PromoCheckStatus = 'empty' | 'not-found' | 'already-applied' | 'applied' | 'replaced';

export interface PromoCheck {
  status: PromoCheckStatus;
  /** Текст для поля (ошибка) или для `role="status"` (успех), §6.5. */
  message: string;
  /** Что записать в `cart.promoCode`; null — не менять. */
  promo: DemoPromoCode | null;
}

/** Проверка ввода промокода при уже применённом `currentCode` (один промокод за раз). */
export function checkPromoCode(input: string, currentCode: string | null): PromoCheck {
  const code = normalizePromoCode(input);
  if (code === '') return { status: 'empty', message: 'Введите промокод', promo: null };
  const promo = findPromoCode(code);
  if (promo === null) {
    return {
      status: 'not-found',
      message: 'Промокод не найден. Проверьте написание.',
      promo: null,
    };
  }
  const current = currentCode === null ? null : normalizePromoCode(currentCode);
  if (current === promo.code) {
    return { status: 'already-applied', message: 'Этот промокод уже применён', promo: null };
  }
  if (current !== null) return { status: 'replaced', message: 'Промокод заменён', promo };
  return { status: 'applied', message: `Промокод ${promo.code} применён`, promo };
}

/** Предварительная скидка: процент от суммы позиций с ценой, округление до копейки. */
export function promoDiscount(knownItemsTotal: number, percent: number): number {
  if (knownItemsTotal <= 0 || percent <= 0) return 0;
  return Math.min(knownItemsTotal, Math.round((knownItemsTotal * percent) / 100));
}

function toAppliedPromo(promo: string | AppliedPromo | null | undefined): AppliedPromo | null {
  if (promo === null || promo === undefined) return null;
  if (typeof promo !== 'string') return promo;
  const found = findPromoCode(promo);
  return found === null ? null : { code: found.code, percent: found.percent };
}

// ---------------------------------------------------------------------------
// Предварительный расчёт (корзина, заявка, заказ до согласования).
// ---------------------------------------------------------------------------

/** Строка для расчёта: позиция корзины с ценой из каталога или снимок заказа. */
export interface PricedLine {
  priceType: PriceType;
  /** Копейки за штуку; null — «по запросу». */
  unitPrice: number | null;
  quantity: number;
}

const isRequestLine = (line: PricedLine) =>
  line.priceType === 'request' || line.unitPrice === null || !Number.isFinite(line.unitPrice);

const isCountable = (line: PricedLine) => Number.isInteger(line.quantity) && line.quantity >= 1;

/** Сумма строки; null — у «по запросу» суммы нет (в интерфейсе «уточнит менеджер»). */
export function lineTotal(line: PricedLine): number | null {
  if (isRequestLine(line)) return null;
  return (line.unitPrice as number) * line.quantity;
}

export interface PreliminaryTotals {
  /** Σ сумм строк с ценой. */
  knownItemsTotal: number;
  /** Строк с ценой и их штук — «Позиции с ценой ({n} шт.)». */
  knownLinesCount: number;
  knownQuantity: number;
  /** Строк «по запросу» и их штук — «Позиции «по запросу» ({n} шт.)». */
  requestLinesCount: number;
  requestQuantity: number;
  /** Применённый промокод (даже если скидка 0 — в корзине только «по запросу»). */
  promo: AppliedPromo | null;
  /** Предварительная скидка по промокоду, только от позиций с ценой. */
  discount: number;
  /** Предварительный итог; null — есть позиции «по запросу», полного итога нет. */
  total: number | null;
  hasRequestItems: boolean;
  /** Все строки «по запросу»: скидка будет рассчитана при согласовании (§3.5). */
  onlyRequestItems: boolean;
}

/**
 * Предварительный итог корзины / заявки. Строки с некорректным количеством не учитываются.
 * Позиции «по запросу» не превращаются в 0 и не дают ложного итога.
 */
export function preliminaryTotals(
  lines: readonly PricedLine[],
  promoCode: string | AppliedPromo | null = null,
): PreliminaryTotals {
  const base = preliminaryTotal(
    lines.map((line) => ({ price: line.unitPrice, priceType: line.priceType, qty: line.quantity })),
  );
  let knownQuantity = 0;
  let requestQuantity = 0;
  for (const line of lines) {
    if (!isCountable(line)) continue;
    if (isRequestLine(line)) requestQuantity += line.quantity;
    else knownQuantity += line.quantity;
  }
  const promo = toAppliedPromo(promoCode);
  const discount = promo === null ? 0 : promoDiscount(base.knownTotal, promo.percent);
  return {
    knownItemsTotal: base.knownTotal,
    knownLinesCount: base.knownCount,
    knownQuantity,
    requestLinesCount: base.requestCount,
    requestQuantity,
    promo,
    discount,
    total: base.hasRequestItems ? null : base.knownTotal - discount,
    hasRequestItems: base.hasRequestItems,
    onlyRequestItems: base.requestCount > 0 && base.knownCount === 0,
  };
}

/** Поле `DemoOrder.preliminary` из предварительного расчёта. */
export function toOrderPreliminary(totals: PreliminaryTotals): DemoOrder['preliminary'] {
  return {
    knownItemsTotal: totals.knownItemsTotal,
    requestItemsCount: totals.requestLinesCount,
    discount: totals.discount,
    total: totals.total,
  };
}

// ---------------------------------------------------------------------------
// Версия согласования (демо-панель менеджера, §3.9).
// ---------------------------------------------------------------------------

/** Строка формы согласования. Цена может быть ещё не введена (null). */
export interface QuoteDraftLine {
  lineId: string;
  productId: string;
  code: string;
  name: string;
  quantity: number;
  /** Копейки за штуку; null — цена не указана; NaN — введено не число (`parseMoneyField`). */
  unitPrice: number | null;
  origin: 'request' | 'added-by-manager';
  /** Checkbox «Исключить». */
  excluded: boolean;
}

export interface QuoteDraft {
  lines: QuoteDraftLine[];
  /** Копейки; null — поле пустое (считается 0); NaN — введено не число. */
  discount: number | null;
  discountNote: string;
  /** Копейки; null — доставка не указана (обязательна, 0 допустим); NaN — введено не число. */
  delivery: number | null;
  deliveryNote: string;
  managerComment: string;
}

export interface QuoteTotals {
  itemsTotal: number;
  discount: number;
  delivery: number;
  total: number;
}

const includedLines = (draft: QuoteDraft) => draft.lines.filter((line) => !line.excluded);

/** Сумма для живого итога: пусто, не число и отрицательное — 0. */
const amountOrZero = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? value : 0;

/** Итоги формы «вживую»: строки без цены считаются нулём, пустые и нечисловые поля — нулём. */
export function quoteTotals(draft: QuoteDraft): QuoteTotals {
  const itemsTotal = includedLines(draft).reduce(
    (sum, line) => sum + amountOrZero(line.unitPrice) * line.quantity,
    0,
  );
  const discount = amountOrZero(draft.discount);
  const delivery = amountOrZero(draft.delivery);
  return { itemsTotal, discount, delivery, total: itemsTotal - discount + delivery };
}

export type QuoteDraftErrorCode =
  | 'no-lines'
  | 'price-missing'
  | 'price-invalid'
  | 'price-not-positive'
  | 'quantity-invalid'
  | 'discount-invalid'
  | 'discount-negative'
  | 'discount-too-large'
  | 'delivery-missing'
  | 'delivery-invalid'
  | 'total-not-positive';

export interface QuoteDraftError {
  code: QuoteDraftErrorCode;
  message: string;
  /** Строка, к которой относится ошибка (у ошибок строк). */
  lineId?: string;
}

export type QuoteDraftCheck =
  | { ok: true; totals: QuoteTotals; errors: [] }
  | { ok: false; totals: QuoteTotals; errors: QuoteDraftError[] };

/**
 * Условия «Выставить к оплате» (§3.2): ≥ 1 позиция; у каждой цена > 0 и количество 1–999;
 * доставка указана (≥ 0); скидка ≤ сумме товаров; итог > 0. Тексты — §6.5.
 */
export function validateQuoteDraft(draft: QuoteDraft): QuoteDraftCheck {
  const errors: QuoteDraftError[] = [];
  const lines = includedLines(draft);
  if (lines.length === 0) {
    errors.push({ code: 'no-lines', message: 'В заказе должна остаться хотя бы одна позиция' });
  }
  for (const line of lines) {
    if (line.unitPrice === null) {
      errors.push({
        code: 'price-missing',
        message: 'Укажите цену для каждой позиции',
        lineId: line.lineId,
      });
    } else if (!Number.isFinite(line.unitPrice)) {
      errors.push({
        code: 'price-invalid',
        message: 'Введите цену числом, например 13000',
        lineId: line.lineId,
      });
    } else if (line.unitPrice <= 0) {
      errors.push({
        code: 'price-not-positive',
        message: 'Цена должна быть больше нуля',
        lineId: line.lineId,
      });
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_LINE_QUANTITY
    ) {
      errors.push({
        code: 'quantity-invalid',
        message:
          line.quantity > MAX_LINE_QUANTITY
            ? 'Не больше 999 шт. — для крупных партий напишите менеджеру'
            : 'Укажите количество от 1 до 999',
        lineId: line.lineId,
      });
    }
  }
  const totals = quoteTotals(draft);
  // «1 000 руб» не превращается молча в 0: пустое поле и «не число» — разные случаи.
  if (draft.discount !== null && !Number.isFinite(draft.discount)) {
    errors.push({ code: 'discount-invalid', message: 'Введите сумму числом, например 1300' });
  } else if (draft.discount !== null && draft.discount < 0) {
    errors.push({ code: 'discount-negative', message: 'Скидка не может быть отрицательной' });
  } else if (totals.discount > totals.itemsTotal) {
    errors.push({
      code: 'discount-too-large',
      message: 'Скидка не может быть больше суммы товаров',
    });
  }
  if (draft.delivery !== null && !Number.isFinite(draft.delivery)) {
    errors.push({ code: 'delivery-invalid', message: 'Введите сумму числом, например 1500' });
  } else if (draft.delivery === null || draft.delivery < 0) {
    errors.push({
      code: 'delivery-missing',
      message: 'Укажите стоимость доставки (0, если доставка не нужна)',
    });
  }
  if (errors.length === 0 && totals.total <= 0) {
    errors.push({ code: 'total-not-positive', message: 'Итог к оплате должен быть больше нуля' });
  }
  return errors.length === 0 ? { ok: true, totals, errors: [] } : { ok: false, totals, errors };
}

/**
 * Скидка, предложенная по промокоду заказа (§3.9 п.3): процент от Σ(цена × кол-во) строк,
 * которые в снимке заявки были с ценой из прайса и не исключены. Без промокода — 0.
 */
export function suggestPromoDiscount(
  draftLines: readonly QuoteDraftLine[],
  order: Pick<DemoOrder, 'items' | 'promo'>,
): number {
  if (order.promo === null) return 0;
  const fixedInSnapshot = new Set(
    order.items.filter((item) => item.priceType === 'fixed').map((item) => item.lineId),
  );
  const base = draftLines
    .filter((line) => !line.excluded && line.origin === 'request')
    .filter((line) => fixedInSnapshot.has(line.lineId))
    .reduce((sum, line) => sum + amountOrZero(line.unitPrice) * line.quantity, 0);
  return promoDiscount(base, order.promo.percent);
}

// ---------------------------------------------------------------------------
// Денежные поля формы: рубли ↔ копейки.
// ---------------------------------------------------------------------------

/**
 * Ввод в рублях (запятая или точка, до 2 знаков после, пробелы разрядов допустимы) → копейки.
 * Пусто или не число → null. Отрицательные значения разбираются — проверяет валидация.
 */
export function parseRublesInput(value: string): number | null {
  const compact = value.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(compact)) return null;
  return Math.round(parseFloat(compact) * 100);
}

/**
 * Денежное поле формы согласования: null — поле пустое, NaN — введено не число («1 000 руб»,
 * «12,345»), иначе копейки. Различие нужно проверке: пустая скидка — это 0, а нераспознанная —
 * ошибка, а не тихий 0.
 */
export function parseMoneyField(value: string): number | null {
  if (value.trim() === '') return null;
  return parseRublesInput(value) ?? Number.NaN;
}

/** Копейки → значение поля: 1300000 → «13000», 1300050 → «13000,50». */
export function formatRublesInput(kopecks: number | null): string {
  if (kopecks === null) return '';
  const rubles = Math.trunc(kopecks / 100);
  const rest = Math.abs(kopecks % 100);
  return rest === 0 ? String(rubles) : `${rubles},${String(rest).padStart(2, '0')}`;
}
