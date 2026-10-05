'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { site } from '@/config/site';
import { sanitizeFavoritesData } from '@/lib/demo-session';
import type { FavoritesData } from '@/types/order';

import { refresh, safePersistOptions, syncAcrossTabs, usePersistHydrated } from './storage';

/**
 * Избранное в браузере (ключ `site.storageKeys.favorites`): id товаров, новые в начале.
 *
 *   const isFavorite = useIsFavorite(product.id);
 *   const toggle = useFavorites((s) => s.toggle);    // toggle(id) → true, если стал избранным
 *   const ids = useFavorites((s) => s.ids);          // страница «Избранное», порядок — новые сверху
 *   const count = useFavoritesCount();               // счётчик в шапке
 */

export interface FavoritesState extends FavoritesData {
  toggle: (productId: string) => boolean;
  add: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  /** Заменить целиком (объединение при входе). */
  replace: (ids: string[]) => void;
}

const initialFavorites = (): FavoritesData => ({ ids: [] });

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ...initialFavorites(),

      toggle: (productId) => {
        refresh(useFavorites);
        const ids = get().ids;
        const isFavorite = ids.includes(productId);
        set({ ids: isFavorite ? ids.filter((id) => id !== productId) : [productId, ...ids] });
        return !isFavorite;
      },

      add: (productId) => {
        refresh(useFavorites);
        const ids = get().ids;
        if (!ids.includes(productId)) set({ ids: [productId, ...ids] });
      },

      remove: (productId) => {
        refresh(useFavorites);
        set({ ids: get().ids.filter((id) => id !== productId) });
      },

      clear: () => set({ ids: [] }),

      replace: (ids) => set({ ids: [...new Set(ids)] }),
    }),
    safePersistOptions<FavoritesState, FavoritesData>({
      name: site.storageKeys.favorites,
      initial: initialFavorites,
      sanitize: sanitizeFavoritesData,
      partialize: (state) => ({ ids: state.ids }),
    }),
  ),
);

syncAcrossTabs(site.storageKeys.favorites, useFavorites);

export const useFavoritesHydrated = () => usePersistHydrated(useFavorites);

export const useFavoritesCount = () => useFavorites((state) => state.ids.length);

export const useIsFavorite = (productId: string) =>
  useFavorites((state) => state.ids.includes(productId));
