import type { Metadata } from 'next';
import Link from 'next/link';

import { SearchForm } from '@/components/layout/SearchForm';
import { Icon } from '@/components/ui/Icon';
import { robotsFor } from '@/lib/seo';

/**
 * 404 (DESIGN §2.22): неизвестный адрес или `notFound()` (снятый с витрины товар). noindex.
 * Вид — DESIGN § R: только типографика — надстрочный код ошибки, h1, пояснение, поиск и ссылки
 * строками с тонкими разделителями; без иллюстраций.
 */
export const metadata: Metadata = {
  title: 'Страница не найдена',
  robots: robotsFor('noindex'),
};

const LINKS = [
  { href: '/catalog', label: 'Каталог' },
  { href: '/', label: 'Главная' },
] as const;

export default function NotFound() {
  return (
    <div className="max-w-[40rem] pt-4 lg:pt-10">
      <p className="eyebrow">Ошибка 404</p>
      <h1 className="mt-3">Страница не найдена</h1>
      <p className="mt-3 text-body text-ink-secondary">
        Адрес неверный или позиция снята с витрины.
      </p>
      <SearchForm variant="compact" className="mt-8" />
      <ul className="mt-10 border-t border-line-subtle text-body">
        {LINKS.map((link) => (
          <li key={link.href} className="border-b border-line-subtle">
            <Link
              href={link.href}
              className="group/link flex min-h-12 items-center justify-between gap-4 text-ink"
            >
              <span className="group-hover/link:underline">{link.label}</span>
              <Icon
                name="arrow-right"
                size={16}
                className="text-ink-muted transition-transform duration-fast group-hover/link:translate-x-1"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
