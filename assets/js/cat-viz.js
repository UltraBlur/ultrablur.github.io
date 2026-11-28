/* 色适应实验室：24 色卡沙盒、u'v' 位移矢量场、锥体光谱灵敏度、D(L_A) 与 Zhai 2018 两步法。
   纯原生 SVG，无第三方依赖。矩阵与数值计算全部走 lib/cat.js，本文件只负责状态、绘制与交互。
   数据由模板注入的 #cat-viz-data 提供（cats / locus / defaults），不在代码里另存光谱数据。 */
(function (root) {
  'use strict';

  var STRINGS = {
    zh: {
      source: '源白', target: '目标白', catA: 'CAT A（左上）', catB: 'CAT B（右下）',
      adaptation: '适应度 D', modeLabel: '对比模式', modeAB: 'CAT A vs B', modePre: '适应前 vs A',
      gridAB: 'ColorChecker 24 · 左上 {a} / 右下 {b}（角标 ΔE00）',
      gridPre: 'ColorChecker 24 · 左上 适应前 / 右下 A（角标 ΔE00）',
      mean: '24 色平均 ΔE00', detailHint: '悬停或点击任意色块，查看该色在 A、B 下的 XYZ、u\'v\' 与色差。',
      uvTitle: 'CIE 1976 u\'v\' 均匀色度图', uvLegend: '实心点 = A · 空心圈 = B', uvLegendPre: '实心点 = 适应前 · 空心圈 = A', beforeLabel: '适应前', uvNote: '大跨度白点（如 A → D65）下把 B 切到 XYZ Scaling，红、蓝、紫方向的落点会相对 Bradford / CAT16 明显拉偏。',
      conesTitle: '有效锥体光谱灵敏度', main: '主变换（实线）', reference: '参考对比（虚线）',
      neg: '高亮负瓣（< 0 区域）', howToRead: '每条曲线由 CIE 1931 2° 光谱三刺激值经 M · [x̄, ȳ, z̄]ᵀ 计算并按各自峰值归一。锐化让峰更窄、重叠更小，也会在 450–510 nm 附近引入负瓣。',
      channelR: 'ρ(λ) 长波 / L', channelG: 'γ(λ) 中波 / M', channelB: 'β(λ) 短波 / S',
      peak: '峰值', lowest: '最低', noNeg: '无负瓣', at: '于',
      dTitle: '适应度 D 随适应场亮度 L_A 变化', laLabel: '适应场亮度 L_A', surround: '环绕 F',
      meanSurround: '平均 (1.0)', dimSurround: '昏暗 (0.9)', darkSurround: '黑暗 (0.8)',
      camF1: 'CIECAM02 F=1.0', camF09: 'F=0.9', camF08: 'F=0.8', cmcName: 'CMCCAT2000',
      singleShort: '单步', zhaiShort: 'Zhai 2018',
      laReadout: 'CIECAM02 D', cmcReadout: 'CMCCAT2000 D',
      zhaiTitle: '单步法 vs Zhai & Luo (2018) 两步法', sourceDb: '源 D_b', targetDd: '目标 D_d',
      singleLanding: '单步落点', zhaiLanding: 'Zhai 2018 落点', bi: '基线 E', sourceWhite: '源白 A', targetWhite: '目标白 D65',
      singleReadout: '单步（仅用 D_b）', zhaiReadout: 'Zhai 2018（D_b、D_d 经 E）', diff: '两者差 ΔE00', preDE: '适应前 → A 的 ΔE00',
      sampleNote: '样品取源白 A 本身，观察白点在 u\'v\' 上的落点。', demoNote: '这里的 24 色块先由 D65 基准经 CAT16 反推到源白，再分别跑 CAT A 和 B；角标 ΔE00 只反映两种算法之间的预测差别，不代表相对实测的准确率。'
    },
    en: {
      source: 'Source white', target: 'Target white', catA: 'CAT A (top left)', catB: 'CAT B (bottom right)',
      adaptation: 'Degree D', modeLabel: 'Compare', modeAB: 'CAT A vs B', modePre: 'Before vs A',
      gridAB: 'ColorChecker 24 · {a} top left / {b} bottom right (badge ΔE00)',
      gridPre: 'ColorChecker 24 · before top left / A bottom right (badge ΔE00)',
      mean: '24-patch mean ΔE00', detailHint: 'Hover or click a patch to read its XYZ, u\'v\' and colour difference under A and B.',
      uvTitle: 'CIE 1976 u\'v\' chromaticity diagram', uvLegend: 'filled = A · open = B', uvLegendPre: 'filled = before · open = A', beforeLabel: 'Before', uvNote: 'For a wide white-point change (A → D65), switching B to XYZ Scaling pulls reds, blues and purples visibly away from Bradford / CAT16.',
      conesTitle: 'Effective cone spectral sensitivities', main: 'Main transform (solid)', reference: 'Reference (dashed)',
      neg: 'Highlight negative lobes (< 0)', howToRead: 'Each curve is M · [x̄, ȳ, z̄]ᵀ from the CIE 1931 2° colour-matching functions, normalised to its own peak. Sharpening narrows the peaks and reduces overlap, and introduces negative lobes around 450–510 nm.',
      channelR: 'ρ(λ) long / L', channelG: 'γ(λ) middle / M', channelB: 'β(λ) short / S',
      peak: 'peak', lowest: 'min', noNeg: 'no negative lobe', at: 'at',
      dTitle: 'Degree of adaptation D against adapting luminance L_A', laLabel: 'Adapting luminance L_A', surround: 'Surround F',
      meanSurround: 'Average (1.0)', dimSurround: 'Dim (0.9)', darkSurround: 'Dark (0.8)',
      camF1: 'CIECAM02 F=1.0', camF09: 'F=0.9', camF08: 'F=0.8', cmcName: 'CMCCAT2000',
      singleShort: 'one-step', zhaiShort: 'Zhai 2018',
      laReadout: 'CIECAM02 D', cmcReadout: 'CMCCAT2000 D',
      zhaiTitle: 'One-step vs Zhai & Luo (2018) two-step', sourceDb: 'Source D_b', targetDd: 'Target D_d',
      singleLanding: 'one-step', zhaiLanding: 'Zhai 2018', bi: 'baseline E', sourceWhite: 'source A', targetWhite: 'target D65',
      singleReadout: 'one-step (D_b only)', zhaiReadout: 'Zhai 2018 (D_b, D_d via E)', diff: 'difference ΔE00', preDE: 'before → A ΔE00',
      sampleNote: 'The sample is the source white A itself, so the chart shows where the white point lands in u\'v\'.', demoNote: 'The 24 patches are simulated from D65 to the source white via CAT16 before running CAT A and B; the ΔE00 badges show the difference between two predictions, not accuracy against measured data.'
    }
  };

  /* ColorChecker 24 的常用 sRGB 8 bit 近似值（BabelColor 口径的公开表）。 */
  var CC24 = [
    ['Dark Skin', [115, 82, 68]], ['Light Skin', [194, 150, 130]], ['Blue Sky', [98, 122, 157]],
    ['Foliage', [87, 108, 67]], ['Blue Flower', [133, 128, 177]], ['Bluish Green', [103, 189, 170]],
    ['Orange', [214, 126, 44]], ['Purplish Blue', [80, 91, 166]], ['Moderate Red', [193, 90, 99]],
    ['Purple', [94, 60, 108]], ['Yellow Green', [157, 188, 64]], ['Orange Yellow', [224, 163, 46]],
    ['Blue', [56, 61, 150]], ['Green', [70, 148, 73]], ['Red', [175, 54, 60]],
    ['Yellow', [231, 199, 31]], ['Magenta', [187, 86, 149]], ['Cyan', [8, 133, 161]],
    ['White 9.5', [243, 243, 242]], ['Neutral 8', [200, 200, 200]], ['Neutral 6.5', [160, 160, 160]],
    ['Neutral 5', [122, 122, 121]], ['Neutral 3.5', [85, 85, 85]], ['Black 2', [52, 52, 52]]
  ];
  var SRGB_TO_XYZ = [0.4124564, 0.3575761, 0.1804375,
    0.2126729, 0.7151522, 0.0721750,
    0.0193339, 0.1191920, 0.9503041];
  var XYZ_TO_SRGB = [3.2404542, -1.5371385, -0.4985314,
    -0.9692660, 1.8760108, 0.0415560,
    0.0556434, -0.2040259, 1.0572252];

  var store = null;
  var activePickHandler = null;
  var pickBound = false;

  function srgbToLin(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linToSrgb(c) {
    c = Math.max(0, Math.min(1, c));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  }
  function xyzToCss(XYZ, lib) {
    var rgb = lib.mulv(XYZ_TO_SRGB, XYZ);
    return 'rgb(' + linToSrgb(rgb[0]) + ',' + linToSrgb(rgb[1]) + ',' + linToSrgb(rgb[2]) + ')';
  }
  function fmt(v, n) {
    return (Math.abs(v) < Math.pow(10, -n) ? 0 : v).toFixed(n);
  }
  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) node.setAttribute(k, attrs[k]);
    return node;
  }
  function appendSvg(svg, tag, attrs, text) {
    var node = svgEl(tag, attrs);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  }

  function locusXYZ(lib, p) {
    var x = p[0], y = p[1], ybar = p[2];
    if (!(y > 0)) return null;
    return [(x / y) * ybar, ybar, ((1 - x - y) / y) * ybar];
  }
  function locusUV(lib, data) {
    return data.locus.map(function (p) {
      var XYZ = locusXYZ(lib, p);
      return XYZ ? lib.xyzToUV(XYZ) : null;
    }).filter(Boolean);
  }

  /* ---------- 组件 A：24 色卡沙盒 + 组件 C：u'v' 矢量场 ---------- */
  function mountSandbox(el, ctx) {
    var lib = ctx.lib, t = ctx.t;
    var defaults = ctx.data.defaults || {};
    var state = {
      src: defaults.src || 'A',
      dst: defaults.dst || 'D65',
      a: defaults.a || 'bradford',
      b: defaults.b || 'xyz-scaling',
      D: 1,
      mode: 'ab',
      active: 14,
      rows: null
    };
    var WHITE_NAMES = lib.WHITE_LIST;
    var CAT_NAMES = ctx.data.cats;

    var wrap = make('div', 'c-cat-lab');
    var controls = make('div', 'c-cat-lab-controls');

    function select(labelText, role, options, value) {
      var lab = make('label');
      lab.appendChild(make('span', '', labelText));
      var sel = document.createElement('select');
      sel.setAttribute('data-role', role);
      options.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === value) opt.selected = true;
        sel.appendChild(opt);
      });
      lab.appendChild(sel);
      controls.appendChild(lab);
      return sel;
    }
    var whiteOpts = WHITE_NAMES.map(function (w) { return { value: w, label: w }; });
    var catOpts = CAT_NAMES.map(function (c) { return { value: c.slug, label: c.name }; });

    var selSrc = select(t.source, 'src', whiteOpts, state.src);
    controls.appendChild(make('span', 'c-cat-arrow', '→'));
    var selDst = select(t.target, 'dst', whiteOpts, state.dst);
    var selA = select(t.catA, 'a', catOpts, state.a);
    var selB = select(t.catB, 'b', catOpts, state.b);

    var dLab = make('label');
    dLab.appendChild(make('span', '', t.adaptation));
    var dInput = document.createElement('input');
    dInput.type = 'range';
    dInput.min = '0';
    dInput.max = '1';
    dInput.step = '0.01';
    dInput.value = '1';
    dInput.setAttribute('data-role', 'd');
    var dOut = make('span', 'c-cat-val', '1.00');
    dLab.appendChild(dInput);
    dLab.appendChild(dOut);
    controls.appendChild(dLab);

    var modeGroup = make('div', 'c-cat-modegroup');
    modeGroup.appendChild(make('span', 'c-cat-controllabel', t.modeLabel));
    var seg = make('div', 'c-cat-seg');
    var btnAB = make('button', 'is-on', t.modeAB);
    var btnPre = make('button', '', t.modePre);
    btnAB.type = btnPre.type = 'button';
    btnAB.setAttribute('data-mode', 'ab');
    btnPre.setAttribute('data-mode', 'pre');
    seg.appendChild(btnAB);
    seg.appendChild(btnPre);
    modeGroup.appendChild(seg);
    controls.appendChild(modeGroup);

    var gridWrap = make('div', 'c-cat-lab-grid');
    var panelA = make('div', 'c-cat-panel');
    var headA = make('div', 'c-cat-panel-head');
    var gridTitle = make('span');
    var meanEl = make('span', 'c-cat-mean');
    headA.appendChild(gridTitle);
    headA.appendChild(meanEl);
    var grid = make('div', 'c-cat-grid');
    grid.setAttribute('data-role', 'grid');
    var detail = make('div', 'c-cat-detail');
    var demoNote = make('p', 'c-cat-note', t.demoNote);
    panelA.appendChild(headA);
    panelA.appendChild(grid);
    panelA.appendChild(detail);
    panelA.appendChild(demoNote);

    var panelB = make('div', 'c-cat-panel');
    var headB = make('div', 'c-cat-panel-head');
    headB.appendChild(make('span', '', t.uvTitle));
    var uvLegend = make('span', 'c-cat-legend', t.uvLegend);
    headB.appendChild(uvLegend);
    var svgWrap = make('div', 'c-cat-svgwrap');
    var uvSvg = svgEl('svg', { viewBox: '0 0 440 420', role: 'img', 'aria-label': t.uvTitle });
    uvSvg.style.display = 'block';
    uvSvg.style.width = '100%';
    uvSvg.style.height = 'auto';
    svgWrap.appendChild(uvSvg);
    panelB.appendChild(headB);
    panelB.appendChild(svgWrap);
    panelB.appendChild(make('p', 'c-cat-note', t.uvNote));

    gridWrap.appendChild(panelA);
    gridWrap.appendChild(panelB);
    wrap.appendChild(controls);
    wrap.appendChild(gridWrap);
    el.appendChild(wrap);

    function recompute() {
      var Wdst = lib.whiteXYZ(state.dst);
      var simToSrc = lib.matrix('cat16', 'D65', state.src, 1);
      var toDisp = state.dst === 'D65' ? null : lib.matrix('bradford', state.dst, 'D65', 1);
      var toDisplay = function (xyz) { return toDisp ? lib.mulv(toDisp, xyz) : xyz; };
      var MA = lib.matrix(state.a, state.src, state.dst, state.D);
      var MB = lib.matrix(state.b, state.src, state.dst, state.D);
      if (!MA || !MB) return [];

      return CC24.map(function (item, idx) {
        var srgb = item[1];
        var xyzD65 = lib.mulv(SRGB_TO_XYZ, srgb.map(srgbToLin));
        var xyzIn = lib.mulv(simToSrc, xyzD65);
        var xyzA = lib.mulv(MA, xyzIn);
        var xyzB = lib.mulv(MB, xyzIn);
        var labA = lib.xyzToLab(xyzA, Wdst);
        var labB = lib.xyzToLab(xyzB, Wdst);
        var labPre = lib.xyzToLab(xyzIn, Wdst);
        return {
          idx: idx,
          name: item[0],
          xyzIn: xyzIn,
          xyzA: xyzA,
          xyzB: xyzB,
          cssIn: xyzToCss(toDisplay(xyzIn), lib),
          cssA: xyzToCss(toDisplay(xyzA), lib),
          cssB: xyzToCss(toDisplay(xyzB), lib),
          uvIn: lib.xyzToUV(xyzIn),
          uvA: lib.xyzToUV(xyzA),
          uvB: lib.xyzToUV(xyzB),
          deAB: lib.deltaE00(labA, labB),
          dePre: lib.deltaE00(labPre, labA)
        };
      });
    }

    function renderGrid() {
      var rows = state.rows;
      grid.innerHTML = '';
      var frag = document.createDocumentFragment();
      rows.forEach(function (r) {
        var left = state.mode === 'ab' ? r.cssA : r.cssIn;
        var right = state.mode === 'ab' ? r.cssB : r.cssA;
        var de = state.mode === 'ab' ? r.deAB : r.dePre;
        var patch = make('button', 'c-cat-patch' + (r.idx === state.active ? ' is-on' : ''));
        patch.type = 'button';
        patch.setAttribute('data-idx', String(r.idx));
        patch.title = r.name;
        patch.setAttribute('aria-label', '#' + (r.idx + 1) + ' ' + r.name);
        var svg = svgEl('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
        appendSvg(svg, 'polygon', { points: '0,0 100,0 0,100', fill: left });
        appendSvg(svg, 'polygon', { points: '100,0 100,100 0,100', fill: right });
        patch.appendChild(svg);
        patch.appendChild(make('span', 'c-cat-badge', de.toFixed(1)));
        frag.appendChild(patch);
      });
      grid.appendChild(frag);

      var nameA = catName(state.a), nameB = catName(state.b);
      gridTitle.textContent = state.mode === 'ab'
        ? t.gridAB.split('{a}').join(nameA).split('{b}').join(nameB)
        : t.gridPre;
      var mean = rows.reduce(function (s, r) {
        return s + (state.mode === 'ab' ? r.deAB : r.dePre);
      }, 0) / rows.length;
      meanEl.textContent = t.mean + ' = ' + mean.toFixed(2);
    }

    function catName(slug) {
      for (var i = 0; i < CAT_NAMES.length; i++) if (CAT_NAMES[i].slug === slug) return CAT_NAMES[i].name;
      return slug;
    }

    function appendDetailRow(label, xyz, uv) {
      detail.appendChild(make('div', '', label + ' · XYZ ' + xyz.map(function (v) { return fmt(v, 4); }).join(' / ')));
      detail.appendChild(make('div', '', uv ? '  u\' ' + uv[0].toFixed(4) + ', v\' ' + uv[1].toFixed(4) : '  u\' —, v\' —'));
    }

    function setDetail() {
      var cur = state.rows[state.active];
      if (!cur) return;
      var nameA = catName(state.a), nameB = catName(state.b);
      detail.innerHTML = '';
      detail.appendChild(make('div', '', '#' + (cur.idx + 1) + ' ' + cur.name + ' · ' + state.src + ' → ' + state.dst + ' (D=' + state.D.toFixed(2) + ')'));
      if (state.mode === 'ab') {
        appendDetailRow('CAT A (' + nameA + ')', cur.xyzA, cur.uvA);
        appendDetailRow('CAT B (' + nameB + ')', cur.xyzB, cur.uvB);
      } else {
        appendDetailRow(t.beforeLabel + ' (' + state.src + ')', cur.xyzIn, cur.uvIn);
        appendDetailRow('CAT A (' + nameA + ')', cur.xyzA, cur.uvA);
      }
      detail.appendChild(make('div', 'c-cat-b', (state.mode === 'ab' ? t.modeAB : t.modePre) + ' · ΔE00 = ' + (state.mode === 'ab' ? cur.deAB : cur.dePre).toFixed(2)));
    }

    function renderUV() {
      uvLegend.textContent = state.mode === 'ab' ? t.uvLegend : t.uvLegendPre;
      var svg = uvSvg;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var pad = { l: 44, r: 14, t: 12, b: 34 };
      var W = 440 - pad.l - pad.r, H = 420 - pad.t - pad.b;
      var sx = function (u) { return pad.l + (u / 0.65) * W; };
      var sy = function (v) { return pad.t + H - (v / 0.60) * H; };

      appendSvg(svg, 'rect', { x: pad.l, y: pad.t, width: W, height: H, fill: '#fff' });
      for (var u = 0; u <= 0.6 + 1e-9; u += 0.1) {
        var x = sx(u);
        appendSvg(svg, 'line', { x1: x, y1: pad.t, x2: x, y2: pad.t + H, stroke: '#f0f0f0' });
        appendSvg(svg, 'text', { x: x, y: pad.t + H + 14, 'text-anchor': 'middle', fill: '#888', 'font-size': 10, 'font-family': 'monospace' }, u.toFixed(1));
      }
      for (var v = 0; v <= 0.6 + 1e-9; v += 0.1) {
        var y = sy(v);
        appendSvg(svg, 'line', { x1: pad.l, y1: y, x2: pad.l + W, y2: y, stroke: '#f0f0f0' });
        appendSvg(svg, 'text', { x: pad.l - 6, y: y + 3, 'text-anchor': 'end', fill: '#888', 'font-size': 10, 'font-family': 'monospace' }, v.toFixed(1));
      }
      appendSvg(svg, 'text', { x: pad.l + W / 2, y: 414, 'text-anchor': 'middle', fill: '#555', 'font-size': 11 }, 'u\'');
      appendSvg(svg, 'text', { x: 13, y: pad.t + H / 2, 'text-anchor': 'middle', fill: '#555', 'font-size': 11, transform: 'rotate(-90 13 ' + (pad.t + H / 2) + ')' }, 'v\'');

      var pts = locusUV(lib, ctx.data).map(function (uv) {
        return sx(uv[0]).toFixed(1) + ',' + sy(uv[1]).toFixed(1);
      }).join(' ');
      appendSvg(svg, 'polygon', { points: pts, fill: '#fafbfc', stroke: '#b8c4cc', 'stroke-width': 1.2 });

      var Ws = lib.whiteXYZ(state.src), Wd = lib.whiteXYZ(state.dst);
      var uvWs = lib.xyzToUV(Ws), uvWd = lib.xyzToUV(Wd);
      appendSvg(svg, 'line', {
        x1: sx(uvWs[0]), y1: sy(uvWs[1]), x2: sx(uvWd[0]), y2: sy(uvWd[1]),
        stroke: '#365d78', 'stroke-width': 1.2, 'stroke-dasharray': '3 3'
      });
      appendSvg(svg, 'circle', { cx: sx(uvWs[0]), cy: sy(uvWs[1]), r: 4, fill: '#fff', stroke: '#b5713f', 'stroke-width': 1.8 });
      appendSvg(svg, 'text', { x: sx(uvWs[0]) + 6, y: sy(uvWs[1]) - 5, fill: '#b5713f', 'font-size': 11, 'font-family': 'monospace', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, state.src);
      appendSvg(svg, 'circle', { cx: sx(uvWd[0]), cy: sy(uvWd[1]), r: 4, fill: '#365d78' });
      appendSvg(svg, 'text', { x: sx(uvWd[0]) + 6, y: sy(uvWd[1]) + 11, fill: '#365d78', 'font-size': 11, 'font-family': 'monospace', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, state.dst);

      state.rows.forEach(function (r) {
        var p1 = state.mode === 'ab' ? r.uvA : r.uvIn;
        var p2 = state.mode === 'ab' ? r.uvB : r.uvA;
        if (!p1 || !p2) return;
        var on = r.idx === state.active;
        appendSvg(svg, 'line', {
          x1: sx(p1[0]), y1: sy(p1[1]), x2: sx(p2[0]), y2: sy(p2[1]),
          stroke: on ? '#111' : '#7b8a97', 'stroke-width': on ? 2.2 : 1.1, opacity: on ? 1 : 0.7
        });
        appendSvg(svg, 'circle', {
          cx: sx(p1[0]), cy: sy(p1[1]), r: on ? 5.2 : 3.2,
          fill: state.mode === 'ab' ? r.cssA : r.cssIn,
          stroke: on ? '#111' : '#555', 'stroke-width': on ? 1.6 : 0.8
        });
        appendSvg(svg, 'circle', {
          cx: sx(p2[0]), cy: sy(p2[1]), r: on ? 4.2 : 2.6,
          fill: '#fff', stroke: on ? '#b42318' : '#365d78', 'stroke-width': on ? 1.8 : 1.1
        });
      });
    }

    function fullRender() {
      state.rows = recompute();
      renderGrid();
      setDetail();
      renderUV();
    }

    function setActive(idx) {
      if (idx === state.active || !state.rows || !state.rows[idx]) return;
      state.active = idx;
      var patches = grid.querySelectorAll('.c-cat-patch');
      for (var i = 0; i < patches.length; i++) {
        patches[i].classList.toggle('is-on', Number(patches[i].getAttribute('data-idx')) === idx);
      }
      setDetail();
      renderUV();
    }

    selSrc.addEventListener('change', function () { state.src = selSrc.value; fullRender(); });
    selDst.addEventListener('change', function () { state.dst = selDst.value; fullRender(); });
    selA.addEventListener('change', function () { state.a = selA.value; fullRender(); });
    selB.addEventListener('change', function () { state.b = selB.value; fullRender(); });
    dInput.addEventListener('input', function () {
      state.D = parseFloat(dInput.value);
      dOut.textContent = state.D.toFixed(2);
      fullRender();
    });
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      state.mode = btn.getAttribute('data-mode');
      btnAB.classList.toggle('is-on', state.mode === 'ab');
      btnPre.classList.toggle('is-on', state.mode === 'pre');
      fullRender();
    });
    grid.addEventListener('mouseover', function (e) {
      var patch = e.target.closest('.c-cat-patch');
      if (patch) setActive(Number(patch.getAttribute('data-idx')));
    });
    grid.addEventListener('focusin', function (e) {
      var patch = e.target.closest('.c-cat-patch');
      if (patch) setActive(Number(patch.getAttribute('data-idx')));
    });
    grid.addEventListener('click', function (e) {
      var patch = e.target.closest('.c-cat-patch');
      if (patch) setActive(Number(patch.getAttribute('data-idx')));
    });

    /* 索引表里「设为 CAT A / CAT B」的快捷按钮；只在本组件存在时接管，避免重复注册。 */
    activePickHandler = function (pick) {
      if (!document.body.contains(el)) return;
      var slug = pick.getAttribute('data-slug');
      var which = pick.getAttribute('data-cat-pick');
      if (which === 'a') { state.a = slug; selA.value = slug; }
      else { state.b = slug; selB.value = slug; }
      fullRender();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (!pickBound) {
      pickBound = true;
      document.addEventListener('click', function (e) {
        var pick = e.target.closest('[data-cat-pick]');
        if (pick && activePickHandler) activePickHandler(pick);
      });
    }

    fullRender();
  }

  /* ---------- 组件 B：有效锥体光谱灵敏度 ---------- */
  function mountCones(el, ctx, opts) {
    var lib = ctx.lib, t = ctx.t;
    var compact = !!(opts && opts.compact);
    var slug = (opts && opts.slug) || 'cat02';
    var ref = (opts && opts.ref) || 'von-kries';
    var showNeg = true;

    var wrap = make('div', 'c-cat-viz' + (compact ? ' c-cat-viz--compact' : ''));
    var controls = make('div', 'c-cat-viz-controls');
    var summary = make('span', 'c-cat-visummary');

    function catOptions(selected) {
      var sel = document.createElement('select');
      ctx.data.cats.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.slug;
        opt.textContent = c.name;
        if (c.slug === selected) opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    }

    var selMain, selRef, negBox;
    if (!compact) {
      var labMain = make('label');
      labMain.appendChild(make('span', '', t.main));
      selMain = catOptions(slug);
      labMain.appendChild(selMain);
      controls.appendChild(labMain);
      var labRef = make('label');
      labRef.appendChild(make('span', '', t.reference));
      selRef = catOptions(ref);
      labRef.appendChild(selRef);
      controls.appendChild(labRef);
      var labNeg = make('label');
      negBox = document.createElement('input');
      negBox.type = 'checkbox';
      negBox.checked = true;
      labNeg.appendChild(negBox);
      labNeg.appendChild(make('span', '', t.neg));
      controls.appendChild(labNeg);
      controls.appendChild(summary);
    }

    var chartWrap = make('div', 'c-cat-chart');
    var svg = svgEl('svg', {
      viewBox: compact ? '0 0 420 220' : '0 0 820 360',
      role: 'img', 'aria-label': t.conesTitle
    });
    chartWrap.appendChild(svg);

    var stats = make('div', 'c-cat-stats');
    if (!compact) wrap.appendChild(controls);
    wrap.appendChild(chartWrap);
    if (!compact) wrap.appendChild(stats);
    else wrap.appendChild(summary);
    el.appendChild(wrap);

    function compute(s) {
      return lib.coneSensitivities(s, ctx.data.locus, ctx.data.locusStep || 1);
    }

    function render() {
      var mainC = compute(slug), refC = compute(ref);
      if (!mainC || !refC) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      var W = compact ? 420 : 820, H = compact ? 220 : 360;
      var pad = compact
        ? { l: 36, r: 28, t: 10, b: 24 }
        : { l: 48, r: 18, t: 18, b: 34 };
      var pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
      var yMin = -0.35, yMax = 1.08;
      var sx = function (wl) { return pad.l + ((wl - 380) / (700 - 380)) * pw; };
      var sy = function (v) { return pad.t + ph - ((v - yMin) / (yMax - yMin)) * ph; };
      var y0 = sy(0);

      appendSvg(svg, 'rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: '#fff' });
      if (showNeg) {
        appendSvg(svg, 'rect', { x: pad.l, y: y0, width: pw, height: pad.t + ph - y0, fill: '#fff5f5' });
      }
      for (var wl = 400; wl <= 700; wl += 50) {
        var x = sx(wl);
        appendSvg(svg, 'line', { x1: x, y1: pad.t, x2: x, y2: pad.t + ph, stroke: '#f0f0f0' });
        appendSvg(svg, 'text', { x: x, y: pad.t + ph + 15, 'text-anchor': 'middle', fill: '#777', 'font-size': compact ? 10.5 : 11, 'font-family': 'monospace' }, wl + ' nm');
      }
      var ticks = [-0.3, -0.2, -0.1, 0, 0.25, 0.5, 0.75, 1.0];
      ticks.forEach(function (v) {
        var y = sy(v);
        appendSvg(svg, 'line', { x1: pad.l, y1: y, x2: pad.l + pw, y2: y, stroke: v === 0 ? '#999' : '#f0f0f0', 'stroke-width': v === 0 ? 1.2 : 1 });
        if (!compact || v === 0 || v === 0.5 || v === 1) {
          appendSvg(svg, 'text', { x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end', fill: v < 0 ? '#b42318' : '#777', 'font-size': compact ? 9.5 : 10.5, 'font-family': 'monospace' }, v.toFixed(2));
        }
      });

      var colors = ['#c84b31', '#2d8a4e', '#2b6cb0'];
      var keys = ['r', 'g', 'b'];
      if (showNeg) {
        keys.forEach(function (key, i) {
          var seg = [];
          var flush = function () {
            if (seg.length > 1) {
              var poly = [sx(seg[0].wl).toFixed(1) + ',' + y0.toFixed(1)]
                .concat(seg.map(function (p) { return sx(p.wl).toFixed(1) + ',' + sy(p[key]).toFixed(1); }))
                .concat([sx(seg[seg.length - 1].wl).toFixed(1) + ',' + y0.toFixed(1)]);
              appendSvg(svg, 'polygon', { points: poly.join(' '), fill: colors[i], opacity: 0.22 });
            }
            seg = [];
          };
          mainC.points.forEach(function (p) {
            if (p[key] < 0) seg.push(p); else flush();
          });
          flush();
        });
      }

      keys.forEach(function (key, i) {
        var pts = refC.points.map(function (p) { return sx(p.wl).toFixed(1) + ',' + sy(p[key]).toFixed(1); }).join(' ');
        appendSvg(svg, 'polyline', { points: pts, fill: 'none', stroke: colors[i], 'stroke-width': 1.3, 'stroke-dasharray': '4 4', opacity: 0.55 });
      });
      keys.forEach(function (key, i) {
        var pts = mainC.points.map(function (p) { return sx(p.wl).toFixed(1) + ',' + sy(p[key]).toFixed(1); }).join(' ');
        appendSvg(svg, 'polyline', { points: pts, fill: 'none', stroke: colors[i], 'stroke-width': compact ? 1.9 : 2.2 });
      });

      var x470 = sx(470);
      appendSvg(svg, 'line', { x1: x470, y1: pad.t, x2: x470, y2: pad.t + ph, stroke: '#b42318', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.5 });
      if (!compact) {
        appendSvg(svg, 'text', { x: x470 + 4, y: pad.t + 12, fill: '#b42318', 'font-size': 10, 'font-family': 'monospace' }, '470 nm');
      }

      var worst = null;
      mainC.stats.forEach(function (s, i) {
        if (!worst || s.min < worst.min) worst = { min: s.min, wl: s.minWl, name: ['ρ', 'γ', 'β'][i] };
      });
      summary.textContent = catName(slug) + ' · ' + (worst && worst.min < -0.001
        ? worst.name + ' ' + t.lowest + ' ' + (Math.abs(worst.min) < 5e-4 ? 0 : worst.min).toFixed(3) + ' @ ' + worst.wl + ' nm'
        : t.noNeg);

      if (!compact) {
        stats.innerHTML = '';
        mainC.stats.forEach(function (s, i) {
          var card = make('div', 'c-cat-stat');
          card.appendChild(make('div', 'c-cat-stat-k', [t.channelR, t.channelG, t.channelB][i]));
          card.appendChild(make('div', 'c-cat-stat-v',
            t.peak + ' ' + s.peakWl + ' nm · ' + t.lowest + ' ' + (Math.abs(s.min) < 5e-4 ? 0 : s.min).toFixed(3) + ' (' + s.minWl + ' nm)'));
          stats.appendChild(card);
        });
      }
    }

    function catName(s) {
      for (var i = 0; i < ctx.data.cats.length; i++) if (ctx.data.cats[i].slug === s) return ctx.data.cats[i].name;
      return s;
    }

    if (!compact) {
      selMain.addEventListener('change', function () { slug = selMain.value; render(); });
      selRef.addEventListener('change', function () { ref = selRef.value; render(); });
      negBox.addEventListener('change', function () { showNeg = negBox.checked; render(); });
    }
    render();
  }

  /* ---------- 组件 D：D(L_A) 曲线 & 单步 vs Zhai 2018 两步法 ---------- */
  function mountTwoStep(el, ctx) {
    var lib = ctx.lib, t = ctx.t;
    var state = { logLA: 2, F: 1, Db: 0.72, Dd: 0.90 };

    var wrap = make('div', 'c-cat-viz');
    var grid = make('div', 'c-cat-two');

    /* 左：D(L_A) */
    var cardL = make('div', 'c-cat-two-card');
    var headL = make('div', 'c-cat-panel-head');
    headL.appendChild(make('span', '', t.dTitle));
    headL.appendChild(make('span', 'c-cat-legend', 'CIECAM02 / CMCCAT2000'));
    cardL.appendChild(headL);
    var controlsL = make('div', 'c-cat-viz-controls');
    var laLab = make('label', '', t.laLabel);
    var laInput = document.createElement('input');
    laInput.type = 'range'; laInput.min = '-1'; laInput.max = '4'; laInput.step = '0.02'; laInput.value = '2';
    var laOut = make('span', 'c-cat-val', '100');
    laLab.appendChild(laInput);
    laLab.appendChild(laOut);
    controlsL.appendChild(laLab);
    var fLab = make('label');
    fLab.appendChild(make('span', '', t.surround));
    var fSel = document.createElement('select');
    [[1, t.meanSurround], [0.9, t.dimSurround], [0.8, t.darkSurround]].forEach(function (f) {
      var opt = document.createElement('option');
      opt.value = String(f[0]); opt.textContent = f[1];
      fSel.appendChild(opt);
    });
    fLab.appendChild(fSel);
    controlsL.appendChild(fLab);
    cardL.appendChild(controlsL);
    var legendL = make('div', 'c-cat-legendrow');
    [[t.camF1, '#365d78', false], [t.camF09, '#6992ad', true], [t.camF08, '#9cb7c9', true], [t.cmcName, '#b5713f', false]].forEach(function (item) {
      var span = make('span');
      var swatch = make('i');
      if (item[2]) {
        swatch.className = 'is-dash';
        swatch.style.borderTopColor = item[1];
      } else {
        swatch.style.background = item[1];
      }
      span.appendChild(swatch);
      span.appendChild(document.createTextNode(item[0]));
      legendL.appendChild(span);
    });
    cardL.appendChild(legendL);
    var laChart = make('div', 'c-cat-chart');
    var laSvg = svgEl('svg', { viewBox: '0 0 430 270', role: 'img', 'aria-label': t.dTitle });
    laChart.appendChild(laSvg);
    cardL.appendChild(laChart);
    var laRead = make('div', 'c-cat-readout');
    cardL.appendChild(laRead);

    /* 右：单步 vs 两步 */
    var cardR = make('div', 'c-cat-two-card');
    var headR = make('div', 'c-cat-panel-head');
    headR.appendChild(make('span', '', t.zhaiTitle));
    headR.appendChild(make('span', 'c-cat-legend', 'CAT16 · A → D65'));
    cardR.appendChild(headR);
    var controlsR = make('div', 'c-cat-viz-controls');
    var dbLab = make('label', '', t.sourceDb);
    var dbInput = document.createElement('input');
    dbInput.type = 'range'; dbInput.min = '0'; dbInput.max = '1'; dbInput.step = '0.02'; dbInput.value = '0.72';
    var dbOut = make('span', 'c-cat-val', '0.72');
    dbLab.appendChild(dbInput); dbLab.appendChild(dbOut);
    controlsR.appendChild(dbLab);
    var ddLab = make('label', '', t.targetDd);
    var ddInput = document.createElement('input');
    ddInput.type = 'range'; ddInput.min = '0'; ddInput.max = '1'; ddInput.step = '0.02'; ddInput.value = '0.90';
    var ddOut = make('span', 'c-cat-val', '0.90');
    ddLab.appendChild(ddInput); ddLab.appendChild(ddOut);
    controlsR.appendChild(ddLab);
    cardR.appendChild(controlsR);
    var zChart = make('div', 'c-cat-chart');
    var zSvg = svgEl('svg', { viewBox: '0 0 430 270', role: 'img', 'aria-label': t.zhaiTitle });
    zChart.appendChild(zSvg);
    cardR.appendChild(zChart);
    cardR.appendChild(make('p', 'c-cat-note', t.sampleNote));
    var zRead = make('div', 'c-cat-readout');
    cardR.appendChild(zRead);

    grid.appendChild(cardL);
    grid.appendChild(cardR);
    wrap.appendChild(grid);
    el.appendChild(wrap);

    function renderLA() {
      var LA = Math.pow(10, state.logLA);
      laOut.textContent = LA >= 10 ? LA.toFixed(0) : LA.toFixed(2);
      var svg = laSvg;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var pad = { l: 46, r: 24, t: 14, b: 30 };
      var W = 430, H = 270, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
      var sx = function (logLa) { return pad.l + ((logLa + 1) / 5) * pw; };
      var sy = function (d) { return pad.t + ph - d * ph; };

      appendSvg(svg, 'rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: '#fff' });
      for (var p = -1; p <= 4; p++) {
        var x = sx(p);
        appendSvg(svg, 'line', { x1: x, y1: pad.t, x2: x, y2: pad.t + ph, stroke: '#f0f0f0' });
        appendSvg(svg, 'text', { x: x, y: pad.t + ph + 14, 'text-anchor': 'middle', fill: '#888', 'font-size': 10, 'font-family': 'monospace' }, String(Math.pow(10, p)));
      }
      [0, 0.25, 0.5, 0.75, 1].forEach(function (d) {
        var y = sy(d);
        appendSvg(svg, 'line', { x1: pad.l, y1: y, x2: pad.l + pw, y2: y, stroke: '#f0f0f0' });
        appendSvg(svg, 'text', { x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end', fill: '#888', 'font-size': 10, 'font-family': 'monospace' }, d.toFixed(2));
      });

      var curves = [
        { label: 'CIECAM02 F=1.0', fn: function (v) { return lib.dCIECAM02(v, 1); }, col: '#365d78', dash: '' },
        { label: 'CIECAM02 F=0.9', fn: function (v) { return lib.dCIECAM02(v, 0.9); }, col: '#6992ad', dash: '4 3' },
        { label: 'CIECAM02 F=0.8', fn: function (v) { return lib.dCIECAM02(v, 0.8); }, col: '#9cb7c9', dash: '2 3' },
        { label: 'CMCCAT2000 F=' + state.F.toFixed(1), fn: function (v) { return lib.dCMCCAT2000(v, v, state.F); }, col: '#b5713f', dash: '' }
      ];
      curves.forEach(function (c) {
        var pts = [];
        for (var tt = -1; tt <= 4.001; tt += 0.1) pts.push(sx(tt).toFixed(1) + ',' + sy(c.fn(Math.pow(10, tt))).toFixed(1));
        appendSvg(svg, 'polyline', { points: pts.join(' '), fill: 'none', stroke: c.col, 'stroke-width': 1.8, 'stroke-dasharray': c.dash });
      });

      var d1 = lib.dCIECAM02(LA, state.F), d2 = lib.dCMCCAT2000(LA, LA, state.F);
      var curX = sx(state.logLA);
      var fColors = { 1: '#365d78', 0.9: '#6992ad', 0.8: '#9cb7c9' };
      appendSvg(svg, 'line', { x1: curX, y1: pad.t, x2: curX, y2: pad.t + ph, stroke: '#ccc', 'stroke-dasharray': '2 2' });
      appendSvg(svg, 'circle', { cx: curX, cy: sy(d1), r: 4.2, fill: fColors[state.F] || '#365d78', stroke: '#fff', 'stroke-width': 1.4 });
      appendSvg(svg, 'circle', { cx: curX, cy: sy(d2), r: 4.2, fill: '#b5713f', stroke: '#fff', 'stroke-width': 1.4 });

      laRead.innerHTML = '';
      laRead.appendChild(make('div', '', 'L_A = ' + (LA >= 10 ? LA.toFixed(0) : LA.toFixed(2)) + ' cd/m² · F = ' + state.F.toFixed(1)));
      var line = make('div');
      line.appendChild(make('b', 'c-cat-b', t.laReadout + ' = ' + d1.toFixed(3)));
      line.appendChild(make('span', '', ' · '));
      line.appendChild(make('b', 'c-cat-o', t.cmcReadout + ' = ' + d2.toFixed(3)));
      laRead.appendChild(line);
    }

    function renderZhai() {
      var svg = zSvg;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var pad = { l: 48, r: 24, t: 14, b: 30 };
      var W = 430, H = 270, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

      var WA = lib.whiteXYZ('A'), WD65 = lib.whiteXYZ('D65'), WE = [1, 1, 1];
      var one = lib.adapt(WA, 'cat16', 'A', 'D65', state.Db);
      var two = lib.zhai2018ByWhite(WA, 'A', 'D65', state.Db, state.Dd, 'cat16');
      var M = lib.CATS['cat16'];
      var wb = lib.mulv(M, WA), wo = lib.mulv(M, WE);
      var mid = lib.mulv(lib.inv3(M), [0, 1, 2].map(function (i) {
        return wb[i] * (state.Db * (wo[i] / wb[i]) + 1 - state.Db);
      }));

      var pts = [WA, WD65, WE, one, two, mid];
      var uvs = pts.map(function (p) { return lib.xyzToUV(p); });
      var us = uvs.map(function (p) { return p[0]; });
      var vs = uvs.map(function (p) { return p[1]; });
      var uMin = Math.min.apply(null, us), uMax = Math.max.apply(null, us);
      var vMin = Math.min.apply(null, vs), vMax = Math.max.apply(null, vs);
      var uSpan = Math.max(0.08, uMax - uMin + 0.03);
      var vSpan = Math.max(0.06, vMax - vMin + 0.03);
      var uC = (uMin + uMax) / 2, vC = (vMin + vMax) / 2;
      uMin = uC - uSpan / 2; uMax = uC + uSpan / 2;
      vMin = vC - vSpan / 2; vMax = vC + vSpan / 2;
      var rx = function (u) { return pad.l + ((u - uMin) / (uMax - uMin)) * pw; };
      var ry = function (v) { return pad.t + ph - ((v - vMin) / (vMax - vMin)) * ph; };

      appendSvg(svg, 'rect', { x: pad.l, y: pad.t, width: pw, height: ph, fill: '#fff' });
      var ticksU = niceTicks(uMin, uMax, 5), ticksV = niceTicks(vMin, vMax, 5);
      ticksU.forEach(function (u) {
        var x = rx(u);
        appendSvg(svg, 'line', { x1: x, y1: pad.t, x2: x, y2: pad.t + ph, stroke: '#f0f0f0' });
        appendSvg(svg, 'text', { x: x, y: pad.t + ph + 14, 'text-anchor': 'middle', fill: '#888', 'font-size': 9.5, 'font-family': 'monospace' }, u.toFixed(3));
      });
      ticksV.forEach(function (v) {
        var y = ry(v);
        appendSvg(svg, 'line', { x1: pad.l, y1: y, x2: pad.l + pw, y2: y, stroke: '#f0f0f0' });
        appendSvg(svg, 'text', { x: pad.l - 6, y: y + 3.5, 'text-anchor': 'end', fill: '#888', 'font-size': 9.5, 'font-family': 'monospace' }, v.toFixed(3));
      });

      var uvE = uvs[2], uvA = uvs[0], uvD = uvs[1], uvOne = uvs[3], uvTwo = uvs[4], uvMid = uvs[5];
      appendSvg(svg, 'circle', { cx: rx(uvE[0]), cy: ry(uvE[1]), r: 4, fill: '#fff', stroke: '#888', 'stroke-width': 1.5 });
      appendSvg(svg, 'text', { x: rx(uvE[0]) + 6, y: ry(uvE[1]) - 5, fill: '#777', 'font-size': 9.5, 'font-family': 'monospace' }, t.bi);
      appendSvg(svg, 'circle', { cx: rx(uvA[0]), cy: ry(uvA[1]), r: 4.5, fill: '#b5713f' });
      appendSvg(svg, 'text', { x: rx(uvA[0]) - 7, y: ry(uvA[1]) - 7, 'text-anchor': 'end', fill: '#b5713f', 'font-size': 9.5, 'font-family': 'monospace' }, t.sourceWhite);
      appendSvg(svg, 'circle', { cx: rx(uvD[0]), cy: ry(uvD[1]), r: 4.5, fill: '#2d8a4e' });
      appendSvg(svg, 'text', { x: rx(uvD[0]) + 7, y: ry(uvD[1]) + 10, fill: '#2d8a4e', 'font-size': 9.5, 'font-family': 'monospace' }, t.targetWhite);

      appendSvg(svg, 'line', {
        x1: rx(uvA[0]), y1: ry(uvA[1]), x2: rx(uvOne[0]), y2: ry(uvOne[1]),
        stroke: '#b42318', 'stroke-width': 1.8, 'stroke-dasharray': '4 3'
      });
      appendSvg(svg, 'circle', { cx: rx(uvOne[0]), cy: ry(uvOne[1]), r: 5, fill: '#fff', stroke: '#b42318', 'stroke-width': 2 });
      appendSvg(svg, 'text', { x: rx(uvOne[0]) + 7, y: ry(uvOne[1]) - 10, fill: '#b42318', 'font-size': 9.5, 'font-family': 'monospace', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, t.singleShort);

      appendSvg(svg, 'polyline', {
        points: [uvA, uvMid, uvTwo].map(function (p) { return rx(p[0]) + ',' + ry(p[1]); }).join(' '),
        fill: 'none', stroke: '#365d78', 'stroke-width': 2
      });
      appendSvg(svg, 'circle', { cx: rx(uvMid[0]), cy: ry(uvMid[1]), r: 3.2, fill: '#365d78', opacity: 0.5 });
      appendSvg(svg, 'circle', { cx: rx(uvTwo[0]), cy: ry(uvTwo[1]), r: 5.5, fill: '#365d78', stroke: '#fff', 'stroke-width': 1.5 });
      appendSvg(svg, 'text', { x: rx(uvTwo[0]) - 8, y: ry(uvTwo[1]) + 18, 'text-anchor': 'end', fill: '#365d78', 'font-size': 9.5, 'font-family': 'monospace', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, t.zhaiShort);
      appendSvg(svg, 'text', { x: pad.l + pw / 2, y: H - 2, 'text-anchor': 'middle', fill: '#555', 'font-size': 10 }, 'u\'');
      appendSvg(svg, 'text', { x: 10, y: pad.t + ph / 2, 'text-anchor': 'middle', fill: '#555', 'font-size': 10, transform: 'rotate(-90 10 ' + (pad.t + ph / 2) + ')' }, 'v\'');

      var de = lib.deltaE00(lib.xyzToLab(one, WD65), lib.xyzToLab(two, WD65));
      zRead.innerHTML = '';
      zRead.appendChild(make('div', '', t.singleReadout + ': u\' ' + uvOne[0].toFixed(4) + ', v\' ' + uvOne[1].toFixed(4)));
      zRead.appendChild(make('div', '', t.zhaiReadout + ': u\' ' + uvTwo[0].toFixed(4) + ', v\' ' + uvTwo[1].toFixed(4)));
      zRead.appendChild(make('div', 'c-cat-b', t.diff + ' = ' + de.toFixed(2)));
    }

    function niceTicks(min, max, count) {
      var span = max - min;
      var raw = span / count;
      var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
      var norm = raw / mag;
      var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
      var out = [];
      for (var v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
      return out;
    }

    laInput.addEventListener('input', function () {
      state.logLA = parseFloat(laInput.value);
      renderLA();
    });
    fSel.addEventListener('change', function () {
      state.F = parseFloat(fSel.value);
      renderLA();
    });
    dbInput.addEventListener('input', function () {
      state.Db = parseFloat(dbInput.value);
      dbOut.textContent = state.Db.toFixed(2);
      renderZhai();
    });
    ddInput.addEventListener('input', function () {
      state.Dd = parseFloat(ddInput.value);
      ddOut.textContent = state.Dd.toFixed(2);
      renderZhai();
    });

    renderLA();
    renderZhai();
  }

  function makeContext(data) {
    return {
      data: data,
      lib: root.CatTransforms,
      lang: data.lang || 'zh',
      t: STRINGS[data.lang] || STRINGS.zh
    };
  }

  function autoInit() {
    var node = document.getElementById('cat-viz-data');
    if (!node || !root.CatTransforms) return;
    var data;
    try { data = JSON.parse(node.textContent); } catch (e) { return; }
    store = data;
    var ctx = makeContext(data);
    var mounts = document.querySelectorAll('[data-cat-viz]');
    for (var i = 0; i < mounts.length; i++) {
      var m = mounts[i];
      if (m.getAttribute('data-cat-mounted')) continue;
      m.setAttribute('data-cat-mounted', '1');
      var kind = m.getAttribute('data-cat-viz');
      if (kind === 'sandbox') mountSandbox(m, ctx);
      else if (kind === 'cones') mountCones(m, ctx, {
        slug: m.getAttribute('data-slug') || 'cat02',
        ref: m.getAttribute('data-ref') || 'von-kries',
        compact: m.getAttribute('data-compact') === 'true'
      });
      else if (kind === 'twostep') mountTwoStep(m, ctx);
    }
  }

  root.CatViz = {
    mountSandbox: function (el, data) { mountSandbox(el, makeContext(data || store)); },
    mountCones: function (el, data, opts) { mountCones(el, makeContext(data || store), opts || {}); },
    mountTwoStep: function (el, data) { mountTwoStep(el, makeContext(data || store)); },
    strings: STRINGS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
  else autoInit();
})(typeof self !== 'undefined' ? self : this);
