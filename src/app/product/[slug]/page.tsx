import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import type { BreadcrumbItem } from '@/components/layout/Breadcrumbs';
import { ConflictNotice } from '@/components/product/ConflictNotice';
import { ProductFrequency } from '@/components/product/ProductFrequency';
import { ProductNotes } from '@/components/product/ProductNotes';
import { ProductPhoto } from '@/components/product/ProductPhoto';
import { ProductPrice } from '@/components/product/ProductPrice';
import { ProductPurchase } from '@/components/product/ProductPurchase';
import { ProductRecommendations } from '@/components/product/ProductRecommendations';
import { SourceList } from '@/components/product/SourceList';
import { SpecTable } from '@/components/product/SpecTable';
import { JsonLd } from '@/components/ui/JsonLd';
import { NoPhoto } from '@/components/ui/NoPhoto';
import { rootCategoryOf } from '@/lib/catalog';
import { TechText } from '@/components/product/SpecLine';
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
 * Товар (DESIGN §2.6). Статическая страница на каждую видимую позицию; неизвестный или скрытый
 * slug → 404. Раскладка 1 : 1,618: слева фото (или заглушка), справа — решение о покупке
 * (частота, цена, «В корзину») и полная картина данных с происхождением; под сеткой —
 * «К этому товару подойдёт».
 *
 * Фото нет — товар важнее декора: на < lg большой заглушки нет (значок категории 48 px рядом с
 * кодом), на ≥ lg — заглушка 4:3, липкая, чтобы левая колонка не пустела при прокрутке. Фото
 * есть — оно показывается на всех ширинах (на < lg над названием), тоже 4:3 и липкое на ≥ lg.
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

const DIVIDER = 'my-6 border-t border-line';

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

      <div className="grid gap-8 lg:grid-cols-golden xl:gap-12">
        <div className={cn(photo === null && 'hidden lg:block')} data-testid="product-media">
          <div className="lg:sticky lg:top-6">
            {photo === null ? (
              <NoPhoto categoryId={rootCategoryOf(product)} variant="product" />
            ) : (
              <ProductPhoto
                src={photo}
                alt={product.name}
                sizes="(min-width: 80rem) 30rem, (min-width: 64rem) 38vw, 100vw"
                preload
              />
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="lg:text-heading">
            {/* Неразрывность единиц и кодов («1 м», «SMA-male», «RG-316») — общий помощник каталога. */}
            <TechText text={product.name} />
          </h1>
          <div className="mt-3 flex items-center gap-3">
            {photo === null ? (
              <NoPhoto categoryId={rootCategoryOf(product)} size={48} className="lg:hidden" />
            ) : null}
            <div className="min-w-0">
              <dl className="flex flex-wrap items-baseline gap-x-2">
                <dt className="text-small text-ink-muted">Код в каталоге</dt>
                <dd className="font-mono text-small text-ink" data-testid="product-code">
                  {product.code}
                </dd>
              </dl>
              <p className="mt-0.5 text-caption text-ink-muted">
                Внутренний код магазина, не артикул производителя.
              </p>
            </div>
          </div>

          {hasConflict ? <ConflictNotice className="mt-6" /> : null}
          <ProductFrequency product={product} className="mt-6" />

          <div className={DIVIDER} />

          <ProductPrice product={product} />
          <ProductPurchase productId={product.id} productName={product.name} className="mt-4" />
          <p className="mt-3 text-small text-ink-secondary">
            Доставка — рассчитает менеджер.{' '}
            <Link href="/delivery" className="text-link">
              Подробнее<span className="sr-only"> о доставке и оплате</span>
            </Link>
          </p>

          <div className={DIVIDER} />

          <section aria-labelledby="specs-title">
            <h2 id="specs-title" className="mb-2">
              Характеристики
            </h2>
            <SpecTable product={product} sourceTexts={sourceTexts} />
          </section>

          <ProductNotes notes={product.notes} className="mt-10" />
          <SourceList records={records} productName={product.name} className="mt-10" />
        </div>
      </div>

      <ProductRecommendations recommendations={recommendations} className="mt-10 lg:mt-16" />
    </>
  );
}
