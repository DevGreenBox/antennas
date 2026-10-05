import type { Metadata } from 'next';
import Link from 'next/link';

import { CategoryTiles } from '@/components/home/CategoryTiles';
import { ProcessSteps } from '@/components/home/ProcessSteps';
import { SearchForm } from '@/components/layout/SearchForm';
import {
  ProductList,
  ProductTable,
  columnsForCategory,
  hasInferredValues,
} from '@/components/product/ProductRow';
import { INFERRED_FOOTNOTE } from '@/components/product/SpecLine';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { JsonLd } from '@/components/ui/JsonLd';
import { site, siteTitle } from '@/config/site';
import { PRODUCT_FORMS, countLabel } from '@/lib/format';
import { getCategories, getCategoryTree, getProducts } from '@/lib/repository';
import { absoluteUrl, pageMetadata } from '@/lib/seo';
import type { Product } from '@/types/catalog';

/**
 * Главная (DESIGN §2.2): сразу к выбору оборудования. Поиск, процесс покупки, категории с
 * количествами из данных, несколько реальных позиций и контакт. Рекламного hero, слайдеров,
 * «преимуществ», отзывов и «популярного» нет — данных для них нет, а выдумывать нельзя.
 */

export const metadata: Metadata = pageMetadata({
  absoluteTitle: site.brandName
    ? `${site.brandName} — каталог антенн и радиооборудования`
    : site.catalogTitle,
  description: site.description,
  path: '/',
});

/** WebSite + SearchAction → /search?q= (§2.2 SEO). Organization не выводится: нет названия и реквизитов. */
function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteTitle(),
    url: absoluteUrl('/'),
    inLanguage: site.lang,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/search')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

const SECTION = 'mt-10 lg:mt-16';

export default async function HomePage() {
  const [products, categories, tree] = await Promise.all([
    getProducts(),
    getCategories(),
    getCategoryTree(),
  ]);
  const categoryNames = Object.fromEntries(
    categories.map((category) => [category.id, category.name]),
  );

  // По одной позиции из каждой категории верхнего уровня: первая по порядку прайса в её поддереве
  // (товары уже отсортированы по sortIndex), категории — в порядке sortIndex. Это не «популярное» и
  // не подборка — просто срез каталога, по которому видно, что в нём есть.
  const showcase = tree.flatMap((node): Product[] => {
    const first = products.find((product) => product.categoryPath.includes(node.id));
    return first === undefined ? [] : [first];
  });
  const columns = columnsForCategory(null);

  return (
    <>
      <JsonLd data={webSiteJsonLd()} />

      <div className="grid gap-8 lg:grid-cols-golden-reverse xl:gap-12">
        <section aria-labelledby="home-title">
          <h1 id="home-title">{site.catalogTitle}</h1>
          <p className="mt-3 max-w-text text-body text-ink-secondary">
            Характеристики и цены — из прайса. Покупка через заявку: менеджер согласует состав, цену
            и доставку, после этого заказ можно оплатить в личном кабинете.
          </p>
          <SearchForm variant="hero" className="mt-6" />
        </section>

        <section aria-labelledby="home-process" className="lg:pt-2">
          <h2 id="home-process" className="mb-4">
            Как проходит покупка
          </h2>
          <ProcessSteps />
          <Link href="/delivery" className="mt-4 inline-block text-link text-small">
            Подробнее о доставке и оплате
          </Link>
        </section>
      </div>

      {products.length === 0 ? (
        <EmptyState title="Каталог пока пуст" className={SECTION}>
          Позиции появятся после загрузки прайса.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="home-categories" className={SECTION}>
            <h2 id="home-categories" className="mb-4 lg:mb-6">
              Категории
            </h2>
            <CategoryTiles tree={tree} />
          </section>

          <section aria-labelledby="home-items" className={SECTION}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 lg:mb-6">
              <h2 id="home-items">Позиции из каталога</h2>
              <Link href="/catalog" className="text-link text-small">
                Весь каталог · {countLabel(products.length, PRODUCT_FORMS)}
              </Link>
            </div>
            <ProductTable
              products={showcase}
              columns={columns}
              categoryNames={categoryNames}
              caption="Позиции из каталога: первая позиция каждой категории"
            />
            <ProductList products={showcase} columns={columns} categoryNames={categoryNames} />
            {hasInferredValues(showcase, columns) ? (
              <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p>
            ) : null}
          </section>
        </>
      )}

      <section aria-labelledby="home-contact" className={`${SECTION} border-t border-line pt-10`}>
        <h2 id="home-contact">Вопросы по подбору</h2>
        <p className="mt-3 max-w-text text-body text-ink-secondary">
          Вопросы по характеристикам и совместимости позиций можно задать в Telegram.
        </p>
        <ButtonLink
          href={site.contacts.telegram.url}
          external
          variant="secondary"
          size="md"
          icon="send"
          className="mt-6"
        >
          Написать в Telegram
        </ButtonLink>
      </section>
    </>
  );
}
