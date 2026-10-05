import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * По умолчанию тесты поднимают собранный проект (`npm run build` заранее).
 * E2E_BASE_URL — прогон по уже развёрнутому адресу, например превью Vercel.
 *
 * Перед первым прогоном в чистой среде: `sudo npx playwright install-deps chromium` и
 * `npx playwright install chromium` — системные библиотеки браузера в этой среде могут
 * пропадать после перезапуска. Docker здесь не подходит: /var/lib/docker — tmpfs на 2 ГБ,
 * образ Playwright в него не помещается.
 */
const externalURL = process.env.E2E_BASE_URL;
const baseURL = externalURL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  ...(externalURL
    ? {}
    : {
        webServer: {
          command: `npx next start -p ${PORT}`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
