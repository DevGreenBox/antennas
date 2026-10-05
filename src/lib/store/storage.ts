'use client';

import { useSyncExternalStore } from 'react';
import type {
  PersistOptions,
  PersistStorage,
  StateStorage,
  StorageValue,
} from 'zustand/middleware';

/**
 * Общая основа хранилищ браузера (zustand persist, ключи — `site.storageKeys`, DESIGN §9).
 *
 * - `safeStorage`: localStorage с запасным хранением в памяти вкладки. Приватный режим, запрет
 *   сайта, переполнение не ломают страницу — данные живут до закрытия вкладки, а
 *   `isPersistentStorageAvailable()` даёт странице показать предупреждение (§2.1).
 * - `syncAcrossTabs`: изменения из другой вкладки приходят событием `storage` и перечитываются.
 *   Запись того же значения событие не порождает — «пинг-понга» между вкладками нет.
 *
 * Гидратация без рассинхрона разметки: persist читает localStorage при создании хранилища, но
 * `useStore` zustand на этапе гидратации берёт `getInitialState()` (пустое состояние) — сервер и
 * первый клиентский рендер совпадают, данные появляются следующим рендером. «Гидратировано ли
 * хранилище» — хук `usePersistHydrated(store)` (и готовые `useCartHydrated()` и т. п. рядом с
 * хранилищами): до этого страница показывает Skeleton, а не пустое состояние (§5.9.33).
 *
 * Битые данные (руками правленый localStorage, другая версия сайта) не роняют страницы:
 * - `persistStorage` читает JSON безопасно — невалидный JSON или не та обёртка
 *   `{ state, version }` считаются пустым хранилищем (иначе persist падал внутри гидратации и
 *   `hasHydrated()` навсегда оставался false — вечный Skeleton);
 * - `safePersistOptions(sanitize)` проверяет форму состояния (`merge`): неверное поле —
 *   значение по умолчанию, битые элементы списков отбрасываются;
 * - если гидратация всё же упала, хранилище считается пустым и прочитанным
 *   (`usePersistHydrated` → true), а не висит в Skeleton.
 */

const memory = new Map<string, string>();
let persistentAvailable: boolean | null = null;

function probe(): boolean {
  if (persistentAvailable !== null) return persistentAvailable;
  try {
    const key = '__antennas_probe__';
    window.localStorage.setItem(key, key);
    window.localStorage.removeItem(key);
    persistentAvailable = true;
  } catch {
    persistentAvailable = false;
  }
  return persistentAvailable;
}

/** localStorage работает (false — данные хранятся только в памяти вкладки). */
export function isPersistentStorageAvailable(): boolean {
  return typeof window !== 'undefined' && probe();
}

export const safeStorage: StateStorage = {
  getItem(name) {
    if (typeof window === 'undefined') return null;
    if (probe()) {
      try {
        return window.localStorage.getItem(name);
      } catch {
        // упали посреди сессии — читаем из памяти
      }
    }
    return memory.get(name) ?? null;
  },
  setItem(name, value) {
    if (typeof window === 'undefined') return;
    memory.set(name, value);
    if (!probe()) return;
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Переполнение или запрет: дальше работаем в памяти вкладки и честно сообщаем об этом.
      persistentAvailable = false;
    }
  },
  removeItem(name) {
    if (typeof window === 'undefined') return;
    memory.delete(name);
    if (!probe()) return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      persistentAvailable = false;
    }
  },
};

/** Разобрать сохранённое значение; невалидный JSON или чужая форма — null (как пустое). */
function parseStored(raw: string | null): StorageValue<unknown> | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { state, version } = parsed as { state?: unknown; version?: unknown };
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return null;
  return typeof version === 'number' ? { state, version } : { state };
}

/** JSON-хранилище persist поверх `safeStorage`: чтение никогда не бросает исключение. */
export const persistStorage: PersistStorage<unknown> = {
  getItem: (name) => parseStored(safeStorage.getItem(name) as string | null),
  setItem: (name, value) => {
    let json: string;
    try {
      json = JSON.stringify(value);
    } catch {
      return;
    }
    void safeStorage.setItem(name, json);
  },
  removeItem: (name) => void safeStorage.removeItem(name),
};

/** Версия формата данных persist (несовместимая версия → хранилище сбрасывается, §9). */
export const STORAGE_VERSION = 1;

// Хранилища, гидратация которых упала: считаются прочитанными (пустыми), а не «ещё читаются».
const failedHydration = new Set<string>();
const failureListeners = new Set<() => void>();

function setHydrationFailed(name: string, failed: boolean): void {
  if (failedHydration.has(name) === failed) return;
  if (failed) failedHydration.add(name);
  else failedHydration.delete(name);
  failureListeners.forEach((listener) => listener());
}

/**
 * Общие настройки persist с проверкой формы. `sanitize(persisted)` получает то, что лежит в
 * `state` (что угодно), и возвращает корректные данные хранилища; `initial()` — пустые данные
 * (несовместимая версия формата, сбой). Действия хранилища берутся из текущего состояния.
 */
export function safePersistOptions<S extends object, D extends Partial<S>>({
  name,
  initial,
  sanitize,
  partialize,
}: {
  name: string;
  initial: () => D;
  sanitize: (persisted: unknown) => D;
  partialize?: (state: S) => D;
}): PersistOptions<S, D> {
  return {
    name,
    storage: persistStorage as PersistStorage<D>,
    version: STORAGE_VERSION,
    ...(partialize ? { partialize } : {}),
    // Несовместимая версия формата — начинаем с пустых данных (DESIGN §9).
    migrate: () => initial(),
    merge: (persisted, current) => {
      // undefined — в хранилище ничего нет (или оно нечитаемо): остаётся текущее состояние.
      if (persisted === undefined) return current;
      let data: D;
      try {
        data = sanitize(persisted);
      } catch {
        data = initial();
      }
      return { ...current, ...data };
    },
    onRehydrateStorage: () => (_state, error) => {
      if (error !== undefined && process.env.NODE_ENV === 'development') {
        console.warn(`[storage] Не удалось прочитать «${name}», данные считаются пустыми.`, error);
      }
      setHydrationFailed(name, error !== undefined);
    },
  };
}

interface Rehydratable {
  persist: {
    rehydrate: () => Promise<void> | void;
    hasHydrated: () => boolean;
    getOptions: () => { name?: string };
    onHydrate: (listener: () => void) => () => void;
    onFinishHydration: (listener: () => void) => () => void;
  };
}

/** Прочитано ли хранилище (сбой гидратации — тоже «прочитано», данные пустые). */
function isHydrated(store: Rehydratable): boolean {
  if (store.persist.hasHydrated()) return true;
  const name = store.persist.getOptions().name;
  return name !== undefined && failedHydration.has(name);
}

/**
 * true, когда хранилище прочитано из localStorage. На сервере и в рендере гидратации — false
 * (разметка совпадает с серверной), сразу после — true.
 */
export function usePersistHydrated(store: Rehydratable): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const offStart = store.persist.onHydrate(onChange);
      const offFinish = store.persist.onFinishHydration(onChange);
      failureListeners.add(onChange);
      return () => {
        offStart();
        offFinish();
        failureListeners.delete(onChange);
      };
    },
    () => isHydrated(store),
    () => false,
  );
}

/** Перечитывать хранилище при изменении его ключа в другой вкладке. */
export function syncAcrossTabs(key: string, store: Rehydratable): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => {
    // key === null — localStorage.clear() в другой вкладке.
    if (event.storageArea !== window.localStorage) return;
    if (event.key === key || event.key === null) void store.persist.rehydrate();
  });
}

/**
 * Перечитать хранилище из localStorage перед изменением (read-modify-write): действие в этой
 * вкладке не затирает то, что другая вкладка записала мгновенье назад. Хранилище синхронное,
 * поэтому после вызова `getState()` уже свежий.
 */
export function refresh(store: Rehydratable): void {
  if (typeof window === 'undefined') return;
  void store.persist.rehydrate();
}
