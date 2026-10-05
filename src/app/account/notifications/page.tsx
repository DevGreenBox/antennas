import { NotificationsView } from '@/components/account/NotificationsView';
import { pageMetadata } from '@/lib/seo';

/** Уведомления ЛК (DESIGN §2.16): демо, письма не отправляются. noindex. */
export const metadata = pageMetadata({
  title: 'Уведомления',
  description: 'Сообщения о заявках, согласовании и оплате.',
  path: '/account/notifications',
});

export default function NotificationsPage() {
  return <NotificationsView />;
}
