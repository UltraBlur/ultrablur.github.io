/*
 * 三维色体积预览（试验）
 * 本文件只管页面控制与 WebGL 渲染；坐标映射与网格在 colour-volume-geom.js 里，
 * 是纯函数，可以被 node 直接 require 做封闭性自检（tests/volume-geometry.test.mjs）。
 */
(function (root) {
  'use strict';

  var host = document.querySelector('[data-volume]');
  if (!host) return;

  var cfgEl = document.getElementById('volume-data');
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  var UI = cfg.ui || {};

  var geom = root.ColourVolumeGeom;
  var MODELS = root.ColourModels || {};
  var JMH = root.AcesJMh || null;   // ACES 2.0 的 Hellwig JMh 内核（lib/aces-jmh.js）
  if (!geom) {
    var noGeom = host.querySelector('.c-vol-fallback');
    if (noGeom) { noGeom.hidden = false; noGeom.textContent = UI.error || 'WebGL 初始化失败'; }
    return;
  }

  /* 参考白亮度（cd/m²），只有 HDR / 色貌模型用得到 */
  var LUM = 100;

  /* 观察条件（只影响 CAM02-UCS）：环绕、背景、适应亮度都按参考白的比例给 */
  var COND = { surround: 'average', bg: 0.2, laFactor: 0.2 };

  var spaces = (cfg.spaces || []).map(function (entry) { return geom.makeSpace(entry, cfg.srgbMatrix, JMH); });

  /* Pointer's Gamut 不是 RGB 立方体：它的采样是 LCh（照明体 C），
     由 geom 直接搭成环状网格，放进同一个空间列表里一起用。 */
  var pointerSpace = null;
  if (cfg.pointer && cfg.pointer.lch && cfg.pointer.lch.length) {
    try {
      pointerSpace = geom.makePointerSpace(cfg.pointer, cfg.srgbMatrix, JMH);
      if (pointerSpace.rings.length >= 3) spaces.push(pointerSpace);
      else pointerSpace = null;
    } catch (e) { pointerSpace = null; }
  }
  var spaceBySlug = {};
  spaces.forEach(function (s) { spaceBySlug[s.slug] = s; });

  /* 一次重建共用一套转换上下文，避免逐点构造对象 */
  function viewOpts() {
    return {
      models: MODELS,
      lum: LUM,
      cond: COND,
      ext: root.ColourVolumeCoords,
      jmh: JMH,
      neutral: state.neutral
    };
  }


  /* ---------- 坐标轴家具 ---------- */

  /* 刻度步长与标签格式化在 geom 模块里（纯函数，tests/ 可直接测） */
  var niceStep = geom.niceStep;
  var sharedStep = geom.sharedStep;
  var fmtTick = geom.fmtTick;

  var AXIS_NAMES = {
    lab: ['a*', 'L*', 'b*'],
    luv: ['u*', 'L*', 'v*'],
    oklab: ['a', 'L', 'b'],
    xyz: ['X', 'Y', 'Z'],
    xyy: ['x', 'Y', 'y'],
    ictcp: ['Ct', 'I', 'Cp'],
    jzazbz: ['az', 'Jz', 'bz'],
    cam02: ["a'", "J'", "b'"],
    cam16: ["a'", "J'", "b'"],
    zcam: ['az', 'Jz', 'bz'],
    jmh: ['a', 'J', 'b']
  };
  if (root.ColourVolumeAxisNames) {
    for (var extName in root.ColourVolumeAxisNames) {
      if (Object.prototype.hasOwnProperty.call(root.ColourVolumeAxisNames, extName)) {
        AXIS_NAMES[extName] = root.ColourVolumeAxisNames[extName];
      }
    }
  }

  /* 坐标轴摆在数据包围盒的底边，刻度朝外，返回线与标签 */
  function buildAxes(coord, bbox, norm) {
    var pad = 0.10;
    var lo = [], hi = [];
    for (var k = 0; k < 3; k++) {
      var span = (bbox[1][k] - bbox[0][k]) || 1;
      lo.push(bbox[0][k] - span * pad);
      hi.push(bbox[1][k] + span * pad);
    }
    // 归一化开启时竖直轴固定 0–1
    if (norm) { lo[1] = 0; hi[1] = 1; }
    else lo[1] = Math.min(0, lo[1]);
    var names = AXIS_NAMES[coord] || AXIS_NAMES.xyz;
    var tick = 0.022 * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    var pos = [], labels = [];
    function seg(a, b) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    // 地面网格（y = 0，即 L*=0 / Y=0 平面）
    var gx0 = bbox[0][0], gx1 = bbox[1][0], gz0 = bbox[0][2], gz1 = bbox[1][2];
    var stepAll = sharedStep(lo, hi);
    var gstep = stepAll || niceStep(Math.max(gx1 - gx0, gz1 - gz0));
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

      var step = stepAll || niceStep(ax.to - ax.from);
      var lastLabel = null;
      for (var v = Math.ceil(ax.from / step) * step; v <= ax.to + 1e-9; v += step) {
        var base = ax.at.slice(); base[ax.i] = v;
        var tip = base.slice();
        tip[ax.tickAxis] -= tick;
        seg(base, tip);
        var txt = fmtTick(v, step);
        if (txt !== lastLabel) labels.push({ t: txt, p: tip, cls: 'is-axis', dx: ax.dx, dy: ax.dy });
        lastLabel = txt;
      }

      var nameP = ax.at.slice();
      nameP[ax.i] = ax.to + (ax.to - ax.from) * 0.04;
      labels.push({ t: names[idx], p: nameP, cls: 'is-axis-name', dx: ax.dx * 2.2, dy: ax.dy * 1.5 });
    });

    return { pos: new Float32Array(pos), labels: labels, lo: lo, hi: hi, tick: tick, step: stepAll || 0 };
  }

  /* ---------- 4×4 矩阵（实现在 geometry 模块里，便于自检） ---------- */

  var perspective = geom.perspective;
  var ortho = geom.ortho;
  var lookAt = geom.lookAt;
  var mul4 = geom.mul4;
  var ORTHO_EYE = geom.ORTHO_EYE;

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

  var HALF_PI = Math.PI / 2;

  var state = {
    primary: cfg.defaultPrimary || spaces[0].slug,
    coord: 'lab',
    neutral: false,
    grid: true,
    norm: true,

    cull: false,
    proj: 'persp',     // 'persp' 透视 | 'ortho' 正交
    flip: false,       // 平面视图：屏幕 y 翻转，让色度 y 朝上（与课本 xy 图一致）
    yaw: 0.72,
    pitch: 0.34,
    dist: 4.2,         // 透视相机半径（正交下不用）
    zoom: 1,           // 用户缩放倍率，两种投影共用
    fitDist: 4.2,      // 当前朝向下「刚好装下」的透视距离
    fitHalfH: 1,       // 当前朝向下「刚好装下」的正交半高
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
    var opts = viewOpts();

    var mesh = primary.custom ? geom.buildCustom(primary, coord, opts)
                             : geom.buildSurface(primary, coord, N, opts);

    // 竖直轴统一到「参考白 = 1」：各坐标量纲不同，归一化后才能横向比较
    var whiteP = primary.custom
      ? geom.pointForXyz(primary, coord, primary.white, opts)
      : geom.pointFor(primary, coord, [1, 1, 1], opts);
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

    var axes = buildAxes(coord, mesh.bbox, state.norm);
    var frame = computeFrame([mesh, { pos: axes.pos }]);

    applyFrame(mesh.pos, frame);
    applyFrame(axes.pos, frame);

    uploadSolid('primary', mesh);

    if (state.grid) {
      var grid = primary.custom
        ? geom.buildCustomGrid(primary, coord, 4, 3, opts)
        : geom.buildGrid(primary, coord, N, Math.max(2, Math.round(N / 6)), opts);
      if (sy !== 1) for (var gk = 0; gk < grid.pos.length; gk++) grid.pos[gk] *= sy;
      applyFrame(grid.pos, frame);
      uploadLines('grid', grid.pos, [0.16, 0.16, 0.18, 0.30]);
    } else if (buffers.grid) {
      buffers.grid.count = 0;
    }

    uploadLines('axes', axes.pos, [0.45, 0.45, 0.48, 1]);
    state.axesPos = axes.pos;

    /* xyY：把 CIE 1931 光谱轨迹画在 Y = 0 的地面上。
       马蹄形是「所有单色光」的边界，不在 RGB 立方体里，只能另画。 */
    var locus = root.CIE1931_LOCUS;
    if (coord === 'xyy' && locus && locus.length > 2) {
      var lp = [];
      /* 与色体一起做 sy 归一化（xyY 下 sy = 1），落到 Y = 0 平面 */
      function addPt(q) { lp.push(q[0] * sy, 0, q[1] * sy); }
      for (var li = 1; li < locus.length; li++) {
        addPt(locus[li - 1]); addPt(locus[li]);
      }
      addPt(locus[locus.length - 1]); addPt(locus[0]);   // 紫边
      var framed = [];
      for (var fi = 0; fi < lp.length; fi += 3) {
        framed.push(
          (lp[fi] - frame.center[0]) * frame.scale,
          (lp[fi + 1] - frame.center[1]) * frame.scale,
          (lp[fi + 2] - frame.center[2]) * frame.scale
        );
      }
      uploadLines('locus', new Float32Array(framed), [0.30, 0.30, 0.34, 1]);
      state.locusPos = new Float32Array(framed);
    } else if (buffers.locus) {
      buffers.locus.count = 0;
      state.locusPos = null;
    }

    var anchors = axes.labels.slice();
    if (!primary.custom) {
      [['W', [1, 1, 1]], ['K', [0, 0, 0]], ['R', [1, 0, 0]], ['G', [0, 1, 0]], ['B', [0, 0, 1]]].forEach(function (v) {
        var p = geom.pointFor(primary, coord, v[1], opts);
        if (p) anchors.push({ t: v[0], p: sy === 1 ? p : [p[0] * sy, p[1] * sy, p[2] * sy], cls: 'is-vertex' });
      });
    }

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
        if (o.dist !== undefined) state.zoom = Math.min(3, Math.max(0.4, state.fitDist / o.dist));
        if (o.proj !== undefined) { state.proj = o.proj; fitCamera(); }
        if (o.coord !== undefined) { state.coord = o.coord; rebuild(); return; }
        requestRender();
      };
      window.__volState = function () {
        return {
          proj: state.proj, yaw: state.yaw, pitch: state.pitch,
          dist: state.dist, zoom: state.zoom,
          fitDist: state.fitDist, fitHalfH: state.fitHalfH,
          missing: state.mesh ? state.mesh.missing : null,
          repaired: state.mesh ? state.mesh.repaired : null
        };
      };
      window.__volAxes = axes;
      window.__vol = {
        coord: coord,
        proj: state.proj,
        camera: {
          yaw: state.yaw,
          pitch: state.pitch,
          dist: state.dist,
          zoom: state.zoom,
          fitDist: state.fitDist,
          fitHalfH: state.fitHalfH
        },
        bbox: [bb, bb2],
        frame: frame,
        missing: mesh.missing,
        repaired: mesh.repaired,
        sample: {
          W: geom.pointFor(primary, coord, [1, 1, 1], opts),
          K: geom.pointFor(primary, coord, [0, 0, 0], opts),
          R: geom.pointFor(primary, coord, [1, 0, 0], opts),
          G: geom.pointFor(primary, coord, [0, 1, 0], opts)
        }
      };
    }
    requestRender();
  }


  /* 在当前朝向下，把包围盒投影塞进画布的 86%：
     透视求最小距离，正交求最小半高。两份都存下来，切换投影时不必重算。 */
  function fitCamera() {
    if (!state.mesh) return;
    var pos = state.mesh.pos;
    var bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    /* 取景要连坐标轴一起算：轴家具比色体大 10%，只按色体取景时
       俯视/贴边的视角会把刻度和轴名裁到画布外。 */
    var all = [pos, state.axesPos || new Float32Array(0), state.locusPos || new Float32Array(0)];
    for (var ai = 0; ai < all.length; ai++) {
      var arr = all[ai];
      for (var i = 0; i < arr.length; i += 3) {
        for (var k = 0; k < 3; k++) {
          if (arr[i + k] < bb[0][k]) bb[0][k] = arr[i + k];
          if (arr[i + k] > bb[1][k]) bb[1][k] = arr[i + k];
        }
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
    var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    var dir = [cp * Math.sin(state.yaw), sp, cp * Math.cos(state.yaw)];

    var best = 12;
    for (var d = 1.4; d <= 12; d += 0.05) {
      var eye = [dir[0] * d, dir[1] * d, dir[2] * d];
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
    state.fitDist = best;

    // 正交：角点转到视空间后，取横向/纵向需要的最大半高
    var rot = lookAt([dir[0] * 10, dir[1] * 10, dir[2] * 10], [0, 0, 0], [0, 1, 0]);
    var need = 1e-3;
    for (var ci2 = 0; ci2 < corners.length; ci2++) {
      var p1 = corners[ci2];
      var vx = rot[0] * p1[0] + rot[4] * p1[1] + rot[8] * p1[2];
      var vy = rot[1] * p1[0] + rot[5] * p1[1] + rot[9] * p1[2];
      need = Math.max(need, Math.abs(vy), Math.abs(vx) / aspect);
    }
    state.fitHalfH = need / 0.86;

    state.dist = state.fitDist / state.zoom;
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
    // 画幅比例变了，取景也跟着变；zoom 保留，用户的缩放不会被重置
    fitCamera();
    requestRender();
  }

  /* 透视相机离中心不能太近：色体被 frame 归一化到半径约 1，
     距离小于 1 时近平面会把它切开（看起来又像破面）。所以缩放到头就停住。 */
  function cameraDistance() {
    if (state.proj === 'ortho') return ORTHO_EYE;
    return Math.max(1.3, state.dist);
  }

  function cameraEye() {
    var d = cameraDistance();
    var cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    return [d * cp * Math.sin(state.yaw), d * sp, d * cp * Math.cos(state.yaw)];
  }

  function draw() {
    dirty = false;
    var aspect = canvas.width / Math.max(1, canvas.height);
    var eye = cameraEye();
    var proj;
    if (state.proj === 'ortho') {
      proj = ortho(state.fitHalfH / state.zoom, aspect, 0.05, 2 * ORTHO_EYE);
    } else {
      var d = cameraDistance();
      var near = Math.max(0.05, d - 1.35);
      proj = perspective(30 * Math.PI / 180, aspect, near, d + 2.4);
    }
    var view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    VP = mul4(proj, view);
    /* 从正上方看右手坐标系的平面时，色度 y 只能朝屏幕下方——
       这与课本 xy 图（y 朝上）正好上下镜像。平面视图里把屏幕 y 翻一次，
       读数方向就和课本一致；旋转视角时自动关掉。 */
    if (state.flip) {
      VP[1] = -VP[1]; VP[5] = -VP[5]; VP[9] = -VP[9]; VP[13] = -VP[13];
    }

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
    drawLines('locus');
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
    gl.uniform1f(lineLoc.bias, (key === 'grid' || key === 'locus') ? 0.0009 : 0);
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
      pinchDist = state.zoom;
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
        // 两指张开 = 放大：zoom 变大，透视距离与正交半高同步变小
        state.zoom = clampZoom(pinchDist * Math.max(1, d) / pinchStart);
        requestRender();
      }
      return;
    }
    state.yaw -= dx * 0.009;
    state.pitch = Math.max(-HALF_PI, Math.min(HALF_PI, state.pitch + dy * 0.009));
    state.flip = false;
    requestRender();
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) canvas.classList.remove('is-dragging');
    pinchStart = 0;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function clampZoom(z) { return Math.min(3, Math.max(0.4, z)); }
  function updateZoom() {
    state.dist = state.fitDist / state.zoom;
    requestRender();
  }

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    state.zoom = clampZoom(state.zoom * Math.exp(-e.deltaY * 0.0012));
    updateZoom();
  }, { passive: false });

  canvas.addEventListener('dblclick', function () { resetView(); });

  /* 正俯视：pitch 到 90°，yaw 归零，按当前朝向重新取景。
     xyY 这类「高度场」只有真正的正上方才看得清。 */
  function topView() {
    state.yaw = 0;
    state.pitch = HALF_PI;
    state.zoom = 1;
    state.flip = true;
    fitCamera();
    requestRender();
  }

  function resetView() {
    state.yaw = 0.72;
    state.pitch = 0.34;
    state.zoom = 1;
    state.flip = false;
    fitCamera();
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

  bind('vol-norm', 'change', function (e) {
    state.norm = e.target.checked;
    rebuild();
  });

  bind('vol-proj', 'change', function (e) {
    state.proj = e.target.value === 'ortho' ? 'ortho' : 'persp';
    // 两种投影的取景基准不同，切过去先按当前朝向重新取景
    fitCamera();
    requestRender();
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
    var camLike = state.coord === 'cam02' || state.coord === 'cam16' || state.coord === 'zcam';
    if (condBox) condBox.hidden = !camLike;
    // 白点亮度只对建立在绝对亮度上的坐标有意义
    var lumBox = document.querySelector('[data-vol-lum]');
    if (lumBox) {
      lumBox.hidden = !(camLike || state.coord === 'ictcp' || state.coord === 'jzazbz');
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
  bind('vol-top', 'click', function (e) { e.preventDefault(); topView(); });

  window.addEventListener('resize', resize);

  /* ---------- 启动 ---------- */

  // 默认值来自页面
  if (primarySel) { primarySel.value = state.primary; }

  // 浏览器刷新时可能恢复上次选的下拉值，以页面为准
  var coordSel = document.getElementById('vol-coord');
  if (coordSel && coordSel.value) state.coord = coordSel.value;
  var projSel = document.getElementById('vol-proj');
  if (projSel) state.proj = projSel.value === 'ortho' ? 'ortho' : 'persp';

  // 没加载到 JMh 内核时把这一项从下拉里摘掉，别让用户选到一个空体积
  if (!JMH) {
    var jmhOpt = coordSel && coordSel.querySelector('option[value="jmh"]');
    if (jmhOpt) jmhOpt.parentNode.removeChild(jmhOpt);
    if (state.coord === 'jmh') {
      state.coord = 'lab';
      if (coordSel) coordSel.value = 'lab';
    }
  }

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
