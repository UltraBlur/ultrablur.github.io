/*
 * 色貌 / UCS 模型（试验页用）
 * 输入：XYZ（相对量，参考白 Y = 1）+ 参考白亮度 Lw（cd/m²）
 * 输出：显示三元组 [水平, 竖直, 深度]，竖直方向统一是明度类轴
 *
 * 公式来源：ICtCp (Dolby/BT.2100)、JzAzBz (Safdar 2017)、
 * CAM02-UCS (Luo 2006)、Oklab (Björn Ottosson 2020)、CIE 1976 L*u*v*。
 * 常数与 colour-science 的实现一致，便于交叉验证。
 */
(function (root) {
  'use strict';

  /* ---------- 3×3 ---------- */

  function mul(A, B) {
    var C = new Array(9);
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
      }
    }
    return C;
  }

  function mulv(A, v) {
    return [
      A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
      A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
      A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
    ];
  }

  function inv(A) {
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

  /* D65 白点（Y = 1）。CIE 15:2018 的 x = 0.3127 / y = 0.329 精确换算值。 */
  var D65_XYZ = [0.9504559270516716, 1, 1.0890577507598784];

  /* ---------- PQ ---------- */

  var M1 = 2610 / 16384, M2 = 2523 / 4096 * 128;
  var C1 = 3424 / 4096, C2 = 2413 / 4096 * 32, C3 = 2392 / 4096 * 32;

  function pq(x) {
    if (!(x > 0)) return 0;
    var p = Math.pow(x, M1);
    return Math.pow((C1 + C2 * p) / (1 + C3 * p), M2);
  }

  /* JzAzBz 的非线性项指数与 PQ 不同 */
  function pqJz(x, c1, c2, c3, n, p) {
    if (!(x > 0)) return 0;
    var q = Math.pow(x, n);
    return Math.pow((c1 + c2 * q) / (1 + c3 * q), p);
  }

  /* ---------- ICtCp ---------- */

  var BT2020 = [0.63695804830129099, 0.14461690358620841, 0.16888097516417205,
                0.26270021201126692, 0.67799807151887115, 0.059301716469861938,
                0.0, 0.028072693049087445, 1.0609850577107907];
  var BT2020_INV = inv(BT2020);
  var ICTCP_RGB_LMS = [0.412109375, 0.52392578125, 0.06396484375,
                       0.166748046875, 0.720458984375, 0.11279296875,
                       0.024169921875, 0.075439453125, 0.900390625];
  var ICTCP_M = [0.5, 0.5, 0.0,
                 1.61376953125, -3.323486328125, 1.709716796875,
                 4.378173828125, -4.24560546875, -0.132568359375];

  function ictcpForward(xyz, Lw) {
    var rgb = mulv(BT2020_INV, xyz);
    var lms = mulv(ICTCP_RGB_LMS, rgb);
    var k = Lw / 10000;
    var encoded = [pq(lms[0] * k), pq(lms[1] * k), pq(lms[2] * k)];
    var out = mulv(ICTCP_M, encoded);
    return { rgb: rgb, lms: lms, lmsPq: encoded, ictcp: out };
  }

  function ictcp(xyz, Lw) {
    var out = ictcpForward(xyz, Lw).ictcp;
    return [out[1], out[0], out[2]];
  }

  var ICTCP_RGB_LMS_INV = inv(ICTCP_RGB_LMS);
  var ICTCP_M_INV = inv(ICTCP_M);

  function ictcpToXyz(value, Lw) {
    if (!(Lw > 0)) throw new RangeError('Lw must be positive');
    var encoded = mulv(ICTCP_M_INV, [value[1], value[0], value[2]]);
    var lms = encoded.map(function (v) {
      if (!(v > 0)) return 0;
      var p = Math.pow(v, 1 / M2);
      var q = Math.max(p - C1, 0) / (C2 - C3 * p);
      return Math.pow(q, 1 / M1) * 10000 / Lw;
    });
    return mulv(BT2020, mulv(ICTCP_RGB_LMS_INV, lms));
  }

  /* ---------- JzAzBz ---------- */

  var JZ_XYZ_LMS = [0.41478972, 0.579999, 0.014648,
                    -0.20151, 1.120649, 0.0531008,
                    -0.0166008, 0.2648, 0.6684799];
  var JZ_LMS_Izazbz_2017 = [0.5, 0.5, 0.0,
                            3.524, -4.066708, 0.542708,
                            0.199076, 1.096799, -1.295875];

  var JZ17 = { b: 1.15, g: 0.66, c1: 0.8359375, c2: 18.8515625, c3: 18.6875,
               n: 0.1593017578125, p: 134.034375, d: -0.56, d0: 1.6295499532821565e-11 };

  function jzazbzI(xyzAbs, C, matrix) {
    var X = xyzAbs[0], Y = xyzAbs[1], Z = xyzAbs[2];
    var Xp = C.b * X - (C.b - 1) * Z;
    var Yp = C.g * Y - (C.g - 1) * X;
    var lms = mulv(JZ_XYZ_LMS, [Xp, Yp, Z]);
    var e = 1e-4; // 归一化到 10000 cd/m²
    var l = pqJz(lms[0] * e, C.c1, C.c2, C.c3, C.n, C.p);
    var m = pqJz(lms[1] * e, C.c1, C.c2, C.c3, C.n, C.p);
    var s = pqJz(lms[2] * e, C.c1, C.c2, C.c3, C.n, C.p);
    return mulv(matrix, [l, m, s]);
  }

  function jzazbz(xyz, Lw) {
    var abs = [xyz[0] * Lw, xyz[1] * Lw, xyz[2] * Lw];
    var iz = jzazbzI(abs, JZ17, JZ_LMS_Izazbz_2017);
    var jz = ((1 + JZ17.d) * iz[0]) / (1 + JZ17.d * iz[0]) - JZ17.d0;
    return [iz[1], jz, iz[2]]; // [az, Jz, bz]
  }

  /* pqJz 的逆：v = ((c1 + c2 q)/(1 + c3 q))^p，q = (x/10000)^n。
     只对 v > 0 有定义（正向把负值截成 0），深黑处回 0。 */
  function pqJzInv(v, C) {
    if (!(v > 0)) return 0;
    var p = Math.pow(v, 1 / C.p);
    var q = (p - C.c1) / (C.c2 - C.c3 * p);
    return q > 0 ? Math.pow(q, 1 / C.n) : 0;
  }

  var JZ_XYZ_LMS_INV = inv(JZ_XYZ_LMS);
  var JZ_LMS_Izazbz_2017_INV = inv(JZ_LMS_Izazbz_2017);

  function jzazbzToXyz(v, Lw) {
    Lw = Lw || 100;
    var jp = v[1] + JZ17.d0;
    var iz = jp / (1 + JZ17.d - JZ17.d * jp);
    var lms = mulv(JZ_LMS_Izazbz_2017_INV, [iz, v[0], v[2]]);
    var abs = mulv(JZ_XYZ_LMS_INV, [
      pqJzInv(lms[0], JZ17) * 1e4,
      pqJzInv(lms[1], JZ17) * 1e4,
      pqJzInv(lms[2], JZ17) * 1e4
    ]);
    /* 反解 X′ = bX − (b−1)Z、Y′ = gY − (g−1)X */
    var Z = abs[2];
    var X = (abs[0] + (JZ17.b - 1) * Z) / JZ17.b;
    var Y = (abs[1] + (JZ17.g - 1) * X) / JZ17.g;
    return [X / Lw, Y / Lw, Z / Lw];
  }

  /* ---------- 显示编码（逆 EOTF，把亮度映射成码值） ---------- */

  function encodeSrgb(v) {
    if (!(v > 0)) return 0;
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  function encodeGamma(v, g) {
    return v > 0 ? Math.pow(v, 1 / g) : 0;
  }

  /* PQ：先用参考白亮度把相对亮度换算成绝对亮度 */
  function encodePq(v, Lw) {
    return pq((v * Lw) / 10000);
  }

  /* ---------- Oklab ---------- */

  var OK_M1 = [0.8189330101, 0.3618667424, -0.1288597137,
               0.0329845436, 0.9293118715, 0.0361456387,
               0.0482003018, 0.2643662691, 0.6338517070];
  var OK_M2 = [0.2104542553, 0.7936177850, -0.0040720468,
               1.9779984951, -2.4285922050, 0.4505937099,
               0.0259040371, 0.7827717662, -0.8086757660];

  function oklab(xyz) {
    var lms = mulv(OK_M1, xyz);
    var l = Math.cbrt(lms[0]), m = Math.cbrt(lms[1]), s = Math.cbrt(lms[2]);
    var out = mulv(OK_M2, [l, m, s]);
    return [out[1], out[0], out[2]]; // [a, L, b]
  }

  var OK_M1_INV = inv(OK_M1);
  var OK_M2_INV = inv(OK_M2);

  function oklabToXyz(v) {
    var lms = mulv(OK_M2_INV, [v[1], v[0], v[2]]);
    return mulv(OK_M1_INV, [
      lms[0] * lms[0] * lms[0],
      lms[1] * lms[1] * lms[1],
      lms[2] * lms[2] * lms[2]
    ]);
  }

  /* ---------- IPT（Ebner & Fairchild 1998） ----------

     经「归一化锥响应」的均匀色空间：LMS 矩阵按 D65 归一（白 → 1,1,1），
     0.43 次幂压缩后线性组合成 I（明度）/ P（红绿）/ T（黄蓝）。
     矩阵指数与 colour-science 的 XYZ_to_IPT 一致（2026-11-23 对 doctest 核过）。
     与 oklab 同为固定 D65 的变换，不随显示空间的白点归一。 */

  var IPT_XYZ_LMS = [0.4002, 0.7075, -0.0807,
                     -0.2280, 1.1500, 0.0612,
                     0.0000, 0.0000, 0.9184];
  var IPT_LMS_IPT = [0.4000, 0.4000, 0.2000,
                     4.4550, -4.8510, 0.3960,
                     0.8056, 0.3572, -1.1628];

  function ipt(xyz) {
    var lms = mulv(IPT_XYZ_LMS, xyz);
    var out = mulv(IPT_LMS_IPT, [
      signPow(lms[0], 0.43),
      signPow(lms[1], 0.43),
      signPow(lms[2], 0.43)
    ]);
    return [out[1], out[0], out[2]]; // [P, I, T]
  }

  var IPT_XYZ_LMS_INV = inv(IPT_XYZ_LMS);
  var IPT_LMS_IPT_INV = inv(IPT_LMS_IPT);

  function iptToXyz(v) {
    var lms = mulv(IPT_LMS_IPT_INV, [v[1], v[0], v[2]]);
    return mulv(IPT_XYZ_LMS_INV, [
      signPow(lms[0], 1 / 0.43),
      signPow(lms[1], 1 / 0.43),
      signPow(lms[2], 1 / 0.43)
    ]);
  }

  /* ---------- CIE 1976 L*a*b* ---------- */

  var LAB_EPS = 216 / 24389, LAB_K = 24389 / 27;

  function fLab(t) {
    return t > LAB_EPS ? Math.cbrt(t) : (LAB_K * t + 16) / 116;
  }

  function fLabInv(t) {
    var c = t * t * t;
    return c > LAB_EPS ? c : (116 * t - 16) / LAB_K;
  }

  /* 显示序：[a*, L*, b*]，与 oklab / ipt / jzazbz 的返回顺序一致 */
  function lab(xyz, W) {
    W = W || D65_XYZ;
    var fx = fLab(xyz[0] / W[0]), fy = fLab(xyz[1] / W[1]), fz = fLab(xyz[2] / W[2]);
    return [500 * (fx - fy), 116 * fy - 16, 200 * (fy - fz)];
  }

  function labToXyz(v, W) {
    W = W || D65_XYZ;
    var fy = (v[1] + 16) / 116, fx = fy + v[0] / 500, fz = fy - v[2] / 200;
    return [fLabInv(fx) * W[0], fLabInv(fy) * W[1], fLabInv(fz) * W[2]];
  }

  /* ---------- CIE 1976 L*u*v* ---------- */

  function luv(xyz, W) {
    W = W || D65_XYZ;
    var d = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
    var dn = W[0] + 15 * W[1] + 3 * W[2];
    var up = d > 1e-12 ? 4 * xyz[0] / d : 0;
    var vp = d > 1e-12 ? 9 * xyz[1] / d : 0;
    var upn = 4 * W[0] / dn, vpn = 9 * W[1] / dn;
    var yr = xyz[1] / W[1];
    var L = yr > LAB_EPS ? 116 * Math.cbrt(yr) - 16 : LAB_K * yr;
    return [13 * L * (up - upn), L, 13 * L * (vp - vpn)]; // [u*, L*, v*]
  }

  function luvToXyz(v, W) {
    W = W || D65_XYZ;
    var L = v[1];
    if (!(L > 1e-9)) return [0, 0, 0];
    var dn = W[0] + 15 * W[1] + 3 * W[2];
    var upn = 4 * W[0] / dn, vpn = 9 * W[1] / dn;
    var up = v[0] / (13 * L) + upn, vp = v[2] / (13 * L) + vpn;
    if (Math.abs(vp) < 1e-12) return [0, 0, 0];
    var Y = L > 8 ? W[1] * Math.pow((L + 16) / 116, 3) : W[1] * L / LAB_K;
    return [Y * 9 * up / (4 * vp), Y, Y * (12 - 3 * up - 20 * vp) / (4 * vp)];
  }

  /* ---------- CIECAM02 → CAM02-UCS ---------- */

  var CAT02 = [0.7328, 0.4296, -0.1624,
               -0.7036, 1.6975, 0.0061,
               0.0030, 0.0136, 0.9834];
  var CAT02_INV = inv(CAT02);
  var HPE = [0.38971, 0.68898, -0.07868,
             -0.22981, 1.18340, 0.04641,
             0.0, 0.0, 1.0];

  function signPow(v, p) {
    return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), p);
  }

  /* UCS 的 M′ 压缩：M ≥ 0 时用标准式 ln(1 + 0.0228M) / 0.0228。
     极宽色域（ProPhoto 的纯蓝轴）会把 M 压到 −43.86 以下，标准式取对数得 NaN；
     此时按保号对数外推，正常色域（以及 −43.86 以上的负 M）不受影响。 */
  function ucsM(M) {
    var t = 1 + 0.0228 * M;
    return t > 0
      ? Math.log(t) / 0.0228
      : -Math.log(1 + 0.0228 * Math.abs(M)) / 0.0228;
  }

  /* 完整色貌相关量：J（明度）、Q（视明度）、C（彩度）、M（视彩度）、s（饱和度）、h（色相角，度）。
     stage 保留中间量（CAT02 响应、HPE 适应后的锥体响应、A/a/b），供页面逐步演算直接打印，
     页面不再另写一遍公式。 */
  function cam02Forward(xyzAbs, whiteAbs, opts) {
    var La = opts.La, Yb = opts.Yb, F = opts.F, c = opts.c, Nc = opts.Nc;

    var rgb = mulv(CAT02, xyzAbs);
    var rgbW = mulv(CAT02, whiteAbs);
    var D = F * (1 - (1 / 3.6) * Math.exp((-La - 42) / 92));
    D = Math.max(0, Math.min(1, D));

    var Yw = whiteAbs[1];
    var DRGB = [
      D * Yw / rgbW[0] + 1 - D,
      D * Yw / rgbW[1] + 1 - D,
      D * Yw / rgbW[2] + 1 - D
    ];
    var rgbC = [DRGB[0] * rgb[0], DRGB[1] * rgb[1], DRGB[2] * rgb[2]];
    var rgbWC = [DRGB[0] * rgbW[0], DRGB[1] * rgbW[1], DRGB[2] * rgbW[2]];

    var k = 1 / (5 * La + 1);
    var FL = 0.2 * Math.pow(k, 4) * 5 * La + 0.1 * Math.pow(1 - Math.pow(k, 4), 2) * Math.cbrt(5 * La);
    var n = Yb / Yw;
    var z = 1.48 + Math.sqrt(n);
    var Nbb = 0.725 * Math.pow(1 / n, 0.2);

    /* 负值处理按 Luo (2013)：压缩前取 |v|，符号留在外面。
       广色域原色（例如 Rec.2020 / P3 的红，Z 恰为 0）会让 CAT02 绿通道为负，
       直接对负数求 0.42 次幂会得 NaN，整条 R 轴的面就没了。 */
    function adapt(v) {
      var t = Math.pow(FL * Math.abs(v) / 100, 0.42);
      return (v < 0 ? -1 : 1) * 400 * t / (t + 27.13) + 0.1;
    }

    var rgbP = mulv(HPE, mulv(CAT02_INV, rgbC));
    var rgbPW = mulv(HPE, mulv(CAT02_INV, rgbWC));
    var Ra = adapt(rgbP[0]), Ga = adapt(rgbP[1]), Ba = adapt(rgbP[2]);
    var RaW = adapt(rgbPW[0]), GaW = adapt(rgbPW[1]), BaW = adapt(rgbPW[2]);

    var Aw = (2 * RaW + GaW + BaW / 20 - 0.305) * Nbb;
    var a = Ra - 12 * Ga / 11 + Ba / 11;
    var b = (Ra + Ga - 2 * Ba) / 9;
    var h = Math.atan2(b, a);
    var et = 0.25 * (Math.cos(h + 2) + 3.8);
    var A = (2 * Ra + Ga + Ba / 20 - 0.305) * Nbb;

    /* J / C / M 都用保号幂（Luo 2013 的负值约定）：A 变负、t 变负时仍有定义、
       且与正半轴连续，不会把曲面打出洞来。分母为 0 时取 0（同 colour-science 的 sdiv）。 */
    var J = 100 * signPow(A / Aw, c * z);
    var denT = Ra + Ga + 21 / 20 * Ba;
    var t = Math.abs(denT) > 1e-12
      ? (50000 / 13 * Nc * Nbb * et * Math.sqrt(a * a + b * b)) / denT
      : 0;
    var C = signPow(t, 0.9) * signPow(J / 100, 0.5) * signPow(1.64 - Math.pow(0.29, n), 0.73);
    var M = C * signPow(FL, 0.25);

    /* Q 与 s 是 CAM02 / CAM16 定义里的派生量：Q = (4/c)√(J/100)(A_w+4)F_L^0.25，
       s = 100√(M/Q)。J < 0 的极端刺激用保号幂，避免开方出 NaN。 */
    var Q = (4 / c) * signPow(J / 100, 0.5) * (Aw + 4) * signPow(FL, 0.25);
    var s = Q > 0 && M > 0 ? 100 * Math.sqrt(M / Q) : 0;

    var Jp = 1.7 * J / (1 + 0.007 * J);
    var Mp = ucsM(M);
    return {
      J: J, Q: Q, C: C, M: M, s: s,
      h: (h * 180 / Math.PI + 360) % 360, hRad: h,
      Jp: Jp, ap: Mp * Math.cos(h), bp: Mp * Math.sin(h),
      FL: FL, Aw: Aw, D: D, Nbb: Nbb,
      stage: { rgb: rgb, rgbW: rgbW, DRGB: DRGB, rgbC: rgbC, rgbP: rgbP, adapted: [Ra, Ga, Ba], Aab: [A, a, b] }
    };
  }

  function cam02ucs(xyzAbs, whiteAbs, opts) {
    var r = cam02Forward(xyzAbs, whiteAbs, opts);
    return [r.ap, r.Jp, r.bp]; // [a', J', b']
  }

  /* ---------- CAM16（Li et al. 2017）+ CAM16-UCS ---------- */

  var CAT16 = [0.401288, 0.650173, -0.051461,
               -0.250268, 1.204414, 0.045854,
               -0.002079, 0.048952, 0.953127];

  function cam16Forward(xyzAbs, whiteAbs, opts) {
    var La = opts.La, Yb = opts.Yb, F = opts.F, c = opts.c;
    /* CAM16 的昏暗环绕 N_c = 0.9（CIE 159 的 CAM02 是 0.95），所以单独取 */
    var Nc = opts.Nc16 === undefined ? opts.Nc : opts.Nc16;

    var RGBw = mulv(CAT16, whiteAbs);
    var D = F * (1 - (1 / 3.6) * Math.exp((-La - 42) / 92));
    D = Math.max(0, Math.min(1, D));
    var Yw = whiteAbs[1];
    var DRGB = [
      D * Yw / RGBw[0] + 1 - D,
      D * Yw / RGBw[1] + 1 - D,
      D * Yw / RGBw[2] + 1 - D
    ];

    var k = 1 / (5 * La + 1);
    var FL = 0.2 * Math.pow(k, 4) * 5 * La + 0.1 * Math.pow(1 - Math.pow(k, 4), 2) * Math.cbrt(5 * La);
    var n = Yb / Yw;
    var z = 1.48 + Math.sqrt(n);
    var Nbb = 0.725 * Math.pow(1 / n, 0.2);

    /* 同 CAM02：负值按 Luo 2013 处理，A 为负时不产生 NaN */
    function adapt(v) {
      var t = Math.pow(FL * Math.abs(v) / 100, 0.42);
      return (v < 0 ? -1 : 1) * 400 * t / (t + 27.13) + 0.1;
    }

    var RGBaw = [adapt(DRGB[0] * RGBw[0]), adapt(DRGB[1] * RGBw[1]), adapt(DRGB[2] * RGBw[2])];
    var Aw = (2 * RGBaw[0] + RGBaw[1] + RGBaw[2] / 20 - 0.305) * Nbb;

    var RGB = mulv(CAT16, xyzAbs);
    var Ra = adapt(DRGB[0] * RGB[0]);
    var Ga = adapt(DRGB[1] * RGB[1]);
    var Ba = adapt(DRGB[2] * RGB[2]);

    var a = Ra - 12 * Ga / 11 + Ba / 11;
    var b = (Ra + Ga - 2 * Ba) / 9;
    var h = Math.atan2(b, a);
    var et = 0.25 * (Math.cos(h + 2) + 3.8);
    var A = (2 * Ra + Ga + Ba / 20 - 0.305) * Nbb;

    var J = 100 * signPow(A / Aw, c * z);
    var denT = Ra + Ga + 21 / 20 * Ba;
    var t = Math.abs(denT) > 1e-12
      ? (50000 / 13 * Nc * Nbb * et * Math.sqrt(a * a + b * b)) / denT
      : 0;
    var C = signPow(t, 0.9) * signPow(J / 100, 0.5) * signPow(1.64 - Math.pow(0.29, n), 0.73);
    var M = C * signPow(FL, 0.25);

    /* 同 cam02Forward：Q、s 是定义里的派生量，负 J 用保号幂 */
    var Q = (4 / c) * signPow(J / 100, 0.5) * (Aw + 4) * signPow(FL, 0.25);
    var s = Q > 0 && M > 0 ? 100 * Math.sqrt(M / Q) : 0;

    var Jp = 1.7 * J / (1 + 0.007 * J);
    var Mp = ucsM(M);
    return {
      J: J, Q: Q, C: C, M: M, s: s,
      h: (h * 180 / Math.PI + 360) % 360, hRad: h,
      Jp: Jp, ap: Mp * Math.cos(h), bp: Mp * Math.sin(h),
      FL: FL, Aw: Aw, D: D, Nbb: Nbb,
      stage: { rgb: RGB, rgbW: RGBw, DRGB: DRGB, adapted: [Ra, Ga, Ba], Aab: [A, a, b] }
    };
  }

  function cam16ucs(xyzAbs, whiteAbs, opts) {
    var r = cam16Forward(xyzAbs, whiteAbs, opts);
    return [r.ap, r.Jp, r.bp]; // [a', J', b']
  }

  /* ---------- ZCAM（Safdar et al. 2021） ---------- */

  var JZ21 = { b: 1.15, g: 0.66, d0: 3.7035226210190005e-11 };
  var JZ_XYZ_LMS21 = [0.41478972, 0.579999, 0.014648,
                      -0.20151, 1.120649, 0.0531008,
                      -0.0166008, 0.2648, 0.6684799];
  var JZ_LMS_IZAZBZ21 = [0, 1, 0,
                         3.524, -4.066708, 0.542708,
                         0.199076, 1.096799, -1.295875];
  var JZ_M1 = 0.1593017578125, JZ_M2_21 = 134.034375;
  var JZ_C1 = 0.8359375, JZ_C2 = 18.8515625, JZ_C3 = 18.6875;

  /* JzAzBz 的 Safdar 2021 变体：比 2017 版多减一个 d0，矩阵也不同 */
  function pqJz21(x) {
    var y = signPow(Math.abs(x) / 10000, JZ_M1);
    var q = (JZ_C1 + JZ_C2 * y) / (1 + JZ_C3 * y);
    return signPow(q, JZ_M2_21);
  }

  function jzazbz21(xyz) {
    var Xp = JZ21.b * xyz[0] - (JZ21.b - 1) * xyz[2];
    var Yp = JZ21.g * xyz[1] - (JZ21.g - 1) * xyz[0];
    var lms = mulv(JZ_XYZ_LMS21, [Xp, Yp, xyz[2]]);
    var out = mulv(JZ_LMS_IZAZBZ21, [pqJz21(lms[0]), pqJz21(lms[1]), pqJz21(lms[2])]);
    return [out[0] - JZ21.d0, out[1], out[2]]; // [Iz, az, bz]
  }

  /* Zhai & Luo 2018 的 CAT02 色适应：白点 XYZ_w → D65（D_b = D_d = D） */
  function adaptZhai(xyz, xyzW, D) {
    var rgbB = mulv(CAT02, xyz);
    var rgbWb = mulv(CAT02, xyzW);
    var rgbWo = mulv(CAT02, D65_XYZ);
    var Ywb = xyzW[1], Ywo = D65_XYZ[1];
    /* 目标白点就是 D65，D_RGB_d 恒为 1，只剩源方向那一半 */
    var DRGB = [0, 1, 2].map(function (i) {
      return D * (Ywb / Ywo) * (rgbWo[i] / rgbWb[i]) + 1 - D;
    });
    var rgbD = [DRGB[0] * rgbB[0], DRGB[1] * rgbB[1], DRGB[2] * rgbB[2]];
    return mulv(CAT02_INV, rgbD);
  }

  function zcamForward(xyzAbs, whiteAbs, opts) {
    var La = opts.La, Yb = opts.Yb, F = opts.F;
    var Fs = opts.Fs === undefined ? 0.69 : opts.Fs;
    var Yw = whiteAbs[1];

    var D = Math.max(0, Math.min(1, F * (1 - (1 / 3.6) * Math.exp((-La - 42) / 92))));
    var xyzD65 = adaptZhai(xyzAbs, whiteAbs, D);
    var iz = jzazbz21(xyzD65);
    var izw = jzazbz21(whiteAbs);

    var Fb = Math.sqrt(Yb / Yw);
    var FL = 0.171 * Math.cbrt(La) * (1 - Math.exp(-48 / 9 * La));

    var hDeg = (Math.atan2(iz[2], iz[1]) * 180 / Math.PI + 360) % 360;
    var ez = 1.015 + Math.cos((89.038 + hDeg) * Math.PI / 180);

    var Qp = 1.6 * Fs / Math.pow(Fb, 0.12);
    var Qm = Math.pow(Fs, 2.2) * Math.pow(Fb, 0.5) * Math.pow(FL, 0.2);
    var Qz = 2700 * signPow(iz[0], Qp) * Qm;
    var Qzw = 2700 * signPow(izw[0], Qp) * Qm;
    var Jz = 100 * Qz / Qzw;

    var Mz = 100 * Math.pow(iz[1] * iz[1] + iz[2] * iz[2], 0.37) *
      ((Math.pow(ez, 0.068) * Math.pow(FL, 0.2)) / (Math.pow(Fb, 0.1) * Math.pow(izw[0], 0.78)));

    var hr = hDeg * Math.PI / 180;
    return {
      Jz: Jz, Mz: Mz, Qz: Qz, Qzw: Qzw, hz: hDeg,
      az: Mz * Math.cos(hr), bz: Mz * Math.sin(hr),
      FL: FL, Fb: Fb, D: D,
      stage: { xyzD65: xyzD65, iz: iz, izw: izw }
    };
  }

  function zcam(xyzAbs, whiteAbs, opts) {
    var r = zcamForward(xyzAbs, whiteAbs, opts);
    return [r.az, r.Jz, r.bz]; // [az, Jz, bz]
  }

  function xyzToXyy(xyz) {
    var sum = xyz[0] + xyz[1] + xyz[2];
    return sum === 0 ? [0, 0, 0] : [xyz[0] / sum, xyz[1] / sum, xyz[1]];
  }

  function xyyToXyz(xyy) {
    if (xyy[1] === 0) return [0, 0, 0];
    return [xyy[0] * xyy[2] / xyy[1], xyy[2], (1 - xyy[0] - xyy[1]) * xyy[2] / xyy[1]];
  }

  function xyToUv(x, y) {
    var den = -2 * x + 12 * y + 3;
    return den === 0 ? [0, 0] : [4 * x / den, 9 * y / den];
  }

  function lmsMatrix(key) {
    if (key === 'hpe') return HPE;
    if (key === 'cat02') return CAT02;
    if (key === 'cat16') return CAT16;
    throw new RangeError('unknown LMS matrix: ' + key);
  }

  function xyzToLms(xyz, key) { return mulv(lmsMatrix(key), xyz); }
  function lmsToXyz(lms, key) { return mulv(inv(lmsMatrix(key)), lms); }

  function rgbHue(rgb, max, delta) {
    if (delta === 0) return 0;
    var hue = max === rgb[0] ? (rgb[1] - rgb[2]) / delta :
      max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
    return (hue * 60 + 360) % 360;
  }

  function rgbToHsv(rgb) {
    var max = Math.max.apply(null, rgb), min = Math.min.apply(null, rgb), delta = max - min;
    return [rgbHue(rgb, max, delta), max === 0 ? 0 : delta / max, max];
  }

  function rgbToHsl(rgb) {
    var max = Math.max.apply(null, rgb), min = Math.min.apply(null, rgb), delta = max - min;
    var lightness = (max + min) / 2;
    return [rgbHue(rgb, max, delta), delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)), lightness];
  }

  function hueToRgb(hue, chroma, offset) {
    var sector = ((hue % 360) + 360) % 360 / 60;
    var second = chroma * (1 - Math.abs(sector % 2 - 1));
    var channels = sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] :
      sector < 3 ? [0, chroma, second] : sector < 4 ? [0, second, chroma] :
      sector < 5 ? [second, 0, chroma] : [chroma, 0, second];
    return channels.map(function (v) { return v + offset; });
  }

  function hsvToRgb(hsv) {
    var chroma = hsv[1] * hsv[2];
    return hueToRgb(hsv[0], chroma, hsv[2] - chroma);
  }

  function hslToRgb(hsl) {
    var chroma = (1 - Math.abs(2 * hsl[2] - 1)) * hsl[1];
    return hueToRgb(hsl[0], chroma, hsl[2] - chroma / 2);
  }

  function ycbcrCoefficients(std) {
    if (std === 'bt709') return [0.2126, 0.0722];
    if (std === 'bt2020') return [0.2627, 0.0593];
    throw new RangeError('unknown YCbCr standard: ' + std);
  }

  function rgbToYcbcr(rgb, std) {
    var coeff = ycbcrCoefficients(std), kr = coeff[0], kb = coeff[1];
    var y = kr * rgb[0] + (1 - kr - kb) * rgb[1] + kb * rgb[2];
    return [y, (rgb[2] - y) / (2 * (1 - kb)), (rgb[0] - y) / (2 * (1 - kr))];
  }

  function ycbcrToRgb(value, std) {
    var coeff = ycbcrCoefficients(std), kr = coeff[0], kb = coeff[1];
    var red = value[0] + 2 * (1 - kr) * value[2];
    var blue = value[0] + 2 * (1 - kb) * value[1];
    return [red, (value[0] - kr * red - kb * blue) / (1 - kr - kb), blue];
  }

  /* ---------- 逐步演算：单模型页的数学链路 ----------

     输入是相对 XYZ（Y = 1 对应参考白），返回按计算顺序排列的中间量。
     每一步都调用上面同一批函数与常数，页面只负责把 vals 打印出来，
     不另写第二份公式。标签里的公式符号与论文原式一致，不随语言变。
     色貌模型吃绝对亮度：XYZ 先乘 opts.Lw（默认 100 cd/m²）。 */
  function trace(slug, xyz, opts) {
    opts = opts || {};
    var La = opts.La === undefined ? 64 : opts.La;
    var Yb = opts.Yb === undefined ? 20 : opts.Yb;
    var Lw = opts.Lw === undefined ? 100 : opts.Lw;
    var F = opts.F === undefined ? 1 : opts.F;
    var c = opts.c === undefined ? 0.69 : opts.c;
    var Nc = opts.Nc === undefined ? 1 : opts.Nc;
    var Nc16 = opts.Nc16 === undefined ? Nc : opts.Nc16;
    var W = D65_XYZ;
    var rows = [];
    function row(label, vals) { rows.push({ label: label, vals: vals }); }
    var whiteAbs = [W[0] * Lw, W[1] * Lw, W[2] * Lw];

    if (slug === 'ictcp') {
      var ic = ictcpForward(xyz, Lw);
      row('XYZ (Y = 1)', xyz);
      row('BT.2020 linear RGB', ic.rgb);
      row('LMS', ic.lms);
      row('PQ LMS (L_w / 10000)', ic.lmsPq);
      row('I, Ct, Cp', ic.ictcp);
    } else if (slug === 'lab') {
      var fx = fLab(xyz[0] / W[0]), fy = fLab(xyz[1] / W[1]), fz = fLab(xyz[2] / W[2]);
      var vL = lab(xyz, W);
      row('XYZ（Y = 1，D65）', xyz);
      row('X/X_n, Y/Y_n, Z/Z_n', [xyz[0] / W[0], xyz[1] / W[1], xyz[2] / W[2]]);
      row('f(t) = t^⅓（t > ε）', [fx, fy, fz]);
      row('L*, a*, b*', [vL[1], vL[0], vL[2]]);
    } else if (slug === 'luv') {
      var dv = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
      var dn = W[0] + 15 * W[1] + 3 * W[2];
      var vU = luv(xyz, W);
      row('XYZ（Y = 1，D65）', xyz);
      row('Y/Y_n, L*', [xyz[1] / W[1], vU[1]]);
      row('u′ = 4X/d, v′ = 9Y/d', [4 * xyz[0] / dv, 9 * xyz[1] / dv]);
      row('白点 u′_n, v′_n', [4 * W[0] / dn, 9 * W[1] / dn]);
      row('u*, v*', [vU[0], vU[2]]);
    } else if (slug === 'oklab') {
      var okLms = mulv(OK_M1, xyz);
      var vO = oklab(xyz);
      row('XYZ（Y = 1，D65）', xyz);
      row('M₁ · XYZ → LMS', okLms);
      row('LMS^⅓', [Math.cbrt(okLms[0]), Math.cbrt(okLms[1]), Math.cbrt(okLms[2])]);
      row('L, a, b', [vO[1], vO[0], vO[2]]);
    } else if (slug === 'ipt') {
      var ipLms = mulv(IPT_XYZ_LMS, xyz);
      var vI = ipt(xyz);
      row('XYZ（Y = 1，D65）', xyz);
      row('M · XYZ → LMS（D65 归一）', ipLms);
      row('sgn·|LMS|^0.43', [signPow(ipLms[0], 0.43), signPow(ipLms[1], 0.43), signPow(ipLms[2], 0.43)]);
      row('I, P, T', [vI[1], vI[0], vI[2]]);
    } else if (slug === 'jzazbz') {
      var jAbs = [xyz[0] * Lw, xyz[1] * Lw, xyz[2] * Lw];
      var Xp = JZ17.b * jAbs[0] - (JZ17.b - 1) * jAbs[2];
      var Yp = JZ17.g * jAbs[1] - (JZ17.g - 1) * jAbs[0];
      var jLms = mulv(JZ_XYZ_LMS, [Xp, Yp, jAbs[2]]);
      var jPq = [
        pqJz(jLms[0] * 1e-4, JZ17.c1, JZ17.c2, JZ17.c3, JZ17.n, JZ17.p),
        pqJz(jLms[1] * 1e-4, JZ17.c1, JZ17.c2, JZ17.c3, JZ17.n, JZ17.p),
        pqJz(jLms[2] * 1e-4, JZ17.c1, JZ17.c2, JZ17.c3, JZ17.n, JZ17.p)
      ];
      var jIz = mulv(JZ_LMS_Izazbz_2017, jPq);
      var vJ = jzazbz(xyz, Lw);
      row('XYZ × L_w → 绝对亮度 (cd/m²)', jAbs);
      row('X′ = 1.15X − 0.15Z, Y′ = 0.66Y + 0.34X', [Xp, Yp, jAbs[2]]);
      row('M · [X′, Y′, Z] → LMS', jLms);
      row('PQ（归一 10 000 cd/m²）', jPq);
      row('Iz, az, bz', jIz);
      row('Jz（d = −0.56 的重标定）', [vJ[1], vJ[0], vJ[2]]);
    } else if (slug === 'cam02' || slug === 'cam16') {
      var abs = [xyz[0] * Lw, xyz[1] * Lw, xyz[2] * Lw];
      var o2 = { La: La, Yb: Yb, F: F, c: c, Nc: Nc, Nc16: Nc16 };
      var r2 = slug === 'cam02' ? cam02Forward(abs, whiteAbs, o2) : cam16Forward(abs, whiteAbs, o2);
      row('XYZ × L_w → 绝对亮度 (cd/m²)', abs);
      if (slug === 'cam02') {
        row('CAT02 · XYZ → RGB', r2.stage.rgb);
        row('D 与 D_R, D_G, D_B', [r2.D, r2.stage.DRGB[0], r2.stage.DRGB[1], r2.stage.DRGB[2]]);
        row('CAT02⁻¹ · RGB_c → XYZ_c', mulv(CAT02_INV, r2.stage.rgbC));
        row('HPE · XYZ_c → R′G′B′', r2.stage.rgbP);
      } else {
        row('CAT16 · XYZ → RGB', r2.stage.rgb);
        row('D 与 D_R, D_G, D_B', [r2.D, r2.stage.DRGB[0], r2.stage.DRGB[1], r2.stage.DRGB[2]]);
        row('D_RGB · RGB → RGB_c', [r2.stage.DRGB[0] * r2.stage.rgb[0], r2.stage.DRGB[1] * r2.stage.rgb[1], r2.stage.DRGB[2] * r2.stage.rgb[2]]);
      }
      row('R_a, G_a, B_a（400 标度压缩）', r2.stage.adapted);
      row('A, a, b', r2.stage.Aab);
      row('J, C, M, h（h 取度）', [r2.J, r2.C, r2.M, r2.h]);
      row('J′, a′, b′（UCS）', [r2.Jp, r2.ap, r2.bp]);
    } else if (slug === 'zcam') {
      var zAbs = [xyz[0] * Lw, xyz[1] * Lw, xyz[2] * Lw];
      var z2 = zcamForward(zAbs, whiteAbs, { La: La, Yb: Yb, F: F, Fs: opts.Fs });
      row('XYZ × L_w → 绝对亮度 (cd/m²)', zAbs);
      row('CAT02（Zhai 2018，D 由 F、L_A 定）→ XYZ′', z2.stage.xyzD65);
      row('Iz, az, bz（Safdar 2021 版）', z2.stage.iz);
      row('F_b, F_L, Q_z / Q_zw', [z2.Fb, z2.FL, z2.Qz, z2.Qzw]);
      row('Jz, Mz, hz', [z2.Jz, z2.Mz, z2.hz]);
    } else {
      throw new Error('unknown model: ' + slug);
    }
    return rows;
  }

  root.ColourModels = {
    xyzToXyy: xyzToXyy,
    xyyToXyz: xyyToXyz,
    xyToUv: xyToUv,
    xyzToLms: xyzToLms,
    lmsToXyz: lmsToXyz,
    rgbToHsv: rgbToHsv,
    hsvToRgb: hsvToRgb,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    rgbToYcbcr: rgbToYcbcr,
    ycbcrToRgb: ycbcrToRgb,
    ictcpForward: ictcpForward,
    ictcpToXyz: ictcpToXyz,
    pq: pq,
    lab: lab,
    labToXyz: labToXyz,
    luvToXyz: luvToXyz,
    oklabToXyz: oklabToXyz,
    iptToXyz: iptToXyz,
    jzazbzToXyz: jzazbzToXyz,
    cam02Forward: cam02Forward,
    cam16Forward: cam16Forward,
    zcamForward: zcamForward,
    trace: trace,
    encodeSrgb: encodeSrgb,
    encodeGamma: encodeGamma,
    encodePq: encodePq,
    ictcp: ictcp,
    jzazbz: jzazbz,
    oklab: oklab,
    ipt: ipt,
    luv: luv,
    cam02ucs: cam02ucs,
    cam16ucs: cam16ucs,
    zcam: zcam
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ColourModels;
})(typeof window !== 'undefined' ? window : globalThis);
