/* 色适应条目页的白点推导区：源白 / 目标白 / D 三个控件，实时重算等效矩阵与白点校验。
   矩阵与白点算术全部走 js/lib/cat.js，页面不重复一份公式。 */
(function () {
  'use strict';

  var TEXT = {
    zh: {
      source: '源白', target: '目标白', adaptation: '适应度 D',
      matrix: '等效矩阵（M⁻¹ · diag(D_R, D_G, D_B) · M）',
      scale: 'XYZ（Y = 100）',
      white: '白点',
      partial: 'D < 1 是不完全适应：白点不会精确落到目标白，单步式也不具备双向对称。要看严格对称的两步法，用 Zhai & Luo (2018)。',
      error: '与目标白的最大 XYZ 分量差（Y = 100）'
    },
    en: {
      source: 'Source white', target: 'Target white', adaptation: 'Degree D',
      matrix: 'Equivalent matrix (M⁻¹ · diag(D_R, D_G, D_B) · M)',
      scale: 'XYZ (Y = 100)',
      white: 'white',
      partial: 'D < 1 is incomplete adaptation: the white does not land exactly on the target, and the one-step form is not symmetric under swapping source and target. For the symmetric two-step form, use Zhai & Luo (2018).',
      error: 'Max XYZ component diff from target white (Y = 100)'
    }
  };

  function rows(m, digits) {
    var out = '';
    for (var i = 0; i < 3; i++) {
      if (i) out += '\n';
      out += '[ ' + m[i * 3].toFixed(digits) + ' ' + m[i * 3 + 1].toFixed(digits) + ' ' + m[i * 3 + 2].toFixed(digits) + ' ]';
    }
    return out;
  }
  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function init() {
    var node = document.getElementById('cat-data');
    var lib = window.CatTransforms;
    if (!node || !lib) return;

    var data;
    try { data = JSON.parse(node.textContent); } catch (e) { return; }
    var t = TEXT[data.lang] || TEXT.zh;
    var slug = data.slug;
    var state = { src: data.src, dst: data.dst, D: 1 };

    var mount = document.getElementById('cat-adapt');
    if (!mount) return;

    var controls = make('div', 'c-cat-wp-controls');
    function whiteSelect(labelText, value, role) {
      var label = make('label');
      label.appendChild(make('span', '', labelText));
      var sel = document.createElement('select');
      sel.setAttribute('data-role', role);
      lib.WHITE_LIST.forEach(function (w) {
        var opt = document.createElement('option');
        opt.value = w;
        opt.textContent = w;
        if (w === value) opt.selected = true;
        sel.appendChild(opt);
      });
      label.appendChild(sel);
      controls.appendChild(label);
      return sel;
    }
    var selSrc = whiteSelect(t.source, state.src, 'src');
    controls.appendChild(make('span', 'c-cat-arrow', '→'));
    var selDst = whiteSelect(t.target, state.dst, 'dst');
    var dLabel = make('label');
    dLabel.appendChild(make('span', '', t.adaptation));
    var dInput = document.createElement('input');
    dInput.type = 'range';
    dInput.min = '0';
    dInput.max = '1';
    dInput.step = '0.01';
    dInput.value = '1';
    var dOut = make('span', 'c-cat-val', '1.00');
    dLabel.appendChild(dInput);
    dLabel.appendChild(dOut);
    controls.appendChild(dLabel);
    mount.appendChild(controls);

    var out = make('div', 'c-cat-wp-out');
    mount.appendChild(out);

    function render() {
      out.innerHTML = '';
      var A = lib.matrix(slug, state.src, state.dst, state.D);
      if (!A) {
        out.appendChild(make('p', 'c-cat-note', 'No matrix for ' + slug + '.'));
        return;
      }
      out.appendChild(make('p', 'c-cat-axis', state.src + ' → ' + state.dst + ' · D = ' + state.D.toFixed(2)));
      out.appendChild(make('p', 'c-cat-axis', t.matrix));
      var pre = make('pre', 'c-cat-m', rows(A, 6));
      out.appendChild(pre);

      var ws = lib.WHITES[state.src], wd = lib.WHITES[state.dst];
      if (!ws || !wd) return;
      var XYZw = lib.xyToXYZ(ws[0], ws[1]);
      var XYZd = lib.xyToXYZ(wd[0], wd[1]);
      var adapted = lib.mulv(A, XYZw);
      var f = function (v) { return (v * 100).toFixed(6); };

      out.appendChild(make('p', 'c-cat-axis', t.scale + (data.lang === 'en' ? ': source white, adapted, target white' : '：源白、适应后、目标白')));
      var table = document.createElement('table');
      table.className = 'c-cat-check';
      table.innerHTML =
        '<thead><tr><th></th><th>X</th><th>Y</th><th>Z</th></tr></thead>' +
        '<tbody>' +
        '<tr><td>' + state.src + ' ' + (data.lang === 'en' ? 'white' : '白点') + '</td><td>' + f(XYZw[0]) + '</td><td>' + f(XYZw[1]) + '</td><td>' + f(XYZw[2]) + '</td></tr>' +
        '<tr><td>' + (data.lang === 'en' ? 'Adapted' : '适应后') + '</td><td>' + f(adapted[0]) + '</td><td>' + f(adapted[1]) + '</td><td>' + f(adapted[2]) + '</td></tr>' +
        '<tr><td>' + state.dst + ' ' + (data.lang === 'en' ? 'white' : '白点') + '</td><td>' + f(XYZd[0]) + '</td><td>' + f(XYZd[1]) + '</td><td>' + f(XYZd[2]) + '</td></tr>' +
        '</tbody>';
      out.appendChild(table);

      var err = Math.max(
        Math.abs(adapted[0] - XYZd[0]),
        Math.abs(adapted[1] - XYZd[1]),
        Math.abs(adapted[2] - XYZd[2])
      ) * 100;
      out.appendChild(make('p', 'c-cat-err', t.error + ' ' + err.toExponential(1)));
      if (state.D < 0.999) out.appendChild(make('p', 'c-cat-note', t.partial));
    }

    selSrc.addEventListener('change', function () { state.src = selSrc.value; render(); });
    selDst.addEventListener('change', function () { state.dst = selDst.value; render(); });
    dInput.addEventListener('input', function () {
      state.D = parseFloat(dInput.value);
      dOut.textContent = state.D.toFixed(2);
      render();
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
