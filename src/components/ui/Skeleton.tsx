import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Заглушки до гидратации клиентских страниц (DESIGN §5.9.33): статичные блоки без мерцания,
 * контейнер `aria-busy` + sr «Загрузка…». Пустое состояние до гидратации не показывается.
 *
 *   if (!hydrated) return <SkeletonRows rows={3} />;
 *   <SkeletonGroup><Skeleton className="h-40 w-full rounded-md" /></SkeletonGroup>
 */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-sm bg-surface-muted', className)} />;
}

export function SkeletonGroup({
  label = 'Загрузка…',
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Строки списка: заголовок 2/3 и мета 1/3. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <SkeletonGroup className={cn('divide-y divide-line-subtle', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 py-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** Сводка (корзина, заказ). */
export function SkeletonSummary({ className }: { className?: string }) {
  return (
    <SkeletonGroup className={className}>
      <Skeleton className="h-40 w-full rounded-md" />
    </SkeletonGroup>
  );
}
