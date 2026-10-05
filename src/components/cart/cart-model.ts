/**
 * Позиции корзины вместе с товарами каталога. Корзина хранит только id и количество (DESIGN
 * §3.3): цена и название берутся из каталога на момент показа и заявки, а позиция, которой в
 * каталоге больше нет, остаётся видимой как «Позиция больше недоступна» и в заявку не идёт.
 */

import { useMemo } from 'react';

import { preliminaryTotals } from '@/lib/demo-pricing';
import type { PreliminaryTotals, PricedLine } from '@/lib/demo-pricing';
import type { Product } from '@/types/catalog';
import type { CartItem } from '@/types/order';

export interface CartLine {
  item: CartItem;
  /** null — товар исчез из каталога. */
  product: Product | null;
}

export interface CartModel {
  lines: CartLine[];
  /** Доступные позиции — они считаются и уходят в заявку. */
  available: CartLine[];
  unavailableCount: number;
  /** Всего штук доступных позиций. */
  quantity: number;
  totals: PreliminaryTotals;
}

export function toPricedLine(line: CartLine): PricedLine {
  const product = line.product as Product;
  return {
    priceType: product.priceType,
    unitPrice: product.priceType === 'fixed' ? product.price : null,
    quantity: line.item.quantity,
  };
}

export function buildCartModel(
  items: readonly CartItem[],
  productsById: ReadonlyMap<string, Product>,
  promoCode: string | null,
): CartModel {
  const lines = items.map((item) => ({ item, product: productsById.get(item.productId) ?? null }));
  const available = lines.filter((line) => line.product !== null);
  return {
    lines,
    available,
    unavailableCount: lines.length - available.length,
    quantity: available.reduce((sum, line) => sum + line.item.quantity, 0),
    totals: preliminaryTotals(available.map(toPricedLine), promoCode),
  };
}

/** Индекс товаров по id (один раз на список, пришедший с сервера). */
export function useProductsById(products: readonly Product[]): ReadonlyMap<string, Product> {
  return useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
}
