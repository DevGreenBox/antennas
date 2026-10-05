import { ProductCard } from '@/components/product/ProductCard';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/catalog';

/**
 * ResultsGrid (DESIGN §4.7, §5.9.22) — плитка ProductCard. Рядом с панелью подбора: 1 / 2 (sm) /
 * 3 (xl) колонки; без панели (мачты, аттенюаторы — групп нет): 1 / 2 / 3 (lg) / 4 (xl).
 */
export function ResultsGrid({
  products,
  withPanel,
  categoryNames,
}: {
  products: readonly Product[];
  withPanel: boolean;
  /** Смешанный вариант (весь каталог, поиск): листовая категория в мете карточки. */
  categoryNames?: Readonly<Record<string, string>>;
}) {
  return (
    <ul
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6',
        withPanel ? 'xl:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4',
      )}
    >
      {products.map((product) => (
        <li key={product.id} className="flex">
          <ProductCard
            product={product}
            categoryName={categoryNames?.[product.categoryId]}
            className="w-full"
          />
        </li>
      ))}
    </ul>
  );
}
