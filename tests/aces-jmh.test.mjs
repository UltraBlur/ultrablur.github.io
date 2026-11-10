/* aces-jmh.js 自检：页面上的彩色色相切片和 JMh 图都靠它。
   参考值来自 scripts/aces2/aces2.py（同一批 CTL 函数的 NumPy 移植），
   P3-D65 / Rec.709，L_A = 100、Y_b = 20、dim surround。
   运行：node tests/aces-jmh.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const J = require('../assets/js/lib/aces-jmh.js');

const P3 = [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]];
const R709 = [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]];
const D65 = [0.3127, 0.3290];

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) pass++;
  else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')); }
}
function close(a, b, tol, label) {
  ok(Math.abs(a - b) <= tol, label, 'got ' + a + ' want ' + b);
}

const p3 = J.init(P3, D65);
const r709 = J.init(R709, D65);

/* 1. 常数：与 CTL 一致 */
close(p3.cz, 1.13705602, 1e-8, 'cz');
close(p3.F_L, 0.79370053, 1e-8, 'F_L');
close(p3.A_w, 39.488992, 1e-6, 'A_w');
close(p3.A_w_J, 12.947211, 1e-6, 'A_w_J');

/* 2. P3-D65 的 JMh（python 参考值） */
const REF = [
  [[1, 1, 1], 100, 0, 0],
  [[0.5, 0.5, 0.5], 72.49245, 0, 0],
  [[0.18, 0.18, 0.18], 44.93861, 0, 0],
  [[0.5, 0.2, 0.1], 54.63299, 28.80224, 43.05710],
  [[1, 0, 0], 54.00732, 93.89525, 29.25399],
  [[0, 1, 0], 79.65915, 93.74399, 142.88956],
  [[0, 0, 1], 32.28014, 68.91320, 283.02303],
  [[1, 1, 0], 94.90790, 72.45724, 110.12205]
];
for (const [rgb, j, m, h] of REF) {
  const v = J.rgbToJMh(rgb, p3);
  close(v[0], j, 1e-4, 'P3 J for ' + JSON.stringify(rgb));
  close(v[1], m, 1e-4, 'P3 M for ' + JSON.stringify(rgb));
  if (m > 1e-6) close(v[2], h, 1e-3, 'P3 h for ' + JSON.stringify(rgb));
}

/* 3. Rec.709 的五组参考值 */
const REF709 = [
  [[0.5, 0.2, 0.1], 53.98229, 23.60707, 46.03089],
  [[1, 0, 0], 51.81365, 77.37978, 27.34941],
  [[0, 1, 0], 82.00609, 74.61436, 141.41102],
  [[0, 0, 1], 30.88388, 66.36499, 283.03031]
];
for (const [rgb, j, m, h] of REF709) {
  const v = J.rgbToJMh(rgb, r709);
  close(v[0], j, 1e-4, '709 J for ' + JSON.stringify(rgb));
  close(v[1], m, 1e-4, '709 M for ' + JSON.stringify(rgb));
  close(v[2], h, 1e-3, '709 h for ' + JSON.stringify(rgb));
}

/* 4. JMh → RGB → JMh 往返 */
for (const [j, m, h] of [[50, 40, 30], [80, 20, 200], [20, 10, 300], [95, 60, 110]]) {
  const rgb = J.jmhToRGB([j, m, h], p3);
  const back = J.rgbToJMh(rgb, p3);
  close(back[0], j, 1e-6, 'roundtrip J ' + j);
  close(back[1], m, 1e-6, 'roundtrip M ' + m);
  close(back[2], h, 1e-6, 'roundtrip h ' + h);
}

/* 5. cusp / 边界：与 python 二分结果对齐（容差取二分精度） */
const c30 = J.cusp(30, p3);
close(c30.J, 54.48321, 2e-3, 'cusp J at 30° (P3)');
close(c30.M, 92.17245, 2e-3, 'cusp M at 30° (P3)');
close(J.boundaryM(27.24, 30, p3), 50.159, 0.01, 'boundary M at J=27.24');
close(J.boundaryM(68.14, 30, p3), 51.977, 0.01, 'boundary M at J=68.14');

/* 6. 边界上的点一定在色域内，稍外一点一定不在 */
ok(J.inGamut([c30.J, c30.M * 0.99, 30], p3), 'point just inside the cusp is in gamut');
ok(!J.inGamut([c30.J, c30.M * 1.02, 30], p3), 'point just outside the cusp is out of gamut');

/* 7. 下壳幂律：γ ≈ 1.14（CTL 里的常数） */
const pLow = Math.log(J.boundaryM(c30.J * 0.5, 30, p3) / c30.M) / Math.log(0.5);
close(1 / pLow, 1.14, 0.02, 'lower hull gamma (P3, 30°)');

/* 8. 峰值缩放的立方体（CTL 建表时角点乘 peak/ref_luminance，1000 nit 即 ×10）
      参考值同样来自 aces2.py */
const c10 = J.cusp(30, p3, 10);
close(c10.J, 156.772, 5e-3, 'cusp J at 30°, 1000-nit cube');
close(c10.M, 232.610, 5e-3, 'cusp M at 30°, 1000-nit cube');
close(J.boundaryM(78.386, 30, p3, 10), 126.803, 0.02, 'boundary M at J=78.4, k=10');
close(J.yToJ(1000, p3), 283.2499, 1e-2, 'yToJ(1000) = J_max at 1000 nit');
ok(J.inGamut([200, 119.0, 30], p3, 10), 'scaled-cube point inside is in gamut');
ok(!J.inGamut([200, 119.6, 30], p3, 10), 'scaled-cube point outside is out of gamut');

/* 9. mid_J：CTL 用 18% 灰的**输出**亮度 (c_t·n_r ≈ 10 cd/m²)，不是 18 cd/m² */
close(J.yToJ(10.013, p3), 34.0965, 1e-2, 'yToJ(c_t*n_r) = mid_J at 100 nit');

/* 10. Y → J：灰轴 */
close(J.yToJ(100, p3), 100, 1e-4, 'yToJ(100) = 100');
close(J.yToJ(18, p3), 44.93861, 1e-4, 'yToJ(18)');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
