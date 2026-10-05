/**
 * Движок каталога (src/lib/catalog): частотный подбор, фильтры, фасеты, поиск, сортировка,
 * пагинация, состояние в URL, форматирование цен и характеристик (ТЗ §6, §14; DATA-RULES §3, §6).
 *
 * Модули подключаются напрямую как .ts (type stripping Node 22.18+), данные — реальные
 * src/data/*.generated.json, а не выдуманные фикстуры: тесты ловят расхождение движка с данными.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

const products = readJson('src/data/products.generated.json');
const categories = readJson('src/data/categories.generated.json');
const catalog = await import(pathToFileURL(path.join(ROOT, 'src/lib/catalog/index.ts')).href);
const urlState = await import(pathToFileURL(path.join(ROOT, 'src/lib/catalog/url-state.ts')).href);

const {
  applyQuery,
  catalogQueryString,
  createCatalogState,
  formatAttrValue,
  formatPrice,
  formatProductAttributes,
  formatProductPrice,
  formatSpecLine,
  frequencyMatches,
  getProductFrequency,
  getSpecLine,
  parseCatalogState,
  parseFrequencyInput,
  preliminaryTotal,
  removeChip,
  resetFilters,
  nonBreakingText,
  searchProducts,
  serializeCatalogState,
  suggest,
  technicalSegments,
  toggleFilterValue,
} = catalog;

const NBSP = ' ';
const byId = new Map(products.map((p) => [p.id, p]));
const product = (id) => {
  const found = byId.get(id);
  assert.ok(found, `нет товара ${id}`);
  return found;
};

/** Все результаты (без пагинации) для состояния и категории. */
function run(categoryId, patch = {}) {
  return applyQuery(products, createCatalogState(patch), {
    categoryId,
    categories,
    pageSize: 1000,
  });
}
const ids = (result) => result.items.map((p) => p.id);
const facet = (result, key) => result.facets.find((f) => f.key === key);

const GHZ_LNA = ['lna-6000-8000-10db', 'lna-6000-8000-20db', 'lna-6000-8000-20db-ip67-xt60'];
const EGYPT = 'antenna-egipetskaya-sila';

// ---------------------------------------------------------------------------

describe('частотный подбор (ТЗ §6, §14)', () => {
  test('1000 МГц выбирает Тип1 (700–1100) и не выбирает Тип2 (360–980)', () => {
    const result = run('antennas', { freq: { min: 1000, max: 1000 } });
    assert.ok(ids(result).includes('antenna-tip1'));
    assert.ok(!ids(result).includes('antenna-tip2'));
    // В обоих режимах одна частота — это f_min ≤ f ≤ f_max.
    const cover = run('antennas', { freq: { min: 1000, max: 1000 }, fmode: 'cover' });
    assert.deepEqual(ids(cover), ids(result));
  });

  test('границы 700 и 1100 включительно, 699 и 1101 — мимо', () => {
    for (const f of [700, 1100]) {
      assert.ok(
        ids(run('antennas', { freq: { min: f, max: f } })).includes('antenna-tip1'),
        `${f}`,
      );
    }
    for (const f of [699, 1101]) {
      assert.ok(
        !ids(run('antennas', { freq: { min: f, max: f } })).includes('antenna-tip1'),
        `${f}`,
      );
    }
  });

  test('overlap и cover по формулам на граничных значениях', () => {
    const tip1 = { min: 700, max: 1100 };
    const cases = [
      // [a, b, overlap, cover]
      [1100, 1200, true, false],
      [1101, 1200, false, false],
      [600, 700, true, false],
      [600, 699, false, false],
      [700, 1100, true, true],
      [699, 1100, true, false],
      [700, 1101, true, false],
      [800, 900, true, true],
      [600, 1200, true, false],
    ];
    for (const [a, b, overlap, cover] of cases) {
      const query = { min: a, max: b };
      assert.equal(frequencyMatches(tip1, query, 'overlap'), overlap, `overlap ${a}-${b}`);
      assert.equal(frequencyMatches(tip1, query), overlap, `по умолчанию overlap ${a}-${b}`);
      assert.equal(frequencyMatches(tip1, query, 'cover'), cover, `cover ${a}-${b}`);
    }
    // Через выдачу: 900–1100 пересекает Тип1 и Тип2, целиком покрывает только Тип1.
    const overlap = ids(run('antennas', { freq: { min: 900, max: 1100 } }));
    assert.ok(overlap.includes('antenna-tip1') && overlap.includes('antenna-tip2'));
    const cover = ids(run('antennas', { freq: { min: 900, max: 1100 }, fmode: 'cover' }));
    assert.ok(cover.includes('antenna-tip1') && !cover.includes('antenna-tip2'));
    // Касание границей: 980–1500 с Тип2 (360–980) пересекается ровно в точке 980.
    assert.ok(ids(run('antennas', { freq: { min: 980, max: 1500 } })).includes('antenna-tip2'));
    assert.ok(!ids(run('antennas', { freq: { min: 981, max: 1500 } })).includes('antenna-tip2'));
  });

  test('«6000–8000 ГГц» никогда не попадает в частотный подбор', () => {
    for (const id of GHZ_LNA) {
      assert.equal(getProductFrequency(product(id)), null);
      assert.equal(getProductFrequency(product(id), { strict: true }), null);
    }
    const probes = [
      { min: 6000, max: 6000 },
      { min: 7000, max: 7000 },
      { min: 8000, max: 8000 },
      { min: 6000, max: 8000 },
      { min: 1, max: 1e9 },
      { min: 6e6, max: 8e6 },
      parseFrequencyInput('6000-8000 ГГц'),
      parseFrequencyInput('7 ГГц'),
    ];
    for (const freq of probes) {
      for (const fmode of ['overlap', 'cover']) {
        for (const strict of [false, true]) {
          for (const categoryId of [null, 'lna']) {
            const found = ids(run(categoryId, { freq, fmode, strict }));
            for (const id of GHZ_LNA)
              assert.ok(!found.includes(id), `${id} ${JSON.stringify(freq)}`);
          }
        }
      }
    }
    // Фасет сообщает, что у трёх МШУ частота не участвует.
    assert.equal(facet(run('lna'), 'freq').excludedCount, 3);
  });

  test('strict исключает inferred: канальные фильтры без единицы', () => {
    const loose = ids(run('rf-filters-channel', { freq: { min: 3230, max: 3230 } }));
    assert.deepEqual(loose, ['channel-filter-3205-3235', 'channel-filter-3225-3255']);
    const strict = run('rf-filters-channel', { freq: { min: 3230, max: 3230 }, strict: true });
    assert.equal(strict.total, 0);
    assert.ok(strict.activeChips.some((chip) => chip.key === 'strict'));
    // Тип7 (3100–4500, без единицы) выпадает в strict, «египетская сила» (3100–4500 МГц) — нет.
    const antennas = ids(run('antennas', { freq: { min: 4000, max: 4000 }, strict: true }));
    assert.ok(antennas.includes(EGYPT) && !antennas.includes('antenna-tip7'));
    assert.ok(ids(run('antennas', { freq: { min: 4000, max: 4000 } })).includes('antenna-tip7'));
    assert.equal(facet(run('rf-filters-channel'), 'freq').inferredCount, 15);
  });

  test('разбор ввода частоты', () => {
    const cases = [
      ['1000', { min: 1000, max: 1000 }],
      ['900-1100', { min: 900, max: 1100 }],
      ['900–1100', { min: 900, max: 1100 }],
      ['900 — 1100 МГц', { min: 900, max: 1100 }],
      ['2,4 ГГц', { min: 2400, max: 2400 }],
      ['2.4ghz', { min: 2400, max: 2400 }],
      ['2400 MHz', { min: 2400, max: 2400 }],
      ['2,4–2,5 ГГц', { min: 2400, max: 2500 }],
      ['2.45 GHz', { min: 2450, max: 2450 }],
      ['1100-900', { min: 900, max: 1100 }],
    ];
    for (const [input, expected] of cases)
      assert.deepEqual(parseFrequencyInput(input), expected, input);
    for (const bad of [
      '',
      '   ',
      'abc',
      '-5',
      '0',
      '900-',
      '1,2,3',
      '2400 дБ',
      '12 кг',
      'NaN',
      '1e5',
    ]) {
      assert.equal(parseFrequencyInput(bad), null, JSON.stringify(bad));
    }
  });
});

// ---------------------------------------------------------------------------

describe('фильтры и фасеты', () => {
  test('МШУ без IP67 не попадает в выдачу «IP67» и не считается «без IP67»', () => {
    const all = run('lna');
    const ip67 = facet(all, 'ip67');
    assert.equal(ip67.kind, 'flag');
    // Опции «без IP67» нет: только признак; у остальных значение неизвестно (missing), а не false.
    assert.equal(ip67.count, 4);
    assert.equal(ip67.missingCount, 5);
    const withIp67 = run('lna', { options: { ip67: ['1'] } });
    assert.equal(withIp67.total, 4);
    for (const p of withIp67.items) assert.ok(p.attributes.some((a) => a.code === 'ip67'));
    assert.ok(!ids(withIp67).includes('lna-700-6100-10db'));
    // «ip67=0» из URL не превращается в «без IP67» — значение игнорируется.
    const garbage = parseCatalogState({ ip67: '0' });
    assert.deepEqual(garbage.options, {});
    assert.equal(run('lna', { options: { ip67: ['0'] } }).total, 9);
  });

  test('needs-review не участвует: Тип8 «N/sma-мама» нет в фильтре разъёмов', () => {
    for (const value of ['n-female', 'sma-female']) {
      assert.ok(!ids(run('antennas', { options: { conn: [value] } })).includes('antenna-tip8'));
    }
    assert.equal(facet(run('antennas-horn'), 'conn').excludedCount, 1);
  });

  test('кабель «RG-316 / RG-142» (needs-review) не попадает ни в RG-316, ни в RG-142', () => {
    const variant = 'cable-15cm-sma-m-straight-sma-m-straight-rg316-rg142';
    assert.deepEqual(ids(run('cables', { options: { cable: ['rg-316'] } })), [
      'cable-15cm-sma-m-straight-sma-m-angled-rg316',
      'cable-15cm-sma-f-straight-sma-m-angled-rg316',
    ]);
    assert.ok(!ids(run('cables', { options: { cable: ['rg-142'] } })).includes(variant));
    assert.equal(facet(run('cables'), 'cable').excludedCount, 1);
  });

  test('OR внутри фильтра, AND между фильтрами, счётчики без своего фильтра', () => {
    const n = run('antennas', { options: { conn: ['n-female'] } }).total;
    const sma = run('antennas', { options: { conn: ['sma-female'] } }).total;
    assert.equal(n, 8);
    assert.equal(sma, 4);
    assert.equal(run('antennas', { options: { conn: ['n-female', 'sma-female'] } }).total, n + sma);

    const and = run('antennas', {
      options: { design: ['rupornaya', 'mikro-rupornaya'], conn: ['n-female'] },
    });
    assert.deepEqual(ids(and), ['antenna-tip7', 'antenna-tip10', 'antenna-tip12']);

    const counted = run('antennas', { options: { design: ['rupornaya'] } });
    const conn = facet(counted, 'conn');
    assert.deepEqual(
      conn.options.map((o) => [o.value, o.count]),
      [
        ['n-female', 3],
        ['sma-female', 0],
      ],
    );
    // Счётчик своего фильтра считается без него: выбор «рупорная» не обнуляет «микро-рупорную».
    const design = facet(counted, 'design');
    assert.equal(design.options.find((o) => o.value === 'mikro-rupornaya').count, 4);
    assert.equal(design.options.find((o) => o.value === 'rupornaya').selected, true);
  });

  test('КУ дБи — диапазоном с пересечением', () => {
    const mini = ids(run('antennas-mini', { ranges: { gain: { min: 10, max: 12 } } }));
    assert.ok(!mini.includes('mini-antenna-m1')); // 7–9
    assert.ok(mini.includes('mini-antenna-m2')); // 9–11 пересекается с 10–12
    assert.equal(mini.length, 7);
    const strong = ids(run('antennas', { ranges: { gain: { min: 20, max: null } } }));
    assert.deepEqual(strong, ['antenna-tip7', 'antenna-tip8']);
    // У «египетской силы» КУ нет — она не проходит ни один диапазон КУ.
    assert.ok(!ids(run('antennas', { ranges: { gain: { min: 0, max: null } } })).includes(EGYPT));
  });

  test('фильтр с одним различающим значением скрыт', () => {
    assert.deepEqual(run('masts').facets, []);
    assert.deepEqual(run('attenuators').facets, []);
    const mini = run('antennas-mini');
    assert.ok(!facet(mini, 'conn') && !facet(mini, 'design') && !facet(mini, 'request'));
    // Поиск сузил набор до одного товара — фильтровать нечего.
    assert.deepEqual(run('antennas', { q: 'Тип1' }).facets, []);
    // Затухание «0.4» без единицы — не фильтр.
    assert.equal(facet(run('rf-filters'), 'loss'), undefined);
    // Товар без значения — тоже «значение»: IP67 у части МШУ даёт видимый фильтр.
    assert.ok(facet(run('lna'), 'ip67'));
    assert.ok(facet(run('lna'), 'gaindb'));
  });

  test('«Цена по запросу» и диапазон цены', () => {
    const all = run('antennas');
    assert.equal(facet(all, 'request').count, 1);
    assert.deepEqual(ids(run('antennas', { request: true })), [EGYPT]);
    // Без товаров «по запросу» в контексте переключателя нет, а request=1 отбрасывается.
    const lna = run('lna', { request: true });
    assert.equal(facet(lna, 'request'), undefined);
    assert.equal(lna.total, 9);
    assert.equal(lna.state.request, false);
    // Диапазон цены — только фиксированные цены; «по запросу» исключаются.
    const ranged = run('antennas', { price: { min: 10000, max: 20000 } });
    assert.ok(!ids(ranged).includes(EGYPT));
    for (const p of ranged.items) assert.ok(p.price >= 1000000 && p.price <= 2000000);
    // Оба сразу — одно измерение «цена», OR.
    const both = run('antennas', { price: { min: 10000, max: 20000 }, request: true });
    assert.equal(both.total, ranged.total + 1);
    assert.ok(ids(both).includes(EGYPT));
  });

  test('активные чипы и удаление по одному', () => {
    const state = createCatalogState({
      freq: { min: 900, max: 1100 },
      fmode: 'cover',
      price: { min: 1000, max: 20000 },
      options: { conn: ['n-female', 'sma-female'], design: ['rupornaya'] },
      ranges: { gain: { min: 10, max: null } },
      strict: true,
    });
    const result = applyQuery(products, state, { categoryId: 'antennas', categories });
    const labels = result.activeChips.map((chip) => chip.label);
    assert.deepEqual(labels, [
      'Конструкция: рупорная',
      `Частота: 900–1100${NBSP}МГц, весь диапазон`,
      `КУ: от${NBSP}10${NBSP}дБи`,
      'Разъём: N-female',
      'Разъём: SMA-female',
      `Цена: 1${NBSP}000–20${NBSP}000${NBSP}₽`,
      'Только подтверждённые значения',
    ]);
    const conn = result.activeChips.find((chip) => chip.value === 'sma-female');
    assert.deepEqual(removeChip(state, conn).options.conn, ['n-female']);
    const freq = result.activeChips.find((chip) => chip.key === 'freq');
    assert.equal(removeChip(state, freq).freq, null);
    assert.equal(removeChip(state, freq).fmode, 'overlap');
    // Общий сброс сохраняет поиск, сортировку и вид.
    const reset = resetFilters({ ...state, q: 'тип', sort: 'name', view: 'grid', page: 3 });
    assert.deepEqual(reset, createCatalogState({ q: 'тип', sort: 'name', view: 'grid' }));
    // Значения, которых нет в категории, и чужие для категории фильтры отбрасываются.
    const junk = applyQuery(
      products,
      createCatalogState({ options: { conn: ['bnc-female'], ip67: ['1'], cable: ['rg-142'] } }),
      { categoryId: 'antennas', categories },
    );
    assert.deepEqual(junk.state.options, {});
    assert.deepEqual(junk.activeChips, []);
    assert.equal(junk.total, 23);
  });

  test('подкатегория внутри родителя', () => {
    const all = run('antennas');
    const cat = facet(all, 'cat');
    assert.deepEqual(
      cat.options.map((o) => o.value),
      ['log-periodic', 'corner', 'yagi', 'horn', 'micro-horn', 'mini'],
    );
    assert.equal(cat.missingCount, 1); // «египетская сила» лежит прямо в «Антеннах»
    assert.equal(run('antennas', { options: { cat: ['horn', 'mini'] } }).total, 12);
    // Во всём каталоге — корневые категории.
    assert.equal(facet(run(null), 'cat').options.length, 7);
  });
});

// ---------------------------------------------------------------------------

describe('сортировка и пагинация', () => {
  test('«по запросу» всегда в конце при сортировке по цене', () => {
    for (const categoryId of [null, 'antennas']) {
      for (const sort of ['price-asc', 'price-desc']) {
        const list = run(categoryId, { sort }).items;
        assert.equal(list.at(-1).id, EGYPT, `${categoryId} ${sort}`);
        const prices = list.slice(0, -1).map((p) => p.price);
        const sorted = [...prices].sort((a, b) => (sort === 'price-asc' ? a - b : b - a));
        assert.deepEqual(prices, sorted);
      }
    }
  });

  test('по умолчанию — порядок прайса, по названию — ru с числами', () => {
    const list = run('antennas').items.map((p) => p.sortIndex);
    assert.deepEqual(
      list,
      [...list].sort((a, b) => a - b),
    );
    const names = ids(run('antennas-log-periodic', { sort: 'name' }));
    assert.deepEqual(names, ['antenna-tip1', 'antenna-tip2', 'antenna-tip3', 'antenna-tip4']);
    const horn = ids(run('antennas-horn', { sort: 'name' }));
    assert.deepEqual(horn, ['antenna-tip7', 'antenna-tip8', 'antenna-tip10', 'antenna-tip12']);
  });

  test('страницы по 24, страница за пределами — последняя валидная', () => {
    const ctx = { categoryId: 'rf-filters', categories };
    const first = applyQuery(products, createCatalogState(), ctx);
    assert.equal(first.pageSize, 24);
    assert.equal(first.total, 71);
    assert.equal(first.totalPages, 3);
    assert.equal(first.items.length, 24);
    const beyond = applyQuery(products, createCatalogState({ page: 99 }), ctx);
    assert.equal(beyond.page, 3);
    assert.equal(beyond.state.page, 3);
    assert.equal(beyond.items.length, 23);
    const empty = applyQuery(products, createCatalogState({ q: 'нет такого', page: 5 }), ctx);
    assert.deepEqual([empty.total, empty.totalPages, empty.page, empty.items.length], [0, 1, 1, 0]);
    // Неизвестная категория — пустой контекст, а не весь каталог.
    assert.equal(
      applyQuery(products, createCatalogState(), { categoryId: 'nope', categories }).total,
      0,
    );
  });
});

// ---------------------------------------------------------------------------

describe('поиск', () => {
  const search = (q) => searchProducts(products, q).map((hit) => hit.product.id);

  test('«тип 1» и «Тип1» находят Тип1 первым, без Тип10–14', () => {
    for (const q of ['тип 1', 'Тип1', 'tip1', 'ТИП-1']) {
      const found = search(q);
      assert.equal(found[0], 'antenna-tip1', q);
      assert.ok(found.includes('cover-tip1'), q);
      assert.ok(!found.some((id) => /tip1\d/.test(id)), q);
    }
  });

  test('«M8» латиницей и «М8» кириллицей находят M8', () => {
    assert.deepEqual(search('M8'), ['mini-antenna-m8']);
    assert.deepEqual(search('М8'), ['mini-antenna-m8']);
  });

  test('«18,5» находит Тип14; «sma мама» ≈ SMA-female; «MHz» ≈ «МГц»', () => {
    assert.deepEqual(search('18,5'), ['antenna-tip14']);
    assert.deepEqual(search('18.5'), ['antenna-tip14']);
    assert.deepEqual(search('sma мама'), search('SMA-female'));
    assert.ok(search('sma мама').includes('antenna-tip14'));
    assert.ok(search('MHz').length > 0);
    assert.deepEqual(search('MHz'), search('МГц'));
  });

  test('«рупорная» находит рупорные и микро-рупорные', () => {
    const found = search('рупорная');
    for (const n of [7, 8, 9, 10, 11, 12, 13, 14]) assert.ok(found.includes(`antenna-tip${n}`), n);
    assert.equal(found.length, 8);
  });

  test('«2400» находит антенны, чей диапазон покрывает 2400', () => {
    const found = search('2400');
    for (const id of ['antenna-tip5', 'antenna-tip10', 'mini-antenna-m3', 'mini-antenna-m4']) {
      assert.ok(found.includes(id), id);
    }
    for (const id of found) {
      const range = getProductFrequency(product(id));
      assert.ok(range && range.min <= 2400 && range.max >= 2400, id);
    }
    assert.deepEqual(search('2400 МГц'), found);
    assert.deepEqual(search('2,4 ГГц'), found);
    // Числа с другой единицей — не частота: «150 г» — масса, а не 150 МГц.
    assert.deepEqual(search('150 г'), ['antenna-tip9', 'antenna-tip11']);
  });

  test('AND между словами, товары не объединяются', () => {
    const both = search('фильтр 2100-2700');
    assert.deepEqual(both, [
      'bandpass-filter-2100-2700-n-female',
      'bandpass-filter-2100-2700',
      'cavity-filter-2100-2700',
    ]);
    assert.deepEqual(search('рупорная sma'), [
      'antenna-tip8',
      'antenna-tip9',
      'antenna-tip11',
      'antenna-tip13',
      'antenna-tip14',
    ]);
  });

  test('единицы — целым словом: «10 дБ» не находит «10–12 дБи», дБ ≠ дБи', () => {
    const db = search('10 дБ');
    assert.deepEqual(db, [
      'lna-700-6100-10db',
      'lna-700-6100-10db-ip67-xt60',
      'lna-6000-8000-10db',
    ]);
    assert.ok(!db.some((id) => id.startsWith('mini-antenna')), 'мини-антенны — дБи, не дБ');
    const dbi = search('10 дБи');
    assert.ok(dbi.length > 0 && dbi.every((id) => id.startsWith('mini-antenna')), dbi.join());
    // Без числа: «дБ» и «дБи» — разные величины, и то и другое целым словом.
    assert.ok(!search('дБ').some((id) => id.startsWith('antenna') || id.startsWith('mini')));
    assert.ok(search('дБи').every((id) => id.startsWith('antenna') || id.startsWith('mini')));
    // «1 м» — метры, а не «мини» и «МШУ»; одиночное «м» — по-прежнему начало слова.
    assert.ok(
      search('1 м').every((id) => id.startsWith('cable-1m')),
      search('1 м').join(),
    );
    assert.ok(search('м').includes('mini-antenna-m1'));
  });

  test('поиск в выдаче категории — релевантность по умолчанию', () => {
    const result = run('antennas', { q: 'тип 1' });
    assert.deepEqual(ids(result), ['antenna-tip1']);
    const all = run(null, { q: 'тип1' });
    assert.deepEqual(ids(all), ['antenna-tip1', 'cover-tip1']);
  });

  test('подсказки: категории, затем товары', () => {
    const hints = suggest('рупорн', 6, { products, categories });
    assert.equal(hints.length, 6);
    assert.deepEqual(
      hints.filter((h) => h.kind === 'category').map((h) => h.slugPath.join('/')),
      ['antennas/horn', 'antennas/micro-horn'],
    );
    assert.equal(hints[2].kind, 'product');
    assert.deepEqual(suggest('', 5, { products, categories }), []);
    const m8 = suggest('М8', 5, { products, categories });
    assert.deepEqual(
      m8.map((h) => h.id),
      ['mini-antenna-m8'],
    );
    assert.equal(m8[0].priceText, `3${NBSP}000${NBSP}₽`);
  });
});

// ---------------------------------------------------------------------------

describe('состояние в URL', () => {
  const states = [
    createCatalogState(),
    createCatalogState({ q: 'тип 1', sort: 'price-desc', page: 3, view: 'grid' }),
    createCatalogState({
      freq: { min: 900, max: 1100 },
      fmode: 'cover',
      strict: true,
      price: { min: 1000, max: 20000 },
      request: true,
      options: { conn: ['n-female', 'sma-female'], ip67: ['1'], cat: ['horn'] },
      ranges: { gain: { min: 10.5, max: null } },
    }),
    createCatalogState({ freq: { min: 2400.5, max: 2400.5 }, price: { min: null, max: 500 } }),
    createCatalogState({
      ranges: { gain: { min: null, max: 12 } },
      options: { design: ['rupornaya'] },
    }),
  ];

  test('parse(serialize(s)) глубоко равно s', () => {
    for (const state of states) {
      const params = serializeCatalogState(state);
      assert.deepEqual(parseCatalogState(params), state, params.toString());
      // Тот же результат через объект searchParams из Next и через строку ссылки.
      const record = Object.fromEntries(params);
      assert.deepEqual(parseCatalogState(record), state);
      assert.deepEqual(parseCatalogState(new URLSearchParams(catalogQueryString(state))), state);
    }
    assert.equal(typeof urlState.parse, 'function');
    assert.equal(typeof urlState.serialize, 'function');
  });

  test('значения по умолчанию в URL не пишутся, формат параметров', () => {
    assert.equal(serializeCatalogState(createCatalogState()).toString(), '');
    assert.equal(catalogQueryString(createCatalogState()), '');
    assert.equal(
      catalogQueryString(states[2]),
      '?freq=900-1100&fmode=cover&strict=1&price=1000-20000&request=1' +
        '&cat=horn&gain=10.5-&conn=n-female,sma-female&ip67=1',
    );
  });

  test('запрос без слов (знаки препинания, невидимые символы) — пустой', () => {
    for (const q of ['. , -', '\u0000', '\u200b', '📡', ' — ', '\u00ad']) {
      assert.equal(parseCatalogState({ q }).q, '', JSON.stringify(q));
    }
    assert.equal(parseCatalogState({ q: 'тип\u200b1' }).q, 'тип 1');
    assert.equal(parseCatalogState({ q: 'ти\u00adп1' }).q, 'тип1');
    // Пустой запрос в выдаче категории — обычный каталог, не «поиск по релевантности».
    const emoji = applyQuery(products, parseCatalogState({ q: '📡' }), {
      categoryId: 'antennas',
      categories,
      pageSize: 1000,
    });
    assert.equal(emoji.state.q, '');
    assert.equal(emoji.total, run('antennas').total);
  });

  test('устойчивость к мусору', () => {
    const junk = parseCatalogState({
      q: ['  тип   1  ', 'второе'],
      sort: 'cheap',
      page: '-2',
      view: 'table',
      freq: 'много',
      fmode: 'all',
      strict: 'yes',
      price: 'дёшево',
      request: '2',
      conn: ['N-Female,<script>,', 'sma-female,n-female'],
      gain: '15-10',
      ip67: 'true',
      unknown: 'x',
      cable: undefined,
    });
    assert.deepEqual(
      junk,
      createCatalogState({
        q: 'тип 1',
        options: { conn: ['n-female', 'sma-female'], ip67: ['1'] },
      }),
    );
    for (const input of [
      {},
      new URLSearchParams('page=0&page=1e9&freq=-100&price=-&gain=abc&view='),
      new URLSearchParams('%E0%A4%A=1&q=%FF'),
      { page: '999999999999', freq: '0', price: '5-1', sort: ['name', 'price-asc'] },
    ]) {
      assert.doesNotThrow(() => parseCatalogState(input));
    }
    assert.equal(parseCatalogState({ page: '999999999999' }).page, 100000);
    assert.equal(parseCatalogState({ sort: ['name', 'price-asc'] }).sort, 'name');
    assert.equal(parseCatalogState({ freq: '2.4ghz' }).freq.min, 2400);
    // Мусор в URL не ломает выдачу: ip67 к антеннам не относится и отброшен, разъёмы — OR.
    const result = applyQuery(products, junk, { categoryId: 'antennas', categories });
    assert.deepEqual(ids(result), ['antenna-tip1']);
    assert.deepEqual(result.state.options, { conn: ['n-female', 'sma-female'] });
  });

  test('помощники состояния сбрасывают страницу', () => {
    const state = createCatalogState({ page: 4 });
    const next = toggleFilterValue(state, 'conn', 'n-female');
    assert.deepEqual(next.options, { conn: ['n-female'] });
    assert.equal(next.page, 1);
    assert.deepEqual(toggleFilterValue(next, 'conn', 'n-female').options, {});
  });

  test('размер страницы и вид по умолчанию совпадают с src/config/site.ts', () => {
    const site = readFileSync(path.join(ROOT, 'src/config/site.ts'), 'utf8');
    assert.match(site, new RegExp(`pageSize:\\s*${catalog.DEFAULT_PAGE_SIZE}\\b`));
    assert.match(site, new RegExp(`defaultView:\\s*'${catalog.DEFAULT_VIEW}'`));
  });
});

// ---------------------------------------------------------------------------

describe('цены', () => {
  test('formatPrice и formatProductPrice', () => {
    assert.equal(formatPrice(1300000), `13${NBSP}000${NBSP}₽`);
    assert.equal(formatPrice(9800000), `98${NBSP}000${NBSP}₽`);
    assert.equal(formatPrice(50000), `500${NBSP}₽`);
    assert.equal(formatPrice(1300050), `13${NBSP}000,50${NBSP}₽`);
    assert.equal(formatPrice(0), `0${NBSP}₽`);
    assert.equal(formatProductPrice(product('antenna-tip1')), `13${NBSP}000${NBSP}₽`);
    assert.equal(formatProductPrice(product(EGYPT)), 'Цена по запросу');
  });

  test('preliminaryTotal не выдаёт ложный полный итог при позициях «по запросу»', () => {
    const tip1 = product('antenna-tip1');
    const egypt = product(EGYPT);
    const total = preliminaryTotal([
      { price: tip1.price, priceType: tip1.priceType, qty: 2 },
      { price: egypt.price, priceType: egypt.priceType, qty: 1 },
      { price: 50000, priceType: 'fixed', qty: 3 },
      { price: 50000, priceType: 'fixed', qty: 0 },
    ]);
    assert.deepEqual(total, {
      knownTotal: 2 * 1300000 + 3 * 50000,
      knownCount: 2,
      requestCount: 1,
      hasRequestItems: true,
    });
    assert.deepEqual(preliminaryTotal([{ price: 1300000, priceType: 'fixed', qty: 1 }]), {
      knownTotal: 1300000,
      knownCount: 1,
      requestCount: 0,
      hasRequestItems: false,
    });
  });
});

// ---------------------------------------------------------------------------

describe('характеристики для людей', () => {
  const textOf = (id, code) => {
    const attr = product(id).attributes.find((a) => a.code === code);
    assert.ok(attr, `${id} ${code}`);
    return formatAttrValue(code, attr.value);
  };

  test('форматы значений', () => {
    const cases = [
      ['antenna-tip1', 'frequency', `700–1100${NBSP}МГц`],
      ['antenna-tip14', 'gain_dbi', `18,5${NBSP}дБи`],
      ['mini-antenna-m1', 'gain_dbi', `7–9${NBSP}дБи`],
      ['antenna-tip4', 'size', `2,5${NBSP}м`],
      [EGYPT, 'weight', `16${NBSP}кг`],
      ['antenna-tip9', 'weight', `150${NBSP}г`],
      ['attenuator-0-31db-5w', 'attenuation_range', `0–31${NBSP}дБ`],
      ['attenuator-0-31db-5w', 'max_power', `до${NBSP}5${NBSP}Вт`],
      ['mast-carbon-12m', 'max_load', `до${NBSP}12${NBSP}кг`],
      ['mast-carbon-12m', 'height', `12${NBSP}м`],
      ['mast-carbon-12m', 'weight', `6${NBSP}кг`],
      ['lna-50-1000-20db-ip67-xt60', 'ip67', 'IP67'],
      ['lna-50-1000-20db-ip67-xt60', 'gain_db', `20${NBSP}дБ`],
      ['cable-15cm-sma-m-straight-sma-m-straight-rg316-rg142', 'cable_type', 'RG-316 / RG-142'],
      ['cable-15cm-sma-m-straight-sma-m-angled-rg316', 'cable_length', `15${NBSP}см`],
      ['cable-1m-n-m-n-m-rg142', 'cable_length', `1${NBSP}м`],
      ['lna-6000-8000-10db', 'frequency', `6000–8000${NBSP}ГГц`],
      ['cavity-filter-1060-1360', 'insertion_loss', '0,4'],
    ];
    for (const [id, code, expected] of cases)
      assert.equal(textOf(id, code), expected, `${id} ${code}`);
  });

  test('таблица характеристик: подписи, порядок, статус и происхождение', () => {
    const cavity = formatProductAttributes(product('cavity-filter-1060-1360'));
    assert.deepEqual(
      cavity.map((a) => a.label),
      ['Группа', 'Частотный диапазон', 'Затухание', 'Ослабление'],
    );
    const loss = cavity.find((a) => a.code === 'insertion_loss');
    assert.equal(loss.status, 'needs-review');
    assert.equal(loss.raw, '0.4 затухание');
    assert.ok(loss.note);
    const tip7 = formatProductAttributes(product('antenna-tip7'));
    assert.deepEqual(
      tip7.map((a) => a.label),
      ['Модель', 'Конструкция', 'Частотный диапазон', 'КУ', 'Разъём'],
    );
    assert.equal(tip7.find((a) => a.code === 'frequency').status, 'inferred');
    const cable = formatProductAttributes(product('cable-1m-sma-m-straight-n-m-rg142'));
    assert.deepEqual(
      cable.map((a) => a.label),
      ['Длина кабеля', 'Кабель', 'Разъём 1-го конца', 'Форма 1-го конца', 'Разъём 2-го конца'],
    );
    const lna = formatProductAttributes(product('lna-50-1000-20db-ip67-xt60'));
    const port = lna.find((a) => a.code === 'port1_connector');
    assert.equal(port.origin.kind, 'group-note');
    assert.equal(port.origin.cell, '1!B46');
    assert.equal(lna.find((a) => a.code === 'ip67').label, 'Защита');
  });

  test('строка параметров карточки по категории', () => {
    const line = (id) => formatSpecLine(getSpecLine(product(id)));
    assert.equal(line('antenna-tip1'), `700–1100${NBSP}МГц · 12${NBSP}дБи · N-female`);
    assert.equal(line('mini-antenna-m1'), `1100–1600${NBSP}МГц · 7–9${NBSP}дБи`);
    assert.equal(line(EGYPT), `3100–4500${NBSP}МГц · 16${NBSP}кг`);
    assert.equal(
      line('lna-50-1000-20db-ip67-xt60'),
      `50–1000${NBSP}МГц · 20${NBSP}дБ · IP67, XT60`,
    );
    assert.equal(line('lna-700-6100-10db'), `700–6100${NBSP}МГц · 10${NBSP}дБ`);
    assert.equal(
      line('bandpass-filter-170-340-n-female'),
      `170–340${NBSP}МГц · N-female — N-female`,
    );
    assert.equal(line('bandpass-filter-970-1080'), `970–1080${NBSP}МГц`);
    assert.equal(
      line('cable-15cm-sma-m-straight-sma-m-angled-rg316'),
      `15${NBSP}см · SMA-male прямой — SMA-male угловой · RG-316`,
    );
    assert.equal(line('cable-1m-n-m-n-m-rg142'), `1${NBSP}м · N-male — N-male · RG-142`);
    assert.equal(line('cover-tip2'), 'для Тип2');
    assert.equal(line('mast-carbon-12m'), `12${NBSP}м · 6${NBSP}кг · до${NBSP}12${NBSP}кг`);
    assert.equal(line('attenuator-0-31db-5w'), `0–31${NBSP}дБ · до${NBSP}5${NBSP}Вт`);
    // Статус не теряется: спорные значения помечает UI.
    const tip8 = getSpecLine(product('antenna-tip8'));
    assert.deepEqual(
      tip8.map((item) => item.status),
      ['inferred', 'confirmed', 'needs-review'],
    );
    assert.equal(getSpecLine(product('lna-6000-8000-10db'))[0].status, 'needs-review');
  });
});

// ---------------------------------------------------------------------------

describe('типографика технических значений', () => {
  const kept = (text) =>
    technicalSegments(text)
      .filter((segment) => segment.keep)
      .map((segment) => segment.text);

  test('неразрывный пробел перед единицей, после «до» и перед разделителем', () => {
    assert.equal(nonBreakingText('МШУ 700–6100 МГц, 10 дБ'), `МШУ 700–6100${NBSP}МГц, 10${NBSP}дБ`);
    assert.equal(
      nonBreakingText('Аттенюатор 0–31 дБ, до 5 Вт'),
      `Аттенюатор 0–31${NBSP}дБ, до${NBSP}5${NBSP}Вт`,
    );
    assert.equal(
      nonBreakingText('Фильтр полосовой 136–174, N-female — N-female'),
      `Фильтр полосовой 136–174, N-female${NBSP}— N-female`,
    );
    assert.equal(nonBreakingText('RG-316 / RG-142'), `RG-316${NBSP}/ RG-142`);
    assert.equal(nonBreakingText('12 дБи · N-female'), `12${NBSP}дБи${NBSP}· N-female`);
    // Единица — целым словом: «1 мачта» не склеивается.
    assert.equal(nonBreakingText('1 мачта'), '1 мачта');
  });

  test('дефисные коды и диапазоны — неразрывные сегменты, символы данных те же', () => {
    const name = 'Кабельная сборка 15 см, SMA-male прямой — SMA-male прямой, RG-316 / RG-142';
    assert.deepEqual(kept(name), ['SMA-male', 'SMA-male', 'RG-316', 'RG-142']);
    assert.deepEqual(kept('МШУ 700–6100 МГц, 10 дБ'), [`700–6100${NBSP}МГц`]);
    assert.deepEqual(kept('N/sma-мама'), ['N/sma-мама']);
    assert.deepEqual(kept('Микро-рупорные'), ['Микро-рупорные']);
    // Склейка сегментов — тот же текст, только пробелы неразрывные.
    const joined = technicalSegments(name)
      .map((segment) => segment.text)
      .join('');
    assert.equal(joined.replaceAll(NBSP, ' '), name);
  });
});
