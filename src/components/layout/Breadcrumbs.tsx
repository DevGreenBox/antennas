import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { JsonLd } from '@/components/ui/JsonLd';
import { cn } from '@/lib/cn';
import { breadcrumbListJsonLd } from '@/lib/seo';

/**
 * Навигационная цепочка (DESIGN §5.9.15). Последний пункт — текущая страница (без href).
 * На < md — только ссылка на родителя «‹ Родитель» (цель нажатия 44 px). JSON-LD
 * BreadcrumbList — всегда полностью.
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
        {/*
          На md–lg (сенсорные планшеты) ссылки — 44 px в высоту (§ R.9), а лишние 24 px убраны
          отрицательными полями списка: строка цепочки стоит на прежнем месте.
        */}
        <ol className="hidden flex-wrap items-center gap-x-2 text-small text-ink-secondary md:-my-3 md:flex lg:my-0 lg:gap-y-1">
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
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center hover:text-ink hover:underline lg:min-h-0"
                  >
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
            // Цель нажатия 44 px (§ R.9) при прежнем шаге строки 24 px: лишняя высота — в
            // отрицательных полях.
            className="-my-2.5 inline-flex min-h-11 items-center gap-1 text-small text-ink-secondary hover:text-ink hover:underline md:hidden"
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
