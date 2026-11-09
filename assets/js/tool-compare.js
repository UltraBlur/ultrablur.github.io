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
  selA.value = pick('primaries-srgb-rec709', spaces[0].slug);
  selB.value = pick('primaries-p3-d65', spaces[3] ? spaces[3].slug : spaces[1].slug);

  var C = window.Chart2D;
  var W = 640, H = 560, M = { l: 56, r: 24, t: 24, b: 48 };
  var X0 = 0, X1 = 0.8;
  var S = C.makeScales(W, H, M, X0, X1);

  var G = window.Geom2D;
  var clip = G.clipPolygon;
  var polyArea = G.polygonArea;
  var triArea = G.triangleArea;
  function pct(v) { return (v * 100).toFixed(1) + '%'; }

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
    var ths = ['', isEn ? 'Area in xy' : 'xy 面积', isEn ? 'White' : '白点'];
    if (showPtr) ths.push(isEn ? "Coverage of Pointer's Gamut" : "覆盖 Pointer's Gamut");
    ths.forEach(function (text) {
      var th = document.createElement('th');
      th.textContent = text;
      thead.appendChild(th);
    });
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

    C.addLocus(svg, S);
    C.addGrid(svg, S, W, H, M, X0, X1, 0.1);
    if (showPtr) C.addPolygon(svg, S, PTR.hull, COL_P, 2, { fillOpacity: 0.07, dash: '6 4' });
    C.addTriangle(svg, S, b, COL_B, 1.5);
    C.addTriangle(svg, S, a, COL_A, 2);

    header(showPtr);
    table.innerHTML = '';

    [[a, COL_A], [b, COL_B]].forEach(function (pair) {
      var tr = row();
      swatchCell(tr, pair[1], pair[0].title);
      cell(tr, pct(triArea(pair[0].primaries)));
      cell(tr, pair[0].white[0].toFixed(4) + ', ' + pair[0].white[1].toFixed(4));
      if (showPtr) {
        var cov = pointerCoverage(pair[0]);
        var td = document.createElement('td');
        td.textContent = pct(cov.ofPointer);
        var sub = document.createElement('span');
        sub.className = 'c-cmp-sub';
        sub.textContent = isEn
          ? '(' + pct(cov.inside) + ' inside)'
          : '（自身 ' + pct(cov.inside) + ' 在内）';
        td.appendChild(sub);
        tr.appendChild(td);
      }
    });

    if (showPtr) {
      var trP = row();
      swatchCell(trP, COL_P, PTR.title);
      cell(trP, pct(polyArea(PTR.hull)));
      cell(trP, isEn ? 'C illuminant' : 'C 光源');
      cell(trP, '100.0%');
    }

    var inter = clip(a.primaries, b.primaries);
    var interArea = inter.length > 2 ? polyArea(inter) : 0;
    var trI = row();
    cell(trI, isEn ? 'Overlap' : '交集');
    cell(trI, pct(interArea));
    cell(trI, triArea(a.primaries) > 0 ? pct(interArea / triArea(a.primaries)) + (isEn ? ' of A' : ' / A') : '');
    if (showPtr) cell(trI, '');
  }

  selA.addEventListener('change', draw);
  selB.addEventListener('change', draw);
  if (chkPtr) chkPtr.addEventListener('change', draw);
  draw();
})();
