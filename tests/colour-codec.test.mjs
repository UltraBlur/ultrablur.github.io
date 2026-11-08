/* 换算内核的自检：范围、往返、HLG 彩色、白点适应、阻断条件。
   运行：node tests/colour-codec.test.mjs */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const C = require(path.join(here, '..', 'assets/js/lib/colour-codec.js'));
const curvesRaw = JSON.parse(readFileSync(path.join(here, '..', 'data/curves.json'), 'utf8'));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function near(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
}

const srgb = {
  slug: 'primaries-srgb-rec709', title: 'sRGB', category: 'Display Referred',
  primaries: [[0.64, 0.33], [0.3, 0.6], [0.15, 0.06]], white: [0.3127, 0.329],
  matrix: [[0.412390799266, 0.357584339384, 0.180480788402],
    [0.212639005872, 0.715168678768, 0.072192315361],
    [0.019330818716, 0.119194779795, 0.950532152250]]
};
const p3 = {
  slug: 'primaries-p3-d65', title: 'P3-D65', category: 'Display Referred',
  primaries: [[0.68, 0.32], [0.265, 0.69], [0.15, 0.06]], white: [0.3127, 0.329],
  matrix: [[0.486570948648, 0.265667693169, 0.198217285234],
    [0.228974564070, 0.691738521837, 0.079286914094],
    [0, 0.045113381859, 1.043944368901]]
};
const bt2020 = {
  slug: 'primaries-rec2020', title: 'Rec.2020', category: 'Display Referred',
  primaries: [[0.708, 0.292], [0.17, 0.797], [0.131, 0.046]], white: [0.3127, 0.329],
  matrix: [[0.636958048301, 0.144616903586, 0.168880975164],
    [0.262700212011, 0.677998071519, 0.059301716470],
    [0, 0.028072693049, 1.060985057711]]
};
const awg3 = {
  slug: 'arri-logc3', title: 'ARRI WG3 / LogC3', category: 'Scene Referred',
  primaries: [[0.684, 0.313], [0.221, 0.848], [0.0861, -0.102]], white: [0.3127, 0.329],
  matrix: [[0.638007619284, 0.214703856337, 0.097744451431],
    [0.291953779, 0.823841041511, -0.115794820510],
    [0.002798279032, -0.067034235689, 1.153293707417]]
};
/* 曲线在站点里是 [stops, code]，内核要 [code, stops] */
const curves = {};
for (const [slug, pts] of Object.entries(curvesRaw)) {
  if (['cinity-log', 'arri-logc3'].includes(slug)) curves[slug] = pts.map(([s, c]) => [c, s]);
}
const spaces = [srgb, p3, bt2020, awg3];
const transfers = C.buildTransfers(spaces, curves);
const tf = (id) => transfers.find((t) => t.id === id);
const space = (slug) => spaces.find((s) => s.slug === slug);

/* 1. 范围端点 */
ok('8-bit Full 0 → 0', C.expand(0, { mode: 'int', bits: 8, range: 'full' }) === 0);
ok('8-bit Full 255 → 1', C.expand(255, { mode: 'int', bits: 8, range: 'full' }) === 1);
ok('10-bit Video 64 → 0', C.expand(64, { mode: 'int', bits: 10, range: 'video' }) === 0);
ok('10-bit Video 940 → 1', C.expand(940, { mode: 'int', bits: 10, range: 'video' }) === 1);
ok('Video 落在标称范围内', C.compact(0.5, { mode: 'int', bits: 10, range: 'video' }) > 64 &&
  C.compact(0.5, { mode: 'int', bits: 10, range: 'video' }) < 940);

/* 2. 传递函数往返 */
for (const id of ['lin', 'srgb', 'g22', 'g24', 'g563', 'bt1886']) {
  const t = tf(id);
  const p = { lw: 100, lb: 0 };
  for (const v of [0.0, 0.05, 0.18, 0.5, 0.9, 1.0]) {
    const back = t.encode(t.decode(v, p), p);
    ok(id + ' 往返 ' + v, near(back, v, 2e-5), back);
  }
}
const pq = tf('pq');
ok('PQ 1 → 10000 cd/m²', near(pq.decode(1), 10000, 1e-3));
ok('PQ 0 → 0', pq.decode(0) === 0);
for (const L of [0.01, 1, 100, 1000, 10000]) {
  ok('PQ 往返 ' + L, near(pq.decode(pq.encode(L)), L, L * 1e-5 + 1e-9));
}

/* 3. HLG 彩色：逐通道幂会破坏中性色平衡 */
const hlg = tf('hlg');
const p1000 = { lw: 1000 };
const colour = [0.75, 0.45, 0.25];
const hlgLin = hlg.decode(colour, p1000);
const hlgBack = hlg.encode(hlgLin, p1000);
ok('HLG 彩色往返', hlgBack.every((v, i) => near(v, colour[i], 2e-4)), hlgBack.join(','));
const greyHlg = hlg.decode([0.5, 0.5, 0.5], p1000);
ok('HLG 中性灰三通道相等', near(greyHlg[0], greyHlg[1], 1e-9) && near(greyHlg[1], greyHlg[2], 1e-9));
ok('HLG 中性灰亮度 = Lw·E^γ', near(greyHlg[0], 1000 * Math.pow(C.hlgInvOetf(0.5), 1.2 + 0.42 * Math.log10(1)), 1e-6),
  greyHlg[0]);

/* 4. 场景 Log 往返 */
const logc3 = tf('scene:arri-logc3');
for (const v of [0.1, 0.39, 0.5, 0.8]) {
  ok('LogC3 往返 ' + v, near(logc3.encode(logc3.decode(v)), v, 5e-3),
    logc3.encode(logc3.decode(v)));
}

/* 5. 同白点换算：白保持白 */
const whiteOut = C.convert([1, 1, 1], {
  space: srgb, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {
  space: p3, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {});
ok('白点在 sRGB→P3 后仍为白', whiteOut.ok && whiteOut.out.norm.every((v) => near(v, 1, 1e-4)),
  whiteOut.ok ? whiteOut.out.norm.join(',') : 'blocked');

/* 6. 色域判定 */
const redInP3 = C.convert([1, 0, 0], {
  space: srgb, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {
  space: p3, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {});
ok('sRGB 红在 P3 内', redInP3.ok && redInP3.out.inGamut);
const p3GreenInSrgb = C.convert([0, 1, 0], {
  space: p3, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {
  space: srgb, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {});
ok('P3 绿在 sRGB 外', p3GreenInSrgb.ok && p3GreenInSrgb.out.inGamut === false);

/* 7. 场景 → 显示：未标定必须阻断 */
const blocked = C.convert([0.4, 0.4, 0.4], {
  space: awg3, transfer: logc3, params: {}, enc: { mode: 'float' }
}, {
  space: bt2020, transfer: pq, params: {}, enc: { mode: 'float' }
}, {});
ok('场景→显示 未标定被阻断', blocked.ok === false && blocked.problems.some((p) => p.key === 'bridge'));

const bridged = C.convert([0.4, 0.4, 0.4], {
  space: awg3, transfer: logc3, params: {}, enc: { mode: 'float' }
}, {
  space: bt2020, transfer: pq, params: {}, enc: { mode: 'float' }
}, { bridge: { enabled: true, sceneToNits: 100 } });
ok('场景→显示 标定后可以计算', bridged.ok && bridged.out.norm.every((v) => isFinite(v)));

/* 8. 负值与超白不被吞掉 */
const neg = C.convert([0, 1, 0], {
  space: p3, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {
  space: srgb, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {});
ok('超色域产生负值并保留', neg.ok && neg.out.norm.some((v) => v < 0), neg.ok ? neg.out.norm.join(',') : 'blocked');

const superWhite = C.convert([1.5, 1.5, 1.5], {
  space: srgb, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {
  space: p3, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'float' }
}, {});
ok('超白保留为 >1', superWhite.ok && superWhite.out.norm.every((v) => v > 1), superWhite.ok ? superWhite.out.norm.join(',') : 'blocked');

/* 9. HLG 配非 BT.2020 原色 → 阻断 */
const badHlg = C.convert([0.5, 0.5, 0.5], {
  space: srgb, transfer: hlg, params: { lw: 1000 }, enc: { mode: 'float' }
}, {
  space: bt2020, transfer: pq, params: {}, enc: { mode: 'float' }
}, {});
ok('HLG 配 sRGB 被阻断', badHlg.ok === false);

/* 10. 白点适应可关闭 */
const d50ish = [0.3457, 0.3585];
const awgD50 = Object.assign({}, srgb, { slug: 'x', white: d50ish });
const withCat = C.convert([0.5, 0.5, 0.5], {
  space: awgD50, transfer: tf('lin'), params: { lw: 100 }, enc: { mode: 'float' }
}, {
  space: srgb, transfer: tf('lin'), params: { lw: 100 }, enc: { mode: 'float' }
}, { cat: 'auto' });
const noCat = C.convert([0.5, 0.5, 0.5], {
  space: awgD50, transfer: tf('lin'), params: { lw: 100 }, enc: { mode: 'float' }
}, {
  space: srgb, transfer: tf('lin'), params: { lw: 100 }, enc: { mode: 'float' }
}, { cat: 'none' });
ok('白点适应与不适应结果不同', withCat.ok && noCat.ok &&
  Math.abs(withCat.out.norm[0] - noCat.out.norm[0]) > 1e-3,
  withCat.out.norm[0] + ' vs ' + noCat.out.norm[0]);

/* 11. 整数输入往返 */
const intCase = C.convert([64, 64, 64], {
  space: srgb, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'int', bits: 10, range: 'video' }
}, {
  space: srgb, transfer: tf('srgb'), params: { lw: 100 }, enc: { mode: 'int', bits: 10, range: 'video' }
}, {});
ok('10-bit Video 往返近似不变', intCase.ok && Math.abs(intCase.out.packed[0] - 64) < 0.5,
  intCase.ok ? intCase.out.packed[0] : 'blocked');

console.log(pass + ' passed, ' + fails.length + ' failed');
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
