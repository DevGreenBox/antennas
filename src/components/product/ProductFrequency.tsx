import { NeedsReviewBadge } from '@/components/ui/Badge';
import { ProductBandScale } from '@/components/ui/BandScale';
import { attributeLabel, formatAttrValue, getSpecLine } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/catalog';

import { INFERRED_FOOTNOTE, StatusValue } from './SpecLine';

/**
 * Частотный диапазон на первом экране товара (DESIGN § R.8): главный параметр подбора — крупно и
 * со спектральной шкалой `lg`.
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
      <dt className="spec-label">{attributeLabel('frequency')}</dt>
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

/**
 * Остальные ключевые параметры первого экрана (`getSpecLine` без частоты): подпись над значением,
 * в две–три колонки. Полный список — в «Характеристиках» ниже.
 */
export function ProductKeySpecs({ product, className }: { product: Product; className?: string }) {
  const items = getSpecLine(product).filter((item) => item.key !== 'frequency');
  if (items.length === 0) return null;
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3', className)}>
      {items.map((item) => (
        <div key={item.key} className="min-w-0">
          <dt className="spec-label">{item.label}</dt>
          <dd className="mt-1 text-body font-medium text-ink">
            <StatusValue text={item.text} status={item.status} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
