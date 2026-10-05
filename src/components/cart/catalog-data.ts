/**
 * Данные каталога для клиентских страниц покупки (корзина, заявка, избранное, ЛК).
 *
 * Корзина, избранное и заказы живут в браузере, а репозиторий — только на сервере, поэтому
 * серверная оболочка страницы передаёт клиентскому компоненту список товаров пропсом. Чтобы
 * не гнать в браузер лишнее, у товара убираются поля, которые эти страницы не показывают
 * (происхождение значений, пометки, строки-источники, поисковый текст). Форма `Product`
 * сохраняется: строка параметров, колонки таблицы и снимок заявки считаются теми же
 * функциями движка, что и в каталоге.
 *
 * Модуль без 'use client' и без server-only: вызывается в серверных page.tsx, типы —
 * в клиентских компонентах.
 */

import type { Category, Product } from '@/types/catalog';

/** Товар без полей, не нужных страницам покупки. */
export function toClientProduct(product: Product): Product {
  return {
    ...product,
    attributes: product.attributes.map((attr) => ({
      code: attr.code,
      value: attr.value,
      status: attr.status,
      origin: { kind: attr.origin.kind, cell: null },
      raw: '',
      ...(attr.note === undefined ? {} : { note: attr.note }),
    })),
    notes: [],
    sourceIds: [],
    issueIds: [],
    searchText: '',
  };
}

export function toClientProducts(products: readonly Product[]): Product[] {
  return products.map(toClientProduct);
}

/** Категория для клиентских страниц: только то, что нужно подписям и группировке. */
export interface ClientCategory {
  id: string;
  name: string;
  parentId: string | null;
}

export function toClientCategories(categories: readonly Category[]): ClientCategory[] {
  return categories.map(({ id, name, parentId }) => ({ id, name, parentId }));
}

/** id категории → название (колонка «Категория» смешанной таблицы). */
export function categoryNameMap(
  categories: readonly ClientCategory[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(categories.map((category) => [category.id, category.name]));
}
