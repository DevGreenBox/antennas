'use client';

import { useSearchParams } from 'next/navigation';

import { ProcessSteps } from '@/components/home/ProcessSteps';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { DemoNotice } from '@/components/ui/Notice';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { site } from '@/config/site';
import { formatPhone, managerMessage } from '@/lib/demo-orders';
import { useDemoOrdersStore } from '@/lib/store/orders';
import { useSessionEmail, useSessionHydrated, useSubmittedOrderNumber } from '@/lib/store/session';
import { usePersistHydrated } from '@/lib/store/storage';

/**
 * «Заявка отправлена» (DESIGN §2.11). Прямой заход ничего не создаёт и не меняет — страница
 * только читает заказ этого браузера по номеру из `?order=`. Неизвестный номер — «Заявка не
 * найдена».
 *
 * Имя, email, телефон и сообщение менеджеру видны только сессии с email заказа или вкладке, из
 * которой заявку только что отправили (`useSubmittedOrderNumber`). Номера идут подряд, поэтому
 * остальным — нейтральное «Заявка {№} отправлена» без персональных данных (§2.14: данные
 * заказа — только его покупателю).
 *
 * «Открыть заказ»: сессия на тот же email — сразу в заказ, иначе вход по коду с подставленным
 * email и возвратом в заказ.
 */
export function SuccessView() {
  const params = useSearchParams();
  const number = params.get('order') ?? '';
  const ordersHydrated = usePersistHydrated(useDemoOrdersStore);
  const sessionHydrated = useSessionHydrated();
  const sessionEmail = useSessionEmail();
  const submittedNumber = useSubmittedOrderNumber();
  const order = useDemoOrdersStore((state) =>
    number === '' ? null : (state.orders.find((item) => item.number === number) ?? null),
  );

  if (!ordersHydrated || !sessionHydrated) return <SuccessSkeleton />;

  if (order === null) {
    return (
      <EmptyState
        headingLevel="h1"
        title="Заявка не найдена"
        actions={
          <ButtonLink href="/login" variant="primary" size="md">
            Войти в кабинет
          </ButtonLink>
        }
      >
        Возможно, она отправлена в другом браузере. Заявки и заказы — в личном кабинете.
      </EmptyState>
    );
  }

  const { buyer } = order;
  const orderPath = `/account/orders/${encodeURIComponent(order.number)}`;
  const signedIn = sessionEmail === buyer.email;
  if (!signedIn && submittedNumber !== order.number) {
    return (
      <SubmittedNeutral
        number={order.number}
        orderPath={orderPath}
        signedIn={sessionEmail !== null}
      />
    );
  }
  const openHref = signedIn
    ? orderPath
    : `/login?${new URLSearchParams({ email: buyer.email, next: orderPath }).toString()}`;
  const created = order.events.find((event) => event.type === 'created');
  const telegramNote = created ? managerMessage(order, created) : null;
  const { telegram } = site.contacts;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-narrow">
        <div className="flex items-center gap-3">
          <Icon name="circle-check" size={32} className="shrink-0 text-success" />
          <h1>Заявка отправлена</h1>
        </div>
        <p className="mt-4 text-body text-ink-secondary">
          Номер заказа{' '}
          <span className="font-mono text-title font-semibold whitespace-nowrap text-ink">
            {order.number}
          </span>
        </p>
        <p className="mt-2 text-body text-ink">
          Менеджер свяжется с вами по email {buyer.email}
          {buyer.phone ? ` или по телефону ${formatPhone(buyer.phone)}` : ''}.
        </p>
      </div>

      <DemoNotice className="max-w-narrow">
        <p>
          Демо: заявка сохранена только в этом браузере, менеджер её не получил. Для настоящего
          заказа напишите в Telegram{' '}
          <a href={telegram.url} target="_blank" rel="noopener noreferrer" className="text-link">
            {telegram.handle}
            <span className="sr-only"> (откроется в новой вкладке)</span>
          </a>
          .
        </p>
        {telegramNote ? (
          <p className="mt-2 text-ink-secondary">
            Уведомление менеджеру в Telegram (демо, реальная отправка не выполняется): «
            {telegramNote}».
          </p>
        ) : null}
        <p className="mt-1 text-ink-secondary">
          Письмо покупателю «Заявка {order.number} получена» — демо, не отправлено.
        </p>
      </DemoNotice>

      <section aria-labelledby="success-steps" className="mt-2 max-w-page">
        <h2 id="success-steps" className="sr-only">
          Что дальше
        </h2>
        <ProcessSteps orientation="horizontal" current={2} headingLevel="h3" />
      </section>

      <div className="mt-2 flex max-w-narrow flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={openHref} variant="primary" size="lg" fullWidth="mobile">
            Открыть заказ
          </ButtonLink>
          <ButtonLink href="/catalog" variant="secondary" size="lg" fullWidth="mobile">
            Вернуться в каталог
          </ButtonLink>
        </div>
        {signedIn ? null : (
          <p className="text-small text-ink-secondary">
            Заказ и его статус — в личном кабинете. Пароль не нужен: войдите по одноразовому коду,
            который придёт на {buyer.email}.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Заявка есть, но эта вкладка её не отправляла и сессия — не покупателя: номер и путь в кабинет,
 * без имени, email, телефона и сообщения менеджеру.
 */
function SubmittedNeutral({
  number,
  orderPath,
  signedIn,
}: {
  number: string;
  orderPath: string;
  /** Вошли под другим email: вход «с возвратом в заказ» сразу вернул бы в чужой кабинет. */
  signedIn: boolean;
}) {
  return (
    <EmptyState
      headingLevel="h1"
      title="Заявка отправлена"
      actions={
        <>
          <ButtonLink
            href={
              signedIn
                ? '/account'
                : `/login?${new URLSearchParams({ next: orderPath }).toString()}`
            }
            variant="primary"
            size="md"
          >
            {signedIn ? 'Открыть кабинет' : 'Войти в кабинет'}
          </ButtonLink>
          <ButtonLink href="/catalog" variant="secondary" size="md">
            Вернуться в каталог
          </ButtonLink>
        </>
      }
    >
      Заявка <span className="font-mono whitespace-nowrap text-ink">{number}</span> отправлена.
      Подробности — в личном кабинете после входа.
    </EmptyState>
  );
}

export function SuccessSkeleton() {
  return (
    <SkeletonGroup className="flex max-w-narrow flex-col gap-4">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-24 w-full rounded-md" />
    </SkeletonGroup>
  );
}
