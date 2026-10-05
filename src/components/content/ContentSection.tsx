import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Секция текстовой страницы (контакты, доставка, документы): `h2` с необязательной пометкой
 * справа (Badge «Уточняется» / «Текст готовится», DESIGN §2.18–2.19) и текст шириной
 * `max-w-text`. Ритм — DESIGN §2.1: секция → секция `mt-10 lg:mt-16`, заголовок → текст `mb-4`.
 * `spacing="compact"` — для длинных документов из коротких разделов (юридические страницы), где
 * полный ритм растянул бы страницу из заголовков.
 */
export function ContentSection({
  id,
  title,
  status,
  wide = false,
  spacing = 'default',
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Пометка рядом с заголовком — Badge. */
  status?: ReactNode;
  /** Без ограничения `max-w-text` (горизонтальные шаги процесса). */
  wide?: boolean;
  /** none — первая секция сразу после PageHeader (его отступ уже задан). */
  spacing?: 'default' | 'compact' | 'none';
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        'scroll-mt-4',
        spacing === 'none' ? null : spacing === 'compact' ? 'mt-8 lg:mt-10' : 'mt-10 lg:mt-16',
        wide ? null : 'max-w-text',
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 lg:mb-4">
        <h2 id={`${id}-title`}>{title}</h2>
        {status}
      </div>
      <div className="text-body text-ink-secondary">{children}</div>
    </section>
  );
}
