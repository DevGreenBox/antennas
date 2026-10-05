import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Каталог и поиск (ТЗ §14; DESIGN §2.3–2.7, §4). Проекты desktop (1440) и mobile (Pixel 7):
 * на desktop панель «Подбор по параметрам» — колонка слева и применяется сразу, на mobile —
 * Drawer «Параметры» с кнопкой «Показать N». Один и тот же сценарий проходит в обоих.
 *
 * Запуск по поднятому серверу: E2E_BASE_URL=http://localhost:3300 npx playwright test e2e/catalog.spec.ts
 */

/**
 * Выдача гидратирована: React навесил обработчики на заголовок выдачи. До этого клик по
 * чекбоксу на dev-сервере теряется — проверяем по служебному полю React на DOM-узле.
 */
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const heading = document.getElementById('results');
    return heading !== null && Object.keys(heading).some((key) => key.startsWith('__reactFiber'));
  });
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await hydrated(page);
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

/** Панель подбора: колонка (desktop) или открытый Drawer (mobile); apply — «Показать N». */
async function params(page: Page): Promise<{ panel: Locator; apply: () => Promise<void> }> {
  if (!isMobile(page)) {
    return {
      panel: page.getByRole('form', { name: 'Подбор по параметрам' }),
      apply: async () => {},
    };
  }
  await page.getByRole('button', { name: /^Параметры/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Подбор по параметрам' });
  await expect(dialog).toBeVisible();
  return {
    panel: dialog,
    apply: async () => {
      await dialog.getByRole('button', { name: /^Показать \d/ }).click();
      await expect(dialog).toBeHidden();
    },
  };
}

/** Счётчик результатов — единственный live-регион выдачи. */
const counter = (page: Page) => page.getByRole('status').filter({ hasText: 'Найдено' });

/** Ссылка на товар в выдаче (таблица, список или плитка — что видно на этой ширине). */
const item = (page: Page, name: string) =>
  page.getByRole('main').getByRole('link', { name, exact: true });

/** Названия товаров в выдаче по порядку. */
async function itemNames(page: Page): Promise<string[]> {
  const links = page.getByRole('main').locator('a[href^="/product/"]:visible');
  return (await links.allTextContents()).map((text) => text.trim());
}

const TIP1 = 'Антенна логопериодическая Тип1';
const TIP2 = 'Антенна логопериодическая Тип2';

test.describe('Частотный подбор (ТЗ §14)', () => {
  test('1000 МГц: Тип1 (700–1100) есть, Тип2 (360–980) нет', async ({ page }) => {
    await open(page, '/catalog/antennas');
    await expect(item(page, TIP2)).toBeVisible();

    const { panel, apply } = await params(page);
    const field = panel.getByLabel('Частота или диапазон, МГц');
    await field.fill('1000');
    await field.press('Enter');
    await apply();

    await expect(page).toHaveURL(/[?&]freq=1000(&|$)/);
    await expect(item(page, TIP1)).toBeVisible();
    await expect(item(page, TIP2)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Убрать: Частота: 1000 МГц' })).toBeVisible();

    // Только подтверждённые значения: Тип1 и Тип2 подтверждены — результат тот же.
    await page.goto('/catalog/antennas?freq=1000&strict=1');
    await expect(item(page, TIP1)).toBeVisible();
    await expect(item(page, TIP2)).toHaveCount(0);
  });

  test('границы включительно: 700 и 1100', async ({ page }) => {
    await page.goto('/catalog/antennas?freq=700');
    await expect(item(page, TIP1)).toBeVisible();
    await expect(item(page, TIP2)).toBeVisible();

    await page.goto('/catalog/antennas?freq=1100');
    await expect(item(page, TIP1)).toBeVisible();
    await expect(item(page, TIP2)).toHaveCount(0);

    await page.goto('/catalog/antennas?freq=699');
    await expect(item(page, TIP2)).toBeVisible();
    await expect(item(page, TIP1)).toHaveCount(0);

    await page.goto('/catalog/antennas?freq=1101');
    await expect(counter(page)).toContainText('1 товар');
    await expect(item(page, TIP1)).toHaveCount(0);
  });

  test('режим «Покрывает весь диапазон» на диапазоне 900–1100', async ({ page }) => {
    await open(page, '/catalog/antennas?freq=900-1100');
    // Пересечение (по умолчанию): Тип2 (360–980) задевает 900–1100.
    await expect(item(page, TIP1)).toBeVisible();
    await expect(item(page, TIP2)).toBeVisible();

    const { panel, apply } = await params(page);
    await panel.getByRole('radio', { name: 'Покрывает весь диапазон' }).check();
    await apply();

    await expect(page).toHaveURL(/fmode=cover/);
    await expect(item(page, TIP1)).toBeVisible();
    await expect(item(page, TIP2)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Убрать: Частота: 900–1100 МГц, весь диапазон' }),
    ).toBeVisible();
  });
});

test.describe('Подбор по параметрам категорий', () => {
  test('МШУ: без IP67 не значит «нет IP67»; выбор IP67 оставляет 4', async ({ page }) => {
    await open(page, '/catalog/lna');
    await expect(counter(page)).toHaveText('Найдено: 9 товаров');

    const { panel, apply } = await params(page);
    // Опции «нет IP67» не существует: неизвестное значение не равно «нет».
    await expect(panel.getByText(/нет IP67|без IP67/i)).toHaveCount(0);
    // У одиночного флага — видимый заголовок группы, как у колонки таблицы.
    await expect(
      panel
        .getByRole('group', { name: 'Защита', exact: true })
        .getByText('Защита', { exact: true }),
    ).toBeVisible();
    await panel.getByRole('checkbox', { name: /^IP67/ }).check();
    // Позиции без указания IP67 не «отсеяны как без IP67» — панель говорит, что значение не указано.
    await expect(panel.getByText('У 5 товаров значение не указано')).toBeVisible();
    await apply();

    await expect(page).toHaveURL(/ip67=1/);
    await expect(counter(page)).toHaveText('Найдено: 4 товара');
    for (const name of await itemNames(page)) expect(name).toContain('IP67');

    await page.getByRole('button', { name: 'Убрать: IP67' }).click();
    await expect(counter(page)).toHaveText('Найдено: 9 товаров');
    await expect(page).not.toHaveURL(/ip67/);
  });

  test('кабели: концы по данным, сочетание, чип, «Сбросить всё», URL и перезагрузка', async ({
    page,
  }) => {
    await open(page, '/catalog/cables');
    await expect(counter(page)).toHaveText('Найдено: 9 товаров');

    const { panel, apply } = await params(page);
    for (const group of ['Разъём 1-го конца', 'Форма 1-го конца', 'Разъём 2-го конца']) {
      await expect(panel.getByRole('group', { name: group, exact: true })).toBeVisible();
    }
    await panel
      .getByRole('group', { name: 'Кабель', exact: true })
      .getByRole('checkbox', { name: /^RG-142/ })
      .check();
    await panel
      .getByRole('group', { name: 'Разъём 2-го конца', exact: true })
      .getByRole('checkbox', { name: /^N-male/ })
      .check();
    await apply();

    await expect(page).toHaveURL(/cable=rg-142/);
    await expect(page).toHaveURL(/end2=n-male/);
    await expect(counter(page)).toHaveText('Найдено: 2 товара');

    // Состояние живёт в URL — переживает перезагрузку.
    await page.reload();
    await hydrated(page);
    await expect(counter(page)).toHaveText('Найдено: 2 товара');
    await expect(page.getByRole('button', { name: 'Убрать: Кабель: RG-142' })).toBeVisible();

    // Снять один параметр чипом.
    await page.getByRole('button', { name: 'Убрать: Разъём 2-го конца: N-male' }).click();
    await expect(counter(page)).toHaveText('Найдено: 6 товаров');
    await expect(page).not.toHaveURL(/end2=/);
    await expect(page).toHaveURL(/cable=rg-142/);

    // «Сбросить всё» — в строке выбранных параметров.
    await page
      .getByRole('group', { name: 'Выбранные параметры' })
      .getByRole('button', { name: 'Сбросить всё' })
      .click();
    await expect(counter(page)).toHaveText('Найдено: 9 товаров');
    await expect(page).toHaveURL(/\/catalog\/cables$/);
  });

  test('сортировка по цене ставит «египетскую силу» (по запросу) в конец', async ({ page }) => {
    await open(page, '/catalog/antennas');
    const sort = page.getByRole('combobox', { name: 'Сортировка' });

    await sort.selectOption('price-asc');
    await expect(page).toHaveURL(/sort=price-asc/);
    let names = await itemNames(page);
    expect(names).toHaveLength(23);
    expect(names.at(-1)).toBe('Антенна «египетская сила»');

    await sort.selectOption('price-desc');
    await expect(page).toHaveURL(/sort=price-desc/);
    names = await itemNames(page);
    expect(names.at(-1)).toBe('Антенна «египетская сила»');
    expect(names[0]).not.toBe('Антенна «египетская сила»');
  });

  test('вид «Плитка» пишется в URL', async ({ page }) => {
    await open(page, '/catalog/covers');
    await page.getByRole('button', { name: 'Плитка' }).click();
    await expect(page).toHaveURL(/view=grid/);
    await expect(page.getByRole('main').getByRole('article').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Плитка' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('пагинация — ссылками, страница за пределами — на последнюю', async ({ page }) => {
    await open(page, '/catalog');
    await page
      .getByRole('navigation', { name: 'Страницы' })
      .getByRole('link', { name: /Вперёд/ })
      .click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator('#results')).toBeFocused();

    await page.goto('/catalog?page=99');
    await expect(page).toHaveURL(/page=5/);
  });
});

test.describe('URL без похода на сервер, фокус и клавиатура', () => {
  /**
   * Запросы RSC (навигация Next к серверу): заголовок `RSC: 1` или параметр `_rsc`.
   * Предзагрузка ссылок (`Next-Router-Prefetch: 1`) не в счёт: в production Next сам подгружает
   * страницы по видимым ссылкам — товары, корзину, разделы шапки, — и это не связано с подбором.
   */
  function watchRsc(page: Page): string[] {
    const requests: string[] = [];
    page.on('request', (request) => {
      const headers = request.headers();
      if (headers['next-router-prefetch'] === '1') return;
      if (headers['rsc'] === '1' || request.url().includes('_rsc=')) {
        requests.push(request.url());
      }
    });
    return requests;
  }

  test('подбор, сортировка и вид меняют URL без запросов RSC; ссылки страниц и «Назад» работают', async ({
    page,
  }) => {
    await open(page, '/catalog');
    const rsc = watchRsc(page);

    const { panel, apply } = await params(page);
    await panel.getByRole('checkbox', { name: /^Радиочастотные фильтры/ }).check();
    await apply();
    await expect(page).toHaveURL(/[?&]cat=rf-filters(&|$)/);
    await expect(counter(page)).toHaveText('Найдено: 71 товар');

    await page.getByRole('combobox', { name: 'Сортировка' }).selectOption('price-desc');
    await expect(page).toHaveURL(/sort=price-desc/);
    await page.getByRole('button', { name: 'Плитка' }).click();
    await expect(page).toHaveURL(/view=grid/);
    await expect(page.getByRole('main').getByRole('article').first()).toBeVisible();
    // Выдача считается в браузере — сервер для этих изменений не нужен.
    expect(rsc, 'RSC-запросы при смене подбора').toEqual([]);

    // Ссылка пагинации — обычный переход с параметрами подбора; «Назад» возвращает первую страницу.
    await page
      .getByRole('navigation', { name: 'Страницы' })
      .getByRole('link', { name: /Вперёд/ })
      .click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page).toHaveURL(/cat=rf-filters/);
    await expect(page.locator('#results')).toBeFocused();
    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/cat=rf-filters.*sort=price-desc.*view=grid/);
    await expect(counter(page)).toHaveText('Найдено: 71 товар');
  });

  test('сортировка на странице 2 не уводит фокус и прокрутку к выдаче', async ({ page }) => {
    await open(page, '/catalog?page=2');
    const sort = page.getByRole('combobox', { name: 'Сортировка' });
    await sort.focus();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await sort.selectOption('name');
    await expect(page).toHaveURL(/sort=name/);
    await expect(page).not.toHaveURL(/page=/);
    // Страница сменилась (2 → 1), но не по ссылке пагинации: фокус остаётся на сортировке.
    await expect(sort).toBeFocused();
    await expect(page.locator('#results')).not.toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test('панель подбора: невидимая кнопка отправки вне Tab, кольцо фокуса не обрезано', async ({
    page,
  }) => {
    test.skip(isMobile(page), 'колонка панели — только на ≥ lg');
    await open(page, '/catalog');
    const form = page.getByRole('form', { name: 'Подбор по параметрам' });
    const submit = form.getByRole('button', { name: 'Применить параметры' });
    await expect(submit).toHaveAttribute('tabindex', '-1');

    // Tab с последнего контрола панели уходит к видимому элементу, а не в sr-only кнопку.
    await form.getByRole('checkbox', { name: /Только подтверждённые/ }).focus();
    await page.keyboard.press('Tab');
    await expect(submit).not.toBeFocused();
    const size = await page.evaluate(() => {
      const rect = document.activeElement?.getBoundingClientRect();
      return rect ? rect.width * rect.height : 0;
    });
    expect(size).toBeGreaterThan(4);

    // Кольцо (outline 2 px + отступ 2 px) у чекбокса у левого края помещается в колонку с прокруткой.
    const checkbox = form.getByRole('checkbox', { name: /^Антенны/ });
    await checkbox.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(checkbox).toBeFocused();
    const clip = await checkbox.evaluate((input) => {
      const style = getComputedStyle(input);
      const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const box = input.getBoundingClientRect();
      const scroller = input.closest('form')!.getBoundingClientRect();
      return { ring, left: box.left - ring - scroller.left, top: box.top - ring - scroller.top };
    });
    expect(clip.ring).toBeGreaterThanOrEqual(4);
    expect(clip.left).toBeGreaterThanOrEqual(0);
    expect(clip.top).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Пустые состояния', () => {
  test('подбор без результатов предлагает сбросить параметры', async ({ page }) => {
    await open(page, '/catalog/antennas?freq=20000');
    await expect(counter(page)).toHaveText('Найдено: 0 товаров');
    const heading = page.getByRole('heading', { name: 'Нет товаров с такими параметрами' });
    await expect(heading).toBeVisible();
    // Текст точен: спорная единица (ГГц) не участвует, «принято по контексту» — участвует без strict.
    await expect(
      page.getByText(
        'Значения частоты со спорной единицей (ГГц) в подбор не попадают; значения с единицей, принятой по контексту, учитываются, пока не включено «Только подтверждённые значения».',
      ),
    ).toBeVisible();

    await page
      .locator('div', { has: heading })
      .last()
      .getByRole('button', { name: 'Сбросить всё' })
      .click();
    await expect(counter(page)).toHaveText('Найдено: 23 товара');
  });

  test('неизвестная категория и чужая подкатегория — 404', async ({ page }) => {
    for (const url of ['/catalog/unknown', '/catalog/lna/horn', '/catalog/antennas/nope']) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(404);
      await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
    }
  });
});

test.describe('Поиск', () => {
  test('«тип 1» находит Тип1, но не Тип10–14', async ({ page }) => {
    await open(page, `/search?q=${encodeURIComponent('тип 1')}`);
    await expect(counter(page)).toHaveText('Найдено: 2 товара');
    await expect(item(page, TIP1)).toBeVisible();
    await expect(item(page, 'Чехол для антенны Тип1')).toBeVisible();
    await expect(page.getByRole('main').getByText(/Тип1[0-4]/)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Сортировка' })).toHaveValue('default');
    await expect(
      page.getByRole('combobox', { name: 'Сортировка' }).locator('option:checked'),
    ).toHaveText('По релевантности');
  });

  test('«М8» кириллицей находит мини-антенну M8', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent('М8')}`);
    await expect(counter(page)).toHaveText('Найдено: 1 товар');
    await expect(item(page, 'Мини-антенна M8')).toBeVisible();
  });

  test('поле в шапке: подсказки грузят индекс по фокусу, Enter ведёт на /search', async ({
    page,
  }) => {
    // Клик по ещё не гидратированной разметке под нагрузкой полного прогона терял фокус —
    // ждём гидратацию, как в остальных тестах файла.
    await open(page, '/catalog/masts');
    const box = page.getByRole('combobox', { name: 'Поиск по каталогу' });
    const indexResponse = page.waitForResponse('**/api/search-index');
    await box.click();
    expect((await indexResponse).status()).toBe(200);
    await box.fill('тип 1');
    await expect(
      page.getByRole('option', { name: /Антенна логопериодическая Тип1/ }),
    ).toBeVisible();
    await box.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=%D1%82%D0%B8%D0%BF(%20|\+)1/);
    await expect(counter(page)).toHaveText('Найдено: 2 товара');
  });

  test('пустой запрос — подсказка; ничего не найдено — советы', async ({ page }) => {
    await page.goto('/search');
    await expect(
      page.getByText('Введите название, модель, диапазон частот или разъём.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Тип1', exact: true })).toBeVisible();

    await page.goto('/search?q=zzzz');
    await expect(
      page.getByRole('heading', { name: 'По запросу «zzzz» ничего не найдено' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Перейти в каталог' })).toBeVisible();
  });

  test('запрос без слов (знаки, невидимые символы) — как пустой', async ({ page }) => {
    for (const q of ['. , -', '\u0000', '​']) {
      await page.goto(`/search?q=${encodeURIComponent(q)}`);
      await expect(
        page.getByText('Введите название, модель, диапазон частот или разъём.'),
        JSON.stringify(q),
      ).toBeVisible();
      await expect(counter(page)).toHaveCount(0);
    }
    // В категории — обычная выдача: без «Найдено» по поиску и без «По релевантности».
    await page.goto(`/catalog/antennas?q=${encodeURIComponent('📡')}`);
    await expect(counter(page)).toHaveText('Найдено: 23 товара');
    await expect(
      page.getByRole('combobox', { name: 'Сортировка' }).locator('option:checked'),
    ).toHaveText('По порядку прайса');
  });

  test('«10 дБ» — только дБ (МШУ), без мини-антенн с дБи', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent('10 дБ')}`);
    await expect(counter(page)).toHaveText('Найдено: 3 товара');
    for (const name of await itemNames(page)) expect(name).toMatch(/^МШУ .*10\s?дБ/);
    await expect(page.getByRole('main').getByRole('link', { name: /Мини-антенна/ })).toHaveCount(0);
  });

  test('индекс подсказок не встраивается в разметку страниц', async ({ request }) => {
    const index = await request.get('/api/search-index');
    expect(index.ok()).toBe(true);
    const data = (await index.json()) as { products: unknown[]; categories: unknown[] };
    expect(data.products.length).toBeGreaterThan(100);

    // На странице мачт (одна позиция) searchText встречается только у неё, а не у 118 товаров.
    const html = await (await request.get('/catalog/masts')).text();
    expect(html.split('searchText').length - 1).toBeLessThan(10);
  });
});

test.describe('Мобильная версия', () => {
  test('Drawer «Параметры»: черновик, «Показать N», Esc отбрасывает', async ({ page }) => {
    test.skip(!isMobile(page), 'Drawer — только на < lg');
    await open(page, '/catalog/lna');
    const trigger = page.getByRole('button', { name: /^Параметры/ });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Подбор по параметрам' });
    await dialog.getByRole('checkbox', { name: /^IP67/ }).check();
    // Черновик: выдача и адрес не меняются до «Показать».
    await expect(dialog.getByRole('button', { name: 'Показать 4 товара' })).toBeVisible();
    await expect(page).not.toHaveURL(/ip67/);

    await dialog.getByRole('button', { name: 'Показать 4 товара' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/ip67=1/);
    await expect(counter(page)).toHaveText('Найдено: 4 товара');
    await expect(page.getByRole('button', { name: 'Параметры, выбрано: 1' })).toBeFocused();

    // Закрытие без «Показать» отбрасывает черновик.
    await page.getByRole('button', { name: /^Параметры/ }).click();
    await dialog.getByRole('checkbox', { name: /^IP67/ }).uncheck();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/ip67=1/);
    await expect(counter(page)).toHaveText('Найдено: 4 товара');
  });

  test('нет горизонтальной прокрутки на 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of [
      '/catalog',
      '/catalog/antennas',
      '/catalog/antennas?view=grid',
      '/catalog/lna?ip67=1',
      '/catalog/rf-filters/bandpass',
      '/catalog/cables',
      `/search?q=${encodeURIComponent('тип 1')}`,
      '/search',
    ]) {
      await page.goto(url);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, url).toBeLessThanOrEqual(0);
    }
  });
});
