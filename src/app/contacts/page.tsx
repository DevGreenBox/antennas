import type { Metadata } from 'next';

import { ContentRows, ContentSection } from '@/components/content/ContentSection';
import { RequisitesPending } from '@/components/content/RequisitesPending';
import { TelegramLink } from '@/components/content/TelegramLink';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { site } from '@/config/site';
import { pageMetadata } from '@/lib/seo';

/**
 * Контакты (DESIGN §2.17). Единственный подтверждённый канал — Telegram из брифа
 * (`site.contacts.telegram`); телефона, email, адреса и реквизитов нет — они не выдумываются.
 * Формы обратной связи нет: отправлять её некуда. Раскладка — DESIGN § R: строки редакционной
 * сетки (заголовок слева, содержимое справа), как на «Доставке и оплате»; без карточек и значков.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Контакты',
  description: `Связь с менеджером — Telegram ${site.contacts.telegram.handle}: вопросы по подбору, характеристикам и заказам.`,
  path: '/contacts',
});

export default function ContactsPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Контакты' }]} />
      <PageHeader title="Контакты" />

      <ContentRows>
        <ContentSection id="telegram" title="Telegram">
          <p className="text-lead">
            <TelegramLink />
          </p>
          <p className="mt-2">Вопросы по подбору, характеристикам и заказам.</p>
          <ButtonLink
            href={site.contacts.telegram.url}
            external
            variant="secondary"
            size="md"
            icon="send"
            className="mt-5"
          >
            Написать в Telegram
          </ButtonLink>
        </ContentSection>

        <ContentSection id="other" title="Другие контакты">
          <p>Телефон, email и адрес будут добавлены после подтверждения.</p>
        </ContentSection>

        <ContentSection id="requisites" title="Реквизиты">
          <RequisitesPending />
        </ContentSection>
      </ContentRows>
    </>
  );
}
