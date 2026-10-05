import type { Metadata } from 'next';

import { ContentSection } from '@/components/content/ContentSection';
import { RequisitesPending } from '@/components/content/RequisitesPending';
import { TelegramLink } from '@/components/content/TelegramLink';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { site } from '@/config/site';
import { pageMetadata } from '@/lib/seo';

/**
 * Контакты (DESIGN §2.17). Единственный подтверждённый канал — Telegram из брифа
 * (`site.contacts.telegram`); телефона, email, адреса и реквизитов нет — они не выдумываются.
 * Формы обратной связи нет: отправлять её некуда.
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

      {/* ≥ lg: Telegram — слева, остальное — справа (каждый блок не шире max-w-text). */}
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <section
          aria-labelledby="telegram-title"
          className="max-w-text self-start rounded-md border border-line bg-surface p-5 lg:p-6"
        >
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink"
            >
              <Icon name="send" size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="telegram-title">Telegram</h2>
              <p className="mt-1 text-body">
                <TelegramLink />
              </p>
              <p className="mt-3 text-body text-ink-secondary">
                Вопросы по подбору, характеристикам и заказам.
              </p>
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
            </div>
          </div>
        </section>

        <div>
          <ContentSection id="other" title="Другие контакты" spacing="none" className="lg:pt-6">
            <p>Телефон, email и адрес будут добавлены после подтверждения.</p>
          </ContentSection>

          <ContentSection id="requisites" title="Реквизиты" spacing="compact">
            <RequisitesPending />
          </ContentSection>
        </div>
      </div>
    </>
  );
}
