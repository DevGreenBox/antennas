import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';
import type { IconName } from './Icon';

/**
 * Пустое состояние (DESIGN §5.9.37, § R.1): спокойное и типографическое — по левому краю, без
 * рамки, фона и иллюстраций; заголовок 22 px (500), текст `ink-secondary`, действия ниже. Текст
 * всегда говорит, что делать дальше. Тексты — §6.4. До гидратации клиентских страниц не
 * показывается (там Skeleton).
 *
 * Заголовок, текст и действия — прямые дети одного блока: e2e находит кнопку действия через
 * ближайший `div`, содержащий заголовок.
 *
 *   <EmptyState title="Корзина пуста" actions={<ButtonLink href="/catalog" variant="primary">Перейти в каталог</ButtonLink>}>
 *     Добавьте позиции из каталога — они сохранятся в этом браузере.
 *   </EmptyState>
 */
export interface EmptyStateProps {
  title: ReactNode;
  icon?: IconName;
  /** Уровень заголовка: h2 по умолчанию; h1 — если это единственное содержимое страницы. */
  headingLevel?: 'h1' | 'h2' | 'h3';
  actions?: ReactNode;
  /** Сразу под заголовком страницы или внутри раздела: отступы 24 px вместо 48. */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  title,
  icon,
  headingLevel = 'h2',
  actions,
  compact = false,
  className,
  children,
}: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <div
      className={cn(
        'flex max-w-text flex-col items-start gap-2',
        compact ? 'py-6' : 'py-12',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={24} className="mb-1 text-ink-muted" /> : null}
      <Heading className="text-title font-medium text-ink">{title}</Heading>
      {children ? <div className="text-body text-ink-secondary">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
