/*
 * 三维色体积预览（试验）
 * 把归一化线性 RGB 立方体 [0,1]³ 映射到 XYZ / xyY / Lab，用 WebGL 绘制。
 * 零依赖：矩阵、网格、相机、交互都写在这里。
 */
(function (root) {
  'use strict';

  var host = document.querySelector('[data-volume]');
  if (!host) return;

  var cfgEl = document.getElementById('volume-data');
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  var UI = cfg.ui || {};

  /* ---------- 3×3 矩阵（行主序） ---------- */

  function mul3(A, B) {
    var C = new Array(9);
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
      }
    }
    return C;
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

  /* ---------- 白点 ---------- */

  function whiteXYZ(xy) {
    var x = xy[0], y = xy[1];
    return [x / y, 1, (1 - x - y) / y];
  }

  /* ---------- 坐标变换 ---------- */

  function labFromXYZ(xyz, W) {
    var t = [xyz[0] / W[0], xyz[1] / W[1], xyz[2] / W[2]];
    var e = 216 / 24389; // (6/29)^3
    var k = 24389 / 27;
    var f = t.map(function (v) { return v > e ? Math.cbrt(v) : (k * v + 16) / 116; });
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])]; // [L*, a*, b*]
  }

  var MODELS = root.ColourModels || {};

  /* 参考白亮度（cd/m²），只有 HDR / 外观模型用得到 */
  var LUM = 100;

  /* 观察条件：CIECAM02 用 F / c / Nc，ZCAM 用 F_s；背景按参考白的比例给 */
  var SURROUNDS = {
    average: { F: 1.0, c: 0.69, Nc: 1.0, Fs: 0.69 },
    dim: { F: 0.9, c: 0.59, Nc: 0.95, Fs: 0.59 },
    dark: { F: 0.8, c: 0.525, Nc: 0.8, Fs: 0.525 }
  };
  var COND = { surround: 'average', bg: 0.2, laFactor: 0.2 };

  function camOpts(Lw) {
    var s = SURROUNDS[COND.surround] || SURROUNDS.average;
    return { La: Lw * COND.laFactor, Yb: Lw * COND.bg, F: s.F, c: s.c, Nc: s.Nc };
  }

  /* 纵轴变换：把亮度换成码值（逆 EOTF），只对 XYZ / xyY 有意义 */
  function applyVt(v) {
    if (state.vt === 'linear' || !(v > 0)) return v;
    if (state.vt === 'srgb') return MODELS.encodeSrgb(v);
    if (state.vt === 'g22') return MODELS.encodeGamma(v, 2.2);
    if (state.vt === 'g24') return MODELS.encodeGamma(v, 2.4);
    if (state.vt === 'pq') return MODELS.encodePq(v, LUM);
    return v;
  }

  /* 返回显示坐标 [水平, 竖直, 深度]，无效点返回 null */
  function toDisplay(coord, xyz, W) {
    var out;
    if (coord === 'xyz') return [xyz[0], applyVt(xyz[1]), xyz[2]];
    if (coord === 'xyy') {
      var s = xyz[0] + xyz[1] + xyz[2];
      if (!(s > 1e-9)) return null; // Y = 0 处色度未定义
      return [xyz[0] / s, applyVt(xyz[1]), xyz[2] / s];
    }
    if (coord === 'lab') {
      var lab = labFromXYZ(xyz, W);
      return [lab[1], lab[0], lab[2]]; // [a*, L*, b*]
    }
    if (coord === 'luv') out = MODELS.luv(xyz, W);
    else if (coord === 'oklab') out = MODELS.oklab(xyz);
    else if (coord === 'ictcp') out = MODELS.ictcp(xyz, LUM);
    else if (coord === 'jzazbz') out = MODELS.jzazbz(xyz, LUM);
    else if (coord === 'cam02') {
      out = MODELS.cam02ucs(
        [xyz[0] * LUM, xyz[1] * LUM, xyz[2] * LUM],
        [W[0] * LUM, W[1] * LUM, W[2] * LUM],
        camOpts(LUM)
      );
    } else {
      return [xyz[0], xyz[1], xyz[2]];
    }
    if (!out) return null;
    for (var i = 0; i < 3; i++) if (!isFinite(out[i])) return null;
    return out;
  }

  /* ---------- 线性 RGB → 预览用 sRGB ---------- */

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

  /* ---------- 每个空间一套转换 ---------- */

  function flatten3(m) {
    if (!m) return null;
    if (m.length === 9 && typeof m[0] === 'number') return m.slice();
    var out = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) out.push(m[i][j]);
    return out;
  }

  function makeSpace(entry) {
    var M = flatten3(entry.matrix);    // RGB → XYZ，行 = X,Y,Z
    var W = whiteXYZ(entry.white);     // Lab 参考白：空间自身白点，不做适应
    var inv = invert3(flatten3(cfg.srgbMatrix));
    return {
      slug: entry.slug,
      title: entry.title,
      toXYZ: function (rgb) { return mulVec3(M, rgb); },
      white: W,
      color: function (rgb) {
        if (!inv) return [0.8, 0.8, 0.8];
        return previewColor(mulVec3(inv, mulVec3(M, rgb)));
      }
    };
  }

  var spaces = (cfg.spaces || []).map(makeSpace);
  var spaceBySlug = {};
  spaces.forEach(function (s) { spaceBySlug[s.slug] = s; });

  function pointFor(space, coord, rgb) {
    var xyz = space.toXYZ(rgb);
    return toDisplay(coord, xyz, space.white);
  }

  /* ---------- 体积网格 ---------- */

  var FACES = [
    { fix: 0, val: 0 }, { fix: 0, val: 1 },
    { fix: 1, val: 0 }, { fix: 1, val: 1 },
    { fix: 2, val: 0 }, { fix: 2, val: 1 }
  ];

  function normalAt(space, coord, rgb, u, v, eps, fix) {
    function bump(c) {
      var d = rgb.slice();
      d[c] = rgb[c] + eps > 1 ? rgb[c] - eps : rgb[c] + eps;
      return d;
    }
    var p0 = pointFor(space, coord, rgb);
    var pa = pointFor(space, coord, bump(u));
    var pb = pointFor(space, coord, bump(v));
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
      var p1 = pointFor(space, coord, d1), p2 = pointFor(space, coord, d2);
      var dir = p1 && p2 ? [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]]
              : (p1 ? [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
                    : (p2 ? [p0[0] - p2[0], p0[1] - p2[1], p0[2] - p2[2]] : null));
      if (dir && dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2] < 0) {
        n = [-n[0], -n[1], -n[2]];
      }
    }
    return n;
  }

  function buildSurface(space, coord, N, neutral) {
    var pos = [], nor = [], col = [], idx = [];

    FACES.forEach(function (face) {
      var u = (face.fix + 1) % 3, v = (face.fix + 2) % 3;
      var start = pos.length / 3;
      var grid = [];
      for (var i = 0; i <= N; i++) {
        grid[i] = [];
        for (var j = 0; j <= N; j++) {
          var rgb = [0, 0, 0];
          rgb[face.fix] = face.val;
          rgb[u] = i / N;
          rgb[v] = j / N;
          var p = pointFor(space, coord, rgb);
          if (!p) { grid[i][j] = -1; continue; }
          grid[i][j] = pos.length / 3;
          pos.push(p[0], p[1], p[2]);
          var c = neutral ? [0.9, 0.9, 0.9] : space.color(rgb);
          col.push(c[0], c[1], c[2]);
          var n = normalAt(space, coord, rgb, u, v, 1 / (N * 400), face.fix) || [0, 0, 1];
          nor.push(n[0], n[1], n[2]);
        }
      }
      for (var a2 = 0; a2 < N; a2++) {
        for (var b2 = 0; b2 < N; b2++) {
          var i0 = grid[a2][b2], i1 = grid[a2 + 1][b2], i2 = grid[a2 + 1][b2 + 1], i3 = grid[a2][b2 + 1];
          if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0) continue;
          // val = 0 的面法线朝外方向相反，索引反写以保持统一绕序
          if (face.val === 0) idx.push(i0, i3, i2, i0, i2, i1);
          else idx.push(i0, i1, i2, i0, i2, i3);
        }
      }
    });

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
      bbox: bb
    };
  }


  function buildGrid(space, coord, N, step) {
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
      var p = pointFor(space, coord, rgb);
      if (!p) return null;
      var n = normalAt(space, coord, rgb, u, v, 1 / (N * 400), face.fix) || [0, 0, 1];
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

  /* ---------- 坐标轴家具 ---------- */

  function niceStep(range) {
    var raw = range / 4;
    var mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var n = raw / mag;
    var mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return mult * mag;
  }

  var AXIS_NAMES = {
    lab: ['a*', 'L*', 'b*'],
    luv: ['u*', 'L*', 'v*'],
    oklab: ['a', 'L', 'b'],
    xyz: ['X', 'Y', 'Z'],
    xyy: ['x', 'Y', 'y'],
    ictcp: ['Ct', 'I', 'Cp'],
    jzazbz: ['az', 'Jz', 'bz'],
    cam02: ["a'", "J'", "b'"]
  };

  /* 坐标轴摆在数据包围盒的底边，刻度朝外，返回线与标签 */
  function buildAxes(coord, bbox) {
    var pad = 0.10;
    var lo = [], hi = [];
    for (var k = 0; k < 3; k++) {
      var span = (bbox[1][k] - bbox[0][k]) || 1;
      lo.push(bbox[0][k] - span * pad);
      hi.push(bbox[1][k] + span * pad);
    }
    // 竖直轴从 0 起（明度类坐标的零点就是黑）
    lo[1] = Math.min(0, lo[1]);
    var names = AXIS_NAMES[coord] || AXIS_NAMES.xyz;
    var tick = 0.022 * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    var pos = [], labels = [];
    function seg(a, b) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    function fmt(v, step) {
      var digits = step >= 0.5 ? 0 : step >= 0.05 ? 1 : step >= 0.005 ? 2 : 3;
      return v.toFixed(digits).replace(/\.0+$/, '');
    }

    // 地面网格（y = 0，即 L*=0 / Y=0 平面）
    var gx0 = bbox[0][0], gx1 = bbox[1][0], gz0 = bbox[0][2], gz1 = bbox[1][2];
    var gstep = niceStep(Math.max(gx1 - gx0, gz1 - gz0));
    for (var gx = Math.ceil(gx0 / gstep) * gstep; gx <= gx1 + 1e-9; gx += gstep) {
      seg([gx, 0, gz0], [gx, 0, gz1]);
    }
    for (var gz = Math.ceil(gz0 / gstep) * gstep; gz <= gz1 + 1e-9; gz += gstep) {
      seg([gx0, 0, gz], [gx1, 0, gz]);
    }

    // 三轴都放在靠近观察者的下左角，标签不会压在色体后面
    var axes = [
      { i: 0, from: lo[0], to: hi[0], at: [0, lo[1], hi[2]], tickAxis: 1, dx: 0, dy: 15 },
      { i: 1, from: lo[1], to: hi[1], at: [lo[0], 0, hi[2]], tickAxis: 0, dx: -16, dy: 0 },
      { i: 2, from: lo[2], to: hi[2], at: [lo[0], lo[1], 0], tickAxis: 0, dx: -16, dy: 10 }
    ];
    axes.forEach(function (ax, idx) {
      var p0 = ax.at.slice(); p0[ax.i] = ax.from;
      var p1 = ax.at.slice(); p1[ax.i] = ax.to;
      seg(p0, p1);

      var step = niceStep(ax.to - ax.from);
      var lastLabel = null;
      for (var v = Math.ceil(ax.from / step) * step; v <= ax.to + 1e-9; v += step) {
        var base = ax.at.slice(); base[ax.i] = v;
        var tip = base.slice();
        tip[ax.tickAxis] -= tick;
        seg(base, tip);
        var txt = fmt(v, step);
        if (txt !== lastLabel) labels.push({ t: txt, p: tip, cls: 'is-axis', dx: ax.dx, dy: ax.dy });
        lastLabel = txt;
      }

      var nameP = ax.at.slice();
      nameP[ax.i] = ax.to + (ax.to - ax.from) * 0.04;
      labels.push({ t: names[idx], p: nameP, cls: 'is-axis-name', dx: ax.dx * 2.2, dy: ax.dy * 1.5 });
    });

    return { pos: new Float32Array(pos), labels: labels };
  }

  /* ---------- 4×4 矩阵 ---------- */

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

  function lookAt(eye, center, up) {
    var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
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

  /* ---------- 状态 ---------- */

  var canvas = host.querySelector('canvas');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
           canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
  var fallback = host.querySelector('.c-vol-fallback');
  if (!gl) {
    if (fallback) fallback.hidden = false;
    canvas.hidden = true;
    return;
  }
  if (fallback) fallback.hidden = true;

  var state = {
    primary: cfg.defaultPrimary || spaces[0].slug,
    coord: 'lab',
    neutral: false,
    grid: true,
    norm: true,
    vt: 'linear',
    cull: false,
    yaw: 0.72,
    pitch: 0.34,
    dist: 4.2,
    auto: false,
    bounds: null,
    labels: []
  };

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader');
    }
    return s;
  }

  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return p;
  }

  var solidProg = program(
    'attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;' +
    'uniform mat4 uVP; varying vec3 vNor; varying vec3 vCol;' +
    'void main(){ vNor = aNor; vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }',
    'precision mediump float; varying vec3 vNor; varying vec3 vCol;' +
    'void main(){ vec3 n = normalize(vNor);' +
    'float d = abs(dot(n, normalize(vec3(0.42, 0.78, 0.46))));' +
    'vec3 c = vCol * (0.74 + 0.26 * d);' +
    
    'gl_FragColor = vec4(c, 1.0); }'
  );

  var lineProg = program(
    'attribute vec3 aPos; attribute vec3 aCol; uniform mat4 uVP; uniform float uBias;' +
    'varying vec4 vCol; void main(){ vCol = vec4(aCol, 1.0);' +
    'gl_Position = uVP * vec4(aPos, 1.0); gl_Position.z -= uBias * gl_Position.w; }',
    'precision mediump float; varying vec4 vCol;' +
    'void main(){ gl_FragColor = vCol; }'
  );

  var solidLoc = {
    pos: gl.getAttribLocation(solidProg, 'aPos'),
    nor: gl.getAttribLocation(solidProg, 'aNor'),
    col: gl.getAttribLocation(solidProg, 'aCol'),
    vp: gl.getUniformLocation(solidProg, 'uVP'),
  };
  var lineLoc = {
    pos: gl.getAttribLocation(lineProg, 'aPos'),
    col: gl.getAttribLocation(lineProg, 'aCol'),
    vp: gl.getUniformLocation(lineProg, 'uVP'),
    bias: gl.getUniformLocation(lineProg, 'uBias')
  };

  var buffers = { solid: {}, ref: {}, axes: {} };

  function uploadSolid(key, mesh) {
    var b = buffers[key] || (buffers[key] = {});
    if (!b.pos) { b.pos = gl.createBuffer(); b.nor = gl.createBuffer(); b.col = gl.createBuffer(); b.idx = gl.createBuffer(); }
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.bufferData(gl.ARRAY_BUFFER, mesh.nor, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.col); gl.bufferData(gl.ARRAY_BUFFER, mesh.col, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    b.count = mesh.idx.length;
    return b;
  }

  function uploadLines(key, pos, color) {
    var b = buffers[key] || (buffers[key] = {});
    if (!b.pos) { b.pos = gl.createBuffer(); }
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    b.count = pos.length / 3;
    b.color = color;
    return b;
  }

  /* 全局中心与尺度：以主空间为准，叠加体共用 */
  function computeFrame(meshes) {
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    meshes.forEach(function (m) {
      var p = m.pos;
      for (var i = 0; i < p.length; i += 3) {
        for (var k = 0; k < 3; k++) {
          if (p[i + k] < min[k]) min[k] = p[i + k];
          if (p[i + k] > max[k]) max[k] = p[i + k];
        }
      }
    });
    // 以第一个（主）体积的中心对焦，轴框只参与定尺度，避免色体偏向一侧
    var c0 = meshes[0].pos, cm = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (var i = 0; i < c0.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        if (c0[i + k] < cm[0][k]) cm[0][k] = c0[i + k];
        if (c0[i + k] > cm[1][k]) cm[1][k] = c0[i + k];
      }
    }
    var center = [(cm[0][0] + cm[1][0]) / 2, (cm[0][1] + cm[1][1]) / 2, (cm[0][2] + cm[1][2]) / 2];
    // 用包围盒半对角线做半径，保证整个色体都在视野里
    var radius = 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    return { center: center, scale: 1 / radius };
  }

  function applyFrame(arr, frame) {
    for (var i = 0; i < arr.length; i += 3) {
      arr[i] = (arr[i] - frame.center[0]) * frame.scale;
      arr[i + 1] = (arr[i + 1] - frame.center[1]) * frame.scale;
      arr[i + 2] = (arr[i + 2] - frame.center[2]) * frame.scale;
    }
    return arr;
  }

  var labelEls = [];
  function ensureLabels(n) {
    var box = host.querySelector('.c-vol-labels');
    while (labelEls.length < n) {
      var d = document.createElement('span');
      d.className = 'c-vol-label';
      box.appendChild(d);
      labelEls.push(d);
    }
  }

  function rebuild() {
    var primary = spaceBySlug[state.primary];
    if (!primary) return;
    var coord = state.coord;
    var N = Math.min(window.devicePixelRatio > 1.5 ? 24 : 30, 30);

    var mesh = buildSurface(primary, coord, N, state.neutral);

    // 竖直轴统一到「参考白 = 1」：各坐标量纲不同，归一化后才能横向比较
    var whiteP = pointFor(primary, coord, [1, 1, 1]);
    var sy = state.norm && whiteP && Math.abs(whiteP[1]) > 1e-9 ? 1 / whiteP[1] : 1;
    if (sy !== 1) {
      for (var yi = 0; yi < mesh.pos.length; yi++) mesh.pos[yi] *= sy;
    }
    var bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (var bi2 = 0; bi2 < mesh.pos.length; bi2 += 3) {
      for (var bk2 = 0; bk2 < 3; bk2++) {
        if (mesh.pos[bi2 + bk2] < bb[0][bk2]) bb[0][bk2] = mesh.pos[bi2 + bk2];
        if (mesh.pos[bi2 + bk2] > bb[1][bk2]) bb[1][bk2] = mesh.pos[bi2 + bk2];
      }
    }
    mesh.bbox = bb;

    var axes = buildAxes(coord, mesh.bbox);
    var frame = computeFrame([mesh, { pos: axes.pos }]);

    applyFrame(mesh.pos, frame);
    applyFrame(axes.pos, frame);

    uploadSolid('primary', mesh);

    if (state.grid) {
      var grid = buildGrid(primary, coord, N, Math.max(2, Math.round(N / 6)));
      if (sy !== 1) for (var gk = 0; gk < grid.pos.length; gk++) grid.pos[gk] *= sy;
      applyFrame(grid.pos, frame);
      uploadLines('grid', grid.pos, [0.16, 0.16, 0.18, 0.30]);
    } else if (buffers.grid) {
      buffers.grid.count = 0;
    }

    uploadLines('axes', axes.pos, [0.45, 0.45, 0.48, 1]);

    var anchors = axes.labels.slice();
    [['W', [1, 1, 1]], ['K', [0, 0, 0]], ['R', [1, 0, 0]], ['G', [0, 1, 0]], ['B', [0, 0, 1]]].forEach(function (v) {
      var p = pointFor(primary, coord, v[1]);
      if (p) anchors.push({ t: v[0], p: sy === 1 ? p : [p[0] * sy, p[1] * sy, p[2] * sy], cls: 'is-vertex' });
    });

    state.labels = anchors.map(function (a) {
      var p = [
        (a.p[0] - frame.center[0]) * frame.scale,
        (a.p[1] - frame.center[1]) * frame.scale,
        (a.p[2] - frame.center[2]) * frame.scale
      ];
      return { t: a.t, p: p, cls: a.cls || '', dx: a.dx || 0, dy: a.dy || 0 };
    });
    ensureLabels(state.labels.length);
    labelEls.forEach(function (el, i) {
      var l = state.labels[i];
      el.textContent = l ? l.t : '';
      el.className = 'c-vol-label' + (l && l.cls ? ' ' + l.cls : '');
    });

    state.mesh = mesh;
    state.frame = frame;
    state.bbox = mesh.bbox;
    fitCamera();
    if (/voldebug/.test(location.search)) {
      var bb = [Infinity, Infinity, Infinity], bb2 = [-Infinity, -Infinity, -Infinity];
      for (var bi = 0; bi < mesh.pos.length; bi += 3) {
        for (var bk = 0; bk < 3; bk++) {
          if (mesh.pos[bi + bk] < bb[bk]) bb[bk] = mesh.pos[bi + bk];
          if (mesh.pos[bi + bk] > bb2[bk]) bb2[bk] = mesh.pos[bi + bk];
        }
      }
      window.__volSet = function (o) {
        if (o.yaw !== undefined) state.yaw = o.yaw;
        if (o.pitch !== undefined) state.pitch = o.pitch;
        if (o.dist !== undefined) state.dist = o.dist;
        if (o.coord !== undefined) { state.coord = o.coord; rebuild(); return; }
        requestRender();
      };
      window.__vol = {
        coord: coord,
        bbox: [bb, bb2],
        frame: frame,
        sample: {
          W: pointFor(primary, coord, [1, 1, 1]),
          K: pointFor(primary, coord, [0, 0, 0]),
          R: pointFor(primary, coord, [1, 0, 0]),
          G: pointFor(primary, coord, [0, 1, 0])
        }
      };
    }
    requestRender();
  }


  /* 在当前朝向下，把包围盒最大投影尺寸塞进画布的 92% */
  function fitCamera() {
    if (!state.mesh) return;
    var pos = state.mesh.pos;
    var bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (var i = 0; i < pos.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        if (pos[i + k] < bb[0][k]) bb[0][k] = pos[i + k];
        if (pos[i + k] > bb[1][k]) bb[1][k] = pos[i + k];
      }
    }
    var corners = [];
    for (var c = 0; c < 8; c++) {
      corners.push([
        bb[(c & 1) ? 1 : 0][0],
        bb[(c & 2) ? 1 : 0][1],
        bb[(c & 4) ? 1 : 0][2]
      ]);
    }
    var aspect = canvas.width / Math.max(1, canvas.height);
    var best = 12;
    for (var d = 1.4; d <= 12; d += 0.05) {
      var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      var eye = [d * cp * Math.sin(state.yaw), d * sp, d * cp * Math.cos(state.yaw)];
      var view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
      var proj = perspective(30 * Math.PI / 180, aspect, Math.max(0.05, d - 1.35), d + 2.4);
      var vp = mul4(proj, view);
      var worst = 0;
      for (var ci = 0; ci < corners.length; ci++) {
        var p0 = corners[ci];
        var x = vp[0] * p0[0] + vp[4] * p0[1] + vp[8] * p0[2] + vp[12];
        var y = vp[1] * p0[0] + vp[5] * p0[1] + vp[9] * p0[2] + vp[13];
        var w = vp[3] * p0[0] + vp[7] * p0[1] + vp[11] * p0[2] + vp[15];
        if (w <= 0.01) { worst = 9; break; }
        worst = Math.max(worst, Math.abs(x / w), Math.abs(y / w));
      }
      if (worst <= 0.86) { best = d; break; }
    }
    state.dist = best;
  }

  /* ---------- 绘制 ---------- */

  var VP = new Float32Array(16);
  var dirty = true;

  function requestRender() { dirty = true; }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || host.clientWidth;
    var h = canvas.clientHeight || Math.round(w * 0.72);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    requestRender();
  }

  function cameraEye() {
    var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    return [state.dist * cp * Math.sin(state.yaw), state.dist * sp, state.dist * cp * Math.cos(state.yaw)];
  }

  function draw() {
    dirty = false;
    var aspect = canvas.width / Math.max(1, canvas.height);
    var eye = cameraEye();
    var near = Math.max(0.05, state.dist - 1.35);
    var proj = perspective(30 * Math.PI / 180, aspect, near, state.dist + 2.4);
    var view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    VP = mul4(proj, view);

    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    if (state.cull) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else { gl.disable(gl.CULL_FACE); }

    // 实体
    var b = buffers.primary;
    if (b && b.count) {
      gl.useProgram(solidProg);
      gl.uniformMatrix4fv(solidLoc.vp, false, VP);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
      gl.enableVertexAttribArray(solidLoc.pos);
      gl.vertexAttribPointer(solidLoc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor);
      gl.enableVertexAttribArray(solidLoc.nor);
      gl.vertexAttribPointer(solidLoc.nor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.col);
      gl.enableVertexAttribArray(solidLoc.col);
      gl.vertexAttribPointer(solidLoc.col, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(solidLoc.pos);
      gl.disableVertexAttribArray(solidLoc.nor);
      gl.disableVertexAttribArray(solidLoc.col);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawLines('grid');
    drawLines('axes');
    gl.disable(gl.BLEND);

    updateLabels(proj, view);
    if (state.auto) requestRender();
  }

  function drawLines(key) {
    var b = buffers[key];
    if (!b || !b.count || !b.pos) return;
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(lineLoc.vp, false, VP);
    gl.uniform1f(lineLoc.bias, key === 'grid' ? 0.0009 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
    gl.enableVertexAttribArray(lineLoc.pos);
    gl.vertexAttribPointer(lineLoc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttrib4fv(lineLoc.col, b.color);
    gl.disableVertexAttribArray(lineLoc.col);
    gl.drawArrays(gl.LINES, 0, b.count);
    gl.disableVertexAttribArray(lineLoc.pos);
  }

  function project(p, w0, h0) {
    var x = p[0], y = p[1], z = p[2];
    var cx = VP[0] * x + VP[4] * y + VP[8] * z + VP[12];
    var cy = VP[1] * x + VP[5] * y + VP[9] * z + VP[13];
    var cw = VP[3] * x + VP[7] * y + VP[11] * z + VP[15];
    if (cw <= 0.001) return null;
    return [(cx / cw * 0.5 + 0.5) * w0, (0.5 - cy / cw * 0.5) * h0];
  }

  function updateLabels() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    state.labels.forEach(function (l, i) {
      var el = labelEls[i];
      if (!el) return;
      var s = project(l.p, w, h);
      if (!s) { el.style.opacity = '0'; return; }
      el.style.opacity = '1';
      el.style.left = (s[0] + (l.dx || 0)).toFixed(1) + 'px';
      el.style.top = (s[1] + (l.dy || 0)).toFixed(1) + 'px';
    });
  }

  function frameLoop() {
    if (state.auto) {
      state.yaw += 0.0035;
      dirty = true;
    }
    if (dirty) draw();
    requestAnimationFrame(frameLoop);
  }

  /* ---------- 交互 ---------- */

  var pointers = new Map();
  var pinchStart = 0, pinchDist = 0;

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      var it = Array.from(pointers.values());
      pinchStart = Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y);
      pinchDist = state.dist;
    }
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', function (e) {
    var prev = pointers.get(e.pointerId);
    if (!prev) return;
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;
    if (pointers.size >= 2) {
      var it = Array.from(pointers.values());
      var d = Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y);
      if (pinchStart > 0) {
        state.dist = Math.min(12, Math.max(1.5, pinchDist * pinchStart / Math.max(1, d)));
        requestRender();
      }
      return;
    }
    state.yaw -= dx * 0.009;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch + dy * 0.009));
    requestRender();
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) canvas.classList.remove('is-dragging');
    pinchStart = 0;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    state.dist = Math.min(8, Math.max(1.5, state.dist * Math.exp(e.deltaY * 0.0012)));
    requestRender();
  }, { passive: false });

  canvas.addEventListener('dblclick', function () { resetView(); });

  function resetView() {
    state.yaw = 0.72;
    state.pitch = 0.34;
    state.dist = 4.2;
    requestRender();
  }

  /* ---------- 控件 ---------- */

  function bind(id, ev, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
    return el;
  }

  var primarySel = bind('vol-space', 'change', function (e) {
    state.primary = e.target.value;
    rebuild();
  });

  bind('vol-coord', 'change', function (e) {
    state.coord = e.target.value;
    updateCondVisibility();
    rebuild();
  });

  bind('vol-vt', 'change', function (e) {
    state.vt = e.target.value;
    rebuild();
  });

  bind('vol-norm', 'change', function (e) {
    state.norm = e.target.checked;
    rebuild();
  });

  bind('vol-lum', 'change', function (e) {
    LUM = parseFloat(e.target.value) || 100;
    rebuild();
  });

  bind('vol-surround', 'change', function (e) {
    COND.surround = e.target.value;
    rebuild();
  });

  bind('vol-bg', 'change', function (e) {
    COND.bg = parseFloat(e.target.value) || 0.2;
    rebuild();
  });

  bind('vol-la', 'change', function (e) {
    COND.laFactor = parseFloat(e.target.value) || 0.2;
    rebuild();
  });

  var condBox = document.querySelector('[data-vol-cond]');
  function updateCondVisibility() {
    if (condBox) condBox.hidden = state.coord !== 'cam02';
    // 白点亮度只对建立在绝对亮度上的坐标有意义
    var vtBox = document.querySelector('[data-vol-vt]');
    if (vtBox) vtBox.hidden = !(state.coord === 'xyz' || state.coord === 'xyy');
    var lumBox = document.querySelector('[data-vol-lum]');
    if (lumBox) {
      var abs = state.coord === 'ictcp' || state.coord === 'jzazbz' || state.coord === 'cam02';
      lumBox.hidden = !abs;
    }
  }

  bind('vol-neutral', 'change', function (e) {
    state.neutral = e.target.checked;
    rebuild();
  });

  bind('vol-grid', 'change', function (e) {
    state.grid = e.target.checked;
    rebuild();
  });

  bind('vol-auto', 'change', function (e) {
    state.auto = e.target.checked;
    requestRender();
  });

  bind('vol-reset', 'click', function (e) { e.preventDefault(); resetView(); });

  window.addEventListener('resize', resize);

  /* ---------- 启动 ---------- */

  // 默认值来自页面
  if (primarySel) { primarySel.value = state.primary; }

  updateCondVisibility();

  try {
    resize();
    rebuild();
    frameLoop();
  } catch (err) {
    if (fallback) {
      fallback.hidden = false;
      fallback.textContent = (UI.error || 'WebGL 初始化失败') + '：' + (err && err.message ? err.message : err);
    }
    throw err;
  }
})(typeof window !== 'undefined' ? window : globalThis);
