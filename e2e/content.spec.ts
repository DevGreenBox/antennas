import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Контентные и служебные страницы: контакты, доставка, документы, отчёт импорта, логотип
 * (DESIGN §2.17–2.21).
 *
 * Прогон против dev-сервера: E2E_BASE_URL=http://localhost:3300 npx playwright test e2e/content.spec.ts
 * Next 16 в режиме dev отдаёт свои dev-ресурсы только хостам из allowedDevOrigins (localhost —
 * всегда). С другого хоста страница не гидратируется: разметка есть, а фильтры таблицы на
 * /import-report не работают — тесты фильтров тогда падают с подсказкой HYDRATION_HINT.
 */

const PAGES = [
  { path: '/contacts', h1: 'Контакты' },
  { path: '/delivery', h1: 'Доставка и оплата' },
  { path: '/legal/privacy', h1: 'Политика обработки персональных данных' },
  { path: '/legal/terms', h1: 'Пользовательское соглашение' },
  { path: '/legal/consent', h1: 'Согласие на обработку персональных данных' },
  { path: '/import-report', h1: 'Отчёт импорта каталога' },
  { path: '/brand', h1: 'Логотип: построение' },
] as const;

const LEGAL_PAGES = PAGES.filter((page) => page.path.startsWith('/legal/'));

const HYDRATION_HINT =
  'таблица не отфильтровалась: страница не гидратирована. Если прогон идёт против next dev, ' +
  'хост должен быть localhost или указан в allowedDevOrigins';

async function robotsContent(page: Page): Promise<string> {
  return (await page.locator('meta[name="robots"]').getAttribute('content')) ?? '';
}

test.describe('контентные страницы', () => {
  for (const { path, h1 } of PAGES) {
    test(`${path} отдаёт 200 и один h1 «${h1}»`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(h1);
    });
  }

  for (const path of ['/import-report', '/brand']) {
    test(`${path} — служебная: meta robots noindex`, async ({ page }) => {
      await page.goto(path);
      expect(await robotsContent(page)).toContain('noindex');
      await expect(page.getByText('Служебная страница', { exact: true })).toBeVisible();
    });
  }

  test('контакты: Telegram https://t.me/svyaz987 открывается в новой вкладке', async ({ page }) => {
    await page.goto('/contacts');
    const links = page.locator('main a[href="https://t.me/svyaz987"]');
    await expect(links.first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Написать в Telegram/ })).toHaveAttribute(
      'target',
      '_blank',
    );
    await expect(page.locator('main')).toContainText('Реквизиты будут добавлены');
    // Формы обратной связи нет — отправлять её некуда (DESIGN §2.17).
    await expect(page.locator('main form')).toHaveCount(0);
  });

  test('доставка: процесс из трёх шагов, без тарифов и выбранного перевозчика', async ({
    page,
  }) => {
    await page.goto('/delivery');
    const main = page.locator('main');
    await expect(page.locator('#process ol > li')).toHaveCount(3);
    await expect(main).toContainText('рассчитывает менеджер');
    await expect(main).toContainText('Способы оплаты будут указаны');
    // Ни одной суммы доставки: рублей на странице нет вовсе.
    expect(await main.innerText()).not.toMatch(/\d\s?₽/);
    await expect(main.getByText('Уточняется', { exact: true })).toHaveCount(3);
  });

  for (const { path } of LEGAL_PAGES) {
    test(`${path}: без ИНН-подобных номеров, «Реквизиты будут добавлены»`, async ({ page }) => {
      await page.goto(path);
      const text = await page.locator('body').innerText();
      // ИНН — 10 или 12 цифр подряд (ОГРН — 13, ОГРНИП — 15): таких чисел быть не должно.
      expect(text).not.toMatch(/(?<!\d)(\d{10}|\d{12,15})(?!\d)/);
      await expect(page.locator('main')).toContainText('Реквизиты будут добавлены');
      expect(await page.getByTestId('requisites-pending').count()).toBeGreaterThan(0);
      await expect(page.locator('main')).toContainText('Текст готовится');
      expect(await robotsContent(page)).toContain('noindex');
    });
  }
});

test.describe('отчёт импорта', () => {
  test('сводка: 113 / 19 = 132 строки, 118 товаров', async ({ page }) => {
    await page.goto('/import-report');
    await expect(page.getByTestId('rows-sheet-1')).toHaveText('113');
    await expect(page.getByTestId('rows-sheet-2')).toHaveText('19');
    await expect(page.getByTestId('rows-total')).toHaveText('132');
    await expect(page.getByTestId('products-created')).toHaveText('118');
    await expect(page.locator('main')).toContainText(
      'Временная витрина = лист 1 + уникальные позиции листа 2',
    );
  });

  test('таблица: все 146 строк, фильтр «Лист 2» оставляет 19 товарных', async ({ page }) => {
    await page.goto('/import-report');
    const rows = page.locator('#source-records tbody tr');
    await expect(rows).toHaveCount(146);
    await expect(page.locator('#source-records tbody tr[data-kind="product"]')).toHaveCount(132);

    await page.getByLabel('Лист', { exact: true }).selectOption('2');
    await expect(page, HYDRATION_HINT).toHaveURL(/[?&]sheet=2\b/);
    await expect(rows).toHaveCount(23);
    await expect(page.locator('#source-records tbody tr[data-kind="product"]')).toHaveCount(19);
    await expect(page.locator('#source-records tbody tr[data-sheet="1"]')).toHaveCount(0);
    await expect(page.getByTestId('source-counter')).toContainText('товарных: 19');

    // Состояние в URL: перезагрузка сохраняет фильтр.
    await page.reload();
    await expect(page.locator('#source-records tbody tr[data-kind="product"]')).toHaveCount(19);
  });

  test('исходный текст буквально: хвостовой пробел 1!B13 сохранён', async ({ page }) => {
    await page.goto('/import-report');
    const cell = page.locator('#s1-B13 td').nth(3);
    expect(await cell.textContent()).toBe('Тип10 рупорная (2000-3000, КУ=19 дБи, N-мама) ');
  });

  test('конфликт Тип1: цена 13 000 на листе 1 и 12 000 на листе 2, расхождение отмечено', async ({
    page,
  }) => {
    await page.goto('/import-report');
    const article = page.locator('#issue-sheet-conflict-s1-B4');
    await expect(article).toBeVisible();
    const priceRow = article.locator('tr', { has: page.locator('th', { hasText: 'Цена' }) });
    await expect(priceRow).toContainText(/13[\s ]000/);
    await expect(priceRow).toContainText(/12[\s ]000/);
    await expect(priceRow).toHaveAttribute('data-differs', 'true');
    await expect(priceRow).toContainText('≠');
  });

  test('повторы E49–E52: фактические пары E44, E46, E47, E48', async ({ page }) => {
    await page.goto('/import-report');
    const pairs = page.getByTestId('duplicate-pair');
    await expect(pairs).toHaveCount(4);
    const text = (await pairs.allInnerTexts()).join('\n');
    for (const [duplicate, original] of [
      ['E49', 'E44'],
      ['E50', 'E46'],
      ['E51', 'E47'],
      ['E52', 'E48'],
    ]) {
      expect(text).toMatch(new RegExp(`1!${duplicate}\\s+1!${original}`));
    }
    await expect(page.locator('#duplicates')).toContainText('Поправка к ТЗ');
  });

  test('чип ячейки ведёт к строке, даже если она скрыта фильтром', async ({ page }) => {
    await page.goto('/import-report?sheet=1');
    await expect(page.locator('#s2-C4'), HYDRATION_HINT).toHaveCount(0);
    await page
      .locator('#issue-sheet-conflict-s1-B4')
      .getByRole('link', { name: /лист 2, C4/ })
      .click();
    await expect(page.locator('#s2-C4')).toBeInViewport();
    await expect(page).not.toHaveURL(/sheet=/);
  });
});

test.describe('логотип', () => {
  test('/brand: все изображения загружаются без ошибок, файлы скачиваются', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
    });
    await page.goto('/brand');

    const images = page.locator('main img');
    expect(await images.count()).toBeGreaterThanOrEqual(5);
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);
    }
    // Знак в размерах: 5 полных (24–128 px) + 2 тона + 1 в «Малых размерах».
    await expect(page.locator('main svg[role="img"]')).toHaveCount(8);

    for (const href of await page
      .locator('main a[download]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))) {
      const response = await page.request.get(href);
      expect(response.status(), href).toBe(200);
    }
    expect(failed).toEqual([]);
    await expect(page.locator('main')).toContainText('#FA9506');
  });
});
