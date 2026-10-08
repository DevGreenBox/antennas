'use client';

import { useState } from 'react';

import { buildCartModel, useProductsById } from '@/components/cart/cart-model';
import type { CartModel } from '@/components/cart/cart-model';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { useCart, useCartHydrated } from '@/lib/store/cart';
import { useProfilesStore, useSessionHydrated } from '@/lib/store/session';
import { usePersistHydrated } from '@/lib/store/storage';
import type { Product } from '@/types/catalog';

import { CheckoutForm } from './CheckoutForm';
import { CheckoutSummary, CheckoutSummaryDisclosure } from './CheckoutSummary';

/**
 * Оформление заявки (DESIGN §2.10): форма слева, сводка справа (на < lg — свёрнута над формой).
 * Пока идёт отправка, состав «заморожен»: корзина очищается при успехе, и до перехода на
 * страницу успеха не должно мелькать «В заявке нет товаров».
 *
 * Две панели рядом (DESIGN § R.4 `golden-reverse`): форма и сводка; сводка на ≥ lg липкая
 * (`--sticky-top`) — итог виден, пока заполняется форма. Других рамок на странице нет.
 */
export function CheckoutView({ products }: { products: readonly Product[] }) {
  const cartHydrated = useCartHydrated();
  const sessionHydrated = useSessionHydrated();
  const profilesHydrated = usePersistHydrated(useProfilesStore);
  const items = useCart((state) => state.items);
  const promoCode = useCart((state) => state.promoCode);
  const productsById = useProductsById(products);
  const [frozen, setFrozen] = useState<CartModel | null>(null);

  if (!cartHydrated || !sessionHydrated || !profilesHydrated) {
    return (
      <div className="grid gap-8 lg:grid-cols-golden-reverse lg:gap-10 xl:gap-12">
        <SkeletonGroup className="flex flex-col gap-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
        </SkeletonGroup>
        <SkeletonGroup className="hidden lg:block">
          <Skeleton className="h-64 w-full rounded-md" />
        </SkeletonGroup>
      </div>
    );
  }

  const model = frozen ?? buildCartModel(items, productsById, promoCode);

  if (model.lines.length === 0) {
    return (
      <EmptyState
        title="В заявке нет товаров"
        actions={
          <ButtonLink href="/catalog" variant="primary" size="md">
            Перейти в каталог
          </ButtonLink>
        }
      >
        Сначала добавьте позиции в корзину.
      </EmptyState>
    );
  }

  const editable = frozen === null;

  return (
    <>
      <StorageNotice className="mb-6" />
      {model.unavailableCount > 0 ? (
        <Notice
          tone="warning"
          className="mb-6"
          actions={
            <ButtonLink href="/cart" variant="secondary" size="sm">
              Перейти в корзину
            </ButtonLink>
          }
        >
          Уберите недоступные позиции, чтобы оформить заявку
        </Notice>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-golden-reverse lg:gap-10 xl:gap-12">
        <div className="min-w-0">
          <CheckoutSummaryDisclosure model={model} editable={editable} className="mb-6 lg:hidden" />
          <CheckoutForm
            model={model}
            onSubmitStart={() => setFrozen(model)}
            onSubmitFailed={() => setFrozen(null)}
          />
        </div>
        <aside
          aria-label="Сумма заявки"
          className="hidden self-start lg:sticky lg:top-(--sticky-top) lg:block"
        >
          <CheckoutSummary model={model} editable={editable} />
        </aside>
      </div>
    </>
  );
}
