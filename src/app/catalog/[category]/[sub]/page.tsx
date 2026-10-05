import type { Metadata } from 'next';

import { CategoryCatalogPage, categoryMetadata } from '@/components/catalog/CategoryCatalogPage';
import type { SearchParamsRecord } from '@/components/catalog/CategoryCatalogPage';

/**
 * Подкатегория `/catalog/[category]/[sub]` (DESIGN §2.5). Подкатегория чужого родителя
 * (`/catalog/lna/horn`) или неизвестный slug → 404: вложенность проверяет репозиторий.
 */
interface Props {
  params: Promise<{ category: string; sub: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category, sub } = await params;
  return categoryMetadata([category, sub], searchParams);
}

export default async function SubcategoryPage({ params, searchParams }: Props) {
  const { category, sub } = await params;
  return <CategoryCatalogPage slugs={[category, sub]} searchParams={searchParams} />;
}
