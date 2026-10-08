'use client';

import { useEffect, useId, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Input';
import { cn } from '@/lib/cn';

import { LiteralText } from './LiteralText';
import { MissingProductRef, ProductRefLink } from './ReportLinks';
import { SERVICE_TABLE } from './ServiceSection';
import {
  BLOCK_ORDER,
  BLOCK_SHEET,
  KIND_LABELS,
  RESOLUTION_LABELS,
  RESOLUTION_ORDER,
  SEVERITY_SHORT,
  SEVERITY_TONE,
  SHEET_ORDER,
} from './labels';
import {
  BLOCK_PARAM,
  EMPTY_FILTERS,
  hasActiveFilters,
  matchesFilters,
  parseFilters,
  serializeFilters,
  updateFilters,
} from './source-filters';
import type { SourceFilters, SourceRow } from './source-filters';

/**
 * Таблица «Все строки прайса» (DESIGN §2.20 п.6): все записи обоих листов, фильтрация на клиенте
 * по листу, блоку, решению импорта и наличию проблем; состояние — в query (`?sheet=2&issues=yes`).
 *
 * Как устроено состояние. Страница статическая, поэтому на сервере и в рендере гидратации фильтров
 * нет — в HTML вся таблица (146 строк). Сразу после гидратации `useSyncExternalStore` читает
 * `location.search`, и таблица фильтруется без рассинхрона разметки. Изменение фильтра —
 * `history.replaceState` (Next синхронизирует его со своим роутером) и оповещение подписчиков:
 * без перезагрузки и без записи в историю на каждый выбор.
 *
 * Якоря строк. Чипы ячеек в секциях проблем ведут на `#s1-B4`. Если строка скрыта фильтром,
 * перехват клика сбрасывает фильтры синхронно (`flushSync`) до перехода по якорю — браузер
 * находит строку, прокручивает к ней и подсвечивает её через `:target`.
 */

const searchListeners = new Set<() => void>();

function subscribeToSearch(onChange: () => void) {
  searchListeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    searchListeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

const readSearch = () => window.location.search;
const serverSearch = () => '';

function writeFilters(filters: SourceFilters, { keepHash }: { keepHash: boolean }) {
  const query = serializeFilters(filters);
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${keepHash ? window.location.hash : ''}`;
  window.history.replaceState(null, '', url);
  searchListeners.forEach((listener) => listener());
}

export function SourceRecordsTable({ rows }: { rows: readonly SourceRow[] }) {
  const search = useSyncExternalStore(subscribeToSearch, readSearch, serverSearch);
  const filters = useMemo(() => parseFilters(search), [search]);
  const visible = useMemo(
    () => rows.filter((row) => matchesFilters(row, filters)),
    [rows, filters],
  );
  const visibleProducts = visible.filter((row) => row.kind === 'product').length;
  const active = hasActiveFilters(filters);
  const counterId = useId();

  const counts = useMemo(() => {
    const count = (predicate: (row: SourceRow) => boolean) => rows.filter(predicate).length;
    return {
      sheet: Object.fromEntries(SHEET_ORDER.map((s) => [s, count((r) => r.sheet === s)])),
      block: Object.fromEntries(BLOCK_ORDER.map((b) => [b, count((r) => r.block === b)])),
      decision: Object.fromEntries(
        RESOLUTION_ORDER.map((d) => [d, count((r) => r.resolution === d)]),
      ),
      withIssues: count((r) => r.issues.length > 0),
    };
  }, [rows]);

  const setFilter = <K extends keyof SourceFilters>(key: K, value: SourceFilters[K]) =>
    writeFilters(updateFilters(filters, key, value), { keepHash: false });

  // Якорь на скрытую фильтром строку: сбросить фильтры до перехода (см. шапку файла).
  useEffect(() => {
    const ids = new Set(rows.map((row) => row.id));
    const isHiddenRow = (id: string) => ids.has(id) && document.getElementById(id) === null;

    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]');
      if (!link) return;
      const id = decodeURIComponent(link.getAttribute('href')!.slice(1));
      if (!isHiddenRow(id)) return;
      flushSync(() => writeFilters(EMPTY_FILTERS, { keepHash: true }));
    };
    // Адрес с якорем открыт вручную или вперемешку с фильтрами (`?sheet=2#s1-B4`).
    const revealFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!isHiddenRow(id)) return;
      flushSync(() => writeFilters(EMPTY_FILTERS, { keepHash: true }));
      document.getElementById(id)?.scrollIntoView({ block: 'center' });
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', revealFromHash);
    const frame = window.requestAnimationFrame(revealFromHash);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('hashchange', revealFromHash);
      window.cancelAnimationFrame(frame);
    };
  }, [rows]);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Лист">
          <Select
            size="md"
            value={filters.sheet ?? ''}
            aria-controls="source-records"
            onChange={(event) =>
              setFilter('sheet', (event.target.value || null) as SourceFilters['sheet'])
            }
          >
            <option value="">Оба листа ({rows.length})</option>
            {SHEET_ORDER.map((sheet) => (
              <option key={sheet} value={sheet}>
                Лист {sheet} ({counts.sheet[sheet]})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Блок">
          <Select
            size="md"
            value={filters.block ? BLOCK_PARAM[filters.block] : ''}
            aria-controls="source-records"
            onChange={(event) =>
              setFilter(
                'block',
                BLOCK_ORDER.find((block) => BLOCK_PARAM[block] === event.target.value) ?? null,
              )
            }
          >
            <option value="">Все блоки</option>
            {BLOCK_ORDER.map((block) => (
              <option key={block} value={BLOCK_PARAM[block]}>
                {block}, лист {BLOCK_SHEET[block]} ({counts.block[block]})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Решение импорта">
          <Select
            size="md"
            value={filters.decision ?? ''}
            aria-controls="source-records"
            onChange={(event) =>
              setFilter(
                'decision',
                RESOLUTION_ORDER.find((value) => value === event.target.value) ?? null,
              )
            }
          >
            <option value="">Все решения</option>
            {RESOLUTION_ORDER.map((value) => (
              <option key={value} value={value}>
                {RESOLUTION_LABELS[value]} ({counts.decision[value]})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Проблемы">
          <Select
            size="md"
            value={filters.issues ?? ''}
            aria-controls="source-records"
            onChange={(event) =>
              setFilter(
                'issues',
                event.target.value === 'yes' || event.target.value === 'no'
                  ? event.target.value
                  : null,
              )
            }
          >
            <option value="">Все строки</option>
            <option value="yes">Есть проблемы ({counts.withIssues})</option>
            <option value="no">Без проблем ({rows.length - counts.withIssues})</option>
          </Select>
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p
            id={counterId}
            role="status"
            aria-atomic="true"
            className="text-small text-ink"
            data-testid="source-counter"
          >
            Показано строк: <span className="font-semibold tabular-nums">{visible.length}</span> из{' '}
            {rows.length}
            <span className="text-ink-secondary">
              {' '}
              · товарных: <span className="tabular-nums">{visibleProducts}</span>
            </span>
          </p>
          {active ? (
            <Button
              variant="link"
              size="sm"
              onClick={() => writeFilters(EMPTY_FILTERS, { keepHash: false })}
            >
              Сбросить
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-ink-muted">
          <LiteralText text=" " className="text-small" /> — пробел в ячейке прайса: в начале, в
          конце или двойной
        </p>
      </div>

      <div
        role="region"
        aria-labelledby="source-records-caption"
        tabIndex={0}
        className={cn('focus-inset mt-3', SERVICE_TABLE.frame)}
      >
        <table
          id="source-records"
          className="w-full min-w-[64rem] text-small"
          aria-describedby={counterId}
        >
          <caption id="source-records-caption" className="sr-only">
            Все строки прайса: лист, ячейка, исходный текст и цена буквально, решение импорта
          </caption>
          <thead className={SERVICE_TABLE.head}>
            <tr className={SERVICE_TABLE.headRow}>
              <Th className="w-14">Лист</Th>
              <Th className="w-20">Ячейка</Th>
              <Th className="w-36">Тип строки</Th>
              <Th>Исходный текст</Th>
              <Th className="w-28">Цена в прайсе</Th>
              <Th className="w-40">Решение импорта</Th>
              <Th className="w-56">Товар</Th>
              <Th className="w-28">Проблемы</Th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-ink-secondary">
                  Нет строк с такими условиями. Измените или сбросьте фильтры.
                </td>
              </tr>
            ) : (
              visible.map((row) => <SourceRowView key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <th scope="col" className={cn(SERVICE_TABLE.th, 'whitespace-nowrap', className)}>
      {children}
    </th>
  );
}

function SourceRowView({ row }: { row: SourceRow }) {
  const isHeader = row.kind !== 'product';
  return (
    <tr
      id={row.id}
      data-kind={row.kind}
      data-sheet={row.sheet}
      className={cn(
        'scroll-mt-4 target:bg-brand-subtle',
        SERVICE_TABLE.row,
        isHeader ? 'bg-surface-subtle' : 'hover:bg-surface-muted',
      )}
    >
      <td className="px-3 py-3 tabular-nums text-ink-secondary">{row.sheet}</td>
      <td className="px-3 py-3">
        <span className="font-mono text-ink">{row.nameCell}</span>
        <span className="block text-caption text-ink-muted">{row.block}</span>
      </td>
      <td className={cn('px-3 py-3', isHeader ? 'font-medium text-ink' : 'text-ink-secondary')}>
        {KIND_LABELS[row.kind]}
      </td>
      <td className="px-3 py-3 text-ink">
        <LiteralText text={row.rawText} />
      </td>
      <td className="px-3 py-3 text-ink">
        <LiteralText text={row.rawPrice} />
        <span className="block font-mono text-caption text-ink-muted">{row.priceCell}</span>
      </td>
      <td className="px-3 py-3 text-ink">{RESOLUTION_LABELS[row.resolution]}</td>
      <td className="px-3 py-3">
        {row.product ? (
          <ProductRefLink product={row.product} />
        ) : row.hiddenProductId ? (
          <MissingProductRef id={row.hiddenProductId} />
        ) : (
          <span className="text-ink-muted">
            <span aria-hidden>—</span>
            <span className="sr-only">нет</span>
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        {row.issues.length === 0 ? (
          <span className="text-ink-muted">
            <span aria-hidden>—</span>
            <span className="sr-only">нет</span>
          </span>
        ) : (
          <ul className="flex flex-col items-start gap-1">
            {row.issues.map((issue) => (
              <li key={issue.id}>
                <a href={`#issue-${issue.id}`} className="rounded-sm" title={issue.title}>
                  <Badge tone={SEVERITY_TONE[issue.severity]} className="hover:underline">
                    {SEVERITY_SHORT[issue.severity]}
                  </Badge>
                  <span className="sr-only">: {issue.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}
