import { NeedsReviewBadge } from '@/components/ui/Badge';
import { ProductBandScale } from '@/components/ui/BandScale';
import { attributeLabel, formatAttrValue } from '@/lib/catalog';
import type { Product } from '@/types/catalog';

import { INFERRED_FOOTNOTE } from './SpecLine';

/**
 * Частотный диапазон над ценой (DESIGN §2.6 п.4, §4.10, §5.10): главный параметр подбора —
 * крупно и со спектральной шкалой `lg`.
 *
 * - confirmed — значение и шкала;
 * - inferred — «*», шкала штриховкой и сноска под ней (единица принята по контексту);
 * - needs-review («6000–8000 ГГц») — значение как в прайсе + «Уточняется» и пояснение, БЕЗ шкалы:
 *   положение на оси зависит от единицы, которая как раз не подтверждена.
 *
 * Нет частоты в данных (мачта, кабели, чехлы) — блок не рендерится.
 */
export function ProductFrequency({ product, className }: { product: Product; className?: string }) {
  const attr = product.attributes.find((item) => item.code === 'frequency');
  if (attr === undefined) return null;
  const text = formatAttrValue(attr.code, attr.value);
  const inferred = attr.status === 'inferred';

  return (
    <dl className={className} data-testid="product-frequency">
      <dt className="text-small text-ink-secondary">{attributeLabel('frequency')}</dt>
      <dd className="mt-1">
        {attr.status === 'needs-review' ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-title font-semibold tabular-nums">{text}</span>
              <NeedsReviewBadge />
            </div>
            {attr.note ? <p className="mt-1 text-small text-ink-secondary">{attr.note}</p> : null}
          </>
        ) : (
          <>
            <p className="text-title font-semibold tabular-nums">
              {text}
              {inferred ? (
                <>
                  <span aria-hidden>*</span>
                  <span className="sr-only"> (единица принята по контексту)</span>
                </>
              ) : null}
            </p>
            <ProductBandScale product={product} size="lg" className="mt-3" />
            {inferred ? (
              <p className="mt-2 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p>
            ) : null}
          </>
        )}
      </dd>
    </dl>
  );
}
