'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { UNREAD_FORMS, countLabel, formatDateFull } from '@/lib/format';
import { markMyNotificationsRead, useMyNotifications } from '@/lib/store/orders';

import { AccountShell, AccountSkeleton } from './AccountShell';
import { useAccountGuard } from './useAccountGuard';

/**
 * Уведомления (DESIGN §2.16, тексты — §6.7). В демо письма не отправляются: уведомления
 * хранятся в браузере, у каждого пометка «Email — демо, не отправлено». Переход по ссылке
 * «Заказ {№}» помечает уведомления этого заказа прочитанными.
 */
export function NotificationsView() {
  const guard = useAccountGuard('/account/notifications');
  const { notifications, unread } = useMyNotifications();

  if (!guard.ready || guard.email === null) return <AccountSkeleton title="Уведомления" />;

  return (
    <AccountShell
      title="Уведомления"
      email={guard.email}
      demoText="Демо: письма не отправляются, уведомления хранятся в этом браузере."
    >
      {notifications.length === 0 ? (
        <EmptyState title="Уведомлений пока нет" className="py-6">
          Здесь появятся сообщения о заявках, согласовании и оплате.
        </EmptyState>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-small text-ink-secondary" role="status">
              {unread === 0 ? 'Непрочитанных нет' : countLabel(unread, UNREAD_FORMS)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon="check"
              disabled={unread === 0}
              onClick={() => markMyNotificationsRead()}
            >
              Отметить все прочитанными
            </Button>
          </div>
          <ol>
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="flex gap-3 border-b border-line-subtle py-4 last:border-b-0"
              >
                <span className="flex w-2 shrink-0 justify-center pt-2">
                  {notification.read ? null : (
                    <>
                      <span aria-hidden className="size-2 rounded-full bg-ink" />
                      <span className="sr-only">Новое. </span>
                    </>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium text-ink">{notification.title}</p>
                  <p className="mt-0.5 text-small text-ink-secondary">{notification.body}</p>
                  <p className="mt-1 text-caption text-ink-muted">
                    <time dateTime={notification.at}>{formatDateFull(notification.at)}</time>
                    {' · '}Email — демо, не отправлено{' · '}
                    <Link
                      href={`/account/orders/${encodeURIComponent(notification.orderNumber)}`}
                      className="text-link"
                      onClick={() =>
                        markMyNotificationsRead({ orderNumber: notification.orderNumber })
                      }
                    >
                      Заказ {notification.orderNumber}
                    </Link>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </AccountShell>
  );
}
