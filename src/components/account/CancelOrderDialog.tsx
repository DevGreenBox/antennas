'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { CANCEL_REASONS } from '@/lib/order-status';

/**
 * «Отменить заказ {№}?» (DESIGN §3.9, §6.6): причина обязательна; «Другое» — с уточнением.
 * Фокус при открытии — на «Не отменять» (наименее разрушительное). Подложка не закрывает окно:
 * в нём форма.
 */
export function CancelOrderDialog({
  open,
  number,
  onClose,
  onConfirm,
}: {
  open: boolean;
  number: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [attempted, setAttempted] = useState(false);
  const isOther = reason === 'Другое';
  const finalReason = isOther ? other.trim() : reason;
  const reasonError = attempted && reason === '' ? 'Укажите причину отмены' : null;
  const otherError = attempted && isOther && finalReason === '' ? 'Укажите причину отмены' : null;

  const close = () => {
    setReason('');
    setOther('');
    setAttempted(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnBackdrop={false}
      title={`Отменить заказ ${number}?`}
      footer={
        <>
          <Button variant="secondary" className="max-lg:h-11" data-autofocus onClick={close}>
            Не отменять
          </Button>
          <Button
            variant="danger"
            className="max-lg:h-11"
            onClick={() => {
              setAttempted(true);
              if (finalReason === '') return;
              onConfirm(finalReason);
              close();
            }}
          >
            Отменить заказ
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Причина" error={reasonError}>
          <Select size="lg" value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">Выберите причину</option>
            {CANCEL_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        {isOther ? (
          <Field label="Уточните причину" error={otherError}>
            <Input size="lg" value={other} onChange={(event) => setOther(event.target.value)} />
          </Field>
        ) : null}
        <p className="text-small">Отменённый заказ нельзя вернуть в работу.</p>
      </div>
    </Modal>
  );
}
