import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CategoryIndex } from '@/components/home/CategoryIndex';
import { ProcessSteps } from '@/components/home/ProcessSteps';
import { SpectrumMap } from '@/components/home/SpectrumMap';
import { SearchForm } from '@/components/layout/SearchForm';
import { ProductCard } from '@/components/product/ProductCard';
import { INFERRED_FOOTNOTE, specLineHasInferred } from '@/components/product/SpecLine';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { JsonLd } from '@/components/ui/JsonLd';
import { site, siteTitle } from '@/config/site';
import { PRODUCT_FORMS, countLabel } from '@/lib/format';
import { getCategories, getCategoryTree, getProducts } from '@/lib/repository';
import { absoluteUrl, pageMetadata } from '@/lib/seo';
import type { Product } from '@/types/catalog';

/**
 * Главная (DESIGN § R.6) отвечает на четыре вопроса: что продаётся (вступление и карта
 * диапазонов), как найти (поиск и быстрые запросы), какие категории (указатель), как купить
 * (три шага). Рекламного hero, «преимуществ», цифр, отзывов и «популярного» нет — данных для них
 * нет, а выдумывать нельзя.
 */

export const metadata: Metadata = pageMetadata({
  absoluteTitle: site.brandName
    ? `${site.brandName} — каталог антенн и радиооборудования`
    : site.catalogTitle,
  description: site.description,
  path: '/',
});

/** WebSite + SearchAction → /search?q=. Organization не выводится: нет названия и реквизитов. */
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

/** Сколько позиций показывать на главной: по одной из самых больших категорий. */
const SHOWCASE_SIZE = 4;

const SECTION = 'border-t border-line pt-8 lg:pt-12';
const SECTION_GAP = 'mt-14 lg:mt-20';

function SectionHead({ id, title, link }: { id: string; title: string; link?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 lg:mb-8">
      <h2 id={id} className="text-title font-medium lg:text-heading">
        {title}
      </h2>
      {link}
    </div>
  );
}

export default async function HomePage() {
  const [products, categories, tree] = await Promise.all([
    getProducts(),
    getCategories(),
    getCategoryTree(),
  ]);
  const categoryNames = Object.fromEntries(
    categories.map((category) => [category.id, category.name]),
  );

  // Срез каталога, а не «популярное»: первая по порядку прайса позиция каждой из самых больших
  // категорий верхнего уровня (товары уже отсортированы по sortIndex); категории — в порядке
  // каталога.
  const largest = new Set(
    [...tree]
      .sort((a, b) => b.productCount - a.productCount)
      .slice(0, SHOWCASE_SIZE)
      .map((node) => node.id),
  );
  const showcase = tree
    .filter((node) => largest.has(node.id))
    .flatMap((node): Product[] => {
      const first = products.find((product) => product.categoryPath.includes(node.id));
      return first === undefined ? [] : [first];
    });

  return (
    <>
      <JsonLd data={webSiteJsonLd()} />

      <section
        aria-labelledby="home-title"
        className="grid gap-10 pt-2 pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16 lg:pt-6 lg:pb-20 xl:gap-24"
      >
        <div className="min-w-0">
          <p className="eyebrow">Радиочастотное оборудование</p>
          <h1 id="home-title" className="mt-4 lg:text-hero">
            {site.descriptor}
          </h1>
          <p className="mt-4 max-w-[36rem] text-body text-ink-secondary lg:mt-5 lg:text-lead">
            Антенны, фильтры, усилители, кабельные сборки и комплектующие с подбором по техническим
            параметрам.
          </p>
          <SearchForm variant="hero" className="mt-8 lg:mt-10" />
        </div>
        <SpectrumMap tree={tree} products={products} className="hidden md:flex lg:pt-1" />
      </section>

      {products.length === 0 ? (
        <EmptyState title="Каталог пока пуст" className={SECTION}>
          Позиции появятся после загрузки прайса.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="home-categories" className={SECTION}>
            <SectionHead
              id="home-categories"
              title="Каталог"
              link={
                <Link
                  href="/catalog"
                  className="group/all inline-flex items-center gap-2 text-small font-medium text-ink"
                >
                  Весь каталог · {countLabel(products.length, PRODUCT_FORMS)}
                  <Icon
                    name="arrow-right"
                    size={16}
                    className="transition-transform duration-fast group-hover/all:translate-x-1"
                  />
                </Link>
              }
            />
            <CategoryIndex tree={tree} />
          </section>

          <section aria-labelledby="home-items" className={`${SECTION} ${SECTION_GAP}`}>
            <SectionHead id="home-items" title="Позиции из каталога" />
            <ul className="grid gap-4 sm:grid-cols-2 lg:gap-6 xl:grid-cols-4">
              {showcase.map((product) => (
                <li key={product.id} className="flex">
                  <ProductCard
                    product={product}
                    categoryName={categoryNames[product.categoryId]}
                    className="w-full"
                  />
                </li>
              ))}
            </ul>
            {showcase.some(specLineHasInferred) ? (
              <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p>
            ) : null}
          </section>
        </>
      )}

      <section aria-labelledby="home-process" className={`${SECTION_GAP} pt-0`}>
        <SectionHead
          id="home-process"
          title="Как проходит покупка"
          link={
            <Link href="/delivery" className="text-link text-small">
              Подробнее о доставке и оплате
            </Link>
          }
        />
        <ProcessSteps />
      </section>

      <section
        aria-labelledby="home-contact"
        className={`${SECTION_GAP} grid grid-cols-1 gap-6 rounded-md bg-surface-muted p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:p-10`}
      >
        <div>
          <h2 id="home-contact" className="text-title font-medium">
            Не уверены в совместимости оборудования?
          </h2>
          <p className="mt-2 max-w-[38rem] text-body text-ink-secondary">
            Поможем проверить характеристики и подобрать подходящие позиции.
          </p>
        </div>
        <ButtonLink
          href={site.contacts.telegram.url}
          external
          variant="secondary"
          size="lg"
          icon="send"
          fullWidth="mobile"
          // < sm подпись может перенестись: на 320 px кнопка не шире блока.
          className="max-sm:h-auto max-sm:min-h-12 max-sm:py-2.5 max-sm:whitespace-normal"
        >
          Задать вопрос в Telegram
        </ButtonLink>
      </section>
    </>
  );
}
