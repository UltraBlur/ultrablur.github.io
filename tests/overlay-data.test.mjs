/* 叠加层数据自检：Munsell 2734 个色片 + 三维光谱轨迹。
   数据由 scripts/gen-overlay-data.py 从 colour-science 0.4.6 生成，
   这里只验「数量、取值范围、几何合理性」，不重复验证上游数据本身。

   运行：node tests/overlay-data.test.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const Geom = require(path.join(root, 'assets/js/colour-volume-geom.js'));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

/* ---------- Munsell ---------- */
const mun = read('data/munsellRenotation.json');
ok('Munsell 2734 个点', mun.points.length === 2734 && mun.count === 2734, String(mun.points.length));
ok('Munsell 有出处与照明体', /Newhall/.test(mun.source) && mun.illuminant === 'CIE C');

let munBad = 0;
let yLo = Infinity, yHi = -Infinity;
for (const p of mun.points) {
  const [x, y, Y] = p;
  if (![x, y, Y].every(Number.isFinite)) munBad++;
  if (!(x > 0 && x < 1 && y > 0 && y < 1)) munBad++;
  if (!(Y > 0 && Y <= 100)) munBad++;
  if (x + y >= 1 - 1e-6) munBad++;      // 色度必须落在三角形里
  yLo = Math.min(yLo, Y); yHi = Math.max(yHi, Y);
}
ok('Munsell 数值都在合理范围', munBad === 0, munBad + ' bad');
ok('Munsell Y 覆盖 1–79（value 1–9）', yLo > 1 && yHi < 100 && yHi > 70, yLo.toFixed(2) + ' … ' + yHi.toFixed(2));

/* 每个点都能换算成合法的 XYZ */
let xyzBad = 0;
for (const p of mun.points) {
  const [x, y, Y] = p;
  const Yr = Y / 100;
  const X = x * Yr / y, Z = (1 - x - y) * Yr / y;
  if (!(X >= 0 && Z >= 0)) xyzBad++;
}
ok('Munsell 全部能换算成非负 XYZ', xyzBad === 0, xyzBad + ' bad');

/* Munsell 的 xy 足迹应当覆盖相当一块色域（不是一堆重合点） */
const xs = mun.points.map((p) => p[0]);
const ys = mun.points.map((p) => p[1]);
ok('Munsell xy 足迹足够大', Math.max(...xs) - Math.min(...xs) > 0.5 && Math.max(...ys) - Math.min(...ys) > 0.5,
  (Math.max(...xs) - Math.min(...xs)).toFixed(2) + ' × ' + (Math.max(...ys) - Math.min(...ys)).toFixed(2));

/* ---------- 光谱轨迹（三维版，带 ȳ(λ)） ---------- */
const loc = read('data/spectralLocus.json');
ok('光谱轨迹 321 个点', loc.points.length === 321 && loc.count === 321, String(loc.points.length));
ok('光谱轨迹有 ȳ 与出处', /1931/.test(loc.source) && loc.points.every((p) => p.length === 3));
ok('光谱轨迹首尾是 380nm / 700nm',
  Math.abs(loc.points[0][0] - 0.1741) < 1e-3 && Math.abs(loc.points[320][0] - 0.7347) < 1e-3,
  loc.points[0].join(',') + ' … ' + loc.points[320].join(','));

/* ȳ(λ) 必须在 0–1，且在 555nm 附近有唯一的最大值（否则 3D 曲线的「屋顶」就不对） */
let ybarBad = 0, ybarMax = 0, maxIdx = 0;
loc.points.forEach((p, i) => {
  if (!(p[2] > 0 && p[2] <= 1.0001)) ybarBad++;
  if (p[2] > ybarMax) { ybarMax = p[2]; maxIdx = i; }
});
ok('光谱轨迹 ȳ 全在 (0, 1]', ybarBad === 0, ybarBad + ' bad');
ok('ȳ 的峰值在绿端（555nm 附近）', maxIdx > 100 && maxIdx < 220 && Math.abs(ybarMax - 1) < 1e-3,
  '峰值索引 ' + maxIdx + '，值 ' + ybarMax.toFixed(4));
ok('ȳ 两端很低（紫/深红几乎归零）', loc.points[0][2] < 0.001 && loc.points[320][2] < 0.01,
  loc.points[0][2] + ' / ' + loc.points[320][2]);

console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
