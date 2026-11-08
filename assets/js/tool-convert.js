/* 线性 RGB 跨空间换算：rgb → XYZ → 目标 rgb */
(function () {
  'use strict';
  var host = document.querySelector('[data-convert]');
  if (!host) return;
  var cfg = JSON.parse(document.getElementById('convert-data').textContent);
  var spaces = (cfg.spaces || []).filter(function (s) { return s.matrix; });
  if (spaces.length < 2) return;

  var selA = document.getElementById('cvt-a');
  var selB = document.getElementById('cvt-b');
  var inR = document.getElementById('cvt-r');
  var inG = document.getElementById('cvt-g');
  var inB = document.getElementById('cvt-b-in');
  var outXyz = document.getElementById('cvt-xyz');
  var outRgb = document.getElementById('cvt-out');
  var outFlag = document.getElementById('cvt-flag');

  spaces.forEach(function (s) {
    [selA, selB].forEach(function (sel) {
      var o = document.createElement('option');
      o.value = s.slug;
      o.textContent = s.title;
      sel.appendChild(o);
    });
  });
  selA.value = spaces[0].slug;
  selB.value = (spaces[3] || spaces[1]).slug;

  function flat(m) {
    if (m.length === 9 && typeof m[0] === 'number') return m.slice();
    var out = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) out.push(m[i][j]);
    return out;
  }
  function inv3(A) {
    var a = A[0], b = A[1], c = A[2], d = A[3], e = A[4], f = A[5], g = A[6], h = A[7], i = A[8];
    var A00 = e * i - f * h, A01 = -(d * i - f * g), A02 = d * h - e * g;
    var det = a * A00 + b * A01 + c * A02;
    if (!det) return null;
    var s = 1 / det;
    return [
      A00 * s, -(b * i - c * h) * s, (b * f - c * e) * s,
      A01 * s, (a * i - c * g) * s, -(a * f - c * d) * s,
      A02 * s, -(a * h - b * g) * s, (a * e - b * d) * s
    ];
  }
  function mul(A, v) {
    return [
      A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
      A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
      A[6] * v[0] + A[7] * v[1] + A[8] * v[2]
    ];
  }
  function fmt(v) { return v.toFixed(4); }

  function run() {
    var a = spaces.filter(function (s) { return s.slug === selA.value; })[0];
    var b = spaces.filter(function (s) { return s.slug === selB.value; })[0];
    var rgb = [parseFloat(inR.value) || 0, parseFloat(inG.value) || 0, parseFloat(inB.value) || 0];
    var xyz = mul(flat(a.matrix), rgb);
    var invB = inv3(flat(b.matrix));
    if (!invB) { outRgb.textContent = '-'; return; }
    var out = mul(invB, xyz);
    outXyz.textContent = xyz.map(fmt).join(',  ');
    outRgb.textContent = out.map(fmt).join(',  ');
    var lo = Math.min.apply(null, out), hi = Math.max.apply(null, out);
    if (lo < -1e-6 || hi > 1 + 1e-6) {
      outFlag.textContent = cfg.lang === 'en' ? 'Outside the target gamut' : '超出目标色域';
      outFlag.style.color = '#a33';
    } else {
      outFlag.textContent = cfg.lang === 'en' ? 'Inside' : '在色域内';
      outFlag.style.color = '#2a6';
    }
  }

  [selA, selB, inR, inG, inB].forEach(function (el) {
    el.addEventListener('input', run);
    el.addEventListener('change', run);
  });
  run();
})();
