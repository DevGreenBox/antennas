import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Явная заглушка реквизитов (antennas.md §11, DESIGN §2.17, §2.19): пока `site.legal.ready =
 * false`, на месте наименования, ИНН, адреса — только эта рамка. Никаких номеров-примеров:
 * выдуманный или «образцовый» реквизит легко принять за настоящий.
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
      className={cn(
        'flex gap-3 rounded-md border border-dashed border-line-strong bg-surface-subtle p-4',
        className,
      )}
    >
      <Icon name="file-text" size={20} className="mt-0.5 text-ink-muted" />
      <div className="min-w-0 text-small">
        <p className="font-semibold text-ink">{site.legal.requisitesNote}</p>
        <p className="mt-1 text-ink-secondary">
          {children ??
            'Наименование, регистрационные данные и адрес появятся, когда их передаст владелец сайта.'}
        </p>
      </div>
    </div>
  );
}
