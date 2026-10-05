import type { Metadata } from 'next';

import { CatalogView } from '@/components/catalog/CatalogView';
import { CategoryNav } from '@/components/catalog/CategoryNav';
import type { SearchParamsRecord } from '@/components/catalog/CategoryCatalogPage';
import { hasQueryParams, toClientProducts } from '@/components/catalog/catalog-data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { POSITION_FORMS, countLabel } from '@/lib/format';
import { getCategories, getCategoryTree, getProducts } from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';

/**
 * Весь каталог `/catalog` (DESIGN §2.3): CategoryNav + подбор по категории, частоте и цене.
 *
 * Под h1 счётчика нет: число позиций — одно, у выдачи (live-счётчик «Найдено: N»). Второе «118
 * товаров» под заголовком при активном подборе расходилось с ним («118» и «23») и путало.
 * `searchParams` страницы ждётся только для robots: состояние подбора CatalogView читает из URL
 * сам (`useSearchParams`), а сам `await` делает маршрут динамическим — SSR видит параметры.
 */
interface Props {
  searchParams: Promise<SearchParamsRecord>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [products, params] = await Promise.all([getProducts(), searchParams]);
  return pageMetadata({
    title: 'Каталог',
    description: `Антенны, МШУ, радиочастотные фильтры, кабельные сборки и другое радиооборудование: ${countLabel(products.length, POSITION_FORMS)} с характеристиками и ценами из прайса.`,
    path: '/catalog',
    robots: hasQueryParams(params) ? 'noindex-follow' : 'index',
  });
}

export default async function CatalogPage({ searchParams }: Props) {
  const [, products, categories, tree] = await Promise.all([
    searchParams,
    getProducts(),
    getCategories(),
    getCategoryTree(),
  ]);
  return (
    <>
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Каталог' }]} />
      <PageHeader title="Каталог" />
      <CategoryNav
        label="Категории"
        items={tree.map((node) => ({ href: node.href, name: node.name, count: node.productCount }))}
        className="mb-6 lg:mb-8"
      />
      <CatalogView
        products={toClientProducts(products)}
        categories={categories}
        categoryId={null}
        rootCategoryId={null}
        basePath="/catalog"
        label="Каталог"
      />
    </>
  );
}
