/* 坐标审计：每个坐标的「显示三元组」必须和它标的名字对得上。
   期望值来自 docs/colour-volume.md §3.1（当年与 colour-science 逐点核过）
   和 tests/aces-jmh.test.mjs（Rec.709 红），所以这里验的是「标签 ↔ 数据」，
   不是再验一遍公式。
   运行：node tests/volume-coords.test.mjs */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const Geom = require(path.join(root, 'assets/js/colour-volume-geom.js'));
const Models = require(path.join(root, 'assets/js/colour-models.js'));
const JMh = require(path.join(root, 'assets/js/lib/aces-jmh.js'));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-3 : tol); }

const SRGB_M = [[0.412390799266, 0.357584339384, 0.180480788402],
                [0.212639005872, 0.715168678768, 0.072192315361],
                [0.019330818716, 0.119194779795, 0.950532152250]];
const srgb = Geom.makeSpace({ slug: 'srgb', title: 'sRGB', matrix: SRGB_M, white: [0.3127, 0.329], primaries: [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]] }, SRGB_M, JMh);
const opts = {
  models: Models, lum: 100,
  cond: { surround: 'average', bg: 0.2, laFactor: 0.2 },
  ext: null, jmh: JMh
};

function pt(coord, rgb) { return Geom.pointFor(srgb, coord, rgb, opts); }

/* sRGB 红（线性 [1,0,0]）在各坐标下的显示三元组。
   约定：display = [水平, 竖直, 深度]，竖直恒为明度类量。 */
const RED = {
  xyz:    [0.41239, 0.21264, 0.01933],
  xyy:    [0.64000, 0.21264, 0.33000],     // [x, Y, y]
  lab:    [80.09, 53.24, 67.20],           // [a*, L*, b*]
  luv:    [175.00982, 53.23712, 37.76509], // [u*, L*, v*]（colour-science 0.4.6 实测）
  oklab:  [0.22489, 0.62793, 0.12580],     // [a, L, b]
  cam02:  [42.0278, 60.2050, 26.4858],     // [a', J', b']
  cam16:  [44.3760, 59.3129, 23.0163],     // [a', J', b']
  zcam:   [35.8997, 51.1973, 32.8695],     // [az, Jz, bz]
  ictcp:  [-0.10236, 0.36379, 0.25842],    // [Ct, I, Cp]
  jzazbz: [0.09967, 0.09896, 0.09125]      // [az, Jz, bz]
};

/* JMh 红：J 51.81365 / M 77.37978 / h 27.34941 → a = M cos h, b = M sin h */
const redHue = 27.34941 * Math.PI / 180;
RED.jmh = [77.37978 * Math.cos(redHue), 51.81365, 77.37978 * Math.sin(redHue)];

/* 轴名（与 layouts 里的 AXIS_NAMES 同源）：用来断言「名字标的是哪一位」 */
const AXIS = {
  xyz: ['X', 'Y', 'Z'],
  xyy: ['x', 'Y', 'y'],
  lab: ['a*', 'L*', 'b*'],
  luv: ['u*', 'L*', 'v*'],
  oklab: ['a', 'L', 'b'],
  cam02: ["a'", "J'", "b'"],
  cam16: ["a'", "J'", "b'"],
  zcam: ['az', 'Jz', 'bz'],
  ictcp: ['Ct', 'I', 'Cp'],
  jzazbz: ['az', 'Jz', 'bz'],
  jmh: ['a', 'J', 'b']
};

/* 1. 红：每个坐标都要落在文档值上 */
for (const coord of Object.keys(RED)) {
  const got = pt(coord, [1, 0, 0]);
  const want = RED[coord];
  const good = got && got.every((v, i) => near(v, want[i], 5e-3));
  ok('红 ' + coord + ' = ' + AXIS[coord].join('/'),
    good, got && got.map((v) => v.toFixed(5)).join(', ') + '  期望 ' + want.map((v) => v.toFixed(5)).join(', '));
}

/* 2. 白点：竖直轴必须是该坐标的「白」，水平/深度必须是它的中性值 */
for (const coord of Object.keys(RED)) {
  const got = pt(coord, [1, 1, 1]);
  let wantV = 100;
  let wantSide = 0;
  if (coord === 'xyz') { wantV = 1; wantSide = null; }
  if (coord === 'xyy') { wantV = 1; wantSide = null; }
  if (coord === 'oklab') { wantV = 1; wantSide = 0; }
  if (coord === 'ictcp') { wantV = 0.50808; wantSide = 0; }  // PQ 编码：100 nit 的白
  if (coord === 'jzazbz') { wantV = 0.16717; wantSide = 0; }  // Jz(100 nit)
  const okV = got && near(got[1], wantV, 1e-3);
  ok('白 ' + coord + ' 竖直 = ' + wantV, okV, got && got[1]);
  if (wantSide !== null && coord !== 'xyz' && coord !== 'xyy') {
    ok('白 ' + coord + ' 两侧 ≈ 0', got && near(got[0], wantSide, 2) && near(got[2], wantSide, 2),
      got && got[0].toFixed(4) + ' / ' + got[2].toFixed(4));
  }
}

/* 3. 白点的色度：xyY 必须是 (x_w, 1, y_w)，不能是 (x_w, 1, z_w) */
const whiteXY = pt('xyy', [1, 1, 1]);
ok('白 xyY = (0.3127, 1, 0.329)', whiteXY && near(whiteXY[0], 0.3127, 1e-4) && near(whiteXY[2], 0.329, 1e-4),
  whiteXY && whiteXY.join(', '));

/* 4. 竖直轴必须随亮度单调：同一色相下 0.18 灰 < 白 */
for (const coord of Object.keys(RED)) {
  const g = pt(coord, [0.18, 0.18, 0.18]);
  const w = pt(coord, [1, 1, 1]);
  const okMon = g && w && g[1] < w[1] && g[1] > -1e-9;
  ok('灰阶单调 ' + coord, okMon, g && (g[1] + ' < ' + w[1]));
}

/* 5. 黑点：除 xyY 的闭包外都落在原点 */
for (const coord of Object.keys(RED)) {
  const k = pt(coord, [0, 0, 0]);
  if (coord === 'xyy') {
    ok('黑 xyY = 白点色度落在 Y=0',
      k && near(k[0], 0.3127, 1e-4) && near(k[1], 0, 1e-12) && near(k[2], 0.329, 1e-4),
      k && k.join(', '));
  } else {
    ok('黑 ' + coord + ' ≈ 0', k && near(k[0], 0, 1e-6) && near(k[1], 0, 1e-6) && near(k[2], 0, 1e-6),
      k && k.join(', '));
  }
}

/* 6. 深/浅方向不能反：xyY 的第三位是 y（绿 > 红 > 蓝），不是 z（正好相反） */
const gChroma = pt('xyy', [0, 1, 0]);
const rChroma = pt('xyy', [1, 0, 0]);
const bChroma = pt('xyy', [0, 0, 1]);
ok('xyY 第三位随绿/红/蓝递减（y，不是 z）',
  gChroma && rChroma && bChroma &&
  gChroma[2] > rChroma[2] && rChroma[2] > bChroma[2],
  [gChroma, rChroma, bChroma].map((v) => v && v[2].toFixed(3)).join(' > '));

/* ---------- 汇总 ---------- */

console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
