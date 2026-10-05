'use client';

import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/store/toast';

/**
 * «Скопировать» рядом с укороченным хэшем (DESIGN §2.20 п.1): кладёт в буфер полное значение.
 * Результат сообщает Toast — он же live-регион, отдельная подпись у кнопки не нужна.
 */
export function CopyButton({
  value,
  label = 'Скопировать',
  accessibleLabel,
  successMessage,
}: {
  value: string;
  label?: string;
  /** Полное доступное имя, если видимой подписи мало («Скопировать sha256 источника»). */
  accessibleLabel?: string;
  successMessage: string;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ message: successMessage });
    } catch {
      // Буфер обмена недоступен (нет разрешения, небезопасный контекст) — значение видно в подсказке.
      toast({ message: `Не удалось скопировать. Значение: ${value}`, tone: 'error' });
    }
  };
  return (
    <Button variant="link" size="sm" icon="copy" aria-label={accessibleLabel} onClick={copy}>
      {label}
    </Button>
  );
}
