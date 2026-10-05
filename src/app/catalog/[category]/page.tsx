import type { Metadata } from 'next';

import { CategoryCatalogPage, categoryMetadata } from '@/components/catalog/CategoryCatalogPage';
import type { SearchParamsRecord } from '@/components/catalog/CategoryCatalogPage';

/** Категория `/catalog/[category]` (DESIGN §2.4). Неизвестный slug → 404. */
interface Props {
  params: Promise<{ category: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category } = await params;
  return categoryMetadata([category], searchParams);
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category } = await params;
  return <CategoryCatalogPage slugs={[category]} searchParams={searchParams} />;
}
