/**
 * Конфигурация витрины — единая точка правки бренда, контактов, демо-режима и служебной
 * навигации. Правила применения описаны в `docs/DESIGN.md` (§ 9 «Конфигурация»).
 *
 * Чего здесь нет намеренно:
 * - адреса сайта — он зависит от окружения (переменные Vercel) и нужен только серверу:
 *   `SITE_URL` из `@/lib/seo`, правила — `src/config/site-url.ts`, переменные — `.env.example`.
 *   Этот модуль импортируют и клиентские компоненты, а серверные переменные в браузере не видны;
 * - категорий каталога — навигация по каталогу строится из данных (`src/lib/repository.ts`);
 * - телефона, email, адреса, реквизитов — заказчик их не передал, выдумывать нельзя;
 * - цен, скидок и статусов заказа — это данные, а не настройки.
 */

/** Внутренний путь сайта: всегда начинается с «/». */
export type InternalHref = `/${string}`;

export interface NavLink {
  href: InternalHref;
  label: string;
}

export interface DemoPromoCode {
  /** Код в верхнем регистре. Ввод сравнивается после trim() и toUpperCase(). */
  code: string;
  /** Скидка в процентах — только на позиции с ценой из прайса, не на «по запросу». */
  percent: number;
  /** Подпись под полем после применения. */
  description: string;
}

export interface SearchablePage {
  href: InternalHref;
  title: string;
  /** Слова, по которым страница находится поиском (сравнение после normalizeSearchText). */
  keywords: readonly string[];
}

export interface SiteConfig {
  /** Название бренда. null — не подтверждено заказчиком («220» — номер брифа, не бренд). */
  brandName: string | null;
  /** Нейтральный дескриптор рядом со знаком в шапке; заменяет название, пока его нет. */
  descriptor: string;
  /** H1 главной и title главной, пока нет бренда. */
  catalogTitle: string;
  /** Описание по умолчанию для metadata. Без маркетинговых обещаний. */
  description: string;
  lang: 'ru';
  locale: 'ru-RU';
  ogLocale: 'ru_RU';
  currency: {
    code: 'RUB';
    symbol: '₽';
    /** true — валюта в прайсе не указана, рубли приняты как предположение. */
    assumed: boolean;
    /** Полная формулировка: страница «Доставка и оплата», подвал. */
    note: string;
    /** Короткая формулировка для подвала и сводки заказа. */
    shortNote: string;
  };
  contacts: {
    /** Единственный подтверждённый канал связи (из брифа). Не бот и не chat_id. */
    telegram: { url: string; handle: string; label: string };
  };
  legal: {
    /** false — тексты и реквизиты не переданы: страницы-структуры, noindex, плашка. */
    ready: boolean;
    requisitesNote: string;
    draftNote: string;
  };
  seo: {
    /**
     * false — макет на Vercel не индексируется целиком (robots: noindex, Disallow: /).
     * Правила index/noindex отдельных страниц из docs/DESIGN.md действуют, когда true.
     */
    allowIndexing: boolean;
    /** Префиксы путей, которые не индексируются никогда и не попадают в sitemap. */
    noindexPrefixes: readonly InternalHref[];
  };
  demo: {
    /** Макет: заявки, вход и оплата работают только в браузере (localStorage). */
    enabled: boolean;
    /**
     * Полоса над шапкой на всех страницах. Не скрывается: иначе сдвиг вёрстки и потеря контекста.
     * `text` — полный текст (≥ md); `shortText` — одна строка на < md, полный текст там
     * раскрывается по «Подробнее».
     */
    siteBanner: { enabled: boolean; text: string; shortText: string };
    /** Номер демо-заказа: префикс + 4 цифры по порядку в этом браузере (DEMO-0001). */
    orderNumberPrefix: string;
    promoCodes: readonly DemoPromoCode[];
    login: {
      codeLength: number;
      codeTtlSeconds: number;
      resendCooldownSeconds: number;
      maxAttempts: number;
    };
    /** Имитация сетевой задержки при отправке заявки, мс. */
    submitDelayMs: number;
    /**
     * Колонка «Служебное» в подвале (`nav.internal`: /import-report, /brand) — единственный флаг,
     * который выводит служебные ссылки в публичной части. Перед публичным запуском выключить.
     */
    showServiceLinks: boolean;
  };
  /** Ключи localStorage. Версия в конце — при смене формата данных увеличить. */
  storageKeys: {
    cart: string;
    favorites: string;
    demoSession: string;
    demoProfiles: string;
    demoOrders: string;
    demoLoginChallenge: string;
  };
  catalog: {
    pageSize: number;
    /** Вид списка по умолчанию; в URL пишется только отличный от него (?view=grid). */
    defaultView: 'list' | 'grid';
    /** Минимальная длина запроса для подсказок поиска в шапке. */
    suggestMinChars: number;
    suggestDebounceMs: number;
    /**
     * Примеры запросов под полем поиска — только такие, что находят реальные позиции
     * («2400» поиск понимает как частоту: позиции, чей диапазон её покрывает).
     */
    searchExamples: readonly string[];
    /**
     * Быстрые запросы под поиском главной: поисковый запрос или категория. Только такие, что
     * находят реальные позиции.
     */
    quickLinks: readonly NavLink[];
    /**
     * Спектральная шкала (BandScale): логарифмическая ось частот, МГц.
     * Покрывает подтверждённые диапазоны прайса (минимум 50 МГц у МШУ, максимум 9000 МГц у Тип14).
     */
    bandScale: {
      minMHz: number;
      maxMHz: number;
      ticks: readonly { mhz: number; label: string }[];
    };
  };
  nav: {
    /** Нижняя строка меню «Каталог» в шапке. */
    service: readonly NavLink[];
    /** Подвал «Покупателям», мобильное меню (избранное и корзина — значками в шапке). */
    customer: readonly NavLink[];
    /** Подвал «Документы», ссылки из формы заявки. */
    legal: readonly NavLink[];
    /** Навигация личного кабинета. */
    account: readonly NavLink[];
    /** Служебные страницы (noindex). В подвале — только при `demo.showServiceLinks`. */
    internal: readonly NavLink[];
  };
  /** Информационные страницы, которые находит поиск по сайту. */
  searchablePages: readonly SearchablePage[];
}

export const site: SiteConfig = {
  brandName: null,
  descriptor: 'Антенны и радиооборудование',
  catalogTitle: 'Каталог антенн и радиооборудования',
  description:
    'Антенны, малошумящие усилители, радиочастотные фильтры, кабельные сборки, мачты и аттенюаторы. ' +
    'Характеристики и цены из прайса. Покупка через заявку: менеджер согласует состав, цену и доставку.',
  lang: 'ru',
  locale: 'ru-RU',
  ogLocale: 'ru_RU',
  currency: {
    code: 'RUB',
    symbol: '₽',
    assumed: true,
    note:
      'В прайсе валюта не указана. Цены показаны в рублях — это предположение, оно ждёт ' +
      'подтверждения.',
    shortNote: 'Цены в рублях — предварительно',
  },
  contacts: {
    telegram: {
      url: 'https://t.me/svyaz987',
      handle: '@svyaz987',
      label: 'Telegram',
    },
  },
  legal: {
    ready: false,
    requisitesNote: 'Реквизиты будут добавлены',
    draftNote:
      'Текст документа готовится. Реквизиты будут добавлены. Страница показывает структуру ' +
      'документа и не является его действующей редакцией.',
  },
  seo: {
    allowIndexing: false,
    noindexPrefixes: [
      '/search',
      '/cart',
      '/checkout',
      '/favorites',
      '/login',
      '/account',
      '/import-report',
      '/brand',
    ],
  },
  demo: {
    enabled: true,
    siteBanner: {
      enabled: true,
      text:
        'Демонстрационная версия витрины: заявки, вход и оплата работают только в этом браузере ' +
        'и никуда не отправляются.',
      shortText: 'Ничего не отправляется',
    },
    orderNumberPrefix: 'DEMO-',
    promoCodes: [
      {
        code: 'DEMO10',
        percent: 10,
        description: 'Тестовый промокод для демонстрации: −10 % на позиции с ценой из прайса.',
      },
    ],
    login: {
      codeLength: 6,
      codeTtlSeconds: 600,
      resendCooldownSeconds: 60,
      maxAttempts: 3,
    },
    submitDelayMs: 600,
    // Макет: служебные страницы видны заказчику из подвала (DESIGN §2.20).
    // Перед публичным запуском выключить (false).
    showServiceLinks: true,
  },
  storageKeys: {
    cart: 'antennas.cart.v1',
    favorites: 'antennas.favorites.v1',
    demoSession: 'antennas.demo.session.v1',
    demoProfiles: 'antennas.demo.profiles.v1',
    demoOrders: 'antennas.demo.orders.v1',
    demoLoginChallenge: 'antennas.demo.login-challenge.v1',
  },
  catalog: {
    pageSize: 24,
    defaultView: 'list',
    suggestMinChars: 2,
    suggestDebounceMs: 150,
    searchExamples: ['Тип1', 'M4', '2400', 'N-female', 'МШУ'],
    quickLinks: [
      { href: '/search?q=700%E2%80%931100%20%D0%9C%D0%93%D1%86', label: '700–1100 МГц' },
      { href: '/search?q=N-female', label: 'N-female' },
      { href: '/search?q=%D0%9C%D0%A8%D0%A3', label: 'МШУ' },
      { href: '/catalog/cables', label: 'Кабельные сборки' },
    ],
    bandScale: {
      minMHz: 50,
      maxMHz: 10000,
      ticks: [
        { mhz: 100, label: '100 МГц' },
        { mhz: 1000, label: '1 ГГц' },
        { mhz: 10000, label: '10 ГГц' },
      ],
    },
  },
  nav: {
    service: [
      { href: '/delivery', label: 'Доставка и оплата' },
      { href: '/contacts', label: 'Контакты' },
    ],
    customer: [
      { href: '/delivery', label: 'Доставка и оплата' },
      { href: '/contacts', label: 'Контакты' },
      { href: '/account', label: 'Личный кабинет' },
    ],
    legal: [
      { href: '/legal/privacy', label: 'Политика обработки персональных данных' },
      { href: '/legal/terms', label: 'Пользовательское соглашение' },
      { href: '/legal/consent', label: 'Согласие на обработку персональных данных' },
    ],
    account: [
      { href: '/account', label: 'Заявки и заказы' },
      { href: '/account/notifications', label: 'Уведомления' },
    ],
    internal: [
      { href: '/import-report', label: 'Отчёт импорта' },
      { href: '/brand', label: 'Логотип: построение' },
    ],
  },
  searchablePages: [
    {
      href: '/delivery',
      title: 'Доставка и оплата',
      keywords: [
        'доставка',
        'оплата',
        'заявка',
        'согласование',
        'счёт',
        'как купить',
        'организация',
      ],
    },
    {
      href: '/contacts',
      title: 'Контакты',
      keywords: ['контакты', 'telegram', 'телеграм', 'связь', 'менеджер', 'вопрос'],
    },
    {
      href: '/legal/privacy',
      title: 'Политика обработки персональных данных',
      keywords: ['персональные данные', 'политика', 'конфиденциальность'],
    },
    {
      href: '/legal/terms',
      title: 'Пользовательское соглашение',
      keywords: ['соглашение', 'условия'],
    },
    {
      href: '/legal/consent',
      title: 'Согласие на обработку персональных данных',
      keywords: ['согласие', 'персональные данные'],
    },
  ],
};

/** Название сайта для <title>, шапки, подвала: бренд, а пока его нет — дескриптор. */
export function siteTitle(): string {
  return site.brandName ?? site.descriptor;
}

const matchesPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Путь не индексируется: ЛК, корзина, служебные страницы, а пока тексты не готовы — и
 * юридические страницы. Глобальный запрет (seo.allowIndexing = false) проверяется отдельно.
 */
export function isNoindexPath(pathname: string): boolean {
  if (!site.legal.ready && matchesPrefix(pathname, '/legal')) return true;
  return site.seo.noindexPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}
