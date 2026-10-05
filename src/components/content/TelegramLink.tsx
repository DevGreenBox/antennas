import { Icon } from '@/components/ui/Icon';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Ссылка на Telegram внутри текста (DESIGN §5.9.4 «Внешняя»): `text-link`, новая вкладка,
 * иконка `external-link` после текста и sr-пометка. Адрес и ник — только из `site.contacts`.
 *
 *   Напишите в Telegram <TelegramLink />.        // «@svyaz987 ↗»
 */
export function TelegramLink({ className }: { className?: string }) {
  const { url, handle } = site.contacts.telegram;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('text-link whitespace-nowrap text-ink', className)}
    >
      {handle}
      <Icon name="external-link" size={16} className="ml-1 inline-block align-[-0.15em]" />
      <span className="sr-only"> (откроется в новой вкладке)</span>
    </a>
  );
}
