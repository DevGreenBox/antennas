import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Раздел служебной страницы (`/import-report`, `/brand`; DESIGN §2.20–2.21, вид — § R): тонкая
 * линия `line` сверху, `h2`, необязательное описание (`text-small`, `max-w-text`) и содержимое на
 * всю ширину контейнера (таблицы, схемы). Без карточек: разделы отделяет линия и воздух.
 */
export function ServiceSection({
  id,
  title,
  description,
  className,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('mt-12 scroll-mt-4 border-t border-line pt-6 lg:mt-16 lg:pt-8', className)}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      {description ? (
        <p className="mt-2 max-w-text text-small text-ink-secondary">{description}</p>
      ) : null}
      <div className="mt-5 lg:mt-6">{children}</div>
    </section>
  );
}

/**
 * Классы таблиц служебных страниц: без рамки и скруглений — линия `line` сверху и снизу, шапка на
 * `surface-subtle` (роль токена — шапка таблиц, § R.2), строки разделены `line-subtle`.
 */
export const SERVICE_TABLE = {
  /** Обёртка: горизонтальная прокрутка внутри, не у страницы. */
  frame: 'relative overflow-x-auto border-y border-line',
  head: 'bg-surface-subtle text-left text-caption text-ink-secondary',
  headRow: 'border-b border-line',
  th: 'px-3 py-2.5 align-bottom font-medium',
  row: 'border-b border-line-subtle align-top last:border-b-0',
} as const;
