import Link from 'next/link';
import type { CSSProperties } from 'react';

import { NeedsReviewBadge } from '@/components/ui/Badge';
import { ProductBandScale } from '@/components/ui/BandScale';
import { Price } from '@/components/ui/Price';
import { attributeLabel, formatAttrValue, getSpecLine } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { capitalize } from '@/lib/format';
import type { AttrCode, AttrStatus, Product, ProductAttribute } from '@/types/catalog';

import { AddToCartButton } from './AddToCartButton';
import { FavoriteButton } from './FavoriteButton';
import { ProductMedia } from './ProductMedia';
import { StatusValue, TechText, specLineHasInferred } from './SpecLine';

/**
 * Список товаров (DESIGN § R.7) — вид по умолчанию в каталоге, поиске и избранном. Одна строка —
 * один товар: миниатюра · название и код · характеристики с подписями · цена и действия.
 *
 *   const columns = columnsForCategory(category?.id ?? null);   // null — смешанный вариант
 *   <ProductList products={items} columns={columns} rootCategoryId="antennas" label="Антенны" />
 *   {hasInferredValues(items, columns) && <p …>{INFERRED_FOOTNOTE}</p>}
 *
 * Характеристики: на странице категории — колонки категории (`columnsForCategory`, одинаковые у
 * всех строк — значения стоят друг под другом, как в таблице); в смешанном варианте (весь
 * каталог, поиск, избранное) — ключевые параметры `getSpecLine` и листовая категория над
 * названием (нужен `categoryNames`).
 *
 * Раскладка зависит от ширины списка, а не экрана (container queries): рядом с панелью подбора
 * колонка выдачи уже экрана. Узкий список (< 36rem) — карточка: миниатюра рядом с названием,
 * характеристики в две колонки, цена и кнопки внизу. Широкий — строка: миниатюра слева, цена и
 * кнопки — правой колонкой; характеристики под названием, в одну линию (с 52rem).
 */

/** Колонка характеристик: код характеристики или составная. */
export type ColumnKey = AttrCode | 'category' | 'specs' | 'ports' | 'end1' | 'end2';

const MIXED: readonly ColumnKey[] = ['category', 'specs'];

/**
 * Колонки категорий страницы. Конструкцию антенн отдельно не показывают: она уже в названии
 * («Антенна логопериодическая Тип1») и в подкатегориях над выдачей.
 */
const COLUMNS_BY_CATEGORY: Readonly<Record<string, readonly ColumnKey[]>> = {
  antennas: ['frequency', 'gain_dbi', 'connector'],
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

/** Подпись колонки: подпись движка `attributeLabel(code, root)` или имя составной колонки. */
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

/** Значение колонки: текст с заглавной, худший статус составных; null — «не указано». */
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

/** В показанных значениях есть «принято по контексту» — под списком нужна сноска. */
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
 * Код позиции в каталоге с подписью для вспомогательных технологий: внутренний ID, а не артикул
 * производителя (ТЗ §4 п.16) — без подписи «ANT-001» читается как заводской номер.
 */
export function ProductCode({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn('font-mono', className)} title="Код в каталоге">
      <span className="sr-only">Код в каталоге: </span>
      {code}
    </span>
  );
}

/** Ячейка характеристики строки: подпись над значением. */
interface SpecCell {
  key: string;
  label: string;
  value: CellValue | null;
  /** Частота — под значением шкала диапазона. */
  frequency: boolean;
  note?: string;
}

function specCells(
  product: Product,
  columns: readonly ColumnKey[],
  rootCategoryId: string | null | undefined,
): SpecCell[] {
  if (columns.includes('specs')) {
    return getSpecLine(product).map((item) => ({
      key: item.key,
      label: item.label,
      value: { text: item.text, status: item.status },
      frequency: item.key === 'frequency',
      note: item.note,
    }));
  }
  return columns.map((key) => ({
    key,
    label: columnHeader(key, rootCategoryId),
    value: cellValue(product, key),
    frequency: key === 'frequency',
  }));
}

/**
 * «Уточняется» у названия — только если спорное значение не видно в характеристиках строки
 * (например, затухание у фильтров на резонаторах): иначе бейдж стоял бы дважды.
 */
function hasHiddenNeedsReview(product: Product, cells: readonly SpecCell[]): boolean {
  if (!product.attributes.some((attr) => attr.status === 'needs-review')) return false;
  return !cells.some((cell) => cell.value?.status === 'needs-review');
}

function NotSpecified() {
  return (
    <span className="text-ink-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">не указано</span>
    </span>
  );
}

export interface ProductListItemProps {
  product: Product;
  columns: readonly ColumnKey[];
  rootCategoryId?: string | null;
  /** Листовая категория — над названием в смешанном варианте. */
  categoryName?: string;
}

export function ProductListItem({
  product,
  columns,
  rootCategoryId,
  categoryName,
}: ProductListItemProps) {
  const href = `/product/${product.slug}`;
  const cells = specCells(product, columns, rootCategoryId);
  return (
    <li className="group/row grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-4 py-5 transition-colors duration-fast @min-[36rem]:grid-cols-[5rem_minmax(0,1fr)_auto] @min-[36rem]:gap-x-6 @min-[36rem]:py-4">
      {/* Миниатюра — дубль ссылки-названия: вне порядка Tab и дерева доступности. */}
      <Link href={href} tabIndex={-1} aria-hidden className="block size-16 @min-[36rem]:size-20">
        <ProductMedia
          product={product}
          variant="thumb"
          className="transition-opacity duration-fast group-hover/row:opacity-80"
        />
      </Link>

      <div className="min-w-0">
        {categoryName ? (
          <p className="mb-1 text-caption text-ink-muted">
            <TechText text={categoryName} />
          </p>
        ) : null}
        <h3 className="text-body font-semibold">
          <Link
            href={href}
            className="text-ink decoration-1 underline-offset-[0.2em] hover:underline"
          >
            <TechText text={product.name} />
          </Link>
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
          <ProductCode code={product.code} />
          {hasHiddenNeedsReview(product, cells) ? <NeedsReviewBadge /> : null}
        </p>
        {cells.length > 0 ? (
          <dl
            style={{ '--spec-cols': Math.max(cells.length, 3) } as CSSProperties}
            className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 @min-[52rem]:grid-cols-[repeat(var(--spec-cols),minmax(0,1fr))]"
          >
            {cells.map((cell) => (
              <div key={cell.key} className="min-w-0">
                <dt className="spec-label">{cell.label}</dt>
                <dd className="mt-0.5 text-small text-ink">
                  {cell.value === null ? (
                    <NotSpecified />
                  ) : (
                    <StatusValue text={cell.value.text} status={cell.value.status} />
                  )}
                  {cell.frequency ? (
                    <ProductBandScale product={product} size="sm" className="mt-1.5 max-w-32" />
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="col-span-2 flex items-center justify-between gap-4 @min-[36rem]:col-span-1 @min-[36rem]:min-w-[10.5rem] @min-[36rem]:flex-col @min-[36rem]:items-end @min-[36rem]:justify-start">
        <Price
          amount={product.priceType === 'fixed' ? product.price : null}
          size="lg"
          requestForm="compact"
        />
        <div className="flex items-center gap-1.5">
          <FavoriteButton
            productId={product.id}
            productName={product.name}
            size="md"
            className="max-lg:size-11"
          />
          {/* Ширина под «В корзине» — строка не сдвигается после гидратации. */}
          <AddToCartButton
            productId={product.id}
            productName={product.name}
            size="md"
            className="min-w-[8.25rem] max-lg:h-11"
          />
        </div>
      </div>
    </li>
  );
}

export interface ProductListProps {
  products: readonly Product[];
  columns: readonly ColumnKey[];
  /** Корневая категория страницы — подписи движка («Разъём порта 1» у МШУ). */
  rootCategoryId?: string | null;
  /** id категории → название (смешанный вариант: категория над названием). */
  categoryNames?: Readonly<Record<string, string>>;
  /** Доступное имя списка: «Антенны: товары, страница 1 из 1». */
  label?: string;
  className?: string;
}

/** Список строк. `@container` — раскладка строки по ширине списка. */
export function ProductList({
  products,
  columns,
  rootCategoryId,
  categoryNames,
  label,
  className,
}: ProductListProps) {
  const mixed = columns.includes('category');
  return (
    <ul
      aria-label={label}
      className={cn('@container divide-y divide-line border-y border-line', className)}
    >
      {products.map((product) => (
        <ProductListItem
          key={product.id}
          product={product}
          columns={columns}
          rootCategoryId={rootCategoryId}
          categoryName={mixed ? categoryNames?.[product.categoryId] : undefined}
        />
      ))}
    </ul>
  );
}
