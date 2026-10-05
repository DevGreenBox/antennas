/**
 * Генератор фирменного знака: математическое построение по antennas.md §9.
 *
 * Знак = центральный круг + три группы по две дуги (вверх, вниз-вправо, вниз-влево).
 * Всё строится от ОДНОГО центра C: круг радиуса r0 и шесть кольцевых секторов,
 * у которых внутренняя и внешняя кромки — окружности с центром C, а торцы — радиальные
 * отрезки (лучи из C). Параметры ниже — единственный источник геометрии; значения
 * выбраны по измерениям исходника (scripts/measure-logo.mjs → docs/logo-measurements.json),
 * разбор — в docs/LOGO.md.
 *
 * Для размеров меньше 20 px есть упрощённый вариант: круг + только внутреннее кольцо дуг —
 * те же r0, промежуток, толщина, размах, оси и тот же центр C; внешнее кольцо опущено, потому что
 * при 16 px промежутки полного знака (1,3–1,7 px) сливаются. Им сделан кадр 16 px в favicon.ico,
 * и на него icon.svg переключается через @media, когда браузер рисует иконку меньше 20 px.
 *
 * Запуск: npm run logo   (затем проверка: node scripts/verify-logo.mjs)
 *
 * Выход:
 *   public/brand/logo-mark.svg, logo-mark-mono-dark.svg, logo-mark-{1024,512,256,64,32,16}.png
 *   public/brand/logo-mark-small.svg
 *   src/components/brand/logo-geometry.generated.ts
 *   src/app/icon.svg, src/app/apple-icon.png, src/app/favicon.ico
 *   docs/logo/ и public/brand/: before-after.png, construction.{svg,png}, favicon-sizes.png
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// ═════════════════════════════ ПАРАМЕТРЫ ПОСТРОЕНИЯ ═════════════════════════════
// Единица длины — модуль u = 1 единица viewBox. В исходнике 1 u ≈ 35,5 px растра 4600×4600
// (МНК-масштаб по пяти радиусам); модуль выбран как 1/8 толщины дуги, тогда все радиусы целые.

/** Радиус центрального круга. Измерено 349,1 px = 9,83 u. */
const R0 = 10;
/** Толщина дуги — одна для обоих колец. Измерено 283,2 px (кольцо 1) и 280,8 px (кольцо 2). */
const T = 8;
/** Промежуток круг → внутреннее кольцо. Измерено 321,5 px = 9,06 u. */
const GAP0 = 9;
/** Промежуток внутреннее → внешнее кольцо. Измерено 258,3 px = 7,28 u. */
const GAP1 = 7;
/**
 * Угловой размах каждой группы, °. Один луч-торец на обе дуги стороны: в исходнике концы
 * внутренней и внешней дуги лежат на одной прямой (расхождение ≤ 0,12°, ≤ 1,2 px), только
 * прямая проходит мимо центра на 90–130 px. Радиальные лучи, ближайшие по МНК к точкам торцов
 * между кромками, дают размах 70,5–71,2°; среднее размахов двух колец по средней линии — 72,3°
 * (75,5° и 69,1°). Берём 72° — промежуток между группами 48°, отношение 3 : 2 (docs/LOGO.md).
 */
const SPAN_DEG = 72;
/** Оси групп — азимуты по часовой от вертикали «вверх». Верхняя группа строго вертикальна. */
const AXES_DEG = [0, 120, 240];
/** Фирменный оранжевый — доминирующий цвет непрозрачных пикселей исходника (99,69 %). */
const COLOR = '#FA9506';
/** Монохромный вариант для печати и однотонных поверхностей. */
const MONO_COLOR = '#111111';
/** Доступное имя знака. Название бренда не подтверждено (CLAUDE.md), поэтому нейтрально. */
const TITLE = 'Логотип';

/** Поле вокруг контура в основном SVG, u. 0 — viewBox совпадает с габаритом контура. */
const PAD = 0;
/** Поле фавиконки, u: квадрат 2·(r2o + поле), центр квадрата — центр C. */
const ICON_PAD = 1;
/** Apple touch icon: размер, поле от края до внешнего радиуса, px; фон белый (iOS не любит альфу). */
const APPLE_ICON_SIZE = 180;
const APPLE_ICON_MARGIN = 22;
/**
 * Размеры PNG-превью (квадрат, знак вписан по габариту, фон прозрачный). Размеры меньше
 * SMALL_BELOW_PX рисуются упрощённым вариантом — то же правило, что у favicon.ico.
 */
const PREVIEW_SIZES = [1024, 512, 256, 64, 32, 16];
/** Размеры внутри favicon.ico (PNG-в-ICO). Кадры меньше SMALL_BELOW_PX — упрощённый вариант. */
const ICO_SIZES = [16, 32, 48];
/**
 * Порог упрощённого варианта, px стороны иконки. Сравнение рендеров (docs/logo/favicon-sizes.png):
 * при 20 px промежуток между кольцами полного знака 7 u · 20/86 = 1,6 px — обе дуги каждой группы
 * различимы; при 16 px — 1,3 px, нижние группы сливаются в пятно. Поэтому < 20 px — упрощённый.
 */
const SMALL_BELOW_PX = 20;
/** Знаков после запятой в координатах: ошибка округления ≤ 5·10⁻⁸ u, центры дуг — в пределах 10⁻⁶. */
const DECIMALS = 7;

// Производные радиусы (u)
const R1I = R0 + GAP0; // 19 — внутренняя кромка внутреннего кольца
const R1O = R1I + T; // 27 — внешняя кромка внутреннего кольца
const R2I = R1O + GAP1; // 34 — внутренняя кромка внешнего кольца
const R2O = R2I + T; // 42 — внешняя кромка внешнего кольца
const RINGS = [
  { inner: R1I, outer: R1O },
  { inner: R2I, outer: R2O },
];
/**
 * Упрощённый вариант: только внутреннее кольцо. Отвергнутые кандидаты (сравнивались рендером 16 px):
 * оба кольца с радиусами, привязанными к пиксельной сетке (промежутки 1 px — та же каша); толстое
 * одно кольцо (r0 3, кольцо 5–8 px) — читается, но превращается в подобие знака радиационной
 * опасности, а §9 запрещает подменять символ; только внешнее кольцо — дуги 1,5 px, знак «пустой».
 */
const SMALL_RINGS = [RINGS[0]];

// ═════════════════════════════ геометрия ═════════════════════════════

const root = path.resolve(import.meta.dirname, '..');
const rad = (deg) => (deg * Math.PI) / 180;

function num(v) {
  const s = v.toFixed(DECIMALS).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** Точка на окружности радиуса r вокруг (cx, cy) по азимуту a (° по часовой от «вверх»; ось y вниз). */
function at(cx, cy, r, a) {
  return { x: cx + r * Math.sin(rad(a)), y: cy - r * Math.cos(rad(a)) };
}

/** Секторы: для каждой оси и каждого кольца — [a1, a2] и радиусы. */
function sectors(rings = RINGS) {
  const list = [];
  for (const axis of AXES_DEG) {
    for (const ring of rings) {
      list.push({ axis, a1: axis - SPAN_DEG / 2, a2: axis + SPAN_DEG / 2, ...ring });
    }
  }
  return list;
}

/**
 * Path d знака с центром (cx, cy). Каждый сектор — один замкнутый контур по часовой:
 * внешняя дуга a1→a2 (sweep=1), радиальный торец, внутренняя дуга a2→a1 (sweep=0), торец.
 * Круг — две полуокружности (команды A), чтобы весь знак был одним path.
 * rings = SMALL_RINGS даёт упрощённый вариант с тем же центром и теми же радиусами.
 */
function pathD(cx, cy, rings = RINGS) {
  const parts = [];
  const large = SPAN_DEG > 180 ? 1 : 0;
  for (const s of sectors(rings)) {
    const p0 = at(cx, cy, s.outer, s.a1);
    const p1 = at(cx, cy, s.outer, s.a2);
    const p2 = at(cx, cy, s.inner, s.a2);
    const p3 = at(cx, cy, s.inner, s.a1);
    parts.push(
      `M${num(p0.x)} ${num(p0.y)}` +
        `A${num(s.outer)} ${num(s.outer)} 0 ${large} 1 ${num(p1.x)} ${num(p1.y)}` +
        `L${num(p2.x)} ${num(p2.y)}` +
        `A${num(s.inner)} ${num(s.inner)} 0 ${large} 0 ${num(p3.x)} ${num(p3.y)}Z`,
    );
  }
  parts.push(
    `M${num(cx - R0)} ${num(cy)}` +
      `A${num(R0)} ${num(R0)} 0 1 1 ${num(cx + R0)} ${num(cy)}` +
      `A${num(R0)} ${num(R0)} 0 1 1 ${num(cx - R0)} ${num(cy)}Z`,
  );
  return parts.join('');
}

/** Точный габарит контура при C = (0, 0): концы дуг + точки касания осей внутри дуг. */
function bboxAtOrigin(rings = RINGS) {
  const pts = [
    { x: -R0, y: 0 },
    { x: R0, y: 0 },
    { x: 0, y: -R0 },
    { x: 0, y: R0 },
  ];
  for (const s of sectors(rings)) {
    for (const r of [s.inner, s.outer]) {
      pts.push(at(0, 0, r, s.a1), at(0, 0, r, s.a2));
      for (let a = -360; a <= 720; a += 90) if (a > s.a1 && a < s.a2) pts.push(at(0, 0, r, a));
    }
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Плотная рамка варианта: viewBox от 0 0, центр C смещён на (−minX + PAD, −minY + PAD). */
function markGeometry(rings) {
  const bb = bboxAtOrigin(rings);
  const g = {
    cx: -bb.minX + PAD,
    cy: -bb.minY + PAD,
    width: bb.maxX - bb.minX + 2 * PAD,
    height: bb.maxY - bb.minY + 2 * PAD,
  };
  g.viewBox = `0 0 ${num(g.width)} ${num(g.height)}`;
  g.d = pathD(g.cx, g.cy, rings);
  return g;
}

const MARK = markGeometry(RINGS);
const SMALL_MARK = markGeometry(SMALL_RINGS);

// Фавиконка: квадрат с центром в C — у трёхлучевой композиции оптический центр в круге.
// Оба варианта рисуются в одних координатах (тот же C); у упрощённого квадрат меньше:
// 2·(внешний радиус его кольца + то же поле).
const ICON_SIDE = 2 * (R2O + ICON_PAD);
const ICON = { cx: ICON_SIDE / 2, cy: ICON_SIDE / 2, half: R2O + ICON_PAD };
ICON.d = pathD(ICON.cx, ICON.cy);
const ICON_SMALL = { cx: ICON.cx, cy: ICON.cy, half: R1O + ICON_PAD };
ICON_SMALL.d = pathD(ICON.cx, ICON.cy, SMALL_RINGS);
ICON_SMALL.viewBox = [
  ICON_SMALL.cx - ICON_SMALL.half,
  ICON_SMALL.cy - ICON_SMALL.half,
  2 * ICON_SMALL.half,
  2 * ICON_SMALL.half,
]
  .map(num)
  .join(' ');

function markSvg({ color, title, d = MARK.d, viewBox = MARK.viewBox }) {
  const a11y = title ? ` role="img" aria-labelledby="logo-mark-title"` : ` aria-hidden="true"`;
  const titleEl = title ? `<title id="logo-mark-title">${title}</title>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${a11y}>` +
    `${titleEl}<path fill="${color}" d="${d}"/></svg>\n`
  );
}

/**
 * icon.svg: по умолчанию полный знак; когда иконку рисуют уже SMALL_BELOW_PX (вкладка 16 px),
 * @media внутри SVG прячет его и показывает упрощённый вариант. Медиазапрос в SVG-изображении
 * считается по его собственной области просмотра (проверено в Chromium: 16 и 19 px — упрощённый,
 * 20+ px — полный, независимо от DPR). Без поддержки CSS остаётся полный знак: упрощённый скрыт
 * атрибутом display="none", а CSS-правило имеет приоритет над атрибутом. Вложенный <svg> без
 * размеров растягивается на весь viewBox родителя, его собственный viewBox — квадрат вокруг того
 * же C, поэтому координаты упрощённого контура те же, что у полного.
 */
function iconSvg() {
  const side = num(ICON_SIDE);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" role="img" aria-labelledby="logo-mark-title">` +
    `<title id="logo-mark-title">${TITLE}</title>` +
    `<style>@media (max-width:${SMALL_BELOW_PX - 0.02}px){.full{display:none}.small{display:inline}}</style>` +
    `<path class="full" fill="${COLOR}" d="${ICON.d}"/>` +
    `<svg class="small" viewBox="${ICON_SMALL.viewBox}" display="none">` +
    `<path fill="${COLOR}" d="${ICON_SMALL.d}"/></svg></svg>\n`
  );
}

/** SVG для растеризации в квадрат size×size: знак вписан по габариту и отцентрирован. */
function squareRenderSvg(size, geom = MARK) {
  const side = Math.max(geom.width, geom.height);
  const x = (geom.width - side) / 2;
  const y = (geom.height - side) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="${num(x)} ${num(y)} ${num(side)} ${num(side)}">` +
    `<path fill="${COLOR}" d="${geom.d}"/></svg>`
  );
}

/**
 * SVG фавиконки (квадрат с центром в C). По умолчанию поле — ICON_PAD в u, как в icon.svg;
 * marginPx — поле в px от края до внешнего радиуса (apple-icon). small — упрощённый вариант.
 */
function iconRenderSvg(size, { small = false, background, marginPx } = {}) {
  const v0 = small ? ICON_SMALL : ICON;
  const outer = v0.half - ICON_PAD;
  const half = marginPx === undefined ? v0.half : (outer * (size / 2)) / (size / 2 - marginPx);
  const v = `${num(v0.cx - half)} ${num(v0.cy - half)} ${num(2 * half)} ${num(2 * half)}`;
  const bg = background
    ? `<rect x="${num(v0.cx - half)}" y="${num(v0.cy - half)}" width="${num(2 * half)}" height="${num(2 * half)}" fill="${background}"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${v}">` +
    `${bg}<path fill="${COLOR}" d="${v0.d}"/></svg>`
  );
}

// ═════════════════════════════ растеризация ═════════════════════════════

/**
 * В контейнере нет системных шрифтов, а подписи схемы растеризует librsvg через fontconfig.
 * Подкладываем Geist из пакета next (есть кириллица) отдельным fonts.conf; переменная должна
 * стоять до первой отрисовки текста, поэтому sharp импортируется динамически ниже.
 */
function setupFonts() {
  const require = createRequire(import.meta.url);
  try {
    const nextDir = path.dirname(require.resolve('next/package.json'));
    const fontDir = path.join(nextDir, 'dist/compiled/@vercel/og');
    if (!existsSync(path.join(fontDir, 'Geist-Regular.ttf'))) throw new Error('нет Geist');
    const tmp = path.join(os.tmpdir(), 'antennas-logo-fontconfig');
    mkdirSync(tmp, { recursive: true });
    const conf = path.join(tmp, 'fonts.conf');
    writeFileSync(
      conf,
      `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>` +
        `<dir>${fontDir}</dir><cachedir>${tmp}/cache</cachedir></fontconfig>`,
    );
    process.env.FONTCONFIG_FILE = conf;
    return true;
  } catch {
    console.warn('! шрифт Geist не найден: подписи в construction.png могут не отрисоваться');
    return false;
  }
}
setupFonts();
const { default: sharp } = await import('sharp');

const render = (svg) => sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();

function write(rel, content) {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  console.log('  ', rel);
}

/** ICO-контейнер с PNG внутри: ICONDIR (6 байт) + ICONDIRENTRY по 16 байт + данные PNG. */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // ширина (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // высота
    e.writeUInt8(0, 2); // палитра не используется
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // бит на пиксель
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

// ═════════════════════════════ схема построения ═════════════════════════════

const FONT = `font-family="Geist, 'Segoe UI', Arial, sans-serif"`;
const fmtRu = (v, d = 1) => v.toFixed(d).replace('.', ',');

function constructionSvg() {
  const S = 13; // px на u
  const W = 1500;
  const H = 1500;
  const cx = 720;
  const cy = 700;
  const P = (r, a) => at(cx, cy, r * S, a);
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<title>Схема построения знака</title>`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    // сам знак — светлой заливкой, чтобы вспомогательные линии читались поверх
    `<g transform="translate(${cx} ${cy}) scale(${S})"><path fill="${COLOR}" fill-opacity="0.28" d="${pathD(0, 0)}"/></g>`,
  );
  // вспомогательные окружности всех радиусов
  for (const [r, name] of [
    [R0, 'r0'],
    [R1I, 'r1i'],
    [R1O, 'r1o'],
    [R2I, 'r2i'],
    [R2O, 'r2o'],
  ]) {
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="${r * S}" fill="none" stroke="#3b4a5a" stroke-width="1.2" stroke-dasharray="6 5" data-r="${name}"/>`,
    );
  }
  // лучи торцов и оси групп
  const rayEnd = R2O + 5;
  for (const s of sectors().filter((x) => x.inner === R1I)) {
    for (const a of [s.a1, s.a2]) {
      const e = P(rayEnd, a);
      out.push(
        `<line x1="${cx}" y1="${cy}" x2="${num(e.x)}" y2="${num(e.y)}" stroke="#c0392b" stroke-width="1.4"/>`,
      );
      const l = P(rayEnd + 2.6, a);
      const norm = ((a % 360) + 360) % 360;
      out.push(
        `<text x="${num(l.x)}" y="${num(l.y + 7)}" text-anchor="middle" font-size="20" fill="#c0392b" ${FONT}>${num(norm)}°</text>`,
      );
    }
    const e = P(rayEnd, s.axis);
    out.push(
      `<line x1="${cx}" y1="${cy}" x2="${num(e.x)}" y2="${num(e.y)}" stroke="#3b4a5a" stroke-width="1" stroke-dasharray="14 4 3 4"/>`,
    );
    const l = P(rayEnd + 2.6, s.axis);
    out.push(
      `<text x="${num(l.x)}" y="${num(l.y + 7)}" text-anchor="middle" font-size="20" fill="#3b4a5a" ${FONT}>ось ${s.axis}°</text>`,
    );
  }
  // дуги углов: размах верхней группы и промежуток верх → низ-право
  const angleArc = (r, a1, a2, label, color) => {
    const p1 = P(r, a1);
    const p2 = P(r, a2);
    const lp = P(r + 1.9, (a1 + a2) / 2);
    out.push(
      `<path d="M${num(p1.x)} ${num(p1.y)}A${r * S} ${r * S} 0 0 1 ${num(p2.x)} ${num(p2.y)}" fill="none" stroke="${color}" stroke-width="1.6"/>`,
      `<text x="${num(lp.x)}" y="${num(lp.y + 7)}" text-anchor="middle" font-size="20" font-weight="600" fill="${color}" ${FONT}>${label}</text>`,
    );
  };
  angleArc(R2O + 2.2, -SPAN_DEG / 2, SPAN_DEG / 2, `размах ${SPAN_DEG}°`, '#c0392b');
  angleArc(R2O + 2.2, SPAN_DEG / 2, 120 - SPAN_DEG / 2, `промежуток ${120 - SPAN_DEG}°`, '#3b4a5a');
  // размерная линия радиусов — вниз по свободному промежутку между нижними группами (азимут 180°)
  const down = (r) => cy + r * S;
  out.push(
    `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${down(R2O + 1)}" stroke="#111" stroke-width="1.4"/>`,
  );
  for (const [r, label] of [
    [R0, `r0 = ${R0}`],
    [R1I, `r1i = ${R1I}`],
    [R1O, `r1o = ${R1O}`],
    [R2I, `r2i = ${R2I}`],
    [R2O, `r2o = ${R2O}`],
  ]) {
    // белая плашка под подписью: подпись стоит на пунктирной окружности и иначе перечёркнута ею
    // (ширина — оценка по ~10 px на знак Geist 18 px; текст короткий, запас 8 px)
    out.push(
      `<line x1="${cx - 7}" y1="${down(r)}" x2="${cx + 7}" y2="${down(r)}" stroke="#111" stroke-width="2"/>`,
      `<rect x="${cx + 9}" y="${down(r) - 11}" width="${label.length * 10 + 8}" height="22" fill="#fff"/>`,
      `<text x="${cx + 12}" y="${down(r) + 6}" font-size="18" fill="#111" ${FONT}>${label}</text>`,
    );
  }
  for (const [r1, r2, label] of [
    [R0, R1I, `g0 = ${GAP0}`],
    [R1I, R1O, `t = ${T}`],
    [R1O, R2I, `g1 = ${GAP1}`],
    [R2I, R2O, `t = ${T}`],
  ]) {
    out.push(
      `<text x="${cx - 12}" y="${(down(r1) + down(r2)) / 2 + 6}" text-anchor="end" font-size="18" font-style="italic" fill="#555" ${FONT}>${label}</text>`,
    );
  }
  // центр C
  out.push(
    `<line x1="${cx - 22}" y1="${cy}" x2="${cx + 22}" y2="${cy}" stroke="#111" stroke-width="2"/>`,
    `<line x1="${cx}" y1="${cy - 22}" x2="${cx}" y2="${cy + 22}" stroke="#111" stroke-width="2"/>`,
    `<text x="${cx + 10}" y="${cy - 10}" font-size="22" font-weight="600" fill="#111" ${FONT}>C</text>`,
  );
  // легенда
  const legend = [
    'Схема построения знака (все размеры — в модулях u; 1 u = 1 единица viewBox)',
    `Один центр C для круга и всех дуг; C = (${num(MARK.cx)}; ${num(MARK.cy)}) в viewBox «${MARK.viewBox}».`,
    `Круг r0 = ${R0}; кольцо 1: r1i = ${R1I}, r1o = ${R1O}; кольцо 2: r2i = ${R2I}, r2o = ${R2O}; толщина t = ${T};`,
    `промежутки g0 = ${GAP0} (круг → кольцо 1), g1 = ${GAP1} (кольцо 1 → кольцо 2).`,
    `Оси групп ${AXES_DEG.map((a) => `${a}°`).join(', ')} (азимут по часовой от вертикали); размах ${SPAN_DEG}°, промежуток ${120 - SPAN_DEG}°;`,
    'торцы — радиальные лучи из C (у обеих дуг группы общие). Цвет ' + COLOR + '.',
  ];
  legend.forEach((line, i) => {
    out.push(
      `<text x="60" y="${H - 190 + i * 30}" font-size="${i === 0 ? 22 : 19}" ${i === 0 ? 'font-weight="600"' : ''} fill="#111" ${FONT}>${line}</text>`,
    );
  });
  out.push('</svg>');
  return out.join('\n') + '\n';
}

// ═════════════════════════════ до / после ═════════════════════════════

async function beforeAfterPng() {
  const measPath = path.join(root, 'docs/logo-measurements.json');
  const srcPath = path.join(root, 'source/derived/logo-original-4600.png');
  if (!existsSync(measPath) || !existsSync(srcPath)) {
    console.warn('! нет измерений или растра исходника — before-after.png пропущен');
    return null;
  }
  const m = JSON.parse(readFileSync(measPath, 'utf8'));
  const C0 = { x: m.circle.cx, y: m.circle.cy };
  // Масштаб «px исходника на u» — МНК по пяти радиусам (измеренные средние ↔ выбранные целые).
  const A = m.summary.averages;
  const pairs = [
    [A.r0, R0],
    [A.r1i, R1I],
    [A.r1o, R1O],
    [A.r2i, R2I],
    [A.r2o, R2O],
  ];
  const uPx =
    pairs.reduce((s, [mv, k]) => s + mv * k, 0) / pairs.reduce((s, [, k]) => s + k * k, 0);

  const panel = 720;
  const half = 1700; // половина стороны кадра в px исходника, кадр центрирован на центре круга
  const k = panel / (2 * half);
  const crop = await sharp(srcPath)
    .extract({
      left: Math.round(C0.x - half),
      top: Math.round(C0.y - half),
      width: 2 * half,
      height: 2 * half,
    })
    .resize(panel, panel)
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  // сдвиг из-за округления границ кадра — чтобы центр круга исходника лёг точно в центр панели
  const offX = (C0.x - Math.round(C0.x - half) - half) * k;
  const offY = (C0.y - Math.round(C0.y - half) - half) * k;
  const img = `data:image/png;base64,${crop.toString('base64')}`;
  const s = uPx * k; // px панели на u
  const gutter = 40;
  const top = 80;
  const W = 3 * panel + 4 * gutter;
  const H = top + panel + 150;
  const px = (i) => gutter + i * (panel + gutter);
  const c = panel / 2;
  const mark = (fill, extra = '') =>
    `<g transform="translate(${num(c)} ${num(c)}) scale(${num(s)})"><path d="${pathD(0, 0)}" fill="${fill}" ${extra}/></g>`;
  const cross = (x, y, len, color, w) =>
    `<line x1="${num(x - len)}" y1="${num(y)}" x2="${num(x + len)}" y2="${num(y)}" stroke="${color}" stroke-width="${w}"/>` +
    `<line x1="${num(x)}" y1="${num(y - len)}" x2="${num(x)}" y2="${num(y + len)}" stroke="${color}" stroke-width="${w}"/>`;
  // центры собственных окружностей кромок исходника — в координатах панели
  const arcCenters = m.arcs
    .flatMap((a) => [a.inner, a.outer])
    .map((e) => ({ x: c + offX + (e.cx - C0.x) * k, y: c + offY + (e.cy - C0.y) * k }));
  const off = m.summary.centerOffsetPx;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  ];
  const titles = [
    'До: исходник (растр из PDF)',
    'После: построение от одного центра',
    'Наложение: новый контур поверх исходника',
  ];
  titles.forEach((t, i) =>
    out.push(
      `<text x="${px(i) + panel / 2}" y="50" text-anchor="middle" font-size="26" font-weight="600" fill="#111" ${FONT}>${t}</text>`,
    ),
  );
  // 1 — исходник
  out.push(
    `<g transform="translate(${px(0)} ${top})"><rect width="${panel}" height="${panel}" fill="#fff" stroke="#ddd"/>` +
      `<image x="${num(-offX)}" y="${num(-offY)}" width="${panel}" height="${panel}" href="${img}" xlink:href="${img}"/>` +
      cross(c, c, 10, '#111', 1.5) +
      `</g>`,
  );
  // 2 — новый знак
  out.push(
    `<g transform="translate(${px(1)} ${top})"><rect width="${panel}" height="${panel}" fill="#fff" stroke="#ddd"/>` +
      mark(COLOR) +
      cross(c, c, 10, '#111', 1.5) +
      `</g>`,
  );
  // 3 — наложение: исходник + новый знак полупрозрачным синим с контуром
  out.push(
    `<g transform="translate(${px(2)} ${top})"><rect width="${panel}" height="${panel}" fill="#fff" stroke="#ddd"/>` +
      `<image x="${num(-offX)}" y="${num(-offY)}" width="${panel}" height="${panel}" href="${img}" xlink:href="${img}"/>` +
      mark('#1d4ed8', `fill-opacity="0.35" stroke="#1d3a8a" stroke-width="${num(1.4 / s)}"`) +
      arcCenters.map((p) => cross(p.x, p.y, 6, '#b91c1c', 2)).join('') +
      cross(c, c, 12, '#111', 2) +
      `</g>`,
  );
  const notes = [
    `Масштаб общий, совмещение по центру круга исходника C0 = (${fmtRu(C0.x)}; ${fmtRu(C0.y)}) px; 1 u = ${fmtRu(uPx, 2)} px исходника.`,
    `Красные кресты — центры окружностей 12 кромок дуг исходника: отстоят от C0 на ${fmtRu(off.min)}–${fmtRu(off.max)} px ` +
      `(${fmtRu((100 * off.min) / m.circle.r, 0)}–${fmtRu((100 * off.max) / m.circle.r, 0)} % радиуса круга). В новом знаке все центры — в C.`,
    `Синий — новый знак (r0 ${R0}, кольца ${R1I}–${R1O} и ${R2I}–${R2O} u, размах ${SPAN_DEG}°, радиальные торцы).`,
  ];
  notes.forEach((t, i) =>
    out.push(
      `<text x="${gutter}" y="${top + panel + 45 + i * 32}" font-size="20" fill="#333" ${FONT}>${t}</text>`,
    ),
  );
  out.push('</svg>');
  return { png: await render(out.join('\n')), uPx };
}

// ═════════════════════════════ фавиконка: сравнение размеров ═════════════════════════════

/**
 * Лист для документации: полный и упрощённый варианты в размерах вкладки, ровно теми рендерами,
 * что идут в favicon.ico. Увеличение ×12 — ближайшим соседом, чтобы видеть реальные пиксели 16 px.
 */
async function faviconSheetPng() {
  const ZOOM = 12;
  const SIZES = [16, 20, 24, 32, 48];
  // фон: светлая вкладка, полоса вкладок, тёмная тема
  const BGS = ['#ffffff', '#dee1e6', '#35363a'];
  const W = 1180;
  const rowH = 16 * ZOOM + 90;
  const top = 70;
  const H = top + 2 * rowH + 130;
  const x1 = 40 + 2 * (16 * ZOOM + 24) + 20; // начало колонок 1:1
  const step = 70;
  const pxPerU = (size, small) => size / (2 * (small ? ICON_SMALL : ICON).half);
  const rows = [
    {
      small: false,
      title: 'Полный знак — icon.svg от 20 px, кадры 32 и 48 px в favicon.ico',
    },
    {
      small: true,
      title: `Упрощённый вариант — кадр 16 px в favicon.ico, icon.svg меньше ${SMALL_BELOW_PX} px`,
    },
  ];
  const text = [];
  const tiles = [];
  text.push(
    `<text x="40" y="44" font-size="24" font-weight="600" fill="#111" ${FONT}>Фавиконка: читаемость в малых размерах</text>`,
  );
  for (const [i, row] of rows.entries()) {
    const y = top + i * rowH;
    text.push(
      `<text x="40" y="${y + 22}" font-size="19" font-weight="600" fill="#111" ${FONT}>${row.title}</text>`,
      `<text x="40" y="${y + 56 + 16 * ZOOM + 22}" font-size="15" fill="#555" ${FONT}>16 px, увеличено ×${ZOOM}: светлая и тёмная вкладка</text>`,
    );
    for (const [j, bg] of [BGS[0], BGS[2]].entries()) {
      const png = await render(iconRenderSvg(16, { small: row.small, background: bg }));
      tiles.push({
        input: await sharp(png)
          .resize(16 * ZOOM, 16 * ZOOM, { kernel: 'nearest' })
          .png()
          .toBuffer(),
        left: 40 + j * (16 * ZOOM + 24),
        top: y + 40,
      });
    }
    for (const [j, bg] of BGS.entries()) {
      let x = x1;
      for (const size of SIZES) {
        if (j === 0) {
          text.push(
            `<text x="${x}" y="${y + 52}" font-size="14" fill="#555" ${FONT}>${size} px</text>`,
          );
        }
        tiles.push({
          input: await render(iconRenderSvg(size, { small: row.small, background: bg })),
          left: x,
          top: y + 64 + j * 62,
        });
        x += step;
      }
    }
  }
  const f = (size, small, u) => fmtRu(u * pxPerU(size, small));
  const notes = [
    `16 px, полный знак: промежуток между кольцами ${f(16, false, GAP1)} px, круг → кольцо ${f(16, false, GAP0)} px, дуга ${f(16, false, T)} px — нижние группы сливаются.`,
    `20 px, полный знак: промежуток между кольцами ${f(20, false, GAP1)} px — обе дуги каждой группы уже различимы; отсюда порог ${SMALL_BELOW_PX} px.`,
    `16 px, упрощённый: тот же центр, r0, промежуток ${GAP0} u, толщина ${T} u, размах ${SPAN_DEG}°; внешнее кольцо опущено — промежуток ${f(16, true, GAP0)} px, дуга ${f(16, true, T)} px.`,
  ];
  notes.forEach((t, i) =>
    text.push(
      `<text x="40" y="${top + 2 * rowH + 40 + i * 30}" font-size="16" fill="#333" ${FONT}>${t}</text>`,
    ),
  );
  const base =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#f4f4f5"/>${text.join('')}</svg>`;
  return sharp(Buffer.from(base)).composite(tiles).png({ compressionLevel: 9 }).toBuffer();
}

// ═════════════════════════════ сборка ═════════════════════════════

console.log('Сборка знака:');
console.log(
  `  C = (${num(MARK.cx)}; ${num(MARK.cy)}), viewBox ${MARK.viewBox}; r0 ${R0}, кольца ${R1I}–${R1O}, ${R2I}–${R2O}; размах ${SPAN_DEG}°`,
);

write('public/brand/logo-mark.svg', markSvg({ color: COLOR, title: TITLE }));
write('public/brand/logo-mark-mono-dark.svg', markSvg({ color: MONO_COLOR, title: TITLE }));
write(
  'public/brand/logo-mark-small.svg',
  markSvg({ color: COLOR, title: TITLE, d: SMALL_MARK.d, viewBox: SMALL_MARK.viewBox }),
);
for (const size of PREVIEW_SIZES) {
  const geom = size < SMALL_BELOW_PX ? SMALL_MARK : MARK;
  write(`public/brand/logo-mark-${size}.png`, await render(squareRenderSvg(size, geom)));
}

const params = {
  u: 1,
  r0: R0,
  t: T,
  gap0: GAP0,
  gap1: GAP1,
  r1i: R1I,
  r1o: R1O,
  r2i: R2I,
  r2o: R2O,
  spanDeg: SPAN_DEG,
  axesDeg: AXES_DEG,
};
write(
  'src/components/brand/logo-geometry.generated.ts',
  [
    '// Сгенерировано scripts/build-logo.mjs (npm run logo) — не редактировать вручную.',
    '// Геометрия знака: один центр C для круга и всех дуг, торцы — радиальные (docs/LOGO.md).',
    '',
    `export const LOGO_MARK_VIEWBOX = '${MARK.viewBox}';`,
    `export const LOGO_MARK_WIDTH = ${num(MARK.width)};`,
    `export const LOGO_MARK_HEIGHT = ${num(MARK.height)};`,
    `export const LOGO_MARK_CENTER = { x: ${num(MARK.cx)}, y: ${num(MARK.cy)} } as const;`,
    `export const LOGO_MARK_COLOR = '${COLOR}';`,
    `export const LOGO_MARK_MONO_COLOR = '${MONO_COLOR}';`,
    `export const LOGO_MARK_PARAMS = {`,
    ...Object.entries(params).map(
      ([k, v]) => `  ${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v},`,
    ),
    '} as const;',
    `export const LOGO_MARK_PATH =`,
    `  '${MARK.d}';`,
    '',
  ].join('\n'),
);

write('src/app/icon.svg', iconSvg());
write(
  'src/app/apple-icon.png',
  await sharp(
    await render(
      iconRenderSvg(APPLE_ICON_SIZE, { background: '#ffffff', marginPx: APPLE_ICON_MARGIN }),
    ),
  )
    .flatten({ background: '#ffffff' })
    .png({ compressionLevel: 9 })
    .toBuffer(),
);
const icoImages = [];
for (const size of ICO_SIZES) {
  const small = size < SMALL_BELOW_PX;
  icoImages.push({ size, png: await render(iconRenderSvg(size, { small })) });
}
write('src/app/favicon.ico', buildIco(icoImages));
console.log(
  `  favicon.ico: ${ICO_SIZES.map((s) => `${s} px — ${s < SMALL_BELOW_PX ? 'упрощённый' : 'полный'}`).join(', ')}`,
);

// Схема и сравнение нужны и в документации, и на служебной странице /brand: docs/ публично не
// отдаётся, поэтому те же файлы кладутся ещё и в public/brand/.
const construction = constructionSvg();
const constructionPng = await render(construction);
const faviconSheet = await faviconSheetPng();
for (const dir of ['docs/logo', 'public/brand']) {
  write(`${dir}/construction.svg`, construction);
  write(`${dir}/construction.png`, constructionPng);
  write(`${dir}/favicon-sizes.png`, faviconSheet);
}
const ba = await beforeAfterPng();
if (ba) {
  write('docs/logo/before-after.png', ba.png);
  write('public/brand/before-after.png', ba.png);
  console.log(`  масштаб наложения: 1 u = ${fmtRu(ba.uPx, 3)} px исходника`);
}
console.log('Готово. Проверка геометрии: node scripts/verify-logo.mjs');
