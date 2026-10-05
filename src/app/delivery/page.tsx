import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentSection } from '@/components/content/ContentSection';
import { TelegramLink } from '@/components/content/TelegramLink';
import { ProcessSteps } from '@/components/home/ProcessSteps';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { NeedsReviewBadge } from '@/components/ui/Badge';
import { site } from '@/config/site';
import { pageMetadata } from '@/lib/seo';

/**
 * Доставка и оплата (DESIGN §2.18). Только то, что известно: покупка идёт через заявку и
 * согласование; доставку считает менеджер — перевозчик не выбран, тарифов нет (antennas.md §11);
 * оплата — после выставления заказа к оплате, провайдер не выбран (§2). Разделы, ждущие данных,
 * помечены «Уточняется».
 */

export const metadata: Metadata = pageMetadata({
  title: 'Доставка и оплата',
  description:
    'Как проходит покупка: заявка, согласование с менеджером, оплата в личном кабинете. ' +
    'Доставку рассчитывает менеджер при согласовании заказа.',
  path: '/delivery',
});

export default function DeliveryPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Доставка и оплата' }]} />
      <PageHeader
        title="Доставка и оплата"
        description="Покупка идёт через заявку: сначала менеджер согласует состав, цены и доставку, потом заказ можно оплатить."
      />

      <ContentSection id="process" title="Как проходит покупка" wide spacing="none">
        <ProcessSteps orientation="horizontal" />
      </ContentSection>

      {/* Разделы — каждый шириной max-w-text (§2.18); на ≥ lg по два в ряд, чтобы короткие
          тексты не растягивали страницу в узкую колонку с пустой правой половиной. */}
      <div className="mt-10 grid gap-x-12 gap-y-10 lg:mt-16 lg:grid-cols-2 lg:gap-y-14">
        <ContentSection id="shipping" title="Доставка" status={<NeedsReviewBadge />} spacing="none">
          <p>
            Стоимость и способ доставки рассчитывает менеджер при согласовании заказа — по адресу и
            параметрам груза. Сумма доставки появится в согласованном заказе отдельной строкой.
            Перевозчики и сроки будут указаны позже.
          </p>
          <p className="mt-3">Город или адрес доставки можно указать в комментарии к заявке.</p>
        </ContentSection>

        <ContentSection id="payment" title="Оплата" status={<NeedsReviewBadge />} spacing="none">
          <p>
            Оплата — после согласования, из{' '}
            <Link href="/account" className="text-link text-ink">
              личного кабинета
            </Link>
            : когда менеджер выставит заказ к оплате, в заказе появится кнопка «Перейти к оплате».
            До этого оплатить заказ нельзя. Способы оплаты будут указаны после подключения
            платёжного сервиса.
          </p>
        </ContentSection>

        <ContentSection id="prices" title="Цены" spacing="none">
          <p>
            Цены указаны по прайсу. {site.currency.note} Стоимость позиций «по запросу» называет
            менеджер. Скидки по промокодам предварительные: окончательную сумму фиксирует
            согласование.
          </p>
        </ContentSection>

        <ContentSection id="organizations" title="Организациям" spacing="none">
          <p>
            В заявке выберите «Организация» и, если удобно, укажите название и ИНН — это поможет при
            согласовании.
          </p>
        </ContentSection>

        <ContentSection
          id="documents"
          title="Документы"
          status={<NeedsReviewBadge />}
          spacing="none"
        >
          <p>Какие документы прилагаются к заказу, будет указано после подтверждения.</p>
        </ContentSection>
      </div>

      <p className="mt-10 border-t border-line pt-6 text-body text-ink-secondary lg:mt-16">
        Вопросы по доставке и оплате — в Telegram <TelegramLink />.
      </p>
    </>
  );
}
