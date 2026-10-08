'use client';

import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Dialog';
import type { CatalogState, QueryResult } from '@/lib/catalog';
import { PRODUCT_FORMS, countLabel } from '@/lib/format';

import { FilterPanel } from './FilterPanel';

/**
 * FilterDrawer (DESIGN §4.5, §5.9.18) — подбор на < lg. Правки меняют только черновик
 * (`result` — выдача по черновику), кнопка «Показать N» применяет его; крестик, Esc и подложка
 * черновик отбрасывают. «Сбросить» чистит черновик, Drawer не закрывается. При закрытии фокус
 * возвращается на кнопку «Параметры» (Drawer возвращает его на триггер).
 *
 * Подвал Drawer не прокручивается вместе с группами — «Показать N» всегда под рукой; кнопки 44 px
 * (цель нажатия, § R.9).
 */
export function FilterDrawer({
  open,
  onClose,
  result,
  onChange,
  onReset,
  onApply,
  frequencyReviewValues,
}: {
  open: boolean;
  onClose: () => void;
  /** Выдача по черновику: фасеты, счётчики и число для «Показать N». */
  result: QueryResult | null;
  onChange: (next: CatalogState) => void;
  onReset: () => void;
  onApply: () => void;
  frequencyReviewValues: readonly string[];
}) {
  const total = result?.total ?? 0;
  const preview = countLabel(total, PRODUCT_FORMS);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Подбор по параметрам"
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onReset}>
            Сбросить
          </Button>
          <Button
            variant="primary"
            className="min-h-11 flex-1"
            disabled={total === 0}
            onClick={onApply}
          >
            {total === 0 ? 'Нет подходящих товаров' : `Показать ${preview}`}
          </Button>
          <p role="status" className="sr-only">
            Будет показано {preview}
          </p>
        </>
      }
    >
      {result !== null ? (
        <FilterPanel
          variant="drawer"
          result={result}
          onChange={onChange}
          frequencyReviewValues={frequencyReviewValues}
        />
      ) : null}
    </Drawer>
  );
}
