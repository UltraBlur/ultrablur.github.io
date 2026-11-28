/*
 * 色体积几何（纯函数）
 * 把归一化线性 RGB 立方体 [0,1]³ 的六个面映射到显示坐标，切三角网格。
 * 不碰 DOM、不碰 WebGL：浏览器里挂在 window.ColourVolumeGeom，
 * Node 里可以 require（tests/volume-geometry.test.mjs 用它做封闭性自检）。
 *
 * 约定：显示坐标 = [水平, 竖直, 深度]，竖直轴统一是明度类轴。
 * 网格必须闭合——任何一处映射不出坐标，都要补一个点，不能丢面。
 */
(function (root) {
  'use strict';

  /* ---------- 3×3 矩阵（行主序） ---------- */

  function flatten3(m) {
    if (!m) return null;
    if (m.length === 9 && typeof m[0] === 'number') return m.slice();
    var out = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) out.push(m[i][j]);
    return out;
  }

  function mulVec3(A, v) {
    return [
      A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
      A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
      A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
    ];
  }

  function invert3(m) {
    var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var det = a * A + b * B + c * C;
    if (!det) return null;
    var id = 1 / det;
    return [
      A * id, -(b * i - c * h) * id, (b * f - c * e) * id,
      B * id, (a * i - c * g) * id, -(a * f - c * d) * id,
      C * id, -(a * h - b * g) * id, (a * e - b * d) * id
    ];
  }

  /* ---------- 白点与 Lab ---------- */

  function whiteXYZ(xy) {
    var x = xy[0], y = xy[1];
    return [x / y, 1, (1 - x - y) / y];
  }

  function labFromXYZ(xyz, W) {
    var t = [xyz[0] / W[0], xyz[1] / W[1], xyz[2] / W[2]];
    var e = 216 / 24389; // (6/29)^3
    var k = 24389 / 27;
    var f = t.map(function (v) { return v > e ? Math.cbrt(v) : (k * v + 16) / 116; });
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]; // [L*, a*, b*]
  }

  /* 环绕三档：CAM02 按 CIE 159（昏暗 N_c = 0.95），CAM16 按 colour-science 的
     VIEWING_CONDITIONS_CAM16（昏暗 N_c = 0.9），ZCAM 另带 F_s。 */
  var SURROUNDS = {
    average: { F: 1.0, c: 0.69, Nc: 1.0, Nc16: 1.0, Fs: 0.69 },
    dim: { F: 0.9, c: 0.59, Nc: 0.95, Nc16: 0.9, Fs: 0.59 },
    dark: { F: 0.8, c: 0.525, Nc: 0.8, Nc16: 0.8, Fs: 0.525 }
  };

  function camOpts(cond, Lw) {
    var c = cond || {};
    var s = SURROUNDS[c.surround] || SURROUNDS.average;
    var la = c.laFactor === undefined ? 0.2 : c.laFactor;
    var bg = c.bg === undefined ? 0.2 : c.bg;
    return { La: Lw * la, Yb: Lw * bg, F: s.F, c: s.c, Nc: s.Nc, Nc16: s.Nc16, Fs: s.Fs };
  }

  /* ---------- 坐标变换 ---------- */

  /* o = { models, lum, cond, ext }；返回显示坐标，无效点返回 null */
  function toDisplay(coord, xyz, W, o) {
    var models = (o && o.models) || {};
    var lum = (o && o.lum) || 100;
    var out;
    if (coord === 'xyz') return [xyz[0], xyz[1], xyz[2]];
    if (coord === 'xyy') {
      var s = xyz[0] + xyz[1] + xyz[2];
      if (!(s > 1e-9)) return null; // Y = 0 处色度未定义
      /* 第三位必须是色度 y = Y/(X+Y+Z)。旧代码写成了 z = Z/(X+Y+Z)，
         而 z = 1 − x − y，等于把整张 xy 图镜像了一遍——俯视时自然对不上马蹄形。 */
      return [xyz[0] / s, xyz[1], xyz[1] / s];
    }
    if (coord === 'lab') {
      var lab = labFromXYZ(xyz, W);
      return [lab[1], lab[0], lab[2]]; // [a*, L*, b*]
    }
    if (coord === 'luv') out = models.luv && models.luv(xyz, W);
    else if (coord === 'oklab') out = models.oklab && models.oklab(xyz);
    else if (coord === 'ipt') out = models.ipt && models.ipt(xyz);
    else if (coord === 'ictcp') out = models.ictcp && models.ictcp(xyz, lum);
    else if (coord === 'jzazbz') out = models.jzazbz && models.jzazbz(xyz, lum);
    else if (coord === 'cam02' || coord === 'cam16' || coord === 'zcam') {
      var model = coord === 'cam02' ? models.cam02ucs
                : coord === 'cam16' ? models.cam16ucs
                : models.zcam;
      out = model && model(
        [xyz[0] * lum, xyz[1] * lum, xyz[2] * lum],
        [W[0] * lum, W[1] * lum, W[2] * lum],
        camOpts(o && o.cond, lum)
      );
    } else {
      // 本地私有坐标（assets/js/local/，不入库）在此注册；没有就退回 XYZ
      var ext = o && o.ext;
      out = ext && ext[coord] ? ext[coord](xyz, W) : [xyz[0], xyz[1], xyz[2]];
    }
    if (!out) return null;
    for (var i = 0; i < 3; i++) if (!isFinite(out[i])) return null;
    return out;
  }

  /* 奇异点闭包：黑点在 xyY 里没有色度（X+Y+Z = 0），
     取沿中性轴趋近的极限，也就是白点色度落在 Y = 0 上。
     补这一个点，六个面才在体素底角闭合成一个整体，不会漏出一个三角缺口。 */
  function singular(coord, W) {
    if (coord === 'xyy') {
      var s = W[0] + W[1] + W[2];
      return [W[0] / s, 0, W[1] / s];
    }
    return [0, 0, 0];
  }

  function makeSpace(entry, srgbMatrix, jmhApi) {
    var M = flatten3(entry.matrix);    // RGB → XYZ，行 = X,Y,Z
    var W = whiteXYZ(entry.white);     // Lab 参考白：空间自身白点，不做适应
    var inv = invert3(flatten3(srgbMatrix));
    /* Hellwig JMh 的参数由「原色 + 白点」定，和 ACES 2.0 页面同一个内核
       （assets/js/lib/aces-jmh.js）。没有原色（或没加载内核）时该坐标不可用。 */
    var jmhParams = null;
    if (jmhApi && entry.primaries && entry.white) {
      try { jmhParams = jmhApi.init(entry.primaries, entry.white); } catch (e) { jmhParams = null; }
    }
    return {
      slug: entry.slug,
      title: entry.title,
      toXYZ: function (rgb) { return mulVec3(M, rgb); },
      white: W,
      jmhParams: jmhParams,
      color: function (rgb) {
        if (!inv) return [0.8, 0.8, 0.8];
        return previewColor(mulVec3(inv, mulVec3(M, rgb)));
      }
    };
  }

  /* 线性 RGB → 预览用 sRGB */
  function encodeSrgb(v) {
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  function previewColor(linearSrgb) {
    return [
      encodeSrgb(linearSrgb[0]),
      encodeSrgb(linearSrgb[1]),
      encodeSrgb(linearSrgb[2])
    ];
  }

  function pointFor(space, coord, rgb, o) {
    /* Hellwig JMh 走 ACES 2.0 的内核：入参是这个空间自己的 RGB（1.0 = 100 cd/m²），
       出参是柱坐标 (J, M, h)；显示坐标取笛卡尔嵌入 [a, J, b]，
       a = M·cos h、b = M·sin h——这样体积才是闭合的，h 的 0/360 接缝也不会裂。 */
    if (coord === 'jmh') {
      var api = o && o.jmh;
      if (!api || !space.jmhParams) return null;
      var jmh = api.rgbToJMh(rgb, space.jmhParams);
      if (!jmh || !isFinite(jmh[0]) || !isFinite(jmh[1]) || !isFinite(jmh[2])) return null;
      var hr = jmh[2] * Math.PI / 180;
      return [jmh[1] * Math.cos(hr), jmh[0], jmh[1] * Math.sin(hr)];
    }
    var xyz = space.toXYZ(rgb);
    var p = toDisplay(coord, xyz, space.white, o);
    if (p) return p;
    var sum = xyz[0] + xyz[1] + xyz[2];
    // 只有黑点是有定义的奇异点；其余解不出来的交给网格修复
    return sum > 1e-12 ? null : singular(coord, space.white);
  }

  /* ---------- 体积网格 ---------- */

  var FACES = [
    { fix: 0, val: 0 }, { fix: 0, val: 1 },
    { fix: 1, val: 0 }, { fix: 1, val: 1 },
    { fix: 2, val: 0 }, { fix: 2, val: 1 }
  ];

  function normalAt(space, coord, rgb, u, v, eps, fix, o) {
    function bump(c) {
      var d = rgb.slice();
      d[c] = rgb[c] + eps > 1 ? rgb[c] - eps : rgb[c] + eps;
      return d;
    }
    var p0 = pointFor(space, coord, rgb, o);
    var pa = pointFor(space, coord, bump(u), o);
    var pb = pointFor(space, coord, bump(v), o);
    if (!p0 || !pa || !pb) return null;
    var t1 = [pa[0] - p0[0], pa[1] - p0[1], pa[2] - p0[2]];
    var t2 = [pb[0] - p0[0], pb[1] - p0[1], pb[2] - p0[2]];
    var n = [
      t1[1] * t2[2] - t1[2] * t2[1],
      t1[2] * t2[0] - t1[0] * t2[2],
      t1[0] * t2[1] - t1[1] * t2[0]
    ];
    var len = Math.hypot(n[0], n[1], n[2]);
    if (!(len > 1e-12)) return null;
    n = [n[0] / len, n[1] / len, n[2] / len];
    // 用固定通道的正方向定朝向：法线各面之间连续，不会逐个顶点翻面
    if (fix !== undefined) {
      var d1 = rgb.slice(); d1[fix] = Math.min(1, rgb[fix] + eps);
      var d2 = rgb.slice(); d2[fix] = Math.max(0, rgb[fix] - eps);
      var p1 = pointFor(space, coord, d1, o), p2 = pointFor(space, coord, d2, o);
      var dir = p1 && p2 ? [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
              : (p1 ? [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
                    : (p2 ? [p0[0] - p2[0], p0[1] - p2[1], p0[2] - p2[2]] : null));
      if (dir && dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2] < 0) {
        n = [-n[0], -n[1], -n[2]];
      }
    }
    return n;
  }

  /* 补洞：某个样本映射不出坐标时，沿「朝灰轴收缩」的固定阶梯找一个有定义的邻近样本。
     关键是这个阶梯只由 rgb 决定，跟落在哪个面上无关——相邻两个面在公共棱上补出来的点
     才会重合，不会补出新的裂缝。宁可挪一个点，也不要把整片四边形丢掉。 */
  function fallbackPoint(space, coord, rgb, o, steps) {
    for (var s = 1; s <= steps; s++) {
      var t = s / steps;
      var d = [
        rgb[0] + (0.5 - rgb[0]) * t,
        rgb[1] + (0.5 - rgb[1]) * t,
        rgb[2] + (0.5 - rgb[2]) * t
      ];
      var p = pointFor(space, coord, d, o);
      if (p) return { p: p, rgb: d };
    }
    return null;
  }

  /* 六个面，每面 N×N 片。返回 pos / nor / col / idx / bbox，
     以及 missing（仍无定义的样本数）与 repaired（被兜底补上的样本数）。 */
  function buildSurface(space, coord, N, o) {
    var pos = [], nor = [], col = [], idx = [];
    var missing = 0, repaired = 0;

    FACES.forEach(function (face) {
      var u = (face.fix + 1) % 3, v = (face.fix + 2) % 3;
      var grid = [];

      for (var i = 0; i <= N; i++) {
        grid[i] = [];
        for (var j = 0; j <= N; j++) {
          var rgb = [0, 0, 0];
          rgb[face.fix] = face.val;
          rgb[u] = i / N;
          rgb[v] = j / N;
          var p = pointFor(space, coord, rgb, o);
          var useRgb = rgb;
          if (!p) {
            var fb = fallbackPoint(space, coord, rgb, o, N);
            if (!fb) { grid[i][j] = -1; continue; }
            p = fb.p;
            useRgb = fb.rgb;
            repaired++;
          }
          grid[i][j] = pos.length / 3;
          pos.push(p[0], p[1], p[2]);
          var c = space.color(useRgb);
          col.push(c[0], c[1], c[2]);
          var n = normalAt(space, coord, useRgb, u, v, 1 / (N * 400), face.fix, o) || [0, 0, 1];
          nor.push(n[0], n[1], n[2]);
        }
      }

      var left = 0;
      for (var ai = 0; ai <= N; ai++) for (var bi = 0; bi <= N; bi++) if (grid[ai][bi] < 0) left++;
      missing += left;

      for (var a3 = 0; a3 < N; a3++) {
        for (var b3 = 0; b3 < N; b3++) {
          var i0 = grid[a3][b3], i1 = grid[a3 + 1][b3], i2 = grid[a3 + 1][b3 + 1], i3 = grid[a3][b3 + 1];
          if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0) continue;
          // val = 0 的面法线朝外方向相反，索引反写以保持统一绕序
          if (face.val === 0) idx.push(i0, i3, i2, i0, i2, i1);
          else idx.push(i0, i1, i2, i0, i2, i3);
        }
      }
    });

    var bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (var bi2 = 0; bi2 < pos.length; bi2 += 3) {
      for (var bk = 0; bk < 3; bk++) {
        if (pos[bi2 + bk] < bb[0][bk]) bb[0][bk] = pos[bi2 + bk];
        if (pos[bi2 + bk] > bb[1][bk]) bb[1][bk] = pos[bi2 + bk];
      }
    }

    return {
      pos: new Float32Array(pos),
      nor: new Float32Array(nor),
      col: new Float32Array(col),
      idx: new Uint16Array(idx),
      bbox: bb,
      missing: missing,
      repaired: repaired
    };
  }

  /* ---------- 参考色体：Pointer's Gamut（真实表面色）---------- */

  /* Pointer (1980) 的 576 个采样是 LCh（照明体 C，2° 观察者）。
     LCh → XYZ 用 C 的白点；Lab 反算按 CIE 15 的分段函数。 */
  function lchToXyz(L, C, hDeg, W) {
    var hr = hDeg * Math.PI / 180;
    var a = C * Math.cos(hr), b = C * Math.sin(hr);
    var fy = (L + 16) / 116;
    var fx = fy + a / 500;
    var fz = fy - b / 200;
    var e = 216 / 24389, kappa = 24389 / 27;
    function finv(t) {
      var t3 = t * t * t;
      return t3 > e ? t3 : (116 * t - 16) / kappa;
    }
    return [finv(fx) * W[0], finv(fy) * W[1], finv(fz) * W[2]];
  }

  /* 每 4 条细环 = 1 条实测环（16 档 L* → 61 环，步长 1.25）。
     加密到 1.25 L* 之后，中点弦偏差从最大的 4.0（色相 80°、L* 80 的黄区脊线）
     降到 0.25 量级；色相仍保留实测的 36 段（10° 的弦高只有半径的 0.4%）。 */
  var RING_STEP = 4;

  /* 单调夹紧的 Catmull-Rom 重采样：把一列 C*(L*) 加密 step 倍。
     三次样条一定会在曲率大的地方外凸（黄区尤其明显），所以逐段把结果夹紧到
     两端实测值的区间内——宁可少长一点，也不凭空造出比实测更大的色域。 */
  function resampleClamped(vals, step) {
    var n = vals.length;
    if (n < 2 || step < 2) return vals.slice();
    function at(i) { return vals[i < 0 ? 0 : (i > n - 1 ? n - 1 : i)]; }
    var out = [];
    for (var k = 0; k < n - 1; k++) {
      var p0 = at(k - 1), p1 = vals[k], p2 = vals[k + 1], p3 = at(k + 2);
      var lo = Math.min(p1, p2), hi = Math.max(p1, p2);
      for (var s = 0; s < step; s++) {
        var t = s / step, t2 = t * t, t3 = t2 * t;
        var c = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                     + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        out.push(c < lo ? lo : (c > hi ? hi : c));
      }
    }
    out.push(vals[n - 1]);
    return out;
  }

  /* 一个「非 RGB 立方体」的体积：rings = 由低到高的一圈圈 XYZ。
     颜色与 JMh 都用 XYZ 直接算；JMh 的原色参数只是脚手架（见 aces-jmh 注释：
     mConeXYZ 只依赖 XYZ 与白点，换哪组原色结果都一样）。 */
  function makePointerSpace(data, srgbMatrix, jmhApi) {
    var C_XY = [0.31006, 0.31616];          // CIE 照明体 C
    var W = whiteXYZ(C_XY);
    var inv = invert3(flatten3(srgbMatrix));
    var lch = (data && data.lch) || [];

    var byL = {};
    lch.forEach(function (row) {
      var key = String(row[0]);
      (byL[key] = byL[key] || []).push(row);
    });
    var levels = Object.keys(byL).map(Number).sort(function (x, y) { return x - y; });
    /* 每个 L* 环按色相排好——36 个色相位置固定，于是可以按色相取列 */
    var rows = levels.map(function (L) {
      return byL[String(L)].slice().sort(function (x, y) { return x[2] - y[2]; });
    });
    var nHue = rows[0] ? rows[0].length : 0;
    var hues = rows[0] ? rows[0].map(function (r) { return r[2]; }) : [];

    /* 细环：每段实测区间插 4 条子环，末环补上 */
    var fineLevels = [];
    for (var k = 0; k < levels.length - 1; k++) {
      for (var s = 0; s < RING_STEP; s++) {
        fineLevels.push(levels[k] + (levels[k + 1] - levels[k]) * s / RING_STEP);
      }
    }
    if (levels.length) fineLevels.push(levels[levels.length - 1]);

    /* 逐色相把 C*(L*) 加密；L* 是均匀的，色相不动 */
    var columns = [];
    for (var j = 0; j < nHue; j++) {
      columns.push(resampleClamped(rows.map(function (row) { return row[j][1]; }), RING_STEP));
    }
    var rings = fineLevels.map(function (L, i) {
      return hues.map(function (h, j) { return lchToXyz(L, columns[j][i], h, W); });
    });

    var jmhParams = null;
    if (jmhApi) {
      try {
        jmhParams = jmhApi.init([[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]], C_XY);
      } catch (e) {
        jmhParams = null;
      }
    }

    return {
      slug: 'pointer-gamut',
      title: "Pointer's Gamut",
      white: W,
      rings: rings,               // 显示用：按 RING_STEP 重采样后的环
      levels: fineLevels,         // 与 rings 一一对应
      dataLevels: levels,         // 实测的 16 档
      ringStep: RING_STEP,        // 每几条细环对应一条实测环
      custom: true,
      jmhParams: jmhParams,
      color: function () { return [0.8, 0.8, 0.8]; },
      colorXyz: function (xyz) {
        if (!inv) return [0.8, 0.8, 0.8];
        return previewColor(mulVec3(inv, xyz));
      }
    };
  }

  /* 实测格点：只有重采样过的自定义色体有。每隔 ringStep 取一条实测环，
     返回扁平的 XYZ 数组（Pointer 是 16 × 36 = 576 个点）。
     注意这是论文发表的边界表（每个 L* 与色相下的最大彩度），
     不是 Pointer 当年那四千个原始测量样本——那批数据没有公开。 */
  function dataPoints(space) {
    var step = (space && space.ringStep) || 1;
    var out = [];
    var rings = (space && space.rings) || [];
    for (var i = 0; i < rings.length; i += step) {
      var r = rings[i];
      for (var j = 0; j < r.length; j++) out.push(r[j][0], r[j][1], r[j][2]);
    }
    return new Float32Array(out);
  }

  /* 没有 RGB 参数化时的坐标换算：直接吃 XYZ */
  function pointForXyz(space, coord, xyz, o) {
    if (coord === 'jmh') {
      var api = o && o.jmh;
      if (!api || !api.xyzToJMh || !space.jmhParams) return null;
      var jmh = api.xyzToJMh(xyz, space.jmhParams);
      if (!jmh || !isFinite(jmh[0]) || !isFinite(jmh[1]) || !isFinite(jmh[2])) return null;
      var hr = jmh[2] * Math.PI / 180;
      return [jmh[1] * Math.cos(hr), jmh[0], jmh[1] * Math.sin(hr)];
    }
    return toDisplay(coord, xyz, space.white, o);
  }

  /* 环状网格：环之间连四边形，两端各封一个扇面。法线用面积加权，最后按
     有符号体积判断朝向，整体翻一次，保证外法线。 */
  function buildCustom(space, coord, o) {
    var rings = space.rings || [];
    var pos = [], col = [], idx = [];
    var repaired = 0, missing = 0;
    var grid = [];

    for (var i = 0; i < rings.length; i++) {
      grid[i] = [];
      for (var j = 0; j < rings[i].length; j++) {
        var p = pointForXyz(space, coord, rings[i][j], o);
        if (!p) { grid[i][j] = -1; continue; }
        grid[i][j] = pos.length / 3;
        pos.push(p[0], p[1], p[2]);
        var c = space.colorXyz(rings[i][j]);
        col.push(c[0], c[1], c[2]);
      }
      for (var j2 = 0; j2 < grid[i].length; j2++) if (grid[i][j2] < 0) missing++;
    }

    function quad(a, b, c2, d) {
      if (a < 0 || b < 0 || c2 < 0 || d < 0) return;
      idx.push(a, b, c2, a, c2, d);
    }

    for (var r = 0; r < rings.length - 1; r++) {
      var n = rings[r].length;
      for (var h = 0; h < n; h++) {
        var h2 = (h + 1) % n;
        quad(grid[r][h], grid[r][h2], grid[r + 1][h2], grid[r + 1][h]);
      }
    }

    /* 两端封盖：中心取该环显示坐标的平均值，扇面朝外 */
    [0, rings.length - 1].forEach(function (ri, k) {
      var ids = grid[ri].filter(function (x) { return x >= 0; });
      if (ids.length < 3) return;
      var cx = 0, cy = 0, cz = 0, cr = 0, cg = 0, cb = 0;
      ids.forEach(function (id) {
        cx += pos[id * 3]; cy += pos[id * 3 + 1]; cz += pos[id * 3 + 2];
        cr += col[id * 3]; cg += col[id * 3 + 1]; cb += col[id * 3 + 2];
      });
      var ci = pos.length / 3;
      pos.push(cx / ids.length, cy / ids.length, cz / ids.length);
      col.push(cr / ids.length, cg / ids.length, cb / ids.length);
      var m = grid[ri].length;
      for (var hh = 0; hh < m; hh++) {
        var h3 = (hh + 1) % m;
        var a = grid[ri][hh], b = grid[ri][h3];
        if (a < 0 || b < 0) continue;
        if (k === 0) idx.push(ci, b, a);   // 低端：法线朝 -L
        else idx.push(ci, a, b);           // 高端：法线朝 +L
      }
    });

    /* 有符号体积为负 → 整体翻面，保证外法线 */
    var vol = 0;
    for (var t = 0; t < idx.length; t += 3) {
      var a3 = idx[t] * 3, b3 = idx[t + 1] * 3, c3 = idx[t + 2] * 3;
      vol += pos[a3] * (pos[b3 + 1] * pos[c3 + 2] - pos[b3 + 2] * pos[c3 + 1])
           - pos[a3 + 1] * (pos[b3] * pos[c3 + 2] - pos[b3 + 2] * pos[c3])
           + pos[a3 + 2] * (pos[b3] * pos[c3 + 1] - pos[b3 + 1] * pos[c3]);
    }
    if (vol < 0) {
      for (var t2 = 0; t2 < idx.length; t2 += 3) {
        var tmp = idx[t2 + 1]; idx[t2 + 1] = idx[t2 + 2]; idx[t2 + 2] = tmp;
      }
    }

    /* 面积加权顶点法线 */
    var nor = new Float32Array(pos.length);
    for (var t3 = 0; t3 < idx.length; t3 += 3) {
      var i0 = idx[t3] * 3, i1 = idx[t3 + 1] * 3, i2 = idx[t3 + 2] * 3;
      var ux = pos[i1] - pos[i0], uy = pos[i1 + 1] - pos[i0 + 1], uz = pos[i1 + 2] - pos[i0 + 2];
      var vx = pos[i2] - pos[i0], vy = pos[i2 + 1] - pos[i0 + 1], vz = pos[i2 + 2] - pos[i0 + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (var k2 = 0; k2 < 3; k2++) {
        var ii = idx[t3 + k2] * 3;
        nor[ii] += nx; nor[ii + 1] += ny; nor[ii + 2] += nz;
      }
    }
    for (var n2 = 0; n2 < nor.length; n2 += 3) {
      var ln = Math.hypot(nor[n2], nor[n2 + 1], nor[n2 + 2]) || 1;
      nor[n2] /= ln; nor[n2 + 1] /= ln; nor[n2 + 2] /= ln;
    }

    var bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (var bi = 0; bi < pos.length; bi += 3) {
      for (var bk = 0; bk < 3; bk++) {
        if (pos[bi + bk] < bb[0][bk]) bb[0][bk] = pos[bi + bk];
        if (pos[bi + bk] > bb[1][bk]) bb[1][bk] = pos[bi + bk];
      }
    }

    return {
      pos: new Float32Array(pos),
      nor: nor,
      col: new Float32Array(col),
      idx: new Uint16Array(idx),
      bbox: bb,
      missing: missing,
      repaired: repaired
    };
  }

  /* 环状网格的网格线：每 4 圈画一圈，每 6 个色相画一条经线 */
  function buildCustomGrid(space, coord, stepRing, stepHue, o) {
    var rings = space.rings || [];
    var pos = [], nor = [];
    function seg(a, b) {
      if (!a || !b) return;
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      nor.push(0, 0, 1, 0, 0, 1);
    }
    function pt(i, j) { return pointForXyz(space, coord, rings[i][j], o); }
    for (var i = 0; i < rings.length; i++) {
      var n = rings[i].length;
      if (i % stepRing === 0 || i === rings.length - 1) {
        for (var j = 0; j < n; j++) seg(pt(i, j), pt(i, (j + 1) % n));
      }
      if (i < rings.length - 1) {
        for (var h = 0; h < n; h += stepHue) seg(pt(i, h), pt(i + 1, h));
      }
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
  }

  function buildGrid(space, coord, N, step, o) {
    var pos = [], nor = [];
    function line(pts) {
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i];
        if (!a || !b) continue;
        pos.push(a[0][0], a[0][1], a[0][2], b[0][0], b[0][1], b[0][2]);
        nor.push(a[1][0], a[1][1], a[1][2], b[1][0], b[1][1], b[1][2]);
      }
    }
    function sample(face, u, v, i, j) {
      var rgb = [0, 0, 0];
      rgb[face.fix] = face.val;
      rgb[u] = i / N;
      rgb[v] = j / N;
      var p = pointFor(space, coord, rgb, o);
      if (!p) return null;
      var n = normalAt(space, coord, rgb, u, v, 1 / (N * 400), face.fix, o) || [0, 0, 1];
      return [p, n];
    }
    FACES.forEach(function (face) {
      var u = (face.fix + 1) % 3, v = (face.fix + 2) % 3;
      for (var i = 0; i <= N; i += step) {
        var pts = [];
        for (var j = 0; j <= N; j++) pts.push(sample(face, u, v, i, j));
        line(pts);
      }
      for (var j2 = 0; j2 <= N; j2 += step) {
        var pts2 = [];
        for (var i2 = 0; i2 <= N; i2++) pts2.push(sample(face, u, v, i2, j2));
        line(pts2);
      }
    });
    return { pos: new Float32Array(pos), nor: new Float32Array(nor) };
  }

  /* ---------- 多基色（自定义原色） ----------

     n 个基色向量 g_k = Y_k · (x_k/y_k, 1, z_k/y_k) 张成一个 3D zonotope（闵可夫斯基和）：
     面片 2·C(n,2) 个平行四边形，顶点 n²−n+2 个。面片可解析枚举——对每一对基色
     (i,j)，法线 n = g_i × g_j，其余基色按 sign(n·g_k) 贴到 0/1 极值。 */

  /* 解 Σ Y_k·u_k = W（3 个方程、n 个未知数）：n=3 唯一解（就是 NPM），
     n>3 取最小范数解 Y = Aᵀ(AAᵀ)⁻¹W。返回 null 表示无解。 */
  function solveWeights(unit, W) {
    var n = unit.length;
    if (n < 3) return null;
    var A = [0, 1, 2].map(function (r) {
      return unit.map(function (u) { return u[r]; });
    });
    if (n === 3) {
      var m = A.map(function (row) { return row.slice(); });
      var b = [W[0], W[1], W[2]];
      for (var i = 0; i < 3; i++) {
        var p = i;
        for (var k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
        var tr = m[i]; m[i] = m[p]; m[p] = tr;
        var tb = b[i]; b[i] = b[p]; b[p] = tb;
        var d = m[i][i];
        if (!d) return null;
        for (var j = i; j < 3; j++) m[i][j] /= d;
        b[i] /= d;
        for (var k2 = 0; k2 < 3; k2++) {
          if (k2 === i) continue;
          var f = m[k2][i];
          if (!f) continue;
          for (var j2 = i; j2 < 3; j2++) m[k2][j2] -= f * m[i][j2];
          b[k2] -= f * b[i];
        }
      }
      return b;
    }
    var AAt = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      var sum = 0;
      for (var k3 = 0; k3 < n; k3++) sum += A[r][k3] * A[c][k3];
      AAt[r * 3 + c] = sum;
    }
    var inv = invert3(AAt);
    if (!inv) return null;
    var out = new Array(n);
    for (var k4 = 0; k4 < n; k4++) {
      var acc = 0;
      for (var r2 = 0; r2 < 3; r2++) {
        var t = 0;
        for (var c2 = 0; c2 < 3; c2++) t += inv[r2 * 3 + c2] * W[c2];
        acc += A[r2][k4] * t;
      }
      out[k4] = acc;
    }
    return out;
  }

  /* 非负解：最小范数解可能出现负权重（物理上仍有非负解），
     用 active-set 把最负的分量固定为 0 再解，直到全非负。
     n < 3 时用正规方程 (AᵀA)⁻¹AᵀW。 */
  function solveWeightsNonNeg(unit, W) {
    function solveSub(sub) {
      var n = sub.length;
      if (!n) return null;
      if (n >= 3) return solveWeights(sub, W);
      var AtA = [], AtW = [];
      for (var r = 0; r < n; r++) {
        AtW.push(0);
        for (var r2 = 0; r2 < 3; r2++) AtW[r] += sub[r][r2] * W[r2];
      }
      for (var i = 0; i < n; i++) {
        AtA.push([]);
        for (var j = 0; j < n; j++) {
          var sum = 0;
          for (var k = 0; k < 3; k++) sum += sub[i][k] * sub[j][k];
          AtA[i].push(sum);
        }
      }
      if (n === 1) {
        var d1 = AtA[0][0];
        return d1 ? [AtW[0] / d1] : null;
      }
      var det = AtA[0][0] * AtA[1][1] - AtA[0][1] * AtA[1][0];
      if (Math.abs(det) < 1e-15) return null;
      return [
        (AtA[1][1] * AtW[0] - AtA[0][1] * AtW[1]) / det,
        (AtA[0][0] * AtW[1] - AtA[1][0] * AtW[0]) / det
      ];
    }
    var idx = unit.map(function (_, i) { return i; });
    for (var guard = 0; guard <= unit.length; guard++) {
      var y = solveSub(idx.map(function (i) { return unit[i]; }));
      if (!y) return null;
      var worst = -1, worstVal = -1e-9;
      for (var k2 = 0; k2 < y.length; k2++) {
        if (y[k2] < worstVal) { worstVal = y[k2]; worst = k2; }
      }
      if (worst < 0) {
        var full = new Array(unit.length);
        for (var z = 0; z < unit.length; z++) full[z] = 0;
        for (var q = 0; q < idx.length; q++) full[idx[q]] = y[q];
        return full;
      }
      idx.splice(worst, 1);
      if (idx.length < 1) return null;
    }
    return null;
  }

  /* Σ w_k·unit_k 与目标 W 的距离，用来判断一组权重是否真的合成了白点 */
  function weightResidual(unit, w, W) {
    var acc = 0;
    for (var r = 0; r < 3; r++) {
      var s = 0;
      for (var i = 0; i < unit.length; i++) s += unit[i][r] * w[i];
      acc += (s - W[r]) * (s - W[r]);
    }
    return Math.sqrt(acc);
  }

  /* 色品 (x, y) → Y = 1 的 XYZ 方向向量；白点按 Σ w_k·unit_k 合成，所以 Σ w_k = 1 */
  function multiUnit(primaries) {
    return (primaries || []).map(function (p) {
      var y = Math.max(p[1], 1e-6);
      return [p[0] / y, 1, (1 - p[0] - p[1]) / y];
    });
  }

  /* 用不超过 3 个生成元表示 target（3 维下可行解总能压到 3 个非零分量）。
     返回与 idx 等长的系数数组，失败返回 null。 */
  function coneSubset(gens, idx, target) {
    var sub = idx.map(function (i) { return gens[i]; });
    var w = solveWeightsNonNeg(sub, target);
    if (!w) return null;
    if (weightResidual(sub, w, target) > 1e-7) return null;
    for (var i = 0; i < w.length; i++) if (!(w[i] >= -1e-9)) return null;
    return w;
  }

  /* target 是否落在 gens 张成的锥里——白点能不能只靠这些基色合成 */
  function coneWeights(gens, target) {
    var n = gens.length;
    if (!n) return null;
    var w = solveWeightsNonNeg(gens, target);
    if (w && weightResidual(gens, w, target) < 1e-7) return w;
    /* 全量解出负数时，枚举子集再试：三维里可行解必有不超过 3 个非零分量 */
    var out = null;
    if (n >= 3) {
      for (var i = 0; i < n && !out; i++) {
        for (var j = i + 1; j < n && !out; j++) {
          for (var k = j + 1; k < n && !out; k++) {
            var sub = coneSubset(gens, [i, j, k], target);
            if (sub) {
              out = new Array(n);
              for (var z = 0; z < n; z++) out[z] = 0;
              out[i] = Math.max(sub[0], 0); out[j] = Math.max(sub[1], 0); out[k] = Math.max(sub[2], 0);
            }
          }
        }
      }
    }
    if (!out && n >= 2) {
      for (var a = 0; a < n && !out; a++) {
        for (var b = a + 1; b < n && !out; b++) {
          var s2 = coneSubset(gens, [a, b], target);
          if (s2) {
            out = new Array(n);
            for (var z2 = 0; z2 < n; z2++) out[z2] = 0;
            out[a] = Math.max(s2[0], 0); out[b] = Math.max(s2[1], 0);
          }
        }
      }
    }
    return out;
  }

  /* 固定第 k 个基色的 Y = t，其余基色仍要合成白点：解 Σ_{i≠k} w_i·unit_i = W − t·unit_k。
     返回完整权重数组（第 k 位为 t），t 不可行时返回 null。 */
  function solvePinned(primaries, whiteXY, k, t) {
    var unit = multiUnit(primaries);
    if (!unit.length || !(k >= 0 && k < unit.length) || !(t >= -1e-12)) return null;
    var W = whiteXYZ(whiteXY || [0.3127, 0.329]);
    var target = [
      W[0] - t * unit[k][0],
      W[1] - t * unit[k][1],
      W[2] - t * unit[k][2]
    ];
    if (target[0] < -1e-9 || target[1] < -1e-9 || target[2] < -1e-9) return null;
    var rest = [], idx = [];
    for (var i = 0; i < unit.length; i++) {
      if (i === k) continue;
      rest.push(unit[i]); idx.push(i);
    }
    var sub = coneWeights(rest, target);
    if (!sub) return null;
    var out = new Array(unit.length);
    for (var z = 0; z < unit.length; z++) out[z] = 0;
    for (var q = 0; q < idx.length; q++) out[idx[q]] = Math.max(sub[q], 0);
    out[k] = t;
    return out;
  }

  /* 固定第 k 个基色时，t 的可行区间。白点方程对 t 线性，可行集是区间，
     所以采样定出大致位置后二分两次边界即可。 */
  function pinnedRange(primaries, whiteXY, k) {
    var unit = multiUnit(primaries);
    if (!unit.length || !(k >= 0 && k < unit.length)) return null;
    var W = whiteXYZ(whiteXY || [0.3127, 0.329]);
    function feasible(t) {
      if (t < -1e-12) return false;
      var target = [W[0] - t * unit[k][0], W[1] - t * unit[k][1], W[2] - t * unit[k][2]];
      if (target[0] < -1e-9 || target[1] < -1e-9 || target[2] < -1e-9) return false;
      var rest = [], idx = [];
      for (var i = 0; i < unit.length; i++) {
        if (i === k) continue;
        rest.push(unit[i]); idx.push(i);
      }
      return !!coneWeights(rest, target);
    }
    var N = 64, first = -1, last = -1;
    for (var i = 0; i <= N; i++) {
      if (feasible(i / N)) { if (first < 0) first = i; last = i; }
    }
    if (first < 0) return null;
    var lo = 0, hi = 1;
    if (first > 0) {
      var a = (first - 1) / N, b = first / N;
      for (var it = 0; it < 60; it++) { var m = (a + b) / 2; if (feasible(m)) b = m; else a = m; }
      lo = b;
    }
    if (last < N) {
      var c = last / N, d = (last + 1) / N;
      for (var it2 = 0; it2 < 60; it2++) { var m2 = (c + d) / 2; if (feasible(m2)) c = m2; else d = m2; }
      hi = c;
    }
    return lo <= hi ? { lo: lo, hi: hi } : null;
  }

  /* 共线生成元合并：两个基色向量平行时，其 2-zone 退化成线段、面片会缺失（破面）。
     [0,a]+[0,b]（同向）= [0,a+b]；反向 = [b,a] = b + [0,a−b]，
     所以合并后只需一个新段 + 一个整体平移 offset。 */
  function mergeCollinear(gens, eps) {
    var n = gens.length, used = new Array(n), out = [], offset = [0, 0, 0], merged = [];
    var len = function (v) { return Math.hypot(v[0], v[1], v[2]); };
    for (var i = 0; i < n; i++) {
      if (used[i]) continue;
      var ref = gens[i], lr = len(ref);
      if (!(lr > 1e-12)) { used[i] = true; continue; }
      var pos = ref.slice(), neg = [0, 0, 0], group = [i];
      used[i] = true;
      for (var j = i + 1; j < n; j++) {
        if (used[j]) continue;
        var g = gens[j], lg = len(g);
        if (!(lg > 1e-12)) { used[j] = true; continue; }
        var cross = Math.hypot(ref[1] * g[2] - ref[2] * g[1], ref[2] * g[0] - ref[0] * g[2], ref[0] * g[1] - ref[1] * g[0]);
        if (cross > eps * lr * lg) continue;
        used[j] = true;
        group.push(j);
        var d = ref[0] * g[0] + ref[1] * g[1] + ref[2] * g[2];
        if (d >= 0) { pos[0] += g[0]; pos[1] += g[1]; pos[2] += g[2]; }
        else { neg[0] += g[0]; neg[1] += g[1]; neg[2] += g[2]; }
      }
      if (group.length === 1) { out.push(gens[i].slice()); continue; }
      var seg = [pos[0] - neg[0], pos[1] - neg[1], pos[2] - neg[2]];
      offset[0] += neg[0]; offset[1] += neg[1]; offset[2] += neg[2];
      if (len(seg) > 1e-12) out.push(seg);
      merged.push(group);
    }
    return { gens: out, offset: offset, merged: merged };
  }

  /* 判断生成元集合是否张成非退化的三维体积（至少 3 个线性无关向量） */
  function has3DVolume(gens) {
    var n = gens.length;
    if (n < 3) return false;
    var norms = gens.map(function (g) { return Math.hypot(g[0], g[1], g[2]); });
    for (var i = 0; i < n; i++) {
      if (!(norms[i] > 1e-12)) continue;
      for (var j = i + 1; j < n; j++) {
        if (!(norms[j] > 1e-12)) continue;
        var gi = gens[i], gj = gens[j];
        var nx = gi[1] * gj[2] - gi[2] * gj[1];
        var ny = gi[2] * gj[0] - gi[0] * gj[2];
        var nz = gi[0] * gj[1] - gi[1] * gj[0];
        for (var k = j + 1; k < n; k++) {
          if (!(norms[k] > 1e-12)) continue;
          var gk = gens[k];
          var vol = Math.abs(nx * gk[0] + ny * gk[1] + nz * gk[2]);
          if (vol > 1e-9 * norms[i] * norms[j] * norms[k]) return true;
        }
      }
    }
    return false;
  }

  /* 由「原色色品 + 白点（+ 可选亮度权重）」造一个渲染管线要用的空间对象 */
  function makeMultiSpace(entry, srgbMatrix, jmhApi) {
    var primaries = (entry && entry.primaries) || [];
    var whiteXY = (entry && entry.white) || [0.3127, 0.329];
    var W = whiteXYZ(whiteXY);
    var unit = primaries.map(function (p) {
      var y = Math.max(p[1], 1e-6);
      return [p[0] / y, 1, (1 - p[0] - p[1]) / y];
    });
    var hasExplicit = !!(entry && Array.isArray(entry.weights) && entry.weights.length === unit.length);
    var weights = hasExplicit ? entry.weights.slice() : solveWeights(unit, W);

    /* 最小范数解可能为负（物理上仍有非负解）：换 active-set 非负解，
       但只有它真能满足白点时才采用——否则说明白点根本不在原色锥内。
       手填权重（hasExplicit）绝不静默替换成自动非负解。 */
    function residualOf(w) {
      var acc = 0;
      for (var r = 0; r < 3; r++) {
        var s = 0;
        for (var i = 0; i < unit.length; i++) s += unit[i][r] * w[i];
        acc += (s - W[r]) * (s - W[r]);
      }
      return Math.sqrt(acc);
    }
    var invalidWeights = !weights || weights.some(function (v) { return !isFinite(v); });
    var neg = !invalidWeights && weights.some(function (v) { return v < -1e-9; });
    if (!hasExplicit && neg) {
      var nn = solveWeightsNonNeg(unit, W);
      if (nn && residualOf(nn) < 1e-6) { weights = nn; neg = false; }
    }

    var gens = [], err = 0, sumY = 0, ok = !invalidWeights;
    if (ok) {
      var sum = [0, 0, 0];
      for (var i = 0; i < unit.length; i++) {
        if (!(weights[i] >= -1e-9)) neg = true;
        sumY += weights[i];
        gens.push([unit[i][0] * weights[i], unit[i][1] * weights[i], unit[i][2] * weights[i]]);
        sum[0] += gens[i][0]; sum[1] += gens[i][1]; sum[2] += gens[i][2];
      }
      err = Math.hypot(sum[0] - W[0], sum[1] - W[1], sum[2] - W[2]);
    }
    /* 共线（含重复）基色合并，并剔除零权重基色 */
    var mergedInfo = mergeCollinear(gens, 1e-9);
    gens = mergedInfo.gens;
    var offset = mergedInfo.offset;
    var hasVolume = ok && has3DVolume(gens);

    var inv = srgbMatrix ? invert3(flatten3(srgbMatrix)) : null;
    var jmhParams = null;
    if (jmhApi && primaries.length >= 3) {
      try { jmhParams = jmhApi.init(primaries, whiteXY); } catch (e) { jmhParams = null; }
    }
    return {
      slug: (entry && entry.slug) || 'custom-multi',
      title: (entry && entry.title) || '自定义多基色',
      white: W,
      multi: true,
      primaries: primaries,
      gens: gens,
      offset: offset,
      mergedGroups: mergedInfo.merged,
      weights: (!invalidWeights && weights) ? weights : [],
      explicitWeights: hasExplicit,
      sumY: sumY,
      whiteError: err,
      hasVolume: hasVolume,
      degenerate: !hasVolume,
      weightOk: ok && !neg && hasVolume,
      negativeWeights: neg,
      jmhParams: jmhParams,
      colorXyz: function (xyz) {
        if (!inv) return [0.8, 0.8, 0.8];
        return previewColor(mulVec3(inv, xyz));
      }
    };
  }

  /* 由色品 (x, y)（Y 取 1）求 sRGB 预览色，给输入面板画小色块用；超出色域会裁剪 */
  function previewForXy(xy, srgbMatrix) {
    if (!srgbMatrix || !xy) return [0.8, 0.8, 0.8];
    var inv = invert3(flatten3(srgbMatrix));
    if (!inv) return [0.8, 0.8, 0.8];
    var y = Math.max(xy[1], 1e-6);
    var xyz = [xy[0] / y, 1, (1 - xy[0] - xy[1]) / y];
    return previewColor(mulVec3(inv, xyz));
  }

  /* 解析用户输入的原色表：每行「名称 x y」或「x y」，逗号/空白分隔，# 开头是注释。
     返回 { primaries: [[x,y], …], bad: [原始行…] } */
  function parsePrimaries(text) {
    var primaries = [], bad = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t || t.charAt(0) === '#') return;
      var parts = t.split(/[\s,]+/).filter(function (v) { return v !== ''; });
      if (!parts.length) return;
      var nums = parts.map(Number);
      var x, y;
      if (parts.length >= 3 && !isFinite(nums[0])) { x = nums[1]; y = nums[2]; }
      else { x = nums[0]; y = nums[1]; }
      var okNum = isFinite(x) && isFinite(y);
      /* x + y 恰好 = 1 是合法的（z = 0，例如 Rec.2020 红），只拒超过 1 的 */
      if (!okNum || x <= 0 || y <= 0 || x + y > 1.000001) { bad.push(t); return; }
      primaries.push([x, y]);
    });
    return { primaries: primaries, bad: bad };
  }

  /* 自定义多基色的 URL 编解码：`x1,y1_x2,y2_…*wx,wy*第三段`。
     第三段有空 / 权重表 / 固定项三种：`w1,w2,…` 是手填 Y，`p<k>,<t>` 表示把第 k 个
     基色的 Y 固定为 t（其余按白点解）。分隔符选 _ 和 *：URLSearchParams 只对字母数字
     与 -._* 不编码，逗号由 ToolState 还原。 */
  function encodeMulti(data) {
    if (!data || !data.primaries || !data.primaries.length) return '';
    var prim = data.primaries.map(function (p) {
      return p[0].toFixed(4) + ',' + p[1].toFixed(4);
    }).join('_');
    var w = data.white || [0.3127, 0.329];
    var out = prim + '*' + w[0].toFixed(4) + ',' + w[1].toFixed(4);
    if (data.pin && data.pin.index >= 0 && data.pin.index < data.primaries.length) {
      out += '*p' + data.pin.index + ',' + Number(data.pin.value).toFixed(4);
    } else if (data.weights && data.weights.length) {
      out += '*' + data.weights.map(function (v) { return v.toFixed(4); }).join(',');
    }
    return out;
  }

  function decodeMulti(text) {
    if (!text) return null;
    var seg = String(text).split('*');
    var primaries = seg[0].split('_').map(function (t) {
      var a = t.split(',').map(Number);
      if (a.length !== 2 || !isFinite(a[0]) || !isFinite(a[1])) return null;
      if (!(a[0] > 0 && a[1] > 0 && a[0] + a[1] <= 1.000001)) return null;
      return [a[0], a[1]];
    }).filter(function (v) { return !!v; });
    if (primaries.length < 3) return null;
    var white = [0.3127, 0.329];
    if (seg[1]) {
      var w = seg[1].split(',').map(Number);
      if (w.length === 2 && isFinite(w[0]) && isFinite(w[1]) && w[1] > 0) white = [w[0], w[1]];
    }
    var weights = null, pin = null;
    if (seg[2]) {
      if (seg[2].charAt(0) === 'p') {
        var pv = seg[2].slice(1).split(',').map(Number);
        var pi = Math.round(pv[0]);
        if (pv.length === 2 && isFinite(pi) && isFinite(pv[1]) && pi >= 0 && pi < primaries.length && pv[1] >= 0) {
          pin = { index: pi, value: pv[1] };
        }
      } else {
        var ws = seg[2].split(',').map(Number).filter(function (v) { return isFinite(v); });
        if (ws.length === primaries.length) weights = ws;
      }
    }
    return { primaries: primaries, white: white, weights: weights, pin: pin };
  }

  /* 面片枚举：返回 [{ base, gi, gj, sgn }] */
  function multiFaces(gens) {
    var n = gens.length, out = [];
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var gi = gens[i], gj = gens[j];
        var nx = gi[1] * gj[2] - gi[2] * gj[1];
        var ny = gi[2] * gj[0] - gi[0] * gj[2];
        var nz = gi[0] * gj[1] - gi[1] * gj[0];
        if (!(Math.hypot(nx, ny, nz) > 1e-12)) continue;
        for (var s = 0; s < 2; s++) {
          var dir = s ? -1 : 1;
          var base = [0, 0, 0];
          for (var k = 0; k < n; k++) {
            if (k === i || k === j) continue;
            var d = dir * (nx * gens[k][0] + ny * gens[k][1] + nz * gens[k][2]);
            if (d > 0) {
              base[0] += gens[k][0]; base[1] += gens[k][1]; base[2] += gens[k][2];
            }
          }
          var owner = new Array(n);
          for (var k2 = 0; k2 < n; k2++) owner[k2] = 0;
          for (var k3 = 0; k3 < n; k3++) {
            if (k3 === i || k3 === j) continue;
            var d2 = dir * (nx * gens[k3][0] + ny * gens[k3][1] + nz * gens[k3][2]);
            owner[k3] = d2 > 0 ? 1 : 0;
          }
          out.push({ base: base, gi: gi, gj: gj, sgn: dir, i: i, j: j, owner: owner });
        }
      }
    }
    return out;
  }

  function buildMultiSurface(space, coord, subdiv, o) {
    var S = Math.max(1, subdiv || 6);
    var gens = space.gens || [];
    var n = gens.length;
    var faces = multiFaces(gens);
    var offV = space.offset || [0, 0, 0];
    var ox = offV[0], oy = offV[1], oz = offV[2];
    var pos = [], col = [], idx = [];
    var missing = 0, repairedCount = 0;

    /* 顶点唯一化：用「n 维立方体里的参数向量」做键。
       相邻面片共享一条边时，边上的点参数向量完全一致（其余分量都是 0/1 极值），
       所以顶点严格共享，曲面严格封闭——不靠容差焊接。 */
    var vmap = new Map();
    function vertexOf(f, a, b) {
      var key = '';
      for (var k = 0; k < n; k++) {
        var c = f.owner[k];
        if (k === f.i) c = a / S;
        else if (k === f.j) c = b / S;
        key += (Math.round(c * S * 2) / 2) + ',';
      }
      var hit = vmap.get(key);
      if (hit !== undefined) return hit;
      var sa = a / S, sb = b / S;
      var x = ox + f.base[0] + f.gi[0] * sa + f.gj[0] * sb;
      var y = oy + f.base[1] + f.gi[1] * sa + f.gj[1] * sb;
      var z = oz + f.base[2] + f.gi[2] * sa + f.gj[2] * sb;
      var p = pointForXyz(space, coord, [x, y, z], o);
      var bad = !p || !isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2]);
      if (bad) {
        /* 病态顶点：黑点（xyY 色度未定义）、或白点不可达导致的面片含负亮度。
           先在参数空间朝原点收缩，直到能转换；仍不行就落到白点的闭包点。
           顶点按参数向量共享，所以相邻面片收缩后的位置也一致，不会裂开。 */
        for (var shrink = 1; shrink <= 6 && bad; shrink++) {
          var k2 = Math.pow(0.5, shrink);
          p = pointForXyz(space, coord, [x * k2, y * k2, z * k2], o);
          bad = !p || !isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2]);
          if (!bad) repairedCount++;
        }
        if (bad) {
          p = singular(coord, space.white);
          repairedCount++;
          bad = !isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2]);
        }
      }
      if (bad) { vmap.set(key, -1); missing++; return -1; }
      var v = pos.length / 3;
      pos.push(p[0], p[1], p[2]);
      var color = space.colorXyz([x, y, z]);
      col.push(color[0], color[1], color[2]);
      vmap.set(key, v);
      return v;
    }

    for (var fi = 0; fi < faces.length; fi++) {
      var f = faces[fi], grid = [];
      for (var a = 0; a <= S; a++) {
        grid[a] = [];
        for (var b = 0; b <= S; b++) {
          grid[a][b] = vertexOf(f, a, b);
        }
      }
      for (var a3 = 0; a3 < S; a3++) for (var b3 = 0; b3 < S; b3++) {
        var i0 = grid[a3][b3], i1 = grid[a3 + 1][b3], i2 = grid[a3 + 1][b3 + 1], i3 = grid[a3][b3 + 1];
        if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0) continue;
        /* 绕向统一朝外：面片法线 = gi×gj，sgn=-1 那一侧反写 */
        if (f.sgn > 0) idx.push(i0, i1, i2, i0, i2, i3);
        else idx.push(i0, i3, i2, i0, i2, i1);
      }
    }

    /* 顶点法线：三角形法线累加，再用「从体积中心指向外」校正方向
       （不同坐标变换的手性不一致，用中心校正比判断行列式稳） */
    var cnt = pos.length / 3;
    var nx2 = new Float64Array(cnt), ny2 = new Float64Array(cnt), nz2 = new Float64Array(cnt);
    var cx = 0, cy = 0, cz = 0;
    for (var v = 0; v < cnt; v++) { cx += pos[v * 3]; cy += pos[v * 3 + 1]; cz += pos[v * 3 + 2]; }
    if (cnt) { cx /= cnt; cy /= cnt; cz /= cnt; }
    for (var t = 0; t < idx.length; t += 3) {
      var a0 = idx[t] * 3, a1 = idx[t + 1] * 3, a2 = idx[t + 2] * 3;
      var ux = pos[a1] - pos[a0], uy = pos[a1 + 1] - pos[a0 + 1], uz = pos[a1 + 2] - pos[a0 + 2];
      var vx = pos[a2] - pos[a0], vy = pos[a2 + 1] - pos[a0 + 1], vz = pos[a2 + 2] - pos[a0 + 2];
      var fnx = uy * vz - uz * vy, fny = uz * vx - ux * vz, fnz = ux * vy - uy * vx;
      var mx = (pos[a0] + pos[a1] + pos[a2]) / 3 - cx;
      var my = (pos[a0 + 1] + pos[a1 + 1] + pos[a2 + 1]) / 3 - cy;
      var mz = (pos[a0 + 2] + pos[a1 + 2] + pos[a2 + 2]) / 3 - cz;
      if (fnx * mx + fny * my + fnz * mz < 0) { fnx = -fnx; fny = -fny; fnz = -fnz; }
      var tri = [a0, a1, a2];
      for (var q = 0; q < 3; q++) {
        var o3 = tri[q] / 3;
        nx2[o3] += fnx; ny2[o3] += fny; nz2[o3] += fnz;
      }
    }
    var nor = [];
    for (var w = 0; w < cnt; w++) {
      var l = Math.hypot(nx2[w], ny2[w], nz2[w]) || 1;
      nor.push(nx2[w] / l, ny2[w] / l, nz2[w] / l);
    }

    var bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (var bi = 0; bi < pos.length; bi += 3) {
      for (var bk = 0; bk < 3; bk++) {
        if (pos[bi + bk] < bb[0][bk]) bb[0][bk] = pos[bi + bk];
        if (pos[bi + bk] > bb[1][bk]) bb[1][bk] = pos[bi + bk];
      }
    }

    return {
      pos: new Float32Array(pos),
      nor: new Float32Array(nor),
      col: new Float32Array(col),
      idx: new Uint16Array(idx),
      bbox: bb,
      missing: missing,
      repaired: repairedCount,
      faces: faces.length,
      verts: cnt
    };
  }

  /* 面片网格线：每片画边界 + 中线 */
  function buildMultiGrid(space, coord, subdiv, o) {
    var S = Math.max(1, subdiv || 6);
    var faces = multiFaces(space.gens || []);
    var pos = [];
    var offG = space.offset || [0, 0, 0];
    function at(f, sa, sb) {
      var x = offG[0] + f.base[0] + f.gi[0] * sa + f.gj[0] * sb;
      var y = offG[1] + f.base[1] + f.gi[1] * sa + f.gj[1] * sb;
      var z = offG[2] + f.base[2] + f.gi[2] * sa + f.gj[2] * sb;
      return pointForXyz(space, coord, [x, y, z], o);
    }
    faces.forEach(function (f) {
      var steps = [0, 1 / 3, 2 / 3, 1];
      steps.forEach(function (s) {
        for (var k = 0; k < steps.length - 1; k++) {
          var p0 = at(f, s, steps[k]), p1 = at(f, s, steps[k + 1]);
          if (p0 && p1) pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
          var q0 = at(f, steps[k], s), q1 = at(f, steps[k + 1], s);
          if (q0 && q1) pos.push(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2]);
        }
      });
    });
    return { pos: new Float32Array(pos) };
  }

  /* ---------- 坐标轴刻度 ----------
     三根轴共用一套步长，同样长的刻度间隔代表同样的数值。 */

  function niceStep(range) {
    var raw = range / 4;
    var mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var n = raw / mag;
    var mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return mult * mag;
  }

  /* 在 [lo, hi] 里按 step 摆刻度，大致能摆几条 */
  function tickCount(lo, hi, step) {
    return Math.floor((hi + 1e-9) / step) - Math.ceil((lo - 1e-9) / step) + 1;
  }

  /* 从粗到细试 1/2/5/10 档，取第一条「每根轴都能摆下 3–7 个刻度」的（只有 2 条刻度没法读中间值）。
     某根轴量程差得太远（例如 JzAzBz 的 az/bz 只有 Jz 的一半）时返回 0，各轴退回自定步长。 */
  function sharedStep(lo, hi) {
    var spans = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    var maxSpan = Math.max(Math.max(spans[0], spans[1]), spans[2]) || 1;
    var mag = Math.pow(10, Math.floor(Math.log10(maxSpan / 4 || 1)));
    var mult = [1, 2, 5, 10];
    for (var i = mult.length - 1; i >= 0; i--) {
      var step = mag * mult[i];
      var c = [0, 1, 2].map(function (k) { return tickCount(lo[k], hi[k], step); });
      var mn = Math.min(c[0], c[1], c[2]), mx = Math.max(c[0], c[1], c[2]);
      if (mn >= 3 && mx <= 7) return step;
    }
    return 0;
  }

  /* 小数位必须够写出步长本身：0.5 要 1 位、0.05 要 2 位。
     按「step ≥ 0.5 取 0 位」这种粗分档会把 0.5 舍成 "1"，
     看上去就像这根轴的单位长度比别人长一倍。 */
  function decimalsFor(step) {
    var d = Math.max(0, -Math.floor(Math.log10(Math.abs(step) || 1)));
    for (; d < 8; d++) {
      var scaled = step * Math.pow(10, d);
      if (Math.abs(scaled - Math.round(scaled)) < 1e-6) break;
    }
    return d;
  }

  function fmtTick(v, step) {
    var s = v.toFixed(decimalsFor(step));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  /* ---------- 4×4 相机矩阵 ---------- */

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  /* 正交：半高 halfH，宽按画幅比例给；与距离无关，w 恒为 1。 */
  function ortho(halfH, aspect, near, far) {
    var h = halfH > 1e-6 ? halfH : 1;
    var w = h * aspect;
    return new Float32Array([
      1 / w, 0, 0, 0,
      0, 1 / h, 0, 0,
      0, 0, -2 / (far - near), 0,
      0, 0, -(far + near) / (far - near), 1
    ]);
  }

  function lookAt(eye, center, up) {
    var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-6) {
      /* 视线和 up 平行（正上方 / 正下方）时叉积退化，换一个上方向；
         选 -Z 是为了和 89° 时的画面朝向连续，俯视不会突然翻一下 */
      up = [0, 0, -1];
      xx = up[1] * zz - up[2] * zy;
      xy = up[2] * zx - up[0] * zz;
      xz = up[0] * zy - up[1] * zx;
      xl = Math.hypot(xx, xy, xz) || 1;
    }
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1
    ]);
  }

  function mul4(A, B) {
    var C = new Float32Array(16);
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 4; c++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += A[k * 4 + r] * B[c * 4 + k];
        C[c * 4 + r] = s;
      }
    }
    return C;
  }

  /* 正交相机放在这个距离上：正交不看距离，放远一点才不会转到背后的几何被近平面切掉 */
  var ORTHO_EYE = 3.4;

  root.ColourVolumeGeom = {
    SURROUNDS: SURROUNDS,
    FACES: FACES,
    flatten3: flatten3,
    mulVec3: mulVec3,
    invert3: invert3,
    whiteXYZ: whiteXYZ,
    labFromXYZ: labFromXYZ,
    camOpts: camOpts,
    toDisplay: toDisplay,
    singular: singular,
    makeSpace: makeSpace,
    pointFor: pointFor,
    normalAt: normalAt,
    buildSurface: buildSurface,
    buildGrid: buildGrid,
    makePointerSpace: makePointerSpace,
    dataPoints: dataPoints,
    pointForXyz: pointForXyz,
    buildCustom: buildCustom,
    buildCustomGrid: buildCustomGrid,
    solveWeights: solveWeights,
    solveWeightsNonNeg: solveWeightsNonNeg,
    weightResidual: weightResidual,
    multiUnit: multiUnit,
    solvePinned: solvePinned,
    pinnedRange: pinnedRange,
    makeMultiSpace: makeMultiSpace,
    mergeCollinear: mergeCollinear,
    parsePrimaries: parsePrimaries,
    previewForXy: previewForXy,
    encodeMulti: encodeMulti,
    decodeMulti: decodeMulti,
    multiFaces: multiFaces,
    buildMultiSurface: buildMultiSurface,
    buildMultiGrid: buildMultiGrid,
    lchToXyz: lchToXyz,
    niceStep: niceStep,
    tickCount: tickCount,
    sharedStep: sharedStep,
    decimalsFor: decimalsFor,
    fmtTick: fmtTick,
    perspective: perspective,
    ortho: ortho,
    lookAt: lookAt,
    mul4: mul4,
    ORTHO_EYE: ORTHO_EYE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ColourVolumeGeom;
})(typeof window !== 'undefined' ? window : globalThis);
