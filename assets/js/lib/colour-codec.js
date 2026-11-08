/* 码值换算内核：范围展开 → 解码 → 线性 RGB / XYZ → 编码 → 范围打包。
   只做数学换算，不含 tone mapping、gamut mapping 或自动裁剪。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ColourCodec = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;

  /* ---------- 小矩阵工具 ---------- */
  function flat(m) {
    if (!m) return null;
    if (m.length === 9) return m.slice();
    var out = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) out.push(m[i][j]);
    return out;
  }
  function mul(A, v) {
    return [
      A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
      A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
      A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
    ];
  }
  function inv3(A) {
    var a = A[0], b = A[1], c = A[2], d = A[3], e = A[4], f = A[5], g = A[6], h = A[7], i = A[8];
    var A00 = e * i - f * h, A01 = -(d * i - f * g), A02 = d * h - e * g;
    var det = a * A00 + b * A01 + c * A02;
    if (!det) return null;
    var s = 1 / det;
    return [
      A00 * s, -(b * i - c * h) * s, (b * f - c * e) * s,
      A01 * s, (a * i - c * g) * s, -(a * f - c * d) * s,
      A02 * s, -(a * h - b * g) * s, (a * e - b * d) * s
    ];
  }
  function mul3(A, B) {
    var out = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      out.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]);
    }
    return out;
  }

  /* ---------- 白点与色适应 ---------- */
  function xyToXYZ(x, y) {
    if (!(y > 0)) return null;
    return [x / y, 1, (1 - x - y) / y];
  }
  var BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
  var BRADFORD_INV = inv3(BRADFORD);

  /* Bradford 适应：src/dst 为 xy 白点。返回 XYZ(源白) → XYZ(目标白) 的 3×3 */
  function adaptation(srcXY, dstXY) {
    if (!srcXY || !dstXY) return null;
    var ws = xyToXYZ(srcXY[0], srcXY[1]);
    var wd = xyToXYZ(dstXY[0], dstXY[1]);
    if (!ws || !wd) return null;
    var s = mul(BRADFORD, ws), d = mul(BRADFORD, wd);
    var scale = [d[0] / s[0], d[1] / s[1], d[2] / s[2]];
    var diag = [scale[0], 0, 0, 0, scale[1], 0, 0, 0, scale[2]];
    return mul3(BRADFORD_INV, mul3(diag, BRADFORD));
  }

  /* ---------- 传递函数 ---------- */
  var PQ = { m1: 2610 / 16384, m2: 2523 / 4096 * 128, c1: 3424 / 4096, c2: 2413 / 4096 * 32, c3: 2392 / 4096 * 32 };

  function pqDecode(e) {
    if (!(e > 0)) return 0;
    var p = Math.pow(e, 1 / PQ.m2);
    var num = Math.max(p - PQ.c1, 0);
    var den = PQ.c2 - PQ.c3 * p;
    if (den <= 0) return 10000;
    return 10000 * Math.pow(num / den, 1 / PQ.m1);
  }
  function pqEncode(L) {
    if (!(L > 0)) return 0;
    var Y = Math.min(L, 10000) / 10000;
    var p = Math.pow(Y, PQ.m1);
    return Math.pow((PQ.c1 + PQ.c2 * p) / (1 + PQ.c3 * p), PQ.m2);
  }

  var HLG = { a: 0.17883277, b: 0.28466892, c: 0.55991073 };
  function hlgInvOetf(e) {
    return e <= 0.5 ? (e * e) / 3 : (Math.exp((e - HLG.c) / HLG.a) + HLG.b) / 12;
  }
  function hlgOetf(E) {
    if (E <= 1 / 12) return Math.sqrt(3 * Math.max(E, 0));
    return HLG.a * Math.log(12 * Math.max(E, 0) - HLG.b) + HLG.c;
  }
  function hlgGamma(lw) {
    var v = Math.max(lw, 1);
    if (v >= 400 && v <= 2000) return 1.2 + 0.42 * Math.log10(v / 1000);
    return 1.2 * Math.pow(1.111, Math.log(v / 1000) / Math.LN2);
  }
  /* BT.2020 场景亮度系数；非 BT.2020 原色不能直接借用 */
  var LUMA2020 = [0.2627, 0.6780, 0.0593];
  function luma(rgb, coef) {
    return coef[0] * rgb[0] + coef[1] * rgb[1] + coef[2] * rgb[2];
  }

  function srgbDecode(v) {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function srgbEncode(L) {
    if (L <= 0.0031308) return 12.92 * L;
    return 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
  }
  function bt1886Decode(v, lw, lb) {
    var g = 2.4;
    if (!(lw > lb)) return 0;
    var a = Math.pow(Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g), g);
    var b = Math.pow(lb, 1 / g) / (Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g));
    return a * Math.pow(Math.max(v + b, 0), g);
  }
  function bt1886Encode(L, lw, lb) {
    var g = 2.4;
    if (!(lw > lb)) return 0;
    var a = Math.pow(Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g), g);
    var b = Math.pow(lb, 1 / g) / (Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g));
    return Math.pow(Math.max(L, 0) / a, 1 / g) - b;
  }

  /* 采样曲线：[[code, stops], ...]，按 code 升序；两端各外推一段 */
  function curveFromPairs(pairs) {
    var norm = pairs.map(function (p) { return Array.isArray(p) ? [p[0], p[1]] : [p.c, p.s]; });
    var pts = norm.sort(function (a, b) { return a[0] - b[0]; });
    return {
      codeToStops: function (c) {
        if (!pts.length) return 0;
        if (c <= pts[0][0]) {
          var s0 = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]);
          return pts[0][1] + (c - pts[0][0]) * s0;
        }
        for (var i = 1; i < pts.length; i++) {
          if (c <= pts[i][0]) {
            var a = pts[i - 1], b = pts[i];
            var t = (c - a[0]) / (b[0] - a[0]);
            return a[1] + t * (b[1] - a[1]);
          }
        }
        return pts[pts.length - 1][1];
      },
      stopsToCode: function (s) {
        if (!pts.length) return 0;
        if (s <= pts[0][1]) {
          var k0 = (pts[1][0] - pts[0][0]) / (pts[1][1] - pts[0][1]);
          return pts[0][0] + (s - pts[0][1]) * k0;
        }
        for (var i = 1; i < pts.length; i++) {
          if (s <= pts[i][1]) {
            var a = pts[i - 1], b = pts[i];
            var t = (s - a[1]) / (b[1] - a[1]);
            return a[0] + t * (b[0] - a[0]);
          }
        }
        return pts[pts.length - 1][0];
      },
      points: pts
    };
  }

  /* ---------- 传递函数清单 ----------
     kind: 'scene' 解码得场景线性（0.18 灰 = 0.18）；'display' 解码得 cd/m²
     abs:  true 表示该函数自带绝对亮度（PQ），不受参考白影响 */
  function buildTransfers(spaces, curves) {
    var list = [];
    list.push({
      id: 'lin', label: { zh: '线性', en: 'Linear' }, kind: 'display', abs: false,
      decode: function (v, p) { return v * p.lw; },
      encode: function (L, p) { return L / p.lw; }
    });
    list.push({
      id: 'srgb', label: { zh: 'sRGB 分段', en: 'sRGB piecewise' }, kind: 'display', abs: false,
      decode: function (v, p) { return srgbDecode(v) * p.lw; },
      encode: function (L, p) { return srgbEncode(L / p.lw); }
    });
    [['g22', 2.2], ['g24', 2.4], ['g26', 2.6], ['g563', 563 / 256]].forEach(function (g) {
      list.push({
        id: g[0],
        label: { zh: '纯幂函数 γ ' + (g[0] === 'g563' ? '563/256' : g[1]), en: 'Pure power γ ' + (g[0] === 'g563' ? '563/256' : g[1]) },
        kind: 'display', abs: false, gamma: g[1],
        decode: function (v, p) { return p.lw * Math.pow(Math.max(v, 0), g[1]); },
        encode: function (L, p) { return Math.pow(Math.max(L, 0) / p.lw, 1 / g[1]); }
      });
    });
    list.push({
      id: 'bt1886', label: { zh: 'BT.1886 EOTF', en: 'BT.1886 EOTF' }, kind: 'display', abs: false,
      need: { lb: true },
      decode: function (v, p) { return bt1886Decode(v, p.lw, p.lb); },
      encode: function (L, p) { return bt1886Encode(L, p.lw, p.lb); }
    });
    list.push({
      id: 'pq', label: { zh: 'ST 2084（PQ）', en: 'ST 2084 (PQ)' }, kind: 'display', abs: true,
      decode: function (v) { return pqDecode(v); },
      encode: function (L) { return pqEncode(L); }
    });
    list.push({
      id: 'hlg', label: { zh: 'HLG（BT.2100）', en: 'HLG (BT.2100)' }, kind: 'display', abs: false,
      need: { lw: true, bt2020: true }, vector: true,
      decode: function (v, p) {
        var S = [hlgInvOetf(v[0]), hlgInvOetf(v[1]), hlgInvOetf(v[2])];
        var Y = luma(S, LUMA2020);
        var g = hlgGamma(p.lw);
        var k = p.lw * Math.pow(Math.max(Y, 1e-8), g - 1);
        return [k * S[0], k * S[1], k * S[2]];
      },
      encode: function (RGB, p) {
        var Yd = luma(RGB, LUMA2020);
        if (!(Yd > 0)) return [0, 0, 0];
        var g = hlgGamma(p.lw);
        var Ys = Math.pow(Math.max(Yd, 0) / p.lw, 1 / g);
        var k = p.lw * Math.pow(Math.max(Ys, 1e-8), g - 1);
        return [hlgOetf(RGB[0] / k), hlgOetf(RGB[1] / k), hlgOetf(RGB[2] / k)];
      }
    });

    /* 采样曲线：场景 Log 与 CINITY */
    Object.keys(curves || {}).forEach(function (slug) {
      var sp = (spaces || []).filter(function (s) { return s.slug === slug; })[0];
      var cv = curveFromPairs(curves[slug]);
      if (slug === 'cinity-log') {
        var top = 0;
        cv.points.forEach(function (pt) { if (pt[1] >= 0.999 && !top) top = pt[0]; });
        var sMax = top;
        list.push({
          id: 'cinity', label: { zh: 'CINITY Log', en: 'CINITY Log' }, kind: 'display', abs: false,
          approx: true,
          decode: function (v, p) { return p.lw * Math.pow(2, cv.codeToStops(v) - sMax); },
          encode: function (L, p) { return cv.stopsToCode(sMax + Math.log2(Math.max(L, 1e-8) / p.lw)); }
        });
        return;
      }
      if (!sp || sp.category !== 'Scene Referred') return;
      list.push({
        id: 'scene:' + slug,
        label: { zh: sp.title, en: sp.title },
        kind: 'scene', abs: false, approx: true, space: slug,
        decode: function (v) { return 0.18 * Math.pow(2, cv.codeToStops(v)); },
        encode: function (L) { return cv.stopsToCode(Math.log2(Math.max(L, 1e-8) / 0.18)); }
      });
    });

    return list;
  }

  /* ---------- 编码范围 ---------- */
  /* enc = {mode:'float'} 或 {bits:10, range:'video'} */
  function endpoints(enc) {
    if (!enc || enc.mode === 'float') return { lo: 0, scale: 1, hi: 1 };
    var max = Math.pow(2, enc.bits) - 1;
    if (enc.range === 'video') {
      var shift = Math.pow(2, enc.bits - 8);
      return { lo: 16 * shift, scale: 219 * shift, hi: max };
    }
    return { lo: 0, scale: max, hi: max };
  }
  function expand(value, enc) {
    var e = endpoints(enc);
    return (value - e.lo) / e.scale;
  }
  function compact(norm, enc) {
    var e = endpoints(enc);
    return e.lo + norm * e.scale;
  }
  /* 编码值是否落在标称范围内 */
  function inNominal(norm) { return norm >= -EPS && norm <= 1 + EPS; }

  /* ---------- 色域判定 ---------- */
  function xyOf(XYZ) {
    var s = XYZ[0] + XYZ[1] + XYZ[2];
    if (!(Math.abs(s) > EPS)) return null;
    return [XYZ[0] / s, XYZ[1] / s];
  }
  function inTriangle(pt, prim) {
    if (!pt || !prim) return null;
    function cross(a, b, p) {
      return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    }
    var d1 = cross(prim[0], prim[1], pt);
    var d2 = cross(prim[1], prim[2], pt);
    var d3 = cross(prim[2], prim[0], pt);
    var neg = d1 < -1e-6 || d2 < -1e-6 || d3 < -1e-6;
    var pos = d1 > 1e-6 || d2 > 1e-6 || d3 > 1e-6;
    return !(neg && pos);
  }

  /* ---------- 主流程 ---------- */
  /* src/dst: {space, transfer, params:{lw, lb}, enc}
     opts: {cat:'auto'|'none'|'bradford', bridge:{enabled:bool, sceneToNits:number}} */
  function convert(rgb, src, dst, opts) {
    opts = opts || {};
    var trace = [];
    var problems = [];

    var tS = src.transfer, tD = dst.transfer;
    var mixed = tS.kind !== tD.kind;

    if (tS.need && tS.need.bt2020 && !isBt2020(src.space)) {
      problems.push({ key: 'hlgGamut', text: 'HLG 只能配 BT.2020 原色' });
      return { ok: false, problems: problems, trace: trace };
    }
    if (tD.need && tD.need.bt2020 && !isBt2020(dst.space)) {
      problems.push({ key: 'hlgGamut', text: 'HLG 只能配 BT.2020 原色' });
      return { ok: false, problems: problems, trace: trace };
    }

    /* 1. 范围展开 */
    var norm = rgb.map(function (v) { return expand(v, src.enc); });
    trace.push({ step: 'expand', label: '范围展开', value: norm.map(fmt) });

    /* 2. 解码到线性 */
    var linS;
    if (tS.kind === 'scene') {
      linS = norm.map(function (v) { return tS.decode(v, src.params); });
      trace.push({ step: 'decode', label: '逆编码 → 场景线性（18% = 0.18）', value: linS.map(fmt) });
    } else {
      linS = tS.vector ? tS.decode(norm, src.params) : norm.map(function (v) { return tS.decode(v, src.params); });
      trace.push({ step: 'decode', label: tS.abs ? 'EOTF → 绝对亮度 cd/m²' : 'EOTF → 显示线性（× 参考白）', value: linS.map(fmt) });
    }

    /* 3. 体系衔接 */
    var linearFromScene = tS.kind === 'scene';
    var linear = linS;
    if (mixed) {
      var bridge = opts.bridge || {};
      if (!bridge.enabled || !(bridge.sceneToNits > 0)) {
        problems.push({ key: 'bridge', text: '场景参考与显示参考之间需要先指定线性标定' });
        return { ok: false, problems: problems, trace: trace };
      }
      if (linearFromScene) {
        linear = linS.map(function (v) { return v * bridge.sceneToNits; });
        trace.push({ step: 'bridge', label: '场景线性 × ' + fmt(bridge.sceneToNits) + ' → cd/m²', value: linear.map(fmt) });
      } else {
        linear = linS.map(function (v) { return v / bridge.sceneToNits; });
        trace.push({ step: 'bridge', label: 'cd/m² ÷ ' + fmt(bridge.sceneToNits) + ' → 场景线性', value: linear.map(fmt) });
      }
    }

    /* 4. 相对亮度 → 绝对亮度（内部统一用 cd/m²） */
    var toAbsolute = tS.kind === 'display' && !tS.abs;
    var fromAbsolute = tD.kind === 'display' && !tD.abs;
    var absRGB = linear;
    if (toAbsolute) {
      /* 相对 EOTF 已经乘过参考白，linear 即 cd/m² */
      absRGB = linear;
    }

    /* 5. XYZ 与白点适应 */
    var M = flat(src.space.matrix), Mi = flat(dst.space.matrix);
    if (!M || !Mi) {
      problems.push({ key: 'matrix', text: '所选空间缺少 RGB → XYZ 矩阵' });
      return { ok: false, problems: problems, trace: trace };
    }
    var XYZ = mul(M, absRGB);
    trace.push({ step: 'xyz', label: 'RGB → XYZ', value: XYZ.map(fmt) });

    var cat = opts.cat || 'auto';
    var sameWhite = sameWhitePoint(src.space.white, dst.space.white);
    if (!sameWhite && cat !== 'none') {
      var A = adaptation(src.space.white, dst.space.white);
      if (A) {
        XYZ = mul(A, XYZ);
        trace.push({ step: 'cat', label: 'Bradford 白点适应 → ' + whiteName(dst.space), value: XYZ.map(fmt) });
      }
    } else if (!sameWhite) {
      trace.push({ step: 'cat', label: '不做白点适应', value: XYZ.map(fmt) });
    }

    var invDst = inv3(Mi);
    if (!invDst) {
      problems.push({ key: 'matrix', text: '目标空间矩阵不可逆' });
      return { ok: false, problems: problems, trace: trace };
    }
    var linD = mul(invDst, XYZ);
    trace.push({ step: 'rgb', label: 'XYZ → 目标线性 RGB', value: linD.map(fmt) });

    /* 6. 编码 */
    var codeOut;
    if (tD.kind === 'scene') {
      var sceneLin = linearFromScene && !mixed ? linD : linD;
      if (!linearFromScene && mixed) {
        /* 显示 → 场景：已在上一步换算为场景线性 */
        sceneLin = linD;
      }
      codeOut = sceneLin.map(function (v) { return tD.encode(v, dst.params); });
      trace.push({ step: 'encode', label: '场景线性 → 编码', value: codeOut.map(fmt) });
    } else {
      codeOut = tD.vector ? tD.encode(linD, dst.params) : linD.map(function (v) { return tD.encode(v, dst.params); });
      if (!Array.isArray(codeOut)) codeOut = [codeOut, codeOut, codeOut];
      trace.push({ step: 'encode', label: tD.abs ? 'cd/m² → PQ 编码' : '显示线性 → 编码', value: codeOut.map(fmt) });
    }

    /* 7. 范围打包 */
    var packed = codeOut.map(function (v) { return compact(v, dst.enc); });
    trace.push({ step: 'pack', label: '范围打包', value: packed.map(fmt) });

    /* 8. 状态 */
    var xy = xyOf(mul(Mi, linD));
    var gamutOK = inTriangle(xy, dst.space.primaries);
    var neg = linD.some(function (v) { return v < -1e-6; });
    var normOut = codeOut;
    var whiteLevel = tD.kind === 'scene' ? 1 : (tD.abs ? 10000 : (dst.params.lw || 100));
    var overWhite = linD.some(function (v) { return v > whiteLevel * (1 + 1e-6); });
    var outOfRange = normOut.some(function (v) { return !inNominal(v); });

    return {
      ok: true,
      trace: trace,
      problems: problems,
      out: {
        norm: normOut,
        packed: packed,
        xy: xy,
        inGamut: gamutOK,
        negative: neg,
        overWhite: overWhite,
        outOfRange: outOfRange,
        approx: !!(tS.approx || tD.approx),
        mixed: mixed
      }
    };
  }

  function isBt2020(space) {
    if (!space || !space.primaries) return false;
    var ref = [[0.708, 0.292], [0.170, 0.797], [0.131, 0.046]];
    return ref.every(function (p, i) {
      return Math.abs(p[0] - space.primaries[i][0]) < 1e-4 && Math.abs(p[1] - space.primaries[i][1]) < 1e-4;
    });
  }
  function sameWhitePoint(a, b) {
    if (!a || !b) return true;
    return Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;
  }
  function whiteName(space) { return space && space.white ? space.white.map(function (v) { return v.toFixed(4); }).join(', ') : ''; }
  function fmt(v) {
    if (!isFinite(v)) return String(v);
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e6)) return v.toExponential(3);
    return String(Math.round(v * 1e6) / 1e6);
  }

  return {
    convert: convert,
    buildTransfers: buildTransfers,
    curveFromPairs: curveFromPairs,
    endpoints: endpoints,
    expand: expand,
    compact: compact,
    pqDecode: pqDecode,
    pqEncode: pqEncode,
    hlgInvOetf: hlgInvOetf,
    hlgOetf: hlgOetf,
    adaptation: adaptation,
    inv3: inv3,
    mul: mul,
    mul3: mul3,
    flat: flat,
    xyOf: xyOf,
    inTriangle: inTriangle,
    fmt: fmt
  };
});
