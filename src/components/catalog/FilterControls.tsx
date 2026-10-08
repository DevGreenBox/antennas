'use client';

import { useId, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { TechText } from '@/components/product/SpecLine';
import { Button } from '@/components/ui/Button';
import { Checkbox, Radio } from '@/components/ui/Choice';
import { FieldError } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { formatNumber, formatRubleAmount, parseFrequencyInput } from '@/lib/catalog';
import type {
  FlagFacet,
  FrequencyFacet,
  FrequencyMode,
  FrequencyQuery,
  NumericRange,
  OptionsFacet,
  RequestFacet,
} from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { capitalize, plural } from '@/lib/format';
import type { PluralForms } from '@/lib/format';

/**
 * Группы панели «Подбор по параметрам» (DESIGN §4.2–4.4, §5.9.17). Каждая рисует ровно то, что
 * вернул движок в `QueryResult.facets`, и отдаёт наружу новое значение — состояние меняет
 * FilterPanel помощниками движка. Чекбоксы и радио применяются сразу, числовые поля — по Enter
 * или blur; пока в поле ошибка, значение не применяется.
 */

/** «У 1 товара», «у 5 товаров» — родительный падеж для подписей под группами. */
const GENITIVE_PRODUCT_FORMS: PluralForms = ['товара', 'товаров', 'товаров'];

const genitive = (count: number) => `${count} ${plural(count, GENITIVE_PRODUCT_FORMS)}`;

/**
 * Общая оболочка группы: `fieldset` с разделителем сверху (§5.5). Разделитель — на обёртке, а не
 * на самом fieldset: у fieldset рамка проходит сквозь legend.
 */
export function FacetGroup({
  legend,
  legendHidden = false,
  className,
  children,
}: {
  legend: ReactNode;
  legendHidden?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('border-t border-line-subtle py-4', className)}>
      <fieldset className="min-w-0">
        <legend className={cn('mb-2 text-small font-semibold text-ink', legendHidden && 'sr-only')}>
          {legend}
        </legend>
        {children}
      </fieldset>
    </div>
  );
}

/** Подписи под группой: значения «уточняется» (не участвуют) и неуказанные при активном выборе. */
export function FacetNotes({
  excludedCount,
  missingCount,
  active,
  excludedText,
}: {
  excludedCount: number;
  missingCount: number;
  active: boolean;
  /** Своя формулировка для `excludedCount` (частота). */
  excludedText?: string;
}) {
  const notes: string[] = [];
  if (excludedCount > 0) {
    notes.push(
      excludedText ?? `У ${genitive(excludedCount)} значение уточняется — в подборе не участвует.`,
    );
  }
  // Неизвестное ≠ «нет»: при выборе такие позиции не показываются, но и не считаются
  // «без свойства» — говорим об этом, только когда выбор действительно их скрыл.
  if (active && missingCount > 0) {
    notes.push(`У ${genitive(missingCount)} значение не указано — в выдачу не попадают.`);
  }
  if (notes.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      {notes.map((note) => (
        <p key={note} className="text-caption text-ink-muted">
          {note}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Список опций.
// ---------------------------------------------------------------------------

/** Сколько опций видно до «Показать все» (§5.9.17). */
const OPTION_LIMIT = 8;

export function OptionsFacetGroup({
  facet,
  onToggle,
  comfortable,
}: {
  facet: OptionsFacet;
  onToggle: (value: string) => void;
  comfortable: boolean;
}) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const collapsible = facet.options.length > OPTION_LIMIT;
  // Выбранные за пределами первых восьми видны всегда — снять выбор можно без раскрытия.
  const visible =
    expanded || !collapsible
      ? facet.options
      : facet.options.filter((option, index) => index < OPTION_LIMIT || option.selected);
  const active = facet.options.some((option) => option.selected);
  return (
    <FacetGroup legend={facet.label}>
      <ul id={listId}>
        {visible.map((option) => (
          <li key={option.value}>
            <Checkbox
              label={<TechText text={capitalize(option.label)} />}
              count={option.count}
              checked={option.selected}
              disabled={!option.selected && option.count === 0}
              comfortable={comfortable}
              onChange={() => onToggle(option.value)}
            />
          </li>
        ))}
      </ul>
      {collapsible ? (
        <Button
          variant="link"
          size="sm"
          // В Drawer — строка 44 px, как у опций (цель нажатия, § R.9).
          className={cn('mt-1', comfortable && 'min-h-11')}
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Свернуть' : `Показать все (${facet.options.length})`}
        </Button>
      ) : null}
      <FacetNotes
        excludedCount={facet.excludedCount}
        missingCount={facet.missingCount}
        active={active}
      />
    </FacetGroup>
  );
}

// ---------------------------------------------------------------------------
// Флаги: IP67, «Цена по запросу», «Только подтверждённые значения».
// ---------------------------------------------------------------------------

export function FlagFacetGroup({
  facet,
  onToggle,
  comfortable,
}: {
  facet: FlagFacet | RequestFacet;
  onToggle: () => void;
  comfortable: boolean;
}) {
  // Флаг характеристики (IP67) — под видимым заголовком группы, как колонка таблицы («Защита»):
  // одинокий чекбокс без заголовка не читался как группа подбора. У «Цены по запросу» подпись
  // чекбокса и есть название группы — видимая legend повторила бы её.
  const legend = facet.kind === 'flag' ? facet.groupLabel : facet.label;
  return (
    <FacetGroup legend={legend} legendHidden={legend === facet.label}>
      <Checkbox
        label={facet.label}
        count={facet.count}
        checked={facet.selected}
        disabled={!facet.selected && facet.count === 0}
        comfortable={comfortable}
        onChange={onToggle}
      />
      {facet.kind === 'flag' ? (
        <FacetNotes
          excludedCount={facet.excludedCount}
          missingCount={facet.missingCount}
          active={facet.selected}
        />
      ) : null}
    </FacetGroup>
  );
}

export function StrictToggle({
  checked,
  onToggle,
  comfortable,
}: {
  checked: boolean;
  onToggle: () => void;
  comfortable: boolean;
}) {
  return (
    <div className="border-t border-line-subtle py-4">
      <Checkbox
        label="Только подтверждённые значения"
        description="Без значений, у которых единица не указана в прайсе и принята по контексту."
        checked={checked}
        comfortable={comfortable}
        onChange={onToggle}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Числовые поля: общие помощники.
// ---------------------------------------------------------------------------

/** Enter в поле применяет значение и не отправляет форму (форма — только для sr-кнопки). */
function onEnter(apply: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    apply();
  };
}

const rangeKey = (range: NumericRange | null) =>
  range === null ? '' : `${range.min ?? ''}-${range.max ?? ''}`;

/** Разбор числа из поля: пробелы (разряды) убираются, запятая = точка. null — пусто, NaN — ошибка. */
function parseNumberField(text: string, integer: boolean): number | null {
  const compact = text.replace(/[\s ]/g, '').replace(',', '.');
  if (compact === '') return null;
  const pattern = integer ? /^\d+$/ : /^\d+(?:\.\d+)?$/;
  return pattern.test(compact) ? Number(compact) : Number.NaN;
}

// ---------------------------------------------------------------------------
// Диапазон «от / до»: характеристики (КУ, дБи) и цена (₽).
// ---------------------------------------------------------------------------

export interface RangeFacetGroupProps {
  /** Название группы с единицей: «КУ, дБи», «Цена, ₽» — единица только здесь. */
  legend: string;
  /** Основа sr-подписей полей: «{label} от» / «{label} до». */
  label: string;
  bounds: { min: number; max: number } | null;
  selected: NumericRange | null;
  /** Цена — только целые рубли. */
  integer: boolean;
  /** Тексты ошибок (§6.5). */
  messages: { notNumber: string; reversed: string };
  onApply: (range: NumericRange | null) => void;
  comfortable: boolean;
  footer?: ReactNode;
}

export function RangeFacetGroup({
  legend,
  label,
  bounds,
  selected,
  integer,
  messages,
  onApply,
  comfortable,
  footer,
}: RangeFacetGroupProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const format = (value: number) => (integer ? String(value) : formatNumber(value));
  const textOf = (range: NumericRange | null) => ({
    min: range?.min === null || range === null ? '' : format(range.min),
    max: range?.max === null || range === null ? '' : format(range.max),
  });

  const [texts, setTexts] = useState(() => textOf(selected));
  const [error, setError] = useState<string | null>(null);
  // Значение сменилось извне (чип, «Сбросить всё», «Назад») — поля показывают его.
  const [syncedKey, setSyncedKey] = useState(rangeKey(selected));
  if (rangeKey(selected) !== syncedKey) {
    setSyncedKey(rangeKey(selected));
    setTexts(textOf(selected));
    setError(null);
  }

  const apply = () => {
    const min = parseNumberField(texts.min, integer);
    const max = parseNumberField(texts.max, integer);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setError(messages.notNumber);
      return;
    }
    if (min !== null && max !== null && min > max) {
      setError(messages.reversed);
      return;
    }
    setError(null);
    const next = min === null && max === null ? null : { min, max };
    if (rangeKey(next) !== rangeKey(selected)) onApply(next);
  };

  const placeholder = (value: number | undefined) =>
    value === undefined ? undefined : integer ? formatRubleAmount(value) : formatNumber(value);
  const field = (edge: 'min' | 'max') => (
    <Input
      // В Drawer поле 44 px — цель нажатия на сенсорном экране (§5.7).
      size={comfortable ? 'lg' : 'sm'}
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      aria-label={`${label} ${edge === 'min' ? 'от' : 'до'}`}
      aria-describedby={error !== null ? errorId : undefined}
      // Без суффикса единицы: она в легенде группы («Цена, ₽»), а поле в колонке панели на
      // 1024 px — 128 px, и суффикс съедал место плейсхолдера («98 000» обрезалось до «98 00»).
      prefix={edge === 'min' ? 'от' : 'до'}
      placeholder={placeholder(bounds?.[edge])}
      value={texts[edge]}
      invalid={error !== null}
      onChange={(event) => setTexts((current) => ({ ...current, [edge]: event.target.value }))}
      onKeyDown={onEnter(apply)}
      onBlur={apply}
    />
  );

  return (
    <FacetGroup legend={legend}>
      <div className="grid grid-cols-2 gap-2">
        {field('min')}
        {field('max')}
      </div>
      {error !== null ? (
        <div className="mt-2">
          <FieldError id={errorId}>{error}</FieldError>
        </div>
      ) : null}
      {footer}
    </FacetGroup>
  );
}

// ---------------------------------------------------------------------------
// Частота (§4.3): одно поле + режим.
// ---------------------------------------------------------------------------

const freqKey = (query: FrequencyQuery | null) =>
  query === null ? '' : `${query.min}-${query.max}`;

/** Запрос частоты в поле: «1000», «900–1100», «2400,5». */
function frequencyText(query: FrequencyQuery | null): string {
  if (query === null) return '';
  const fmt = (value: number) => String(Math.round(value * 1e6) / 1e6).replace('.', ',');
  return query.min === query.max ? fmt(query.min) : `${fmt(query.min)}–${fmt(query.max)}`;
}

export function FrequencyFacetGroup({
  facet,
  reviewValues,
  onApply,
  comfortable,
}: {
  facet: FrequencyFacet;
  /** Спорные значения частоты в контексте («6000–8000 ГГц») — для подписи под группой. */
  reviewValues: readonly string[];
  onApply: (query: FrequencyQuery | null, mode: FrequencyMode) => void;
  comfortable: boolean;
}) {
  const id = useId();
  const inputId = `${id}-input`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const [text, setText] = useState(() => frequencyText(facet.selected));
  const [error, setError] = useState<string | null>(null);
  const [syncedKey, setSyncedKey] = useState(freqKey(facet.selected));
  if (freqKey(facet.selected) !== syncedKey) {
    setSyncedKey(freqKey(facet.selected));
    setText(frequencyText(facet.selected));
    setError(null);
  }

  const parsed = text.trim() === '' ? null : parseFrequencyInput(text);
  const textInvalid = text.trim() !== '' && parsed === null;
  // Режим имеет смысл только для диапазона: для одной частоты формулы совпадают.
  const effective = textInvalid ? facet.selected : parsed;
  const isRange = effective !== null && effective.min !== effective.max;

  const apply = (mode: FrequencyMode = facet.mode) => {
    if (textInvalid) {
      setError('Введите частоту в МГц, например 1000 или 900–1100');
      return;
    }
    setError(null);
    if (freqKey(parsed) !== freqKey(facet.selected) || mode !== facet.mode) onApply(parsed, mode);
  };

  const excludedText =
    facet.excludedCount > 0
      ? facet.strict && facet.inferredCount > 0
        ? `У ${genitive(facet.excludedCount)} частота уточняется или её единица принята по контексту — в подбор по частоте не попадают.`
        : `У ${genitive(facet.excludedCount)} частота уточняется${
            reviewValues.length > 0 ? ` (${reviewValues.join(', ')})` : ''
          } — в подбор по частоте не попадают.`
      : undefined;

  return (
    // Единица — в заголовке группы, как у диапазонов («КУ, дБи», «Цена, ₽»): «параметр, единица →
    // значения» читается одинаково по всей панели. Сравнение движка — всегда в МГц (§4.3).
    <FacetGroup legend={`${facet.label}, МГц`}>
      <label htmlFor={inputId} className="sr-only">
        Частота или диапазон, МГц
      </label>
      <Input
        id={inputId}
        size={comfortable ? 'lg' : 'sm'}
        inputMode="decimal"
        autoComplete="off"
        placeholder="1000 или 900–1100"
        value={text}
        invalid={error !== null}
        aria-describedby={error !== null ? `${errorId} ${hintId}` : hintId}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onEnter(() => apply())}
        onBlur={() => apply()}
      />
      {error !== null ? (
        <div className="mt-2">
          <FieldError id={errorId}>{error}</FieldError>
        </div>
      ) : null}
      <p id={hintId} className="mt-1.5 text-caption text-ink-muted">
        Число в МГц или диапазон через дефис. Можно «2,4 ГГц».
      </p>
      <fieldset className="mt-3 min-w-0">
        <legend className="sr-only">Как сравнивать диапазон</legend>
        <Radio
          name={`${id}-mode`}
          label="Есть пересечение"
          checked={facet.mode === 'overlap'}
          disabled={!isRange}
          comfortable={comfortable}
          onChange={() => apply('overlap')}
        />
        <Radio
          name={`${id}-mode`}
          label="Покрывает весь диапазон"
          checked={facet.mode === 'cover'}
          disabled={!isRange}
          comfortable={comfortable}
          onChange={() => apply('cover')}
        />
      </fieldset>
      <p className="mt-1 text-caption text-ink-muted">
        Пересечение — диапазон позиции хотя бы частично попадает в заданный. Покрывает весь —
        позиция работает во всём заданном диапазоне.
      </p>
      <FacetNotes
        excludedCount={facet.excludedCount}
        missingCount={facet.missingCount}
        active={facet.selected !== null}
        excludedText={excludedText}
      />
    </FacetGroup>
  );
}
