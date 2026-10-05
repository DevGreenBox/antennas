import type { Product } from '@/types/catalog';

/**
 * Товары для клиентской выдачи каталога (CatalogView): тот же `Product`, но без полей, которые
 * списку не нужны, — пометки прайса, ссылки на строки источника и проблемы импорта (их
 * показывает только страница товара). Характеристики остаются целиком: по ним работают
 * `applyQuery` (фильтры, фасеты, частота) и строки таблицы (`getSpecLine`, статусы значений);
 * `images` тоже — когда у позиций появятся фото, их покажет карточка.
 *
 * Зачем: выдача считается в браузере из этих данных, поэтому они уходят в HTML и RSC-пэйлоад
 * страницы — при загрузке и при переходе по ссылкам пагинации (подбор, сортировка и вид сервер не
 * трогают: CatalogView пишет их в URL через history.replaceState). Минус ~10 % объёма без потери
 * смысла.
 */
export function toClientProducts(products: readonly Product[]): Product[] {
  return products.map((product) => ({
    ...product,
    notes: [],
    sourceIds: [],
    issueIds: [],
  }));
}

/** Есть ли в searchParams страницы хоть один параметр — тогда noindex, follow (DESIGN §8). */
export function hasQueryParams(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): boolean {
  return Object.values(searchParams).some((value) => value !== undefined);
}
