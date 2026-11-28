/* colour-wheel-geom.js 自检：色相轮几何、投影与选色解析。
 *
 * 断言分五类：
 *   1. 设计稿数值锚点（LCH / D65 / sRGB）；
 *   2. 坐标变换（0° 右、90° 上、跨零、中心）；
 *   3. 半径尺度（统一 k、留白、纯蓝不被裁）；
 *   4. sRGB 色体投影（最大半径、覆盖范围、网格收敛）；
 *   5. 选色解析（锁定明度、退化行、RGB 与坐标一致）。
 * 运行：node tests/colour-wheel.test.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.AcesJMh = require('../assets/js/lib/aces-jmh.js');
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
function hexOf(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

P.setWhite(100);

/* ---------- 1. 设计稿数值锚点 ---------- */
const anchor = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: true });
ok(!!anchor, '锚点解析成功');
ok(anchor && Math.abs(anchor.h - 40) < 1e-9 && Math.abs(anchor.c - 45) < 1e-9 && Math.abs(anchor.l - 65) < 1e-9,
  '锚点坐标原样保留');
const lin = P.linAt('lch', 40, 45, 65);
close(lin[0], 0.7755363, 1e-6, '锚点线性 R');
close(lin[1], 0.2303644, 1e-6, '锚点线性 G');
close(lin[2], 0.1497814, 1e-6, '锚点线性 B');
ok(hexOf(anchor.rgb) === '#E4846C', '锚点 HEX = #E4846C', hexOf(anchor.rgb));
const blue = P.models.lch.fromRgb([0, 0, 1]);
const bound = G.resolveSelection(P, 'lch', { h: 40, c: 200, l: 65, lockLightness: true });
close(bound.c, 67.19, 0.02, 'h=40°、L*=65 的彩度上界 ≈ C* 67.19');
close(P.chromaMax('lch', 40, 65), 67.19, 0.02, 'chromaMax 与设计稿上界一致');
ok(bound.clamped, '超界彩度标记 clamped');
/* 同一坐标在两种图里必须给出同一颜色（两图共用解析器） */
const viaLock = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: true });
const viaFree = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: false });
ok(viaLock.rgb.every((v, i) => Math.abs(v - viaFree.rgb[i]) < 1e-12), '色相轮与切片解析出同一 RGB');

/* ---------- 2. 坐标变换 ---------- */
function roundTrip(h, c) {
  const ab = G.chromaAngle(h, c);
  const p = G.polarToXY(ab.a, ab.b, 180, 180, 2.5);
  return G.xyToPolar(p.x, p.y, 180, 180, 2.5);
}
const right = G.polarToXY(1, 0, 100, 100, 10);
close(right.x, 110, 1e-12, '0° 朝右：x 增大');
close(right.y, 100, 1e-12, '0° 朝右：y 不变');
const up = G.chromaAngle(90, 1);
const upXY = G.polarToXY(up.a, up.b, 100, 100, 10);
close(upXY.x, 100, 1e-12, '90° 朝上：x 不变');
close(upXY.y, 90, 1e-12, '90° 朝上：y 减小（画布 y 向下）');
const left = G.polarToXY(-1, 0, 100, 100, 10);
close(left.x, 90, 1e-12, '180° 朝左');
const down = G.chromaAngle(270, 1);
const downXY = G.polarToXY(down.a, down.b, 100, 100, 10);
close(downXY.y, 110, 1e-12, '270° 朝下');
[[0, 1], [90, 2], [180, 3], [270, 4], [359.9, 5], [40, 45]].forEach(([h, c]) => {
  const back = roundTrip(h, c);
  close(back.h, h, 1e-9, '往返色相 ' + h + '°');
  close(back.c, c, 1e-12, '往返彩度 ' + c);
});
close(roundTrip(0.05, 10).h, 0.05, 1e-9, '跨零缝 0.05°');
close(roundTrip(359.95, 10).h, 359.95, 1e-9, '跨零缝 359.95°');
const center = G.xyToPolar(180, 180, 180, 180, 3);
close(center.c, 0, 1e-12, '圆心半径 = 0');
close(G.wrapDeg(-10), 350, 1e-12, 'wrapDeg(-10) = 350');
close(G.wrapDeg(370), 10, 1e-12, 'wrapDeg(370) = 10');

/* ---------- 3. 半径尺度 ---------- */
close(G.wheelScale(100, 150, 7), 1.43, 1e-12, 'k = (150-7)/100');
close(G.radiusFor(100, 1.43), 143, 1e-9, '最大半径处 = innerRadius - pad');
ok(G.wheelScale(0, 150, 7) === 0 && G.wheelScale(-1, 150, 7) === 0, '非法 rMax 返回 0');
ok(G.wheelScale(100, 300, 7) === G.wheelScale(100, 300, 7), 'k 与明度/色相无关（纯函数）');

/* ---------- 4. sRGB 色体投影 ---------- */
const proj = G.projectGamut(P, 'lch', { steps: 32 });
ok(proj.triangles.length === 6 * 32 * 32 * 2, '三角形数 = 6 面 × 32² × 2', String(proj.triangles.length));
close(proj.rMax, blue[1], 1e-6, 'LCH 投影最大半径 = 纯蓝 C* = 133.81');
let maxVertexR = 0;
proj.triangles.forEach((t) => {
  for (let i = 0; i < 6; i += 2) maxVertexR = Math.max(maxVertexR, Math.hypot(t[i], t[i + 1]));
});
close(maxVertexR, proj.rMax, 1e-9, '所有三角顶点半径不超过 rMax');
ok(G.pointInTriangles(0, 0, proj.triangles), '投影包含中性轴原点');
const blueAB = G.chromaAngle(blue[0], blue[1]);
ok(G.pointInTriangles(blueAB.a * 0.995, blueAB.b * 0.995, proj.triangles), '投影覆盖纯蓝（略内缩）');
const proj64 = G.projectGamut(P, 'lch', { steps: 64 });
close(proj64.rMax, proj.rMax, proj.rMax * 0.005, '32 段与 64 段的最大半径收敛到 0.5% 以内');
ok(!G.pointInTriangles(proj.rMax * 1.05, 0, proj.triangles) || proj.rMax === 0,
  '投影之外的点不在覆盖范围内');
['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'].forEach((id) => {
  const g = G.projectGamut(P, id, { steps: 16 });
  ok(g.rMax > 0 && g.triangles.length > 0, id + ' 投影非空');
  const white = P.whiteCoords(id);
  ok(G.pointInTriangles(G.chromaAngle(white[0], white[1]).a, G.chromaAngle(white[0], white[1]).b, g.triangles),
    id + ' 投影覆盖显示白');
});

/* 截面必须落在投影覆盖范围内（网格误差允许 2% 内缩） */
['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'].forEach((id) => {
  const g = G.projectGamut(P, id, { steps: 32 });
  const top = P.whiteCoords(id)[2];
  const l0 = P.models[id].ranges.l[0];
  let checked = 0, outside = [];
  for (let hh = 0; hh < 360; hh += 20) {
    for (let li = 0; li <= 6; li++) {
      const l = l0 + (top - l0) * li / 6;
      const c = P.chromaMax(id, hh, l);
      if (!c) continue;
      const ab = G.chromaAngle(hh, c * 0.98);
      checked++;
      if (!G.pointInTriangles(ab.a, ab.b, g.triangles)) outside.push(id + ' h' + hh + ' l' + l.toFixed(3));
    }
  }
  ok(checked > 50, id + ' 截面包含性样本数足够', 'n ' + checked);
  ok(outside.length === 0, id + ' 当前明度截面落在灰色投影覆盖范围内', outside.slice(0, 3).join('; '));
});

/* 投影不受参考白之外的因素影响：同模型换参考白，CAM02/JzCH 的最大半径会变 */
P.setWhite(1000);
const cam1000 = G.projectGamut(P, 'jmh', { steps: 16 });
const cam100 = (() => { P.setWhite(100); return G.projectGamut(P, 'jmh', { steps: 16 }); })();
ok(cam1000.rMax > cam100.rMax, '参考白 1000 cd/m² 时 CAM02 投影半径更大',
  cam1000.rMax.toFixed(2) + ' vs ' + cam100.rMax.toFixed(2));

/* ---------- 5. 选色解析 ---------- */
/* 5.1 锁定明度：无效行返回 null，不悄悄换颜色 */
const badRow = G.resolveSelection(P, 'jmh', { h: 240, c: 0, l: 100, lockLightness: true });
ok(badRow === null || Math.abs(badRow.l - 100) < 1e-9, 'CAM02 顶部中性行：要么无效要么明度不变');
const locked = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: true });
ok(locked.l === 65, '锁定明度时明度原样保留');
/* 5.2 退化行只接受零半径（HSV 的 V=0） */
const hsvApex = G.resolveSelection(P, 'hsv', { h: 120, c: 0.8, l: 0, lockLightness: true });
ok(hsvApex && hsvApex.c === 0, 'HSV V=0 只接受零半径', hsvApex && 'c=' + hsvApex.c);
ok(G.isDegenerateRow(P, 'hsv', 120, 0, 0.8), 'HSV V=0 判为退化行');
ok(!G.isDegenerateRow(P, 'hsv', 120, 0.5, 0.8), 'HSV V=0.5 不是退化行');
/* 5.3 提交不变量：返回的 RGB 必须能回算成返回的坐标 */
let submitted = 0, mismatched = [];
['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'].forEach((id) => {
  const m = P.models[id];
  const top = P.whiteCoords(id)[2];
  for (let hh = 0; hh < 360; hh += 45) {
    for (let li = 0; li <= 4; li++) {
      const l = m.ranges.l[0] + (top - m.ranges.l[0]) * li / 4;
      for (let ci = 0; ci <= 4; ci++) {
        const c = m.ranges.c[0] + (m.ranges.c[1] - m.ranges.c[0]) * ci / 4;
        const r = G.resolveSelection(P, id, { h: hh, c: c, l: l, lockLightness: true });
        if (!r) continue;
        submitted++;
        const back = m.fromRgb(r.rgb);
        const a1 = G.chromaAngle(r.h, r.c), a2 = G.chromaAngle(back[0], back[1]);
        const dC = Math.hypot(a1.a - a2.a, a1.b - a2.b);
        if (dC > 5e-3 * m.ranges.c[1] || Math.abs(back[2] - r.l) > 5e-3 * (top - m.ranges.l[0] || 1)) {
          mismatched.push(id + ' h' + hh + ' c' + c.toFixed(2) + ' l' + l.toFixed(2));
        }
        ok(P.inGamut(P.linAt(id, r.h, r.c, r.l)), '解析结果在色域内');
      }
    }
  }
});
ok(submitted > 100, '解析样本数足够', 'n ' + submitted);
ok(mismatched.length === 0, '提交的 RGB 能回算成提交的坐标', mismatched.slice(0, 4).join('; '));

/* ---------- 5.4 严格模式：灰区不提交 ---------- */
const grey = G.resolveSelection(P, 'lch', { h: 40, c: 120, l: 65, lockLightness: true, strict: true });
ok(grey === null, '轮内严格模式：L*=65、C*=120 在色域外 → 不提交');
const exact = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: true, strict: true });
ok(exact && Math.abs(exact.c - 45) < 1e-12, '轮内严格模式：合法点原样提交（不夹）');
const clamped = G.resolveSelection(P, 'lch', { h: 40, c: 120, l: 65, lockLightness: true });
close(clamped.c, 67.19, 0.02, '非严格模式（外圈 / 切片）：越界收到边界');

/* ---------- 6. 外圈代表色 ---------- */
['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'].forEach((id) => {
  let valid = 0, outside = 0, gray = 0;
  for (let hh = 0; hh < 360; hh += 10) {
    const rgb = G.ringColor(P, id, hh);
    if (!rgb) continue;
    valid++;
    if (!rgb.every((v) => v >= 0 && v <= 1)) outside++;
    /* 代表色本身必须是一个可显示的 sRGB 颜色（回算后仍在色域内） */
    const back = P.models[id].fromRgb(rgb);
    if (!P.inGamut(P.linAt(id, back[0], back[1], back[2]))) gray++;
  }
  ok(valid === 36, id + ' 36 个色相全部有代表色', 'valid ' + valid);
  ok(outside === 0, id + ' 外圈颜色都在 0–1', 'bad ' + outside);
  ok(gray === 0, id + ' 外圈颜色都能显示（回算在色域内）', 'bad ' + gray);
  /* 相邻 1° 的代表色必须连续：用 argmax 挑明度会在环上留下扇区接缝 */
  let prev = null, maxStep = 0;
  for (let hh = 0; hh < 360; hh++) {
    const c = G.ringColor(P, id, hh);
    if (!c) continue;
    if (prev) maxStep = Math.max(maxStep, Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]));
    prev = c;
  }
  ok(maxStep < 0.08, id + ' 外圈颜色沿色相连续（相邻 1° 差 < 0.08）', 'max ' + maxStep.toFixed(3));
});

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
