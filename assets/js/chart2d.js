/* 共用 2D xy 图元：比例、网格、光谱轨迹、色域三角形 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function makeScales(W, H, M, x0, x1) {
    return {
      sx: function (x) { return M.l + (x - x0) / (x1 - x0) * (W - M.l - M.r); },
      sy: function (y) { return H - M.b - (y - x0) / (x1 - x0) * (H - M.t - M.b); }
    };
  }

  function addGrid(svg, s, W, H, M, x0, x1, step) {
    for (var g = x0; g <= x1 + 1e-9; g += step) {
      var v = Math.round(g * 1000) / 1000;
      svg.appendChild(el('line', { x1: s.sx(v), y1: s.sy(x0), x2: s.sx(v), y2: s.sy(x1), stroke: '#eee' }));
      svg.appendChild(el('line', { x1: s.sx(x0), y1: s.sy(v), x2: s.sx(x1), y2: s.sy(v), stroke: '#eee' }));
      var tx = el('text', { x: s.sx(v), y: s.sy(x0) + 16, 'font-size': 10, fill: '#999', 'text-anchor': 'middle' });
      tx.textContent = v.toFixed(1);
      svg.appendChild(tx);
      var ty = el('text', { x: s.sx(x0) - 8, y: s.sy(v) + 3, 'font-size': 10, fill: '#999', 'text-anchor': 'end' });
      ty.textContent = v.toFixed(1);
      svg.appendChild(ty);
    }
    svg.appendChild(el('line', { x1: s.sx(x0), y1: s.sy(x0), x2: s.sx(x1), y2: s.sy(x0), stroke: '#bbb' }));
    svg.appendChild(el('line', { x1: s.sx(x0), y1: s.sy(x0), x2: s.sx(x0), y2: s.sy(x1), stroke: '#bbb' }));
    var lx = el('text', { x: s.sx((x0 + x1) / 2), y: H - 12, 'font-size': 11, fill: '#666', 'text-anchor': 'middle' });
    lx.textContent = 'x';
    svg.appendChild(lx);
    var ly = el('text', { x: 14, y: s.sy((x0 + x1) / 2), 'font-size': 11, fill: '#666', 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + s.sy((x0 + x1) / 2) + ')' });
    ly.textContent = 'y';
    svg.appendChild(ly);
  }

  function addLocus(svg, s) {
    var locus = root.CIE1931_LOCUS;
    if (!locus || locus.length < 3) return;
    var pts = locus.map(function (p) { return s.sx(p[0]) + ',' + s.sy(p[1]); }).join(' ');
    svg.appendChild(el('polygon', { points: pts, fill: '#f2f2f2', stroke: '#d8d8d8', 'stroke-width': 1 }));
  }

  function addTriangle(svg, s, space, color, width) {
    var pts = space.primaries.map(function (p) { return s.sx(p[0]) + ',' + s.sy(p[1]); }).join(' ');
    svg.appendChild(el('polygon', { points: pts, fill: color, 'fill-opacity': 0.12, stroke: color, 'stroke-width': width }));
    space.primaries.forEach(function (p) {
      svg.appendChild(el('circle', { cx: s.sx(p[0]), cy: s.sy(p[1]), r: 3, fill: color }));
    });
    var w = space.white;
    svg.appendChild(el('circle', { cx: s.sx(w[0]), cy: s.sy(w[1]), r: 3, fill: 'none', stroke: color, 'stroke-width': 1.5 }));
  }

  root.Chart2D = { el: el, makeScales: makeScales, addGrid: addGrid, addLocus: addLocus, addTriangle: addTriangle };
})(typeof window !== 'undefined' ? window : globalThis);
