/* 色模型自检：CAM16-UCS 与 ZCAM。
   参考值由 colour-science 0.4.6 现算（XYZ_to_CAM16 / XYZ_to_ZCAM），
   L_A=Y_b=20、Average 环绕、D65 白点 Y=100；换观察条件的几组也钉住了。
   运行：node tests/colour-appearance.test.mjs */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const CM = require(path.join(here, '..', 'assets/js/colour-models.js'));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-3 : tol); }

const SRGB = [[0.412390799266, 0.357584339384, 0.180480788402],
              [0.212639005872, 0.715168678768, 0.072192315361],
              [0.019330818716, 0.119194779795, 0.950532152250]].flat();
const R2020 = [[0.636958048301, 0.144616903586, 0.168880975164],
               [0.262700212011, 0.677998071519, 0.059301716470],
               [0.000000000000, 0.028072693049, 1.060985057711]].flat();
/* D65 白点，Y = 100（色貌模型吃绝对亮度） */
const W = [0.3127 / 0.329 * 100, 100, (1 - 0.3127 - 0.329) / 0.329 * 100];

function mulv(A, v) {
  return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
          A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
          A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
}

const AVG = { La: 20, Yb: 20, F: 1, c: 0.69, Nc: 1, Nc16: 1, Fs: 0.69 };
const DIM = { La: 20, Yb: 20, F: 0.9, c: 0.59, Nc: 0.95, Nc16: 0.9, Fs: 0.59 };
const DARK = { La: 20, Yb: 20, F: 0.8, c: 0.525, Nc: 0.8, Nc16: 0.8, Fs: 0.525 };

function run(model, matrix, rgb, opts) {
  return model(mulv(matrix, rgb).map((v) => v * 100), W, opts || AVG);
}

/* ---------- CAM16-UCS：a′ / J′ / b′ ---------- */

const CAM16_REF = [
  ['sRGB 白', SRGB, [1, 1, 1], [-1.85116, 100, -1.04959]],
  ['sRGB 红', SRGB, [1, 0, 0], [44.37600, 59.31289, 23.01627]],
  ['sRGB 绿', SRGB, [0, 1, 0], [-38.38013, 86.60953, 29.91136]],
  ['sRGB 蓝', SRGB, [0, 0, 1], [9.37779, 36.38506, -41.34918]],
  ['sRGB 0.18 灰', SRGB, [0.18, 0.18, 0.18], [-1.17135, 52.15319, -0.66420]],
  ['Rec.2020 红', R2020, [1, 0, 0], [59.37068, 65.76680, 26.15857]],
  ['Rec.2020 绿', R2020, [0, 1, 0], [-54.14048, 82.81378, 32.30333]],
  ['Rec.2020 蓝', R2020, [0, 0, 1], [2.26713, 32.84132, -43.51684]]
];

for (const [name, M, rgb, want] of CAM16_REF) {
  const got = run(CM.cam16ucs, M, rgb);
  const good = got && got.every((v, i) => near(v, want[i]));
  ok('CAM16：' + name, good, got && got.map((v) => v.toFixed(4)).join(', '));
}

/* 昏暗环绕 CAM16 的 N_c = 0.9（不是 CIE 159 给 CAM02 的 0.95） */
const cam16Dim = run(CM.cam16ucs, SRGB, [1, 0, 0], DIM);
ok('CAM16：昏暗环绕（N_c = 0.9）sRGB 红',
  cam16Dim && near(cam16Dim[0], 43.19214) && near(cam16Dim[1], 64.47025) && near(cam16Dim[2], 22.47334),
  cam16Dim && cam16Dim.map((v) => v.toFixed(5)).join(', '));

const cam16Dark = run(CM.cam16ucs, SRGB, [0, 0, 1], DARK);
ok('CAM16：暗环绕 sRGB 蓝',
  cam16Dark && near(cam16Dark[0], 8.94919) && near(cam16Dark[1], 47.81180) && near(cam16Dark[2], -40.59435),
  cam16Dark && cam16Dark.map((v) => v.toFixed(5)).join(', '));

const cam16Hi = run(CM.cam16ucs, SRGB, [1, 0, 0], { La: 100, Yb: 100, F: 1, c: 0.69, Nc: 1, Nc16: 1, Fs: 0.69 });
ok('CAM16：L_A = Y_b = 100 的 sRGB 红',
  cam16Hi && near(cam16Hi[0], 46.28370) && near(cam16Hi[1], 50.14229) && near(cam16Hi[2], 23.99066),
  cam16Hi && cam16Hi.map((v) => v.toFixed(5)).join(', '));

/* ---------- ZCAM：az / Jz / bz ---------- */

const ZCAM_REF = [
  ['sRGB 白', SRGB, [1, 1, 1], [-0.31622, 100, -0.23041]],
  ['sRGB 红', SRGB, [1, 0, 0], [35.89967, 51.19730, 32.86947]],
  ['sRGB 绿', SRGB, [0, 1, 0], [-32.73689, 81.07755, 35.45317]],
  ['sRGB 蓝', SRGB, [0, 0, 1], [-12.00628, 43.49496, -60.70293]],
  ['sRGB 0.18 灰', SRGB, [0.18, 0.18, 0.18], [-0.23002, 45.60195, -0.16761]],
  ['Rec.2020 红', R2020, [1, 0, 0], [47.52366, 58.43819, 37.57414]],
  ['Rec.2020 绿', R2020, [0, 1, 0], [-56.67229, 76.91251, 39.64579]],
  ['Rec.2020 蓝', R2020, [0, 0, 1], [-22.41416, 43.20473, -64.53430]]
];

for (const [name, M, rgb, want] of ZCAM_REF) {
  const got = run(CM.zcam, M, rgb);
  const good = got && got.every((v, i) => near(v, want[i]));
  ok('ZCAM：' + name, good, got && got.map((v) => v.toFixed(4)).join(', '));
}

const zcamDim = run(CM.zcam, SRGB, [1, 0, 0], DIM);
ok('ZCAM：昏暗环绕 sRGB 红（J_z 随 F_s 变，M_z 不变）',
  zcamDim && near(zcamDim[0], 35.89967, 1e-2) && near(zcamDim[1], 56.41377) && near(zcamDim[2], 32.86947, 1e-2),
  zcamDim && zcamDim.map((v) => v.toFixed(5)).join(', '));

const zcamDark = run(CM.zcam, SRGB, [0, 0, 1], DARK);
ok('ZCAM：暗环绕 sRGB 蓝',
  zcamDark && near(zcamDark[0], -12.00628, 1e-2) && near(zcamDark[1], 53.07612) && near(zcamDark[2], -60.70293, 1e-2),
  zcamDark && zcamDark.map((v) => v.toFixed(5)).join(', '));

const zcamHi = run(CM.zcam, SRGB, [1, 0, 0], { La: 100, Yb: 100, F: 1, c: 0.69, Nc: 1, Nc16: 1, Fs: 0.69 });
ok('ZCAM：L_A = Y_b = 100 的 sRGB 红',
  zcamHi && near(zcamHi[0], 36.87568) && near(zcamHi[1], 54.45163) && near(zcamHi[2], 33.76309),
  zcamHi && zcamHi.map((v) => v.toFixed(5)).join(', '));

/* ---------- IPT（Ebner & Fairchild 1998） ----------
   基准值取 colour-science XYZ_to_IPT 的 doctest：
   XYZ = [0.20654008, 0.12197225, 0.05136952] → (I, P, T) = (0.3842619, 0.3848730, 0.1888683)。
   我们返回显示序 [P, I, T]。 */

const iptDoc = CM.ipt([0.20654008, 0.12197225, 0.05136952]);
ok('IPT：colour-science doctest 向量',
  iptDoc && near(iptDoc[0], 0.3848730, 1e-6) && near(iptDoc[1], 0.3842619, 1e-6) && near(iptDoc[2], 0.1888683, 1e-6),
  iptDoc && iptDoc.map((v) => v.toFixed(7)).join(', '));

/* 矩阵按 D65 归一：D65 白必须落在 I = 1、P = T = 0（不是 100，IPT 的 I 是 0–1） */
const iptWhite = CM.ipt(mulv(SRGB, [1, 1, 1]));
ok('IPT：D65 白 = (P=0, I=1, T=0)',
  iptWhite && near(iptWhite[0], 0, 1e-3) && near(iptWhite[1], 1, 1e-4) && near(iptWhite[2], 0, 1e-3),
  iptWhite && iptWhite.map((v) => v.toFixed(6)).join(', '));

/* sRGB 三原色（线性）：符号与量级要和 IPT 定义一致——红偏黄（T>0）、绿偏黄、蓝偏蓝 */
for (const [name, rgb, want] of [
  ['红', [1, 0, 0], [0.620930, 0.456161, 0.442809]],
  ['绿', [0, 1, 0], [-0.453397, 0.760385, 0.530848]],
  ['蓝', [0, 0, 1], [-0.237230, 0.444310, -0.748548]]
]) {
  const got = CM.ipt(mulv(SRGB, rgb));
  ok('IPT：sRGB ' + name,
    got && got.every((v, i) => near(v, want[i], 1e-5)),
    got && got.map((v) => v.toFixed(6)).join(', '));
}

/* 负锥响应要走 signPow，不能产生 NaN（深蓝近黑的区域会出现负 LM） */
const iptNeg = CM.ipt([-0.02, 0.001, 0.01]);
ok('IPT：负输入不产生 NaN', iptNeg && iptNeg.every((v) => isFinite(v)),
  JSON.stringify(iptNeg));

/* ---------- 共同性质 ---------- */
const w16 = run(CM.cam16ucs, SRGB, [1, 1, 1]);
const wz = run(CM.zcam, SRGB, [1, 1, 1]);
ok('CAM16 / ZCAM：白点 J = 100', w16 && near(w16[1], 100, 1e-6) && wz && near(wz[1], 100, 1e-6),
  (w16 && w16[1]) + ' / ' + (wz && wz[1]));

const black16 = run(CM.cam16ucs, SRGB, [0, 0, 0]);
const blackz = run(CM.zcam, SRGB, [0, 0, 0]);
ok('CAM16 / ZCAM：黑点不产生 NaN',
  black16 && black16.every((v) => isFinite(v)) && blackz && blackz.every((v) => isFinite(v)),
  JSON.stringify(black16) + ' / ' + JSON.stringify(blackz));

/* ---------- 逆变换：24 色往返（页面渐变插值要用） ---------- */

const SRGB_INV = [
  [0.412390799266, 0.357584339384, 0.180480788402],
  [0.212639005872, 0.715168678768, 0.072192315361],
  [0.019330818716, 0.119194779795, 0.950532152250]
].flat();

/* 24 色 = sRGB 的 6×4 网格，覆盖近黑、饱和原色与中性灰 */
const GRID_RGB = [];
for (let r = 0; r < 6; r++) {
  for (let g = 0; g < 3; g++) {
    const b = (r + g) % 4 / 3;
    GRID_RGB.push([r / 5, g / 2, b]);
  }
}

const ROUND = [
  ['Lab', (xyz) => CM.labToXyz(CM.lab(xyz, W_REL), W_REL)],
  ['Luv', (xyz) => CM.luvToXyz(CM.luv(xyz, W_REL), W_REL)],
  ['Oklab', (xyz) => CM.oklabToXyz(CM.oklab(xyz))],
  ['IPT', (xyz) => CM.iptToXyz(CM.ipt(xyz))],
  ['JzAzBz', (xyz) => CM.jzazbzToXyz(CM.jzazbz(xyz, 100), 100)]
];
const W_REL = [W[0] / 100, 1, W[2] / 100];
for (const [name, back] of ROUND) {
  let worst = 0;
  for (const rgb of GRID_RGB) {
    const xyz = mulv(SRGB_INV, rgb);
    const got = back(xyz);
    ok(name + '：往返无 NaN', got && got.every((v) => isFinite(v)), JSON.stringify(got));
    if (!got) continue;
    for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(got[i] - xyz[i]));
  }
  ok(name + '：24 色往返误差 < 1e-9', worst < 1e-9, worst.toExponential(2));
}

/* 逆变换对黑点与超白也要有限（渐变会插到两端外面） */
for (const [name, back] of ROUND) {
  const black = back([0, 0, 0]);
  const above = back([1.2, 1.2, 1.2]);
  ok(name + '：黑点 / 超白不产生 NaN',
    black.every((v) => isFinite(v)) && above.every((v) => isFinite(v)),
    JSON.stringify(black) + ' / ' + JSON.stringify(above));
}

/* ---------- cam16Forward：colour-science 0.4.6 黄金向量 ----------
   XYZ_to_CAM16(xyz, D65_Y100, L_A, Y_b, surround)，XYZ 已按 Y = 100 的绝对量。
   取 J / Q / C / M / s / h 六个量，容差 1e-4。 */

const CAM16_GOLD = [
  /* [名称, 矩阵, RGB, 条件] */
  ['sRGB 红', 'srgb', [1, 0, 0], 'avg'], ['sRGB 红', 'srgb', [1, 0, 0], 'dim'],
  ['sRGB 红', 'srgb', [1, 0, 0], 'dark'], ['sRGB 红', 'srgb', [1, 0, 0], 'la4'],
  ['sRGB 蓝', 'srgb', [0, 0, 1], 'avg'], ['sRGB 蓝', 'srgb', [0, 0, 1], 'dim'],
  ['sRGB 蓝', 'srgb', [0, 0, 1], 'dark'], ['sRGB 蓝', 'srgb', [0, 0, 1], 'la4'],
  ['sRGB 18% 灰', 'srgb', [0.18, 0.18, 0.18], 'avg'], ['sRGB 18% 灰', 'srgb', [0.18, 0.18, 0.18], 'dim'],
  ['sRGB 18% 灰', 'srgb', [0.18, 0.18, 0.18], 'dark'], ['sRGB 18% 灰', 'srgb', [0.18, 0.18, 0.18], 'la4'],
  ['Rec.2020 红', 'r2020', [1, 0, 0], 'avg'], ['Rec.2020 红', 'r2020', [1, 0, 0], 'dim'],
  ['Rec.2020 红', 'r2020', [1, 0, 0], 'dark'], ['Rec.2020 红', 'r2020', [1, 0, 0], 'la4']
];
const CAM16_COND = {
  avg: { La: 64, Yb: 20, F: 1, c: 0.69, Nc: 1, Nc16: 1 },
  dim: { La: 64, Yb: 20, F: 0.9, c: 0.59, Nc: 0.95, Nc16: 0.9 },
  dark: { La: 64, Yb: 20, F: 0.8, c: 0.525, Nc: 0.8, Nc16: 0.8 },
  la4: { La: 4, Yb: 20, F: 1, c: 0.69, Nc: 1, Nc16: 1 }
};
/* 键按「矩阵|条件|RGB」索引，避免同条件多条时错配 */
const CAM16_GOLD_REF = new Map([
  ['srgb|[1,0,0]|avg', [46.29002, 147.66861, 113.53161, 103.24744, 83.61719, 27.40699]],
  ['srgb|[1,0,0]|dim', [51.74890, 182.53945, 108.59872, 98.76139, 73.55551, 27.48527]],
  ['srgb|[1,0,0]|dark', [55.63671, 212.63936, 100.73695, 91.61177, 65.63777, 27.56472]],
  ['srgb|[1,0,0]|la4', [46.02428, 83.61369, 112.39030, 81.12508, 98.50060, 27.39292]],
  ['srgb|[0,0,1]|avg', [25.26929, 109.10409, 86.58043, 78.73761, 84.95141, 282.86130]],
  ['srgb|[0,0,1]|dim', [30.84797, 140.93520, 87.24372, 79.34082, 75.03063, 282.67546]],
  ['srgb|[0,0,1]|dark', [35.11925, 168.94118, 83.95098, 76.34635, 67.22431, 282.49090]],
  ['srgb|[0,0,1]|la4', [25.06514, 61.70480, 86.37030, 62.34343, 100.51616, 282.75456]],
  ['srgb|[0.18,0.18,0.18]|avg', [39.18915, 135.87120, 1.08007, 0.98223, 8.50242, 209.59487]],
  ['srgb|[0.18,0.18,0.18]|dim', [44.88741, 170.00765, 1.99474, 1.81405, 10.32977, 209.52643]],
  ['srgb|[0.18,0.18,0.18]|dark', [49.02837, 199.61200, 2.71388, 2.46805, 11.11946, 209.45849]],
  ['srgb|[0.18,0.18,0.18]|la4', [38.92977, 76.89973, 1.92967, 1.39286, 13.45835, 209.53515]],
  ['r2020|[1,0,0]|avg', [53.17475, 158.26951, 180.74190, 164.36954, 101.90888, 23.79063]],
  ['r2020|[1,0,0]|dim', [58.25983, 193.68268, 171.43610, 155.90670, 89.71953, 23.84726]],
  ['r2020|[1,0,0]|dark', [61.82144, 224.14677, 158.24763, 143.91290, 80.12787, 23.90448]],
  ['r2020|[1,0,0]|la4', [52.91921, 89.65832, 179.37312, 129.47432, 120.17013, 23.74255]]
]);
for (const [name, mat, rgb, cond] of CAM16_GOLD) {
  const M = mat === 'srgb' ? SRGB : R2020;
  const xyz = mulv(M, rgb).map((v) => v * 100);
  const got = CM.cam16Forward(xyz, W, CAM16_COND[cond]);
  const want = CAM16_GOLD_REF.get(mat + '|' + JSON.stringify(rgb) + '|' + cond);
  const pick = [got.J, got.Q, got.C, got.M, got.s, got.h];
  const good = want && pick.every((v, i) => near(v, want[i], 1e-4));
  ok('CAM16 正向：' + name + ' / ' + cond, good,
    pick.map((v) => v.toFixed(4)).join(', ') + (want ? '' : '（缺参考值）'));
}

/* cam16ucs 必须就是 cam16Forward 的 [a′, J′, b′] */
for (const rgb of [[1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.18, 0.18, 0.18]]) {
  const xyz = mulv(SRGB, rgb).map((v) => v * 100);
  const f = CM.cam16Forward(xyz, W, AVG);
  const u = CM.cam16ucs(xyz, W, AVG);
  ok('cam16ucs = cam16Forward 的 UCS 三量：' + rgb.join(','),
    near(u[0], f.ap) && near(u[1], f.Jp) && near(u[2], f.bp),
    u.map((v) => v.toFixed(6)).join(','));
}

/* cam02Forward 与 cam02ucs 同样对齐 */
for (const rgb of [[1, 1, 1], [1, 0, 0], [0, 0, 1]]) {
  const xyz = mulv(SRGB, rgb).map((v) => v * 100);
  const f = CM.cam02Forward(xyz, W, AVG);
  const u = CM.cam02ucs(xyz, W, AVG);
  ok('cam02ucs = cam02Forward 的 UCS 三量：' + rgb.join(','),
    near(u[0], f.ap) && near(u[1], f.Jp) && near(u[2], f.bp),
    u.map((v) => v.toFixed(6)).join(','));
}

/* trace()：八个模型的逐步演算都要给出有限值，最后一行就是最终坐标 */
for (const slug of ['lab', 'luv', 'oklab', 'ipt', 'jzazbz', 'cam02', 'cam16', 'zcam']) {
  const rows = CM.trace(slug, [0.2, 0.15, 0.05], AVG);
  const finite = rows.every((r) => r.vals.every((v) => isFinite(v)));
  ok('trace(' + slug + ')：' + rows.length + ' 步，数值有限', finite && rows.length >= 4,
    JSON.stringify(rows));
}

/* ---------- 汇总 ---------- */

console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
