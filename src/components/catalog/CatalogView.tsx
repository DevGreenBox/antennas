'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ProductListItem,
  ProductTable,
  columnsForCategory,
  hasInferredValues,
} from '@/components/product/ProductRow';
import { INFERRED_FOOTNOTE } from '@/components/product/SpecLine';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { site } from '@/config/site';
import {
  applyQuery,
  catalogQueryString,
  formatAttrValue,
  hasActiveFilters,
  parseCatalogState,
  removeChip,
  resetFilters,
} from '@/lib/catalog';
import type { CatalogState, QueryContext, QueryResult } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import type { Category, Product } from '@/types/catalog';

import { ActiveFilters } from './ActiveFilters';
import { FilterDrawer } from './FilterDrawer';
import { FilterPanel } from './FilterPanel';
import { ResultsGrid } from './ResultsGrid';
import { ResultCount, SortSelect, ViewToggle } from './Toolbar';

/**
 * Выдача каталога и поиска (DESIGN §2.3–2.5, §2.7, §4): панель «Подбор по параметрам», чипы,
 * счётчик, сортировка, вид, таблица/список/плитка, пагинация, пустое состояние, Drawer на < lg.
 *
 * Источник истины — URL (§0 п.5). Состояние — `parseCatalogState(useSearchParams())`: страницы
 * каталога и поиска рендерятся динамически, поэтому на сервере хук отдаёт параметры запроса и
 * первый рендер (SSR) тот же, что раньше давал разобранный сервером `state`. Выдачу считает
 * `applyQuery` движка по товарам контекста — всё в браузере, сервер для неё не нужен.
 *
 * Поэтому изменение подбора, сортировки и вида пишется в URL нативным
 * `window.history.replaceState` (Next 16 синхронизирует его с `useSearchParams`/`usePathname`),
 * а не `router.replace`: тот запрашивал у сервера RSC страницы целиком (~170 КБ со всем списком
 * товаров) на каждый клик по фильтру. Новое состояние показывается сразу (локальное состояние),
 * URL догоняет его в переходе. Пагинация — настоящие ссылки (`next/link`, router push): «Назад»
 * браузера возвращает на прошлую страницу выдачи, состояние снова берётся из URL.
 */
export interface CatalogViewProps {
  /** Товары контекста: категория (с подкатегориями) или результаты поиска. */
  products: Product[];
  /** Все категории — для `applyQuery` (группы подбора, фасет «Категория») и подписей. */
  categories: Category[];
  /** Категория-контекст; null — весь каталог и поиск. */
  categoryId: string | null;
  /** Корневая категория страницы — подписи колонок движка («Разъём порта 1» у МШУ). */
  rootCategoryId: string | null;
  /** Адрес страницы без параметров: `/catalog/antennas`, `/search`. */
  basePath: string;
  /** Подпись выдачи для caption таблицы: «Антенны» → «Антенны: товары, страница 1 из 1». */
  label: string;
}

/** Цель фокуса после пагинации, удаления последнего чипа и «Сбросить всё» (§4.1, §7). */
const RESULTS_ID = 'results';

/**
 * Колонки таблицы, чьи значения не переносятся вовсе: числа с единицей и диапазоны («10–12 дБи»),
 * тип кабеля («RG-316 / RG-142»), одиночный разъём («N-female», «N/sma-мама»). Внутри любых
 * значений дефисные коды и диапазоны и так неразрывны (`TechText` в StatusValue); составные
 * колонки (разъёмы порта 1 — порта 2, концы кабеля) и текстовые переносятся по пробелам и «—» —
 * иначе таблица не помещается.
 */
const UNBROKEN_COLUMNS: ReadonlySet<string> = new Set([
  'connector',
  'power_connector',
  'cable_type',
  'gain_dbi',
  'gain_db',
  'cable_length',
  'height',
  'weight',
  'max_load',
  'attenuation_range',
  'max_power',
  'rejection',
  'insertion_loss',
]);
/**
 * Составные колонки («SMA-female — SMA-female», «SMA-male прямой»): минимальная ширина, при
 * которой строка рвётся по пробелу и «—», а не внутри «SMA-female» на дефисе.
 */
const COMPOSITE_COLUMNS: ReadonlySet<string> = new Set(['ports', 'end1', 'end2']);
const COMPOSITE_CELL_CLASSES = [
  '[&_td:nth-child(2)]:min-w-[7.5rem]',
  '[&_td:nth-child(3)]:min-w-[7.5rem]',
  '[&_td:nth-child(4)]:min-w-[7.5rem]',
  '[&_td:nth-child(5)]:min-w-[7.5rem]',
  '[&_td:nth-child(6)]:min-w-[7.5rem]',
  '[&_td:nth-child(7)]:min-w-[7.5rem]',
] as const;
/** Классы «не переносить» для ячейки N-й колонки характеристик (td:nth-child(N + 2)). */
const UNBROKEN_CELL_CLASSES = [
  '[&_td:nth-child(2)_span]:whitespace-nowrap',
  '[&_td:nth-child(3)_span]:whitespace-nowrap',
  '[&_td:nth-child(4)_span]:whitespace-nowrap',
  '[&_td:nth-child(5)_span]:whitespace-nowrap',
  '[&_td:nth-child(6)_span]:whitespace-nowrap',
  '[&_td:nth-child(7)_span]:whitespace-nowrap',
] as const;

export function CatalogView({
  products,
  categories,
  categoryId,
  rootCategoryId,
  basePath,
  label,
}: CatalogViewProps) {
  const searchParams = useSearchParams();
  const urlState = useMemo(() => parseCatalogState(searchParams), [searchParams]);
  // Показанное состояние: меняется сразу при действии, а при смене URL извне (ссылка пагинации,
  // «Назад»/«Вперёд» браузера) берётся из URL.
  const [current, setCurrent] = useState(urlState);
  const [syncedUrlState, setSyncedUrlState] = useState(urlState);
  if (urlState !== syncedUrlState) {
    setSyncedUrlState(urlState);
    setCurrent(urlState);
  }

  const context = useMemo<QueryContext>(
    () => ({ categoryId, categories, pageSize: site.catalog.pageSize }),
    [categoryId, categories],
  );
  const result = useMemo(
    () => applyQuery(products, current, context),
    [products, current, context],
  );
  // Сколько позиций в контексте без подбора: от этого зависят сортировка и пагинация (§2.4).
  const baseTotal = useMemo(
    () => applyQuery(products, resetFilters(current), context).total,
    [products, current, context],
  );

  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  // Спорные частоты контекста («6000–8000 ГГц») — в подпись под группой «Частота» (§4.3 п.5).
  const frequencyReviewValues = useMemo(() => {
    const values = new Set<string>();
    for (const product of products) {
      for (const attr of product.attributes) {
        if (attr.code === 'frequency' && attr.status === 'needs-review') {
          values.add(formatAttrValue(attr.code, attr.value));
        }
      }
    }
    return [...values];
  }, [products]);

  const commit = (next: CatalogState) => {
    setCurrent(next);
    // Без запроса к серверу: replaceState не прокручивает страницу и не трогает «Назад».
    window.history.replaceState(null, '', `${basePath}${catalogQueryString(next)}`);
  };

  // Страница за пределами выдачи (?page=99) — движок вернул последнюю валидную; адрес — на неё.
  useEffect(() => {
    if (result.page !== current.page) {
      window.history.replaceState(null, '', `${basePath}${catalogQueryString(result.state)}`);
    }
  }, [result.page, result.state, current.page, basePath]);

  // --- Мобильный Drawer: черновик состояния. ---
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogState>(current);
  // «Показать N» читает черновик из ref: blur поля (применение в черновик) и клик по кнопке
  // идут подряд, а обработчик клика мог захватить черновик до перерисовки.
  const draftRef = useRef(draft);
  const updateDraft = (next: CatalogState) => {
    draftRef.current = next;
    setDraft(next);
  };
  const draftResult = useMemo<QueryResult | null>(
    () => (drawerOpen ? applyQuery(products, draft, context) : null),
    [drawerOpen, products, draft, context],
  );

  const searching = current.q.trim() !== '';
  const hasPanel = result.facets.length > 0 || result.activeChips.length > 0;
  const showSort = baseTotal > 1;
  const columns = columnsForCategory(categoryId);
  const mixed = columns.includes('category');
  const activeCount = result.activeChips.length;
  const view = result.state.view;

  const pageHrefs = Array.from(
    { length: result.totalPages },
    (_, index) => `${basePath}${catalogQueryString({ ...result.state, page: index + 1 })}`,
  );
  const showFootnote =
    result.items.length > 0 &&
    (hasInferredValues(result.items, columns) || hasInferredValues(result.items, ['specs']));

  const reset = () => commit(resetFilters(result.state));

  const empty =
    result.total > 0 ? null : !hasActiveFilters(result.state) && searching ? (
      // Поиск внутри категории (?q= на странице каталога) ничего не нашёл — подбор тут ни при чём.
      <EmptyState
        headingLevel="h3"
        title={`По запросу «${current.q.trim()}» ничего не найдено`}
        actions={
          <ButtonLink href={basePath} variant="primary">
            Показать все позиции
          </ButtonLink>
        }
      >
        Проверьте написание или попробуйте иначе: модель, частоту в МГц или разъём.
      </EmptyState>
    ) : (
      <EmptyState
        headingLevel="h3"
        title="Нет товаров с такими параметрами"
        actions={
          <Button variant="primary" onClick={reset}>
            Сбросить всё
          </Button>
        }
      >
        <p>Измените или уберите часть параметров.</p>
        {result.state.freq !== null ? (
          // Точно по движку (§4.3): needs-review («6000–8000 ГГц») не участвует никогда, inferred
          // (единица принята по контексту) участвует, пока не включён strict.
          <p className="mt-2">
            {result.state.strict
              ? 'Значения частоты со спорной единицей (ГГц) в подбор не попадают; значения с единицей, принятой по контексту, тоже не учитываются — включено «Только подтверждённые значения».'
              : 'Значения частоты со спорной единицей (ГГц) в подбор не попадают; значения с единицей, принятой по контексту, учитываются, пока не включено «Только подтверждённые значения».'}
          </p>
        ) : null}
      </EmptyState>
    );

  return (
    <div
      className={cn(
        'grid gap-6 xl:gap-8',
        hasPanel ? 'lg:grid-cols-catalog xl:grid-cols-catalog-wide' : 'grid-cols-1',
      )}
    >
      {hasPanel ? (
        <div className="hidden lg:block">
          <FilterPanel
            variant="sidebar"
            result={result}
            onChange={commit}
            onReset={reset}
            frequencyReviewValues={frequencyReviewValues}
          />
        </div>
      ) : null}

      <div className="min-w-0">
        {/*
          CatalogMobileBar (§5.9.18), липкая на < lg: «Параметры · Сортировка». Переключатель
          вида на < lg стоит в строке счётчика: при 375–390 px втроём с «Параметрами» сортировка
          сжималась до «По г…». Без групп подбора и сортировки (мачты) панели нет.
        */}
        {hasPanel || showSort ? (
          <div className="sticky top-0 z-sticky -mx-(--page-gutter) mb-3 flex items-center gap-2 border-b border-line bg-page px-(--page-gutter) py-2 lg:hidden">
            {hasPanel ? (
              <Button
                variant="secondary"
                icon="sliders-horizontal"
                className="shrink-0"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                aria-label={activeCount > 0 ? `Параметры, выбрано: ${activeCount}` : undefined}
                onClick={() => {
                  updateDraft(result.state);
                  setDrawerOpen(true);
                }}
              >
                Параметры
                {activeCount > 0 ? <Badge tone="neutral">{activeCount}</Badge> : null}
              </Button>
            ) : null}
            {showSort ? (
              <SortSelect
                size="md"
                className="min-w-0 flex-1"
                value={result.state.sort}
                searching={searching}
                onChange={(sort) => commit({ ...result.state, sort, page: 1 })}
              />
            ) : null}
          </div>
        ) : null}

        <ActiveFilters
          chips={result.activeChips}
          onRemove={(chip) => commit(removeChip(result.state, chip))}
          onReset={reset}
          focusFallbackId={RESULTS_ID}
        />

        <h2 id={RESULTS_ID} tabIndex={-1} className="sr-only scroll-mt-16">
          Товары
        </h2>

        {/* Toolbar (§5.9.20): счётчик; справа сортировка и вид (≥ lg) или только вид (< lg). */}
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3 lg:pt-1">
          <ResultCount total={result.total} />
          <ViewToggle
            iconsOnly
            className="lg:hidden"
            value={view}
            onChange={(next) => commit({ ...result.state, view: next })}
          />
          <div className="hidden items-center gap-4 lg:flex">
            {showSort ? (
              <SortSelect
                size="sm"
                value={result.state.sort}
                searching={searching}
                onChange={(sort) => commit({ ...result.state, sort, page: 1 })}
              />
            ) : null}
            <ViewToggle
              value={view}
              tableFrom={hasPanel ? 'wide' : 'lg'}
              onChange={(next) => commit({ ...result.state, view: next })}
            />
          </div>
        </div>

        {empty ?? (
          <>
            {view === 'grid' ? (
              <div className="mt-4 lg:mt-6">
                <ResultsGrid
                  products={result.items}
                  withPanel={hasPanel}
                  categoryNames={mixed ? categoryNames : undefined}
                />
              </div>
            ) : (
              <>
                {/*
                  ResultsTable. Рядом с панелью колонке выдачи 649 px на 1024 и 880–944 px на xl,
                  а таблица антенн и МШУ по §4.7 в натуральную ширину — 1050+ px. Поэтому с
                  панелью таблица — с 84rem (контент 80rem + поля 2 × 2rem: колонка выдачи уже
                  полные 944 px), ниже — список строк. Заголовки колонок могут переноситься,
                  числовые значения — нет; колонка названия — от 11,5rem, внутренние поля ячеек —
                  10 px вместо 12: так на 1440 помещаются все категории, включая антенны.
                  Контейнер с прокруткой — страховка: страница по горизонтали не прокручивается
                  никогда (§5.4); relative — чтобы sr-only-подписи внутри (position: absolute) не
                  вылезали из контейнера, px-1 — чтобы кольцо фокуса у краёв не обрезалось.
                */}
                <div
                  className={cn(
                    'relative -mx-1 overflow-x-auto px-1',
                    '[&_td:first-child]:min-w-[11.5rem] [&_th]:align-bottom [&_th]:whitespace-normal',
                    '[&_:is(td,th):not(:first-child,:last-child)]:px-2.5',
                    ...columns.map((key, index) =>
                      UNBROKEN_COLUMNS.has(key)
                        ? UNBROKEN_CELL_CLASSES[index]
                        : COMPOSITE_COLUMNS.has(key)
                          ? COMPOSITE_CELL_CLASSES[index]
                          : null,
                    ),
                    hasPanel ? 'hidden min-[84rem]:block' : 'hidden lg:block',
                  )}
                >
                  <ProductTable
                    products={result.items}
                    columns={columns}
                    categoryNames={categoryNames}
                    rootCategoryId={rootCategoryId}
                    caption={`${label}: товары, страница ${result.page} из ${result.totalPages}`}
                  />
                </div>
                {/*
                  ResultsList — строки там, где таблица не помещается (< lg; с панелью — до 84rem,
                  переключатель вида подписан там «Список»). С md цена и действия — справа в
                  строке названия (ProductListItem).
                */}
                <ul
                  className={cn(
                    'divide-y divide-line-subtle border-b border-line-subtle',
                    hasPanel ? 'min-[84rem]:hidden' : 'lg:hidden',
                  )}
                >
                  {result.items.map((product) => (
                    <ProductListItem
                      key={product.id}
                      product={product}
                      categoryName={mixed ? categoryNames[product.categoryId] : undefined}
                    />
                  ))}
                </ul>
              </>
            )}
            {showFootnote ? (
              <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p>
            ) : null}
            {showSort ? (
              <Pagination
                page={result.page}
                pageCount={result.totalPages}
                hrefs={pageHrefs}
                focusTargetId={RESULTS_ID}
              />
            ) : null}
          </>
        )}
      </div>

      {hasPanel ? (
        <FilterDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          result={draftResult}
          onChange={updateDraft}
          onReset={() => updateDraft(resetFilters(draftRef.current))}
          onApply={() => {
            setDrawerOpen(false);
            commit(draftRef.current);
          }}
          frequencyReviewValues={frequencyReviewValues}
        />
      ) : null}
    </div>
  );
}
