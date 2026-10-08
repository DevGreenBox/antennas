import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Секция текстовой страницы (контакты, доставка, документы, DESIGN § R): `h2` с необязательной
 * пометкой (Badge «Уточняется» / «Текст готовится», §2.18–2.19) и текст. Без карточек и иконок —
 * типографика, тонкие разделители и удобная длина строки: текст не шире `TEXT_MEASURE` (~70
 * знаков кириллицы на 16 px).
 *
 * Раскладки:
 * - `aside` (по умолчанию) — строка редакционной сетки: на ≥ lg заголовок в левой колонке той же
 *   ширины, что колонка подбора каталога (`catalog` 260 px / `catalog-wide` 288 px), текст —
 *   справа. Разделители между строками рисует родитель (`divide-y`), см. `ContentRows`;
 * - `stack` — заголовок над текстом: разделы юридического документа (`LegalPage`) и полоса шагов
 *   «Как проходит покупка» (`wide` — без ограничения ширины).
 *
 * Вертикальные отступы — у `aside` свои (строка сетки), у `stack` задаёт родитель через
 * `className`.
 */

/** Длина строки основного текста: токен `measure` (65ch ≈ 70 знаков кириллицы Plex Sans 16 px). */
export const TEXT_MEASURE = 'max-w-measure';

export function ContentSection({
  id,
  title,
  status,
  layout = 'aside',
  wide = false,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Пометка у заголовка — Badge. */
  status?: ReactNode;
  layout?: 'aside' | 'stack';
  /** Только `stack`: без ограничения длины строки (горизонтальные шаги процесса). */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const heading = (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2',
        layout === 'aside' ? 'lg:flex-col lg:items-start' : 'mb-3 lg:mb-4',
      )}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      {status}
    </div>
  );
  const body = (
    <div
      className={cn(
        'min-w-0 text-body text-ink-secondary',
        wide ? null : TEXT_MEASURE,
        // Первая строка текста — на базовой линии заголовка соседней колонки (h2 22/28 и 16/24).
        layout === 'aside' ? 'lg:pt-1' : null,
      )}
    >
      {children}
    </div>
  );

  if (layout === 'stack') {
    return (
      <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-4', className)}>
        {heading}
        {body}
      </section>
    );
  }
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        'grid scroll-mt-4 gap-x-16 gap-y-3 py-8 lg:grid-cols-catalog lg:py-10 xl:grid-cols-catalog-wide',
        className,
      )}
    >
      {heading}
      {body}
    </section>
  );
}

/**
 * Строки `aside`-секций одной страницы: тонкая линия `line` сверху и `line-subtle` между
 * строками — как разделы характеристик товара. `rule={false}` — без верхней линии, когда прямо
 * над строками уже есть своя (нижняя граница полосы шагов на «Доставке и оплате»).
 */
export function ContentRows({
  rule = true,
  className,
  children,
}: {
  rule?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('divide-y divide-line-subtle', rule ? 'border-t border-line' : null, className)}
    >
      {children}
    </div>
  );
}
