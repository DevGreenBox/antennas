/**
 * Адрес сайта (src/config/site-url.ts): из него строятся metadataBase, canonical, og:url,
 * og:image, sitemap и JSON-LD. Без переменных на Vercel ссылки вели бы на localhost:3000.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { LOCAL_SITE_URL, resolveSiteUrl } = await import(
  pathToFileURL(path.join(ROOT, 'src/config/site-url.ts')).href
);

describe('resolveSiteUrl', () => {
  test('NEXT_PUBLIC_SITE_URL важнее переменных Vercel, canonical не на localhost', () => {
    const url = resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: 'https://antennas.example.ru',
      VERCEL_PROJECT_PRODUCTION_URL: 'antennas.vercel.app',
      VERCEL_URL: 'antennas-git-main-team.vercel.app',
    });
    assert.equal(url, 'https://antennas.example.ru');
    assert.ok(!url.includes('localhost'));
    // Так metadataBase + canonical «/catalog» превращаются в абсолютный адрес.
    assert.equal(new URL('catalog', `${url}/`).href, 'https://antennas.example.ru/catalog');
  });

  test('завершающий «/» убирается, путь сохраняется, без схемы — https', () => {
    assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://a.ru/' }), 'https://a.ru');
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://a.ru/shop/' }),
      'https://a.ru/shop',
    );
    assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '  a.ru ' }), 'https://a.ru');
    assert.equal(
      resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100' }),
      'http://127.0.0.1:3100',
    );
  });

  test('без своей переменной — production-домен Vercel, затем адрес деплоя', () => {
    assert.equal(
      resolveSiteUrl({
        VERCEL_PROJECT_PRODUCTION_URL: 'antennas.vercel.app',
        VERCEL_URL: 'antennas-abc123-team.vercel.app',
      }),
      'https://antennas.vercel.app',
    );
    assert.equal(
      resolveSiteUrl({ VERCEL_URL: 'antennas-abc123-team.vercel.app' }),
      'https://antennas-abc123-team.vercel.app',
    );
  });

  test('пустые значения пропускаются; без переменных — localhost:3000', () => {
    assert.equal(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: '',
        VERCEL_PROJECT_PRODUCTION_URL: ' ',
        VERCEL_URL: 'x.vercel.app',
      }),
      'https://x.vercel.app',
    );
    assert.equal(resolveSiteUrl({}), LOCAL_SITE_URL);
    assert.equal(LOCAL_SITE_URL, 'http://localhost:3000');
  });

  test('неверный адрес — понятная ошибка, а не canonical «undefined»', () => {
    assert.throws(
      () => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://' }),
      /NEXT_PUBLIC_SITE_URL/,
    );
    assert.throws(
      () => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'ftp://files.example.ru' }),
      /http\(s\)/,
    );
  });
});
