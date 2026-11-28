/* 传递函数下拉与 EOTF 实现的一致性：
   1. 模板里的每个曲线值在 colour.js 里都有实现，反之 gamma 表的键都在模板里；
   2. 页面的 eotfOptions 是模板选项表的子集，且 eotfDefault 在选项内；
   3. 纯幂函数页（/colour/tf-power/）只列幂函数曲线，且带「自定义 γ」；
   4. 文案里的 γ 清单与页面下拉的 γ 选项同源。
   运行：node tests/eotf-options.test.mjs */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
const fm = (p) => (read(p).match(/^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/) || ['', ''])[1];
const fmList = (text, key) => {
  const m = text.match(new RegExp('^' + key + '\\s*=\\s*\\[([^\\]]*)\\]', 'm'));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
};
const fmStr = (text, key) => {
  const m = text.match(new RegExp('^' + key + '\\s*=\\s*"([^"]*)"', 'm'));
  return m ? m[1] : null;
};

/* ---------- 1. 模板：选项表 ---------- */
const partial = read('layouts/partials/colour-figure.html');
const tableSrc = (partial.match(/\$curves := slice([\s\S]*?)\n\}\}/) || ['', ''])[1];
ok('模板里有曲线选项表', tableSrc.length > 0);
const tableOpts = [...tableSrc.matchAll(/\(dict\s+"v"\s+"([a-z0-9]+)"\s+"label"\s+([^\n]*?)\s+"pure"\s+(true|false)\)/g)]
  .map((m) => ({ v: m[1], label: m[2].replace(/^"|"$/g, ''), pure: m[3] === 'true' }));
ok('选项表解析出条目', tableOpts.length >= 10, String(tableOpts.length));
const tableByValue = new Map(tableOpts.map((o) => [o.v, o]));
ok('选项表里没有重复值', tableByValue.size === tableOpts.length);
/* 行内正则要能一次抓到一条，逐条核对数量 */
ok('选项表抓取条数与 dict 数一致',
  (tableSrc.match(/\(dict\s+"v"/g) || []).length === tableOpts.length,
  `${(tableSrc.match(/\(dict\s+"v"/g) || []).length} vs ${tableOpts.length}`);

const pureByLabel = new Map();
for (const o of tableOpts) {
  if (o.pure && o.v.startsWith('gamma')) {
    const m = partial.match(new RegExp(`"v"\\s+"${o.v}"\\s+"label"\\s+"Gamma ([^"]+)"`));
    if (m) pureByLabel.set(o.v, m[1]);
  }
}
ok('每个 gamma 选项都能读出标签', pureByLabel.size === tableOpts.filter((o) => o.pure && o.v.startsWith('gamma')).length);

/* ---------- 2. colour.js：γ 表与分支 ---------- */
const js = read('assets/js/colour.js');
const gammaSrc = (js.match(/var EOTF_GAMMA = \{([\s\S]*?)\n  \};/) || ['', ''])[1];
ok('colour.js 里有 EOTF_GAMMA 表', gammaSrc.length > 0);
const gammaKeys = [...gammaSrc.matchAll(/^\s*([a-z0-9]+)\s*:\s*([^,\n]+?),?\s*$/gm)].map((m) => ({ k: m[1], expr: m[2].trim() }));
const gammaValue = (o) => {
  const v = o.expr;
  const m = v.match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? Number(m[1]) / Number(m[2]) : Number(v);
};
ok('γ 表解析出条目', gammaKeys.length >= 6, String(gammaKeys.length));
ok('γ 表的值都是正的有限数', gammaKeys.every((g) => Number.isFinite(gammaValue(g)) && gammaValue(g) > 0));

/* 模板 gamma 选项 ↔ γ 表：键集合一致 */
const tableGammas = tableOpts.filter((o) => o.v.startsWith('gamma')).map((o) => o.v).sort();
const jsGammas = gammaKeys.map((g) => g.k).sort();
/* 标签里的数字必须就是实际幂指数，防止改了一处漏另一处 */
const labelNum = (o) => {
  /* 括号里的十进制是权威值（563/256 写成 2.1992），否则取 Gamma 后面的数 */
  const par = o.label.match(/\(([\d.]+)\)/);
  if (par) return Number(par[1]);
  const m = o.label.match(/Gamma\s+(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
const labelMismatch = tableOpts
  .filter((o) => o.v.startsWith('gamma'))
  .map((o) => {
    const want = labelNum(o);
    const got = gammaValue(gammaKeys.find((g) => g.k === o.v) || { expr: 'NaN' });
    return want === null || !(Math.abs(want - got) < 5e-5) ? `${o.v}: 标签 ${want} vs 实现 ${got}` : null;
  })
  .filter(Boolean);
ok('gamma 选项标签里的数字与实际幂指数一致', labelMismatch.length === 0, labelMismatch.join('; '));

ok('模板 gamma 选项与 γ 表键一一对应',
  tableGammas.length === jsGammas.length && tableGammas.every((v, i) => v === jsGammas[i]),
  `模板 ${tableGammas.join(',')} vs JS ${jsGammas.join(',')}`);

/* 非幂函数选项：eotf() 里必须有对应分支 */
const eotfSrc = (js.match(/function eotf\(type, v, lw, lb, gam\) \{([\s\S]*?)\n    \}\n/) || ['', ''])[1];
ok('colour.js 里找到 eotf()', eotfSrc.length > 0);
const missingBranch = tableOpts
  .filter((o) => !o.v.startsWith('gamma'))
  .filter((o) => !eotfSrc.includes(`type === '${o.v}'`))
  .map((o) => o.v);
ok('非幂函数选项在 eotf() 里都有分支', missingBranch.length === 0, missingBranch.join(','));
ok('自定义 γ 走输入的幂指数', /type === 'custom' \? gam/.test(eotfSrc));
ok('纯幂函数用 const lw * v^γ 形式', /Math\.pow\(Math\.max\(v, 0\), power\)/.test(eotfSrc) && /lw \* /.test(eotfSrc));

/* 输入控件的读取与钳位 */
ok('params() 读取手动输入的 γ', /gamma: clampGamma\(gInput \? parseFloat\(gInput\.value\)/.test(js));
ok('手动 γ 有钳位区间', /CUSTOM_GAMMA_MIN = 0\.1, CUSTOM_GAMMA_MAX = 5/.test(js));
ok('手动 γ 输入框只在非 custom 时禁用', /if \(gInput\) gInput\.disabled = p\.type !== 'custom'/.test(js));
ok('改动手动 γ 会重绘', /\[lwInput, lbInput, gInput\]\.forEach/.test(js));

/* ---------- 3. 页面：eotfOptions / eotfDefault ---------- */
const pages = readdirSync(path.join(root, 'content/colour'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(root, 'content/colour', d.name, 'index.md')))
  .map((d) => d.name)
  .filter((s) => !/^_/.test(s));

const withDefault = pages.filter((s) => fmStr(fm(`content/colour/${s}/index.md`), 'eotfDefault'));
ok('有 EOTF 图的页面数量合理', withDefault.length >= 6, String(withDefault.length));

for (const s of withDefault) {
  const text = fm(`content/colour/${s}/index.md`);
  const def = fmStr(text, 'eotfDefault');
  const opts = fmList(text, 'eotfOptions');
  const list = opts || tableOpts.map((o) => o.v);
  ok(`${s}：eotfDefault 在选项内`, list.includes(def), `${def} 不在 ${list.join(',')}`);
  for (const v of opts || []) {
    ok(`${s}：eotfOptions 的 ${v} 在模板选项表里`, v === 'custom' || tableByValue.has(v));
  }
  ok(`${s}：eotfOptions 没有重复`, !opts || new Set(opts).size === opts.length);
  /* 用了 custom 就必须有手动输入框，否则控件对不上 */
  const wantsCustom = (opts || []).includes('custom');
  ok(`${s}：custom 与手动输入控件配套`,
    !wantsCustom || (partial.includes('{{ if $manual }}') && partial.includes('class="c-eotf-g"')
      && js.includes("querySelector('.c-eotf-g')")));
}

/* ---------- 4. 纯幂函数页 ---------- */
const powerFm = fm('content/colour/tf-power/index.md');
const powerOpts = fmList(powerFm, 'eotfOptions') || [];
ok('/colour/tf-power/ 定义了 eotfOptions', powerOpts.length > 0);
const nonGamma = ['srgb', 'bt1886', 'hlg', 'cinity', 'pq'];
/* 按模板里的 pure 标记判：漏标一个 false 也会被下一条断言抓住 */
const leakedByTable = powerOpts.filter((v) => tableByValue.has(v) && !tableByValue.get(v).pure);
ok('/colour/tf-power/ 不列非幂函数曲线（按模板 pure 标记）', leakedByTable.length === 0, leakedByTable.join(','));
const leaked = powerOpts.filter((v) => nonGamma.includes(v));
ok('/colour/tf-power/ 不列非幂函数曲线（按已知清单复核）', leaked.length === 0, leaked.join(','));
ok('模板的 pure 标记与实际一致（幂函数为真、其余为假）',
  tableOpts.every((o) => o.pure === (o.v.startsWith('gamma') || o.v === 'custom')));
ok('/colour/tf-power/ 的选项都是幂函数或 custom',
  powerOpts.every((v) => v === 'custom' || v.startsWith('gamma')), powerOpts.join(','));
ok('/colour/tf-power/ 补上了 Gamma 2.8', powerOpts.includes('gamma28'));
ok('/colour/tf-power/ 提供自定义 γ', powerOpts.includes('custom'));
ok('/colour/tf-power/ 默认值仍是 Gamma 2.2', fmStr(powerFm, 'eotfDefault') === 'gamma22');
/* 纯幂函数页就是这类曲线的参考页：模板里的每条幂次都应出现在这里 */
const tableGammaAll = tableOpts.filter((o) => o.v.startsWith('gamma')).map((o) => o.v);
ok('/colour/tf-power/ 覆盖模板里的全部幂次',
  tableGammaAll.every((v) => powerOpts.includes(v)),
  `缺：${tableGammaAll.filter((v) => !powerOpts.includes(v)).join(',') || '无'}`);
ok('/colour/tf-power/ 包含 2.2222 (=1/0.45)', powerOpts.includes('gamma2222'));
ok('/colour/tf-power/ 包含 2.35 (EBU)', powerOpts.includes('gamma235'));
/* 下拉顺序按幂次递增，方便对照 */
const ordered = tableOpts.filter((o) => o.v.startsWith('gamma')).map((o) => gammaValue(gammaKeys.find((g) => g.k === o.v)));
ok('模板里 gamma 选项按幂次递增排列',
  ordered.every((v, i) => i === 0 || v > ordered[i - 1]),
  ordered.join(' < '));
const customDefault = fmStr(powerFm, 'eotfGamma');
ok('/colour/tf-power/ 的初始自定义 γ 在这个区间内',
  customDefault === null || (Number(customDefault) >= 0.1 && Number(customDefault) <= 5), String(customDefault));

/* 其它页面未被收窄：仍按模板全表 */
const untouched = withDefault.filter((s) => s !== 'tf-power');
for (const s of untouched) {
  ok(`${s} 不收窄下拉（保持全表）`, fmList(fm(`content/colour/${s}/index.md`), 'eotfOptions') === null);
}

/* ---------- 5. 文案与下拉同源 ---------- */
const yaml = read('data/colourspaces.yaml');
const entry = (yaml.match(/slug:\s*tf-power[\s\S]{0,300}/) || [''])[0];
const transferZh = (entry.match(/transfer:\s*(.+)/) || ['', ''])[1];
const transferEn = (entry.match(/transferEn:\s*"([^"]*)"/) || ['', ''])[1];
ok('colourspaces.yaml 的 tf-power 条目存在', transferZh.length > 0 && transferEn.length > 0);
const proseNums = (transferZh.match(/\d+\.\d+/g) || []).map(Number);
ok('色彩空间索引的 γ 清单非空', proseNums.length >= 5, transferZh);
/* 文案里写的 γ 必须都在下拉的 γ 选项里 */
const optionGammaVals = powerOpts
  .filter((v) => v.startsWith('gamma'))
  .map((v) => gammaValue(gammaKeys.find((g) => g.k === v)));
ok('索引页 γ 清单 ⊆ 下拉 γ 选项',
  proseNums.every((n) => optionGammaVals.some((g) => Math.abs(g - n) < 0.0005)),
  `文案 ${proseNums.join(',')} vs 下拉 ${optionGammaVals.join(',')}`);
ok('中英文案一致地提到 2.8', /2\.8/.test(transferZh) && /2\.8/.test(transferEn));

if (fails.length) {
  console.error(`✗ eotf-options：${fails.length} 条失败`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`✓ eotf-options：${pass} 条断言通过`);
