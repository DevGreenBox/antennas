import Link from 'next/link';
import type { CSSProperties } from 'react';

import { CategoryGlyph } from '@/components/ui/CategoryGlyph';
import { cn } from '@/lib/cn';
import { PRODUCT_FORMS, countLabel, plural } from '@/lib/format';
import type { CategoryNode } from '@/lib/repository';

/**
 * Плитки категорий главной (DESIGN §2.2 п.2, §5.9.24). Количества — из репозитория по поддереву
 * (вручную не вписываются, §1.2).
 *
 * Верхний ряд — категории с подкатегориями крупными плитками (название, количество, список
 * подкатегорий); нижний — остальные в порядке прайса, плитка целиком — одна ссылка. На < sm малая
 * плитка — строка «знак · название · количество».
 *
 * Малые плитки — сетка без дыр и с равной высотой рядов (`sm:auto-rows-fr`, количество прижато к
 * низу `mt-auto`, поэтому стоит на одной линии во всех плитках):
 * - sm — 2 колонки, нечётная последняя на всю ширину;
 * - md — 6 дорожек по 2 на плитку (3 в ряд), неполный последний ряд растянут: 2 плитки по 3
 *   дорожки, одна — на все 6;
 * - lg — до 5 плиток одним рядом (сейчас их 5: 3 + 2 с пустой ячейкой на 1024 больше нет); больше
 *   5 — остаётся раскладка md.
 *
 * `data-count` у плитки верхнего уровня — для проверки «сумма = всему каталогу» в e2e.
 */

/** Наибольшее число малых плиток, которое на ≥ lg встаёт одним рядом. */
const ONE_ROW_MAX = 5;

/** Ширина малой плитки по брейкпоинтам: последний неполный ряд растягивается, дыр нет. */
function smallTileSpan(index: number, count: number): string {
  const classes: string[] = [];
  if (count % 2 === 1 && index === count - 1) classes.push('sm:col-span-2');
  const rest = count % 3;
  const inLastRow = rest !== 0 && index >= count - rest;
  classes.push(!inLastRow ? 'md:col-span-2' : rest === 2 ? 'md:col-span-3' : 'md:col-span-6');
  if (count <= ONE_ROW_MAX) classes.push('lg:col-span-1');
  return classes.join(' ');
}

export function CategoryTiles({ tree }: { tree: readonly CategoryNode[] }) {
  const large = tree.filter((node) => node.children.length > 0);
  const small = tree.filter((node) => node.children.length === 0);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {large.length > 0 ? (
        <ul className="grid gap-4 md:grid-cols-2 lg:gap-6">
          {large.map((node) => (
            <li
              key={node.id}
              data-category-tile
              data-count={node.productCount}
              className="rounded-md border border-line bg-surface p-5"
            >
              <CategoryGlyph categoryId={node.id} size={40} className="text-ink-muted" />
              <h3 className="mt-3">
                <Link href={node.href} className="text-title font-semibold hover:underline">
                  {node.name}
                </Link>
              </h3>
              <p className="text-small text-ink-muted">
                {countLabel(node.productCount, PRODUCT_FORMS)}
              </p>
              <ul className="mt-3 grid gap-x-6 gap-y-1 text-small sm:grid-cols-2">
                {node.children.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={child.href}
                      className="group/sub flex min-h-8 items-center justify-between gap-3 border-b border-line-subtle text-ink"
                    >
                      <span className="group-hover/sub:underline">{child.name}</span>
                      <span className="text-ink-muted tabular-nums">
                        {child.productCount}
                        <span className="sr-only">
                          {' '}
                          {plural(child.productCount, PRODUCT_FORMS)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {small.length > 0 ? (
        <ul
          className={cn(
            'grid grid-cols-1 gap-4 sm:auto-rows-fr sm:grid-cols-2 md:grid-cols-6 lg:gap-6',
            small.length <= ONE_ROW_MAX &&
              'lg:grid-cols-[repeat(var(--tile-columns),minmax(0,1fr))]',
          )}
          style={{ '--tile-columns': small.length } as CSSProperties}
        >
          {small.map((node, index) => (
            <li
              key={node.id}
              data-category-tile
              data-count={node.productCount}
              className={smallTileSpan(index, small.length)}
            >
              <Link
                href={node.href}
                className="group/tile flex h-full items-center gap-3 rounded-md border border-line bg-surface p-4 transition-colors duration-fast hover:border-line-strong sm:flex-col sm:items-start sm:p-5"
              >
                <CategoryGlyph
                  categoryId={node.id}
                  size={40}
                  className="size-8 text-ink-muted sm:size-10"
                />
                <span className="min-w-0 flex-1 text-body font-semibold text-ink group-hover/tile:underline">
                  {node.name}
                </span>
                <span className="shrink-0 text-small text-ink-muted sm:mt-auto">
                  {countLabel(node.productCount, PRODUCT_FORMS)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
