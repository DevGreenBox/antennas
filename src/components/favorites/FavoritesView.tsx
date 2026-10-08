'use client';

import { useEffect, useRef, useState } from 'react';

import { useProductsById } from '@/components/cart/cart-model';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  ProductList,
  columnsForCategory,
  hasInferredValues,
} from '@/components/product/ProductRow';
import { INFERRED_FOOTNOTE } from '@/components/product/SpecLine';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { cn } from '@/lib/cn';
import { PRODUCT_FORMS, countLabel } from '@/lib/format';
import { useFavorites, useFavoritesHydrated } from '@/lib/store/favorites';
import type { Product } from '@/types/catalog';

/**
 * Избранное (DESIGN §2.8, § R.7): список смешанного варианта (без переключателя вида), сначала
 * добавленные последними. Хранится в браузере; после входа объединяется с профилем (§3.11).
 * Позиция, которой больше нет в каталоге, видна строкой «Позиция больше недоступна» — в конце
 * того же списка (те же разделители 1 px, без отдельной рамки).
 *
 * После «Очистить избранное» (и удаления последней позиции) кнопка, на которой был фокус,
 * исчезает — фокус переводится на заголовок пустого состояния.
 */
export function FavoritesView({
  products,
  categoryNames,
}: {
  products: readonly Product[];
  categoryNames: Readonly<Record<string, string>>;
}) {
  const hydrated = useFavoritesHydrated();
  const ids = useFavorites((state) => state.ids);
  const remove = useFavorites((state) => state.remove);
  const clear = useFavorites((state) => state.clear);
  const productsById = useProductsById(products);
  const [confirmClear, setConfirmClear] = useState(false);
  const emptyRef = useRef<HTMLDivElement>(null);
  const focusEmpty = useRef(false);
  const isEmpty = hydrated && ids.length === 0;

  useEffect(() => {
    if (!isEmpty || !focusEmpty.current) return;
    focusEmpty.current = false;
    const heading = emptyRef.current?.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [isEmpty]);

  if (!hydrated) {
    return (
      <>
        <PageHeader title="Избранное" />
        <SkeletonRows rows={3} />
      </>
    );
  }

  if (ids.length === 0) {
    return (
      <>
        <PageHeader title="Избранное" />
        <StorageNotice className="mb-6" />
        <div ref={emptyRef}>
          <EmptyState
            compact
            title="В избранном пока пусто"
            actions={
              <ButtonLink href="/catalog" variant="primary" size="md">
                Перейти в каталог
              </ButtonLink>
            }
          >
            Отмечайте позиции значком закладки — они сохранятся здесь, в этом браузере.
          </EmptyState>
        </div>
      </>
    );
  }

  const available = ids.flatMap((id) => {
    const product = productsById.get(id);
    return product ? [product] : [];
  });
  const missing = ids.filter((id) => !productsById.has(id));
  const columns = columnsForCategory(null);

  return (
    <>
      <PageHeader
        title="Избранное"
        meta={countLabel(ids.length, PRODUCT_FORMS)}
        actions={
          // Ghost-кнопка по краю контента: слева на < md (под заголовком), справа на md+.
          <Button
            variant="ghost"
            size="sm"
            icon="trash-2"
            className="-ml-3 max-lg:h-11 md:-mr-3 md:ml-0"
            onClick={() => setConfirmClear(true)}
          >
            Очистить избранное
          </Button>
        }
      />
      <StorageNotice className="mb-6" />
      <h2 className="sr-only">Позиции в избранном</h2>
      {available.length > 0 ? (
        <ProductList products={available} columns={columns} categoryNames={categoryNames} />
      ) : null}
      {missing.length > 0 ? (
        <ul
          className={cn(
            'divide-y divide-line border-b border-line',
            available.length === 0 && 'border-t',
          )}
        >
          {missing.map((id) => (
            <li key={id} className="flex items-center justify-between gap-4 py-4">
              <span className="text-body text-ink-secondary">Позиция больше недоступна</span>
              <Button
                variant="secondary"
                size="sm"
                className="max-lg:h-11"
                onClick={() => {
                  if (ids.length === 1) focusEmpty.current = true;
                  remove(id);
                }}
              >
                Убрать
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {hasInferredValues(available, columns) ? (
        <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Очистить избранное?"
        confirmLabel="Очистить"
        onConfirm={() => {
          focusEmpty.current = true;
          clear();
          setConfirmClear(false);
        }}
      >
        Будут удалены все позиции из избранного: {ids.length}.
      </ConfirmDialog>
    </>
  );
}
