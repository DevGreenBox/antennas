'use client';

import { useId, useRef, useState } from 'react';

import { DemoBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';
import { useCart } from '@/lib/store/cart';

/**
 * Промокод (DESIGN §3.5, §5.9.28). Состояние общее для корзины и заявки — `cart.promoCode`;
 * проверка и тексты — `checkPromoCode()` из demo-pricing (через `useCart().applyPromo`).
 *
 * Свёрнуто: «Есть промокод?» + демо-подсказка с тестовым кодом. Развёрнуто: поле и «Применить».
 * Применён: «Промокод DEMO10» + «Демо» + «Убрать» и подпись о предварительной скидке.
 *
 * Демо-подсказка — одна строка с меткой «Демо» (DESIGN § R.5: демо-пометка только у демо-
 * действия, без отдельной пунктирной плашки — общее «это демо» уже сказано в демо-полосе).
 * Поле и «Применить» — 44 px на < lg (цели нажатия), 40 px на десктопе.
 */
export function PromoCodeField({
  onlyRequestItems,
  className,
}: {
  /** В корзине только позиции «по запросу»: скидка будет рассчитана при согласовании. */
  onlyRequestItems: boolean;
  className?: string;
}) {
  const promoCode = useCart((state) => state.promoCode);
  const applyPromo = useCart((state) => state.applyPromo);
  const removePromo = useCart((state) => state.removePromo);
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const formId = `${baseId}-form`;
  const toggleId = `${baseId}-toggle`;
  const demoCodes = site.demo.promoCodes.map((promo) => promo.code).join(', ');

  const apply = () => {
    const result = applyPromo(value);
    if (result.promo === null) {
      setError(result.message);
      setStatus(null);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setStatus(result.message);
    setValue('');
    setExpanded(false);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Итог применения — для скринридеров; глазами он виден по строке «Промокод …». */}
      <p role="status" className="sr-only">
        {status}
      </p>

      {promoCode !== null ? (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
            <span className="font-medium text-ink">Промокод {promoCode}</span>
            <DemoBadge />
            <Button
              variant="link"
              size="sm"
              className="ml-auto min-h-11 lg:min-h-0"
              onClick={() => {
                removePromo();
                setStatus('Промокод убран');
                setError(null);
                // Кнопка «Есть промокод?» появится после перерисовки — фокус на неё.
                requestAnimationFrame(() => document.getElementById(toggleId)?.focus());
              }}
            >
              Убрать
              <span className="sr-only"> промокод {promoCode}</span>
            </Button>
          </div>
          <p className="text-caption text-ink-muted">
            {onlyRequestItems
              ? 'Скидка будет рассчитана при согласовании: в корзине только позиции «по запросу».'
              : 'Скидка предварительная: окончательную сумму подтвердит менеджер при согласовании. На позиции «по запросу» скидка не распространяется.'}
          </p>
        </div>
      ) : (
        <>
          <Button
            id={toggleId}
            variant="link"
            size="sm"
            aria-expanded={expanded}
            aria-controls={formId}
            className="min-h-11 self-start lg:min-h-0"
            onClick={() => {
              setExpanded((open) => !open);
              setError(null);
            }}
          >
            Есть промокод?
          </Button>
          <div id={formId} hidden={!expanded}>
            {expanded ? (
              <form
                noValidate
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  apply();
                }}
              >
                <Field label="Промокод" error={error} className="min-w-0 flex-1">
                  <Input
                    ref={inputRef}
                    size="md"
                    className="max-lg:h-11"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={value}
                    onChange={(event) => {
                      setValue(event.target.value);
                      if (error !== null) setError(null);
                    }}
                    // Поле появилось по нажатию «Есть промокод?» — фокус сразу в нём.
                    autoFocus
                  />
                </Field>
                <Button type="submit" variant="secondary" size="md" className="max-lg:h-11">
                  Применить
                </Button>
              </form>
            ) : null}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-muted">
            <DemoBadge />
            <span>Промокод для проверки: {demoCodes}</span>
          </p>
        </>
      )}
    </div>
  );
}
