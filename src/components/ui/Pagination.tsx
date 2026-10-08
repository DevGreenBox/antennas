import Link from 'next/link';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';
import { PaginationFocus } from './PaginationFocus';

/**
 * Пагинация (DESIGN §5.9.21, §4.8, § R.7): настоящие ссылки с `page` в URL (работают без JS).
 * Не рендерится при одной странице. Номера: первая, последняя, текущая ± 1, пропуски «…».
 * Вид — спокойный и типографический: «Назад»/«Вперёд» — текст со стрелкой без рамки (на крайней
 * странице — приглушённый текст, место сохраняется), номера — табличные цифры без рамки, текущая —
 * заливка `ink` (§ R.2: выбранное — `ink`). Высота 44 px на < lg (цель нажатия, § R.9), 40 px с lg.
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

/** Общее у всех элементов: высота, скругление 4 px, табличные цифры. */
const ITEM =
  'inline-flex h-11 items-center justify-center rounded-sm text-small tabular-nums transition-colors duration-fast lg:h-10';

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
      ITEM,
      'gap-1 font-medium',
      // Поле со стороны стрелки компенсировано: стрелка стоит по краю колонки выдачи.
      direction === 'prev' ? '-ml-1.5 pr-3 pl-1.5' : '-mr-1.5 pr-1.5 pl-3',
      href === null
        ? 'cursor-default text-ink-disabled'
        : 'text-ink hover:bg-surface-muted active:bg-line-subtle',
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
      className={cn('mt-8 flex items-center justify-between gap-2 lg:mt-10', className)}
    >
      <PaginationFocus page={page} targetId={focusTargetId} />
      {edge(prevHref, 'Назад', 'prev')}
      <p className="text-small text-ink-secondary tabular-nums sm:hidden">
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
                  className={cn(
                    ITEM,
                    'min-w-11 px-2 font-medium lg:min-w-10',
                    'bg-ink text-ink-inverse',
                  )}
                >
                  <span className="sr-only">Страница </span>
                  {item}
                </span>
              ) : (
                <Link
                  href={hrefs[item - 1]}
                  scroll={false}
                  className={cn(
                    ITEM,
                    'min-w-11 px-2 text-ink-secondary hover:bg-surface-muted hover:text-ink lg:min-w-10',
                  )}
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
