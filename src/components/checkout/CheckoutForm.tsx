'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { CartModel } from '@/components/cart/cart-model';
import { DemoBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Segmented } from '@/components/ui/Choice';
import { ErrorSummary, Field, FieldError } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Notice } from '@/components/ui/Notice';
import { randomId } from '@/lib/demo-orders';
import { submitOrder } from '@/lib/store/orders';
import { logout, useProfile, useSessionEmail } from '@/lib/store/session';
import type { BuyerType } from '@/types/order';

import {
  CHECKOUT_FIELDS,
  CHECKOUT_FIELD_IDS,
  COMMENT_MAX,
  validateCheckout,
  validateCheckoutField,
} from './checkout-validation';
import type { CheckoutErrors, CheckoutField, CheckoutValues } from './checkout-validation';

/**
 * Форма заявки (DESIGN §2.10). Минимум полей: тип покупателя, имя, email (ключ входа в ЛК),
 * необязательные телефон, организация, ИНН и комментарий, согласие.
 *
 * Ошибки появляются после первой попытки отправки: ErrorSummary получает фокус, дальше поле
 * перепроверяется на blur, а ошибка исчезает при вводе, как только значение стало верным.
 *
 * Защита от двойной отправки — три слоя: кнопка в состоянии загрузки, синхронный флаг до
 * первого await и ключ идемпотентности (создаётся при монтировании формы): повтор с тем же
 * ключом возвращает уже созданный заказ (`submitOrder` → `createOrder`).
 *
 * Подача (DESIGN § R.1, § R.4): форма — белая панель (рамка `line`, радиус 6); разделы
 * «Покупатель», «Контакты», «Комментарий и согласие» и ряд отправки разделены тонкими линиями,
 * без вложенных карточек. Поля 44 px, главная кнопка 48 px. Демо-пометка — одна строка у кнопки
 * отправки (это и есть демо-действие), а не отдельная плашка.
 */

/** Раздел панели формы: со второго — тонкая линия сверху. */
const SECTION = 'border-t border-line-subtle pt-6';

const BUYER_OPTIONS = [
  { value: 'person', label: 'Частное лицо' },
  { value: 'company', label: 'Организация' },
] as const;

export function CheckoutForm({
  model,
  onSubmitStart,
  onSubmitFailed,
}: {
  model: CartModel;
  /** Отправка началась: страница «замораживает» состав (корзина очистится при успехе). */
  onSubmitStart: () => void;
  onSubmitFailed: () => void;
}) {
  const router = useRouter();
  const sessionEmail = useSessionEmail();
  const profile = useProfile(sessionEmail);
  const [idempotencyKey] = useState(randomId);
  const [values, setValues] = useState<CheckoutValues>(() => ({
    buyerType: profile?.buyerType ?? 'person',
    companyName: profile?.companyName ?? '',
    inn: profile?.inn ?? '',
    name: profile?.name ?? '',
    email: sessionEmail ?? '',
    phone: profile?.phone ?? '',
    comment: '',
    consent: false,
  }));
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [focusSummary, setFocusSummary] = useState(0);
  const sendingRef = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Вошедший покупатель: email — из сессии (заявка появится в его кабинете).
  const effective: CheckoutValues = sessionEmail ? { ...values, email: sessionEmail } : values;
  const blocked = model.unavailableCount > 0 || model.available.length === 0;

  useEffect(() => {
    if (focusSummary > 0) summaryRef.current?.focus();
  }, [focusSummary]);

  const update = <K extends keyof CheckoutValues>(key: K, value: CheckoutValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    const field = key as CheckoutField;
    if (CHECKOUT_FIELDS.includes(field) && errors[field] !== undefined) {
      const nextEffective = sessionEmail ? { ...next, email: sessionEmail } : next;
      if (validateCheckoutField(field, nextEffective) === null) {
        setErrors((prev) => {
          const rest = { ...prev };
          delete rest[field];
          return rest;
        });
      }
    }
  };

  const revalidate = (field: CheckoutField) => {
    if (!attempted) return;
    const message = validateCheckoutField(field, effective);
    setErrors((prev) => {
      const rest = { ...prev };
      if (message === null) delete rest[field];
      else rest[field] = message;
      return rest;
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingRef.current) return;
    setAttempted(true);
    const found = validateCheckout(effective);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFocusSummary((n) => n + 1);
      return;
    }
    if (blocked) return;
    sendingRef.current = true;
    setSending(true);
    setSubmitError(null);
    onSubmitStart();
    const isCompany = effective.buyerType === 'company';
    const result = await submitOrder({
      idempotencyKey,
      buyer: {
        type: effective.buyerType,
        name: effective.name,
        email: effective.email,
        phone: effective.phone,
        // При «Частное лицо» значения полей организации сохраняются в форме, но не отправляются.
        companyName: isCompany ? effective.companyName : null,
        inn: isCompany ? effective.inn.trim() : null,
        comment: effective.comment,
      },
      lines: model.available.map((line) => ({
        productId: line.item.productId,
        product: line.product,
        quantity: line.item.quantity,
      })),
      promoCode: model.totals.promo?.code ?? null,
    });
    if (result.ok) {
      router.replace(`/checkout/success?order=${encodeURIComponent(result.order.number)}`);
      return;
    }
    sendingRef.current = false;
    setSending(false);
    setSubmitError(result.message);
    onSubmitFailed();
  };

  const summaryItems = CHECKOUT_FIELDS.flatMap((field) =>
    errors[field] ? [{ fieldId: CHECKOUT_FIELD_IDS[field], message: errors[field] }] : [],
  );

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-6 rounded-md border border-line bg-surface p-4 sm:p-6 xl:p-8"
    >
      <p className="text-small text-ink-muted">
        Все поля обязательны, кроме отмеченных «необязательно».
      </p>

      <ErrorSummary ref={summaryRef} items={summaryItems} />

      <fieldset className="flex min-w-0 flex-col gap-5">
        <legend className="mb-4 text-title font-semibold">Покупатель</legend>
        <Segmented
          legend="Тип покупателя"
          legendHidden
          name="buyer-type"
          value={values.buyerType}
          options={BUYER_OPTIONS}
          onChange={(buyerType: BuyerType) => update('buyerType', buyerType)}
        />
        {values.buyerType === 'company' ? (
          <>
            <Field label="Название организации" optional id="checkout-company">
              <Input
                size="lg"
                autoComplete="organization"
                value={values.companyName}
                onChange={(event) => update('companyName', event.target.value)}
              />
            </Field>
            <Field
              label="ИНН"
              optional
              id={CHECKOUT_FIELD_IDS.inn}
              hint="10 цифр — для организации, 12 — для ИП"
              error={errors.inn}
            >
              <Input
                size="lg"
                inputMode="numeric"
                maxLength={12}
                autoComplete="off"
                value={values.inn}
                onChange={(event) => update('inn', event.target.value)}
                onBlur={() => revalidate('inn')}
              />
            </Field>
          </>
        ) : null}
      </fieldset>

      {/* Линия — на обёртке: у <fieldset> легенда легла бы прямо на верхнюю границу. */}
      <div className={SECTION}>
        <fieldset className="flex min-w-0 flex-col gap-5">
          <legend className="mb-4 text-title font-semibold">Контакты</legend>
          <Field label="Имя" id={CHECKOUT_FIELD_IDS.name} error={errors.name}>
            <Input
              size="lg"
              autoComplete="name"
              value={values.name}
              onChange={(event) => update('name', event.target.value)}
              onBlur={() => revalidate('name')}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Field
              label="Email"
              id={CHECKOUT_FIELD_IDS.email}
              error={errors.email}
              hint={
                sessionEmail
                  ? `Вы вошли как ${sessionEmail}. Заявка появится в вашем кабинете.`
                  : 'На этот адрес придёт код для входа в личный кабинет — там будут заявка и её статус.'
              }
            >
              <Input
                size="lg"
                type="email"
                autoComplete="email"
                placeholder="name@company.ru"
                readOnly={sessionEmail !== null}
                value={effective.email}
                onChange={(event) => update('email', event.target.value)}
                onBlur={() => revalidate('email')}
              />
            </Field>
            {sessionEmail ? (
              <Button
                variant="link"
                size="sm"
                className="self-start"
                onClick={() => {
                  // Email остаётся в поле — его можно поправить без повторного ввода.
                  update('email', sessionEmail);
                  logout();
                }}
              >
                Выйти
              </Button>
            ) : null}
          </div>
          <Field
            label="Телефон"
            optional
            id={CHECKOUT_FIELD_IDS.phone}
            hint="Если удобнее согласовать заявку по телефону."
            error={errors.phone}
          >
            <Input
              size="lg"
              type="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={(event) => update('phone', event.target.value)}
              onBlur={() => revalidate('phone')}
            />
          </Field>
        </fieldset>
      </div>

      <div className={`${SECTION} flex flex-col gap-6`}>
        <Field
          label="Комментарий к заявке"
          optional
          id={CHECKOUT_FIELD_IDS.comment}
          hint="Например: город доставки, сроки, вопросы по совместимости."
          error={errors.comment}
          counter={{ value: values.comment.length, max: COMMENT_MAX }}
        >
          <Textarea
            maxLength={COMMENT_MAX}
            rows={4}
            value={values.comment}
            onChange={(event) => update('comment', event.target.value)}
            onBlur={() => revalidate('comment')}
          />
        </Field>

        <div className="flex flex-col gap-1">
          <Checkbox
            id={CHECKOUT_FIELD_IDS.consent}
            label="Даю согласие на обработку персональных данных"
            textSize="body"
            comfortable
            className="lg:min-h-8 lg:py-1.5"
            checked={values.consent}
            invalid={errors.consent !== undefined}
            aria-required
            aria-describedby={errors.consent ? `${CHECKOUT_FIELD_IDS.consent}-error` : undefined}
            onChange={(event) => update('consent', event.target.checked)}
            onBlur={() => revalidate('consent')}
          />
          {errors.consent ? (
            <FieldError id={`${CHECKOUT_FIELD_IDS.consent}-error`}>{errors.consent}</FieldError>
          ) : null}
          <p className="text-small text-ink-secondary">
            Подробнее — в документах{' '}
            <a href="/legal/consent" target="_blank" rel="noopener" className="text-link">
              «Согласие на обработку персональных данных»
              <span className="sr-only"> (откроется в новой вкладке)</span>
            </a>{' '}
            и{' '}
            <a href="/legal/privacy" target="_blank" rel="noopener" className="text-link">
              «Политика обработки персональных данных»
              <span className="sr-only"> (откроется в новой вкладке)</span>
            </a>
            .
          </p>
        </div>
      </div>

      {submitError ? (
        <Notice tone="danger" live>
          {submitError}
        </Notice>
      ) : null}

      <div className={`${SECTION} flex flex-col gap-3 md:flex-row md:items-center md:gap-5`}>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth="mobile"
          className="md:shrink-0"
          loading={sending}
          loadingText="Отправляем…"
          disabled={blocked}
        >
          Отправить заявку
        </Button>
        <p className="flex items-start gap-2 text-small text-ink-secondary">
          <DemoBadge className="shrink-0" />
          <span className="pt-0.5">
            Заявка сохранится только в этом браузере и не будет отправлена менеджеру.
          </span>
        </p>
      </div>
    </form>
  );
}
