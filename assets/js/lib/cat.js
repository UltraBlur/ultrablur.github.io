/* 色适应变换内核：von Kries 形式 · 各 CAT 的锥体矩阵 · 适应度 D · Zhai 2018 两步法。
   与 colour-codec.js 的 adaptation() 同源（那里只有 Bradford），这里放开到全部条目。
   只做线性变换与色度坐标换算，不含任何 tone mapping 或裁剪。
   矩阵数值对齐 Python colour-science 的 colour.CHROMATIC_ADAPTATION_TRANSFORMS。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CatTransforms = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 展示顺序：按年份，XYZ Scaling 作为基准反例排在最前。 */
  var CAT_LIST = [
    'xyz-scaling',
    'von-kries',
    'bradford',
    'sharp',
    'cmccat2000',
    'cat02',
    'cat02-brill',
    'bianco-schettini',
    'bianco-pc',
    'cat16'
  ];

  /* XYZ → 锥体响应。数值与各条目页的 M 一致（见 content/cat/<slug>/index.md）。 */
  var CATS = {
    'xyz-scaling': [1, 0, 0,
      0, 1, 0,
      0, 0, 1],
    'von-kries': [0.40024, 0.7076, -0.08081,
      -0.2263, 1.16532, 0.0457,
      0.0000, 0.00000, 0.91822],
    'bradford': [0.8951, 0.2664, -0.1614,
      -0.7502, 1.7135, 0.0367,
      0.0389, -0.0685, 1.0296],
    'sharp': [1.2694, -0.0988, -0.1706,
      -0.8364, 1.8006, 0.0357,
      0.0297, -0.0315, 1.0018],
    'cmccat2000': [0.7982, 0.3389, -0.1371,
      -0.5918, 1.5512, 0.0406,
      0.0008, 0.0239, 0.9753],
    'cat02': [0.7328, 0.4296, -0.1624,
      -0.7036, 1.6975, 0.0061,
      0.0030, 0.0136, 0.9834],
    /* Brill & Süsstrunk 2008：只把第三行换成 [0, 0, 1]。 */
    'cat02-brill': [0.7328, 0.4296, -0.1624,
      -0.7036, 1.6975, 0.0061,
      0.0000, 0.0000, 1.0000],
    'bianco-schettini': [0.8752, 0.2787, -0.1539,
      -0.8904, 1.8709, 0.0195,
      -0.0061, 0.0162, 0.9899],
    /* 正约束解 Bianco PC 2010：负瓣被压到接近 0。 */
    'bianco-pc': [0.6489, 0.3915, -0.0404,
      -0.3775, 1.3055, 0.0720,
      -0.0271, 0.0888, 0.9383],
    'cat16': [0.401288, 0.650173, -0.051461,
      -0.250268, 1.204414, 0.045854,
      -0.002079, 0.048952, 0.953127]
  };

  /* 站内约定的白点 xy（与 data/colourspaces.yaml 同口径）。 */
  var WHITES = {
    D50: [0.3457, 0.3585],
    D55: [0.3324, 0.3474],
    D60: [0.32168, 0.33767],
    D65: [0.3127, 0.3290],
    D75: [0.2990, 0.3149],
    E: [1 / 3, 1 / 3],
    A: [0.44757, 0.40745],
    C: [0.31006, 0.31616]
  };
  var WHITE_LIST = ['A', 'D50', 'D55', 'D60', 'D65', 'D75', 'E', 'C'];

  function flat(m) {
    if (!m) return null;
    if (m.length === 9) return m.slice();
    var out = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) out.push(m[i][j]);
    return out;
  }
  function mulv(A, v) {
    return [
      A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
      A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
      A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
    ];
  }
  function mul3(A, B) {
    var out = [];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        out.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]);
      }
    }
    return out;
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

  function xyToXYZ(x, y) {
    if (!(y > 0)) return null;
    return [x / y, 1, (1 - x - y) / y];
  }
  function xyzToXY(XYZ) {
    var s = XYZ[0] + XYZ[1] + XYZ[2];
    return s > 0 ? [XYZ[0] / s, XYZ[1] / s] : null;
  }
  /* CIE 1976 u'v'：u' = 4X/(X + 15Y + 3Z)，v' = 9Y/(X + 15Y + 3Z)。 */
  function xyzToUV(XYZ) {
    var den = XYZ[0] + 15 * XYZ[1] + 3 * XYZ[2];
    return den > 0 ? [4 * XYZ[0] / den, 9 * XYZ[1] / den] : null;
  }
  function white(name) {
    return WHITES[name] || (Array.isArray(name) ? name : null);
  }
  function whiteXYZ(name) {
    var w = white(name);
    return w ? xyToXYZ(w[0], w[1]) : null;
  }

  /* 白点适应矩阵：M⁻¹ · diag(1 - D + D·b_dst/b_src) · M。
     D = 1 即精确完全适应；D < 1 只作单步模型演示，双向不完全适应请用 zhai2018。
     白点归一到 Y = 1，D 的写法与 CIE 15:2018 式 D.2 一致。 */
  function matrix(slug, srcWhite, dstWhite, D) {
    var M = CATS[slug];
    if (!M) return null;
    var ws = white(srcWhite), wd = white(dstWhite);
    if (!ws || !wd) return null;
    var Mi = inv3(M);
    if (!Mi) return null;
    var bs = mulv(M, xyToXYZ(ws[0], ws[1]));
    var bd = mulv(M, xyToXYZ(wd[0], wd[1]));
    var d = (D === undefined || D === null) ? 1 : D;
    var k = [
      (1 - d) + d * (bd[0] / bs[0]),
      (1 - d) + d * (bd[1] / bs[1]),
      (1 - d) + d * (bd[2] / bs[2])
    ];
    var diag = [k[0], 0, 0, 0, k[1], 0, 0, 0, k[2]];
    return mul3(Mi, mul3(diag, M));
  }

  /* 直接作用于 XYZ（不必先求矩阵） */
  function adapt(XYZ, slug, srcWhite, dstWhite, D) {
    var A = matrix(slug, srcWhite, dstWhite, D);
    if (!A) return null;
    return mulv(A, XYZ);
  }

  /* ---------- Zhai & Luo (2018) 两步法 ---------- */
  /* 对齐 colour.adaptation.chromatic_adaptation_Zhai2018：
     Step 1 源条件 → 基线照明体 BI（默认等能白 E），Step 2 BI → 目标条件（逆向应用）。
     XYZwo 缺省为 [100, 100, 100]；XYZ 与白点同量纲即可。 */
  function zhai2018(XYZ, XYZwb, XYZwd, Db, Dd, slug, XYZwo) {
    var M = CATS[slug];
    if (!M) return null;
    var Mi = inv3(M);
    if (!Mi) return null;
    var wo = XYZwo || [100, 100, 100];
    var rgb = mulv(M, XYZ);
    var wb = mulv(M, XYZwb);
    var wd = mulv(M, XYZwd);
    var ro = mulv(M, wo);
    var yb = XYZwb[1] / wo[1];
    var yd = XYZwd[1] / wo[1];
    var out = [];
    for (var i = 0; i < 3; i++) {
      /* Step 1：源观看条件（D_b）→ BI */
      var step1 = rgb[i] * (Db * yb * (ro[i] / wb[i]) + 1 - Db);
      /* Step 2：BI → 目标观看条件（D_d），把 ref → BI 的式子反过来用 */
      var step2 = step1 / (Dd * yd * (ro[i] / wd[i]) + 1 - Dd);
      out.push(step2);
    }
    return mulv(Mi, out);
  }

  /* 同上，白点用站内 xy；BI 取等能白 E。 */
  function zhai2018ByWhite(XYZ, srcWhite, dstWhite, Db, Dd, slug) {
    var ws = white(srcWhite), wd = white(dstWhite);
    if (!ws || !wd) return null;
    return zhai2018(
      XYZ,
      xyToXYZ(ws[0], ws[1]),
      xyToXYZ(wd[0], wd[1]),
      Db, Dd, slug, [1, 1, 1]
    );
  }

  /* ---------- 色差与色度坐标 ---------- */
  /* XYZ → CIELAB。whiteXYZ 缺省 D65（Y = 1 或 100 均可，比值不变）。 */
  function xyzToLab(XYZ, whiteRef) {
    var W = whiteRef || whiteXYZ('D65');
    var e = 216 / 24389;
    var kappa = 24389 / 27;
    var f = function (t) { return t > e ? Math.cbrt(t) : (kappa * t + 16) / 116; };
    var fx = f(XYZ[0] / W[0]);
    var fy = f(XYZ[1] / W[1]);
    var fz = f(XYZ[2] / W[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  /* 完整 CIEDE2000（Sharma, Wu & Dalal 2005 的实现口径）。 */
  function deltaE00(lab1, lab2) {
    var rad = Math.PI / 180;
    var L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    var L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    var C1 = Math.sqrt(a1 * a1 + b1 * b1);
    var C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cbar = (C1 + C2) / 2;
    var Cbar7 = Math.pow(Cbar, 7);
    var G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
    var a1p = (1 + G) * a1;
    var a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1);
    var C2p = Math.sqrt(a2p * a2p + b2 * b2);

    var h1p = (C1p === 0) ? 0 : Math.atan2(b1, a1p) / rad;
    if (h1p < 0) h1p += 360;
    var h2p = (C2p === 0) ? 0 : Math.atan2(b2, a2p) / rad;
    if (h2p < 0) h2p += 360;

    var dLp = L2 - L1;
    var dCp = C2p - C1p;
    var dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad * dhp / 2);

    var Lbar = (L1 + L2) / 2;
    var Cbarp = (C1p + C2p) / 2;
    var hbarp;
    if (C1p * C2p === 0) {
      hbarp = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
      hbarp = (h1p + h2p) / 2;
    } else if (h1p + h2p < 360) {
      hbarp = (h1p + h2p + 360) / 2;
    } else {
      hbarp = (h1p + h2p - 360) / 2;
    }

    var T = 1 - 0.17 * Math.cos(rad * (hbarp - 30))
      + 0.24 * Math.cos(rad * (2 * hbarp))
      + 0.32 * Math.cos(rad * (3 * hbarp + 6))
      - 0.20 * Math.cos(rad * (4 * hbarp - 63));
    var dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
    var Cbarp7 = Math.pow(Cbarp, 7);
    var RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
    var SL = 1 + (0.015 * Math.pow(Lbar - 50, 2)) / Math.sqrt(20 + Math.pow(Lbar - 50, 2));
    var SC = 1 + 0.045 * Cbarp;
    var SH = 1 + 0.015 * Cbarp * T;
    var RT = -Math.sin(rad * 2 * dTheta) * RC;

    var tL = dLp / SL, tC = dCp / SC, tH = dHp / SH;
    return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
  }

  /* ---------- 有效锥体光谱灵敏度 ---------- */
  /* 输入 data/spectralLocus.json 的 points（每项 [x, y, ybar]，默认 1 nm 步进）。
     x̄ = (x/y)·ȳ，ȳ = ybar，z̄ = ((1 − x − y)/y)·ȳ，再算 M · [x̄, ȳ, z̄]ᵀ。
     返回每条曲线按各自峰值归一后的点与统计（峰值波长、最小值及波长）。 */
  function coneSensitivities(slug, locus, step) {
    var M = CATS[slug];
    if (!M || !locus || !locus.length) return null;
    var st = step || 1;
    var pts = [];
    for (var i = 0; i < locus.length; i++) {
      var x = locus[i][0], y = locus[i][1], ybar = locus[i][2];
      if (!(y > 0)) continue;
      var X = (x / y) * ybar;
      var Z = ((1 - x - y) / y) * ybar;
      pts.push({ wl: 380 + i * st, rgb: mulv(M, [X, ybar, Z]) });
    }
    if (!pts.length) return null;
    var max = [-Infinity, -Infinity, -Infinity];
    for (var j = 0; j < pts.length; j++) {
      for (var c = 0; c < 3; c++) if (pts[j].rgb[c] > max[c]) max[c] = pts[j].rgb[c];
    }
    var out = pts.map(function (p) {
      return {
        wl: p.wl,
        r: max[0] ? p.rgb[0] / max[0] : 0,
        g: max[1] ? p.rgb[1] / max[1] : 0,
        b: max[2] ? p.rgb[2] / max[2] : 0
      };
    });
    var stats = ['r', 'g', 'b'].map(function (key) {
      var peak = -Infinity, peakWl = 380, min = Infinity, minWl = 380;
      for (var k = 0; k < out.length; k++) {
        var v = out[k][key];
        if (v > peak) { peak = v; peakWl = out[k].wl; }
        if (v < min) { min = v; minWl = out[k].wl; }
      }
      return { peak: peak, peakWl: peakWl, min: min, minWl: minWl };
    });
    return { points: out, stats: stats };
  }

  /* ---------- 适应度 D ---------- */
  /* CIECAM02 的指数项（CIE 15:2018 式 D.1，未乘环绕因子 F）：
     D_exp(L_A) = 1 − (1/3.6)·exp[−(L_A + 42)/92] */
  function dExp(LA) {
    return 1 - (1 / 3.6) * Math.exp((-LA - 42) / 92);
  }
  /* CIECAM02：D = F·D_exp，F 取平均 1 · 昏暗 0.9 · 黑暗 0.8（表 D.1），截到 0–1 */
  function dCIECAM02(LA, F) {
    var d = (F === undefined ? 1 : F) * dExp(LA);
    return Math.min(Math.max(d, 0), 1);
  }
  /* CMCCAT2000：两个观看条件的平均亮度与亮度差都进公式，同样截到 0–1 */
  function dCMCCAT2000(LA1, LA2, F) {
    if (!(LA1 + LA2 > 0)) return 0;
    var f = (F === undefined ? 1 : F);
    var d = f * (0.08 * Math.log10(0.5 * (LA1 + LA2)) + 0.76 - 0.45 * (LA1 - LA2) / (LA1 + LA2));
    return Math.min(Math.max(d, 0), 1);
  }

  /* CMCCAT2000 完整正向式：比纯 von Kries 多一个亮度因子 a = D·Y_src/Y_dst。
     XYZ 与白点用同一量纲即可（线性，量纲相消）。 */
  function cmccat2000XYZ(XYZ, XYZw, XYZwr, LA1, LA2, F) {
    var M = CATS['cmccat2000'];
    var Mi = inv3(M);
    var D = dCMCCAT2000(LA1, LA2, F);
    var a = D * XYZw[1] / XYZwr[1];
    var rgb = mulv(M, XYZ);
    var rgbw = mulv(M, XYZw);
    var rgbwr = mulv(M, XYZwr);
    var out = [
      rgb[0] * (a * (rgbwr[0] / rgbw[0]) + 1 - D),
      rgb[1] * (a * (rgbwr[1] / rgbw[1]) + 1 - D),
      rgb[2] * (a * (rgbwr[2] / rgbw[2]) + 1 - D)
    ];
    return mulv(Mi, out);
  }

  /* 同上，白点用站内的 xy；XYZ 量纲为 0–1 时与 0–100 结果一致。 */
  function cmccat2000(XYZ, srcWhite, dstWhite, LA1, LA2, F) {
    var ws = white(srcWhite), wd = white(dstWhite);
    if (!ws || !wd) return null;
    return cmccat2000XYZ(XYZ, xyToXYZ(ws[0], ws[1]), xyToXYZ(wd[0], wd[1]), LA1, LA2, F);
  }

  return {
    CATS: CATS,
    CAT_LIST: CAT_LIST,
    WHITES: WHITES,
    WHITE_LIST: WHITE_LIST,
    matrix: matrix,
    adapt: adapt,
    zhai2018: zhai2018,
    zhai2018ByWhite: zhai2018ByWhite,
    xyzToLab: xyzToLab,
    deltaE00: deltaE00,
    xyzToUV: xyzToUV,
    coneSensitivities: coneSensitivities,
    cmccat2000: cmccat2000,
    cmccat2000XYZ: cmccat2000XYZ,
    dExp: dExp,
    dCIECAM02: dCIECAM02,
    dCMCCAT2000: dCMCCAT2000,
    xyToXYZ: xyToXYZ,
    xyzToXY: xyzToXY,
    whiteXYZ: whiteXYZ,
    mulv: mulv,
    mul3: mul3,
    inv3: inv3,
    flat: flat
  };
});
