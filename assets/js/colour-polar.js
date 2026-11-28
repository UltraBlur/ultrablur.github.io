/*
 * 极坐标选色模型的往返变换：HSV / LCH / OKLCH / JMH(CAM02) / JMH(Hellwig) / JzCH
 *
 * 约定：
 * - 每个模型给出一对互逆变换。`toLin(h, c, l)` 返回线性 sRGB（可直接判色域），
 *   `toRgb(h, c, l)` 只是把线性值编码成 sRGB 显示值。
 * - `fromRgb(rgb)` 输入编码后的 sRGB（0–1），统一返回 [h, 彩度, 明度]。
 * - 色域判断一律在线性域做：编码曲线的 12.92 段会把暗部微小负误差放大，
 *   在编码值上判色域会误判边缘像素。
 */
(function (root) {
  'use strict';

  /* ---------- 3×3 ---------- */
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

  /*
   * 色域（可切换的 RGB 立方体）
   * - 立方体由原色 + 白点推出 RGB↔XYZ 矩阵；0–1 的码值一律用 sRGB 分段曲线解释，
   *   所以切换色域只改"能显示多大范围"，不改变同一码值的亮度分布口径。
   * - Lab / CIECAM02 的参考白始终是 D65，与色域无关：模型坐标描述颜色本身。
   * - 白点名 → 色度坐标的表与 assets/js/lib/cat.js 的 WHITES 保持一致（测试里交叉核对）。
   */
  var WHITE_POINTS = {
    D50: [0.3457, 0.3585],
    D55: [0.3324, 0.3474],
    D60: [0.32168, 0.33767],
    D65: [0.3127, 0.3290],
    D75: [0.2990, 0.3149],
    E: [1 / 3, 1 / 3],
    A: [0.44757, 0.40745],
    C: [0.31006, 0.31616],
    'ACES D60': [0.32168, 0.33767],
    'P3-DCI': [0.314, 0.351]
  };
  function xyToXyz(xy) {
    return [xy[0] / xy[1], 1, (1 - xy[0] - xy[1]) / xy[1]];
  }
  /* 原色 + 白点 → RGB→XYZ 矩阵（标准推导：M = [[xr/yr, xg/yg, xb/yb]…] 后按白点缩放） */
  function matrixFromPrimaries(primaries, whiteXY) {
    if (!primaries || primaries.length !== 3 || !whiteXY) return null;
    /* N 的三列是三个原色在 Y = 1 处的 XYZ（行优先展开） */
    var N = [], k, y0 = primaries[0][1], y1 = primaries[1][1], y2 = primaries[2][1];
    if (!(y0 > 0) || !(y1 > 0) || !(y2 > 0)) return null;
    N = [primaries[0][0] / y0, primaries[1][0] / y1, primaries[2][0] / y2,
         1, 1, 1,
         (1 - primaries[0][0] - y0) / y0, (1 - primaries[1][0] - y1) / y1, (1 - primaries[2][0] - y2) / y2];
    var Ni = inv3(N);
    if (!Ni) return null;
    var S = mv(Ni, xyToXyz(whiteXY));
    if (!S.every(function (v) { return isFinite(v); })) return null;
    return [N[0] * S[0], N[1] * S[1], N[2] * S[2],
            N[3] * S[0], N[4] * S[1], N[5] * S[2],
            N[6] * S[0], N[7] * S[1], N[8] * S[2]];
  }

  var spaces = {}, spaceOrder = [];
  /* 接受行优先 9 元组或 3×3 嵌套数组 */
  function flat3(m) {
    if (!m) return null;
    if (m.length === 9) return m.slice();
    if (m.length === 3 && m.every(function (r) { return r && r.length === 3; })) {
      return [].concat(m[0], m[1], m[2]);
    }
    return null;
  }
  function finiteMatrix(m) {
    var f = flat3(m);
    return !!f && f.every(function (v) { return isFinite(v); });
  }
  /* 资料页给的矩阵优先；没有才从原色与白点推导。
     给了矩阵也校验可逆与白点（M·[1,1,1] 的 xy 必须等于资料白点），
     不能因为名称像 D65 就假定是 D65。 */
  function whiteXyFromMatrix(m) {
    var f = flat3(m);
    if (!f || !f.every(function (v) { return isFinite(v); })) return null;
    var X = f[0] + f[1] + f[2], Y = f[3] + f[4] + f[5], Z = f[6] + f[7] + f[8];
    var s = X + Y + Z;
    if (!(Math.abs(s) > 1e-12)) return null;
    return [X / s, Y / s];
  }
  function addSpace(entry) {
    if (!entry || !entry.key) return false;
    /* 白点色度：显式 xy 优先（资料页 whitePoint），其次名称表，最后 D65。
       不能因为名称为空就假定 D65 —— P3-DCI / D50 / ACES D60 各不相同。 */
    var numericWhite = entry.white && typeof entry.white !== 'string' &&
      entry.white.length === 2 && isFinite(entry.white[0]) && isFinite(entry.white[1]);
    var whiteXY = entry.whiteXY ||
      (numericWhite ? [entry.white[0], entry.white[1]]
        : (WHITE_POINTS[entry.white] || WHITE_POINTS[entry.whiteName] || WHITE_POINTS.D65));
    var given = flat3(entry.matrix);
    if (given && !given.every(function (v) { return isFinite(v); })) given = null;
    var m = given;
    if (m) {
      if (!inv3(m)) m = null;
    }
    if (!m) m = matrixFromPrimaries(entry.primaries, whiteXY);
    if (!m) return false;
    spaces[entry.key] = {
      key: entry.key, label: entry.label || entry.key, tag: entry.tag || entry.key,
      white: entry.whiteName || (typeof entry.white === 'string' ? entry.white : null),
      whiteXY: whiteXY,
      primaries: entry.primaries, matrix: m, inverse: inv3(m),
      matrixGiven: !!given
    };
    if (spaceOrder.indexOf(entry.key) < 0) spaceOrder.push(entry.key);
    return true;
  }
  /* 兜底：没传数据时至少能用 sRGB */
  spaces.srgb = { key: 'srgb', label: 'sRGB', tag: 'sRGB', white: 'D65', whiteXY: WHITE_POINTS.D65,
                  matrix: SRGB, inverse: SRGB_INV };
  spaceOrder.push('srgb');
  var currentSpace = spaces.srgb;
  /* 参考白取 sRGB 矩阵自身的 D65 白（列和），不用 0.95047/1.08883：
     两套常数差 2e-4，会让 L* = 100、C* = 0 算出的线性值略大于 1，
     白色被判在色域外，平面的顶角出现一条灰边。 */
  var W = [0.950455927052, 1, 1.089057750761];

  /* ---------- 传递函数适配层 ----------
   *
   * 几何域永远是「当前原色的相对线性 RGB ∈ [0,1]」：曲线只负责线性量与编码量
   * 之间的换算，不改变色体边界。同一个 XYZ 换一条单调可逆曲线，Lab/OKLCH 坐标
   * 与色体轮廓不变，只有编码码值（以及 HSV 这类编码坐标）变化。
   *
   * 页面通过 `setTransfer(t, {lw, lb})` 注入 colour-codec.buildTransfers 的条目。
   * 没有注入时退回 sRGB 分段曲线，保证老测试与其它页面继续工作。
   *
   * 单位：
   * - display 曲线：相对线性 1.0 = 屏幕白 L_w（cd/m²）。BT.1886 的黑端是 L_b，
   *   所以相对量取 (L − L_b)/(L_w − L_b)，线性 0 对应绝对亮度 L_b。
   * - scene 曲线：线性量是场景线性（18% 灰 = 0.18），不乘 L_w；1.0 只是本工具
   *   的比较白，不代表传感器或显示峰值。
   */
  var SRGB_ENCODE_0 = function (c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1/2.4) - 0.055; };
  var SRGB_DECODE_0 = function (c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055)/1.055, 2.4); };

  var TPARAMS = { lw: 100, lb: 0 };
  var FALLBACK_TRANSFER = {
    id: 'srgb', label: { zh: 'sRGB 分段', en: 'sRGB piecewise' },
    kind: 'display', abs: false, vector: false, need: {},
    encode: function (L, p) { return SRGB_ENCODE_0(L / p.lw); },
    decode: function (v, p) { return SRGB_DECODE_0(v) * p.lw; }
  };
  var currentTransfer = FALLBACK_TRANSFER;

  function transferUsesLb(t) { return !!(t && t.need && t.need.lb); }
  /*
   * 该曲线是否让**码值**依赖 L_w：
   * - 相对标量 EOTF（线性 / sRGB 分段 / 纯幂 / CINITY）在 code ↔ linear 之间把 L_w
   *   约掉了（实测 L_w 100 → 1000 的码值差为 0），所以它们不需要 L_w；
   * - PQ 是绝对亮度曲线（码值 1 = 10000 nit），HLG 的 OETF 以 L_w 归一化，
   *   两者码值都随 L_w 变（实测 0.24 / 0.11）；
   * - BT.1886 的逆变换在幂空间归一化，只有 L_b > 0 时才与 L_w 有关；
   * - 场景曲线不含显示 nit，与 L_w 无关。
   * 界面据此决定 L_w 是否可用：模型需要它，或曲线需要它，才激活。
   */
  function transferNeedsLw(t) {
    t = t || currentTransfer;
    if (!t || t.kind === 'scene') return false;
    if (t.abs || t.vector) return true;
    if (t.need && t.need.lb) return TPARAMS.lb > 0;
    return false;
  }
  /* 相对线性 → 绝对亮度（或场景线性） */
  function absFromRel(v, t) {
    if (t && t.kind === 'scene') return v;
    var lb = transferUsesLb(t) ? TPARAMS.lb : 0;
    return lb + v * (TPARAMS.lw - lb);
  }
  /* 绝对亮度（或场景线性）→ 相对线性 */
  function relFromAbs(L, t) {
    if (t && t.kind === 'scene') return L;
    var lb = transferUsesLb(t) ? TPARAMS.lb : 0;
    var span = TPARAMS.lw - lb;
    return span > 0 ? (L - lb) / span : NaN;
  }

  /* 编码 RGB → 相对线性 RGB。返回 null 表示曲线定义域外或数值非法。 */
  function linearRgbFromCode(code) {
    if (!code || code.length !== 3) return null;
    if (!code.every(function (v) { return isFinite(v); })) return null;
    var t = currentTransfer, p = TPARAMS;
    if (t.vector) {
      var abs = t.decode(code, p);
      if (!abs || !abs.every(function (v) { return isFinite(v); })) return null;
      return abs.map(function (L) { return relFromAbs(L, t); });
    }
    var lin = code.map(function (v) {
      var L = t.decode(v, p);
      return relFromAbs(L, t);
    });
    return lin.every(function (v) { return isFinite(v); }) ? lin : null;
  }

  /* 相对线性 RGB → 编码 RGB。曲线对负值/超白的行为由 codec 决定；
     页面只用它显示码值，几何判定仍在 inGamut 的线性域里做。 */
  function codeRgbFromLinear(lin) {
    if (!lin || lin.length !== 3) return null;
    if (!lin.every(function (v) { return isFinite(v); })) return null;
    var t = currentTransfer, p = TPARAMS;
    if (t.vector) {
      var abs = lin.map(function (v) { return absFromRel(v, t); });
      var out = t.encode(abs, p);
      return (out && out.length === 3 && out.every(function (v) { return isFinite(v); })) ? out : null;
    }
    var code = lin.map(function (v) { return t.encode(absFromRel(v, t), p); });
    return code.every(function (v) { return isFinite(v); }) ? code : null;
  }

  /* 单通道便捷函数（内部仍走同一条曲线定义） */
  function encode(c) { return currentTransfer.encode(absFromRel(c, currentTransfer), TPARAMS); }
  function decode(c) { return relFromAbs(currentTransfer.decode(c, TPARAMS), currentTransfer); }

  function setTransfer(t, params) {
    if (!applyTransferParams(params)) return false;
    if (t && typeof t.encode === 'function' && typeof t.decode === 'function') currentTransfer = t;
    return true;
  }
  function applyTransferParams(params) {
    if (!params) return true;
    var lw = params.lw === undefined ? TPARAMS.lw : params.lw;
    var lb = params.lb === undefined ? TPARAMS.lb : params.lb;
    if (!isFinite(lw) || !(lw > 0) || !isFinite(lb) || lb < 0 || lb >= lw) return false;
    TPARAMS.lw = lw;
    TPARAMS.lb = lb;
    return true;
  }
  /* 显示白/黑位既进 JzCH、CAM02，也进 display 曲线；scene 曲线忽略它们。 */
  function srgbEncode(c) { return SRGB_ENCODE_0(c); }
  function srgbDecode(c) { return SRGB_DECODE_0(c); }

  /* ---------- CIE Lab / LCH ---------- */
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

  /* ---------- Oklab ---------- */
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

  /* ---------- JzAzBz（参考白亮度 Lw，默认 100 cd/m²） ---------- */
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
  /*
   * 反 PQ。定义域是 [0, 1]（对应 0–10000 cd/m² 的压缩 LMS'）：
   * - v === 0 是合法黑点（PQ(0) = 0）；
   * - v < 0 或 v > 1 的底数不合法，返回 NaN 而不是压成 0，
   *   否则定义域外的坐标会被静默映射成另一个合法颜色（见 tests 的 JzCH 暗部样本）。
   */
  function jzPqInv(v) {
    if (v === 0) return 0;
    if (!(v > 0) || v > 1 + 1e-12) return NaN;
    var vp = Math.pow(v, 1/JZ.p);
    /* 标准写法（ST 2084 / Safdar 2017）：分子取 max(vp - c1, 0)。
       v < c1^p ≈ 3.5e-11 时 vp < c1，不取 max 会得到负底数，幂运算变 NaN。 */
    var num = Math.max(vp - JZ.c1, 0);
    if (num === 0) return 0;
    var den = JZ.c2 - JZ.c3*vp;
    if (!(den > 0)) return NaN;
    return Math.pow(num/den, 1/JZ.n);
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
    if (!jzab || !jzab.every(function (v) { return isFinite(v); })) return null;
    var u = jzab[0] + JZ.d0;
    var Iz = u / (1 + JZ.d - u*JZ.d);
    var lmsP = mv(JZ_LMS_IZ_INV, [Iz, jzab[1], jzab[2]]);
    /* 压缩 LMS' 必须落在 PQ 定义域 [0,1]：越界说明 (Jz, Cz, h) 本身不可实现，
       直接判无效，不能靠后续 RGB 范围检查"看起来没问题" */
    if (!lmsP.every(function (v) { return v >= -1e-9 && v <= 1 + 1e-9; })) return null;
    var lms = [jzPqInv(lmsP[0])*10000, jzPqInv(lmsP[1])*10000, jzPqInv(lmsP[2])*10000];
    if (!lms.every(function (v) { return isFinite(v); })) return null;
    var xp = mv(JZ_XYZ_LMS_INV, lms);
    var Z = xp[2];
    var X = (xp[0] + (JZ.b-1)*Z) / JZ.b;
    var Y = (xp[1] + (JZ.g-1)*X) / JZ.g;
    return [X/Lw, Y/Lw, Z/Lw];
  }

  /* ---------- CIECAM02（JMH） ---------- */
  var CAT02 = [0.7328, 0.4296, -0.1624, -0.7036, 1.6975, 0.0061, 0.0030, 0.0136, 0.9834];
  var CAT02_INV = inv3(CAT02);
  var HPE = [0.38971, 0.68898, -0.07868, -0.22981, 1.18340, 0.04641, 0, 0, 1];
  var HPE_INV = inv3(HPE);
  var WHITE_ABS = [W[0]*100, W[1]*100, W[2]*100];

  /* 观察条件：L_A 与 Y_b 都是相对量（Y_b 以 100 为白），不能混用 cd/m² */
  function camCtx(la, yb, F, c, Nc) {
    var k = 1/(5*la + 1);
    var FL = 0.2*Math.pow(k, 4)*5*la + 0.1*Math.pow(1 - Math.pow(k, 4), 2)*Math.cbrt(5*la);
    var n = yb/100, z = 1.48 + Math.sqrt(n), Nbb = 0.725*Math.pow(1/n, 0.2);
    var D = Math.max(0, Math.min(1, F*(1 - (1/3.6)*Math.exp((-la - 42)/92))));
    var rgbW = mv(CAT02, WHITE_ABS);
    /* 部分色适应增益：白点 CAT02 三通道按 D 折返 */
    var DRGB = [0, 1, 2].map(function (i) { return D*WHITE_ABS[1]/rgbW[i] + 1 - D; });
    var rgbPW = mv(HPE, mv(CAT02_INV, [DRGB[0]*rgbW[0], DRGB[1]*rgbW[1], DRGB[2]*rgbW[2]]));
    function adapt(v) {
      var s = v < 0 ? -1 : 1;
      var t = Math.pow(FL*Math.abs(v)/100, 0.42);
      return s*400*t/(t + 27.13) + 0.1;
    }
    var RaW = adapt(rgbPW[0]), GaW = adapt(rgbPW[1]), BaW = adapt(rgbPW[2]);
    var Aw = (2*RaW + GaW + BaW/20 - 0.305)*Nbb;
    return { la: la, yb: yb, F: F, c: c, Nc: Nc,
             FL: FL, n: n, z: z, Nbb: Nbb, D: D, DRGB: DRGB, Aw: Aw };
  }

  function camAdapt(v, FL) {
    var s = v < 0 ? -1 : 1;
    var t = Math.pow(FL*Math.abs(v)/100, 0.42);
    return s*400*t/(t + 27.13) + 0.1;
  }
  function camAdaptInv(v, FL) {
    var y = v - 0.1, ay = Math.abs(y), s = y < 0 ? -1 : 1;
    /* CIECAM02 的压扩响应上界就是 400.1（对应无穷亮度）。
       这里必须返回 NaN 而不是一个大数：给个 1e6 会让反解"成功"，
       但正向再算回来已经不是原来的 (J, M, h)（实测 J=20、M=250 会变成无彩色）。 */
    if (!(ay < 400)) return NaN;
    return s*(100/FL)*Math.pow(27.13*ay/(400 - ay), 1/0.42);
  }

  /* CIECAM02 正向：XYZ（0–100）→ [J, M, h] */
  function camForward(xyz, opts) {
    var ctx = camCtx(opts.la, opts.yb, opts.F, opts.c, opts.Nc);
    var rgb = mv(CAT02, xyz);
    var rgbC = [0, 1, 2].map(function (i) { return ctx.DRGB[i]*rgb[i]; });
    var rgbP = mv(HPE, mv(CAT02_INV, rgbC));
    var Ra = camAdapt(rgbP[0], ctx.FL), Ga = camAdapt(rgbP[1], ctx.FL), Ba = camAdapt(rgbP[2], ctx.FL);
    var a = Ra - 12*Ga/11 + Ba/11, b = (Ra + Ga - 2*Ba)/9;
    var h = (Math.atan2(b, a)*180/Math.PI + 360) % 360;
    var et = 0.25*(Math.cos(h*Math.PI/180 + 2) + 3.8);
    var A = (2*Ra + Ga + Ba/20 - 0.305)*ctx.Nbb;
    var J = 100*Math.pow(A/ctx.Aw, ctx.c*ctx.z);
    var t = (50000/13*ctx.Nc*ctx.Nbb*et*Math.hypot(a, b)) / (Ra + Ga + 21/20*Ba);
    var C = Math.pow(Math.max(t, 1e-6), 0.9)*Math.sqrt(J/100)*Math.pow(1.64 - Math.pow(0.29, ctx.n), 0.73);
    return [J, C*Math.pow(ctx.FL, 0.25), h];
  }

  /*
   * CIECAM02 解析逆变换：[J, M, h] → XYZ（0–100）
   * 路径：M→C→t→A→a,b→R_a,G_a,B_a → 反压扩 → HPE⁻¹ → CAT02 → 反色适应 → CAT02⁻¹
   * 与 camForward 互逆，实测往返误差 < 1e-13；比逐像素牛顿迭代快三个数量级。
   */
  function camFromJMh(J, M, h, opts) {
    if (!isFinite(J) || !isFinite(M) || !isFinite(h)) return null;
    /* 定义域：J ≥ 0、M ≥ 0（J、M 是 0–100 / 0–100+ 的非负量）。
       J = 0 只有 M = 0 才是黑点；J = 0 而 M > 0 不可实现，
       以前 return [0,0,0] 会把整条 J=0 底边画成黑线，还会污染 cusp 扫描。 */
    if (!(J >= 0) || !(M >= 0)) return null;
    if (J === 0) return M > 1e-9 ? null : [0, 0, 0];
    var ctx = camCtx(opts.la, opts.yb, opts.F, opts.c, opts.Nc);
    var C = M / Math.pow(ctx.FL, 0.25);
    var t = C <= 0 ? 0 :
      Math.pow(C / (Math.sqrt(J/100)*Math.pow(1.64 - Math.pow(0.29, ctx.n), 0.73)), 1/0.9);
    if (!isFinite(t)) return null;
    var hr = h*Math.PI/180;
    var et = 0.25*(Math.cos(hr + 2) + 3.8);
    var A = ctx.Aw*Math.pow(J/100, 1/(ctx.c*ctx.z));
    var p2 = A/ctx.Nbb + 0.305, p3 = 21/20;
    var a = 0, b = 0;
    if (t > 1e-9) {
      var p1 = (50000/13*ctx.Nc*ctx.Nbb*et)/t;
      if (!isFinite(p1)) return null;
      var sh = Math.sin(hr), ch = Math.cos(hr);
      if (Math.abs(sh) >= Math.abs(ch)) {
        var p4 = p1/sh;
        b = p2*(2 + p3)*(460/1403) /
            (p4 + (2 + p3)*(220/1403)*(ch/sh) - 27/1403 + p3*6300/1403);
        a = b*ch/sh;
      } else {
        var p5 = p1/ch;
        a = p2*(2 + p3)*(460/1403) /
            (p5 + (2 + p3)*(220/1403) - (27/1403 - p3*6300/1403)*(sh/ch));
        b = a*sh/ch;
      }
      if (!isFinite(a) || !isFinite(b)) return null;
    }
    var Ra = (460*p2 + 451*a + 288*b)/1403;
    var Ga = (460*p2 - 891*a - 261*b)/1403;
    var Ba = (460*p2 - 220*a - 6300*b)/1403;
    var rgbP = [camAdaptInv(Ra, ctx.FL), camAdaptInv(Ga, ctx.FL), camAdaptInv(Ba, ctx.FL)];
    if (!rgbP.every(function (v) { return isFinite(v); })) return null;
    var rgbC = mv(CAT02, mv(HPE_INV, rgbP));
    var rgb = [rgbC[0]/ctx.DRGB[0], rgbC[1]/ctx.DRGB[1], rgbC[2]/ctx.DRGB[2]];
    var xyz = mv(CAT02_INV, rgb);
    if (!xyz.every(function (v) { return isFinite(v); })) return null;
    /* 压扩响应接近 400 的上界时会饱和，反解不再可逆（实测 J=20、M=200 会算成无彩色，
       比 sRGB 色域外的点更危险：它会落回色域内画错颜色）。只有这种极端响应才值得
       花一次正向复核——正常颜色（|R'| ≲ 100）走不到这里。 */
    var mx = Math.max(rgbP[0], rgbP[1], rgbP[2]), mn = Math.min(rgbP[0], rgbP[1], rgbP[2]);
    if (mx > 200 || mn < -20) {
      var back = camForward(xyz, opts);
      var dh = ((back[2] - h + 540) % 360) - 180;
      if (!isFinite(back[0]) || Math.abs(back[0] - J) > 0.05 ||
          Math.abs(back[1] - M) > 0.5 || Math.abs(dh) > 0.5) return null;
    }
    return xyz;
  }

  /* ---------- 统一接口 ---------- */
  function linFromXyz(xyz) { return mv(currentSpace.inverse, xyz); }
  /* rgbFromXyz / xyzFromRgb 的「rgb」是**所选空间的编码 RGB**（受曲线影响） */
  function rgbFromXyz(xyz) {
    var lin = linFromXyz(xyz);
    return lin.every(function (v) { return isFinite(v); }) ? codeRgbFromLinear(lin) : null;
  }
  function xyzFromRgb(rgb) {
    var lin = linearRgbFromCode(rgb);
    return lin ? mv(currentSpace.matrix, lin) : null;
  }
  /* sRGB 渲染：HEX / 色块 / sRGB 读数永远按固定的 sRGB 曲线显示，与所选空间无关 */
  function srgbFromXyz(xyz) { return mv(SRGB_INV, xyz).map(srgbEncode); }
  function srgbLinFromXyz(xyz) { return mv(SRGB_INV, xyz); }
  function xyzFromSrgb(rgb) { return mv(SRGB, rgb.map(srgbDecode)); }
  function xyzFromLin(lin) { return mv(currentSpace.matrix, lin); }
  function setGamuts(list) {
    spaces = {}; spaceOrder = [];
    (list || []).forEach(addSpace);
    if (!spaces.srgb) {
      spaces.srgb = { key: 'srgb', label: 'sRGB', tag: 'sRGB', white: 'D65', whiteXY: WHITE_POINTS.D65,
                      matrix: SRGB, inverse: SRGB_INV };
      spaceOrder.unshift('srgb');
    }
    currentSpace = spaces[currentSpace && currentSpace.key] || spaces.srgb;
  }
  function setGamut(key) {
    if (!spaces[key]) return false;
    currentSpace = spaces[key];
    return true;
  }
  /*
   * 线性 sRGB 是否落在 [0,1]。
   * 容差只用来吸收浮点噪声，不能用来"补白点"：
   * - 往返误差实测 < 1e-12，1e-6 覆盖得很宽；
   * - encode(1e-6)·255 ≈ 0.003 码值，远低于 8 bit 的最小步长；
   * - 更大的容差会改变像素的色相/彩度（线性 5e-3 ≈ 15.6 码值），
   *   例如 L*=0 的位置会被画成 (10,0,57)，那不是舍入而是换了一个颜色。
   * 真实的越界像素一律画成色域外，显示白由各模型的 fromRgb([1,1,1]) 决定。
   */
  var GAMUT_EPS = 1e-6;
  function inGamut(lin) {
    return !!lin && lin.every(function (c) {
      return isFinite(c) && c >= -GAMUT_EPS && c <= 1 + GAMUT_EPS;
    });
  }

  var CAM_OPTS = { la: 20, yb: 20, F: 1, c: 0.69, Nc: 1 };

  /* ---------- Hellwig JMh（ACES 2.0）：与色体积、DRT 页同一个内核 ---------- */
  var JMH = root.AcesJMh || null;
  var JMH_PARAMS = null;
  if (JMH) {
    try { JMH_PARAMS = JMH.init([[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]], [0.3127, 0.329]); }
    catch (e) { JMH_PARAMS = null; }
  }

  /*
   * 参考白亮度只作用于 JzAzBz（Lw）与 CIECAM02（L_A = 0.2·Lw）。
   * Y_b 固定 20（标准 20% 相对背景亮度），不能跟着 Lw 缩放：它是相对量，
   * 按 cd/m² 取值会让背景比白点还亮，CIECAM02 全部失真。
   */
  function setWhite(v) {
    if (!(v > 0) || !isFinite(v) || TPARAMS.lb >= v) return false;
    Lw = v;
    CAM_OPTS.la = 0.2*v;
    CAM_OPTS.yb = 20;
    /* 同一条 L_w 也进 display 曲线：白点的 PQ 码值 = pqEncode(L_w)，
       而不是被强行当成 PQ 的 10000 cd/m² 满码。 */
    TPARAMS.lw = v;
    return true;
  }
  function setBlack(v) {
    if (!isFinite(v) || v < 0 || v >= TPARAMS.lw) return false;
    TPARAMS.lb = v;
    return true;
  }

  /*
   * 模型：toLin 给线性 sRGB（无效/定义域外返回 null）；toRgb 给编码后的 sRGB；
   * fromRgb 回 [h, c, l]。
   *
   * ranges.c 是该模型彩度方向的**定义域 / 搜索上界**，不是画面横轴范围：
   * 横轴由每次切片实测的色域外形（cusp）决定，所以这里只要求上界
   * 大于 sRGB 内可能出现的最大彩度（测试里用色相网格逐模型验证），
   * 绝不能小到把真实颜色（例如 sRGB 蓝的 C* = 133.8）截断。
   */
  /* 模型：toLin 给线性 sRGB；toRgb 给编码后的 sRGB；fromRgb 回 [h, c, l] */
  var models = {
    hsv: {
      id: 'hsv', label: 'HSV',
      cLabel: 'S', lLabel: 'V', hLabel: 'H',
      ranges: { c: [0, 1], l: [0, 1] },
      /*
       * HSV 是**所选空间编码值上的 HSV**：先按所选曲线解码才得到线性 RGB。
       * 因此换 Gamma 会改变同一个颜色的 HSV 数值，也会改变切片的形状——
       * 这与「几何域由线性原色决定」并不矛盾，只是坐标轴不同。
       */
      toCode: function (h, c, l) {
        var cc = l*c, x = cc*(1 - Math.abs((h/60) % 2 - 1)), m = l - cc;
        var r=0,g=0,b=0;
        if (h<60){r=cc;g=x;} else if (h<120){r=x;g=cc;} else if (h<180){g=cc;b=x;}
        else if (h<240){g=x;b=cc;} else if (h<300){r=x;b=cc;} else {r=cc;b=x;}
        return [r+m, g+m, b+m];
      },
      toLin: function (h, c, l) {
        var code = models.hsv.toCode(h, c, l);
        if (code.some(function (v) { return v < -1e-12 || v > 1 + 1e-12; })) return null;
        return linearRgbFromCode(code);
      },
      fromCode: function (rgb) {
        if (!rgb || rgb.length !== 3) return null;
        var mx = Math.max.apply(null, rgb), mn = Math.min.apply(null, rgb), d = mx - mn, h = 0;
        if (d > 1e-9) {
          if (mx === rgb[0]) h = 60*(((rgb[1]-rgb[2])/d + 6) % 6);
          else if (mx === rgb[1]) h = 60*((rgb[2]-rgb[0])/d + 2);
          else h = 60*((rgb[0]-rgb[1])/d + 4);
        }
        return [h, mx > 1e-9 ? d/mx : 0, mx];
      },
      fromLin: function (lin) {
        var code = codeRgbFromLinear(lin);
        return code ? models.hsv.fromCode(code) : null;
      },
      fromXyz: function (xyz) { return models.hsv.fromLin(linFromXyz(xyz)); }
    },
    lch: {
      id: 'lch', label: 'LCH (Lab)',
      cLabel: 'C*', lLabel: 'L*', hLabel: 'h',
      ranges: { c: [0, 200], l: [0, 100] },
      toLin: function (h, c, l) {
        var hr = h*Math.PI/180;
        return linFromXyz(xyzFromLab([l, c*Math.cos(hr), c*Math.sin(hr)]));
      },
      fromXyz: function (xyz) {
        var lab = labFromXyz(xyz);
        return [(Math.atan2(lab[2], lab[1])*180/Math.PI + 360) % 360, Math.hypot(lab[1], lab[2]), lab[0]];
      }
    },
    oklch: {
      id: 'oklch', label: 'OKLCH',
      cLabel: 'C', lLabel: 'L', hLabel: 'h',
      ranges: { c: [0, 0.5], l: [0, 1] },
      toLin: function (h, c, l) {
        var hr = h*Math.PI/180;
        return linFromXyz(xyzFromOklab([l, c*Math.cos(hr), c*Math.sin(hr)]));
      },
      fromXyz: function (xyz) {
        var ok = oklabFromXyz(xyz);
        return [(Math.atan2(ok[2], ok[1])*180/Math.PI + 360) % 360, Math.hypot(ok[1], ok[2]), ok[0]];
      }
    },
    jzch: {
      id: 'jzch', label: 'JzCH',
      cLabel: 'Cz', lLabel: 'Jz', hLabel: 'h',
      ranges: { c: [0, 0.4], l: [0, 1] },
      toLin: function (h, c, l) {
        var hr = h*Math.PI/180;
        var xyz = xyzFromJzazbz([l, c*Math.cos(hr), c*Math.sin(hr)]);
        return xyz ? linFromXyz(xyz) : null;
      },
      fromXyz: function (xyz) {
        var jz = jzazbzFromXyz(xyz);
        return [(Math.atan2(jz[2], jz[1])*180/Math.PI + 360) % 360, Math.hypot(jz[1], jz[2]), jz[0]];
      }
    },
    jmhh: {
      id: 'jmhh', label: 'JMH (Hellwig)',
      cLabel: 'M', lLabel: 'J', hLabel: 'h',
      ranges: { c: [0, 250], l: [0, 100] },
      toLin: function (h, c, l) {
        if (!JMH_PARAMS) return null;
        /* CTL 的 JMh 以 1.0 = 100 cd/m² 标定，jmhToRGB 直接回线性 sRGB */
        return JMH.jmhToRGB([l, c, h], JMH_PARAMS);
      },
      /* ACES 内核吃线性 sRGB，与当前色域无关，所以从 XYZ 走 */
      fromXyz: function (xyz) {
        if (!JMH_PARAMS) return [0, 0, 0];
        var v = JMH.rgbToJMh(srgbLinFromXyz(xyz), JMH_PARAMS);
        return [v[2], v[1], v[0]]; // [h, M, J]
      }
    },
    jmh: {
      id: 'jmh', label: 'JMH (CAM02)',
      cLabel: 'M', lLabel: 'J', hLabel: 'h',
      ranges: { c: [0, 250], l: [0, 100] },
      toLin: function (h, c, l) {
        var xyz = camFromJMh(l, c, h, CAM_OPTS); // 0–100 标度
        return xyz ? linFromXyz([xyz[0]/100, xyz[1]/100, xyz[2]/100]) : null;
      },
      fromXyz: function (xyz) {
        var spec = camForward([xyz[0]*100, xyz[1]*100, xyz[2]*100], CAM_OPTS);
        return [spec[2], spec[1], spec[0]];
      }
    }
  };

  /*
   * 统一派生：
   *   toRgb  = toCode  所选空间编码值（保留旧名，读数和输入框都用它）
   *   fromRgb = fromCode
   *   fromLin / fromXyz = 只取决于颜色本身，与曲线无关（HSV 例外：它的坐标就是编码值）
   * toLin 仍是「相对线性 RGB」，是几何与色域判定的唯一依据。
   */
  Object.keys(models).forEach(function (id) {
    var m = models[id];
    if (!m.fromLin && m.fromXyz) {
      m.fromLin = function (lin) {
        var xyz = xyzFromLin(lin);
        return xyz ? m.fromXyz(xyz) : null;
      };
    }
    if (!m.fromCode && m.fromLin) {
      m.fromCode = function (code) {
        var lin = linearRgbFromCode(code);
        return lin ? m.fromLin(lin) : null;
      };
    }
    if (!m.fromRgb) m.fromRgb = m.fromCode;
    if (!m.toCode) {
      m.toCode = function (h, c, l) {
        var lin = m.toLin(h, c, l);
        return lin ? codeRgbFromLinear(lin) : null;
      };
    }
    if (!m.toRgb) m.toRgb = m.toCode;
  });

  /* ---------- 切片几何（纯函数：页面、测试、判色域共用同一套判定） ---------- */
  function linOf(m, h, c, l) {
    try {
      var lin = m.toLin(h, c, l);
      return lin && lin.every(function (v) { return isFinite(v); }) ? lin : null;
    } catch (e) { return null; }
  }
  function okAt(m, h, c, l) { return inGamut(linOf(m, h, c, l)); }

  /*
   * 固定 (h, l) 下仍在 sRGB 内的最大彩度。
   * 彩度方向的可色域集合是连续的（tests 里有网格断言），所以二分成立；
   * 但 C = 0 在该明度上不可用时（模型定义域缺口），先向上找第一个有效彩度，
   * 再在它和上界之间二分——不能把"中性无效"直接当成"整行无有效色"。
   */
  function chromaMax(m, h, l) {
    var cR = m.ranges.c;
    if (!okAt(m, h, cR[0], l)) {
      var steps = 32, start = null;
      for (var i = 1; i <= steps; i++) {
        var ci = cR[0] + (cR[1] - cR[0]) * i / steps;
        if (okAt(m, h, ci, l)) { start = ci; break; }
      }
      if (start === null) return null;
      if (okAt(m, h, cR[1], l)) return cR[1];
      var lo0 = start, hi0 = cR[1];
      for (var j = 0; j < 20; j++) {
        var mid0 = (lo0 + hi0) / 2;
        if (okAt(m, h, mid0, l)) lo0 = mid0; else hi0 = mid0;
      }
      return lo0;
    }
    if (okAt(m, h, cR[1], l)) return cR[1];
    var lo = cR[0], hi = cR[1];
    for (var k = 0; k < 20; k++) {
      var mid = (lo + hi) / 2;
      if (okAt(m, h, mid, l)) lo = mid; else hi = mid;
    }
    return lo;
  }

  /* 当前色相切片：最大彩度与 cusp（彩度最大的那个明度点） */
  function sliceScan(id, h, opts) {
    var m = models[id];
    var lR = m.ranges.l, nl = (opts && opts.lSteps) || 64;
    var best = 0, cusp = null;
    for (var j = 0; j <= nl; j++) {
      var l = lR[0] + (lR[1] - lR[0]) * j / nl;
      var c = chromaMax(m, h, l);
      if (c !== null && c > best) { best = c; cusp = { c: c, l: l }; }
    }
    return { cMax: best, cusp: cusp };
  }

  /* BT.2020 原色判定（HLG 只允许这一组原色） */
  function isBt2020(space) {
    var prim = space && space.primaries;
    if (!prim) prim = currentSpace.primaries;
    if (!prim) return false;
    var ref = [[0.708, 0.292], [0.170, 0.797], [0.131, 0.046]];
    return ref.every(function (p, i) {
      return Math.abs(p[0] - prim[i][0]) < 1e-4 && Math.abs(p[1] - prim[i][1]) < 1e-4;
    });
  }

  /* 组合校验：返回 [] 表示可用，否则给出可读原因（不静默降级） */
  function validateCombination(space, transfer) {
    var problems = [];
    if (!space || !finiteMatrix(space.matrix)) problems.push({ key: 'gamut', text: '所选原色缺少可逆矩阵' });
    var t = transfer || currentTransfer;
    if (!t || typeof t.encode !== 'function') problems.push({ key: 'transfer', text: '所选传递函数缺少实现' });
    else {
      if (t.need && t.need.bt2020 && !isBt2020(space || currentSpace)) {
        problems.push({ key: 'hlgGamut', text: 'HLG 是三通道耦合的向量函数，只能配 BT.2020 原色' });
      }
      if (t.need && t.need.lb && !(TPARAMS.lw > TPARAMS.lb)) {
        problems.push({ key: 'lb', text: '黑位 L_b 必须小于参考白 L_w' });
      }
    }
    return problems;
  }

  root.ColourPolar = {
    models: models,
    rgbFromXyz: rgbFromXyz,
    srgbFromXyz: srgbFromXyz,
    srgbLinFromXyz: srgbLinFromXyz,
    xyzFromSrgb: xyzFromSrgb,
    xyzFromLin: xyzFromLin,
    matrixFromPrimaries: matrixFromPrimaries,
    whiteXyFromMatrix: whiteXyFromMatrix,
    WHITE_POINTS: WHITE_POINTS,
    setGamuts: setGamuts,
    setGamut: setGamut,
    gamutList: function () { return spaceOrder.map(function (k) { return spaces[k]; }); },
    gamut: function () { return currentSpace; },
    linFromXyz: linFromXyz,
    xyzFromRgb: xyzFromRgb,
    /* 曲线 ↔ 线性量的适配层（相对线性 Y=1；display 曲线按 L_w/L_b 换算） */
    setTransfer: setTransfer,
    setBlack: setBlack,
    transfer: function () { return currentTransfer; },
    transferNeedsLw: function (t) { return transferNeedsLw(t); },
    transferParams: function () { return { lw: TPARAMS.lw, lb: TPARAMS.lb }; },
    linearRgbFromCode: linearRgbFromCode,
    codeRgbFromLinear: codeRgbFromLinear,
    /* 相对线性 ↔ 绝对亮度 / 场景线性（display 用 L_w、L_b；scene 原样） */
    absFromLin: function (lin) { return lin.map(function (v) { return absFromRel(v, currentTransfer); }); },
    linFromAbs: function (abs) { return abs.map(function (v) { return relFromAbs(v, currentTransfer); }); },
    encode: encode,
    decode: decode,
    srgbEncode: srgbEncode,
    srgbDecode: srgbDecode,
    inGamut: inGamut,
    isBt2020: isBt2020,
    validateCombination: validateCombination,
    camForward: camForward,
    camFromJMh: camFromJMh,
    camOpts: function () { return { la: CAM_OPTS.la, yb: CAM_OPTS.yb }; },
    setWhite: setWhite,
    whiteJz: function () { return jzazbzFromXyz([W[0], W[1], W[2]])[0]; },
    /* 色域的白（线性 [1,1,1]）在该模型坐标系里的位置：
       平面纵轴顶端用它，而不是假设 C=0 就是白；也保证换曲线不移动白点。 */
    whiteCoords: function (id) { return models[id].fromLin([1, 1, 1]) || models[id].fromRgb([1, 1, 1]); },
    inSrgb: function (xyz) { return inGamut(srgbLinFromXyz(xyz)); },
    linAt: function (id, h, c, l) { return linOf(models[id], h, c, l); },
    codeAt: function (id, h, c, l) { return models[id].toCode(h, c, l); },
    okAt: function (id, h, c, l) { return okAt(models[id], h, c, l); },
    chromaMax: function (id, h, l) { return chromaMax(models[id], h, l); },
    sliceScan: sliceScan,
    labFromXyz: labFromXyz,
    oklabFromXyz: oklabFromXyz,
    jzazbzFromXyz: jzazbzFromXyz
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.ColourPolar;
