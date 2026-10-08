import Link from 'next/link';
import type { CSSProperties } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { PRODUCT_FORMS, plural } from '@/lib/format';
import type { CategoryNode } from '@/lib/repository';

/**
 * Указатель категорий главной (DESIGN § R.6) — строгая сетка с тонкими разделителями вместо
 * карточек: типографика, количества из данных и пустое пространство, без иконок и теней.
 *
 * Верхний ряд — категории с подкатегориями (название, количество, подкатегории с количествами,
 * «Смотреть все»); нижний — остальные одной строкой ячеек, ячейка целиком — ссылка. Разделители —
 * зазор 1 px на фоне `line` (`gap-px bg-line`), поэтому ячейки нижнего ряда растягиваются без
 * пустот:
 * - < sm — одна колонка;
 * - sm — 2 колонки, нечётная последняя на всю ширину;
 * - md — 6 дорожек по 2 на ячейку (3 в ряд), неполный последний ряд растянут;
 * - lg — до 5 ячеек одним рядом.
 *
 * `data-category-tile` и `data-count` у ячейки категории верхнего уровня — для проверки
 * «сумма = всему каталогу» в e2e.
 */

/** Наибольшее число ячеек нижнего ряда, которое на ≥ lg встаёт одним рядом. */
const ONE_ROW_MAX = 5;

/** Ширина ячейки нижнего ряда по брейкпоинтам: последний неполный ряд растягивается. */
function leafSpan(index: number, count: number): string {
  const classes: string[] = [];
  if (count % 2 === 1 && index === count - 1) classes.push('sm:col-span-2');
  const rest = count % 3;
  const inLastRow = rest !== 0 && index >= count - rest;
  classes.push(!inLastRow ? 'md:col-span-2' : rest === 2 ? 'md:col-span-3' : 'md:col-span-6');
  if (count <= ONE_ROW_MAX) classes.push('lg:col-span-1');
  return classes.join(' ');
}

function Count({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('font-mono text-small text-ink-muted tabular-nums', className)}>
      {value}
      <span className="sr-only"> {plural(value, PRODUCT_FORMS)}</span>
    </span>
  );
}

export function CategoryIndex({ tree }: { tree: readonly CategoryNode[] }) {
  const groups = tree.filter((node) => node.children.length > 0);
  const leaves = tree.filter((node) => node.children.length === 0);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-line">
      {groups.length > 0 ? (
        <ul className="grid gap-px md:grid-cols-2">
          {groups.map((node) => (
            <li
              key={node.id}
              data-category-tile
              data-count={node.productCount}
              className="flex flex-col bg-surface p-5 lg:p-8"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-title font-medium">
                  <Link
                    href={node.href}
                    className="decoration-1 underline-offset-4 hover:underline"
                  >
                    {node.name}
                  </Link>
                </h3>
                <Count value={node.productCount} />
              </div>
              <ul className="mt-5 grid gap-x-8 sm:grid-cols-2">
                {node.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={child.href}
                      className="group/sub flex min-h-10 items-center justify-between gap-3 border-b border-line-subtle text-small text-ink-secondary transition-colors duration-fast hover:text-ink"
                    >
                      <span className="group-hover/sub:underline">{child.name}</span>
                      <Count value={child.productCount} className="text-caption" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={node.href}
                className="group/all mt-auto inline-flex items-center gap-2 self-start pt-6 text-small font-medium text-ink"
              >
                Смотреть все<span className="sr-only">: {node.name}</span>
                <Icon
                  name="arrow-right"
                  size={16}
                  className="transition-transform duration-fast group-hover/all:translate-x-1"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {leaves.length > 0 ? (
        <ul
          data-category-leaves
          className={cn(
            'grid grid-cols-1 gap-px sm:auto-rows-fr sm:grid-cols-2 md:grid-cols-6',
            groups.length > 0 && 'mt-px',
            leaves.length <= ONE_ROW_MAX &&
              'lg:grid-cols-[repeat(var(--leaf-columns),minmax(0,1fr))]',
          )}
          style={{ '--leaf-columns': leaves.length } as CSSProperties}
        >
          {leaves.map((node, index) => (
            <li
              key={node.id}
              data-category-tile
              data-count={node.productCount}
              className={leafSpan(index, leaves.length)}
            >
              <Link
                href={node.href}
                className="group/leaf flex h-full min-h-32 flex-col bg-surface p-5 transition-colors duration-fast hover:bg-page lg:p-6"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-body font-semibold text-ink">{node.name}</span>
                  <Count value={node.productCount} />
                </span>
                <span className="mt-auto inline-flex items-center gap-2 pt-6 text-small text-ink-secondary group-hover/leaf:text-ink">
                  Смотреть
                  <Icon
                    name="arrow-right"
                    size={16}
                    className="transition-transform duration-fast group-hover/leaf:translate-x-1"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
