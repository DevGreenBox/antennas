'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { site } from '@/config/site';

/**
 * Сбой рендера страницы (DESIGN §2.22). `retry()` (Next 16.3) заново запрашивает и рендерит
 * сегмент — подходит и для серверных ошибок, в отличие от `reset()`. Вид — как у 404 (DESIGN
 * § R): типографика, одна главная кнопка, без иллюстраций.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-[40rem] pt-4 lg:pt-10">
      <h1>Не удалось загрузить страницу</h1>
      <p className="mt-3 text-body text-ink-secondary">
        Попробуйте ещё раз. Если ошибка повторяется, напишите в Telegram{' '}
        <a
          href={site.contacts.telegram.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          {site.contacts.telegram.handle}
          <span className="sr-only"> (откроется в новой вкладке)</span>
        </a>
        .
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button variant="primary" onClick={() => retry()}>
          Повторить
        </Button>
        <Link href="/" className="text-link text-body">
          На главную
        </Link>
      </div>
    </div>
  );
}
