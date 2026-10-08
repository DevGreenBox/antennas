import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '@/lib/order-status';
import type { OrderStatus } from '@/types/order';

/**
 * Бейджи (DESIGN §5.9.13). Смысл всегда в тексте, цвет — дополнение; текст не обрезается.
 *
 *   <Badge tone="warning">Уточняется</Badge>      // значение needs-review
 *   <Badge tone="neutral">По запросу</Badge>
 *   <DemoBadge />                                  // «Демо» — нейтральный тон и пунктирная рамка (§ R.2)
 *   <StatusBadge status={order.status} />          // статус заказа с точкой (§3.1)
 */

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'demo';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-ink-secondary',
  info: 'bg-info-subtle text-info',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  brand: 'bg-brand-subtle text-brand-text',
  demo: 'bg-demo-subtle text-demo border-demo-line border-dashed',
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Точка перед текстом (StatusBadge). */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2 rounded-sm border text-caption font-medium whitespace-nowrap',
        // Рамка есть у всех (режим высокой контрастности), видимая — только у «Демо».
        tone === 'demo' ? null : 'border-transparent',
        TONE[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="demo" className={className}>
      Демо
    </Badge>
  );
}

/** «Уточняется» — значение со статусом needs-review (§4.10). */
export function NeedsReviewBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className}>
      Уточняется
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge tone={ORDER_STATUS_TONES[status]} dot className={className}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
