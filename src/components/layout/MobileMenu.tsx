'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { Drawer } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';
import { PRODUCT_FORMS, plural } from '@/lib/format';

/**
 * Мобильное меню (< lg, DESIGN §5.9.1, вид — § R.5): Drawer слева «Меню». Каталог — все категории
 * с количествами, подкатегории вложены веткой дерева и всегда раскрыты; «Покупателям»; Telegram;
 * «Документы». Заголовки групп — `eyebrow`, строки — не ниже 44 px с тонкими разделителями, без
 * декоративных значков (остался только знак внешней ссылки у Telegram). Переход по ссылке
 * закрывает меню.
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
        <div onClick={closeOnLink} className="flex flex-col gap-8 pt-5 pb-8">
          <nav aria-labelledby="mobile-menu-catalog">
            <h3 id="mobile-menu-catalog" className="eyebrow mb-2">
              Каталог
            </h3>
            <ul className="border-t border-line-subtle">
              <li className="border-b border-line-subtle">
                <MenuRow href="/catalog" pathname={pathname} count={totalCount} level="top">
                  Весь каталог
                </MenuRow>
              </li>
              {categories.map((category) => (
                <li key={category.id} className="border-b border-line-subtle">
                  <MenuRow
                    href={category.href}
                    pathname={pathname}
                    count={category.productCount}
                    level="top"
                  >
                    {category.name}
                  </MenuRow>
                  {category.children.length > 0 ? (
                    // Подкатегории — ветка дерева: отступ и вертикальная линия слева.
                    <ul className="mb-2 ml-1 border-l border-line">
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <MenuRow
                            href={child.href}
                            pathname={pathname}
                            count={child.productCount}
                            level="child"
                          >
                            {child.name}
                          </MenuRow>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="mobile-menu-customer">
            <h3 id="mobile-menu-customer" className="eyebrow mb-2">
              Покупателям
            </h3>
            <ul className="border-t border-line-subtle">
              {site.nav.customer.map((link) => (
                <li key={link.href} className="border-b border-line-subtle">
                  <MenuRow href={link.href} pathname={pathname} level="top">
                    {link.label}
                  </MenuRow>
                </li>
              ))}
              <li className="border-b border-line-subtle">
                <a
                  href={site.contacts.telegram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(ROW, ROW_INSET)}
                >
                  <span className="text-body text-ink">Telegram</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-small text-ink-secondary">
                    {site.contacts.telegram.handle}
                    <Icon name="external-link" size={16} className="text-ink-muted" />
                  </span>
                  <span className="sr-only"> (откроется в новой вкладке)</span>
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="mobile-menu-legal">
            <h3 id="mobile-menu-legal" className="eyebrow mb-2">
              Документы
            </h3>
            <ul className="border-t border-line-subtle">
              {site.nav.legal.map((link) => (
                <li key={link.href} className="border-b border-line-subtle">
                  <MenuRow href={link.href} pathname={pathname} level="secondary">
                    {link.label}
                  </MenuRow>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Drawer>
    </div>
  );
}

/** Строка меню: цель нажатия не ниже 44 px (DESIGN § R.9), длинные названия переносятся. */
const ROW =
  'focus-inset flex min-h-11 items-center justify-between gap-3 rounded-sm py-2 transition-colors duration-fast hover:bg-surface-muted';

/** Поля строки: подложка наведения выходит за край текста на 8 px; подкатегория — от линии ветки. */
const ROW_INSET = '-mx-2 px-2';
const ROW_INSET_CHILD = '-mr-2 pr-2 pl-4';

/**
 * Пункт меню со счётчиком справа. Текущая страница — `ink`, полужирно и подчёркнуто (как в меню
 * «Каталог» шапки): выбранное состояние в системе — графит, не цвет.
 *
 * - top — категория верхнего уровня, «Весь каталог», «Покупателям»: 16 px;
 * - child — подкатегория: 14 px, вторичный цвет, отступ от линии ветки;
 * - secondary — документы: 14 px, вторичный цвет.
 */
function MenuRow({
  href,
  pathname,
  count,
  level,
  children,
}: {
  href: string;
  pathname: string;
  count?: number;
  level: 'top' | 'child' | 'secondary';
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={pathname === href ? 'page' : undefined}
      className={cn(
        'group/row',
        ROW,
        level === 'child' ? ROW_INSET_CHILD : ROW_INSET,
        level === 'top' ? 'text-body text-ink' : 'text-small text-ink-secondary hover:text-ink',
        'aria-[current=page]:text-ink',
      )}
    >
      {/* Подчёркивание текущей страницы — только у названия, не у счётчика. */}
      <span className="min-w-0 group-aria-[current=page]/row:font-semibold group-aria-[current=page]/row:underline group-aria-[current=page]/row:underline-offset-4">
        {children}
      </span>
      {count === undefined ? null : (
        <span className="shrink-0 font-mono text-small font-normal text-ink-muted tabular-nums">
          {count}
          <span className="sr-only"> {plural(count, PRODUCT_FORMS)}</span>
        </span>
      )}
    </Link>
  );
}
