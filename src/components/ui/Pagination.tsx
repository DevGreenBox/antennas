import Link from 'next/link';

import { cn } from '@/lib/cn';

import { buttonClasses } from './Button';
import { Icon } from './Icon';
import { PaginationFocus } from './PaginationFocus';

/**
 * Пагинация (DESIGN §5.9.21, §4.8): настоящие ссылки с `page` в URL (работают без JS).
 * Не рендерится при одной странице. Номера: первая, последняя, текущая ± 1, пропуски «…».
 * На < sm вместо номеров — «Страница {n} из {m}». После перехода по ссылке пагинации — фокус и
 * прокрутка к `#{focusTargetId}` (по умолчанию `results` — `h2.sr-only` над выдачей); смена
 * страницы по другой причине (сортировка, подбор, «Назад» браузера) фокус не трогает.
 *
 *   <Pagination page={result.page} pageCount={result.totalPages}
 *     hrefs={pages.map((n) => pathname + catalogQueryString({ ...state, page: n }))} />
 *
 * `hrefs[n - 1]` — адрес страницы n (строки, а не функция: компонент можно рендерить и с
 * сервера, и из клиентского компонента).
 */
export interface PaginationProps {
  page: number;
  pageCount: number;
  /** Адреса всех страниц по порядку: hrefs[0] — страница 1. */
  hrefs: readonly string[];
  focusTargetId?: string;
  className?: string;
}

/** Номера для показа: 1 … p-1 p p+1 … m. 'gap' — пропуск. */
export function paginationItems(page: number, pageCount: number): (number | 'gap')[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  for (const n of sorted) {
    const prev = items[items.length - 1];
    if (typeof prev === 'number' && n - prev === 2) items.push(prev + 1);
    else if (typeof prev === 'number' && n - prev > 2) items.push('gap');
    items.push(n);
  }
  return items;
}

export function Pagination({
  page,
  pageCount,
  hrefs,
  focusTargetId = 'results',
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const prevHref = page > 1 ? hrefs[page - 2] : null;
  const nextHref = page < pageCount ? hrefs[page] : null;
  const edge = (href: string | null, label: string, direction: 'prev' | 'next') => {
    const content = (
      <>
        {direction === 'prev' ? <Icon name="chevron-left" size={20} /> : null}
        <span>{label}</span>
        {direction === 'next' ? <Icon name="chevron-right" size={20} /> : null}
      </>
    );
    const classes = cn(
      buttonClasses({ variant: 'secondary', size: 'md', disabled: href === null }),
      'min-w-10',
    );
    return href === null ? (
      <a role="link" aria-disabled="true" className={classes}>
        {content}
      </a>
    ) : (
      <Link href={href} scroll={false} rel={direction} className={classes}>
        {content}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Страницы"
      className={cn('mt-8 flex items-center justify-between gap-2', className)}
    >
      <PaginationFocus page={page} targetId={focusTargetId} />
      {edge(prevHref, 'Назад', 'prev')}
      <p className="text-small text-ink-secondary sm:hidden">
        Страница {page} из {pageCount}
      </p>
      <ol className="hidden items-center gap-1 sm:flex">
        {paginationItems(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden className="px-1 text-small text-ink-muted">
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className="inline-flex h-10 min-w-10 items-center justify-center rounded-sm bg-ink px-3 text-small font-medium text-ink-inverse tabular-nums"
                >
                  <span className="sr-only">Страница </span>
                  {item}
                </span>
              ) : (
                <Link
                  href={hrefs[item - 1]}
                  scroll={false}
                  className="inline-flex h-10 min-w-10 items-center justify-center rounded-sm px-3 text-small font-medium text-ink tabular-nums hover:bg-surface-muted"
                >
                  <span className="sr-only">Страница </span>
                  {item}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>
      {edge(nextHref, 'Вперёд', 'next')}
    </nav>
  );
}
