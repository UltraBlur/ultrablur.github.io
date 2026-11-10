/* ACES 2.0 的 JMh 几何内核：任意显示原色 → RGB ↔ JMh，以及色相切片。

   公式照抄 aces-core 的 init_JMhParams / RGB_to_JMh / JMh_to_RGB（Apache-2.0），
   与 scripts/aces2/aces2.py 的对应段逐项对齐：同一个 M16、同一套 400 标度锥体
   压缩、同一个白点对角归一、同一个 cz。数值核对（P3-D65）：
     (1,1,1)      → J 100.00000  M 0
     (0.5,0.5,0.5)→ J  72.49245  M 0
     (0.18,)*3    → J  44.93861  M 0
     (0.5,0.2,0.1)→ J  54.63299  M 28.80224  h 43.05710
   只给页面画几何用，不是完整的 ODT（色调曲线在 aces-tone.js）。 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AcesJMh = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var REF = 100;                      // 参考白（cd/m²）
  var L_A = 100, Y_B = 20;
  var SURROUND = [0.9, 0.59, 0.9];    // dim surround，同 CTL
  var CZ = SURROUND[1] * (1.48 + Math.sqrt(Y_B / REF));
  var NL_SCALE = 400, NL_OFFSET = 27.13;

  var M16 = [
    [0.401288, 0.650173, -0.051461],
    [-0.250268, 1.204414, 0.045854],
    [-0.002079, 0.048952, 0.953127]
  ];
  /* 锥响应 → [A, a, b]（CTL 的 base_cone_response_to_Aab） */
  var BASE = [
    [2, 1, 1 / 20],
    [1, -12 / 11, 1 / 11],
    [1 / 9, 1 / 9, -2 / 9]
  ];

  /* ---------- 3×3 ---------- */
  function mulMV(m, v) {
    return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
            m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
            m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
  }
  function mulMM(a, b) {
    var out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
      }
    }
    return out;
  }
  function inv3(m) {
    var a = m[0][0], b = m[0][1], c = m[0][2];
    var d = m[1][0], e = m[1][1], f = m[1][2];
    var g = m[2][0], h = m[2][1], i = m[2][2];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var det = a * A + b * B + c * C;
    return [
      [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
      [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
      [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]
    ];
  }
  /* 原色 + 白点 → RGB→XYZ（白点 Y = y） */
  function rgbToXYZ(prim, white, y) {
    y = y === undefined ? 1 : y;
    var P = [
      [prim[0][0] / prim[0][1], prim[1][0] / prim[1][1], prim[2][0] / prim[2][1]],
      [1, 1, 1],
      [(1 - prim[0][0] - prim[0][1]) / prim[0][1],
       (1 - prim[1][0] - prim[1][1]) / prim[1][1],
       (1 - prim[2][0] - prim[2][1]) / prim[2][1]]
    ];
    var w = [white[0] / white[1], 1, (1 - white[0] - white[1]) / white[1]];
    var s = mulMV(inv3(P), [w[0] * y, w[1] * y, w[2] * y]);
    return [[P[0][0] * s[0], P[0][1] * s[1], P[0][2] * s[2]],
            [P[1][0] * s[0], P[1][1] * s[1], P[1][2] * s[2]],
            [P[2][0] * s[0], P[2][1] * s[1], P[2][2] * s[2]]];
  }

  /* ---------- 400 标度锥响应压缩 ---------- */
  function compF(x) {
    var f = Math.pow(Math.abs(x), 0.42);
    return (x < 0 ? -1 : 1) * NL_SCALE * f / (NL_OFFSET + f);
  }
  function compB(y) {
    var u = Math.min(Math.abs(y) / NL_SCALE, 0.99);
    var f = NL_OFFSET * u / (1 - u);
    return (y < 0 ? -1 : 1) * Math.pow(f, 1 / 0.42);
  }

  /* ---------- 参数 ---------- */
  function init(prim, white) {
    var xyz = rgbToXYZ(prim, white, 1);
    var XYZw = mulMV(xyz, [1, 1, 1]);
    var XYZw100 = [XYZw[0] * REF, XYZw[1] * REF, XYZw[2] * REF];
    var RGBw = mulMV(M16, XYZw100);

    var k = 1 / (5 * L_A + 1), k4 = Math.pow(k, 4);
    var F_L = 0.2 * k4 * (5 * L_A) + 0.1 * Math.pow(1 - k4, 2) * Math.pow(5 * L_A, 1 / 3);
    var F_L_n = F_L / REF;

    var D = [0, 0, 0];
    for (var i = 0; i < 3; i++) D[i] = F_L_n * XYZw100[1] / RGBw[i];
    var RGBwc = [D[0] * RGBw[0], D[1] * RGBw[1], D[2] * RGBw[2]];
    var yaw = RGBwc.map(compF);
    var A_w_J = yaw[0];
    var A_w = 2 * yaw[0] + yaw[1] + 0.05 * yaw[2];

    /* RGB → 色适应后的锥响应（行向量约定存成矩阵） */
    var mCone = mulMM(M16, xyz);
    for (var r = 0; r < 3; r++) {
      for (var c2 = 0; c2 < 3; c2++) mCone[r][c2] *= REF * D[r];
    }
    /* XYZ → 锥响应：M16 直接乘 XYZ 再按 D 缩放。和上面的 mCone 只差一个
       RGB→XYZ 矩阵，所以对同一组 (XYZ, 白点) 结果完全一样；给没有 RGB 的
       参考色体（Pointer's Gamut 这类）用。 */
    var mConeXYZ = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (var r3 = 0; r3 < 3; r3++) {
      for (var c4 = 0; c4 < 3; c4++) mConeXYZ[r3][c4] = M16[r3][c4] * REF * D[r3];
    }
    /* 锥响应 → [A/A_w, 43s·a, 43s·b] */
    var aab = [[BASE[0][0] / A_w, BASE[0][1] / A_w, BASE[0][2] / A_w],
               [BASE[1][0] * 43 * SURROUND[2], BASE[1][1] * 43 * SURROUND[2], BASE[1][2] * 43 * SURROUND[2]],
               [BASE[2][0] * 43 * SURROUND[2], BASE[2][1] * 43 * SURROUND[2], BASE[2][2] * 43 * SURROUND[2]]];
    return {
      cz: CZ, inv_cz: 1 / CZ, F_L: F_L, F_L_n: F_L_n, A_w: A_w, A_w_J: A_w_J,
      mCone: mCone, mConeInv: inv3(mCone), mConeXYZ: mConeXYZ,
      mConeToAab: aab, mAabToCone: inv3(aab)
    };
  }

  /* ---------- 换算 ---------- */
  function coneToJMh(cone, p) {
    var y = [compF(cone[0]), compF(cone[1]), compF(cone[2])];
    var aab = mulMV(p.mConeToAab, y);
    var j = 100 * Math.pow(Math.max(aab[0], 0), p.cz);
    var m = Math.hypot(aab[1], aab[2]);
    var h = (Math.atan2(aab[2], aab[1]) * 180 / Math.PI + 360) % 360;
    return [j, m, h];
  }
  function rgbToJMh(rgb, p) {
    return coneToJMh(mulMV(p.mCone, rgb), p);
  }
  /* XYZ（绝对，1.0 = 100 cd/m² 的同一标度）→ JMh */
  function xyzToJMh(xyz, p) {
    return coneToJMh(mulMV(p.mConeXYZ, xyz), p);
  }
  function jmhToRGB(jmh, p) {
    var A = Math.pow(Math.max(jmh[0], 0) / 100, p.inv_cz);
    var hr = jmh[2] * Math.PI / 180;
    var aab = [A, jmh[1] * Math.cos(hr), jmh[1] * Math.sin(hr)];
    var y = mulMV(p.mAabToCone, aab);
    var cone = [compB(y[0]), compB(y[1]), compB(y[2])];
    return mulMV(p.mConeInv, cone);
  }
  /* 亮度（cd/m²，100 = 白）→ J；只对中性灰严格成立 */
  function yToJ(y, p) {
    var ra = compF(Math.abs(y) * p.F_L_n);
    return 100 * Math.pow(Math.max(ra * 1 / p.A_w_J, 0), p.cz);
  }
  /* maxRGB：这个坐标系里「满量程」是多少。CTL 的 JMh 以 1.0 = 100 cd/m² 标定，
     所以峰值 peak 的显示对应 RGB ∈ [0, peak/100]——不是固定 [0,1]。 */
  function inGamut(jmh, p, maxRGB, eps) {
    var rgb = jmhToRGB(jmh, p);
    var hi = maxRGB === undefined ? 1 : maxRGB;
    eps = eps || 1e-9;
    return rgb[0] >= -eps && rgb[0] <= hi + eps &&
           rgb[1] >= -eps && rgb[1] <= hi + eps &&
           rgb[2] >= -eps && rgb[2] <= hi + eps;
  }

  /* ---------- 立方体角点与 cusp ---------- */
  var CORNERS = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]];
  function cornerJMh(p, maxRGB) {
    var k = maxRGB === undefined ? 1 : maxRGB;
    return CORNERS.map(function (c) {
      return rgbToJMh([c[0] * k, c[1] * k, c[2] * k], p);
    });
  }
  /* 指定色相的 cusp：在相邻两个角点之间二分（ACES 的 cusp 表就是这么建的）。
     maxRGB = peak/100，和 CTL 建表时把角点乘 peak/ref_luminance 是同一件事。 */
  function cusp(hue, p, maxRGB) {
    var k = maxRGB === undefined ? 1 : maxRGB;
    var jm = cornerJMh(p, k);
    var h = ((hue % 360) + 360) % 360;
    for (var i = 0; i < CORNERS.length; i++) {
      var j0 = jm[i], j1 = jm[(i + 1) % CORNERS.length];
      var span = (j1[2] - j0[2] + 360) % 360;
      var tgt = (h - j0[2] + 360) % 360;
      if (tgt <= span) {
        var a = CORNERS[i], b = CORNERS[(i + 1) % CORNERS.length];
        var lo = 0, hi = 1;
        for (var n = 0; n < 48; n++) {
          var t = (lo + hi) / 2;
          var j = rgbToJMh([(a[0] + (b[0] - a[0]) * t) * k,
                            (a[1] + (b[1] - a[1]) * t) * k,
                            (a[2] + (b[2] - a[2]) * t) * k], p);
          if (((j[2] - j0[2] + 360) % 360) < tgt) lo = t; else hi = t;
        }
        var tm = (lo + hi) / 2;
        var cm = rgbToJMh([(a[0] + (b[0] - a[0]) * tm) * k,
                           (a[1] + (b[1] - a[1]) * tm) * k,
                           (a[2] + (b[2] - a[2]) * tm) * k], p);
        return { J: cm[0], M: cm[1], h: h };
      }
    }
    return { J: 0, M: 0, h: h };
  }
  /* 给定 J、色相，在色域内的最大 M（二分；真实边界，不查表） */
  function boundaryM(j, hue, p, maxRGB) {
    var lo = 0, hi = 900;
    for (var n = 0; n < 44; n++) {
      var mid = (lo + hi) / 2;
      if (inGamut([j, mid, hue], p, maxRGB)) lo = mid; else hi = mid;
    }
    return lo;
  }

  return {
    CZ: CZ, REF: REF, CORNERS: CORNERS,
    init: init, rgbToJMh: rgbToJMh, xyzToJMh: xyzToJMh, jmhToRGB: jmhToRGB, yToJ: yToJ,
    inGamut: inGamut, cusp: cusp, boundaryM: boundaryM,
    rgbToXYZ: rgbToXYZ, cornerJMh: cornerJMh
  };
});
