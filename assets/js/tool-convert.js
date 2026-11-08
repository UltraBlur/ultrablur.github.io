/* 码值换算器界面：两端各自色域 / 传递函数 / 编码范围，输出中间过程与状态 */
(function () {
  'use strict';
  var host = document.querySelector('[data-convert]');
  if (!host) return;
  var cfg = JSON.parse(document.getElementById('convert-data').textContent);
  var C = window.ColourCodec;
  var lang = cfg.lang || 'zh';
  var T = lang === 'en'
    ? { src: 'Input', dst: 'Output', gamut: 'Gamut', tf: 'Transfer function', lw: 'Reference white', lb: 'Black level', enc: 'Encoding', value: 'Code value', grey: 'Neutral grey', calc: 'Convert', batch: 'Batch', hex: 'Hex', triple: 'Channels', csv: 'Copy CSV', copy: 'Copy result', trace: 'Calculation', result: 'Result', float: 'Float 0–1', invalid: 'Not a number', gamutOut: 'Outside target gamut', overWhite: 'Above white', rangeOut: 'Outside nominal range', approx: 'Approximate (sampled curve)', custom: 'Custom combination', hlgbad: 'HLG can only be used with BT.2020 primaries', mixedRef: 'Scene-referred to display-referred needs a rendering transform, which this tool does not provide.', cat: 'White adaptation', catAuto: 'Bradford (when whites differ)', catNone: 'None, keep XYZ', noResult: 'No result' }
    : { src: '输入', dst: '输出', gamut: '色域', tf: '传递函数', lw: '参考白', lb: '黑位', enc: '编码', value: '码值', grey: '中性灰', calc: '换算', batch: '批量', hex: '十六进制', triple: '三通道', csv: '复制 CSV', copy: '复制结果', trace: '计算过程', result: '结果', float: '浮点 0–1', invalid: '不是数字', gamutOut: '超出目标色域', overWhite: '高于白位', rangeOut: '超出标称范围', approx: '近似（采样曲线）', custom: '自定义组合', hlgbad: 'HLG 只能配 BT.2020 原色', mixedRef: '场景参考到显示参考需要渲染变换，本工具不做渲染，因此不提供这条换算。', cat: '白点适应', catAuto: 'Bradford（白点不同时）', catNone: '不适应，保留 XYZ', noResult: '无结果' };

  var spaces = (cfg.spaces || []).filter(function (s) { return s.matrix && s.primaries; });
  if (spaces.length < 2) return;
  var transfers = C.buildTransfers(spaces, cfg.curves || {});
  var byId = {};
  spaces.forEach(function (s) { byId[s.slug] = s; });

  var els = {
    srcGamut: host.querySelector('.c-cvt-gamut-src'),
    dstGamut: host.querySelector('.c-cvt-gamut-dst'),
    srcTf: host.querySelector('.c-cvt-tf-src'),
    dstTf: host.querySelector('.c-cvt-tf-dst'),
    srcEnc: host.querySelector('.c-cvt-enc-src'),
    dstEnc: host.querySelector('.c-cvt-enc-dst'),
    srcParams: host.querySelector('.c-cvt-params-src'),
    dstParams: host.querySelector('.c-cvt-params-dst'),
    r: host.querySelector('.c-cvt-r'),
    g: host.querySelector('.c-cvt-g'),
    b: host.querySelector('.c-cvt-b'),
    hex: host.querySelector('.c-cvt-hexval'),
    batch: host.querySelector('.c-cvt-batchtext'),
    cat: host.querySelector('.c-cvt-cat'),
    outNorm: host.querySelector('.c-cvt-out-norm'),
    outPack: host.querySelector('.c-cvt-out-pack'),
    outXy: host.querySelector('.c-cvt-out-xy'),
    flags: host.querySelector('.c-cvt-flags'),
    trace: host.querySelector('.c-cvt-trace'),
    batchOut: host.querySelector('.c-cvt-batchout'),
    warn: host.querySelector('.c-cvt-warn'),
    tabs: host.querySelectorAll('.c-cvt-tab'),
    panes: host.querySelectorAll('.c-cvt-pane')
  };

  /* ---------- 选项填充 ---------- */
  function opt(sel, value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    sel.appendChild(o);
  }
  function group(sel, text) {
    var g = document.createElement('optgroup');
    g.label = text;
    sel.appendChild(g);
    return g;
  }
  function optIn(g, value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    g.appendChild(o);
  }
  function label(t) { return lang === 'en' ? (t.label.en || t.label.zh) : t.label.zh; }

  /* 相机与工作空间的标题是「色域 / 传递函数」合写，显示原色的标题不是；
     个别条目顺序相反，单独列出 */
  var CURVE_FIRST = { 'apple-log': 1, 'apple-log2': 1, 'oppo-log': 1, 'oppo-log2': 1, 'nikon-nlog': 1 };
  function kindOf(space) { return space.kind || 'camera'; }
  function splitName(space) {
    var title = (space.title || '').trim();
    if (kindOf(space) === 'display-gamut') return { gamut: title, curve: null };
    if (CURVE_FIRST[space.slug]) {
      var p = title.split(' / ');
      return { gamut: (p[1] || p[0]).trim(), curve: (p[0] || title).trim() };
    }
    var parts = title.split(' / ');
    if (parts.length === 2) return { gamut: parts[0].trim(), curve: parts[1].trim() };
    return { gamut: title, curve: title };
  }
  var GROUP_NAMES = {
    camera: { zh: '相机色域', en: 'Camera gamuts' },
    aces: { zh: 'ACES', en: 'ACES' },
    working: { zh: '工作空间', en: 'Working spaces' },
    'display-gamut': { zh: '显示原色', en: 'Display primaries' }
  };
  function groupName(g) {
    var n = GROUP_NAMES[g];
    return n ? (lang === 'en' ? n.en : n.zh) : g;
  }

  /* 色域：同一组原色 + 白点只列一次（Canon Rec.2020 与 Rec.2020 合为一项） */
  function primKey(s) {
    return (s.primaries || []).map(function (p) { return p.map(function (v) { return v.toFixed(5); }).join(','); }).join(';')
      + '|' + (s.white || []).map(function (v) { return v.toFixed(5); }).join(',');
  }
  var gamutList = [];
  var seenGamut = {};
  var usedLabel = {};
  spaces.forEach(function (s) {
    var nm = splitName(s);
    /* 只在本组内去重：显示原色与相机色域即使原色相同也各自成项 */
    var key = kindOf(s) + '|' + primKey(s);
    if (seenGamut[key]) return;
    seenGamut[key] = true;
    var text = nm.gamut;
    if (usedLabel[text]) text = text + ' · ' + nm.curve;  /* 同名不同原色，用曲线名区分 */
    usedLabel[text] = true;
    usedLabel[nm.gamut] = true;
    gamutList.push({ slug: s.slug, text: text, group: kindOf(s) });
  });
  var gamutGroups = {};
  gamutList.forEach(function (g) {
    [els.srcGamut, els.dstGamut].forEach(function (sel) {});
    if (!gamutGroups[g.group]) {
      gamutGroups[g.group] = [els.srcGamut, els.dstGamut].map(function (sel) { return group(sel, groupName(g.group)); });
    }
    gamutGroups[g.group].forEach(function (grp) { optIn(grp, g.slug, g.text); });
  });

  /* 场景曲线的标签只用曲线名，避免与色域下拉重名 */
  transfers.forEach(function (t) {
    if (t.kind === 'scene' && t.space && byId[t.space]) {
      var nm = splitName(byId[t.space]);
      if (nm.curve) t.label = { zh: nm.curve, en: nm.curve };
    }
  });

  /* 传递函数：同一条曲线只列一次；内置曲线在前，采样曲线在后 */
  var tfGroups = {};
  var tfSeen = {};
  transfers.forEach(function (t) {
    var key = t.kind === 'scene' ? 'curve:' + label(t) : t.id;
    if (tfSeen[key]) return;
    tfSeen[key] = true;
    var band = t.kind === 'scene' ? 'scene' : 'display';
    var gname = band === 'scene'
      ? (lang === 'en' ? 'Scene and log encodings' : '场景 / 对数编码')
      : (lang === 'en' ? 'Display EOTFs and linear' : '显示 EOTF 与线性');
    if (!tfGroups[band]) tfGroups[band] = [els.srcTf, els.dstTf].map(function (sel) { return group(sel, gname); });
    var text = label(t) + (t.approx ? ' *' : '');
    tfGroups[band].forEach(function (grp) { optIn(grp, t.id, text); });
  });
  var encs = [{ id: 'float', text: T.float }];
  [8, 10, 12, 16].forEach(function (bits) {
    encs.push({ id: 'full' + bits, text: bits + '-bit Full' });
    encs.push({ id: 'video' + bits, text: bits + '-bit Video' });
  });
  encs.forEach(function (e) {
    [els.srcEnc, els.dstEnc].forEach(function (sel) { opt(sel, e.id, e.text); });
  });
  function encOf(id) {
    if (id === 'float') return { mode: 'float' };
    var m = /^(full|video)(\d+)$/.exec(id);
    return { mode: 'int', range: m[1], bits: parseInt(m[2], 10) };
  }

  /* ---------- 参数面板 ---------- */
  function tfById(id) {
    return transfers.filter(function (t) { return t.id === id; })[0];
  }
  function paramBox(tf, side) {
    var box = side === 'src' ? els.srcParams : els.dstParams;
    var cur = box.__state || { lw: 100, lb: 0 };
    box.__state = cur;
    box.innerHTML = '';
    var need = tf.need || {};
    if (tf.kind === 'display' && !tf.abs) need.lw = true;
    if (need.lw) {
      var l = document.createElement('label');
      l.className = 'c-cvt-param';
      l.appendChild(document.createTextNode(T.lw + ' '));
      var i = document.createElement('input');
      i.type = 'number'; i.min = '1'; i.step = '10'; i.value = String(cur.lw);
      i.addEventListener('input', function () { cur.lw = parseFloat(i.value) || 100; run(); });
      l.appendChild(i);
      l.appendChild(document.createTextNode(' cd/m²'));
      box.appendChild(l);
    }
    if (need.lb) {
      var l2 = document.createElement('label');
      l2.className = 'c-cvt-param';
      l2.appendChild(document.createTextNode(T.lb + ' '));
      var i2 = document.createElement('input');
      i2.type = 'number'; i2.min = '0'; i2.step = '0.1'; i2.value = String(cur.lb);
      i2.addEventListener('input', function () { cur.lb = parseFloat(i2.value) || 0; run(); });
      l2.appendChild(i2);
      l2.appendChild(document.createTextNode(' cd/m²'));
      box.appendChild(l2);
    }
  }
  function paramsOf(side) {
    return side === 'src' ? (els.srcParams.__state || { lw: 100, lb: 0 }) : (els.dstParams.__state || { lw: 100, lb: 0 });
  }

  function endpoint(side) {
    var gamutSel = side === 'src' ? els.srcGamut : els.dstGamut;
    var tfSel = side === 'src' ? els.srcTf : els.dstTf;
    var encSel = side === 'src' ? els.srcEnc : els.dstEnc;
    var tf = tfById(tfSel.value);
    return { space: byId[gamutSel.value], transfer: tf, params: paramsOf(side), enc: encOf(encSel.value) };
  }

  /* ---------- 输入 ---------- */
  var mode = 'triple';
  els.tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      mode = btn.getAttribute('data-mode');
      els.tabs.forEach(function (x) { x.classList.toggle('is-on', x === btn); });
      els.panes.forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== mode; });
      run();
    });
  });

  function parseTriple() {
    var vals = [els.r.value, els.g.value, els.b.value];
    var nums = [];
    for (var i = 0; i < 3; i++) {
      var v = parseFloat(vals[i]);
      if (!isFinite(v)) return { error: T.invalid + ' ' + vals[i] };
      nums.push(v);
    }
    return { rgb: nums };
  }
  function parseHex() {
    var s = (els.hex.value || '').trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return { error: T.invalid };
    return { rgb: [0, 2, 4].map(function (i) { return parseInt(s.substr(i, 2), 16); }), sRGB: true };
  }
  function parseBatch() {
    var lines = (els.batch.value || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(/[\s,;\t]+/);
      var name = '', nums = [];
      parts.forEach(function (p) {
        var v = parseFloat(p);
        if (isFinite(v)) nums.push(v); else name = name || p;
      });
      if (nums.length !== 3) { rows.push({ name: name || '#' + (i + 1), error: T.invalid }); continue; }
      rows.push({ name: name || '#' + (i + 1), rgb: nums });
    }
    return rows;
  }

  /* ---------- 结果 ---------- */
  function nf(v, d) {
    var p = Math.pow(10, d == null ? 6 : d);
    return String(Math.round(v * p) / p);
  }
  function flagsOf(res, dst) {
    var out = [];
    if (!res.out.inGamut) out.push({ cls: 'is-bad', text: T.gamutOut });
    if (res.out.overWhite) out.push({ cls: 'is-warn', text: T.overWhite });
    if (res.out.negative) out.push({ cls: 'is-warn', text: '负值' });
    if (res.out.outOfRange) out.push({ cls: 'is-warn', text: T.rangeOut });
    if (res.out.approx) out.push({ cls: 'is-note', text: T.approx });
    return out;
  }
  function renderFlags(list) {
    els.flags.innerHTML = '';
    list.forEach(function (f) {
      var s = document.createElement('span');
      s.className = 'c-cvt-flag ' + f.cls;
      s.textContent = f.text;
      els.flags.appendChild(s);
    });
  }
  function renderTrace(res) {
    els.trace.innerHTML = '';
    var rows = res.trace || [];
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.textContent = r.label;
      var td = document.createElement('td');
      td.textContent = Array.isArray(r.value) ? r.value.join(',  ') : String(r.value);
      tr.appendChild(th); tr.appendChild(td);
      els.trace.appendChild(tr);
    });
  }

  function solve(rgb) {
    var src = endpoint('src'), dst = endpoint('dst');
    var opts = { cat: els.cat.value };
    return C.convert(rgb, src, dst, opts);
  }

  var lastRows = [];
  function run() {
    var src = endpoint('src'), dst = endpoint('dst');
    els.warn.hidden = true;
    els.warn.textContent = '';

    if (mode === 'batch') {
      var rows = parseBatch();
      lastRows = [];
      els.batchOut.innerHTML = '';
      var head = document.createElement('tr');
      ['#', 'R', 'G', 'B', T.result, ''].forEach(function (h) {
        var th = document.createElement('th'); th.textContent = h; head.appendChild(th);
      });
      els.batchOut.appendChild(head);
      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        var name = document.createElement('th'); name.textContent = row.name; tr.appendChild(name);
        if (row.error) {
          var td = document.createElement('td'); td.colSpan = 4; td.textContent = row.error; tr.appendChild(td);
          els.batchOut.appendChild(tr); return;
        }
        var res = solve(row.rgb);
        row.rgb.forEach(function (v) { var td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td); });
        var outTd = document.createElement('td');
        if (!res.ok) { outTd.textContent = res.problems.map(function (p) { return p.text; }).join('；'); }
        else {
          outTd.textContent = res.out.packed.map(function (v) { return nf(v, dst.enc.mode === 'float' ? 6 : 1); }).join(', ');
          lastRows.push({ name: row.name, rgb: row.rgb, out: res.out.packed.slice(), flags: flagsOf(res, dst).map(function (f) { return f.text; }) });
        }
        tr.appendChild(outTd);
        var flagTd = document.createElement('td');
        flagTd.textContent = res.ok ? flagsOf(res, dst).map(function (f) { return f.text; }).join(' · ') : '';
        tr.appendChild(flagTd);
        els.batchOut.appendChild(tr);
      });
      renderFlags([]);
      els.trace.innerHTML = '';
      els.outNorm.textContent = '-';
      els.outPack.textContent = '-';
      els.outXy.textContent = '-';
      return;
    }

    var parsed = mode === 'hex' ? parseHex() : parseTriple();
    if (parsed.error) {
      els.warn.hidden = false; els.warn.textContent = parsed.error;
      els.outNorm.textContent = '-'; els.outPack.textContent = '-'; els.outXy.textContent = '-';
      els.trace.innerHTML = ''; renderFlags([]);
      return;
    }
    var rgb = parsed.rgb;
    /* 十六进制按 sRGB 解释：临时替换源端，不改变用户选择 */
    var res;
    if (parsed.sRGB) {
      var savedGamut = els.srcGamut.value, savedTf = els.srcTf.value, savedEnc = els.srcEnc.value;
      els.srcGamut.value = 'primaries-srgb-rec709';
      els.srcTf.value = 'srgb';
      els.srcEnc.value = 'full8';
      res = solve(rgb);
      els.srcGamut.value = savedGamut; els.srcTf.value = savedTf; els.srcEnc.value = savedEnc;
    } else {
      res = solve(rgb);
    }
    dst = endpoint('dst');

    if (!res.ok) {
      els.warn.hidden = false;
      els.warn.textContent = res.problems.map(function (p) {
        if (p.key === 'mixedRef') return T.mixedRef;
        if (p.key === 'hlgGamut') return T.hlgbad;
        return p.text;
      }).join('；');
      els.outNorm.textContent = '-'; els.outPack.textContent = '-'; els.outXy.textContent = '-';
      renderTrace(res); renderFlags([]);
      return;
    }

    els.outNorm.textContent = res.out.norm.map(function (v) { return nf(v, 6); }).join(',  ');
    els.outPack.textContent = res.out.packed.map(function (v) {
      return dst.enc.mode === 'float' ? nf(v, 6) : String(Math.round(v * 100) / 100);
    }).join(',  ');
    els.outXy.textContent = res.out.xy ? res.out.xy.map(function (v) { return nf(v, 4); }).join(', ') : '-';
    renderFlags(flagsOf(res, dst));
    renderTrace(res);
  }

  /* ---------- 事件 ---------- */
  function syncParams(side) {
    paramBox(tfById(side === 'src' ? els.srcTf.value : els.dstTf.value), side);
  }
  els.srcGamut.addEventListener('change', run);
  els.dstGamut.addEventListener('change', run);
  els.srcTf.addEventListener('change', function () { syncParams('src'); run(); });
  els.dstTf.addEventListener('change', function () { syncParams('dst'); run(); });
  els.srcEnc.addEventListener('change', run);
  els.dstEnc.addEventListener('change', run);
  [els.r, els.g, els.b].forEach(function (i) { i.addEventListener('input', run); });
  els.hex.addEventListener('input', function () { if (mode === 'hex') run(); });
  els.batch.addEventListener('input', function () { if (mode === 'batch') run(); });
  els.cat.addEventListener('change', run);

  var greyBtn = host.querySelector('.c-cvt-grey');
  if (greyBtn) greyBtn.addEventListener('click', function () {
    var v = els.r.value;
    els.g.value = v; els.b.value = v; run();
  });
  var batchBtn = host.querySelector('.c-cvt-run');
  if (batchBtn) batchBtn.addEventListener('click', run);
  var copyBtn = host.querySelector('.c-cvt-copy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var text = els.outPack.textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(text);
  });
  var csvBtn = host.querySelector('.c-cvt-csv');
  if (csvBtn) csvBtn.addEventListener('click', function () {
    var lines = ['name,r,g,b,out_r,out_g,out_b,flags'];
    lastRows.forEach(function (r) {
      lines.push([r.name].concat(r.rgb, r.out, [r.flags.join(' ')]).join(','));
    });
    if (navigator.clipboard) navigator.clipboard.writeText(lines.join('\n'));
  });

  /* ---------- 初始状态 ---------- */
  function setIfPresent(sel, value) {
    var found = Array.prototype.some.call(sel.options, function (o) { return o.value === value; });
    if (found) sel.value = value;
  }
  setIfPresent(els.srcGamut, 'primaries-srgb-rec709');
  setIfPresent(els.srcTf, 'srgb');
  setIfPresent(els.dstGamut, 'primaries-rec2020');
  setIfPresent(els.dstTf, 'pq');
  syncParams('src');
  syncParams('dst');
  run();
})();
