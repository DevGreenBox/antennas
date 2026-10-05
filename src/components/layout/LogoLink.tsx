import Link from 'next/link';

import { LogoMark } from '@/components/brand/LogoMark';
import { site, siteTitle } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Логотип-ссылка на главную (DESIGN §5.9.1): знак + дескриптор, пока бренд не подтверждён
 * (`brandName = null`); с брендом — название и под ним дескриптор.
 */
export function LogoLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${siteTitle()} — на главную`}
      className={cn('flex h-14 shrink-0 items-center gap-2.5 rounded-sm lg:h-16', className)}
    >
      <LogoMark size={28} className="lg:h-8 lg:w-auto" />
      {site.brandName ? (
        <span className="flex flex-col">
          <span className="text-body leading-tight font-semibold text-ink">{site.brandName}</span>
          <span className="text-caption text-ink-muted">{site.descriptor}</span>
        </span>
      ) : (
        <span className="max-w-[8rem] text-caption font-medium text-ink sm:max-w-none sm:text-small sm:whitespace-nowrap">
          {site.descriptor}
        </span>
      )}
    </Link>
  );
}
