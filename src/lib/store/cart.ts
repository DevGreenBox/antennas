'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { site } from '@/config/site';
import { MAX_LINE_QUANTITY, checkPromoCode } from '@/lib/demo-pricing';
import type { PromoCheck } from '@/lib/demo-pricing';
import { sanitizeCartData } from '@/lib/demo-session';
import type { CartData, CartItem } from '@/types/order';

import { refresh, safePersistOptions, syncAcrossTabs, usePersistHydrated } from './storage';

/**
 * Корзина в браузере (ключ `site.storageKeys.cart`, DESIGN §3.3). Хранит только id и количество;
 * цены и названия — из каталога в момент показа (позиция, исчезнувшая из каталога, видна как
 * «Позиция больше недоступна» и не попадает в заявку).
 *
 * Чтение в компонентах — селекторами, возвращающими стабильные значения:
 *   const items = useCart((s) => s.items);           // массив меняется только при изменении
 *   const count = useCartCount();                    // число позиций (строк) — счётчик в шапке
 *   const qty = useCartQuantity(product.id);         // 0 — товара нет в корзине
 *   const hydrated = useCartHydrated();              // false → Skeleton (§5.9.33)
 * Изменение — действиями: `useCart.getState().add(id, 2)` или `const add = useCart((s) => s.add)`.
 * Пока есть демо-сессия, каждое изменение копируется в профиль (StoreRuntime, §3.11).
 */

export interface CartState extends CartData {
  /** Добавить к уже лежащему количеству (не больше 999). Возвращает новое количество. */
  add: (productId: string, quantity?: number) => number;
  /** Задать количество 1–999 (вне пределов — прижимается). */
  setQuantity: (productId: string, quantity: number) => void;
  /** Удалить позицию; возвращает её и место — для Toast «Вернуть». */
  remove: (productId: string) => { item: CartItem; index: number } | null;
  /** Вернуть удалённую позицию на прежнее место. */
  restore: (item: CartItem, index: number) => void;
  /** Очистить корзину и промокод (после заявки, «Очистить корзину»). */
  clear: () => void;
  /** Применить промокод по правилам §3.5; при успехе пишет `promoCode`. */
  applyPromo: (input: string) => PromoCheck;
  removePromo: () => void;
  /** Заменить содержимое целиком (объединение при входе). */
  replace: (data: CartData) => void;
}

const clamp = (quantity: number) =>
  Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(Number.isFinite(quantity) ? quantity : 1)));

const initialCart = (): CartData => ({ items: [], promoCode: null });

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      ...initialCart(),

      add: (productId, quantity = 1) => {
        refresh(useCart);
        const items = get().items;
        const existing = items.find((item) => item.productId === productId);
        const next = clamp((existing?.quantity ?? 0) + quantity);
        set({
          items: existing
            ? items.map((item) =>
                item.productId === productId ? { ...item, quantity: next } : item,
              )
            : [...items, { productId, quantity: next, addedAt: new Date().toISOString() }],
        });
        return next;
      },

      setQuantity: (productId, quantity) => {
        refresh(useCart);
        set({
          items: get().items.map((item) =>
            item.productId === productId ? { ...item, quantity: clamp(quantity) } : item,
          ),
        });
      },

      remove: (productId) => {
        refresh(useCart);
        const items = get().items;
        const index = items.findIndex((item) => item.productId === productId);
        if (index < 0) return null;
        set({ items: items.filter((item) => item.productId !== productId) });
        return { item: items[index], index };
      },

      restore: (item, index) => {
        refresh(useCart);
        const items = get().items.filter((existing) => existing.productId !== item.productId);
        const position = Math.min(Math.max(0, index), items.length);
        set({ items: [...items.slice(0, position), item, ...items.slice(position)] });
      },

      clear: () => set({ items: [], promoCode: null }),

      applyPromo: (input) => {
        const result = checkPromoCode(input, get().promoCode);
        if (result.promo !== null) set({ promoCode: result.promo.code });
        return result;
      },

      removePromo: () => set({ promoCode: null }),

      replace: (data) => set({ items: data.items, promoCode: data.promoCode }),
    }),
    // Форма проверяется при каждом чтении: `items: null` в localStorage иначе ронял шапку
    // (useCartCount) на всех страницах.
    safePersistOptions<CartState, CartData>({
      name: site.storageKeys.cart,
      initial: initialCart,
      sanitize: sanitizeCartData,
      partialize: (state) => ({ items: state.items, promoCode: state.promoCode }),
    }),
  ),
);

syncAcrossTabs(site.storageKeys.cart, useCart);

export const useCartHydrated = () => usePersistHydrated(useCart);

/** Число позиций (строк) в корзине — счётчик в шапке. */
export const useCartCount = () => useCart((state) => state.items.length);

/** Сколько штук товара в корзине (0 — нет). */
export const useCartQuantity = (productId: string) =>
  useCart((state) => state.items.find((item) => item.productId === productId)?.quantity ?? 0);
