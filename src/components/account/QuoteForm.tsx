'use client';

import { useId, useRef, useState } from 'react';

import type { ClientCategory } from '@/components/cart/catalog-data';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Choice';
import { ErrorSummary, Field, FieldError } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { QuantitySelector } from '@/components/ui/QuantitySelector';
import { formatPrice } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { initialQuoteDraft, lastAnnulledQuote, nextManagerLineId } from '@/lib/demo-orders';
import {
  formatRublesInput,
  parseMoneyField,
  quoteTotals,
  suggestPromoDiscount,
  validateQuoteDraft,
} from '@/lib/demo-pricing';
import { useDebouncedValue } from '@/lib/use-client-value';
import type { QuoteDraft, QuoteDraftError, QuoteDraftLine } from '@/lib/demo-pricing';
import type { Product } from '@/types/catalog';
import type { DemoOrder } from '@/types/order';

/**
 * Форма согласования в демо-панели менеджера (DESIGN §3.9): цены (обязательны, в том числе для
 * позиций «по запросу»), количества, исключение и добавление позиций, скидка, доставка,
 * комментарий. Итоги и проверки — `quoteTotals` / `validateQuoteDraft` (demo-pricing), сама
 * версия создаётся `demoManager.issueQuote` — форма ничего не считает «на глаз».
 *
 * Деньги вводятся в рублях (запятая или точка, до 2 знаков) и уходят в копейках; пустое поле и
 * «не число» различаются (`parseMoneyField`): «1 000 руб» — ошибка, а не тихий 0. Скидка, пока
 * её не правили руками, следует за ценами: процент промокода от позиций, которые в заявке были
 * с ценой из прайса.
 *
 * Раскладка зависит от ширины самой формы (container queries), а не окна: панель стоит в узкой
 * колонке страницы заказа, и на 1024 px сетка строк по брейкпоинту md сжимала название до
 * столбика букв. Уже `ROW_GRID_MIN` — карточки (название, ниже цена, количество, сумма).
 *
 * Итоги — в `role="status"`, но обновляются с задержкой: иначе скринридер зачитывал бы их на
 * каждый введённый символ.
 *
 * Подача (DESIGN § R.1): форма стоит внутри демо-панели, поэтому своих рамок и подложек у неё нет
 * (карточка в карточке) — итоги отделены линией. Поля и кнопки — 40 px на десктопе и 44–48 px на
 * < lg (цели нажатия); количество — QuantitySelector `md` той же высоты, что поле цены.
 */

interface FormLine extends Omit<QuoteDraftLine, 'unitPrice'> {
  priceText: string;
  /** В снимке заявки позиция была «по запросу». */
  requestInSnapshot: boolean;
}

/**
 * Сетка строки позиций — когда форма не уже 44rem (≈ 700 px; уже — название сжималось до двух
 * слов в строке). Колонка количества фиксирована (ширина QuantitySelector md на < lg, где кнопки
 * 48 px): у заголовков и строк разные сетки, и с `auto` колонки заголовка съезжали относительно
 * полей.
 */
const GRID = '@min-[44rem]:grid-cols-[minmax(0,1fr)_7.5rem_9.25rem_7rem_6.5rem]';
/** Задержка обновления итогов для скринридера (и на экране — они в одном live-регионе). */
const TOTALS_DELAY_MS = 600;

export function priceFieldId(lineId: string) {
  return `quote-price-${lineId}`;
}

function toDraftLine(line: FormLine): QuoteDraftLine {
  return {
    lineId: line.lineId,
    productId: line.productId,
    code: line.code,
    name: line.name,
    quantity: line.quantity,
    unitPrice: parseMoneyField(line.priceText),
    origin: line.origin,
    excluded: line.excluded,
  };
}

export function QuoteForm({
  order,
  products,
  categories,
  onIssue,
}: {
  order: DemoOrder;
  products: readonly Product[];
  categories: readonly ClientCategory[];
  /** «Выставить к оплате»: ошибки ядра (например, другая вкладка уже изменила заказ). */
  onIssue: (draft: QuoteDraft) => QuoteDraftError[] | null;
}) {
  const baseId = useId();
  const [initial] = useState(() => initialQuoteDraft(order));
  const requestLines = new Set(
    order.items.filter((item) => item.priceType === 'request').map((item) => item.lineId),
  );
  const [lines, setLines] = useState<FormLine[]>(() =>
    initial.lines.map((line) => ({
      ...line,
      priceText: formatRublesInput(line.unitPrice),
      requestInSnapshot: requestLines.has(line.lineId),
    })),
  );
  // Предзаполнение из аннулированной версии — скидка уже согласовывалась, не пересчитываем.
  const [discountTouched, setDiscountTouched] = useState(() => lastAnnulledQuote(order) !== null);
  const [discountText, setDiscountText] = useState(() => formatRublesInput(initial.discount));
  const [discountNote, setDiscountNote] = useState(initial.discountNote);
  const [deliveryText, setDeliveryText] = useState(() => formatRublesInput(initial.delivery));
  const [deliveryNote, setDeliveryNote] = useState(initial.deliveryNote);
  const [managerComment, setManagerComment] = useState(initial.managerComment);
  const [addId, setAddId] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<QuoteDraftError[] | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const draftLines = lines.map(toDraftLine);
  const suggested = suggestPromoDiscount(draftLines, order);
  const discountValue = discountTouched ? discountText : formatRublesInput(suggested);
  const draft: QuoteDraft = {
    lines: draftLines,
    discount: discountTouched ? parseMoneyField(discountText) : suggested,
    discountNote,
    delivery: parseMoneyField(deliveryText),
    deliveryNote,
    managerComment,
  };
  const totals = quoteTotals(draft);
  const shownTotals = useDebouncedTotals(totals, draft.delivery === null);
  const errors: QuoteDraftError[] = attempted
    ? (serverErrors ?? validateQuoteDraft(draft).errors)
    : [];
  const lineErrors = (lineId: string) => errors.filter((error) => error.lineId === lineId);
  const errorOf = (...codes: QuoteDraftError['code'][]) =>
    errors.find((error) => codes.includes(error.code))?.message ?? null;
  const discountError = errorOf('discount-invalid', 'discount-negative', 'discount-too-large');
  const deliveryError = errorOf('delivery-missing', 'delivery-invalid');
  const generalError = errorOf('no-lines', 'total-not-positive');

  const summaryItems = errors.map((error, index) => ({
    fieldId:
      error.lineId !== undefined
        ? priceFieldId(error.lineId)
        : error.code.startsWith('discount')
          ? `${baseId}-discount`
          : error.code.startsWith('delivery')
            ? `${baseId}-delivery`
            : `${baseId}-add`,
    message: error.message,
    key: `${error.code}-${error.lineId ?? ''}-${index}`,
  }));
  // ErrorSummary ключует ссылки по fieldId — одно сообщение на поле.
  const uniqueSummary = summaryItems.filter(
    (item, index) => summaryItems.findIndex((other) => other.fieldId === item.fieldId) === index,
  );

  const patchLine = (lineId: string, patch: Partial<FormLine>) => {
    setServerErrors(null);
    setLines((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));
  };

  const roots = categories.filter((category) => category.parentId === null);

  const addLine = () => {
    const product = products.find((item) => item.id === addId);
    if (!product) return;
    setServerErrors(null);
    setLines((prev) => [
      ...prev,
      {
        lineId: nextManagerLineId(prev),
        productId: product.id,
        code: product.code,
        name: product.name,
        quantity: 1,
        priceText:
          product.priceType === 'fixed' && product.price !== null
            ? formatRublesInput(product.price)
            : '',
        origin: 'added-by-manager',
        excluded: false,
        requestInSnapshot: false,
      },
    ]);
    setAddId('');
  };

  return (
    <form
      noValidate
      className="@container flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        const check = validateQuoteDraft(draft);
        if (!check.ok) {
          setServerErrors(null);
          requestAnimationFrame(() => summaryRef.current?.focus());
          return;
        }
        const rejected = onIssue(draft);
        setServerErrors(rejected);
      }}
    >
      <ErrorSummary ref={summaryRef} items={uniqueSummary} />

      <div>
        <h3 className="mb-2">Позиции</h3>
        <div
          aria-hidden
          className={cn(
            'hidden gap-3 border-b border-line pb-2 text-caption text-ink-muted @min-[44rem]:grid',
            GRID,
          )}
        >
          <span>Товар</span>
          <span>Цена за шт., ₽</span>
          <span>Кол-во</span>
          <span className="text-right">Сумма</span>
          <span>Исключить</span>
        </div>
        <ul>
          {lines.map((line) => {
            const unitPrice = parseMoneyField(line.priceText);
            const lineSum =
              unitPrice !== null && unitPrice > 0 ? formatPrice(unitPrice * line.quantity) : '—';
            const ownErrors = lineErrors(line.lineId);
            const priceId = priceFieldId(line.lineId);
            const errorId = `${priceId}-error`;
            return (
              <li
                key={line.lineId}
                className={cn(
                  'grid grid-cols-2 items-start gap-3 border-b border-line-subtle py-3',
                  GRID,
                  line.excluded && 'text-ink-muted',
                )}
              >
                <div className="col-span-2 min-w-0 @min-[44rem]:col-span-1">
                  <p
                    className={cn(
                      'text-small font-medium',
                      line.excluded ? 'line-through' : 'text-ink',
                    )}
                  >
                    {line.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                    <span className="font-mono">{line.code}</span>
                    {line.requestInSnapshot ? <Badge tone="neutral">По запросу</Badge> : null}
                    {line.origin === 'added-by-manager' ? <span>Добавлено менеджером</span> : null}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={priceId}
                    className="text-small font-medium text-ink @min-[44rem]:sr-only"
                  >
                    Цена за шт., ₽<span className="sr-only">: {line.name}</span>
                  </label>
                  <Input
                    id={priceId}
                    size="md"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-required
                    invalid={ownErrors.length > 0}
                    aria-describedby={ownErrors.length > 0 ? errorId : undefined}
                    // Высота — как у QuantitySelector md рядом (48 → 40 px с lg), ряд не «прыгает».
                    className="max-lg:h-12"
                    value={line.priceText}
                    onChange={(event) => patchLine(line.lineId, { priceText: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span aria-hidden className="text-small font-medium text-ink @min-[44rem]:hidden">
                    Кол-во
                  </span>
                  <QuantitySelector
                    size="md"
                    value={line.quantity}
                    productName={line.name}
                    onChange={(quantity) => patchLine(line.lineId, { quantity })}
                  />
                </div>
                <p className="self-center text-small tabular-nums @min-[44rem]:self-start @min-[44rem]:pt-3 @min-[44rem]:text-right lg:@min-[44rem]:pt-2.5">
                  <span className="@min-[44rem]:sr-only">Сумма: </span>
                  {line.excluded ? 'исключено' : lineSum}
                </p>
                <Checkbox
                  label={
                    <>
                      Исключить<span className="sr-only"> «{line.name}»</span>
                    </>
                  }
                  comfortable
                  className="lg:min-h-10 lg:py-2.5"
                  checked={line.excluded}
                  onChange={(event) => patchLine(line.lineId, { excluded: event.target.checked })}
                />
                {/* Ошибка строки — на всю ширину строки, а не в узкой колонке цены. */}
                {ownErrors.length > 0 ? (
                  <div className="col-span-2 @min-[44rem]:col-span-5">
                    <FieldError id={errorId}>
                      {ownErrors.map((error) => error.message).join('. ')}
                    </FieldError>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {generalError ? (
          <div className="mt-2">
            <FieldError>{generalError}</FieldError>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 @min-[32rem]:flex-row @min-[32rem]:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`${baseId}-add`} className="text-small font-medium text-ink">
            Добавить позицию
          </label>
          <Select
            id={`${baseId}-add`}
            size="md"
            className="max-lg:h-11"
            value={addId}
            onChange={(event) => setAddId(event.target.value)}
          >
            <option value="">Выберите товар из каталога</option>
            {roots.map((root) => {
              const inRoot = products.filter((product) => product.categoryPath[0] === root.id);
              if (inRoot.length === 0) return null;
              return (
                <optgroup key={root.id} label={root.name}>
                  {inRoot.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.code}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </div>
        <Button
          variant="secondary"
          size="md"
          icon="plus"
          className="max-lg:h-11"
          disabled={addId === ''}
          onClick={addLine}
        >
          Добавить
        </Button>
      </div>

      {/* items-end: подсказка есть только у одного поля пары — поля ввода всё равно на одной линии. */}
      <div className="grid gap-5 @min-[32rem]:grid-cols-2 @min-[32rem]:items-end">
        <Field
          label="Скидка, ₽"
          id={`${baseId}-discount`}
          error={discountError}
          optional
          hint={
            order.promo
              ? `Предложено по промокоду ${order.promo.code}: ${order.promo.percent} % от позиций с ценой из прайса`
              : 'Промокода нет'
          }
        >
          <Input
            size="md"
            className="max-lg:h-11"
            inputMode="decimal"
            autoComplete="off"
            value={discountValue}
            onChange={(event) => {
              setServerErrors(null);
              setDiscountTouched(true);
              setDiscountText(event.target.value);
            }}
          />
        </Field>
        <Field label="Основание скидки" optional id={`${baseId}-discount-note`}>
          <Input
            size="md"
            className="max-lg:h-11"
            value={discountNote}
            onChange={(event) => setDiscountNote(event.target.value)}
          />
        </Field>
        <Field
          label="Доставка, ₽"
          id={`${baseId}-delivery`}
          error={deliveryError}
          hint="0, если доставка не нужна"
        >
          <Input
            size="md"
            className="max-lg:h-11"
            inputMode="decimal"
            autoComplete="off"
            value={deliveryText}
            onChange={(event) => {
              setServerErrors(null);
              setDeliveryText(event.target.value);
            }}
          />
        </Field>
        <Field label="Комментарий к доставке" optional id={`${baseId}-delivery-note`}>
          <Input
            size="md"
            className="max-lg:h-11"
            placeholder="Например: доставка до Москвы"
            value={deliveryNote}
            onChange={(event) => setDeliveryNote(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Комментарий менеджера" optional id={`${baseId}-comment`}>
        <Textarea
          rows={2}
          className="min-h-16"
          value={managerComment}
          onChange={(event) => setManagerComment(event.target.value)}
        />
      </Field>

      {/* live-регион — обёртка: role="status" на самом dl ломает его семантику (axe dlitem). */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="max-w-sm border-t border-line pt-3 text-small"
      >
        <dl>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-ink-secondary">Товары</dt>
            <dd className="tabular-nums">{formatPrice(shownTotals.itemsTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-ink-secondary">Скидка</dt>
            <dd className="tabular-nums">{formatPrice(-shownTotals.discount)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="text-ink-secondary">Доставка</dt>
            <dd className="tabular-nums">
              {shownTotals.deliveryMissing ? 'не указана' : formatPrice(shownTotals.delivery)}
            </dd>
          </div>
          <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2 text-body font-semibold">
            <dt>Итого</dt>
            <dd className="tabular-nums">{formatPrice(shownTotals.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <Button type="submit" variant="primary" size="md" className="max-lg:h-11">
            Выставить к оплате
          </Button>
        </div>
        <p className="text-small text-ink-secondary">
          В рабочей версии менеджер выставляет заказ к оплате в Admik, а покупатель получает
          уведомление.
        </p>
      </div>
    </form>
  );
}

/**
 * Итоги с задержкой `TOTALS_DELAY_MS`: значение — строка, чтобы новый объект итогов на каждом
 * рендере не перезапускал таймер.
 */
function useDebouncedTotals(totals: ReturnType<typeof quoteTotals>, deliveryMissing: boolean) {
  const key = [totals.itemsTotal, totals.discount, totals.delivery, totals.total, deliveryMissing]
    .map(String)
    .join('|');
  const [itemsTotal, discount, delivery, total, missing] = useDebouncedValue(
    key,
    TOTALS_DELAY_MS,
  ).split('|');
  return {
    itemsTotal: Number(itemsTotal),
    discount: Number(discount),
    delivery: Number(delivery),
    total: Number(total),
    deliveryMissing: missing === 'true',
  };
}
