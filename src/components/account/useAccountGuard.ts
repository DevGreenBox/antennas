'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useDemoOrdersHydrated } from '@/lib/store/orders';
import { useSessionEmail } from '@/lib/store/session';

/**
 * Охрана страниц ЛК (DESIGN §2.13): пока хранилища не прочитаны — `ready: false` (страница
 * показывает Skeleton); сессии нет — `router.replace('/login?next=…')`, чтобы после входа
 * вернуться туда же. `nextPath` — текущий путь с параметрами (у оплаты — `?v=`).
 */
export function useAccountGuard(nextPath: string): { ready: boolean; email: string | null } {
  const router = useRouter();
  const hydrated = useDemoOrdersHydrated();
  const email = useSessionEmail();

  useEffect(() => {
    if (hydrated && email === null) {
      router.replace(`/login?${new URLSearchParams({ next: nextPath }).toString()}`);
    }
  }, [hydrated, email, nextPath, router]);

  return { ready: hydrated && email !== null, email };
}
