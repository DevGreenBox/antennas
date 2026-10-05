'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { site } from '@/config/site';
import { cn } from '@/lib/cn';
import { UNREAD_FORMS, countLabel, formatBadgeCount } from '@/lib/format';
import { useUnreadNotificationsCount } from '@/lib/store/orders';

/**
 * Навигация ЛК (DESIGN §5.9.35): ≥ lg — вертикальная, с «Выйти» внизу; < lg — ряд ссылок с
 * полосой под текущей («Выйти» тогда в PageHeader). У «Уведомления» — счётчик непрочитанных
 * (в шапке сайта его нет, §3.10).
 */
export function AccountNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const unread = useUnreadNotificationsCount();
  const items = site.nav.account.map((link) => ({
    ...link,
    current: pathname === link.href,
    count: link.href === '/account/notifications' ? unread : 0,
  }));

  return (
    <>
      <nav aria-label="Личный кабинет" className="hidden self-start lg:block">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                className={cn(
                  'relative flex h-10 items-center justify-between gap-3 rounded-sm px-3 text-small font-medium transition-colors duration-fast',
                  item.current
                    ? 'bg-surface-muted text-ink before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-ink'
                    : 'text-ink-secondary hover:bg-surface-muted hover:text-ink',
                )}
              >
                <span>{item.label}</span>
                <CountBubble count={item.count} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-2 border-t border-line-subtle pt-2">
          <Button variant="ghost" size="sm" icon="log-out" onClick={onLogout}>
            Выйти
          </Button>
        </div>
      </nav>

      <nav aria-label="Личный кабинет" className="-mt-2 mb-2 border-b border-line lg:hidden">
        <ul className="flex gap-4 overflow-x-auto">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center gap-2 text-small font-medium whitespace-nowrap',
                  item.current
                    ? 'text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink'
                    : 'text-ink-secondary hover:text-ink',
                )}
              >
                {item.label}
                <CountBubble count={item.count} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function CountBubble({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden
        className="h-[1.125rem] min-w-[1.125rem] rounded-full bg-brand px-1 text-center text-caption leading-[1.125rem] font-semibold text-on-brand tabular-nums"
      >
        {formatBadgeCount(count)}
      </span>
      <span className="sr-only">, {countLabel(count, UNREAD_FORMS)}</span>
    </>
  );
}
