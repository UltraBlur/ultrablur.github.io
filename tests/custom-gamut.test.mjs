/* 自定义 Gamut 自检：凸包、点包含、mp 编解码与色体积工具的格式兼容。
   运行：node tests/custom-gamut.test.mjs */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const CG = require(path.join(root, 'assets/js/lib/custom-gamut.js'));
const Geom2D = require(path.join(root, 'assets/js/lib/geom2d.js'));
const Volume = require(path.join(root, 'assets/js/colour-volume-geom.js'));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function near(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }

const D65 = [0.3127, 0.3290];
const SRGB = [[0.6400, 0.3300], [0.3000, 0.6000], [0.1500, 0.0600]];
const P3 = [[0.6800, 0.3200], [0.2650, 0.6900], [0.1500, 0.0600]];
const area = (poly) => Geom2D.polygonArea(poly);

/* ---------- 1. 凸包 ---------- */

const hull = CG.convexHull(SRGB.slice().reverse());
ok('sRGB 乱序：凸包仍是 3 点', hull.length === 3, hull.length);
ok('sRGB 凸包面积 = 11.205%', near(area(hull), 0.11205, 1e-9), area(hull));
ok('凸包为逆时针', (hull[1][0] - hull[0][0]) * (hull[2][1] - hull[0][1]) -
  (hull[1][1] - hull[0][1]) * (hull[2][0] - hull[0][0]) > 0);

const withWhite = CG.convexHull(SRGB.concat([[0.3127, 0.3290]]));
ok('白点落在三角形内：凸包丢掉内部点', withWhite.length === 3, withWhite.length);
ok('丢点不改变面积', near(area(withWhite), 0.11205, 1e-9));

const dup = CG.convexHull([[0.64, 0.33], [0.64, 0.33], [0.30, 0.60], [0.15, 0.06]]);
ok('重复点去重', dup.length === 3, dup.length);

const line = CG.convexHull([[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]]);
ok('共线点判退化（< 3 点）', line.length < 3, line.length);

ok('少于 3 点原样返回', CG.convexHull([[0.1, 0.1], [0.2, 0.2]]).length === 2);
ok('非有限坐标被忽略', CG.convexHull([[0.1, 0.1], [NaN, 0.2], [0.3, 0.3]]).length === 2);

/* ---------- 2. 点包含 ---------- */

ok('D65 在 sRGB 内', CG.polygonContains(hull, D65));
ok('红绿边中点算在边界内', CG.polygonContains(hull, [0.47, 0.465]));
ok('(0.5, 0.1) 在 sRGB 外', !CG.polygonContains(hull, [0.5, 0.1]));
ok('白点 (0.5, 0.5) 在 sRGB 外', !CG.polygonContains(hull, [0.5, 0.5]));
ok('退化多边形不包含任何点', !CG.polygonContains(line, [0.2, 0.2]));

/* ---------- 3. mp 编解码 ---------- */

const def = { primaries: SRGB, white: D65 };
ok('编码格式与色体积一致', CG.encode(def) === Volume.encodeMulti(def),
  CG.encode(def) + ' vs ' + Volume.encodeMulti(def));

const enc = '0.6400,0.3300_0.3000,0.6000_0.1500,0.0600*0.3127,0.3290';
ok('编码串固定 4 位小数', CG.encode(def) === enc, CG.encode(def));

const dec = CG.decode(enc);
ok('解码原色', JSON.stringify(dec.primaries) === JSON.stringify(SRGB));
ok('解码白点', JSON.stringify(dec.white) === JSON.stringify([0.3127, 0.329]));

const odd = { primaries: P3, white: [0.3140, 0.3510] };
ok('3 位小数往返', CG.encode(odd) === Volume.encodeMulti(odd) &&
  CG.decode(CG.encode(odd)).primaries.length === 3);
ok('4 位小数往返误差 ≤ 5e-5', CG.decode(CG.encode(odd)).primaries.every((p, i) =>
  near(p[0], P3[i][0], 5e-5) && near(p[1], P3[i][1], 5e-5)));

const four = { primaries: SRGB.concat([[0.0680, 0.3510]]), white: D65 };
ok('4 基色往返', CG.decode(CG.encode(four)).primaries.length === 4);
ok('色体积的权重段被忽略', (() => {
  const d = CG.decode(Volume.encodeMulti({ primaries: SRGB, white: D65, weights: [0.2126, 0.7152, 0.0722] }));
  return d && d.primaries.length === 3;
})());
ok('只有原色时白点回落 D65', (() => {
  const d = CG.decode('0.64,0.33_0.30,0.60_0.15,0.06');
  return d && d.white[0] === 0.3127 && d.white[1] === 0.329;
})());
ok('色体积解码器认可本工具的输出', (() => {
  const d = Volume.decodeMulti(CG.encode(def));
  return d && d.primaries.length === 3 && near(d.white[0], 0.3127, 5e-5);
})());

ok('空串返回 null', CG.decode('') === null && CG.decode(null) === null);
ok('坏串返回 null', CG.decode('x') === null && CG.decode('0.64,0.33') === null);
ok('少于 3 个原色返回 null', CG.decode('0.64,0.33_0.30,0.60_*0.3127,0.3290') === null);
ok('超过 8 个原色返回 null', CG.decode(Array(9).fill('0.64,0.33').join('_') + '*0.3127,0.3290') === null);
ok('非数字原色返回 null', CG.decode('0.64,0.33_0.30,0.60_abc,0.06') === null);
ok('越界坐标返回 null（64 这类手误）', CG.decode('64,0.33_0.30,0.60_0.15,0.06') === null);
ok('白点 y ≤ 0 返回 null', CG.decode('0.64,0.33_0.30,0.60_0.15,0.06*0.3127,0') === null);
ok('负 y 原色允许（相机色域）', (() => {
  const d = CG.decode('0.7347,0.2653_0.1424,0.8576_0.0991,-0.0308*0.3127,0.3290');
  return d && d.primaries[2][1] === -0.0308;
})());

ok('非法定义不编码', CG.encode({ primaries: SRGB.slice(0, 2), white: D65 }) === '');
ok('白点非法不编码', CG.encode({ primaries: SRGB, white: [0.3127, 0] }) === '');
ok('超上限不编码', CG.encode({ primaries: [[3, 0.3], [0.3, 0.6], [0.15, 0.06]], white: D65 }) === '');

/* ---------- 4. 默认定义与集成 ---------- */

const a = CG.defaultDef();
a.primaries[0][0] = 0.1;
ok('defaultDef 返回副本', CG.defaultDef().primaries[0][0] === 0.64);

/* 用自定义 sRGB 当裁剪对象，交集应等于内置 sRGB 本身（验证凸包方向与 clip 兼容） */
const p3Area = area(P3);
const interBuiltIn = area(Geom2D.clipPolygon(SRGB, P3));
const interCustom = area(Geom2D.clipPolygon(CG.convexHull(SRGB.concat([[0.31, 0.33]])), P3));
ok('自定义 sRGB vs 内置 P3 的交集一致', near(interBuiltIn, interCustom, 1e-9),
  interBuiltIn + ' vs ' + interCustom);
ok('sRGB 完全落在 P3 内', near(interCustom / area(CG.convexHull(SRGB)), 1, 1e-9));
ok('P3 面积 15.2%', near(p3Area, 0.152, 1e-9), p3Area);

if (!fails.length) {
  console.log(`自定义 Gamut：${pass} 项断言全部通过`);
} else {
  console.log(`自定义 Gamut：${pass} 通过，${fails.length} 失败`);
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
