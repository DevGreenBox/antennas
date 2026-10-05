'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

/**
 * Вторая строка шапки (≥ lg): категории верхнего уровня (DESIGN §5.9.1). Текущая — по пути
 * `/catalog/{slug}`: точный адрес — `aria-current="page"`, вложенный — `aria-current="true"`,
 * полоса 2 px снизу. На странице товара не подсвечивается (шапка не знает его категорию).
 */
export interface HeaderNavCategory {
  id: string;
  href: string;
  label: string;
}

export function HeaderCategoryNav({ categories }: { categories: readonly HeaderNavCategory[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Категории каталога" className="min-w-0">
      <ul className="flex items-center gap-5">
        {categories.map((category) => {
          const exact = pathname === category.href;
          const within = exact || pathname.startsWith(`${category.href}/`);
          return (
            <li key={category.id}>
              <Link
                href={category.href}
                aria-current={exact ? 'page' : within ? 'true' : undefined}
                className={cn(
                  'relative flex h-10 items-center font-medium whitespace-nowrap transition-colors duration-fast',
                  within
                    ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink'
                    : 'text-ink-secondary hover:text-ink',
                )}
              >
                {category.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
