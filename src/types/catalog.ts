/**
 * Контракт данных каталога.
 *
 * Данные генерирует `scripts/import-catalog.mjs` из выгрузки Excel
 * (`source/Catalog_v11_for_Claude.md`) в `src/data/*.generated.json`. Компоненты
 * получают их только через `src/lib/repository.ts` — при сращивании с Admik
 * меняется репозиторий, а не интерфейс.
 *
 * Принципы (ТЗ §4, §12):
 * - у каждой характеристики есть статус достоверности и происхождение (ячейка);
 * - неизвестное значение — отсутствие характеристики, а не false и не ноль;
 * - цена «по запросу» — отдельный тип цены, `price === null`;
 * - деньги — в минимальных единицах (копейки), валюта RUB — предположение.
 */

// ---------------------------------------------------------------------------
// Источник: строки Excel.
// ---------------------------------------------------------------------------

export type SheetName = '1' | '2';

/** Независимые колонки-блоки книги: B/C, E/F, H/I на листе 1 и C/D на листе 2. */
export type SourceBlock = 'B/C' | 'E/F' | 'H/I' | 'C/D';

export type SourceRecordKind =
  /** Товарная строка. */
  | 'product'
  /** Заголовок группы («Антенны:», «МШУ:»…). В B3/C3 цена — заголовок колонки «Цена». */
  | 'group-header'
  /** Техническое примечание (B46, E57). */
  | 'note';

/** Что импорт сделал со строкой. */
export type SourceResolution =
  /** Создан товар. */
  | 'created'
  /** Точный повтор другой строки — привязан к тому же товару как второе происхождение. */
  | 'merged-duplicate'
  /** Строка листа 2 конфликтует с товаром листа 1 — сохранена для сопоставления, карточка не создана. */
  | 'conflict-attached'
  /** Заголовок — не товар. */
  | 'excluded-header'
  /** Групповое примечание применено к товарам группы (с происхождением). */
  | 'group-note-applied'
  /** Групповое примечание сохранено, но не применено: область действия не подтверждена. */
  | 'group-note-pending';

export interface SourceRecord {
  /** Стабильный id: `s1-B4`, `s2-C13`. */
  id: string;
  sheet: SheetName;
  block: SourceBlock;
  row: number;
  nameCell: string;
  priceCell: string;
  /** Исходный текст ячейки — буквально, без исправлений. */
  rawText: string;
  /** Исходная цена — буквально («13000», «по запросу», «»). */
  rawPrice: string;
  kind: SourceRecordKind;
  /** Текст заголовка группы, под которым стоит строка («Антенны:»). */
  groupHeader: string | null;
  resolution: SourceResolution;
  /**
   * Товар, к которому относится строка. Для заголовков и групповых примечаний — null (примечание
   * относится к группе; связь видна по `origin` характеристик и `ProductNote.cell`). Может указывать
   * на товар, скрытый в overrides.json, — его нет в products, но строка остаётся в отчёте.
   */
  productId: string | null;
  /** Связанные проблемы импорта. */
  issueIds: string[];
  /**
   * Типизированный разбор строки — у всех товарных строк (created, merged-duplicate,
   * conflict-attached; у заголовков и примечаний поля нет). Характеристики — из самой строки, её
   * заголовка группы и применённого группового примечания, с происхождением. У conflict-attached
   * это разбор строки листа 2: странице `/import-report` и разбору конфликтов в Admik не нужно
   * парсить исходник заново. Добавлено аддитивно.
   */
  parsed?: SourceRecordParsed;
}

/** Разбор товарной строки (см. `SourceRecord.parsed`). */
export interface SourceRecordParsed {
  priceType: PriceType;
  /** Цена строки в копейках; null — «по запросу». */
  price: number | null;
  attributes: ProductAttribute[];
}

// ---------------------------------------------------------------------------
// Характеристики.
// ---------------------------------------------------------------------------

export type Unit = 'MHz' | 'GHz' | 'dBi' | 'dB' | 'g' | 'm' | 'cm' | 'kg' | 'W';

export type AttrValue =
  /** Диапазон, границы включительно. */
  | { kind: 'range'; min: number; max: number; unit: Unit | null }
  | { kind: 'number'; value: number; unit: Unit | null }
  | { kind: 'text'; value: string }
  /** Несколько значений без подтверждённой модели вариантов (кабель RG-316 / RG-142). */
  | { kind: 'list'; values: string[] }
  /** Явно указанный признак (IP67). Отсутствие признака в строке ≠ false. */
  | { kind: 'flag' };

/**
 * Достоверность значения.
 * - confirmed — прямо написано в строке (или в применимом групповом заголовке/примечании);
 * - inferred — единица/смысл приняты по контексту (частота без «МГц»);
 * - needs-review — спорное или неоднозначное значение (ГГц у МШУ, «N/sma-мама»,
 *   «0.4 затухание» без единицы). Не участвует в числовой фильтрации.
 */
export type AttrStatus = 'confirmed' | 'inferred' | 'needs-review';

export type AttrOriginKind =
  /** Из самой товарной строки. */
  | 'row'
  /** Из заголовка группы («Мачты карбоновые:» → материал «карбон»). */
  | 'group-header'
  /** Из группового примечания (B46 «на МШУ стоят оба sma-female»). */
  | 'group-note'
  /** Ручная правка из `src/data/overrides.json`. */
  | 'manual';

export interface AttrOrigin {
  kind: AttrOriginKind;
  /** Ячейка-источник: `1!B4`. Для manual — null. */
  cell: string | null;
}

/**
 * Коды характеристик. Единицы хранения:
 * частоты — МГц (кроме спорных — хранятся в исходной единице со статусом needs-review);
 * масса — граммы; длина кабеля — сантиметры; размер/высота — метры.
 */
export type AttrCode =
  | 'frequency'
  | 'gain_dbi'
  | 'gain_db'
  | 'antenna_design'
  | 'model'
  | 'connector'
  | 'port1_connector'
  | 'port2_connector'
  | 'port1_shape'
  | 'port2_shape'
  | 'cable_type'
  | 'cable_length'
  | 'ip67'
  | 'power_connector'
  | 'weight'
  | 'size'
  | 'height'
  | 'max_load'
  | 'material'
  | 'attenuation_range'
  | 'max_power'
  | 'insertion_loss'
  | 'rejection'
  | 'filter_group'
  | 'compatible_model';

export interface ProductAttribute {
  code: AttrCode;
  value: AttrValue;
  status: AttrStatus;
  origin: AttrOrigin;
  /** Фрагмент исходного текста, из которого получено значение. */
  raw: string;
  /** Пояснение для покупателя/менеджера («единица в прайсе не указана»). */
  note?: string;
}

// ---------------------------------------------------------------------------
// Товар.
// ---------------------------------------------------------------------------

export type PriceType = 'fixed' | 'request';

export type CurrencyCode = 'RUB';

export interface ProductNote {
  /** Буквальный текст пометки («на управу», «под рупор !», групповое примечание). */
  text: string;
  cell: string;
  kind: 'row-note' | 'group-note';
  /** Для групповой заметки с неподтверждённой областью действия — false. */
  scopeConfirmed: boolean;
}

export interface Product {
  /** Стабильный технический id = slug. Не заводской артикул. */
  id: string;
  slug: string;
  /** Внутренний код позиции (`ANT-001`) — генерируется, не артикул изготовителя. */
  code: string;
  /** Отображаемое название. Единицы в названии — только те, что есть в исходной строке. */
  name: string;
  /** Листовая категория. */
  categoryId: string;
  /** Путь категорий от корня: ['antennas', 'antennas-log-periodic']. */
  categoryPath: string[];
  model: string | null;
  priceType: PriceType;
  /** Цена в копейках; null — «по запросу». */
  price: number | null;
  currency: CurrencyCode;
  attributes: ProductAttribute[];
  notes: ProductNote[];
  /** Пути к фото; в исходных данных фото нет. */
  images: string[];
  /** Все строки-источники товара (основная — первая). */
  sourceIds: string[];
  /** Проблемы импорта, затрагивающие товар. */
  issueIds: string[];
  /** Исходный порядок в прайсе — сортировка по умолчанию. */
  sortIndex: number;
  /** Нормализованный текст для поиска (см. src/lib/search-normalize.ts). */
  searchText: string;
}

// ---------------------------------------------------------------------------
// Категории.
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  /** Сегмент URL. Полный путь — `/catalog/<parent slug>/<slug>`. */
  slug: string;
  name: string;
  parentId: string | null;
  /** Короткое фактическое пояснение без маркетинга (может быть пустым). */
  description: string;
  sortIndex: number;
}

// ---------------------------------------------------------------------------
// Импорт: проблемы и отчёт.
// ---------------------------------------------------------------------------

export type IssueSeverity = 'conflict' | 'review' | 'info';

export type IssueCode =
  /** Лист 2 расходится с листом 1 по цене/характеристикам. */
  | 'sheet-conflict'
  /** Строка повторяет другую строку того же блока. */
  | 'duplicate-row'
  /** Спорная единица («6000–8000 ГГц»). */
  | 'disputed-unit'
  /** Единица не указана, принята по контексту. */
  | 'inferred-unit'
  /** Неоднозначный разъём (Тип8 «N/sma-мама»). */
  | 'ambiguous-connector'
  /** Групповое примечание с неясной областью действия (E57). */
  | 'group-note-scope'
  /** Несколько материалов кабеля без модели вариантов. */
  | 'cable-variants'
  /** Цена «по запросу». */
  | 'price-on-request'
  /** Одинаковый диапазон у разных позиций — не объединены. */
  | 'same-range-different-items'
  /** Неизвестная единица характеристики («0.4 затухание»). */
  | 'unknown-unit'
  /** Пометка непонятного смысла («на управу», «под рупор !»). */
  | 'unclear-note'
  /** Тип антенны не классифицирован по исходнику. */
  | 'unclassified';

export interface ImportIssue {
  id: string;
  severity: IssueSeverity;
  code: IssueCode;
  title: string;
  details: string;
  sourceIds: string[];
  productIds: string[];
  /**
   * Построчное сравнение полей листа 1 и листа 2 — только у `sheet-conflict`.
   * Нужно странице `/import-report` и будущему разбору конфликтов в Admik без повторного парсинга.
   */
  fields?: IssueFieldDiff[];
}

/** Одно поле в сравнении строк листов (проблема `sheet-conflict`). */
export interface IssueFieldDiff {
  /** 'rawText' | 'price' | 'gain' (КУ в дБи или дБ — как в строке) | код характеристики. */
  field: string;
  label: string;
  /** Значение в строке листа 1 (товар витрины); null — в строке не указано. */
  sheet1: string | null;
  /** Значение в строке листа 2; null — в строке не указано. */
  sheet2: string | null;
  differs: boolean;
}

/** Что сделал ручной слой `src/data/overrides.json`. */
export interface OverridesSummary {
  /** sha256 файла overrides.json (пустая строка — файла нет). */
  hash: string;
  /** Скрыты из витрины; их строки-источники и проблемы остаются в отчёте. */
  hiddenProductIds: string[];
  renamedProductIds: string[];
  imagesProductIds: string[];
  /** Принятые ручные рекомендации (basis 'manager'). */
  recommendationsApplied: number;
  /** Черновые связи из названий прайса, подтверждённые в overrides.json (добавлено аддитивно). */
  recommendationsApproved: number;
  /** Отброшенные рекомендации и ссылки на несуществующие товары. */
  warnings: string[];
}

export interface ImportReport {
  /** Хэш исходного файла — повторный импорт того же файла даёт тот же результат. */
  sourceHash: string;
  sourceFile: string;
  counts: {
    rowsRead: number;
    productRows: {
      total: number;
      bySheet: Record<SheetName, number>;
      byBlock: Record<SourceBlock, number>;
    };
    headersExcluded: number;
    notes: number;
    productsCreated: number;
    mergedDuplicates: number;
    conflictsAttached: number;
    issuesBySeverity: Record<IssueSeverity, number>;
    /**
     * «Отправлено на проверку» (ТЗ §4 п.2): созданных товаров (включая скрытые в overrides) хотя бы
     * с одной проблемой severity 'review' или 'conflict'. Добавлено аддитивно.
     */
    productsWithReviewIssues: number;
    /** Строк-источников (любого вида) хотя бы с одной проблемой любой severity. Добавлено аддитивно. */
    sourceRowsWithIssues: number;
  };
  /** Итог наложения ручного слоя (добавлено аддитивно; импорт заполняет всегда). */
  overrides?: OverridesSummary;
}

// ---------------------------------------------------------------------------
// Рекомендации («К этому товару подойдёт»).
// ---------------------------------------------------------------------------

/**
 * Проверка связи менеджером (ТЗ §7): 'draft' — черновая (связь из названия прайса, совместимость
 * не проверена), 'approved' — подтверждена менеджером в overrides.json.
 */
export type RecommendationStatus = 'draft' | 'approved';

export interface ProductRecommendation {
  productId: string;
  recommendedId: string;
  /** Порядок показа. */
  position: number;
  /** Пояснение менеджера. */
  note: string;
  /**
   * Основание связи. 'source-name' — связь прямо следует из названия в прайсе
   * («Чехол для тип2» → антенна Тип2). 'manager' — добавлена менеджером.
   */
  basis: 'source-name' | 'manager';
  /** Добавлено аддитивно. По ТЗ §7 проверенной совместимостью считается только 'approved'. */
  status: RecommendationStatus;
}
