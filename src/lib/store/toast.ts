'use client';

import { create } from 'zustand';

/**
 * Очередь сообщений Toast (DESIGN §5.9.31). Не сохраняется между перезагрузками.
 *
 *   toast({ message: 'Добавлено в корзину: Тип1 — 1 шт.', action: { label: 'Перейти в корзину', href: '/cart' } });
 *   toast({ message: 'Позиция удалена', action: { label: 'Вернуть', onAction: () => restore() } });
 *   toast({ message: 'Не удалось…', tone: 'error' });   // объявляется через role="alert"
 *
 * Время показа: 5 с, с действием — 8 с; пауза при наведении и фокусе; одновременно не больше 3
 * (старое уходит). Регион — `ToastRegion` в корневом layout.
 *
 * Объявление для скринридера (`announcements`) хранится отдельно от видимых сообщений: его текст
 * попадает в постоянные live-регионы `ToastRegion` (polite — для status, assertive — для error),
 * которые есть в разметке с первой отрисовки. Сообщение, вставленное в DOM уже с текстом и ролью,
 * скринридеры часто пропускают. Закрытие сообщения убирает его объявление, но не повторяет
 * предыдущее.
 */

export interface ToastAction {
  label: string;
  /** Переход по ссылке… */
  href?: string;
  /** …или действие (например, «Вернуть»). Тост закрывается после нажатия. */
  onAction?: () => void;
}

export interface ToastInput {
  message: string;
  /** Вторая строка («В корзину добавлено позиций из профиля: 2»). */
  detail?: string;
  action?: ToastAction;
  /** error → объявление в live-регионе role="alert" (assertive), иначе — polite. */
  tone?: 'status' | 'error';
  /** Своё время показа, мс. */
  duration?: number;
}

export interface ToastItem extends Required<Pick<ToastInput, 'message' | 'tone' | 'duration'>> {
  id: number;
  detail?: string;
  action?: ToastAction;
}

/** Текст для live-региона; `id` — сообщение, к которому он относится (ключ узла в регионе). */
export interface ToastAnnouncement {
  id: number;
  text: string;
}

interface ToastState {
  toasts: ToastItem[];
  /** Последнее объявление по тону: status → aria-live="polite", error → role="alert". */
  announcements: Record<ToastItem['tone'], ToastAnnouncement | null>;
}

export const MAX_TOASTS = 3;

export const useToastStore = create<ToastState>()(() => ({
  toasts: [],
  announcements: { status: null, error: null },
}));

/** «Сообщение. Вторая строка» — одной фразой для скринридера. */
function announcementText(message: string, detail?: string): string {
  if (!detail) return message;
  return /[.!?…:]$/.test(message) ? `${message} ${detail}` : `${message}. ${detail}`;
}

let counter = 0;

/** Показать сообщение; возвращает id (для `dismissToast`). */
export function toast(input: ToastInput): number {
  counter += 1;
  const item: ToastItem = {
    id: counter,
    message: input.message,
    detail: input.detail,
    action: input.action,
    tone: input.tone ?? 'status',
    duration: input.duration ?? (input.action ? 8000 : 5000),
  };
  useToastStore.setState((state) => {
    const toasts = [...state.toasts, item].slice(-MAX_TOASTS);
    return {
      toasts,
      announcements: {
        ...keepShown(state.announcements, toasts),
        [item.tone]: { id: item.id, text: announcementText(item.message, item.detail) },
      },
    };
  });
  return item.id;
}

export function dismissToast(id: number): void {
  useToastStore.setState((state) => {
    const toasts = state.toasts.filter((item) => item.id !== id);
    return { toasts, announcements: keepShown(state.announcements, toasts) };
  });
}

/** Объявления только тех сообщений, что ещё на экране (закрытое или вытесненное — убираем). */
function keepShown(
  announcements: ToastState['announcements'],
  toasts: readonly ToastItem[],
): ToastState['announcements'] {
  const shown = (entry: ToastAnnouncement | null) =>
    entry !== null && toasts.some((item) => item.id === entry.id) ? entry : null;
  return { status: shown(announcements.status), error: shown(announcements.error) };
}
