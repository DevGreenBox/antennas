'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { inputClasses } from '@/components/ui/Input';
import { site } from '@/config/site';
import { PRICE_ON_REQUEST_LABEL, suggest } from '@/lib/catalog';
import type { Suggestion } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { SUGGESTION_FORMS, countLabel } from '@/lib/format';
import type { SearchIndex } from '@/lib/repository';
import { useDebouncedValue } from '@/lib/use-client-value';

/**
 * Поиск в шапке с подсказками (DESIGN §5.9.36, паттерн ARIA 1.2 combobox + listbox).
 * Данные — `suggest(q, 9, index)` движка по лёгкому индексу репозитория: до 3 категорий, затем
 * товары; последняя опция — «Все результаты по «q»». Без JS форма отправляется на /search.
 *
 * Индекс (~80 КБ JSON) не встраивается в разметку страниц: его отдаёт статический
 * `/api/search-index`, а поле загружает его при первом фокусе или вводе — один раз на вкладку
 * (кэш в модуле переживает переходы между страницами). Пока индекс грузится, в списке строка
 * загрузки; если загрузка не удалась, поле работает как обычная форма: Enter открывает /search.
 *
 * Клавиатура: ↓/↑ — по опциям по кругу; Enter без активной — поиск, на опции — переход;
 * Esc — закрыть, второй Esc — очистить; Tab — закрыть без выбора. Клик вне — закрыть.
 *
 * `HeaderSearch` — обёртка для шапки: на /search подставляет `q` из адреса в поле.
 */

type Option =
  | {
      key: string;
      kind: 'category';
      href: string;
      suggestion: Extract<Suggestion, { kind: 'category' }>;
    }
  | {
      key: string;
      kind: 'product';
      href: string;
      suggestion: Extract<Suggestion, { kind: 'product' }>;
    }
  | { key: string; kind: 'all'; href: string };

const searchHref = (query: string) =>
  query === '' ? '/search' : `/search?q=${encodeURIComponent(query)}`;

/** Загруженный индекс — общий для всех экземпляров поля и переживает переходы по страницам. */
let loadedIndex: SearchIndex | null = null;
let indexRequest: Promise<SearchIndex> | null = null;

/** Индекс подсказок: один запрос на вкладку; после ошибки следующий фокус пробует снова. */
function loadSearchIndex(): Promise<SearchIndex> {
  indexRequest ??= fetch('/api/search-index')
    .then(async (response) => {
      if (!response.ok) throw new Error(`search-index: HTTP ${response.status}`);
      loadedIndex = (await response.json()) as SearchIndex;
      return loadedIndex;
    })
    .catch((error: unknown) => {
      indexRequest = null;
      throw error;
    });
  return indexRequest;
}

type IndexStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Плейсхолдеры от длинного к короткому; показывается первый, что помещается в поле целиком:
 * полный по DESIGN §5.9.36 — на широком поле; короткий — ниже xl, на мобильных, до гидратации и
 * без JS (вместо обрезанного «…— напр» / «…— на»).
 */
const PLACEHOLDERS = [
  'Модель, частота или разъём — например, Тип1',
  'Модель, частота или разъём',
] as const;
/** Серверная и первая клиентская отрисовка — короткий. */
const PLACEHOLDER_INITIAL = 1;
/** Запас к измеренной ширине текста, px: отрисовка в поле и canvas расходятся на 1–2 px. */
const PLACEHOLDER_SLACK = 4;

/**
 * Плейсхолдер по ширине поля. Решает измерение текста, а не брейкпоинт: полный влезает и на
 * md (поле отдельной строкой), и у верхней границы lg (подписи действий скрыты), но не на
 * 1024 px и не в начале xl (≈ 1280–1310 px: подписи видны, контейнер ещё не во всю ширину).
 * Пересчёт — при изменении размера поля и после загрузки шрифтов; setState только в колбэках.
 */
function useFittingPlaceholder(inputRef: RefObject<HTMLInputElement | null>): string {
  const [choice, setChoice] = useState<number>(PLACEHOLDER_INITIAL);
  useEffect(() => {
    const input = inputRef.current;
    const context =
      typeof ResizeObserver === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d');
    if (!input || !context) return;
    let active = true;
    const measure = () => {
      // С введённым текстом плейсхолдер не виден, а правый отступ шире (кнопка «Очистить»):
      // не пересчитываем, чтобы атрибут не менялся под курсором.
      if (!active || !input.matches(':placeholder-shown')) return;
      const style = getComputedStyle(input);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room =
        input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const fitting = PLACEHOLDERS.findIndex(
        (text) => context.measureText(text).width + PLACEHOLDER_SLACK <= room,
      );
      setChoice(fitting === -1 ? PLACEHOLDERS.length - 1 : fitting);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(input);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [inputRef]);
  return PLACEHOLDERS[choice];
}

/** Сравнение без регистра, ё/е и похожих кириллических/латинских букв (М8 ↔ M8). */
const FOLD: Readonly<Record<string, string>> = {
  ё: 'е',
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
};

const fold = (text: string) =>
  Array.from(text.toLowerCase(), (char) => FOLD[char] ?? char).join('');

/** Подсветка совпадений слов запроса (от 2 символов) в названии: `<mark>`. */
function highlight(name: string, query: string): ReactNode {
  const haystack = fold(name);
  if (haystack.length !== name.length) return name;
  const marks = new Array<boolean>(name.length).fill(false);
  // Слова запроса и запрос без пробелов: «тип 1» подсвечивает и «Тип1» целиком.
  const tokens = [...query.split(/\s+/), query.replace(/\s+/g, '')];
  for (const token of tokens) {
    const needle = fold(token);
    if (needle.length < 2) continue;
    for (
      let from = haystack.indexOf(needle);
      from >= 0;
      from = haystack.indexOf(needle, from + 1)
    ) {
      marks.fill(true, from, from + needle.length);
    }
  }
  const parts: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= name.length; i += 1) {
    if (i === name.length || marks[i] !== marks[start]) {
      const text = name.slice(start, i);
      parts.push(
        marks[start] ? (
          <mark key={start} className="bg-transparent font-semibold text-ink">
            {text}
          </mark>
        ) : (
          text
        ),
      );
      start = i;
    }
  }
  return parts;
}

export interface SearchComboboxProps {
  /** Значение поля из адреса (/search?q=). Смена значения извне перезаписывает поле. */
  initialQuery?: string;
  className?: string;
}

export function SearchCombobox({ initialQuery = '', className }: SearchComboboxProps) {
  const router = useRouter();
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-option-${i}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholder = useFittingPlaceholder(inputRef);

  const [value, setValue] = useState(initialQuery);
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  if (initialQuery !== syncedQuery) {
    setSyncedQuery(initialQuery);
    setValue(initialQuery);
  }
  const [open, setOpen] = useState(false);
  const [activeState, setActiveState] = useState({ query: '', index: -1 });
  // Разметка не зависит от индекса, пока список закрыт, — гидратация совпадает при любом кэше.
  const [index, setIndex] = useState<SearchIndex | null>(() => loadedIndex);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>(() =>
    loadedIndex === null ? 'idle' : 'ready',
  );

  /** Загрузить индекс при первом фокусе или вводе (повторно — только после ошибки). */
  const ensureIndex = () => {
    if (index !== null || indexStatus === 'loading') return;
    if (loadedIndex !== null) {
      setIndex(loadedIndex);
      setIndexStatus('ready');
      return;
    }
    setIndexStatus('loading');
    loadSearchIndex().then(
      (loaded) => {
        setIndex(loaded);
        setIndexStatus('ready');
      },
      () => setIndexStatus('error'),
    );
  };

  // Покупатель мог поставить курсор в поле раньше гидратации: тогда onFocus уже не придёт, и без
  // этой проверки подсказки не появились бы до следующего ввода. Состояние меняется только в
  // колбэках промиса — синхронного setState в эффекте нет.
  useEffect(() => {
    if (loadedIndex !== null || document.activeElement !== inputRef.current) return;
    let cancelled = false;
    loadSearchIndex().then(
      (loaded) => {
        if (cancelled) return;
        setIndex(loaded);
        setIndexStatus('ready');
      },
      () => {
        if (!cancelled) setIndexStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const debounced = useDebouncedValue(value, site.catalog.suggestDebounceMs);
  const query = debounced.trim();
  const enough = query.length >= site.catalog.suggestMinChars && value.trim() !== '';

  const suggestions = useMemo(
    () => (enough && index !== null ? suggest(query, 9, index) : []),
    [enough, query, index],
  );
  const options = useMemo<Option[]>(() => {
    if (suggestions.length === 0) return [];
    const list: Option[] = suggestions.map((suggestion) =>
      suggestion.kind === 'category'
        ? {
            key: `c-${suggestion.id}`,
            kind: 'category',
            href: `/catalog/${suggestion.slugPath.join('/')}`,
            suggestion,
          }
        : {
            key: `p-${suggestion.id}`,
            kind: 'product',
            href: `/product/${suggestion.slug}`,
            suggestion,
          },
    );
    list.push({ key: 'all', kind: 'all', href: searchHref(query) });
    return list;
  }, [suggestions, query]);

  const expanded = open && enough;
  const hasOptions = options.length > 0;
  // Пока индекса нет, «нет совпадений» показывать нельзя — вместо этого строка загрузки/ошибки.
  const indexPending = index === null;
  const active = activeState.query === query ? activeState.index : -1;
  const setActive = (i: number) => setActiveState({ query, index: i });

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!expanded) {
          setOpen(true);
          return;
        }
        if (!hasOptions) return;
        const n = options.length;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setActive(active < 0 ? (delta > 0 ? 0 : n - 1) : (active + delta + n) % n);
        return;
      }
      case 'Enter':
        if (expanded && active >= 0 && options[active]) {
          event.preventDefault();
          go(options[active].href);
        }
        return;
      case 'Escape':
        if (expanded) {
          event.preventDefault();
          close();
        } else if (value !== '') {
          event.preventDefault();
          setValue('');
        }
        return;
      case 'Tab':
        close();
        return;
    }
  };

  const categories = options.filter((option) => option.kind === 'category');
  const products = options.filter((option) => option.kind === 'product');
  const positionOf = (option: Option) => options.indexOf(option);

  const renderOption = (option: Option) => {
    const i = positionOf(option);
    const selected = i === active;
    return (
      <div
        key={option.key}
        id={optionId(i)}
        role="option"
        aria-selected={selected}
        onClick={() => go(option.href)}
        onMouseMove={() => {
          if (!selected) setActive(i);
        }}
        className={cn(
          'relative flex min-h-11 cursor-pointer justify-between gap-3 px-3 py-2',
          // Однострочные опции — по центру строки, товар (название + код) — по верху.
          option.kind === 'product' ? 'items-start' : 'items-center',
          selected &&
            'bg-surface-muted before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-ink',
        )}
      >
        {option.kind === 'category' ? (
          <>
            <span className="text-small text-ink">
              {option.suggestion.parentName ? `${option.suggestion.parentName} › ` : null}
              {highlight(option.suggestion.name, query)}
            </span>
            <span className="text-caption text-ink-muted tabular-nums">
              {option.suggestion.productCount}
            </span>
          </>
        ) : option.kind === 'product' ? (
          <>
            <span className="min-w-0">
              <span className="block text-small font-medium text-ink">
                {highlight(option.suggestion.name, query)}
              </span>
              <span className="block font-mono text-caption text-ink-muted">
                {option.suggestion.code}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 text-small tabular-nums whitespace-nowrap',
                option.suggestion.priceText === PRICE_ON_REQUEST_LABEL
                  ? 'text-ink-secondary'
                  : 'text-ink',
              )}
            >
              {option.suggestion.priceText}
            </span>
          </>
        ) : (
          <span className="text-small font-medium text-ink">Все результаты по «{query}»</span>
        )}
      </div>
    );
  };

  return (
    <form
      role="search"
      // Имя ориентира отличает поиск шапки от SearchForm на главной и 404 («Поиск по каталогу»).
      aria-label="Быстрый поиск"
      action="/search"
      method="get"
      className={cn('relative', className)}
      onSubmit={(event) => {
        event.preventDefault();
        go(searchHref(value.trim()));
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Поиск по каталогу
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        name="q"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={expanded && hasOptions}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        value={value}
        onFocus={ensureIndex}
        onChange={(event) => {
          ensureIndex();
          setValue(event.target.value);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={inputClasses({
          size: 'md',
          className:
            // Справа кнопки «Очистить» (только с текстом) и «Найти»: пока поле пустое, место
            // под «Очистить» отдаётся плейсхолдеру (pr-11 = «Найти» 32 px + отступы).
            'pr-20 placeholder-shown:pr-11 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
        })}
      />
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center">
        {value !== '' ? (
          <IconButton
            icon="x"
            label="Очистить поиск"
            size="sm"
            onClick={() => {
              setValue('');
              close();
              inputRef.current?.focus();
            }}
          />
        ) : null}
        <IconButton icon="search" label="Найти" size="sm" type="submit" />
      </div>

      <div role="status" className="sr-only">
        {expanded
          ? indexPending
            ? indexStatus === 'error'
              ? 'Подсказки недоступны'
              : 'Загрузка подсказок…'
            : hasOptions
              ? countLabel(suggestions.length, SUGGESTION_FORMS)
              : 'Нет совпадений'
          : ''}
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Подсказки поиска"
        // Клик по подсказке не должен уводить фокус из поля до перехода.
        onMouseDown={(event) => event.preventDefault()}
        hidden={!(expanded && hasOptions)}
        className="absolute top-full z-popover mt-1 max-h-[min(28rem,70vh)] w-full overflow-y-auto rounded-md border border-line bg-surface py-2 shadow-popover"
      >
        {categories.length > 0 ? (
          <div role="group" aria-labelledby={`${baseId}-group-categories`}>
            <div
              id={`${baseId}-group-categories`}
              className="px-3 py-1 text-caption text-ink-muted"
            >
              Категории
            </div>
            {categories.map(renderOption)}
          </div>
        ) : null}
        {products.length > 0 ? (
          <div role="group" aria-labelledby={`${baseId}-group-products`}>
            <div id={`${baseId}-group-products`} className="px-3 py-1 text-caption text-ink-muted">
              Товары
            </div>
            {products.map(renderOption)}
          </div>
        ) : null}
        {options
          .filter((option) => option.kind === 'all')
          .map((option) => (
            <div key={option.key} className="mt-1 border-t border-line-subtle pt-1">
              {renderOption(option)}
            </div>
          ))}
      </div>

      {expanded && !hasOptions ? (
        <div className="absolute top-full z-popover mt-1 flex w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-3 text-small text-ink-secondary shadow-popover">
          {indexPending && indexStatus !== 'error' ? (
            <>
              <Icon name="loader-circle" size={16} className="animate-spin text-ink-muted" />
              Загружаем подсказки…
            </>
          ) : indexPending ? (
            'Подсказки не загрузились. Нажмите Enter, чтобы открыть поиск'
          ) : (
            'Нет совпадений. Нажмите Enter, чтобы открыть поиск'
          )}
        </div>
      ) : null}
    </form>
  );
}

/** Поиск шапки: на /search поле показывает текущий запрос (`defaultValue = q`, §2.7). */
export function HeaderSearch({ className }: { className?: string }) {
  return (
    <Suspense fallback={<SearchCombobox className={className} />}>
      <HeaderSearchWithQuery className={className} />
    </Suspense>
  );
}

function HeaderSearchWithQuery({ className }: { className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = pathname === '/search' ? (params.get('q') ?? '') : '';
  return <SearchCombobox initialQuery={query} className={className} />;
}
