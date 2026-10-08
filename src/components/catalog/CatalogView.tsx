'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ProductList,
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
  /** Подпись выдачи — доступное имя списка: «Антенны» → «Антенны: товары, страница 1 из 1». */
  label: string;
}

/** Цель фокуса после пагинации, удаления последнего чипа и «Сбросить всё» (§4.1, §7). */
const RESULTS_ID = 'results';

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

  // Пустая выдача — на месте списка: та же верхняя линия, что у ProductList, текст по левому краю.
  const empty =
    result.total > 0 ? null : !hasActiveFilters(result.state) && searching ? (
      // Поиск внутри категории (?q= на странице каталога) ничего не нашёл — подбор тут ни при чём.
      <EmptyState
        headingLevel="h3"
        title={`По запросу «${current.q.trim()}» ничего не найдено`}
        actions={
          <ButtonLink href={basePath} variant="primary" className="min-h-11 lg:min-h-0">
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
          <Button variant="primary" className="min-h-11 lg:min-h-0" onClick={reset}>
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
          сжималась до «По г…». Без групп подбора и сортировки (мачты) панели нет. Кнопка и
          список — 44 px (цель нажатия, § R.9): панель 61 px укладывается в запас --sticky-offset.
        */}
        {hasPanel || showSort ? (
          <div className="sticky top-0 z-sticky -mx-(--page-gutter) mb-3 flex items-center gap-2 border-b border-line bg-page px-(--page-gutter) py-2 lg:hidden">
            {hasPanel ? (
              <Button
                variant="secondary"
                icon="sliders-horizontal"
                className="min-h-11 shrink-0"
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
                size="lg"
                className="min-w-0 flex-1"
                value={result.state.sort}
                searching={searching}
                onChange={(sort) => commit({ ...result.state, sort, page: 1 })}
              />
            ) : null}
          </div>
        ) : null}

        <h2 id={RESULTS_ID} tabIndex={-1} className="sr-only scroll-mt-16 lg:scroll-mt-28">
          Товары
        </h2>

        {/* Toolbar (§ R.7): счётчик; справа сортировка и вид (≥ lg) или только вид (< lg). */}
        <div className="flex min-h-10 items-center justify-between gap-3 pb-3">
          <ResultCount total={result.total} />
          <ViewToggle
            iconsOnly
            className="lg:hidden"
            value={view}
            onChange={(next) => commit({ ...result.state, view: next })}
          />
          <div className="hidden items-center gap-3 lg:flex">
            {showSort ? (
              <SortSelect
                size="sm"
                value={result.state.sort}
                searching={searching}
                onChange={(sort) => commit({ ...result.state, sort, page: 1 })}
              />
            ) : null}
            <ViewToggle value={view} onChange={(next) => commit({ ...result.state, view: next })} />
          </div>
        </div>

        {/* Выбранные параметры — над результатами. */}
        <ActiveFilters
          chips={result.activeChips}
          onRemove={(chip) => commit(removeChip(result.state, chip))}
          onReset={reset}
          focusFallbackId={RESULTS_ID}
        />

        {empty !== null ? (
          <div className="border-t border-line">{empty}</div>
        ) : (
          <>
            {view === 'grid' ? (
              <div className="mt-1">
                <ResultsGrid
                  products={result.items}
                  withPanel={hasPanel}
                  categoryNames={mixed ? categoryNames : undefined}
                />
              </div>
            ) : (
              <ProductList
                label={`${label}: товары, страница ${result.page} из ${result.totalPages}`}
                products={result.items}
                columns={columns}
                rootCategoryId={rootCategoryId}
                categoryNames={mixed ? categoryNames : undefined}
              />
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
