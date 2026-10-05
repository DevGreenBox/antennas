import type { Metadata } from 'next';
import Link from 'next/link';

import { CatalogView } from '@/components/catalog/CatalogView';
import { CategoryNav } from '@/components/catalog/CategoryNav';
import type { SearchParamsRecord } from '@/components/catalog/CategoryCatalogPage';
import { SearchExamples } from '@/components/catalog/SearchExamples';
import { toClientProducts } from '@/components/catalog/catalog-data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { site } from '@/config/site';
import { parseCatalogState, searchProducts } from '@/lib/catalog';
import { getCategories, getCategoryTree, getProducts } from '@/lib/repository';
import { matchesSearch, normalizeSearchText } from '@/lib/search-normalize';
import { pageMetadata } from '@/lib/seo';

/**
 * Поиск `/search?q=` (DESIGN §2.7, §4.11): результаты по всем категориям с подбором (Категория,
 * Частота, Цена), сортировка по умолчанию — релевантность. Поле запроса — в шапке.
 * Состояния: пустой `q` — подсказка, примеры и категории; ничего не найдено — пустое состояние
 * с советами; совпадения со служебными страницами («доставка») — блок «Страницы» над выдачей.
 */
interface Props {
  searchParams: Promise<SearchParamsRecord>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseCatalogState(await searchParams);
  return pageMetadata({
    title: q === '' ? 'Поиск' : `Поиск: ${q}`,
    path: '/search',
    robots: 'noindex-follow',
  });
}

/** Информационные страницы, совпавшие с запросом (§2.7 п.3) — не больше трёх. */
function matchingPages(q: string) {
  return site.searchablePages
    .filter((page) =>
      matchesSearch(normalizeSearchText([page.title, ...page.keywords].join(' ')), q),
    )
    .slice(0, 3);
}

export default async function SearchPage({ searchParams }: Props) {
  const [params, products, categories, tree] = await Promise.all([
    searchParams,
    getProducts(),
    getCategories(),
    getCategoryTree(),
  ]);
  // Пустой запрос — и запрос без слов (только знаки, невидимые символы): `parseCatalogState`
  // оставляет `q` только если после нормализации поиска в нём есть хотя бы один токен.
  const q = parseCatalogState(params).q;
  const categoryNav = (
    <CategoryNav
      label="Категории"
      items={tree.map((node) => ({ href: node.href, name: node.name, count: node.productCount }))}
    />
  );
  const breadcrumbs = <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Поиск' }]} />;

  if (q === '') {
    return (
      <>
        {breadcrumbs}
        <PageHeader
          title="Поиск"
          description={
            <>
              <p>Введите название, модель, диапазон частот или разъём.</p>
              <SearchExamples className="mt-2" />
            </>
          }
        />
        <h2 className="mb-3 text-body font-semibold">Категории каталога</h2>
        {categoryNav}
      </>
    );
  }

  // Совпадения считаются без «только подтверждённых»: строгий режим — параметр выдачи, его
  // можно снять чипом, а «ничего не найдено» должно означать, что запросу не соответствует ничего.
  const hits = searchProducts(products, q).map((hit) => hit.product);
  const pages = matchingPages(q);

  return (
    <>
      {breadcrumbs}
      <PageHeader title="Поиск" meta={`по запросу «${q}»`} />
      {pages.length > 0 ? (
        <section aria-labelledby="search-pages" className="mb-6 border-b border-line pb-4">
          <h2 id="search-pages" className="sr-only">
            Страницы
          </h2>
          <ul className="flex flex-col gap-3">
            {pages.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className="text-link text-body font-medium">
                  {page.title}
                </Link>
                <p className="mt-0.5 text-caption text-ink-muted">{page.href}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {hits.length > 0 ? (
        <CatalogView
          products={toClientProducts(hits)}
          categories={categories}
          categoryId={null}
          rootCategoryId={null}
          basePath="/search"
          label="Результаты поиска"
        />
      ) : (
        <>
          <EmptyState
            className="pt-4"
            title={
              pages.length > 0
                ? `Товаров по запросу «${q}» не найдено`
                : `По запросу «${q}» ничего не найдено`
            }
            actions={
              <ButtonLink href="/catalog" variant="primary">
                Перейти в каталог
              </ButtonLink>
            }
          >
            <p>
              Проверьте написание или попробуйте иначе: модель (Тип1, M4), частоту в МГц (2400),
              разъём (SMA-female). Подбор по нескольким параметрам — в каталоге, в панели «Подбор по
              параметрам».
            </p>
            <SearchExamples className="mt-3" />
          </EmptyState>
          <h2 className="mb-3 text-body font-semibold">Категории каталога</h2>
          {categoryNav}
        </>
      )}
    </>
  );
}
