#!/usr/bin/env node
/**
 * 同步检查：把「同一事实出现在多个地方」的关联固化成断言。
 *
 * 用法：
 *   node scripts/verify/sync_check.mjs                 # 源码检查（CI 的 npm test 会跑）
 *   node scripts/verify/sync_check.mjs --built public  # 构建产物检查（CI 构建后跑）
 *
 * 设计原则：
 *   - 能由数据算出的数字，页面必须从数据取（例如 SMPTE 的 905/1,234/快照日期）。
 *   - 确实需要写死在文案里的数字，必须在这里加一条断言，否则 CI 不放过。
 *   - 新增「同一事实的第二份拷贝」时，先想想能不能改为模板计算；不能，就来这里登记。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const argv = process.argv.slice(2);
const builtIdx = argv.indexOf('--built');
const builtDir = builtIdx >= 0 ? argv[builtIdx + 1] : null;
const builtRoot = builtDir ? path.resolve(root, builtDir) : null;

const errors = [];
let total = 0;
function ok(name) { total++; console.log('  ✓ ' + name); }
function bad(name, detail = '') { total++; errors.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function expect(name, cond, detail = '') { if (cond) ok(name); else bad(name, detail); }

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readJSON = (p) => JSON.parse(read(p));
const exists = (p) => fs.existsSync(path.join(root, p));
const fm = (p) => (read(p).match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/m) || ['', ''])[1];
function dirs(p) {
  return fs.readdirSync(path.join(root, p), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, p, d.name, 'index.md')))
    .map((d) => d.name);
}
const fmt = (n) => Number(n).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// 1. 数据与页面：色域清单是唯一来源
// ---------------------------------------------------------------------------
console.log('同步检查 · 源码');
const yaml = read('data/colourspaces.yaml');
const dataSlugs = new Set([...yaml.matchAll(/^\s+slug:\s*([A-Za-z0-9_-]+)\s*$/gm)].map((m) => m[1]));
const zh = new Set(dirs('content/colour'));
const en = new Set(dirs('content/en/colour'));
expect('data/colourspaces.yaml 的条目数与中文页一致', dataSlugs.size === zh.size, `${dataSlugs.size} 条 vs ${zh.size} 页`);
expect('data 的 slug 与中文页一一对应', [...dataSlugs].every((s) => zh.has(s)) && [...zh].every((s) => dataSlugs.has(s)),
  `缺页：${[...dataSlugs].filter((s) => !zh.has(s)).join(',') || '无'}；未登记：${[...zh].filter((s) => !dataSlugs.has(s)).join(',') || '无'}`);
expect('中英页面数量一致', zh.size === en.size, `${zh.size} vs ${en.size}`);
const refBad = [];
for (const s of en) {
  const t = fm(`content/en/colour/${s}/index.md`);
  const m = t.match(/^ref\s*=\s*"([^"]+)"/m);
  if (!m || m[1] !== s || !zh.has(s)) refBad.push(s);
}
expect('英文页 ref 指向对应中文页', refBad.length === 0, refBad.slice(0, 10).join(', '));

const anchors = readJSON('data/anchors.json');
const anchorOrphans = Object.keys(anchors).filter((s) => !zh.has(s));
expect('data/anchors.json 没有指向不存在页面的条目', anchorOrphans.length === 0, anchorOrphans.join(', '));

// ---------------------------------------------------------------------------
// 2. 工具页与功能计数
// ---------------------------------------------------------------------------
const toolsZh = new Set(dirs('content/tools'));
const toolsEn = new Set(dirs('content/en/tools'));
expect('中英工具页集合一致', toolsZh.size === toolsEn.size && [...toolsZh].every((s) => toolsEn.has(s)),
  `zh=${[...toolsZh].sort().join(',')} en=${[...toolsEn].sort().join(',')}`);

const toolsIndex = read('layouts/colour/tools-index.html');
const vol = read('layouts/colour/volume.html');
const insp = read('layouts/colour/inspector.html');
const tr = read('layouts/colour/transfer.html');
const coordVals = ['xyz', 'xyy', 'lab', 'luv', 'oklab', 'ipt', 'cam02', 'cam16', 'jmh', 'ictcp', 'jzazbz', 'zcam'];
const planeVals = ['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'];
const axisVals = ['abs', 'log', 'rel', 'stops', 'pq'];
const coordCount = coordVals.filter((v) => new RegExp(`<option value="${v}"`).test(vol)).length;
const planeCount = planeVals.filter((v) => new RegExp(`<option value="${v}"`).test(insp)).length;
const axisCount = axisVals.filter((v) => new RegExp(`<option value="${v}"`).test(tr)).length;
const overlayCount = (vol.match(/id="vol-ov-[a-z]+"/g) || []).length;
const CN = { 1: '一', 2: '两', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };
const coordClaim = Number((toolsIndex.match(/(\d+) 种坐标/) || [])[1]);
expect('色体积坐标数 = 实际选项数 = 描述', coordCount === 12 && coordClaim === coordCount, `选项 ${coordCount}，描述 ${coordClaim}`);
expect('色体积叠加层数 = 实际复选框数 = 描述', overlayCount === 3 && toolsIndex.includes(`${CN[overlayCount]}种叠加层`), `复选框 ${overlayCount}`);
expect('取色读数平面数 = 实际选项数 = 描述', planeCount === 6 && toolsIndex.includes(`${CN[planeCount]}种选色平面`), `选项 ${planeCount}`);
expect('传递函数纵轴数 = 实际选项数 = 描述', axisCount === 5 && toolsIndex.includes(`${axisCount} 种纵轴`), `选项 ${axisCount}`);

/* 纯幂函数页的手写数值锚点：由幂次重算，中英文文案不得再写错 10-bit legal 码差。 */
const gamma22Code = Math.pow(0.18, 1 / 2.2);
const gamma24Code = Math.pow(0.18, 1 / 2.4);
const gammaCodeDiff = Math.round((gamma24Code - gamma22Code) * (940 - 64));
const gammaZh = read('content/colour/tf-power/index.md');
const gammaEn = read('content/en/colour/tf-power/index.md');
expect('纯幂 18% 灰在 10-bit legal 的码差与中英文文案一致',
  gammaCodeDiff === 27 && gammaZh.includes('约 **27 个码值**') && gammaEn.includes('about **27 code values**'),
  `复算 ${gammaCodeDiff}`);

const ptr = readJSON('data/pointerGamut.json');
const munsell = readJSON('data/munsellRenotation.json');
expect('Pointer 实测点数与描述一致', ptr.lch?.length === 576 && toolsIndex.includes('576'), `data ${ptr.lch?.length}`);
expect('Munsell 色片数与描述一致', munsell.count === 2734 && toolsIndex.includes('2734'), `data ${munsell.count}`);

/* 白点预设表：色体积面板与色域比对面板各写一份，数值必须一致 */
const whitePresets = (src) => {
  const m = src.match(/WHITE_PRESETS\s*=\s*\{([\s\S]*?)\n\s*\};/);
  if (!m) return null;
  return [...m[1].matchAll(/([a-z0-9]+)\s*:\s*\[([^\]]+)\]/gi)]
    .map((x) => x[1] + '=' + x[2].replace(/\s+/g, '')).sort().join(';');
};
const wpVol = whitePresets(read('assets/js/colour-volume.js'));
const wpCmp = whitePresets(read('assets/js/tool-compare.js'));
expect('白点预设表（色体积 / 色域比对）数值一致', !!wpVol && wpVol === wpCmp, `${wpVol} vs ${wpCmp}`);

/* ---------------------------------------------------------------------------
   取色读数：色域（原色 + 白点）与传递函数解耦。
   - 模板必须用 tool-spaces 的完整清单，不许再维护一份白名单；
   - 资料页矩阵必须可逆，且 M·[1,1,1] 的白点 xy 等于该页 whitePoint；
   - 同一「原色 + 白点」只能出现一次（P3-D65 / P3-DCI 不能合并）。
   --------------------------------------------------------------------------- */
const inspTpl = read('layouts/colour/inspector.html');
expect('取色读数模板从 tool-spaces 取色域清单', inspTpl.includes('partial "tool-spaces.html"'));
expect('取色读数模板不再维护七项色域白名单', !/\$gOrder/.test(inspTpl));
expect('取色读数模板下发采样曲线（与 convert 同法）', /index hugo\.Data\.curves/.test(inspTpl));

/* 取 front matter 里一行数组值：[a, b] 与 [[a, b], ...] 都收 */
const fmJson = (slug, key) => {
  const t = fm(`content/colour/${slug}/index.md`);
  const m = t.match(new RegExp('^' + key + '\\s*=\\s*(\\[[^\\n]*\\])', 'm'));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
};
const whiteOf = (slug) => fmJson(slug, 'whitePoint');
/* 色域分组（display-gamut / camera / working / aces）来自 data/colourspaces.yaml */
const spaceGroup = {};
{
  let cur = null;
  for (const line of yaml.split('\n')) {
    let m = line.match(/^\s+slug:\s*([A-Za-z0-9_-]+)\s*$/);
    if (m) { cur = m[1]; continue; }
    m = line.match(/^\s+group:\s*([A-Za-z0-9_-]+)\s*$/);
    if (m && cur) spaceGroup[cur] = m[1];
  }
}
const matrixBad2 = [];
const whiteBad = [];
const gamutKeys = new Map();
const gamutDup = [];
for (const s of zh) {
  const txt = fm(`content/colour/${s}/index.md`);
  const prim = fmJson(s, 'primaries');
  if (!prim) continue;
  if (/^wip\s*=\s*true/m.test(txt)) continue;
  const m = fmJson(s, 'matrix');
  if (!m || m.length !== 3) { matrixBad2.push(`${s}: 缺少可解析矩阵`); continue; }
  const f = m.flat();
  const det = f[0] * (f[4] * f[8] - f[5] * f[7]) - f[1] * (f[3] * f[8] - f[5] * f[6]) + f[2] * (f[3] * f[7] - f[4] * f[6]);
  if (!f.every(Number.isFinite) || Math.abs(det) < 1e-12) { matrixBad2.push(`${s}: 矩阵不可逆`); continue; }
  const X = f[0] + f[1] + f[2], Y = f[3] + f[4] + f[5], Z = f[6] + f[7] + f[8];
  const sum = X + Y + Z;
  const w = whiteOf(s);
  if (!w) { whiteBad.push(`${s}: 缺少 whitePoint`); continue; }
  if (Math.abs(X / sum - w[0]) > 2e-3 || Math.abs(Y / sum - w[1]) > 2e-3) {
    whiteBad.push(`${s}: 矩阵白点 ${(X / sum).toFixed(4)},${(Y / sum).toFixed(4)} ≠ ${w.join(',')}`);
  }
  /* 去重按组进行：显示原色与相机链即使几何相同也各保留一条代表，
     否则相机条目会被合并掉，资料页配对就找不到那条 Log */
  const key = (spaceGroup[s] || '') + '|' + prim.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';') +
    '|' + w.map((v) => v.toFixed(5)).join(',');
  if (gamutKeys.has(key)) gamutDup.push(`${s} = ${gamutKeys.get(key)}`);
  else gamutKeys.set(key, s);
}
expect('各色域页矩阵可逆', matrixBad2.length === 0, matrixBad2.slice(0, 4).join(' | '));
expect('各色域页矩阵白点 = whitePoint', whiteBad.length === 0, whiteBad.slice(0, 4).join(' | '));
/* 同原色同白点的条目会被工具合并（ACEScg / ACEScc 共用 AP1，Canon Log 1/2/3 共用
   Cinema Gamut），这是有意行为；真正要钉住的是「白点不同就不能合并」 */
const geometryOf = (slug) => {
  const prim = fmJson(slug, 'primaries');
  const w = whiteOf(slug);
  return (spaceGroup[slug] || '') + '|' + prim.map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';') +
    '|' + w.map((v) => v.toFixed(5)).join(',');
};
expect('P3-D65 与 P3-DCI 的去重键不同（同原色、异白点，不能合并）',
  geometryOf('primaries-p3-d65') !== geometryOf('primaries-p3-dci'));
expect('ProPhoto（D50）与 ACEScg（D60）的去重键不同',
  geometryOf('primaries-prophoto') !== geometryOf('acescg'));
expect('Canon Log 1 / 2 / 3 归并到同一条（同原色同白点）',
  geometryOf('canon-cinema-gamut-log1') === geometryOf('canon-cinema-gamut-log2') &&
  geometryOf('canon-cinema-gamut-log2') === geometryOf('canon-cinema-gamut-log3'));
const distinctGamuts = gamutKeys.size;
const displayGamuts = [...gamutKeys.keys()].filter((k) => k.startsWith('display-gamut|')).length;
console.log(`  – 原色 + 白点去重后 ${distinctGamuts} 个色域（其中显示原色 ${displayGamuts} 个，${gamutDup.length} 条同原色同白点的别名）`);

/* ---------------------------------------------------------------------------
   色适应：data/cat.yaml、页面 front matter 与 JS 内核必须三处一致。
   页面上的矩阵是展示用快照，真正的算术在 assets/js/lib/cat.js；这里把两者钉在一起。
   --------------------------------------------------------------------------- */
const catLib = require(path.join(root, 'assets/js/lib/cat.js'));
const catYaml = read('data/cat.yaml');
const catSlugs = [...catYaml.matchAll(/^-\s+slug:\s*([a-z0-9-]+)\s*$/gm)].map((m) => m[1]);
const catDirs = dirs('content/cat').filter((s) => s !== 'basis');
const catEnDirs = dirs('content/en/cat').filter((s) => s !== 'basis');
expect('data/cat.yaml 条目 = 中文 CAT 页（除 basis）', catSlugs.length === catDirs.length && catSlugs.every((s) => catDirs.includes(s)),
  `${catSlugs.length} 条 vs ${catDirs.length} 页`);
expect('data/cat.yaml 顺序 = 内核 CAT_LIST 顺序', catSlugs.join(',') === catLib.CAT_LIST.join(','),
  `${catSlugs.join(',')} vs ${catLib.CAT_LIST.join(',')}`);
expect('中英 CAT 页数量一致', catDirs.length === catEnDirs.length, `${catDirs.length} vs ${catEnDirs.length}`);
const catRefBad = catEnDirs.filter((s) => {
  const t = fm(`content/en/cat/${s}/index.md`);
  const m = t.match(/^ref\s*=\s*"([^"]+)"/m);
  return !m || m[1] !== s || !catDirs.includes(s);
});
expect('英文 CAT 页 ref 指向对应中文页', catRefBad.length === 0, catRefBad.join(', '));

const tomlMatrix = (text, key) => {
  const m = text.match(new RegExp('^' + key + '\\s*=\\s*(\\[\\[[\\s\\S]*?\\]\\])\\s*$', 'm'));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
};
const matrixBad = [];
const inverseBad = [];
for (const s of catDirs) {
  const text = fm(`content/cat/${s}/index.md`);
  const m = tomlMatrix(text, 'matrix');
  const mi = tomlMatrix(text, 'matrixInv');
  const want = catLib.CATS[s];
  if (!m || !want || m.flat().length !== 9 || m.flat().some((v, i) => Math.abs(v - want[i]) > 1e-12)) {
    matrixBad.push(s);
  }
  const inv = want ? catLib.inv3(want) : null;
  if (!mi || !inv || mi.flat().length !== 9 || mi.flat().some((v, i) => Math.abs(v - inv[i]) > 1e-9)) {
    inverseBad.push(s);
  }
}
expect('各 CAT 页 front matter 的 M 与内核一致', matrixBad.length === 0, matrixBad.join(', '));
expect('各 CAT 页 front matter 的 M⁻¹ 与内核求逆一致', inverseBad.length === 0, inverseBad.join(', '));

// ---------------------------------------------------------------------------
// 3. 色彩模型：data/models.yaml、页面与内核三处一致
// ---------------------------------------------------------------------------
const hasModels = exists('data/models.yaml') && exists('content/models');
if (hasModels) {
const modelYaml = read('data/models.yaml');
const modelSlugs = [...modelYaml.matchAll(/^-\s+slug:\s*([a-z0-9-]+)\s*$/gm)].map((m) => m[1]);
const modelStatus = {};
const modelCoords = {};
{
  let cur = null;
  for (const line of modelYaml.split('\n')) {
    let m = line.match(/^-\s+slug:\s*([a-z0-9-]+)\s*$/);
    if (m) { cur = m[1]; continue; }
    m = line.match(/^\s+status:\s*([a-z]+)\s*$/);
    if (m && cur) modelStatus[cur] = m[1];
    m = line.match(/^\s+volCoord:\s*([a-z0-9-]+)\s*$/);
    if (m && cur) modelCoords[cur] = m[1];
  }
}
var modelDirs = dirs('content/models');
var modelEnDirs = dirs('content/en/models');
const expectModels = 16;
expect('data/models.yaml 条目 = 中文模型页', modelSlugs.length === modelDirs.length && modelSlugs.every((s) => modelDirs.includes(s)),
  `${modelSlugs.length} 条 vs ${modelDirs.length} 页`);
expect(`中文模型页数量 = ${expectModels}`, modelDirs.length === expectModels, String(modelDirs.length));
expect('中英模型页一一对应', modelDirs.length === modelEnDirs.length && modelDirs.every((s) => modelEnDirs.includes(s)),
  `zh=${modelDirs.join(',')} en=${modelEnDirs.join(',')}`);
const modelRefBad = modelEnDirs.filter((s) => {
  const t = fm(`content/en/models/${s}/index.md`);
  const m = t.match(/^ref\s*=\s*"([^"]+)"/m);
  return !m || m[1] !== s || !modelDirs.includes(s);
});
expect('英文模型页 ref 指向对应中文页', modelRefBad.length === 0, modelRefBad.join(', '));

/* status 必须与页面存在与否一致：没写的不能标 done，写完的不能留 planned */
const statusBad = modelSlugs.filter((s) => {
  const has = modelDirs.includes(s) && modelEnDirs.includes(s);
  return modelStatus[s] !== (has ? 'done' : 'planned');
});
expect('模型 status 与页面完成度一致', statusBad.length === 0, statusBad.join(', '));

/* 单模型页挂载的组件必须已在 models-viz.js 中实现 */
const vizJs = read('assets/js/models-viz.js');
const vizKinds = new Set([...vizJs.matchAll(/kind === '([a-z]+)'/g)].map((m) => m[1]));
const vizBad = [];
for (const s of modelSlugs) {
  const m = modelYaml.match(new RegExp('^-\\s+slug:\\s*' + s + '\\s*$[\\s\\S]*?^\\s+viz:\\s*\\[([^\\]]*)\\]', 'm'));
  if (!m) { vizBad.push(`${s}: 缺 viz`); continue; }
  const kinds = m[1].split(',').map((x) => x.trim().replace(/"/g, '')).filter(Boolean);
  kinds.forEach((k) => { if (!vizKinds.has(k)) vizBad.push(`${s}: ${k}`); });
}
expect('各模型页挂载的组件都已实现', vizBad.length === 0, vizBad.join(', '));

/* 工具直达链接：只校验声明的色体积坐标 */
const coordOptions = new Set([...vol.matchAll(/<option value="([a-z0-9]+)"/g)].map((m) => m[1]));
const coordBad = Object.entries(modelCoords).filter(([, coord]) => !coordOptions.has(coord)).map(([slug, coord]) => `${slug}: ${coord}`);
expect('模型声明的色体积坐标均存在', coordBad.length === 0, coordBad.join(', '));

/* 正文里的数字锚点：由内核复算，与页面文案逐个对照 */
const CM = require(path.join(root, 'assets/js/colour-models.js'));
const Aces = require(path.join(root, 'assets/js/lib/aces-jmh.js'));
const srgbM = fmJson('primaries-srgb-rec709', 'matrix').flat();
const srgbW = fmJson('primaries-srgb-rec709', 'whitePoint');
const srgbPrim = fmJson('primaries-srgb-rec709', 'primaries');
const D65 = [srgbW[0] / srgbW[1], 1, (1 - srgbW[0] - srgbW[1]) / srgbW[1]];
const mul3v = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
                         A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
                         A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const red = mul3v(srgbM, [1, 0, 0]);
const grey18 = mul3v(srgbM, [0.18, 0.18, 0.18]);
const closeStr = (got, want, tol) => Math.abs(got - want) <= (tol === undefined ? 5e-4 : tol);
const numBad = [];
function claim(label, got, pageSlug, needle, tol) {
  const text = read(`content/models/${pageSlug}/index.md`) + read(`content/en/models/${pageSlug}/index.md`);
  if (!text.includes(needle)) numBad.push(`${label}: 页面缺 ${needle}`);
  if (!closeStr(got, parseFloat(needle), tol)) numBad.push(`${label}: 内核 ${got.toFixed(5)} ≠ 文案 ${needle}`);
}
const labGrey = CM.lab(grey18, D65)[1];
claim('Lab 0.18 灰 L*', labGrey, 'lab', '49.50', 0.005);
claim('Oklab 0.18 灰 L', CM.oklab(grey18)[1], 'oklab', '0.5646', 5e-5);
claim('Luv sRGB 红 u*', CM.luv(red, D65)[0], 'luv', '175.01', 0.005);
claim('IPT sRGB 红 P', CM.ipt(red)[0], 'ipt', '0.6209', 5e-5);
const cam02Red = CM.cam02Forward(red.map((v) => v * 100), D65.map((v) => v * 100),
  { La: 20, Yb: 20, F: 1, c: 0.69, Nc: 1 });
claim('CAM02 红 a′', cam02Red.ap, 'cam02', '42.0278', 5e-5);
const cam16Red = CM.cam16Forward(red.map((v) => v * 100), D65.map((v) => v * 100),
  { La: 20, Yb: 20, F: 1, c: 0.69, Nc: 1, Nc16: 1 });
claim('CAM16 红 a′', cam16Red.ap, 'cam16', '44.3760', 5e-5);
const jzRed = CM.jzazbz(red, 100);
claim('JzAzBz 红 Jz', jzRed[1], 'jzazbz', '0.0990', 5e-5);
claim('JzAzBz 白 Jz', CM.jzazbz(D65, 100)[1], 'jzazbz', '0.1672', 5e-5);
const zc = CM.zcamForward(red.map((v) => v * 100), D65.map((v) => v * 100),
  { La: 20, Yb: 20, F: 1, Fs: 0.69 });
claim('ZCAM 红 Jz', zc.Jz, 'zcam', '51.1973', 5e-5);
const jmhP = Aces.init(srgbPrim, srgbW);
claim('JMh 0.18 灰 J', Aces.xyzToJMh(grey18, jmhP)[0], 'jmh', '44.9386', 5e-5);
expect('模型页正文数值锚点与内核一致', numBad.length === 0, numBad.slice(0, 4).join(' | '));

// ---------------------------------------------------------------------------
} else {
  console.log('  – 跳过色彩模型检查：公开分支无模型板块');
}

// 4. SMPTE：页面统计必须来自 meta.json
// ---------------------------------------------------------------------------
const meta = readJSON('static/smpte/data/meta.json');
const families = readJSON('static/smpte/data/families.json');
const variants = readJSON('static/smpte/data/variants.json');
const pagefind = readJSON('static/smpte/pagefind/pagefind-entry.json');
expect('SMPTE families.json 与 meta.families 一致', families.length === meta.families, `${families.length} vs ${meta.families}`);
expect('SMPTE variants.json 与 meta.versions 一致', variants.length === meta.versions, `${variants.length} vs ${meta.versions}`);
expect('SMPTE Pagefind 页数与 meta.versions 一致', pagefind.languages?.en?.page_count === meta.versions,
  `${pagefind.languages?.en?.page_count} vs ${meta.versions}`);
expect('meta.snapshot_date 是 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(meta.snapshot_date), meta.snapshot_date);

const smpte = read('layouts/colour/smpte.html');
const smpteJs = read('assets/js/tool-smpte.js');
expect('SMPTE 页面从 meta.json 取数', smpte.includes('os.ReadFile "static/smpte/data/meta.json"'));
expect('SMPTE 页面不再硬编码 905', !/<b>905<\/b>/.test(smpte));
expect('SMPTE 页面不再硬编码 1,234', !/<b>1,234<\/b>/.test(smpte));
expect('SMPTE 页面快照日期来自 meta', smpte.includes('substr $meta.snapshot_date 5'));
expect('工具页 SMPTE 描述从 meta 取数', toolsIndex.includes('$sm.families'));
expect('SMPTE 文案不再使用「全文检索」', !/全文检索/.test(smpte) && !/全文检索/.test(smpteJs));
expect('SMPTE 搜索占位不再说「正文」', !/正文或关键词/.test(smpte));

// ---------------------------------------------------------------------------
// 5. 构建产物检查
// ---------------------------------------------------------------------------
function walkHtml(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'internal') continue; // 内部密文页不在公开一致性范围内
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const ATTR = /(?:href|src)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
function resolveBuilt(p) {
  const clean = decodeURIComponent(p.split('#')[0].split('?')[0]);
  if (!clean) return null;
  const rel = clean.replace(/^\//, '');
  const cands = clean.endsWith('/') ? [path.join(builtRoot, rel, 'index.html')] : [
    path.join(builtRoot, rel),
    path.join(builtRoot, rel, 'index.html'),
    path.join(builtRoot, rel + '.html'),
  ];
  return cands.find((x) => fs.existsSync(x)) || null;
}

if (builtDir) {
  console.log('同步检查 · 构建产物');
  const toolsHtml = fs.readFileSync(path.join(builtRoot, 'tools/index.html'), 'utf8');
  const descs = [...toolsHtml.matchAll(/class="?c-tools-desc"?>([^<]*)</g)].map((m) => m[1]);
  let gamutCount = 0;
  for (const s of dataSlugs) {
    if (s === 'st2084' || s === 'hlg') continue;
    const p = `content/colour/${s}/index.md`;
    if (!exists(p)) continue;
    const t = read(p);
    if (!/^primaries\s*=/m.test(t) || /^wip\s*=\s*true/m.test(t)) continue;
    gamutCount++;
  }
  const has = (needle) => descs.some((d) => d.includes(needle));
  const expectTools = 5 + (exists('content/tools/drt/index.md') ? 1 : 0);
  expect('工具页公开描述条数与本地页面一致', descs.length === expectTools, `实际 ${descs.length}，期望 ${expectTools}`);
  expect('色体积描述与坐标/叠加层一致', has(`${coordCount} 种坐标`) && has(`${CN[overlayCount]}种叠加层`));
  expect('色域比对描述与数据一致', has(`全部 ${gamutCount} 个色域`), `期望 ${gamutCount}`);
  expect('传递函数描述与纵轴数一致', has(`${axisCount} 种纵轴`));
  expect('取色读数描述与平面数一致', has(`${CN[planeCount]}种选色平面`));
  expect('SMPTE 描述与 meta 一致', has(`${meta.families} 部标准 / ${fmt(meta.versions)} 个版本`));

  /* 取色读数：仅收录显示原色（原色均在可见光谱轨迹内，不含相机/工作空间/ACES 虚原色） */
  const inspHtml = fs.readFileSync(path.join(builtRoot, 'tools/inspector/index.html'), 'utf8');
  const inspData = JSON.parse((inspHtml.match(/id=inspect-data>([\s\S]*?)<\/script>/) || ['', '{}'])[1]);
  const builtGamuts = inspData.gamuts || [];
  expect('取色读数仅收录显示原色（不含相机/工作空间/ACES）',
    builtGamuts.length === displayGamuts && builtGamuts.every((g) => g.group === 'display-gamut'),
    `${builtGamuts.length} vs ${displayGamuts} (${builtGamuts.filter((g) => g.group !== 'display-gamut').map((g) => g.key).join(', ')})`);
  const unknown = builtGamuts.filter((g) => !dataSlugs.has(g.key));
  expect('取色读数每个色域都指向已登记的资料页', unknown.length === 0, unknown.map((g) => g.key).join(', '));
  const builtKeyDup = [];
  const seenBuilt = new Set();
  for (const g of builtGamuts) {
    const k = (g.group || '') + '|' +
      (g.primaries || []).map((q) => q.map((v) => v.toFixed(5)).join(',')).join(';') + '|' +
      (g.white || []).map((v) => v.toFixed(5)).join(',');
    if (seenBuilt.has(k)) builtKeyDup.push(g.key);
    seenBuilt.add(k);
  }
  expect('取色读数色域下拉没有重复项', builtKeyDup.length === 0, builtKeyDup.join(', '));
  const inspCurveKeys = Object.keys(inspData.curves || {});
  const curveOrphan = inspCurveKeys.filter((k) => !dataSlugs.has(k));
  expect('取色读数下发的采样曲线都属于已登记空间', curveOrphan.length === 0, curveOrphan.join(', '));

  const smpteHtml = fs.readFileSync(path.join(builtRoot, 'tools/smpte/index.html'), 'utf8');
  expect('SMPTE 页面统计与 meta 一致',
    smpteHtml.includes(`<b>${meta.families}</b>`) &&
    smpteHtml.includes(`<b>${fmt(meta.versions)}</b>`) &&
    smpteHtml.includes(`<b>${meta.snapshot_date.slice(5)}</b>`));
  expect('SMPTE 页面无「全文检索」', !/全文检索/.test(smpteHtml));

  const builtPagefind = JSON.parse(fs.readFileSync(path.join(builtRoot, 'smpte/pagefind/pagefind-entry.json'), 'utf8'));
  expect('构建产物里的 Pagefind 页数与 meta 一致', builtPagefind.languages?.en?.page_count === meta.versions);

  /* 色彩模型：总览页四个组件都挂上，单模型页中英都生成（公开分支无模型时跳过） */
  const modelsIndexPath = path.join(builtRoot, 'models/index.html');
  if (fs.existsSync(modelsIndexPath)) {
    const modelsIndexHtml = fs.readFileSync(modelsIndexPath, 'utf8');
    const mounted = new Set([...modelsIndexHtml.matchAll(/data-models-viz=(?:"?)([a-z]+)/g)].map((m) => m[1]));
    expect('总览页挂载四个交互组件',
      ['gradient', 'munsell', 'hdr', 'cam'].every((k) => mounted.has(k)), [...mounted].join(','));
    expect('总览页注入 Munsell 与 sRGB 数据',
      modelsIndexHtml.includes('"munsell"') && modelsIndexHtml.includes('"srgb"'));
    for (const s of (modelDirs || [])) {
      expect(`模型页已生成：${s}`, fs.existsSync(path.join(builtRoot, 'models', s, 'index.html')));
    }
    for (const s of (modelEnDirs || [])) {
      expect(`英文模型页已生成：${s}`, fs.existsSync(path.join(builtRoot, 'en/models', s, 'index.html')));
    }
  } else {
    console.log('  – 跳过构建产物模型页检查：公开分支无模型板块');
  }
  for (const s of zh) expect(`中文页已生成：${s}`, fs.existsSync(path.join(builtRoot, 'colour', s, 'index.html')));
  for (const s of en) expect(`英文页已生成：${s}`, fs.existsSync(path.join(builtRoot, 'en/colour', s, 'index.html')));

  const htmlFiles = walkHtml(builtRoot, []);
  const broken = [];
  const anchorBad = [];
  let internalWords = 0;
  for (const f of htmlFiles) {
    const t = fs.readFileSync(f, 'utf8');
    if (/内部版|\/internal\/|色彩模型|ACES 1\.3/.test(t)) internalWords++;
    for (const m of t.matchAll(ATTR)) {
      const u = m[1] ?? m[2] ?? m[3];
      if (!u || /^(https?:|mailto:|javascript:|data:|tel:)/.test(u)) continue;
      if (!u.startsWith('/') && !u.startsWith('.')) continue;
      const target = resolveBuilt(u);
      if (!target) { broken.push(`${path.relative(root, f)} -> ${u}`); continue; }
      const hash = u.split('#')[1];
      if (hash) {
        const tt = fs.readFileSync(target, 'utf8');
        if (!tt.includes(`id="${hash}"`) && !tt.includes(`id=${hash}`) && !tt.includes(`name="${hash}"`)) anchorBad.push(`${u}`);
      }
    }
  }
  expect('构建产物无坏内链', broken.length === 0, broken.slice(0, 5).join(' | '));
  expect('构建产物无坏锚点', anchorBad.length === 0, anchorBad.slice(0, 5).join(' | '));
  const localHasInternal = exists('content/research') || exists('content/tools/drt/index.md');
  if (localHasInternal) console.log('  – 跳过「公开产物无内部字样」：当前工作区含内部页，需在 main 构建上检查');
  else expect('公开产物无内部/未发布板块字样', internalWords === 0, `${internalWords} 个文件命中`);
}

if (errors.length) {
  console.error(`\n同步检查失败：${errors.length}/${total} 项不通过`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`\n同步检查通过（${total} 项）`);
