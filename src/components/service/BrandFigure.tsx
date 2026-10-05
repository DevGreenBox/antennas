import Image from 'next/image';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * Иллюстрация служебной страницы `/brand`: картинка из `public/brand/` в рамке, подпись и ссылка
 * на файл в полном размере — на схемах мелкие подписи, на телефоне их иначе не прочесть.
 * PNG оптимизирует next/image; SVG отдаётся как есть (Next не оптимизирует SVG сам).
 */
export function BrandFigure({
  src,
  width,
  height,
  alt,
  sizes,
  caption,
  priority = false,
  className,
}: {
  /** Путь в public: `/brand/before-after.png`. */
  src: `/brand/${string}`;
  width: number;
  height: number;
  alt: string;
  /** Ширина картинки в раскладке — для srcset. */
  sizes: string;
  caption?: ReactNode;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure className={cn('min-w-0', className)}>
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <Image
          src={src}
          width={width}
          height={height}
          alt={alt}
          sizes={sizes}
          preload={priority}
          className="h-auto w-full"
        />
      </div>
      <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small text-ink-muted">
        {caption ? <span className="max-w-text">{caption}</span> : <span />}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-ink-secondary underline decoration-1 underline-offset-[0.2em] hover:text-ink hover:decoration-2"
        >
          Открыть в полном размере
          <Icon name="external-link" size={16} />
          <span className="sr-only"> (откроется в новой вкладке)</span>
        </a>
      </figcaption>
    </figure>
  );
}
