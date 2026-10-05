import { cn } from '@/lib/cn';

/**
 * Процесс покупки «Заявка → Согласование → Оплата» (DESIGN §5.9.25, тексты — §6.2). Номера
 * оправданы: это настоящая последовательность, а не список преимуществ.
 *
 *   <ProcessSteps />                                 // главная: вертикально, шаги нейтральные
 *   <ProcessSteps orientation="horizontal" current={2} />  // success: на lg в ряд, шаг 2 — текущий
 *
 * Горизонтальный вариант на < lg остаётся вертикальным (три колонки текста на телефоне не
 * читаются). Состояния шагов — только когда передан `current`: выполненные залиты `ink`, текущий —
 * оранжевой заливкой (оранжевый только заливкой, §0 п.3) и `aria-current="step"`.
 */

export const PROCESS_STEPS = [
  {
    title: 'Заявка',
    text: 'Соберите корзину и отправьте заявку. На этом шаге ничего не оплачивается.',
  },
  {
    title: 'Согласование',
    text: 'Менеджер свяжется с вами, уточнит состав, цены позиций «по запросу» и доставку.',
  },
  {
    title: 'Оплата',
    text: 'Согласованный заказ появится в личном кабинете с кнопкой оплаты.',
  },
] as const;

export interface ProcessStepsProps {
  orientation?: 'vertical' | 'horizontal';
  /** Номер текущего шага (1–3). Без него шаги показаны без состояний. */
  current?: 1 | 2 | 3;
  /** Заголовок шага: h3 под h2 секции; p — где заголовков выше нет. */
  headingLevel?: 'h3' | 'p';
  className?: string;
}

export function ProcessSteps({
  orientation = 'vertical',
  current,
  headingLevel = 'h3',
  className,
}: ProcessStepsProps) {
  const horizontal = orientation === 'horizontal';
  const Title = headingLevel;
  return (
    <ol className={cn(horizontal && 'lg:grid lg:grid-cols-3 lg:gap-8', className)}>
      {PROCESS_STEPS.map((step, index) => {
        const number = index + 1;
        const last = number === PROCESS_STEPS.length;
        const state =
          current === undefined
            ? 'neutral'
            : number < current
              ? 'done'
              : number === current
                ? 'current'
                : 'upcoming';
        return (
          <li
            key={step.title}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'relative flex gap-4',
              last ? null : 'pb-6',
              horizontal && 'lg:flex-col lg:gap-3 lg:pb-0',
            )}
          >
            {last ? null : (
              <>
                {/* Линия к следующему шагу: по вертикали — под номером, по горизонтали — справа от него. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-8 bottom-1 left-3.5 w-px -translate-x-1/2 bg-line',
                    horizontal && 'lg:hidden',
                  )}
                />
                {horizontal ? (
                  <span
                    aria-hidden
                    className="absolute top-3.5 right-0 left-10 hidden h-px bg-line lg:block"
                  />
                ) : null}
              </>
            )}
            <span
              aria-hidden
              className={cn(
                'relative flex size-7 shrink-0 items-center justify-center rounded-full border border-ink font-mono text-small',
                state === 'done'
                  ? 'bg-ink text-ink-inverse'
                  : state === 'current'
                    ? 'bg-brand text-on-brand'
                    : 'bg-surface text-ink',
              )}
            >
              {number}
            </span>
            <div className={cn('min-w-0 pt-0.5', horizontal && 'lg:pt-0')}>
              <Title className="text-body font-semibold text-ink">
                <span className="sr-only">Шаг {number}. </span>
                {step.title}
              </Title>
              <p className="mt-1 text-small text-ink-secondary">{step.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
