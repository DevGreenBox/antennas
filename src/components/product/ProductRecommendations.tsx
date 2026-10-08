import { DemoBadge } from '@/components/ui/Badge';
import { site } from '@/config/site';
import type { Recommendations } from '@/lib/repository';
import type { Product } from '@/types/catalog';

import { ProductCard } from './ProductCard';
import { INFERRED_FOOTNOTE, specLineHasInferred } from './SpecLine';

/**
 * «К этому товару подойдёт» (DESIGN §2.6, решение координатора 2026-10-05, ТЗ §7):
 *
 * - `approved` — совместимость проверена менеджером: обычные карточки, под карточкой — его
 *   пояснение, если есть;
 * - `drafts` — связи, выведенные из названий прайса («Чехол для тип2» → Тип2): совместимость никто
 *   не проверял, поэтому показываются только в демо, отдельной подгруппой с бейджем «Демо» и
 *   прямой подписью. При выключенном демо их нет (репозиторий уже отфильтровал; здесь — страховка).
 *
 * Показывать нечего — блок не рендерится вовсе: ни заголовка, ни пустого состояния.
 *
 * В карточках есть значение «*» (единица принята по контексту, §4.10) — под блоком сноска.
 */
/** Сетка как у плитки каталога: одна карточка не растягивается на всю ширину. */
const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4';

function CardList({
  products,
  notes,
}: {
  products: readonly Product[];
  notes: Readonly<Record<string, string>>;
}) {
  return (
    <ul className={GRID}>
      {products.map((product) => (
        <li key={product.id} className="flex flex-col gap-2">
          <ProductCard product={product} className="flex-1" />
          {notes[product.id] ? (
            <p className="text-caption text-ink-muted">{notes[product.id]}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ProductRecommendations({
  recommendations,
  className,
}: {
  recommendations: Recommendations;
  className?: string;
}) {
  const { approved, notes } = recommendations;
  const drafts = site.demo.enabled ? recommendations.drafts : [];
  if (approved.length === 0 && drafts.length === 0) return null;
  const hasInferred = [...approved, ...drafts].some(specLineHasInferred);

  return (
    <section
      aria-labelledby="recommendations-title"
      className={className}
      data-testid="recommendations"
    >
      <h2
        id="recommendations-title"
        className="mb-6 text-title font-medium lg:mb-8 lg:text-heading"
      >
        К этому товару подойдёт
      </h2>
      {approved.length > 0 ? <CardList products={approved} notes={notes} /> : null}
      {drafts.length > 0 ? (
        <div
          className={approved.length > 0 ? 'mt-8' : undefined}
          data-testid="recommendations-drafts"
        >
          <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2">
            <DemoBadge className="shrink-0" />
            <p className="max-w-text text-small text-ink-secondary">
              Черновая связь из названия позиции в прайсе. На рабочем сайте появится после
              подтверждения менеджером.
            </p>
          </div>
          <CardList products={drafts} notes={notes} />
        </div>
      ) : null}
      {hasInferred ? (
        <p className="mt-4 text-caption text-ink-muted" data-testid="recommendations-footnote">
          {INFERRED_FOOTNOTE}
        </p>
      ) : null}
    </section>
  );
}
