'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { dismissToast, useToastStore } from '@/lib/store/toast';
import type { ToastAnnouncement, ToastItem } from '@/lib/store/toast';

import { buttonClasses } from './Button';
import { IconButton } from './IconButton';

/**
 * Регион сообщений (DESIGN §5.9.31) — один на приложение, в корневом layout. Сообщения
 * показываются функцией `toast()` из `@/lib/store/toast`. Пауза таймера при наведении и фокусе.
 * Поверх открытого Modal не видны: `<dialog>` живёт в top layer выше любого z-index.
 *
 * Скринридеру сообщения объявляют два постоянных live-региона (`sr-only`), которые есть в
 * разметке с серверной отрисовки, — меняется только их текст: polite (`role="status"`) для
 * обычных сообщений и assertive (`role="alert"`) для ошибок. Видимые сообщения ролей не имеют
 * (иначе объявление дублировалось бы) и лежат в ориентире «Сообщения» — там их кнопки
 * («Вернуть», «Перейти в корзину», «Закрыть сообщение»). Фокус не переносится.
 */
export function ToastRegion() {
  const toasts = useToastStore((state) => state.toasts);
  const announcements = useToastStore((state) => state.announcements);
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-toast-live="polite"
        className="sr-only"
      >
        <LiveText entry={announcements.status} />
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-toast-live="assertive"
        className="sr-only"
      >
        <LiveText entry={announcements.error} />
      </div>
      <div
        role="region"
        aria-label="Сообщения"
        data-print="hidden"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-toast flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-[24rem]"
      >
        {toasts.map((item) => (
          <ToastMessage key={item.id} item={item} />
        ))}
      </div>
    </>
  );
}

/**
 * Текст объявления. Ключ — id сообщения: два одинаковых сообщения подряд («Добавлено в корзину:
 * Тип1 — 1 шт.» дважды) дают новый узел, и скринридер объявляет повтор, а не молчит.
 */
function LiveText({ entry }: { entry: ToastAnnouncement | null }) {
  return entry ? <span key={entry.id}>{entry.text}</span> : null;
}

function ToastMessage({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => dismissToast(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1000, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, item.id]);

  const close = () => dismissToast(item.id);
  const actionClass = buttonClasses({ variant: 'link', size: 'sm', tone: 'inverse' });

  return (
    <div
      data-surface="inverse"
      data-tone={item.tone}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      className="pointer-events-auto flex items-start gap-3 rounded-md bg-surface-inverse px-4 py-3 text-small text-ink-inverse shadow-overlay animate-rise-in"
    >
      <div className="min-w-0 flex-1 py-1.5">
        <p>{item.message}</p>
        {item.detail ? <p className="mt-0.5">{item.detail}</p> : null}
        {item.action ? (
          <div className="mt-1.5">
            {item.action.href ? (
              <Link href={item.action.href} className={actionClass} onClick={close}>
                {item.action.label}
              </Link>
            ) : (
              <button
                type="button"
                className={actionClass}
                onClick={() => {
                  item.action?.onAction?.();
                  close();
                }}
              >
                {item.action.label}
              </button>
            )}
          </div>
        ) : null}
      </div>
      <IconButton icon="x" label="Закрыть сообщение" size="sm" variant="inverse" onClick={close} />
    </div>
  );
}
