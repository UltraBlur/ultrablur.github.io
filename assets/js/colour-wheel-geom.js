/*
 * 色相轮几何与选色解析（纯函数，不碰 DOM，可在 Node 里单测）
 *
 * 约定：
 * - 模型返回 [h, c, l]，极坐标 a = c cos h、b = c sin h（弧度），
 *   画布 0° 朝右、90° 朝上：x = ox + k·a，y = oy − k·b。
 * - k 只由"投影最大半径 + 留白"决定；明度、色相变化不改变 k。
 * - 选色解析把"用户想选的坐标"变成"实际可提交的坐标 + RGB"，
 *   无效时返回 null，绝不返回一个被悄悄换掉的颜色。
 */
(function (root) {
  'use strict';

  function wrapDeg(h) {
    h = h % 360;
    return h < 0 ? h + 360 : h;
  }
  function chromaAngle(h, c) {
    var r = h * Math.PI / 180;
    return { a: c * Math.cos(r), b: c * Math.sin(r) };
  }
  function polarToXY(a, b, ox, oy, k) {
    return { x: ox + k * a, y: oy - k * b };
  }
  function xyToPolar(x, y, ox, oy, k) {
    var a = (x - ox) / k, b = (oy - y) / k;
    return { a: a, b: b, c: Math.hypot(a, b), h: wrapDeg(Math.atan2(b, a) * 180 / Math.PI) };
  }

  /*
   * 半径尺度：把模型色度 c 映射成像素半径。
   * rMax 是 sRGB 色体投影的最大半径；pad 给游标留出不被边缘裁掉的余地。
   */
  function wheelScale(rMax, innerRadius, pad) {
    var usable = innerRadius - (pad || 0);
    if (!(rMax > 0) || !(usable > 0)) return 0;
    return usable / rMax;
  }

  /* 投影最大半径处、半径为 innerRadius - pad 的像素位置 */
  function radiusFor(c, k) { return c * k; }

  /* ---------------- 选色解析 ---------------- */

  /* 线性几何 → 所选空间的编码值。曲线由 core 的传递函数适配层处理。 */
  function encodeLin(core, lin) {
    var code = core.codeRgbFromLinear ? core.codeRgbFromLinear(lin) : lin.map(core.encode);
    if (!code) return null;
    if (!code.every(function (v) { return isFinite(v) && v >= -2e-5 && v <= 1 + 2e-5; })) return null;
    code = code.map(function (v) { return Math.max(0, Math.min(1, v)); });
    var back = core.linearRgbFromCode ? core.linearRgbFromCode(code) : null;
    if (back && back.some(function (v, i) { return !isFinite(v) || Math.abs(v - lin[i]) > 1.01e-6; })) return null;
    if (core.linearRgbFromCode && !back) return null;
    return code;
  }

  /*
   * 同一 (h, l) 上可提交的彩度：请求值在色域内就原样返回，
   * 超出就收到边界；落在"中性缺口"里则向上找最近的合法彩度。
   */
  function validChromaInRow(core, modelId, h, l, c) {
    if (core.okAt(modelId, h, c, l)) return c;
    var maxC = core.chromaMax(modelId, h, l);
    if (maxC === null) return null;
    if (c >= maxC) return maxC;
    for (var i = 1; i <= 32; i++) {
      var t = c + (maxC - c) * i / 32;
      if (core.okAt(modelId, h, t, l)) return t;
    }
    return null;
  }

  /*
   * 退化行：彩度对颜色没有影响（HSV 的 V=0 锥顶、JMHH 的 J=0 等）。
   * 这些明度上只接受零半径，否则会提交一个"坐标说自己有颜色、实际上是一样的黑"的点。
   */
  function isDegenerateRow(core, modelId, h, l, c) {
    if (!(c > 0)) return false;
    var a = core.linAt(modelId, h, c, l), b = core.linAt(modelId, h, 0, l);
    if (!a || !b) return false;
    /* 阈值取线性 1e-6：encode 之后约 0.003 码值，低于 8 bit 的一个步长，
       所以"差值在这个量级以内"等于"上屏是同一个颜色" */
    return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
  }

  /*
   * 把请求坐标解析成实际提交值。
   *   req.lockLightness = true  → 明度固定（色相轮、外圈）：这一行没有颜色就返回 null
   *   req.lockLightness = false → 明度可变（右侧切片）：先把明度收进范围再收彩度
   *   req.strict = true         → 不夹彩度：请求点不在色域内就返回 null
   *                               （轮内的灰色区域是参照，不能提交选色）
   * 返回 { h, c, l, rgb, clamped } 或 null。
   */
  function resolveSelection(core, modelId, req) {
    var m = core.models[modelId];
    if (!m || !isFinite(req.h) || !isFinite(req.c) || !isFinite(req.l)) return null;
    var h = wrapDeg(req.h);
    var lR = m.ranges.l, cR = m.ranges.c;
    var locked = !!req.lockLightness;
    var l = locked ? req.l : Math.min(lR[1], Math.max(lR[0], req.l));
    if (locked) {
      /* 显示白的明度常常比定义域上限高几个 ulp（例如 L* = 100 + 3.8e-11），
         这点浮点噪声不能当成"越界"——按 1e-9 相对容差夹回端点 */
      var span = lR[1] - lR[0], tol = Math.max(1e-12, span * 1e-9);
      if (l < lR[0] - tol || l > lR[1] + tol) return null;
      l = Math.min(lR[1], Math.max(lR[0], l));
    }
    var c0 = Math.max(cR[0], Math.min(cR[1], req.c));
    var c = req.strict
      ? (core.okAt(modelId, h, c0, l) ? c0 : null)
      : validChromaInRow(core, modelId, h, l, c0);
    if (c === null) {
      if (locked) return null;
      /* 该明度整行都不在色域：朝中点方向找最近的可用明度（保持色相） */
      var mid = (lR[0] + lR[1]) / 2, step = (lR[1] - lR[0]) / 48, found = null;
      for (var i = 1; i <= 48 && found === null; i++) {
        var up = l + step * i, dn = l - step * i;
        if (up <= lR[1] && core.okAt(modelId, h, cR[0], up)) found = up;
        else if (dn >= lR[0] && core.okAt(modelId, h, cR[0], dn)) found = dn;
      }
      if (found === null) return null;
      l = found;
      c = validChromaInRow(core, modelId, h, l, c0);
      if (c === null) return null;
    }
    if (isDegenerateRow(core, modelId, h, l, c)) c = cR[0];
    var lin = core.linAt(modelId, h, c, l);
    if (!core.inGamut(lin)) return null;
    var code = encodeLin(core, lin);
    if (!code) return null;
    /* 用实际编码值回算一次：编码后彩度已经不可区分时（黑点、退化行），
       坐标跟着归零，保证"提交的坐标"与"上屏的颜色"是同一个东西 */
    var back = m.fromRgb(code);
    if (!back) return null;
    if (Math.abs(back[2] - l) > 1e-4 * (lR[1] - lR[0])) return null;
    var aReq = chromaAngle(h, c), aBack = chromaAngle(back[0], back[1]);
    if (Math.hypot(aReq.a - aBack.a, aReq.b - aBack.b) > 1e-6 * (cR[1] - cR[0])) {
      /* 明度也必须能回算，否则这个点不可提交 */
      if (Math.abs(back[2] - l) > 1e-4 * (lR[1] - lR[0])) return null;
      c = Math.max(cR[0], Math.min(cR[1], back[1]));
    }
    return {
      h: h, c: c, l: l,
      lin: lin.slice(),
      /* rgb 保留旧名，含义已是「所选空间的编码 RGB」；code 是显式同义字段 */
      rgb: code,
      code: code,
      clamped: Math.abs(c - c0) > 1e-9 || Math.abs(l - req.l) > 1e-9
    };
  }

  /* ---------------- sRGB 色体投影 ---------------- */

  /*
   * 从当前色域的**线性** RGB 立方体六个面采样，逐点 model.fromLin → (a, b)。
   * 几何边界由线性定义域给出，与传递函数无关：切换 sRGB 分段 / γ 2.4 /
   * BT.1886 不会改变 Lab、OKLCH 的色体轮廓（HSV 例外，它的坐标就是编码值）。
   * 返回三角形并集（每个面 2·steps² 个三角形）与最大半径。
   * 用并集而不是凸包：保留凹处和真实空洞。
   */
  function projectGamut(core, modelId, opts) {
    var m = core.models[modelId];
    var steps = Math.max(4, (opts && opts.steps) || 32);
    var tris = [], rMax = 0;
    if (!m) return { triangles: tris, rMax: 0, samples: 0 };
    var fromLinear = m.fromLin || function (lin) { return m.fromRgb(lin.map(core.encode)); };
    for (var fixed = 0; fixed < 3; fixed++) {
      var free = [0, 1, 2].filter(function (i) { return i !== fixed; });
      for (var side = 0; side < 2; side++) {
        var grid = [];
        for (var i = 0; i <= steps; i++) {
          grid.push([]);
          for (var j = 0; j <= steps; j++) {
            var lin = [0, 0, 0];
            lin[fixed] = side;
            lin[free[0]] = i / steps;
            lin[free[1]] = j / steps;
            var p = fromLinear(lin);
            if (!p) { grid[i].push({ a: 0, b: 0 }); continue; }
            var ab = chromaAngle(p[0], p[1]);
            grid[i].push(ab);
            var r = Math.hypot(ab.a, ab.b);
            if (r > rMax) rMax = r;
          }
        }
        for (var x = 0; x < steps; x++) {
          for (var y = 0; y < steps; y++) {
            var p00 = grid[x][y], p10 = grid[x + 1][y], p01 = grid[x][y + 1], p11 = grid[x + 1][y + 1];
            tris.push([p00.a, p00.b, p10.a, p10.b, p11.a, p11.b]);
            tris.push([p00.a, p00.b, p11.a, p11.b, p01.a, p01.b]);
          }
        }
      }
    }
    return { triangles: tris, rMax: rMax, samples: Math.pow(steps + 1, 2) * 6 };
  }

  /*
   * 把投影三角形光栅化成覆盖掩码（0/1，size×size）。
   * 用逐三角形重心判定而不是 Path2D：1.2 万个子路径的 Path2D 构造在 Chromium 上
   * 要 ~190ms，而三角形数量对应的像素测试总量只有几万次，约 10ms。
   * 坐标与 polarToXY 一致：x = S/2 + k·a，y = S/2 − k·b。
   */
  function rasterizeTriangles(triangles, opts) {
    var S = opts.size, k = opts.k;
    var ox = opts.ox === undefined ? S / 2 : opts.ox;
    var oy = opts.oy === undefined ? S / 2 : opts.oy;
    var mask = new Uint8Array(S * S);
    if (!(k > 0)) return mask;
    for (var i = 0; i < triangles.length; i++) {
      var t = triangles[i];
      var x0 = ox + k * t[0], y0 = oy - k * t[1];
      var x1 = ox + k * t[2], y1 = oy - k * t[3];
      var x2 = ox + k * t[4], y2 = oy - k * t[5];
      var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      var maxX = Math.min(S - 1, Math.ceil(Math.max(x0, x1, x2)));
      var minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      var maxY = Math.min(S - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) continue;
      var den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (!den) continue;
      for (var y = minY; y <= maxY; y++) {
        for (var x = minX; x <= maxX; x++) {
          var px = x + 0.5, py = y + 0.5;
          var l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den;
          if (l0 < 0) continue;
          var l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den;
          if (l1 < 0 || l0 + l1 > 1) continue;
          mask[y * S + x] = 1;
        }
      }
    }
    return mask;
  }

  /* 3×3 盒式模糊一遍，只为了把光栅化的硬边磨掉 */
  function blurMask(mask, size, passes) {
    var src = mask, n = passes || 1;
    for (var p = 0; p < n; p++) {
      var dst = new Uint8Array(size * size);
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var sum = 0, cnt = 0;
          for (var dy = -1; dy <= 1; dy++) {
            var yy = y + dy;
            if (yy < 0 || yy >= size) continue;
            for (var dx = -1; dx <= 1; dx++) {
              var xx = x + dx;
              if (xx < 0 || xx >= size) continue;
              sum += src[yy * size + xx] ? 1 : 0;
              cnt++;
            }
          }
          dst[y * size + x] = Math.round(sum / cnt * 255);
        }
      }
      src = dst;
    }
    return src;
  }

  /*
   * 三角形的投影包围半径（用于判断某点是否落在投影覆盖范围内）。
   * 只做"点是否在某个三角形内"的精确判定，供测试与命中提示使用。
   */
  function pointInTriangles(px, py, tris) {
    for (var i = 0; i < tris.length; i++) {
      var t = tris[i];
      var d1 = (px - t[2]) * (t[1] - t[3]) - (t[0] - t[2]) * (py - t[3]);
      var d2 = (px - t[4]) * (t[3] - t[5]) - (t[2] - t[4]) * (py - t[5]);
      var d3 = (px - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (py - t[1]);
      var neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      var pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      if (!(neg && pos)) return true;
    }
    return false;
  }

  /*
   * 外圈代表色：固定相对明度（默认 62%）上该色相的饱和色。
   * 不要在多个明度里取"彩度最大"——argmax 会随色相在样本间跳变，
   * 环上就出现可见的扇区接缝（实测相邻 1° 的颜色差可达 0.4）。
   * 固定明度时彩度函数随色相连续，环是连续的。
   */
  function ringLinear(core, modelId, h, opts) {
    var m = core.models[modelId];
    if (!m) return null;
    var top = core.whiteCoords(modelId)[2];
    var l0 = m.ranges.l[0], l1 = top > l0 ? top : m.ranges.l[1];
    var frac = (opts && opts.frac !== undefined) ? opts.frac : 0.62;
    var hh = wrapDeg(h);
    var l = l0 + (l1 - l0) * frac;
    var c = core.chromaMax(modelId, hh, l);
    if (c === null || !(c > 0)) return null;
    var lin = core.linAt(modelId, hh, c * 0.92, l);
    return core.inGamut(lin) ? lin : null;
  }
  function ringColor(core, modelId, h, opts) {
    var lin = ringLinear(core, modelId, h, opts);
    return lin ? encodeLin(core, lin) : null;
  }
  /* 外圈的显示色：始终按 sRGB 预览，不受所选曲线影响 */
  function ringSrgb(core, modelId, h, opts) {
    var lin = ringLinear(core, modelId, h, opts);
    if (!lin) return null;
    var xyz = core.xyzFromLin(lin);
    var rgb = core.srgbFromXyz(xyz);
    return rgb.map(function (v) { return Math.max(0, Math.min(1, v)); });
  }

  var api = {
    wrapDeg: wrapDeg,
    chromaAngle: chromaAngle,
    polarToXY: polarToXY,
    xyToPolar: xyToPolar,
    wheelScale: wheelScale,
    radiusFor: radiusFor,
    validChromaInRow: validChromaInRow,
    isDegenerateRow: isDegenerateRow,
    resolveSelection: resolveSelection,
    projectGamut: projectGamut,
    rasterizeTriangles: rasterizeTriangles,
    blurMask: blurMask,
    pointInTriangles: pointInTriangles,
    ringColor: ringColor,
    ringSrgb: ringSrgb,
    ringLinear: ringLinear
  };
  root.ColourWheelGeom = api;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.ColourWheelGeom;
