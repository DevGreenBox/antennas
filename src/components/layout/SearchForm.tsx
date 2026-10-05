import Link from 'next/link';
import { useId } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Форма поиска без подсказок (DESIGN §5.9.36): `<form role="search" action="/search">` работает
 * без JS. Подсказки — только в шапке (SearchCombobox).
 *
 *   <SearchForm variant="hero" />      // главная: видимая подпись, Input lg, primary «Найти», примеры
 *   <SearchForm variant="compact" />   // 404, пустой поиск: Input md + secondary «Найти»
 */
export interface SearchFormProps {
  variant?: 'hero' | 'compact';
  defaultValue?: string;
  /** Примеры запросов под полем (`site.catalog.searchExamples`); у hero — по умолчанию. */
  examples?: boolean;
  className?: string;
}

export function SearchForm({
  variant = 'compact',
  defaultValue,
  examples = variant === 'hero',
  className,
}: SearchFormProps) {
  const id = useId();
  const inputId = `search-${id}`;
  const hero = variant === 'hero';
  return (
    <form
      role="search"
      // Имя ориентира: в шапке свой поиск — «Быстрый поиск» (SearchCombobox).
      aria-label="Поиск по каталогу"
      action="/search"
      method="get"
      className={cn('max-w-text', className)}
    >
      <label htmlFor={inputId} className={hero ? 'text-small font-medium text-ink' : 'sr-only'}>
        Поиск по каталогу
      </label>
      <div className={cn('flex gap-2', hero && 'mt-1.5')}>
        <div className="relative min-w-0 flex-1">
          {hero ? (
            <Icon
              name="search"
              size={20}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
            />
          ) : null}
          <Input
            id={inputId}
            name="q"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            defaultValue={defaultValue}
            placeholder="Модель, частота или разъём"
            size={hero ? 'lg' : 'md'}
            // hero: поле вровень с кнопкой lg (48 px)
            className={cn(
              hero && 'h-12 pl-10',
              '[&::-webkit-search-cancel-button]:appearance-none',
            )}
          />
        </div>
        <Button type="submit" variant={hero ? 'primary' : 'secondary'} size={hero ? 'lg' : 'md'}>
          Найти
        </Button>
      </div>
      {examples ? (
        <p className="mt-2 text-small text-ink-secondary">
          Например:{' '}
          {site.catalog.searchExamples.map((example, index) => (
            <span key={example}>
              {index > 0 ? ', ' : null}
              <Link href={`/search?q=${encodeURIComponent(example)}`} className="text-link">
                {example}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </form>
  );
}
