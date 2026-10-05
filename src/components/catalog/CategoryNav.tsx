import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * CategoryNav / SubcategoryNav (DESIGN §5.9.23): чипы-ссылки категорий с количествами. Текущий
 * чип — заливка `ink` и `aria-current="page"`.
 *
 * С md чипы переносятся по строкам. На < md — одна строка с горизонтальной прокруткой внутри
 * полосы (на 390 px перенос давал 5 строк, ~250 px до выдачи): полоса во всю ширину экрана
 * (`-mx-(--page-gutter)`), страница по горизонтали не прокручивается. Кольцо фокуса не
 * обрезается — у полосы внутренние поля 4 px сверху и снизу и поля страницы по бокам; Tab по
 * ссылкам сам докручивает полосу (scroll-padding — чтобы чип не прилипал к краю экрана).
 *
 *   <CategoryNav label="Категории" items={tree.map((n) => ({ href: n.href, name: n.name, count: n.productCount }))} />
 *   <CategoryNav label="Подкатегории" items={[{ href: '/catalog/antennas', name: 'Все', count: 23, current: true }, …]} />
 */
export interface CategoryNavItem {
  href: string;
  name: string;
  count: number;
  current?: boolean;
}

export function CategoryNav({
  label,
  items,
  className,
}: {
  /** Доступное имя навигации: «Категории» или «Подкатегории». */
  label: string;
  items: readonly CategoryNavItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className={className}>
      <ul className="-mx-(--page-gutter) flex scroll-px-(--page-gutter) gap-2 overflow-x-auto px-(--page-gutter) py-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:py-0">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.current ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-small whitespace-nowrap transition-colors duration-fast',
                item.current
                  ? 'border-ink bg-ink text-ink-inverse'
                  : 'border-line text-ink hover:border-line-strong',
              )}
            >
              <span>{item.name}</span>
              <span
                className={cn('tabular-nums', item.current ? 'text-ink-inverse' : 'text-ink-muted')}
              >
                {item.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
