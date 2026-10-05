import Link from 'next/link';

import { NeedsReviewBadge } from '@/components/ui/Badge';
import { ProductBandScale } from '@/components/ui/BandScale';
import { Price } from '@/components/ui/Price';
import { attributeLabel, formatAttrValue, getSpecLine } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { capitalize } from '@/lib/format';
import type { AttrCode, AttrStatus, Product, ProductAttribute } from '@/types/catalog';

import { AddToCartButton } from './AddToCartButton';
import { FavoriteButton } from './FavoriteButton';
import { SpecLine, StatusValue, TechText, specLineHasInferred } from './SpecLine';

/**
 * Табличный вид списка (DESIGN §4.7, §5.9.22): строка таблицы (≥ lg) и строка списка (< lg),
 * колонки — по категории страницы.
 *
 *   const columns = columnsForCategory(category?.id ?? null);   // null — смешанный вариант
 *   <ProductTable products={items} columns={columns} caption="Антенны: товары, страница 1 из 1"
 *     rootCategoryId="antennas" />                               // <table class="hidden lg:table">
 *   <ProductList products={items} columns={columns} />          // <ul class="lg:hidden">
 *   {hasInferredValues(items, columns) && <p …>{INFERRED_FOOTNOTE}</p>}
 *
 * Смешанный вариант (каталог целиком, поиск, избранное, главная): «Категория» (листовая) и
 * «Характеристики» (`formatSpecLine(getSpecLine())` с BandScale) — нужен `categoryNames`.
 * Таблица и список рендерятся оба и переключаются CSS; дублирующихся id нет.
 */

/** Колонка таблицы: код характеристики или составная. */
export type ColumnKey = AttrCode | 'category' | 'specs' | 'ports' | 'end1' | 'end2';

const MIXED: readonly ColumnKey[] = ['category', 'specs'];

/** Колонки категорий страницы (§4.7). */
const COLUMNS_BY_CATEGORY: Readonly<Record<string, readonly ColumnKey[]>> = {
  antennas: ['antenna_design', 'frequency', 'gain_dbi', 'connector'],
  'antennas-log-periodic': ['frequency', 'gain_dbi', 'connector'],
  'antennas-corner': ['frequency', 'gain_dbi', 'connector'],
  'antennas-yagi': ['frequency', 'gain_dbi', 'connector'],
  'antennas-horn': ['frequency', 'gain_dbi', 'connector'],
  'antennas-micro-horn': ['frequency', 'gain_dbi', 'connector'],
  'antennas-mini': ['frequency', 'gain_dbi'],
  covers: ['compatible_model'],
  masts: ['height', 'weight', 'max_load'],
  lna: ['frequency', 'gain_db', 'ports', 'ip67', 'power_connector'],
  'rf-filters': ['filter_group', 'frequency', 'ports'],
  'rf-filters-bandpass': ['frequency', 'ports'],
  'rf-filters-channel': ['frequency', 'ports'],
  'rf-filters-cavity': ['frequency', 'rejection'],
  cables: ['cable_length', 'cable_type', 'end1', 'end2'],
  attenuators: ['attenuation_range', 'max_power'],
};

/** Колонки для страницы категории; null или неизвестная — смешанный вариант. */
export function columnsForCategory(categoryId: string | null | undefined): readonly ColumnKey[] {
  return (categoryId && COLUMNS_BY_CATEGORY[categoryId]) || MIXED;
}

const COMPOSITE_HEADERS: Partial<Record<ColumnKey, string>> = {
  category: 'Категория',
  specs: 'Характеристики',
  ports: 'Разъёмы',
  end1: '1-й конец',
  end2: '2-й конец',
};

/** Заголовок колонки: подпись движка `attributeLabel(code, root)` или имя составной колонки. */
export function columnHeader(key: ColumnKey, rootCategoryId?: string | null): string {
  return COMPOSITE_HEADERS[key] ?? attributeLabel(key as AttrCode, rootCategoryId);
}

const STATUS_RANK: Readonly<Record<AttrStatus, number>> = {
  confirmed: 0,
  inferred: 1,
  'needs-review': 2,
};

interface CellValue {
  text: string;
  status: AttrStatus;
}

const findAttr = (product: Product, code: AttrCode): ProductAttribute | undefined =>
  product.attributes.find((attr) => attr.code === code);

/** Значение ячейки (§4.7): текст с заглавной, худший статус составных; null — «не указано». */
export function cellValue(product: Product, key: ColumnKey): CellValue | null {
  const parts = (codes: AttrCode[], separator: string): CellValue | null => {
    const found = codes
      .map((code) => findAttr(product, code))
      .filter((attr): attr is ProductAttribute => attr !== undefined);
    if (found.length === 0) return null;
    const status = found.reduce<AttrStatus>(
      (worst, attr) => (STATUS_RANK[attr.status] > STATUS_RANK[worst] ? attr.status : worst),
      'confirmed',
    );
    return {
      text: capitalize(found.map((attr) => formatAttrValue(attr.code, attr.value)).join(separator)),
      status,
    };
  };
  switch (key) {
    case 'category':
    case 'specs':
      return null;
    case 'ports':
      return parts(['port1_connector', 'port2_connector'], ' — ');
    case 'end1':
      return parts(['port1_connector', 'port1_shape'], ' ');
    case 'end2':
      return parts(['port2_connector', 'port2_shape'], ' ');
    default:
      return parts([key], '');
  }
}

/** В показанных значениях есть «принято по контексту» — под таблицей нужна сноска (§2.3 п.6). */
export function hasInferredValues(
  products: readonly Product[],
  columns: readonly ColumnKey[],
): boolean {
  return products.some((product) =>
    columns.some((key) =>
      key === 'specs'
        ? specLineHasInferred(product)
        : cellValue(product, key)?.status === 'inferred',
    ),
  );
}

/**
 * «Уточняется» у названия — только если спорное значение не видно в колонках строки (например,
 * затухание у фильтров на резонаторах): иначе бейдж стоял бы дважды.
 */
function hasHiddenNeedsReview(product: Product, columns: readonly ColumnKey[]): boolean {
  if (!product.attributes.some((attr) => attr.status === 'needs-review')) return false;
  const shown = columns.some((key) =>
    key === 'specs'
      ? getSpecLine(product).some((item) => item.status === 'needs-review')
      : cellValue(product, key)?.status === 'needs-review',
  );
  return !shown;
}

function NotSpecified() {
  return (
    <span className="text-ink-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">не указано</span>
    </span>
  );
}

function Cell({
  product,
  column,
  categoryName,
}: {
  product: Product;
  column: ColumnKey;
  categoryName?: string;
}) {
  if (column === 'category')
    return categoryName ? <TechText text={categoryName} /> : <NotSpecified />;
  if (column === 'specs') {
    return (
      <div className="flex flex-col gap-1.5">
        <SpecLine product={product} className="text-ink" />
        <ProductBandScale product={product} size="sm" className="max-w-40" />
      </div>
    );
  }
  const value = cellValue(product, column);
  if (value === null) return <NotSpecified />;
  if (column === 'frequency') {
    return (
      <div className="flex flex-col gap-1.5">
        <StatusValue text={value.text} status={value.status} className="whitespace-nowrap" />
        <ProductBandScale product={product} size="sm" className="max-w-40" />
      </div>
    );
  }
  return <StatusValue text={value.text} status={value.status} />;
}

const TH =
  'py-2.5 px-3 text-left font-medium text-ink-muted whitespace-nowrap border-b border-line';

/** Шапка таблицы: «Наименование» · колонки · «Цена» · sr «Действия». */
export function ProductTableHead({
  columns,
  rootCategoryId,
}: {
  columns: readonly ColumnKey[];
  /** Корневая категория страницы — для подписей движка (у МШУ «Разъём порта 1» и т. п.). */
  rootCategoryId?: string | null;
}) {
  return (
    <thead>
      <tr>
        <th scope="col" className={cn(TH, 'pl-0')}>
          Наименование
        </th>
        {columns.map((column) => (
          <th key={column} scope="col" className={TH}>
            {columnHeader(column, rootCategoryId)}
          </th>
        ))}
        <th scope="col" className={cn(TH, 'text-right')}>
          Цена
        </th>
        <th scope="col" className={cn(TH, 'pr-0 text-right')}>
          <span className="sr-only">Действия</span>
        </th>
      </tr>
    </thead>
  );
}

export interface ProductRowProps {
  product: Product;
  columns: readonly ColumnKey[];
  /** Листовая категория — колонка «Категория» смешанного варианта. */
  categoryName?: string;
}

/**
 * Код позиции в каталоге с подписью для вспомогательных технологий: внутренний ID, а не артикул
 * производителя (ТЗ §4 п.16) — без подписи «ANT-001» читается как заводской номер.
 */
export function ProductCode({ code }: { code: string }) {
  return (
    <span className="font-mono" title="Код в каталоге">
      <span className="sr-only">Код в каталоге: </span>
      {code}
    </span>
  );
}

/**
 * Строка таблицы (≥ lg). Не кликабельна целиком: ссылка — название.
 *
 * Ячейки выровнены по базовой линии первой строки (`align-baseline`), а не по верху: название и
 * цена (16 px), значения (14 px) и подпись кнопки высотой 32 px стоят на одной линии — при
 * `align-top` подпись кнопки опускалась на ~3 px ниже названия.
 */
export function ProductRow({ product, columns, categoryName }: ProductRowProps) {
  return (
    <tr className="border-b border-line-subtle transition-colors duration-fast hover:bg-surface-muted">
      <td className="min-w-[16rem] py-3 pr-3 pl-0 align-baseline">
        <Link
          href={`/product/${product.slug}`}
          className="text-body font-medium text-ink hover:underline"
        >
          <TechText text={product.name} />
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
          <ProductCode code={product.code} />
          {hasHiddenNeedsReview(product, columns) ? <NeedsReviewBadge /> : null}
        </div>
      </td>
      {columns.map((column) => (
        <td key={column} className="px-3 py-3 align-baseline text-ink">
          <Cell product={product} column={column} categoryName={categoryName} />
        </td>
      ))}
      <td className="px-3 py-3 text-right align-baseline">
        <Price
          amount={product.priceType === 'fixed' ? product.price : null}
          size="md"
          requestForm="compact"
        />
      </td>
      <td className="py-3 pr-0 pl-3 text-right align-baseline whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          {/* Ширина под «В корзине» — колонки не сдвигаются после гидратации. */}
          <AddToCartButton
            productId={product.id}
            productName={product.name}
            size="sm"
            className="min-w-[7.5rem]"
          />
          <FavoriteButton productId={product.id} productName={product.name} size="sm" />
        </div>
      </td>
    </tr>
  );
}

/**
 * Строка списка (ResultsList): там, где таблица не помещается. На < md — столбиком: название →
 * мета → параметры → шкала → цена и действия. С md (в т. ч. 1024–1343 px рядом с панелью) —
 * в одну строку: слева название, мета, параметры и шкала, справа цена и действия на базовой
 * линии названия — строка вдвое ниже, на экране помещается вдвое больше позиций.
 */
export function ProductListItem({
  product,
  categoryName,
}: {
  product: Product;
  categoryName?: string;
}) {
  return (
    <li className="grid gap-2 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-baseline md:gap-x-6 md:py-3">
      <div className="grid min-w-0 gap-1.5">
        <Link
          href={`/product/${product.slug}`}
          className="text-body font-semibold text-ink hover:underline"
        >
          <TechText text={product.name} />
        </Link>
        <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-caption text-ink-muted">
          <ProductCode code={product.code} />
          {categoryName ? (
            <span>
              · <TechText text={categoryName} />
            </span>
          ) : null}
          {hasHiddenNeedsReview(product, ['specs']) ? <NeedsReviewBadge className="ml-1" /> : null}
        </p>
        <SpecLine product={product} />
        <ProductBandScale product={product} size="sm" className="max-w-60" />
      </div>
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <Price
          amount={product.priceType === 'fixed' ? product.price : null}
          size="md"
          requestForm="compact"
        />
        <div className="flex items-center gap-2">
          <FavoriteButton productId={product.id} productName={product.name} size="md" />
          <AddToCartButton productId={product.id} productName={product.name} size="md" />
        </div>
      </div>
    </li>
  );
}

export interface ProductCollectionProps {
  products: readonly Product[];
  columns: readonly ColumnKey[];
  /** id категории → название (смешанный вариант: колонка «Категория», мета списка). */
  categoryNames?: Readonly<Record<string, string>>;
  className?: string;
}

/** Таблица ≥ lg (ResultsTable): `caption` — «{Категория}: товары, страница {n} из {m}». */
export function ProductTable({
  products,
  columns,
  categoryNames,
  caption,
  rootCategoryId,
  className,
}: ProductCollectionProps & { caption: string; rootCategoryId?: string | null }) {
  return (
    <table className={cn('hidden w-full text-small lg:table', className)}>
      <caption className="sr-only">{caption}</caption>
      <ProductTableHead columns={columns} rootCategoryId={rootCategoryId} />
      <tbody>
        {products.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            columns={columns}
            categoryName={categoryNames?.[product.categoryId]}
          />
        ))}
      </tbody>
    </table>
  );
}

/** Список < lg (ResultsList). */
export function ProductList({
  products,
  columns,
  categoryNames,
  className,
}: ProductCollectionProps) {
  const mixed = columns.includes('category');
  return (
    <ul
      className={cn('divide-y divide-line-subtle border-y border-line-subtle lg:hidden', className)}
    >
      {products.map((product) => (
        <ProductListItem
          key={product.id}
          product={product}
          categoryName={mixed ? categoryNames?.[product.categoryId] : undefined}
        />
      ))}
    </ul>
  );
}
