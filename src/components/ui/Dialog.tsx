'use client';

import { useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode, SyntheticEvent } from 'react';

import { cn } from '@/lib/cn';

import { Button } from './Button';
import type { ButtonVariant } from './Button';
import { IconButton } from './IconButton';

/**
 * Modal и Drawer (DESIGN §5.9.34) — нативный `<dialog>` + `showModal()`: ловушка фокуса, Esc,
 * инертный фон, `::backdrop` = scrim, прокрутка фона заблокирована (`html:has(dialog:modal)`).
 * Управляемые: `open` + `onClose` (Esc, крестик, подложка вызывают onClose).
 *
 * Фокус при открытии — на элемент с `data-autofocus`, иначе на первый фокусируемый элемент тела;
 * при закрытии — обратно на кнопку-триггер (то, что было в фокусе до открытия).
 *
 *   <Modal open={open} onClose={close} title="Очистить корзину?"
 *     footer={<><Button data-autofocus onClick={close}>Отмена</Button><Button variant="danger" onClick={clear}>Очистить</Button></>}>
 *     Из корзины будут удалены все позиции: 3.
 *   </Modal>
 *   <ConfirmDialog open={open} onClose={close} title="Очистить корзину?" confirmLabel="Очистить" onConfirm={clear}>…</ConfirmDialog>
 *   <Drawer open={open} onClose={close} side="left" title="Меню" widthClassName="w-[min(22rem,calc(100vw-2.5rem))]">…</Drawer>
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Открытие/закрытие нативного диалога по `open`, фокус внутрь и обратно на триггер. */
function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || !open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const target =
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      null;
    target?.focus();
    return () => {
      // Сначала закрыть (фон перестаёт быть инертным), потом вернуть фокус на триггер.
      if (dialog.open) dialog.close();
      if (trigger !== null && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  return { ref, bodyRef };
}

interface DialogBaseProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Подпись крестика (по умолчанию «Закрыть»). */
  closeLabel?: string;
  className?: string;
}

function useCloseHandlers(onClose: () => void, closeOnBackdrop: boolean) {
  return {
    onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
      // Esc: закрывает родитель через состояние, а не браузер сам по себе.
      event.preventDefault();
      onClose();
    },
    onClick: (event: MouseEvent<HTMLDialogElement>) => {
      // Клик по самому <dialog> (не по содержимому) — это клик по подложке.
      if (closeOnBackdrop && event.target === event.currentTarget) onClose();
    },
  };
}

export interface ModalProps extends DialogBaseProps {
  /** Клик по подложке закрывает (по умолчанию да; у модальных окон с формой — false). */
  closeOnBackdrop?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'Закрыть',
  closeOnBackdrop = true,
  className,
}: ModalProps) {
  const { ref, bodyRef } = useDialog(open);
  const titleId = useId();
  const handlers = useCloseHandlers(onClose, closeOnBackdrop);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      {...handlers}
      className={cn(
        'm-auto w-[min(32rem,calc(100vw-2rem))] max-w-none max-h-[calc(100dvh-2rem)] rounded-lg bg-surface p-0 text-ink shadow-overlay',
        'open:animate-rise-in',
        className,
      )}
    >
      {open ? (
        <div className="relative flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="px-6 pt-6 pr-14">
            <h2 id={titleId} className="text-title font-semibold">
              {title}
            </h2>
          </div>
          <IconButton
            icon="x"
            label={closeLabel}
            size="md"
            className="absolute top-3 right-3"
            onClick={onClose}
          />
          <div ref={bodyRef} className="overflow-y-auto px-6 py-4 text-body text-ink-secondary">
            {children}
          </div>
          {footer ? (
            <div className="flex flex-col-reverse gap-3 px-6 pb-6 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export interface ConfirmDialogProps extends Omit<ModalProps, 'footer'> {
  confirmLabel: string;
  onConfirm: () => void;
  /** danger — разрушающее действие (по умолчанию); primary — «Изменить сумму». */
  confirmVariant?: Extract<ButtonVariant, 'danger' | 'primary'>;
  cancelLabel?: string;
  /** Подтверждение недоступно (например, не выбрана причина отмены). */
  confirmDisabled?: boolean;
}

/** Подтверждение (§6.6): фокус при открытии — на «Отмена» (наименее разрушительное). */
export function ConfirmDialog({
  confirmLabel,
  onConfirm,
  confirmVariant = 'danger',
  cancelLabel = 'Отмена',
  confirmDisabled = false,
  onClose,
  ...rest
}: ConfirmDialogProps) {
  return (
    <Modal
      {...rest}
      onClose={onClose}
      footer={
        <>
          {/* На < lg — 44 px: кнопки окна тоже цели нажатия (DESIGN § R.9). */}
          <Button variant="secondary" className="max-lg:h-11" data-autofocus onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            className="max-lg:h-11"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

export interface DrawerProps extends DialogBaseProps {
  side?: 'left' | 'right';
  /** Ширина панели: меню — `w-[min(22rem,calc(100vw-2.5rem))]`, подбор — `w-full sm:w-[26rem]`. */
  widthClassName?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = 'Закрыть',
  side = 'right',
  widthClassName = 'w-full sm:w-[26rem]',
  className,
}: DrawerProps) {
  const { ref, bodyRef } = useDialog(open);
  const titleId = useId();
  const handlers = useCloseHandlers(onClose, true);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      {...handlers}
      className={cn(
        'fixed inset-y-0 m-0 h-dvh max-h-dvh max-w-none bg-surface p-0 text-ink shadow-overlay',
        side === 'left'
          ? 'left-0 right-auto sm:rounded-r-lg open:animate-slide-in-left'
          : 'right-0 left-auto sm:rounded-l-lg open:animate-slide-in-right',
        widthClassName,
        className,
      )}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <h2 id={titleId} className="text-title font-semibold">
              {title}
            </h2>
            <IconButton icon="x" label={closeLabel} size="md" onClick={onClose} />
          </div>
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4">
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 gap-3 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
