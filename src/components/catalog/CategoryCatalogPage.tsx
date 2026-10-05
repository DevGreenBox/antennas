import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { POSITION_FORMS, countLabel } from '@/lib/format';
import { getCategories, getCategoryBySlugPath, getProductsInCategory } from '@/lib/repository';
import type { CategoryMatch } from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';

import { CatalogView } from './CatalogView';
import { CategoryNav } from './CategoryNav';
import { hasQueryParams, toClientProducts } from './catalog-data';

/**
 * Страницы категории и подкатегории (DESIGN §2.4, §2.5) — серверная часть: проверка пути,
 * крошки, заголовок, SubcategoryNav и данные для CatalogView. Маршруты
 * `/catalog/[category]` и `/catalog/[category]/[sub]` отличаются только сегментами пути.
 *
 * Неизвестный slug или подкатегория не своего родителя → `notFound()` (настоящий 404: проверка
 * идёт до любого Suspense — в этих маршрутах нет loading.tsx, ответ не начинает стримиться).
 *
 * Под h1 счётчика нет: число позиций — у выдачи (live-счётчик «Найдено: N»), всего в категории —
 * в чипе «Все · N» подкатегорий. Второе «23 товара» под заголовком при подборе расходилось со
 * счётчиком выдачи («23» и «2»). Состояние подбора CatalogView читает из URL сам; `searchParams`
 * ждётся, чтобы маршрут оставался динамическим (SSR видит параметры).
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Категория по сегментам пути или 404. */
export async function resolveCategory(slugs: readonly string[]): Promise<CategoryMatch> {
  const match = await getCategoryBySlugPath(slugs);
  if (match === null) notFound();
  return match;
}

export async function categoryMetadata(
  slugs: readonly string[],
  searchParams: Promise<SearchParamsRecord>,
): Promise<Metadata> {
  const [{ category, trail }, params] = await Promise.all([resolveCategory(slugs), searchParams]);
  const parent = trail.length > 1 ? trail[trail.length - 2] : null;
  return pageMetadata({
    title: parent ? `${category.name} — ${parent.name}` : category.name,
    description: `${category.name}: ${countLabel(category.productCount, POSITION_FORMS)}. Характеристики и цены из прайса.`,
    path: category.href,
    // С любым параметром — noindex, follow; canonical всегда на путь без параметров (§8).
    robots: hasQueryParams(params) ? 'noindex-follow' : 'index',
  });
}

export async function CategoryCatalogPage({
  slugs,
  searchParams,
}: {
  slugs: readonly string[];
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { category, trail } = await resolveCategory(slugs);
  const [, products, categories] = await Promise.all([
    searchParams,
    getProductsInCategory(category.id),
    getCategories(),
  ]);
  const root = trail[0];

  // SubcategoryNav: «Все · N» родителя и его подкатегории; у категорий без подкатегорий — нет.
  const navParent = category.children.length > 0 ? category : trail.length > 1 ? root : null;
  const subNav = navParent
    ? [
        {
          href: navParent.href,
          name: 'Все',
          count: navParent.productCount,
          current: navParent.id === category.id,
        },
        ...navParent.children.map((child) => ({
          href: child.href,
          name: child.name,
          count: child.productCount,
          current: child.id === category.id,
        })),
      ]
    : [];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Главная', href: '/' },
          { label: 'Каталог', href: '/catalog' },
          ...trail.map((node, index) =>
            index === trail.length - 1
              ? { label: node.name }
              : { label: node.name, href: node.href },
          ),
        ]}
      />
      <PageHeader
        title={category.name}
        description={category.description.trim() !== '' ? category.description : undefined}
      />
      <CategoryNav label="Подкатегории" items={subNav} className="mb-6 lg:mb-8" />
      <CatalogView
        products={toClientProducts(products)}
        categories={categories}
        categoryId={category.id}
        rootCategoryId={root.id}
        basePath={category.href}
        label={category.name}
      />
    </>
  );
}
