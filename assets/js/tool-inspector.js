/* 多模型取色：色相轮（当前明度的色相 × 彩度）+ 右侧彩度 × 明度切片
 *
 * 结构：
 *   - 颜色真值是 XYZ（相对白 Y=1）。所选色域（原色 + 白点）与传递函数是
 *     两个独立选项：几何边界永远由所选原色的线性 RGB [0,1] 决定，曲线只换算码值。
 *     换曲线保持 XYZ、Lab/OKLCH 轮廓与色块；只有编码 RGB、绝对亮度和编码 HSV 变化。
 *   - 三层缓存：色体投影 + 外圈（模型 / 参考白 / 色域 / 尺寸）、轮内彩色层
 *     （再加当前明度）、切片底图（再加切片色相）。游标、虚线、标题是轻量覆盖层。
 *   - 选色只走 colour-wheel-geom.js 的 resolveSelection：坐标 / 线性值 / 码值
 *     一次提交。改色域或曲线不暗中夹颜色；越界时保留真实 XYZ，另提供「贴合」动作。
 */
(function () {
  'use strict';
  var host = document.querySelector('[data-inspector]');
  if (!host) return;
  var cfg = JSON.parse(document.getElementById('inspect-data').textContent);
  var P = window.ColourPolar;
  var G = window.ColourWheelGeom;
  var C = window.ColourCodec;
  if (!P || !G) return;
  var en = cfg.lang === 'en';

  function $(id) { return document.getElementById(id); }
  var wheelCanvas = $('ins-wheel');
  var wctx = wheelCanvas.getContext('2d');
  var planeCanvas = $('ins-plane');
  var pctx = planeCanvas.getContext('2d');
  var modelSel = $('ins-model');
  var gamutSel = $('ins-gamut');
  var transferSel = $('ins-transfer');
  var transferKind = $('ins-transfer-kind');
  var pairBtn = $('ins-pair');
  var lbLabel = $('ins-lb-label');
  var lbIn = $('ins-lb');
  var rgbTitle = $('ins-rgb-title');
  var hueNum = $('ins-hue-num');
  var hexIn = $('ins-hex');
  var swatch = $('ins-swatch');
  var axes = $('ins-axes');
  var lumSel = $('ins-lum');
  var coords = $('ins-coord');
  var statusEl = $('ins-status');
  var wheelTitle = $('ins-wheel-title');
  var srgbIn = [$('ins-srgb-r'), $('ins-srgb-g'), $('ins-srgb-b')];
  var mcIn = [$('ins-mc-l'), $('ins-mc-c'), $('ins-mc-h')];
  var mcLabels = [$('ins-mc-l-label'), $('ins-mc-c-label'), $('ins-mc-h-label')];
  var noteEl = $('ins-toolbar-note');
  var oogsEl = $('ins-oogs');
  var gamutWhite = $('ins-gamut-white');
  var lumLabel = $('ins-lum-label');
  var fitBtn = $('ins-fit');

  var T = {
    clamped: en ? 'Clamped to the gamut boundary' : '已贴合色域边界',
    browsing: en ? 'No displayable colour at this hue and lightness — browsing the slice only'
                 : '当前明度下该色相没有可显示的颜色，只切换切片',
    outGamut: function (tag) {
      return en
        ? 'Current colour is outside the selected ' + tag + ' gamut. XYZ and Lab are kept; fit it or pick a new point.'
        : '当前颜色超出所选 ' + tag + ' 色体。XYZ 与 Lab 保留；可执行贴合或重新选点。';
    },
    outSrgb: en ? 'out of sRGB' : '超出 sRGB',
    outSrgbNote: function (tag) {
      return en
        ? 'Valid in ' + tag + ', outside sRGB; the swatch and HEX show a clipped sRGB preview.'
        : '当前颜色在 ' + tag + ' 内有效，但超出 sRGB 显示范围；色块与 HEX 为 sRGB 裁切近似。';
    },
    codeOut: en ? 'Code value is outside this curve’s domain — no colour submitted.'
                : '码值超出该曲线的定义域，未提交颜色。',
    blackInvalid: en ? 'Black level must be at least 0 and less than L_w.' : '黑位必须大于或等于 0，且小于 L_w。',
    linearLabel: function (tag) { return (en ? 'Linear ' : '线性 ') + tag; },
    absLabel: en ? 'Luminance' : '绝对亮度',
    sceneAbs: en ? 'Scene linear' : '场景线性'
  };

  /*
   * 参考白 L_w 是否激活，取决于它此刻是否真的改变显示内容：
   *   1. 模型：JzCH 直接以 L_w 为白，CAM02 用 L_A = 0.2·L_w —— 换 L_w 就换坐标；
   *   2. 曲线：PQ（绝对亮度）与 HLG（按 L_w 归一化）的**码值**随 L_w 变，
   *      BT.1886 在 L_b > 0 时也是；相对标量曲线会把 L_w 约掉（实测码值差为 0）。
   * 两者都不需要时禁用该控件，避免留下一个"看着能动、其实什么都不改"的选项。
   */
  function usesWhite() { return state.model === 'jzch' || state.model === 'jmh'; }
  function lwNeededByTransfer() { return P.transferNeedsLw(P.transfer()); }
  function lwActive() { return usesWhite() || lwNeededByTransfer(); }

  /* 为什么可用 / 为什么禁用：一句话说明，供控件标题与状态行共用 */
  function lwReason() {
    var m = state.model === 'jmh' ? (en ? 'L_A = 0.2·L_w' : 'L_A = 0.2·L_w') : '';
    if (usesWhite()) {
      return en ? 'Used by this model' + (m ? ' (' + m + ')' : '') + '.'
                : '当前模型使用 L_w' + (m ? '（' + m + '）' : '') + '。';
    }
    if (lwNeededByTransfer()) {
      return en ? 'Used by the selected curve: its code values depend on L_w.'
                : '所选曲线的码值依赖 L_w。';
    }
    if (P.transfer().kind === 'scene') {
      return en
        ? 'Not used here: scene encodings carry no display luminance, so L_w does not enter them.'
        : '此处不使用 L_w：场景编码不含显示亮度，L_w 不参与。';
    }
    return en
      ? 'Not used here: this model does not use L_w, and a relative EOTF cancels it out of the code values.'
      : '此处不使用 L_w：该模型不用它，相对 EOTF 也会把 L_w 从码值里约掉。';
  }

  /* ---------------- 画布尺寸与几何常量 ---------------- */
  var CW = 400, CH = 280;
  var WS = 400, WC = WS / 2;
  var OUT_R = 168, RING_W = 13, GAP = 7;
  var RING_C = OUT_R - RING_W / 2;
  var INNER_R = OUT_R - RING_W - GAP;
  var CURSOR_PAD = 7;
  var DEG = Math.PI / 180;

  var dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  wheelCanvas.width = Math.round(WS * dpr);
  wheelCanvas.height = Math.round(WS * dpr);
  planeCanvas.width = Math.round(CW * dpr);
  planeCanvas.height = Math.round(CH * dpr);

  var SS = 1.5;
  var DISC_FULL = dpr * SS, DISC_FAST = 0.5;
  var PLANE_FULL = dpr * SS, PLANE_FAST = 0.5;
  var PROG_BUDGET = 10;
  var progTokens = { disc: 0, plane: 0 };

  function runProgressive(slot, job, onDone) {
    var token = ++progTokens[slot];
    var row = 0;
    function step() {
      if (progTokens[slot] !== token) return;
      var t0 = performance.now();
      while (row < job.H && performance.now() - t0 < PROG_BUDGET) {
        job.row(row);
        row++;
      }
      if (row < job.H) { window.requestAnimationFrame(step); return; }
      job.finish();
      if (onDone) onDone();
    }
    window.requestAnimationFrame(step);
  }
  function cancelProgressive(slot) { progTokens[slot]++; }
  function spareCanvas(holder, key) {
    if (!holder[key] || holder[key] === holder.at) holder[key] = document.createElement('canvas');
    return holder[key];
  }

  /* ---------------- 色域与传递函数 ---------------- */
  if (cfg.gamuts && cfg.gamuts.length) P.setGamuts(cfg.gamuts);
  /* 矩阵校验：资料页矩阵必须有限、可逆，且 M·[1,1,1] 的白点 xy 等于资料白点。 */
  function validGamut(g) {
    if (!g || !g.matrix) return false;
    var xy = P.whiteXyFromMatrix(g.matrix);
    if (!xy) return false;
    var m = g.matrix.length === 9 ? g.matrix
      : (g.matrix.length === 3 && g.matrix[0] && g.matrix[0].length === 3 ? [].concat(g.matrix[0], g.matrix[1], g.matrix[2]) : null);
    if (!m) return false;
    var det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    if (!isFinite(det) || Math.abs(det) < 1e-12) return false;
    var w = g.white || null;
    if (w && w.length === 2) {
      if (Math.abs(xy[0] - w[0]) > 2e-3 || Math.abs(xy[1] - w[1]) > 2e-3) return false;
    }
    return true;
  }
  var spaceBySlug = {};
  (cfg.spaces || []).forEach(function (s) { spaceBySlug[s.slug] = s; });

  var transfers = C ? C.buildTransfers(cfg.spaces || [], cfg.curves || {}) : [];
  var transfersById = {};
  transfers.forEach(function (t) { transfersById[t.id] = t; });

  function transferLabel(t) {
    var l = t.label || {};
    return (en ? (l.en || l.zh) : (l.zh || l.en)) || t.id;
  }
  function fillTransfers() {
    var display = [], scene = [];
    var seen = {};
    transfers.forEach(function (t) {
      if (seen[t.id]) return;
      seen[t.id] = true;
      (t.kind === 'scene' ? scene : display).push(t);
    });
    function addGroup(label, list) {
      if (!list.length) return;
      var g = document.createElement('optgroup');
      g.label = label;
      list.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = transferLabel(t) + (t.approx ? ' *' : '');
        g.appendChild(o);
      });
      transferSel.appendChild(g);
    }
    addGroup(en ? 'Display EOTF and linear' : '显示 EOTF 与线性', display);
    addGroup(en ? 'Scene and log encodings' : '场景 / 对数编码', scene);
    if (transfersById.srgb) transferSel.value = 'srgb';
    else if (transfers.length) transferSel.value = transfers[0].id;
  }
  if (transferSel && transfers.length) fillTransfers();

  /*
   * 组合阻断：HLG 是三通道耦合、只定义于 BT.2020 原色的向量函数。
   * 非法组合不静默降级成逐通道标量，而是拒绝这次切换并说明原因。
   */
  function rejectCombo(space, t) {
    var problems = P.validateCombination(space, t);
    if (!problems.length) return false;
    var msg = problems.map(function (p) { return p.text; }).join(en ? '; ' : '；');
    setStatus('warn', en ? 'Not available: ' + msg : '无法组合：' + msg);
    return true;
  }

  /*
   * 资料页建议配对：只设置两项自身，不引入第二套计算口径。
   * - 资料页有采样曲线 → 那条曲线（camera / working 空间）；
   * - 场景参考但无采样曲线 → 场景线性（ACES2065-1 等）；
   * - 显示原色没有「资料页指定的曲线」，不给配对按钮，避免把 sRGB 曲线
   *   说成 P3-DCI 的官方 EOTF。
   */
  function pairingFor(slug) {
    var sp = spaceBySlug[slug];
    if (!sp) return null;
    if (cfg.curves && cfg.curves[slug] && transfersById['scene:' + slug]) return 'scene:' + slug;
    if (sp.category === 'Scene Referred' && transfersById['scene-lin']) return 'scene-lin';
    return null;
  }
  /* 白点只在它和色域短名不同、且不是 D65 时才需要单独标注 */
  function whiteSuffix(g) {
    var w = g.white;
    if (!w || w === 'D65' || w === g.tag) return '';
    return w;
  }
  function updatePairButton() {
    if (!pairBtn) return;
    var target = pairingFor(state.gamutKey);
    var show = !!target && target !== state.transferId;
    pairBtn.hidden = !show;
    if (show) {
      pairBtn.textContent = (en ? 'Catalogue pairing: ' : '按资料页配对：') + transferLabel(transfersById[target]);
    }
  }

  var firstGamut = cfg.gamuts && cfg.gamuts.length ? cfg.gamuts[0].key : 'primaries-srgb-rec709';
  var state = {
    model: 'lch', gamutKey: firstGamut, transferId: transferSel ? transferSel.value : 'srgb',
    lw: 100, lb: 0,
    xyz: [0.3, 0.25, 0.2],
    h: 40, c: 45, l: 65,
    clamped: false, browsing: false, outGamut: false
  };
  var want = { c: 45 };

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function roundTo(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }
  function model() { return P.models[state.model]; }
  function linOf() { return P.linFromXyz(state.xyz); }
  function codeOf() { return P.rgbFromXyz(state.xyz); }
  function srgbOf() { return P.srgbFromXyz(state.xyz); }
  function inGamutNow() { return P.inGamut(linOf()); }
  function inSrgb() { return P.inSrgb(state.xyz); }
  function wrap(h) { return G.wrapDeg(h); }

  function displayRgbXyz(xyz) {
    return P.srgbFromXyz(xyz).map(function (v) { return clamp01(v); });
  }

  function hexOf(rgb) {
    return '#' + rgb.map(function (c) {
      var v = Math.round(clamp01(c) * 255);
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('').toUpperCase();
  }
  function parseHex(v) {
    v = (v || '').trim().replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
    return [0, 2, 4].map(function (i) { return parseInt(v.substr(i, 2), 16) / 255; });
  }
  function f(v, d) { return Number(v).toFixed(d === undefined ? 2 : d); }
  function fmtTick(v) {
    if (Number.isInteger(v)) return String(v);
    var a = Math.abs(v);
    var s = a >= 10 ? v.toFixed(1) : (a >= 1 ? v.toFixed(2) : v.toFixed(3));
    return s.replace(/\.?0+$/, '');
  }

  /* ---------------- 状态提交 ---------------- */
  /* 坐标 / 线性值 / XYZ 一起落盘：不会出现"坐标写了、RGB 还是旧的" */
  function commitRes(res) {
    state.h = res.h;
    state.c = res.c;
    state.l = res.l;
    state.xyz = P.xyzFromLin(res.lin);
    state.clamped = !!res.clamped;
    state.browsing = false;
    state.outGamut = !P.inGamut(res.lin);
    want.c = res.c;
  }
  /* 从 XYZ 重新算模型坐标；颜色本身不变，越界也不夹 */
  function syncCoords() {
    var p = model().fromXyz(state.xyz);
    if (p && p.every(function (v) { return isFinite(v); })) {
      state.h = p[0]; state.c = p[1]; state.l = p[2];
    }
    state.browsing = false;
    state.clamped = false;
    state.outGamut = !P.inGamut(linOf());
  }
  /* 外部颜色（HEX / 编码 RGB / 换色域换曲线）原样保留 XYZ，不自动贴合 */
  function assignXyz(xyz) {
    if (!xyz || xyz.length !== 3 || !xyz.every(function (v) { return isFinite(v); })) return false;
    state.xyz = xyz.slice();
    syncCoords();
    scheduleRender(false);
    return true;
  }

  function setSliceHue(h, fast) {
    h = wrap(h);
    var res = G.resolveSelection(P, state.model, { h: h, c: want.c, l: state.l, lockLightness: true });
    if (res) commitRes(res);
    else { state.h = h; state.browsing = true; }
    scheduleRender(fast);
  }
  function pickWheel(h, c, fast) {
    var res = G.resolveSelection(P, state.model, { h: h, c: c, l: state.l, lockLightness: true, strict: true });
    if (!res) { setStatus('warn', T.codeOut); return false; }
    commitRes(res);
    scheduleRender(fast);
    return true;
  }
  function pickSlice(c, l, fast) {
    var res = G.resolveSelection(P, state.model, { h: state.h, c: c, l: l, lockLightness: false });
    if (!res) { setStatus('warn', T.codeOut); return false; }
    commitRes(res);
    scheduleRender(fast);
    return true;
  }

  /* ---------------- 色相轮几何缓存 ---------------- */
  var wgeo = { key: '', k: 0, rMax: 0, projAt: null, discAt: null, discKey: '', discScale: 0, ringAt: null };

  /* 投影与彩色层都只依赖线性几何，所以缓存键里不放曲线；
     但 HSV 的坐标是编码值，换曲线会改变它的图，故 HSV 单独把曲线放进键。 */
  function geoKey() {
    return state.model + '|' + state.lw + '|' + P.gamut().key +
      (state.model === 'hsv' ? '|' + state.transferId + '|' + state.lb : '');
  }

  function buildWheelGeom() {
    var proj = G.projectGamut(P, state.model, { steps: 32 });
    wgeo.rMax = proj.rMax;
    wgeo.k = G.wheelScale(proj.rMax, INNER_R, CURSOR_PAD);
    var PS = Math.round(WS * dpr);
    var mask = G.rasterizeTriangles(proj.triangles, { size: PS, k: wgeo.k * dpr, ox: PS / 2, oy: PS / 2 });
    var soft = G.blurMask(mask, PS, 1);
    var at = wgeo.projAt || (wgeo.projAt = document.createElement('canvas'));
    at.width = PS; at.height = PS;
    var c2 = at.getContext('2d');
    var img = c2.createImageData(PS, PS);
    var d = img.data;
    for (var i = 0; i < soft.length; i++) {
      var a = Math.round(soft[i] * 0.13);
      if (!a) continue;
      var o = i * 4;
      d[o] = 118; d[o + 1] = 118; d[o + 2] = 118; d[o + 3] = a;
    }
    for (var y = 0; y < PS; y++) {
      for (var x = 0; x < PS; x++) {
        var idx = y * PS + x;
        if (!mask[idx]) continue;
        var edge = (x === 0 || !mask[idx - 1]) || (x === PS - 1 || !mask[idx + 1]) ||
                   (y === 0 || !mask[idx - PS]) || (y === PS - 1 || !mask[idx + PS]);
        if (!edge) continue;
        var e = idx * 4;
        d[e + 3] = 132;
      }
    }
    c2.putImageData(img, 0, 0);
    buildRing();
    wgeo.key = geoKey();
  }

  function buildRing() {
    var PS = Math.round(WS * dpr);
    var at = wgeo.ringAt || (wgeo.ringAt = document.createElement('canvas'));
    at.width = PS; at.height = PS;
    var c2 = at.getContext('2d');
    c2.clearRect(0, 0, PS, PS);
    var lut = new Array(360);
    for (var a = 0; a < 360; a++) {
      lut[a] = G.ringSrgb(P, state.model, a);
    }
    var img = c2.createImageData(PS, PS);
    var d = img.data;
    var cx = PS / 2, cy = PS / 2;
    var rOut = OUT_R * dpr, rIn = (OUT_R - RING_W) * dpr;
    var gray = [160 / 255, 160 / 255, 160 / 255];
    for (var y = 0; y < PS; y++) {
      var dy = cy - (y + 0.5);
      for (var x = 0; x < PS; x++) {
        var dx = (x + 0.5) - cx;
        var r = Math.hypot(dx, dy);
        if (r < rIn - 1 || r > rOut + 1) continue;
        var h = wrap(Math.atan2(dy, dx) / DEG);
        var i0 = Math.floor(h) % 360, fr = h - Math.floor(h);
        var cA = lut[i0], cB = lut[(i0 + 1) % 360];
        var col = (cA && cB) ? [cA[0] + (cB[0] - cA[0]) * fr, cA[1] + (cB[1] - cA[1]) * fr, cA[2] + (cB[2] - cA[2]) * fr]
                             : (cA || cB || gray);
        var alpha = Math.min(r - rIn + 1, rOut - r + 1, 1);
        if (alpha <= 0) continue;
        var o = (y * PS + x) * 4;
        d[o] = Math.round(col[0] * 255);
        d[o + 1] = Math.round(col[1] * 255);
        d[o + 2] = Math.round(col[2] * 255);
        d[o + 3] = Math.round(alpha * 255);
      }
    }
    c2.putImageData(img, 0, 0);
  }

  function discKey(scale) { return geoKey() + '|' + state.l + '|' + scale; }

  function wheelDiscJob(scale, target) {
    var S = Math.max(32, Math.round(WS * scale));
    if (target.width !== S) { target.width = S; target.height = S; }
    var c2 = target.getContext('2d');
    var img = c2.createImageData(S, S);
    var d = img.data;
    var cx = S / 2, cy = S / 2;
    var rr = INNER_R * scale, k = wgeo.k * scale;
    return {
      S: S, H: S, img: img,
      row: function (y) {
        var dy = cy - (y + 0.5);
        for (var x = 0; x < S; x++) {
          var dx = (x + 0.5) - cx;
          var r = Math.sqrt(dx * dx + dy * dy);
          if (r > rr + 1) continue;
          var h = wrap(Math.atan2(dy, dx) / DEG);
          var c = r / k;
          var lin = P.linAt(state.model, h, c, state.l);
          var edge = rr + 0.5 - r;
          var alpha = edge >= 1 ? 255 : Math.round(Math.max(0, edge) * 255);
          if (!P.inGamut(lin)) continue;
          var xyz = P.xyzFromLin(lin);
          var col = displayRgbXyz(xyz);
          var i = (y * S + x) * 4;
          d[i] = Math.round(col[0] * 255);
          d[i + 1] = Math.round(col[1] * 255);
          d[i + 2] = Math.round(col[2] * 255);
          d[i + 3] = alpha;
        }
      },
      finish: function () {
        c2.putImageData(img, 0, 0);
        wgeo.discAt = target;
        wgeo.discKey = discKey(scale);
        wgeo.discScale = scale;
      }
    };
  }

  function buildWheelDisc(scale) {
    if (!wgeo.discAt) wgeo.discAt = document.createElement('canvas');
    var job = wheelDiscJob(scale, wgeo.discAt);
    for (var y = 0; y < job.H; y++) job.row(y);
    job.finish();
  }

  var discProgKey = '';
  function buildWheelDiscProgressive(scale) {
    var key = discKey(scale);
    if (wgeo.discKey === key || discProgKey === key) return;
    discProgKey = key;
    var target = spareCanvas(wgeo, 'discSpare');
    var job;
    try { job = wheelDiscJob(scale, target); } catch (e) { discProgKey = ''; return; }
    runProgressive('disc', job, function () {
      discProgKey = '';
      wgeo.discSpare = null;
      render(false);
    });
  }

  /* ---------------- 切片缓存 ---------------- */
  var plane = { key: '', at: null, cR: [0, 1], lR: [0, 1], cusp: null, m: null, scale: 1 };

  function planeKey(scale) {
    return geoKey() + '|' + state.h.toFixed(2) + '|' + scale;
  }

  function planeJob(scale, target) {
    var m = model();
    var W = Math.round(CW * scale), H = Math.round(CH * scale);
    if (target.width !== W) { target.width = W; target.height = H; }
    var c2 = target.getContext('2d');
    var slice = P.sliceScan(state.model, state.h);
    var cR = m.ranges.c;
    var l0 = m.ranges.l[0], l1 = P.whiteCoords(state.model)[2];
    if (!(l1 > l0)) l1 = m.ranges.l[1];
    var c0 = cR[0];
    var c1 = slice.cMax > 0 ? Math.min(cR[1], slice.cMax * 1.06) : cR[1];
    if (!(c1 > c0)) c1 = cR[1];
    var img = c2.createImageData(W, H);
    var d = img.data;
    return {
      H: H, W: W,
      row: function (y) {
        var l = l1 - (l1 - l0) * (y / (H - 1));
        for (var x = 0; x < W; x++) {
          var c = c0 + (c1 - c0) * (x / (W - 1));
          var lin = P.linAt(state.model, state.h, c, l);
          var i = (y * W + x) * 4;
          if (P.inGamut(lin)) {
            var xyz = P.xyzFromLin(lin);
            var col = displayRgbXyz(xyz);
            d[i] = Math.round(col[0] * 255);
            d[i + 1] = Math.round(col[1] * 255);
            d[i + 2] = Math.round(col[2] * 255);
          } else {
            d[i] = 233; d[i + 1] = 233; d[i + 2] = 233;
          }
          d[i + 3] = 255;
        }
      },
      finish: function () {
        c2.putImageData(img, 0, 0);
        plane.key = planeKey(scale);
        plane.scale = scale;
        plane.cR = [c0, c1];
        plane.lR = [l0, l1];
        plane.cusp = slice.cusp;
        plane.m = m;
        plane.at = target;
      }
    };
  }

  function buildPlane(scale) {
    if (!plane.at) plane.at = document.createElement('canvas');
    var job = planeJob(scale, plane.at);
    for (var y = 0; y < job.H; y++) job.row(y);
    job.finish();
  }

  var planeProgKey = '';
  function buildPlaneProgressive(scale) {
    var key = planeKey(scale);
    if (plane.key === key || planeProgKey === key) return;
    planeProgKey = key;
    var target = spareCanvas(plane, 'spare');
    var job;
    try { job = planeJob(scale, target); } catch (e) { planeProgKey = ''; return; }
    runProgressive('plane', job, function () {
      planeProgKey = '';
      plane.spare = null;
      render(false);
    });
  }

  /* ---------------- 绘制 ---------------- */
  function label(c2, str, x, y, align, font) {
    c2.font = font || '10px ui-monospace, Menlo, monospace';
    c2.textAlign = align || 'left';
    c2.textBaseline = 'middle';
    c2.lineWidth = 3;
    c2.strokeStyle = 'rgba(255,255,255,0.9)';
    c2.strokeText(str, x, y);
    c2.fillStyle = 'rgba(0,0,0,0.72)';
    c2.fillText(str, x, y);
  }

  function wheelPoint(c, h) { return { x: WC + c * wgeo.k * Math.cos(h * DEG), y: WC - c * wgeo.k * Math.sin(h * DEG) }; }

  function drawWheel(fast) {
    if (wgeo.key !== geoKey()) buildWheelGeom();
    if (!wgeo.discAt) buildWheelDisc(DISC_FAST);
    var scale = fast ? DISC_FAST : DISC_FULL;
    if (wgeo.discKey !== discKey(scale)) {
      if (fast) { cancelProgressive('disc'); discProgKey = ''; buildWheelDisc(scale); }
      else buildWheelDiscProgressive(scale);
    }
    if (fast) scheduleRefine();

    var c2 = wctx;
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, WS, WS);

    if (wgeo.projAt) c2.drawImage(wgeo.projAt, 0, 0, WS, WS);

    c2.imageSmoothingEnabled = true;
    c2.imageSmoothingQuality = 'high';
    if (wgeo.discAt) c2.drawImage(wgeo.discAt, 0, 0, WS, WS);

    c2.save();
    c2.strokeStyle = 'rgba(0,0,0,0.10)';
    c2.lineWidth = 1;
    c2.beginPath();
    c2.moveTo(WC - INNER_R, WC + 0.5); c2.lineTo(WC + INNER_R, WC + 0.5);
    c2.moveTo(WC + 0.5, WC - INNER_R); c2.lineTo(WC + 0.5, WC + INNER_R);
    c2.stroke();
    c2.restore();

    if (wgeo.ringAt) c2.drawImage(wgeo.ringAt, 0, 0, WS, WS);
    [0, 90, 180, 270].forEach(function (deg) {
      var a = deg * DEG;
      var r = OUT_R + 12;
      label(c2, deg + '°', WC + Math.cos(a) * r, WC - Math.sin(a) * r, 'center', '9px ui-monospace, Menlo, monospace');
    });

    var ringP = { x: WC + Math.cos(state.h * DEG) * RING_C, y: WC - Math.sin(state.h * DEG) * RING_C };
    c2.save();
    c2.setLineDash([3, 3]);
    c2.strokeStyle = 'rgba(0,0,0,0.5)';
    c2.lineWidth = 1;
    c2.beginPath();
    c2.moveTo(WC, WC);
    c2.lineTo(ringP.x, ringP.y);
    c2.stroke();
    c2.restore();
    c2.beginPath();
    c2.arc(ringP.x, ringP.y, 4.5, 0, Math.PI * 2);
    c2.fillStyle = '#fff';
    c2.fill();
    c2.lineWidth = 1.6;
    c2.strokeStyle = '#222';
    c2.stroke();

    /* 实际颜色游标：颜色真值来自 XYZ；超出色体时仍显示真实色相，半径收到边界 */
    var act = model().fromXyz(state.xyz);
    if (act) {
      var cp = wheelPoint(Math.min(act[1], wgeo.rMax), act[0]);
      c2.beginPath();
      c2.arc(cp.x, cp.y, 5.5, 0, Math.PI * 2);
      c2.strokeStyle = 'rgba(255,255,255,0.95)';
      c2.lineWidth = 2.5;
      c2.stroke();
      c2.strokeStyle = 'rgba(0,0,0,0.85)';
      c2.lineWidth = 1.2;
      c2.stroke();
    }

    host.setAttribute('data-wheel-bmp', wgeo.discAt ? wgeo.discAt.width : 0);
  }

  function slicePos(c, l) {
    var cR = plane.cR, lR = plane.lR;
    var fx = cR[1] > cR[0] ? (c - cR[0]) / (cR[1] - cR[0]) : 0;
    var fy = lR[1] > lR[0] ? (l - lR[0]) / (lR[1] - lR[0]) : 0;
    return { x: clamp01(fx) * (CW - 1), y: (1 - clamp01(fy)) * (CH - 1) };
  }

  function drawTicks() {
    var m = plane.m || model(), cR = plane.cR, lR = plane.lR;
    var ys = [lR[0], (lR[0] + lR[1]) / 2, lR[1]];
    for (var i = 0; i < ys.length; i++) {
      var y = clamp(slicePos(cR[0], ys[i]).y, 10, CH - 28);
      label(pctx, m.lLabel + ' ' + fmtTick(ys[i]), 4, y, 'left');
    }
    var xs = [cR[0], (cR[0] + cR[1]) / 2, cR[1]];
    for (var j = 0; j < xs.length; j++) {
      var x = clamp(slicePos(xs[j], lR[0]).x, 28, CW - 28);
      label(pctx, fmtTick(xs[j]), x, CH - 10, j === 0 ? 'left' : (j === 2 ? 'right' : 'center'));
    }
  }

  function drawCusp() {
    var cu = plane.cusp;
    if (!cu || cu.c >= model().ranges.c[1] * 0.999) return;
    var m = plane.m || model();
    var p = slicePos(cu.c, cu.l);
    pctx.beginPath();
    pctx.moveTo(p.x, p.y - 5);
    pctx.lineTo(p.x + 5, p.y);
    pctx.lineTo(p.x, p.y + 5);
    pctx.lineTo(p.x - 5, p.y);
    pctx.closePath();
    pctx.fillStyle = 'rgba(255,255,255,0.6)';
    pctx.fill();
    pctx.lineWidth = 1.5;
    pctx.strokeStyle = 'rgba(0,0,0,0.7)';
    pctx.stroke();
    var txt = m.cLabel + ' ' + fmtTick(cu.c) + ' · ' + m.lLabel + ' ' + fmtTick(cu.l);
    var right = p.x > CW * 0.55;
    label(pctx, txt, p.x + (right ? -8 : 8), clamp(p.y - 14, 12, CH - 28), right ? 'right' : 'left');
  }

  function drawPlane(fast) {
    if (!plane.at) buildPlane(PLANE_FAST);
    var scale = fast ? PLANE_FAST : PLANE_FULL;
    if (plane.key !== planeKey(scale)) {
      if (fast) { cancelProgressive('plane'); planeProgKey = ''; buildPlane(scale); }
      else buildPlaneProgressive(scale);
    }
    if (fast) scheduleRefine();
    var c2 = pctx;
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, CW, CH);
    c2.imageSmoothingEnabled = true;
    c2.drawImage(plane.at, 0, 0, CW, CH);
    host.setAttribute('data-plane-bmp', plane.at ? plane.at.width : 0);
    drawTicks();
    drawCusp();

    var y = slicePos(plane.cR[0], state.l).y;
    c2.save();
    c2.setLineDash([4, 3]);
    c2.strokeStyle = 'rgba(0,0,0,0.45)';
    c2.lineWidth = 1;
    c2.beginPath();
    c2.moveTo(0, y + 0.5);
    c2.lineTo(CW, y + 0.5);
    c2.stroke();
    c2.restore();

    var act = model().fromXyz(state.xyz);
    if (act) {
      var dh = ((act[0] - state.h + 540) % 360) - 180;
      if (Math.abs(dh) < 0.02 && !state.browsing) {
        var p = slicePos(act[1], act[2]);
        c2.beginPath();
        c2.arc(p.x, p.y, 6, 0, Math.PI * 2);
        c2.strokeStyle = 'rgba(255,255,255,0.95)';
        c2.lineWidth = 2.5;
        c2.stroke();
        c2.strokeStyle = 'rgba(0,0,0,0.85)';
        c2.lineWidth = 1.2;
        c2.stroke();
      }
    }
  }

  /* ---------------- 读数 ---------------- */
  function setInput(el, value) {
    if (!el || document.activeElement === el) return;
    var s = String(value);
    if (el.value !== s) el.value = s;
  }

  var mcDecs = { l: 2, c: 2 };
  function syncMeta() {
    var m = model();
    mcLabels[0].textContent = m.lLabel;
    mcLabels[1].textContent = m.cLabel;
    mcLabels[2].textContent = m.hLabel || 'h';
    mcDecs.l = m.ranges.l[1] > 2 ? 2 : 3;
    mcDecs.c = m.ranges.c[1] > 2 ? 2 : 3;
    mcIn[0].step = m.ranges.l[1] > 2 ? '0.01' : '0.0001';
    mcIn[1].step = m.ranges.c[1] > 2 ? '0.01' : '0.0001';
  }

  var refineTimer = 0;
  function scheduleRefine() {
    if (refineTimer) window.clearTimeout(refineTimer);
    refineTimer = window.setTimeout(function () {
      refineTimer = 0;
      render(false);
    }, 160);
  }

  function setStatus(kind, text) {
    if (!text) { statusEl.hidden = true; statusEl.textContent = ''; return; }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.className = kind === 'info' ? 'c-pick-status is-info' : 'c-pick-status';
  }

  function shortWhite(w) {
    if (!w) return '';
    if (/D60/.test(w)) return 'D60';
    if (/DCI/.test(w)) return 'DCI';
    return w === 'D65' ? 'D65' : w;
  }

  function transferShort(t) { return transferLabel(t); }

  function toolbarNote() {
    var g = P.gamut(), t = P.transfer();
    var bits = [];
    var ws = whiteSuffix(g);
    if (g.tag !== 'sRGB') {
      bits.push(en
        ? 'Gamut ' + g.tag + (ws ? ' (' + ws + ')' : '') + '.'
        : '色域 ' + g.tag + (ws ? '（' + ws + '）' : '') + '。');
    }
    if (t.kind === 'scene') {
      bits.push(en
        ? 'Scene encoding: linear 1.0 is this tool’s comparison white (18% grey = 0.18), not a sensor or display peak; L_w does not scale it.'
        : '场景编码：线性 1.0 是本工具的比较白（18% 灰 = 0.18），不是传感器或显示峰值；L_w 不作用于它。');
    } else {
      var lb = t.need && t.need.lb ? '，黑位 L_b = ' + state.lb + ' cd/m²' : '';
      bits.push(en
        ? 'Display EOTF: linear 1.0 = L_w = ' + state.lw + ' cd/m²' + (lb ? '; L_b = ' + state.lb + ' cd/m²' : '') + '.'
        : '显示 EOTF：线性 1.0 = L_w = ' + state.lw + ' cd/m²' + (lb ? '；L_b = ' + state.lb + ' cd/m²' : '') + '。');
    }
    if (t.approx) {
      bits.push(en ? '* sampled curve: an approximation, not the vendor formula.'
                   : '* 采样曲线：近似，不是厂商解析式。');
    }
    if (usesWhite()) {
      bits.push(en
        ? 'This model also uses L_w' + (state.model === 'jmh' ? ' (L_A = 0.2·L_w).' : '.')
        : '该模型还受 L_w 影响' + (state.model === 'jmh' ? '（L_A = 0.2·L_w）' : '') + '。');
    } else if (t.kind !== 'scene' && !lwNeededByTransfer()) {
      /* 模型与曲线都不需要 L_w：控件已禁用，说明清楚它此刻只决定绝对亮度读数的比例 */
      bits.push(en
        ? 'L_w is fixed at ' + state.lw + ' cd/m² for this combination — it only scales the absolute-luminance row.'
        : '当前组合下 L_w 固定为 ' + state.lw + ' cd/m²：它只作绝对亮度读数的比例基准。');
    }
    return bits.join(' ');
  }

  function syncControls() {
    var g = P.gamut(), t = P.transfer();
    var lwOn = lwActive();
    if (lumLabel) {
      lumLabel.classList.toggle('is-muted', !lwOn);
      lumLabel.title = lwReason();
    }
    if (lumSel) {
      lumSel.disabled = !lwOn;
      lumSel.setAttribute('aria-disabled', lwOn ? 'false' : 'true');
    }
    if (gamutWhite) {
      var w = whiteSuffix(g);
      gamutWhite.hidden = !w;
      if (w) gamutWhite.textContent = shortWhite(w);
    }
    /* 显示曲线是默认语义，不再加徽标；只有场景曲线要醒目提示它与显示 EOTF 不同 */
    if (transferKind) {
      transferKind.hidden = t.kind !== 'scene';
      transferKind.textContent = t.kind === 'scene' ? (en ? 'scene' : '场景') : '';
    }
    if (lbLabel) lbLabel.hidden = !(t.need && t.need.lb);
    if (noteEl) noteEl.textContent = toolbarNote();
    updatePairButton();
  }

  function render(fast) {
    var m = model();
    var g = P.gamut();
    var code = codeOf();
    var outSrgb = !inSrgb();
    var s = srgbOf();
    var hex = hexOf(s);
    hexIn.value = hex;
    swatch.style.background = hex;
    setInput(hueNum, roundTo(state.h, 1));
    if (code) {
      setInput(srgbIn[0], Math.round(clamp01(code[0]) * 255));
      setInput(srgbIn[1], Math.round(clamp01(code[1]) * 255));
      setInput(srgbIn[2], Math.round(clamp01(code[2]) * 255));
    }
    setInput(mcIn[0], roundTo(state.l, mcDecs.l));
    setInput(mcIn[1], roundTo(state.c, mcDecs.c));
    setInput(mcIn[2], roundTo(state.h, 1));
    wheelTitle.textContent = m.lLabel + ' ' + roundTo(state.l, mcDecs.l).toFixed(mcDecs.l);
    if (state.browsing) setStatus('warn', T.browsing);
    else if (state.outGamut) setStatus('warn', T.outGamut(g.tag));
    else if (state.clamped) setStatus('warn', T.clamped);
    else if (outSrgb) setStatus('info', T.outSrgbNote(g.tag));
    else setStatus('', '');
    if (fitBtn) fitBtn.hidden = !state.outGamut;
    if (oogsEl) oogsEl.hidden = !outSrgb;
    if (rgbTitle) {
      /* 编码框必须能看出「哪个原色 + 哪条曲线」：同一条 sRGB 原色，换 BT.1886 后
         码值不再等于 sRGB 码值，所以曲线名要写在标题里，不能只靠 HEX 旁边那句 */
      var tName = transferShort(P.transfer());
      /* 场景曲线的标签是资料页整条标题（含色域名），这里去掉与色域重复的前缀 */
      if (tName.indexOf(g.tag) === 0) {
        var rest = tName.slice(g.tag.length).replace(/^\s*\/\s*/, '').trim();
        if (rest) tName = rest;
      }
      var head = (en ? 'Code · ' : '编码 · ') + g.tag;
      if (P.transfer().id !== 'srgb') head += ' / ' + tName;
      rgbTitle.textContent = head + (en ? ' (0–255)' : '（0–255）');
      rgbTitle.title = head;
    }
    syncControls();
    drawWheel(fast);
    drawPlane(fast);
    drawAxes();
    renderTable(state.xyz);
  }

  var pending = false, pendingFast = false;
  function scheduleRender(fast) {
    pendingFast = !!fast;
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () {
      pending = false;
      render(pendingFast);
      pendingFast = false;
    });
  }

  function drawAxes() {
    var m = plane.m || model();
    axes.textContent = m.cLabel + ' ' + fmtTick(plane.cR[0]) + '–' + fmtTick(plane.cR[1]) + ' · ' +
      m.lLabel + ' ' + fmtTick(plane.lR[0]) + '–' + fmtTick(plane.lR[1]);
  }

  /* ---------------- 读数表 ---------------- */
  var ROW_LABEL = { hex: 'HEX / sRGB', lab: 'Lab', xyz: 'XYZ (D65)' };
  var ROW_TAG = { jmh: 'L_w', jzch: 'L_w', jmhh: 'L_A = 100' };

  function optionLabel(id) {
    var el = modelSel.querySelector('option[value="' + id + '"]');
    return el ? el.textContent : id;
  }

  function readings(xyz) {
    var g = P.gamut(), t = P.transfer();
    var srgb = P.srgbFromXyz(xyz);
    var outOfSrgb = !P.inSrgb(xyz);
    var code = P.rgbFromXyz(xyz);
    var lin = P.linFromXyz(xyz);
    var out = [], hex = hexOf(srgb);
    var lab = P.labFromXyz(xyz);
    var p;
    out.push({ id: 'hex', label: 'HEX / sRGB',
      parts: [['', hex], ['', srgb.map(function (v) { return Math.round(clamp01(v) * 255); }).join(' ')]],
      tag: outOfSrgb ? T.outSrgb : '',
      copy: hex });
    if (code) {
      out.push({ id: 'code', label: (en ? 'Code · ' : '码值 · ') + g.tag,
        parts: [['R', f(code[0], 4)], ['G', f(code[1], 4)], ['B', f(code[2], 4)]],
        tag: transferShort(t) + (whiteSuffix(g) ? ' · ' + whiteSuffix(g) : ''),
        copy: g.tag + ' [' + transferShort(t) + '] ' +
              code.map(function (v) { return f(v, 4); }).join(' ') });
    }
    out.push({ id: 'lin', label: T.linearLabel(g.tag),
      parts: [['R', f(lin[0], 4)], ['G', f(lin[1], 4)], ['B', f(lin[2], 4)]],
      tag: t.kind === 'scene' ? (en ? '18% = 0.18' : '18% = 0.18') : 'L_w',
      copy: lin.map(function (v) { return f(v, 4); }).join(', ') });
    if (t.kind === 'display') {
      var abs = P.absFromLin(lin);
      out.push({ id: 'abs', label: T.absLabel,
        parts: [['R', f(abs[0], 2)], ['G', f(abs[1], 2)], ['B', f(abs[2], 2)]],
        tag: 'cd/m²',
        copy: abs.map(function (v) { return f(v, 2); }).join(', ') + ' cd/m²' });
    }
    p = P.models.hsv.fromXyz(xyz);
    if (p) out.push({ id: 'hsv', label: optionLabel('hsv') + (t.kind === 'scene' ? '' : ''),
      parts: [['H', f(p[0], 1) + '°'], ['S', f(p[1] * 100, 1) + '%'], ['V', f(p[2] * 100, 1) + '%']],
      tag: en ? 'encoded' : '编码',
      copy: 'hsv(' + f(p[0], 1) + ', ' + f(p[1] * 100, 1) + '%, ' + f(p[2] * 100, 1) + '%) [' + g.tag + ' code]' });
    p = P.models.lch.fromXyz(xyz);
    out.push({ id: 'lch', label: optionLabel('lch'),
      parts: [['L*', f(p[2], 2)], ['C*', f(p[1], 2)], ['h', f(p[0], 1) + '°']],
      copy: 'lch(' + f(p[2], 2) + '% ' + f(p[1], 2) + ' ' + f(p[0], 1) + ')' });
    p = P.models.oklch.fromXyz(xyz);
    out.push({ id: 'oklch', label: optionLabel('oklch'),
      parts: [['L', f(p[2], 3)], ['C', f(p[1], 3)], ['h', f(p[0], 1) + '°']],
      copy: 'oklch(' + f(p[2], 3) + ' ' + f(p[1], 3) + ' ' + f(p[0], 1) + ')' });
    p = P.models.jmh.fromXyz(xyz);
    out.push({ id: 'jmh', label: optionLabel('jmh'),
      parts: [['J', f(p[2], 1)], ['M', f(p[1], 1)], ['h', f(p[0], 1) + '°']],
      copy: 'JMH(CAM02) J ' + f(p[2], 1) + ' M ' + f(p[1], 1) + ' h ' + f(p[0], 1) });
    p = P.models.jmhh.fromXyz(xyz);
    out.push({ id: 'jmhh', label: optionLabel('jmhh'),
      parts: [['J', f(p[2], 1)], ['M', f(p[1], 1)], ['h', f(p[0], 1) + '°']],
      copy: 'JMH(Hellwig) J ' + f(p[2], 1) + ' M ' + f(p[1], 1) + ' h ' + f(p[0], 1) });
    p = P.models.jzch.fromXyz(xyz);
    out.push({ id: 'jzch', label: optionLabel('jzch'),
      parts: [['Jz', f(p[2], 3)], ['Cz', f(p[1], 3)], ['h', f(p[0], 1) + '°']],
      copy: 'Jz ' + f(p[2], 3) + ' Cz ' + f(p[1], 3) + ' h ' + f(p[0], 1) });
    out.push({ id: 'lab', label: ROW_LABEL.lab,
      parts: [['L*', f(lab[0], 2)], ['a*', f(lab[1], 2)], ['b*', f(lab[2], 2)]],
      copy: 'lab(' + f(lab[0], 2) + ' ' + f(lab[1], 2) + ' ' + f(lab[2], 2) + ')' });
    out.push({ id: 'xyz', label: ROW_LABEL.xyz,
      parts: [['X', f(xyz[0], 4)], ['Y', f(xyz[1], 4)], ['Z', f(xyz[2], 4)]],
      copy: 'X ' + f(xyz[0], 4) + ' Y ' + f(xyz[1], 4) + ' Z ' + f(xyz[2], 4) });
    return out;
  }

  /* 读数表三组：编码 / 模型 / CIE 与线性；组间加一条 2px 分隔 */
  var ROW_GROUP = {
    hex: 0, code: 0, lin: 0, abs: 0,
    hsv: 1, lch: 1, oklch: 1, jmh: 1, jmhh: 1, jzch: 1,
    lab: 2, xyz: 2
  };

  function renderTable(xyz) {
    var rows = readings(xyz), frag = document.createDocumentFragment();
    var prevGroup = null;
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.className = 'c-ins-row';
      var group = ROW_GROUP[r.id];
      if (prevGroup !== null && group !== prevGroup) tr.className += ' is-group-start';
      prevGroup = group;
      if (r.id === state.model) tr.className += ' is-active';
      var tdLabel = document.createElement('td');
      tdLabel.textContent = r.label;
      var tdVal = document.createElement('td');
      r.parts.forEach(function (part, i) {
        if (i) tdVal.appendChild(document.createTextNode(' · '));
        if (part[0]) {
          var k = document.createElement('span');
          k.className = 'c-ins-k';
          k.textContent = part[0];
          tdVal.appendChild(k);
          tdVal.appendChild(document.createTextNode(' '));
        }
        var v = document.createElement('span');
        v.className = 'c-ins-v';
        v.textContent = part[1];
        tdVal.appendChild(v);
      });
      var tagText = r.tag || ROW_TAG[r.id];
      if (tagText) {
        var tag = document.createElement('span');
        tag.className = 'c-ins-tag';
        tag.textContent = tagText;
        tdVal.appendChild(document.createTextNode(' '));
        tdVal.appendChild(tag);
      }
      var tdCopy = document.createElement('td');
      tdCopy.className = 'c-ins-copycell';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c-ins-copy';
      btn.setAttribute('data-copy', r.copy);
      btn.setAttribute('aria-label', (en ? 'Copy ' : '复制 ') + r.label);
      btn.textContent = '\u2398';
      tdCopy.appendChild(btn);
      tr.appendChild(tdLabel);
      tr.appendChild(tdVal);
      tr.appendChild(tdCopy);
      frag.appendChild(tr);
    });
    coords.innerHTML = '';
    coords.appendChild(frag);
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 剪贴板不可用就算了 */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else {
      fallback();
    }
  }
  coords.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.c-ins-copy') : null;
    if (!btn) return;
    copyText(btn.getAttribute('data-copy') || '');
    btn.textContent = '\u2713';
    btn.classList.add('is-done');
    setTimeout(function () {
      btn.textContent = '\u2398';
      btn.classList.remove('is-done');
    }, 900);
  });

  /* ---------------- 指针交互 ---------------- */
  var drag = null;

  function toWheel(e) {
    var r = wheelCanvas.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / (r.width || 1)) * WS,
      y: clamp01((e.clientY - r.top) / (r.height || 1)) * WS
    };
  }
  function toSlice(e) {
    var r = planeCanvas.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / (r.width || 1)) * CW,
      y: clamp01((e.clientY - r.top) / (r.height || 1)) * CH
    };
  }
  function wheelHit(p) {
    var r = Math.hypot(p.x - WC, p.y - WC);
    if (r >= RING_C - RING_W / 2 && r <= RING_C + RING_W / 2) return 'ring';
    if (r < INNER_R) return 'wheel';
    return null;
  }
  function angleAt(p) { return wrap(Math.atan2(WC - p.y, p.x - WC) / DEG); }
  function chromaAt(p) { return Math.hypot(p.x - WC, p.y - WC) / (wgeo.k || 1); }

  function wheelAction(p, fast) {
    if (drag.mode === 'ring') { setSliceHue(angleAt(p), fast); return; }
    var c = chromaAt(p);
    var h = c < wgeo.rMax * 1e-3 ? state.h : angleAt(p);
    pickWheel(h, c, fast);
  }

  wheelCanvas.addEventListener('pointerdown', function (e) {
    var p = toWheel(e);
    var mode = wheelHit(p);
    if (!mode) return;
    if (mode === 'wheel') {
      var c0 = chromaAt(p);
      var h0 = c0 < wgeo.rMax * 1e-3 ? state.h : angleAt(p);
      if (!P.inGamut(P.linAt(state.model, h0, c0, state.l))) return;
    }
    drag = { mode: mode };
    try { if (wheelCanvas.setPointerCapture) wheelCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    wheelAction(p, false);
  });
  wheelCanvas.addEventListener('pointermove', function (e) {
    if (!drag || drag.mode === 'slice') return;
    wheelAction(toWheel(e), true);
  });

  planeCanvas.addEventListener('pointerdown', function (e) {
    drag = { mode: 'slice' };
    try { if (planeCanvas.setPointerCapture) planeCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    sliceAction(toSlice(e), false);
  });
  planeCanvas.addEventListener('pointermove', function (e) {
    if (!drag || drag.mode !== 'slice') return;
    sliceAction(toSlice(e), true);
  });
  function sliceAction(p, fast) {
    var cR = plane.cR, lR = plane.lR;
    var fx = clamp01(p.x / (CW - 1)), fy = clamp01(p.y / (CH - 1));
    pickSlice(cR[0] + (cR[1] - cR[0]) * fx, lR[1] - (lR[1] - lR[0]) * fy, fast);
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
    wheelCanvas.addEventListener(ev, function () { drag = null; scheduleRender(false); });
    planeCanvas.addEventListener(ev, function () { drag = null; scheduleRender(false); });
  });

  /* ---------------- 表单 ---------------- */
  hueNum.addEventListener('input', function () {
    var v = parseFloat(hueNum.value);
    if (!isFinite(v)) return;
    setSliceHue(v, false);
  });

  modelSel.addEventListener('change', function () {
    state.model = modelSel.value;
    syncMeta();
    syncCoords();
    scheduleRender();
  });

  gamutSel.addEventListener('change', function () {
    var prev = state.gamutKey;
    if (gamutSel.value === prev) return;
    var target = null;
    (cfg.gamuts || []).forEach(function (g) { if (g.key === gamutSel.value) target = g; });
    if (!target) return;
    if (!P.setGamut(target.key)) { gamutSel.value = prev; return; }
    if (rejectCombo(P.gamut(), P.transfer())) { P.setGamut(prev); gamutSel.value = prev; return; }
    state.gamutKey = target.key;
    /* 保持同一 XYZ：新色体装不下时只提示，不暗中夹颜色 */
    syncCoords();
    scheduleRender();
  });

  function applyTransfer(id) {
    var t = transfersById[id];
    if (!t) return false;
    if (rejectCombo(P.gamut(), t)) {
      if (transferSel) transferSel.value = state.transferId;
      return false;
    }
    state.transferId = id;
    P.setTransfer(t, { lw: state.lw, lb: state.lb });
    syncCoords();
    scheduleRender();
    return true;
  }

  if (transferSel) {
    transferSel.addEventListener('change', function () { applyTransfer(transferSel.value); });
  }

  if (pairBtn) {
    pairBtn.addEventListener('click', function () {
      var target = pairingFor(state.gamutKey);
      if (!target || !transfersById[target]) return;
      if (rejectCombo(P.gamut(), transfersById[target])) return;
      state.transferId = target;
      transferSel.value = target;
      P.setTransfer(transfersById[target], { lw: state.lw, lb: state.lb });
      syncCoords();
      scheduleRender();
    });
  }

  hexIn.addEventListener('input', function () {
    var rgb = parseHex(hexIn.value);
    if (!rgb) return;
    assignXyz(P.xyzFromSrgb(rgb));
  });

  /* R / G / B 框是**所选空间的编码值**；解码后经所选原色矩阵得到 XYZ */
  srgbIn.forEach(function (el) {
    el.addEventListener('input', function () {
      var v = srgbIn.map(function (i) { return parseFloat(i.value); });
      if (v.some(function (q) { return !isFinite(q); })) return;
      var code = v.map(function (q) { return clamp(q, 0, 255) / 255; });
      var lin = P.linearRgbFromCode(code);
      if (!lin) { setStatus('warn', T.codeOut); return; }
      assignXyz(P.xyzFromLin(lin));
    });
  });

  mcIn.forEach(function (el) {
    el.addEventListener('input', function () {
      var l = parseFloat(mcIn[0].value), c = parseFloat(mcIn[1].value), h = parseFloat(mcIn[2].value);
      if (!isFinite(l) || !isFinite(c) || !isFinite(h)) return;
      var res = G.resolveSelection(P, state.model, { h: h, c: c, l: l, lockLightness: false });
      if (!res) { setStatus('warn', T.codeOut); return; }
      commitRes(res);
      render(false);
    });
  });

  [hexIn, hueNum].concat(srgbIn, mcIn).forEach(function (el) {
    el.addEventListener('blur', function () { render(false); });
  });

  if (fitBtn) {
    fitBtn.addEventListener('click', function () {
      var res = G.resolveSelection(P, state.model, { h: state.h, c: state.c, l: state.l, lockLightness: false });
      if (res) { commitRes(res); scheduleRender(false); }
    });
  }

  function syncWhite() {
    var lw = parseFloat(lumSel.value) || 100;
    if (state.lb >= lw || !P.setWhite(lw)) {
      lumSel.value = String(state.lw);
      setStatus('warn', T.blackInvalid);
      return false;
    }
    state.lw = lw;
    return true;
  }
  lumSel.addEventListener('change', function () {
    if (!syncWhite()) return;
    if (transferSel) P.setTransfer(transfersById[state.transferId] || P.transfer(), { lw: state.lw, lb: state.lb });
    syncCoords();
    scheduleRender();
  });

  if (lbIn) {
    lbIn.addEventListener('input', function () {
      var v = parseFloat(lbIn.value);
      if (!isFinite(v) || !P.setBlack(v)) {
        lbIn.setCustomValidity(T.blackInvalid);
        setStatus('warn', T.blackInvalid);
        return;
      }
      lbIn.setCustomValidity('');
      state.lb = v;
      syncCoords();
      scheduleRender(false);
    });
    lbIn.addEventListener('change', function () {
      if (!lbIn.checkValidity()) { lbIn.value = String(state.lb); lbIn.setCustomValidity(''); setStatus('warn', T.blackInvalid); }
    });
  }

  /* ---------------- 初始化 ---------------- */
  modelSel.value = state.model;
  /* 去掉矩阵校验失败的原色选项，避免选中后整页空白 */
  if (gamutSel) {
    var validKeys = {};
    cfg.gamuts.forEach(function (g) {
      if (!validGamut(g)) {
        var opt = gamutSel.querySelector('option[value="' + g.key + '"]');
        if (opt) opt.disabled = true;
      } else validKeys[g.key] = true;
    });
    var sel = gamutSel.value;
    if (!validKeys[sel]) {
      var first = Object.keys(validKeys)[0];
      if (first) { gamutSel.value = first; sel = first; }
    }
    state.gamutKey = sel;
    P.setGamut(sel);
  }
  state.transferId = transferSel ? transferSel.value : 'srgb';
  P.setTransfer(transfersById[state.transferId] || P.transfer(), { lw: 100, lb: 0 });
  syncWhite();
  syncMeta();

  var init = G.resolveSelection(P, 'lch', { h: 40, c: 45, l: 65, lockLightness: false });
  if (init) {
    state.h = init.h; state.c = init.c; state.l = init.l;
    state.xyz = P.xyzFromLin(init.lin); want.c = init.c;
  } else {
    var p0 = P.models.lch.fromRgb([1, 0, 0]);
    state.h = p0[0]; state.c = p0[1]; state.l = p0[2];
    state.xyz = P.xyzFromSrgb([1, 0, 0]);
  }
  render(false);
})();
