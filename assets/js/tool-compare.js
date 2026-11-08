/* 色域比对：两个空间的 xy 三角形、白点与面积 */
(function () {
  'use strict';
  var host = document.querySelector('[data-compare]');
  if (!host) return;
  var cfg = JSON.parse(document.getElementById('compare-data').textContent);
  var spaces = cfg.spaces || [];
  if (!spaces.length) return;

  var svg = host.querySelector('svg');
  var table = host.querySelector('tbody');
  var selA = document.getElementById('cmp-a');
  var selB = document.getElementById('cmp-b');

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

  /* 凸多边形裁剪（Sutherland–Hodgman） */
  function clip(subject, clipPoly) {
    var out = subject.slice();
    for (var i = 0; i < clipPoly.length && out.length; i++) {
      var a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length];
      var input = out;
      out = [];
      for (var j = 0; j < input.length; j++) {
        var p = input[j], q = input[(j + 1) % input.length];
        var side = function (pt) { return (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]); };
        var sp = side(p), sq = side(q);
        if (sp >= 0) out.push(p);
        if ((sp >= 0) !== (sq >= 0)) {
          var t = sp / (sp - sq);
          out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
    }
    return out;
  }
  function polyArea(pts) {
    var s2 = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s2 += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s2) / 2;
  }
  function area(tri) {
    var a = tri[0], b = tri[1], c = tri[2];
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }

  function draw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var a = spaces.filter(function (s) { return s.slug === selA.value; })[0];
    var b = spaces.filter(function (s) { return s.slug === selB.value; })[0];
    if (!a || !b) return;

    C.addLocus(svg, S);
    C.addGrid(svg, S, W, H, M, X0, X1, 0.1);
    function tri(space, color, width) { C.addTriangle(svg, S, space, color, width); }
    tri(b, '#b06a00', 1.5);
    tri(a, '#1f5f8b', 2);

    table.innerHTML = '';
    [[a, '#1f5f8b'], [b, '#b06a00']].forEach(function (pair) {
      var tr = document.createElement('tr');
      var name = document.createElement('td');
      name.textContent = pair[0].title;
      var ar = document.createElement('td');
      ar.textContent = (area(pair[0].primaries) * 100).toFixed(1) + '%';
      var wh = document.createElement('td');
      wh.textContent = pair[0].white[0].toFixed(4) + ', ' + pair[0].white[1].toFixed(4);
      tr.appendChild(name); tr.appendChild(ar); tr.appendChild(wh);
      table.appendChild(tr);
    });
    var inter = clip(a.primaries, b.primaries);
    var interArea = inter.length > 2 ? polyArea(inter) : 0;
    var trI = document.createElement('tr');
    trI.innerHTML = '<td>' + (document.documentElement.lang === 'en' ? 'Overlap' : '交集') + '</td>' +
      '<td>' + (interArea * 100).toFixed(1) + '%</td>' +
      '<td>' + (area(a.primaries) > 0 ? (interArea / area(a.primaries) * 100).toFixed(1) + '% of A' : '') + '</td>';
    table.appendChild(trI);
  }

  selA.addEventListener('change', draw);
  selB.addEventListener('change', draw);
  draw();
})();
