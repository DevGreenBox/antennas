import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { JsonLd } from '@/components/ui/JsonLd';
import { cn } from '@/lib/cn';
import { breadcrumbListJsonLd } from '@/lib/seo';

/**
 * Навигационная цепочка (DESIGN §5.9.15). Последний пункт — текущая страница (без href).
 * На < md — только ссылка на родителя «‹ Родитель». JSON-LD BreadcrumbList — всегда полностью.
 *
 *   <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Каталог', href: '/catalog' },
 *     { label: category.name }]} />
 */
export interface BreadcrumbItem {
  label: string;
  /** Нет у текущей страницы (последний пункт). */
  href?: string;
}

export function Breadcrumbs({
  items,
  jsonLd = true,
  className,
}: {
  items: readonly BreadcrumbItem[];
  /** Выводить JSON-LD (по умолчанию да). */
  jsonLd?: boolean;
  className?: string;
}) {
  if (items.length === 0) return null;
  const parent = [...items.slice(0, -1)].reverse().find((item) => item.href);
  return (
    <>
      <nav aria-label="Навигационная цепочка" className={cn('mb-4', className)}>
        <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-secondary md:flex">
          {items.map((item, index) => {
            const last = index === items.length - 1;
            return (
              <li key={`${item.label}-${index}`} className="flex items-center gap-x-2">
                {last || !item.href ? (
                  <span
                    aria-current={last ? 'page' : undefined}
                    className={last ? 'text-ink' : undefined}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href} className="hover:text-ink hover:underline">
                    {item.label}
                  </Link>
                )}
                {last ? null : (
                  <span aria-hidden className="text-ink-muted">
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {parent?.href ? (
          <Link
            href={parent.href}
            className="inline-flex min-h-6 items-center gap-1 text-small text-ink-secondary hover:text-ink hover:underline md:hidden"
          >
            <Icon name="chevron-left" size={16} />
            {parent.label}
          </Link>
        ) : null}
      </nav>
      {jsonLd ? (
        <JsonLd
          data={breadcrumbListJsonLd(items.map((item) => ({ name: item.label, href: item.href })))}
        />
      ) : null}
    </>
  );
}
