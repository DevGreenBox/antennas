/**
 * Измерение геометрии исходного знака по растру source/derived/logo-original-4600.png.
 *
 * Что делает:
 *  1. Делит непрозрачные пиксели (альфа ≥ 128) на связные компоненты — ожидается 7:
 *     центральный круг и шесть дуг.
 *  2. Строит субпиксельный контур каждой компоненты: точки, где альфа пересекает 127,5
 *     между соседними пикселями (линейная интерполяция) — так нет систематического
 *     сдвига «на полпикселя внутрь», как у центров граничных пикселей.
 *  3. Круг: алгебраическая подгонка Kasa → уточнение геометрическим МНК (Гаусс — Ньютон).
 *  4. Дуга: точки контура делятся на внутреннюю кромку, внешнюю кромку и два торца;
 *     каждая кромка подгоняется своей окружностью (Kasa → геометрический МНК), торцы —
 *     прямыми (полные наименьшие квадраты). Итеративно: после подгонки точки
 *     переклассифицируются по невязке, точки у углов отбрасываются.
 *  5. Совместная подгонка «один центр на всех» и подгонка с центром, зафиксированным
 *     в центре круга, — показывают, насколько исходник далёк от концентричности.
 *
 * Координаты — пиксели растра 4600×4600, ось y вниз, пиксель (x, y) занимает
 * [x, x+1]×[y, y+1]. Азимут φ — градусы по часовой стрелке от направления «вверх»
 * (0° — вверх, 90° — вправо, 180° — вниз, 240° — вниз-влево).
 *
 * Результат: docs/logo-measurements.json + таблицы в консоль.
 * Запуск: node scripts/measure-logo.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const SRC = 'source/derived/logo-original-4600.png';
const OUT = 'docs/logo-measurements.json';

// Порог альфы: исходник почти бинарный (антиалиасинг < 1,3 % пикселей), 128 — середина.
const ALPHA_THRESHOLD = 128;
// Компоненты меньше этого — пылинки экспорта, не элементы знака.
const MIN_COMPONENT_AREA = 1000;
// Отступ по азимуту от крайних точек дуги при первичном отделении кромок от торцов, °.
const CAP_MARGIN_DEG = 6;

// ───────────────────────────── линейная алгебра и подгонки ─────────────────────────────

/** Решает A·x = b (A — n×n, массив строк) методом Гаусса с выбором главного элемента. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-300) throw new Error('вырожденная система');
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

function mean(a) {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

/**
 * Алгебраическая подгонка окружности (Kasa): min Σ(u²+v² − 2au − 2bv − c)².
 * Данные центрируются — иначе на координатах ~2000 px теряется точность.
 */
function fitCircleKasa(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let suu = 0;
  let suv = 0;
  let svv = 0;
  let su = 0;
  let sv = 0;
  let suz = 0;
  let svz = 0;
  let sz = 0;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    const u = xs[i] - mx;
    const v = ys[i] - my;
    const z = u * u + v * v;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    su += u;
    sv += v;
    suz += u * z;
    svz += v * z;
    sz += z;
  }
  const [A, B, c] = solve(
    [
      [suu, suv, su],
      [suv, svv, sv],
      [su, sv, n],
    ],
    [suz, svz, sz],
  );
  const a = A / 2;
  const b = B / 2;
  return { cx: mx + a, cy: my + b, r: Math.sqrt(c + a * a + b * b) };
}

/** Невязки точек относительно окружности: СКО и максимум модуля. */
function circleResiduals(xs, ys, cx, cy, r) {
  let ss = 0;
  let mx = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.hypot(xs[i] - cx, ys[i] - cy) - r;
    ss += d * d;
    mx = Math.max(mx, Math.abs(d));
  }
  return { rms: Math.sqrt(ss / xs.length), maxAbs: mx };
}

/** Геометрический МНК (Гаусс — Ньютон): min Σ(|p − c| − r)², старт — Kasa. */
function fitCircle(xs, ys) {
  const kasa = fitCircleKasa(xs, ys);
  let { cx, cy, r } = kasa;
  for (let it = 0; it < 100; it++) {
    const JTJ = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const JTr = [0, 0, 0];
    for (let i = 0; i < xs.length; i++) {
      const dx = xs[i] - cx;
      const dy = ys[i] - cy;
      const rho = Math.hypot(dx, dy);
      const res = rho - r;
      const J = [-dx / rho, -dy / rho, -1];
      for (let a = 0; a < 3; a++) {
        JTr[a] += J[a] * res;
        for (let b = 0; b < 3; b++) JTJ[a][b] += J[a] * J[b];
      }
    }
    const d = solve(
      JTJ,
      JTr.map((v) => -v),
    );
    cx += d[0];
    cy += d[1];
    r += d[2];
    if (Math.hypot(d[0], d[1], d[2]) < 1e-9) break;
  }
  return {
    cx,
    cy,
    r,
    ...circleResiduals(xs, ys, cx, cy, r),
    n: xs.length,
    kasa,
  };
}

/**
 * Совместная подгонка K окружностей с ОБЩИМ центром и своими радиусами:
 * min Σ_k Σ_i (|p_ki − c| − r_k)². Это и есть модель «правильного» знака;
 * рост невязки относительно индивидуальных подгонок — мера неконцентричности исходника.
 */
function fitConcentric(sets, init) {
  const K = sets.length;
  let cx = init.cx;
  let cy = init.cy;
  const r = sets.map((s) => mean(s.xs.map((x, i) => Math.hypot(x - cx, s.ys[i] - cy))));
  for (let it = 0; it < 100; it++) {
    const N = K + 2;
    const JTJ = Array.from({ length: N }, () => new Array(N).fill(0));
    const JTr = new Array(N).fill(0);
    sets.forEach((s, k) => {
      for (let i = 0; i < s.xs.length; i++) {
        const dx = s.xs[i] - cx;
        const dy = s.ys[i] - cy;
        const rho = Math.hypot(dx, dy);
        const res = rho - r[k];
        const jx = -dx / rho;
        const jy = -dy / rho;
        // производная по r_k = −1, остальные радиусы — 0
        JTJ[0][0] += jx * jx;
        JTJ[0][1] += jx * jy;
        JTJ[1][1] += jy * jy;
        JTJ[0][2 + k] -= jx;
        JTJ[1][2 + k] -= jy;
        JTJ[2 + k][2 + k] += 1;
        JTr[0] += jx * res;
        JTr[1] += jy * res;
        JTr[2 + k] -= res;
      }
    });
    JTJ[1][0] = JTJ[0][1];
    for (let k = 0; k < K; k++) {
      JTJ[2 + k][0] = JTJ[0][2 + k];
      JTJ[2 + k][1] = JTJ[1][2 + k];
    }
    const d = solve(
      JTJ,
      JTr.map((v) => -v),
    );
    cx += d[0];
    cy += d[1];
    for (let k = 0; k < K; k++) r[k] += d[2 + k];
    if (Math.hypot(...d) < 1e-9) break;
  }
  let ssAll = 0;
  let nAll = 0;
  const per = sets.map((s, k) => {
    const res = circleResiduals(s.xs, s.ys, cx, cy, r[k]);
    ssAll += res.rms * res.rms * s.xs.length;
    nAll += s.xs.length;
    return { r: r[k], ...res };
  });
  return { cx, cy, radii: per, rms: Math.sqrt(ssAll / nAll) };
}

/** Прямая по точкам: полные наименьшие квадраты (главная ось ковариации). */
function fitLine(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const u = xs[i] - mx;
    const v = ys[i] - my;
    sxx += u * u;
    sxy += u * v;
    syy += v * v;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(th);
  const uy = Math.sin(th);
  let ss = 0;
  let mxAbs = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = -(xs[i] - mx) * uy + (ys[i] - my) * ux;
    ss += d * d;
    mxAbs = Math.max(mxAbs, Math.abs(d));
  }
  return { mx, my, ux, uy, rms: Math.sqrt(ss / xs.length), maxAbs: mxAbs, n: xs.length };
}

function distToLine(L, x, y) {
  return Math.abs(-(x - L.mx) * L.uy + (y - L.my) * L.ux);
}

/** Пересечение прямой L с окружностью (cx, cy, r) — ближайшее к опорной точке прямой. */
function lineCircle(L, cx, cy, r) {
  const fx = L.mx - cx;
  const fy = L.my - cy;
  const b = L.ux * fx + L.uy * fy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s1 = -b + Math.sqrt(disc);
  const s2 = -b - Math.sqrt(disc);
  const s = Math.abs(s1) < Math.abs(s2) ? s1 : s2;
  return { x: L.mx + s * L.ux, y: L.my + s * L.uy };
}

// ───────────────────────────── углы ─────────────────────────────

const DEG = 180 / Math.PI;
/** Азимут точки относительно центра: по часовой от «вверх», [0, 360). */
function azimuth(x, y, cx, cy) {
  const a = Math.atan2(x - cx, -(y - cy)) * DEG;
  return (a + 360) % 360;
}
/** Приведение разности углов к (−180, 180]. */
function wrap180(a) {
  let v = ((((a + 180) % 360) + 360) % 360) - 180;
  if (v === -180) v = 180;
  return v;
}
function circularMeanDeg(angles) {
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos(a / DEG);
    sy += Math.sin(a / DEG);
  }
  return (Math.atan2(sy, sx) * DEG + 360) % 360;
}

// ───────────────────────────── растр ─────────────────────────────

const { data, info } = await sharp(path.join(root, SRC))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const alpha = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) alpha[i] = data[i * 4 + 3];

// Цвет: гистограмма RGB только по полностью непрозрачным пикселям
// (на полупрозрачной кромке цвет смешан с фоном экспорта и не показателен).
const colorCounts = new Map();
let opaque = 0;
for (let i = 0; i < W * H; i++) {
  if (alpha[i] !== 255) continue;
  opaque++;
  const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
  colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
}
const hex = (k) => '#' + k.toString(16).padStart(6, '0').toUpperCase();
const topColors = [...colorCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([k, n]) => ({ hex: hex(k), pixels: n, sharePct: (100 * n) / opaque }));

// Связные компоненты (4-связность) обходом в глубину с явным стеком.
const labels = new Int32Array(W * H);
const stack = new Int32Array(W * H);
const comps = [];
let nextLabel = 0;
for (let start = 0; start < W * H; start++) {
  if (alpha[start] < ALPHA_THRESHOLD || labels[start] !== 0) continue;
  const id = ++nextLabel;
  let sp = 0;
  stack[sp++] = start;
  labels[start] = id;
  let area = 0;
  let sx = 0;
  let sy = 0;
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % W;
    const y = (p - x) / W;
    area++;
    sx += x + 0.5;
    sy += y + 0.5;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const nb = [
      x > 0 ? p - 1 : -1,
      x < W - 1 ? p + 1 : -1,
      y > 0 ? p - W : -1,
      y < H - 1 ? p + W : -1,
    ];
    for (const q of nb) {
      if (q >= 0 && labels[q] === 0 && alpha[q] >= ALPHA_THRESHOLD) {
        labels[q] = id;
        stack[sp++] = q;
      }
    }
  }
  comps.push({ id, area, cx: sx / area, cy: sy / area, bbox: [x0, y0, x1 + 1, y1 + 1] });
}
const kept = comps.filter((c) => c.area >= MIN_COMPONENT_AREA).sort((a, b) => b.area - a.area);
const noise = comps.filter((c) => c.area < MIN_COMPONENT_AREA);
if (kept.length !== 7) {
  throw new Error(`ожидалось 7 крупных компонент, найдено ${kept.length}`);
}

// Субпиксельный контур: пересечения уровня альфы 127,5 между соседями по горизонтали
// и вертикали; точка относится к компоненте «внутреннего» пикселя.
const keptIdx = new Map(kept.map((c, i) => [c.id, i]));
const pts = kept.map(() => ({ xs: [], ys: [] }));
const LEVEL = ALPHA_THRESHOLD - 0.5;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const a0 = alpha[i];
    const in0 = a0 >= ALPHA_THRESHOLD;
    if (x < W - 1) {
      const a1 = alpha[i + 1];
      if (in0 !== a1 >= ALPHA_THRESHOLD) {
        const k = keptIdx.get(labels[in0 ? i : i + 1]);
        if (k !== undefined) {
          pts[k].xs.push(x + 0.5 + (LEVEL - a0) / (a1 - a0));
          pts[k].ys.push(y + 0.5);
        }
      }
    }
    if (y < H - 1) {
      const a1 = alpha[i + W];
      if (in0 !== a1 >= ALPHA_THRESHOLD) {
        const k = keptIdx.get(labels[in0 ? i : i + W]);
        if (k !== undefined) {
          pts[k].xs.push(x + 0.5);
          pts[k].ys.push(y + 0.5 + (LEVEL - a0) / (a1 - a0));
        }
      }
    }
  }
}

// ───────────────────────────── круг ─────────────────────────────

// Круг — компонента, заполняющая вписанный в свою рамку эллипс (≈ π/4 рамки).
// Проверка «центр масс внутри фигуры» не годится: у толстой узкой дуги он тоже внутри.
const fillOfEllipse = (c) => {
  const w = c.bbox[2] - c.bbox[0];
  const h = c.bbox[3] - c.bbox[1];
  return c.area / ((Math.PI * w * h) / 4);
};
const circleK = kept.findIndex((c) => Math.abs(fillOfEllipse(c) - 1) < 0.03);
if (circleK < 0 || kept.filter((c) => Math.abs(fillOfEllipse(c) - 1) < 0.03).length !== 1) {
  throw new Error('центральный круг не найден однозначно');
}
const circleFit = fitCircle(pts[circleK].xs, pts[circleK].ys);
const C0 = { x: circleFit.cx, y: circleFit.cy };
const r0 = circleFit.r;

// ───────────────────────────── дуги ─────────────────────────────

const GROUPS = [
  { key: 'top', name: 'верх', ideal: 0 },
  { key: 'lowerRight', name: 'низ-право', ideal: 120 },
  { key: 'lowerLeft', name: 'низ-лево', ideal: 240 },
];

function analyzeArc(P) {
  const n = P.xs.length;
  const rho = new Float64Array(n);
  const phi = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    rho[i] = Math.hypot(P.xs[i] - C0.x, P.ys[i] - C0.y);
    phi[i] = azimuth(P.xs[i], P.ys[i], C0.x, C0.y);
  }
  const phiC = circularMeanDeg(phi);
  // ψ — азимут относительно середины дуги: отрицательный — торец «против часовой».
  const psi = Float64Array.from(phi, (a) => wrap180(a - phiC));
  let psiMin = Infinity;
  let psiMax = -Infinity;
  for (const v of psi) {
    psiMin = Math.min(psiMin, v);
    psiMax = Math.max(psiMax, v);
  }

  // Первичное разделение кромок: середина дуги без торцевых зон, порог — посередине
  // между min и max ρ в каждой градусной корзине (устойчиво к сдвигу центра дуги).
  const bins = new Map();
  for (let i = 0; i < n; i++) {
    if (psi[i] <= psiMin + CAP_MARGIN_DEG || psi[i] >= psiMax - CAP_MARGIN_DEG) continue;
    const b = Math.floor(psi[i]);
    const e = bins.get(b) ?? { lo: Infinity, hi: -Infinity };
    e.lo = Math.min(e.lo, rho[i]);
    e.hi = Math.max(e.hi, rho[i]);
    bins.set(b, e);
  }
  let innerIdx = [];
  let outerIdx = [];
  for (let i = 0; i < n; i++) {
    if (psi[i] <= psiMin + CAP_MARGIN_DEG || psi[i] >= psiMax - CAP_MARGIN_DEG) continue;
    const e = bins.get(Math.floor(psi[i]));
    (rho[i] < (e.lo + e.hi) / 2 ? innerIdx : outerIdx).push(i);
  }
  const sub = (idx) => ({ xs: idx.map((i) => P.xs[i]), ys: idx.map((i) => P.ys[i]) });
  let inner = fitCircle(sub(innerIdx).xs, sub(innerIdx).ys);
  let outer = fitCircle(sub(outerIdx).xs, sub(outerIdx).ys);
  let caps = [];

  for (let iter = 0; iter < 4; iter++) {
    // Допуск — несколько СКО кромки: край исходника «рваный» на 1–3 px.
    const tol = Math.max(3, 4 * Math.max(inner.rms, outer.rms));
    const capIdx = [[], []];
    const inC = [];
    const outC = [];
    for (let i = 0; i < n; i++) {
      const di = Math.abs(Math.hypot(P.xs[i] - inner.cx, P.ys[i] - inner.cy) - inner.r);
      const dO = Math.abs(Math.hypot(P.xs[i] - outer.cx, P.ys[i] - outer.cy) - outer.r);
      if (di < tol && di <= dO) inC.push(i);
      else if (dO < tol) outC.push(i);
      else if (psi[i] < psiMin + 15) capIdx[0].push(i);
      else if (psi[i] > psiMax - 15) capIdx[1].push(i);
    }
    // Торцы: прямая, затем повтор без выбросов дальше 3 СКО.
    caps = capIdx.map((idx) => {
      let L = fitLine(sub(idx).xs, sub(idx).ys);
      const good = idx.filter((i) => distToLine(L, P.xs[i], P.ys[i]) < Math.max(2, 3 * L.rms));
      L = fitLine(sub(good).xs, sub(good).ys);
      return L;
    });
    // Точки кромок ближе 2·tol к линиям торцов — зона скругления угла, в подгонку не идут.
    const farFromCaps = (i) => caps.every((L) => distToLine(L, P.xs[i], P.ys[i]) > 2 * tol);
    innerIdx = inC.filter(farFromCaps);
    outerIdx = outC.filter(farFromCaps);
    inner = fitCircle(sub(innerIdx).xs, sub(innerIdx).ys);
    outer = fitCircle(sub(outerIdx).xs, sub(outerIdx).ys);
  }

  // Радиусы кромок при центре, принудительно взятом в центре круга (модель «как надо»).
  const fixed = (idx) => {
    const r = mean(idx.map((i) => rho[i]));
    return { r, ...circleResiduals(sub(idx).xs, sub(idx).ys, C0.x, C0.y, r) };
  };
  const innerC0 = fixed(innerIdx);
  const outerC0 = fixed(outerIdx);
  const rMidC0 = (innerC0.r + outerC0.r) / 2;

  const capInfo = caps.map((L, side) => {
    // Направление прямой торца — от центра наружу.
    let ux = L.ux;
    let uy = L.uy;
    if (ux * (L.mx - C0.x) + uy * (L.my - C0.y) < 0) {
      ux = -ux;
      uy = -uy;
    }
    const pin = lineCircle(L, inner.cx, inner.cy, inner.r);
    const pout = lineCircle(L, outer.cx, outer.cy, outer.r);
    const pmid = lineCircle(L, C0.x, C0.y, rMidC0);
    const radialDir = Math.atan2(L.my - C0.y, L.mx - C0.x);
    const dev = wrap180((Math.atan2(uy, ux) - radialDir) * DEG);
    // Знаковое расстояние от центра круга до прямой торца (0 — торец радиальный).
    const offset = (C0.x - L.mx) * uy - (C0.y - L.my) * ux;
    return {
      side: side === 0 ? 'против часовой' : 'по часовой',
      line: { px: L.mx, py: L.my, ux, uy, rms: L.rms, n: L.n },
      azInnerEdge: pin && azimuth(pin.x, pin.y, C0.x, C0.y),
      azOuterEdge: pout && azimuth(pout.x, pout.y, C0.x, C0.y),
      azMid: pmid && azimuth(pmid.x, pmid.y, C0.x, C0.y),
      deviationFromRadialDeg: dev,
      offsetFromCenterPx: offset,
    };
  });
  const spanMid = wrap180(capInfo[1].azMid - capInfo[0].azMid);
  const midAz = (capInfo[0].azMid + spanMid / 2 + 360) % 360;

  const off = (f) => {
    const dx = f.cx - C0.x;
    const dy = f.cy - C0.y;
    const d = Math.hypot(dx, dy);
    return { dx, dy, dist: d, pctOfOwnR: (100 * d) / f.r, pctOfR0: (100 * d) / r0 };
  };
  const strip = (f) => ({ cx: f.cx, cy: f.cy, r: f.r, rms: f.rms, maxAbs: f.maxAbs, n: f.n });
  return {
    phiCentroid: phiC,
    inner: { ...strip(inner), offset: off(inner), aboutCircleCenter: innerC0 },
    outer: { ...strip(outer), offset: off(outer), aboutCircleCenter: outerC0 },
    thicknessOwnFits: outer.r - inner.r,
    thicknessAboutCircleCenter: outerC0.r - innerC0.r,
    caps: capInfo,
    spanMidDeg: spanMid,
    spanInnerEdgeDeg: wrap180(capInfo[1].azInnerEdge - capInfo[0].azInnerEdge),
    spanOuterEdgeDeg: wrap180(capInfo[1].azOuterEdge - capInfo[0].azOuterEdge),
    midAzimuthDeg: midAz,
    edgePoints: { inner: sub(innerIdx), outer: sub(outerIdx) },
  };
}

const arcs = [];
kept.forEach((c, k) => {
  if (k === circleK) return;
  const a = analyzeArc(pts[k]);
  const g = GROUPS.reduce((best, G) =>
    Math.abs(wrap180(a.phiCentroid - G.ideal)) < Math.abs(wrap180(a.phiCentroid - best.ideal))
      ? G
      : best,
  );
  arcs.push({ group: g, area: c.area, bbox: c.bbox, ...a });
});
// Кольцо: внутренняя дуга группы — с меньшим радиусом.
for (const G of GROUPS) {
  const pair = arcs.filter((a) => a.group === G).sort((a, b) => a.inner.r - b.inner.r);
  if (pair.length !== 2) throw new Error(`в группе ${G.name} не две дуги`);
  pair[0].ring = 'inner';
  pair[1].ring = 'outer';
}
const RINGS = [
  { key: 'inner', name: 'внутр.' },
  { key: 'outer', name: 'внешн.' },
];
arcs.sort(
  (a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || (a.ring === 'inner' ? -1 : 1),
);

// ───────────────────────────── совместные подгонки ─────────────────────────────

const edgeSets = [];
for (const a of arcs) {
  edgeSets.push({ label: `${a.group.key}-${a.ring}-inner`, ...a.edgePoints.inner });
  edgeSets.push({ label: `${a.group.key}-${a.ring}-outer`, ...a.edgePoints.outer });
}
const C0init = { cx: C0.x, cy: C0.y };
const jointArcs = fitConcentric(edgeSets, C0init);
const jointAll = fitConcentric(
  [{ label: 'circle', xs: pts[circleK].xs, ys: pts[circleK].ys }, ...edgeSets],
  C0init,
);

// ───────────────────────────── сводка ─────────────────────────────

// Глобальный поворот — средний сдвиг середин групп от идеальных 0/120/240°.
const groupInfo = GROUPS.map((G) => {
  const pair = arcs.filter((a) => a.group === G);
  const mid = circularMeanDeg(pair.map((a) => a.midAzimuthDeg));
  return { key: G.key, name: G.name, midAzimuthDeg: mid, deviationDeg: wrap180(mid - G.ideal) };
});
const rotationDeg = mean(groupInfo.map((g) => g.deviationDeg));

// Промежутки между группами по средней линии каждого кольца.
const gapsBetweenGroups = RINGS.map((R) => {
  const ring = GROUPS.map((G) => arcs.find((a) => a.group === G && a.ring === R.key));
  return {
    ring: R.key,
    gapsDeg: ring.map((a, i) => {
      const next = ring[(i + 1) % 3];
      return {
        from: a.group.key,
        to: next.group.key,
        deg: (next.caps[0].azMid - a.caps[1].azMid + 360) % 360,
      };
    }),
  };
});

const ringAvg = (ring, f) => mean(arcs.filter((a) => a.ring === ring).map(f));
const averages = {
  // радиусы — относительно центра круга (модель с общим центром), среднее по трём направлениям
  r0,
  r1i: ringAvg('inner', (a) => a.inner.aboutCircleCenter.r),
  r1o: ringAvg('inner', (a) => a.outer.aboutCircleCenter.r),
  r2i: ringAvg('outer', (a) => a.inner.aboutCircleCenter.r),
  r2o: ringAvg('outer', (a) => a.outer.aboutCircleCenter.r),
  // те же величины по индивидуальным подгонкам (у каждой кромки свой центр)
  ownFits: {
    r1i: ringAvg('inner', (a) => a.inner.r),
    r1o: ringAvg('inner', (a) => a.outer.r),
    r2i: ringAvg('outer', (a) => a.inner.r),
    r2o: ringAvg('outer', (a) => a.outer.r),
    t1: ringAvg('inner', (a) => a.thicknessOwnFits),
    t2: ringAvg('outer', (a) => a.thicknessOwnFits),
  },
  span1MidDeg: ringAvg('inner', (a) => a.spanMidDeg),
  span2MidDeg: ringAvg('outer', (a) => a.spanMidDeg),
  span1InnerEdgeDeg: ringAvg('inner', (a) => a.spanInnerEdgeDeg),
  span1OuterEdgeDeg: ringAvg('inner', (a) => a.spanOuterEdgeDeg),
  span2InnerEdgeDeg: ringAvg('outer', (a) => a.spanInnerEdgeDeg),
  span2OuterEdgeDeg: ringAvg('outer', (a) => a.spanOuterEdgeDeg),
  capDeviationFromRadialAbsDeg: mean(
    arcs.flatMap((a) => a.caps.map((c) => Math.abs(c.deviationFromRadialDeg))),
  ),
  capOffsetFromCenterAbsPx: mean(
    arcs.flatMap((a) => a.caps.map((c) => Math.abs(c.offsetFromCenterPx))),
  ),
};
averages.t1 = averages.r1o - averages.r1i;
averages.t2 = averages.r2o - averages.r2i;
averages.gap01 = averages.r1i - averages.r0;
averages.gap12 = averages.r2i - averages.r1o;

const offsets = arcs.flatMap((a) => [a.inner.offset.dist, a.outer.offset.dist]);
const result = {
  generatedBy: 'scripts/measure-logo.mjs',
  source: SRC,
  image: { width: W, height: H },
  conventions:
    'px растра 4600×4600, ось y вниз; азимут — градусы по часовой от «вверх»; ' +
    'радиусы aboutCircleCenter — средние расстояния точек кромки от центра круга',
  alphaThreshold: ALPHA_THRESHOLD,
  color: {
    opaquePixels: opaque,
    dominant: topColors[0].hex,
    top: topColors,
    method: 'гистограмма RGB по пикселям с альфой 255',
  },
  components: {
    kept: kept.length,
    noise: { count: noise.length, totalArea: noise.reduce((s, c) => s + c.area, 0) },
  },
  circle: {
    cx: circleFit.cx,
    cy: circleFit.cy,
    r: circleFit.r,
    rms: circleFit.rms,
    maxAbs: circleFit.maxAbs,
    n: circleFit.n,
    kasa: circleFit.kasa,
    area: kept[circleK].area,
  },
  arcs: arcs.map(({ edgePoints, group, ...a }) => ({
    id: `${group.key}-${a.ring}`,
    group: group.key,
    ...a,
  })),
  groups: groupInfo,
  rotationDeg,
  gapsBetweenGroups,
  concentricFits: {
    note:
      'общий центр для 12 кромок дуг (arcsOnly) и для 12 кромок + круг (withCircle); ' +
      'рост СКО относительно индивидуальных подгонок = цена принудительной концентричности',
    arcsOnly: {
      ...jointArcs,
      radii: jointArcs.radii.map((r, i) => ({ edge: edgeSets[i].label, ...r })),
    },
    withCircle: {
      ...jointAll,
      radii: jointAll.radii.map((r, i) => ({
        edge: i === 0 ? 'circle' : edgeSets[i - 1].label,
        ...r,
      })),
    },
  },
  summary: {
    centerOffsetPx: { min: Math.min(...offsets), max: Math.max(...offsets), mean: mean(offsets) },
    averages,
  },
};

mkdirSync(path.dirname(path.join(root, OUT)), { recursive: true });
writeFileSync(
  path.join(root, OUT),
  JSON.stringify(result, (k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v), 2) + '\n',
);

// ───────────────────────────── вывод ─────────────────────────────

const f = (v, d = 1) => v.toFixed(d).replace('.', ',');
const row = (cells, widths) => cells.map((c, i) => String(c).padStart(widths[i])).join('  ');

console.log(`Растр ${W}×${H}, компонент: ${kept.length} (+${noise.length} пылинок)`);
console.log(
  `Цвет: ${topColors
    .slice(0, 3)
    .map((c) => `${c.hex} ${f(c.sharePct, 2)} %`)
    .join(', ')} (по ${opaque} непрозрачным пикселям)`,
);
console.log(
  `Круг: C0 = (${f(C0.x, 2)}; ${f(C0.y, 2)}), r0 = ${f(r0, 2)} px, СКО ${f(circleFit.rms, 2)} px\n`,
);

console.log('Центры граничных окружностей дуг относительно центра круга C0:');
const W1 = [10, 7, 9, 9, 8, 8, 8, 9, 8, 9];
console.log(
  row(
    ['дуга', 'кромка', 'r, px', 'Δx, px', 'Δy, px', '|Δ|, px', '% r', '% r0', 'СКО', 'СКО@C0'],
    W1,
  ),
);
for (const a of arcs) {
  for (const [edgeName, e] of [
    ['внутр.', a.inner],
    ['внешн.', a.outer],
  ]) {
    console.log(
      row(
        [
          `${a.group.name}/${a.ring === 'inner' ? '1' : '2'}`,
          edgeName,
          f(e.r),
          f(e.offset.dx),
          f(e.offset.dy),
          f(e.offset.dist),
          f(e.offset.pctOfOwnR),
          f(e.offset.pctOfR0),
          f(e.rms, 2),
          f(e.aboutCircleCenter.rms, 2),
        ],
        W1,
      ),
    );
  }
}
console.log(
  `\n|Δ| центров кромок от C0: от ${f(result.summary.centerOffsetPx.min)} до ` +
    `${f(result.summary.centerOffsetPx.max)} px, среднее ${f(result.summary.centerOffsetPx.mean)} px ` +
    `(${f((100 * result.summary.centerOffsetPx.mean) / r0)} % r0).`,
);
console.log(
  'СКО — невязка собственной окружности кромки; СКО@C0 — невязка, если центр принудительно взять в C0.',
);
console.log(
  `Общий центр для всех 12 кромок дуг: (${f(jointArcs.cx, 2)}; ${f(jointArcs.cy, 2)}), ` +
    `смещение от C0 ${f(Math.hypot(jointArcs.cx - C0.x, jointArcs.cy - C0.y))} px, ` +
    `СКО ${f(jointArcs.rms, 2)} px.`,
);

console.log('\nДуги: толщина, угловой размах, торцы:');
const W2 = [12, 9, 9, 9, 9, 9, 18, 16];
console.log(
  row(
    [
      'дуга',
      't, px',
      't@C0',
      'размах°',
      'середина°',
      'φ кромок°',
      'откл. торцов°',
      'смещ. торцов px',
    ],
    W2,
  ),
);
for (const a of arcs) {
  console.log(
    row(
      [
        `${a.group.name}/${a.ring === 'inner' ? '1' : '2'}`,
        f(a.thicknessOwnFits),
        f(a.thicknessAboutCircleCenter),
        f(a.spanMidDeg, 2),
        f(a.midAzimuthDeg, 2),
        `${f(a.spanInnerEdgeDeg)}/${f(a.spanOuterEdgeDeg)}`,
        a.caps.map((c) => f(c.deviationFromRadialDeg)).join(' / '),
        a.caps.map((c) => f(c.offsetFromCenterPx)).join(' / '),
      ],
      W2,
    ),
  );
}
console.log(
  `\nПоворот композиции: ${f(rotationDeg, 2)}°; середины групп: ` +
    groupInfo.map((g) => `${g.name} ${f(g.midAzimuthDeg, 2)}°`).join(', '),
);
for (const g of gapsBetweenGroups) {
  console.log(
    `Промежутки между группами (кольцо ${g.ring}): ` +
      g.gapsDeg.map((x) => `${x.from}→${x.to} ${f(x.deg, 2)}°`).join(', '),
  );
}
const A = averages;
console.log(
  `\nСредние (относительно C0): r0 ${f(A.r0)}, r1i ${f(A.r1i)}, r1o ${f(A.r1o)}, ` +
    `r2i ${f(A.r2i)}, r2o ${f(A.r2o)}, t1 ${f(A.t1)}, t2 ${f(A.t2)}, ` +
    `зазор круг–кольцо1 ${f(A.gap01)}, зазор кольцо1–кольцо2 ${f(A.gap12)} px; ` +
    `размах по средней линии: кольцо1 ${f(A.span1MidDeg, 2)}°, кольцо2 ${f(A.span2MidDeg, 2)}°`,
);
console.log(`\nСохранено: ${OUT}`);
