'use client';

import { useStorageAvailable } from '@/lib/use-client-value';

import { Notice } from './Notice';

/**
 * Предупреждение «Браузер не даёт сохранять данные…» (DESIGN §2.1) — ставится над контентом
 * клиентских страниц (корзина, избранное, заявка, вход, ЛК). Рендерится, только если
 * localStorage недоступен; данные тогда живут в памяти вкладки.
 */
export function StorageNotice({ className }: { className?: string }) {
  const available = useStorageAvailable();
  if (available !== false) return null;
  return (
    <Notice tone="warning" className={className}>
      Браузер не даёт сохранять данные: корзина, избранное и демо-заказы пропадут после закрытия
      вкладки.
    </Notice>
  );
}
