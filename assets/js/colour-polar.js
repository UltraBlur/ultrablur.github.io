/* 极坐标选色模型的往返变换：HSV / LCH / OKLCH / JMH / JzCH */
(function (root) {
  'use strict';
  var M = root.ColourModels || {};

  function mat(m) {
    if (!m) return null;
    if (m.length === 9 && typeof m[0] === 'number') return m.slice();
    var o = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) o.push(m[i][j]);
    return o;
  }
  function mv(A, v) {
    return [A[0]*v[0]+A[1]*v[1]+A[2]*v[2], A[3]*v[0]+A[4]*v[1]+A[5]*v[2], A[6]*v[0]+A[7]*v[1]+A[8]*v[2]];
  }
  function inv3(A) {
    var a=A[0],b=A[1],c=A[2],d=A[3],e=A[4],f=A[5],g=A[6],h=A[7],i=A[8];
    var A00=e*i-f*h, A01=-(d*i-f*g), A02=d*h-e*g;
    var det=a*A00+b*A01+c*A02;
    if (!det) return null;
    var s=1/det;
    return [A00*s, -(b*i-c*h)*s, (b*f-c*e)*s,
            A01*s, (a*i-c*g)*s, -(a*f-c*d)*s,
            A02*s, -(a*h-b*g)*s, (a*e-b*d)*s];
  }

  var SRGB = [0.412390799266, 0.357584339384, 0.180480788402,
              0.212639005872, 0.715168678768, 0.072192315361,
              0.019330818716, 0.119194779795, 0.950532152250];
  var SRGB_INV = inv3(SRGB);
  var W = [0.95047, 1, 1.08883];

  function encode(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055; }
  function decode(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055)/1.055, 2.4); }

  /* ---- CIE Lab / LCH ---- */
  function xyzFromLab(lab) {
    var f1 = (lab[0] + 16) / 116, f0 = lab[1] / 500 + f1, f2 = f1 - lab[2] / 200;
    var e = 216/24389, k = 24389/27;
    function finv(t) { var t3 = t*t*t; return t3 > e ? t3 : (116*t - 16)/k; }
    return [finv(f0)*W[0], finv(f1)*W[1], finv(f2)*W[2]];
  }
  function labFromXyz(xyz) {
    var t = [xyz[0]/W[0], xyz[1]/W[1], xyz[2]/W[2]];
    var e = 216/24389, k = 24389/27;
    var f = t.map(function (q) { return q > e ? Math.cbrt(q) : (k*q + 16)/116; });
    return [116*f[1] - 16, 500*(f[0]-f[1]), 200*(f[1]-f[2])];
  }

  /* ---- Oklab ---- */
  var OK_M1 = [0.8189330101, 0.3618667424, -0.1288597137,
               0.0329845436, 0.9293118715, 0.0361456387,
               0.0482003018, 0.2643662691, 0.6338517070];
  var OK_M2 = [0.2104542553, 0.7936177850, -0.0040720468,
               1.9779984951, -2.4285922050, 0.4505937099,
               0.0259040371, 0.7827717662, -0.8086757660];
  var OK_M1_INV = inv3(OK_M1), OK_M2_INV = inv3(OK_M2);
  function xyzFromOklab(lab) {
    var lms = mv(OK_M2_INV, lab);
    return mv(OK_M1_INV, [lms[0]*lms[0]*lms[0], lms[1]*lms[1]*lms[1], lms[2]*lms[2]*lms[2]]);
  }
  function oklabFromXyz(xyz) {
    var lms = mv(OK_M1, xyz);
    return mv(OK_M2, [Math.cbrt(lms[0]), Math.cbrt(lms[1]), Math.cbrt(lms[2])]);
  }

  /* ---- JzAzBz（Lw = 100 cd/m²） ---- */
  var Lw = 100;
  var JZ = { b: 1.15, g: 0.66, c1: 0.8359375, c2: 18.8515625, c3: 18.6875,
             n: 0.1593017578125, p: 134.034375, d: -0.56, d0: 1.6295499532821565e-11 };
  var JZ_XYZ_LMS = [0.41478972, 0.579999, 0.014648,
                    -0.20151, 1.120649, 0.0531008,
                    -0.0166008, 0.2648, 0.6684799];
  var JZ_LMS_IZ = [0.5, 0.5, 0.0,
                   3.524, -4.066708, 0.542708,
                   0.199076, 1.096799, -1.295875];
  var JZ_LMS_IZ_INV = inv3(JZ_LMS_IZ), JZ_XYZ_LMS_INV = inv3(JZ_XYZ_LMS);

  function jzPq(v) {
    if (!(v > 0)) return 0;
    var q = Math.pow(v, JZ.n);
    return Math.pow((JZ.c1 + JZ.c2*q) / (1 + JZ.c3*q), JZ.p);
  }
  function jzPqInv(v) {
    if (!(v > 0)) return 0;
    var vp = Math.pow(v, 1/JZ.p);
    return Math.pow((JZ.c1 - vp) / (JZ.c3*vp - JZ.c2), 1/JZ.n);
  }
  function jzazbzFromXyz(xyz) {
    var X = xyz[0]*Lw, Y = xyz[1]*Lw, Z = xyz[2]*Lw;
    var Xp = JZ.b*X - (JZ.b-1)*Z, Yp = JZ.g*Y - (JZ.g-1)*X;
    var lms = mv(JZ_XYZ_LMS, [Xp, Yp, Z]);
    var l = jzPq(lms[0]/10000), m = jzPq(lms[1]/10000), s = jzPq(lms[2]/10000);
    var iz = mv(JZ_LMS_IZ, [l, m, s]);
    var jz = ((1 + JZ.d)*iz[0]) / (1 + JZ.d*iz[0]) - JZ.d0;
    return [jz, iz[1], iz[2]];
  }
  function xyzFromJzazbz(jzab) {
    var u = jzab[0] + JZ.d0;
    var Iz = u / (1 + JZ.d - u*JZ.d);
    var lmsP = mv(JZ_LMS_IZ_INV, [Iz, jzab[1], jzab[2]]);
    var lms = [jzPqInv(lmsP[0])*10000, jzPqInv(lmsP[1])*10000, jzPqInv(lmsP[2])*10000];
    var xp = mv(JZ_XYZ_LMS_INV, lms);
    var Z = xp[2];
    var X = (xp[0] + (JZ.b-1)*Z) / JZ.b;
    var Y = (xp[1] + (JZ.g-1)*X) / JZ.g;
    return [X/Lw, Y/Lw, Z/Lw];
  }

  /* ---- CIECAM02（JMH） ---- */
  var CAT02 = [0.7328, 0.4296, -0.1624, -0.7036, 1.6975, 0.0061, 0.0030, 0.0136, 0.9834];
  var CAT02_INV = inv3(CAT02);
  var HPE = [0.38971, 0.68898, -0.07868, -0.22981, 1.18340, 0.04641, 0, 0, 1];
  var HPE_INV = inv3(HPE);

  function camCtx(la, yb, F, c, Nc) {
    var k = 1/(5*la + 1);
    var FL = 0.2*Math.pow(k,4)*5*la + 0.1*Math.pow(1-Math.pow(k,4),2)*Math.cbrt(5*la);
    var n = yb/100, z = 1.48 + Math.sqrt(n), Nbb = 0.725*Math.pow(1/n, 0.2);
    var D = Math.max(0, Math.min(1, F*(1 - (1/3.6)*Math.exp((-la - 42)/92))));
    return { la: la, FL: FL, n: n, z: z, Nbb: Nbb, Nc: Nc, c: c, D: D };
  }
  function camAdaptChain(xyz, ctx) {
    var rgb = mv(CAT02, xyz);
    var rgbW = mv(CAT02, [W[0]*100, W[1]*100, W[2]*100]);
    void rgbW;
    return rgb;
  }
  /* JMH → XYZ：以正向模型为准做牛顿迭代，避免解析逆变换的误差 */
  function cam02FromJMh(J, M, h, opts) {
    var rad = Math.PI/180;
    var guess = [J, M*0.55*Math.cos(h*rad), M*0.55*Math.sin(h*rad)];
    var xyz = xyzFromLab(guess);
    function errOf(v) {
      var spec = camForward([v[0]*100, v[1]*100, v[2]*100], opts);
      var dh = ((spec[2] - h + 540) % 360) - 180;
      return [spec[0] - J, spec[1] - M, dh];
    }
    for (var it = 0; it < 20; it++) {
      var e = errOf(xyz);
      if (Math.abs(e[0]) < 2e-2 && Math.abs(e[1]) < 0.2 && Math.abs(e[2]) < 0.1) break;
      var eps = 1e-4;
      var J1 = [[0,0,0],[0,0,0],[0,0,0]];
      for (var c = 0; c < 3; c++) {
        var v2 = xyz.slice();
        v2[c] += eps;
        var e2 = errOf(v2);
        for (var r = 0; r < 3; r++) J1[r][c] = (e2[r] - e[r]) / eps;
      }
      var det = J1[0][0]*(J1[1][1]*J1[2][2]-J1[1][2]*J1[2][1])
              - J1[0][1]*(J1[1][0]*J1[2][2]-J1[1][2]*J1[2][0])
              + J1[0][2]*(J1[1][0]*J1[2][1]-J1[1][1]*J1[2][0]);
      if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
      var dx = [
        -(( e[0]*(J1[1][1]*J1[2][2]-J1[1][2]*J1[2][1]) - J1[0][1]*(e[1]*J1[2][2]-J1[1][2]*e[2]) + J1[0][2]*(e[1]*J1[2][1]-J1[1][1]*e[2])) / det),
        -(( J1[0][0]*(e[1]*J1[2][2]-J1[1][2]*e[2]) - e[0]*(J1[1][0]*J1[2][2]-J1[1][2]*J1[2][0]) + J1[0][2]*(J1[1][0]*e[2]-e[1]*J1[2][0])) / det),
        -(( J1[0][0]*(J1[1][1]*e[2]-e[1]*J1[2][1]) - J1[0][1]*(J1[1][0]*e[2]-e[1]*J1[2][0]) + e[0]*(J1[1][0]*J1[2][1]-J1[1][1]*J1[2][0])) / det)
      ];
      var step = 1;
      for (var k = 0; k < 3; k++) {
        if (!isFinite(dx[k])) return null;
        step = Math.min(step, Math.abs(xyz[k]) > 1e-6 ? 0.5/Math.max(Math.abs(dx[k]/xyz[k]), 1e-9) : 1);
      }
      step = Math.min(1, step);
      for (var k2 = 0; k2 < 3; k2++) xyz[k2] += dx[k2]*step;
      if (xyz.some(function (v) { return !isFinite(v); })) return null;
    }
    if (xyz.some(function (v) { return !isFinite(v); })) return null;
    var fin = errOf(xyz);
    if (Math.abs(fin[0]) > 0.2 || Math.abs(fin[1]) > 1.0 || Math.abs(fin[2]) > 2.0) return null;
    return xyz;
  }

  /* ---- 统一接口 ---- */
  function rgbFromXyz(xyz) {
    var lin = mv(SRGB_INV, xyz);
    return lin.map(encode);
  }
  function xyzFromRgb(rgb) {
    return mv(SRGB, rgb.map(decode));
  }
  function inGamut(rgb) {
    return rgb.every(function (c) { return c >= -1e-4 && c <= 1 + 1e-4; });
  }

  var CAM_OPTS = { la: 20, yb: 20, F: 1, c: 0.69, Nc: 1 };

  /* ---- Hellwig JMh（ACES 2.0）：与色体积、DRT 页同一个内核 ---- */
  var JMH = root.AcesJMh || null;
  var JMH_PARAMS = null;
  if (JMH) {
    try { JMH_PARAMS = JMH.init([[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]], [0.3127, 0.329]); }
    catch (e) { JMH_PARAMS = null; }
  }

  /* 参考白亮度：JzAzBz 用 Lw，CAM02 的 L_A / Y_b 取白点的 20% */
  function setWhite(v) {
    Lw = v;
    CAM_OPTS.la = 0.2 * v;
    CAM_OPTS.yb = 0.2 * v;
  }

  var models = {
    hsv: {
      id: 'hsv', label: 'HSV',
      cLabel: 'S', lLabel: 'V',
      ranges: { c: [0, 1], l: [0, 1] },
      toRgb: function (h, c, l) {
        var cc = l*c, x = cc*(1 - Math.abs((h/60) % 2 - 1)), m = l - cc;
        var r=0,g=0,b=0;
        if (h<60){r=cc;g=x;} else if (h<120){r=x;g=cc;} else if (h<180){g=cc;b=x;}
        else if (h<240){g=x;b=cc;} else if (h<300){r=x;b=cc;} else {r=cc;b=x;}
        return [r+m, g+m, b+m];
      },
      fromRgb: function (rgb) {
        var mx = Math.max.apply(null, rgb), mn = Math.min.apply(null, rgb), d = mx - mn, h = 0;
        if (d > 1e-9) {
          if (mx === rgb[0]) h = 60*(((rgb[1]-rgb[2])/d + 6) % 6);
          else if (mx === rgb[1]) h = 60*((rgb[2]-rgb[0])/d + 2);
          else h = 60*((rgb[0]-rgb[1])/d + 4);
        }
        return [h, mx > 1e-9 ? d/mx : 0, mx];
      }
    },
    lch: {
      id: 'lch', label: 'LCH (Lab)',
      cLabel: 'C*', lLabel: 'L*',
      ranges: { c: [0, 130], l: [0, 100] },
      toRgb: function (h, c, l) {
        var hr = h*Math.PI/180;
        return rgbFromXyz(xyzFromLab([l, c*Math.cos(hr), c*Math.sin(hr)]));
      },
      fromRgb: function (rgb) {
        var lab = labFromXyz(xyzFromRgb(rgb));
        return [(Math.atan2(lab[2], lab[1])*180/Math.PI + 360) % 360, Math.hypot(lab[1], lab[2]), lab[0]];
      }
    },
    oklch: {
      id: 'oklch', label: 'OKLCH',
      cLabel: 'C', lLabel: 'L',
      ranges: { c: [0, 0.4], l: [0, 1] },
      toRgb: function (h, c, l) {
        var hr = h*Math.PI/180;
        return rgbFromXyz(xyzFromOklab([l, c*Math.cos(hr), c*Math.sin(hr)]));
      },
      fromRgb: function (rgb) {
        var ok = oklabFromXyz(xyzFromRgb(rgb));
        return [(Math.atan2(ok[2], ok[1])*180/Math.PI + 360) % 360, Math.hypot(ok[1], ok[2]), ok[0]];
      }
    },
    jzch: {
      id: 'jzch', label: 'JzCH',
      cLabel: 'Cz', lLabel: 'Jz',
      ranges: { c: [0, 0.3], l: [0, 0.16718] },
      toRgb: function (h, c, l) {
        var hr = h*Math.PI/180;
        return rgbFromXyz(xyzFromJzazbz([l, c*Math.cos(hr), c*Math.sin(hr)]));
      },
      fromRgb: function (rgb) {
        var jz = jzazbzFromXyz(xyzFromRgb(rgb));
        return [(Math.atan2(jz[2], jz[1])*180/Math.PI + 360) % 360, Math.hypot(jz[1], jz[2]), jz[0]];
      }
    },
    jmhh: {
      id: 'jmhh', label: 'JMH (Hellwig)',
      cLabel: 'M', lLabel: 'J',
      ranges: { c: [0, 120], l: [0, 100] },
      toRgb: function (h, c, l) {
        if (!JMH_PARAMS) return null;
        /* CTL 的 JMh 以 1.0 = 100 cd/m² 标定，jmhToRGB 直接回显示线性的 sRGB */
        var lin = JMH.jmhToRGB([l, c, h], JMH_PARAMS);
        return rgbFromXyz(mv(SRGB, lin));
      },
      fromRgb: function (rgb) {
        if (!JMH_PARAMS) return [0, 0, 0];
        var v = JMH.rgbToJMh(rgb.map(decode), JMH_PARAMS);
        return [v[2], v[1], v[0]]; // [h, M, J]
      }
    },
    jmh: {
      id: 'jmh', label: 'JMH (CAM02)',
      cLabel: 'M', lLabel: 'J',
      ranges: { c: [0, 120], l: [0, 100] },
      toRgb: function (h, c, l) {
        var xyz = cam02FromJMh(l, c, h, CAM_OPTS);
        return xyz ? rgbFromXyz(xyz) : null;
      },
      fromRgb: function (rgb) {
        var xyz = xyzFromRgb(rgb).map(function (v) { return v*100; });
        var spec = camForward(xyz, CAM_OPTS);
        return [spec[2], spec[1], spec[0]];
      }
    }
  };

  /* CIECAM02 正向（用于 JMH 读数） */
  function camForward(xyz, opts) {
    var ctx = camCtx(opts.la, opts.yb, opts.F, opts.c, opts.Nc);
    var white = [W[0]*100, W[1]*100, W[2]*100];
    var rgbW = mv(CAT02, white);
    var Yw = white[1];
    var rgb = mv(CAT02, xyz);
    var rgbC = [0,1,2].map(function (i) { return (ctx.D*Yw/rgbW[i] + 1 - ctx.D)*rgb[i]; });
    var rgbWC = [0,1,2].map(function (i) { return (ctx.D*Yw/rgbW[i] + 1 - ctx.D)*rgbW[i]; });
    var rgbP = mv(HPE, mv(CAT02_INV, rgbC));
    var rgbPW = mv(HPE, mv(CAT02_INV, rgbWC));
    function adapt(v) {
      var s = v < 0 ? -1 : 1;
      var t = Math.pow(ctx.FL*Math.abs(v)/100, 0.42);
      return s*400*t/(t + 27.13) + 0.1;
    }
    var Ra = adapt(rgbP[0]), Ga = adapt(rgbP[1]), Ba = adapt(rgbP[2]);
    var RaW = adapt(rgbPW[0]), GaW = adapt(rgbPW[1]), BaW = adapt(rgbPW[2]);
    var Aw = (2*RaW + GaW + BaW/20 - 0.305)*ctx.Nbb;
    var a = Ra - 12*Ga/11 + Ba/11, b = (Ra + Ga - 2*Ba)/9;
    var h = (Math.atan2(b, a)*180/Math.PI + 360) % 360;
    var et = 0.25*(Math.cos(h*Math.PI/180 + 2) + 3.8);
    var A = (2*Ra + Ga + Ba/20 - 0.305)*ctx.Nbb;
    var J = 100*Math.pow(A/Aw, ctx.c*ctx.z);
    var t = (50000/13*ctx.Nc*ctx.Nbb*et*Math.hypot(a, b)) / (Ra + Ga + 21/20*Ba);
    var C = Math.pow(Math.max(t, 1e-6), 0.9)*Math.sqrt(J/100)*Math.pow(1.64 - Math.pow(0.29, ctx.n), 0.73);
    return [J, C*Math.pow(ctx.FL, 0.25), h]; // [J, M, h]
  }

  root.ColourPolar = {
    models: models,
    rgbFromXyz: rgbFromXyz,
    xyzFromRgb: xyzFromRgb,
    inGamut: inGamut,
    camForward: camForward,
    setWhite: setWhite,
    whiteJz: function () { return jzazbzFromXyz([W[0], W[1], W[2]])[0]; },
    labFromXyz: labFromXyz,
    oklabFromXyz: oklabFromXyz,
    jzazbzFromXyz: jzazbzFromXyz,
    M: M
  };
})(typeof window !== 'undefined' ? window : globalThis);
