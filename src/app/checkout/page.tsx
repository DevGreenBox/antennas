import { toClientProducts } from '@/components/cart/catalog-data';
import { CheckoutView } from '@/components/checkout/CheckoutView';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PageHeader } from '@/components/layout/PageHeader';
import { getProducts } from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';

/** Оформление заявки (DESIGN §2.10). Оплаты на этом шаге нет. noindex. */
export const metadata = pageMetadata({
  title: 'Оформление заявки',
  description: 'Заявка на позиции из корзины. Менеджер согласует состав, цену и доставку.',
  path: '/checkout',
});

export default async function CheckoutPage() {
  const products = toClientProducts(await getProducts());
  return (
    <>
      <Breadcrumbs
        items={[{ label: 'Корзина', href: '/cart' }, { label: 'Оформление заявки' }]}
        jsonLd={false}
      />
      <PageHeader
        title="Оформление заявки"
        description="Оплата на этом шаге не списывается. После отправки менеджер свяжется с вами и согласует заказ."
      />
      <CheckoutView products={products} />
    </>
  );
}
