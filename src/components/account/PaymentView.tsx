'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { DemoBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { DemoNotice, Notice } from '@/components/ui/Notice';
import type { NoticeTone } from '@/components/ui/Notice';
import { Price } from '@/components/ui/Price';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { formatPrice } from '@/lib/catalog';
import { paymentHref, paymentPageState } from '@/lib/demo-orders';
import type { PaymentPageState } from '@/lib/demo-orders';
import { POSITION_FORMS, countLabel, formatDateFull } from '@/lib/format';
import {
  confirmOrderPayment,
  declineOrderPayment,
  startOrderPayment,
  useMyOrder,
} from '@/lib/store/orders';
import type { DemoOrder, QuoteVersion } from '@/types/order';

import { useAccountGuard } from './useAccountGuard';

/**
 * Оплата (демо) `/account/orders/{№}/pay?v=` (DESIGN §2.15, §3.7). Провайдер не выбран: деньги
 * не списываются, ответ провайдера имитируют кнопки ProviderSimulator. Состояние страницы —
 * `paymentPageState()` ядра (C/X/B/A/D/E, проверки сверху вниз).
 *
 * Гарантии ТЗ: «Оплачен» ставится только кнопкой «Провайдер подтвердил оплату» (в рабочей
 * версии — серверным подтверждением); возврат со «страницы провайдера» (`?return=1`) и любой
 * прямой заход ничего не оплачивают; повторное подтверждение не создаёт вторую оплату; ссылка
 * аннулированной версии не принимает оплату.
 *
 * Подача (DESIGN § R.1, § R.5): сумма к оплате и кнопка «Оплатить» — одна белая панель; пометка
 * «Демо · провайдер не выбран, деньги не списываются» — строка внутри неё, у самого действия, а не
 * отдельная плашка над страницей. Ответ провайдера — пунктирная демо-панель рядом с панелью
 * оплаты, не внутри неё (без карточки в карточке).
 */

interface ResultMessage {
  tone: NoticeTone;
  text: string;
}

export function PaymentView({ number }: { number: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();
  const basePath = `/account/orders/${encodeURIComponent(number)}`;
  const guard = useAccountGuard(`${basePath}/pay${query ? `?${query}` : ''}`);
  const { order } = useMyOrder(number);
  const vParam = params.get('v');
  const version = vParam !== null && /^\d+$/.test(vParam) ? Number(vParam) : null;
  const returned = params.get('return') === '1';
  const [result, setResult] = useState<ResultMessage | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  // Без ?v= — на ссылку действующей версии (её нет — покажется состояние страницы как есть).
  const redirectTo =
    guard.ready && order !== null && vParam === null && order.activeVersion !== null
      ? paymentHref(order.number, order.activeVersion)
      : null;
  useEffect(() => {
    if (redirectTo !== null) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (!guard.ready || redirectTo !== null) return <PaymentSkeleton />;
  if (order === null) {
    return (
      <EmptyState
        headingLevel="h1"
        title="Заказ не найден"
        actions={
          <ButtonLink href="/account" variant="primary" size="md">
            Все заказы
          </ButtonLink>
        }
      >
        Проверьте номер или войдите под email, на который оформлена заявка.
      </EmptyState>
    );
  }

  const state = paymentPageState(order, version);
  const show = (message: ResultMessage) => {
    setResult(message);
    requestAnimationFrame(() => focusRef.current?.focus());
  };

  return (
    <div className="max-w-narrow">
      <h1>Оплата заказа {order.number}</h1>
      <StorageNotice className="mt-4" />

      <div ref={focusRef} tabIndex={-1} className="mt-6 flex flex-col gap-4 outline-none">
        {returned ? (
          <Notice tone="info">
            Вы вернулись со страницы оплаты. Статус заказа изменится только после подтверждения от
            провайдера.
          </Notice>
        ) : null}
        {result ? (
          <Notice tone={result.tone} live>
            {result.text}
          </Notice>
        ) : null}
        <PaymentState
          order={order}
          state={state}
          basePath={basePath}
          hideConfirmed={result?.tone === 'success'}
          onPay={(quote) => {
            const started = startOrderPayment(order.number, quote.version);
            if (!started.ok) show({ tone: 'danger', text: started.message });
            else {
              setResult(null);
              requestAnimationFrame(() => focusRef.current?.focus());
            }
          }}
          onConfirm={(attemptId) => {
            const confirmed = confirmOrderPayment(order.number, attemptId);
            show({
              tone:
                confirmed.code === 'confirmed'
                  ? 'success'
                  : confirmed.code === 'already-paid'
                    ? 'info'
                    : 'danger',
              text: confirmed.message,
            });
          }}
          onDecline={(attemptId) => {
            const declined = declineOrderPayment(order.number, attemptId);
            show({ tone: declined.ok ? 'danger' : 'info', text: declined.message });
          }}
        />
      </div>
    </div>
  );
}

function ToOrder({ basePath }: { basePath: string }) {
  return (
    <ButtonLink href={basePath} variant="secondary" size="md" className="max-lg:h-11">
      К заказу
    </ButtonLink>
  );
}

function CurrentQuoteOffer({ order, quote }: { order: DemoOrder; quote: QuoteVersion }) {
  return (
    <>
      <p>
        Оплатите актуальную версию {quote.version}: {formatPrice(quote.total)}
      </p>
      <div className="mt-3">
        <ButtonLink
          href={paymentHref(order.number, quote.version)}
          variant="primary"
          size="md"
          className="max-lg:h-11"
        >
          Перейти к актуальной оплате
        </ButtonLink>
      </div>
    </>
  );
}

function PaymentState({
  order,
  state,
  basePath,
  hideConfirmed,
  onPay,
  onConfirm,
  onDecline,
}: {
  order: DemoOrder;
  state: PaymentPageState;
  basePath: string;
  /** Только что подтверждено — сообщение уже показано, повтор «уже оплачен» не нужен. */
  hideConfirmed: boolean;
  onPay: (quote: QuoteVersion) => void;
  onConfirm: (attemptId: string) => void;
  onDecline: (attemptId: string) => void;
}) {
  switch (state.code) {
    case 'C': {
      const confirmed = order.payments.find((attempt) => attempt.status === 'confirmed');
      return (
        <>
          {hideConfirmed ? (
            <div>
              <ToOrder basePath={basePath} />
            </div>
          ) : (
            <Notice tone="success" actions={<ToOrder basePath={basePath} />}>
              Заказ уже оплачен{state.paidAt ? ` ${formatDateFull(state.paidAt)}` : ''}. Повторная
              оплата не нужна.
            </Notice>
          )}
          {confirmed ? (
            <DemoNotice
              variant="panel"
              title="Повторный ответ провайдера (демонстрация)"
              headingSize="body"
            >
              <p className="text-small text-ink-secondary">
                Провайдеры иногда присылают подтверждение повторно. Повторное подтверждение не
                создаёт вторую оплату и не меняет заказ.
              </p>
              <div className="mt-4">
                {/* На 320 px подпись в одну строку шире панели — переносится, кнопка во всю ширину. */}
                <Button
                  variant="secondary"
                  size="md"
                  className="h-auto! min-h-11 w-full py-2 text-center whitespace-normal! sm:w-auto lg:min-h-10"
                  onClick={() => onConfirm(confirmed.id)}
                >
                  Провайдер подтвердил оплату повторно
                </Button>
              </div>
            </DemoNotice>
          ) : null}
        </>
      );
    }
    case 'X':
      return (
        <Notice tone="danger" actions={<ToOrder basePath={basePath} />}>
          Заказ отменён. Оплата недоступна.
        </Notice>
      );
    case 'B':
      return (
        <Notice tone="warning" title="Ссылка на оплату больше не действует">
          <p>
            Эта ссылка на оплату больше не действует: сумма заказа изменена (версия {state.version}{' '}
            аннулирована).
          </p>
          <div className="mt-2">
            {state.active ? (
              <CurrentQuoteOffer order={order} quote={state.active} />
            ) : (
              <>
                <p>Дождитесь, пока менеджер выставит заказ к оплате заново.</p>
                <div className="mt-3">
                  <ToOrder basePath={basePath} />
                </div>
              </>
            )}
          </div>
        </Notice>
      );
    case 'A':
      return (
        <Notice tone="info" actions={<ToOrder basePath={basePath} />}>
          Оплата пока недоступна: заказ на согласовании. Кнопка оплаты появится, когда менеджер
          выставит заказ к оплате.
        </Notice>
      );
    case 'E':
      return (
        <Notice tone="warning" title="Ссылка на оплату неверна.">
          {state.active ? (
            <CurrentQuoteOffer order={order} quote={state.active} />
          ) : (
            <div className="mt-3">
              <ToOrder basePath={basePath} />
            </div>
          )}
        </Notice>
      );
    case 'D':
      return (
        <PaymentForm state={state} onPay={onPay} onConfirm={onConfirm} onDecline={onDecline} />
      );
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle py-3 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="ml-auto text-right text-body text-ink">{children}</dd>
    </div>
  );
}

function PaymentForm({
  state,
  onPay,
  onConfirm,
  onDecline,
}: {
  state: Extract<PaymentPageState, { code: 'D' }>;
  onPay: (quote: QuoteVersion) => void;
  onConfirm: (attemptId: string) => void;
  onDecline: (attemptId: string) => void;
}) {
  const { quote, pending } = state;
  return (
    <>
      <section
        aria-label="Сумма к оплате"
        className="rounded-md border border-line bg-surface p-5 sm:p-6"
      >
        <dl>
          <Row label="К оплате">
            <Price amount={quote.total} size="xl" />
          </Row>
          <Row label="Версия согласования">
            {quote.version} от {formatDateFull(quote.createdAt)}
          </Row>
          <Row label="Состав">{countLabel(quote.lines.length, POSITION_FORMS)}</Row>
        </dl>
        {/* Демо-пометка — у кнопки, до оплаты; после нажатия демо-действие — ProviderSimulator. */}
        {pending === null ? (
          <>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={() => onPay(quote)}
            >
              Оплатить {formatPrice(quote.total)}
            </Button>
            <p className="mt-4 flex items-start gap-2 text-small text-ink-secondary">
              <DemoBadge className="shrink-0" />
              <span className="pt-0.5">Провайдер оплаты ещё не выбран: деньги не списываются.</span>
            </p>
          </>
        ) : null}
      </section>
      {pending === null ? null : (
        <ProviderSimulator
          onConfirm={() => onConfirm(pending.id)}
          onDecline={() => onDecline(pending.id)}
        />
      )}
    </>
  );
}

/**
 * Ответ провайдера (демо, §5.9.38): в рабочей версии — серверное подтверждение провайдера.
 * Главное действие сценария — подтверждение (primary); отказ — второстепенный ghost danger, а не
 * сплошная красная кнопка, которая перетягивала внимание.
 */
function ProviderSimulator({
  onConfirm,
  onDecline,
}: {
  onConfirm: () => void;
  onDecline: () => void;
}) {
  return (
    <DemoNotice variant="panel" title="Ответ провайдера (демонстрация)" headingSize="body">
      <p className="text-small text-ink-secondary">
        Платёж ожидает ответа провайдера. В рабочей версии статус «Оплачен» ставится только после
        серверного подтверждения от провайдера.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" size="md" className="max-lg:h-11" onClick={onConfirm}>
          Провайдер подтвердил оплату
        </Button>
        <Button variant="ghost" tone="danger" size="md" className="max-lg:h-11" onClick={onDecline}>
          Провайдер отказал
        </Button>
      </div>
    </DemoNotice>
  );
}

export function PaymentSkeleton() {
  return (
    <SkeletonGroup className="flex max-w-narrow flex-col gap-4">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-20 w-full rounded-md" />
      <Skeleton className="h-32 w-full rounded-md" />
      <Skeleton className="h-12 w-full" />
    </SkeletonGroup>
  );
}
