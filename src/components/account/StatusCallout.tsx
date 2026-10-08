'use client';

import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import type { NoticeTone } from '@/components/ui/Notice';
import { formatPrice } from '@/lib/catalog';
import { activeQuote, lastAnnulledQuote, paymentHref } from '@/lib/demo-orders';
import { formatDateFull } from '@/lib/format';
import type { DemoOrder } from '@/types/order';

/** Причина идёт после двоеточия: «По просьбе покупателя» → «по просьбе покупателя». */
function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('ru-RU') + text.slice(1);
}

/**
 * Сообщение под заголовком заказа (DESIGN §3.8 «StatusCallout»). Кнопка «Перейти к оплате» —
 * только в статусе «Ожидает оплаты» и только на действующую версию.
 *
 * Тон (DESIGN § R.2 — почти монохромная база): обычный ход заказа — нейтральная подложка; цвет
 * только там, где он что-то значит: «Ожидает оплаты» — фирменная подложка (нужно действие
 * покупателя), «Оплачен» — успех. Отмена — состояние заказа, а не ошибка интерфейса, поэтому
 * тоже нейтральная (красный — только настоящая ошибка); статус «Отменён» и так в бейдже у h1.
 */
export function StatusCallout({ order, className }: { order: DemoOrder; className?: string }) {
  const active = activeQuote(order);
  let tone: NoticeTone = 'neutral';
  let text = '';
  let action = null;

  switch (order.status) {
    case 'received':
      text = 'Заявка получена. Менеджер свяжется с вами для согласования состава, цены и доставки.';
      break;
    case 'negotiation':
      text = 'Идёт согласование. Оплата станет доступна, когда менеджер выставит заказ к оплате.';
      if (lastAnnulledQuote(order) !== null) {
        text += ' Прежняя ссылка на оплату аннулирована: сумма меняется.';
      }
      break;
    case 'awaiting-payment':
      tone = 'brand';
      text = `Заказ согласован. К оплате: ${active ? formatPrice(active.total) : '—'}.`;
      if (active) {
        action = (
          <ButtonLink
            href={paymentHref(order.number, active.version)}
            variant="primary"
            size="md"
            className="max-lg:h-11"
          >
            Перейти к оплате
          </ButtonLink>
        );
      }
      break;
    case 'paid': {
      tone = 'success';
      const paidAt = active?.paidAt;
      text = paidAt ? `Оплата подтверждена ${formatDateFull(paidAt)}.` : 'Оплата подтверждена.';
      break;
    }
    case 'processing':
      text = 'Заказ в обработке.';
      break;
    case 'shipped':
      text = `Заказ отправлен.${active?.deliveryNote ? ` ${active.deliveryNote}` : ''}`;
      break;
    case 'completed':
      text = 'Заказ выполнен.';
      break;
    case 'cancelled':
      text = `Заказ отменён: ${lowerFirst(order.cancelReason ?? 'причина не указана')}.`;
      break;
  }

  return (
    <Notice tone={tone} actions={action} className={className}>
      {text}
    </Notice>
  );
}
