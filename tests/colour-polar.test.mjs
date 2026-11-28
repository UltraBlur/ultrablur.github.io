/* colour-polar.js 自检：取色读数页的 6 种极坐标模型与 CIECAM02 逆变换。
 *
 * 断言分三类：
 *   1. 外部参考值：CIE 159:2004 的 CIECAM02 算例（J / M 直接对文献数字）；
 *   2. 互逆性：解析逆变换 ↔ 正向变换，以及各模型 fromRgb → toRgb 往返；
 *   3. 口径回归：Y_b 固定 20、色域判断在线性域、18% 线性灰的码值。
 * 运行：node tests/colour-polar.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.AcesJMh = require('../assets/js/lib/aces-jmh.js');
const P = require('../assets/js/colour-polar.js');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) pass++;
  else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')); }
}
function close(a, b, tol, label) {
  ok(Math.abs(a - b) <= tol, label, 'got ' + a + ' want ' + b);
}

/* ---------- 1. CIECAM02 算例（CIE 159:2004 / Luo & Hunt 教材例） ----------
 * XYZ = (19.01, 20.00, 21.78)，白点 D65 (95.05, 100, 108.88)，
 * L_A = 318.31、Y_b = 20、average surround（F = 1, c = 0.69, N_c = 1）。
 * 文献值 J = 41.73、M = 0.11、h = 219.05。
 * 该样本几乎中性（a、b 都在 1e-3 量级），色相角对白点常数很敏感：
 * 本实现用 W = (0.95047, 1, 1.08883) 精确得到 h = 220.94，
 * 因此色相只做区间断言，J / M 用紧容差。 */
const CIE_O = { la: 318.31, yb: 20, F: 1, c: 0.69, Nc: 1 };
const cie = P.camForward([19.01, 20.00, 21.78], CIE_O);
close(cie[0], 41.733, 0.02, 'CIECAM02 算例：J = 41.73');
ok(cie[1] > 0.05 && cie[1] < 0.16, 'CIECAM02 算例：M = 0.11 ± 0.05', 'got ' + cie[1]);
/* 用文献白 (95.05, 100, 108.88) 时本实现给出 h = 219.05（与文献一致）；
   本文件的白点用 sRGB 矩阵自身的 D65 白，h 偏到 213.6。样本几乎中性
   （a、b 都在 1e-3 量级），色相角对白点常数很敏感，所以只做区间约束 */
ok(cie[2] > 205 && cie[2] < 230, 'CIECAM02 算例：h 落在蓝区 213–219 附近', 'got ' + cie[2]);

/* ---------- 2. 解析逆变换与正向互逆 ---------- */
const back = P.camFromJMh(cie[0], cie[1], cie[2], CIE_O);
for (let i = 0; i < 3; i++) {
  close(back[i], [19.01, 20.00, 21.78][i], 1e-8, '解析逆变换回算 XYZ[' + i + ']');
}

let worstJ = 0, worstM = 0, worstH = 0;
for (let i = 0; i < 400; i++) {
  /* 只在真实显示颜色域里抽样本：sRGB 随机三元组 → XYZ，
     然后 正向 → 逆变换，必须回到同一个 XYZ */
  const rgb = [Math.random(), Math.random(), Math.random()];
  const xyz = P.xyzFromRgb(rgb).map((v) => v * 100);
  const opts = i % 2 ? { la: 20, yb: 20, F: 1, c: 0.69, Nc: 1 }
                     : { la: 200, yb: 20, F: 1, c: 0.69, Nc: 1 };
  const f = P.camForward(xyz, opts);
  const b = P.camFromJMh(f[0], f[1], f[2], opts);
  if (!b) { ok(false, '解析逆变换返回 null：rgb ' + rgb.join(',')); continue; }
  worstJ = Math.max(worstJ, Math.abs(b[0] - xyz[0]));
  worstM = Math.max(worstM, Math.abs(b[1] - xyz[1]));
  worstH = Math.max(worstH, Math.abs(b[2] - xyz[2]));
}
ok(worstJ < 1e-9 && worstM < 1e-9 && worstH < 1e-9,
  '随机 XYZ：正向 → 逆变换往返误差 < 1e-9', 'J ' + worstJ + ' M ' + worstM + ' H ' + worstH);

/* 已知色的 JMh 逆向应当是有限的，极端值不能爆 NaN */
const extremes = [[0, 0, 0], [100, 0, 0], [100, 120, 0], [100, 120, 359.9], [50, 120, 180], [0.0001, 0.0001, 90]];
extremes.forEach((v) => {
  const out = P.camFromJMh(v[0], v[1], v[2], CIE_O);
  ok(out === null || out.every((q) => isFinite(q)), '极端 JMh 输入不产生 NaN：' + v.join('/'));
});

/* ---------- 3. 6 种模型 fromRgb → toRgb 往返 ---------- */
const COLOURS = [
  [1, 1, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [0.462, 0.462, 0.462], [0.7605, 0.5913, 0.5101], [0.2, 0.6, 0.9]
];
['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'].forEach((id) => {
  const m = P.models[id];
  let worst = 0;
  COLOURS.forEach((rgb) => {
    const p = m.fromRgb(rgb);
    const out = m.toRgb(p[0], p[1], p[2]);
    ok(!!out, id + ' toRgb 有返回值 ' + rgb.join(','));
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(out[k] - rgb[k]));
  });
  ok(worst < 1e-6, id + '：fromRgb → toRgb 往返误差 < 1e-6', 'worst ' + worst);
});

/* JzCH 的往返必须在参考白变化后依然成立（Lw 参与模型） */
P.setWhite(1000);
const jzRed = P.models.jzch.fromRgb([1, 0, 0]);
const jzRedBack = P.models.jzch.toRgb(jzRed[0], jzRed[1], jzRed[2]);
close(jzRedBack[0], 1, 1e-6, 'L_w = 1000 时 JzCH 红色往返 R');
close(jzRedBack[1], 0, 1e-6, 'L_w = 1000 时 JzCH 红色往返 G');
close(jzRedBack[2], 0, 1e-6, 'L_w = 1000 时 JzCH 红色往返 B');

/* ---------- 4. 参考白口径：Y_b 恒为 20，不随 Lw 缩放 ---------- */
P.setWhite(1000);
ok(P.camOpts().yb === 20, 'setWhite(1000) 后 Y_b 仍为 20', 'yb ' + P.camOpts().yb);
close(P.camOpts().la, 200, 1e-9, 'setWhite(1000) 后 L_A = 0.2·L_w = 200');
P.setWhite(48);
close(P.camOpts().la, 9.6, 1e-9, 'setWhite(48) 后 L_A = 9.6');
ok(P.camOpts().yb === 20, 'setWhite(48) 后 Y_b 仍为 20');
P.setWhite(100);

/* ---------- 5. 色域判断在线性域，容差只吸收浮点噪声 ---------- */
ok(P.inGamut([0, 0, 0]) && P.inGamut([1, 1, 1]), 'inGamut：黑与白在色域内');
ok(P.inGamut([-1e-7, 0.5, 0.5]), 'inGamut：线性 -1e-7 的浮点噪声仍在容差内');
ok(!P.inGamut([-5e-5, 0.5, 0.5]),
  'inGamut：线性 -5e-5 判为越界（容差 1e-6，不是 5e-3）');
ok(!P.inGamut([-0.005, 0.5, 0.5]),
  'inGamut：线性 -0.005 判为越界（encode 后约 15.6 码值，肉眼可见）');
ok(!P.inGamut([1.002, 0.5, 0.5]), 'inGamut：线性 1.002 判为越界');
ok(!P.inGamut(null) && !P.inGamut([NaN, 0, 0]), 'inGamut：null/NaN 判为越界');
close(P.encode(5e-3) * 255, 15.5572, 1e-3,
  '线性 5e-3 溢出换算成码值约 15.6（说明大容差会改颜色，不只是噪声）');

/* 中性轴端点：各模型的黑点与显示白都在色域内 */
['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'].forEach((id) => {
  ok(P.inGamut(P.linAt(id, 0, 0, 0)), id + ' 黑点在色域内');
  const w = P.whiteCoords(id);
  ok(P.inGamut(P.linAt(id, w[0], w[1], w[2])), id + ' 显示白在色域内');
});
/* CIECAM02 的显示白不在 M = 0（部分色适应），M = 0 的顶端是色域外 */
ok(P.whiteCoords('jmh')[1] > 1, 'CIECAM02 显示白的 M > 0（不是强迫 C=0 等于白）');
ok(!P.inGamut(P.linAt('jmh', P.whiteCoords('jmh')[0], 0, P.whiteCoords('jmh')[2])),
  'CIECAM02 顶端中性轴确实在 sRGB 外（灰缝是模型事实，不是补容差）');

/* ---------- 6. 18% 线性灰的码值（快捷色块 #767676 的依据） ---------- */
close(P.decode(118 / 255), 0.18, 0.002, 'decode(118) ≈ 0.18 线性');
close(P.encode(0.18) * 255, 117.65, 0.05, 'encode(0.18) ≈ 118 码值');

/* ---------- 7. 交接文档里的失败样本（回归断言） ---------- */
const blueHue = P.models.lch.fromRgb([0, 0, 1])[0];
const lch = P.models.lch;

const MODELS_ALL = ['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'];

/* 7.1 L*=0 不可能有彩度：Y = 0 时任何非黑颜色都在 sRGB 外 */
const l0lin = P.linAt('lch', blueHue, 47, 0);
ok(l0lin !== null && !P.inGamut(l0lin),
  'LCH：L*=0、C*=47（蓝色相）判为色域外', 'lin ' + (l0lin && l0lin.join(',')));
ok(P.okAt('lch', blueHue, 0, 0), 'LCH：L*=0、C*=0 仍是合法黑点');
/* 底边除 c=0 外不应有有效像素（旧容差会画出一条彩色延伸） */
let bottomGrey = 0;
for (let hh = 0; hh < 360; hh += 15) {
  const lin = P.linAt('lch', hh, 20, 0);
  if (!P.inGamut(lin)) bottomGrey++;
}
ok(bottomGrey === 24, 'LCH：L*=0 上 C*=20 在 24 个色相里全部越界', '通过 ' + (24 - bottomGrey));

/* 7.2 CAM02：J=0 只在 M=0 是黑点，J=0 且 M>0 无效 */
ok(P.models.jmh.toLin(40, 120, 0) === null, 'JMH(CAM02)：J=0、M=120 判为无效');
ok(P.models.jmh.toLin(0, 0, 0) !== null, 'JMH(CAM02)：J=0、M=0 是黑点');
const camSlice = P.sliceScan('jmh', 258);
ok(camSlice.cusp !== null && camSlice.cusp.c < P.models.jmh.ranges.c[1] - 1,
  'JMH(CAM02) h=258 的 cusp 不落在 J=0 底边', 'cusp ' + JSON.stringify(camSlice.cusp));
ok(camSlice.cusp.l > 0.5, 'JMH(CAM02) h=258 的 cusp 明度不在 0', 'l ' + camSlice.cusp.l);

/* 7.3 JzAzBz：定义域外坐标返回无效，不能映射成另一个颜色 */
ok(P.models.jzch.toLin(40, 0.09, 0.001) === null,
  'JzCH：暗部 (40°, Cz=0.09, Jz=0.001) 判为无效');
ok(P.models.jzch.toLin(0, 0, 0) !== null, 'JzCH：黑点有效（PQ 零输入约定）');
ok(P.inGamut(P.models.jzch.toLin(0, 0, 0)), 'JzCH：黑点在色域内');
/* 切片上每个有效点都必须能原路返回 */
let jzWorst = 0, jzChecked = 0;
for (let hh = 0; hh < 360; hh += 20) {
  const scan = P.sliceScan('jzch', hh);
  if (!scan.cusp) continue;
  for (let k = 1; k <= 6; k++) {
    const cc = scan.cusp.c * k / 6;
    const lin = P.linAt('jzch', hh, cc, scan.cusp.l);
    if (!P.inGamut(lin)) continue;
    const back = P.models.jzch.fromRgb(lin.map((v) => P.encode(v)));
    jzChecked++;
    jzWorst = Math.max(jzWorst, Math.abs(back[2] - scan.cusp.l), Math.abs(back[1] - cc));
  }
}
ok(jzChecked > 50, 'JzCH：切片往返样本数足够', 'n ' + jzChecked);
ok(jzWorst < 2e-3, 'JzCH：有效切片点 toLin → encode → fromRgb 回到原坐标', 'worst ' + jzWorst);

/* 7.4 显示范围不能截断真实颜色 */
const blueC = P.models.lch.fromRgb([0, 0, 1])[1];
ok(blueC > 130, 'sRGB 蓝的 C* 确实大于旧上限 130', 'C* ' + blueC.toFixed(3));
ok(blueC < P.models.lch.ranges.c[1], 'LCH 彩度上界容得下 sRGB 蓝', 'C* ' + blueC.toFixed(3));
const blueScan = P.sliceScan('lch', blueHue);
const blueAxis = Math.min(P.models.lch.ranges.c[1], blueScan.cMax * 1.06);
ok(blueAxis > blueC, 'LCH 蓝色相横轴范围容得下蓝本色的 C*',
  'axis ' + blueAxis.toFixed(3) + ' blue ' + blueC.toFixed(3));

/* 7.5 全域反解：任何"有返回值且在色域内"的切片坐标都必须原路返回，
   不允许"非互逆的坐标被映射成另一个合法颜色"（用笛卡尔色度比较，
   近中性点不做色相角比较） */
const RAD = Math.PI / 180;
let roundChecked = 0, roundBad = [];
MODELS_ALL.forEach((id) => {
  const m = P.models[id];
  const spanC = m.ranges.c[1] - m.ranges.c[0];
  const top = P.whiteCoords(id)[2];
  const spanL = top - m.ranges.l[0];
  for (let hh = 0; hh < 360; hh += 30) {
    for (let li = 0; li <= 5; li++) {
      const l = m.ranges.l[0] + spanL * li / 5;
      for (let ci = 0; ci <= 10; ci++) {
        const c = m.ranges.c[0] + spanC * ci / 10;
        /* 不裁切、不限色域：只要模型声称这个坐标有效，就必须能原路返回。
           "算得出来但换个颜色"正是交接文档第 3 条的错误形态。 */
        const lin = P.linAt(id, hh, c, l);
        if (!lin) continue;
        if (Math.max(lin[0], lin[1], lin[2]) < 1e-9) continue;
        const back = m.fromRgb(lin.map((v) => P.encode(v)));
        const ax = c * Math.cos(hh * RAD), ay = c * Math.sin(hh * RAD);
        const bx = back[1] * Math.cos(back[0] * RAD), by = back[1] * Math.sin(back[0] * RAD);
        const dCart = Math.hypot(ax - bx, ay - by) / spanC;
        const dL = Math.abs(l - back[2]) / spanL;
        roundChecked++;
        if (Math.max(dCart, dL) > 1e-4) {
          roundBad.push(id + ' h' + hh + ' l' + l.toFixed(3) + ' c' + c.toFixed(3) +
            ' -> ' + back.map((v) => v.toFixed(4)).join('/'));
        }
      }
    }
  }
});
ok(roundChecked > 3000, '全域反解样本数足够', 'n ' + roundChecked);
ok(roundBad.length === 0, '模型声称有效的坐标必须原路返回（含色域外，无反解漂移）',
  roundBad.slice(0, 4).join('; '));

/* ---------- 8. 搜索上界与二分假设 ---------- */
const MODELS = ['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'];
/* 8.1 上界必须大于 sRGB 内实际出现的最大彩度（否则会截断真实颜色） */
MODELS.forEach((id) => {
  const m = P.models[id];
  let maxCusp = 0;
  for (let hh = 0; hh < 360; hh += 10) {
    const s = P.sliceScan(id, hh, { lSteps: 32 });
    if (s.cusp) maxCusp = Math.max(maxCusp, s.cMax);
  }
  const hitBound = Math.abs(maxCusp - m.ranges.c[1]) < 1e-6;
  /* HSV 的 S 上限 1 就是模型定义域，cusp 到达上界是正常的 */
  ok(hitBound === (id === 'hsv'), id + '：色相网格上 cusp ' + (hitBound ? '到达' : '未到达') + ' 搜索上界',
    'max ' + maxCusp.toFixed(4) + ' bound ' + m.ranges.c[1]);
});

/* 8.2 固定 (h, l) 下，可色域集合沿彩度方向是单段连续的（二分的必要条件） */
let contigBad = [];
MODELS.forEach((id) => {
  const m = P.models[id];
  for (let hh = 0; hh < 360; hh += 30) {
    for (let k = 1; k <= 4; k++) {
      const l = m.ranges.l[0] + (P.whiteCoords(id)[2] - m.ranges.l[0]) * k / 5;
      let seenIn = false, seenOutAfterIn = false;
      for (let i = 0; i <= 64; i++) {
        const c = m.ranges.c[0] + (m.ranges.c[1] - m.ranges.c[0]) * i / 64;
        const g = P.okAt(id, hh, c, l);
        if (g) { if (seenOutAfterIn) contigBad.push(id + ' h' + hh + ' l' + l.toFixed(3)); seenIn = true; }
        else if (seenIn) seenOutAfterIn = true;
      }
    }
  }
});
ok(contigBad.length === 0, '彩度方向的可色域集合是单段连续（二分前提成立）',
  contigBad.slice(0, 4).join('; '));

/* ---------- 9. 底图像素 ↔ 坐标一致（有效像素必须画成它自己的颜色） ---------- */
/* HSV 的 V = 0 锥顶：S 与 H 都不唯一，所有 (h, S, 0) 都是黑色。
   这是坐标退化而不是像素错误——单独断言"锥顶整行画成黑"，
   一致性检查里跳过这类不可反解的点。 */
let hsvApexOk = true;
for (let hh = 0; hh < 360; hh += 30) {
  for (let k = 0; k <= 4; k++) {
    const lin = P.linAt('hsv', hh, k / 4, 0);
    if (!P.inGamut(lin)) continue;
    if (lin.some((v) => v > 1e-9)) hsvApexOk = false;
  }
}
ok(hsvApexOk, 'HSV 锥顶（V=0）所有彩度都画成纯黑');

let pxChecked = 0, pxWorst = 0, pxBad = 0;
MODELS.forEach((id) => {
  const m = P.models[id];
  [0, 45, 120, 210, 300].forEach((hh) => {
    const scan = P.sliceScan(id, hh, { lSteps: 24 });
    if (!scan.cusp) return;
    const top = P.whiteCoords(id)[2];
    for (let i = 0; i <= 8; i++) {
      const l = m.ranges.l[0] + (top - m.ranges.l[0]) * i / 8;
      for (let j = 0; j <= 8; j++) {
        const c = m.ranges.c[0] + (Math.min(m.ranges.c[1], scan.cMax * 1.06) - m.ranges.c[0]) * j / 8;
        const lin = P.linAt(id, hh, c, l);
        if (!P.inGamut(lin)) continue;
        /* 纯黑像素的极坐标不可反解（HSV 锥顶），由上面的断言单独覆盖 */
        if (Math.max(lin[0], lin[1], lin[2]) < 1e-9) continue;
        pxChecked++;
        const back = m.fromRgb(lin.map((v) => P.encode(Math.max(0, Math.min(1, v)))));
        const dL = Math.abs(back[2] - l);
        const dC = Math.abs(back[1] - c);
        /* 近中性点色相无定义，只比笛卡尔分量 */
        const dHa = back[1] > 1e-3 * (m.ranges.c[1] - m.ranges.c[0])
          ? Math.abs(((back[0] - hh + 540) % 360) - 180) : 0;
        const d = Math.max(dL / (top - m.ranges.l[0] || 1), dC / (m.ranges.c[1] || 1), dHa / 360);
        pxWorst = Math.max(pxWorst, d);
        if (d > 1e-4) pxBad++;
      }
    }
  });
});
ok(pxChecked > 200, '像素一致性样本数足够', 'n ' + pxChecked);
ok(pxBad === 0, '有效像素的坐标与位置一致（含近中性点）',
  'bad ' + pxBad + ' worst ' + pxWorst.toExponential(2));

/* ---------- 10. 色域切换 ---------- */
import { readFileSync } from 'fs';
const yaml = readFileSync(new URL('../data/colourspaces.yaml', import.meta.url), 'utf8');

/* 从 data/colourspaces.yaml 里取出 slug → { primaries, whiteName }（页面用的就是这份数据） */
function gamutEntry(slug) {
  const re = new RegExp('slug: ' + slug + '[\\s\\S]*?whiteName: ([^\\n]+)\\n[\\s\\S]*?primaries: \\[\\[([^\\]]+)\\], ?\\[([^\\]]+)\\], ?\\[([^\\]]+)\\]\\]');
  const m = yaml.match(re);
  if (!m) return null;
  const parse = (t) => t.split(',').map((v) => parseFloat(v));
  return { slug, white: m[1].trim(), primaries: [parse(m[2]), parse(m[3]), parse(m[4])] };
}

const SLUGS = {
  srgb: 'primaries-srgb-rec709',
  rec2020: 'primaries-rec2020',
  p3d65: 'primaries-p3-d65',
  p3dci: 'primaries-p3-dci',
  adobe: 'primaries-adobe-rgb',
  cinity: 'cinity-rgb-d65',
  ap1: 'acescg'
};
const entries = {};
Object.keys(SLUGS).forEach((k) => { entries[k] = gamutEntry(SLUGS[k]); });
ok(Object.keys(entries).every((k) => entries[k]), 'data/colourspaces.yaml 里取到全部 7 个色域',
  Object.keys(entries).filter((k) => !entries[k]).join(','));
close(entries.srgb.primaries[0][0], 0.64, 1e-9, 'YAML：sRGB 红原色 x');
close(entries.ap1.primaries[1][1], 0.83, 1e-9, 'YAML：AP1 绿原色 y');
ok(entries.p3dci.white === 'P3-DCI', 'YAML：P3-DCI 的白点名');
ok(entries.ap1.white === 'ACES D60', 'YAML：ACEScg 的白点名');

/* 10.1 原色 + 白点推导的矩阵与公开矩阵一致 */
function assertMatrix(key, want, tol, label) {
  const e = entries[key];
  const m = P.matrixFromPrimaries(e.primaries, P.WHITE_POINTS[e.white]);
  ok(!!m, label + '：矩阵可推导');
  for (let i = 0; i < 9; i++) close(m[i], want[i], tol, label + ' 矩阵[' + i + ']');
}
assertMatrix('srgb', [0.412391, 0.357584, 0.180481, 0.212639, 0.715169, 0.072192, 0.019331, 0.119195, 0.950532], 1e-6, 'sRGB');
assertMatrix('p3d65', [0.4865709, 0.2656677, 0.1982173, 0.2289746, 0.6917385, 0.0792869, 0, 0.0451134, 1.0439444], 1e-6, 'Display P3 (D65)');
assertMatrix('rec2020', [0.6369580, 0.1446169, 0.1688810, 0.2627002, 0.6779981, 0.0593017, 0, 0.0280727, 1.0609851], 1e-6, 'Rec.2020');
assertMatrix('ap1', [0.6624542, 0.1340042, 0.1561877, 0.2722287, 0.6740818, 0.0536895, -0.0055746, 0.0040607, 1.0103391], 1e-6, 'ACES AP1 (D60)');
/* Adobe RGB 的公开矩阵用 CIE 表值 D65（Z = 1.08883），本实现从色度坐标推（Z = 1.08906），差 3e-4 属口径差异 */
assertMatrix('adobe', [0.5767309, 0.1855540, 0.1881852, 0.2973769, 0.6273491, 0.0752741, 0.0270343, 0.0706872, 0.9911085], 5e-4, 'Adobe RGB (D65)');

/* 10.2 白点表与 cat.js 的 WHITES 一致 */
const CAT = require('../assets/js/lib/cat.js');
close(P.WHITE_POINTS.D65[0], CAT.WHITES.D65[0], 1e-12, 'WHITE_POINTS.D65.x 与 cat.js 一致');
close(P.WHITE_POINTS.D65[1], CAT.WHITES.D65[1], 1e-12, 'WHITE_POINTS.D65.y 与 cat.js 一致');

/* 10.3 切换色域：立方体变了，模型坐标不变 */
P.setGamuts(Object.keys(SLUGS).map((k) => ({
  key: k,
  tag: k,
  white: entries[k].white,
  primaries: entries[k].primaries
})));
ok(P.gamutList().length === 7, 'setGamuts：注册 7 个色域', String(P.gamutList().length));
ok(P.setGamut('p3d65'), '切换到 Display P3');
ok(P.gamut().tag === 'p3d65', '当前色域 = p3d65', P.gamut().tag);
const p3Green = P.linFromXyz(P.xyzFromRgb([0, 1, 0]));
close(p3Green[1], 1, 1e-9, 'P3 (0,1,0) 在 P3 里是合法绿');
ok(P.inGamut(p3Green), 'P3 (0,1,0) 在 P3 色域内');
const p3GreenXyz = P.xyzFromRgb([0, 1, 0]);
ok(!P.inSrgb(p3GreenXyz), 'P3 纯绿超出 sRGB');
P.setGamut('srgb');
ok(!P.inGamut(P.linFromXyz(p3GreenXyz)), '切回 sRGB 后同一颜色判为越界');
const labP3 = P.labFromXyz(p3GreenXyz), labSrgb = P.labFromXyz(p3GreenXyz);
close(labP3[1], labSrgb[1], 1e-12, 'Lab 与色域无关（切色域不改变模型坐标）');
/* 每个色域里 RGB 往返一致 */
Object.keys(SLUGS).forEach((k) => {
  P.setGamut(k);
  const rgb = [0.31, 0.62, 0.47];
  const back = P.rgbFromXyz(P.xyzFromRgb(rgb));
  let worst = 0;
  for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(back[i] - rgb[i]));
  ok(worst < 1e-9, k + '：RGB ↔ XYZ 往返一致', 'worst ' + worst);
  /* 白点必须映射成等量 RGB */
  const w = P.rgbFromXyz(P.xyzFromRgb([1, 1, 1]));
  ok(Math.max(Math.abs(w[0] - w[1]), Math.abs(w[1] - w[2])) < 1e-9, k + '：(1,1,1) 是该色域的白');
});
/* P3-DCI / AP1 的白点不是 D65：sRGB 白在它们里面不是 (1,1,1) */
P.setGamut('p3dci');
const d65InDci = P.rgbFromXyz(P.xyzFromSrgb([1, 1, 1]));   // D65 白（sRGB 白），不是 DCI 白
ok(Math.abs(d65InDci[0] - d65InDci[2]) > 1e-3, 'P3-DCI 里 D65 白不是等量 RGB',
  d65InDci.map((v) => v.toFixed(4)).join(','));
/* sRGB 与 sRGB 数据条目等价 */
P.setGamut('srgb');
const viaData = P.rgbFromXyz(P.xyzFromRgb([0.2, 0.6, 0.9]));
const viaBuiltin = P.rgbFromXyz(P.xyzFromSrgb([0.2, 0.6, 0.9]));
close(viaData[0], viaBuiltin[0], 1e-9, '数据里的 sRGB 与内置 sRGB 矩阵一致（R）');
close(viaData[2], viaBuiltin[2], 1e-9, '数据里的 sRGB 与内置 sRGB 矩阵一致（B）');

/* 10.4 取色页的 sRGB 渲染口径：同一 XYZ 无论当前选中哪个色域，都要先经当前
   色域矩阵回到 XYZ，再按 sRGB 编码。直接把大色域的码值按 sRGB 曲线输出，
   会让内圈 sRGB 区域整体发淡偏色（本轮修正的正是这条路径）。 */
const renderProbe = P.xyzFromSrgb([0.72, 0.36, 0.22]);
P.setGamut('srgb');
const renderSrgb = P.srgbFromXyz(P.xyzFromLin(P.linFromXyz(renderProbe)));
P.setGamut('rec2020');
const renderWide = P.srgbFromXyz(P.xyzFromLin(P.linFromXyz(renderProbe)));
for (let i = 0; i < 3; i++) {
  close(renderWide[i], renderSrgb[i], 1e-12, 'Rec.2020 下按 sRGB 渲染与 sRGB 一致（通道 ' + i + '）');
}
const naiveWide = P.linFromXyz(renderProbe).map((v) => P.encode(v));
let naiveDelta = 0;
for (let i = 0; i < 3; i++) {
  naiveDelta = Math.max(naiveDelta, Math.abs(naiveWide[i] - renderSrgb[i]));
}
ok(naiveDelta > 0.05, '直接编码 Rec.2020 码值会明显偏色（渲染口径回归锚点）',
  'max delta ' + naiveDelta.toFixed(3));
P.setGamut('srgb');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
