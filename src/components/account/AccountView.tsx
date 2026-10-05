'use client';

import type { ReactNode } from 'react';

import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { formatPrice } from '@/lib/catalog';
import { activeQuote, formatPhone, paymentHref } from '@/lib/demo-orders';
import { useMyOrders } from '@/lib/store/orders';
import { useProfile, useProfilesStore } from '@/lib/store/session';
import { usePersistHydrated } from '@/lib/store/storage';

import { AccountShell, AccountSkeleton } from './AccountShell';
import { OrdersTable } from './OrdersTable';
import { useAccountGuard } from './useAccountGuard';

/**
 * Личный кабинет (DESIGN §2.13): заказы «Ожидает оплаты» сверху (до трёх, одна главная
 * кнопка на экран), таблица заявок и заказов, профиль из последней заявки. Видны только заказы
 * email текущей сессии.
 */
export function AccountView() {
  const guard = useAccountGuard('/account');
  const profilesHydrated = usePersistHydrated(useProfilesStore);
  const { orders } = useMyOrders();
  const profile = useProfile(guard.email);

  if (!guard.ready || !profilesHydrated || guard.email === null) {
    return <AccountSkeleton title="Личный кабинет" />;
  }

  const awaiting = orders.filter((order) => order.status === 'awaiting-payment').slice(0, 3);

  return (
    <AccountShell
      title="Личный кабинет"
      email={guard.email}
      withReset
      demoText="Демо-кабинет: заказы и уведомления хранятся в этом браузере."
    >
      {awaiting.length > 0 ? (
        <div className="mb-8 flex flex-col gap-3">
          {awaiting.map((order, index) => {
            const quote = activeQuote(order);
            if (quote === null) return null;
            return (
              <Notice
                key={order.number}
                tone="brand"
                title={`Ожидает оплаты: заказ ${order.number}`}
                actions={
                  <ButtonLink
                    href={paymentHref(order.number, quote.version)}
                    variant={index === 0 ? 'primary' : 'secondary'}
                    size="md"
                  >
                    Перейти к оплате
                    <span className="sr-only"> заказа {order.number}</span>
                  </ButtonLink>
                }
              >
                К оплате {formatPrice(quote.total)}
              </Notice>
            );
          })}
        </div>
      ) : null}

      <section aria-labelledby="account-orders">
        <h2 id="account-orders" className="mb-4 lg:mb-6">
          Заявки и заказы
        </h2>
        {orders.length === 0 ? (
          <EmptyState
            title="Заявок пока нет"
            headingLevel="h3"
            className="py-6"
            actions={
              <ButtonLink href="/catalog" variant="primary" size="md">
                Перейти в каталог
              </ButtonLink>
            }
          >
            Соберите корзину и отправьте заявку — она появится здесь.
          </EmptyState>
        ) : (
          <OrdersTable orders={orders} />
        )}
      </section>

      <section aria-labelledby="account-profile" className="mt-10 lg:mt-16">
        <h2 id="account-profile" className="mb-4 lg:mb-6">
          Профиль
        </h2>
        <dl className="grid max-w-text gap-x-6 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <ProfileRow label="Email">{guard.email}</ProfileRow>
          <ProfileRow label="Имя">{profile?.name}</ProfileRow>
          <ProfileRow label="Телефон">
            {profile?.phone ? formatPhone(profile.phone) : null}
          </ProfileRow>
          <ProfileRow label="Покупатель">
            {profile ? (profile.buyerType === 'company' ? 'Организация' : 'Частное лицо') : null}
          </ProfileRow>
          <ProfileRow label="Организация">{profile?.companyName}</ProfileRow>
          <ProfileRow label="ИНН">{profile?.inn}</ProfileRow>
        </dl>
        <p className="mt-3 text-caption text-ink-muted">Данные берутся из последней заявки.</p>
      </section>
    </AccountShell>
  );
}

function ProfileRow({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className="grid border-b border-line-subtle py-2.5 sm:col-span-2 sm:grid-cols-subgrid">
      <dt className="text-small text-ink-secondary">{label}</dt>
      <dd className="text-body text-ink">
        {empty ? (
          <span className="text-ink-muted">
            <span aria-hidden>—</span>
            <span className="sr-only">не указано</span>
          </span>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}
