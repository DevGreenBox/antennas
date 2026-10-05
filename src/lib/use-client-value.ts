'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { isPersistentStorageAvailable } from '@/lib/store/storage';

/**
 * Значения, которые существуют только в браузере, без рассинхрона разметки: на сервере и в
 * рендере гидратации — «серверное» значение, сразу после — настоящее (useSyncExternalStore,
 * без setState в эффекте).
 */

const noopSubscribe = () => () => {};

/** true после гидратации; false на сервере и в первом клиентском рендере. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Можно ли сохранять данные в браузере: null — ещё неизвестно (сервер, гидратация), false —
 * приватный режим / запрет / переполнение: показать Notice (DESIGN §2.1, `StorageNotice`).
 */
export function useStorageAvailable(): boolean | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => isPersistentStorageAvailable(),
    () => null,
  );
}

/** Значение с задержкой (подсказки поиска — `site.catalog.suggestDebounceMs`). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
