/*
 * 色彩外观 / UCS 模型（试验页用）
 * 输入：XYZ（相对量，参考白 Y = 1）+ 参考白亮度 Lw（cd/m²）
 * 输出：显示三元组 [水平, 竖直, 深度]，竖直方向统一是明度类轴
 *
 * 公式来源：ICtCp (Dolby/BT.2100)、JzAzBz (Safdar 2017)、ZCAM (Safdar 2021)、
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
  var JZ_LMS_Izazbz_2021 = [0.0, 1.0, 0.0,
                            3.524, -4.066708, 0.542708,
                            0.199076, 1.096799, -1.295875];

  var JZ17 = { b: 1.15, g: 0.66, c1: 0.8359375, c2: 18.8515625, c3: 18.6875,
               n: 0.1593017578125, p: 134.034375, d: -0.56, d0: 1.6295499532821565e-11 };
  var JZ21 = { b: 1.15, g: 0.66, c1: 0.8359375, c2: 18.8515625, c3: 18.6875,
               n: 0.1593017578125, p: 134.034375, d: -0.56, d0: 3.7035226210190005e-11 };

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

    function adapt(v) {
      var t = Math.pow(FL * v / 100, 0.42);
      return signPow(400 * t / (t + 27.13), 1) + 0.1;
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

    var J = 100 * Math.pow(A / Aw, c * z);
    var t = (50000 / 13 * Nc * Nbb * et * Math.sqrt(a * a + b * b)) / (Ra + Ga + 21 / 20 * Ba);
    var C = Math.pow(t, 0.9) * Math.sqrt(J / 100) * Math.pow(1.64 - Math.pow(0.29, n), 0.73);
    var M = C * Math.pow(FL, 0.25);

    var Jp = 1.7 * J / (1 + 0.007 * J);
    var Mp = Math.log(1 + 0.0228 * M) / 0.0228;
    return [Mp * Math.cos(h), Jp, Mp * Math.sin(h)]; // [a', J', b']
  }

  /* ---------- ZCAM ---------- */

  function zcam(xyz, Wrel, Lw, opts) {
    var Fs = opts.Fs;
    var La = opts.La;
    var Yb = opts.YbRel;

    // ZCAM 的 Jz 用相对 XYZ（白点 Y = 1），只有 F_L 用绝对 L_A
    // 三个空间的白点都是 D65，Zhai 2018 色适应为恒等，这里直接略过
    var abs = xyz;
    var white = Wrel;

    var iz = jzazbzI(abs, JZ21, JZ_LMS_Izazbz_2021);
    var izw = jzazbzI(white, JZ21, JZ_LMS_Izazbz_2021);

    var Fb = Math.sqrt(Yb);
    var FL = 0.171 * Math.cbrt(La) * (1 - Math.exp(-48 / 9 * La));

    var hz = Math.atan2(iz[2], iz[1]) * 180 / Math.PI;
    if (hz < 0) hz += 360;
    var ez = 1.015 + Math.cos((89.038 + hz) * Math.PI / 180);

    var Qp = 1.6 * Fs / Math.pow(Fb, 0.12);
    var Qm = Math.pow(Fs, 2.2) * Math.sqrt(Fb) * Math.pow(FL, 0.2);
    var Qz = 2700 * Math.pow(iz[0], Qp) * Qm;
    var Qzw = 2700 * Math.pow(izw[0], Qp) * Qm;
    var Jz = 100 * Qz / Qzw;

    var Mz = 100 * Math.pow(iz[1] * iz[1] + iz[2] * iz[2], 0.37) *
             (Math.pow(ez, 0.068) * Math.pow(FL, 0.2)) /
             (Math.pow(Fb, 0.1) * Math.pow(izw[0], 0.78));
    var Cz = 100 * Mz / Qzw;

    var rad = hz * Math.PI / 180;
    var Vz = Math.sqrt(Math.pow(Jz - 58, 2) + 3.4 * Cz * Cz);
    var Kz = 100 - 0.8 * Math.sqrt(Jz * Jz + 8 * Cz * Cz);
    var Wz = 100 - Math.sqrt(Math.pow(100 - Jz, 2) + Cz * Cz);
    var Sz = 100 * Math.pow(FL, 0.6) * Math.sqrt(Qz > 0 ? Mz / Qz : 0);
    return {
      az: Cz * Math.cos(rad), Jz: Jz, bz: Cz * Math.sin(rad),
      Cz: Cz, Vz: Vz, Kz: Kz, Wz: Wz, Mz: Mz, Sz: Sz, hz: hz
    };
  }

  root.ColourModels = {
    pq: pq,
    ictcp: ictcp,
    jzazbz: jzazbz,
    oklab: oklab,
    luv: luv,
    cam02ucs: cam02ucs,
    zcam: zcam
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ColourModels;
})(typeof window !== 'undefined' ? window : globalThis);
