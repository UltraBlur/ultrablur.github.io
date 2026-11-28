/* 色适应变换内核的自检：矩阵可逆、白点映射、D65→D50 对拍值、D 公式、CMCCAT2000 正向式、
   Zhai 2018 两步法（黄金向量 / 退化 / 往返对称）、锥体灵敏度负瓣、CIEDE2000 基准对。
   运行：node tests/cat.test.mjs
   对拍值由 numpy / colour-science 0.4.6 独立算出，只做数值核对，不进页面来源。 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const C = require(path.join(here, '..', 'assets/js/lib/cat.js'));
const locus = JSON.parse(fs.readFileSync(path.join(here, '..', 'data/spectralLocus.json'), 'utf8')).points;

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function near(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);
}
function nearVec(a, b, tol) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!near(a[i], b[i], tol)) return false;
  return true;
}

const SLUGS = C.CAT_LIST;
ok('有 10 个变换', SLUGS.length === 10, SLUGS.join(','));
ok('CAT_LIST 与 CATS 键一一对应',
  SLUGS.length === Object.keys(C.CATS).length && SLUGS.every((s) => C.CATS[s]),
  Object.keys(C.CATS).join(','));

/* 1. M · M⁻¹ = I */
for (const slug of SLUGS) {
  const M = C.CATS[slug];
  const Mi = C.inv3(M);
  const I = C.mul3(M, Mi);
  const want = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  ok('M·M⁻¹ = I：' + slug, nearVec(I, want, 1e-12), I.map((v) => v.toFixed(12)).join(' '));
}

/* 2. 白点必须映射到白点 */
const D65 = C.xyToXYZ(0.3127, 0.3290);
const D50 = C.xyToXYZ(0.3457, 0.3585);
for (const slug of SLUGS) {
  const out = C.adapt(D65, slug, 'D65', 'D50');
  ok('白点 D65→D50：' + slug, nearVec(out, D50, 1e-9), out ? out.map((v) => v.toFixed(12)).join(' ') : 'null');
}

/* 3. D65 → D50 的等效矩阵（对拍值，D = 1） */
const EXPECT = {
  'xyz-scaling': [1.014561168997, 0.000000000000, 0.000000000000,
    0.000000000000, 1.000000000000, 0.000000000000,
    0.000000000000, 0.000000000000, 0.757631633341],
  'von-kries': [1.016118563369, 0.055359712454, -0.052191857709,
    0.006080871766, 0.995556044415, -0.001226422590,
    0.000000000000, 0.000000000000, 0.757631633341],
  'bradford': [1.047929792545, 0.022946870602, -0.050192266289,
    0.029627808770, 0.990434426754, -0.017073799063,
    -0.009243040646, 0.015055191490, 0.751874281428],
  'sharp': [1.070105598031, -0.006129570219, -0.042847095610,
    0.042060949086, 0.976908502771, -0.015504761906,
    -0.007951670148, 0.007087570192, 0.758063329299],
  'cmccat2000': [1.040195449734, 0.024007596908, -0.044416240495,
    0.022338465152, 0.991001823669, -0.011233151103,
    -0.000774666942, -0.005603479480, 0.763452964911],
  'cat02': [1.042573892411, 0.030891075264, -0.052812565932,
    0.022193451065, 1.001856632807, -0.021073749209,
    -0.001164880053, -0.003420527483, 0.761789075524],
  'cat02-brill': [1.042783555406, 0.031506724947, -0.053560850510,
    0.022276168659, 1.002099522880, -0.021368967254,
    0.000000000000, 0.000000000000, 0.757631633341],
  'bianco-schettini': [1.046566002421, 0.019510781633, -0.045846939907,
    0.030098272585, 0.992619927028, -0.019491168936,
    0.001274120124, -0.003688784224, 0.759906801209],
  'bianco-pc': [1.014324260550, 0.021023535329, -0.019097577036,
    0.010645062667, 0.983517479046, 0.005844371471,
    0.006009578493, -0.019470304300, 0.770264999012],
  'cat16': [1.010854328938, 0.040708610324, -0.034144582501,
    0.005428142012, 0.993581926193, 0.001155920389,
    0.000250722468, -0.011491875891, 0.767964946912]
};
for (const slug of SLUGS) {
  const A = C.matrix(slug, 'D65', 'D50');
  ok('D65→D50 矩阵：' + slug, nearVec(A, EXPECT[slug], 1e-9),
    A ? A.map((v) => v.toFixed(12)).join(' ') : 'null');
}

/* 4. 逆变换回到原值 */
for (const slug of SLUGS) {
  const XYZ = [0.20654008, 0.12197225, 0.05136952];
  const fwd = C.adapt(XYZ, slug, 'D65', 'D50');
  const back = C.adapt(fwd, slug, 'D50', 'D65');
  ok('往返：' + slug, nearVec(back, XYZ, 1e-9));
}

/* 5. 适应度 D */
ok('CIECAM02 指数项 D_exp(20)', near(C.dExp(20), 0.8584138465593946, 1e-12), C.dExp(20));
ok('CIECAM02 指数项 D_exp(200)', near(C.dExp(200), 0.9799869081698208, 1e-12), C.dExp(200));
ok('CIECAM02 D(200, F=0.9)', near(C.dCIECAM02(200, 0.9), 0.9 * 0.9799869081698208, 1e-12));
ok('CIECAM02 D 截到 [0,1]', C.dCIECAM02(100000, 1) <= 1 && C.dCIECAM02(0, 1) >= 0);
ok('CMCCAT2000 D(200,200,F=1)', near(C.dCMCCAT2000(200, 200, 1), 0.9440823996531185, 1e-12),
  C.dCMCCAT2000(200, 200, 1));
ok('CMCCAT2000 D 不越界', C.dCMCCAT2000(1, 1, 1) >= 0 && C.dCMCCAT2000(100000, 100000, 1) <= 1);
ok('CMCCAT2000 D(0,0,F=1) === 0', C.dCMCCAT2000(0, 0, 1) === 0, C.dCMCCAT2000(0, 0, 1));

/* 6. CMCCAT2000 完整正向式（对拍 colour-science 文档示例） */
const cmc = C.cmccat2000XYZ(
  [22.48, 22.74, 8.54],
  [111.15, 100.00, 35.20],
  [94.81, 100.00, 107.30],
  200, 200
);
ok('CMCCAT2000 正向式',
  nearVec(cmc, [19.52698326, 23.0683396, 24.97175229], 1e-6),
  cmc ? cmc.map((v) => v.toFixed(8)).join(' ') : 'null');

/* 7. D = 0 时不作适应 */
const none = C.adapt([0.3, 0.4, 0.5], 'bradford', 'D65', 'D50', 0);
ok('D = 0 即恒等', nearVec(none, [0.3, 0.4, 0.5], 1e-12));

/* 8. Zhai & Luo (2018)：colour-science 文档黄金向量 */
const ZB = [48.900, 43.620, 6.250];
const ZWB = [109.850, 100.000, 35.585];
const ZWD = [95.047, 100.000, 108.883];
const zhai = C.zhai2018(ZB, ZWB, ZWD, 0.9407, 0.9800, 'cat02', [100, 100, 100]);
ok('Zhai 2018 黄金向量',
  nearVec(zhai, [39.18561644, 42.15461795, 19.23672031], 1e-6),
  zhai ? zhai.map((v) => v.toFixed(8)).join(' ') : 'null');

/* D_b = D_d = 1 时严格退化为单步完全适应（BI 精确消去） */
const zhaiFull = C.zhai2018(ZB, ZWB, ZWD, 1, 1, 'cat02', [100, 100, 100]);
const Mc = C.CATS['cat02'];
const McInv = C.inv3(Mc);
const rwb = C.mulv(Mc, ZWB);
const rwd = C.mulv(Mc, ZWD);
const rgb = C.mulv(Mc, ZB);
const refFull = C.mulv(McInv, [rgb[0] * rwd[0] / rwb[0], rgb[1] * rwd[1] / rwb[1], rgb[2] * rwd[2] / rwb[2]]);
ok('Zhai 2018 在 D=1 退化为完全适应',
  nearVec(zhaiFull, refFull, 1e-12),
  zhaiFull.map((v) => v.toFixed(12)).join(' '));

/* 双向不完全适应严格往返 */
const zhaiFwd = C.zhai2018(ZB, ZWB, ZWD, 0.72, 0.90, 'cat16', [100, 100, 100]);
const zhaiBack = C.zhai2018(zhaiFwd, ZWD, ZWB, 0.90, 0.72, 'cat16', [100, 100, 100]);
ok('Zhai 2018 双向不完全适应往返', nearVec(zhaiBack, ZB, 1e-12),
  zhaiBack.map((v) => v.toFixed(12)).join(' '));

/* 单步法在 D < 1 时不具备该对称性，两步法才具备 */
const single = C.adapt(ZB, 'cat16', 'A', 'D65', 0.72);
const singleBack = C.adapt(single, 'cat16', 'D65', 'A', 0.90);
ok('单步法 D<1 不保证往返（用于区分两步法）', !nearVec(singleBack, ZB, 1e-6));

/* 9. u'v' */
const uvD65 = C.xyzToUV(D65);
ok("D65 白点 u'v'", nearVec(uvD65, [0.197839778, 0.468336303], 1e-3),
  uvD65.map((v) => v.toFixed(9)).join(' '));

/* 10. 有效锥体光谱灵敏度：CAT02 在 470 nm 处 ρ < 0，HPE/CAT16/Bianco PC 无实质负瓣 */
const cones02 = C.coneSensitivities('cat02', locus, 1);
const at470 = cones02.points.find((p) => p.wl === 470);
ok('CAT02 在 470 nm 的 ρ 为负', at470 && at470.r < 0, at470 && at470.r.toFixed(6));
ok('CAT02 峰值波长', cones02.stats[0].peakWl === 591 && cones02.stats[1].peakWl === 542 && cones02.stats[2].peakWl === 446,
  cones02.stats.map((s) => s.peakWl).join(','));
const hpe = C.coneSensitivities('von-kries', locus, 1);
ok('HPE 全波段非负', hpe.points.every((p) => p.r >= -1e-9 && p.g >= -1e-9 && p.b >= -1e-9),
  Math.min(...hpe.points.map((p) => Math.min(p.r, p.g, p.b))));
const c16 = C.coneSensitivities('cat16', locus, 1);
ok('CAT16 全波段非负', c16.points.every((p) => p.r >= -1e-9 && p.g >= -1e-9 && p.b >= -1e-9),
  Math.min(...c16.points.map((p) => Math.min(p.r, p.g, p.b))));
const bpc = C.coneSensitivities('bianco-pc', locus, 1);
ok('Bianco PC 2010 负瓣被压到接近 0', bpc.stats.every((s) => s.min >= -1e-5),
  bpc.stats.map((s) => s.min.toFixed(6)).join(','));
const brad = C.coneSensitivities('bradford', locus, 1);
ok('Bradford 存在负瓣', brad.stats.some((s) => s.min < -0.01),
  brad.stats.map((s) => s.min.toFixed(4)).join(','));

/* 11. CIEDE2000：Sharma, Wu & Dalal (2005) 的 34 组基准对 */
const SHARMA = [
  [[50.0000, 2.6772, -79.7751], [50.0000, 0.0000, -82.7485], 2.0425],
  [[50.0000, 3.1571, -77.2803], [50.0000, 0.0000, -82.7485], 2.8615],
  [[50.0000, 2.8361, -74.0200], [50.0000, 0.0000, -82.7485], 3.4412],
  [[50.0000, -1.3802, -84.2814], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, -1.1848, -84.8006], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, -0.9009, -85.5211], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, 0.0000, 0.0000], [50.0000, -1.0000, 2.0000], 2.3669],
  [[50.0000, -1.0000, 2.0000], [50.0000, 0.0000, 0.0000], 2.3669],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0009], 7.1792],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0010], 7.1792],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0011], 7.2195],
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0012], 7.2195],
  [[50.0000, -0.0010, 2.4900], [50.0000, 0.0009, -2.4900], 4.8045],
  [[50.0000, -0.0010, 2.4900], [50.0000, 0.0010, -2.4900], 4.8045],
  [[50.0000, -0.0010, 2.4900], [50.0000, 0.0011, -2.4900], 4.7461],
  [[50.0000, 2.5000, 0.0000], [50.0000, 0.0000, -2.5000], 4.3065],
  [[50.0000, 2.5000, 0.0000], [73.0000, 25.0000, -18.0000], 27.1492],
  [[50.0000, 2.5000, 0.0000], [61.0000, -5.0000, 29.0000], 22.8977],
  [[50.0000, 2.5000, 0.0000], [56.0000, -27.0000, -3.0000], 31.9030],
  [[50.0000, 2.5000, 0.0000], [58.0000, 24.0000, 15.0000], 19.4535],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.1736, 0.5854], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.2972, 0.0000], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 1.8634, 0.5757], 1.0000],
  [[50.0000, 2.5000, 0.0000], [50.0000, 3.2592, 0.3350], 1.0000],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630],
  [[61.2901, 3.7196, -5.3901], [61.4292, 2.2480, -4.9620], 1.8731],
  [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
  [[22.7233, 20.0904, -46.6940], [23.0331, 14.9730, -42.5619], 2.0373],
  [[36.4612, 47.8580, 18.3852], [36.2715, 50.5065, 21.2231], 1.4146],
  [[90.8027, -2.0831, 1.4410], [91.1528, -1.6435, 0.0447], 1.4441],
  [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
  [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082]
];
let deBad = 0;
for (let i = 0; i < SHARMA.length; i++) {
  const [l1, l2, want] = SHARMA[i];
  const got = C.deltaE00(l1, l2);
  if (!near(got, want, 1e-4)) {
    deBad++;
    ok('CIEDE2000 第 ' + (i + 1) + ' 组', false, got.toFixed(4) + ' vs ' + want.toFixed(4));
  }
}
ok('CIEDE2000 · ' + SHARMA.length + ' 组 Sharma 基准', deBad === 0, deBad + ' 组失败');

/* 12. XYZ → Lab 的 D65 白点与 D50 白点都落在 L* = 100 */
ok('XYZ→Lab：D65 白点', nearVec(C.xyzToLab(D65, D65), [100, 0, 0], 1e-9));
ok('XYZ→Lab：缺省白点（D65）', nearVec(C.xyzToLab(D65), [100, 0, 0], 1e-9));
ok('XYZ→Lab：D50 白点', nearVec(C.xyzToLab(D50, D50), [100, 0, 0], 1e-9));

if (fails.length) {
  console.error('✗ ' + fails.length + ' 项失败 / ' + (pass + fails.length) + ' 项');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('✓ ' + pass + ' 项全部通过');
