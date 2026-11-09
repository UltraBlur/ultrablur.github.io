/* Pointer's Gamut 数据的自检：凸包、面积、与 sRGB / P3 / BT.2020 的覆盖关系。
   运行：node tests/pointer-gamut.test.mjs
   参考值由 scripts/gen-pointer-gamut.py 用 colour-science 0.4.6 算出。 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const G = require(path.join(here, '..', 'assets/js/lib/geom2d.js'));
const data = JSON.parse(readFileSync(path.join(here, '..', 'data/pointerGamut.json'), 'utf8'));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function near(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
}

/* sRGB / P3 / BT.2020 的原色（xy） */
const RGB = {
  sRGB: [[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]],
  'P3-D65': [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]],
  'BT.2020': [[0.708, 0.292], [0.17, 0.797], [0.131, 0.046]]
};

/* 1. 数据形状 */
ok('lch 为 576 × 3', data.lch.length === 576 && data.lch.every((r) => r.length === 3));
ok('hull 为 18 个点', data.hull.length === 18, data.hull.length);
ok('boundary 为 32 个点', data.boundary.length === 32, data.boundary.length);
ok('L* 覆盖 15–90 步长 5',
  new Set(data.lch.map((r) => r[0])).size === 16 &&
  Math.min(...data.lch.map((r) => r[0])) === 15 &&
  Math.max(...data.lch.map((r) => r[0])) === 90);

/* 2. 凸包 */
function isConvex(poly) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[(i + 2) % poly.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-12) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
ok('hull 为凸多边形', isConvex(data.hull));

const ptrArea = G.polygonArea(data.hull);
ok('hull 面积 0.1649', near(ptrArea, 0.1649, 1e-3), ptrArea.toFixed(5));
ok('JSON 记录的 area 与重算一致', near(data.area, ptrArea, 1e-3), data.area + ' vs ' + ptrArea.toFixed(5));

/* 3. 与 RGB 色域的覆盖关系（参考值来自 colour-science） */
const ref = {
  sRGB: { area: 0.1121, ofPointer: 0.6734, inside: 0.9912 },
  'P3-D65': { area: 0.1520, ofPointer: 0.8500, inside: 0.9224 },
  'BT.2020': { area: 0.2119, ofPointer: 0.9952, inside: 0.7748 }
};
for (const name of Object.keys(ref)) {
  const tri = RGB[name];
  const inter = G.clipPolygon(data.hull, tri);
  const ia = G.polygonArea(inter);
  const r = ref[name];
  ok(name + ' 三角形面积', near(G.triangleArea(tri), r.area, 2e-4), G.triangleArea(tri).toFixed(4));
  ok(name + ' 占 Pointer 面积', near(ia / ptrArea, r.ofPointer, 2e-3), (100 * ia / ptrArea).toFixed(2) + '%');
  ok(name + ' 落在 Pointer 内的比例', near(ia / G.triangleArea(tri), r.inside, 2e-3), (100 * ia / G.triangleArea(tri)).toFixed(2) + '%');
}

/* 4. 交集为凸多边形（裁剪实现的基本性质） */
const inter = G.clipPolygon(data.hull, RGB.sRGB);
ok('裁剪结果非空且为凸', inter.length >= 3 && isConvex(inter), inter.length + ' pts');

console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
