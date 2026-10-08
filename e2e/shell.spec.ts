import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

/**
 * Общий каркас (DESIGN §2.1, §5.9.1–5.9.4, §5.9.31, §7, §8): Toast в постоянном live-регионе,
 * шапка без прыжков ширины, демо-баннер, SkipLink, ориентиры, заголовки и адрес сайта.
 *
 * Прогон против dev-сервера: E2E_BASE_URL=http://localhost:3300 npx playwright test e2e/shell.spec.ts
 * (именно localhost: с другого хоста next dev не отдаёт dev-ресурсы, и страница не гидратируется).
 * Вычисление адреса сайта по переменным окружения проверяет юнит-тест
 * scripts/tests/site-url.test.mjs; здесь — что canonical, og:image и sitemap на одной базе.
 */

const PRODUCT = '/product/antenna-tip1';
const SEARCH = 'header input[role="combobox"]';

/** Основные страницы: SkipLink → main#content на каждой. */
const MAIN_PAGES = [
  '/',
  '/catalog',
  '/catalog/antennas',
  PRODUCT,
  '/search?q=%D0%A2%D0%B8%D0%BF1',
  '/favorites',
  '/cart',
  '/checkout',
  '/login',
  '/account',
  '/contacts',
  '/delivery',
  '/legal/privacy',
  '/import-report',
  '/brand',
  '/no-such-page',
];

/** Гидратация шапки: у поля поиска появились свойства React, эффекты — следующим кадром. */
async function waitForHydration(page: Page) {
  await page.waitForFunction((selector) => {
    const input = document.querySelector(selector);
    return input !== null && Object.keys(input).some((key) => key.startsWith('__react'));
  }, SEARCH);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

const searchWidth = (page: Page) =>
  page.locator(SEARCH).evaluate((input) => input.getBoundingClientRect().width);

/** Ширина поля поиска в серверной разметке: тот же размер окна, JS выключен. */
async function serverSearchWidth(browser: Browser, page: Page, path: string): Promise<number> {
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    javaScriptEnabled: false,
  });
  const noJs = await context.newPage();
  await noJs.goto(path);
  const width = await searchWidth(noJs);
  await context.close();
  return width;
}

test.describe('Toast', () => {
  test('«Добавлено в корзину» объявляется в live-регионе, который был до события', async ({
    page,
    request,
  }) => {
    // Регион есть уже в серверной разметке — не вставляется вместе с сообщением.
    const html = await (await request.get(PRODUCT)).text();
    expect(html).toMatch(/<div[^>]*aria-live="polite"[^>]*data-toast-live="polite"/);
    expect(html).toMatch(/<div[^>]*role="alert"[^>]*aria-live="assertive"[^>]*data-toast-live/);

    await page.goto(PRODUCT);
    await waitForHydration(page);
    const live = page.locator('[data-toast-live="polite"]');
    await expect(live).toHaveCount(1);
    await expect(live).toHaveAttribute('role', 'status');
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toBeEmpty();
    // Метка на узле: после события текст должен оказаться в ЭТОМ же узле, а не в новом.
    await live.evaluate((node) => node.setAttribute('data-e2e-before', ''));

    const add = page.getByRole('button', { name: 'В корзину', exact: true });
    await add.click();

    const sameLive = page.locator('[data-toast-live="polite"][data-e2e-before]');
    await expect(sameLive).toHaveText(/^Добавлено в корзину: .+\s—\s1\sшт\.$/);
    await expect(page.locator('[data-toast-live="assertive"]')).toBeEmpty();

    // Видимое сообщение — без своей роли (не дублирует объявление), с действием.
    const region = page.getByRole('region', { name: 'Сообщения' });
    const message = region.locator('[data-surface="inverse"]');
    await expect(message).toHaveCount(1);
    await expect(message).toContainText('Добавлено в корзину');
    await expect(message).not.toHaveAttribute('role', /.+/);
    await expect(region.getByRole('link', { name: 'Перейти в корзину' })).toHaveAttribute(
      'href',
      '/cart',
    );
    // Фокус не уходит в сообщение.
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[aria-label="Сообщения"]')),
    ).toBe(false);

    // Закрытие сообщения убирает и объявление.
    await region.getByRole('button', { name: 'Закрыть сообщение' }).click();
    await expect(message).toHaveCount(0);
    await expect(sameLive).toBeEmpty();
  });
});

test.describe('Шапка', () => {
  test('ширина поиска не меняется после гидратации и после добавления в корзину', async ({
    browser,
    page,
  }) => {
    const ssr = await serverSearchWidth(browser, page, PRODUCT);

    await page.goto(PRODUCT);
    await waitForHydration(page);
    expect(await searchWidth(page)).toBeCloseTo(ssr, 1);

    await page.getByRole('button', { name: 'В корзину', exact: true }).click();
    const cartLink = page.locator('header').getByRole('link', { name: /^Корзина/ });
    await expect(cartLink).toHaveAttribute('aria-label', 'Корзина, 1 позиция');
    expect(await searchWidth(page)).toBeCloseTo(ssr, 1);

    await page
      .getByRole('button', { name: /в избранное$/ })
      .first()
      .click();
    await expect(page.locator('header').getByRole('link', { name: /^Избранное/ })).toHaveAttribute(
      'aria-label',
      'Избранное, 1 позиция',
    );
    expect(await searchWidth(page)).toBeCloseTo(ssr, 1);

    // Повторный визит: счётчики появляются при гидратации — поле той же ширины, что на сервере.
    await page.reload();
    await waitForHydration(page);
    await expect(cartLink).toHaveAttribute('aria-label', 'Корзина, 1 позиция');
    expect(await searchWidth(page)).toBeCloseTo(ssr, 1);
  });

  test('плейсхолдер поиска не обрезан', async ({ page }) => {
    for (const width of [1440, 1280, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await waitForHydration(page);
      const fits = () =>
        page.locator(SEARCH).evaluate((input: HTMLInputElement) => {
          const style = getComputedStyle(input);
          const context = document.createElement('canvas').getContext('2d')!;
          context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const room =
            input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          return context.measureText(input.placeholder).width <= room;
        });
      await expect.poll(fits, { message: `ширина ${width}` }).toBe(true);
    }
    // Полный текст DESIGN § R.5 — там, где помещается: на 1440 и на 390 (поле строкой под
    // шапкой); на 320 — короткий.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(SEARCH), `ширина ${width}`).toHaveAttribute(
        'placeholder',
        'Модель, частота, разъём или код',
      );
    }
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(page.locator(SEARCH)).toHaveAttribute('placeholder', 'Модель, частота или разъём');
  });

  test('ориентиры: nav и search с уникальными именами, баннер в ориентире', async ({ page }) => {
    await page.goto('/');
    const names = await page.evaluate(() => {
      const visible = (el: Element) => el.getClientRects().length > 0;
      const name = (el: Element) => {
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) return document.getElementById(labelledBy)?.textContent?.trim() ?? '';
        return el.getAttribute('aria-label') ?? '';
      };
      return {
        nav: [...document.querySelectorAll('nav')].filter(visible).map(name),
        search: [...document.querySelectorAll('[role="search"]')].filter(visible).map(name),
      };
    });
    for (const list of [names.nav, names.search]) {
      expect(list.every((label) => label !== '')).toBe(true);
      expect(new Set(list).size).toBe(list.length);
    }
    const banner = page.getByRole('region', { name: 'Демонстрационная версия' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Демо');
  });
});

test.describe('Демо-баннер', () => {
  for (const width of [390, 320]) {
    test(`на ${width} — одна строка, полный текст по «Подробнее»`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const banner = page.getByRole('region', { name: 'Демонстрационная версия' });
      const summary = banner.locator('summary');
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('Ничего не отправляется');
      await expect(summary).toContainText('Подробнее'); // на 320 — только для скринридера
      // Одна строка: строка «Демо» (24 px) + отступы 2 × 8 + рамка; без горизонтальной прокрутки.
      expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(42);
      expect((await summary.boundingBox())!.height).toBeLessThanOrEqual(24);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);

      const full = banner
        .locator('details')
        .getByText(/только в этом браузере и никуда не отправляются/);
      await expect(full).toBeHidden();
      await summary.click();
      await expect(full).toBeVisible();
      await expect(summary).toHaveAccessibleName(/Подробнее/);
    });
  }

  test('на ≥ md — полный текст сразу', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    const banner = page.getByRole('region', { name: 'Демонстрационная версия' });
    await expect(banner.locator('summary')).toBeHidden();
    await expect(banner.locator(':scope > div > p')).toHaveText(
      /^Демонстрационная версия витрины: заявки, вход и оплата .+ никуда не отправляются\.$/,
    );
    await expect(banner.locator(':scope > div > p')).toBeVisible();
  });
});

test.describe('SkipLink', () => {
  for (const path of MAIN_PAGES) {
    test(`${path}: первая по Tab, ведёт в main#content`, async ({ page }) => {
      await page.goto(path);
      await waitForHydration(page);
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Перейти к содержимому' });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.locator('main#content')).toBeFocused();
      await expect(page.locator('main')).toHaveCount(1);
    });
  }
});

test.describe('Заголовки, адрес сайта, разметка', () => {
  test('без X-Powered-By; CSP frame-ancestors и X-Frame-Options', async ({ request }) => {
    const response = await request.get('/contacts');
    const headers = response.headers();
    expect(headers['x-powered-by']).toBeUndefined();
    expect(headers['content-security-policy']).toBe("frame-ancestors 'self'");
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  test('canonical, og:url, og:image и sitemap — на одной базе', async ({ page, request }) => {
    await page.goto('/contacts');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(canonical).toMatch(/^https?:\/\/[^/]+.*\/contacts$/);
    const base = canonical!.replace(/\/contacts$/, '');
    expect(ogUrl).toBe(canonical);
    expect(ogImage).toBe(`${base}/brand/logo-mark-512.png`);

    const sitemap = await (await request.get('/sitemap.xml')).text();
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs.length).toBeGreaterThan(10);
    expect(locs.every((loc) => loc.startsWith(`${base}/`))).toBe(true);

    // Сборка с NEXT_PUBLIC_SITE_URL: ссылки ведут на него, а не на localhost:3000.
    const expected = process.env.NEXT_PUBLIC_SITE_URL;
    if (expected) {
      expect(base).toBe(expected.replace(/\/+$/, ''));
      expect(canonical).not.toContain('localhost:3000');
    }
  });

  test('индекс подсказок не встроен в разметку — грузится с /api/search-index', async ({
    request,
  }) => {
    const html = await (await request.get('/contacts')).text();
    expect(html).not.toMatch(/antenna-tip\d/);
    expect(html).not.toContain('slugPath');
    const index = await request.get('/api/search-index');
    expect(index.ok()).toBe(true);
    const data = (await index.json()) as { products: unknown[]; categories: unknown[] };
    expect(data.products.length).toBeGreaterThan(0);
  });
});
