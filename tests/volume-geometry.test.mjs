/* 色体积几何自检：六个面必须拼成一个封闭曲面（不破面），坐标映射不能出 NaN。
   运行：node tests/volume-geometry.test.mjs

   数据不写死：直接读 content/colour/<slug>/index.md 的 front matter，
   和 /tools/gamut-volume/ 用的同一批矩阵与白点。 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const Geom = require(path.join(root, 'assets/js/colour-volume-geom.js'));
const Models = require(path.join(root, 'assets/js/colour-models.js'));

let pass = 0;
const fails = [];
const skipped = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function near(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
}

/* ---------- 显示空间（= 页面下拉框里那一批） ---------- */

function frontMatter(text) {
  const m = text.match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/);
  return m ? m[1] : '';
}

function tomlValue(block, key) {
  const m = block.match(new RegExp('^' + key + '\\s*=\\s*(.+)$', 'm'));
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/,\s*([\]}])/g, '$1'));
  } catch (e) {
    return null;
  }
}

function readSpaces() {
  const dir = path.join(root, 'content/colour');
  const out = [];
  for (const slug of readdirSync(dir)) {
    let text;
    try { text = readFileSync(path.join(dir, slug, 'index.md'), 'utf8'); } catch (e) { continue; }
    const fm = frontMatter(text);
    if (!/^category\s*=\s*"Display Referred"/m.test(fm)) continue;
    if (/^wip\s*=\s*true/m.test(fm)) continue;
    const matrix = tomlValue(fm, 'matrix');
    const white = tomlValue(fm, 'whitePoint');
    const primaries = tomlValue(fm, 'primaries');
    if (!matrix || !white) continue;
    out.push({ slug, matrix, white, primaries });
  }
  return out;
}

const spaces = readSpaces();
ok('读到显示空间（≥5 个）', spaces.length >= 5, spaces.map((s) => s.slug).join(', '));

const srgb = spaces.find((s) => s.slug === 'primaries-srgb-rec709');
ok('sRGB 条目存在（配色要用它的矩阵）', !!srgb);

const JMh = require(path.join(root, 'assets/js/lib/aces-jmh.js'));

const spaceObjects = spaces.map((s) => Object.assign(Geom.makeSpace(s, srgb && srgb.matrix, JMh), { fixture: s }));
const bySlug = {};
spaceObjects.forEach((s) => { bySlug[s.slug] = s; });

/* ---------- 坐标（本地私有扩展在就一起测） ---------- */

const COORDS = ['xyz', 'xyy', 'lab', 'luv', 'oklab', 'cam02', 'cam16', 'ictcp', 'jzazbz', 'jmh', 'zcam'];

let ext = null;
try {
  globalThis.document = {
    readyState: 'complete',
    getElementById() { return null; },
    createElement() { return {}; },
    querySelector() { return null; },
    addEventListener() {}
  };
  require(path.join(root, 'assets/js/local/volume-ext.js'));
  ext = globalThis.ColourVolumeCoords || null;
} catch (e) {
  ext = null;
}
const extCoords = ext ? Object.keys(ext) : [];
extCoords.forEach((c) => COORDS.push(c));
if (!extCoords.length) skipped.push('本地私有坐标（assets/js/local/volume-ext.js 不存在）');

const opts = { models: Models, lum: 100, cond: { surround: 'average', bg: 0.2, laFactor: 0.2 }, ext: ext, jmh: JMh };

/* ---------- 封闭性：焊接同位置顶点后，每条边必须正好被两个三角形共用 ---------- */

function weldStats(mesh) {
  const pos = mesh.pos, idx = mesh.idx;
  const ids = new Map();
  const idOf = new Array(pos.length / 3);
  for (let i = 0; i < idOf.length; i++) {
    // pos 已经是 Float32Array，按位比较：差一点就是裂缝，不能糊过去
    const key = pos[i * 3] + ',' + pos[i * 3 + 1] + ',' + pos[i * 3 + 2];
    if (!ids.has(key)) ids.set(key, ids.size);
    idOf[i] = ids.get(key);
  }
  const edges = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idOf[idx[t]], b = idOf[idx[t + 1]], c = idOf[idx[t + 2]];
    const tri = [[a, b], [b, c], [c, a]];
    for (let e = 0; e < 3; e++) {
      const p = tri[e][0], q = tri[e][1];
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

const N = 20;
for (const space of spaceObjects) {
  for (const coord of COORDS) {
    const mesh = Geom.buildSurface(space, coord, N, opts);
    const tag = space.slug + '/' + coord;
    ok(tag + ' 没有解不出的样本', mesh.missing === 0, 'missing=' + mesh.missing);
    ok(tag + ' 没有走补洞兜底', mesh.repaired === 0, 'repaired=' + mesh.repaired);
    ok(tag + ' 六个面都在（三角数完整）',
      mesh.idx.length === 6 * 2 * N * N * 3,
      mesh.idx.length + ' vs ' + 6 * 2 * N * N * 3);
    const w = weldStats(mesh);
    ok(tag + ' 封闭：没有边界边', w.boundary === 0, 'boundary=' + w.boundary);
    ok(tag + ' 没有非流形边', w.nonManifold === 0, 'nonManifold=' + w.nonManifold);
    let finite = true;
    for (let i = 0; i < mesh.pos.length; i++) if (!isFinite(mesh.pos[i])) { finite = false; break; }
    ok(tag + ' 顶点全是有限值', finite);
  }
}

/* ---------- Hellwig JMh：与 tests/aces-jmh.test.mjs 同一批参考值 ---------- */

const p3 = bySlug['primaries-p3-d65'];
ok('P3-D65 的 JMh 参数建得起来（需要 primaries）', !!(p3 && p3.jmhParams));

if (p3 && p3.jmhParams) {
  const pt = (rgb) => Geom.pointFor(p3, 'jmh', rgb, opts);
  const white = pt([1, 1, 1]);
  ok('JMh：白点 J = 100', white && near(white[1], 100, 1e-9), white && white[1]);
  ok('JMh：白点 M = 0（a = b = 0）',
    white && near(Math.hypot(white[0], white[2]), 0, 1e-6), white && Math.hypot(white[0], white[2]));

  /* P3 红：J 54.00732、M 93.89525、h 29.25399（aces2.py 参考值） */
  const red = pt([1, 0, 0]);
  const h = 29.25399 * Math.PI / 180;
  ok('JMh：P3 红 J = 54.00732', red && near(red[1], 54.00732, 1e-4), red && red[1]);
  ok('JMh：P3 红 a = M·cos h = 81.93', red && near(red[0], 93.89525 * Math.cos(h), 1e-3), red && red[0]);
  ok('JMh：P3 红 b = M·sin h = 45.90', red && near(red[2], 93.89525 * Math.sin(h), 1e-3), red && red[2]);

  /* ACES 2.0 的 JMh 是 1.0 = 100 cd/m²，所以 0.18 灰不是 18% 的 J，而是 44.94 */
  const g18 = pt([0.18, 0.18, 0.18]);
  ok('JMh：0.18 中性灰 J = 44.93861', g18 && near(g18[1], 44.93861, 1e-4), g18 && g18[1]);
}

/* ---------- xyY 的黑点：色度未定义，按中性轴极限补成白点色度 ---------- */

if (bySlug['primaries-rec2020']) {
  const sp = bySlug['primaries-rec2020'];
  const W = sp.white;
  const s = W[0] + W[1] + W[2];
  const k = Geom.pointFor(sp, 'xyy', [0, 0, 0], opts);
  ok('xyY 黑点有闭包值', !!k);
  if (k) {
    ok('xyY 黑点 = 白点色度 (x_w, 0, y_w)',
      near(k[0], W[0] / s, 1e-9) && near(k[1], 0, 1e-12) && near(k[2], W[1] / s, 1e-9),
      JSON.stringify(k));
  }
  /* 第三位必须是色度 y，不是 z（旧 bug：z = 1−x−y，等于镜像） */
  const recR = Geom.pointFor(bySlug['primaries-rec2020'], 'xyy', [1, 0, 0], opts);
  ok('xyY Rec.2020 红 = (0.708, Y, 0.292)，不是 z = 0',
    recR && near(recR[0], 0.708, 1e-3) && near(recR[2], 0.292, 1e-3),
    recR && recR.map((v) => v.toFixed(4)).join(', '));
  const recG = Geom.pointFor(bySlug['primaries-rec2020'], 'xyy', [0, 1, 0], opts);
  ok('xyY Rec.2020 绿 = y 0.797（不是 z 0.033）',
    recG && near(recG[2], 0.797, 1e-3),
    recG && recG[2].toFixed(4));
}

/* ---------- CAM02 负值处理（Luo 2013，与 colour-science 0.4.6 逐点一致） ---------- */

function cam02For(slug, rgb) {
  const sp = bySlug[slug];
  if (!sp) return null;
  const xyz = Geom.mulVec3(Geom.flatten3(sp.fixture.matrix), rgb);
  return Models.cam02ucs(
    [xyz[0] * 100, xyz[1] * 100, xyz[2] * 100],
    [sp.white[0] * 100, sp.white[1] * 100, sp.white[2] * 100],
    { La: 20, Yb: 20, F: 1, c: 0.69, Nc: 1 }
  );
}

const camRed = cam02For('primaries-srgb-rec709', [1, 0, 0]);
ok('CAM02：sRGB 红 = a′ 42.0278 / J′ 60.2050 / b′ 26.4858',
  camRed && near(camRed[0], 42.0278, 5e-4) && near(camRed[1], 60.2050, 5e-4) && near(camRed[2], 26.4858, 5e-4),
  camRed && camRed.map((v) => v.toFixed(4)).join(', '));

/* Rec.2020 红的 Z 恰为 0，CAT02 绿通道变负；旧实现这里 pow(负数) 得 NaN，
   整条 R 轴的面被跳过，色体上就破了一个洞。 */
const camWideRed = cam02For('primaries-rec2020', [1, 0, 0]);
ok('CAM02：Rec.2020 红是有限值（不破面的关键）',
  camWideRed && camWideRed.every((v) => isFinite(v)),
  camWideRed && camWideRed.join(', '));
ok('CAM02：Rec.2020 红 = a′ 53.6815 / J′ 66.7350 / b′ 41.3120',
  camWideRed && near(camWideRed[0], 53.68146, 5e-4) && near(camWideRed[1], 66.73502, 5e-4) && near(camWideRed[2], 41.31202, 5e-4),
  camWideRed && camWideRed.map((v) => v.toFixed(4)).join(', '));

const camWhite = cam02For('primaries-rec2020', [1, 1, 1]);
ok('CAM02：白点 J′ = 100', camWhite && near(camWhite[1], 100, 1e-6), camWhite && camWhite[1]);

/* ---------- 正交 / 透视投影矩阵 ---------- */

function project(P, v) {
  const x = P[0] * v[0] + P[4] * v[1] + P[8] * v[2] + P[12];
  const y = P[1] * v[0] + P[5] * v[1] + P[9] * v[2] + P[13];
  const w = P[3] * v[0] + P[7] * v[1] + P[11] * v[2] + P[15];
  return [x / w, y / w, w];
}

const aspect = 2;
const oP = Geom.ortho(0.5, aspect, 0.05, 6.8);
const edgeY = project(oP, [0, 0.5, 0, 1]);
const edgeX = project(oP, [1.0, 0, 0, 1]); // 半宽 = 0.5 × aspect
ok('正交：半高处落到上边缘', near(edgeY[1], 1, 1e-6), edgeY[1]);
ok('正交：半宽处落到右边缘', near(edgeX[0], 1, 1e-6), edgeX[0]);
ok('正交：w 恒为 1（不看距离）',
  near(edgeY[2], 1, 1e-6) && near(project(oP, [0, 0.5, 3, 1])[2], 1, 1e-6));
const nearPt = project(oP, [0, 0.5, 0, 1]);
const farPt = project(oP, [0, 0.5, 3, 1]);
ok('正交：远近同尺寸（无透视收缩）', near(nearPt[1], farPt[1], 1e-9), nearPt[1] + ' vs ' + farPt[1]);

const fov = 30 * Math.PI / 180;
const pP = Geom.perspective(fov, 1, 0.1, 20);
const d = 4;
const pEdge = project(pP, [0, d * Math.tan(fov / 2), -d, 1]);
ok('透视：视锥边界落到上边缘', near(pEdge[1], 1, 1e-6), pEdge[1]);
ok('透视：w 随深度变化', !near(project(pP, [0, 0, -4, 1])[2], project(pP, [0, 0, -8, 1])[2], 1e-6));

// 正交半高取「透视在距离 d 处的半高」时，同一朝向的画面尺寸一致
const fitH = d * Math.tan(fov / 2);
ok('正交与透视在 fit 距离处同尺寸',
  near(project(Geom.ortho(fitH, 1, 0.05, 20), [0, fitH, 0, 1])[1], project(pP, [0, fitH, -d, 1])[1], 1e-6));

/* ---------- 刻度：标签要能写出步长本身，三轴共用一个步长 ---------- */

/* 旧实现按「step ≥ 0.5 取 0 位小数」分档，0.5 被 toFixed(0) 舍成 "1"，
   于是 y / Y 轴的刻度看上去是 x 轴的两倍长。 */
ok('刻度 0.5 → "0.5"（不是 "1"）', Geom.fmtTick(0.5, 0.5) === '0.5', Geom.fmtTick(0.5, 0.5));
ok('刻度 1.0 → "1"', Geom.fmtTick(1, 0.5) === '1', Geom.fmtTick(1, 0.5));
ok('刻度 0.2 → "0.2"', Geom.fmtTick(0.2, 0.2) === '0.2', Geom.fmtTick(0.2, 0.2));
ok('刻度 0.05 → "0.05"', Geom.fmtTick(0.05, 0.05) === '0.05', Geom.fmtTick(0.05, 0.05));
ok('刻度 2 → "2"', Geom.fmtTick(2, 1) === '2', Geom.fmtTick(2, 1));
ok('刻度 -0.05 → "-0.05"', Geom.fmtTick(-0.05, 0.05) === '-0.05', Geom.fmtTick(-0.05, 0.05));
ok('刻度 0 → "0"（不出现 "-0"）', Geom.fmtTick(0, 0.5) === '0', Geom.fmtTick(0, 0.5));
ok('步长 0.5 用 1 位小数', Geom.decimalsFor(0.5) === 1, Geom.decimalsFor(0.5));
ok('步长 0.25 用 2 位小数', Geom.decimalsFor(0.25) === 2, Geom.decimalsFor(0.25));
ok('步长 5 用 0 位小数', Geom.decimalsFor(5) === 0, Geom.decimalsFor(5));

/* xyY 的三根轴：x 0.073–0.766 / Y 0–1 / y −0.082–0.905（Rec.2020 实测值） */
const xyyLo = [0.0733, 0, -0.0823];
const xyyHi = [0.7657, 1, 0.9053];
const xyyStep = Geom.sharedStep(xyyLo, xyyHi);
ok('xyY 三轴共用步长', xyyStep > 0, xyyStep);
ok('xyY 共用步长 = 0.2', near(xyyStep, 0.2, 1e-9), xyyStep);
[0, 1, 2].forEach((k) => {
  const n = Geom.tickCount(xyyLo[k], xyyHi[k], xyyStep);
  ok('xyY 第 ' + k + ' 轴能摆下刻度', n >= 2 && n <= 7, n);
});

/* 量程差得太远时允许退回各轴自定步长（sharedStep 返回 0），但每根轴自己也得能读 */
const jzLo = [-0.676, 0, -1.098];   // Rec.2020 的 JzAzBz 实测范围
const jzHi = [0.773, 1, 0.852];
const jzStep = Geom.sharedStep(jzLo, jzHi);
if (jzStep > 0) {
  [0, 1, 2].forEach((k) => {
    const n = Geom.tickCount(jzLo[k], jzHi[k], jzStep);
    ok('JzAzBz 共用步长后第 ' + k + ' 轴能摆下刻度', n >= 3 && n <= 7, n);
  });
} else {
  [0, 1, 2].forEach((k) => {
    const own = Geom.niceStep(jzHi[k] - jzLo[k]);
    const n = Geom.tickCount(jzLo[k], jzHi[k], own);
    ok('JzAzBz 退回自定步长后第 ' + k + ' 轴能摆下刻度', n >= 2, own + ' → ' + n);
  });
}

/* 一根轴窄到放不下 3 个刻度时，明确退回各轴步长，不要硬凑 */
const skewLo = [-0.5, 0, 0];
const skewHi = [1.5, 1, 0.02];
ok('量程悬殊时退回各轴步长', Geom.sharedStep(skewLo, skewHi) === 0, Geom.sharedStep(skewLo, skewHi));

/* ---------- Pointer's Gamut：LCh 采样搭成的参考色体 ---------- */

const pointerData = JSON.parse(readFileSync(path.join(root, 'data/pointerGamut.json'), 'utf8'));
const pointer = Geom.makePointerSpace(pointerData, srgb && srgb.matrix, JMh);
const PTR_FINE = 60;                       // 15 段实测区间 × 4
ok('Pointer：L* 方向 4× 重采样（61 环 × 36 色相）',
  pointer.rings.length === PTR_FINE + 1 && pointer.rings[0].length === 36,
  pointer.rings.length + ' × ' + (pointer.rings[0] && pointer.rings[0].length));
ok('Pointer：实测仍是 16 档，ringStep = 4',
  pointer.dataLevels.length === 16 && pointer.ringStep === 4,
  pointer.dataLevels.length + ' 档 / step ' + pointer.ringStep);
ok('Pointer：细环 L* 15–90、步长 1.25',
  pointer.levels[0] === 15 && near(pointer.levels[1], 16.25, 1e-9) &&
  pointer.levels[pointer.levels.length - 1] === 90, pointer.levels.slice(0, 3).join(','));

/* 重采样只在实测环之间插值：第 4k 环必须原样等于表中的点 */
{
  let maxDev = 0;
  for (let k = 0; k < pointer.dataLevels.length; k++) {
    const L = pointer.dataLevels[k];
    const rows = pointerData.lch.filter((r) => r[0] === L).sort((a, b) => a[2] - b[2]);
    for (let j = 0; j < rows.length; j++) {
      const ref = Geom.lchToXyz(L, rows[j][1], rows[j][2], pointer.white);
      const got = pointer.rings[k * pointer.ringStep][j];
      for (let c = 0; c < 3; c++) maxDev = Math.max(maxDev, Math.abs(ref[c] - got[c]));
    }
  }
  ok('Pointer：实测环原样保留（不漂移）', maxDev < 1e-12, maxDev.toExponential(2));
}

/* 夹紧：三次样条在曲率大的地方会外凸，插值结果必须落在两端实测值之间。
   同时确认这件事不是空转——不夹紧时确实会凸出去。 */
{
  const W = pointer.white;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const labC = (xyz) => {
    const fx = f(xyz[0] / W[0]), fy = f(xyz[1] / W[1]), fz = f(xyz[2] / W[2]);
    return Math.hypot(500 * (fx - fy), 200 * (fy - fz));
  };
  const hues = pointerData.lch.filter((r) => r[0] === 15).map((r) => r[2]).sort((a, b) => a - b);
  let maxOut = 0, maxOver = 0;
  for (let j = 0; j < hues.length; j++) {
    const col = pointerData.lch.filter((r) => r[2] === hues[j]).sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < col.length - 1; k++) {
      const c1 = col[k][1], c2 = col[k + 1][1];
      const lo = Math.min(c1, c2), hi = Math.max(c1, c2);
      const c0 = col[Math.max(0, k - 1)][1], c3 = col[Math.min(col.length - 1, k + 2)][1];
      for (let s = 1; s < pointer.ringStep; s++) {
        const got = labC(pointer.rings[k * pointer.ringStep + s][j]);
        maxOut = Math.max(maxOut, Math.max(lo - got, got - hi));
        const t = s / pointer.ringStep, t2 = t * t, t3 = t2 * t;
        const raw = 0.5 * (2 * c1 + (-c0 + c2) * t + (2 * c0 - 5 * c1 + 4 * c2 - c3) * t2
                         + (-c0 + 3 * c1 - 3 * c2 + c3) * t3);
        maxOver = Math.max(maxOver, Math.max(lo - raw, raw - hi));
      }
    }
  }
  ok('Pointer：所有重采样点都在实测区间内', maxOut < 1e-9, maxOut.toExponential(2));
  ok('Pointer：夹紧确实在起作用（未夹紧时最大外凸 > 1）', maxOver > 1, maxOver.toFixed(2));
}

for (const coord of ['lab', 'jmh', 'cam16', 'zcam']) {
  const mesh = Geom.buildCustom(pointer, coord, opts);
  const tag = "Pointer/" + coord;
  ok(tag + ' 没有解不出的样本', mesh.missing === 0, 'missing=' + mesh.missing);
  ok(tag + ' 三角数完整（60×36×2 + 两端封盖）',
    mesh.idx.length === (60 * 36 * 2 + 2 * 36) * 3,
    mesh.idx.length + ' vs ' + (60 * 36 * 2 + 2 * 36) * 3);
  const w = weldStats(mesh);
  ok(tag + ' 封闭：没有边界边', w.boundary === 0, 'boundary=' + w.boundary);
  ok(tag + ' 没有非流形边', w.nonManifold === 0, 'nonManifold=' + w.nonManifold);
  let finite = true;
  for (let i = 0; i < mesh.pos.length; i++) if (!isFinite(mesh.pos[i])) { finite = false; break; }
  ok(tag + ' 顶点全是有限值', finite);
}

/* L=15、C=10、h=0 的采样在 Lab 里就是 (a=10, L=15, b=0) */
const firstLab = Geom.pointForXyz(pointer, 'lab', pointer.rings[0][0], opts);
ok('Pointer：LCh(15,10,0°) → Lab 显示 [10, 15, 0]',
  firstLab && near(firstLab[0], 10, 1e-9) && near(firstLab[1], 15, 1e-9) && near(firstLab[2], 0, 1e-9),
  firstLab && firstLab.join(', '));

/* ---------- 汇总 ---------- */

console.log(`${pass} passed, ${fails.length} failed`);
if (skipped.length) skipped.forEach((s) => console.log('  – 跳过：' + s));
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
