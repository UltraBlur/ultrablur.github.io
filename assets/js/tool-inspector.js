/* 多模型取色：HSV / LCH / OKLCH / JMH / JzCH */
(function () {
  'use strict';
  var host = document.querySelector('[data-inspector]');
  if (!host) return;
  var cfg = JSON.parse(document.getElementById('inspect-data').textContent);
  var P = window.ColourPolar;
  if (!P) return;
  var canvas = document.getElementById('ins-plane');
  var ctx = canvas.getContext('2d');
  var modelSel = document.getElementById('ins-model');
  var hueIn = document.getElementById('ins-hue');
  var hexIn = document.getElementById('ins-hex');
  var swatch = document.getElementById('ins-swatch');
  var axes = document.getElementById('ins-axes');
  var lumSel = document.getElementById('ins-lum');
  var coords = document.getElementById('ins-coord');
  var en = cfg.lang === 'en';

  var state = { model: 'lch', h: 40, c: 60, l: 60, lw: 100, rgb: [1, 0, 0] };

  function hexOf(rgb) {
    return '#' + rgb.map(function (c) {
      var v = Math.round(Math.max(0, Math.min(1, c)) * 255);
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('').toUpperCase();
  }
  function parseHex(v) {
    v = (v || '').trim().replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
    return [0, 2, 4].map(function (i) { return parseInt(v.substr(i, 2), 16) / 255; });
  }

  /* 当前色相下色域能到的最大色度，用来把画面横向撑满 */
  function scanCMax(m, h) {
    var cR = m.ranges.c, lR = m.ranges.l, best = 0;
    var ni = state.model === 'jmh' ? 24 : 60;
    for (var i = 1; i <= ni; i++) {
      var c = cR[1] * i / ni;
      for (var j = 0; j < 24; j++) {
        var l = lR[0] + (lR[1] - lR[0]) * j / 23;
        var rgb = m.toRgb(h, c, l);
        if (rgb && P.inGamut(rgb)) { if (c > best) best = c; break; }
      }
    }
    return best > 0 ? Math.min(cR[1], best * 1.06) : cR[1];
  }

  function drawPlane() {
    var m = P.models[state.model];
    // JMH 需要逐像素数值反解，分辨率降一档以免卡顿
    var target = 300;
    if (canvas.width !== target) {
      canvas.width = target;
      canvas.height = Math.round(target * 0.75);
    }
    var W = canvas.width, H = canvas.height;
    var img = ctx.createImageData(W, H);
    var d = img.data;
    var cR = [m.ranges.c[0], scanCMax(m, state.h)], lR = m.ranges.l;
    for (var y = 0; y < H; y++) {
      var l = lR[1] - (lR[1] - lR[0]) * (y / (H - 1));
      for (var x = 0; x < W; x++) {
        var c = cR[0] + (cR[1] - cR[0]) * (x / (W - 1));
        var rgb = null;
        try { rgb = m.toRgb(state.h, c, l); } catch (err) { rgb = null; }
        var i = (y * W + x) * 4;
        if (rgb && P.inGamut(rgb)) {
          d[i] = Math.round(Math.max(0, Math.min(1, rgb[0])) * 255);
          d[i + 1] = Math.round(Math.max(0, Math.min(1, rgb[1])) * 255);
          d[i + 2] = Math.round(Math.max(0, Math.min(1, rgb[2])) * 255);
        } else {
          d[i] = 236; d[i + 1] = 236; d[i + 2] = 236;
        }
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    host.setAttribute('data-model', state.model);
    // 光标
    var cx = (state.c - cR[0]) / (cR[1] - cR[0]) * (W - 1);
    var cy = (1 - (state.l - lR[0]) / (lR[1] - lR[0])) * (H - 1);
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    axes.textContent = m.cLabel + ' 0–' + (Math.round(cR[1] * 100) / 100) + ' · ' +
                       m.lLabel + ' ' + (Math.round(lR[0] * 100) / 100) + '–' + (Math.round(lR[1] * 100) / 100);
  }

  /* JzCH 的纵轴跟着参考白走：顶到白点的 Jz */
  function syncJzRange() {
    var lw = parseFloat(lumSel.value) || 100;
    state.lw = lw;
    P.setWhite(lw);
    P.models.jzch.ranges.l = [0, P.whiteJz()];
  }

  function render() {
    var rgb = state.rgb;
    hexIn.value = hexOf(rgb);
    swatch.style.background = hexOf(rgb);
    drawPlane();

    coords.innerHTML = '';
    function row(label, vals) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + label + '</td><td>' + vals + '</td>';
      coords.appendChild(tr);
    }
    function f(v, d) { return v.toFixed(d === undefined ? 2 : d); }
    var xyz = P.xyzFromRgb(rgb);
    var lab = P.labFromXyz(xyz);
    row('HEX / sRGB', hexOf(rgb) + '   ' + rgb.map(function (v) { return Math.round(v * 255); }).join(', '));
    var models = ['hsv', 'lch', 'oklch', 'jmh', 'jmhh', 'jzch'];
    models.forEach(function (id) {
      var mm = P.models[id];
      var p = mm.fromRgb(rgb);
      row(mm.label, f(p[0]) + '°, ' + f(p[1], 3) + ', ' + f(p[2], 2));
    });
    row('Lab', lab.map(function (v) { return f(v); }).join(', '));
    row('XYZ', xyz.map(function (v) { return f(v, 4); }).join(', '));
  }

  function syncFromRgb(rgb) {
    var m = P.models[state.model];
    var p = m.fromRgb(rgb);
    state.h = p[0]; state.c = p[1]; state.l = p[2];
    state.rgb = rgb;
    hueIn.value = Math.round(state.h);
  }

  function setFromCanvas(e) {
    var r = canvas.getBoundingClientRect();
    var fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    var m = P.models[state.model];
    var cR = [m.ranges.c[0], scanCMax(m, state.h)], lR = m.ranges.l;
    state.c = cR[0] + (cR[1] - cR[0]) * fx;
    state.l = lR[1] - (lR[1] - lR[0]) * fy;
    var rgb = m.toRgb(state.h, state.c, state.l);
    state.rgb = rgb ? rgb.map(function (v) { return Math.max(0, Math.min(1, v)); }) : state.rgb;
    render();
  }

  var dragging = false;
  canvas.addEventListener('pointerdown', function (e) { dragging = true; canvas.setPointerCapture(e.pointerId); setFromCanvas(e); });
  canvas.addEventListener('pointermove', function (e) { if (dragging) setFromCanvas(e); });
  canvas.addEventListener('pointerup', function () { dragging = false; });
  canvas.addEventListener('pointercancel', function () { dragging = false; });

  hueIn.addEventListener('input', function () {
    state.h = parseFloat(hueIn.value) || 0;
    var m = P.models[state.model];
    var rgb = m.toRgb(state.h, state.c, state.l);
    if (rgb) state.rgb = rgb.map(function (v) { return Math.max(0, Math.min(1, v)); });
    render();
  });

  modelSel.addEventListener('change', function () {
    state.model = modelSel.value;
    syncFromRgb(state.rgb);
    render();
  });

  hexIn.addEventListener('input', function () {
    var rgb = parseHex(hexIn.value);
    if (!rgb) return;
    syncFromRgb(rgb);
    render();
  });

  lumSel.addEventListener('change', function () {
    syncJzRange();
    var p = P.models[state.model].fromRgb(state.rgb);
    state.h = p[0]; state.c = p[1]; state.l = p[2];
    hueIn.value = Math.round(state.h);
    render();
  });

  syncJzRange();
  syncFromRgb([1, 0, 0]);
  render();
})();
