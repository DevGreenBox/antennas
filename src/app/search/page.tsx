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
import { cn } from '@/lib/cn';
import { getCategories, getCategoryTree, getProducts } from '@/lib/repository';
import { matchesSearch, normalizeSearchText } from '@/lib/search-normalize';
import { pageMetadata } from '@/lib/seo';

/**
 * Поиск `/search?q=` (DESIGN §2.7, §4.11): результаты по всем категориям с подбором (Категория,
 * Частота, Цена), сортировка по умолчанию — релевантность. Поле запроса — в шапке.
 * Состояния: пустой `q` — подсказка, примеры и категории; ничего не найдено — пустое состояние
 * с советами; совпадения со служебными страницами («доставка») — блок «Страницы сайта» над выдачей.
 *
 * Раскладка — как у страниц каталога (§ R.7): крошки → h1 → строка запроса → [панель | выдача].
 * Пустая выдача стоит на месте списка (над ней та же линия `line`), ниже — «Категории каталога»
 * отдельным разделом с заголовком `eyebrow`, как у панели подбора.
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
  const categorySection = (
    <section aria-labelledby="search-categories" className="border-t border-line pt-6 lg:pt-8">
      <h2 id="search-categories" className="eyebrow mb-4 text-ink">
        Категории каталога
      </h2>
      <CategoryNav
        label="Категории"
        items={tree.map((node) => ({ href: node.href, name: node.name, count: node.productCount }))}
      />
    </section>
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
        {categorySection}
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
      <PageHeader
        title="Поиск"
        // Строка запроса — когда что-то нашлось; если нет ничего, запрос называет заголовок
        // пустого состояния («По запросу «…» ничего не найдено») — второй раз он не нужен.
        description={
          hits.length > 0 || pages.length > 0 ? (
            <p>
              По запросу <span className="font-medium text-ink">«{q}»</span>
            </p>
          ) : undefined
        }
      />
      {pages.length > 0 ? (
        // Совпавшие страницы сайта — короткий список над выдачей, отделён линией.
        <section
          aria-labelledby="search-pages"
          // Без товаров ниже идёт пустое состояние со своим верхним полем 48 px.
          className={cn('border-b border-line pb-6', hits.length > 0 && 'mb-8')}
        >
          <h2 id="search-pages" className="eyebrow mb-3 text-ink">
            Страницы сайта
          </h2>
          <ul className="flex flex-col gap-3">
            {pages.map((page) => (
              <li key={page.href}>
                {/* Цель нажатия 44 px на < lg; лишняя высота — в отрицательных полях. */}
                <Link
                  href={page.href}
                  className="text-link -my-2.5 inline-flex min-h-11 items-center text-body font-medium lg:my-0 lg:min-h-0"
                >
                  {page.title}
                </Link>
                <p className="mt-0.5 font-mono text-caption text-ink-muted">{page.href}</p>
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
          {/* Линия над пустой выдачей — как над списком; после «Страниц сайта» она уже есть. */}
          <div className={cn(pages.length === 0 && 'border-t border-line')}>
            <EmptyState
              title={
                pages.length > 0
                  ? `Товаров по запросу «${q}» не найдено`
                  : `По запросу «${q}» ничего не найдено`
              }
              actions={
                <ButtonLink href="/catalog" variant="primary" className="min-h-11 lg:min-h-0">
                  Перейти в каталог
                </ButtonLink>
              }
            >
              <p>
                Проверьте написание или попробуйте иначе: модель (Тип1, M4), частоту в МГц (2400),
                разъём (SMA-female). Подбор по нескольким параметрам — в каталоге, в панели «Подбор
                по параметрам».
              </p>
              <SearchExamples className="mt-3" />
            </EmptyState>
          </div>
          {categorySection}
        </>
      )}
    </>
  );
}
