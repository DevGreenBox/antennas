# API фундамента интерфейса

Справочник для разработчиков страниц. Вид и поведение — `docs/DESIGN.md`, данные —
`docs/DATA-RULES.md`, движок подбора — `src/lib/catalog/index.ts`. Сверено с кодом 2026-10-05
(DESIGN 1.4).

## Данные — `@/lib/repository` (только сервер, всё async)

Единственная точка чтения каталога. При сращивании с Admik меняется реализация, сигнатуры — нет.

| Функция | Что возвращает |
|---|---|
| `getProducts()` | `Product[]` |
| `getProductBySlug(slug)` | `Product \| null` |
| `getProductsByIds(ids)` | `Product[]` в порядке `ids`, отсутствующие пропускаются |
| `getProductsInCategory(categoryId)` | товары категории с подкатегориями |
| `getRecommendations(productId)` | `{ approved, drafts, notes }` — без самого товара; `drafts = []` при выключенном демо |
| `getCategories()` / `getCategoryById(id)` | `Category[]` / `Category` |
| `getCategoryTree()` | `CategoryNode[]` = Category + `slugPath`, `href`, `productCount` (по поддереву), `children` |
| `getCategoryTrail(categoryId)` | путь от корня |
| `getCategoryBySlugPath(slugs)` | `{ category, trail } \| null` (проверяет вложенность сегментов) |
| `getSourceRecordsForProduct(id)` | включая `conflict-attached` — на странице товара их отфильтровать |
| `getIssuesForProduct(id)`, `getImportReport()`, `getAllSourceRecords()`, `getAllIssues()` | данные импорта |
| `getSearchIndex()` | `SearchIndex = { products, categories }` — урезанные товары для `suggest`/`searchProducts`. В разметку не встраивается: браузер берёт его с `GET /api/search-index` (`force-static`) |

Урезание для клиента: `toClientProducts` (`@/components/catalog/catalog-data` — выдача каталога: без
`notes`, `sourceIds`, `issueIds`), `toClientProduct(s)`, `toClientCategories`, `categoryNameMap`
(`@/components/cart/catalog-data` — корзина, заявка, ЛК).

## SEO — `@/lib/seo` (только сервер: `import 'server-only'`)

`SITE_URL` — базовый адрес без «/» в конце: `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL`
→ `VERCEL_URL` → `http://localhost:3000` (правило — чистая функция `resolveSiteUrl(env)` и
`LOCAL_SITE_URL` в `@/config/site-url`; переменные — `.env.example`). Из клиентских компонентов не
импортировать: системные переменные Vercel в браузер не попадают. В `site.ts` адреса нет.

`pageMetadata({ title | absoluteTitle, description?, path, robots?: 'index' | 'noindex' | 'noindex-follow' })`,
`robotsFor(kind)`, `absoluteUrl(path)`, `breadcrumbListJsonLd(items)`, `OG_IMAGE`.
Next сливает `robots`/`openGraph` поверхностно — задавайте их только через эти функции, иначе
слетит глобальный noindex макета.

Товар: `productDescription(product)`, `productJsonLd(product, categoryName)`, `productPath(product)`
(`src/app/product/[slug]/product-seo.ts`) — в описании `inferred` с «(единица уточняется)»,
`needs-review` опускается.

## Форматирование — `@/lib/format`

`plural`, `countLabel` + формы `PRODUCT_FORMS`, `POSITION_FORMS`, `SUGGESTION_FORMS`,
`ORDER_FORMS`, `NOTIFICATION_FORMS`, `UNREAD_FORMS`; `formatPieces(n)` → «2 шт.»;
`formatBadgeCount`, `capitalize`, `formatCellAddress('1!B4')` → «лист 1, B4»; `formatLoginCode`,
`formatCountdown`; `formatDateFull`, `formatDateShort` (только в клиентских компонентах);
`normalizeEmail`, `isValidEmail`, `normalizePhone`, `isValidPhone`, `isValidInn`;
`PRICE_ON_REQUEST_SHORT`, `NBSP`. Цены и характеристики — функциями движка
(`formatPrice`, `formatProductPrice`, `formatProductAttributes`, `getSpecLine`…). Телефон для
показа — `formatPhone` из `@/lib/demo-orders`.

## Типографика технических значений — `@/lib/catalog` (`typography.ts`)

- `nonBreakingText(text)` — тот же текст с U+00A0: между числом и единицей («10 дБ», «1 м»; единица
  целым словом), после «до»/«от» перед числом, перед разделителями « — », « · », « / ».
- `technicalSegments(text)` → `TextSegment[]` (`{ text, keep }`): `keep: true` — дефисные коды и
  диапазоны («SMA-male», «RG-316», «700–6100 МГц»), их оборачивают в `white-space: nowrap`.
  Символы данных не подменяются (без U+2011).
- В разметке — компонент `TechText` (`@/components/product/SpecLine`), см. «Компоненты».

## Демо-заказы

- `@/types/order`: `OrderSpecPoint = { text, status: AttrStatus, note? }`;
  `OrderItemSnapshot.spec: OrderSpecPoint[]` — пункты строки параметров со статусами на момент
  заявки; `specSummary?: string` — **устарело**, только у заказов, сохранённых раньше (новые не
  пишут). Прочие типы — DESIGN §3.3.
- `@/lib/order-status`: `ORDER_STATUSES`, `HAPPY_PATH`, `ORDER_STATUS_LABELS`,
  `ORDER_STATUS_DESCRIPTIONS`, `ORDER_STATUS_TONES`, `ORDER_TRANSITIONS`, `canTransition`,
  `isPaidOrLater`, `isClosed`, `isBeforeQuote`, `QUOTE_STATUS_LABELS`, `QUOTE_STATUS_TONES`,
  `CANCEL_REASONS`.
- `@/lib/demo-pricing` (копейки): `MAX_LINE_QUANTITY`, `normalizePromoCode`, `findPromoCode`,
  `checkPromoCode(input, current)`, `preliminaryTotals(lines, promo)` (`total: null` при позициях
  «по запросу»), `toOrderPreliminary`, `lineTotal`, `promoDiscount`; форма менеджера — `QuoteDraft`,
  `quoteTotals`, `validateQuoteDraft` (коды `QuoteDraftErrorCode`: `no-lines`, `price-missing`,
  `price-invalid` — не число, `price-not-positive`, `quantity-invalid`, `discount-invalid` — не
  число, `discount-negative`, `discount-too-large`, `delivery-missing`, `delivery-invalid` — не
  число, `total-not-positive`; тексты — DESIGN §6.5), `suggestPromoDiscount`; поля в рублях —
  `parseRublesInput` (не число → `null`), **`parseMoneyField`** (пусто → `null`, не число → `NaN`,
  иначе копейки: «1 000 руб» — ошибка, а не тихий 0), `formatRublesInput`.
- `@/lib/demo-orders` (чистое ядро): `findOrder(data, number, email)` (чужой email → null),
  `findOrderByIdempotencyKey`, `ordersForEmail`, `notificationsForEmail`, `unreadCount`,
  `activeQuote`, `lastAnnulledQuote`, `displayedQuote`, `paymentHref(number, v)`, `pendingAttempt`,
  `statusReachedAt`, `statusTimeline(order)`, `orderAmount(order)`, `paymentPageState(order, v)`
  (коды C/X/B/A/D/E из DESIGN §2.15), `initialQuoteDraft(order)`, `nextManagerLineId`,
  `managerMessage(order, event)`; снимок — `snapshotItem`, **`specPointsOf(product)`** (пункты
  `getSpecLine` со статусами), **`orderItemSpec(item, product?)`** (параметры позиции для показа:
  `spec` как есть, у старых заказов — пункты `specSummary` со статусами из текущего каталога);
  **`sanitizeOrdersData(raw)`** (данные из localStorage → корректный `DemoOrdersData`); **`formatPhone`**
  («+79001234567» → «+7 900 123-45-67» с U+00A0, остальное как есть); операции `createOrder`,
  `startNegotiation`, `issueQuote`, `reopenQuote`, `advanceOrder`, `cancelOrder`, `startPayment`,
  `confirmPayment`, `declinePayment`, `markNotificationsRead`.
- `@/lib/demo-session`: код входа (`generateLoginCode`, `createLoginChallenge`, `requestCode`,
  `verifyCode`, `resendSecondsLeft`), объединение при входе (`mergeCartItems`, `mergeFavoriteIds`,
  `mergePromoCode`); **`safeNextPath(next, fallback = '/account', origin = location.origin)`** —
  внутренний путь для `?next=` через `new URL` (тот же origin, один ведущий «/», без управляющих
  символов и «\»), иначе `fallback`; **`sanitizeCartItems`, `sanitizeIds`, `sanitizeCartData`,
  `sanitizeFavoritesData`, `sanitizeSession`, `sanitizeLoginChallenge`, `sanitizeProfiles`** —
  проверка формы данных из localStorage (битое — по умолчанию, битые элементы списков отбрасываются).

## Хранилища браузера — `@/lib/store/*`

Селекторы должны возвращать стабильные значения.

- `storage`: `safeStorage` (localStorage с запасом в памяти вкладки), **`persistStorage`** (JSON
  persist, чтение никогда не бросает: невалидный JSON / чужая обёртка → пусто),
  **`safePersistOptions({ name, initial, sanitize, partialize? })`** — общие настройки persist:
  версия `STORAGE_VERSION`, несовместимая версия → `initial()`, слияние через `sanitize`, упавшая
  гидратация → хранилище считается прочитанным и пустым; `usePersistHydrated(store)`,
  `syncAcrossTabs(key, store)`, `refresh(store)`, `isPersistentStorageAvailable()`.
- `cart`: `useCart` (`items`, `promoCode`, `add(id, qty) → новое кол-во`, `setQuantity`,
  `remove(id) → {item, index} | null`, `restore(item, index)`, `clear`, `applyPromo(input)`,
  `removePromo`, `replace`), `useCartHydrated`, `useCartCount`, `useCartQuantity(id)`.
- `favorites`: `useFavorites` (`ids`, `toggle → boolean`, `add`, `remove`, `clear`, `replace`),
  `useFavoritesHydrated`, `useFavoritesCount`, `useIsFavorite(id)`.
- `session`: `useSessionHydrated`, `useSessionEmail`, `useSession`, `useLoginChallenge`,
  `useProfile(email)`, `requestLoginCode(email, { resend })` (код — `result.challenge.code`,
  показывать в DemoNotice), `verifyLoginCode(code)`, `loginResendSecondsLeft`,
  `cancelLoginChallenge`, `logout` (снимает и отметку отправленной заявки), `saveBuyerProfile`,
  `updateProfile`, `currentSessionEmail`, `clearProfiles`, `startProfileSync` (из StoreRuntime);
  **`rememberSubmittedOrder(number)`** — отметка «заявку отправили из этой вкладки» в
  sessionStorage (`antennas.demo.submitted-order`, 30 мин; вызывает `submitOrder`);
  **`useSubmittedOrderNumber()`** — номер такой заявки или null (на сервере и при гидратации — null).
- `orders`: `useDemoOrdersStore`, `useDemoOrdersHydrated`, `useMyOrders()`, `useMyOrder(number)`,
  `useMyNotifications()`, `useUnreadNotificationsCount()`, `submitOrder(input)` (идемпотентно,
  чистит корзину, помнит номер для `/checkout/success`, сохраняет данные покупателя в профиль),
  `demoManager.{takeIntoWork, issueQuote(n, draft), reopenQuote, advance(n, step), cancel(n, reason)}`,
  `startOrderPayment(n, v)`, `confirmOrderPayment(n, attemptId)`, `declineOrderPayment`,
  `markMyNotificationsRead({ ids?, orderNumber? })`, `resetDemoData()`.
- `toast`: `toast({ message, detail?, action?: { label, href? | onAction? }, tone?: 'status' | 'error', duration? }) → id`,
  `dismissToast(id)`, `MAX_TOASTS`. Объявление для скринридера — в постоянных live-регионах
  `ToastRegion` (`error` → `role="alert"`, иначе polite); видимые сообщения ролей не имеют.
- `@/lib/use-client-value`: `useIsClient`, `useStorageAvailable`, `useDebouncedValue`.

## Компоненты

Размеры кнопок — одна шкала: **sm 32 · md 40 · lg 48** (Button, IconButton, QuantitySelector).

- `ui/Button`: `Button` (`variant` primary|secondary|ghost|danger|link, `size` sm|md|lg,
  `tone` default|danger|inverse — у ghost/link, `icon`, `iconEnd`, `loading`, `loadingText`,
  `fullWidth: true | 'mobile'`), `ButtonLink` (+ `href`, `external`, `disabled`), `buttonClasses()`.
- `ui/IconButton` (`icon`, `label` — обязателен, `size` sm 32 | md 40 | **lg 48** | **header 44** —
  кнопка меню шапки на < lg, `variant` ghost|secondary|inverse, `pressed`, `filledWhenPressed`),
  `iconButtonClasses()`. Цель 44 на < lg при `sm` — `className="max-lg:min-h-11 max-lg:min-w-11"`.
- `ui/QuantitySelector` (`value`, `onChange`, `productName`, `size` sm 32 | md 40 (на < lg — 48) |
  lg 48 — полная высота с рамкой, `commitDelayMs`, `disabled`).
- `ui/Field` (`label`, `hint`, `error`, `optional`, `id`, `labelHidden`, `counter`) + `Input`
  (`size` sm 36 | md 40 | lg 44, `prefix`, `suffix`, `invalid`), `Textarea`, `Select`,
  `ErrorSummary`, `FieldError`; `ui/Choice`: `Checkbox` (`count`, `description`, `comfortable` —
  строка 44 px), `Radio`, `ChoiceGroup`, `Segmented`.
- `ui/Badge` (`tone` neutral|info|success|warning|danger|brand|demo, `dot`), `DemoBadge`,
  `NeedsReviewBadge`, `StatusBadge`.
- `ui/Notice` (`tone`, `title`, `actions`, `live`); `DemoNotice` (`variant` inline|panel, `title`,
  `headingLevel`, `headingSize` title|body, `compact`).
- `ui/Dialog`: `Modal`, `ConfirmDialog`, `Drawer` (на `<dialog>`, фокус возвращается на триггер;
  `[data-autofocus]` внутри — цель фокуса при открытии).
- `ui/Toast`: `ToastRegion` — один, в корневом layout: два постоянных `sr-only` live-региона
  (polite / assertive) + видимый регион «Сообщения».
- `ui/Price` (`amount` в копейках | null, `size` sm|md|lg|xl, `requestForm` full|compact),
  `ui/BandScale` (`min`, `max`, `status`, `size` sm|lg, `tone` brand|neutral — по умолчанию `lg` →
  brand, `sm` → neutral) + `ProductBandScale({ product, size, tone? })`,
  `ui/NoPhoto` (`categoryId` корня, `variant` product — 4:3 со знаком 72 | thumb — значок,
  `size` 40 | 48 у thumb), `ui/CategoryGlyph`, `ui/Pagination` (`page`, `pageCount`, `hrefs`,
  `focusTargetId` — фокус только после клика по ссылке пагинации, `PaginationFocus`),
  `ui/EmptyState` (`title`, `headingLevel`, `actions`), `ui/Skeleton`, `SkeletonGroup`,
  `SkeletonRows`, `SkeletonSummary`, `ui/Spinner`, `ui/JsonLd`, `ui/StorageNotice`,
  `ui/Icon` (`name`, `size` 12|16|20|24|32, `filled`).
- `layout/Breadcrumbs` (`items`, `jsonLd`), `layout/PageHeader` (`title`, `titleAddon`, `meta`,
  `description`, `actions`, `titleId`), `layout/SearchForm` (`variant` hero|compact, `defaultValue`,
  `examples`; ориентир «Поиск по каталогу»), `layout/SearchCombobox` / `HeaderSearch` (шапка;
  ориентир «Быстрый поиск», индекс с `/api/search-index`).
- `catalog/CatalogView` (`products`, `categories`, `categoryId`, `rootCategoryId`, `basePath`,
  `label`) — выдача целиком, URL пишет `history.replaceState`; `catalog/CategoryNav` (`label`,
  `items`), `catalog/ResultsGrid` (`withPanel`), `catalog/Toolbar`: `ResultCount`, `SortSelect`,
  `ViewToggle` (`iconsOnly`, `tableFrom` lg|wide — с какой ширины подпись «Таблица»), `sortLabel`.
- `product/ProductCard` (`product`, `variant` default|compact, `categoryName`, `headingLevel`);
  `product/ProductPhoto` (`src`, `alt`, `sizes`, `preload`) — фото 4:3, `object-contain`;
  `product/ProductRow`: `columnsForCategory`, `columnHeader`, `cellValue`, `ProductTable`,
  `ProductList`, `ProductListItem`, `ProductRow`, `ProductTableHead`, `hasInferredValues`;
  `AddToCartButton` (`mode` link-when-added|add-more, `compactOnMobile`), `FavoriteButton`,
  `ProductPurchase`, `SpecLine` (+ `StatusValue`, `TechText({ text })` — текст с неразрывными
  техническими значениями, `INFERRED_FOOTNOTE`, `specLineHasInferred`), `SpecTable`,
  `SourceDetails` / `SharedSourceDetails` (источник один раз под таблицей).

Имена иконок: `search`, `x`, `menu`, `chevron-down`, `chevron-left`, `chevron-right`, `check`,
`plus`, `minus`, `bookmark`, `shopping-cart`, `user`, `log-out`, `trash-2`, `info`,
`circle-check`, `circle-alert`, `triangle-alert`, `send`, `external-link`, `sliders-horizontal`,
`rows-3`, `layout-grid`, `file-text`, `bell`, `copy`, `loader-circle`, `printer`.
