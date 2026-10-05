import { AccountView } from '@/components/account/AccountView';
import { pageMetadata } from '@/lib/seo';

/** Личный кабинет (DESIGN §2.13): заявки, заказы, профиль — из браузера (демо). noindex. */
export const metadata = pageMetadata({
  title: 'Личный кабинет',
  description: 'Заявки, заказы и их статусы.',
  path: '/account',
});

export default function AccountPage() {
  return <AccountView />;
}
