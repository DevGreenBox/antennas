'use client';

import { useEffect } from 'react';

import { startProfileSync } from '@/lib/store/session';

/**
 * Фоновые подписки хранилищ браузера (монтируется один раз в корневом layout): пока есть
 * демо-сессия, изменения корзины и избранного копируются в профиль (DESIGN §3.11).
 * Синхронизация вкладок (событие `storage`) подключается в самих хранилищах.
 */
export function StoreRuntime() {
  useEffect(() => startProfileSync(), []);
  return null;
}
