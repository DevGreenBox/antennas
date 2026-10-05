/**
 * Базовый адрес сайта (`metadataBase`, canonical, `og:url`, `og:image`, sitemap, robots, JSON-LD).
 *
 * Порядок источников — первый непустой:
 * 1. `NEXT_PUBLIC_SITE_URL` — боевой домен, задаётся вручную (Vercel → Settings → Environment
 *    Variables). Можно без схемы: `example.ru` → `https://example.ru`.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — системная переменная Vercel: самый короткий production-домен
 *    проекта без схемы (`antennas.vercel.app` или подключённый свой домен). Есть во всех окружениях
 *    Vercel, в том числе в превью, — canonical и картинка превью ссылок ведут на production.
 * 3. `VERCEL_URL` — системная переменная Vercel: адрес конкретного деплоя без схемы
 *    (`antennas-git-…-team.vercel.app`). Запасной вариант, если production-домена ещё нет.
 * 4. `http://localhost:3000` — локальная разработка без переменных.
 *
 * Системные переменные Vercel доступны и при сборке, и в рантайме (настройка проекта
 * «Automatically expose System Environment Variables», включена по умолчанию). Те же имена
 * читает сам Next 16 для `metadataBase` по умолчанию
 * (`node_modules/next/dist/lib/metadata/resolvers/resolve-url.js`).
 *
 * Модуль — чистая функция без `process.env`: её проверяет юнит-тест
 * (`scripts/tests/site-url.test.mjs`). Значение для страниц вычисляет `SITE_URL` в `@/lib/seo` —
 * только на сервере: переменные без префикса `NEXT_PUBLIC_` в браузер не попадают, и в
 * клиентском компоненте адрес получился бы другим.
 */

export interface SiteUrlEnv {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
}

/** Адрес по умолчанию — `next dev` / `next start` без переменных окружения. */
export const LOCAL_SITE_URL = 'http://localhost:3000';

/** Абсолютный адрес без завершающего «/»; без схемы — https. Неверное значение — ошибка сборки. */
function normalizeSiteUrl(value: string, source: keyof SiteUrlEnv): string {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`${source}: «${value}» — не адрес сайта (пример: https://example.ru)`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${source}: «${value}» — нужен адрес http(s)://`);
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

export function resolveSiteUrl(env: SiteUrlEnv): string {
  const sources = [
    'NEXT_PUBLIC_SITE_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'VERCEL_URL',
  ] as const satisfies readonly (keyof SiteUrlEnv)[];
  for (const source of sources) {
    const value = env[source]?.trim();
    if (value) return normalizeSiteUrl(value, source);
  }
  return LOCAL_SITE_URL;
}
