import { OrderView } from '@/components/account/OrderView';
import { toClientCategories, toClientProducts } from '@/components/cart/catalog-data';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { getCategories, getProducts } from '@/lib/repository';
import { pageMetadata } from '@/lib/seo';

/**
 * Заказ в ЛК (DESIGN §2.14). Сам заказ живёт в браузере (демо), поэтому сервер отдаёт только
 * оболочку и каталог: ссылки на товары, которые ещё есть, и список для «Добавить позицию» в
 * демо-панели менеджера. noindex.
 */
/** Номер из адреса; битая percent-последовательность — как есть (заказ просто не найдётся). */
function decodeNumber(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return pageMetadata({
    title: `Заказ ${decodeNumber(number)}`,
    description: 'Статус, состав и сумма заказа.',
    path: `/account/orders/${number}`,
  });
}

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number: raw } = await params;
  const number = decodeNumber(raw);
  const [products, categories] = await Promise.all([getProducts(), getCategories()]);
  return (
    <>
      <Breadcrumbs
        items={[{ label: 'Личный кабинет', href: '/account' }, { label: `Заказ ${number}` }]}
        jsonLd={false}
      />
      <OrderView
        number={number}
        products={toClientProducts(products)}
        categories={toClientCategories(categories)}
      />
    </>
  );
}
