import Link from 'next/link';

import { ButtonLink } from '@/components/ui/Button';
import { categoryNavLabel, site } from '@/config/site';
import { getCategoryTree, getProducts } from '@/lib/repository';
import type { CategoryNode } from '@/lib/repository';

import { HeaderActions } from './HeaderActions';
import { HeaderCategoryNav } from './HeaderCategoryNav';
import { LogoLink } from './LogoLink';
import { MobileMenu } from './MobileMenu';
import type { MenuCategory } from './MobileMenu';
import { HeaderSearch } from './SearchCombobox';

/**
 * Шапка (DESIGN §5.9.1), серверная: категории — из репозитория; интерактив — клиентские острова
 * (меню, поиск, счётчики, подсветка текущей категории). Не липкая. Индекс подсказок поиска сюда
 * не передаётся: поле загружает его само с `/api/search-index` при первом фокусе — иначе он
 * встраивался бы в разметку каждой страницы.
 *
 * Строка A: [меню < lg] логотип [Каталог ≥ lg] [поиск ≥ lg] действия. Поиск на < lg переносится
 * отдельной строкой под ней (тот же элемент — без дублирующихся id и полей).
 * Строка B (≥ lg): категории верхнего уровня; справа с xl — служебные ссылки.
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
  const navCategories = tree.map((node) => ({
    id: node.id,
    href: node.href,
    label: categoryNavLabel(node.id, node.name),
  }));
  return (
    <header data-print="hidden" className="border-b border-line bg-page">
      <div className="page-container flex flex-wrap items-center gap-x-2 sm:gap-x-4 lg:gap-x-6">
        <MobileMenu
          categories={tree.map(toMenu)}
          totalCount={products.length}
          className="-ml-2 lg:hidden"
        />
        <LogoLink />
        {/* Обёртка, а не hidden на самой ссылке: у кнопки свой display (inline-flex). */}
        <div className="hidden lg:block">
          <ButtonLink href="/catalog" variant="ghost" icon="layout-grid">
            Каталог
          </ButtonLink>
        </div>
        <HeaderSearch className="order-last mb-3 w-full lg:order-none lg:mb-0 lg:w-auto lg:max-w-[40rem] lg:flex-1" />
        <HeaderActions className="ml-auto -mr-2 lg:mr-0" />
      </div>
      <div className="hidden border-t border-line-subtle lg:block">
        <div className="page-container flex h-10 items-center gap-5 text-small">
          <HeaderCategoryNav categories={navCategories} />
          {/* Имя отличается от колонки подвала «Покупателям» — ориентиры nav не повторяются. */}
          <nav aria-label="Информация для покупателей" className="ml-auto hidden gap-5 xl:flex">
            {site.nav.service.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-medium whitespace-nowrap text-ink-secondary hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
