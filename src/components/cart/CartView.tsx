'use client';

import { useEffect, useRef, useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Skeleton, SkeletonGroup, SkeletonRows } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { POSITION_FORMS, countLabel, formatPieces } from '@/lib/format';
import { useCart, useCartHydrated } from '@/lib/store/cart';
import type { Product } from '@/types/catalog';

import { CartLines } from './CartLines';
import { OrderSummary, PreliminaryBreakdown } from './OrderSummary';
import { PromoCodeField } from './PromoCodeField';
import { buildCartModel, useProductsById } from './cart-model';

/**
 * Корзина (DESIGN §2.9). Хранится в браузере и переживает перезагрузку; после входа
 * объединяется с профилем (§3.11). Итог — только из `preliminaryTotals()`: при позициях
 * «по запросу» ложного полного итога нет.
 *
 * Две колонки (строки | сводка) — с xl: таблица строк занимает ~660 px и в левой колонке на
 * 1024–1279 px не помещалась, уезжая под сводку (кнопки «Удалить» перекрывались). Ниже xl
 * сводка идёт под строками, как на планшете.
 *
 * После «Очистить корзину» и удаления последней строки кнопки, на которых был фокус, исчезают —
 * фокус переводится на заголовок пустого состояния, а не теряется в body.
 */
export function CartView({ products }: { products: readonly Product[] }) {
  const hydrated = useCartHydrated();
  const items = useCart((state) => state.items);
  const promoCode = useCart((state) => state.promoCode);
  const clear = useCart((state) => state.clear);
  const productsById = useProductsById(products);
  const [confirmClear, setConfirmClear] = useState(false);
  const linesRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  // Корзина опустела действием на этой странице — фокус на заголовок пустого состояния.
  const focusEmpty = useRef(false);
  const isEmpty = hydrated && items.length === 0;

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
        <PageHeader title="Корзина" />
        <div className="grid gap-8 xl:grid-cols-golden-reverse xl:gap-12">
          <SkeletonRows rows={3} />
          <SkeletonGroup>
            <Skeleton className="h-64 w-full rounded-md" />
          </SkeletonGroup>
        </div>
      </>
    );
  }

  const model = buildCartModel(items, productsById, promoCode);

  if (model.lines.length === 0) {
    return (
      <>
        <PageHeader title="Корзина" />
        <StorageNotice className="mb-6" />
        <div ref={emptyRef}>
          <EmptyState
            title="Корзина пуста"
            actions={
              <ButtonLink href="/catalog" variant="primary" size="md">
                Перейти в каталог
              </ButtonLink>
            }
          >
            Добавьте позиции из каталога — они сохранятся в этом браузере.
          </EmptyState>
        </div>
      </>
    );
  }

  const blocked = model.unavailableCount > 0;

  return (
    <>
      <PageHeader
        title="Корзина"
        meta={`${countLabel(model.lines.length, POSITION_FORMS)} · ${formatPieces(
          model.lines.reduce((sum, line) => sum + line.item.quantity, 0),
        )}`}
      />
      <StorageNotice className="mb-6" />
      <div className="grid gap-8 xl:grid-cols-golden-reverse xl:gap-12">
        <div
          ref={linesRef}
          tabIndex={-1}
          aria-label="Позиции корзины"
          className="min-w-0 outline-none"
        >
          <CartLines
            lines={model.lines}
            onLineRemoved={() => {
              if (useCart.getState().items.length === 0) focusEmpty.current = true;
              else linesRef.current?.focus();
            }}
          />
          {/* -ml-3: текст ghost-кнопки — по краю контента, а не с отступом её подложки. */}
          <Button
            variant="ghost"
            size="sm"
            icon="trash-2"
            className="mt-4 -ml-3"
            onClick={() => setConfirmClear(true)}
          >
            Очистить корзину
          </Button>
        </div>

        {/* Ниже xl сводка под строками — справа, шириной с колонку итогов, а не во всю страницу. */}
        <div className="self-start md:w-full md:max-w-md md:justify-self-end xl:sticky xl:top-6 xl:max-w-none xl:justify-self-auto">
          <OrderSummary title="Сумма заявки">
            <PreliminaryBreakdown totals={model.totals} />
            <PromoCodeField
              onlyRequestItems={model.totals.onlyRequestItems}
              className="mt-4 border-t border-line pt-4"
            />
            <div className="mt-5 flex flex-col gap-3">
              {blocked ? (
                <Notice tone="warning">Уберите недоступные позиции, чтобы оформить заявку</Notice>
              ) : null}
              <ButtonLink href="/checkout" variant="primary" size="lg" fullWidth disabled={blocked}>
                Оформить заявку
              </ButtonLink>
              <p className="text-small text-ink-secondary">
                Это ещё не оплата. Менеджер свяжется с вами, согласует состав, цену и доставку.
              </p>
            </div>
          </OrderSummary>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Очистить корзину?"
        confirmLabel="Очистить"
        onConfirm={() => {
          focusEmpty.current = true;
          clear();
          setConfirmClear(false);
        }}
      >
        Из корзины будут удалены все позиции: {model.lines.length}.
      </ConfirmDialog>
    </>
  );
}
