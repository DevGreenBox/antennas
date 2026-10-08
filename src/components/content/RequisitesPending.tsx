import type { ReactNode } from 'react';

import { site } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Явная заглушка реквизитов (antennas.md §11, DESIGN §2.17, §2.19): пока `site.legal.ready =
 * false`, на месте наименования, ИНН, адреса — только этот блок. Никаких номеров-примеров:
 * выдуманный или «образцовый» реквизит легко принять за настоящий.
 *
 * Вид — DESIGN § R: спокойная вставка с линией слева, без значка и без пунктира (пунктир в
 * системе означает демо, а здесь не демо, а данные, которых ещё нет).
 */
export function RequisitesPending({
  children,
  className,
}: {
  /** Что именно появится (по умолчанию — общая фраза). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="requisites-pending"
      className={cn('border-l-2 border-line-emphasis py-0.5 pl-4 text-small', className)}
    >
      <p className="font-semibold text-ink">{site.legal.requisitesNote}</p>
      <p className="mt-1 text-ink-secondary">
        {children ??
          'Наименование, регистрационные данные и адрес появятся, когда их передаст владелец сайта.'}
      </p>
    </div>
  );
}
