import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { DemoBadge } from './Badge';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * Сообщение внутри страницы (DESIGN §5.9.12) и демо-пометка (§5.9.14).
 *
 *   <Notice tone="warning" title="Данные позиции уточняются">В прайсе есть расхождение…</Notice>
 *   <Notice tone="brand" title="Ожидает оплаты: заказ DEMO-0001" actions={<ButtonLink …/>}>К оплате 13 000 ₽</Notice>
 *   <Notice tone="danger" live>Оплата не прошла…</Notice>     // появился в ответ на действие → role="alert"
 *
 *   <DemoNotice>Демо: заявка сохранится только в этом браузере…</DemoNotice>
 *   <DemoNotice variant="panel" title="Действия менеджера (демонстрация)" id="manager-demo">…</DemoNotice>
 *
 * Статичный Notice — без роли; `live` — `role="status"` (danger — `role="alert"`).
 */

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'neutral';

const TONE: Record<NoticeTone, { surface: string; icon: IconName; iconColor: string }> = {
  info: { surface: 'bg-info-subtle', icon: 'info', iconColor: 'text-info' },
  success: { surface: 'bg-success-subtle', icon: 'circle-check', iconColor: 'text-success' },
  warning: { surface: 'bg-warning-subtle', icon: 'triangle-alert', iconColor: 'text-warning' },
  danger: { surface: 'bg-danger-subtle', icon: 'circle-alert', iconColor: 'text-danger' },
  brand: { surface: 'bg-brand-subtle', icon: 'info', iconColor: 'text-brand-text' },
  neutral: { surface: 'bg-surface-muted', icon: 'info', iconColor: 'text-ink-muted' },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  /** Кнопки и ссылки под текстом. */
  actions?: ReactNode;
  /** Появился в ответ на действие: role="status" (danger — "alert"). */
  live?: boolean;
  className?: string;
  id?: string;
  children?: ReactNode;
}

export function Notice({
  tone = 'info',
  title,
  actions,
  live = false,
  className,
  id,
  children,
}: NoticeProps) {
  const style = TONE[tone];
  return (
    <div
      id={id}
      role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}
      className={cn('flex gap-3 rounded-md p-4', style.surface, className)}
    >
      <Icon name={style.icon} size={20} className={cn('mt-0.5', style.iconColor)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="text-small font-semibold text-ink">{title}</p> : null}
        {children ? (
          <div className={cn('text-small text-ink-secondary', title ? 'mt-1' : null)}>
            {children}
          </div>
        ) : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

export interface DemoNoticeProps {
  /** inline — пометка в потоке; panel — белая панель с полями и кнопками (демо-менеджер, провайдер). */
  variant?: 'inline' | 'panel';
  title?: ReactNode;
  /** Уровень заголовка панели (по умолчанию h2). */
  headingLevel?: 'h2' | 'h3';
  /** Кегль заголовка панели: title — демо-панель менеджера, body — ProviderSimulator (§5.9.38). */
  headingSize?: 'title' | 'body';
  /** Компактный отступ p-2 (подсказка под промокодом). */
  compact?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
}

export function DemoNotice({
  variant = 'inline',
  title,
  headingLevel = 'h2',
  headingSize = 'title',
  compact = false,
  id,
  className,
  children,
}: DemoNoticeProps) {
  if (variant === 'panel') {
    const Heading = headingLevel;
    return (
      <section
        id={id}
        aria-labelledby={id && title ? `${id}-title` : undefined}
        className={cn(
          'rounded-md border border-dashed border-demo-line bg-surface p-4 lg:p-6',
          className,
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <DemoBadge />
          {title ? (
            <Heading
              id={id ? `${id}-title` : undefined}
              className={cn(headingSize === 'body' ? 'text-body' : 'text-title', 'font-semibold')}
            >
              {title}
            </Heading>
          ) : null}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </section>
    );
  }
  return (
    <div
      id={id}
      className={cn(
        'flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md border border-dashed border-demo-line bg-demo-subtle text-small text-ink',
        compact ? 'p-2' : 'p-3 lg:p-4',
        className,
      )}
    >
      <DemoBadge className="shrink-0" />
      <div className="min-w-0 flex-1 basis-48 pt-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
