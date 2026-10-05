/**
 * Выдача каталога целиком: контекст категории → поиск → фильтры → сортировка → страница.
 *
 * Чистая функция над массивом товаров: одинаково работает на сервере (страница категории) и в
 * браузере (поиск, подсказки), данные приходят из репозитория, а не из импорта JSON.
 */

import type { Category, Product } from '@/types/catalog';

import { runFilters } from './filters.ts';
import type { Facet } from './filters.ts';
import { searchProducts } from './search.ts';
import { DEFAULT_PAGE_SIZE } from './state.ts';
import type { ActiveChip, CatalogState, SortKey } from './state.ts';

export interface QueryContext {
  /** Категория-контекст (страница /catalog/…); null или отсутствие — весь каталог. */
  categoryId?: string | null;
  categories: readonly Category[];
  pageSize?: number;
}

export interface QueryResult {
  /** Товары текущей страницы. */
  items: Product[];
  /** Всего результатов после поиска и фильтров. */
  total: number;
  /** Не меньше 1: пустая выдача — одна пустая страница. */
  totalPages: number;
  /** Фактическая страница: за пределами — последняя валидная. */
  page: number;
  pageSize: number;
  facets: Facet[];
  activeChips: ActiveChip[];
  /** Состояние после очистки: неприменимые к категории и несуществующие значения отброшены. */
  state: CatalogState;
  /** В наборе есть значения inferred — переключатель «только подтверждённые» имеет смысл. */
  strictAvailable: boolean;
}

const nameCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

/**
 * Сортировка выдачи.
 * - 'default' — порядок прайса (sortIndex); при поиске — релевантность, при равенстве — прайс;
 * - 'price-asc' / 'price-desc' — по цене; товары «по запросу» ВСЕГДА в конце, в порядке прайса:
 *   их цена неизвестна, а не нулевая, поэтому «дешевле всех» или «дороже всех» о них сказать
 *   нельзя (ТЗ §4 п.7 — без фиктивной сортировки по нулю);
 * - 'name' — по названию (ru, «Тип2» раньше «Тип10»), при равенстве — прайс.
 */
export function sortProducts(
  products: readonly Product[],
  sort: SortKey,
  relevance?: ReadonlyMap<Product, number>,
): Product[] {
  const byIndex = (a: Product, b: Product) => a.sortIndex - b.sortIndex;
  const list = [...products];
  switch (sort) {
    case 'price-asc':
    case 'price-desc': {
      const direction = sort === 'price-asc' ? 1 : -1;
      return list.sort((a, b) => {
        const aKnown = a.priceType === 'fixed' && a.price !== null;
        const bKnown = b.priceType === 'fixed' && b.price !== null;
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (aKnown && bKnown) return direction * ((a.price ?? 0) - (b.price ?? 0)) || byIndex(a, b);
        return byIndex(a, b);
      });
    }
    case 'name':
      return list.sort((a, b) => nameCollator.compare(a.name, b.name) || byIndex(a, b));
    default:
      if (relevance !== undefined) {
        return list.sort(
          (a, b) => (relevance.get(b) ?? 0) - (relevance.get(a) ?? 0) || byIndex(a, b),
        );
      }
      return list.sort(byIndex);
  }
}

export function applyQuery(
  products: readonly Product[],
  state: CatalogState,
  context: QueryContext,
): QueryResult {
  const categoryId = context.categoryId ?? null;
  const pageSize =
    context.pageSize !== undefined && context.pageSize >= 1
      ? Math.floor(context.pageSize)
      : DEFAULT_PAGE_SIZE;
  const categoriesById = new Map(context.categories.map((category) => [category.id, category]));

  // Неизвестная категория — пустой контекст, а не весь каталог: страница должна отдать 404.
  const contextSet =
    categoryId === null
      ? [...products]
      : products.filter((product) => product.categoryPath.includes(categoryId));

  const q = state.q.trim();
  let base: readonly Product[] = contextSet;
  let relevance: Map<Product, number> | undefined;
  if (q !== '') {
    const hits = searchProducts(contextSet, q, { strict: state.strict });
    base = hits.map((hit) => hit.product);
    relevance = new Map(hits.map((hit) => [hit.product, hit.score]));
  }

  const run = runFilters(base, contextSet, state, {
    strict: state.strict,
    categoryId,
    categoriesById,
  });
  const sorted = sortProducts(run.matched, run.state.sort, relevance);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number.isInteger(state.page) && state.page >= 1 ? state.page : 1;
  const page = Math.min(requested, totalPages);
  const items = sorted.slice((page - 1) * pageSize, page * pageSize);

  return {
    items,
    total,
    totalPages,
    page,
    pageSize,
    facets: run.facets,
    activeChips: run.activeChips,
    state: { ...run.state, page },
    strictAvailable: run.strictAvailable,
  };
}
