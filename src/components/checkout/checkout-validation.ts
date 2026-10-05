/**
 * Проверка формы заявки (DESIGN §2.10, §6.5). Тексты ошибок — ровно из §6.5; проверки email,
 * телефона и ИНН — из `@/lib/format` (те же, что в ядре демо-заказов).
 */

import { isValidEmail, isValidInn, isValidPhone } from '@/lib/format';
import type { BuyerType } from '@/types/order';

export const COMMENT_MAX = 1000;

export interface CheckoutValues {
  buyerType: BuyerType;
  companyName: string;
  inn: string;
  name: string;
  email: string;
  phone: string;
  comment: string;
  consent: boolean;
}

export type CheckoutField = 'inn' | 'name' | 'email' | 'phone' | 'comment' | 'consent';

/** Порядок полей в форме — порядок ссылок в ErrorSummary. */
export const CHECKOUT_FIELDS: readonly CheckoutField[] = [
  'inn',
  'name',
  'email',
  'phone',
  'comment',
  'consent',
];

/** id контролов — для ссылок ErrorSummary (`#checkout-email`) и e2e. */
export const CHECKOUT_FIELD_IDS: Readonly<Record<CheckoutField, string>> = {
  inn: 'checkout-inn',
  name: 'checkout-name',
  email: 'checkout-email',
  phone: 'checkout-phone',
  comment: 'checkout-comment',
  consent: 'checkout-consent',
};

export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

export function validateCheckoutField(field: CheckoutField, values: CheckoutValues): string | null {
  switch (field) {
    case 'inn':
      // ИНН необязателен и проверяется только у организации (у частного лица не отправляется).
      if (values.buyerType !== 'company' || values.inn.trim() === '') return null;
      return isValidInn(values.inn) ? null : 'ИНН — это 10 цифр для организации или 12 для ИП';
    case 'name':
      return values.name.trim() === '' ? 'Укажите имя' : null;
    case 'email':
      if (values.email.trim() === '') return 'Укажите email';
      return isValidEmail(values.email) ? null : 'Проверьте email — например, name@company.ru';
    case 'phone':
      if (values.phone.trim() === '') return null;
      return isValidPhone(values.phone) ? null : 'Проверьте телефон: нужно от 10 до 15 цифр';
    case 'comment':
      return values.comment.length > COMMENT_MAX ? 'Сократите комментарий до 1000 символов' : null;
    case 'consent':
      return values.consent ? null : 'Без согласия на обработку данных заявку отправить нельзя';
  }
}

export function validateCheckout(values: CheckoutValues): CheckoutErrors {
  const errors: CheckoutErrors = {};
  for (const field of CHECKOUT_FIELDS) {
    const message = validateCheckoutField(field, values);
    if (message !== null) errors[field] = message;
  }
  return errors;
}
