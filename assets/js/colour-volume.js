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

  /* Pointer's Gamut 不是一个色彩空间：它是 Pointer (1980) 的真实表面色边界，
     只作为「叠加层」画在当前色彩空间上面（见 rebuild 里的 overlay）。 */
  var pointerSpace = null;
  if (cfg.pointer && cfg.pointer.lch && cfg.pointer.lch.length) {
    try {
      pointerSpace = geom.makePointerSpace(cfg.pointer, cfg.srgbMatrix, JMH);
      if (!(pointerSpace.rings.length >= 3)) pointerSpace = null;
    } catch (e) { pointerSpace = null; }
  }
  var MUNSELL = cfg.munsell || null;
  var LOCUS3D = cfg.locus || null;

  /* 自定义多基色：不走 data/ 里的空间清单，由用户输入原色实时构造 */
  var CUSTOM_SLUG = 'custom-multi';
  var pageLang = (document.querySelector('.c-page') || {}).getAttribute
    ? document.querySelector('.c-page').getAttribute('data-lang') : 'zh';
  function T(zh, en) { return pageLang === 'en' ? en : zh; }
  var DEFAULT_CUSTOM = {
    primaries: [[0.708, 0.292], [0.170, 0.797], [0.131, 0.046], [0.068, 0.351]],
    white: [0.3127, 0.329],
    weights: null
  };
  var customSpace = null;

  var spaceBySlug = {};
  spaces.forEach(function (s) { spaceBySlug[s.slug] = s; });

  /* 光谱轨迹 / Munsell / Pointer 都是「观察者侧」的数据，不属于当前显示空间：
     统一用固定参考空间换算，换色彩空间时它们不会跟着白点漂移。 */
  var locusRef = spaceBySlug['primaries-srgb-rec709'] || spaces[0];

  /* 一次重建共用一套转换上下文，避免逐点构造对象 */
  function viewOpts() {
    return {
      models: MODELS,
      lum: LUM,
      cond: COND,
      ext: root.ColourVolumeCoords,
      jmh: JMH
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
    ipt: ['P', 'I', 'T'],
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

  /* 包围盒向外留 10%（纵轴压到 0 以下），坐标轴与取景用同一套边界 */
  function padBox(minIn, maxIn) {
    var lo = [], hi = [];
    for (var k = 0; k < 3; k++) {
      var span = (maxIn[k] - minIn[k]) || 1;
      lo.push(minIn[k] - span * 0.10);
      hi.push(maxIn[k] + span * 0.10);
    }
    lo[1] = Math.min(0, lo[1]);
    return { lo: lo, hi: hi };
  }

  /* 坐标轴摆在数据包围盒的底边，刻度朝外，返回线与标签 */
  function buildAxes(coord, bbox) {
    var padded = padBox(bbox[0], bbox[1]);
    var lo = padded.lo, hi = padded.hi;
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
    grid: true,
    /* 叠加层：都画在当前色彩空间之上，彼此独立 */
    layers: { pointer: false, munsell: false, locus: true },
    ref: '',          // 参考色域（另一个空间的 slug；'' = 无）
    points: false,    // Pointer 的 576 个实测点（默认关，太密）

    cull: false,
    proj: 'ortho',     // 'persp' 透视 | 'ortho' 正交（默认正交：色体量级比较不吃透视缩放）
    flip: false,       // 平面视图：屏幕 y 翻转，让色度 y 朝上（与课本 xy 图一致）
    yaw: 0.72,
    pitch: 0.34,
    dist: 4.2,         // 透视相机半径（正交下不用）
    zoom: 1,           // 用户缩放倍率，两种投影共用
    fitDist: 4.2,      // 当前朝向下「刚好装下」的透视距离
    fitHalfH: 1,       // 当前朝向下「刚好装下」的正交半高
    auto: false,
    bounds: null,
    labels: [],
    /* 取景是否被超大色体撑开过（撑开过就允许下一次重建收回） */
    fitGrown: false
  };

  var LAYER_KEYS = ['pointer', 'munsell', 'locus'];

  /* 用「原色 + 白点（+ 权重）」造一个多基色空间对象。
     权重缺省时若有固定项，先按固定项把其余基色的 Y 解出来——URL 回填走的是这条路，
     否则固定状态在刷新后会退回最小范数解。 */
  function buildCustomSpace(data) {
    if (!data || !data.primaries || data.primaries.length < 3) return null;
    var white = data.white || [0.3127, 0.329];
    var weights = data.weights && data.weights.length === data.primaries.length ? data.weights : null;
    if (!weights && data.pin && data.pin.index >= 0 && data.pin.index < data.primaries.length) {
      weights = geom.solvePinned(data.primaries, white, data.pin.index, data.pin.value) || null;
    }
    try {
      return geom.makeMultiSpace({
        slug: CUSTOM_SLUG,
        title: '自定义多基色',
        primaries: data.primaries,
        white: white,
        weights: weights
      }, cfg.srgbMatrix, JMH);
    } catch (e) { return null; }
  }

  function parseNumbers(text, need) {
    var out = String(text || '').split(/[\s,]+/).filter(function (v) { return v !== ''; }).map(Number);
    out = out.filter(function (v) { return isFinite(v); });
    return need && out.length < need ? null : out;
  }

  function enabledLayers() {
    return LAYER_KEYS.filter(function (k) { return !!state.layers[k]; });
  }

  function setLayers(list) {
    var want = list || [];
    LAYER_KEYS.forEach(function (k) {
      state.layers[k] = want.indexOf(k) >= 0;
      var el = document.getElementById('vol-ov-' + k);
      if (el) el.checked = state.layers[k];
    });
  }

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
    'uniform float uPointSize; varying vec4 vCol; void main(){ vCol = vec4(aCol, 1.0);' +
    'gl_PointSize = uPointSize;' +
    'gl_Position = uVP * vec4(aPos, 1.0); gl_Position.z -= uBias * gl_Position.w; }',
    'precision mediump float; varying vec4 vCol; uniform float uRound;' +
    'void main(){ if (uRound > 0.5) {' +
    'vec2 d = gl_PointCoord - vec2(0.5); if (dot(d, d) > 0.25) discard; }' +
    'gl_FragColor = vCol; }'
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
    bias: gl.getUniformLocation(lineProg, 'uBias'),
    pointSize: gl.getUniformLocation(lineProg, 'uPointSize'),
    round: gl.getUniformLocation(lineProg, 'uRound')
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

  /* 该坐标系的「参考范围」：所有内置色彩空间的包围盒。坐标轴、刻度和取景变换
     都以它为准，与当前选中哪个空间无关，所以换空间时画面不重排、刻度也不跳。
     只统计内置空间：自定义多基色是用户随时在改的，放进来会让所有空间跟着它缩放；
     它自己超出时由 extendFit 把取景撑开即可。 */
  function referenceRange(coord) {
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    var o = viewOpts();
    for (var s = 0; s < spaces.length; s++) {
      var m;
      try {
        m = spaces[s].multi
          ? geom.buildMultiSurface(spaces[s], coord, 6, o)
          : geom.buildSurface(spaces[s], coord, 6, o);
      } catch (e) { m = null; }
      if (!m || !m.pos || !m.pos.length) continue;
      var pos = m.pos;
      for (var i = 0; i < pos.length; i += 3) {
        for (var k = 0; k < 3; k++) {
          if (pos[i + k] < min[k]) min[k] = pos[i + k];
          if (pos[i + k] > max[k]) max[k] = pos[i + k];
        }
      }
    }
    if (!isFinite(min[0])) return { min: [-1, -1, -1], max: [1, 1, 1] };
    return { min: min, max: max };
  }

  /* 由参考范围定中心与尺度：中心取范围中心，尺度取半对角线 */
  function frameFromBox(box) {
    var min = box.min, max = box.max;
    var center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    var radius = 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    return { center: center, scale: 1 / radius };
  }

  /* 当前色体超出参考范围时把取景框撑到装得下（只影响相机，不改刻度） */
  function extendFit(pos) {
    if (!state.fitLo) return;
    for (var i = 0; i < pos.length; i += 3) {
      for (var k = 0; k < 3; k++) {
        if (pos[i + k] < state.fitLo[k]) state.fitLo[k] = pos[i + k];
        if (pos[i + k] > state.fitHi[k]) state.fitHi[k] = pos[i + k];
      }
    }
  }

  function extendFitBox(box) {
    if (!state.fitLo || !box) return;
    for (var k = 0; k < 3; k++) {
      if (box.min[k] < state.fitLo[k]) state.fitLo[k] = box.min[k];
      if (box.max[k] > state.fitHi[k]) state.fitHi[k] = box.max[k];
    }
  }

  /* 叠加层（光谱轨迹 / Munsell / Pointer）的包围盒。取景框**始终**把它们算进去，
     与复选框开关无关——否则勾一下「光谱轨迹」画面就缩一圈。
     按「坐标 + 亮度 + 观察条件 + 主空间」缓存：这些量不换，盒子就不变。 */
  var overlayBoxes = {};
  function overlayExtent(coord) {
    var key = [coord, LUM, COND.surround, COND.bg, COND.laFactor].join('|');
    if (overlayBoxes[key]) return overlayBoxes[key];
    var o = viewOpts();
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    function add(q) {
      for (var k = 0; k < 3; k++) {
        if (q[k] < min[k]) min[k] = q[k];
        if (q[k] > max[k]) max[k] = q[k];
      }
    }
    var i, q;
    if (MUNSELL && MUNSELL.points && pointerSpace) {
      for (i = 0; i < MUNSELL.points.length; i++) {
        var row = MUNSELL.points[i];
        var mx = row[0], my = row[1], mY = row[2] / 100;
        if (!(my > 1e-4) || !(mY > 0)) continue;
        q = geom.pointForXyz(pointerSpace, coord, [mx * mY / my, mY, (1 - mx - my) * mY / my], o);
        if (q && isFinite(q[0]) && isFinite(q[1]) && isFinite(q[2])) add(q);
      }
    }
    if (LOCUS3D && LOCUS3D.points && LOCUS3D.points.length > 2) {
      for (i = 0; i < LOCUS3D.points.length; i++) {
        var lr = LOCUS3D.points[i];
        var lx = lr[0], ly = lr[1], lY = lr[2];
        if (!(ly > 1e-4) || !(lY > 0)) continue;
        q = geom.pointForXyz(locusRef, coord, [lx * lY / ly, lY, (1 - lx - ly) * lY / ly], o);
        if (q && isFinite(q[0]) && isFinite(q[1]) && isFinite(q[2])) add(q);
      }
    }
    if (pointerSpace) {
      var cage = geom.buildCustomGrid(pointerSpace, coord, pointerSpace.ringStep || 4, 6, o);
      var cp = cage.pos;
      for (i = 0; i < cp.length; i += 3) {
        if (isFinite(cp[i]) && isFinite(cp[i + 1]) && isFinite(cp[i + 2])) {
          add([cp[i], cp[i + 1], cp[i + 2]]);
        }
      }
    }
    var box = isFinite(min[0]) ? { min: min, max: max } : null;
    overlayBoxes[key] = box;
    return box;
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

  /* opts.keepView：换色彩空间时用。取景框与刻度都由坐标系定，换空间不重新取景；
     只有新色体超出参考框（自定义多基色）时才撑开并重新取景。 */
  function rebuild(opts) {
    var keepView = !!(opts && opts.keepView);
    var primary;
    if (state.primary === CUSTOM_SLUG) {
      primary = customSpace || buildCustomSpace(state.custom || DEFAULT_CUSTOM);
      customSpace = primary;
      if (primary) primary.primaries = (state.custom || DEFAULT_CUSTOM).primaries;
    } else {
      primary = spaceBySlug[state.primary];
      if (!primary) { primary = spaces[0]; state.primary = primary.slug; }
    }
    if (!primary) return;
    /* Pointer 的色体只到 L* 15–90，两端平封——叠加时把这件事说出来 */
    var ptrNote = document.querySelector('[data-vol-pointer]');
    if (ptrNote) ptrNote.hidden = !state.layers.pointer;
    var coord = state.coord;
    var N = Math.min(window.devicePixelRatio > 1.5 ? 24 : 30, 30);
    var opts = viewOpts();

    var mesh = primary.multi
      ? geom.buildMultiSurface(primary, coord, N, opts)
      : geom.buildSurface(primary, coord, N, opts);

    var bb = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (var bi2 = 0; bi2 < mesh.pos.length; bi2 += 3) {
      for (var bk2 = 0; bk2 < 3; bk2++) {
        if (mesh.pos[bi2 + bk2] < bb[0][bk2]) bb[0][bk2] = mesh.pos[bi2 + bk2];
        if (mesh.pos[bi2 + bk2] > bb[1][bk2]) bb[1][bk2] = mesh.pos[bi2 + bk2];
      }
    }
    mesh.bbox = bb;

    /* 坐标轴按「本坐标系的参考范围」（所有内置空间的并集）画，而不是当前色体的
       包围盒：换空间时刻度值、刻度位置、轴长都不变，只有色体本身变大变小 */
    var refBox = referenceRange(coord);
    var axes = buildAxes(coord, [refBox.min, refBox.max]);

    /* ---------- 叠加层 ----------
       每层先按当前坐标算出「未变换」的顶点，统一取景后再各自上传。 */
    var layerSpecs = [];
    function addLayer(key, pos, color, kind) {
      if (!pos || !pos.length) return;
      layerSpecs.push({ key: key, pos: new Float32Array(pos), color: color, kind: kind });
    }

    /* Pointer's Gamut：实测环 + 经线，3D 笼架 */
    if (state.layers.pointer && pointerSpace) {
      var cage = geom.buildCustomGrid(pointerSpace, coord, pointerSpace.ringStep || 4, 6, opts);
      addLayer('overlayPointer', cage.pos, [0.20, 0.24, 0.34, 1], 'lines');
    }

    /* Munsell 2734：3D 点云。数据是照明体 C 下的 (x, y, Y)，与 Pointer 同口径。 */
    if (state.layers.munsell && MUNSELL && MUNSELL.points && pointerSpace) {
      var mp = [];
      for (var mi = 0; mi < MUNSELL.points.length; mi++) {
        var mrow = MUNSELL.points[mi];
        var mx = mrow[0], my = mrow[1], mY = mrow[2] / 100;
        if (!(my > 1e-4) || !(mY > 0)) continue;
        var mxyz = [mx * mY / my, mY, (1 - mx - my) * mY / my];
        var mq = geom.pointForXyz(pointerSpace, coord, mxyz, opts);
        if (!mq || !isFinite(mq[0]) || !isFinite(mq[1]) || !isFinite(mq[2])) continue;
        mp.push(mq[0], mq[1], mq[2]);
      }
      addLayer('overlayMunsell', mp, [0.26, 0.26, 0.30, 0.5], 'points');
    }

    /* 光谱轨迹：每个波长带上自己的亮度 ȳ(λ)，于是从平面曲线变成三维曲线。
       俯视时 ȳ 被压掉，投影回熟悉的马蹄形。 */
    if (state.layers.locus && LOCUS3D && LOCUS3D.points && LOCUS3D.points.length > 2) {
      var lp = [], lprev = null, lfirst = null;
      for (var li = 0; li < LOCUS3D.points.length; li++) {
        var row = LOCUS3D.points[li];
        var lx = row[0], ly = row[1], lY = row[2];
        if (!(ly > 1e-4) || !(lY > 0)) { lprev = null; continue; }
        var lxyz = [lx * lY / ly, lY, (1 - lx - ly) * lY / ly];
        var q = geom.pointForXyz(locusRef, coord, lxyz, opts);
        if (!q || !isFinite(q[0]) || !isFinite(q[1]) || !isFinite(q[2])) { lprev = null; continue; }
        var cur = [q[0], q[1], q[2]];
        if (lprev) lp.push(lprev[0], lprev[1], lprev[2], cur[0], cur[1], cur[2]);
        else lfirst = cur;
        lprev = cur;
      }
      /* 紫边：红光端连回紫光端 */
      if (lfirst && lprev && lfirst !== lprev) {
        lp.push(lprev[0], lprev[1], lprev[2], lfirst[0], lfirst[1], lfirst[2]);
      }
      addLayer('overlayLocus', lp, [0.30, 0.30, 0.34, 1], 'lines');
    }

    /* 参考色域：把另一个空间画成线框，用来比体积大小（P7 vs P3 vs Rec.2020） */
    if (state.ref && state.ref !== state.primary) {
      var refSpace = state.ref === CUSTOM_SLUG
        ? (customSpace || buildCustomSpace(state.custom || DEFAULT_CUSTOM))
        : spaceBySlug[state.ref];
      if (refSpace) {
        var refGrid = refSpace.multi
          ? geom.buildMultiGrid(refSpace, coord, N, opts)
          : geom.buildGrid(refSpace, coord, Math.min(N, 20), 3, opts);
        addLayer('overlayRef', refGrid.pos, [0.86, 0.30, 0.12, 1], 'lines');
      }
    }

    /* 取景变换（中心 + 尺度）以「坐标系」为口径，不跟着选中的色彩空间走：
       直接由坐标轴的范围定，于是换空间时色体该多大就多大，刻度一个都不跳。
       否则每个色体都被拉成一样大，体积根本没法比。 */
    var frame = frameFromBox({ min: axes.lo, max: axes.hi });

    applyFrame(mesh.pos, frame);
    applyFrame(axes.pos, frame);
    /* 相机取景框 = 轴范围 ∪ 叠加层 ∪ 当前色体；叠加层或自定义色体超出轴范围时
       只把取景撑开，刻度与其它空间的大小关系不变 */
    var boxLo = [
      (axes.lo[0] - frame.center[0]) * frame.scale,
      (axes.lo[1] - frame.center[1]) * frame.scale,
      (axes.lo[2] - frame.center[2]) * frame.scale
    ];
    var boxHi = [
      (axes.hi[0] - frame.center[0]) * frame.scale,
      (axes.hi[1] - frame.center[1]) * frame.scale,
      (axes.hi[2] - frame.center[2]) * frame.scale
    ];
    state.fitLo = boxLo.slice();
    state.fitHi = boxHi.slice();
    /* 取景框固定包含三类东西，且都不看复选框状态，所以勾选/取消叠加层时画面不动：
       ① 当前色体（自定义多基色超出参考范围时才起作用）
       ② 三个叠加层的数据范围（光谱轨迹 / Munsell / Pointer），无论当前开没开
       ③ axes 范围（上面那一步已经包含） */
    /* 叠加层的盒子是原始坐标，先过一遍同一个 frame 才和 fitLo/fitHi 同量纲 */
    var obox = overlayExtent(coord);
    if (obox) {
      extendFitBox({
        min: [(obox.min[0] - frame.center[0]) * frame.scale,
              (obox.min[1] - frame.center[1]) * frame.scale,
              (obox.min[2] - frame.center[2]) * frame.scale],
        max: [(obox.max[0] - frame.center[0]) * frame.scale,
              (obox.max[1] - frame.center[1]) * frame.scale,
              (obox.max[2] - frame.center[2]) * frame.scale]
      });
    }
    /* 到这里为止的取景框与「当前是哪个色彩空间」无关，换空间时沿用即可 */
    var baseLo = state.fitLo.slice(), baseHi = state.fitHi.slice();
    extendFit(mesh.pos);
    /* 只有色体自己撑破了基准框（超大的自定义多基色）才算「需要重新取景」 */
    var grew = false;
    for (var gk = 0; gk < 3; gk++) {
      if (state.fitLo[gk] < baseLo[gk] - 1e-9 || state.fitHi[gk] > baseHi[gk] + 1e-9) grew = true;
    }
    var liveLayers = {};
    for (var lg = 0; lg < layerSpecs.length; lg++) {
      applyFrame(layerSpecs[lg].pos, frame);
      uploadLines(layerSpecs[lg].key, layerSpecs[lg].pos, layerSpecs[lg].color);
      liveLayers[layerSpecs[lg].key] = true;
    }
    /* 关掉的层要清空缓冲，否则会停在上一次的画面里 */
    ['overlayPointer', 'overlayMunsell', 'overlayLocus', 'overlayRef'].forEach(function (k) {
      if (!liveLayers[k] && buffers[k]) buffers[k].count = 0;
    });
    state.layerPos = layerSpecs.map(function (sp) { return sp.pos; });

    uploadSolid('primary', mesh);

    if (state.grid) {
      var grid = primary.multi
        ? geom.buildMultiGrid(primary, coord, N, opts)
        : geom.buildGrid(primary, coord, N, Math.max(2, Math.round(N / 6)), opts);
      applyFrame(grid.pos, frame);
      uploadLines('grid', grid.pos, [0.16, 0.16, 0.18, 0.30]);
    } else if (buffers.grid) {
      buffers.grid.count = 0;
    }

    /* 实测格点：重采样之前的 16 × 36 个边界点（只在叠加 Pointer 时出现） */
    var isPointer = !!(state.layers.pointer && pointerSpace);
    var pointsWrap = document.querySelector('[data-vol-points]');
    if (pointsWrap) pointsWrap.hidden = !isPointer;
    if (isPointer && state.points) {
      var raw = geom.dataPoints(pointerSpace);
      var dp = [];
      for (var qi = 0; qi < raw.length; qi += 3) {
        var q = geom.pointForXyz(pointerSpace, coord, [raw[qi], raw[qi + 1], raw[qi + 2]], opts);
        if (!q) continue;
        dp.push(q[0], q[1], q[2]);
      }
      var dpArr = new Float32Array(dp);
      applyFrame(dpArr, frame);
      uploadLines('points', dpArr, [0.10, 0.10, 0.12, 0.9]);
    } else if (buffers.points) {
      buffers.points.count = 0;
    }

    uploadLines('axes', axes.pos, [0.45, 0.45, 0.48, 1]);
    state.axesPos = axes.pos;

    var anchors = axes.labels.slice();
    if (!primary.multi) {
      [['W', [1, 1, 1]], ['K', [0, 0, 0]], ['R', [1, 0, 0]], ['G', [0, 1, 0]], ['B', [0, 0, 1]]].forEach(function (v) {
        var p = geom.pointFor(primary, coord, v[1], opts);
        if (p) anchors.push({ t: v[0], p: p, cls: 'is-vertex' });
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
    /* 上一次取景被撑开过（超大自定义色体）时，回到正常色体要收回去；
       正常情况下换空间一律不动相机 */
    if (!keepView || grew || state.fitGrown) fitCamera();
    state.fitGrown = grew;
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
        ref: state.ref,
        layers: layerSpecs.map(function (sp) { return { key: sp.key, verts: sp.pos.length / 3 }; }),
        missing: mesh.missing,
        repaired: mesh.repaired,
        /* 多基色没有 3 通道 RGB→XYZ，pointFor 不适用 */
        sample: primary.multi ? null : {
          W: geom.pointFor(primary, coord, [1, 1, 1], opts),
          K: geom.pointFor(primary, coord, [0, 0, 0], opts),
          R: geom.pointFor(primary, coord, [1, 0, 0], opts),
          G: geom.pointFor(primary, coord, [0, 1, 0], opts)
        }
      };
    }
    requestRender();
  }


  /* 在当前朝向下，把取景框投影塞进画布的 86%：
     透视求最小距离，正交求最小半高。两份都存下来，切换投影时不必重算。
     取景框是 rebuild 里算好的 state.fitLo/fitHi（坐标系参考范围 ∪ 当前色体），
     所以同一坐标下换色彩空间不会重新取景。 */
  function fitCamera() {
    if (!state.fitLo || !state.mesh) return;
    var bb = [state.fitLo.slice(), state.fitHi.slice()];
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

    // 正交：角点转到视空间后，取横向/纵向需要的最大半高
    var rot = lookAt([dir[0] * 10, dir[1] * 10, dir[2] * 10], [0, 0, 0], [0, 1, 0]);
    var need = 1e-3;
    for (var ci2 = 0; ci2 < corners.length; ci2++) {
      var p1 = corners[ci2];
      var vx = rot[0] * p1[0] + rot[4] * p1[1] + rot[8] * p1[2];
      var vy = rot[1] * p1[0] + rot[5] * p1[1] + rot[9] * p1[2];
      need = Math.max(need, Math.abs(vy), Math.abs(vx) / aspect);
    }
    state.fitDist = best;
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
    /* 参考层全部压在实体之上：这些层是「顺手打开来对表」的，
       被色体挡住就没法对照了（光谱轨迹在三角形里的那一段尤其明显） */
    gl.disable(gl.DEPTH_TEST);
    drawLines('overlayRef');
    drawLines('overlayLocus');
    drawLines('overlayMacadam');
    drawLines('overlayPointer');
    drawTinyPoints('overlayMunsell');
    drawPoints('points');
    gl.enable(gl.DEPTH_TEST);
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
    gl.uniform1f(lineLoc.pointSize, 1);
    gl.uniform1f(lineLoc.round, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
    gl.enableVertexAttribArray(lineLoc.pos);
    gl.vertexAttribPointer(lineLoc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttrib4fv(lineLoc.col, b.color);
    gl.disableVertexAttribArray(lineLoc.col);
    gl.drawArrays(gl.LINES, 0, b.count);
    gl.disableVertexAttribArray(lineLoc.pos);
  }

  /* 实测格点：圆点。先铺一圈浅色底再压深色，深色区（红/品红）也分得清；
     depth bias 比网格线大，避免被表面切掉半个点。 */
  /* 密集点云（Munsell 2734）：单色小点，没有白底，免得糊成一片 */
  function drawTinyPoints(key) {
    var b = buffers[key];
    if (!b || !b.count || !b.pos) return;
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(lineLoc.vp, false, VP);
    gl.uniform1f(lineLoc.bias, 0.0030);
    gl.uniform1f(lineLoc.round, 1);
    gl.uniform1f(lineLoc.pointSize, Math.max(1.5, 2 * (window.devicePixelRatio || 1)));
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
    gl.enableVertexAttribArray(lineLoc.pos);
    gl.vertexAttribPointer(lineLoc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(lineLoc.col);
    gl.vertexAttrib4fv(lineLoc.col, b.color);
    gl.drawArrays(gl.POINTS, 0, b.count);
    gl.disableVertexAttribArray(lineLoc.pos);
  }

  function drawPoints(key) {
    var b = buffers[key];
    if (!b || !b.count || !b.pos) return;
    gl.useProgram(lineProg);
    gl.uniformMatrix4fv(lineLoc.vp, false, VP);
    gl.uniform1f(lineLoc.round, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.pos);
    gl.enableVertexAttribArray(lineLoc.pos);
    gl.vertexAttribPointer(lineLoc.pos, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(lineLoc.col);
    var dpr = window.devicePixelRatio || 1;
    var size = Math.max(3, 3 * dpr);
    gl.uniform1f(lineLoc.bias, 0.0040);
    gl.uniform1f(lineLoc.pointSize, size + dpr);
    gl.vertexAttrib4fv(lineLoc.col, [1, 1, 1, 0.7]);
    gl.drawArrays(gl.POINTS, 0, b.count);
    gl.uniform1f(lineLoc.bias, 0.0045);
    gl.uniform1f(lineLoc.pointSize, size);
    gl.vertexAttrib4fv(lineLoc.col, b.color);
    gl.drawArrays(gl.POINTS, 0, b.count);
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

  /* 一上手拖拽就停掉自动旋转：两者同时生效会互相打架 */
  function stopAutoRotate() {
    if (!state.auto) return;
    state.auto = false;
    var box = document.getElementById('vol-auto');
    if (box) box.checked = false;
    requestRender();
  }

  canvas.addEventListener('pointerdown', function (e) {
    stopAutoRotate();
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

  /* ---------- 自定义多基色面板 ---------- */
  var customPanel = document.querySelector('[data-vol-custom]');
  var customStatus = document.querySelector('[data-vol-custom-status]');
  var WHITE_PRESETS = {
    d65: [0.3127, 0.3290],
    d50: [0.3457, 0.3585],
    dci: [0.3140, 0.3510],
    c: [0.31006, 0.31616]
  };

  function setStatus(msg) {
    if (customStatus) customStatus.textContent = msg;
  }

  function customN() {
    var el = document.getElementById('vol-custom-n');
    return el ? +el.value : 4;
  }

  function matchPreset(w) {
    if (!w) return 'custom';
    var hit = 'custom';
    Object.keys(WHITE_PRESETS).forEach(function (k) {
      var p = WHITE_PRESETS[k];
      if (Math.abs(p[0] - w[0]) < 5e-4 && Math.abs(p[1] - w[1]) < 5e-4) hit = k;
    });
    return hit;
  }

  /* 每行：色块 + 序号 + x + y */
  function renderCustomRows(data) {
    var box = document.getElementById('vol-custom-rows');
    if (!box) return;
    var n = Math.max(3, Math.min(8, customN()));
    var prim = (data && data.primaries) || [];
    box.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var p = prim[i] || [0.4, 0.4];
      var row = document.createElement('label');
      row.className = 'c-vol-custom-pri';
      var mark = document.createElement('span');
      mark.className = 'c-vol-custom-mark';
      var sw = document.createElement('span');
      sw.className = 'swatch';
      var idx = document.createElement('span');
      idx.className = 'c-vol-custom-idx';
      idx.textContent = String(i + 1);
      mark.appendChild(sw); mark.appendChild(idx);
      var ix = document.createElement('input');
      ix.type = 'text'; ix.value = Number(p[0]).toFixed(4); ix.setAttribute('data-x', '1');
      var iy = document.createElement('input');
      iy.type = 'text'; iy.value = Number(p[1]).toFixed(4); iy.setAttribute('data-y', '1');
      var iYv = document.createElement('input');
      iYv.type = 'text'; iYv.setAttribute('data-yv', '1');
      iYv.title = T('该基色满值时的最大 Y（白点 Y = 1）', 'Max Y at full value (white Y = 1)');
      if (data && data.weights && isFinite(data.weights[i])) iYv.value = Number(data.weights[i]).toFixed(6);
      var auto = autoYOn();
      iYv.disabled = auto;
      row.appendChild(mark); row.appendChild(ix); row.appendChild(iy); row.appendChild(iYv);
      box.appendChild(row);
      ix.addEventListener('input', updateSwatches);
      iy.addEventListener('input', updateSwatches);
    }
    updateSwatches();
  }

  function readCustomRows() {
    var box = document.getElementById('vol-custom-rows');
    if (!box) return [];
    var out = [];
    Array.prototype.forEach.call(box.querySelectorAll('.c-vol-custom-pri'), function (row) {
      var x = parseFloat(row.querySelector('[data-x]').value);
      var y = parseFloat(row.querySelector('[data-y]').value);
      var yvEl = row.querySelector('[data-yv]');
      var yv = yvEl ? parseFloat(yvEl.value) : NaN;
      out.push({ x: isFinite(x) ? x : NaN, y: isFinite(y) ? y : NaN, Y: isFinite(yv) ? yv : NaN });
    });
    return out;
  }

  /* 亮度设定有两种口径：按白点分配（白点是输入、Y 是解）与直接输入 Y（Y 是输入、
     白点是结果）。两者互斥，靠一个下拉切换，切换时不动已知的那一半。 */
  function yMode() {
    var el = document.getElementById('vol-custom-ymode');
    return el && el.value === 'manual' ? 'manual' : 'auto';
  }

  function autoYOn() { return yMode() !== 'manual'; }

  function whiteXY() {
    var wx = parseFloat((document.getElementById('vol-custom-wx') || {}).value);
    var wy = parseFloat((document.getElementById('vol-custom-wy') || {}).value);
    return (isFinite(wx) && isFinite(wy) && wy > 0) ? [wx, wy] : [0.3127, 0.329];
  }

  function isCoord(p) {
    return isFinite(p.x) && isFinite(p.y) && p.x > 0 && p.y > 0 && p.x + p.y <= 1.000001;
  }

  /* 表格里坐标合法的行（按显示顺序）；白点方程只对这些行有定义 */
  function validRows() {
    return readCustomRows().filter(isCoord).map(function (p) { return [p.x, p.y]; });
  }

  function syncYButtons() {
    syncWhiteControls();
  }

  /* 白点的语义随口径变：按白点分配时它是输入；直接输入 Y 时它是结果。
     手动口径下把整组白点输入隐藏，只留「实际白点」；归一化按钮反过来只在手动口径出现。 */
  function syncWhiteControls() {
    var auto = autoYOn();
    var group = document.querySelector('[data-vol-white-group]');
    if (group) group.hidden = !auto;
    var btn = document.getElementById('vol-custom-normalize');
    if (btn) btn.hidden = auto;
    var aw = document.querySelector('[data-vol-actual-white]');
    if (aw) aw.hidden = auto;
    syncPinControls();
  }

  /* 「调整亮度分配」只在按白点分配、且基色多于 3 个时出现：3 个基色时 Y 已经唯一。 */
  function syncPinControls() {
    var wrap = document.querySelector('[data-vol-pin]');
    var rows = validRows();
    var show = autoYOn() && rows.length >= 4;
    if (wrap && !show) wrap.open = false;
    if (wrap) wrap.hidden = !show;
    var sel = document.getElementById('vol-custom-pinkey');
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = T('不固定', 'Not fixed');
    sel.appendChild(o0);
    for (var i = 0; i < rows.length; i++) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = 'P' + (i + 1);
      sel.appendChild(o);
    }
    sel.value = (keep !== '' && +keep < rows.length) ? keep : '';
    refreshPinRange(false);
  }

  /* 固定项读回来：{ index, value }；未固定（或不可调）时为 null */
  function pinState() {
    var sel = document.getElementById('vol-custom-pinkey');
    var rng = document.getElementById('vol-custom-pinval');
    var holder = document.querySelector('[data-vol-pin-range]');
    if (!sel || !rng || sel.value === '' || !holder || holder.hidden) return null;
    var k = parseInt(sel.value, 10), v = parseFloat(rng.value);
    if (!(k >= 0) || !isFinite(v)) return null;
    return { index: k, value: v };
  }

  function currentWeight(k) {
    var els = document.querySelectorAll('#vol-custom-rows .c-vol-custom-pri [data-yv]');
    return els[k] ? parseFloat(els[k].value) : NaN;
  }

  function writeYColumn(weights) {
    var els = document.querySelectorAll('#vol-custom-rows .c-vol-custom-pri [data-yv]');
    for (var i = 0; i < els.length; i++) {
      if (weights && isFinite(weights[i])) els[i].value = Number(weights[i]).toFixed(6);
    }
  }

  function updatePinRead() {
    var rng = document.getElementById('vol-custom-pinval');
    var read = document.querySelector('[data-vol-pinread]');
    if (!rng || !read) return;
    var v = parseFloat(rng.value);
    if (!isFinite(v)) { read.textContent = ''; return; }
    var lo = parseFloat(rng.min), hi = parseFloat(rng.max);
    read.textContent = 'Y ' + v.toFixed(3) + T('　可行 ', '  of ') + lo.toFixed(3) + '–' + hi.toFixed(3);
  }

  /* 滑块范围 = 其余基色还能合出白点的区间；默认吸附到当前解上 */
  function refreshPinRange(snap) {
    var sel = document.getElementById('vol-custom-pinkey');
    var rng = document.getElementById('vol-custom-pinval');
    var holder = document.querySelector('[data-vol-pin-range]');
    if (!sel || !rng || !holder) return;
    var k = sel.value === '' ? -1 : parseInt(sel.value, 10);
    if (!(k >= 0)) { holder.hidden = true; return; }
    var rows = validRows();
    var range = k < rows.length ? geom.pinnedRange(rows, whiteXY(), k) : null;
    if (!range || !(range.hi - range.lo > 5e-4)) { holder.hidden = true; return; }
    holder.hidden = false;
    rng.min = range.lo.toFixed(4);
    rng.max = range.hi.toFixed(4);
    var v = parseFloat(rng.value);
    if (snap || !isFinite(v) || v < range.lo - 1e-9 || v > range.hi + 1e-9) {
      var cur = currentWeight(k);
      if (!(isFinite(cur) && cur >= range.lo && cur <= range.hi)) cur = (range.lo + range.hi) / 2;
      rng.value = String(Math.min(range.hi, Math.max(range.lo, cur)));
    }
    updatePinRead();
  }

  /* 体积自身的白点 = Σ g_k（含共线合并的平移）归一化 */
  function actualWhiteOf(sp) {    if (!sp || !sp.gens) return null;
    var off = sp.offset || [0, 0, 0];
    var sx = off[0], sy = off[1], sz = off[2];
    for (var i = 0; i < sp.gens.length; i++) {
      sx += sp.gens[i][0]; sy += sp.gens[i][1]; sz += sp.gens[i][2];
    }
    var sum = sx + sy + sz;
    if (!(sum > 1e-9)) return null;
    return [sx / sum, sy / sum];
  }

  /* 白点的 Y 分量：自动口径恒为 1，手动口径由 Y 之和决定（≠1 就说明整卷相对白点缩放） */
  function actualYOf(sp) {
    if (!sp || !sp.gens) return NaN;
    var off = sp.offset || [0, 0, 0];
    var sy = off[1];
    for (var i = 0; i < sp.gens.length; i++) sy += sp.gens[i][1];
    return sy;
  }

  function showActualWhite(sp) {
    var el = document.querySelector('[data-vol-actual-white]');
    if (!el) return;
    var w = actualWhiteOf(sp);
    el.textContent = w ? T('实际白点 (', 'Actual white (') + w[0].toFixed(4) + ', ' + w[1].toFixed(4) + ')' : '';
  }

  function updateSwatches() {
    var box = document.getElementById('vol-custom-rows');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.c-vol-custom-pri'), function (row) {
      var x = parseFloat(row.querySelector('[data-x]').value);
      var y = parseFloat(row.querySelector('[data-y]').value);
      var sw = row.querySelector('.swatch');
      if (!isFinite(x) || !isFinite(y) || x <= 0 || y <= 0 || x + y > 1.000001) {
        sw.style.background = '#f0f0f0';
        return;
      }
      var c = geom.previewForXy([x, y], cfg.srgbMatrix).map(function (v) {
        return Math.round(Math.max(0, Math.min(1, v)) * 255);
      });
      sw.style.background = 'rgb(' + c.join(',') + ')';
    });
  }

  function fillCustomPanel(data, mode) {
    if (!data) return;
    var nEl = document.getElementById('vol-custom-n');
    if (nEl) nEl.value = String(Math.max(3, Math.min(8, data.primaries.length)));
    var m = mode || (data.weights && data.weights.length ? 'manual' : 'auto');
    var modeEl = document.getElementById('vol-custom-ymode');
    if (modeEl) modeEl.value = m;
    renderCustomRows(data);
    var wx = document.getElementById('vol-custom-wx');
    var wy = document.getElementById('vol-custom-wy');
    if (wx && data.white) wx.value = Number(data.white[0]).toFixed(4);
    if (wy && data.white) wy.value = Number(data.white[1]).toFixed(4);
    syncYButtons();
    var pre = document.getElementById('vol-custom-wpreset');
    if (pre) pre.value = matchPreset(data.white);
    restorePin(data.pin);
    var tEl = document.getElementById('vol-custom-primaries');
    if (tEl) {
      tEl.value = data.primaries.map(function (p, i) {
        return 'P' + (i + 1) + ' ' + p[0].toFixed(4) + ' ' + p[1].toFixed(4);
      }).join('\n');
    }
  }

  /* 把固定项（哪个基色、值多少）还原到控件上 */
  function restorePin(pin) {
    var sel = document.getElementById('vol-custom-pinkey');
    if (!sel) return;
    if (pin && pin.index >= 0 && pin.index < sel.options.length - 1) {
      sel.value = String(pin.index);
      refreshPinRange(true);
      var rng = document.getElementById('vol-custom-pinval');
      if (rng) { rng.value = String(pin.value); updatePinRead(); }
    } else {
      sel.value = '';
      refreshPinRange(false);
    }
  }

  function syncCustomPanel() {
    if (customPanel) customPanel.hidden = state.primary !== CUSTOM_SLUG;
  }

  /* 面板状态行：说清这一版色体的 Y 是怎么定下来的 */
  function customStatusText(prim, sp, mode, pin, extra) {
    var msg = prim.length + T(' 基色', ' primaries') + (extra || '');
    if (sp.negativeWeights) {
      return msg + T(' · ⚠ 白点不在原色锥内：体积含负亮度，形状不可信（换白点或补基色）',
        ' · white point outside the primary cone: negative luminance in the volume');
    }
    if (mode === 'manual') {
      var aw = actualWhiteOf(sp);
      msg += T(' · 直接输入 Y · 实际白点 ', ' · Y entered · white point ') +
        '(' + aw[0].toFixed(4) + ', ' + aw[1].toFixed(4) + ')';
      var sy = actualYOf(sp);
      if (isFinite(sy)) msg += ' · ΣY = ' + sy.toFixed(3);
    } else {
      msg += T(' · 按白点分配', ' · split by white point');
      if (pin) {
        msg += T(' · 固定 P' + (pin.index + 1) + ' 的 Y = ' + pin.value.toFixed(3),
          ' · P' + (pin.index + 1) + ' fixed at Y = ' + pin.value.toFixed(3));
      }
      /* 还有几个基色要去满足白点：超过 3 个就仍不唯一，说明这只是其中一组 */
      if ((pin ? prim.length - 1 : prim.length) > 3) {
        msg += T(' · 分配不唯一，当前为一组可行解',
          ' · allocation is not unique; this is one feasible split');
      }
    }
    if (sp.mergedGroups && sp.mergedGroups.length) {
      msg += T(' · 合并了 ' + sp.mergedGroups.length + ' 组共线基色',
        ' · merged ' + sp.mergedGroups.length + ' collinear group(s)');
    }
    return msg;
  }

  /* opts.live：滑块拖动时只更新几何与 Y 列，不重排表格（否则滑块会被抢焦点） */
  function applyCustom(opts) {
    var live = !!(opts && opts.live);
    /* 已经是自定义空间时（用户改了坐标再点应用），保持画面比例：
       正交下视觉大小 ∝ zoom / fitHalfH，所以按新旧 fitHalfH 补偿 zoom；
       透视下 dist = fitDist / zoom，zoom 不变即视觉不变，无需处理。 */
    var wasCustom = state.primary === CUSTOM_SLUG && !!customSpace;
    var keepHalfH = state.fitHalfH > 0 && isFinite(state.fitHalfH)
      ? state.fitHalfH / state.zoom : 0;
    var rows = readCustomRows();
    var valid = rows.filter(isCoord);
    var white = whiteXY();
    if (valid.length < 3) {
      setStatus(T('至少需要 3 个合法基色（x > 0、y > 0、x + y ≤ 1）',
        'Need at least 3 valid primaries (x > 0, y > 0, x + y ≤ 1)'));
      return;
    }
    var prim = valid.map(function (p) { return [p.x, p.y]; });
    var mode = yMode();
    var pin = mode === 'auto' ? pinState() : null;
    if (pin && pin.index >= prim.length) pin = null;
    var extra = '';
    var weights = null;
    if (mode === 'manual') {
      if (valid.some(function (p) { return !isFinite(p.Y); })) {
        setStatus(T('直接输入 Y：请给每个基色填一个 Y', 'Y entered directly: give every primary a Y'));
        return;
      }
      weights = valid.map(function (p) { return p.Y; });
    } else if (pin) {
      var sol = geom.solvePinned(prim, white, pin.index, pin.value);
      if (!sol) {
        /* 换了白点或基色后，原来的固定值可能越界：先按新条件收窄；
           收不进去就取消固定，别让用户卡在一个点不动的状态里 */
        var nr = geom.pinnedRange(prim, white, pin.index);
        var t2 = nr ? Math.min(nr.hi, Math.max(nr.lo, pin.value)) : NaN;
        if (nr && isFinite(t2)) sol = geom.solvePinned(prim, white, pin.index, t2);
        if (sol) {
          pin = { index: pin.index, value: t2 };
          extra = T(' · 可行区间收窄，固定值收到 ' + t2.toFixed(3),
            ' · feasible range narrowed; value moved to ' + t2.toFixed(3));
        } else {
          extra = T(' · P' + (pin.index + 1) + ' 在新白点下无法固定，已取消',
            ' · P' + (pin.index + 1) + ' cannot be fixed under the new white point; unfixed');
          pin = null;
        }
      }
      weights = sol || null;
    }
    var sp = buildCustomSpace({ primaries: prim, white: white, weights: weights });
    if (!sp) { setStatus(T('构造失败：检查原色是否共线', 'Failed: check for collinear primaries')); return; }
    state.custom = {
      primaries: prim,
      white: white,
      weights: mode === 'manual' ? weights : null,
      pin: pin ? { index: pin.index, value: pin.value } : null
    };
    customSpace = sp;
    state.primary = CUSTOM_SLUG;
    if (primarySel) primarySel.value = CUSTOM_SLUG;

    if (rows.length > valid.length) {
      extra = T('（忽略 ' + (rows.length - valid.length) + ' 行非法坐标）',
        ' (' + (rows.length - valid.length) + ' invalid row(s) ignored)') + extra;
    }
    setStatus(customStatusText(prim, sp, mode, pin, extra));

    if (live) writeYColumn(weights || sp.weights);
    else fillCustomPanel({ primaries: prim, white: white, weights: weights || sp.weights, pin: pin }, mode);
    showActualWhite(sp);
    if (!live) syncCustomPanel();
    rebuild();
    if (wasCustom && state.proj === 'ortho' && keepHalfH > 0) {
      state.zoom = clampZoom(state.fitHalfH / keepHalfH);
      state.dist = state.fitDist / state.zoom;
      requestRender();
    }
    if (!live) persistState();
  }

  bind('vol-custom-apply', 'click', function (e) { e.preventDefault(); applyCustom(); });

  bind('vol-custom-normalize', 'click', function (e) {
    e.preventDefault();
    if (autoYOn()) return;
    var rows = readCustomRows();
    var vals = rows.map(function (p) { return p.Y; });
    if (vals.some(function (v) { return !isFinite(v) || v < 0; })) {
      setStatus(T('归一化失败：请先给每个基色填非负 Y', 'Normalize failed: fill a non-negative Y for every primary'));
      return;
    }
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    if (!(sum > 1e-9)) { setStatus(T('归一化失败：Y 之和为 0', 'Normalize failed: sum of Y is 0')); return; }
    var inputs = document.querySelectorAll('.c-vol-custom-pri');
    rows.forEach(function (p, i) {
      var el = inputs[i] && inputs[i].querySelector('[data-yv]');
      if (el) el.value = (p.Y / sum).toFixed(6);
    });
    setStatus(T('已归一化 ΣY = 1（原 ΣY = ', 'Normalized ΣY = 1 (was ΣY = ') + sum.toFixed(4) + T('），点应用生效', '), click Apply to commit'));
  });

  bind('vol-custom-ymode', 'change', function () {
    var rows = readCustomRows();
    var keep = rows.filter(isCoord).map(function (p) { return [p.x, p.y]; });
    var ws = rows.filter(isCoord).map(function (p) { return p.Y; });
    /* 切换口径不重算几何：把眼前这组 Y 原样交给新的可编辑/只读状态 */
    if (!autoYOn()) {
      var cur = state.custom && state.custom.weights;
      renderCustomRows({ primaries: keep, weights: (cur && cur.length === keep.length) ? cur : ws });
      syncYButtons();
      if (customSpace && state.primary === CUSTOM_SLUG) showActualWhite(customSpace);
      setStatus(T('直接输入 Y：白点由 Y 决定，旁边的「实际白点」是结果',
        'Y entered directly: the Y values decide the white point, shown next to them'));
      return;
    }
    renderCustomRows({ primaries: keep, weights: ws });
    syncYButtons();
    if (state.primary === CUSTOM_SLUG) {
      /* 切回按白点分配：立刻按白点重新解 Y，否则体积还停在手填值上 */
      applyCustom();
    }
  });

  /* 选哪个基色做固定项：滑块吸附到它当前解出的 Y 上，再按新范围拖动 */
  bind('vol-custom-pinkey', 'change', function () {
    refreshPinRange(true);
    if (pinState()) applyCustom({ live: true });
  });

  bind('vol-custom-pinval', 'input', function () {
    updatePinRead();
    applyCustom({ live: true });
  });
  bind('vol-custom-pinval', 'change', function () {
    updatePinRead();
    applyCustom({ live: false });
  });

  /* 理想示例：sRGB 三基色；再加一个色度等于白点的 W，用来对比两种「增加 W」 */
  function loadExample(list, white) {
    var nEl = document.getElementById('vol-custom-n');
    if (nEl) nEl.value = String(Math.max(3, Math.min(8, list.length)));
    var modeEl = document.getElementById('vol-custom-ymode');
    if (modeEl) modeEl.value = 'auto';
    var wx = document.getElementById('vol-custom-wx');
    var wy = document.getElementById('vol-custom-wy');
    if (wx) wx.value = white[0].toFixed(4);
    if (wy) wy.value = white[1].toFixed(4);
    var pre = document.getElementById('vol-custom-wpreset');
    if (pre) pre.value = matchPreset(white);
    var sel = document.getElementById('vol-custom-pinkey');
    if (sel) sel.value = '';
    renderCustomRows({ primaries: list });
    syncYButtons();
    applyCustom();
  }
  bind('vol-custom-ex-rgb', 'click', function (e) {
    e.preventDefault();
    loadExample([[0.640, 0.330], [0.300, 0.600], [0.150, 0.060]], [0.3127, 0.3290]);
  });
  bind('vol-custom-ex-rgbw', 'click', function (e) {
    e.preventDefault();
    loadExample([[0.640, 0.330], [0.300, 0.600], [0.150, 0.060], [0.3127, 0.3290]], [0.3127, 0.3290]);
  });

  /* 基色数量变化：保留已有行的坐标 */
  bind('vol-custom-n', 'change', function () {
    var rows = readCustomRows();
    var keep = rows.filter(isCoord).map(function (p) { return [p.x, p.y]; });
    var weights = autoYOn() ? null : rows.filter(isCoord).map(function (p) { return p.Y; });
    renderCustomRows({ primaries: keep, weights: weights });
    syncYButtons();
  });

  /* 白点预设 ↔ 手填 */
  bind('vol-custom-wpreset', 'change', function (e) {
    var p = WHITE_PRESETS[e.target.value];
    if (!p) return;
    var wx = document.getElementById('vol-custom-wx');
    var wy = document.getElementById('vol-custom-wy');
    if (wx) wx.value = p[0].toFixed(4);
    if (wy) wy.value = p[1].toFixed(4);
  });
  ['vol-custom-wx', 'vol-custom-wy'].forEach(function (id) {
    bind(id, 'input', function () {
      var pre = document.getElementById('vol-custom-wpreset');
      if (!pre) return;
      var wx = parseFloat(document.getElementById('vol-custom-wx').value);
      var wy = parseFloat(document.getElementById('vol-custom-wy').value);
      pre.value = matchPreset([wx, wy]);
    });
  });

  /* 从文本批量填入 */
  bind('vol-custom-parse', 'click', function (e) {
    e.preventDefault();
    var tEl = document.getElementById('vol-custom-primaries');
    var parsed = geom.parsePrimaries(tEl ? tEl.value : '');
    if (parsed.primaries.length < 3) { setStatus('文本里没有足够的合法基色'); return; }
    var nEl = document.getElementById('vol-custom-n');
    if (nEl) nEl.value = String(Math.max(3, Math.min(8, parsed.primaries.length)));
    renderCustomRows({ primaries: parsed.primaries });
    setStatus('已从文本填入 ' + parsed.primaries.length + ' 个基色，点「应用」生效');
  });

  bind('vol-custom-apply', 'click', function (e) { e.preventDefault(); applyCustom(); });

  var refSel = bind('vol-ref', 'change', function (e) {
    state.ref = e.target.value || '';
    rebuild();
    persistState();
  });

  var primarySel = bind('vol-space', 'change', function (e) {
    state.primary = e.target.value;
    if (state.primary === CUSTOM_SLUG && !customSpace) {
      customSpace = buildCustomSpace(state.custom || DEFAULT_CUSTOM);
    }
    syncCustomPanel();
    /* 同一坐标下换色彩空间：不动取景与刻度，色体该多大就多大，便于比较体积 */
    rebuild({ keepView: true });
    persistState();
    /* 表格是空的（刚切过来）就把解出来的 Y 补上，否则只剩坐标没有分配 */
    if (state.primary === CUSTOM_SLUG) {
      var hasY = Array.prototype.some.call(
        document.querySelectorAll('#vol-custom-rows .c-vol-custom-pri [data-yv]'),
        function (el) { return el.value !== ''; });
      if (!hasY) applyCustom();
    }
  });

  bind('vol-coord', 'change', function (e) {
    state.coord = e.target.value;
    updateCondVisibility();
    rebuild();
    persistState();
  });

  bind('vol-proj', 'change', function (e) {
    state.proj = e.target.value === 'ortho' ? 'ortho' : 'persp';
    // 两种投影的取景基准不同，切过去先按当前朝向重新取景
    fitCamera();
    requestRender();
    persistState();
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

  bind('vol-grid', 'change', function (e) {
    state.grid = e.target.checked;
    rebuild();
  });

  /* 叠加层开关：先读一遍 HTML 的初始状态，再逐个绑定 */
  LAYER_KEYS.forEach(function (key) {
    var el = document.getElementById('vol-ov-' + key);
    if (el) state.layers[key] = el.checked;
    bind('vol-ov-' + key, 'change', function (e) {
      state.layers[key] = e.target.checked;
      rebuild();
      persistState();
    });
  });

  bind('vol-points', 'change', function (e) {
    state.points = e.target.checked;
    rebuild();
  });

  bind('vol-auto', 'change', function (e) {
    state.auto = e.target.checked;
    requestRender();
  });

  bind('vol-reset', 'click', function (e) { e.preventDefault(); resetView(); });
  bind('vol-top', 'click', function (e) { e.preventDefault(); topView(); });

  window.addEventListener('resize', resize);

  function persistState() {
    if (!QS) return;
    window.ToolState.write(QS, {
      space: state.primary,
      coord: state.coord,
      proj: state.proj,
      lay: enabledLayers(),
      ref: state.ref,
      mp: state.primary === CUSTOM_SLUG && state.custom ? geom.encodeMulti(state.custom) : ''
    });
  }

  function applyState(next) {
    state.primary = next.space;
    state.coord = next.coord;
    state.proj = next.proj;
    setLayers(next.lay);
    state.ref = next.ref || '';
    if (next.mp) {
      var dec = geom.decodeMulti(next.mp);
      if (dec) { state.custom = dec; customSpace = buildCustomSpace(dec); fillCustomPanel(dec); }
    }
    if (state.coord === 'jmh' && !JMH) state.coord = 'lab';

    var spaceEl = document.getElementById('vol-space');
    var coordEl = document.getElementById('vol-coord');
    var projEl = document.getElementById('vol-proj');
    if (spaceEl) spaceEl.value = state.primary;
    var refEl = document.getElementById('vol-ref');
    if (refEl) refEl.value = state.ref;
    if (coordEl) coordEl.value = state.coord;
    if (projEl) projEl.value = state.proj;

    updateCondVisibility();
    rebuild();
    requestRender();
  }

  /* ---------- 启动 ---------- */

  // 默认值来自页面
  var coordSel = document.getElementById('vol-coord');
  if (coordSel && coordSel.value) state.coord = coordSel.value;
  var projSel = document.getElementById('vol-proj');
  if (projSel) state.proj = projSel.value === 'persp' ? 'persp' : 'ortho';

  var QS = window.ToolState ? {
    space: {
      type: 'string',
      values: spaces.map(function (s) { return s.slug; }).concat([CUSTOM_SLUG]),
      default: state.primary
    },
    coord: { type: 'string', values: coordSel ? Array.prototype.map.call(coordSel.options, function (o) { return o.value; }) : ['lab'], default: 'lab' },
    proj: { type: 'string', values: ['persp', 'ortho'], default: 'ortho' },
    lay: { type: 'list', values: LAYER_KEYS, default: ['locus'] },
    mp: { type: 'string', default: '' },
    ref: {
      type: 'string',
      values: [''].concat(spaces.map(function (s) { return s.slug; }), [CUSTOM_SLUG]),
      default: ''
    }
  } : null;
  if (QS) {
    var q = window.ToolState.parse(QS, window.location.search);
    state.primary = q.space;
    state.coord = q.coord;
    state.proj = q.proj;
    setLayers(q.lay);
    state.ref = q.ref || '';
    if (q.mp) {
      var dec2 = geom.decodeMulti(q.mp);
      if (dec2) { state.custom = dec2; customSpace = buildCustomSpace(dec2); }
    }
  }

  // 没加载到 JMh 内核时把这一项从下拉里摘掉，别让用户选到一个空体积
  if (!JMH) {
    var jmhOpt = coordSel && coordSel.querySelector('option[value="jmh"]');
    if (jmhOpt) jmhOpt.parentNode.removeChild(jmhOpt);
    if (state.coord === 'jmh') {
      state.coord = 'lab';
    }
  }

  if (state.primary === CUSTOM_SLUG) customSpace = buildCustomSpace(state.custom || DEFAULT_CUSTOM);
  if (refSel) refSel.value = state.ref;
  if (primarySel) primarySel.value = state.primary;
  if (coordSel) coordSel.value = state.coord;
  if (projSel) projSel.value = state.proj;
  LAYER_KEYS.forEach(function (key) {
    var el = document.getElementById('vol-ov-' + key);
    if (el) el.checked = !!state.layers[key];
  });

  updateCondVisibility();
  if (state.custom) {
    /* 回填时把「解出来的 Y」一起显示：自动口径下 URL 里不带权重，
       但面板必须给出这一版色体实际用的分配，否则看起来像还没算过 */
    fillCustomPanel({
      primaries: state.custom.primaries,
      white: state.custom.white,
      weights: (customSpace && customSpace.weights) || null,
      pin: state.custom.pin
    }, state.custom.weights ? 'manual' : 'auto');
    if (state.primary === CUSTOM_SLUG && customSpace) {
      setStatus(customStatusText(state.custom.primaries, customSpace,
        state.custom.weights ? 'manual' : 'auto', state.custom.pin, ''));
    }
  } else renderCustomRows(DEFAULT_CUSTOM);
  syncYButtons();
  syncWhiteControls();
  syncCustomPanel();

  window.addEventListener('popstate', function () {
    if (!QS) return;
    applyState(window.ToolState.parse(QS, window.location.search));
  });

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
