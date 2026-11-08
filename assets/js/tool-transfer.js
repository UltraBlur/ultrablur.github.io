/* 传递函数比对：编码曲线（场景参考）与显示 EOTF 分开比较 */
(function () {
  var root = document.querySelector('[data-tf]');
  if (!root) return;
  var raw = document.getElementById('transfer-data');
  if (!raw) return;

  var data = JSON.parse(raw.textContent);
  var lang = data.lang || 'zh';
  var spaces = data.spaces.filter(function (s) { return s.curve && s.curve.length; });

  var COLORS = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#8c564b', '#e377c2'];

  /* ---- 显示端 EOTF ---- */
  var PQ_M1 = 2610 / 16384, PQ_M2 = 2523 / 4096 * 128;
  var PQ_C1 = 3424 / 4096, PQ_C2 = 2413 / 4096 * 32, PQ_C3 = 2392 / 4096 * 32;
  function pqEotf(v) {
    var p = Math.pow(Math.max(v, 0), 1 / PQ_M2);
    var num = Math.max(p - PQ_C1, 0);
    var den = PQ_C2 - PQ_C3 * p;
    if (den <= 0) return 10000;
    return 10000 * Math.pow(num / den, 1 / PQ_M1);
  }
  function hlgEotf(v, lw) {
    var a = 0.17883277, b = 0.28466892, c = 0.55991073;
    var e = v <= 0.5 ? (v * v) / 3 : (Math.exp((v - c) / a) + b) / 12;
    var lwv = Math.max(lw, 1);
    var g = (lwv >= 400 && lwv <= 2000)
      ? 1.2 + 0.42 * Math.log10(lwv / 1000)
      : 1.2 * Math.pow(1.111, Math.log(lwv / 1000) / Math.LN2);
    return lw * Math.pow(Math.max(e, 0), g);
  }
  function srgbEotf(v, lw) {
    var r = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return lw * r;
  }
  function bt1886(v, lw, lb) {
    var g = 2.4;
    var a = Math.pow(Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g), g);
    var b = Math.pow(lb, 1 / g) / (Math.pow(lw, 1 / g) - Math.pow(lb, 1 / g));
    return a * Math.pow(Math.max(v + b, 0), g);
  }
  function power(v, lw, g) { return lw * Math.pow(Math.max(v, 0), g); }
  function pqAt(v) { return pqEotf(v); }
  function pqEncode(L) {
    var Y = Math.max(L, 0) / 10000;
    var m1 = PQ_M1, m2 = PQ_M2;
    var p = Math.pow(Y, m1);
    var num = PQ_C1 + PQ_C2 * p;
    var den = 1 + PQ_C3 * p;
    return Math.pow(num / den, m2);
  }

  var TFS = [
    { id: 'srgb', zh: 'sRGB 分段', en: 'sRGB piecewise', need: { lw: true }, fn: function (v, p) { return srgbEotf(v, p.lw); } },
    { id: 'bt1886', zh: 'BT.1886（γ 2.4）', en: 'BT.1886 (γ 2.4)', need: { lw: true, lb: true }, fn: function (v, p) { return bt1886(v, p.lw, p.lb); } },
    { id: 'g22', zh: '纯伽马 2.2', en: 'Gamma 2.2', need: { lw: true }, fn: function (v, p) { return power(v, p.lw, 2.2); } },
    { id: 'g24', zh: '纯伽马 2.4', en: 'Gamma 2.4', need: { lw: true }, fn: function (v, p) { return power(v, p.lw, 2.4); } },
    { id: 'g26', zh: '纯伽马 2.6', en: 'Gamma 2.6', need: { lw: true }, fn: function (v, p) { return power(v, p.lw, 2.6); } },
    { id: 'g563', zh: '纯伽马 563/256', en: 'Gamma 563/256', need: { lw: true }, fn: function (v, p) { return power(v, p.lw, 563 / 256); } },
    { id: 'pq', zh: 'ST 2084（PQ，绝对亮度）', en: 'ST 2084 (PQ, absolute)', need: {}, fn: function (v) { return pqAt(v); } },
    { id: 'hlg', zh: 'HLG（BT.2100 OOTF）', en: 'HLG (BT.2100 OOTF)', need: { lw: true }, fn: function (v, p) { return hlgEotf(v, p.lw); } },
    { id: 'cinity', zh: 'CINITY Log', en: 'CINITY Log', need: { lw: true }, fn: function (v, p) { return cinityEotf(v, p.lw); } }
  ];
  var cinityCurve = null;
  spaces.forEach(function (sp) { if (sp.slug === 'cinity-log') cinityCurve = sp.curve; });
  function cinityEotf(v, lw) {
    if (!cinityCurve || cinityCurve.length < 2) return lw * v;
    var pts = cinityCurve, i, sMax = pts[pts.length - 1].x;
    for (i = 0; i < pts.length; i++) { if (pts[i].y >= 0.999) { sMax = pts[i].x; break; } }
    var stops;
    if (v <= pts[0].y) {
      var slope = (pts[1].x - pts[0].x) / (pts[1].y - pts[0].y);
      stops = pts[0].x + (v - pts[0].y) * slope;
    } else {
      stops = pts[pts.length - 1].x;
      for (i = 1; i < pts.length; i++) {
        if (pts[i].y >= v) {
          var a = pts[i - 1], b = pts[i];
          var t = b.y > a.y ? (v - a.y) / (b.y - a.y) : 0;
          stops = a.x + t * (b.x - a.x);
          break;
        }
      }
    }
    return lw * Math.pow(2, stops - sMax);
  }

  var tfParams = {};
  TFS.forEach(function (t) { tfParams[t.id] = { lw: 100, lb: 0 }; });

  var mode = 'encode';
  var selSpaces = ['acescct', 'arri-logc4', 'arri-logc3', 'sony-slog3'].filter(function (s) {
    return spaces.some(function (x) { return x.slug === s; });
  });
  if (!selSpaces.length && spaces.length) selSpaces = [spaces[0].slug];
  var selTfs = ['srgb', 'bt1886', 'hlg'];

  var svg = root.querySelector('.c-tf-svg');
  var legend = root.querySelector('.c-tf-legend');
  var picks = root.querySelector('.c-tf-picks');
  var toggle = root.querySelector('.c-tf-toggle');
  var yMaxIn = root.querySelector('.c-tf-ymax');
  var yAxisSel = root.querySelector('.c-tf-yaxis');
  var params = root.querySelector('.c-tf-params');
  var modeBtns = root.querySelectorAll('.c-tf-modes button');

  var W = 720, H = 420, M = { l: 60, r: 16, t: 14, b: 44 };

  function el(name, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function num(input, def) { var v = parseFloat(input && input.value); return isFinite(v) ? v : def; }

  function buildPicks() {
    picks.innerHTML = '';
    if (mode === 'encode') {
      var groups = {};
      spaces.forEach(function (s) { (groups[s.group || ''] = groups[s.group || ''] || []).push(s); });
      var names = { camera: lang === 'en' ? 'Cameras' : '相机', film: lang === 'en' ? 'Film' : '胶片', aces: 'ACES', working: lang === 'en' ? 'Working' : '工作空间', 'display-gamut': lang === 'en' ? 'Display primaries' : '显示原色', 'display-tf': lang === 'en' ? 'Display TF' : '显示传递函数', '': '' };
      Object.keys(groups).forEach(function (g) {
        var head = document.createElement('p');
        head.className = 'c-tf-group';
        head.textContent = names[g] != null ? names[g] : g;
        picks.appendChild(head);
        groups[g].forEach(function (s) {
          var label = document.createElement('label');
          label.className = 'c-tf-pick';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = s.slug;
          cb.checked = selSpaces.indexOf(s.slug) >= 0;
          cb.addEventListener('change', function () {
            if (cb.checked) selSpaces.push(s.slug);
            else selSpaces = selSpaces.filter(function (x) { return x !== s.slug; });
            if (selSpaces.length > 8) { selSpaces = selSpaces.slice(selSpaces.length - 8); sync(); }
            draw();
          });
          label.appendChild(cb);
          label.appendChild(document.createTextNode(' ' + s.title));
          picks.appendChild(label);
        });
      });
    } else {
      TFS.forEach(function (t) {
        var label = document.createElement('label');
        label.className = 'c-tf-pick';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = t.id;
        cb.checked = selTfs.indexOf(t.id) >= 0;
        cb.addEventListener('change', function () {
          if (cb.checked) selTfs.push(t.id);
          else selTfs = selTfs.filter(function (x) { return x !== t.id; });
          buildParamPanel(); draw();
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + (lang === 'en' ? t.en : t.zh)));
        picks.appendChild(label);
      });
    }
  }

  function sync() {
    var boxes = picks.querySelectorAll('input');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = (mode === 'encode' ? selSpaces : selTfs).indexOf(boxes[i].value) >= 0;
    }
  }

  function frame() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var plotW = W - M.l - M.r, plotH = H - M.t - M.b;
    var g = el('g', { 'class': 'c-tf-grid' });
    svg.appendChild(g);
    return { plotW: plotW, plotH: plotH };
  }

  function axes(sx, sy, x0, x1, y0, y1, xSteps, ySteps, xlabel, ylabel) {
    var g = el('g', { 'class': 'c-tf-grid' });
    var plotH = H - M.t - M.b, plotW = W - M.l - M.r;
    xSteps.forEach(function (v) { g.appendChild(el('line', { x1: sx(v), y1: M.t, x2: sx(v), y2: M.t + plotH })); });
    ySteps.forEach(function (v) { g.appendChild(el('line', { x1: M.l, y1: sy(v), x2: M.l + plotW, y2: sy(v) })); });
    svg.appendChild(g);

    g = el('g', { 'class': 'c-tf-axis' });
    xSteps.forEach(function (v) {
      var t = el('text', { x: sx(v), y: M.t + plotH + 20, 'text-anchor': 'middle' });
      t.textContent = String(v);
      g.appendChild(t);
    });
    ySteps.forEach(function (v) {
      var t = el('text', { x: M.l - 8, y: sy(v) + 4, 'text-anchor': 'end' });
      t.textContent = String(Math.round(v * 100) / 100);
      g.appendChild(t);
    });
    var xl = el('text', { x: M.l + plotW / 2, y: H - 6, 'text-anchor': 'middle' });
    xl.textContent = xlabel;
    g.appendChild(xl);
    var yl = el('text', { x: 14, y: M.t + plotH / 2, 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (M.t + plotH / 2) + ')' });
    yl.textContent = ylabel;
    g.appendChild(yl);
    svg.appendChild(g);
  }

  function drawEncode() {
    var f = frame();
    var chosen = spaces.filter(function (s) { return selSpaces.indexOf(s.slug) >= 0; });
    if (!chosen.length) return;
    var X0 = -8, X1 = 12, yMax = 1;   /* OETF 纵轴恒为编码值 0–1，不受亮度上限影响 */
    function sx(v) { return M.l + (v - X0) / (X1 - X0) * f.plotW; }
    function sy(v) { return M.t + (yMax - v) / yMax * f.plotH; }
    var xs = [], ys = [];
    for (var x = X0; x <= X1; x += 4) xs.push(x);
    var yStep = yMax <= 1 ? 0.2 : (yMax <= 1.5 ? 0.25 : 0.5);
    for (var y = 0; y <= yMax + 1e-9; y += yStep) ys.push(Math.round(y * 1000) / 1000);
    axes(sx, sy, X0, X1, 0, yMax, xs, ys,
      lang === 'en' ? 'Stops relative to 18% grey' : '相对 18% 灰的档位（stops）',
      lang === 'en' ? 'Encoded value (0–1)' : '编码值（0–1）');

    chosen.forEach(function (s, i) {
      var color = COLORS[i % COLORS.length], d = '';
      for (var k = 0; k < s.curve.length; k++) {
        var p = s.curve[k];
        if (p.y > yMax) {
          var prev = s.curve[k - 1];
          if (prev && prev.y <= yMax) {
            var t = (yMax - prev.y) / (p.y - prev.y);
            d += 'L' + sx(prev.x + t * (p.x - prev.x)).toFixed(1) + ',' + sy(yMax).toFixed(1);
          }
          break;
        }
        d += (d ? 'L' : 'M') + sx(p.x).toFixed(1) + ',' + sy(p.y).toFixed(1);
      }
      svg.appendChild(el('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 1.6 }));
    });
    legend.innerHTML = '';
    chosen.forEach(function (s, i) {
      var li = document.createElement('li');
      var sw = document.createElement('span');
      sw.className = 'c-tf-swatch';
      sw.style.background = COLORS[i % COLORS.length];
      li.appendChild(sw);
      li.appendChild(document.createTextNode(s.title));
      legend.appendChild(li);
    });
  }

  function drawDisplay() {
    var f = frame();
    var chosen = TFS.filter(function (t) { return selTfs.indexOf(t.id) >= 0; });
    if (!chosen.length) return;

    var mode = yAxisSel ? yAxisSel.value : 'abs';
    function refOf(t) { return t.need.lw ? tfParams[t.id].lw : (t.ref || 10000); }
    function mapL(t, L) {
      if (mode === 'log') return Math.log10(Math.max(L, 1e-4));
      if (mode === 'rel') return L / refOf(t);
      if (mode === 'stops') return Math.log2(Math.max(L, 1e-6) / refOf(t));
      if (mode === 'pq') return 1023 * pqEncode(L);
      return L;
    }

    // 纵轴范围
    /* 纵轴上限始终是绝对亮度（cd/m²），再按所选量化方式换算 */
    var nitMax = num(yMaxIn, 0);
    var lRef = 100;
    chosen.forEach(function (t) { lRef = Math.max(lRef, refOf(t)); });
    var lo = 0, hi = 1;
    if (mode === 'abs') {
      hi = nitMax > 0 ? nitMax : lRef;
    } else if (mode === 'log') {
      hi = Math.log10(nitMax > 0 ? nitMax : 1000); lo = Math.log10(0.01);
    } else if (mode === 'rel') {
      hi = nitMax > 0 ? nitMax / lRef : 1; lo = 0;
    } else if (mode === 'stops') {
      hi = nitMax > 0 ? Math.log2(nitMax / lRef) : 0; lo = hi - 12;
    } else if (mode === 'pq') {
      hi = nitMax > 0 ? 1023 * pqEncode(nitMax) : 1023; lo = 0;
    }
    function sx(v) { return M.l + v * f.plotW; }
    function sy(v) { return M.t + (hi - v) / (hi - lo) * f.plotH; }

    var xs = [], ys = [], i;
    for (i = 0; i <= 10; i++) xs.push(i / 10);
    if (mode === 'abs') { var st = hi <= 10 ? 2 : hi <= 100 ? 20 : hi <= 1000 ? 200 : 2000; for (i = lo; i <= hi + 1e-9; i += st) ys.push(i); }
    else if (mode === 'log') { for (i = Math.ceil(lo); i <= hi + 1e-9; i += 1) ys.push(i); }
    else if (mode === 'rel') {
      var rs = hi > 2 ? (hi > 5 ? 1 : 0.5) : 0.2;
      for (i = 0; i <= hi + 1e-9; i += rs) ys.push(Math.round(i * 100) / 100);
    }
    else if (mode === 'stops') { for (i = lo; i <= hi + 1e-9; i += 2) ys.push(Math.round(i)); }
    else { var ps = hi / 8; for (i = 0; i <= hi + 1e-9; i += ps) ys.push(Math.round(i)); }

    var ylabel = {
      abs: lang === 'en' ? 'Luminance (cd/m²)' : '亮度（cd/m²）',
      log: lang === 'en' ? 'log₁₀ luminance' : 'log₁₀ 亮度',
      rel: lang === 'en' ? 'Relative to own peak' : '相对各自峰值',
      stops: lang === 'en' ? 'Stops below own peak' : '峰值以下的档位',
      pq: lang === 'en' ? 'PQ code (0–1023)' : 'PQ 码值（0–1023）'
    }[mode];
    axes(sx, sy, 0, 1, lo, hi, xs, ys,
      lang === 'en' ? 'Normalised code value' : '归一化码值', ylabel);

    chosen.forEach(function (t, n) {
      var color = COLORS[n % COLORS.length], d = '';
      for (var k = 0; k <= 200; k++) {
        var v = k / 200, L = mapL(t, t.fn(v, tfParams[t.id]));
        d += (d ? 'L' : 'M') + sx(v).toFixed(1) + ',' + sy(L).toFixed(1);
      }
      svg.appendChild(el('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 1.6 }));
    });

    legend.innerHTML = '';
    chosen.forEach(function (t, n) {
      var li = document.createElement('li');
      var sw = document.createElement('span');
      sw.className = 'c-tf-swatch';
      sw.style.background = COLORS[n % COLORS.length];
      li.appendChild(sw);
      li.appendChild(document.createTextNode(lang === 'en' ? t.en : t.zh));
      legend.appendChild(li);
    });
  }

  function buildParamPanel() {
    params.innerHTML = '';
    if (mode !== 'display') return;
    TFS.filter(function (t) { return selTfs.indexOf(t.id) >= 0 && (t.need.lw || t.need.lb); }).forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'c-tf-param-row';
      var name = document.createElement('span');
      name.className = 'c-tf-param-name';
      name.textContent = lang === 'en' ? t.en : t.zh;
      row.appendChild(name);
      if (t.need.lw) {
        var l = document.createElement('label');
        l.appendChild(document.createTextNode(lang === 'en' ? 'peak white ' : '峰值白 '));
        var i = document.createElement('input');
        i.type = 'number'; i.min = 1; i.max = 10000; i.step = 10; i.value = tfParams[t.id].lw;
        i.addEventListener('input', function () { var v = parseFloat(i.value); if (isFinite(v) && v > 0) { tfParams[t.id].lw = v; draw(); } });
        l.appendChild(i);
        l.appendChild(document.createTextNode(' cd/m²'));
        row.appendChild(l);
      }
      if (t.need.lb) {
        var l2 = document.createElement('label');
        l2.appendChild(document.createTextNode(lang === 'en' ? 'black ' : '黑位 '));
        var i2 = document.createElement('input');
        i2.type = 'number'; i2.min = 0; i2.max = 10; i2.step = 0.01; i2.value = tfParams[t.id].lb;
        i2.addEventListener('input', function () { var v = parseFloat(i2.value); if (isFinite(v) && v >= 0) { tfParams[t.id].lb = v; draw(); } });
        l2.appendChild(i2);
        l2.appendChild(document.createTextNode(' cd/m²'));
        row.appendChild(l2);
      }
      params.appendChild(row);
    });
  }

  function draw() {
    var enc = mode === 'encode';
    if (enc) drawEncode(); else drawDisplay();
    params.style.display = enc ? 'none' : '';
    if (yMaxIn) { yMaxIn.disabled = enc; }
    if (yAxisSel) { yAxisSel.disabled = enc; }
  }

  Array.prototype.forEach.call(modeBtns, function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      Array.prototype.forEach.call(modeBtns, function (x) { x.classList.toggle('is-on', x === b); });
      buildPicks(); buildParamPanel(); draw();
    });
  });
  toggle.addEventListener('click', function () { picks.hidden = !picks.hidden; });
  if (yMaxIn) yMaxIn.addEventListener('input', draw);
  if (yAxisSel) yAxisSel.addEventListener('change', draw);

  buildPicks();
  buildParamPanel();
  draw();
  window.addEventListener('resize', draw);
})();
