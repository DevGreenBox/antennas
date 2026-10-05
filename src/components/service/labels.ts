/**
 * Подписи данных импорта для служебной страницы `/import-report` (DESIGN §2.20). Тексты решений —
 * дословно из DESIGN; остальные — в той же манере. Модуль без 'use client': его читают и серверные
 * секции, и клиентская таблица строк прайса.
 */

import type {
  IssueSeverity,
  SheetName,
  SourceBlock,
  SourceRecordKind,
  SourceResolution,
} from '@/types/catalog';

export const RESOLUTION_LABELS: Record<SourceResolution, string> = {
  created: 'Создан товар',
  'merged-duplicate': 'Повтор — объединён',
  'conflict-attached': 'Конфликт с листом 1 — сохранён',
  'excluded-header': 'Заголовок — не товар',
  'group-note-applied': 'Примечание применено к группе',
  'group-note-pending': 'Примечание не применено — область не подтверждена',
};

/** Порядок решений в фильтре: от товарных строк к служебным. */
export const RESOLUTION_ORDER: readonly SourceResolution[] = [
  'created',
  'merged-duplicate',
  'conflict-attached',
  'excluded-header',
  'group-note-applied',
  'group-note-pending',
];

export const KIND_LABELS: Record<SourceRecordKind, string> = {
  product: 'Товарная строка',
  'group-header': 'Заголовок группы',
  note: 'Примечание',
};

export const SHEET_ORDER: readonly SheetName[] = ['1', '2'];

/** Блоки в порядке книги; лист у блока один (C/D — только лист 2). */
export const BLOCK_ORDER: readonly SourceBlock[] = ['B/C', 'E/F', 'H/I', 'C/D'];

export const BLOCK_SHEET: Record<SourceBlock, SheetName> = {
  'B/C': '1',
  'E/F': '1',
  'H/I': '1',
  'C/D': '2',
};

export const SEVERITY_ORDER: readonly IssueSeverity[] = ['conflict', 'review', 'info'];

/** Заголовки секций проблем и пункты оглавления (DESIGN §2.20 п.4). */
export const SEVERITY_SECTION: Record<IssueSeverity, { title: string; anchor: string }> = {
  conflict: { title: 'Конфликты', anchor: 'issues-conflict' },
  review: { title: 'Требуют проверки', anchor: 'issues-review' },
  info: { title: 'Справочно', anchor: 'issues-info' },
};

/** Короткая подпись серьёзности — бейдж у строки прайса и у проблемы. */
export const SEVERITY_SHORT: Record<IssueSeverity, string> = {
  conflict: 'Конфликт',
  review: 'Проверка',
  info: 'Справочно',
};

export const SEVERITY_TONE = {
  conflict: 'danger',
  review: 'warning',
  info: 'info',
} as const satisfies Record<IssueSeverity, 'danger' | 'warning' | 'info'>;

/** Адрес ячейки строки прайса в нотации импорта: `1!B4`. */
export function cellRef(record: { sheet: SheetName; nameCell: string }): string {
  return `${record.sheet}!${record.nameCell}`;
}

/** id строки прайса по адресу ячейки: `1!B4` → `s1-B4` (= SourceRecord.id, якорь строки таблицы). */
export function recordIdFromCell(cell: string): string | null {
  const match = /^(\d+)!([A-Z]+\d+)$/.exec(cell);
  return match === null ? null : `s${match[1]}-${match[2]}`;
}

/** Ссылка на товар витрины, которой пользуются секции отчёта. */
export interface ProductRef {
  id: string;
  code: string;
  name: string;
  href: `/product/${string}`;
}
