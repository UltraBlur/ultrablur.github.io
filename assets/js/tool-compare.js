/* 色域比对：两个空间的 xy 色域多边形、白点与面积；可叠 Pointer's Gamut。
   A / B 都可以选「自定义 Gamut」：原色 + 白点由用户输入，色域取原色凸包。 */
(function () {
  'use strict';
  var host = document.querySelector('[data-compare]');
  if (!host) return;
  var cfg = JSON.parse(document.getElementById('compare-data').textContent);
  var spaces = cfg.spaces || [];
  if (!spaces.length) return;

  var isEn = cfg.lang === 'en';
  var CG = window.CustomGamut || null;
  var CUSTOM_SLUG = 'custom';
  var CUSTOM_TITLE = isEn ? 'Custom gamut' : '自定义 Gamut';
  var PTR = cfg.pointer && cfg.pointer.hull && cfg.pointer.hull.length > 2 ? cfg.pointer : null;
  var COL_A = '#1f5f8b';
  var COL_B = '#b06a00';
  var COL_P = '#b03a4a';

  var svg = host.querySelector('svg');
  var table = host.querySelector('tbody');
  var thead = host.querySelector('thead tr');
  var selA = document.getElementById('cmp-a');
  var selB = document.getElementById('cmp-b');
  var chkPtr = document.getElementById('cmp-pointer');
  var note = host.querySelector('.c-cmp-note');
  var legend = host.querySelector('.c-cmp-legend');
  var swapBtn = document.getElementById('cmp-swap');
  var btnSvg = document.getElementById('cmp-svg');
  var btnPng = document.getElementById('cmp-png');
  var customPanel = host.querySelector('[data-cmp-custom]');
  var customSlot = host.querySelector('[data-cmp-custom-slot]');
  var customRows = document.getElementById('cmp-custom-rows');
  var customStatus = host.querySelector('[data-cmp-custom-status]');
  var customN = document.getElementById('cmp-custom-n');
  var customPreset = document.getElementById('cmp-custom-wpreset');
  var customWx = document.getElementById('cmp-custom-wx');
  var customWy = document.getElementById('cmp-custom-wy');
  var customFrom = document.getElementById('cmp-custom-from');

  var C = window.Chart2D;
  var G = window.Geom2D;
  var clip = G.clipPolygon;
  var polyArea = G.polygonArea;
  var W = 640, H = 560, M = { l: 56, r: 24, t: 24, b: 48 };
  var X0 = 0, X1 = 0.8;
  var S = C.makeScales(W, H, M, X0, X1);

  var WHITE_PRESETS = {
    d65: [0.3127, 0.3290],
    d50: [0.3457, 0.3585],
    dci: [0.3140, 0.3510],
    c: [0.31006, 0.31616]
  };

  var customDef = CG ? CG.defaultDef() : null;

  function pct(v) { return (v * 100).toFixed(1) + '%'; }
  function share(part, whole) { return whole > 0 ? pct(part / whole) : '—'; }

  /* ---------- 状态与空间解析 ---------- */

  function fillSelect(sel) {
    spaces.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.slug;
      o.textContent = s.title;
      sel.appendChild(o);
    });
    if (!CG) return;
    var group = document.createElement('optgroup');
    group.label = isEn ? 'Custom' : '自定义';
    var o = document.createElement('option');
    o.value = CUSTOM_SLUG;
    o.textContent = isEn ? 'Custom gamut…' : '自定义 Gamut…';
    group.appendChild(o);
    sel.appendChild(group);
  }
  fillSelect(selA);
  fillSelect(selB);

  function pick(slug, fallback) {
    return spaces.filter(function (s) { return s.slug === slug; })[0] ? slug : fallback;
  }
  var DEF_A = pick('primaries-srgb-rec709', spaces[0].slug);
  var DEF_B = pick('primaries-p3-d65', spaces[3] ? spaces[3].slug : spaces[1].slug);
  var selectable = spaces.map(function (s) { return s.slug; });
  if (CG) selectable = selectable.concat([CUSTOM_SLUG]);
  var QS = window.ToolState ? {
    a: { type: 'string', values: selectable, default: DEF_A },
    b: { type: 'string', values: selectable, default: DEF_B },
    ptr: { type: 'bool', default: true },
    mp: { type: 'string', default: CG ? CG.encode(CG.defaultDef()) : '' }
  } : null;
  var q = QS ? window.ToolState.parse(QS, window.location.search) : { a: DEF_A, b: DEF_B, ptr: true, mp: '' };
  if (CG && q.mp) {
    var initial = CG.decode(q.mp);
    if (validDef(initial)) customDef = initial;
  }
  /* 只带 a 的深链（条目页入口）如果恰好等于 B 的默认值，换一个 B，
     否则会变成「自己比自己」。显式带 b 的链接尊重用户选择。 */
  if (QS && !new URLSearchParams(window.location.search).has('b') && q.a === q.b) {
    q.b = q.a === DEF_A ? DEF_B : DEF_A;
    if (q.b === q.a) {
      var alt = spaces.filter(function (s) { return s.slug !== q.a; })[0];
      if (alt) q.b = alt.slug;
    }
  }
  selA.value = q.a;
  selB.value = q.b;
  if (chkPtr) chkPtr.checked = q.ptr;

  /* ---------- 自定义 Gamut 定义 ---------- */

  function customActive() {
    return !!CG && (selA.value === CUSTOM_SLUG || selB.value === CUSTOM_SLUG);
  }

  function spaceOf(slug) {
    if (slug === CUSTOM_SLUG && CG) {
      var hull = CG.convexHull(customDef.primaries);
      if (hull.length < 3 || !(polyArea(hull) > 1e-10)) return null;
      return {
        slug: CUSTOM_SLUG,
        title: CUSTOM_TITLE,
        primaries: hull,
        points: customDef.primaries,
        white: customDef.white,
        custom: true
      };
    }
    return spaces.filter(function (s) { return s.slug === slug; })[0] || null;
  }

  /* URL 里的自定义定义可能来自手改或旧链接：退化三角形直接回落默认定义 */
  function validDef(def) {
    if (!def || !CG) return false;
    var hull = CG.convexHull(def.primaries);
    return hull.length >= 3 && polyArea(hull) > 1e-10;
  }

  function num(text) {
    var s = String(text == null ? '' : text).trim().replace(',', '.');
    if (!s) return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function centroid(primaries) {
    var sx = 0, sy = 0;
    primaries.forEach(function (p) { sx += p[0]; sy += p[1]; });
    return [sx / primaries.length, sy / primaries.length];
  }

  /* 读面板并校验；返回 { primaries, white, hull, area, inside } 或 { error } */
  function readCustom() {
    if (!CG || !customRows) return { error: isEn ? 'Custom gamut unavailable' : '自定义 Gamut 不可用' };
    var rows = customRows.querySelectorAll('.c-cmp-custom-pri');
    var primaries = [];
    for (var i = 0; i < rows.length; i++) {
      var ix = rows[i].querySelector('[data-x]');
      var iy = rows[i].querySelector('[data-y]');
      var x = num(ix && ix.value);
      var y = num(iy && iy.value);
      if (!isFinite(x)) return { error: isEn ? 'Row ' + (i + 1) + ': x is not a number' : '第 ' + (i + 1) + ' 行：x 不是数字' };
      if (!isFinite(y)) return { error: isEn ? 'Row ' + (i + 1) + ': y is not a number' : '第 ' + (i + 1) + ' 行：y 不是数字' };
      if (Math.abs(x) > CG.LIMIT || Math.abs(y) > CG.LIMIT) {
        return { error: isEn ? 'Row ' + (i + 1) + ': coordinate outside ±' + CG.LIMIT
          : '第 ' + (i + 1) + ' 行：坐标超出 ±' + CG.LIMIT };
      }
      primaries.push([x, y]);
    }
    var wx = num(customWx && customWx.value);
    var wy = num(customWy && customWy.value);
    if (!isFinite(wx)) return { error: isEn ? 'White x is not a number' : '白点 x 不是数字' };
    if (!isFinite(wy)) return { error: isEn ? 'White y is not a number' : '白点 y 不是数字' };
    if (Math.abs(wx) > CG.LIMIT || Math.abs(wy) > CG.LIMIT) {
      return { error: isEn ? 'White point outside ±' + CG.LIMIT : '白点坐标超出 ±' + CG.LIMIT };
    }
    if (!(wy > 0)) return { error: isEn ? 'White y must be greater than 0' : '白点 y 必须大于 0' };
    var hull = CG.convexHull(primaries);
    var area = hull.length >= 3 ? polyArea(hull) : 0;
    if (!(area > 1e-10)) {
      return { error: isEn ? 'Primaries are collinear or coincident; no gamut' : '基色共线或重合，无法构成色域' };
    }
    return {
      primaries: primaries,
      white: [wx, wy],
      hull: hull,
      area: area,
      inside: CG.polygonContains(hull, [wx, wy])
    };
  }

  function statusFor(r) {
    if (!customStatus) return;
    var parts = [];
    parts.push(isEn ? r.primaries.length + ' primaries' : r.primaries.length + ' 基色');
    if (r.hull.length !== r.primaries.length) {
      parts.push(isEn ? r.hull.length + ' on hull' : '边界 ' + r.hull.length + ' 顶点');
    }
    parts.push((isEn ? 'xy area ' : 'xy 面积 ') + pct(r.area));
    parts.push(r.inside ? (isEn ? 'white inside' : '白点在色域内')
      : (isEn ? '⚠ white outside gamut' : '⚠ 白点不在色域内'));
    customStatus.textContent = parts.join(' · ');
    customStatus.className = 'c-cmp-custom-status' + (r.inside ? '' : ' is-warn');
  }

  function setCustomError(msg) {
    if (!customStatus) return;
    customStatus.textContent = msg;
    customStatus.className = 'c-cmp-custom-status is-error';
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

  /* 每行：序号 + x + y；行数变化时保留已有输入 */
  function renderCustomRows(primaries) {
    if (!customRows) return;
    customRows.innerHTML = '';
    primaries.forEach(function (p, i) {
      var row = document.createElement('label');
      row.className = 'c-cmp-custom-pri';
      var idx = document.createElement('span');
      idx.className = 'c-cmp-custom-idx';
      idx.textContent = 'P' + (i + 1);
      var ix = document.createElement('input');
      ix.type = 'text';
      ix.setAttribute('inputmode', 'decimal');
      ix.setAttribute('data-x', '1');
      ix.value = Number(p[0]).toFixed(4);
      ix.setAttribute('aria-label', 'P' + (i + 1) + ' x');
      var iy = document.createElement('input');
      iy.type = 'text';
      iy.setAttribute('inputmode', 'decimal');
      iy.setAttribute('data-y', '1');
      iy.value = Number(p[1]).toFixed(4);
      iy.setAttribute('aria-label', 'P' + (i + 1) + ' y');
      row.appendChild(idx);
      row.appendChild(ix);
      row.appendChild(iy);
      customRows.appendChild(row);
      ix.addEventListener('input', onCustomInput);
      iy.addEventListener('input', onCustomInput);
    });
  }

  function renderPanel(def) {
    if (!def) return;
    if (customN) customN.value = String(Math.max(3, Math.min(8, def.primaries.length)));
    renderCustomRows(def.primaries);
    if (customWx) customWx.value = Number(def.white[0]).toFixed(4);
    if (customWy) customWy.value = Number(def.white[1]).toFixed(4);
    if (customPreset) customPreset.value = matchPreset(def.white);
    var r = {
      primaries: def.primaries,
      white: def.white,
      hull: CG.convexHull(def.primaries),
      area: polyArea(CG.convexHull(def.primaries)),
      inside: false
    };
    r.inside = CG.polygonContains(r.hull, def.white);
    statusFor(r);
  }

  function customSlotLabel() {
    var slots = [];
    if (selA.value === CUSTOM_SLUG) slots.push('A');
    if (selB.value === CUSTOM_SLUG) slots.push('B');
    if (!slots.length) return CUSTOM_TITLE;
    if (isEn) {
      return CUSTOM_TITLE + ' (' + slots.join(' and ') +
        (slots.length > 1 ? ', same primaries' : '') + ')';
    }
    return CUSTOM_TITLE + '（' + slots.join('、') +
      (slots.length > 1 ? '，共用同一组原色' : '') + '）';
  }

  function syncCustomPanel(force) {
    if (!customPanel) return;
    var active = customActive();
    var wasHidden = customPanel.hidden;
    customPanel.hidden = !active;
    if (!active) return;
    if (customSlot) customSlot.textContent = customSlotLabel();
    if (force || wasHidden) renderPanel(customDef);
  }

  function onCustomInput() {
    if (!CG) return;
    var r = readCustom();
    if (r.error) { setCustomError(r.error); return; }
    customDef = { primaries: r.primaries.map(function (p) { return p.slice(); }), white: r.white.slice() };
    if (customPreset) customPreset.value = matchPreset(r.white);
    statusFor(r);
    draw();
    persist();
  }

  /* ---------- 绘图与表格 ---------- */

  function cell(tr, text, cls) {
    var td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    tr.appendChild(td);
    return td;
  }
  function swatchCell(tr, color, label) {
    var td = document.createElement('td');
    if (color) {
      var dot = document.createElement('span');
      dot.className = 'c-cmp-dot';
      dot.style.background = color;
      td.appendChild(dot);
    }
    td.appendChild(document.createTextNode(label));
    tr.appendChild(td);
    return td;
  }
  function row() {
    var tr = document.createElement('tr');
    table.appendChild(tr);
    return tr;
  }

  function header(showPtr) {
    thead.innerHTML = '';
    var ths = [isEn ? 'Space' : '空间', isEn ? 'Area in xy' : 'xy 面积', isEn ? 'White' : '白点'];
    if (showPtr) ths.push(isEn ? 'Pointer coverage' : '覆盖 Pointer');
    ths.push(isEn ? 'Overlap' : '交叠');
    ths.forEach(function (text) {
      var th = document.createElement('th');
      th.textContent = text;
      thead.appendChild(th);
    });
  }

  function renderLegend(a, b, showPtr) {
    if (!legend) return;
    legend.innerHTML = '';
    function item(color, label, kind) {
      var span = document.createElement('span');
      span.className = 'c-cmp-legend-item';
      span.setAttribute('role', 'listitem');
      var key = document.createElement('span');
      key.className = 'c-cmp-key' + (kind ? ' c-cmp-key--' + kind : '');
      key.style.setProperty('--c', color);
      key.setAttribute('aria-hidden', 'true');
      span.appendChild(key);
      span.appendChild(document.createTextNode(label));
      legend.appendChild(span);
    }
    item(COL_A, 'A · ' + a.title);
    item(COL_B, 'B · ' + b.title);
    if (showPtr) item(COL_P, PTR.title, 'dash');
    item('#333', isEn ? 'Overlap' : '交集', 'dot');
  }

  function pointerCoverage(space) {
    var inter = polyArea(clip(space.primaries, PTR.hull));
    return {
      ofPointer: inter / polyArea(PTR.hull),
      inside: inter / polyArea(space.primaries)
    };
  }

  function drawSpace(space, color, width) {
    if (!space.custom) {
      C.addTriangle(svg, S, space, color, width);
      return;
    }
    C.addPolygon(svg, S, space.primaries, color, width, { fillOpacity: 0.12 });
    space.points.forEach(function (p) {
      svg.appendChild(C.el('circle', { cx: S.sx(p[0]), cy: S.sy(p[1]), r: 2.6, fill: color }));
    });
    var w = space.white;
    svg.appendChild(C.el('circle', {
      cx: S.sx(w[0]), cy: S.sy(w[1]), r: 3, fill: 'none', stroke: color, 'stroke-width': 1.5
    }));
  }

  function draw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var a = spaceOf(selA.value);
    var b = spaceOf(selB.value);
    if (!a || !b) return;
    var showPtr = !!(PTR && chkPtr && chkPtr.checked);
    if (note) note.hidden = !showPtr;
    svg.setAttribute('aria-label', (isEn ? 'Gamut comparison: ' : '色域比对：') + a.title + ' / ' + b.title);

    var inter = clip(a.primaries, b.primaries);
    var interArea = inter.length > 2 ? polyArea(inter) : 0;
    var areaA = polyArea(a.primaries);
    var areaB = polyArea(b.primaries);

    C.addLocus(svg, S);
    C.addGrid(svg, S, W, H, M, X0, X1, 0.1);
    if (showPtr) C.addPolygon(svg, S, PTR.hull, COL_P, 2, { fillOpacity: 0.07, dash: '6 4' });
    drawSpace(b, COL_B, 1.5);
    drawSpace(a, COL_A, 2);
    if (inter.length > 2) {
      C.addPolygon(svg, S, inter, '#333', 1.2, { fillOpacity: 0, dash: '1 3' });
    }

    renderLegend(a, b, showPtr);
    header(showPtr);
    table.innerHTML = '';

    [[a, COL_A, 'A'], [b, COL_B, 'B']].forEach(function (pair) {
      var tr = row();
      var nameTd = swatchCell(tr, pair[1], pair[2] + ' · ' + pair[0].title);
      if (pair[0].custom) {
        var sub = document.createElement('span');
        sub.className = 'c-cmp-sub';
        sub.textContent = (isEn ? pair[0].points.length + ' primaries, custom input'
          : pair[0].points.length + ' 基色，自定义输入');
        nameTd.appendChild(sub);
      }
      cell(tr, pct(polyArea(pair[0].primaries)));
      cell(tr, pair[0].white[0].toFixed(4) + ', ' + pair[0].white[1].toFixed(4));
      if (showPtr) {
        var cov = pointerCoverage(pair[0]);
        var td = document.createElement('td');
        td.textContent = pct(cov.ofPointer);
        var sub2 = document.createElement('span');
        sub2.className = 'c-cmp-sub';
        sub2.textContent = isEn
          ? ' (' + pct(cov.inside) + ' inside)'
          : '（自身 ' + pct(cov.inside) + ' 在内）';
        td.appendChild(sub2);
        tr.appendChild(td);
      }
      cell(tr, '—', 'c-cmp-na');
    });

    if (showPtr) {
      var trP = row();
      swatchCell(trP, COL_P, PTR.title);
      cell(trP, pct(polyArea(PTR.hull)));
      cell(trP, isEn ? 'C illuminant' : 'C 光源');
      cell(trP, '100.0%');
      cell(trP, '—', 'c-cmp-na');
    }

    var trI = row();
    cell(trI, isEn ? 'Overlap' : '交集');
    cell(trI, '—', 'c-cmp-na');
    cell(trI, '—', 'c-cmp-na');
    if (showPtr) cell(trI, '—', 'c-cmp-na');
    var tdI = cell(trI, pct(interArea));
    var subI = document.createElement('span');
    subI.className = 'c-cmp-sub';
    subI.textContent = isEn
      ? share(interArea, areaA) + ' of A · ' + share(interArea, areaB) + ' of B'
      : '占 A ' + share(interArea, areaA) + ' · 占 B ' + share(interArea, areaB);
    tdI.appendChild(subI);
    labelCells();
  }

  function labelCells() {
    var labels = [];
    for (var i = 0; i < thead.children.length; i++) labels.push(thead.children[i].textContent.trim());
    var rows = table.querySelectorAll('tr');
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].children.length; c++) {
        rows[r].children[c].setAttribute('data-label', labels[c] || '');
      }
    }
  }

  function state() {
    return {
      a: selA.value,
      b: selB.value,
      ptr: chkPtr ? chkPtr.checked : true,
      mp: customActive() && CG ? CG.encode(customDef) : ''
    };
  }

  function persist() {
    if (QS) window.ToolState.write(QS, state());
  }

  function apply(next) {
    selA.value = next.a;
    selB.value = next.b;
    if (chkPtr) chkPtr.checked = next.ptr;
    if (CG && next.mp) {
      var d = CG.decode(next.mp);
      if (validDef(d)) customDef = d;
    }
    syncCustomPanel(true);
    draw();
  }

  function changed() {
    syncCustomPanel();
    draw();
    persist();
  }

  function inlineStyles(source, clone) {
    var src = source.querySelectorAll('*');
    var dst = clone.querySelectorAll('*');
    var props = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width',
      'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family',
      'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline'];
    for (var i = 0; i < src.length && i < dst.length; i++) {
      var cs = window.getComputedStyle(src[i]);
      var style = '';
      for (var j = 0; j < props.length; j++) {
        var v = cs.getPropertyValue(props[j]);
        if (props[j] === 'font-family') v = 'sans-serif';
        if (v && v !== 'normal' && v !== 'auto') style += props[j] + ':' + v + ';';
      }
      if (style) dst[i].setAttribute('style', style);
    }
  }

  function fileName() {
    return 'gamut-compare-' + selA.value + '-vs-' + selB.value;
  }

  function svgString() {
    var a = spaceOf(selA.value);
    var b = spaceOf(selB.value);
    var clone = svg.cloneNode(true);
    inlineStyles(svg, clone);
    clone.removeAttribute('class');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', W);
    clone.setAttribute('height', H);
    clone.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var title = C.el('title', {});
    title.textContent = (isEn ? 'Gamut comparison: ' : '色域比对：') +
      (a ? a.title : selA.value) + ' / ' + (b ? b.title : selB.value);
    clone.insertBefore(title, clone.firstChild);
    var bg = C.el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' });
    clone.insertBefore(bg, clone.firstChild);
    var headBg = C.el('rect', { x: 0, y: 0, width: W, height: 18, fill: '#fff' });
    clone.appendChild(headBg);
    var head = C.el('text', { x: M.l, y: 14, 'font-size': 11, 'font-family': 'sans-serif', fill: '#444' });
    head.appendChild(document.createTextNode('CIE 1931 xy · '));
    var ta = C.el('tspan', { fill: COL_A });
    ta.textContent = 'A';
    head.appendChild(ta);
    head.appendChild(document.createTextNode(': ' + (a ? a.title : selA.value) + ' · '));
    var tb = C.el('tspan', { fill: COL_B });
    tb.textContent = 'B';
    head.appendChild(tb);
    head.appendChild(document.createTextNode(': ' + (b ? b.title : selB.value)));
    clone.appendChild(head);
    var foot = C.el('text', { x: W - M.r, y: H - 3, 'font-size': 9, 'text-anchor': 'end', 'font-family': 'sans-serif', fill: '#777' });
    if (PTR && chkPtr && chkPtr.checked) {
      var tp = C.el('tspan', { fill: COL_P });
      tp.textContent = PTR ? PTR.title : "Pointer's Gamut";
      foot.appendChild(tp);
      foot.appendChild(document.createTextNode(' dashed · '));
    }
    var to = C.el('tspan', { fill: '#333' });
    to.textContent = isEn ? 'Overlap' : '交集';
    foot.appendChild(to);
    foot.appendChild(document.createTextNode(isEn ? ' dotted' : ' 点线'));
    clone.appendChild(foot);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  }

  function save(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportSvg() {
    save(new Blob([svgString()], { type: 'image/svg+xml;charset=utf-8' }), fileName() + '.svg');
  }

  function exportPng() {
    var url = URL.createObjectURL(new Blob([svgString()], { type: 'image/svg+xml;charset=utf-8' }));
    var img = new Image();
    img.onload = function () {
      try {
        var scale = 2;
        var canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (blob) save(blob, fileName() + '.png');
          URL.revokeObjectURL(url);
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); };
    img.src = url;
  }

  /* ---------- 控件 ---------- */

  if (CG && customN) {
    customN.addEventListener('change', function () {
      var r = readCustom();
      var base = r.error ? customDef : { primaries: r.primaries, white: r.white };
      var prim = base.primaries.map(function (p) { return p.slice(); });
      var n = Math.max(3, Math.min(8, parseInt(customN.value, 10) || 3));
      while (prim.length < n) prim.push(centroid(prim));
      customDef = { primaries: prim.slice(0, n), white: base.white.slice() };
      renderPanel(customDef);
      draw();
      persist();
    });
  }
  if (CG && customPreset) {
    customPreset.addEventListener('change', function () {
      var p = WHITE_PRESETS[customPreset.value];
      if (!p) return;
      if (customWx) customWx.value = p[0].toFixed(4);
      if (customWy) customWy.value = p[1].toFixed(4);
      onCustomInput();
    });
  }
  if (CG && customWx) customWx.addEventListener('input', onCustomInput);
  if (CG && customWy) customWy.addEventListener('input', onCustomInput);
  if (CG && customFrom) {
    customFrom.addEventListener('change', function () {
      var s = spaces.filter(function (x) { return x.slug === customFrom.value; })[0];
      customFrom.value = '';
      if (!s) return;
      customDef = {
        primaries: s.primaries.map(function (p) { return p.slice(); }),
        white: (s.white || CG.defaultDef().white).slice()
      };
      renderPanel(customDef);
      draw();
      persist();
    });
  }

  if (swapBtn) {
    swapBtn.addEventListener('click', function () {
      var a = selA.value;
      selA.value = selB.value;
      selB.value = a;
      syncCustomPanel();
      draw();
      persist();
    });
  }
  if (btnSvg) btnSvg.addEventListener('click', exportSvg);
  if (btnPng) btnPng.addEventListener('click', exportPng);

  selA.addEventListener('change', changed);
  selB.addEventListener('change', changed);
  if (chkPtr) chkPtr.addEventListener('change', changed);
  window.addEventListener('popstate', function () {
    if (QS) apply(window.ToolState.parse(QS, window.location.search));
  });

  syncCustomPanel();
  draw();
})();
