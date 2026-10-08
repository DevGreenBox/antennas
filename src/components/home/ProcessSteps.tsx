import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * Процесс покупки «Заявка → Согласование → Оплата» (DESIGN § R.6, тексты — §6.2). Номера
 * оправданы: это настоящая последовательность, а не список преимуществ.
 *
 *   <ProcessSteps />                              // главная, «Доставка и оплата»: шаги нейтральные
 *   <ProcessSteps current={2} headingLevel="h3" /> // заявка отправлена: шаг 2 — текущий
 *
 * Одна горизонтальная полоса без карточек: на ≥ lg три колонки между тонкими линиями, номер и
 * стрелка к следующему шагу — в верхней строке колонки; на < lg — столбиком с разделителями.
 * Состояния шагов — только когда передан `current`: выполненные — номер на `ink`, текущий — на
 * оранжевой заливке (оранжевый только заливкой) и `aria-current="step"`.
 */

export const PROCESS_STEPS = [
  {
    title: 'Соберите заявку',
    text: 'Добавьте нужные позиции в корзину и отправьте заявку. На этом шаге ничего не оплачивается.',
  },
  {
    title: 'Согласуем заказ',
    text: 'Менеджер подтвердит состав, стоимость — в том числе позиций «по запросу» — и доставку.',
  },
  {
    title: 'Оплатите',
    text: 'После согласования заказ появится в личном кабинете с кнопкой оплаты.',
  },
] as const;

export interface ProcessStepsProps {
  /** Номер текущего шага (1–3). Без него шаги показаны без состояний. */
  current?: 1 | 2 | 3;
  /** Заголовок шага: h3 под h2 секции; p — где заголовков выше нет. */
  headingLevel?: 'h3' | 'p';
  className?: string;
}

export function ProcessSteps({ current, headingLevel = 'h3', className }: ProcessStepsProps) {
  const Title = headingLevel;
  return (
    <ol
      className={cn(
        'grid divide-y divide-line border-y border-line lg:grid-cols-3 lg:divide-x lg:divide-y-0',
        className,
      )}
    >
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
            className="py-5 lg:px-8 lg:py-6 lg:first:pl-0 lg:last:pr-0"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  'inline-flex h-6 min-w-8 items-center justify-center rounded-sm px-1.5 font-mono text-caption font-medium tabular-nums',
                  state === 'done'
                    ? 'bg-ink text-ink-inverse'
                    : state === 'current'
                      ? 'bg-brand text-on-brand'
                      : state === 'upcoming'
                        ? 'border border-line text-ink-muted'
                        : 'border border-line-emphasis text-ink',
                )}
              >
                {String(number).padStart(2, '0')}
              </span>
              {last ? null : (
                <span aria-hidden className="hidden flex-1 items-center gap-2 lg:flex">
                  <span className="h-px flex-1 bg-line" />
                  <Icon name="arrow-right" size={16} className="text-ink-muted" />
                </span>
              )}
            </div>
            <Title className="mt-3 text-body font-semibold text-ink">
              <span className="sr-only">Шаг {number}. </span>
              {step.title}
            </Title>
            <p className="mt-1 max-w-[22rem] text-small text-ink-secondary">{step.text}</p>
          </li>
        );
      })}
    </ol>
  );
}
