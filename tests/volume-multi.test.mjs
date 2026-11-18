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

/* ---------- 汇总 ---------- */
console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
