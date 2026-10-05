'use client';

import { useId } from 'react';

import { Button } from '@/components/ui/Button';
import {
  setFrequency,
  setPriceRange,
  setRangeFilter,
  setRequestOnly,
  setStrict,
  toggleFilterValue,
} from '@/lib/catalog';
import type { CatalogState, Facet, QueryResult } from '@/lib/catalog';
import { cn } from '@/lib/cn';

import {
  FlagFacetGroup,
  FrequencyFacetGroup,
  OptionsFacetGroup,
  RangeFacetGroup,
  StrictToggle,
} from './FilterControls';

/**
 * Панель «Подбор по параметрам» (DESIGN §4.2, §4.5, §5.9.17). Состав, порядок, подписи и
 * счётчики — строго `QueryResult.facets` движка; панель только переводит действие в новое
 * состояние помощниками движка (они же сбрасывают страницу на первую) и отдаёт его наружу.
 *
 * Два места: колонка слева на ≥ lg (`variant="sidebar"`: правки применяются сразу) и Drawer на
 * < lg (`variant="drawer"`: правки идут в черновик, применяет «Показать N»).
 */
export interface FilterPanelProps {
  result: Pick<QueryResult, 'facets' | 'state' | 'strictAvailable' | 'activeChips'>;
  onChange: (next: CatalogState) => void;
  variant: 'sidebar' | 'drawer';
  /** Спорные значения частоты в контексте — для подписи под группой «Частота». */
  frequencyReviewValues: readonly string[];
  /** «Сбросить всё» в шапке панели (только sidebar). */
  onReset?: () => void;
  className?: string;
}

export function FilterPanel({
  result,
  onChange,
  variant,
  frequencyReviewValues,
  onReset,
  className,
}: FilterPanelProps) {
  const titleId = useId();
  const { state } = result;
  const comfortable = variant === 'drawer';
  const hasActive = result.activeChips.length > 0;

  const renderFacet = (facet: Facet) => {
    switch (facet.kind) {
      case 'options':
        return (
          <OptionsFacetGroup
            key={facet.key}
            facet={facet}
            comfortable={comfortable}
            onToggle={(value) => onChange(toggleFilterValue(state, facet.key, value))}
          />
        );
      case 'flag':
        return (
          <FlagFacetGroup
            key={facet.key}
            facet={facet}
            comfortable={comfortable}
            onToggle={() => onChange(toggleFilterValue(state, facet.key, '1'))}
          />
        );
      case 'request':
        return (
          <FlagFacetGroup
            key={facet.key}
            facet={facet}
            comfortable={comfortable}
            onToggle={() => onChange(setRequestOnly(state, !facet.selected))}
          />
        );
      case 'range':
        return (
          <RangeFacetGroup
            key={facet.key}
            legend={`${facet.label}, ${facet.unitLabel}`}
            label={facet.label}
            bounds={facet.bounds}
            selected={facet.selected}
            integer={false}
            messages={{
              notNumber: 'Введите число, например 10 или 12,5',
              reversed: 'Значение «от» больше значения «до»',
            }}
            comfortable={comfortable}
            onApply={(range) => onChange(setRangeFilter(state, facet.key, range))}
          />
        );
      case 'price':
        return (
          <RangeFacetGroup
            key={facet.key}
            legend="Цена, ₽"
            label="Цена"
            bounds={facet.bounds}
            selected={facet.selected}
            integer
            messages={{
              notNumber: 'Введите сумму в рублях целым числом',
              reversed: 'Минимальная цена больше максимальной',
            }}
            comfortable={comfortable}
            onApply={(range) => onChange(setPriceRange(state, range))}
          />
        );
      case 'frequency':
        return (
          <FrequencyFacetGroup
            key={facet.key}
            facet={facet}
            reviewValues={frequencyReviewValues}
            comfortable={comfortable}
            onApply={(query, mode) => onChange(setFrequency(state, query, mode))}
          />
        );
    }
  };

  return (
    <form
      aria-labelledby={variant === 'sidebar' ? titleId : undefined}
      aria-label={variant === 'drawer' ? 'Подбор по параметрам' : undefined}
      // В Drawer фокус при открытии — на саму форму (Drawer берёт [data-autofocus]): первым
      // фокусируемым было бы поле частоты, и на телефоне сразу выезжала бы клавиатура.
      tabIndex={variant === 'drawer' ? -1 : undefined}
      data-autofocus={variant === 'drawer' ? true : undefined}
      // Поля применяются по Enter/blur сами; отправка формы (sr-кнопка) ничего не перезагружает —
      // blur последнего поля уже применил его значение.
      onSubmit={(event) => event.preventDefault()}
      // relative: sr-only-элементы внутри (position: absolute) иначе позиционируются от <dialog>
      // Drawer и раздувают его прокрутку — при фокусе на опции уезжала шапка Drawer.
      // Колонка с прокруткой обрезает всё, что за её краем, а кольцо фокуса выходит за контрол на
      // 4 px (outline 2 px + отступ 2 px, §5.7): внутренний отступ 4 px слева и сверху/снизу,
      // компенсированный отрицательным полем, — контролы стоят на прежнем месте, кольцо видно;
      // scroll-padding — то же при прокрутке к контролу у края колонки.
      className={cn(
        'relative outline-none',
        variant === 'sidebar' &&
          'sticky top-6 -my-1 -ml-1 max-h-[calc(100dvh-2.5rem)] scroll-py-2 overflow-y-auto py-1 pr-2 pl-1',
        className,
      )}
    >
      {variant === 'sidebar' ? (
        <div className="flex min-h-8 items-center justify-between gap-3 pb-3">
          <h2 id={titleId} className="text-body font-semibold">
            Подбор по параметрам
          </h2>
          {hasActive && onReset ? (
            <Button variant="link" size="sm" onClick={onReset}>
              Сбросить всё
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={cn(variant === 'drawer' && '[&>*:first-child]:border-t-0')}>
        {result.facets.map(renderFacet)}
        {result.strictAvailable || state.strict ? (
          <StrictToggle
            checked={state.strict}
            comfortable={comfortable}
            onToggle={() => onChange(setStrict(state, !state.strict))}
          />
        ) : null}
      </div>
      {/*
        Неявная отправка формы по Enter (§4.5). Вне порядка Tab: невидимая кнопка забирала бы
        фокус, и он «пропадал» с экрана (WCAG 2.4.7); Enter в поле отправляет форму и так.
      */}
      <button type="submit" tabIndex={-1} className="sr-only">
        Применить параметры
      </button>
    </form>
  );
}
