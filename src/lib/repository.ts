import 'server-only';

import categoriesJson from '@/data/categories.generated.json';
import issuesJson from '@/data/import-issues.generated.json';
import reportJson from '@/data/import-report.generated.json';
import productsJson from '@/data/products.generated.json';
import recommendationsJson from '@/data/recommendations.generated.json';
import sourceRecordsJson from '@/data/source-records.generated.json';
import { site } from '@/config/site';
import type {
  Category,
  ImportIssue,
  ImportReport,
  Product,
  ProductRecommendation,
  SourceRecord,
} from '@/types/catalog';

/**
 * Репозиторий каталога — ЕДИНСТВЕННАЯ точка чтения данных (CLAUDE.md, docs/DESIGN.md §10).
 *
 * Сейчас источник — `src/data/*.generated.json` (их генерирует `npm run import:catalog`).
 * При сращивании с Admik модуль переписывается на Storefront API (`/api/storefront/v1/*`):
 * сигнатуры уже асинхронные, поэтому страницы и компоненты не меняются. Компоненты и страницы
 * JSON каталога напрямую не импортируют; клиентские компоненты получают данные пропсами от
 * серверных (модуль помечен `server-only` и в браузер не попадает).
 *
 * Правила, которые обеспечивает репозиторий, а не страницы:
 * - количества категорий считаются по поддереву (товары подкатегорий входят в родителя);
 * - всё упорядочено по `sortIndex` (порядок прайса);
 * - скрытые в overrides.json товары в данных отсутствуют — ссылки на них (рекомендации,
 *   getProductsByIds) молча отбрасываются;
 * - рекомендации: публично только `approved`; `draft` — только при `site.demo.enabled`.
 */

// ---------------------------------------------------------------------------
// Типы ответа.
// ---------------------------------------------------------------------------

/** Категория с путём, адресом и количеством товаров в поддереве. */
export interface CategoryNode extends Category {
  /** Сегменты URL от корня: ['antennas', 'horn']. */
  slugPath: string[];
  /** `/catalog/antennas/horn`. */
  href: `/catalog/${string}`;
  /** Товаров в категории вместе с подкатегориями. */
  productCount: number;
  /** Подкатегории по sortIndex. */
  children: CategoryNode[];
}

export interface CategoryMatch {
  /** Найденная категория. */
  category: CategoryNode;
  /** Путь от корня до неё включительно — для крошек и SubcategoryNav. */
  trail: CategoryNode[];
}

export interface Recommendations {
  /** Подтверждённые менеджером связи — показываются всегда. */
  approved: Product[];
  /** Черновые связи из названий прайса — только в демо (пусто, если `!site.demo.enabled`). */
  drafts: Product[];
  /** Пояснение менеджера к связи по id рекомендованного товара (пустые не включаются). */
  notes: Record<string, string>;
}

/**
 * Лёгкий индекс для подсказок и поиска в браузере (`suggest`, `searchProducts`).
 * Товары — те же объекты `Product`, но без тяжёлых полей: в `attributes` только частота (её
 * читает поиск по числу), `notes`, `images`, `sourceIds`, `issueIds` пусты. Для показа
 * характеристик индекс НЕ использовать — только для поиска и подсказок.
 */
export interface SearchIndex {
  products: Product[];
  categories: Category[];
}

// ---------------------------------------------------------------------------
// Данные и производные (вычисляются один раз на процесс: данные статичны).
// ---------------------------------------------------------------------------

const bySortIndex = <T extends { sortIndex: number }>(a: T, b: T) => a.sortIndex - b.sortIndex;

const products: readonly Product[] = [...(productsJson as unknown as Product[])].sort(bySortIndex);
const categories: readonly Category[] = [...(categoriesJson as unknown as Category[])].sort(
  bySortIndex,
);
const sourceRecords = sourceRecordsJson as unknown as SourceRecord[];
const issues = issuesJson as unknown as ImportIssue[];
const report = reportJson as unknown as ImportReport;
const recommendations = recommendationsJson as unknown as ProductRecommendation[];

const productById = new Map(products.map((product) => [product.id, product]));
const productBySlug = new Map(products.map((product) => [product.slug, product]));

interface CategoryIndex {
  roots: CategoryNode[];
  byId: Map<string, CategoryNode>;
}

let categoryIndex: CategoryIndex | null = null;

function buildCategoryIndex(): CategoryIndex {
  const byId = new Map<string, CategoryNode>();
  const countFor = (id: string) =>
    products.filter((product) => product.categoryPath.includes(id)).length;
  for (const category of categories) {
    byId.set(category.id, {
      ...category,
      slugPath: [],
      href: '/catalog/',
      productCount: countFor(category.id),
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  for (const category of categories) {
    const node = byId.get(category.id)!;
    const parent = category.parentId === null ? undefined : byId.get(category.parentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  const assignPaths = (nodes: CategoryNode[], prefix: string[]) => {
    for (const node of nodes) {
      node.slugPath = [...prefix, node.slug];
      node.href = `/catalog/${node.slugPath.join('/')}`;
      node.children.sort(bySortIndex);
      assignPaths(node.children, node.slugPath);
    }
  };
  roots.sort(bySortIndex);
  assignPaths(roots, []);
  return { roots, byId };
}

function index(): CategoryIndex {
  categoryIndex ??= buildCategoryIndex();
  return categoryIndex;
}

let searchIndex: SearchIndex | null = null;

// ---------------------------------------------------------------------------
// Товары.
// ---------------------------------------------------------------------------

/** Все видимые товары в порядке прайса. */
export async function getProducts(): Promise<Product[]> {
  return [...products];
}

/** Товар по slug или null (неизвестный или скрытый → страница делает notFound()). */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  return productBySlug.get(slug) ?? null;
}

/** Товары по id в порядке `ids`; отсутствующие (удалённые, скрытые) пропускаются. */
export async function getProductsByIds(ids: readonly string[]): Promise<Product[]> {
  return ids.flatMap((id) => {
    const product = productById.get(id);
    return product === undefined ? [] : [product];
  });
}

/** Товары категории вместе с подкатегориями, в порядке прайса. */
export async function getProductsInCategory(categoryId: string): Promise<Product[]> {
  return products.filter((product) => product.categoryPath.includes(categoryId));
}

/**
 * «К этому товару подойдёт» (§2.6): без самого товара, скрытых и отсутствующих, в порядке
 * `position`, без повторов. Черновые — только в демо-режиме.
 */
export async function getRecommendations(productId: string): Promise<Recommendations> {
  const links = recommendations
    .filter((link) => link.productId === productId && link.recommendedId !== productId)
    .sort((a, b) => a.position - b.position);
  const seen = new Set<string>();
  const result: Recommendations = { approved: [], drafts: [], notes: {} };
  for (const link of links) {
    const product = productById.get(link.recommendedId);
    if (product === undefined || seen.has(product.id)) continue;
    if (link.status === 'draft' && !site.demo.enabled) continue;
    seen.add(product.id);
    (link.status === 'approved' ? result.approved : result.drafts).push(product);
    if (link.note.trim() !== '') result.notes[product.id] = link.note;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Категории.
// ---------------------------------------------------------------------------

/** Все категории плоским списком по sortIndex (для движка: `applyQuery`, `suggest`). */
export async function getCategories(): Promise<Category[]> {
  return [...categories];
}

/** Дерево категорий верхнего уровня с подкатегориями и количествами по поддереву. */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  return index().roots;
}

/** Категория по id или null. */
export async function getCategoryById(categoryId: string): Promise<CategoryNode | null> {
  return index().byId.get(categoryId) ?? null;
}

/** Путь категорий от корня до `categoryId` включительно (крошки товара). Неизвестный id — []. */
export async function getCategoryTrail(categoryId: string): Promise<CategoryNode[]> {
  const trail: CategoryNode[] = [];
  const { byId } = index();
  for (
    let node = byId.get(categoryId);
    node !== undefined && trail.length < 8;
    node = node.parentId === null ? undefined : byId.get(node.parentId)
  ) {
    trail.unshift(node);
  }
  return trail;
}

/**
 * Категория по сегментам URL: ['antennas'] или ['antennas', 'horn']. Каждый следующий сегмент
 * должен быть подкатегорией предыдущего (§2.5: `sub.parentId === category.id`), иначе null.
 */
export async function getCategoryBySlugPath(
  slugs: readonly string[],
): Promise<CategoryMatch | null> {
  if (slugs.length === 0) return null;
  let level: CategoryNode[] = index().roots;
  const trail: CategoryNode[] = [];
  for (const slug of slugs) {
    const node = level.find((candidate) => candidate.slug === slug);
    if (node === undefined) return null;
    trail.push(node);
    level = node.children;
  }
  return { category: trail[trail.length - 1], trail };
}

// ---------------------------------------------------------------------------
// Происхождение данных и отчёт импорта.
// ---------------------------------------------------------------------------

/**
 * Строки прайса товара (все решения импорта, включая `conflict-attached` — страница товара
 * их публично не показывает, §2.6). Порядок: как в `Product.sourceIds`, затем остальные.
 */
export async function getSourceRecordsForProduct(productId: string): Promise<SourceRecord[]> {
  const order = productById.get(productId)?.sourceIds ?? [];
  const rank = (record: SourceRecord) => {
    const position = order.indexOf(record.id);
    return position < 0 ? order.length : position;
  };
  return sourceRecords
    .filter((record) => record.productId === productId)
    .sort((a, b) => rank(a) - rank(b));
}

/** Проблемы импорта, затрагивающие товар (`sheet-conflict` и др.). */
export async function getIssuesForProduct(productId: string): Promise<ImportIssue[]> {
  return issues.filter((issue) => issue.productIds.includes(productId));
}

export async function getImportReport(): Promise<ImportReport> {
  return report;
}

/** Все строки прайса — служебная страница `/import-report`. */
export async function getAllSourceRecords(): Promise<SourceRecord[]> {
  return [...sourceRecords];
}

export async function getAllIssues(): Promise<ImportIssue[]> {
  return [...issues];
}

// ---------------------------------------------------------------------------
// Поиск на клиенте.
// ---------------------------------------------------------------------------

/** Индекс для подсказок в шапке (см. `SearchIndex`): ~50 КБ вместо ~200 КБ полного каталога. */
export async function getSearchIndex(): Promise<SearchIndex> {
  searchIndex ??= {
    categories: [...categories],
    products: products.map((product) => ({
      ...product,
      attributes: product.attributes.filter((attr) => attr.code === 'frequency'),
      notes: [],
      images: [],
      sourceIds: [],
      issueIds: [],
    })),
  };
  return searchIndex;
}
