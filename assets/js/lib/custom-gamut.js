/*
 * 自定义 Gamut（纯函数）：原色凸包、点包含判定与 URL 编解码。
 * 浏览器里挂在 window.CustomGamut，Node 里可以 require（tests/custom-gamut.test.mjs）。
 *
 * 口径：xy 上的色域 = 各原色的凸包。加色混合的非负权重可以取到原色的
 * 任意凸组合，所以边界就是凸包；3 个原色时退化为三角形，>3 时是多边形。
 * 白点不参与面积，只作为「这个色域声称的白」随定义保存。
 *
 * mp 编码与色体积工具的 encodeMulti / decodeMulti 同格式：
 *   x1,y1_x2,y2_...*wx,wy[ *权重/固定项 ]
 * 这样两页的深链可以互相带定义；色体积那边要求 y > 0 的物理显示原色，
 * 这里放宽到 |x|,|y| ≤ 2，允许相机色域那种负 y 的原色。
 */
(function (root) {
  'use strict';

  var LIMIT = 2;          // 坐标绝对值上限：挡掉 64 这类明显手误
  var MIN_N = 3;
  var MAX_N = 8;
  var D65 = [0.3127, 0.3290];
  var DEFAULT = {
    primaries: [[0.6400, 0.3300], [0.3000, 0.6000], [0.1500, 0.0600]],
    white: D65.slice()
  };

  function isFiniteNum(v) {
    return typeof v === 'number' && isFinite(v) && Math.abs(v) <= LIMIT;
  }

  function isPrimaries(list) {
    if (!Array.isArray(list) || list.length < MIN_N || list.length > MAX_N) return false;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!Array.isArray(p) || p.length < 2 || !isFiniteNum(p[0]) || !isFiniteNum(p[1])) return false;
    }
    return true;
  }

  function isWhite(w) {
    return Array.isArray(w) && w.length >= 2 && isFiniteNum(w[0]) && isFiniteNum(w[1]) && w[1] > 0;
  }

  function defaultDef() {
    return {
      primaries: DEFAULT.primaries.map(function (p) { return p.slice(); }),
      white: DEFAULT.white.slice()
    };
  }

  function cross(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  /* 单调链凸包，返回逆时针顶点（与 geom2d.clipPolygon 的裁剪方向一致）。
     共线点被丢掉；点不足 3 个或全部共线时返回 ≤ 2 个点，调用方据此判退化。 */
  function convexHull(points) {
    var pts = [];
    (points || []).forEach(function (p) {
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
      pts.push([+p[0], +p[1]]);
    });
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var uniq = [];
    for (var i = 0; i < pts.length; i++) {
      var last = uniq[uniq.length - 1];
      if (last && last[0] === pts[i][0] && last[1] === pts[i][1]) continue;
      uniq.push(pts[i]);
    }
    if (uniq.length < 3) return uniq;

    var lower = [];
    for (i = 0; i < uniq.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], uniq[i]) <= 0) lower.pop();
      lower.push(uniq[i]);
    }
    var upper = [];
    for (i = uniq.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], uniq[i]) <= 0) upper.pop();
      upper.push(uniq[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  /* 点是否在逆时针凸多边形内（含边界，容差 1e-9） */
  function polygonContains(poly, pt, eps) {
    if (!poly || poly.length < 3 || !pt) return false;
    var tol = typeof eps === 'number' ? eps : 1e-9;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var side = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
      if (side < -tol) return false;
    }
    return true;
  }

  /* 4 位小数与色体积工具一致；定义不合法时返回空串，不把坏状态写进 URL */
  function encode(def) {
    if (!def || !isPrimaries(def.primaries) || !isWhite(def.white)) return '';
    var prim = def.primaries.map(function (p) {
      return p[0].toFixed(4) + ',' + p[1].toFixed(4);
    }).join('_');
    return prim + '*' + def.white[0].toFixed(4) + ',' + def.white[1].toFixed(4);
  }

  /* 段 3（色体积的权重 / 固定项）在这里没有意义，读到时忽略，
     这样从色体积复制过来的 mp 也能直接用。 */
  function decode(text) {
    if (!text) return null;
    var seg = String(text).split('*');
    var parts = seg[0].split('_');
    if (parts.length < MIN_N || parts.length > MAX_N) return null;
    var primaries = [];
    for (var i = 0; i < parts.length; i++) {
      var a = parts[i].split(',').map(Number);
      if (a.length !== 2 || !isFiniteNum(a[0]) || !isFiniteNum(a[1])) return null;
      primaries.push([a[0], a[1]]);
    }
    var white = D65.slice();
    if (seg[1]) {
      var w = seg[1].split(',').map(Number);
      if (w.length !== 2 || !isWhite(w)) return null;
      white = [w[0], w[1]];
    }
    return { primaries: primaries, white: white };
  }

  var api = {
    LIMIT: LIMIT,
    DEFAULT: DEFAULT,
    defaultDef: defaultDef,
    convexHull: convexHull,
    polygonContains: polygonContains,
    encode: encode,
    decode: decode,
    isPrimaries: isPrimaries,
    isWhite: isWhite
  };
  root.CustomGamut = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
