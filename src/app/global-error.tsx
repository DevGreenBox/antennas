'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { site, siteTitle } from '@/config/site';

import { plexMono, plexSans } from './fonts';
import './globals.css';

/**
 * Сбой корневого layout (DESIGN §2.22): шапка, подвал и `error.tsx` уже не отрисуются, поэтому
 * страница своя — с `<html>`, `<body>`, шрифтами и стилями. Вместо английской заглушки Next —
 * тот же текст, что у `error.tsx`, и выход из тупика: если причина в данных сайта в этом
 * браузере (корзина, избранное, демо-вход и демо-заказы), их можно сбросить. Удаляются только
 * ключи `site.storageKeys` — остальные данные браузера не трогаются.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const resetAndReload = () => {
    for (const key of Object.values(site.storageKeys)) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Хранилище недоступно (приватный режим, запрет) — сбрасывать нечего.
      }
    }
    window.location.reload();
  };

  return (
    <html lang={site.lang} className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <title>{`Не удалось загрузить страницу — ${siteTitle()}`}</title>
        <main id="content" className="page-container flex-1 pt-10 pb-16 lg:pt-16 lg:pb-24">
          <div className="max-w-text">
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
            <p className="mt-3 text-body text-ink-secondary">
              Иногда причина — повреждённые данные сайта в этом браузере: корзина, избранное,
              демо-вход и демо-заказы. Их можно сбросить — данные других сайтов это не затронет.
            </p>
            <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
              <Button variant="primary" onClick={() => retry()}>
                Повторить
              </Button>
              <Button
                variant="secondary"
                className="h-auto! min-h-10 py-2 whitespace-normal!"
                onClick={resetAndReload}
              >
                Сбросить данные этого браузера и перезагрузить
              </Button>
            </div>
            <p className="mt-6 text-body">
              <Link href="/" className="text-link">
                На главную
              </Link>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
