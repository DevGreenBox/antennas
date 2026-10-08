'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { POSITION_FORMS, countLabel, formatBadgeCount } from '@/lib/format';
import { useCartCount } from '@/lib/store/cart';
import { useFavoritesCount } from '@/lib/store/favorites';
import { useSessionEmail } from '@/lib/store/session';

/**
 * Действия справа в шапке (DESIGN § R.5): Избранное и Корзина — компактно, значок + счётчик
 * (подпись — только для скринридера); «Войти»/«Кабинет» — значок и подпись с xl. На < lg — цели
 * 44×44, счётчик над значком. Счётчики — число позиций; до гидратации и при 0 не рендерятся
 * (без мигания «0»); не live — обновляются вместе с Toast.
 *
 * Ширина шапки не зависит от счётчиков: на < lg бейдж лежит поверх значка (absolute), а с lg, где
 * он стоит в строке после значка, под него всегда зарезервировано место шириной в две цифры
 * (`COUNT_SLOT`) — и до гидратации, и при 0. Иначе появление «1» сдвигало бы поле поиска.
 */
export function HeaderActions({ className }: { className?: string }) {
  const favorites = useFavoritesCount();
  const cart = useCartCount();
  const email = useSessionEmail();
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <HeaderAction href="/favorites" icon="bookmark" label="Избранное" count={favorites} />
      <HeaderAction href="/cart" icon="shopping-cart" label="Корзина" count={cart} />
      {email ? (
        <HeaderAction href="/account" icon="user" label="Кабинет" match="/account" showLabel />
      ) : (
        <HeaderAction href="/login" icon="user" label="Войти" showLabel />
      )}
    </div>
  );
}

/** Место под счётчик с lg: ширина бейджа с двумя цифрами (22 px). */
const COUNT_SLOT = 'contents lg:flex lg:w-[1.375rem] lg:shrink-0';

function HeaderAction({
  href,
  icon,
  label,
  count,
  match,
  showLabel = false,
}: {
  href: string;
  icon: IconName;
  label: string;
  /** Есть у пунктов со счётчиком (Избранное, Корзина) — даже при 0: под него держится место. */
  count?: number;
  /** Префикс пути, при котором пункт текущий (по умолчанию — точный href). */
  match?: string;
  /** Подпись видна с xl («Войти»); у счётчиков — только для скринридера. */
  showLabel?: boolean;
}) {
  const pathname = usePathname();
  const current = match ? pathname.startsWith(match) : pathname === href;
  const counted = count !== undefined;
  return (
    <Link
      href={href}
      aria-label={count ? `${label}, ${countLabel(count, POSITION_FORMS)}` : label}
      aria-current={current ? 'page' : undefined}
      className="relative inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-sm px-2 text-small font-medium text-ink transition-colors duration-fast hover:bg-surface-muted aria-[current=page]:bg-surface-muted lg:px-2.5"
    >
      <Icon name={icon} size={20} />
      <span className={showLabel ? 'sr-only xl:not-sr-only' : 'sr-only'}>{label}</span>
      {counted ? (
        // Слот: на < lg не создаёт блока (contents) — бейдж позиционируется от ссылки; с lg —
        // постоянная ширина, есть бейдж или нет.
        <span className={COUNT_SLOT}>
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 h-[1.125rem] min-w-[1.125rem] shrink-0 rounded-full bg-brand px-1 text-center text-caption leading-[1.125rem] font-semibold text-on-brand tabular-nums lg:static"
            >
              {formatBadgeCount(count)}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
