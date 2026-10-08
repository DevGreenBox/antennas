'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';
import { PRODUCT_FORMS, countLabel, plural } from '@/lib/format';

import type { MenuCategory } from './MobileMenu';

/**
 * Меню «Каталог» в шапке (≥ lg, DESIGN § R.5). Категории не занимают отдельную строку
 * постоянно: кнопка раскрывает панель под шапкой — дерево категорий с количествами из данных.
 *
 * Раскрытие (disclosure), а не модальное окно: кнопка с `aria-expanded`/`aria-controls`, панель —
 * ориентир `nav` «Категории каталога» сразу после кнопки в порядке Tab. Закрывается повторным
 * нажатием, Esc (фокус возвращается на кнопку), щелчком вне меню, уходом фокуса из меню и
 * переходом на другую страницу.
 *
 * Раскладка панели — по данным: каждая категория с подкатегориями — своя колонка (название,
 * количество, подкатегории), категории без подкатегорий — списком в последней колонке.
 */
export function CatalogMenu({
  categories,
  totalCount,
  className,
}: {
  categories: readonly MenuCategory[];
  totalCount: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState(pathname);
  if (open && pathname !== openedAt) {
    setOpen(false);
  }
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const groups = categories.filter((category) => category.children.length > 0);
  const leaves = categories.filter((category) => category.children.length === 0);

  return (
    <div
      ref={rootRef}
      className={className}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpenedAt(pathname);
          setOpen((value) => !value);
        }}
        className={cn(
          'inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border px-3.5 text-small font-medium transition-colors duration-fast',
          open
            ? 'border-ink bg-ink text-ink-inverse'
            : 'border-line-emphasis bg-surface text-ink hover:border-ink-muted',
        )}
      >
        <Icon name={open ? 'x' : 'menu'} size={18} />
        Каталог
      </button>

      <nav
        id={panelId}
        aria-label="Категории каталога"
        hidden={!open}
        className="absolute inset-x-0 top-full z-popover border-y border-line bg-surface shadow-popover"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        <div className="page-container grid grid-cols-3 gap-x-10 py-8 xl:gap-x-16">
          {groups.map((group) => (
            <div key={group.id} className="min-w-0">
              <MenuLink href={group.href} name={group.name} count={group.productCount} top />
              <ul className="mt-2">
                {group.children.map((child) => (
                  <li key={child.id}>
                    <MenuLink href={child.href} name={child.name} count={child.productCount} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {leaves.length > 0 ? (
            <ul className="min-w-0">
              {leaves.map((leaf) => (
                <li key={leaf.id}>
                  <MenuLink href={leaf.href} name={leaf.name} count={leaf.productCount} top />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="border-t border-line-subtle">
          <div className="page-container flex h-12 items-center justify-between gap-6 text-small">
            <Link
              href="/catalog"
              className="group/all inline-flex items-center gap-2 font-medium text-ink"
            >
              Весь каталог
              <span className="text-ink-muted tabular-nums">
                {countLabel(totalCount, PRODUCT_FORMS)}
              </span>
              <Icon
                name="arrow-right"
                size={16}
                className="transition-transform duration-fast group-hover/all:translate-x-0.5"
              />
            </Link>
            <ul className="flex items-center gap-6">
              {site.nav.service.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-ink-secondary hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>
    </div>
  );
}

/** Строка меню: название слева, количество справа; у категории верхнего уровня — крупнее. */
function MenuLink({
  href,
  name,
  count,
  top = false,
}: {
  href: string;
  name: string;
  count: number;
  top?: boolean;
}) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      aria-current={pathname === href ? 'page' : undefined}
      className={cn(
        'group/item -mx-2 flex min-h-9 items-baseline justify-between gap-4 rounded-sm px-2 py-1.5 transition-colors duration-fast hover:bg-surface-muted',
        top ? 'text-body font-semibold text-ink' : 'text-small text-ink-secondary hover:text-ink',
        'aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:underline-offset-4',
      )}
    >
      <span className="min-w-0">{name}</span>
      <span className="shrink-0 text-small font-normal text-ink-muted tabular-nums">
        {count}
        <span className="sr-only"> {plural(count, PRODUCT_FORMS)}</span>
      </span>
    </Link>
  );
}
