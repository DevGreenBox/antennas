import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import type { BreadcrumbItem } from '@/components/layout/Breadcrumbs';
import { ConflictNotice } from '@/components/product/ConflictNotice';
import { ProductFrequency, ProductKeySpecs } from '@/components/product/ProductFrequency';
import { ProductMedia } from '@/components/product/ProductMedia';
import { ProductNotes } from '@/components/product/ProductNotes';
import { ProductPrice } from '@/components/product/ProductPrice';
import { ProductPurchase } from '@/components/product/ProductPurchase';
import { ProductRecommendations } from '@/components/product/ProductRecommendations';
import { ProductSourceInfo } from '@/components/product/SourceDetails';
import { TechText } from '@/components/product/SpecLine';
import { SpecTable } from '@/components/product/SpecTable';
import { JsonLd } from '@/components/ui/JsonLd';
import { cn } from '@/lib/cn';
import {
  getAllSourceRecords,
  getCategoryTrail,
  getIssuesForProduct,
  getProductBySlug,
  getProducts,
  getRecommendations,
  getSourceRecordsForProduct,
} from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';

import { productDescription, productJsonLd, productPath } from './product-seo';

/**
 * Товар (DESIGN § R.8). Статическая страница на каждую видимую позицию; неизвестный или скрытый
 * slug → 404.
 *
 * Первый экран 55 : 45: слева медиа (фото или нейтральная заглушка 4:3, липкая на ≥ lg), справа —
 * решение о покупке: категория, название, код, ключевые параметры (частота со шкалой), пометка о
 * расхождении, цена, количество и «В корзину», доставка. Ниже — «Характеристики» (подписи и
 * значения), пометки из прайса и закрытый блок «Техническая информация об источнике данных»;
 * затем «К этому товару подойдёт».
 *
 * Фото нет — на < lg большой заглушки нет: название и цена на первом экране. Фото есть — оно
 * показывается на всех ширинах (на < lg над названием).
 */

type Params = Promise<{ slug: string }>;

/**
 * Все slug известны при сборке (`generateStaticParams`): любой другой адрес — 404 без рендера.
 * Заодно адреса с «битым» процентным кодированием (`/product/%25`) не доходят до разбора
 * параметра и не дают 500.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (product === null) notFound();
  return pageMetadata({
    title: product.name,
    description: productDescription(product),
    path: productPath(product),
    robots: 'index',
  });
}

/** Нижние разделы: заголовок в левой колонке, содержимое — справа (≥ lg). */
const SECTION = 'grid gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]';

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (product === null) notFound();

  const [trail, records, issues, recommendations, allRecords] = await Promise.all([
    getCategoryTrail(product.categoryId),
    getSourceRecordsForProduct(product.id),
    getIssuesForProduct(product.id),
    getRecommendations(product.id),
    getAllSourceRecords(),
  ]);

  // Расхождение листов: строка листа 2 привязана к товару (или есть проблема sheet-conflict).
  // Сами значения листа 2 дальше не передаются ни в один компонент.
  const hasConflict =
    records.some((record) => record.resolution === 'conflict-attached') ||
    issues.some((issue) => issue.code === 'sheet-conflict');

  // Текст ячеек прайса по адресу «1!B4» — для раскрытия «Источник» в характеристиках
  // (строка товара, заголовок группы, групповое примечание).
  const neededCells = new Set(
    product.attributes.flatMap((attr) => (attr.origin.cell === null ? [] : [attr.origin.cell])),
  );
  const sourceTexts = new Map(
    allRecords
      .map((record) => [`${record.sheet}!${record.nameCell}`, record.rawText] as const)
      .filter(([cell]) => neededCells.has(cell)),
  );

  const photo = product.images[0] ?? null;
  const leaf = trail.at(-1) ?? null;
  const crumbs: BreadcrumbItem[] = [
    { label: 'Главная', href: '/' },
    { label: 'Каталог', href: '/catalog' },
    ...trail.map((node) => ({ label: node.name, href: node.href })),
    { label: product.name },
  ];

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <JsonLd data={productJsonLd(product, leaf?.name ?? null)} />

      <div className="grid gap-8 lg:grid-cols-product lg:gap-12 xl:gap-16">
        <div className={cn(photo === null && 'hidden lg:block')} data-testid="product-media">
          <div className="lg:sticky lg:top-(--sticky-top)">
            <ProductMedia product={product} variant="product" preload />
          </div>
        </div>

        <div className="min-w-0">
          {/* < lg категорию уже показывает ссылка «назад» крошек — здесь не повторяется. */}
          {leaf ? (
            <p className="eyebrow hidden lg:block">
              <Link href={leaf.href} className="hover:text-ink hover:underline">
                {leaf.name}
              </Link>
            </p>
          ) : null}
          <h1 className="lg:mt-3 lg:text-heading xl:text-[2.125rem] xl:leading-[2.625rem]">
            {/* Неразрывность единиц и кодов («1 м», «SMA-male», «RG-316») — общий помощник каталога. */}
            <TechText text={product.name} />
          </h1>
          <dl className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <dt className="text-small text-ink-muted">Код</dt>
            <dd className="font-mono text-small text-ink" data-testid="product-code">
              {product.code}
            </dd>
            <dd className="w-full text-caption text-ink-muted sm:w-auto sm:pl-2">
              Внутренний код магазина, не артикул производителя.
            </dd>
          </dl>

          {hasConflict ? <ConflictNotice className="mt-5 lg:mt-6" /> : null}

          <div className="mt-6 flex flex-col gap-5 border-t border-line pt-5 empty:hidden lg:mt-8 lg:gap-6 lg:pt-6">
            <ProductFrequency product={product} />
            <ProductKeySpecs product={product} />
          </div>

          <div className="mt-6 border-t border-line pt-5 lg:mt-8 lg:pt-6">
            <ProductPrice product={product} />
            <ProductPurchase
              productId={product.id}
              productName={product.name}
              price={product.priceType === 'fixed' ? product.price : null}
              className="mt-5"
            />
            <p className="mt-5 text-small text-ink-secondary">
              Доставку рассчитывает менеджер при согласовании.{' '}
              <Link href="/delivery" className="text-link">
                Подробнее<span className="sr-only"> о доставке и оплате</span>
              </Link>
            </p>
          </div>
        </div>
      </div>

      <section aria-labelledby="specs-title" className={cn(SECTION, 'mt-16 lg:mt-24')}>
        <h2 id="specs-title" className="text-title font-medium lg:text-heading">
          Характеристики
        </h2>
        <div className="min-w-0 max-w-[52rem]">
          <SpecTable product={product} />
          <ProductNotes notes={product.notes} className="mt-10" />
          <ProductSourceInfo
            product={product}
            sourceTexts={sourceTexts}
            records={records}
            className="mt-10"
          />
        </div>
      </section>

      <ProductRecommendations
        recommendations={recommendations}
        className="mt-16 border-t border-line pt-10 lg:mt-24 lg:pt-16"
      />
      {/* Место под липкую панель покупки на < lg: она не закрывает конец страницы. */}
      <div aria-hidden className="h-16 lg:hidden" />
    </>
  );
}
