import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Страница товара и главная (DESIGN §2.2, §2.6, §8). Прогоняется в обоих проектах
 * playwright.config.ts (desktop 1440 и mobile Pixel 7).
 *
 * Данные — реальные позиции прайса (src/data/products.generated.json): Тип1 (конфликт листов),
 * Тип7 (единица частоты принята по контексту), Тип8 (неоднозначный разъём), «египетская сила»
 * (цена по запросу), мачта, МШУ «6000–8000 ГГц» (спорная единица), Тип2 ↔ чехол Тип2 и
 * чехол Тип7 → Тип7 (черновые связи из названия прайса).
 */

/** Пробелы схлопываются (в т. ч. неразрывные U+00A0 из форматтеров цены и единиц). */
const squash = (text: string) => text.replace(/\s+/g, ' ');

/** Ошибки и предупреждения консоли, кроме недоступного HMR-сокета dev-сервера. */
function collectConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (message.text().includes('/_next/hmr')) return;
    messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}

async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'load' });
  expect(response?.status()).toBe(200);
}

/**
 * Дождаться гидратации: React повесил обработчики на кнопку в main. Нужно перед проверкой консоли
 * (предупреждения о расхождении разметки приходят при гидратации) и перед кликами.
 *
 * Против `next dev` базовый адрес — `http://localhost:…`: с `127.0.0.1` Next 16 блокирует
 * dev-ресурсы чужого origin (allowedDevOrigins), и страница не гидратируется вовсе.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('main button');
    return button !== null && Object.keys(button).some((key) => key.startsWith('__react'));
  });
  // Эффекты после гидратации (чтение корзины из localStorage) — следующим кадром.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

/** Раскрыть все <details> (источники значений, строки прайса) — чтобы проверять весь текст. */
async function expandAll(page: Page) {
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) details.open = true;
  });
}

async function visibleText(page: Page): Promise<string> {
  return squash(await page.locator('body').innerText());
}

/** Строка таблицы характеристик по подписи. */
function specRow(page: Page, label: string): Locator {
  return page
    .getByTestId('spec-table')
    .locator('tr', { has: page.locator('th', { hasText: new RegExp(`^${label}$`) }) });
}

/** Описание страницы: meta description и og:description (пробелы схлопнуты). */
async function descriptions(page: Page) {
  const read = async (selector: string) =>
    squash((await page.locator(selector).getAttribute('content')) ?? '');
  return {
    description: await read('meta[name="description"]'),
    og: await read('meta[property="og:description"]'),
  };
}

/**
 * Сдвиг базовой линии значения относительно подписи в строках таблицы характеристик, px.
 * Пустой inline-block стоит на базовой линии: его верх и есть она.
 */
async function specBaselineOffsets(page: Page): Promise<number[]> {
  return page.getByTestId('spec-table').evaluate((table) => {
    const baseline = (element: Element) => {
      const marker = document.createElement('span');
      marker.style.cssText = 'display:inline-block;width:0;height:0';
      element.insertBefore(marker, element.firstChild);
      const y = marker.getBoundingClientRect().top;
      marker.remove();
      return y;
    };
    return [...table.querySelectorAll('tr')].map((row) => {
      const label = row.querySelector('th');
      const value = row.querySelector('td span');
      return label && value ? baseline(value) - baseline(label) : Number.NaN;
    });
  });
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.map((text) => JSON.parse(text) as Record<string, unknown>);
}

test.describe('Товар', () => {
  test('Тип1: характеристики, цена и код из листа 1, значений листа 2 нет', async ({ page }) => {
    const consoleMessages = collectConsole(page);
    await open(page, '/product/antenna-tip1');
    await waitForHydration(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Антенна логопериодическая Тип1',
    );
    await expect(page.getByTestId('product-code')).toHaveText('ANT-001');
    await expect(
      page.getByText('Внутренний код магазина, не артикул производителя.'),
    ).toBeVisible();

    const frequency = page.getByTestId('product-frequency');
    await expect(frequency).toContainText('700–1100 МГц');
    await expect(frequency.locator('.band-scale')).toHaveCount(1);
    await expect(specRow(page, 'КУ')).toContainText('12 дБи');
    await expect(specRow(page, 'Разъём')).toContainText('N-female');
    await expect(page.getByTestId('product-price')).toContainText('13 000 ₽');
    await expect(page.getByTestId('product-price')).toContainText(
      'Окончательную стоимость подтвердит менеджер',
    );

    // Конфликт листов: только пометка, без значений листа 2 («КУ=10 дБ», 12 000).
    await expect(page.getByText('Данные позиции уточняются')).toBeVisible();
    await expandAll(page);
    await expect(page.locator('#source-rows summary')).toHaveText('Строки прайса (1)');
    const text = await visibleText(page);
    expect(text).not.toContain('12 000');
    expect(text).not.toContain('12000');
    expect(text).not.toMatch(/10 дБ/);
    const html = await page.content();
    expect(html).not.toContain('КУ=10 дБ');
    expect(html).not.toContain('12000');

    expect(consoleMessages).toEqual([]);
  });

  test('«египетская сила»: цена по запросу добавляется в корзину', async ({ page }) => {
    const consoleMessages = collectConsole(page);
    await open(page, '/product/antenna-egipetskaya-sila');
    await waitForHydration(page);

    await expect(page.getByTestId('product-price')).toContainText('Цена по запросу');
    await expect(page.getByTestId('product-price')).toContainText(
      'Стоимость уточнит менеджер после заявки.',
    );
    await expect(page.getByTestId('product-price')).not.toContainText('0 ₽');

    const cartLink = page.locator('header').getByRole('link', { name: /^Корзина/ });
    await expect(cartLink).toHaveAttribute('aria-label', 'Корзина');

    const quantity = page.getByRole('textbox', { name: /^Количество:/ });
    await page.getByRole('button', { name: 'Увеличить количество' }).click();
    await expect(quantity).toHaveValue('2');

    const addButton = page.getByRole('button', { name: 'В корзину', exact: true });
    await addButton.click();
    await expect(cartLink).toHaveAttribute('aria-label', 'Корзина, 1 позиция');
    const status = page.getByTestId('product-in-cart');
    await expect(status).toContainText('В корзине: 2 шт.');
    await expect(status.getByRole('link', { name: 'Перейти в корзину' })).toHaveAttribute(
      'href',
      '/cart',
    );

    // Повторное «В корзину» прибавляет выбранное количество к лежащему.
    await addButton.click();
    await expect(status).toContainText('В корзине: 4 шт.');
    await expect(cartLink).toHaveAttribute('aria-label', 'Корзина, 1 позиция');

    expect(consoleMessages).toEqual([]);
  });

  test('мачта: высота, масса, нагрузка и цена', async ({ page }) => {
    await open(page, '/product/mast-carbon-12m');
    await expect(specRow(page, 'Высота')).toContainText('12 м');
    await expect(specRow(page, 'Масса')).toContainText('6 кг');
    await expect(specRow(page, 'Допустимая нагрузка')).toContainText('до 12 кг');
    await expect(specRow(page, 'Материал')).toContainText('Карбон');
    await expect(page.getByTestId('product-price')).toContainText('98 000 ₽');
    // Частоты у мачты нет — нет ни блока, ни шкалы; рекомендаций нет — нет и блока.
    await expect(page.getByTestId('product-frequency')).toHaveCount(0);
    await expect(page.getByTestId('recommendations')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'К этому товару подойдёт' })).toHaveCount(0);
  });

  test('Тип7: единица частоты принята по контексту — сноска', async ({ page }) => {
    await open(page, '/product/antenna-tip7');
    const frequency = page.getByTestId('product-frequency');
    await expect(frequency).toContainText('3100–4500 МГц*');
    await expect(frequency).toContainText('* Единица не указана в прайсе, принята по контексту.');
    await expect(frequency.locator('.band-scale__fill[data-status="inferred"]')).toHaveCount(1);
    await expect(specRow(page, 'Частотный диапазон')).toContainText(
      '(единица принята по контексту)',
    );
  });

  test('Тип8: разъём «Уточняется»', async ({ page }) => {
    await open(page, '/product/antenna-tip8');
    const connector = specRow(page, 'Разъём');
    await expect(connector).toContainText('N/sma-мама');
    await expect(connector).toContainText('Уточняется');
    await expect(connector).toContainText('Неоднозначно: N или SMA');
  });

  test('МШУ 6000–8000 ГГц: частота уточняется, шкалы нет', async ({ page }) => {
    await open(page, '/product/lna-6000-8000-10db');
    const frequency = page.getByTestId('product-frequency');
    await expect(frequency).toContainText('6000–8000 ГГц');
    await expect(frequency).toContainText('Уточняется');
    await expect(page.locator('.band-scale')).toHaveCount(0);
  });

  test('происхождение: общая строка прайса — один раз, раскрывается с клавиатуры', async ({
    page,
  }) => {
    await open(page, '/product/antenna-tip1');
    // Все значения Тип1 — из строки B4: под значениями «Источник» не повторяется.
    await expect(page.getByTestId('spec-table').locator('summary')).toHaveCount(0);
    const shared = page.getByTestId('spec-source');
    const summary = shared.locator('summary');
    await expect(summary).toHaveText('Источник всех значений: лист 1, B4');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(shared).toHaveAttribute('open', '');
    await expect(shared).toContainText('Тип1 логопериодическая (700-1100 МГц, КУ=12 дБи, N-мама)');
    await expect(shared).toContainText('КУ: «КУ=12 дБи»');
    await expect(shared).toContainText('Из строки прайса');

    // Значение из заголовка группы — со своим источником под ним, остальные — общим блоком.
    await open(page, '/product/mast-carbon-12m');
    await expect(page.getByTestId('spec-table').locator('summary')).toHaveCount(1);
    const material = specRow(page, 'Материал').locator('summary');
    await expect(material).toHaveText('Источник: лист 1, B34');
    await material.focus();
    await page.keyboard.press('Enter');
    await expect(specRow(page, 'Материал').locator('details')).toHaveAttribute('open', '');
    await expect(page.getByTestId('spec-source').locator('summary')).toHaveText(
      'Источник остальных значений: лист 1, B35',
    );
  });

  test('характеристики: подпись и значение на одной базовой линии', async ({ page }) => {
    for (const path of ['/product/antenna-tip1', '/product/antenna-tip8']) {
      await open(page, path);
      for (const offset of await specBaselineOffsets(page)) {
        expect(Math.abs(offset), path).toBeLessThan(0.5);
      }
    }
  });

  test('ряд покупки: количество, «В корзину» и закладка — одна высота 48 px, одна строка', async ({
    page,
  }, testInfo) => {
    await open(page, '/product/antenna-tip1');
    await waitForHydration(page);
    const row = [
      // Рамка — у обёртки поля: она и есть видимый край селектора.
      page.getByRole('textbox', { name: /^Количество:/ }).locator('..'),
      page.getByRole('button', { name: 'В корзину', exact: true }),
      page.getByRole('button', { name: 'Добавить в избранное' }),
    ];
    const widths = testInfo.project.name === 'desktop' ? [1440, 1024] : [null];
    for (const width of widths) {
      if (width !== null) await page.setViewportSize({ width, height: 900 });
      const boxes = await Promise.all(row.map((element) => element.boundingBox()));
      const [first] = boxes;
      for (const box of boxes) {
        expect(box, `ширина ${width ?? 'mobile'}`).not.toBeNull();
        expect(box!.height, `ширина ${width ?? 'mobile'}`).toBe(48);
        expect(box!.y, `ширина ${width ?? 'mobile'}`).toBe(first!.y);
      }
    }
  });

  test('без фото: на мобильном — значок, на десктопе — заглушка 4:3 и липкая', async ({
    page,
  }, testInfo) => {
    await open(page, '/product/antenna-tip1');
    const media = page.getByTestId('product-media');
    if (testInfo.project.name === 'mobile') {
      // Большой заглушки нет — название и цена на первом экране.
      await expect(media).toBeHidden();
      const price = await page.getByTestId('product-price').boundingBox();
      expect(price!.y + price!.height).toBeLessThan(page.viewportSize()!.height);
      return;
    }
    const placeholder = media.getByRole('img', { name: 'Фото товара пока нет' });
    await expect(placeholder).toBeVisible();
    const box = await placeholder.boundingBox();
    expect(Math.abs(box!.width / box!.height - 4 / 3)).toBeLessThan(0.02);
    expect(await placeholder.evaluate((el) => getComputedStyle(el.parentElement!).position)).toBe(
      'sticky',
    );
  });

  test('description и og:description: единица «по контексту» и спорные значения — не как факт', async ({
    page,
  }) => {
    await open(page, '/product/antenna-tip7');
    let meta = await descriptions(page);
    expect(meta.description).toContain('3100–4500 МГц (единица уточняется)');
    expect(meta.og).toBe(meta.description);

    // Тип8: разъём «N/sma-мама» спорный — в описание не попадает.
    await open(page, '/product/antenna-tip8');
    meta = await descriptions(page);
    expect(meta.description).not.toContain('sma-мама');
    expect(meta.description).toContain('4500–6400 МГц (единица уточняется)');
    expect(meta.og).toBe(meta.description);

    // Канальный фильтр: «МГц» принята по контексту.
    await open(page, '/product/bandpass-filter-136-174-n-female');
    expect((await descriptions(page)).description).toContain('136–174 МГц (единица уточняется)');

    // Подтверждённые значения — как есть.
    await open(page, '/product/antenna-tip1');
    expect((await descriptions(page)).description).toBe(
      'Антенна логопериодическая Тип1. 700–1100 МГц, 12 дБи, N-female. Цена 13 000 ₽. Код в каталоге ANT-001.',
    );
  });

  test('пометки из прайса: пометка строки и групповое примечание', async ({ page }) => {
    await open(page, '/product/bandpass-filter-6100-6500');
    const notes = page.getByTestId('product-notes');
    await expect(notes).toContainText('Примечание к группе:');
    await expect(notes).toContainText('(лист 1, E57)');
    await expect(notes).toContainText('в характеристики не перенесено');
    // Строка-повтор E49 показана как повтор.
    await expandAll(page);
    await expect(page.locator('#source-rows summary')).toHaveText('Строки прайса (2)');
    await expect(page.locator('#source-rows')).toContainText('Повтор — объединён с основной');

    await open(page, '/product/cable-1m-sma-m-straight-n-m-rg142');
    await expect(page.getByTestId('product-notes')).toContainText(
      '„под рупор !“ — лист 1, B57. Смысл пометки уточняется.',
    );
  });

  test('рекомендации: Тип2 ↔ чехол Тип2 — черновые, с пометкой «Демо»', async ({ page }) => {
    await open(page, '/product/antenna-tip2');
    const block = page.getByTestId('recommendations');
    await expect(block.getByRole('heading', { name: 'К этому товару подойдёт' })).toBeVisible();
    await expect(block.getByTestId('recommendations-drafts')).toContainText('Демо');
    await expect(block).toContainText('Черновая связь из названия позиции в прайсе.');
    await expect(block.getByRole('link', { name: 'Чехол для антенны Тип2' })).toHaveAttribute(
      'href',
      '/product/cover-tip2',
    );
    await expect(block.locator('a[href="/product/antenna-tip2"]')).toHaveCount(0);

    await open(page, '/product/cover-tip2');
    const back = page.getByTestId('recommendations');
    await expect(back).toContainText('Демо');
    await expect(back.getByRole('link', { name: 'Антенна логопериодическая Тип2' })).toBeVisible();
    await expect(back.locator('a[href="/product/cover-tip2"]')).toHaveCount(0);
  });

  test('рекомендации: у значения «*» есть сноска, цели нажатия на мобильном — 44', async ({
    page,
  }, testInfo) => {
    await open(page, '/product/cover-tip7');
    const block = page.getByTestId('recommendations');
    await expect(block).toContainText('3100–4500 МГц*');
    await expect(block.getByTestId('recommendations-footnote')).toHaveText(
      '* Единица не указана в прайсе, принята по контексту.',
    );
    if (testInfo.project.name === 'mobile') {
      for (const name of [/^В корзину/, /^Добавить «.+» в избранное$/]) {
        const box = await block.getByRole('button', { name }).first().boundingBox();
        expect(box!.height, String(name)).toBeGreaterThanOrEqual(44);
        expect(box!.width, String(name)).toBeGreaterThanOrEqual(44);
      }
    }

    // Нет «*» — нет и сноски.
    await open(page, '/product/antenna-tip2');
    await expect(page.getByTestId('recommendations')).toBeVisible();
    await expect(page.getByTestId('recommendations-footnote')).toHaveCount(0);
  });

  test('JSON-LD: Product без availability, у «по запросу» нет цены', async ({ page }) => {
    await open(page, '/product/antenna-tip1');
    let data = await jsonLd(page);
    let product = data.find((item) => item['@type'] === 'Product');
    expect(product).toMatchObject({ name: 'Антенна логопериодическая Тип1', sku: 'ANT-001' });
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('availability');
    for (const key of ['brand', 'mpn', 'image', 'aggregateRating', 'review']) {
      expect(product).not.toHaveProperty(key);
    }
    expect(data.some((item) => item['@type'] === 'BreadcrumbList')).toBe(true);

    await open(page, '/product/antenna-egipetskaya-sila');
    data = await jsonLd(page);
    product = data.find((item) => item['@type'] === 'Product');
    expect(product).toBeDefined();
    expect(product).not.toHaveProperty('offers');
    expect(JSON.stringify(product)).not.toMatch(/"price"/);
    expect(JSON.stringify(data)).not.toContain('availability');
  });

  test('неизвестный товар — 404', async ({ page }) => {
    const response = await page.goto('/product/nope');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Страница не найдена');
  });

  test('адрес с «%» в slug — 404, а не 500', async ({ request }) => {
    // Next 16.3 отвечал 500: матчер манифеста пререндера раскодирует путь повторно
    // («/product/a%» → DecodeError). Защита — src/proxy.ts: slug не по формату каталога → 404.
    for (const path of ['/product/%25', '/product/a%25', '/product/antenna-tip1%25']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
    }
  });

  test('без горизонтальной прокрутки', async ({ page }) => {
    for (const path of [
      '/product/antenna-tip1',
      '/product/cable-15cm-sma-m-straight-sma-m-straight-rg316-rg142',
      '/product/cavity-filter-1060-1360',
    ]) {
      await open(page, path);
      await expandAll(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, path).toBe(false);
    }
  });
});

test.describe('Главная', () => {
  test('категории с количествами из данных: сумма = 118', async ({ page }) => {
    const consoleMessages = collectConsole(page);
    await open(page, '/');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Каталог антенн и радиооборудования',
    );
    const counts = await page
      .locator('main [data-category-tile]')
      .evaluateAll((tiles) => tiles.map((tile) => Number(tile.getAttribute('data-count'))));
    expect(counts.length).toBe(7);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(118);
    await expect(
      page.locator('main').getByRole('link', { name: /Весь каталог · 118 товаров/ }),
    ).toBeVisible();

    // Процесс — три настоящих шага, без «преимуществ».
    const steps = page.locator('main ol').first().locator(':scope > li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText('Заявка');
    await expect(steps.nth(1)).toContainText('Согласование');
    await expect(steps.nth(2)).toContainText('Оплата');

    expect(consoleMessages).toEqual([]);
  });

  test('малые плитки категорий: без пустых ячеек, одной высоты, количество на одной линии', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'ширины задаются вручную');
    for (const width of [1024, 768, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page, '/');
      const list = page.locator('main ul:has(> li[data-category-tile] > a)');
      const listBox = (await list.boundingBox())!;
      const tiles = await list.locator('> li > a').evaluateAll((links) =>
        links.map((link) => {
          const box = link.getBoundingClientRect();
          const count = link.lastElementChild!.getBoundingClientRect();
          return {
            x: box.x,
            y: box.y,
            right: box.right,
            height: box.height,
            count: count.bottom - box.y,
          };
        }),
      );
      expect(tiles.length, `ширина ${width}`).toBe(5);
      for (const tile of tiles) {
        expect(tile.height, `ширина ${width}: высоты плиток`).toBeCloseTo(tiles[0].height, 0);
        expect(tile.count, `ширина ${width}: количество`).toBeCloseTo(tiles[0].count, 0);
      }
      // Последняя плитка каждого ряда доходит до правого края сетки — пустых ячеек нет.
      const rows = new Map<number, number>();
      for (const tile of tiles)
        rows.set(Math.round(tile.y), Math.max(rows.get(Math.round(tile.y)) ?? 0, tile.right));
      for (const right of rows.values()) {
        expect(right, `ширина ${width}: край ряда`).toBeCloseTo(listBox.x + listBox.width, 0);
      }
    }
  });

  test('позиции: по одной из каждой категории', async ({ page }) => {
    await open(page, '/');
    const names = [
      'Антенна логопериодическая Тип1',
      'Чехол для антенны Тип2',
      'Мачта карбоновая 12 м',
      'МШУ 50–1000 МГц, 20 дБ, IP67, XT60',
      'Фильтр полосовой 136–174, N-female — N-female',
      'Аттенюатор 0–31 дБ, до 5 Вт',
    ];
    for (const name of names) {
      await expect(
        page.locator('main').getByRole('link', { name, exact: true }).filter({ visible: true }),
      ).toHaveCount(1);
    }
  });

  test('поиск с главной ведёт на /search', async ({ page }) => {
    await open(page, '/');
    const form = page.locator('main form[role="search"]');
    await form.getByRole('searchbox', { name: 'Поиск по каталогу' }).fill('Тип1');
    await form.getByRole('button', { name: 'Найти' }).click();
    await expect(page).toHaveURL(/\/search\?q=%D0%A2%D0%B8%D0%BF1$|\/search\?q=Тип1$/);
  });

  test('связь — ссылка на Telegram', async ({ page }) => {
    await open(page, '/');
    const link = page.locator('main').getByRole('link', { name: /Написать в Telegram/ });
    await expect(link).toHaveAttribute('href', 'https://t.me/svyaz987');
    await expect(link).toHaveAttribute('target', '_blank');
  });
});
