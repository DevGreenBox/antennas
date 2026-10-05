import Link from 'next/link';
import type { ReactNode } from 'react';

import { DemoNotice } from '@/components/ui/Notice';

import { RequisitesPending } from './RequisitesPending';
import { TelegramLink } from './TelegramLink';

/**
 * Структура юридических документов (DESIGN §2.19). Тексты не переданы, поэтому у раздела есть
 * содержимое только там, где факт известен из самого сайта: какие поля спрашивают формы, как
 * устроена заявка, единственный контакт. Остальные разделы — `content: null`: шаблон покажет
 * пометку «Текст готовится» и «Раздел будет заполнен.». Никаких ИНН, ОГРН, адресов,
 * наименований и дат редакции.
 */

export type LegalDocumentId = 'privacy' | 'terms' | 'consent';

export interface LegalSection {
  /** Якорь раздела. */
  id: string;
  title: string;
  /** null — текст не передан, раздел — заготовка. */
  content: ReactNode | null;
}

export interface LegalDocument {
  id: LegalDocumentId;
  href: `/legal/${LegalDocumentId}`;
  title: string;
  /** Описание для metadata. */
  description: string;
  sections: readonly LegalSection[];
}

/** Поля форм сайта: заявка (`CheckoutForm`) и вход по коду. Меняется форма — меняется список. */
function FormDataList() {
  return (
    <>
      <p>Сейчас формы сайта запрашивают:</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
        <li>имя;</li>
        <li>email — в заявке и для входа в личный кабинет;</li>
        <li>телефон, если указан;</li>
        <li>тип покупателя — организация или частное лицо;</li>
        <li>название организации и ИНН, если указаны;</li>
        <li>комментарий к заявке;</li>
        <li>состав заявки — позиции каталога и количество.</li>
      </ul>
    </>
  );
}

const OPERATOR: LegalSection = {
  id: 'operator',
  title: 'Оператор',
  content: <RequisitesPending />,
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    id: 'privacy',
    href: '/legal/privacy',
    title: 'Политика обработки персональных данных',
    description:
      'Структура политики обработки персональных данных. Текст документа и реквизиты будут добавлены.',
    sections: [
      OPERATOR,
      { id: 'data', title: 'Какие данные обрабатываются', content: <FormDataList /> },
      { id: 'purposes', title: 'Цели обработки', content: null },
      { id: 'grounds', title: 'Правовые основания', content: null },
      { id: 'retention', title: 'Сроки хранения', content: null },
      { id: 'transfer', title: 'Передача третьим лицам', content: null },
      { id: 'rights', title: 'Права субъекта персональных данных', content: null },
      {
        id: 'contacts',
        title: 'Контакты оператора',
        content: (
          <>
            <p>
              Telegram <TelegramLink />. Остальные контакты будут добавлены.
            </p>
            <DemoNotice className="mt-4">
              В демо-версии данные из форм хранятся только в вашем браузере и никуда не передаются.
            </DemoNotice>
          </>
        ),
      },
    ],
  },
  terms: {
    id: 'terms',
    href: '/legal/terms',
    title: 'Пользовательское соглашение',
    description:
      'Структура пользовательского соглашения. Текст документа и реквизиты будут добавлены.',
    sections: [
      { id: 'general', title: 'Общие положения', content: null },
      {
        id: 'order',
        title: 'Порядок оформления заявки',
        content: (
          <p>
            Заявка не является оплатой. Менеджер согласует состав, цену и доставку и выставляет
            заказ к оплате; оплата — в личном кабинете. Подробнее — на странице{' '}
            <Link href="/delivery" className="text-link text-ink">
              «Доставка и оплата»
            </Link>
            .
          </p>
        ),
      },
      { id: 'prices', title: 'Цены и оплата', content: null },
      { id: 'delivery', title: 'Доставка', content: null },
      { id: 'returns', title: 'Возврат', content: null },
      { id: 'liability', title: 'Ответственность', content: null },
      { id: 'requisites', title: 'Реквизиты', content: <RequisitesPending /> },
    ],
  },
  consent: {
    id: 'consent',
    href: '/legal/consent',
    title: 'Согласие на обработку персональных данных',
    description:
      'Структура согласия на обработку персональных данных. Текст документа и реквизиты будут добавлены.',
    sections: [
      OPERATOR,
      { id: 'data', title: 'Перечень данных', content: <FormDataList /> },
      { id: 'purposes', title: 'Цели обработки', content: null },
      { id: 'actions', title: 'Действия с данными', content: null },
      { id: 'term', title: 'Срок действия и отзыв согласия', content: null },
    ],
  },
};
