import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Сценарий «Заявка → Согласование → Оплата» (ТЗ §3, §8, §14; DESIGN §2.8–§2.16, §3).
 * Прогоняется в обоих проектах playwright.config.ts (desktop 1440 и mobile Pixel 7).
 *
 * Данные — реальные позиции прайса: «Антенна логопериодическая Тип1» (13 000 ₽) и «Антенна
 * «египетская сила»» (цена по запросу). Всё демо живёт в localStorage браузера; у каждого теста
 * свой контекст — хранилище пустое.
 *
 * Против `next dev` базовый адрес — `http://localhost:…`: с `127.0.0.1` Next 16 блокирует
 * dev-ресурсы чужого origin (allowedDevOrigins), и страница не гидратируется.
 */

const TIP1 = { slug: 'antenna-tip1', name: 'Антенна логопериодическая Тип1' };
/** Частота Тип7 — inferred («*»), МШУ — «6000–8000 ГГц» needs-review («Уточняется»). */
const TIP7 = { slug: 'antenna-tip7', name: 'Антенна рупорная Тип7' };
const LNA = { slug: 'lna-6000-8000-10db', name: 'МШУ 6000–8000 ГГц, 10 дБ' };
const EGYPT = { slug: 'antenna-egipetskaya-sila', name: 'Антенна «египетская сила»' };
const BUYER = 'buyer@example.ru';
const ORDER = 'DEMO-0001';
const ORDER_PATH = `/account/orders/${ORDER}`;

/** Значение `demoSession` в localStorage для email. */
const SESSION = (email: string) =>
  JSON.stringify({
    state: { session: { email, startedAt: '2026-10-05T10:00:00.000Z' } },
    version: 1,
  });

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

/** Дождаться гидратации: React повесил обработчики на кнопку в main. */
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('main button, main a[href]');
    return button !== null && Object.keys(button).some((key) => key.startsWith('__react'));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}

async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'load' });
  expect(response?.status()).toBe(200);
  await waitForHydration(page);
}

async function mainText(page: Page): Promise<string> {
  return squash(await page.getByRole('main').innerText());
}

/** Положить товар в корзину со страницы товара (основная кнопка, не рекомендации). */
async function addToCart(page: Page, slug: string) {
  await open(page, `/product/${slug}`);
  await page.getByRole('button', { name: 'В корзину', exact: true }).click();
  await expect(page.getByTestId('product-in-cart')).toContainText('В корзине');
}

/** Демо-данные заказов прямо из localStorage — проверка «ровно одна оплата». */
async function ordersData(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('antennas.demo.orders.v1');
    return raw === null ? null : JSON.parse(raw).state;
  }) as Promise<{
    orders: {
      number: string;
      status: string;
      payments: { status: string }[];
      quotes: { version: number; status: string }[];
      events: { type: string }[];
    }[];
    notifications: { email: string; title: string }[];
  } | null>;
}

/** Вход по коду: email (если поле пустое) → «Получить код» → код из DemoNotice → «Войти». */
async function loginWithCode(page: Page, email: string) {
  const emailField = page.getByLabel('Email');
  if ((await emailField.inputValue()) !== email) await emailField.fill(email);
  await page.getByRole('button', { name: 'Получить код' }).click();
  const code = squash(await page.getByTestId('demo-code').innerText()).replace(/\s/g, '');
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel('Код из письма').fill(code);
  await page.getByRole('button', { name: 'Войти' }).click();
}

/**
 * Видимые Toast. Текст сообщения есть ещё и в скрытом live-регионе для скринридеров — поиск по
 * всей странице нашёл бы его дважды.
 */
const toasts = (page: Page) => page.getByRole('region', { name: 'Сообщения' });

/** Бейдж статуса рядом с h1 заказа. */
const orderHeader = (page: Page) => page.getByRole('main').locator('header').first();

async function fillCheckout(
  page: Page,
  { company = false, inn = '' }: { company?: boolean; inn?: string } = {},
) {
  if (company) {
    await page.getByText('Организация', { exact: true }).click();
    await page.getByLabel('Название организации').fill('ООО «Радиосвязь»');
    await page.getByLabel('ИНН').fill(inn);
  }
  await page.getByLabel('Имя').fill('Иван Петров');
  await page.getByLabel('Email').fill(BUYER);
  await page.getByLabel('Даю согласие на обработку персональных данных').check();
}

test.describe('Заявка → согласование → оплата', () => {
  test('сквозной сценарий ТЗ §14: заявка организации, согласование, смена суммы, оплата один раз, чужой email', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const consoleMessages = collectConsole(page);

    // 1. Корзина: Тип1 (цена из прайса) и «египетская сила» (по запросу).
    await addToCart(page, TIP1.slug);
    await addToCart(page, EGYPT.slug);
    await open(page, '/cart');
    await expect(page.getByRole('heading', { level: 1, name: 'Корзина' })).toBeVisible();
    await expect(page.getByRole('link', { name: TIP1.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: EGYPT.name, exact: true })).toBeVisible();
    let text = await mainText(page);
    // Ложного полного итога нет: «по запросу» не превращается в 0 ₽.
    expect(text).toContain('Стоимость уточнит менеджер');
    expect(text).toContain('Известная часть: 13 000 ₽');
    expect(text).toContain('Позиции «по запросу» (1 шт.) уточнит менеджер');
    expect(text).not.toContain('Предварительно');
    expect(text).not.toMatch(/(^|\s)0 ₽/);

    // 2. Заявка от организации: неверный ИНН ловится, верный проходит.
    await page.getByRole('link', { name: 'Оформить заявку' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await waitForHydration(page);
    await fillCheckout(page, { company: true, inn: '12345' });
    await page.getByRole('button', { name: 'Отправить заявку' }).click();
    const summary = page.getByRole('alert').filter({ hasText: 'Проверьте форму' });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText('ИНН — это 10 цифр для организации или 12 для ИП');
    await page.getByLabel('ИНН').fill('7701234567');
    await page.getByRole('button', { name: 'Отправить заявку' }).click();

    // 3. Успех: номер, демо-подпись про Telegram, вход в ЛК.
    await expect(page).toHaveURL(new RegExp(`/checkout/success\\?order=${ORDER}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Заявка отправлена' })).toBeVisible();
    text = await mainText(page);
    expect(text).toContain(`Номер заказа ${ORDER}`);
    expect(text).toContain(
      'Уведомление менеджеру в Telegram (демо, реальная отправка не выполняется)',
    );
    expect(text).toContain(`Новая заявка ${ORDER}: Иван Петров, ${BUYER}, позиций 2`);
    // Корзина очищена после заявки.
    expect(await page.evaluate(() => localStorage.getItem('antennas.cart.v1'))).toContain(
      '"items":[]',
    );

    // 4. Вход кодом → сразу в заказ «Заявка получена».
    await page.getByRole('link', { name: 'Открыть заказ' }).click();
    await expect(page).toHaveURL(/\/login\?/);
    await waitForHydration(page);
    await expect(page.getByLabel('Email')).toHaveValue(BUYER);
    await loginWithCode(page, BUYER);
    await expect(page).toHaveURL(new RegExp(`${ORDER_PATH}$`));
    await expect(toasts(page).getByText(`Вы вошли как ${BUYER}`)).toBeVisible();
    await expect(orderHeader(page)).toContainText('Заявка получена');
    text = await mainText(page);
    expect(text).toContain('ИНН 7701234567');
    expect(text).toContain('Действия менеджера (демонстрация)');
    expect(text).toContain('В рабочей версии эти действия выполняет менеджер в Admik');
    await expect(page.getByRole('link', { name: 'Перейти к оплате' })).toHaveCount(0);

    // 5. Демо-менеджер: в работу → цена «египетской силы» и доставка → выставить к оплате.
    await page.getByRole('button', { name: 'Взять в работу' }).click();
    await expect(orderHeader(page)).toContainText('Согласование');
    await page.getByRole('button', { name: 'Выставить к оплате' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Проверьте форму' })).toContainText(
      'Укажите цену для каждой позиции',
    );
    await page.getByLabel(`Цена за шт., ₽: ${EGYPT.name}`).fill('45000');
    await page.getByLabel('Доставка, ₽').fill('1500');
    await page.getByLabel('Комментарий к доставке').fill('Доставка до Москвы');
    await page.getByRole('button', { name: 'Выставить к оплате' }).click();
    await expect(orderHeader(page)).toContainText('Ожидает оплаты');
    await expect(page.getByRole('link', { name: 'Перейти к оплате' })).toBeVisible();
    text = await mainText(page);
    expect(text).toContain('Итого к оплате 59 500 ₽');
    expect(text).toContain('в заявке: по запросу');

    // 6. «Изменить сумму» аннулирует версию 1 и её ссылку.
    await page.getByRole('button', { name: 'Изменить сумму' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Изменить сумму' }).click();
    await expect(orderHeader(page)).toContainText('Согласование');
    await expect(page.getByRole('link', { name: 'Перейти к оплате' })).toHaveCount(0);
    await open(page, `${ORDER_PATH}/pay?v=1`);
    await expect(page.getByRole('main')).toContainText(
      'Эта ссылка на оплату больше не действует: сумма заказа изменена (версия 1 аннулирована).',
    );
    await expect(page.getByRole('main')).toContainText(
      'Дождитесь, пока менеджер выставит заказ к оплате заново.',
    );
    await expect(page.getByRole('button', { name: /^Оплатить/ })).toHaveCount(0);

    // Версия 2: форма предзаполнена ценами аннулированной версии, меняем доставку.
    await open(page, ORDER_PATH);
    await expect(page.getByLabel(`Цена за шт., ₽: ${EGYPT.name}`)).toHaveValue('45000');
    await page.getByLabel('Доставка, ₽').fill('2000');
    await page.getByRole('button', { name: 'Выставить к оплате' }).click();
    await expect(orderHeader(page)).toContainText('Ожидает оплаты');
    await open(page, `${ORDER_PATH}/pay?v=1`);
    await expect(page.getByRole('main')).toContainText('Оплатите актуальную версию 2: 60 000 ₽');
    await expect(page.getByRole('link', { name: 'Перейти к актуальной оплате' })).toHaveAttribute(
      'href',
      `${ORDER_PATH}/pay?v=2`,
    );

    // 7. Прямой заход на адрес возврата «со страницы провайдера» ничего не оплачивает.
    await open(page, `${ORDER_PATH}/pay?v=2&return=1`);
    await expect(page.getByRole('main')).toContainText('Вы вернулись со страницы оплаты');
    let data = await ordersData(page);
    expect(data?.orders[0].status).toBe('awaiting-payment');
    expect(data?.orders[0].payments.filter((p) => p.status === 'confirmed')).toHaveLength(0);
    await open(page, ORDER_PATH);
    await expect(orderHeader(page)).toContainText('Ожидает оплаты');

    // 8. Оплата: «Оплачен» только после ответа провайдера, повтор — без второй оплаты.
    await page.getByRole('link', { name: 'Перейти к оплате' }).click();
    await expect(page).toHaveURL(new RegExp(`${ORDER_PATH}/pay\\?v=2$`));
    await waitForHydration(page);
    await page.getByRole('button', { name: /^Оплатить/ }).click();
    data = await ordersData(page);
    expect(data?.orders[0].status).toBe('awaiting-payment');
    await page.getByRole('button', { name: 'Провайдер подтвердил оплату', exact: true }).click();
    await expect(page.getByRole('main')).toContainText(
      `Оплата подтверждена. Заказ ${ORDER} оплачен.`,
    );
    await page.getByRole('button', { name: 'Провайдер подтвердил оплату повторно' }).click();
    await expect(page.getByRole('main')).toContainText(
      'Оплата уже подтверждена ранее. Повторное подтверждение ничего не изменило.',
    );
    data = await ordersData(page);
    const order = data!.orders[0];
    expect(order.status).toBe('paid');
    expect(order.payments.filter((p) => p.status === 'confirmed')).toHaveLength(1);
    expect(order.quotes.filter((q) => q.status === 'paid').map((q) => q.version)).toEqual([2]);
    expect(order.events.filter((e) => e.type === 'payment-confirmed')).toHaveLength(1);
    expect(data!.notifications.filter((n) => n.title === `Заказ ${ORDER} оплачен`)).toHaveLength(1);
    await open(page, ORDER_PATH);
    await expect(orderHeader(page)).toContainText('Оплачен');
    await expect(page.getByRole('main')).toContainText('Оплаченный заказ не редактируется');

    // Двойной клик в демо-панели проходит ровно один статус: на месте «Передать в обработку»
    // появляется «Отметить отправку», и второй клик раньше попадал в неё (paid → shipped).
    await page.getByRole('button', { name: 'Передать в обработку' }).dblclick();
    await expect(orderHeader(page)).toContainText('В обработке');
    await page.waitForTimeout(600);
    await expect(orderHeader(page)).toContainText('В обработке');
    data = await ordersData(page);
    expect(data?.orders[0].status).toBe('processing');
    expect(data?.orders[0].events.filter((e) => e.type === 'status')).toHaveLength(2);
    await page.getByRole('button', { name: 'Отметить отправку' }).dblclick();
    await expect(orderHeader(page)).toContainText('Отправлен');
    await page.waitForTimeout(600);
    expect((await ordersData(page))?.orders[0].status).toBe('shipped');

    // ЛК: заказ в списке, уведомления со счётчиком.
    await open(page, '/account');
    await expect(page.getByRole('link', { name: ORDER, exact: true })).toBeVisible();
    await open(page, '/account/notifications');
    await expect(page.getByRole('main')).toContainText(`Заказ ${ORDER} оплачен`);
    await expect(page.getByRole('main')).toContainText('Email — демо, не отправлено');

    // 9. Другой email заказ не видит: тот же ответ, что и для несуществующего номера.
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await waitForHydration(page);
    await loginWithCode(page, 'someone@example.ru');
    await expect(page).toHaveURL(/\/account\/notifications$/);
    await open(page, '/account');
    await expect(page.getByRole('main')).toContainText('Заявок пока нет');
    await open(page, ORDER_PATH);
    await expect(page.getByRole('heading', { level: 1, name: 'Заказ не найден' })).toBeVisible();
    text = await mainText(page);
    expect(text).not.toContain('Иван');
    expect(text).not.toContain('7701234567');
    await open(page, `${ORDER_PATH}/pay?v=2`);
    await expect(page.getByRole('heading', { level: 1, name: 'Заказ не найден' })).toBeVisible();
    await open(page, '/account/orders/DEMO-9999');
    await expect(page.getByRole('heading', { level: 1, name: 'Заказ не найден' })).toBeVisible();

    expect(consoleMessages).toEqual([]);
  });

  test('двойной клик по «Отправить заявку» создаёт одну заявку', async ({ page }) => {
    const consoleMessages = collectConsole(page);
    await addToCart(page, TIP1.slug);
    await open(page, '/checkout');
    await fillCheckout(page);
    await page.getByRole('button', { name: 'Отправить заявку' }).dblclick();
    await expect(page).toHaveURL(new RegExp(`/checkout/success\\?order=${ORDER}$`));
    const data = await ordersData(page);
    expect(data?.orders).toHaveLength(1);
    // Прямой заход на страницу успеха ничего не создаёт.
    await open(page, `/checkout/success?order=${ORDER}`);
    await open(page, '/checkout/success?order=DEMO-0042');
    await expect(page.getByRole('heading', { level: 1, name: 'Заявка не найдена' })).toBeVisible();
    expect((await ordersData(page))?.orders).toHaveLength(1);
    expect(consoleMessages).toEqual([]);
  });

  test('корзина и избранное переживают перезагрузку; удаление с «Вернуть»', async ({ page }) => {
    const consoleMessages = collectConsole(page);
    await addToCart(page, TIP1.slug);
    await page.getByRole('button', { name: 'Добавить в избранное', exact: true }).click();
    await addToCart(page, EGYPT.slug);

    await open(page, '/cart');
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('link', { name: TIP1.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: EGYPT.name, exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Удалить «${EGYPT.name}» из корзины` }).click();
    await expect(page.getByRole('link', { name: EGYPT.name, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Вернуть' }).click();
    await expect(page.getByRole('link', { name: EGYPT.name, exact: true })).toBeVisible();

    await open(page, '/favorites');
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('link', { name: TIP1.name, exact: true })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('1 товар');
    expect(consoleMessages).toEqual([]);
  });

  test('после входа корзина и избранное объединяются с профилем без потери позиций', async ({
    page,
  }) => {
    const consoleMessages = collectConsole(page);
    const email = 'merge@example.ru';
    // Профиль: в корзине Тип1.
    await addToCart(page, TIP1.slug);
    await open(page, '/login');
    await loginWithCode(page, email);
    await expect(page).toHaveURL(/\/account$/);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL(/\/login/);

    // Гость: убирает Тип1, кладёт «египетскую силу» и отмечает её в избранном.
    await open(page, '/cart');
    await page.getByRole('button', { name: `Удалить «${TIP1.name}» из корзины` }).click();
    await addToCart(page, EGYPT.slug);
    await page.getByRole('button', { name: 'Добавить в избранное', exact: true }).click();

    await open(page, '/login');
    await loginWithCode(page, email);
    await expect(toasts(page).getByText(`Вы вошли как ${email}`)).toBeVisible();
    await expect(toasts(page).getByText('В корзину добавлено позиций из профиля: 1')).toBeVisible();

    await open(page, '/cart');
    await expect(page.getByRole('link', { name: TIP1.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: EGYPT.name, exact: true })).toBeVisible();
    await open(page, '/favorites');
    await expect(page.getByRole('link', { name: EGYPT.name, exact: true })).toBeVisible();
    expect(consoleMessages).toEqual([]);
  });

  test('состав заказа и печатная сводка сохраняют статусы значений: «*» и «Уточняется»', async ({
    page,
  }) => {
    const consoleMessages = collectConsole(page);
    await addToCart(page, TIP7.slug);
    await addToCart(page, LNA.slug);
    await open(page, '/checkout');
    await fillCheckout(page);
    await page.getByRole('button', { name: 'Отправить заявку' }).click();
    await expect(page).toHaveURL(/\/checkout\/success/);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Открыть заказ' }).click();
    await waitForHydration(page);
    await loginWithCode(page, BUYER);
    await expect(page).toHaveURL(new RegExp(`${ORDER_PATH}$`));

    const items = page.getByRole('main').locator('section', {
      has: page.getByRole('heading', { name: 'Состав заказа' }),
    });
    const text = squash(await items.innerText());
    // inferred: «*» (sr — «единица принята по контексту») и сноска под составом.
    expect(text).toContain('3100–4500 МГц* (единица принята по контексту)');
    expect(text).toContain('* Единица не указана в прайсе, принята по контексту.');
    // needs-review: «Уточняется» рядом со значением; «6000–8000 ГГц» не исправлено.
    expect(text).toMatch(/6000–8000 ГГц\s*Уточняется/);
    // Печатная сводка — та же страница: состав не помечен data-print="hidden".
    expect(await items.evaluate((el) => el.closest('[data-print="hidden"]') === null)).toBe(true);

    // В снимке заявки статус хранится вместе с текстом.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('antennas.demo.orders.v1');
      return raw === null ? null : JSON.parse(raw).state.orders[0].items;
    });
    expect(stored[0].spec[0]).toMatchObject({ text: '3100–4500 МГц', status: 'inferred' });
    expect(stored[1].spec[0]).toMatchObject({ text: '6000–8000 ГГц', status: 'needs-review' });
    expect(consoleMessages).toEqual([]);
  });

  test('«Заявка отправлена» не показывает данные покупателя другой вкладке и чужой сессии', async ({
    page,
    context,
  }) => {
    const consoleMessages = collectConsole(page);
    await addToCart(page, TIP1.slug);
    await open(page, '/checkout');
    await fillCheckout(page);
    await page.getByLabel('Телефон').fill('+79001234567');
    await page.getByRole('button', { name: 'Отправить заявку' }).click();
    await expect(page).toHaveURL(new RegExp(`/checkout/success\\?order=${ORDER}$`));
    // Вкладка, из которой отправили заявку, видит подробности (и телефон — группами).
    await expect(page.getByRole('main')).toContainText(
      `Менеджер свяжется с вами по email ${BUYER} или по телефону +7 900 123-45-67.`,
    );

    // Другая вкладка (без отметки отправки) под чужой сессией.
    const other = await context.newPage();
    const otherConsole = collectConsole(other);
    await open(other, '/');
    await other.evaluate(() =>
      localStorage.setItem(
        'antennas.demo.session.v1',
        JSON.stringify({
          state: { session: { email: 'stranger@example.ru', startedAt: new Date().toISOString() } },
          version: 1,
        }),
      ),
    );
    const neutral = async () => {
      await open(other, `/checkout/success?order=${ORDER}`);
      await expect(
        other.getByRole('heading', { level: 1, name: 'Заявка отправлена' }),
      ).toBeVisible();
      const text = await mainText(other);
      expect(text).toContain(
        `Заявка ${ORDER} отправлена. Подробности — в личном кабинете после входа.`,
      );
      for (const secret of ['Иван', BUYER, '900', 'Telegram (демо', 'Новая заявка']) {
        expect(text).not.toContain(secret);
      }
    };
    await neutral();
    await expect(other.getByRole('link', { name: 'Открыть кабинет' })).toHaveAttribute(
      'href',
      '/account',
    );
    // Гость в другой вкладке — тоже без данных; вход — без email покупателя в адресе.
    await other.evaluate(() => localStorage.removeItem('antennas.demo.session.v1'));
    await neutral();
    const login = other.getByRole('link', { name: 'Войти в кабинет' });
    await expect(login).toHaveAttribute(
      'href',
      `/login?${new URLSearchParams({ next: ORDER_PATH }).toString()}`,
    );
    expect(consoleMessages).toEqual([]);
    expect(otherConsole).toEqual([]);
  });

  test('вход: ?next= не уводит на чужой сайт', async ({ page }) => {
    const consoleMessages = collectConsole(page);
    await page.addInitScript((session) => {
      localStorage.setItem('antennas.demo.session.v1', session);
    }, SESSION(BUYER));
    const visited: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url());
    });
    // Чужой сайт не нужен по-настоящему: если переход случится, его поймает проверка ниже.
    await page.route(
      (url) => url.hostname.includes('evil'),
      (route) => route.fulfill({ status: 200, body: 'EVIL' }),
    );
    for (const next of [
      '/%09/evil.test/',
      '/%0A/evil.test/',
      '/%0D/evil.test/',
      '/%5Cevil.test',
      '/%5C/evil.test',
      '//evil.test',
      '/.//evil.test',
    ]) {
      await page.goto(`/login?next=${next}`);
      await expect(page).toHaveURL(/\/account$/);
      await waitForHydration(page);
      expect(new URL(page.url()).hostname).not.toContain('evil');
    }
    expect(visited.filter((url) => new URL(url).hostname.includes('evil'))).toEqual([]);
    expect(consoleMessages).toEqual([]);
  });

  test('вход: «Изменить email» не выдаёт новый код; ссылка на другой email не уводит в чужой кабинет', async ({
    page,
  }) => {
    const consoleMessages = collectConsole(page);
    await open(page, '/login');
    await page.getByLabel('Email').fill(BUYER);
    await page.getByRole('button', { name: 'Получить код' }).click();
    const code = squash(await page.getByTestId('demo-code').innerText()).replace(/\s/g, '');
    await page.getByLabel('Код из письма').fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('main')).toContainText('Неверный код. Осталось попыток: 2');

    // Тот же email после «Изменить email» — тот же код, попытки не восстанавливаются.
    await page.getByRole('button', { name: 'Изменить email' }).click();
    await expect(page.getByLabel('Email')).toHaveValue(BUYER);
    await page.getByRole('button', { name: 'Получить код' }).click();
    expect(squash(await page.getByTestId('demo-code').innerText()).replace(/\s/g, '')).toBe(code);
    await page.getByLabel('Код из письма').fill(code === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('main')).toContainText('Неверный код. Осталось попыток: 1');
    await page.getByLabel('Код из письма').fill(code);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/account$/);

    // Ссылка «войти как other@ и вернуться в заказ» под сессией buyer@: без авто-перехода.
    const other = 'other@example.ru';
    await open(
      page,
      `/login?email=${other}&next=${encodeURIComponent('/account/orders/DEMO-0007')}`,
    );
    await expect(page).toHaveURL(/\/login\?/);
    await expect(page.getByRole('main')).toContainText(`Сейчас вы вошли как ${BUYER}`);
    await page.getByRole('button', { name: `Выйти и войти как ${other}` }).click();
    await expect(page.getByRole('main')).toContainText(`Код отправлен на ${other}.`);
    const otherCode = squash(await page.getByTestId('demo-code').innerText()).replace(/\s/g, '');
    await page.getByLabel('Код из письма').fill(otherCode);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/account\/orders\/DEMO-0007$/);
    expect(consoleMessages).toEqual([]);
  });

  test('после «Очистить корзину» и удаления последней строки фокус — на заголовке', async ({
    page,
  }) => {
    const consoleMessages = collectConsole(page);
    await addToCart(page, TIP1.slug);
    await open(page, '/cart');
    await page.getByRole('button', { name: 'Очистить корзину' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Очистить' }).click();
    await expect(page.getByRole('heading', { name: 'Корзина пуста' })).toBeFocused();

    await addToCart(page, TIP1.slug);
    await open(page, '/cart');
    await page.getByRole('button', { name: `Удалить «${TIP1.name}» из корзины` }).click();
    await expect(page.getByRole('heading', { name: 'Корзина пуста' })).toBeFocused();
    expect(consoleMessages).toEqual([]);
  });

  test('промокод DEMO10 не считается от позиций «по запросу»', async ({ page }) => {
    const consoleMessages = collectConsole(page);
    await addToCart(page, EGYPT.slug);
    await open(page, '/cart');

    // Только «по запросу»: промокод принят, скидки нет до согласования.
    await page.getByRole('button', { name: 'Есть промокод?' }).click();
    await page.getByLabel('Промокод').fill('nope');
    await page.getByRole('button', { name: 'Применить' }).click();
    await expect(page.getByRole('main')).toContainText('Промокод не найден. Проверьте написание.');
    await page.getByLabel('Промокод').fill(' demo10 ');
    await page.getByRole('button', { name: 'Применить' }).click();
    let text = await mainText(page);
    expect(text).toContain('Промокод DEMO10');
    expect(text).toContain('Скидка будет рассчитана при согласовании');
    expect(text).toContain('Скидка по промокоду (предварительно) при согласовании');

    // + Тип1: скидка 10 % только от 13 000 ₽.
    await addToCart(page, TIP1.slug);
    await open(page, '/cart');
    text = await mainText(page);
    expect(text).toContain('Скидка по промокоду (предварительно) −1 300 ₽');
    expect(text).toContain('Известная часть: 11 700 ₽');
    expect(text).toContain('Стоимость уточнит менеджер');
    expect(text).toContain('На позиции «по запросу» скидка не распространяется');

    // Заявка уносит промокод; демо-менеджер предлагает скидку только от позиций с ценой.
    await open(page, '/checkout');
    await fillCheckout(page);
    await page.getByRole('button', { name: 'Отправить заявку' }).click();
    await expect(page).toHaveURL(/\/checkout\/success/);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Открыть заказ' }).click();
    await waitForHydration(page);
    await loginWithCode(page, BUYER);
    await expect(page).toHaveURL(new RegExp(`${ORDER_PATH}$`));
    await page.getByRole('button', { name: 'Взять в работу' }).click();
    await page.getByLabel(`Цена за шт., ₽: ${EGYPT.name}`).fill('45000');
    await expect(page.getByLabel('Скидка, ₽')).toHaveValue('1300');
    expect(consoleMessages).toEqual([]);
  });
});

/**
 * Битые данные в localStorage (руками правленые, другая версия сайта) не роняют сайт: неверная
 * форма — пустое значение, невалидный JSON — пустое хранилище, а не вечный Skeleton.
 * Значения кладутся перед каждой загрузкой страницы.
 */
const KEYS = {
  cart: 'antennas.cart.v1',
  favorites: 'antennas.favorites.v1',
  session: 'antennas.demo.session.v1',
  profiles: 'antennas.demo.profiles.v1',
  orders: 'antennas.demo.orders.v1',
  challenge: 'antennas.demo.login-challenge.v1',
} as const;

const BROKEN: {
  name: string;
  storage: Partial<Record<keyof typeof KEYS, string>>;
  pages: [path: string, text: string][];
}[] = [
  {
    name: 'корзина items: null',
    storage: { cart: '{"state":{"items":null},"version":1}' },
    pages: [
      ['/', 'Каталог'],
      ['/cart', 'Корзина пуста'],
    ],
  },
  {
    name: 'невалидный JSON',
    storage: {
      cart: '{broken',
      favorites: '{broken',
      session: '{broken',
      orders: '{broken',
      profiles: '{broken',
      challenge: '{broken',
    },
    pages: [
      ['/cart', 'Корзина пуста'],
      ['/checkout', 'В заявке нет товаров'],
      ['/favorites', 'В избранном пока пусто'],
      ['/account', 'Вход в личный кабинет'],
    ],
  },
  {
    name: 'избранное ids: "abc"',
    storage: { favorites: '{"state":{"ids":"abc"},"version":1}' },
    pages: [['/favorites', 'В избранном пока пусто']],
  },
  {
    name: 'сессия email: 123',
    storage: { session: '{"state":{"session":{"email":123}},"version":1}' },
    pages: [
      ['/account', 'Вход в личный кабинет'],
      ['/login', 'Получить код'],
    ],
  },
  {
    name: 'заказы null, профили null',
    storage: {
      session: SESSION(BUYER),
      orders: '{"state":{"seq":3,"orders":null,"notifications":null},"version":1}',
      profiles: '{"state":{"profiles":null},"version":1}',
    },
    pages: [
      ['/account', 'Заявок пока нет'],
      ['/account/notifications', 'Уведомлений пока нет'],
      ['/checkout', 'В заявке нет товаров'],
    ],
  },
  {
    name: 'заказ без полей',
    storage: {
      session: SESSION(BUYER),
      orders: `{"state":{"seq":1,"orders":[{"number":"${ORDER}"},null],"notifications":[{}]},"version":1}`,
    },
    pages: [
      [ORDER_PATH, 'Заказ не найден'],
      ['/account', 'Заявок пока нет'],
      [`/checkout/success?order=${ORDER}`, 'Заявка не найдена'],
    ],
  },
  {
    name: 'вызов кода code: null',
    storage: { challenge: '{"state":{"challenge":{"email":"a@a.ru","code":null}},"version":1}' },
    pages: [['/login', 'Получить код']],
  },
];

test.describe('битые данные в хранилище браузера', () => {
  for (const scenario of BROKEN) {
    test(scenario.name, async ({ page }) => {
      const consoleMessages = collectConsole(page);
      const entries = Object.entries(scenario.storage).map(([key, value]) => [
        KEYS[key as keyof typeof KEYS],
        value,
      ]);
      await page.addInitScript((pairs) => {
        for (const [key, value] of pairs) localStorage.setItem(key, value);
      }, entries);
      for (const [path, text] of scenario.pages) {
        await open(page, path);
        await expect(page.getByRole('banner')).toBeVisible();
        await expect(page.getByRole('main')).toContainText(text);
        const h1 = await page.locator('h1').first().innerText();
        expect(h1).not.toBe('Не удалось загрузить страницу');
        expect(h1).not.toContain('couldn');
      }
      expect(consoleMessages.filter((m) => m.startsWith('pageerror'))).toEqual([]);
    });
  }
});
