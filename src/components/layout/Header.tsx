import { getCategoryTree, getProducts } from '@/lib/repository';
import type { CategoryNode } from '@/lib/repository';

import { CatalogMenu } from './CatalogMenu';
import { HeaderActions } from './HeaderActions';
import { LogoLink } from './LogoLink';
import { MobileMenu } from './MobileMenu';
import type { MenuCategory } from './MobileMenu';
import { HeaderSearch } from './SearchCombobox';

/**
 * Шапка (DESIGN § R.5), серверная: категории — из репозитория; интерактив — клиентские острова
 * (меню каталога, поиск, счётчики). Индекс подсказок поиска сюда не передаётся: поле загружает
 * его само с `/api/search-index` при первом фокусе — иначе он встраивался бы в разметку каждой
 * страницы.
 *
 * ≥ lg — одна строка 72 px, липкая: логотип · «Каталог» (панель категорий) · поиск · Избранное,
 * Корзина, Войти. < lg — не липкая (липкой там бывает панель «Параметры» каталога): меню ·
 * логотип · действия, ниже строкой — поиск (тот же элемент — без дублирующихся id и полей).
 */
const toMenu = (node: CategoryNode): MenuCategory => ({
  id: node.id,
  href: node.href,
  name: node.name,
  productCount: node.productCount,
  children: node.children.map(toMenu),
});

export async function Header() {
  const [tree, products] = await Promise.all([getCategoryTree(), getProducts()]);
  const menu = tree.map(toMenu);
  return (
    <header
      data-print="hidden"
      className="relative z-header border-b border-line bg-surface lg:sticky lg:top-0"
    >
      <div className="page-container flex flex-wrap items-center gap-x-2 sm:gap-x-4 lg:h-(--header-height) lg:flex-nowrap lg:gap-x-6">
        <MobileMenu categories={menu} totalCount={products.length} className="-ml-2 lg:hidden" />
        <LogoLink />
        <CatalogMenu categories={menu} totalCount={products.length} className="hidden lg:block" />
        <HeaderSearch className="order-last mb-3 w-full lg:order-none lg:mb-0 lg:w-auto lg:max-w-[42rem] lg:flex-1" />
        <HeaderActions className="ml-auto -mr-2 lg:mr-0" />
      </div>
    </header>
  );
}
