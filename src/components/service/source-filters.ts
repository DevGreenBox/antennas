/**
 * Фильтры таблицы «Все строки прайса» на `/import-report` и их запись в URL (DESIGN §0 п.5 —
 * URL источник истины). Чистые функции: разбор и сборка query, проверка строки.
 *
 * Параметры: `sheet` = 1 | 2, `block` = bc | ef | hi | cd, `decision` = значение
 * `SourceResolution`, `issues` = yes | no. Неизвестные значения молча отбрасываются — ссылка
 * со старым или испорченным параметром показывает все строки, а не пустую таблицу.
 */

import type {
  IssueSeverity,
  SheetName,
  SourceBlock,
  SourceRecordKind,
  SourceResolution,
} from '@/types/catalog';

import { BLOCK_ORDER, BLOCK_SHEET, RESOLUTION_ORDER } from './labels';
import type { ProductRef } from './labels';

/** Строка прайса в том виде, в каком её получает клиентская таблица (без разбора `parsed`). */
export interface SourceRow {
  id: string;
  sheet: SheetName;
  block: SourceBlock;
  /** `1!B4` */
  cell: string;
  nameCell: string;
  priceCell: string;
  rawText: string;
  rawPrice: string;
  kind: SourceRecordKind;
  resolution: SourceResolution;
  product: ProductRef | null;
  /** Товар есть в данных, но скрыт из витрины (overrides.json). */
  hiddenProductId: string | null;
  issues: { id: string; severity: IssueSeverity; title: string }[];
}

export type IssuesFilter = 'yes' | 'no';

export interface SourceFilters {
  sheet: SheetName | null;
  block: SourceBlock | null;
  decision: SourceResolution | null;
  issues: IssuesFilter | null;
}

export const EMPTY_FILTERS: SourceFilters = {
  sheet: null,
  block: null,
  decision: null,
  issues: null,
};

/** `B/C` ↔ `bc`: косая черта в адресе кодировалась бы как %2F. */
export const BLOCK_PARAM: Record<SourceBlock, string> = {
  'B/C': 'bc',
  'E/F': 'ef',
  'H/I': 'hi',
  'C/D': 'cd',
};

const blockFromParam = (value: string | null): SourceBlock | null =>
  BLOCK_ORDER.find((block) => BLOCK_PARAM[block] === value) ?? null;

export function parseFilters(search: string): SourceFilters {
  const params = new URLSearchParams(search);
  const sheet = params.get('sheet');
  const decision = params.get('decision');
  const issues = params.get('issues');
  return {
    sheet: sheet === '1' || sheet === '2' ? sheet : null,
    block: blockFromParam(params.get('block')),
    decision: RESOLUTION_ORDER.find((value) => value === decision) ?? null,
    issues: issues === 'yes' || issues === 'no' ? issues : null,
  };
}

/** query без «?»; пустые фильтры не пишутся. Порядок параметров постоянный. */
export function serializeFilters(filters: SourceFilters): string {
  const params = new URLSearchParams();
  if (filters.sheet) params.set('sheet', filters.sheet);
  if (filters.block) params.set('block', BLOCK_PARAM[filters.block]);
  if (filters.decision) params.set('decision', filters.decision);
  if (filters.issues) params.set('issues', filters.issues);
  return params.toString();
}

export function hasActiveFilters(filters: SourceFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
}

/**
 * Новое состояние после выбора одного фильтра. Лист и блок согласуются: блок C/D есть только на
 * листе 2, поэтому выбор листа 1 сбрасывает его, а выбор блока сбрасывает чужой лист — иначе
 * таблица молча опустела бы.
 */
export function updateFilters<K extends keyof SourceFilters>(
  filters: SourceFilters,
  key: K,
  value: SourceFilters[K],
): SourceFilters {
  const next: SourceFilters = { ...filters, [key]: value };
  if (key === 'sheet' && next.sheet && next.block && BLOCK_SHEET[next.block] !== next.sheet) {
    next.block = null;
  }
  if (key === 'block' && next.block && next.sheet && BLOCK_SHEET[next.block] !== next.sheet) {
    next.sheet = null;
  }
  return next;
}

export function matchesFilters(row: SourceRow, filters: SourceFilters): boolean {
  if (filters.sheet && row.sheet !== filters.sheet) return false;
  if (filters.block && row.block !== filters.block) return false;
  if (filters.decision && row.resolution !== filters.decision) return false;
  if (filters.issues === 'yes' && row.issues.length === 0) return false;
  if (filters.issues === 'no' && row.issues.length > 0) return false;
  return true;
}
