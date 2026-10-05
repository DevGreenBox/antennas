import type { MetadataRoute } from 'next';

import { site } from '@/config/site';
import { getCategoryTree, getProducts } from '@/lib/repository';
import type { CategoryNode } from '@/lib/repository';
import { absoluteUrl } from '@/lib/seo';

/**
 * sitemap.xml (DESIGN §8): только публичные страницы — главная, каталог, все категории и
 * подкатегории (без параметров), все видимые товары, контакты, доставка; юридические — когда
 * тексты готовы. Без lastmod: дат изменения в данных нет. Пока индексация запрещена, robots.txt
 * на карту не ссылается, но сама карта уже собирается (готова к снятию запрета).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tree, products] = await Promise.all([getCategoryTree(), getProducts()]);
  const categories: string[] = [];
  const walk = (nodes: readonly CategoryNode[]) => {
    for (const node of nodes) {
      categories.push(node.href);
      walk(node.children);
    }
  };
  walk(tree);
  const paths = [
    '/',
    '/catalog',
    ...categories,
    ...products.map((product) => `/product/${product.slug}`),
    '/contacts',
    '/delivery',
    ...(site.legal.ready ? site.nav.legal.map((link) => link.href) : []),
  ];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
