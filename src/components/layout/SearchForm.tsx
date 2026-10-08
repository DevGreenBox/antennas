import Link from 'next/link';
import { useId } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Форма поиска без подсказок (DESIGN § R.6): `<form role="search" action="/search">` работает
 * без JS. Подсказки — только в шапке (SearchCombobox).
 *
 *   <SearchForm variant="hero" />      // главная: поле 56 px, primary «Найти», быстрые запросы
 *   <SearchForm variant="compact" />   // 404, пустой поиск: Input md + secondary «Найти»
 */
export interface SearchFormProps {
  variant?: 'hero' | 'compact';
  defaultValue?: string;
  className?: string;
}

export function SearchForm({ variant = 'compact', defaultValue, className }: SearchFormProps) {
  const id = useId();
  const inputId = `search-${id}`;
  const hero = variant === 'hero';
  return (
    <div className={cn(hero ? 'max-w-[44rem]' : 'max-w-text', className)}>
      <form
        role="search"
        // Имя ориентира: в шапке свой поиск — «Быстрый поиск» (SearchCombobox).
        aria-label="Поиск по каталогу"
        action="/search"
        method="get"
      >
        <label htmlFor={inputId} className="sr-only">
          Поиск по каталогу
        </label>
        {/* hero на < sm — кнопка под полем: плейсхолдер помещается целиком. */}
        <div className={cn('flex gap-2', hero && 'flex-col sm:flex-row')}>
          <div className="relative min-w-0 flex-1">
            {hero ? (
              <Icon
                name="search"
                size={20}
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
              />
            ) : null}
            <Input
              id={inputId}
              name="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              defaultValue={defaultValue}
              placeholder={hero ? 'Модель, частота, разъём или код' : 'Модель, частота или разъём'}
              size={hero ? 'lg' : 'md'}
              // hero: поле вровень с кнопкой (48 px, с lg — 56 px)
              className={cn(
                hero && 'h-12 pl-12 lg:h-14 lg:text-lead',
                '[&::-webkit-search-cancel-button]:appearance-none',
              )}
            />
          </div>
          <Button
            type="submit"
            variant={hero ? 'primary' : 'secondary'}
            size={hero ? 'lg' : 'md'}
            className={hero ? 'lg:h-14 lg:px-8' : undefined}
          >
            Найти
          </Button>
        </div>
      </form>
      {hero ? (
        <nav aria-label="Быстрые запросы" className="mt-4">
          <ul className="flex flex-wrap items-center gap-2">
            {site.catalog.quickLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex h-8 items-center rounded-sm border border-line bg-surface px-3 text-small text-ink-secondary transition-colors duration-fast hover:border-line-emphasis hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
