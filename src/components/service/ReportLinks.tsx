import Link from 'next/link';

import { cn } from '@/lib/cn';
import { formatCellAddress } from '@/lib/format';

import { recordIdFromCell } from './labels';
import type { ProductRef } from './labels';

/**
 * Ссылки внутри отчёта импорта: чип ячейки прайса (`1!B4` → якорь строки в таблице «Все строки
 * прайса», DESIGN §2.20 п.5) и ссылка на товар витрины (код + название).
 */

export function CellChip({ cell, className }: { cell: string; className?: string }) {
  const recordId = recordIdFromCell(cell);
  const classes = cn(
    'inline-flex h-6 items-center rounded-sm border border-line-strong bg-surface px-2 font-mono text-caption text-ink',
    className,
  );
  if (recordId === null) return <span className={classes}>{cell}</span>;
  return (
    <a
      href={`#${recordId}`}
      aria-label={`Строка прайса: ${formatCellAddress(cell)}`}
      className={cn(classes, 'hover:bg-surface-muted')}
    >
      {cell}
    </a>
  );
}

export function CellChips({ cells, className }: { cells: readonly string[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {cells.map((cell) => (
        <li key={cell}>
          <CellChip cell={cell} />
        </li>
      ))}
    </ul>
  );
}

/** Товар витрины: код моноширинно, название — ссылка. */
export function ProductRefLink({
  product,
  className,
}: {
  product: ProductRef;
  className?: string;
}) {
  return (
    <span className={cn('inline', className)}>
      <span className="mr-1.5 font-mono text-caption text-ink-muted">{product.code}</span>
      <Link href={product.href} className="text-link">
        {product.name}
      </Link>
    </span>
  );
}

/** Ссылка на товар, которого нет в витрине (скрыт в overrides.json): только id, без перехода. */
export function MissingProductRef({ id }: { id: string }) {
  return (
    <span className="text-ink-muted">
      <span className="font-mono">{id}</span> — скрыт из витрины
    </span>
  );
}
