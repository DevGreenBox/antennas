import { Suspense } from 'react';

import { SuccessSkeleton, SuccessView } from '@/components/checkout/SuccessView';
import { pageMetadata } from '@/lib/seo';

/**
 * «Заявка отправлена» (DESIGN §2.11). Номер заказа — в `?order=`; страница клиентская и читает
 * заказ из браузера (useSearchParams — внутри Suspense, оболочка остаётся статической). noindex.
 */
export const metadata = pageMetadata({
  title: 'Заявка отправлена',
  description: 'Заявка принята. Менеджер свяжется с вами для согласования.',
  path: '/checkout/success',
});

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<SuccessSkeleton />}>
      <SuccessView />
    </Suspense>
  );
}
