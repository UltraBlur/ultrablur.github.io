/* 多基色（自定义原色）色体几何自检。
   口径：n 个基色向量 g_k = Y_k·(x_k/y_k, 1, z_k/y_k) 张成 3D zonotope；
   Y 由「Σ Y_k·u_k = W」解出（n=3 唯一解 = NPM，n>3 取最小范数解）。
   运行：node tests/volume-multi.test.mjs */
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
function near(a, b, tol = 1e-9) { return Math.abs(a - b) <= tol; }

const SRGB_M = [[0.412390799266, 0.357584339384, 0.180480788402],
                [0.212639005872, 0.715168678768, 0.072192315361],
                [0.019330818716, 0.119194779795, 0.950532152250]];
const D65 = [0.3127, 0.329];
const opts = { models: Models, lum: 100, cond: { surround: 'average', bg: 0.2, laFactor: 0.2 }, jmh: JMh };

/* 焊接同位置顶点后统计边界边 / 非流形边 */
function weldStats(mesh) {
  const pos = mesh.pos, idx = mesh.idx;
  const ids = new Map();
  const idOf = new Array(pos.length / 3);
  for (let i = 0; i < idOf.length; i++) {
    const key = pos[i * 3] + ',' + pos[i * 3 + 1] + ',' + pos[i * 3 + 2];
    if (!ids.has(key)) ids.set(key, ids.size);
    idOf[i] = ids.get(key);
  }
  const edges = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idOf[idx[t]], b = idOf[idx[t + 1]], c = idOf[idx[t + 2]];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = p < q ? p + '_' + q : q + '_' + p;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let boundary = 0, nonManifold = 0;
  for (const n of edges.values()) {
    if (n === 1) boundary++;
    else if (n > 2) nonManifold++;
  }
  return { boundary, nonManifold, vertices: ids.size };
}

/* ---------- 1. n=3 退化：必须复现标准 sRGB 矩阵 ---------- */
const srgbEntry = {
  slug: 'custom-srgb', title: 'sRGB',
  primaries: [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]],
  white: D65
};
const srgbSpace = Geom.makeMultiSpace(srgbEntry, null, JMh);
ok('三基色：解得 3 个亮度权重', srgbSpace.weights.length === 3, String(srgbSpace.weights.length));
ok('三基色：亮度权重 = sRGB 标准值（1e-9）',
  near(srgbSpace.weights[0], 0.212639005872, 1e-9) &&
  near(srgbSpace.weights[1], 0.715168678768, 1e-9) &&
  near(srgbSpace.weights[2], 0.072192315361, 1e-9),
  srgbSpace.weights.map((v) => v.toFixed(9)).join(', '));
let matWorst = 0;
for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
  matWorst = Math.max(matWorst, Math.abs(srgbSpace.gens[k][r] - SRGB_M[r][k]));
}
ok('三基色：矩阵逐项 = sRGB 标准矩阵（1e-9）', matWorst < 1e-9, matWorst.toExponential(2));
ok('三基色：白点残差 ≈ 0', srgbSpace.whiteError < 1e-9, srgbSpace.whiteError.toExponential(2));

/* ---------- 2. 面片数 / 顶点数 ---------- */
for (const n of [3, 4, 6, 7]) {
  const primaries = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    primaries.push([0.31 + 0.28 * Math.cos(a), 0.33 + 0.26 * Math.sin(a)]);
  }
  const entry = { primaries, white: D65 };
  const space = Geom.makeMultiSpace(entry, null, JMh);
  const faces = Geom.multiFaces(space.gens);
  ok(`n=${n} 面片数 = 2·C(n,2)`, faces.length === n * (n - 1), String(faces.length));
  const mesh1 = Geom.buildMultiSurface(space, 'xyz', 1, opts);
  ok(`n=${n} 顶点数 = n²−n+2`, mesh1.verts === n * n - n + 2, `${mesh1.verts} vs ${n * n - n + 2}`);
}

/* ---------- 3. 封闭性（细分后仍严格封闭） ---------- */
for (const n of [3, 4, 6, 7]) {
  const primaries = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    primaries.push([0.30 + 0.26 * Math.cos(a), 0.34 + 0.24 * Math.sin(a)]);
  }
  const space = Geom.makeMultiSpace({ primaries, white: D65 }, null, JMh);
  for (const coord of ['xyz', 'lab', 'xyy']) {
    const mesh = Geom.buildMultiSurface(space, coord, 4, opts);
    const w = weldStats(mesh);
    ok(`n=${n}/${coord} 封闭：没有边界边`, w.boundary === 0, 'boundary=' + w.boundary);
    ok(`n=${n}/${coord} 没有非流形边`, w.nonManifold === 0, 'nonManifold=' + w.nonManifold);
    ok(`n=${n}/${coord} 没有解不出的顶点`, mesh.missing === 0, 'missing=' + mesh.missing);
    let finite = true;
    for (let i = 0; i < mesh.pos.length; i++) if (!isFinite(mesh.pos[i])) { finite = false; break; }
    ok(`n=${n}/${coord} 顶点全是有限值`, finite);
  }
}

/* ---------- 4. 白点必须落在体积内部（是各基色满值的和） ---------- */
const n4 = Geom.makeMultiSpace({
  primaries: [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06], [0.68, 0.32]],
  white: D65
}, null, JMh);
const sum = [0, 0, 0];
for (const g of n4.gens) { sum[0] += g[0]; sum[1] += g[1]; sum[2] += g[2]; }
ok('白点 = Σ 基色向量（体积内部）',
  near(sum[0], n4.white[0], 1e-9) && near(sum[1], n4.white[1], 1e-9) && near(sum[2], n4.white[2], 1e-9),
  sum.map((v) => v.toFixed(6)).join(', '));
ok('四基色：权重非负', n4.weightOk && !n4.negativeWeights,
  n4.weights.map((v) => v.toFixed(4)).join(', '));

/* ---------- 5. 白点不可达时必须报负权重 ---------- */
const bad = Geom.makeMultiSpace({
  primaries: [[0.64, 0.33], [0.68, 0.32], [0.60, 0.35]],
  white: D65
}, null, JMh);
ok('白点在原色锥外 → 标记负权重', bad.negativeWeights === true && bad.weightOk === false,
  bad.weights.map((v) => v.toFixed(3)).join(', '));

/* ---------- 5b. 非负解：RGB+CMY 六基色在 D50 下应存在非负解 ---------- */
const six = Geom.makeMultiSpace({
  primaries: [[0.708, 0.292], [0.170, 0.797], [0.131, 0.046], [0.068, 0.351], [0.321, 0.154], [0.390, 0.590]],
  white: [0.3457, 0.3585]
}, null, JMh);
ok('六基色 D50：权重全非负', six.weights.length === 6 && six.weights.every((v) => v >= -1e-9),
  six.weights.map((v) => v.toFixed(3)).join(', '));
ok('六基色 D50：白点残差 ≈ 0', six.whiteError < 1e-9, six.whiteError.toExponential(2));
ok('六基色 D50：不误报负权重', six.negativeWeights === false, String(six.negativeWeights));

/* ---------- 6. 退化基色（权重≈0）不破坏封闭性 ---------- */
const degen = Geom.makeMultiSpace({
  primaries: [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]],
  white: D65,
  weights: [0.212639, 0.715169, 0.072192]
}, null, JMh);
const dmesh = Geom.buildMultiSurface(degen, 'xyz', 3, opts);
const dw = weldStats(dmesh);
ok('显式权重也能建出封闭曲面', dw.boundary === 0 && dw.nonManifold === 0,
  `boundary=${dw.boundary} nonManifold=${dw.nonManifold}`);

/* ---------- 7. 网格线非空 ---------- */
const grid = Geom.buildMultiGrid(n4, 'lab', 4, opts);
ok('多基色网格线非空', grid.pos.length > 0 && grid.pos.length % 6 === 0, String(grid.pos.length));

/* ---------- 8. 原色表解析 ---------- */
const parsed = Geom.parsePrimaries('R 0.708 0.292\nG 0.170 0.797\n# 注释行\nB 0.131 0.046\nbad 0.9 0.9');
ok('解析：3 个合法基色', parsed.primaries.length === 3, String(parsed.primaries.length));
ok('解析：非法行被记录', parsed.bad.length === 1, parsed.bad.join('|'));
ok('解析：Rec.2020 红 x+y=1 合法', near(parsed.primaries[0][0], 0.708, 1e-12) && near(parsed.primaries[0][1], 0.292, 1e-12),
  parsed.primaries[0].join(','));
const parsed2 = Geom.parsePrimaries('0.64, 0.33\n0.30 0.60\n0.15 0.06');
ok('解析：无名称 / 逗号分隔也算合法', parsed2.primaries.length === 3 && parsed2.bad.length === 0,
  JSON.stringify(parsed2));

/* ---------- 9. URL 编解码 ---------- */
const enc = Geom.encodeMulti({ primaries: [[0.68, 0.32], [0.21, 0.71], [0.15, 0.06]], white: [0.3127, 0.329], weights: null });
const dec = Geom.decodeMulti(enc);
ok('编解码：往返一致',
  dec && dec.primaries.length === 3 &&
  near(dec.primaries[0][0], 0.68, 1e-4) && near(dec.primaries[0][1], 0.32, 1e-4) &&
  near(dec.white[0], 0.3127, 1e-4) && near(dec.white[1], 0.329, 1e-4),
  enc);
ok('编解码：分隔符不会被 URLSearchParams 转义',
  encodeURIComponent(enc) === enc.replace(/,/g, '%2C'),
  encodeURIComponent(enc).slice(0, 40));
const encW = Geom.encodeMulti({ primaries: [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]], white: [0.3127, 0.329], weights: [0.2126, 0.7152, 0.0722] });
const decW = Geom.decodeMulti(encW);
ok('编解码：带权重往返', decW && decW.weights && decW.weights.length === 3 && near(decW.weights[1], 0.7152, 1e-4), encW);
ok('编解码：坏串返回 null', Geom.decodeMulti('x') === null && Geom.decodeMulti('0.1,0.2_0.3,0.4') === null,
  String(Geom.decodeMulti('x')));
ok('编解码：负数权重可往返（白点不可达的情形）',
  (() => { const d = Geom.decodeMulti(Geom.encodeMulti({ primaries: [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]], white: [0.3127, 0.329], weights: [-0.03, 1.01, 0.01] })); return d && near(d.weights[0], -0.03, 1e-4); })());

/* ---------- 10. 退化输入：重复/共线基色、白点不可达 ---------- */
const dup = Geom.makeMultiSpace({
  primaries: [[0.64, 0.33], [0.64, 0.33], [0.30, 0.60], [0.15, 0.06]],
  white: D65
}, null, JMh);
ok('重复基色：被合并成一组', dup.mergedGroups.length === 1 && dup.gens.length === 3,
  `gens=${dup.gens.length} merged=${JSON.stringify(dup.mergedGroups)}`);
const dupMesh = Geom.buildMultiSurface(dup, 'xyz', 6, opts);
const dupW = weldStats(dupMesh);
ok('重复基色：曲面仍封闭（没有边界边）', dupW.boundary === 0, 'boundary=' + dupW.boundary);
ok('重复基色：面片数按合并后计', dupMesh.faces === 6, String(dupMesh.faces));

const colin = Geom.makeMultiSpace({
  primaries: [[0.17, 0.797], [0.30, 0.60], [0.45, 0.40], [0.131, 0.046]],
  white: D65
}, null, JMh);
for (const coord of ['xyz', 'xyy', 'lab']) {
  const m = Geom.buildMultiSurface(colin, coord, 6, opts);
  const w = weldStats(m);
  ok(`近共线基色/${coord}：没有边界边`, w.boundary === 0, 'boundary=' + w.boundary);
  ok(`近共线基色/${coord}：没有缺失顶点`, m.missing === 0, 'missing=' + m.missing);
}

/* 白点不可达（权重为负）时，xyY 会出现负 XYZ；应当兜底而不是留洞 */
const unreach = Geom.makeMultiSpace({
  primaries: [[0.31, 0.33], [0.1168, 0.3022], [0.4888, 0.2396]],
  white: D65
}, null, JMh);
ok('白点不可达：被标记', unreach.negativeWeights === true, stringifyWeights(unreach.weights));
const unMesh = Geom.buildMultiSurface(unreach, 'xyy', 6, opts);
const unW = weldStats(unMesh);
ok('白点不可达/xyY：兜底后没有边界边', unW.boundary === 0, 'boundary=' + unW.boundary);
ok('白点不可达/xyY：没有缺失顶点', unMesh.missing === 0, 'missing=' + unMesh.missing);

function stringifyWeights(w) { return (w || []).map((v) => v.toFixed(4)).join(', '); }

/* ---------- 11. 固定一个基色的 Y，其余按白点解 ---------- */
const SRGB_P = [[0.640, 0.330], [0.300, 0.600], [0.150, 0.060]];
const SRGB_W = SRGB_P.concat([[0.3127, 0.3290]]);   /* 理想 RGB + W：W 的色度就是白点 */

/* 三个基色时没有自由度：可行集退化成一个点（测度为零），采样找不到 → 返回 null，
   界面也只在 4 基色以上才给这个控件。唯一的那个点仍然解得出来。 */
const rgbOnly = Geom.makeMultiSpace({ primaries: SRGB_P, white: D65 }, null, JMh);
ok('3 基色：没有可调区间', Geom.pinnedRange(SRGB_P, D65, 1) === null,
  JSON.stringify(Geom.pinnedRange(SRGB_P, D65, 1)));
const p3 = Geom.solvePinned(SRGB_P, D65, 1, rgbOnly.weights[1]);
ok('3 基色：固定唯一值可以解出来',
  p3 && near(p3[1], rgbOnly.weights[1], 1e-9) && near(p3[0], rgbOnly.weights[0], 1e-9),
  stringifyWeights(p3));

/* 四个基色：固定 W 之后其余三个唯一确定，且 RGB 按 (1−t) 等比让位 */
const r4 = Geom.pinnedRange(SRGB_W, D65, 3);
ok('RGB+W：W 的可行区间是 [0, 1]', r4 && near(r4.lo, 0, 1e-6) && near(r4.hi, 1, 1e-6), JSON.stringify(r4));
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const w = Geom.solvePinned(SRGB_W, D65, 3, t);
  const sum = w ? w.reduce((a, b) => a + b, 0) : NaN;
  ok(`RGB+W：固定 W = ${t} 时 Σw = 1`, w && near(sum, 1, 1e-9), String(sum));
  ok(`RGB+W：固定 W = ${t} 时合出白点`,
    w && Geom.weightResidual(Geom.multiUnit(SRGB_W), w, Geom.whiteXYZ(D65)) < 1e-9,
    w && String(Geom.weightResidual(Geom.multiUnit(SRGB_W), w, Geom.whiteXYZ(D65))));
  ok(`RGB+W：固定 W = ${t} 时 RGB 按比例让位`,
    w && near(w[0], rgbOnly.weights[0] * (1 - t), 1e-9) && near(w[3], t, 1e-12),
    w && stringifyWeights(w));
}

/* 越界值必须判为无解，不能悄悄给出负权重 */
ok('RGB+W：W 固定为 1.2 无解', Geom.solvePinned(SRGB_W, D65, 3, 1.2) === null);
ok('RGB+W：固定 R = 0.99 无解（其余基色合不出剩下的白点）',
  Geom.solvePinned(SRGB_W, D65, 0, 0.99) === null);
const rR = Geom.pinnedRange(SRGB_W, D65, 0);
/* R 最多只能占它在纯 RGB 解里的份额：多出来的部分没有通道能补白 */
ok('RGB+W：R 的可行上界 = 纯 RGB 解里的 R 份额',
  rR && near(rR.lo, 0, 1e-6) && near(rR.hi, rgbOnly.weights[0], 1e-6), JSON.stringify(rR));

/* 五基色固定一个之后仍有 4 个要满足白点 → 仍不唯一，但都要落在可行区间里 */
const FIVE = SRGB_P.concat([[0.3127, 0.3290], [0.068, 0.351]]);
const r5 = Geom.pinnedRange(FIVE, D65, 3);
ok('5 基色：固定项可行区间非空', r5 && r5.hi > r5.lo, JSON.stringify(r5));
if (r5) {
  for (const t of [r5.lo, (r5.lo + r5.hi) / 2, r5.hi]) {
    const w = Geom.solvePinned(FIVE, D65, 3, t);
    ok(`5 基色：固定 W = ${t.toFixed(3)} 仍能合出白点`,
      w && Geom.weightResidual(Geom.multiUnit(FIVE), w, Geom.whiteXYZ(D65)) < 1e-7,
      w && String(Geom.weightResidual(Geom.multiUnit(FIVE), w, Geom.whiteXYZ(D65))));
  }
}

/* 固定项要能进出 URL：否则刷新后就退回最小范数解 */
const encPin = Geom.encodeMulti({ primaries: SRGB_W, white: D65, weights: null, pin: { index: 3, value: 0.4 } });
const decPin = Geom.decodeMulti(encPin);
ok('编解码：固定项往返一致',
  decPin && decPin.pin && decPin.pin.index === 3 && near(decPin.pin.value, 0.4, 1e-4) && !decPin.weights,
  encPin);
ok('编解码：固定项不会被误读成权重', decPin && decPin.weights === null, encPin);
const encPlain = Geom.encodeMulti({ primaries: SRGB_P, white: D65, weights: null });
ok('编解码：不带固定项时不产生第三段', encPlain.split('*').length === 2, encPlain);

/* ---------- 12. 手填权重、退化输入、单通道为零与合法 ΣY ≠ 1 ---------- */
const negManual = Geom.makeMultiSpace({
  primaries: SRGB_P,
  white: D65,
  weights: [-0.1, 0.7, 0.4]
}, null, JMh);
ok('手填负权重：不被静默改写成非负自动解',
  negManual.weights.length === 3 && near(negManual.weights[0], -0.1, 1e-9) &&
  near(negManual.weights[1], 0.7, 1e-9) && near(negManual.weights[2], 0.4, 1e-9),
  stringifyWeights(negManual.weights));
ok('手填负权重：标记 negativeWeights=true 且 weightOk=false',
  negManual.negativeWeights === true && negManual.weightOk === false && negManual.explicitWeights === true);

const zeroManual = Geom.makeMultiSpace({
  primaries: SRGB_P,
  white: D65,
  weights: [0, 0, 0]
}, null, JMh);
ok('全零权重 [0,0,0]：标记退化且 weightOk=false',
  zeroManual.degenerate === true && zeroManual.hasVolume === false && zeroManual.weightOk === false && zeroManual.gens.length === 0,
  `gens=${zeroManual.gens.length} deg=${zeroManual.degenerate} ok=${zeroManual.weightOk}`);

const coincAuto = Geom.makeMultiSpace({
  primaries: [[0.3, 0.3], [0.3, 0.3], [0.3, 0.3]],
  white: D65
}, null, JMh);
ok('三点重合（自动模式）：标记退化且 weightOk=false',
  coincAuto.degenerate === true && coincAuto.hasVolume === false && coincAuto.weightOk === false);

const coincManual = Geom.makeMultiSpace({
  primaries: [[0.3, 0.3], [0.3, 0.3], [0.3, 0.3]],
  white: D65,
  weights: [0.3, 0.3, 0.4]
}, null, JMh);
ok('三点重合（手填权重）：标记退化且 weightOk=false',
  coincManual.degenerate === true && coincManual.hasVolume === false && coincManual.weightOk === false);

const colin3Manual = Geom.makeMultiSpace({
  primaries: [[0.2, 0.3], [0.3, 0.3], [0.4, 0.3]],
  white: D65,
  weights: [0.3, 0.3, 0.4]
}, null, JMh);
ok('三点共线（手填权重）：无三维体积，标记退化',
  colin3Manual.degenerate === true && colin3Manual.hasVolume === false && colin3Manual.weightOk === false);

const threeOneZero = Geom.makeMultiSpace({
  primaries: SRGB_P,
  white: D65,
  weights: [0.5, 0.5, 0]
}, null, JMh);
ok('三基色单通道为零：仅余 2 个非零向量，标记退化',
  threeOneZero.degenerate === true && threeOneZero.hasVolume === false && threeOneZero.weightOk === false);

/* 四基色单通道为零：无论 W=0 还是首通道 R=0，其余 3 通道仍构成合法封闭三维色体 */
const rgbwW0 = Geom.makeMultiSpace({
  primaries: SRGB_W,
  white: D65,
  weights: [0.212639, 0.715169, 0.072192, 0]
}, null, JMh);
const rgbwW0Mesh = Geom.buildMultiSurface(rgbwW0, 'xyz', 3, opts);
const rgbwW0Weld = weldStats(rgbwW0Mesh);
ok('四基色 W=0：合法三维体积且网格封闭',
  rgbwW0.weightOk === true && rgbwW0.degenerate === false && rgbwW0.gens.length === 3 &&
  rgbwW0Weld.boundary === 0 && rgbwW0Weld.nonManifold === 0,
  `gens=${rgbwW0.gens.length} boundary=${rgbwW0Weld.boundary}`);

const rgbwR0 = Geom.makeMultiSpace({
  primaries: SRGB_W,
  white: D65,
  weights: [0, 0.715169, 0.072192, 0.212639]
}, null, JMh);
const rgbwR0Mesh = Geom.buildMultiSurface(rgbwR0, 'xyz', 3, opts);
const rgbwR0Weld = weldStats(rgbwR0Mesh);
ok('四基色首通道 R=0：mergeCollinear 不误合并其余基色且网格封闭',
  rgbwR0.weightOk === true && rgbwR0.degenerate === false && rgbwR0.gens.length === 3 &&
  rgbwR0Weld.boundary === 0 && rgbwR0Weld.nonManifold === 0,
  `gens=${rgbwR0.gens.length} boundary=${rgbwR0Weld.boundary}`);

const dupSum = [0, 0, 0];
for (const g of dup.gens) { dupSum[0] += g[0]; dupSum[1] += g[1]; dupSum[2] += g[2]; }
ok('重复基色合并：生成元总和仍等于白点',
  near(dupSum[0], dup.white[0], 1e-9) && near(dupSum[1], dup.white[1], 1e-9) && near(dupSum[2], dup.white[2], 1e-9),
  dupSum.map((v) => v.toFixed(6)).join(', '));

const scaledManual = Geom.makeMultiSpace({
  primaries: SRGB_P,
  white: D65,
  weights: [0.4, 0.8, 0.2]
}, null, JMh);
const scaledMesh = Geom.buildMultiSurface(scaledManual, 'lab', 3, opts);
ok('合法手动 ΣY ≠ 1：weightOk=true、explicitWeights=true 且网格封闭',
  scaledManual.weightOk === true && scaledManual.degenerate === false &&
  scaledManual.explicitWeights === true && near(scaledManual.sumY, 1.4, 1e-9) &&
  weldStats(scaledMesh).boundary === 0);

const normalRgbw = Geom.makeMultiSpace({
  primaries: SRGB_W,
  white: D65
}, null, JMh);
const normalRgbwMesh = Geom.buildMultiSurface(normalRgbw, 'lab', 3, opts);
ok('正常 RGBW 自动求解：weightOk=true、白点残差 ≈ 0 且网格封闭',
  normalRgbw.weightOk === true && normalRgbw.negativeWeights === false &&
  normalRgbw.degenerate === false && normalRgbw.whiteError < 1e-9 &&
  weldStats(normalRgbwMesh).boundary === 0);

/* ---------- 汇总 ---------- */
console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
