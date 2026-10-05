import type { Metadata } from 'next';
import Link from 'next/link';

import { SearchForm } from '@/components/layout/SearchForm';
import { robotsFor } from '@/lib/seo';

/** 404 (DESIGN §2.22): неизвестный адрес или `notFound()` (снятый с витрины товар). noindex. */
export const metadata: Metadata = {
  title: 'Страница не найдена',
  robots: robotsFor('noindex'),
};

export default function NotFound() {
  return (
    <div className="max-w-text">
      <h1>Страница не найдена</h1>
      <p className="mt-3 text-body text-ink-secondary">
        Адрес неверный или позиция снята с витрины.
      </p>
      <SearchForm variant="compact" className="mt-6" />
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-body">
        <li>
          <Link href="/catalog" className="text-link">
            Каталог
          </Link>
        </li>
        <li>
          <Link href="/" className="text-link">
            Главная
          </Link>
        </li>
      </ul>
    </div>
  );
}
