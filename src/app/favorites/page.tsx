import {
  categoryNameMap,
  toClientCategories,
  toClientProducts,
} from '@/components/cart/catalog-data';
import { FavoritesView } from '@/components/favorites/FavoritesView';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { getCategories, getProducts } from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';

/** Избранное (DESIGN §2.8): список из браузера, табличный вид. noindex. */
export const metadata = pageMetadata({
  title: 'Избранное',
  description: 'Отмеченные позиции каталога.',
  path: '/favorites',
});

export default async function FavoritesPage() {
  const [products, categories] = await Promise.all([getProducts(), getCategories()]);
  return (
    <>
      <Breadcrumbs
        items={[{ label: 'Главная', href: '/' }, { label: 'Избранное' }]}
        jsonLd={false}
      />
      <FavoritesView
        products={toClientProducts(products)}
        categoryNames={categoryNameMap(toClientCategories(categories))}
      />
    </>
  );
}
