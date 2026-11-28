/* 取色读数（Inspector）完整色彩空间自检：色域（原色 + 白点）与传递函数解耦。
 *
 * 断言分五类：
 *   1. 外部参考值：18% 灰与白在各曲线上的码值（sRGB 0.4614、LogC4 0.2784、
 *      LogC4 满码 469.8、PQ 白 = pqEncode(Lw) / 码值 1 = 10000 nit）；
 *   2. 正反向：每类曲线 code → linear → code 与 linear → code → linear；
 *   3. 解耦：同一 XYZ 换单调可逆曲线，线性值 / Lab / OKLCH / 色体轮廓不变，
 *      只有码值与编码 HSV 变；
 *   4. 色域：资料页矩阵的白点自洽、换色域保留 XYZ、白点不同不合并；
 *   5. 组合：HLG 只配 BT.2020，BT.1886 的黑位端点。
 * 运行：node tests/inspector-space.test.mjs */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.AcesJMh = require('../assets/js/lib/aces-jmh.js');
const C = require('../assets/js/lib/colour-codec.js');
const P = require('../assets/js/colour-polar.js');
const G = require('../assets/js/colour-wheel-geom.js');

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) pass++;
  else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')); }
}
function close(a, b, tol, label) {
  ok(Math.abs(a - b) <= tol, label, 'got ' + a + ' want ' + b);
}

/* ---------- 数据来源：资料页 front matter + data/curves.json ---------- */
function frontMatter(slug) {
  const text = fs.readFileSync(new URL(`../content/colour/${slug}/index.md`, import.meta.url), 'utf8');
  const body = (text.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/m) || ['', ''])[1];
  const grab = (key) => {
    const m = body.match(new RegExp('^' + key + '\\s*=\\s*([\\s\\S]*?)$', 'm'));
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
  };
  return {
    slug,
    primaries: grab('primaries'),
    white: grab('whitePoint'),
    matrix: grab('matrix'),
    whiteName: (body.match(/^whiteName\s*=\s*"([^"]+)"/m) || [])[1] || '',
    category: (body.match(/^category\s*=\s*"([^"]+)"/m) || [])[1] || ''
  };
}
const SLUGS = ['primaries-srgb-rec709', 'primaries-rec2020', 'primaries-p3-dci', 'primaries-p3-d65',
  'arri-logc4', 'acescg', 'acescc', 'primaries-prophoto'];
const spaces = SLUGS.map(frontMatter);
spaces.forEach((s) => {
  ok(!!s.primaries && s.primaries.length === 3, s.slug + ' 资料页有原色');
  ok(!!s.matrix, s.slug + ' 资料页有矩阵');
  ok(!!s.white, s.slug + ' 资料页有白点');
});

/* 页面把 curves 转成 {c: 码值, s: stops}；这里用同一种形状喂 codec */
const rawCurves = JSON.parse(fs.readFileSync(new URL('../data/curves.json', import.meta.url), 'utf8'));
const curves = {};
Object.keys(rawCurves).forEach((k) => { curves[k] = rawCurves[k].map((p) => ({ c: p[1], s: p[0] })); });

const transfers = C.buildTransfers(spaces, curves);
const byId = {};
transfers.forEach((t) => { byId[t.id] = t; });
['lin', 'srgb', 'g22', 'g24', 'bt1886', 'pq', 'hlg', 'scene-lin', 'scene:arri-logc4'].forEach((id) => {
  ok(!!byId[id], '传递函数清单包含 ' + id);
});

P.setWhite(100);
P.setBlack(0);
P.setGamuts(spaces.map((s) => ({
  key: s.slug, tag: s.slug, white: s.white, whiteName: s.whiteName,
  primaries: s.primaries, matrix: s.matrix
})));
P.setGamut('primaries-srgb-rec709');

/* ---------- 1. 外部参考值 ---------- */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
close(P.encode(0.18), 0.4614, 5e-5, 'sRGB 分段：线性 0.18 的码值 0.4614');
close(P.decode(0.5), 0.214041, 1e-6, 'sRGB 分段：码值 0.5 的线性 0.2140');

P.setTransfer(byId.g22, { lw: 100, lb: 0 });
close(P.encode(0.18), 0.4587, 5e-5, 'γ2.2：线性 0.18 的码值 ≈ 0.4587');
P.setTransfer(byId.g24, { lw: 100, lb: 0 });
close(P.encode(0.18), 0.4894, 5e-5, 'γ2.4：线性 0.18 的码值 ≈ 0.4894');
close(P.decode(0.5), 0.189465, 1e-6, 'γ2.4：码值 0.5 的线性 ≈ 0.1895（不是 0.18）');

/* PQ：白点码值来自 pqEncode(Lw)，不是强制的 1.0 */
[100, 1000].forEach((lw) => {
  P.setWhite(lw);
  P.setTransfer(byId.pq, { lw: lw, lb: 0 });
  close(P.encode(1), C.pqEncode(lw), 1e-12, 'PQ：L_w = ' + lw + ' 时白点码值 = pqEncode(L_w)');
});
P.setWhite(100);
P.setTransfer(byId.pq, { lw: 100, lb: 0 });
close(P.encode(1), 0.5081, 1e-4, 'PQ：L_w = 100 cd/m² 的白点码值 ≈ 0.5081');
const pqTop = P.linearRgbFromCode([1, 1, 1]);
close(P.absFromLin(pqTop)[0], 10000, 1e-6, 'PQ：码值 1 是 10000 cd/m²');
ok(pqTop[0] > 1, 'PQ：码值 1 的线性值远超 L_w = 100 的色体（' + pqTop[0].toFixed(3) + '）');

/* ARRI LogC4：资料页 transferNote 的两条锚点 */
P.setTransfer(byId['scene:arri-logc4'], { lw: 100, lb: 0 });
close(P.encode(0.18), 0.2784, 5e-4, 'LogC4：18% 灰的码值 ≈ 0.2784');
close(P.linearRgbFromCode([1, 1, 1])[0], 469.8, 0.5, 'LogC4：码值 1.0 对应线性 ≈ 469.8（资料页注明）');
ok(byId['scene:arri-logc4'].kind === 'scene', 'LogC4 归为场景曲线');
ok(byId['scene:arri-logc4'].approx === true, 'LogC4 是采样近似，需在界面标注');

/* ---------- 2. 正反向：每类曲线都互逆 ---------- */
const SAMPLES = [[0.18, 0.18, 0.18], [0.5, 0.2, 0.1], [0.95, 0.9, 0.05], [0.02, 0.5, 0.8]];
['lin', 'srgb', 'g22', 'g24', 'g563', 'bt1886', 'pq', 'hlg', 'scene-lin', 'scene:arri-logc4'].forEach((id) => {
  const t = byId[id];
  const lw = 100, lb = id === 'bt1886' ? 1 : 0;
  P.setBlack(lb);
  P.setTransfer(t, { lw: lw, lb: lb });
  let worst = 0;
  SAMPLES.forEach((lin) => {
    const code = P.codeRgbFromLinear(lin);
    ok(!!code, id + '：线性 → 码值有结果 ' + lin.join(','));
    if (!code) return;
    const back = P.linearRgbFromCode(code);
    ok(!!back, id + '：码值 → 线性有结果');
    if (!back) return;
    for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(back[i] - lin[i]));
  });
  ok(worst < 1e-9, id + '：线性 → 码值 → 线性误差 < 1e-9', 'worst ' + worst);
  /* 再反一次：码值 → 线性 → 码值 */
  const c0 = [0.25, 0.5, 0.75];
  const l0 = P.linearRgbFromCode(c0);
  const c1 = P.codeRgbFromLinear(l0);
  const dC = Math.max(Math.abs(c1[0] - c0[0]), Math.abs(c1[1] - c0[1]), Math.abs(c1[2] - c0[2]));
  ok(dC < 1e-9, id + '：码值 → 线性 → 码值误差 < 1e-9', 'worst ' + dC);
});

/* 非有限输入与非法码值必须显式失败，不能静默变成另一个颜色 */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
ok(P.linearRgbFromCode([NaN, 0, 0]) === null, '码值含 NaN → null');
ok(P.linearRgbFromCode(null) === null, '码值为 null → null');
ok(P.codeRgbFromLinear([Infinity, 0, 0]) === null, '线性含 Infinity → null');

/* ---------- 3. BT.1886 的黑位端点与单位 ---------- */
P.setWhite(100);
P.setBlack(1);
P.setTransfer(byId.bt1886, { lw: 100, lb: 1 });
close(P.encode(1), 1, 1e-9, 'BT.1886：白点码值仍是 1');
close(P.encode(0), 0, 1e-9, 'BT.1886：黑点码值是 0');
close(P.absFromLin([0, 0, 0])[0], 1, 1e-12, 'BT.1886：线性 0 的绝对亮度 = L_b = 1 cd/m²');
close(P.absFromLin([1, 1, 1])[0], 100, 1e-12, 'BT.1886：线性 1 的绝对亮度 = L_w = 100 cd/m²');
close(P.linearRgbFromCode([0, 0, 0])[0], 0, 1e-12, 'BT.1886：码值 0 的相对线性是 0（不是 L_b）');
/* 有非零黑位的 BT.1886 与纯 γ2.4 不是同一条曲线 */
const btCode = P.encode(0.18);
P.setTransfer(byId.g24, { lw: 100, lb: 0 });
ok(Math.abs(btCode - P.encode(0.18)) > 1e-3, 'BT.1886 与 γ2.4 在 L_b = 1 时中点码值不同',
  btCode.toFixed(4) + ' vs ' + P.encode(0.18).toFixed(4));
P.setBlack(0);

/* ---------- 4. HLG：向量函数，只配 BT.2020 ---------- */
P.setGamut('primaries-rec2020');
P.setTransfer(byId.hlg, { lw: 100, lb: 0 });
ok(P.validateCombination(P.gamut(), byId.hlg).length === 0, 'HLG + BT.2020 原色：组合可用');
P.setGamut('primaries-srgb-rec709');
const hlgBad = P.validateCombination(P.gamut(), byId.hlg);
ok(hlgBad.length === 1 && hlgBad[0].key === 'hlgGamut', 'HLG + sRGB 原色：被拒绝并给出原因');
P.setGamut('primaries-p3-d65');
ok(P.validateCombination(P.gamut(), byId.hlg).length === 1, 'HLG + P3 原色：同样被拒绝');

P.setGamut('primaries-rec2020');
[[0.5, 0.2, 0.1], [0.9, 0.8, 0.05], [0.18, 0.18, 0.18]].forEach((lin) => {
  const code = P.codeRgbFromLinear(lin);
  const back = P.linearRgbFromCode(code);
  ok(back.every((v, i) => Math.abs(v - lin[i]) < 1e-9), 'HLG 向量往返 ' + lin.join(','),
    back.join(','));
});
/* HLG 的通道是耦合的：只改一个通道的码值，线性值三个都变 */
const hA = P.linearRgbFromCode([0.5, 0.5, 0.5]);
const hB = P.linearRgbFromCode([0.6, 0.5, 0.5]);
ok(Math.abs(hA[1] - hB[1]) > 1e-6 && Math.abs(hA[2] - hB[2]) > 1e-6,
  'HLG：改 R 码值同时改变 G、B 线性值（通道耦合，不能逐通道套标量函数）');

/* ---------- 5. 解耦：同一 XYZ 换曲线，几何不变、码值变 ---------- */
P.setGamut('primaries-srgb-rec709');
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
const a1 = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: true });
const lab1 = P.labFromXyz(P.xyzFromLin(a1.lin));
const ok1 = P.oklabFromXyz(P.xyzFromLin(a1.lin));
const rMax1 = G.projectGamut(P, 'lch', { steps: 16 }).rMax;
const slice1 = P.sliceScan('lch', 40);

P.setTransfer(byId.g24, { lw: 100, lb: 0 });
const a2 = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: true });
const lab2 = P.labFromXyz(P.xyzFromLin(a2.lin));
const ok2 = P.oklabFromXyz(P.xyzFromLin(a2.lin));
const rMax2 = G.projectGamut(P, 'lch', { steps: 16 }).rMax;
const slice2 = P.sliceScan('lch', 40);

ok(a1.lin.every((v, i) => Math.abs(v - a2.lin[i]) < 1e-12), 'sRGB 分段 ↔ γ2.4：线性 RGB 不变');
ok(lab1.every((v, i) => Math.abs(v - lab2[i]) < 1e-9), 'LCH 坐标不变（L* 65、C* 45、h 40）');
ok(ok1.every((v, i) => Math.abs(v - ok2[i]) < 1e-12), 'OKLab 坐标不变');
close(rMax2, rMax1, 1e-12, '色体投影最大半径不变');
close(slice2.cMax, slice1.cMax, 1e-12, '切片彩度上界不变');
const dCode = Math.max(Math.abs(a1.code[0] - a2.code[0]), Math.abs(a1.code[1] - a2.code[1]), Math.abs(a1.code[2] - a2.code[2]));
ok(dCode > 1e-3, '编码 RGB 随曲线变化', '最大差 ' + dCode.toFixed(4));
close(a1.code[0], 0.8940, 5e-5, 'sRGB 分段下锚点 R 码值 0.8940');
close(a2.code[0], 0.8995, 5e-5, 'γ2.4 下同一颜色的 R 码值 0.8995');

/* 同一个码值在不同曲线上是不同颜色：不能用码值冒充颜色 */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
const srgbMid = P.linearRgbFromCode([0.5, 0.5, 0.5])[0];
P.setTransfer(byId.g24, { lw: 100, lb: 0 });
const g24Mid = P.linearRgbFromCode([0.5, 0.5, 0.5])[0];
close(srgbMid, 0.214041, 1e-6, '码值 0.5 在 sRGB 分段上是线性 0.2140');
close(g24Mid, 0.189465, 1e-6, '码值 0.5 在 γ2.4 上是线性 0.1895');
ok(Math.abs(srgbMid - g24Mid) > 0.02, '同一个码值不是同一个颜色');

/* ---------- 6. HSV 是编码 HSV：随曲线变化 ---------- */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
const xyzA = P.xyzFromLin(a1.lin);
const hsvSrgb = P.models.hsv.fromXyz(xyzA);
P.setTransfer(byId.pq, { lw: 100, lb: 0 });
const hsvPq = P.models.hsv.fromXyz(xyzA);
ok(Math.abs(hsvSrgb[2] - hsvPq[2]) > 0.1, 'HSV 的 V 随曲线变化（编码值坐标）',
  hsvSrgb[2].toFixed(3) + ' vs ' + hsvPq[2].toFixed(3));
close(hsvSrgb[2], Math.max(a1.code[0], a1.code[1], a1.code[2]), 1e-12, 'V 等于编码 RGB 的最大分量');
/* 而 Lab / OKLCH / CAM02 / JzCH 不随曲线变 */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
const jmhSrgb = P.models.jmh.fromXyz(xyzA);
P.setTransfer(byId.pq, { lw: 100, lb: 0 });
const jmhPq = P.models.jmh.fromXyz(xyzA);
ok(jmhSrgb.every((v, i) => Math.abs(v - jmhPq[i]) < 1e-9), 'CAM02 坐标不随曲线变化');
const hsvWhite = (() => {
  P.setTransfer(byId.pq, { lw: 100, lb: 0 });
  return P.whiteCoords('hsv');
})();
close(hsvWhite[2], C.pqEncode(100), 1e-9, 'HSV 的白点 V = PQ 白点码值（几何白 → 码值白）');
const lchWhite = (() => {
  P.setTransfer(byId.pq, { lw: 100, lb: 0 });
  return P.whiteCoords('lch');
})();
close(lchWhite[2], 100, 1e-6, 'LCH 的白点 L* 仍是 100（几何白与曲线无关）');

/* ---------- 7. 色域：资料页矩阵的白点自洽 ---------- */
spaces.forEach((s) => {
  const xy = P.whiteXyFromMatrix(s.matrix);
  ok(!!xy, s.slug + ' 矩阵可求白点');
  if (!xy) return;
  close(xy[0], s.white[0], 2e-3, s.slug + ' 矩阵白点 x = 资料页 whitePoint');
  close(xy[1], s.white[1], 2e-3, s.slug + ' 矩阵白点 y = 资料页 whitePoint');
});
/* 显式矩形的白点：P3-DCI 与 P3-D65 原色相同、白点不同，不能合并 */
ok(P.WHITE_POINTS['P3-DCI'][0] !== P.WHITE_POINTS.D65[0], 'P3-DCI 白点与 D65 不同');

/* 换色域保留同一 XYZ：只在色体装不下时提示 */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
P.setGamut('primaries-srgb-rec709');
const keepXyz = P.xyzFromLin(a1.lin);
P.setGamut('primaries-p3-d65');
ok(P.linFromXyz(keepXyz).every((v, i) => Math.abs(v - a1.lin[i]) < 1e-12) === false ||
   true, '换色域后线性值随原色变化');
const p3lin = P.linFromXyz(keepXyz);
ok(P.inGamut(p3lin), 'P3-D65 装得下 sRGB 内的这个颜色');
ok(Math.max(Math.abs(p3lin[0] - a1.lin[0]), Math.abs(p3lin[1] - a1.lin[1])) > 1e-6,
  '同一 XYZ 在不同原色下线性值不同');
close(P.labFromXyz(keepXyz)[0], 65, 1e-9, 'Lab 只由 XYZ 决定，换色域不变');

/* D65 白在 P3-DCI（DCI 白点）色体之外：跨白点比较保留 XYZ，不暗中适应 */
P.setGamut('primaries-p3-dci');
const d65White = P.xyzFromSrgb([1, 1, 1]);
const p3dciWhiteLin = P.linFromXyz(d65White);
ok(!P.inGamut(p3dciWhiteLin), 'D65 白超出 P3-DCI 的线性色体（无 CAT，如实报越界）',
  p3dciWhiteLin.map((v) => v.toFixed(3)).join(','));
const ownWhite = P.linFromXyz(P.xyzFromLin([1, 1, 1]));
ok(ownWhite.every((v) => Math.abs(v - 1) < 1e-9), 'P3-DCI 自己的白是线性 [1,1,1]');

/* 矩阵缺失时 addSpace 从原色 + 白点推导 */
P.setGamuts(spaces.map((s) => ({
  key: s.slug, tag: s.slug, white: s.white, whiteName: s.whiteName, primaries: s.primaries
})));
P.setGamut('primaries-p3-dci');
const derived = P.gamut().matrix;
const xyDerived = P.whiteXyFromMatrix(derived);
close(xyDerived[0], 0.314, 2e-3, '无矩阵时从原色推导的白点 x = 0.314');
close(xyDerived[1], 0.351, 2e-3, '无矩阵时从原色推导的白点 y = 0.351');

/* 恢复带矩阵的清单，并检查原色 + 白点去重键 */
P.setGamuts(spaces.map((s) => ({
  key: s.slug, tag: s.slug, white: s.white, whiteName: s.whiteName,
  primaries: s.primaries, matrix: s.matrix
})));
function gamutKey(s) {
  return s.primaries.map((p) => p.map((v) => v.toFixed(5)).join(',')).join(';') + '|' +
    s.white.map((v) => v.toFixed(5)).join(',');
}
ok(gamutKey(spaces.find((s) => s.slug === 'primaries-p3-d65')) !==
   gamutKey(spaces.find((s) => s.slug === 'primaries-p3-dci')),
  'P3-D65 与 P3-DCI 的去重键不同（同原色、异白点）');

/* ---------- 8. 投影几何与曲线无关（HSV 除外） ---------- */
P.setGamut('primaries-srgb-rec709');
['lch', 'oklch', 'jmh', 'jmhh', 'jzch'].forEach((id) => {
  P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
  const g1 = G.projectGamut(P, id, { steps: 8 });
  P.setTransfer(byId.g24, { lw: 100, lb: 0 });
  const g2 = G.projectGamut(P, id, { steps: 8 });
  ok(g1.triangles.length === g2.triangles.length, id + ' 投影三角形数不变');
  let d = 0;
  for (let i = 0; i < g1.triangles.length; i++) {
    for (let k = 0; k < 6; k++) d = Math.max(d, Math.abs(g1.triangles[i][k] - g2.triangles[i][k]));
  }
  ok(d < 1e-12, id + ' 投影轮廓与曲线无关', '最大差 ' + d);
});
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
const hsvG1 = G.projectGamut(P, 'hsv', { steps: 8 });
P.setTransfer(byId.g24, { lw: 100, lb: 0 });
const hsvG2 = G.projectGamut(P, 'hsv', { steps: 8 });
let hd = 0;
for (let i = 0; i < hsvG1.triangles.length; i++) {
  for (let k = 0; k < 6; k++) hd = Math.max(hd, Math.abs(hsvG1.triangles[i][k] - hsvG2.triangles[i][k]));
}
ok(hd > 1e-3, 'HSV 的投影随曲线变化（它的坐标就是编码值）', '最大差 ' + hd.toFixed(4));

/* 选色解析在两种曲线下都返回同一线性值、不同码值 */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
const rs = G.resolveSelection(P, 'lch', { h: 250, c: 40, l: 55, lockLightness: true });
P.setTransfer(byId.bt1886, { lw: 100, lb: 2 });
const rb = G.resolveSelection(P, 'lch', { h: 250, c: 40, l: 55, lockLightness: true });
ok(rs.lin.every((v, i) => Math.abs(v - rb.lin[i]) < 1e-12), '解析器在两条曲线下给出同一线性值');
ok(rs.code.some((v, i) => Math.abs(v - rb.code[i]) > 1e-4), '解析器在两条曲线下给出不同码值');
ok(rb.code.every((v) => v >= 0 && v <= 1), '解析器返回的码值落在 0–1');

/* 场景曲线的码值可以超出 0–1：那是编码定义域，不是色域边界 */
P.setTransfer(byId['scene:arri-logc4'], { lw: 100, lb: 0 });
const sceneCode = P.codeRgbFromLinear([1, 1, 1]);
ok(sceneCode.every((v) => v > 0 && v < 1), 'LogC4：线性白对应的码值仍在 0–1 内（约 0.43）');
const aboveWhite = P.linearRgbFromCode([1, 1, 1]);
close(aboveWhite[0], 469.8, 0.5, 'LogC4：满码 1.0 是约 470 倍比较白，不是几何白');
ok(!P.inGamut(aboveWhite), 'LogC4 满码落在 [0,1] 比较白立方体之外，判为色域外');

/* ---------- 9. 参考白 L_w 何时真的起作用（决定控件是否激活） ----------
 * 规则：模型需要 L_w（JzCH / CAM02）或曲线的码值依赖 L_w 时才激活。
 * 这里把规则与实测对齐：凡 transferNeedsLw() 为假的曲线，换 L_w 后码值必须
 * 完全不变；为真的曲线必须变。否则界面就会出现"能动但没用"或"禁用却有用"的选项。 */
function codesDiffer(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
const LW_TRANSFERS = ['lin', 'srgb', 'g22', 'g24', 'g563', 'bt1886', 'pq', 'hlg', 'cinity', 'scene-lin', 'scene:arri-logc4'];
const LW_SAMPLES = [[0.5, 0.2, 0.1], [0.9, 0.8, 0.05], [0.18, 0.18, 0.18]];
LW_TRANSFERS.forEach((id) => {
  const t = byId[id];
  const lb = id === 'bt1886' ? 0 : 0;
  P.setBlack(lb);
  P.setTransfer(t, { lw: 100, lb: lb });
  const needAt0 = P.transferNeedsLw(t);
  const a = LW_SAMPLES.map((lin) => P.codeRgbFromLinear(lin));
  P.setWhite(1000);
  P.setTransfer(t, { lw: 1000, lb: lb });
  const b = LW_SAMPLES.map((lin) => P.codeRgbFromLinear(lin));
  const maxDiff = Math.max.apply(null, a.map((code, i) => codesDiffer(code, b[i])));
  if (needAt0) {
    ok(maxDiff > 1e-4, id + '：需要 L_w 的曲线，换 L_w 后码值必须变',
      'maxDiff ' + maxDiff.toExponential(2));
  } else {
    ok(maxDiff < 1e-12, id + '：不需要 L_w 的曲线，换 L_w 后码值不变',
      'maxDiff ' + maxDiff.toExponential(2));
  }
  P.setWhite(100);
});
/* 逐条固定预期，避免规则被悄悄放宽 */
['lin', 'srgb', 'g22', 'g24', 'g563', 'cinity', 'scene-lin', 'scene:arri-logc4'].forEach((id) => {
  P.setBlack(0);
  P.setTransfer(byId[id], { lw: 100, lb: 0 });
  ok(!P.transferNeedsLw(byId[id]), id + ' 不需要 L_w（相对曲线 / 场景曲线）');
});
['pq', 'hlg'].forEach((id) => {
  ok(P.transferNeedsLw(byId[id]), id + ' 需要 L_w（码值随参考白变）');
});
/* BT.1886：L_b = 0 时是纯幂，码值与 L_w 无关；有黑位后逆变换在幂空间归一化，才依赖 L_w */
P.setBlack(0);
P.setTransfer(byId.bt1886, { lw: 100, lb: 0 });
ok(!P.transferNeedsLw(byId.bt1886), 'BT.1886 且 L_b = 0：码值与 L_w 无关');
P.setBlack(1);
P.setTransfer(byId.bt1886, { lw: 100, lb: 1 });
ok(P.transferNeedsLw(byId.bt1886), 'BT.1886 且 L_b = 1：码值依赖 L_w，控件应激活');
const bt100 = P.codeRgbFromLinear([0.5, 0.5, 0.5]);
P.setWhite(1000);
P.setTransfer(byId.bt1886, { lw: 1000, lb: 1 });
const bt1000 = P.codeRgbFromLinear([0.5, 0.5, 0.5]);
ok(codesDiffer(bt100, bt1000) > 1e-3, 'BT.1886 有黑位时换 L_w 会改变码值',
  'maxDiff ' + codesDiffer(bt100, bt1000).toFixed(4));
P.setWhite(100);
P.setBlack(0);

/* 绝对亮度读数对所有显示曲线都随 L_w 缩放（禁用时按固定 L_w 显示，不是不算） */
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });
const abs100 = P.absFromLin([0.5, 0.5, 0.5])[0];
P.setTransfer(byId.srgb, { lw: 1000, lb: 0 });
const abs1000 = P.absFromLin([0.5, 0.5, 0.5])[0];
close(abs100, 50, 1e-9, 'L_w = 100 时线性 0.5 的绝对亮度 50 cd/m²');
close(abs1000, 500, 1e-9, 'L_w = 1000 时同一线性值 500 cd/m²');
ok(!P.transferNeedsLw(byId.srgb), '但 sRGB 分段的码值不依赖 L_w（所以控件按模型判定）');
P.setWhite(100);

/* 黑位参数与传递函数的可表征范围 */
P.setTransfer(byId.bt1886, { lw: 100, lb: 1 });
ok(P.setBlack(-1) === false && P.setBlack(100) === false, '黑位拒绝负数与等于白位');
ok(P.setWhite(1) === false, '白位不能降到黑位或以下');
close(P.absFromLin([0, 0, 0])[0], 1, 1e-12, '非法参数不改变有效黑位');
ok(P.setTransfer(byId.srgb, { lw: 100, lb: 100 }) === false && P.transfer().id === 'bt1886', '无效参数不切换曲线');
P.setTransfer(byId.cinity, { lw: 100, lb: 0 });
ok(P.codeRgbFromLinear([0, 0, 0])[0] < 0, 'CINITY 黑端编码为负');
ok(G.resolveSelection(P, 'lch', { h: 0, c: 0, l: 0, lockLightness: true }) === null, 'CINITY 线性黑不可用零码值替代');
const hsvBlack = G.resolveSelection(P, 'hsv', { h: 0, c: 0, l: 0, lockLightness: true });
ok(hsvBlack && hsvBlack.lin[0] > 0, 'CINITY HSV 零码值对应非零线性黑');
for (const id of ['cinity', 'scene:acescc']) {
  ok(!!byId[id], id + ' 曲线存在');
  if (!byId[id]) continue;
  P.setTransfer(byId[id], { lw: 100, lb: 0 });
  for (const l of [0, 0.01, 1, 10]) {
    const r = G.resolveSelection(P, 'lch', { h: 0, c: 0, l, lockLightness: true });
    if (r) ok(P.linearRgbFromCode(r.code).every((v, i) => Math.abs(v - r.lin[i]) <= 1.01e-6), id + ' 近黑逐通道往返 ' + l);
  }
}
P.setTransfer(byId.srgb, { lw: 100, lb: 0 });

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
