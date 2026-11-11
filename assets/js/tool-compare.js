/* 色域比对：两个空间的 xy 三角形、白点与面积；可叠 Pointer's Gamut */
(function () {
  'use strict';
  var host = document.querySelector('[data-compare]');
  if (!host) return;
  var cfg = JSON.parse(document.getElementById('compare-data').textContent);
  var spaces = cfg.spaces || [];
  if (!spaces.length) return;

  var isEn = cfg.lang === 'en';
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

  spaces.forEach(function (s) {
    [selA, selB].forEach(function (sel) {
      var o = document.createElement('option');
      o.value = s.slug;
      o.textContent = s.title;
      sel.appendChild(o);
    });
  });
  function pick(slug, fallback) {
    return spaces.filter(function (s) { return s.slug === slug; })[0] ? slug : fallback;
  }
  var DEF_A = pick('primaries-srgb-rec709', spaces[0].slug);
  var DEF_B = pick('primaries-p3-d65', spaces[3] ? spaces[3].slug : spaces[1].slug);
  var QS = window.ToolState ? {
    a: { type: 'string', values: spaces.map(function (s) { return s.slug; }), default: DEF_A },
    b: { type: 'string', values: spaces.map(function (s) { return s.slug; }), default: DEF_B },
    ptr: { type: 'bool', default: true }
  } : null;
  var q = QS ? window.ToolState.parse(QS, window.location.search) : { a: DEF_A, b: DEF_B, ptr: true };
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

  var C = window.Chart2D;
  var W = 640, H = 560, M = { l: 56, r: 24, t: 24, b: 48 };
  var X0 = 0, X1 = 0.8;
  var S = C.makeScales(W, H, M, X0, X1);

  var G = window.Geom2D;
  var clip = G.clipPolygon;
  var polyArea = G.polygonArea;
  var triArea = G.triangleArea;
  function pct(v) { return (v * 100).toFixed(1) + '%'; }
  function share(part, whole) { return whole > 0 ? pct(part / whole) : '—'; }

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
      inside: inter / triArea(space.primaries)
    };
  }

  function draw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var a = spaces.filter(function (s) { return s.slug === selA.value; })[0];
    var b = spaces.filter(function (s) { return s.slug === selB.value; })[0];
    if (!a || !b) return;
    var showPtr = !!(PTR && chkPtr && chkPtr.checked);
    if (note) note.hidden = !showPtr;
    svg.setAttribute('aria-label', (isEn ? 'Gamut comparison: ' : '色域比对：') + a.title + ' / ' + b.title);

    var inter = clip(a.primaries, b.primaries);
    var interArea = inter.length > 2 ? polyArea(inter) : 0;
    var areaA = triArea(a.primaries);
    var areaB = triArea(b.primaries);

    C.addLocus(svg, S);
    C.addGrid(svg, S, W, H, M, X0, X1, 0.1);
    if (showPtr) C.addPolygon(svg, S, PTR.hull, COL_P, 2, { fillOpacity: 0.07, dash: '6 4' });
    C.addTriangle(svg, S, b, COL_B, 1.5);
    C.addTriangle(svg, S, a, COL_A, 2);
    if (inter.length > 2) {
      C.addPolygon(svg, S, inter, '#333', 1.2, { fillOpacity: 0, dash: '1 3' });
    }

    renderLegend(a, b, showPtr);
    header(showPtr);
    table.innerHTML = '';

    [[a, COL_A, 'A'], [b, COL_B, 'B']].forEach(function (pair) {
      var tr = row();
      swatchCell(tr, pair[1], pair[2] + ' · ' + pair[0].title);
      cell(tr, pct(triArea(pair[0].primaries)));
      cell(tr, pair[0].white[0].toFixed(4) + ', ' + pair[0].white[1].toFixed(4));
      if (showPtr) {
        var cov = pointerCoverage(pair[0]);
        var td = document.createElement('td');
        td.textContent = pct(cov.ofPointer);
        var sub = document.createElement('span');
        sub.className = 'c-cmp-sub';
        sub.textContent = isEn
          ? ' (' + pct(cov.inside) + ' inside)'
          : '（自身 ' + pct(cov.inside) + ' 在内）';
        td.appendChild(sub);
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
      ptr: chkPtr ? chkPtr.checked : true
    };
  }

  function persist() {
    if (QS) window.ToolState.write(QS, state());
  }

  function apply(next) {
    selA.value = next.a;
    selB.value = next.b;
    if (chkPtr) chkPtr.checked = next.ptr;
    draw();
  }

  function changed() {
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
    var a = spaces.filter(function (s) { return s.slug === selA.value; })[0];
    var b = spaces.filter(function (s) { return s.slug === selB.value; })[0];
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

  if (swapBtn) {
    swapBtn.addEventListener('click', function () {
      var a = selA.value;
      selA.value = selB.value;
      selB.value = a;
      changed();
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
  draw();
})();
