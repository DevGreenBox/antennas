import type { Metadata } from 'next';
import Link from 'next/link';

import { ContentRows, ContentSection, TEXT_MEASURE } from '@/components/content/ContentSection';
import { TelegramLink } from '@/components/content/TelegramLink';
import { ProcessSteps } from '@/components/home/ProcessSteps';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { NeedsReviewBadge } from '@/components/ui/Badge';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';
import { pageMetadata } from '@/lib/seo';

/**
 * Доставка и оплата (DESIGN §2.18). Только то, что известно: покупка идёт через заявку и
 * согласование; доставку считает менеджер — перевозчик не выбран, тарифов нет (antennas.md §11);
 * оплата — после выставления заказа к оплате, провайдер не выбран (§2). Разделы, ждущие данных,
 * помечены «Уточняется». Раскладка — DESIGN § R: шаги процесса полосой на всю ширину, ниже
 * разделы строками редакционной сетки (`ContentRows`), без карточек и иконок.
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

      <ContentSection id="process" title="Как проходит покупка" layout="stack" wide>
        <ProcessSteps />
      </ContentSection>

      {/* Разделы — строками редакционной сетки (DESIGN § R): заголовок и пометка «Уточняется»
          слева, текст справа шириной ~70 знаков; между строками — тонкие линии. Верхней линии
          нет: её роль играет нижняя граница полосы шагов. */}
      <ContentRows rule={false}>
        <ContentSection id="shipping" title="Доставка" status={<NeedsReviewBadge />}>
          <p>
            Стоимость и способ доставки рассчитывает менеджер при согласовании заказа — по адресу и
            параметрам груза. Сумма доставки появится в согласованном заказе отдельной строкой.
            Перевозчики и сроки будут указаны позже.
          </p>
          <p className="mt-3">Город или адрес доставки можно указать в комментарии к заявке.</p>
        </ContentSection>

        <ContentSection id="payment" title="Оплата" status={<NeedsReviewBadge />}>
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

        <ContentSection id="prices" title="Цены">
          <p>
            Цены указаны по прайсу. {site.currency.note} Стоимость позиций «по запросу» называет
            менеджер. Скидки по промокодам предварительные: окончательную сумму фиксирует
            согласование.
          </p>
        </ContentSection>

        <ContentSection id="organizations" title="Организациям">
          <p>
            В заявке выберите «Организация» и, если удобно, укажите название и ИНН — это поможет при
            согласовании.
          </p>
        </ContentSection>

        <ContentSection id="documents" title="Документы" status={<NeedsReviewBadge />}>
          <p>Какие документы прилагаются к заказу, будет указано после подтверждения.</p>
        </ContentSection>

        {/* Последняя строка без заголовка: текст — в правой колонке, по краю остальных. */}
        <div className="grid gap-x-16 py-8 lg:grid-cols-catalog lg:py-10 xl:grid-cols-catalog-wide">
          <p className={cn('text-body text-ink-secondary lg:col-start-2', TEXT_MEASURE)}>
            Вопросы по доставке и оплате — в Telegram <TelegramLink />.
          </p>
        </div>
      </ContentRows>
    </>
  );
}
