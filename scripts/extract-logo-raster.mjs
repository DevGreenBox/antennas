/**
 * Достаёт растр из исходного PDF логотипа (экспорт Photoshop).
 *
 * В PDF нет векторных контуров: страница — одна картинка 4600×4600 RGB
 * (FlateDecode + TIFF-предиктор 2) и маска прозрачности /SMask того же размера.
 * Скрипт распаковывает оба потока, снимает предиктор и сохраняет PNG —
 * по нему меряются центр, радиусы, углы и цвет знака (measure-logo.mjs).
 *
 * Запуск: node scripts/extract-logo-raster.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(import.meta.dirname, '..');
const pdf = readFileSync(path.join(root, 'source/logo-original.pdf'));

function stream(objNum) {
  const head = Buffer.from(`\n${objNum} 0 obj`);
  const at = pdf.indexOf(head);
  if (at < 0) throw new Error(`объект ${objNum} не найден`);
  const dictEnd = pdf.indexOf('stream', at);
  const dict = pdf.subarray(at, dictEnd).toString('latin1');
  const length = Number(/\/Length (\d+)/.exec(dict)[1]);
  let start = dictEnd + 'stream'.length;
  if (pdf[start] === 0x0d) start++;
  if (pdf[start] === 0x0a) start++;
  return { dict, data: inflateSync(pdf.subarray(start, start + length)) };
}

/** TIFF Predictor 2: каждый байт — разность с тем же каналом соседа слева. */
function undoTiffPredictor(buf, width, height, channels) {
  const row = width * channels;
  for (let y = 0; y < height; y++) {
    const o = y * row;
    for (let i = channels; i < row; i++) buf[o + i] = (buf[o + i] + buf[o + i - channels]) & 0xff;
  }
  return buf;
}

const W = 4600;
const H = 4600;
const rgb = undoTiffPredictor(stream(9).data, W, H, 3);
const alpha = undoTiffPredictor(stream(13).data, W, H, 1);

const rgba = Buffer.alloc(W * H * 4);
for (let i = 0, j = 0, k = 0; i < W * H; i++, j += 3, k += 4) {
  rgba[k] = rgb[j];
  rgba[k + 1] = rgb[j + 1];
  rgba[k + 2] = rgb[j + 2];
  rgba[k + 3] = alpha[i];
}

const out = path.join(root, 'source/derived');
mkdirSync(out, { recursive: true });
await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toFile(path.join(out, 'logo-original-4600.png'));
await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .resize(1104, 1104)
  .flatten({ background: '#ffffff' })
  .png()
  .toFile(path.join(out, 'logo-original-1104.png'));
console.log('готово:', out);
