import { CartView } from '@/components/cart/CartView';
import { toClientProducts } from '@/components/cart/catalog-data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { getProducts } from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';

/** Корзина (DESIGN §2.9): серверная оболочка + клиентская корзина из браузера. noindex. */
export const metadata = pageMetadata({
  title: 'Корзина',
  description: 'Позиции, отобранные для заявки. Оплата — после согласования с менеджером.',
  path: '/cart',
});

export default async function CartPage() {
  const products = toClientProducts(await getProducts());
  return (
    <>
      <Breadcrumbs items={[{ label: 'Главная', href: '/' }, { label: 'Корзина' }]} jsonLd={false} />
      <CartView products={products} />
    </>
  );
}
