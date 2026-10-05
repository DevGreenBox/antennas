import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Заголовок страницы (DESIGN §5.9.15): h1, мета (количество, email, дата), описание, действия
 * справа на ≥ md.
 *
 *   <PageHeader title="Каталог" meta="118 товаров" />
 *   <PageHeader title={`Заказ ${order.number}`} titleAddon={<StatusBadge status={order.status} />}
 *     meta={`Оформлен ${formatDateFull(order.createdAt)}`} />
 *   <PageHeader title="Личный кабинет" meta={email} actions={<Button variant="ghost" size="sm">Выйти</Button>} />
 */
export interface PageHeaderProps {
  title: ReactNode;
  /** Рядом с h1 (StatusBadge, Badge «Служебная страница»). */
  titleAddon?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** id заголовка (для aria-labelledby). */
  titleId?: string;
  className?: string;
}

export function PageHeader({
  title,
  titleAddon,
  meta,
  description,
  actions,
  titleId,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-6 gap-4 lg:mb-8',
        actions ? 'md:flex md:items-end md:justify-between' : null,
        className,
      )}
    >
      <div className="min-w-0">
        <div className={titleAddon ? 'flex flex-wrap items-center gap-x-3 gap-y-2' : undefined}>
          <h1 id={titleId}>{title}</h1>
          {titleAddon}
        </div>
        {meta ? <p className="mt-1 text-small text-ink-muted">{meta}</p> : null}
        {description ? (
          <div className="mt-3 max-w-text text-body text-ink-secondary">{description}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="mt-4 flex flex-wrap gap-3 md:mt-0 md:shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
