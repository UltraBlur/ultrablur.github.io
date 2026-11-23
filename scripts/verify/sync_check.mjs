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

const ptr = readJSON('data/pointerGamut.json');
const munsell = readJSON('data/munsellRenotation.json');
expect('Pointer 实测点数与描述一致', ptr.lch?.length === 576 && toolsIndex.includes('576'), `data ${ptr.lch?.length}`);
expect('Munsell 色片数与描述一致', munsell.count === 2734 && toolsIndex.includes('2734'), `data ${munsell.count}`);

// ---------------------------------------------------------------------------
// 3. SMPTE：页面统计必须来自 meta.json
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
// 4. 构建产物检查
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

  const smpteHtml = fs.readFileSync(path.join(builtRoot, 'tools/smpte/index.html'), 'utf8');
  expect('SMPTE 页面统计与 meta 一致',
    smpteHtml.includes(`<b>${meta.families}</b>`) &&
    smpteHtml.includes(`<b>${fmt(meta.versions)}</b>`) &&
    smpteHtml.includes(`<b>${meta.snapshot_date.slice(5)}</b>`));
  expect('SMPTE 页面无「全文检索」', !/全文检索/.test(smpteHtml));

  const builtPagefind = JSON.parse(fs.readFileSync(path.join(builtRoot, 'smpte/pagefind/pagefind-entry.json'), 'utf8'));
  expect('构建产物里的 Pagefind 页数与 meta 一致', builtPagefind.languages?.en?.page_count === meta.versions);

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
