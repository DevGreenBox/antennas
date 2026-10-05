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
 * Действия справа в шапке (DESIGN §5.9.1): Избранное, Корзина, Войти/Кабинет. Подписи видны
 * с xl, до этого — иконки 44×44 (lg — 40). Счётчики — число позиций; до гидратации и при 0 не
 * рендерятся (без мигания «0»); не live — обновляются вместе с Toast.
 *
 * Ширина шапки не зависит от счётчиков: на < xl бейдж лежит поверх иконки (absolute), а с xl,
 * где он стоит в строке после подписи, под него всегда зарезервировано место шириной в две цифры
 * (`COUNT_SLOT`) — и до гидратации, и при 0. Иначе появление «1» сдвигало поле поиска (522 → 470 px
 * на 1440). «99+» шире слота на 8 px и выходит в правый отступ ссылки — ширина всё равно та же.
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
        <HeaderAction href="/account" icon="user" label="Кабинет" match="/account" />
      ) : (
        <HeaderAction href="/login" icon="user" label="Войти" />
      )}
    </div>
  );
}

/** Место под счётчик с xl: ширина бейджа с двумя цифрами (22 px). */
const COUNT_SLOT = 'contents xl:flex xl:w-[1.375rem] xl:shrink-0';

function HeaderAction({
  href,
  icon,
  label,
  count,
  match,
}: {
  href: string;
  icon: IconName;
  label: string;
  /** Есть у пунктов со счётчиком (Избранное, Корзина) — даже при 0: под него держится место. */
  count?: number;
  /** Префикс пути, при котором пункт текущий (по умолчанию — точный href). */
  match?: string;
}) {
  const pathname = usePathname();
  const current = match ? pathname.startsWith(match) : pathname === href;
  const counted = count !== undefined;
  return (
    <Link
      href={href}
      aria-label={count ? `${label}, ${countLabel(count, POSITION_FORMS)}` : label}
      aria-current={current ? 'page' : undefined}
      className="relative inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-2 text-small font-medium text-ink transition-colors duration-fast hover:bg-surface-muted lg:h-10 lg:min-w-10"
    >
      <Icon name={icon} size={20} />
      <span className="sr-only xl:not-sr-only">{label}</span>
      {counted ? (
        // Слот: на < xl не создаёт блока (contents) — бейдж позиционируется от ссылки; с xl —
        // постоянная ширина, есть бейдж или нет.
        <span className={COUNT_SLOT}>
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 h-[1.125rem] min-w-[1.125rem] shrink-0 rounded-full bg-brand px-1 text-center text-caption leading-[1.125rem] font-semibold text-on-brand tabular-nums xl:static"
            >
              {formatBadgeCount(count)}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
