import { Suspense } from 'react';

import { PaymentSkeleton, PaymentView } from '@/components/account/PaymentView';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { pageMetadata } from '@/lib/seo';

/** Номер из адреса; битая percent-последовательность — как есть (заказ просто не найдётся). */
function decodeNumber(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Оплата (демо) (DESIGN §2.15). Версия согласования — `?v=`, возврат «со страницы провайдера» —
 * `?return=1`; их читает клиентский компонент внутри Suspense. noindex.
 */
export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return pageMetadata({
    title: `Оплата заказа ${decodeNumber(number)}`,
    description: 'Демонстрация оплаты согласованного заказа.',
    path: `/account/orders/${number}/pay`,
  });
}

export default async function PaymentPage({ params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  const number = decodeNumber(raw);
  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Личный кабинет', href: '/account' },
          { label: `Заказ ${number}`, href: `/account/orders/${encodeURIComponent(number)}` },
          { label: 'Оплата' },
        ]}
        jsonLd={false}
      />
      <Suspense fallback={<PaymentSkeleton />}>
        <PaymentView number={number} />
      </Suspense>
    </>
  );
}
