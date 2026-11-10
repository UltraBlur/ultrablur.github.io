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

  function ictcp(xyz, Lw) {
    var rgb = mulv(BT2020_INV, xyz);
    var lms = mulv(ICTCP_RGB_LMS, rgb);
    var k = Lw / 10000;
    var l = pq(lms[0] * k), m = pq(lms[1] * k), s = pq(lms[2] * k);
    var out = mulv(ICTCP_M, [l, m, s]);
    return [out[1], out[0], out[2]]; // [Ct, I, Cp]
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

  /* ---------- CIE 1976 L*u*v* ---------- */

  function luv(xyz, W) {
    var d = xyz[0] + 15 * xyz[1] + 3 * xyz[2];
    var dn = W[0] + 15 * W[1] + 3 * W[2];
    var up = d > 1e-12 ? 4 * xyz[0] / d : 0;
    var vp = d > 1e-12 ? 9 * xyz[1] / d : 0;
    var upn = 4 * W[0] / dn, vpn = 9 * W[1] / dn;
    var yr = xyz[1] / W[1];
    var e = 216 / 24389, k = 24389 / 27;
    var L = yr > e ? 116 * Math.cbrt(yr) - 16 : k * yr;
    return [13 * L * (up - upn), L, 13 * L * (vp - vpn)]; // [u*, L*, v*]
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

  function cam02ucs(xyzAbs, whiteAbs, opts) {
    var La = opts.La, Yb = opts.Yb, F = opts.F, c = opts.c, Nc = opts.Nc;

    var rgb = mulv(CAT02, xyzAbs);
    var rgbW = mulv(CAT02, whiteAbs);
    var D = F * (1 - (1 / 3.6) * Math.exp((-La - 42) / 92));
    D = Math.max(0, Math.min(1, D));

    var Yw = whiteAbs[1];
    var rgbC = [
      (D * Yw / rgbW[0] + 1 - D) * rgb[0],
      (D * Yw / rgbW[1] + 1 - D) * rgb[1],
      (D * Yw / rgbW[2] + 1 - D) * rgb[2]
    ];
    var rgbWC = [
      (D * Yw / rgbW[0] + 1 - D) * rgbW[0],
      (D * Yw / rgbW[1] + 1 - D) * rgbW[1],
      (D * Yw / rgbW[2] + 1 - D) * rgbW[2]
    ];

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

    var Jp = 1.7 * J / (1 + 0.007 * J);
    var Mp = Math.log(1 + 0.0228 * M) / 0.0228;
    return [Mp * Math.cos(h), Jp, Mp * Math.sin(h)]; // [a', J', b']
  }

  /* ---------- CAM16（Li et al. 2017）+ CAM16-UCS ---------- */

  var CAT16 = [0.401288, 0.650173, -0.051461,
               -0.250268, 1.204414, 0.045854,
               -0.002079, 0.048952, 0.953127];

  function cam16ucs(xyzAbs, whiteAbs, opts) {
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

    var Jp = 1.7 * J / (1 + 0.007 * J);
    var Mp = Math.log(1 + 0.0228 * M) / 0.0228;
    return [Mp * Math.cos(h), Jp, Mp * Math.sin(h)]; // [a', J', b']
  }

  /* ---------- ZCAM（Safdar et al. 2021） ---------- */

  var D65_XYZ = [0.9504559270516716, 1, 1.0890577507598784];
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

  function zcam(xyzAbs, whiteAbs, opts) {
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
    return [Mz * Math.cos(hr), Jz, Mz * Math.sin(hr)]; // [az, Jz, bz]
  }

  root.ColourModels = {
    pq: pq,
    encodeSrgb: encodeSrgb,
    encodeGamma: encodeGamma,
    encodePq: encodePq,
    ictcp: ictcp,
    jzazbz: jzazbz,
    oklab: oklab,
    luv: luv,
    cam02ucs: cam02ucs,
    cam16ucs: cam16ucs,
    zcam: zcam
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ColourModels;
})(typeof window !== 'undefined' ? window : globalThis);
