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

/* ---------- 汇总 ---------- */

console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
