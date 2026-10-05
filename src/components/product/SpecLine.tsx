import { NeedsReviewBadge } from '@/components/ui/Badge';
import { NBSP, getSpecLine, technicalSegments } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import type { AttrStatus, Product } from '@/types/catalog';

/**
 * Ключевые параметры товара и показ статуса значения (DESIGN §4.7, §4.10). Пункты, подписи и
 * порядок — `getSpecLine(product)` движка; здесь только разметка.
 *
 *   <SpecLine product={product} />                 // «700–1100 МГц · 12 дБи · N-female» (список, смешанная таблица)
 *   <SpecLine product={product} variant="list" />  // карточка: dl «Частотный диапазон — 700–1100 МГц»
 *   <StatusValue text="3100–4500 МГц" status="inferred" />   // «3100–4500 МГц*» + sr-пояснение
 *   {hasInferred && <p className="mt-3 text-caption text-ink-muted">{INFERRED_FOOTNOTE}</p>}
 */

export const INFERRED_FOOTNOTE = '* Единица не указана в прайсе, принята по контексту.';

/**
 * Текст с техническими значениями без разрывов внутри (`technicalSegments` движка): единица не
 * отрывается от числа, строка не начинается с «—», «SMA-male» и «700–6100 МГц» не рвутся на
 * дефисе. Символы данных те же — поиск по странице и копирование работают.
 *
 *   <TechText text={product.name} />   // название в таблице, списке, карточке
 */
export function TechText({ text }: { text: string }) {
  return technicalSegments(text).map((segment, index) =>
    segment.keep ? (
      <span key={index} className="whitespace-nowrap">
        {segment.text}
      </span>
    ) : (
      segment.text
    ),
  );
}

/** Разделитель пунктов строки параметров: неразрывный пробел перед «·» — строка с него не начинается. */
const SPEC_SEPARATOR = `${NBSP}· `;

export interface StatusValueProps {
  text: string;
  status: AttrStatus;
  /** Пояснение у needs-review (`attribute.note`) — под значением, если `showNote`. */
  note?: string;
  showNote?: boolean;
  className?: string;
}

/** Значение со статусом: inferred — «*» + sr «(единица принята по контексту)»; needs-review — «Уточняется». */
export function StatusValue({ text, status, note, showNote = false, className }: StatusValueProps) {
  if (status === 'needs-review') {
    return (
      <span className={cn('inline-flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
        <span>
          <TechText text={text} />
        </span>
        <NeedsReviewBadge />
        {showNote && note ? (
          <span className="block w-full text-small text-ink-secondary">{note}</span>
        ) : null}
      </span>
    );
  }
  return (
    <span className={className}>
      <TechText text={text} />
      {status === 'inferred' ? (
        <>
          <span aria-hidden>*</span>
          <span className="sr-only"> (единица принята по контексту)</span>
        </>
      ) : null}
    </span>
  );
}

export interface SpecLineProps {
  product: Product;
  variant?: 'inline' | 'list';
  className?: string;
}

export function SpecLine({ product, variant = 'inline', className }: SpecLineProps) {
  const items = getSpecLine(product);
  if (items.length === 0) return null;
  if (variant === 'list') {
    return (
      <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small', className)}>
        {items.map((item) => (
          <div key={item.key} className="contents">
            <dt className="text-ink-muted">{item.label}</dt>
            <dd className="min-w-0 text-ink">
              <StatusValue text={item.text} status={item.status} note={item.note} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <p className={cn('text-small text-ink-secondary', className)}>
      {items.map((item, index) => (
        <span key={item.key}>
          {index > 0 ? SPEC_SEPARATOR : null}
          <StatusValue text={item.text} status={item.status} note={item.note} />
        </span>
      ))}
    </p>
  );
}

/** В строке параметров товара есть значение «принято по контексту» — нужна сноска. */
export function specLineHasInferred(product: Product): boolean {
  return getSpecLine(product).some((item) => item.status === 'inferred');
}
