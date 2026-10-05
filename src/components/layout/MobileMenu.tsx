'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { MouseEvent } from 'react';

import { Drawer } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Мобильное меню (< lg, DESIGN §5.9.1): Drawer слева «Меню». Каталог — все категории с
 * количествами, подкатегории вложены и всегда раскрыты; «Покупателям»; Telegram; «Документы».
 * Переход по ссылке закрывает меню.
 */
export interface MenuCategory {
  id: string;
  href: string;
  name: string;
  productCount: number;
  children: MenuCategory[];
}

export function MobileMenu({
  categories,
  totalCount,
  className,
}: {
  categories: readonly MenuCategory[];
  /** Всего товаров — строка «Весь каталог». */
  totalCount: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState(pathname);
  // Переход на другую страницу (в т. ч. «Назад») закрывает меню.
  if (open && pathname !== openedAt) {
    setOpen(false);
  }

  const closeOnLink = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };

  const rowClass = (href: string) =>
    cn(
      'flex min-h-11 items-center justify-between gap-3 rounded-sm px-2 -mx-2 hover:bg-surface-muted',
      pathname === href ? 'font-medium text-ink' : 'text-ink',
    );

  return (
    <div className={className}>
      <IconButton
        icon="menu"
        label="Открыть меню"
        size="header"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpenedAt(pathname);
          setOpen(true);
        }}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="left"
        title="Меню"
        closeLabel="Закрыть меню"
        widthClassName="w-[min(22rem,calc(100vw-2.5rem))]"
      >
        {/* Делегирование клика: любая ссылка внутри закрывает меню. */}
        <div onClick={closeOnLink} className="flex flex-col gap-6 py-4">
          <nav aria-labelledby="mobile-menu-catalog">
            <h3 id="mobile-menu-catalog" className="mb-1 text-small font-semibold text-ink-muted">
              Каталог
            </h3>
            <ul className="text-body">
              <li>
                <Link
                  href="/catalog"
                  aria-current={pathname === '/catalog' ? 'page' : undefined}
                  className={rowClass('/catalog')}
                >
                  <span>Весь каталог</span>
                  <span className="text-small text-ink-muted tabular-nums">{totalCount}</span>
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={category.href}
                    aria-current={pathname === category.href ? 'page' : undefined}
                    className={rowClass(category.href)}
                  >
                    <span>{category.name}</span>
                    <span className="text-small text-ink-muted tabular-nums">
                      {category.productCount}
                    </span>
                  </Link>
                  {category.children.length > 0 ? (
                    <ul className="pl-4 text-small">
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={child.href}
                            aria-current={pathname === child.href ? 'page' : undefined}
                            className={rowClass(child.href)}
                          >
                            <span>{child.name}</span>
                            <span className="text-ink-muted tabular-nums">
                              {child.productCount}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="mobile-menu-customer" className="border-t border-line-subtle pt-4">
            <h3 id="mobile-menu-customer" className="mb-1 text-small font-semibold text-ink-muted">
              Покупателям
            </h3>
            <ul className="text-body">
              {site.nav.customer.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={pathname === link.href ? 'page' : undefined}
                    className={rowClass(link.href)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={site.contacts.telegram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={rowClass(site.contacts.telegram.url)}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name="send" size={20} className="text-ink-muted" />
                    Telegram {site.contacts.telegram.handle}
                  </span>
                  <Icon name="external-link" size={16} className="text-ink-muted" />
                  <span className="sr-only"> (откроется в новой вкладке)</span>
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="mobile-menu-legal" className="border-t border-line-subtle pt-4">
            <h3 id="mobile-menu-legal" className="mb-1 text-small font-semibold text-ink-muted">
              Документы
            </h3>
            <ul className="text-small">
              {site.nav.legal.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={rowClass(link.href)}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Drawer>
    </div>
  );
}
