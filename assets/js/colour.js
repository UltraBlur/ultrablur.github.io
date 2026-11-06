/* ------------------------------------------------------------------
 * 色彩空间数据库 · 交互图表
 * 无依赖，纯 Canvas + SVG。数据由页面内嵌 JSON 注入。
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  var LOCUS = window.CIE1931_LOCUS || [];

  /* ============================ 工具 ============================ */

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function parseData(root) {
    var el = root.querySelector('script#colour-data') ||
             document.querySelector('script#colour-data') ||
             root.querySelector('script[type="application/json"]') ||
             document.querySelector('script[type="application/json"]');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  /* 界面文案：由页面注入，缺省为中文 */
  var UI = (function () {
    var el = document.querySelector('script#colour-ui');
    var d = {};
    if (el) { try { d = JSON.parse(el.textContent) || {}; } catch (e) { d = {}; } }
    var fallback = {
      xStops: '相对 18% 灰的档位（stops）',
      xEncoded: '编码值（0–1）',
      xNorm: '归一化码值（0–1）',
      xCode: '量化码值（{b}-bit，{m}）',
      yLum: '亮度（cd/m²）',
      tipStops: '档位',
      tipCode: '码值',
      tipNorm: '归一化',
      tipLum: '亮度',
      tipLinear: '线性',
      tipEncoded: '编码'
    };
    for (var k in fallback) if (d[k] === undefined) d[k] = fallback[k];
    return d;
  })();

  function svgEl(name, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* CIE xy -> sRGB 8bit（Y 归一，gamma 近似 1/2.2） */
  function xyToRgb(x, y) {
    if (y <= 1e-4) return null;
    var X = x / y, Y = 1, Z = (1 - x - y) / y;
    var r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
    var g = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
    var b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    return [
      Math.round(255 * Math.pow(clamp01(r), 1 / 2.2)),
      Math.round(255 * Math.pow(clamp01(g), 1 / 2.2)),
      Math.round(255 * Math.pow(clamp01(b), 1 / 2.2))
    ];
  }

  /* 点是否在三角形内 */
  function inTriangle(px, py, A, B, C) {
    var d1 = (px - B[0]) * (A[1] - B[1]) - (A[0] - B[0]) * (py - B[1]);
    var d2 = (px - C[0]) * (B[1] - C[1]) - (B[0] - C[0]) * (py - C[1]);
    var d3 = (px - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (py - A[1]);
    var neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    var pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
  }

  /* ======================== 色域图 ======================== */

  var DOM = { x0: -0.10, x1: 0.90, y0: -0.10, y1: 0.90 };
  var TICK = 0.2;
  var MARGIN = { l: 48, b: 50, t: 14, r: 16 };

  /* 由光谱轨迹与原色共同决定正方形坐标范围，避免宽色域被裁掉 */
  function computeDomain(prim) {
    var xs = [], ys = [], i;
    for (i = 0; i < LOCUS.length; i++) { xs.push(LOCUS[i][0]); ys.push(LOCUS[i][1]); }
    for (i = 0; i < prim.length; i++) { xs.push(prim[i][0]); ys.push(prim[i][1]); }
    var pad = 0.06;
    var minX = Math.min.apply(null, xs) - pad, maxX = Math.max.apply(null, xs) + pad;
    var minY = Math.min.apply(null, ys) - pad, maxY = Math.max.apply(null, ys) + pad;
    var side = Math.max(maxX - minX, maxY - minY, 0.9);
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    DOM = { x0: cx - side / 2, x1: cx + side / 2, y0: cy - side / 2, y1: cy + side / 2 };
    TICK = side <= 1.05 ? 0.2 : 0.25;
  }

  function initGamut(fig) {
    var data = parseData(fig);
    if (!data || !LOCUS.length) return;

    var chart = fig.querySelector('.c-chart');
    var canvas = fig.querySelector('canvas');
    var svg = fig.querySelector('svg');
    var tip = fig.querySelector('.c-tip');
    var ctx = canvas.getContext('2d');
    var prim = data.primaries, wp = data.white;

    var geo = null;

    function computeGeo() {
      var W = chart.clientWidth;
      if (W < 200) return null;
      var plot = Math.max(180, W - MARGIN.l - MARGIN.r);
      var H = MARGIN.t + plot + MARGIN.b;
      return {
        W: W, H: H, plot: plot,
        sx: function (x) { return MARGIN.l + (x - DOM.x0) / (DOM.x1 - DOM.x0) * plot; },
        sy: function (y) { return MARGIN.t + (DOM.y1 - y) / (DOM.y1 - DOM.y0) * plot; },
        ix: function (px) { return DOM.x0 + (px - MARGIN.l) / plot * (DOM.x1 - DOM.x0); },
        iy: function (py) { return DOM.y1 - (py - MARGIN.t) / plot * (DOM.y1 - DOM.y0); }
      };
    }

    /* 用光谱轨迹多边形做遮罩，再逐像素上色 */
    function paintSpectrum(g) {
      var plot = Math.round(g.plot);
      var tmp = document.createElement('canvas');
      tmp.width = plot; tmp.height = plot;
      var tctx = tmp.getContext('2d');

      tctx.clearRect(0, 0, plot, plot);
      tctx.beginPath();
      for (var i = 0; i < LOCUS.length; i++) {
        var px = (LOCUS[i][0] - DOM.x0) / (DOM.x1 - DOM.x0) * plot;
        var py = (DOM.y1 - LOCUS[i][1]) / (DOM.y1 - DOM.y0) * plot;
        if (i === 0) tctx.moveTo(px, py); else tctx.lineTo(px, py);
      }
      tctx.closePath();
      tctx.fillStyle = '#fff';
      tctx.fill();

      var mask = tctx.getImageData(0, 0, plot, plot).data;
      var img = tctx.createImageData(plot, plot);
      var out = img.data;

      for (var yy = 0; yy < plot; yy++) {
        for (var xx = 0; xx < plot; xx++) {
          var o = (yy * plot + xx) * 4;
          if (mask[o + 3] < 128) continue;
          var x = DOM.x0 + (xx + 0.5) / plot * (DOM.x1 - DOM.x0);
          var y = DOM.y1 - (yy + 0.5) / plot * (DOM.y1 - DOM.y0);
          var rgb = xyToRgb(x, y);
          if (!rgb) continue;
          var inside = inTriangle(x, y, prim[0], prim[1], prim[2]);
          out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2];
          out[o + 3] = 64;
        }
      }
      tctx.putImageData(img, 0, 0);

      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(plot * dpr);
      canvas.height = Math.round(plot * dpr);
      canvas.style.left = MARGIN.l + 'px';
      canvas.style.top = MARGIN.t + 'px';
      canvas.style.width = plot + 'px';
      canvas.style.height = plot + 'px';
      canvas.style.opacity = '1';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    }

    function drawAxes(g) {
      svg.setAttribute('viewBox', '0 0 ' + g.W + ' ' + g.H);
      svg.setAttribute('width', g.W);
      svg.setAttribute('height', g.H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var i, x, y;
      /* 网格 */
      function tickLabel(v) { return String(Math.round(v * 100) / 100); }
      var gridG = svgEl('g', { 'class': 'c-grid' });
      for (var gx = Math.ceil(DOM.x0 / TICK) * TICK; gx <= DOM.x1 + 1e-9; gx += TICK) {
        gridG.appendChild(svgEl('line', {
          x1: g.sx(gx), y1: g.sy(DOM.y0), x2: g.sx(gx), y2: g.sy(DOM.y1)
        }));
      }
      for (var gy = Math.ceil(DOM.y0 / TICK) * TICK; gy <= DOM.y1 + 1e-9; gy += TICK) {
        gridG.appendChild(svgEl('line', {
          x1: g.sx(DOM.x0), y1: g.sy(gy), x2: g.sx(DOM.x1), y2: g.sy(gy)
        }));
      }
      svg.appendChild(gridG);

      /* 刻度与数字 */
      var axisG = svgEl('g', { 'class': 'c-axis' });
      for (var tx = Math.ceil(DOM.x0 / 0.2) * 0.2; tx <= DOM.x1 + 1e-9; tx += 0.2) {
        var X = g.sx(tx);
        axisG.appendChild(svgEl('line', { x1: X, y1: g.sy(DOM.y0), x2: X, y2: g.sy(DOM.y0) + 4 }));
        var t = svgEl('text', { x: X, y: g.H - MARGIN.b + 20, 'text-anchor': 'middle' });
        t.textContent = tickLabel(tx);
        axisG.appendChild(t);
      }
      for (var ty = Math.ceil(DOM.y0 / 0.2) * 0.2; ty <= DOM.y1 + 1e-9; ty += 0.2) {
        var Y = g.sy(ty);
        axisG.appendChild(svgEl('line', { x1: g.sx(DOM.x0) - 4, y1: Y, x2: g.sx(DOM.x0), y2: Y }));
        var t2 = svgEl('text', { x: g.sx(DOM.x0) - 9, y: Y + 4, 'text-anchor': 'end' });
        t2.textContent = tickLabel(ty);
        axisG.appendChild(t2);
      }
      svg.appendChild(axisG);

      /* 坐标框 */
      svg.appendChild(svgEl('rect', {
        x: g.sx(DOM.x0), y: g.sy(DOM.y1),
        width: g.plot, height: g.plot,
        fill: 'none', 'class': 'c-frame'
      }));

      /* 轴标签 */
      var lx = svgEl('text', { x: g.sx(DOM.x0) + g.plot / 2, y: g.H - 8, 'text-anchor': 'middle', 'class': 'c-axtitle' });
      lx.textContent = 'CIE x';
      svg.appendChild(lx);
      var ly = svgEl('text', {
        x: 15, y: g.sy(DOM.y0) - g.plot / 2, 'text-anchor': 'middle', 'class': 'c-axtitle',
        transform: 'rotate(-90 15 ' + (g.sy(DOM.y0) - g.plot / 2) + ')'
      });
      ly.textContent = 'CIE y';
      svg.appendChild(ly);

      /* 色域三角形 */
      var pts = [prim[0], prim[1], prim[2]].map(function (p) { return [g.sx(p[0]), g.sy(p[1])]; });
      var d = 'M' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join('L') + 'Z';
      svg.appendChild(svgEl('path', { d: d, 'class': 'c-gamut-tri' }));

      /* 原色点与标签 */
      var names = ['R', 'G', 'B'];
      for (i = 0; i < 3; i++) {
        svg.appendChild(svgEl('circle', { cx: pts[i][0], cy: pts[i][1], r: 3.4, 'class': 'c-prim' }));
        var lb = svgEl('text', {
          x: pts[i][0] + (i === 1 ? 8 : 8), y: pts[i][1] + (i === 2 ? 13 : -7),
          'class': 'c-dotlabel', 'text-anchor': 'start'
        });
        lb.textContent = names[i];
        svg.appendChild(lb);
      }
      /* 白点 */
      var wx = g.sx(wp[0]), wy = g.sy(wp[1]);
      svg.appendChild(svgEl('circle', { cx: wx, cy: wy, r: 4.6, 'class': 'c-white-ring' }));
      svg.appendChild(svgEl('circle', { cx: wx, cy: wy, r: 2.2, 'class': 'c-white' }));
      var wl = svgEl('text', { x: wx + 9, y: wy + 14, 'class': 'c-dotlabel', 'text-anchor': 'start' });
      wl.textContent = data.whiteName || 'W';
      svg.appendChild(wl);

      /* 悬停十字 */
      var cross = svgEl('g', { 'class': 'c-cross', 'opacity': '0' });
      cross.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: g.plot, 'class': 'c-crossline' }));
      cross.appendChild(svgEl('line', { x1: 0, y1: 0, x2: g.plot, y2: 0, 'class': 'c-crossline' }));
      var dot = svgEl('circle', { cx: 0, cy: 0, r: 3, 'class': 'c-crossdot' });
      cross.appendChild(dot);
      svg.appendChild(cross);
      g.cross = cross; g.crossDot = dot;
    }

    function render() {
      computeDomain(prim);
      var g = computeGeo();
      if (!g) return;
      geo = g;
      chart.style.height = g.H + 'px';
      paintSpectrum(g);
      drawAxes(g);
    }

    /* 悬停 */
    var hideTimer = null;
    function onMove(ev) {
      if (!geo) return;
      var box = chart.getBoundingClientRect();
      var px = ev.clientX - box.left, py = ev.clientY - box.top;
      var inPlot = px >= MARGIN.l && px <= MARGIN.l + geo.plot && py >= MARGIN.t && py <= MARGIN.t + geo.plot;
      if (!inPlot) { hide(); return; }
      var x = geo.ix(px), y = geo.iy(py);
      var cx = geo.sx(x), cy = geo.sy(y);
      geo.cross.setAttribute('opacity', '1');
      geo.cross.children[0].setAttribute('x1', cx); geo.cross.children[0].setAttribute('x2', cx);
      geo.cross.children[1].setAttribute('y1', cy); geo.cross.children[1].setAttribute('y2', cy);
      geo.crossDot.setAttribute('cx', cx); geo.crossDot.setAttribute('cy', cy);

      var inside = inTriangle(x, y, prim[0], prim[1], prim[2]);
      tip.innerHTML =
        '<span class="c-tip-k">x</span> ' + x.toFixed(4) +
        '<span class="c-tip-k">y</span> ' + y.toFixed(4) +
        '<span class="c-tip-s ' + (inside ? 'is-in' : 'is-out') + '">' +
        (inside ? '色域内' : '色域外') + '</span>';
      tip.style.opacity = '1';
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = px + 16, top = py - th - 12;
      if (left + tw > box.width) left = px - tw - 16;
      if (top < 0) top = py + 18;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }
    function hide() {
      tip.style.opacity = '0';
      if (geo) { geo.cross.setAttribute('opacity', '0'); }
    }

    chart.addEventListener('mousemove', onMove);
    chart.addEventListener('mouseleave', hide);
    chart.addEventListener('touchstart', function (e) {
      if (e.touches.length) onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }, { passive: true });
    chart.addEventListener('touchmove', function (e) {
      if (e.touches.length) onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }, { passive: true });
    chart.addEventListener('touchend', function () { hideTimer = setTimeout(hide, 1200); });

    render();
    var ro = new ResizeObserver(function () { render(); });
    ro.observe(chart);
  }

  /* ======================== 传递函数 ======================== */

  /* ARRI LogC4 常数，直接由规范公式推导 */
  var LC4 = (function () {
    var a = (Math.pow(2, 18) - 16) / 117.45;
    var b = (1023 - 95) / 1023;
    var c = 95 / 1023;
    var s = (7 * Math.log(2) * Math.pow(2, 7 - 14 * c / b)) / (a * b);
    var t = (Math.pow(2, -14 * c / b + 6) - 64) / a;
    return { a: a, b: b, c: c, s: s, t: t, b14: b / 14 };
  })();

  function lc4Encode(L) {
    if (L >= LC4.t) return (Math.log2(LC4.a * L + 64) - 6) * LC4.b14 + LC4.c;
    return (L - LC4.t) / LC4.s;
  }
  function lc4Decode(E) {
    if (E >= 0) return (Math.pow(2, (E - LC4.c) / LC4.b14 + 6) - 64) / LC4.a;
    return E * LC4.s + LC4.t;
  }
  function linToStops(L) { return Math.log2(L / 0.18); }

  function initTransfer(fig) {
    var data = parseData(fig);
    if (!data) return;

    var chart = fig.querySelector('.c-chart');
    var svg = fig.querySelector('svg');
    var tip = fig.querySelector('.c-tip');
    var tabs = fig.querySelectorAll('[data-mode]');
    var mode = 'encode';
    var geo = null;

    var X0, X1, Y0, Y1, xLabel, yLabel;
    var M = { l: 62, b: 40, t: 18, r: 20 };

    function setDomain() {
      if (mode === 'encode') {
        X0 = -8; X1 = 12; Y0 = 0; Y1 = 1;
        xLabel = '相对 18% 灰的档位（stops）';
        yLabel = '编码值（0–1）';
      } else {
        X0 = 0; X1 = 1; Y0 = -8; Y1 = 12;
        xLabel = '编码值（0–1）';
        yLabel = '相对 18% 灰的档位（stops）';
      }
    }

    function sample() {
      var pts = [], i, n = 900, v, L, E;
      if (mode === 'encode') {
        for (i = 0; i <= n; i++) {
          v = X0 + (X1 - X0) * i / n;
          L = 0.18 * Math.pow(2, v);
          E = lc4Encode(L);
          pts.push([v, E]);
        }
      } else {
        for (i = 0; i <= n; i++) {
          v = X0 + (X1 - X0) * i / n;
          L = lc4Decode(v);
          if (L <= 0) continue;
          pts.push([v, linToStops(L)]);
        }
      }
      return pts;
    }

    function draw() {
      var W = chart.clientWidth;
      if (W < 220) return;
      var plotW = W - M.l - M.r;
      var plotH = Math.max(200, Math.min(plotW * 0.78, 470));
      var H = M.t + plotH + M.b;

      var sx = function (x) { return M.l + (x - X0) / (X1 - X0) * plotW; };
      var sy = function (y) { return M.t + (Y1 - y) / (Y1 - Y0) * plotH; };
      var ix = function (px) { return X0 + (px - M.l) / plotW * (X1 - X0); };

      geo = {
        sx: sx, sy: sy, ix: ix, plotW: plotW, plotH: plotH, H: H,
        plotLeft: M.l, plotTop: M.t
      };

      chart.style.height = H + 'px';
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      /* 网格 */
      var grid = svgEl('g', { 'class': 'c-grid' });
      var i;
      for (i = Math.ceil(X0 / 2) * 2; i <= (mode === 'encode' ? 12 : 12); i += 2) {
        grid.appendChild(svgEl('line', { x1: sx(i), y1: sy(Y0), x2: sx(i), y2: sy(Y1) }));
      }
      for (i = 0; i <= 1.0001; i += 0.2) {
        grid.appendChild(svgEl('line', { x1: sx(X0), y1: sy(i), x2: sx(X1), y2: sy(i) }));
      }
      svg.appendChild(grid);

      /* 参考线 */
      var ref = svgEl('g', { 'class': 'c-ref' });
      if (mode === 'encode') {
        ref.appendChild(svgEl('line', { x1: sx(0), y1: sy(Y0), x2: sx(0), y2: sy(Y1), 'stroke-dasharray': '3 4' }));
        ref.appendChild(svgEl('line', { x1: sx(X0), y1: sy(LC4.c), x2: sx(X1), y2: sy(LC4.c), 'stroke-dasharray': '3 4' }));
        ref.appendChild(svgEl('line', { x1: sx(X0), y1: sy(1), x2: sx(X1), y2: sy(1), 'stroke-dasharray': '3 4' }));
      } else {
        ref.appendChild(svgEl('line', { x1: sx(LC4.c), y1: sy(Y0), x2: sx(LC4.c), y2: sy(Y1), 'stroke-dasharray': '3 4' }));
        ref.appendChild(svgEl('line', { x1: sx(0.2783958), y1: sy(Y0), x2: sx(0.2783958), y2: sy(Y1), 'stroke-dasharray': '3 4' }));
        ref.appendChild(svgEl('line', { x1: sx(X0), y1: sy(0), x2: sx(X1), y2: sy(0), 'stroke-dasharray': '3 4' }));
      }
      svg.appendChild(ref);

      /* 曲线 */
      var pts = sample().filter(function (p) { return p[1] >= Y0 - 0.001 && p[1] <= Y1 + 0.001; });
      if (pts.length > 1) {
        var d = 'M' + pts.map(function (p) { return sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join('L');
        svg.appendChild(svgEl('path', { d: d, 'class': 'c-curve' }));
      }

      /* 轴、刻度 */
      var axis = svgEl('g', { 'class': 'c-axis' });
      var txStep = mode === 'encode' ? 2 : 0.2;
      for (var tv = X0; tv <= X1 + 1e-6; tv += txStep) {
        var X = sx(tv);
        axis.appendChild(svgEl('line', { x1: X, y1: sy(Math.max(Y0, 0)), x2: X, y2: sy(Math.max(Y0, 0)) + 4 }));
        var t1 = svgEl('text', { x: X, y: H - M.b + 20, 'text-anchor': 'middle' });
        t1.textContent = mode === 'encode' ? (tv > 0 ? '+' + tv : tv) : tv.toFixed(1);
        axis.appendChild(t1);
      }
      var yTicks = [];
      var i2;
      if (mode === 'encode') {
        for (i2 = 0; i2 <= 1.0001; i2 += 0.2) yTicks.push({ v: i2, label: i2.toFixed(1) });
      } else {
        for (i2 = Y0; i2 <= Y1 + 1e-6; i2 += 4) yTicks.push({ v: i2, label: (i2 > 0 ? '+' + i2 : String(i2)) });
      }
      yTicks.forEach(function (tk) {
        var Y = sy(tk.v);
        axis.appendChild(svgEl('line', { x1: sx(X0) - 4, y1: Y, x2: sx(X0), y2: Y }));
        var t2 = svgEl('text', { x: sx(X0) - 9, y: Y + 4, 'text-anchor': 'end' });
        t2.textContent = tk.label;
        axis.appendChild(t2);
      });
      svg.appendChild(axis);

      svg.appendChild(svgEl('rect', {
        x: sx(X0), y: sy(Y1), width: plotW, height: plotH, fill: 'none', 'class': 'c-frame'
      }));

      /* 关键标注 */
      var lab = svgEl('g', { 'class': 'c-annolabel' });
      function anno(px, py, text, anchor) {
        var t = svgEl('text', { x: px, y: py, 'text-anchor': anchor || 'start' });
        t.textContent = text;
        lab.appendChild(t);
      }
      if (mode === 'encode') {
        anno(sx(0) + 8, sy(0.2783958) - 11, '18% 灰 · 0.2784');
        anno(sx(X1) - 8, sy(LC4.c) + 16, '线性 0 · 0.0929', 'end');
        anno(sx(X0) + 8, sy(1) + 16, '码值 1.0 · +11.35 档');
      } else {
        anno(sx(LC4.c) + 8, sy(9.4), '线性 0 · 0.0929');
        anno(sx(0.2783958) + 8, sy(9.4), '18% 灰 · 0.2784');
      }
      svg.appendChild(lab);

      /* 轴标题 */
      var ax = svgEl('text', { x: sx(X0) + plotW / 2, y: H - 3, 'text-anchor': 'middle', 'class': 'c-axtitle' });
      ax.textContent = xLabel;
      svg.appendChild(ax);
      var ay = svgEl('text', {
        x: 16, y: sy(Y0) - plotH / 2, 'text-anchor': 'middle', 'class': 'c-axtitle',
        transform: 'rotate(-90 16 ' + (sy(Y0) - plotH / 2) + ')'
      });
      ay.textContent = yLabel;
      svg.appendChild(ay);

      /* 悬停 */
      var grp = svgEl('g', { 'class': 'c-cross', opacity: '0' });
      grp.appendChild(svgEl('line', { x1: 0, y1: sy(Y0), x2: 0, y2: sy(Y1), 'class': 'c-crossline' }));
      var dot = svgEl('circle', { cx: 0, cy: 0, r: 3.6, 'class': 'c-crossdot' });
      grp.appendChild(dot);
      svg.appendChild(grp);
      geo.cross = grp; geo.dot = dot; geo.y0px = sy(Y0); geo.y1px = sy(Y1);
    }

    function onMove(ev) {
      if (!geo) return;
      var box = chart.getBoundingClientRect();
      var px = ev.clientX - box.left, py = ev.clientY - box.top;
      if (px < geo.plotLeft || px > geo.plotLeft + geo.plotW || py < geo.plotTop || py > geo.plotTop + geo.plotH) {
        geo.cross.setAttribute('opacity', '0');
        tip.style.opacity = '0';
        return;
      }
      var xv = geo.ix(px);
      var L, E, stop;
      if (mode === 'encode') {
        stop = xv;
        L = 0.18 * Math.pow(2, stop);
        E = lc4Encode(L);
      } else {
        E = xv;
        L = lc4Decode(E);
        stop = L > 0 ? linToStops(L) : -Infinity;
      }
      if (!isFinite(stop) || E < 0 || E > 1) { tip.style.opacity = '0'; geo.cross.setAttribute('opacity', '0'); return; }

      var cx = geo.sx(xv), cy = geo.sy(mode === 'encode' ? E : stop);
      geo.cross.setAttribute('opacity', '1');
      geo.cross.children[0].setAttribute('x1', cx);
      geo.cross.children[0].setAttribute('x2', cx);
      geo.dot.setAttribute('cx', cx);
      geo.dot.setAttribute('cy', cy);

      var code12 = Math.round(E * 4095);
      tip.innerHTML =
        '<span class="c-tip-row"><span class="c-tip-k">档位</span>' + (stop > 0 ? '+' : '') + stop.toFixed(2) + ' stops</span>' +
        '<span class="c-tip-row"><span class="c-tip-k">线性</span>' + L.toFixed(4) + '</span>' +
        '<span class="c-tip-row"><span class="c-tip-k">编码</span>' + E.toFixed(5) + '</span>' +
        '<span class="c-tip-row"><span class="c-tip-k">12-bit</span>' + code12 + '</span>';
      tip.style.opacity = '1';
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = px + 16, top = py - th - 12;
      if (left + tw > box.width) left = px - tw - 16;
      if (top < 0) top = py + 18;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }

    function hide() {
      tip.style.opacity = '0';
      if (geo) geo.cross.setAttribute('opacity', '0');
    }

    chart.addEventListener('mousemove', onMove);
    chart.addEventListener('mouseleave', hide);
    chart.addEventListener('touchmove', function (e) {
      if (e.touches.length) onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }, { passive: true });

    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.mode === mode) return;
        mode = btn.dataset.mode;
        tabs.forEach(function (b) { b.classList.toggle('is-active', b.dataset.mode === mode); });
        setDomain();
        draw();
        hide();
      });
    });

    setDomain();
    draw();
    new ResizeObserver(function () { draw(); }).observe(chart);
  }

  /* ======================== 采样曲线 ======================== */

  function initCurve(fig) {
    var data = parseData(fig);
    if (!data || !data.curve || !data.curve.length) return;

    var chart = fig.querySelector('.c-chart');
    var svg = fig.querySelector('svg');
    var tip = fig.querySelector('.c-tip');
    var pts = data.curve;
    var M = { l: 62, b: 52, t: 16, r: 18 };
    var valid = [];
    var maxStop = 0;
    var X0 = pts[0][0], X1 = pts[pts.length - 1][0], Y0 = 0, Y1 = 1;
    var geo = null;

    function draw() {
      var W = chart.clientWidth;
      if (W < 220) return;
      var plotW = W - M.l - M.r;
      var plotH = Math.max(170, Math.min(plotW * 0.95, 320));
      var H = M.t + plotH + M.b;
      chart.style.height = H + 'px';
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var sx = function (v) { return M.l + (v - X0) / (X1 - X0) * plotW; };
      var sy = function (v) { return M.t + (Y1 - v) / (Y1 - Y0) * plotH; };
      geo = { sx: sx, sy: sy, W: W, H: H, plotW: plotW, plotH: plotH };

      var grid = svgEl('g', { 'class': 'c-grid' });
      var i;
      for (i = Math.ceil(X0 / 4) * 4; i <= X1; i += 4) {
        grid.appendChild(svgEl('line', { x1: sx(i), y1: sy(Y0), x2: sx(i), y2: sy(Y1) }));
      }
      for (i = 0; i <= 1.001; i += 0.2) {
        grid.appendChild(svgEl('line', { x1: sx(X0), y1: sy(i), x2: sx(X1), y2: sy(i) }));
      }
      svg.appendChild(grid);

      var ref = svgEl('g', { 'class': 'c-ref' });
      ref.appendChild(svgEl('line', {
        x1: sx(0), y1: sy(Y0), x2: sx(0), y2: sy(Y1), 'stroke-dasharray': '3 4'
      }));
      svg.appendChild(ref);

      /* 曲线裁到编码值 1.0：超过 1.0 的部分不画，交互也停在这一点 */
      var d = '';
      valid = [];
      maxStop = X1;
      for (i = 0; i < pts.length; i++) {
        if (pts[i][1] > Y1) {
          var a = valid.length ? valid[valid.length - 1] : pts[i - 1];
          if (a && pts[i][1] > a[1]) {
            /* 用相邻三点做二次插值，求出编码正好等于 1.0 的档位 */
            var p0 = pts[i - 2] || a, p1 = a, p2 = pts[i];
            var lo = p1[0], hi = p2[0], mid;
            for (var k = 0; k < 40; k++) {
              mid = (lo + hi) / 2;
              var w0 = (mid - p1[0]) * (mid - p2[0]) / ((p0[0] - p1[0]) * (p0[0] - p2[0]));
              var w1 = (mid - p0[0]) * (mid - p2[0]) / ((p1[0] - p0[0]) * (p1[0] - p2[0]));
              var w2 = (mid - p0[0]) * (mid - p1[0]) / ((p2[0] - p0[0]) * (p2[0] - p1[0]));
              var e = w0 * p0[1] + w1 * p1[1] + w2 * p2[1];
              if (e > Y1) hi = mid; else lo = mid;
            }
            maxStop = (lo + hi) / 2;
          }
          break;
        }
        valid.push(pts[i]);
      }
      for (i = 0; i < valid.length; i++) {
        d += (d ? 'L' : 'M') + sx(valid[i][0]).toFixed(1) + ',' + sy(valid[i][1]).toFixed(1);
      }
      if (maxStop < X1) {
        d += 'L' + sx(maxStop).toFixed(1) + ',' + sy(Y1).toFixed(1);
      }
      if (d) svg.appendChild(svgEl('path', { d: d, 'class': 'c-curve' }));

      var axis = svgEl('g', { 'class': 'c-axis' });
      for (i = Math.ceil(X0 / 4) * 4; i <= X1; i += 4) {
        axis.appendChild(svgEl('line', { x1: sx(i), y1: sy(Y0), x2: sx(i), y2: sy(Y0) + 4 }));
        var t = svgEl('text', { x: sx(i), y: H - M.b + 20, 'text-anchor': 'middle' });
        t.textContent = i > 0 ? '+' + i : String(i);
        axis.appendChild(t);
      }
      for (i = 0; i <= 1.001; i += 0.2) {
        axis.appendChild(svgEl('line', { x1: sx(X0) - 4, y1: sy(i), x2: sx(X0), y2: sy(i) }));
        var t2 = svgEl('text', { x: sx(X0) - 9, y: sy(i) + 4, 'text-anchor': 'end' });
        t2.textContent = i.toFixed(1);
        axis.appendChild(t2);
      }
      svg.appendChild(axis);

      svg.appendChild(svgEl('rect', {
        x: sx(X0), y: sy(Y1), width: plotW, height: plotH, fill: 'none', 'class': 'c-frame'
      }));

      var lx = svgEl('text', { x: sx(X0) + plotW / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'c-axtitle' });
      lx.textContent = UI.xStops;
      svg.appendChild(lx);
      var ly = svgEl('text', {
        x: 17, y: sy(Y0) - plotH / 2, 'text-anchor': 'middle', 'class': 'c-axtitle',
        transform: 'rotate(-90 17 ' + (sy(Y0) - plotH / 2) + ')'
      });
      ly.textContent = UI.xEncoded;
      svg.appendChild(ly);

      var cross = svgEl('g', { 'class': 'c-cross', opacity: '0' });
      cross.appendChild(svgEl('line', { x1: 0, y1: sy(Y0), x2: 0, y2: sy(Y1), 'class': 'c-crossline' }));
      cross.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 3.4, 'class': 'c-crossdot' }));
      svg.appendChild(cross);
      geo.cross = cross;
    }

    function hide() {
      tip.style.opacity = '0';
      if (geo) geo.cross.setAttribute('opacity', '0');
    }

    function onMove(ev) {
      if (!geo) return;
      var box = chart.getBoundingClientRect();
      var px = ev.clientX - box.left, py = ev.clientY - box.top;
      if (px < M.l || px > M.l + geo.plotW || py < M.t || py > M.t + geo.plotH) { hide(); return; }
      var stop = X0 + (px - M.l) / geo.plotW * (X1 - X0);
      if (!valid.length) { hide(); return; }
      if (stop > maxStop) stop = maxStop;
      var best = valid[0], i;
      for (i = 1; i < valid.length; i++) {
        if (Math.abs(valid[i][0] - stop) < Math.abs(best[0] - stop)) best = valid[i];
      }
      if (maxStop < X1 && stop >= maxStop - 1e-6) best = [maxStop, Y1];
      var cx = geo.sx(best[0]), cy = geo.sy(best[1]);
      geo.cross.setAttribute('opacity', '1');
      geo.cross.children[0].setAttribute('x1', cx);
      geo.cross.children[0].setAttribute('x2', cx);
      geo.cross.children[1].setAttribute('cx', cx);
      geo.cross.children[1].setAttribute('cy', cy);

      tip.innerHTML =
        '<span class="c-tip-row"><span class="c-tip-k">' + UI.tipStops + '</span>' +
        (best[0] > 0 ? '+' : '') + best[0].toFixed(1) + ' stops</span>' +
        '<span class="c-tip-row"><span class="c-tip-k">' + UI.tipLinear + '</span>' +
        (0.18 * Math.pow(2, best[0])).toFixed(4) + '</span>' +
        '<span class="c-tip-row"><span class="c-tip-k">' + UI.tipEncoded + '</span>' + best[1].toFixed(4) + '</span>';
      tip.style.opacity = '1';
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = px + 16, top = py - th - 12;
      if (left + tw > box.width) left = px - tw - 16;
      if (top < 0) top = py + 18;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }

    chart.addEventListener('mousemove', onMove);
    chart.addEventListener('mouseleave', hide);
    chart.addEventListener('touchmove', function (e) {
      if (e.touches.length) onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }, { passive: true });

    draw();
    new ResizeObserver(function () { draw(); }).observe(chart);
  }

  /* ============================ 启动 ============================ */
  function boot() {
    var g = document.querySelector('[data-chart="gamut"]');
    if (g) { try { initGamut(g); } catch (e) { console.error('[gamut]', e); } }
    var t = document.querySelector('[data-chart="transfer"]');
    if (t) { try { initTransfer(t); } catch (e) { console.error('[transfer]', e); } }
    var c = document.querySelector('[data-chart="curve"]');
    if (c) { try { initCurve(c); } catch (e) { console.error('[curve]', e); } }
    var eotf = document.querySelector('[data-chart="eotf"]');
    if (eotf) { try { initEOTF(eotf); } catch (e) { console.error('[eotf]', e); } }
  }

  /* ====================== 显示传递函数 EOTF ====================== */

  var PQ_M1 = 2610 / 16384, PQ_M2 = 2523 / 4096 * 128;
  var PQ_C1 = 3424 / 4096, PQ_C2 = 2413 / 4096 * 32, PQ_C3 = 2392 / 4096 * 32;

  function pqEotf(v) {
    var p = Math.pow(Math.max(v, 0), 1 / PQ_M2);
    var num = Math.max(p - PQ_C1, 0);
    var den = PQ_C2 - PQ_C3 * p;
    if (den <= 0) return 10000;
    return 10000 * Math.pow(num / den, 1 / PQ_M1);
  }

  function initEOTF(fig) {
    var chart = fig.querySelector('.c-chart');
    var svg = fig.querySelector('svg');
    var tip = fig.querySelector('.c-tip');
    var sel = fig.querySelector('.c-eotf-sel');
    var lwInput = fig.querySelector('.c-eotf-lw');
    var lbInput = fig.querySelector('.c-eotf-lb');
    var logBox = fig.querySelector('.c-eotf-log');
    var xSel = fig.querySelector('.c-eotf-xmode');
    var bitSel = fig.querySelector('.c-eotf-bits');
    var rangeSel = fig.querySelector('.c-eotf-range');
    var M = { l: 66, b: 46, t: 16, r: 18 };
    var geo = null;

    /* 量化范围：以 8 / 10 / 12 bit 的常见定义给出 */
    var RANGES = {
      full: { 8: [0, 255], 10: [0, 1023], 12: [0, 4095] },
      legal: { 8: [16, 235], 10: [64, 940], 12: [256, 3760] },
      smpte: { 8: [1, 254], 10: [4, 1019], 12: [16, 4079] }
    };

    function params() {
      var bits = bitSel ? parseInt(bitSel.value, 10) : 10;
      var range = rangeSel ? rangeSel.value : 'full';
      var mm = (RANGES[range] || RANGES.full)[bits];
      return {
        type: sel ? sel.value : 'srgb',
        lw: lwInput ? Math.max(parseFloat(lwInput.value) || 100, 0.01) : 100,
        lb: lbInput ? Math.max(parseFloat(lbInput.value) || 0, 0) : 0,
        log: logBox ? logBox.checked : false,
        xmode: xSel ? xSel.value : 'norm',
        bits: bits,
        range: range,
        codeMax: Math.pow(2, bits) - 1,
        codeMin: mm[0],
        codeTop: mm[1]
      };
    }

    function eotf(type, v, lw, lb) {
      if (type === 'pq') return pqEotf(v);
      if (type === 'srgb') {
        var r = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        return lw * r;
      }
      if (type === 'bt1886') {
        var g = 2.4;
        var a = Math.pow(Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g), g);
        var b = Math.pow(lb, 1 / g) / (Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g));
        return a * Math.pow(Math.max(v + b, 0), g);
      }
      var gam = { gamma22: 2.2, gamma24: 2.4, gamma26: 2.6, gamma1961: 1.961, gamma18: 1.8 }[type] || 2.2;
      return lw * Math.pow(v, gam);
    }

    /* 码值 → 归一化信号；范围外裁切 */
    function codeToSignal(code, p) {
      var v = (code - p.codeMin) / (p.codeTop - p.codeMin);
      return v < 0 ? 0 : (v > 1 ? 1 : v);
    }

    function niceStep(raw) {
      var pw = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
      var n = raw / pw;
      var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
      return m * pw;
    }

    function draw() {
      var p = params();
      var W = chart.clientWidth;
      if (W < 220) return;
      var plotW = W - M.l - M.r;
      var plotH = Math.max(170, Math.min(plotW * 0.78, 340));
      var H = M.t + plotH + M.b;
      chart.style.height = H + 'px';
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var absolute = p.type === 'pq';
      var yMax = absolute ? 10000 : p.lw;
      var yMin = p.log ? Math.max(0.01, absolute ? 0.005 : p.lw * 1e-4) : 0;
      var y0 = p.log ? Math.log10(yMin) : yMin;
      var y1 = p.log ? Math.log10(yMax) : yMax;
      var bottom = M.t + plotH;
      var codeMode = p.xmode === 'code';
      var xMax = codeMode ? p.codeMax : 1;

      var sx = function (v) { return M.l + v / xMax * plotW; };
      var sy = function (L) {
        var t = p.log ? Math.log10(Math.max(L, yMin)) : L;
        return M.t + (y1 - t) / (y1 - y0) * plotH;
      };
      geo = { sx: sx, sy: sy, plotW: plotW, plotH: plotH, H: H, p: p, yMax: yMax, yMin: yMin, xMax: xMax, codeMode: codeMode };

      var grid = svgEl('g', { 'class': 'c-grid' });
      var axis = svgEl('g', { 'class': 'c-axis' });
      var i;

      /* 横轴刻度 */
      var xTicks = [];
      if (codeMode) {
        var stepC = niceStep(p.codeMax / 5);
        for (var c = 0; c <= p.codeMax + 1e-9; c += stepC) xTicks.push(Math.round(c));
      } else {
        for (i = 0; i <= 10; i++) xTicks.push(i / 10);
      }
      xTicks.forEach(function (xv) {
        var X = sx(xv);
        grid.appendChild(svgEl('line', { x1: X, y1: bottom, x2: X, y2: sy(yMax) }));
        axis.appendChild(svgEl('line', { x1: X, y1: bottom, x2: X, y2: bottom + 4 }));
        var t = svgEl('text', { x: X, y: H - M.b + 20, 'text-anchor': 'middle' });
        t.textContent = codeMode ? String(xv) : xv.toFixed(1);
        axis.appendChild(t);
      });

      /* 纵轴刻度 */
      var yTicks = [];
      if (p.log) {
        for (var e = Math.ceil(Math.log10(yMin)); e <= Math.log10(yMax) + 1e-9; e++) yTicks.push(Math.pow(10, e));
      } else {
        var stepY = niceStep(yMax / 5);
        for (var vv = 0; vv <= yMax + 1e-9; vv += stepY) yTicks.push(vv);
      }
      yTicks.forEach(function (L) {
        var y = sy(L);
        if (y < M.t - 1 || y > bottom + 1) return;
        grid.appendChild(svgEl('line', { x1: sx(0), y1: y, x2: sx(xMax), y2: y }));
        axis.appendChild(svgEl('line', { x1: sx(0) - 4, y1: y, x2: sx(0), y2: y }));
        var t2 = svgEl('text', { x: sx(0) - 9, y: y + 4, 'text-anchor': 'end' });
        t2.textContent = String(Math.round(L * 100) / 100);
        axis.appendChild(t2);
      });
      svg.appendChild(grid);
      svg.appendChild(axis);

      /* 合法范围边界（码值模式且非全范围时） */
      if (codeMode && (p.codeMin > 0 || p.codeTop < p.codeMax)) {
        var mark = svgEl('g', { 'class': 'c-ref' });
        [p.codeMin, p.codeTop].forEach(function (cv) {
          mark.appendChild(svgEl('line', {
            x1: sx(cv), y1: sy(yMax), x2: sx(cv), y2: bottom, 'stroke-dasharray': '3 4'
          }));
        });
        svg.appendChild(mark);
      }

      /* 曲线 */
      var d = '';
      var N = 240;
      for (i = 0; i <= N; i++) {
        var xv2 = xMax * i / N;
        var V = codeMode ? codeToSignal(xv2, p) : xv2;
        var L2 = eotf(p.type, V, p.lw, p.lb);
        if (L2 > yMax * 1.0001) break;
        d += (d ? 'L' : 'M') + sx(xv2).toFixed(1) + ',' + sy(L2).toFixed(1);
      }
      if (d) svg.appendChild(svgEl('path', { d: d, 'class': 'c-curve' }));

      svg.appendChild(svgEl('rect', { x: sx(0), y: sy(yMax), width: plotW, height: plotH, fill: 'none', 'class': 'c-frame' }));

      var lx = svgEl('text', { x: sx(0) + plotW / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'c-axtitle' });
      lx.textContent = codeMode
        ? UI.xCode.replace('{b}', String(p.bits)).replace('{m}', String(p.codeMax))
        : UI.xNorm;
      svg.appendChild(lx);
      var ly = svgEl('text', {
        x: 17, y: sy(yMax) + plotH / 2, 'text-anchor': 'middle', 'class': 'c-axtitle',
        transform: 'rotate(-90 17 ' + (sy(yMax) + plotH / 2) + ')'
      });
      ly.textContent = UI.yLum;
      svg.appendChild(ly);

      var cross = svgEl('g', { 'class': 'c-cross', opacity: '0' });
      cross.appendChild(svgEl('line', { x1: 0, y1: sy(yMax), x2: 0, y2: bottom, 'class': 'c-crossline' }));
      cross.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 3.4, 'class': 'c-crossdot' }));
      svg.appendChild(cross);
      geo.cross = cross;
    }

    function hide() {
      tip.style.opacity = '0';
      if (geo) geo.cross.setAttribute('opacity', '0');
    }

    function onMove(ev) {
      if (!geo) return;
      var box = chart.getBoundingClientRect();
      var px = ev.clientX - box.left, py = ev.clientY - box.top;
      if (px < M.l || px > M.l + geo.plotW || py < M.t || py > M.t + geo.plotH) { hide(); return; }
      var xv = (px - M.l) / geo.plotW * geo.xMax;
      var p = geo.p;
      var V = geo.codeMode ? codeToSignal(xv, p) : xv;
      var L = eotf(p.type, V, p.lw, p.lb);
      var cx = geo.sx(xv), cy = geo.sy(L);
      geo.cross.setAttribute('opacity', '1');
      geo.cross.children[0].setAttribute('x1', cx);
      geo.cross.children[0].setAttribute('x2', cx);
      geo.cross.children[1].setAttribute('cx', cx);
      geo.cross.children[1].setAttribute('cy', cy);
      var head = geo.codeMode
        ? '<span class="c-tip-row"><span class="c-tip-k">' + UI.tipCode + '</span>' + Math.round(xv) + '</span>' +
          '<span class="c-tip-row"><span class="c-tip-k">' + UI.tipNorm + '</span>' + V.toFixed(3) + '</span>'
        : '<span class="c-tip-row"><span class="c-tip-k">' + UI.tipCode + '</span>' + V.toFixed(3) + '</span>';
      tip.innerHTML = head + '<span class="c-tip-row"><span class="c-tip-k">' + UI.tipLum + '</span>' + L.toFixed(2) + ' cd/m²</span>';
      tip.style.opacity = '1';
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      var left = px + 16, top = py - th - 12;
      if (left + tw > box.width) left = px - tw - 16;
      if (top < 0) top = py + 18;
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }

    function syncControls() {
      var p = params();
      if (lbInput) lbInput.disabled = p.type !== 'bt1886';
      if (lwInput) lwInput.disabled = p.type === 'pq';
      var codeMode = p.xmode === 'code';
      if (bitSel) bitSel.disabled = !codeMode;
      if (rangeSel) rangeSel.disabled = !codeMode;
      var xGroup = fig.querySelector('.c-eotf-group--x');
      if (xGroup) xGroup.classList.toggle('is-off', !codeMode);
    }

    [sel, xSel, bitSel, rangeSel].forEach(function (el) {
      if (el) el.addEventListener('change', function () { syncControls(); draw(); hide(); });
    });
    [lwInput, lbInput].forEach(function (el) {
      if (el) el.addEventListener('input', function () { draw(); });
    });
    if (logBox) logBox.addEventListener('change', function () { draw(); });
    chart.addEventListener('mousemove', onMove);
    chart.addEventListener('mouseleave', hide);

    syncControls();
    draw();
    new ResizeObserver(function () { draw(); }).observe(chart);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
