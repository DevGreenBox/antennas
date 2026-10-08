'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { DemoBadge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { StorageNotice } from '@/components/ui/StorageNotice';
import { site } from '@/config/site';
import { safeNextPath } from '@/lib/demo-session';
import { formatCountdown, formatLoginCode, isValidEmail, normalizeEmail } from '@/lib/format';
import {
  logout,
  requestLoginCode,
  useLoginChallenge,
  useLoginChallengeStore,
  useSessionEmail,
  useSessionHydrated,
  verifyLoginCode,
} from '@/lib/store/session';
import { usePersistHydrated } from '@/lib/store/storage';
import { toast } from '@/lib/store/toast';
import type { LoginChallenge } from '@/types/order';

/**
 * Вход по коду на email (DESIGN §2.12, §3.11). Пароля нет, поэтому восстановление доступа —
 * тот же вход: код на email, на который оформлялась заявка. В демо письмо не отправляется,
 * код показан на экране.
 *
 * Параметры: `email` — предзаполнение (со страницы «Заявка отправлена»), `next` — куда вернуть
 * (только путь этого сайта — `safeNextPath`, иначе `/account`). Уже вошли — сразу на `next`;
 * но если `?email=` другой, чем у сессии, перехода нет: заказ чужого email не откроется
 * («Заказ не найден»), поэтому предлагается выйти и войти под нужным адресом.
 * После входа корзина и избранное объединяются с профилем (это делает `verifyLoginCode`).
 *
 * «Изменить email» только возвращает к шагу 1 — действующий код не сбрасывается: тот же email
 * снова получает тот же код с оставшимися попытками до конца отсчёта (иначе смена шага обходила
 * бы и отсчёт повторной отправки, и лимит попыток).
 *
 * Подача (DESIGN § R.1, § R.4): колонка `max-w-form` по левому краю, как у остальных форм; h1 и
 * пояснение шага — над формой, сама форма — белая панель (рамка `line`, радиус 6), поля и кнопки
 * 44–48 px. Демо-код — строка с меткой «Демо» внутри панели (это демо-действие), без отдельной
 * плашки; подсказки про Telegram и восстановление — под панелью.
 */

/** Панель формы входа. */
const PANEL = 'rounded-md border border-line bg-surface p-5 sm:p-6';

const subscribeClock = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 1000);
  return () => window.clearInterval(timer);
};
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Текущее время с точностью до секунды — для обратного отсчёта (без setState в эффекте). */
function useNowSeconds(): number {
  return useSyncExternalStore(subscribeClock, nowSeconds, () => 0);
}

function LoginIntro() {
  return <h1 className="mb-3">Вход в личный кабинет</h1>;
}

/** Колонка страницы входа: ширина формы, по левому краю. */
const COLUMN = 'max-w-form';

export function LoginSkeleton() {
  return (
    <div className={COLUMN}>
      <LoginIntro />
      <SkeletonGroup className="flex flex-col gap-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-44 w-full rounded-md" />
      </SkeletonGroup>
    </div>
  );
}

export function LoginView() {
  const params = useSearchParams();
  const router = useRouter();
  const emailParam = params.get('email')?.trim() ?? '';
  const next = safeNextPath(params.get('next'));
  const sessionHydrated = useSessionHydrated();
  const challengeHydrated = usePersistHydrated(useLoginChallengeStore);
  const sessionEmail = useSessionEmail();
  const challenge = useLoginChallenge();
  // Email, введённый до «Изменить email», — чтобы не набирать заново.
  const [lastEmail, setLastEmail] = useState('');
  // «Изменить email»: шаг 1 поверх действующего вызова (вызов не удаляется).
  const [changingEmail, setChangingEmail] = useState(false);
  // Ссылка ведёт в кабинет другого email, чем у текущей сессии.
  const otherEmail =
    sessionEmail !== null &&
    emailParam !== '' &&
    isValidEmail(emailParam) &&
    normalizeEmail(emailParam) !== sessionEmail
      ? normalizeEmail(emailParam)
      : null;

  useEffect(() => {
    if (sessionHydrated && sessionEmail !== null && otherEmail === null) router.replace(next);
  }, [sessionHydrated, sessionEmail, otherEmail, next, router]);

  if (!sessionHydrated || !challengeHydrated) return <LoginSkeleton />;
  if (sessionEmail !== null) {
    if (otherEmail === null) return <LoginSkeleton />;
    return <SwitchAccount current={sessionEmail} target={otherEmail} />;
  }

  // Действующий вызов для другого email (пришли по ссылке с ?email=) — начинаем с шага 1.
  const showCode =
    challenge !== null &&
    !changingEmail &&
    (emailParam === '' || challenge.email === normalizeEmail(emailParam));

  return (
    <div className={COLUMN}>
      <LoginIntro />
      <StorageNotice className="mb-6" />
      {showCode ? (
        <CodeStep
          key={challenge.email}
          challenge={challenge}
          next={next}
          onChangeEmail={() => {
            setLastEmail(challenge.email);
            setChangingEmail(true);
          }}
        />
      ) : (
        <EmailStep
          initialEmail={lastEmail || emailParam || challenge?.email || ''}
          onRequested={() => setChangingEmail(false)}
        />
      )}
    </div>
  );
}

/** Вошли под одним email, а ссылка (`?email=`) — для другого: выйти и войти под нужным. */
function SwitchAccount({ current, target }: { current: string; target: string }) {
  return (
    <div className={COLUMN}>
      <LoginIntro />
      <p className="text-body text-ink-secondary">
        Сейчас вы вошли как <span className="font-medium break-all text-ink">{current}</span>.
        Ссылка ведёт в кабинет <span className="font-medium break-all text-ink">{target}</span> —
        чтобы открыть её, войдите под этим адресом.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="h-auto! min-h-12 py-2 text-center whitespace-normal! [overflow-wrap:anywhere]"
          onClick={() => {
            logout();
            // Сразу шаг 2: код для нужного адреса (письмо в демо не отправляется).
            requestLoginCode(target);
          }}
        >
          Выйти и войти как {target}
        </Button>
        <ButtonLink href="/account" variant="secondary" size="lg" fullWidth>
          Остаться в своём кабинете
        </ButtonLink>
      </div>
    </div>
  );
}

function EmailStep({
  initialEmail,
  onRequested,
}: {
  initialEmail: string;
  /** Код запрошен (или для того же email продолжает действовать прежний). */
  onRequested: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const { telegram } = site.contacts;

  return (
    <>
      <p className="text-body text-ink-secondary">
        Пароль не нужен: пришлём одноразовый код на email.
      </p>
      <form
        noValidate
        className={`mt-6 flex flex-col gap-5 ${PANEL}`}
        onSubmit={(event) => {
          event.preventDefault();
          const result = requestLoginCode(email);
          if (!result.ok) setError(result.message);
          else onRequested();
        }}
      >
        <Field label="Email" id="login-email" error={error}>
          <Input
            size="lg"
            type="email"
            autoComplete="email"
            placeholder="name@company.ru"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error !== null) setError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" fullWidth>
          Получить код
        </Button>
      </form>
      <p className="mt-5 text-small text-ink-secondary">
        Нет доступа к почте? Напишите в Telegram{' '}
        <a href={telegram.url} target="_blank" rel="noopener noreferrer" className="text-link">
          {telegram.handle}
          <span className="sr-only"> (откроется в новой вкладке)</span>
        </a>
        .
      </p>
      <p className="mt-2 text-small text-ink-secondary">
        Потеряли доступ к кабинету? Восстановление — тот же вход: укажите email, на который
        оформляли заявку, и введите код из письма.
      </p>
    </>
  );
}

function CodeStep({
  challenge,
  next,
  onChangeEmail,
}: {
  challenge: LoginChallenge;
  next: string;
  onChangeEmail: () => void;
}) {
  const router = useRouter();
  const now = useNowSeconds();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Часы идут по целым секундам — без ограничения сверху отсчёт начинался бы с «1:01».
  const resendIn = Math.min(
    site.demo.login.resendCooldownSeconds,
    Math.max(0, Math.ceil(Date.parse(challenge.resendAvailableAt) / 1000 - now)),
  );

  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2 text-body text-ink-secondary">
        <span className="break-all">Код отправлен на {challenge.email}.</span>
        <Button variant="link" size="sm" className="min-h-11 lg:min-h-0" onClick={onChangeEmail}>
          Изменить email
        </Button>
      </p>

      <p role="status" className="sr-only">
        {status}
      </p>

      <form
        noValidate
        className={`mt-6 flex flex-col gap-5 ${PANEL}`}
        onSubmit={(event) => {
          event.preventDefault();
          const result = verifyLoginCode(code);
          if (result.status !== 'ok') {
            setError(result.message);
            return;
          }
          toast({
            message: `Вы вошли как ${result.email}`,
            detail:
              result.addedFromProfile > 0
                ? `В корзину добавлено позиций из профиля: ${result.addedFromProfile}`
                : undefined,
          });
          router.replace(next);
        }}
      >
        {/* Демо: письма нет — код показан здесь. Строка внутри формы, над полем, куда его вводить. */}
        <div className="border-b border-line-subtle pb-4">
          <p className="flex items-start gap-2 text-small text-ink-secondary">
            <DemoBadge className="shrink-0" />
            <span className="pt-0.5">Письмо не отправляется. Код для входа:</span>
          </p>
          <p
            className="mt-2 font-mono text-title font-medium tracking-widest text-ink"
            data-testid="demo-code"
          >
            {formatLoginCode(challenge.code)}
          </p>
        </div>

        <Field label="Код из письма" id="login-code" error={error}>
          <Input
            size="lg"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="font-mono tracking-widest"
            value={code}
            // Поле появилось после «Получить код» — фокус сразу в нём.
            autoFocus
            onChange={(event) => {
              setCode(event.target.value);
              if (error !== null) setError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" fullWidth>
          Войти
        </Button>
      </form>

      <div className="mt-4">
        <Button
          variant="link"
          size="sm"
          className="min-h-11 lg:min-h-0"
          disabled={resendIn > 0}
          onClick={() => {
            const result = requestLoginCode(challenge.email, { resend: true });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setCode('');
            setError(null);
            setStatus(`Новый код отправлен на ${challenge.email}.`);
          }}
        >
          {resendIn > 0
            ? `Отправить повторно через ${formatCountdown(resendIn)}`
            : 'Отправить код повторно'}
        </Button>
      </div>
    </>
  );
}
