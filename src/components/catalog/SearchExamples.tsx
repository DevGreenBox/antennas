import Link from 'next/link';

import { site } from '@/config/site';
import { cn } from '@/lib/cn';

/**
 * Примеры запросов (DESIGN §2.7, §6.4): ссылки на `/search?q=…` из `site.catalog.searchExamples` —
 * только такие, что находят реальные позиции.
 */
export function SearchExamples({ className }: { className?: string }) {
  return (
    <p className={cn('text-small text-ink-secondary', className)}>
      Например:{' '}
      {site.catalog.searchExamples.map((example, index) => (
        <span key={example}>
          {index > 0 ? ', ' : null}
          <Link href={`/search?q=${encodeURIComponent(example)}`} className="text-link">
            {example}
          </Link>
        </span>
      ))}
    </p>
  );
}
