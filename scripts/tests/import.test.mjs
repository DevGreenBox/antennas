/**
 * Приёмка импорта каталога (ТЗ §4, §14; docs/DATA-RULES.md).
 *
 * Импорт каждый раз запускается во временной копии проекта (скрипт, модуль поиска, источник,
 * overrides.json), поэтому тесты не зависят от того, запускали ли `npm run import:catalog`, и не
 * трогают рабочие файлы. Отдельный тест сверяет сгенерированные файлы проекта со свежим прогоном.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SOURCE_FILE = 'source/Catalog_v11_for_Claude.md';
const OVERRIDES_FILE = 'src/data/overrides.json';
const INPUTS = [
  'scripts/import-catalog.mjs',
  'src/lib/search-normalize.ts',
  SOURCE_FILE,
  OVERRIDES_FILE,
];
const OUTPUTS = [
  'src/data/products.generated.json',
  'src/data/categories.generated.json',
  'src/data/source-records.generated.json',
  'src/data/import-issues.generated.json',
  'src/data/import-report.generated.json',
  'src/data/recommendations.generated.json',
  'docs/IMPORT-REPORT.md',
];
const EMPTY_OVERRIDES = { products: {}, recommendations: [] };

const tempDirs = [];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Временная копия проекта с входами импорта; overrides — объект или null (взять файл проекта). */
function makeProjectCopy({ overrides = EMPTY_OVERRIDES, source = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'antennas-import-'));
  tempDirs.push(dir);
  for (const rel of INPUTS) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  }
  if (overrides !== null) {
    writeFileSync(path.join(dir, OVERRIDES_FILE), `${JSON.stringify(overrides, null, 2)}\n`);
  }
  if (source !== null) writeFileSync(path.join(dir, SOURCE_FILE), source);
  return dir;
}

function runImport(dir) {
  return spawnSync(process.execPath, [path.join(dir, 'scripts/import-catalog.mjs')], {
    encoding: 'utf8',
  });
}

function importOk(dir) {
  const result = runImport(dir);
  assert.equal(result.status, 0, `импорт упал:\n${result.stderr}`);
  return result;
}

function readJson(dir, rel) {
  return JSON.parse(readFileSync(path.join(dir, rel), 'utf8'));
}

function loadData(dir) {
  return {
    products: readJson(dir, 'src/data/products.generated.json'),
    categories: readJson(dir, 'src/data/categories.generated.json'),
    records: readJson(dir, 'src/data/source-records.generated.json'),
    issues: readJson(dir, 'src/data/import-issues.generated.json'),
    report: readJson(dir, 'src/data/import-report.generated.json'),
    recommendations: readJson(dir, 'src/data/recommendations.generated.json'),
    markdown: readFileSync(path.join(dir, 'docs/IMPORT-REPORT.md'), 'utf8'),
  };
}

function hashOutputs(dir) {
  return Object.fromEntries(OUTPUTS.map((rel) => [rel, sha256(readFileSync(path.join(dir, rel)))]));
}

let data;
let search;

const product = (id) => {
  const found = data.products.find((p) => p.id === id);
  assert.ok(found, `нет товара ${id}`);
  return found;
};
const record = (id) => {
  const found = data.records.find((r) => r.id === id);
  assert.ok(found, `нет строки-источника ${id}`);
  return found;
};
const attr = (p, code) => p.attributes.find((a) => a.code === code);
const byPrimarySource = (sourceId) => data.products.find((p) => p.sourceIds[0] === sourceId);
const issuesOf = (code) => data.issues.filter((issue) => issue.code === code);

before(async () => {
  const dir = makeProjectCopy();
  importOk(dir);
  data = loadData(dir);
  // Модуль поиска — .ts без "type": "module" в package.json: глушим только этот шумный warning.
  const listeners = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.code !== 'MODULE_TYPELESS_PACKAGE_JSON') for (const l of listeners) l(warning);
  });
  search = await import(pathToFileURL(path.join(ROOT, 'src/lib/search-normalize.ts')).href);
});

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('счётчики и строки-источники', () => {
  test('113 товарных строк листа 1 (44/54/15), 19 листа 2, всего 132; создано 118 товаров', () => {
    const { counts } = data.report;
    assert.deepEqual(counts.productRows, {
      total: 132,
      bySheet: { 1: 113, 2: 19 },
      byBlock: { 'B/C': 44, 'E/F': 54, 'H/I': 15, 'C/D': 19 },
    });
    assert.equal(data.records.filter((r) => r.kind === 'product').length, 132);
    assert.equal(counts.productsCreated, 118);
    assert.equal(counts.mergedDuplicates, 4);
    assert.equal(counts.conflictsAttached, 10);
    assert.equal(data.products.length, 118);
  });

  test('сохранены все непустые строки: 146, из них 12 заголовков и 2 примечания', () => {
    assert.equal(data.records.length, 146);
    assert.equal(data.report.counts.rowsRead, 146);
    const headers = data.records.filter((r) => r.kind === 'group-header').map((r) => r.id);
    assert.deepEqual(headers, [
      's1-B3',
      's1-B24',
      's1-B34',
      's1-B37',
      's1-B48',
      's1-E3',
      's1-E59',
      's1-H3',
      's2-C3',
      's2-C12',
      's2-C19',
      's2-C22',
    ]);
    const notes = data.records.filter((r) => r.kind === 'note').map((r) => r.id);
    assert.deepEqual(notes, ['s1-B46', 's1-E57']);
  });

  test('заголовки и примечания B46/E57 не стали товарами', () => {
    const allSourceIds = new Set(data.products.flatMap((p) => p.sourceIds));
    for (const r of data.records.filter((x) => x.kind !== 'product')) {
      assert.equal(r.productId, null, `${r.id} привязан к товару`);
      assert.ok(!allSourceIds.has(r.id), `${r.id} — источник товара`);
    }
    for (const r of data.records.filter((x) => x.kind === 'group-header')) {
      assert.equal(r.resolution, 'excluded-header');
    }
    assert.equal(record('s1-B46').resolution, 'group-note-applied');
    assert.equal(record('s1-E57').resolution, 'group-note-pending');
    assert.equal(record('s1-B3').rawPrice, 'Цена');
    assert.equal(record('s2-C3').rawPrice, 'Цена');
  });

  test('исходный текст и цена — буквально', () => {
    assert.equal(record('s1-B13').rawText, 'Тип10 рупорная (2000-3000, КУ=19 дБи, N-мама) ');
    assert.equal(record('s1-B38').rawText, '50-1000 МГц, КУ=20 дБ, , IP67, XT60');
    assert.equal(record('s1-B32').rawText, 'М8 (1400-1700 МГц, КУ=9-11 дБи)');
    assert.equal(record('s1-B18').rawPrice, 'по запросу');
    assert.equal(record('s1-B24').rawPrice, '');
    const b4 = record('s1-B4');
    assert.deepEqual(
      [b4.sheet, b4.block, b4.row, b4.nameCell, b4.priceCell, b4.groupHeader],
      ['1', 'B/C', 4, 'B4', 'C4', 'Антенны:'],
    );
  });

  test('импорт падает с понятной ошибкой, если счёт строк не сходится', () => {
    const source = readFileSync(path.join(ROOT, SOURCE_FILE), 'utf8');
    const broken = source.replace(
      '| 60 | E60 | регулировка от 0 до 31 дБ, до 5 Вт | F60 | 4000 |\n',
      '',
    );
    assert.notEqual(broken, source);
    const dir = makeProjectCopy({ source: broken });
    const result = runImport(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Импорт каталога остановлен: счёт товарных строк не сходится/);
    assert.match(result.stderr, /блок E\/F: 53 товарных строк, ожидалось 54/);
  });
});

describe('строки-источники против выгрузки (независимое чтение)', () => {
  // Свой простой разбор markdown — не код импорта: регулярка по строке таблицы целиком.
  const ROW_RE = /^\| (\d+) \| ([A-Z])(\d+) \| (.*) \| ([A-Z])(\d+) \| (.*) \|$/;
  const BLOCK_BY_LETTER = { 1: { B: 'B/C', E: 'E/F', H: 'H/I' }, 2: { C: 'C/D' } };
  // Заголовки и примечания — по перечню DATA-RULES §1, а не по правилу классификации импорта.
  const HEADERS = ['1!B3', '1!B24', '1!B34', '1!B37', '1!B48', '1!E3', '1!E59', '1!H3'].concat([
    '2!C3',
    '2!C12',
    '2!C19',
    '2!C22',
  ]);
  const NOTES = ['1!B46', '1!E57'];

  test('все 146 записей: лист, блок, ячейки, rawText/rawPrice буквально, kind, порядок', () => {
    const expected = [];
    let sheet = null;
    for (const line of readFileSync(path.join(ROOT, SOURCE_FILE), 'utf8').split('\n')) {
      const heading = /^## Лист `(\d)`$/.exec(line);
      if (heading) {
        sheet = heading[1];
        continue;
      }
      if (line.startsWith('## ')) sheet = null;
      const m = ROW_RE.exec(line);
      if (sheet === null || !m) continue;
      const cell = `${sheet}!${m[2]}${m[3]}`;
      expected.push({
        id: `s${sheet}-${m[2]}${m[3]}`,
        sheet,
        block: BLOCK_BY_LETTER[sheet][m[2]],
        row: Number(m[1]),
        nameCell: `${m[2]}${m[3]}`,
        priceCell: `${m[5]}${m[6]}`,
        rawText: m[4],
        rawPrice: m[7],
        kind: HEADERS.includes(cell) ? 'group-header' : NOTES.includes(cell) ? 'note' : 'product',
      });
    }
    assert.equal(expected.length, 146);
    const actual = data.records.map((r) => ({
      id: r.id,
      sheet: r.sheet,
      block: r.block,
      row: r.row,
      nameCell: r.nameCell,
      priceCell: r.priceCell,
      rawText: r.rawText,
      rawPrice: r.rawPrice,
      kind: r.kind,
    }));
    assert.deepEqual(actual, expected);
    assert.equal(expected.filter((r) => r.kind === 'product').length, 132);
  });

  test('parsed есть у всех 132 товарных строк и только у них', () => {
    for (const r of data.records) assert.equal('parsed' in r, r.kind === 'product', r.id);
    // У строки, создавшей товар, разбор совпадает с карточкой.
    for (const p of data.products) {
      const parsed = record(p.sourceIds[0]).parsed;
      assert.deepEqual(parsed.attributes, p.attributes, p.id);
      assert.deepEqual([parsed.priceType, parsed.price], [p.priceType, p.price], p.id);
    }
    // Повтор — свой разбор со своей ячейкой.
    const e49 = record('s1-E49').parsed;
    assert.equal(e49.price, 1_780_000);
    assert.equal(e49.attributes.find((a) => a.code === 'frequency').origin.cell, '1!E49');
    // Применённое групповое примечание входит в разбор строки своей группы.
    const b38 = record('s1-B38').parsed.attributes;
    assert.equal(b38.find((a) => a.code === 'port1_connector').origin.cell, '1!B46');
  });

  test('parsed конфликтных строк листа 2: Тип1–3 и M1–M5 — gain_db, не gain_dbi', () => {
    for (const id of [
      's2-C4',
      's2-C5',
      's2-C6',
      's2-C13',
      's2-C14',
      's2-C15',
      's2-C16',
      's2-C17',
    ]) {
      const { attributes } = record(id).parsed;
      const gain = attributes.find((a) => a.code === 'gain_db');
      assert.ok(gain, id);
      assert.equal(gain.value.unit, 'dB', id);
      assert.equal(
        attributes.find((a) => a.code === 'gain_dbi'),
        undefined,
        id,
      );
      for (const a of attributes) assert.equal(a.origin.cell, `2!${id.slice(3)}`, id);
    }
    assert.deepEqual(record('s2-C4').parsed.attributes.find((a) => a.code === 'gain_db').value, {
      kind: 'number',
      value: 10,
      unit: 'dB',
    });
    assert.deepEqual(
      [record('s2-C4').parsed.priceType, record('s2-C4').parsed.price],
      ['fixed', 1_200_000],
    );
    assert.deepEqual(record('s2-C13').parsed.attributes.find((a) => a.code === 'gain_db').value, {
      kind: 'range',
      min: 8,
      max: 10,
      unit: 'dB',
    });
  });

  test('отправлено на проверку: productsWithReviewIssues и sourceRowsWithIssues', () => {
    const severity = new Map(data.issues.map((i) => [i.id, i.severity]));
    const products = data.products.filter((p) =>
      p.issueIds.some((id) => severity.get(id) !== 'info'),
    ).length;
    const rows = data.records.filter((r) => r.issueIds.length > 0).length;
    assert.equal(data.report.counts.productsWithReviewIssues, products);
    assert.equal(data.report.counts.sourceRowsWithIssues, rows);
    assert.deepEqual([products, rows], [94, 78]);
  });
});

describe('конфликты листов: полнота расхождений', () => {
  const rub = (amount) => `${amount.replace(' ', ' ')} ₽`;
  const antenna = (s1, s2, price, freq, gain1, gain2) => [
    s1,
    s2,
    {
      price: [rub(price[0]), rub(price[1])],
      frequency: [freq, freq],
      gain: [gain1, gain2],
      connector: ['N-female', null],
      antenna_design: ['логопериодическая', null],
    },
  ];
  const cover = (s1, s2, price, model) => [
    s1,
    s2,
    {
      price: [rub(price[0]), rub(price[1])],
      frequency: [null, null],
      gain: [null, null],
      connector: [null, null],
      compatible_model: [model, model],
    },
  ];
  const mini = (s1, s2, price, freq, gain1) => [
    s1,
    s2,
    {
      price: [rub(price[0]), rub(price[1])],
      frequency: [freq, freq],
      gain: [gain1, '8–10 дБ'],
      connector: [null, null],
    },
  ];
  const CONFLICTS = [
    antenna('s1-B4', 's2-C4', ['13 000', '12 000'], '700–1100 МГц', '12 дБи', '10 дБ'),
    antenna('s1-B5', 's2-C5', ['16 000', '15 000'], '360–980 МГц', '12 дБи', '10 дБ'),
    antenna('s1-B6', 's2-C6', ['16 000', '15 000'], '255–375 МГц', '13 дБи', '11 дБ'),
    cover('s1-B20', 's2-C9', ['8 500', '8 000'], 'Тип2'),
    cover('s1-B21', 's2-C10', ['11 000', '10 500'], 'Тип3'),
    mini('s1-B25', 's2-C13', ['3 000', '5 000'], '1100–1600 МГц', '7–9 дБи'),
    mini('s1-B26', 's2-C14', ['3 000', '5 000'], '1600–2200 МГц', '9–11 дБи'),
    mini('s1-B27', 's2-C15', ['3 000', '5 000'], '2200–2900 МГц', '10–12 дБи'),
    mini('s1-B28', 's2-C16', ['5 000', '5 000'], '2200–6000 МГц', '10–12 дБи'),
    mini('s1-B29', 's2-C17', ['3 000', '5 000'], '5000–6000 МГц', '10–12 дБи'),
  ];

  test('все 10 конфликтов: поля и значения обоих листов, флаг расхождения', () => {
    assert.equal(issuesOf('sheet-conflict').length, CONFLICTS.length);
    for (const [s1, s2, values] of CONFLICTS) {
      const issue = issuesOf('sheet-conflict').find((i) => i.sourceIds.includes(s2));
      assert.ok(issue, s2);
      assert.deepEqual(issue.sourceIds, [s1, s2]);
      assert.deepEqual(issue.productIds, [record(s1).productId]);
      const expected = [
        { field: 'rawText', sheet1: record(s1).rawText, sheet2: record(s2).rawText },
        ...Object.entries(values).map(([field, [a, b]]) => ({ field, sheet1: a, sheet2: b })),
      ];
      assert.deepEqual(
        issue.fields.map(({ field, sheet1, sheet2 }) => ({ field, sheet1, sheet2 })),
        expected,
        s2,
      );
      for (const f of issue.fields)
        assert.equal(f.differs, f.sheet1 !== f.sheet2, `${s2} ${f.field}`);
      // Каждое расхождение названо в details.
      for (const f of issue.fields.filter((x) => x.differs && x.field !== 'rawText')) {
        assert.ok(
          issue.details.includes(`(${f.sheet1 ?? 'не указано'} / ${f.sheet2 ?? 'не указано'})`),
          `${s2} ${f.field}`,
        );
      }
    }
  });
});

describe('повторы и одинаковые диапазоны', () => {
  test('E49–E52 — merged-duplicate к товарам тех же строк выше: 4 карточки, не 8', () => {
    // В ТЗ сказано «E44–E47», но по данным повторяются E44, E46, E47, E48 (E45 = 6300–6500).
    const pairs = {
      's1-E49': 's1-E44',
      's1-E50': 's1-E46',
      's1-E51': 's1-E47',
      's1-E52': 's1-E48',
    };
    for (const [dupId, origId] of Object.entries(pairs)) {
      const dup = record(dupId);
      const orig = record(origId);
      assert.equal(dup.rawText, orig.rawText);
      assert.equal(dup.resolution, 'merged-duplicate');
      assert.equal(orig.resolution, 'created');
      assert.equal(dup.productId, orig.productId);
      assert.deepEqual(product(orig.productId).sourceIds, [origId, dupId]);
      assert.ok(issuesOf('duplicate-row').some((i) => i.sourceIds.includes(dupId)));
    }
    const ranges = ['6100-6500', '6500-6900', '6400-7100', '6900-7300'];
    for (const rangeText of ranges) {
      const cards = data.products.filter((p) => p.id === `bandpass-filter-${rangeText}`);
      assert.equal(cards.length, 1, rangeText);
    }
    assert.equal(record('s1-E45').resolution, 'created');
    assert.equal(issuesOf('duplicate-row').length, 4);
  });

  test('2100–2700 МГц — три разных товара: E9, E20 и лист 2 C25', () => {
    const ids = ['s1-E9', 's1-E20', 's2-C25'].map((id) => record(id).productId);
    assert.equal(new Set(ids).size, 3);
    assert.deepEqual(
      ids.map((id) => product(id).price),
      [2_400_000, 1_780_000, 1_500_000],
    );
    assert.equal(product(ids[0]).categoryId, 'rf-filters-bandpass');
    assert.equal(product(ids[2]).categoryId, 'rf-filters-cavity');
    const issue = issuesOf('same-range-different-items').find((i) => i.sourceIds.includes('s1-E9'));
    assert.ok(issue);
    assert.equal(issue.severity, 'info');
    assert.deepEqual([...issue.productIds].sort(), [...ids].sort());
  });
});

describe('характеристики', () => {
  test('Тип1 листа 1: 700–1100 МГц confirmed, 12 дБи, N-female, 1 300 000 коп.', () => {
    const tip1 = byPrimarySource('s1-B4');
    assert.equal(tip1.id, 'antenna-tip1');
    assert.deepEqual(attr(tip1, 'frequency').value, {
      kind: 'range',
      min: 700,
      max: 1100,
      unit: 'MHz',
    });
    assert.equal(attr(tip1, 'frequency').status, 'confirmed');
    assert.deepEqual(attr(tip1, 'gain_dbi').value, { kind: 'number', value: 12, unit: 'dBi' });
    assert.equal(attr(tip1, 'gain_db'), undefined);
    assert.deepEqual(attr(tip1, 'connector').value, { kind: 'text', value: 'N-female' });
    assert.equal(attr(tip1, 'connector').raw, 'N-мама');
    assert.equal(tip1.priceType, 'fixed');
    assert.equal(tip1.price, 1_300_000);
    assert.equal(tip1.currency, 'RUB');
    assert.equal(tip1.model, 'Тип1');
    assert.deepEqual(tip1.categoryPath, ['antennas', 'antennas-log-periodic']);
  });

  test('Тип1 листа 2 (12000, 10 дБ) — conflict-attached и проблема sheet-conflict', () => {
    const c4 = record('s2-C4');
    assert.equal(c4.resolution, 'conflict-attached');
    assert.equal(c4.productId, 'antenna-tip1');
    assert.equal(c4.rawPrice, '12000');
    const issue = issuesOf('sheet-conflict').find((i) => i.sourceIds.includes('s2-C4'));
    assert.ok(issue);
    assert.equal(issue.severity, 'conflict');
    assert.deepEqual(issue.sourceIds, ['s1-B4', 's2-C4']);
    assert.ok(c4.issueIds.includes(issue.id));
    assert.ok(product('antenna-tip1').issueIds.includes(issue.id));
    const field = (name) => issue.fields.find((f) => f.field === name);
    assert.deepEqual(
      [field('price').sheet1, field('price').sheet2, field('price').differs],
      ['13\u00a0000\u00a0₽', '12\u00a0000\u00a0₽', true],
    );
    assert.deepEqual([field('gain').sheet1, field('gain').sheet2], ['12 дБи', '10 дБ']);
    assert.deepEqual([field('connector').sheet1, field('connector').sheet2], ['N-female', null]);
    assert.equal(field('frequency').differs, false);
    // Строка листа 2 не подменяет данные витрины.
    assert.equal(product('antenna-tip1').price, 1_300_000);
  });

  test('лист 2: Тип1–3, чехлы Тип2–3, M1–M5 — 10 конфликтов, карточек-двойников нет', () => {
    const conflicts = data.records.filter((r) => r.resolution === 'conflict-attached');
    assert.deepEqual(
      conflicts.map((r) => r.id),
      [
        's2-C4',
        's2-C5',
        's2-C6',
        's2-C9',
        's2-C10',
        's2-C13',
        's2-C14',
        's2-C15',
        's2-C16',
        's2-C17',
      ],
    );
    assert.equal(issuesOf('sheet-conflict').length, 10);
    for (const r of conflicts) assert.ok(!data.products.some((p) => p.sourceIds[0] === r.id));
    const m1 = issuesOf('sheet-conflict').find((i) => i.sourceIds.includes('s2-C13'));
    const gain = m1.fields.find((f) => f.field === 'gain');
    assert.deepEqual([gain.sheet1, gain.sheet2], ['7–9 дБи', '8–10 дБ']);
  });

  test('M4: 2200–6000 МГц, 10–12 дБи, 500 000 коп.', () => {
    const m4 = product('mini-antenna-m4');
    assert.deepEqual(attr(m4, 'frequency').value, {
      kind: 'range',
      min: 2200,
      max: 6000,
      unit: 'MHz',
    });
    assert.deepEqual(attr(m4, 'gain_dbi').value, { kind: 'range', min: 10, max: 12, unit: 'dBi' });
    assert.equal(m4.price, 500_000);
  });

  test('мачта: высота 12 м, масса 6000 г, нагрузка 12 кг, 9 800 000 коп.', () => {
    const mast = byPrimarySource('s1-B35');
    assert.deepEqual(attr(mast, 'height').value, { kind: 'number', value: 12, unit: 'm' });
    assert.deepEqual(attr(mast, 'weight').value, { kind: 'number', value: 6000, unit: 'g' });
    assert.deepEqual(attr(mast, 'max_load').value, { kind: 'number', value: 12, unit: 'kg' });
    assert.deepEqual(attr(mast, 'material').origin, { kind: 'group-header', cell: '1!B34' });
    assert.equal(mast.price, 9_800_000);
    assert.equal(mast.name, 'Мачта карбоновая 12 м');
  });

  test('«египетская сила»: по запросу, price null, 16000 г, без конструкции, проблема unclassified', () => {
    const egypt = byPrimarySource('s1-B18');
    assert.equal(egypt.priceType, 'request');
    assert.equal(egypt.price, null);
    assert.deepEqual(attr(egypt, 'weight').value, { kind: 'number', value: 16000, unit: 'g' });
    assert.equal(attr(egypt, 'antenna_design'), undefined);
    assert.equal(egypt.categoryId, 'antennas');
    assert.deepEqual(egypt.categoryPath, ['antennas']);
    const codes = data.issues.filter((i) => egypt.issueIds.includes(i.id)).map((i) => i.code);
    assert.ok(codes.includes('unclassified'));
    assert.ok(codes.includes('price-on-request'));
  });

  test('B43–B45: «6000–8000 ГГц» — unit GHz, needs-review, без пересчёта', () => {
    for (const id of ['s1-B43', 's1-B44', 's1-B45']) {
      const frequency = attr(byPrimarySource(id), 'frequency');
      assert.deepEqual(frequency.value, { kind: 'range', min: 6000, max: 8000, unit: 'GHz' });
      assert.equal(frequency.status, 'needs-review');
      assert.equal(frequency.raw, '6000-8000 ГГц');
    }
    const [issue] = issuesOf('disputed-unit');
    assert.deepEqual(issue.sourceIds, ['s1-B43', 's1-B44', 's1-B45']);
  });

  test('МШУ: усиление — gain_db, gain_dbi нет; у антенн — наоборот', () => {
    const lna = data.products.filter((p) => p.categoryId === 'lna');
    assert.equal(lna.length, 9);
    for (const p of lna) {
      assert.equal(attr(p, 'gain_db').value.unit, 'dB', p.id);
      assert.equal(attr(p, 'gain_dbi'), undefined, p.id);
    }
    for (const p of data.products.filter((x) => x.categoryPath[0] === 'antennas' && x.model)) {
      assert.equal(attr(p, 'gain_dbi').value.unit, 'dBi', p.id);
      assert.equal(attr(p, 'gain_db'), undefined, p.id);
    }
  });

  test('Тип8 «N/sma-мама»: один разъём, needs-review, проблема ambiguous-connector', () => {
    const tip8 = product('antenna-tip8');
    const connectors = tip8.attributes.filter((a) => a.code.includes('connector'));
    assert.equal(connectors.length, 1);
    assert.deepEqual(connectors[0].value, { kind: 'text', value: 'N/sma-мама' });
    assert.equal(connectors[0].status, 'needs-review');
    assert.equal(issuesOf('ambiguous-connector')[0].productIds[0], 'antenna-tip8');
  });

  test('B46 применён ровно к 8 МШУ листа 1 и не к МШУ листа 2', () => {
    const fromNote = data.products.filter((p) =>
      p.attributes.some((a) => a.origin.kind === 'group-note' && a.origin.cell === '1!B46'),
    );
    assert.deepEqual(
      fromNote.map((p) => p.sourceIds[0]),
      ['s1-B38', 's1-B39', 's1-B40', 's1-B41', 's1-B42', 's1-B43', 's1-B44', 's1-B45'],
    );
    for (const p of fromNote) {
      for (const code of ['port1_connector', 'port2_connector']) {
        assert.deepEqual(attr(p, code).value, { kind: 'text', value: 'SMA-female' });
        assert.equal(attr(p, code).status, 'confirmed');
      }
    }
    const lnaSheet2 = byPrimarySource('s2-C20');
    assert.equal(attr(lnaSheet2, 'port1_connector'), undefined);
    assert.equal(attr(lnaSheet2, 'port2_connector'), undefined);
    // Что B46 не относится к C20 — не утверждается: это info-проблема «уточнить».
    const scope = issuesOf('group-note-scope').find((i) => i.sourceIds[0] === 's1-B46');
    assert.equal(scope.severity, 'info');
    assert.deepEqual(scope.sourceIds, ['s1-B46', 's2-C20']);
    assert.deepEqual(scope.productIds, ['lna-50-6000-20db']);
    assert.match(scope.details, /применено к группе «МШУ:» листа 1 \(1!B38–1!B45, 8 товаров\)/);
    assert.match(scope.details, /уточнить у заказчика/);
    assert.ok(lnaSheet2.issueIds.includes(scope.id));
  });

  test('E57 не дал ни одного portN_connector; E4–E9 сохранили N-female из строки', () => {
    const fromE57 = data.products.flatMap((p) =>
      p.attributes.filter((a) => a.origin.cell === '1!E57'),
    );
    assert.equal(fromE57.length, 0);
    for (const row of [4, 5, 6, 7, 8, 9]) {
      const p = byPrimarySource(`s1-E${row}`);
      for (const code of ['port1_connector', 'port2_connector']) {
        assert.equal(attr(p, code).value.value, 'N-female');
        assert.deepEqual(attr(p, code).origin, { kind: 'row', cell: `1!E${row}` });
      }
    }
    const pending = data.products.filter((p) =>
      p.notes.some((n) => n.cell === '1!E57' && n.kind === 'group-note' && !n.scopeConfirmed),
    );
    assert.equal(pending.length, 43);
    for (const p of pending) assert.equal(attr(p, 'port1_connector'), undefined);
    const scope = issuesOf('group-note-scope').find((i) => i.sourceIds[0] === 's1-E57');
    assert.equal(scope.severity, 'review');
    assert.deepEqual(scope.sourceIds, ['s1-E57']);
    assert.match(scope.details, /область действия по ТЗ неясна/);
    assert.match(scope.details, /1!E4–1!E9/);
    assert.match(scope.details, /«Фильтры канальные:» листа 1 — 1!H4–1!H22 \(15\)/);
    assert.match(scope.details, /«Фильтры на объёмных резонаторах:» листа 2 — 2!C23–2!C29 \(7\)/);
    assert.match(scope.details, /Ни к одному товару не применено/);
  });

  test('IP67: нет в строке — нет характеристики (не false)', () => {
    const withIp = ['s1-B38', 's1-B40', 's1-B42', 's1-B45'];
    for (const p of data.products.filter((x) => x.categoryId === 'lna')) {
      const ip67 = attr(p, 'ip67');
      if (withIp.includes(p.sourceIds[0])) assert.deepEqual(ip67.value, { kind: 'flag' });
      else assert.equal(ip67, undefined, p.id);
    }
    const allValues = data.products.flatMap((p) => p.attributes.map((a) => a.value));
    assert.ok(allValues.every((v) => v.value !== false && v.value !== null));
  });

  test('«М8» (кириллица) → model «M8», исходник в raw', () => {
    const m8 = byPrimarySource('s1-B32');
    assert.equal(m8.model, 'M8');
    assert.equal(m8.id, 'mini-antenna-m8');
    assert.deepEqual(attr(m8, 'model').value, { kind: 'text', value: 'M8' });
    assert.equal(attr(m8, 'model').raw, 'М8');
  });

  test('«18,5» → 18.5; «6.5» → 6.5', () => {
    assert.deepEqual(attr(product('antenna-tip14'), 'gain_dbi').value, {
      kind: 'number',
      value: 18.5,
      unit: 'dBi',
    });
    assert.equal(attr(product('antenna-tip6'), 'gain_dbi').value.value, 6.5);
  });

  test('частота без единицы — inferred MHz: канальные фильтры, Тип7…Тип14, E4', () => {
    const channel = data.products.filter((p) => p.categoryId === 'rf-filters-channel');
    assert.equal(channel.length, 15);
    for (const p of channel) {
      const frequency = attr(p, 'frequency');
      assert.equal(frequency.status, 'inferred');
      assert.equal(frequency.value.unit, 'MHz');
      assert.ok(frequency.note);
      assert.ok(!p.name.includes('МГц'), p.name);
    }
    assert.equal(attr(product('antenna-tip7'), 'frequency').status, 'inferred');
    assert.equal(attr(byPrimarySource('s1-E4'), 'frequency').status, 'inferred');
    assert.equal(attr(product('antenna-tip11'), 'frequency').status, 'confirmed');
    assert.deepEqual(
      issuesOf('inferred-unit').map((i) => i.sourceIds.length),
      [7, 1, 15],
    );
  });

  test('Тип4 «2.5 метра» — размер 2.5 м; масса «150 г.» — 150 г', () => {
    assert.deepEqual(attr(product('antenna-tip4'), 'size').value, {
      kind: 'number',
      value: 2.5,
      unit: 'm',
    });
    assert.equal(attr(product('antenna-tip9'), 'weight').value.value, 150);
    assert.equal(attr(product('antenna-tip13'), 'weight').value.value, 210);
  });

  test('кабели: концы, формы, длина в см; «RG-316 / RG-142» — список на проверке', () => {
    const b49 = byPrimarySource('s1-B49');
    assert.deepEqual(attr(b49, 'cable_type').value, { kind: 'list', values: ['RG-316', 'RG-142'] });
    assert.equal(attr(b49, 'cable_type').status, 'needs-review');
    assert.equal(attr(b49, 'cable_length').value.value, 15);
    const b56 = byPrimarySource('s1-B56');
    assert.equal(attr(b56, 'cable_length').value.value, 100);
    assert.equal(attr(b56, 'port1_connector').value.value, 'N-male');
    assert.equal(attr(b56, 'port1_shape'), undefined);
    const b51 = byPrimarySource('s1-B51');
    assert.equal(attr(b51, 'port1_connector').value.value, 'SMA-female');
    assert.equal(attr(b51, 'port2_shape').value.value, 'угловой');
    const b57 = byPrimarySource('s1-B57');
    assert.deepEqual(
      b57.notes.map((n) => [n.text, n.kind]),
      [['под рупор !', 'row-note']],
    );
    assert.ok(!b57.name.includes('рупор'));
  });

  test('аттенюатор: 0–31 дБ, до 5 Вт', () => {
    const att = byPrimarySource('s1-E60');
    assert.deepEqual(attr(att, 'attenuation_range').value, {
      kind: 'range',
      min: 0,
      max: 31,
      unit: 'dB',
    });
    assert.deepEqual(attr(att, 'max_power').value, { kind: 'number', value: 5, unit: 'W' });
  });
});

describe('уникальные позиции листа 2', () => {
  test('чехол Тип1 и МШУ 50–6000 МГц листа 2 — товары', () => {
    const cover = byPrimarySource('s2-C8');
    assert.equal(cover.id, 'cover-tip1');
    assert.equal(cover.price, 650_000);
    assert.equal(record('s2-C8').resolution, 'created');
    const lna = byPrimarySource('s2-C20');
    assert.equal(lna.id, 'lna-50-6000-20db');
    assert.deepEqual(attr(lna, 'frequency').value, {
      kind: 'range',
      min: 50,
      max: 6000,
      unit: 'MHz',
    });
  });

  test('7 фильтров на объёмных резонаторах — товары; «0.4 затухание» без единицы, ослабление 50 дБ', () => {
    const cavity = data.products.filter((p) => p.categoryId === 'rf-filters-cavity');
    assert.equal(cavity.length, 7);
    assert.deepEqual(
      cavity.map((p) => p.sourceIds[0]),
      ['s2-C23', 's2-C24', 's2-C25', 's2-C26', 's2-C27', 's2-C28', 's2-C29'],
    );
    for (const p of cavity) {
      assert.deepEqual(attr(p, 'insertion_loss').value, { kind: 'number', value: 0.4, unit: null });
      assert.equal(attr(p, 'insertion_loss').status, 'needs-review');
      assert.deepEqual(attr(p, 'rejection').value, { kind: 'number', value: 50, unit: 'dB' });
      assert.equal(attr(p, 'filter_group').value.value, 'на объёмных резонаторах');
    }
  });
});

describe('контракт src/types/catalog.ts', () => {
  // Литералы объединений и поля интерфейсов берутся из самого контракта: расхождение схемы
  // данных и типов ловится здесь, а не в рантайме витрины (tsc JSON с литеральными типами не сверяет).
  const contract = readFileSync(path.join(ROOT, 'src/types/catalog.ts'), 'utf8');
  const union = (name) => {
    const m = new RegExp(`export type ${name} =([^;]+);`).exec(contract);
    assert.ok(m, `нет типа ${name}`);
    return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
  };
  const fields = (name) => {
    const m = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(contract);
    assert.ok(m, `нет интерфейса ${name}`);
    const all = [...m[1].matchAll(/^ {2}(\w+)(\??):/gm)];
    return {
      all: new Set(all.map((x) => x[1])),
      required: all.filter((x) => x[2] === '').map((x) => x[1]),
    };
  };
  const checkShape = (name, objects) => {
    const { all, required } = fields(name);
    for (const object of objects) {
      for (const key of Object.keys(object)) assert.ok(all.has(key), `${name}: лишнее поле ${key}`);
      for (const key of required) assert.ok(key in object, `${name}: нет поля ${key}`);
    }
  };

  test('формы объектов совпадают с интерфейсами', () => {
    checkShape('Product', data.products);
    checkShape(
      'ProductAttribute',
      data.products.flatMap((p) => p.attributes),
    );
    checkShape(
      'ProductNote',
      data.products.flatMap((p) => p.notes),
    );
    checkShape('Category', data.categories);
    checkShape('SourceRecord', data.records);
    checkShape('ImportIssue', data.issues);
    checkShape(
      'IssueFieldDiff',
      data.issues.flatMap((i) => i.fields ?? []),
    );
    checkShape('ImportReport', [data.report]);
    checkShape('OverridesSummary', [data.report.overrides]);
    checkShape('ProductRecommendation', data.recommendations);
    const parsed = data.records.filter((r) => r.parsed).map((r) => r.parsed);
    assert.equal(parsed.length, 132);
    checkShape('SourceRecordParsed', parsed);
    checkShape(
      'ProductAttribute',
      parsed.flatMap((x) => x.attributes),
    );
  });

  test('значения — из допустимых множеств', () => {
    const codes = union('AttrCode');
    const units = union('Unit');
    const statuses = union('AttrStatus');
    const origins = union('AttrOriginKind');
    // В AttrValue объектные типы содержат «;» — берём блок до пустой строки и литералы kind.
    const valueBlock = /export type AttrValue =([\s\S]*?)\n\n/.exec(contract)[1];
    const kinds = new Set([...valueBlock.matchAll(/kind: '([^']+)'/g)].map((x) => x[1]));
    assert.deepEqual([...kinds].sort(), ['flag', 'list', 'number', 'range', 'text']);
    for (const a of data.products.flatMap((p) => p.attributes)) {
      assert.ok(codes.has(a.code), a.code);
      assert.ok(statuses.has(a.status), a.status);
      assert.ok(origins.has(a.origin.kind), a.origin.kind);
      assert.ok(kinds.has(a.value.kind), a.value.kind);
      if ('unit' in a.value && a.value.unit !== null)
        assert.ok(units.has(a.value.unit), a.value.unit);
    }
    for (const p of data.products) assert.ok(union('PriceType').has(p.priceType));
    for (const r of data.recommendations) assert.ok(union('RecommendationStatus').has(r.status));
    for (const a of data.records.flatMap((r) => r.parsed?.attributes ?? [])) {
      assert.ok(codes.has(a.code) && statuses.has(a.status) && origins.has(a.origin.kind), a.code);
    }
    for (const r of data.records) {
      assert.ok(union('SourceRecordKind').has(r.kind), r.kind);
      assert.ok(union('SourceResolution').has(r.resolution), r.resolution);
      assert.ok(union('SourceBlock').has(r.block), r.block);
      assert.ok(union('SheetName').has(r.sheet), r.sheet);
    }
    for (const i of data.issues) {
      assert.ok(union('IssueCode').has(i.code), i.code);
      assert.ok(union('IssueSeverity').has(i.severity), i.severity);
    }
    const ids = new Set(data.records.map((r) => r.id));
    const productIds = new Set(data.products.map((p) => p.id));
    for (const i of data.issues) {
      for (const id of i.sourceIds) assert.ok(ids.has(id), id);
      for (const id of i.productIds) assert.ok(productIds.has(id), id);
    }
    for (const p of data.products) for (const id of p.sourceIds) assert.ok(ids.has(id), id);
  });
});

describe('категории, коды, поиск', () => {
  test('16 категорий; у товаров существующие категории, уникальные id/slug/code', () => {
    assert.equal(data.categories.length, 16);
    const categoryIds = new Set(data.categories.map((c) => c.id));
    for (const p of data.products) {
      assert.ok(categoryIds.has(p.categoryId), p.id);
      assert.equal(p.categoryPath.at(-1), p.categoryId);
      assert.equal(p.id, p.slug);
      assert.match(p.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.match(p.code, /^(ANT|CVR|MST|LNA|FLT|CBL|ATT)-\d{3}$/);
      assert.equal(p.price === null, p.priceType === 'request', p.id);
      if (p.price !== null) assert.ok(Number.isInteger(p.price) && p.price > 0, p.id);
    }
    for (const key of ['id', 'slug', 'code']) {
      assert.equal(new Set(data.products.map((p) => p[key])).size, 118, key);
    }
    assert.deepEqual(
      data.products.map((p) => p.sortIndex),
      data.products.map((_, i) => i + 1),
    );
  });

  test('searchText — нормализованный текст (normalizeSearchText) и находит модели и разъёмы', () => {
    // Состав searchText: все токены названия, строк-источников витрины и категорий; сам товар
    // находится по своему названию и по тексту строки прайса.
    for (const p of data.products) {
      const words = new Set(p.searchText.split(' '));
      const shown = p.sourceIds.map(record).filter((r) => r.resolution !== 'conflict-attached');
      const categoryNames = p.categoryPath.map(
        (id) => data.categories.find((c) => c.id === id).name,
      );
      for (const part of [p.name, ...shown.map((r) => r.rawText), ...categoryNames]) {
        for (const token of search.tokenize(part)) {
          assert.ok(words.has(token), `${p.id}: в searchText нет «${token}» из «${part}»`);
        }
      }
      assert.ok(search.matchesSearch(p.searchText, p.name), p.id);
      assert.ok(search.matchesSearch(p.searchText, shown[0].rawText), p.id);
    }
    const find = (query) =>
      data.products.filter((p) => search.matchesSearch(p.searchText, query)).map((p) => p.id);
    assert.deepEqual(find('M8'), ['mini-antenna-m8']);
    assert.deepEqual(find('М8'), ['mini-antenna-m8']);
    assert.ok(find('тип 1').includes('antenna-tip1'));
    assert.ok(!find('тип1').includes('antenna-tip10'));
    assert.ok(find('rg316').includes('cable-15cm-sma-m-straight-sma-m-angled-rg316'));
    assert.ok(find('n female').includes('antenna-tip1'));
    assert.ok(find('18,5').includes('antenna-tip14'));
    // Конфликтная строка листа 2 не попадает в поиск товара витрины: «10 дБ» — не про Тип1.
    assert.ok(!product('antenna-tip1').searchText.split(' ').includes('дб'));
    // Принятая по контексту «МГц» не добавляется в поиск канальных фильтров.
    assert.ok(!product('channel-filter-3205-3235').searchText.split(' ').includes('мгц'));
  });
});

describe('рекомендации', () => {
  test('чехол ↔ антенна для Тип1/2/3/7 — двусторонние, других автосвязей нет', () => {
    const pairs = data.recommendations.map((r) => `${r.productId}>${r.recommendedId}`).sort();
    const expected = ['1', '2', '3', '7']
      .flatMap((n) => [`antenna-tip${n}>cover-tip${n}`, `cover-tip${n}>antenna-tip${n}`])
      .sort();
    assert.deepEqual(pairs, expected);
    for (const r of data.recommendations) {
      assert.equal(r.basis, 'source-name');
      assert.equal(r.status, 'draft', 'связь из названия прайса — черновая (ТЗ §7)');
      assert.equal(r.position, 1);
      assert.notEqual(r.productId, r.recommendedId);
    }
  });
});

describe('воспроизводимость', () => {
  test('повторный импорт побайтно идентичен; файлы проекта совпадают со свежим прогоном', () => {
    const dir = makeProjectCopy({ overrides: null });
    const initial = importOk(dir);
    assert.match(initial.stdout, /прошлого src\/data\/products\.generated\.json нет/);
    const first = hashOutputs(dir);
    const second = importOk(dir);
    assert.match(second.stdout, /файлы не изменились/);
    assert.match(second.stdout, /создано 0, изменено 0, без изменений 118, удалено 0/);
    assert.deepEqual(hashOutputs(dir), first);
    let projectHashes;
    try {
      projectHashes = hashOutputs(ROOT);
    } catch {
      assert.fail('нет сгенерированных файлов — запустите npm run import:catalog');
    }
    assert.deepEqual(
      projectHashes,
      first,
      'сгенерированные файлы устарели — запустите npm run import:catalog',
    );
  });

  test('сверка с прошлым запуском — только в консоли, не в файлах', () => {
    const dir = makeProjectCopy();
    importOk(dir);
    writeFileSync(
      path.join(dir, OVERRIDES_FILE),
      JSON.stringify({ products: { 'antenna-tip2': { hidden: true } }, recommendations: [] }),
    );
    const next = importOk(dir);
    assert.match(
      next.stdout,
      /создано 0, изменено 0, без изменений 117, удалено 1 \(antenna-tip2\)/,
    );
    for (const rel of OUTPUTS) {
      assert.doesNotMatch(readFileSync(path.join(dir, rel), 'utf8'), /прошлого запуска/, rel);
    }
  });

  test('sourceHash = sha256 исходника; в данных нет дат', () => {
    assert.equal(data.report.sourceHash, sha256(readFileSync(path.join(ROOT, SOURCE_FILE))));
    assert.equal(data.report.sourceFile, SOURCE_FILE);
    assert.doesNotMatch(JSON.stringify(data), /\d{4}-\d{2}-\d{2}T\d{2}:/);
  });

  test('IMPORT-REPORT.md: все 132 товарные строки и построчное сравнение листов', () => {
    const tableRows = data.markdown
      .split('\n')
      .filter((line) => /^\| \d+ \| [12]![A-Z]\d+ \|/.test(line));
    assert.equal(tableRows.length, 132);
    assert.match(data.markdown, /## Конфликты листов \(10\)/);
    assert.match(data.markdown, /\| КУ \| 12 дБи \| 10 дБ \| \*\*да\*\* \|/);
    assert.match(data.markdown, /\| Разъём \| N-female \| — \| \*\*да\*\* \|/);
    assert.match(data.markdown, /### conflict — конфликты данных \(10\)/);
    assert.match(
      data.markdown,
      /\| Отправлено на проверку: товаров с проблемой review или conflict \| 94 \|/,
    );
    assert.match(
      data.markdown,
      /\| Отправлено на проверку: строк-источников с проблемами \| 78 \|/,
    );
  });
});

describe('overrides.json', () => {
  let hidden;
  let result;

  before(() => {
    const dir = makeProjectCopy({
      overrides: {
        $comment: 'тестовый ручной слой',
        products: {
          'antenna-tip2': { hidden: true },
          'antenna-tip1': { name: 'Антенна Тип1 (правка менеджера)', images: ['/images/tip1.jpg'] },
          'no-such-product': { hidden: true },
        },
        recommendations: [
          {
            productId: 'antenna-tip1',
            recommendedId: 'lna-50-1000-20db-ip67-xt60',
            position: 2,
            note: 'проверено',
          },
          { productId: 'antenna-tip3', recommendedId: 'antenna-tip2', position: 1 },
          { productId: 'antenna-tip3', recommendedId: 'no-such-product', position: 2 },
          { productId: 'antenna-tip3', recommendedId: 'antenna-tip3', position: 3 },
          { productId: 'cover-tip7', recommendedId: 'antenna-tip7', note: 'проверено менеджером' },
          { productId: 'cover-tip7', recommendedId: 'antenna-tip7', status: 'approved' },
          { productId: 'cover-tip3', recommendedId: 'antenna-tip3', status: 'draft', note: 'ждём' },
        ],
      },
    });
    result = importOk(dir);
    hidden = loadData(dir);
  });

  test('скрытый товар исчезает из витрины, его источники и проблемы остаются', () => {
    assert.equal(hidden.products.length, 117);
    assert.ok(!hidden.products.some((p) => p.id === 'antenna-tip2'));
    assert.equal(hidden.report.counts.productsCreated, 118);
    assert.deepEqual(hidden.report.overrides.hiddenProductIds, ['antenna-tip2']);
    const b5 = hidden.records.find((r) => r.id === 's1-B5');
    assert.equal(b5.productId, 'antenna-tip2');
    assert.ok(
      hidden.issues.some(
        (i) => i.code === 'sheet-conflict' && i.productIds.includes('antenna-tip2'),
      ),
    );
    assert.match(hidden.markdown, /`antenna-tip2`\) — \*\*скрыт\*\* в overrides\.json/);
    // Код товара не сдвигается у остальных.
    assert.equal(hidden.products.find((p) => p.id === 'antenna-tip3').code, 'ANT-003');
  });

  test('рекомендации на скрытый, несуществующий и сам товар отброшены с предупреждением', () => {
    const recs = hidden.recommendations.map((r) => `${r.productId}>${r.recommendedId}`);
    assert.ok(!recs.some((r) => r.includes('antenna-tip2')), 'связь со скрытым товаром осталась');
    assert.ok(!recs.includes('antenna-tip3>no-such-product'));
    assert.ok(!recs.includes('antenna-tip3>antenna-tip3'));
    const warnings = hidden.report.overrides.warnings;
    assert.ok(
      warnings.some((w) => w.includes('antenna-tip3 → antenna-tip2') && w.includes('скрыт')),
    );
    assert.ok(warnings.some((w) => w.includes('cover-tip2 → antenna-tip2') && w.includes('скрыт')));
    assert.ok(warnings.some((w) => w.includes('no-such-product') && w.includes('нет')));
    assert.ok(warnings.some((w) => w.includes('сам себя')));
    assert.ok(warnings.some((w) => w.startsWith('products.no-such-product')));
    assert.match(result.stderr, /Предупреждение overrides: .*antenna-tip3 → antenna-tip2/);
    for (const warning of warnings) assert.ok(hidden.markdown.includes(warning), warning);
  });

  test('переименование, фото и ручная рекомендация применяются', () => {
    const tip1 = hidden.products.find((p) => p.id === 'antenna-tip1');
    assert.equal(tip1.name, 'Антенна Тип1 (правка менеджера)');
    assert.deepEqual(tip1.images, ['/images/tip1.jpg']);
    assert.ok(search.matchesSearch(tip1.searchText, 'логопериодическая'));
    const own = hidden.recommendations.filter((r) => r.productId === 'antenna-tip1');
    assert.deepEqual(
      own.map((r) => [r.recommendedId, r.position, r.basis]),
      [
        ['lna-50-1000-20db-ip67-xt60', 1, 'manager'],
        ['cover-tip1', 2, 'source-name'],
      ],
    );
    assert.equal(hidden.report.overrides.recommendationsApplied, 1);
  });

  test('запись overrides подтверждает черновую связь из названия; ручная — approved', () => {
    const find = (from, to) =>
      hidden.recommendations.find((r) => r.productId === from && r.recommendedId === to);
    const approved = find('cover-tip7', 'antenna-tip7');
    assert.deepEqual(
      [approved.basis, approved.status, approved.note],
      ['source-name', 'approved', 'проверено менеджером'],
    );
    // Подтверждается одно направление.
    assert.equal(find('antenna-tip7', 'cover-tip7').status, 'draft');
    const keptDraft = find('cover-tip3', 'antenna-tip3');
    assert.deepEqual([keptDraft.status, keptDraft.note], ['draft', 'ждём']);
    assert.equal(find('antenna-tip1', 'lna-50-1000-20db-ip67-xt60').status, 'approved');
    assert.equal(hidden.report.overrides.recommendationsApproved, 1);
    assert.ok(
      hidden.report.overrides.warnings.some(
        (w) => w.startsWith('recommendations[5] cover-tip7 → antenna-tip7') && w.includes('выше'),
      ),
    );
    const sourceNameDrafts = hidden.recommendations.filter(
      (r) => r.basis === 'source-name' && r.status === 'draft',
    );
    // Тип2 скрыт → его связи отброшены; из оставшихся 6 подтверждена одна.
    assert.equal(sourceNameDrafts.length, 5);
  });

  test('ошибка в overrides.json останавливает импорт с понятным сообщением', () => {
    const dir = makeProjectCopy({ overrides: { products: { 'antenna-tip1': { hiden: true } } } });
    const failed = runImport(dir);
    assert.notEqual(failed.status, 0);
    assert.match(
      failed.stderr,
      /overrides\.json: products\.antenna-tip1\.hiden — неизвестное поле/,
    );
    const badStatus = makeProjectCopy({
      overrides: {
        products: {},
        recommendations: [{ productId: 'cover-tip2', recommendedId: 'antenna-tip2', status: 'ok' }],
      },
    });
    const failedStatus = runImport(badStatus);
    assert.notEqual(failedStatus.status, 0);
    assert.match(failedStatus.stderr, /recommendations\[0\]\.status — «approved» или «draft»/);
  });
});
