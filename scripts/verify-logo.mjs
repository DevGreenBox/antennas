/**
 * Программная проверка геометрии знака (antennas.md §9) по готовым SVG, а не по генератору:
 * читаем файлы, разбираем path и пересчитываем всё из координат.
 *
 *  - центр каждой команды A вычисляется из концов, радиуса и флагов (large-arc, sweep) по
 *    алгоритму SVG 1.1 F.6.5 — все центры должны совпасть с центром круга C (допуск 1e-6 u);
 *  - торцы радиальные: оба конца отрезка-торца лежат на одном луче из C;
 *  - соответствующие дуги трёх направлений — одинаковые радиусы, толщина и угловой размах;
 *  - оси групп через 120°;
 *  - нет <image>, base64, data:, внешних ссылок;
 *  - viewBox плотный: габарит контура = viewBox (у фавиконки — квадрат с центром в C и полем);
 *  - цвет совпадает с измеренным (docs/logo-measurements.json), сгенерированный TS — с SVG.
 *
 * Запуск: node scripts/verify-logo.mjs [файл.svg …]   (без аргументов — все файлы знака)
 * Код выхода 1, если хоть одна проверка не прошла.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
/** Допуск по длине, u. Координаты в SVG записаны с 7 знаками — ошибка округления ≤ 5·10⁻⁸. */
const TOL = 1e-6;
/** Допуск по углу, °. 10⁻⁶ u на радиусе 19 u — это 3·10⁻⁶°. */
const ANG_TOL = 1e-5;
const MONO_COLOR = '#111111';

const DEFAULT_FILES = [
  'public/brand/logo-mark.svg',
  'public/brand/logo-mark-mono-dark.svg',
  'public/brand/logo-mark-small.svg',
  'src/app/icon.svg',
];

// ═════════════════════════════ разбор ═════════════════════════════

/** Теги SVG по порядку; для path запоминаем ближайший охватывающий <svg>. */
function parseSvg(text) {
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
  const stack = [];
  const svgs = [];
  const paths = [];
  const tags = [];
  for (const m of text.matchAll(tagRe)) {
    const [, close, name, attrStr, selfClose] = m;
    if (close) {
      if (name === 'svg') stack.pop();
      continue;
    }
    tags.push(name);
    const attrs = Object.fromEntries(
      [...attrStr.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
    );
    if (name === 'svg') {
      const node = { attrs, parent: stack.at(-1) ?? null };
      svgs.push(node);
      if (!selfClose) stack.push(node);
    } else if (name === 'path') {
      paths.push({ attrs, svg: stack.at(-1) ?? null });
    }
  }
  return { svgs, paths, tags };
}

/** Path d → подпути с сегментами. Поддерживаются только абсолютные M, L, A, Z. */
function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const subpaths = [];
  let i = 0;
  let cmd = null;
  let cur = null;
  let start = null;
  let sub = null;
  const num = () => {
    const v = Number(tokens[i++]);
    if (!Number.isFinite(v)) throw new Error(`ожидалось число на позиции ${i - 1}`);
    return v;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (!'MLAZ'.includes(cmd)) {
      throw new Error(`команда «${cmd}»: допускаются только абсолютные M, L, A, Z`);
    }
    if (cmd === 'M') {
      cur = { x: num(), y: num() };
      start = cur;
      sub = { segments: [] };
      subpaths.push(sub);
      cmd = 'L'; // по спецификации пары после M — неявные L
    } else if (cmd === 'L') {
      const to = { x: num(), y: num() };
      sub.segments.push({ type: 'L', from: cur, to });
      cur = to;
    } else if (cmd === 'A') {
      const rx = num();
      const ry = num();
      const rot = num();
      const large = num();
      const sweep = num();
      const to = { x: num(), y: num() };
      sub.segments.push({ type: 'A', from: cur, to, rx, ry, rot, large, sweep });
      cur = to;
    } else if (cmd === 'Z') {
      if (Math.hypot(cur.x - start.x, cur.y - start.y) > 0) {
        sub.segments.push({ type: 'L', from: cur, to: start, closing: true });
      }
      cur = start;
      cmd = null;
    }
  }
  return subpaths;
}

// ═════════════════════════════ геометрия ═════════════════════════════

const deg = (r) => (r * 180) / Math.PI;
const norm360 = (a) => ((a % 360) + 360) % 360;
/** Азимут точки p относительно c: ° по часовой от «вверх» (ось y вниз). */
const azimuth = (c, p) => norm360(deg(Math.atan2(p.x - c.x, -(p.y - c.y))));
/** Разность углов в (−180; 180]. */
const angDiff = (a, b) => {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
};

/**
 * Центр дуги по SVG 1.1, приложение F.6.5 (rx = ry = r, поворот 0). Если хорда длиннее 2r,
 * рендер увеличивает радиус (λ > 1) — такое тоже считаем дефектом и возвращаем λ.
 */
function arcCenter(s) {
  const r = s.rx;
  const x1p = (s.from.x - s.to.x) / 2;
  const y1p = (s.from.y - s.to.y) / 2;
  const d2 = x1p * x1p + y1p * y1p;
  const lambda = d2 / (r * r);
  const sign = s.large !== s.sweep ? 1 : -1;
  const coef = sign * Math.sqrt(Math.max(0, (r * r - d2) / d2));
  return {
    x: coef * y1p + (s.from.x + s.to.x) / 2,
    y: -coef * x1p + (s.from.y + s.to.y) / 2,
    lambda,
  };
}

/** Угловой интервал дуги [a1; a1 + span] по часовой (азимуты) — независимо от направления обхода. */
function arcRange(s, c) {
  const az1 = azimuth(c, s.from);
  const az2 = azimuth(c, s.to);
  // sweep=1 — положительное направление углов SVG, при оси y вниз это по часовой
  return s.sweep ? { a1: az1, span: norm360(az2 - az1) } : { a1: az2, span: norm360(az1 - az2) };
}

/** Габарит дуги: концы + точки на осях, попавшие внутрь интервала. */
function arcBBoxPoints(s, c, r) {
  const { a1, span } = arcRange(s, c);
  const pts = [s.from, s.to];
  for (const a of [0, 90, 180, 270]) {
    const off = norm360(a - a1);
    if (off > 0 && off < span) {
      const t = (a * Math.PI) / 180;
      pts.push({ x: c.x + r * Math.sin(t), y: c.y - r * Math.cos(t) });
    }
  }
  return pts;
}

/** Разбор одного path: круг, секторы, проверки внутри контура. */
function analysePath(d) {
  const subpaths = parsePath(d);
  const arcs = subpaths.flatMap((sp) => sp.segments.filter((s) => s.type === 'A'));
  const circles = subpaths.filter(
    (sp) =>
      sp.segments.length === 2 &&
      sp.segments.every((s) => s.type === 'A' && s.rx === sp.segments[0].rx),
  );
  if (circles.length !== 1) throw new Error(`ожидался ровно один круг, найдено ${circles.length}`);
  const circle = circles[0];
  const cc = circle.segments.map(arcCenter);
  const C = { x: (cc[0].x + cc[1].x) / 2, y: (cc[0].y + cc[1].y) / 2 };
  const r0 = circle.segments[0].rx;
  const circleSweep = circle.segments.reduce((sum, s) => sum + arcRange(s, C).span, 0);

  const arcInfo = arcs.map((s) => {
    const c = arcCenter(s);
    return { s, c, dev: Math.hypot(c.x - C.x, c.y - C.y) };
  });

  const sectors = [];
  for (const sp of subpaths) {
    if (sp === circle) continue;
    const a = sp.segments.filter((s) => s.type === 'A');
    const l = sp.segments.filter((s) => s.type === 'L');
    if (a.length !== 2 || l.length !== 2) {
      throw new Error(`подпуть не кольцевой сектор: ${a.length} дуг, ${l.length} отрезков`);
    }
    const [outer, inner] = a[0].rx > a[1].rx ? [a[0], a[1]] : [a[1], a[0]];
    const ro = arcRange(outer, C);
    const ri = arcRange(inner, C);
    // торец радиален, если прямая через его концы проходит через C и концы по одну сторону от C
    const caps = l.map((s) => {
      const u = { x: s.from.x - C.x, y: s.from.y - C.y };
      const v = { x: s.to.x - C.x, y: s.to.y - C.y };
      const len = Math.hypot(v.x - u.x, v.y - u.y);
      const offset = Math.abs(u.x * v.y - u.y * v.x) / len;
      const sameSide = u.x * v.x + u.y * v.y > 0;
      const rs = [Math.hypot(u.x, u.y), Math.hypot(v.x, v.y)].sort((p, q) => p - q);
      return { offset, sameSide, rs, dAz: Math.abs(angDiff(azimuth(C, s.from), azimuth(C, s.to))) };
    });
    const centerDev = Math.max(
      ...[outer, inner].map((s) => {
        const c = arcCenter(s);
        return Math.hypot(c.x - C.x, c.y - C.y);
      }),
    );
    sectors.push({
      centerDev,
      ri: inner.rx,
      ro: outer.rx,
      t: outer.rx - inner.rx,
      a1: ro.a1,
      span: ro.span,
      axis: norm360(ro.a1 + ro.span / 2),
      edgeMismatchDeg: Math.max(Math.abs(angDiff(ro.a1, ri.a1)), Math.abs(ro.span - ri.span)),
      caps,
      outerSweepOk: outer.sweep === 1 && inner.sweep === 0,
      largeOk: [outer, inner].every((s) => (s.large === 1) === arcRange(s, C).span > 180),
    });
  }

  const pts = subpaths.flatMap((sp) =>
    sp.segments.flatMap((s) => (s.type === 'A' ? arcBBoxPoints(s, C, s.rx) : [s.from, s.to])),
  );
  const bbox = {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
  const rMax = Math.max(...pts.map((p) => Math.hypot(p.x - C.x, p.y - C.y)));
  return { C, r0, circleSweep, arcInfo, sectors, bbox, rMax, arcs };
}

/** Секторы по группам (оси) и кольцам (по возрастанию радиуса). */
function groupSectors(sectors) {
  const groups = [];
  for (const s of sectors) {
    let g = groups.find((x) => Math.abs(angDiff(x.axis, s.axis)) < 1);
    if (!g) groups.push((g = { axis: s.axis, rings: [] }));
    g.rings.push(s);
  }
  for (const g of groups) g.rings.sort((p, q) => p.ri - q.ri);
  groups.sort((p, q) => axisShown(p.axis) - axisShown(q.axis));
  return groups;
}

/** Ось для показа и сортировки: 359,9999999° (округление координат) — это 0°, а не 360°. */
const axisShown = (a) => norm360(a + 0.5) - 0.5;

// ═════════════════════════════ проверки ═════════════════════════════

const fmt = (v, d = 6) => (Math.abs(v) < 5 * 10 ** -(d + 1) ? 0 : v).toFixed(d);
const fmtE = (v) => (v === 0 ? '0' : v.toExponential(1));
const results = [];

function check(file, name, ok, detail = '') {
  results.push({ file, name, ok, detail });
}

function viewBoxOf(svg) {
  const v = (svg.attrs.viewBox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) return null;
  return { x: v[0], y: v[1], w: v[2], h: v[3] };
}

function printTable(rows, headers) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join('  ');
  console.log('   ' + line(headers));
  for (const r of rows) console.log('   ' + line(r));
}

function measuredColor() {
  const p = path.join(root, 'docs/logo-measurements.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')).color?.dominant ?? null;
}

const brandColor = measuredColor();
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;
/** Параметры полного знака из первого файла с двумя кольцами — эталон для сверки файлов. */
let reference = null;
const perFileParams = [];

for (const rel of files) {
  const abs = path.resolve(root, rel);
  const file = path.relative(root, abs);
  console.log(`\n■ ${file}`);
  if (!existsSync(abs)) {
    check(file, 'файл существует', false, 'нет файла');
    continue;
  }
  const text = readFileSync(abs, 'utf8');
  const isIcon = /(^|\/)icon[^/]*\.svg$/.test(file);
  const isMono = /mono/.test(file);

  // — растр и внешние ссылки
  const forbidden = ['<image', '<foreignObject', 'base64', 'data:', 'href=', '<use'].filter((s) =>
    text.includes(s),
  );
  check(
    file,
    'нет растра, base64, data:, внешних ссылок',
    forbidden.length === 0,
    forbidden.join(', '),
  );

  let svg;
  try {
    svg = parseSvg(text);
  } catch (e) {
    check(file, 'разбор SVG', false, e.message);
    continue;
  }
  const rootSvg = svg.svgs[0];
  if (!rootSvg || svg.paths.length === 0) {
    check(file, 'есть <svg> и <path>', false);
    continue;
  }
  const extraTags = svg.tags.filter((t) => !['svg', 'path', 'title', 'style'].includes(t));
  check(file, 'только svg/path/title/style', extraTags.length === 0, extraTags.join(', '));

  const analysed = [];
  for (const [pi, p] of svg.paths.entries()) {
    const extra = [p.attrs.class && `.${p.attrs.class}`, p.svg !== rootSvg && 'во вложенном svg']
      .filter(Boolean)
      .join(', ');
    const label = svg.paths.length > 1 ? `path ${pi + 1}${extra ? ` (${extra})` : ''}` : 'path';
    let a;
    try {
      a = analysePath(p.attrs.d ?? '');
    } catch (e) {
      check(file, `${label}: разбор контура`, false, e.message);
      continue;
    }
    analysed.push({ p, a, label });
    const groups = groupSectors(a.sectors);
    console.log(
      `   ${label}: C = (${fmt(a.C.x)}; ${fmt(a.C.y)}), r0 = ${a.r0}, команд A: ${a.arcs.length}, секторов: ${a.sectors.length}`,
    );
    printTable(
      groups.flatMap((g) =>
        g.rings.map((s, k) => {
          return [
            `${fmt(axisShown(g.axis), 4)}°`,
            k + 1,
            s.ri,
            s.ro,
            s.t,
            `${fmt(norm360(s.a1), 4)}°`,
            `${fmt(s.span, 4)}°`,
            fmtE(s.centerDev),
            fmtE(Math.max(...s.caps.map((c) => c.offset))),
          ];
        }),
      ),
      ['ось', 'кольцо', 'r внутр', 'r внешн', 'толщина', 'начало', 'размах', 'Δцентра', 'Δторца'],
    );

    // — центры
    const maxDev = Math.max(...a.arcInfo.map((x) => x.dev));
    check(
      file,
      `${label}: центры всех ${a.arcs.length} дуг = центр круга C (≤ ${TOL} u)`,
      maxDev <= TOL,
      `макс. отклонение ${fmtE(maxDev)} u`,
    );
    const maxLambda = Math.max(...a.arcInfo.map((x) => x.c.lambda));
    check(
      file,
      `${label}: хорды не длиннее 2r (рендер не меняет радиусы)`,
      maxLambda <= 1 + 1e-9,
      `макс. λ = ${maxLambda.toFixed(9)}`,
    );
    check(
      file,
      `${label}: круг замкнут (две дуги дают 360°)`,
      Math.abs(a.circleSweep - 360) <= ANG_TOL,
      `${fmt(a.circleSweep, 6)}°`,
    );
    check(
      file,
      `${label}: все дуги — окружности (rx = ry, поворот 0)`,
      a.arcs.every((s) => s.rx === s.ry && s.rot === 0),
    );

    // — секторы
    const caps = a.sectors.flatMap((s) => s.caps);
    const maxCap = Math.max(...caps.map((c) => c.offset));
    check(
      file,
      `${label}: торцы радиальны (оба конца на одном луче из C)`,
      maxCap <= TOL && caps.every((c) => c.sameSide && c.dAz <= ANG_TOL),
      `макс. смещение прямой торца от C ${fmtE(maxCap)} u, макс. Δазимута концов ${fmtE(Math.max(...caps.map((c) => c.dAz)))}°`,
    );
    check(
      file,
      `${label}: торцы соединяют внутреннюю и внешнюю кромку`,
      a.sectors.every((s) =>
        s.caps.every((c) => Math.abs(c.rs[0] - s.ri) <= TOL && Math.abs(c.rs[1] - s.ro) <= TOL),
      ),
    );
    check(
      file,
      `${label}: у кромок сектора одинаковый угловой интервал`,
      a.sectors.every((s) => s.edgeMismatchDeg <= ANG_TOL),
      `макс. расхождение ${fmtE(Math.max(...a.sectors.map((s) => s.edgeMismatchDeg)))}°`,
    );
    check(
      file,
      `${label}: флаги large-arc/sweep согласованы с геометрией`,
      a.sectors.every((s) => s.outerSweepOk && s.largeOk),
    );

    // — три направления
    check(file, `${label}: три группы дуг`, groups.length === 3, `групп: ${groups.length}`);
    const ringCount = groups[0]?.rings.length ?? 0;
    check(
      file,
      `${label}: в каждой группе одинаковое число дуг`,
      groups.every((g) => g.rings.length === ringCount),
      groups.map((g) => g.rings.length).join('/'),
    );
    for (let k = 0; k < ringCount; k++) {
      const ring = groups.map((g) => g.rings[k]).filter(Boolean);
      const spread = (f) => Math.max(...ring.map(f)) - Math.min(...ring.map(f));
      check(
        file,
        `${label}: кольцо ${k + 1} одинаково во всех группах (радиусы, толщина, размах)`,
        spread((s) => s.ri) <= TOL &&
          spread((s) => s.ro) <= TOL &&
          spread((s) => s.t) <= TOL &&
          spread((s) => s.span) <= ANG_TOL,
        `r ${ring[0].ri}–${ring[0].ro}, t ${ring[0].t}, размах ${fmt(ring[0].span, 4)}° (разброс ${fmtE(spread((s) => s.span))}°)`,
      );
    }
    const axes = groups.map((g) => g.axis);
    const steps = axes.map((x, i) => norm360(axes[(i + 1) % axes.length] - x));
    check(
      file,
      `${label}: оси групп через 120°`,
      groups.length === 3 && steps.every((s) => Math.abs(s - 120) <= ANG_TOL),
      `оси ${axes.map((x) => `${fmt(axisShown(x), 4)}°`).join(', ')}`,
    );
    const radii = [a.r0, ...groups[0].rings.flatMap((s) => [s.ri, s.ro])];
    check(
      file,
      `${label}: круг и кольца не пересекаются`,
      radii.every((r, i) => i === 0 || r > radii[i - 1]),
      radii.join(' < '),
    );

    // — цвет
    const fill = (p.attrs.fill ?? '').toUpperCase();
    const want = isMono ? MONO_COLOR : brandColor;
    if (want) {
      check(
        file,
        `${label}: цвет ${want}${isMono ? ' (монохромный)' : ' — доминирующий цвет исходника'}`,
        fill === want.toUpperCase(),
        `fill="${p.attrs.fill}"`,
      );
    }

    const params = { file, label, r0: a.r0, groups };
    perFileParams.push(params);
    if (!reference && ringCount === 2) reference = params;
  }

  // — viewBox
  const vb = viewBoxOf(rootSvg);
  if (!vb) {
    check(file, 'viewBox задан', false);
  } else if (analysed.length === 0) {
    check(file, 'viewBox: нечего сравнивать — контур не разобран', false);
  } else if (!isIcon) {
    const { bbox } = analysed[0].a;
    const diff = Math.max(
      Math.abs(bbox.minX - vb.x),
      Math.abs(bbox.minY - vb.y),
      Math.abs(bbox.maxX - (vb.x + vb.w)),
      Math.abs(bbox.maxY - (vb.y + vb.h)),
    );
    check(
      file,
      'viewBox плотный: габарит контура = viewBox',
      diff <= TOL,
      `viewBox ${vb.x} ${vb.y} ${vb.w} ${vb.h}; габарит ${fmt(bbox.minX)} ${fmt(bbox.minY)} ${fmt(bbox.maxX)} ${fmt(bbox.maxY)}; макс. расхождение ${fmtE(diff)} u`,
    );
  } else {
    // фавиконка: квадрат с центром в C, сторона = 2·(радиус описанной окружности + поле)
    for (const { p, a, label } of analysed) {
      const box = p.svg === rootSvg ? vb : viewBoxOf(p.svg);
      if (!box) {
        check(file, `${label}: viewBox задан`, false);
        continue;
      }
      const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      const pad = box.w / 2 - a.rMax;
      const inside =
        a.bbox.minX >= box.x - TOL &&
        a.bbox.minY >= box.y - TOL &&
        a.bbox.maxX <= box.x + box.w + TOL &&
        a.bbox.maxY <= box.y + box.h + TOL;
      check(
        file,
        `${label}: viewBox — квадрат с центром в C, контур внутри, поле ≤ 5 %`,
        Math.abs(box.w - box.h) <= TOL &&
          Math.hypot(centre.x - a.C.x, centre.y - a.C.y) <= TOL &&
          inside &&
          pad >= -TOL &&
          pad <= 0.05 * box.w,
        `viewBox ${box.x} ${box.y} ${box.w} ${box.h}; поле от внешнего радиуса ${fmt(pad, 4)} u`,
      );
      if (p.svg !== rootSvg) {
        const a2 = p.svg.attrs;
        check(
          file,
          `${label}: вложенный svg занимает весь viewBox родителя (нет x/y/width/height)`,
          !('x' in a2 || 'y' in a2 || 'width' in a2 || 'height' in a2),
        );
      }
    }
  }

  // — несколько вариантов в одном файле: общий центр, упрощённый — подмножество полного
  if (analysed.length > 1) {
    const [full, ...rest] = [...analysed].sort((p, q) => q.a.sectors.length - p.a.sectors.length);
    for (const v of rest) {
      const dC = Math.hypot(v.a.C.x - full.a.C.x, v.a.C.y - full.a.C.y);
      check(
        file,
        `${v.label}: тот же центр C, что у полного варианта`,
        dC <= TOL,
        `Δ ${fmtE(dC)} u`,
      );
      const subset = v.a.sectors.every((s) =>
        full.a.sectors.some(
          (f) =>
            f.ri === s.ri &&
            f.ro === s.ro &&
            Math.abs(angDiff(f.a1, s.a1)) <= ANG_TOL &&
            Math.abs(f.span - s.span) <= ANG_TOL,
        ),
      );
      check(
        file,
        `${v.label}: упрощённый вариант — те же круг и секторы, что у полного, без внешнего кольца`,
        subset && v.a.r0 === full.a.r0,
      );
    }
    const style = text.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const hiddenByDefault = svg.svgs.slice(1).every((s) => s.attrs.display === 'none');
    check(
      file,
      'без CSS виден только полный знак (упрощённый скрыт атрибутом display="none")',
      hiddenByDefault,
    );
    check(
      file,
      'переключение по размеру — @media (max-width …)',
      /@media\s*\(max-width:/.test(style),
      style,
    );
  }
}

// — сверка параметров между файлами
if (reference) {
  console.log(`\n■ сверка файлов с ${reference.file}`);
  for (const f of perFileParams) {
    if (f === reference) continue;
    const ok =
      f.r0 === reference.r0 &&
      f.groups.length === reference.groups.length &&
      f.groups.every((g, gi) => {
        const rg = reference.groups[gi];
        return (
          Math.abs(angDiff(g.axis, rg.axis)) <= ANG_TOL &&
          g.rings.every((s, k) => {
            const rs = rg.rings[k];
            return rs && s.ri === rs.ri && s.ro === rs.ro && Math.abs(s.span - rs.span) <= ANG_TOL;
          })
        );
      });
    check(f.file, `${f.label}: r0, радиусы колец, размах и оси = как в ${reference.file}`, ok);
  }
}

// — сгенерированный TS совпадает с основным SVG
const tsPath = path.join(root, 'src/components/brand/logo-geometry.generated.ts');
const markPath = path.join(root, 'public/brand/logo-mark.svg');
if (process.argv.length <= 2 && existsSync(tsPath) && existsSync(markPath)) {
  const ts = readFileSync(tsPath, 'utf8');
  const mark = parseSvg(readFileSync(markPath, 'utf8'));
  const tsD = ts.match(/LOGO_MARK_PATH =\s*'([^']*)'/)?.[1];
  const tsVB = ts.match(/LOGO_MARK_VIEWBOX = '([^']*)'/)?.[1];
  check(
    'src/components/brand/logo-geometry.generated.ts',
    'path и viewBox совпадают с public/brand/logo-mark.svg',
    tsD === mark.paths[0].attrs.d && tsVB === mark.svgs[0].attrs.viewBox,
  );
}

// — favicon.ico: структура и размеры кадров
const icoPath = path.join(root, 'src/app/favicon.ico');
if (process.argv.length <= 2 && existsSync(icoPath)) {
  const buf = readFileSync(icoPath);
  const count = buf.readUInt16LE(4);
  const frames = [];
  for (let k = 0; k < count; k++) {
    const e = 6 + 16 * k;
    const size = buf.readUInt8(e) || 256;
    const len = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    const png = buf.subarray(off, off + len);
    const isPng = png.subarray(1, 4).toString('latin1') === 'PNG';
    frames.push({ size, isPng, w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
  }
  check(
    'src/app/favicon.ico',
    'ICO: кадры PNG, размеры в заголовке совпадают с PNG',
    buf.readUInt16LE(2) === 1 && frames.every((f) => f.isPng && f.w === f.size && f.h === f.size),
    frames.map((f) => `${f.size}×${f.size}`).join(', '),
  );
}

// ═════════════════════════════ итог ═════════════════════════════

console.log('\nПроверки:');
let lastFile = null;
for (const r of results) {
  if (r.file !== lastFile) console.log(`  ${r.file}`);
  lastFile = r.file;
  console.log(`    ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(
  failed
    ? `\nFAIL: не прошло ${failed} из ${results.length} проверок`
    : `\nPASS: все ${results.length} проверок прошли`,
);
process.exitCode = failed ? 1 : 0;
