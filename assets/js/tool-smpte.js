/* SMPTE document library — local search / browse / keyword index. */
(() => {
  'use strict';

  const cfg = JSON.parse(document.getElementById('smpte-config').textContent);
  const EN = cfg.lang === 'en';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString(EN ? 'en-US' : 'zh-CN');

  const T = EN ? {
    state: { active: 'active', stabilized: 'stabilized', withdrawn: 'withdrawn' },
    newer: 'newer online', mirrored: 'mirrored', notMirrored: 'not mirrored',
    open: 'Open on smpte.org ↗', detail: 'Details', versions: 'versions',
    results: 'results', found: 'Found', noResults: 'No matches',
    noResultsHint: 'Try a designation such as 2110-10, or a keyword such as HDR, DCP, IMF.',
    idleTitle: 'Search the SMPTE document library',
    idleHint: 'Every result opens the official entry on pub.smpte.org. Local PDFs are only used to build the full-text index.',
    filters: 'Filters', clear: 'Clear', clearAll: 'Clear all',
    keyword: 'Keyword', keywordIndex: 'Keyword index',
    kwHint: 'Every term extracted from titles, definitions and abbreviations. Click one to list its documents.',
    browse: 'Catalogue', about: 'About', search: 'Search',
    allStates: 'All states', sort: 'Sort', relevance: 'Relevance', newest: 'Newest', designation: 'Designation',
    scope: 'Scope', outline: 'Clause outline', definitions: 'Definitions', refs: 'References',
    citedBy: 'Cited by', official: 'Official entry', family: 'All versions', copy: 'Copy citation',
    copied: 'Citation copied', loading: 'Loading…', page: 'p.',
    source: 'Source', snapshot: 'Official snapshot', built: 'Index built',
    localNote: 'Local PDFs are used only to build this index; no PDFs are hosted here.',
    kwDocs: 'documents', showAll: 'Show all', filterBy: 'Filter',
  } : {
    state: { active: '现行', stabilized: '稳定版', withdrawn: '已撤销' },
    newer: '官网有新版', mirrored: '已镜像', notMirrored: '未镜像',
    open: '在官网打开 ↗', detail: '详情', versions: '个版本',
    results: '条结果', found: '找到', noResults: '没有匹配结果',
    noResultsHint: '试试编号（如 2110-10）或关键词（如 HDR、DCP、IMF）。',
    idleTitle: '检索 SMPTE 文档库',
    idleHint: '每条结果都指向 pub.smpte.org 的官方条目；本地 PDF 只用于建立全文索引，不对外提供。',
    filters: '筛选', clear: '清除', clearAll: '清除全部',
    keyword: '关键词', keywordIndex: '关键词索引',
    kwHint: '从标题、定义与缩略语中抽取的全部词条。点击任一关键词列出相关文档。',
    browse: '目录', about: '说明', search: '检索',
    allStates: '全部状态', sort: '排序', relevance: '相关度', newest: '最新', designation: '编号',
    scope: 'Scope', outline: '条款大纲', definitions: '术语定义', refs: '引用', citedBy: '被引用于',
    official: '官网条目', family: '全部版本', copy: '复制引用', copied: '引用已复制',
    loading: '载入中…', page: '页',
    source: '来源', snapshot: '官网快照', built: '索引构建',
    localNote: '本地 PDF 仅用于建立索引，本页不托管任何 PDF。',
    kwDocs: '份文档', showAll: '全部显示', filterBy: '筛选',
  };

  const CAT = {
    hdr: ['HDR 与色彩', 'HDR & colour'], cinema: ['数字影院', 'Digital cinema'],
    ip: ['IP 与网络', 'IP & networking'], mastering: ['母版与 IMF', 'Mastering & IMF'],
    metadata: ['元数据与文件', 'Metadata & files'], audio: ['音频', 'Audio'],
    tv: ['电视与广播', 'Television'], film: ['胶片与放映', 'Film & projection'],
    measurement: ['测量与测试', 'Measurement'], archive: ['归档与保存', 'Archive'],
    aces: ['ACES', 'ACES'], accessibility: ['无障碍', 'Accessibility'], other: ['其他', 'Other'],
  };
  const catLabel = (c) => (CAT[c] ? CAT[c][EN ? 1 : 0] : c);

  const TYPE_INFO = EN ? {
    ST: { name: 'SMPTE Standard', desc: 'Normative document defining technical requirements: formats, parameters, interfaces and measurement methods.' },
    RP: { name: 'Recommended Practice', desc: 'Recommended engineering practice and measurement/operating methods; guidance for implementation, with the document foreword governing.' },
    EG: { name: 'Engineering Guideline', desc: 'Informative document explaining standards and technical background; it does not set mandatory requirements.' },
    RDD: { name: 'Registered Disclosure Document', desc: 'Technology disclosed by a submitter and registered by SMPTE; not a standard.' },
    OV: { name: 'Overview', desc: 'Informative roadmap describing the scope, structure and relationships of a document suite.' },
  } : {
    ST: { name: 'Standard · 标准', desc: '规定技术要求的规范性文件：格式、参数、接口、测量方法等。' },
    RP: { name: 'Recommended Practice · 推荐实践', desc: '推荐的工程做法与测量/操作方法，用于指导实现；具体效力以文档前言为准。' },
    EG: { name: 'Engineering Guideline · 工程指南', desc: '解释性、信息性文件，帮助理解标准与技术背景，不规定强制要求。' },
    RDD: { name: 'Registered Disclosure Document · 注册披露', desc: '由提交方披露、经 SMPTE 登记的技术文件，不等同于标准。' },
    OV: { name: 'Overview · 概览 / 路线图', desc: '说明一个文档套件的范围、结构与文档关系，信息性。' },
  };

  const CAT_DESC = EN ? {
    hdr: 'HDR, wide colour gamut, tone mapping and display transforms',
    cinema: 'D-Cinema, DCP, KDM, JPEG 2000 and the theatrical chain',
    ip: 'ST 2110 / 2022, PTP, RTP and NMOS production networking',
    mastering: 'IMF, mastering and versioned distribution',
    metadata: 'MXF, KLV, BXF, XML and file/metadata formats',
    audio: 'AES3, BWF, loudness and immersive audio',
    tv: 'SDI, timecode, captions, UHD/HFR and broadcast',
    film: 'Film stock, cameras, projection and screens',
    measurement: 'Colorimetry, transfer functions, calibration and test patterns',
    archive: 'Archiving, preservation and restoration',
    aces: 'ACES colour encoding and Academy density',
    accessibility: 'Subtitles, closed captions and audio description',
    other: 'Documents outside the topics above',
  } : {
    hdr: 'HDR、广色域、色调映射与显示转换',
    cinema: 'D-Cinema、DCP、KDM、JPEG 2000 等影院链路',
    ip: 'ST 2110/2022、PTP、RTP、NMOS 等 IP 制作',
    mastering: 'IMF、母版制作与版本分发',
    metadata: 'MXF、KLV、BXF、XML 等文件与元数据',
    audio: 'AES3、BWF、响度与沉浸式音频',
    tv: 'SDI、时间码、字幕、UHD/HFR 等广播技术',
    film: '胶片、摄影机、放映与银幕',
    measurement: '色度、传递函数、校准与测试图',
    archive: '归档、保存与修复',
    aces: 'ACES 色彩编码与 Academy 密度',
    accessibility: '字幕、隐藏字幕与口述影像',
    other: '未归入以上主题的文档',
  };
  const catDesc = (c) => CAT_DESC[c] || '';

  const state = {
    tab: 'search',
    q: '',
    keyword: null,
    mode: 'idle',
    results: [],
    matchedKeywords: [],
    filters: { type: new Set(), state: new Set(), decade: new Set(), year: new Set(), suite: new Set(), category: new Set() },
    sort: 'relevance',
    sortAuto: false,
    doc: null,
    shown: 40,
  };

  let families = [];
  let byId = new Map();
  let exactMap = new Map();
  let facets = {};
  let meta = {};
  let keywords = [];
  let kwLoaded = false;
  let kwPromise = null;
  let pfPromise = null;
  let searchToken = 0;

  // ---------------------------------------------------------------- helpers

  function wordNorm(s) {
    return (s || '').toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/g, '');
  }

  function hasFilters() {
    return Object.values(state.filters).some((s) => s.size > 0);
  }

  function familyPass(f) {
    const fl = state.filters;
    if (fl.type.size && !fl.type.has(f.type)) return false;
    if (fl.state.size && !fl.state.has(f.state)) return false;
    if (fl.suite.size && !fl.suite.has(f.suite || '—')) return false;
    if (fl.decade.size) {
      const dec = f.latest_date ? String(Math.floor(Number(f.latest_date.slice(0, 4)) / 10) * 10) : '—';
      if (!fl.decade.has(dec)) return false;
    }
    if (fl.year.size) {
      const y = f.latest_date ? f.latest_date.slice(0, 4) : '';
      let ok = false;
      for (const v of fl.year) {
        if (v.includes('-')) {
          const [a, b] = v.split('-');
          if (y && Number(y) >= Number(a) && Number(y) <= Number(b)) ok = true;
        } else if (y === v) ok = true;
      }
      if (!ok) return false;
    }
    if (fl.category.size && !(f.categories || []).some((c) => fl.category.has(c))) return false;
    return true;
  }

  function highlight(text, q) {
    if (!text) return '';
    if (!q) return esc(text);
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return esc(text).replace(new RegExp('(' + safe + ')', 'ig'), '<mark>$1</mark>');
    } catch (e) {
      return esc(text);
    }
  }

  function buildExactMap() {
    exactMap = new Map();
    const add = (k, f) => { if (k && !exactMap.has(k)) exactMap.set(k, f); };
    for (const f of families) {
      add(f.id, f);
      add(f.number.toLowerCase(), f);
      add((f.type + f.number).toLowerCase(), f);
      add(f.designation.toLowerCase().replace(/\s+/g, ''), f);
      add(wordNorm(f.designation), f);
      add(wordNorm(f.id), f);
    }
  }

  function normalizeQueryNumber(q) {
    let s = (q || '').toLowerCase().trim();
    s = s.replace(/^smpte\s+/, '');
    s = s.replace(/^(st|rp|eg|rdd|ov)\s+/, '');
    s = s.replace(/\s*:\s*\d{4}\s*$/, '');
    s = s.replace(/[.\s]+/g, '-');
    return s.replace(/^-+|-+$/g, '');
  }

  function exactMatches(q) {
    const cands = new Set();
    const n = normalizeQueryNumber(q);
    if (!n) return [];
    cands.add(n);
    cands.add(wordNorm(n));
    cands.add(n.replace(/-\d{4}$/, ''));
    for (const type of ['st', 'rp', 'eg', 'rdd', 'ov']) {
      cands.add(type + n);
      cands.add(type + n.replace(/-/g, ''));
    }
    const out = [];
    for (const c of cands) {
      const f = exactMap.get(c) || exactMap.get(wordNorm(c));
      if (f && !out.includes(f)) out.push(f);
    }
    return out.slice(0, 4);
  }

  function parseQuery(raw) {
    const out = { text: raw, type: [], state: [], decade: [], year: [], suite: [], category: [], kw: null };
    const re = /\b(type|state|decade|year|suite|cat|kw):("[^"]*"|\S+)/gi;
    let m;
    while ((m = re.exec(raw))) {
      const key = m[1].toLowerCase() === 'cat' ? 'category' : m[1].toLowerCase();
      const val = m[2].replace(/^"|"$/g, '').toLowerCase();
      if (key === 'kw') out.kw = val;
      else if (out[key]) out[key].push(val);
    }
    out.text = raw.replace(re, ' ').replace(/\s+/g, ' ').trim();
    return out;
  }

  function applySyntax(parsed) {
    for (const key of ['type', 'state', 'decade', 'year', 'suite', 'category']) {
      if (parsed[key] && parsed[key].length) {
        state.filters[key].clear();
        parsed[key].forEach((v) => state.filters[key].add(key === 'type' ? v.toUpperCase() : v));
      }
    }
  }

  // ---------------------------------------------------------------- data

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }

  async function loadKeywords() {
    if (kwLoaded) return keywords;
    if (kwPromise) return kwPromise;
    kwPromise = getJSON(cfg.dataBase + 'keywords.json')
      .then((list) => { keywords = list || []; kwLoaded = true; return keywords; })
      .catch(() => { keywords = []; kwLoaded = true; return keywords; });
    return kwPromise;
  }

  async function ensurePagefind() {
    if (pfPromise) return pfPromise;
    pfPromise = import(cfg.pagefindBase + 'pagefind.js')
      .then(async (mod) => {
        await mod.options({ basePath: cfg.pagefindBase });
        await mod.init();
        return mod;
      })
      .catch((err) => {
        console.warn('Pagefind unavailable', err);
        return null;
      });
    return pfPromise;
  }

  // ---------------------------------------------------------------- shell

  async function boot() {
    bindStaticEvents();
    try {
      const [fam, fac, mt] = await Promise.all([
        getJSON(cfg.dataBase + 'families.json'),
        getJSON(cfg.dataBase + 'facets.json'),
        getJSON(cfg.dataBase + 'meta.json'),
      ]);
      families = fam || [];
      byId = new Map(families.map((f) => [f.id, f]));
      facets = fac || {};
      meta = mt || {};
      buildExactMap();
      renderHero();
      renderQuick();
      renderFoot();
      renderSide();
      setTab((new URLSearchParams(location.search)).get('tab') || 'search', false);
      await loadKeywords();
      applyUrl();
    } catch (err) {
      $('#sm-results').innerHTML = `<div class="sm-empty"><h3>${esc(T.loading)}</h3><p>${esc(String(err))}</p></div>`;
    }
  }

  function renderHero() {
    const side = $('#sm-hero-side');
    if (side) {
      side.innerHTML = `
        <div class="sm-stat"><b>${fmt(meta.families || families.length)}</b><span>${EN ? 'documents' : '文档'}</span></div>
        <div class="sm-stat"><b>${fmt(meta.versions || 0)}</b><span>${EN ? 'versions' : '版本'}</span></div>
        <div class="sm-stat"><b>${esc((meta.snapshot_date || '').slice(5))}</b><span>${EN ? 'snapshot' : '官网快照'}</span></div>`;
    }
  }

  function renderQuick() {
    const wrap = $('#sm-quick');
    if (!wrap) return;
    const items = EN
      ? ['2110-10', 'HDR', 'DCP', 'IMF', 'ST 2084', 'timecode', 'ACES']
      : ['2110-10', 'HDR', 'DCP', 'IMF', 'ST 2084', 'timecode', '高动态范围'];
    wrap.innerHTML = items.map((q) => `<button type="button" data-quick="${esc(q)}">${esc(q)}</button>`).join('');
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quick]');
      if (!b) return;
      $('#sm-q').value = b.dataset.quick;
      doSearch();
    });
  }

  function renderFoot() {
    const foot = $('#sm-foot');
    if (!foot) return;
    foot.innerHTML = `
      <span>${esc(T.localNote)}</span>
      <span>${esc(T.snapshot)} ${esc(meta.snapshot_date || '')} · ${esc(T.built)} ${esc(meta.built_at || '')}</span>`;
  }

  function renderSide() {
    const side = $('#sm-side');
    if (!side) return;
    const groups = [];
    const add = (key, title, entries, label) => {
      if (!entries || !entries.length) return;
      const rows = entries.map(([v, n]) => `
        <label class="sm-facet">
          <input type="checkbox" data-facet="${key}" data-value="${esc(v)}" ${state.filters[key].has(v) ? 'checked' : ''}>
          <span>${esc(label ? label(v) : v)}</span><em>${fmt(n)}</em>
        </label>`).join('');
      groups.push(`<div class="sm-facet-group"><p class="sm-facet-title">${esc(title)}</p>${rows}
        <button type="button" class="sm-side-reset" data-reset="${key}">${esc(T.clear)}</button></div>`);
    };
    const dict = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);
    add('type', EN ? 'Type' : '类型', dict(facets.type), (v) => v);
    add('state', EN ? 'State' : '状态', dict(facets.state), (v) => T.state[v] || v);
    add('decade', EN ? 'Decade' : '年代', Object.entries(facets.decade || {}).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      (v) => (v === '—' ? '—' : v + 's'));
    add('suite', EN ? 'Document suite' : '文档套件',
      dict(facets.suite).slice(0, 14), (v) => 'ST ' + v);
    add('category', EN ? 'Topic' : '主题', dict(facets.category), catLabel);
    side.innerHTML = `
      <div class="sm-facet-head"><span>${esc(T.filters)}</span><button type="button" class="sm-side-reset" data-reset-all>${esc(T.clearAll)}</button></div>
      ${groups.join('')}`;
  }

  function refreshSideChecks() {
    $$('#sm-side input[data-facet]').forEach((el) => {
      el.checked = state.filters[el.dataset.facet].has(el.dataset.value);
    });
  }

  // ---------------------------------------------------------------- search

  async function doSearch(opts = {}) {
    const raw = $('#sm-q').value.trim();
    const parsed = parseQuery(raw);
    applySyntax(parsed);
    const q = parsed.text;
    state.q = q;
    state.keyword = null;
    state.matchedKeywords = [];
    refreshSideChecks();

    if (parsed.kw) {
      await loadKeywords();
      const kw = keywords.find((k) => (k.term + ' ' + k.abbr + ' ' + (k.zh || '')).toLowerCase().includes(parsed.kw));
      if (kw) return showKeyword(kw, opts.updateUrl !== false);
    }

    if (!q && hasFilters()) {
      state.mode = 'search';
      const list = families.filter(familyPass).map((f) => ({ family: f, kind: 'filter', excerpt: f.scope_short || '' }));
      if (state.sort === 'relevance') { state.sort = 'designation'; state.sortAuto = true; }
      state.results = sortResults(list);
      state.shown = 40;
      renderAll();
      if (opts.updateUrl !== false) updateUrl();
      return;
    }
    if (!q && !hasFilters()) {
      state.mode = 'idle';
      state.results = [];
      state.tab = 'search';
      setTab('search', false);
      renderAll();
      if (opts.updateUrl !== false) updateUrl();
      return;
    }

    if (q && state.sortAuto) {
      state.sort = 'relevance';
      state.sortAuto = false;
    }
    const token = ++searchToken;
    state.mode = 'search';
    state.tab = 'search';
    setTab('search', false);
    $('#sm-results').innerHTML = `<div class="sm-empty"><p>${esc(T.loading)}</p></div>`;
    $('#sm-results').setAttribute('aria-busy', 'true');

    const out = [];
    const seen = new Set();
    const push = (f, kind, excerpt, kw) => {
      if (!f || seen.has(f.id) || !familyPass(f)) return;
      seen.add(f.id);
      out.push({ family: f, kind, excerpt, kw });
    };

    if (q) {
      for (const f of exactMatches(q)) push(f, 'exact', null, null);
    }

    if (q) {
      await loadKeywords();
      const ql = q.toLowerCase();
      const cjk = /[\u4e00-\u9fff]/.test(q);
      const hits = keywords.filter((k) => {
        const hay = [k.term, k.zh, k.abbr, ...(k.aliases || [])].join(' ').toLowerCase();
        if (cjk) return hay.includes(ql);
        return (k.abbr || '').toLowerCase() === ql || k.term.toLowerCase() === ql || hay.includes(' ' + ql + ' ');
      }).slice(0, 6);
      for (const k of hits) {
        state.matchedKeywords.push(k);
        const term = (k.term || '').toLowerCase();
        const docs = (k.docs || []).slice(0, 14).map((id) => byId.get(id)).filter(Boolean);
        docs.sort((a, b) => {
          const hit = (f) => ((f.title + ' ' + f.designation).toLowerCase().includes(term) ? 1 : 0);
          return hit(b) - hit(a);
        });
        for (const f of docs) push(f, 'keyword', highlight(f.scope_short || '', q), k.term);
      }
    }

    if (q.length >= 2) {
      const pf = await ensurePagefind();
      if (pf) {
        try {
          const filters = {};
          for (const key of ['type', 'state', 'suite']) {
            if (state.filters[key].size) filters[key] = Array.from(state.filters[key]);
          }
          if (state.filters.year.size && Array.from(state.filters.year).every((v) => /^\d{4}$/.test(v))) {
            filters.year = Array.from(state.filters.year);
          }
          const options = Object.keys(filters).length ? { filters } : undefined;
          const r = await pf.search(q, options);
          if (token !== searchToken) return;
          const datas = await Promise.all(r.results.slice(0, 160).map((x) => x.data()));
          for (const d of datas) {
            const id = (d.meta && (d.meta.id || d.meta.family)) || '';
            const f = byId.get(id);
            if (!f) continue;
            push(f, 'pagefind', d.excerpt || highlight(f.scope_short || '', q), null);
          }
        } catch (err) {
          console.warn('search failed', err);
        }
      }
    }

    if (q && out.length < 6) {
      const ql = q.toLowerCase();
      for (const f of families) {
        if (seen.has(f.id) || !familyPass(f)) continue;
        const hay = (f.designation + ' ' + f.title + ' ' + (f.scope_short || '')).toLowerCase();
        if (hay.includes(ql)) {
          push(f, 'local', highlight(f.scope_short || '', q), null);
          if (out.length >= 60) break;
        }
      }
    }

    state.results = sortResults(out);
    state.shown = 40;
    renderAll();
    if (opts.updateUrl !== false) updateUrl();
  }

  function sortResults(list) {
    if (state.sort === 'newest') {
      return list.slice().sort((a, b) => (b.family.latest_date || '').localeCompare(a.family.latest_date || ''));
    }
    if (state.sort === 'designation') {
      return list.slice().sort((a, b) => a.family.designation.localeCompare(b.family.designation, undefined, { numeric: true }));
    }
    return list;
  }

  async function showKeyword(kw, update = true) {
    await loadKeywords();
    state.keyword = kw;
    state.q = '';
    state.matchedKeywords = [];
    state.mode = 'keyword';
    state.tab = 'search';
    state.sort = 'relevance';
    state.sortAuto = false;
    $('#sm-q').value = '';
    Object.values(state.filters).forEach((set) => set.clear());
    refreshSideChecks();
    setTab('search', false);
    const docs = (kw.docs || []).map((id) => byId.get(id)).filter((f) => f && familyPass(f));
    state.results = docs.map((f) => ({ family: f, kind: 'keyword', excerpt: f.scope_short || '', kw: kw.term }));
    state.shown = 40;
    renderAll();
    if (update) updateUrl();
    $('#sm-results').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- render

  function renderAll() {
    if (state.tab === 'search') {
      renderSide();
      renderToolbar();
      renderResults();
    } else if (state.tab === 'browse') {
      renderSide();
      renderBrowse();
    } else if (state.tab === 'keywords') {
      renderKeywords();
    } else if (state.tab === 'about') {
      renderAbout();
    }
  }

  function renderToolbar() {
    const bar = $('#sm-toolbar');
    if (!bar) return;
    const chips = [];
    for (const [key, set] of Object.entries(state.filters)) {
      for (const v of set) {
        const label = key === 'state' ? (T.state[v] || v)
          : key === 'category' ? catLabel(v)
            : key === 'decade' ? v + 's'
              : key === 'year' ? v
                : key === 'suite' ? 'ST ' + v : v;
        chips.push(`<span class="sm-chip">${esc(label)}<button type="button" data-chip="${key}" data-chip-value="${esc(v)}" aria-label="${esc(T.clear)}">×</button></span>`);
      }
    }
    let count = '';
    if (state.mode === 'keyword' && state.keyword) {
      count = `${esc(T.keyword)}：<b>${esc(state.keyword.term)}</b> · ${fmt(state.results.length)} ${esc(T.kwDocs)}`;
    } else if (state.mode === 'search' && (state.q || hasFilters())) {
      count = `${esc(T.found)} <b>${fmt(state.results.length)}</b> ${esc(T.results)}`;
    } else {
      count = `${fmt(families.length)} ${EN ? 'documents' : '部文档'} · ${fmt(meta.versions || 0)} ${EN ? 'versions' : '个版本'}`;
    }
    bar.innerHTML = `
      <div class="sm-count">${count}</div>
      ${state.mode === 'idle' ? '' : `<div class="sm-sort">
        <label for="sm-sort-select">${esc(T.sort)}</label>
        <select id="sm-sort-select">
          <option value="relevance">${esc(T.relevance)}</option>
          <option value="newest">${esc(T.newest)}</option>
          <option value="designation">${esc(T.designation)}</option>
        </select>
      </div>`}
      ${chips.length ? `<div class="sm-chips">${chips.join('')}</div>` : ''}`;
    const sel = $('#sm-sort-select');
    if (sel) {
      sel.value = state.sort;
      sel.addEventListener('change', () => {
        state.sort = sel.value;
        state.sortAuto = false;
        if (state.mode === 'search' || state.mode === 'keyword') {
          state.results = sortResults(state.results);
          renderResults();
        }
      });
    }
  }

  function card(item) {
    const f = item.family;
    const url = f.latest_official_url || (f.official && f.official.family_url) || cfg.official;
    const badges = [`<span class="sm-badge ${esc(f.state)}">${esc(T.state[f.state] || f.state)}</span>`];
    if (f.newer_official) badges.push(`<span class="sm-badge new">${esc(T.newer)}</span>`);
    if (f.ocr) badges.push('<span class="sm-badge ocr">OCR</span>');
    badges.push((f.versions_local || 0) > 0
      ? `<span class="sm-badge local">${esc(T.mirrored)}</span>`
      : `<span class="sm-badge miss">${esc(T.notMirrored)}</span>`);
    const year = f.latest_date ? f.latest_date.slice(0, 4) : '—';
    const kws = (f.keywords || []).slice(0, 3).map((k) =>
      `<button type="button" class="sm-kw" data-kw="${esc(k)}">${esc(k)}</button>`).join('，');
    const excerpt = item.excerpt
      ? `<p class="sm-excerpt">${item.excerpt}</p>`
      : (f.scope_short ? `<p class="sm-excerpt">${esc(f.scope_short)}</p>` : '');
    return `<article class="sm-card" data-id="${esc(f.id)}">
      <div class="sm-card-head">
        <div>
          <a class="sm-card-title" href="${esc(url)}" target="_blank" rel="noopener"
             aria-label="${esc(T.open)}: ${esc(f.designation)}">
            <span class="sm-designation">${esc(f.designation)}</span><span class="sm-card-name">${esc(f.title)}</span>
          </a>
          <p class="sm-card-sub">
            <span>${esc(year)}</span><span class="dot">·</span>
            <span>${fmt(f.versions_official)} ${esc(T.versions)}</span>
            ${f.pages ? `<span class="dot">·</span><span>${fmt(f.pages)} ${esc(T.page)}</span>` : ''}
            ${kws ? `<span class="dot">·</span><span>${kws}</span>` : ''}
          </p>
        </div>
        <div class="sm-badges">${badges.join('')}</div>
      </div>
      ${excerpt}
      <div class="sm-actions">
        <a class="sm-open" href="${esc(url)}" target="_blank" rel="noopener">${esc(T.open)}</a>
        <button type="button" class="sm-detail" data-detail="${esc(f.id)}">${esc(T.detail)}</button>
      </div>
    </article>`;
  }

  function renderResults() {
    const box = $('#sm-results');
    if (!box) return;
    box.removeAttribute('aria-busy');
    if (state.mode === 'idle') return renderIdle();
    const list = state.results || [];
    if (!list.length) return renderEmpty();
    let head = '';
    if (state.matchedKeywords && state.matchedKeywords.length) {
      head = `<div class="sm-chips" style="margin:-.2rem 0 .8rem">${state.matchedKeywords.map((k) =>
        `<button type="button" class="sm-chip" data-kw-term="${esc(k.term)}">${esc(k.term)}${k.zh ? ' · ' + esc(k.zh) : ''} <span>${fmt(k.count)}</span></button>`).join('')}</div>`;
    }
    const shown = list.slice(0, state.shown);
    box.innerHTML = head + shown.map(card).join('');
    $('#sm-more').hidden = list.length <= state.shown;
  }

  function renderEmpty() {
    const box = $('#sm-results');
    const sugg = ['2110-10', 'HDR', 'DCP', 'IMF', 'ST 2084', 'timecode'];
    box.innerHTML = `<div class="sm-empty">
      <h3>${esc(T.noResults)}</h3>
      <p>${esc(T.noResultsHint)}</p>
      <div class="sm-sugg">${sugg.map((s) => `<button type="button" class="sm-chip" data-quick="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </div>`;
  }

  function renderIdle() {
    const box = $('#sm-results');
    $('#sm-more').hidden = true;
    const types = ['ST', 'RP', 'EG', 'RDD', 'OV'];
    const year = (f) => (f.latest_date ? f.latest_date.slice(0, 4) : '—');
    const typeCard = (type) => {
      const all = families.filter((f) => f.type === type);
      const states = { active: 0, stabilized: 0, withdrawn: 0 };
      for (const f of all) states[f.state] = (states[f.state] || 0) + 1;
      const top = all.slice().sort((a, b) => (b.latest_date || '').localeCompare(a.latest_date || '')
        || a.number.localeCompare(b.number, undefined, { numeric: true })).slice(0, 4);
      const rows = top.map((f) => `<li>
        <a href="${esc(f.latest_official_url || f.official.family_url)}" target="_blank" rel="noopener">
          <b>${esc(f.designation)}</b><span>${esc(f.title)}</span>
        </a><em>${esc(year(f))}</em>
      </li>`).join('');
      const info = TYPE_INFO[type] || { name: type, desc: '' };
      return `<section class="sm-cat">
        <header class="sm-cat-head">
          <div><span class="sm-cat-type">${esc(type)}</span><span class="sm-cat-count">${fmt(all.length)} ${EN ? '' : '部'}</span></div>
          <button type="button" data-cat-type="${esc(type)}">${EN ? 'All' : '查看全部'} →</button>
        </header>
        <p class="sm-cat-full">${esc(info.name)}</p>
        <p class="sm-cat-desc">${esc(info.desc)}</p>
        <p class="sm-cat-states">${T.state.active} ${fmt(states.active)} · ${T.state.stabilized} ${fmt(states.stabilized)} · ${T.state.withdrawn} ${fmt(states.withdrawn)}</p>
        <ul class="sm-cat-list">${rows}</ul>
      </section>`;
    };
    const topics = Object.entries(facets.category || {}).slice(0, 10).map(([c, n]) =>
      `<button type="button" data-cat-filter="category" data-value="${esc(c)}" title="${esc(catLabel(c))} — ${esc(catDesc(c))}">${esc(catLabel(c))} <span>${fmt(n)}</span></button>`).join('');
    const recent = families.slice().sort((a, b) => (b.latest_date || '').localeCompare(a.latest_date || '')
      || a.designation.localeCompare(b.designation, undefined, { numeric: true })).slice(0, 8);
    const recentRows = recent.map((f) => `<a class="sm-recent-row" href="${esc(f.latest_official_url || f.official.family_url)}" target="_blank" rel="noopener">
      <b>${esc(f.designation)}</b><span>${esc(f.title)}</span><em>${esc(year(f))}</em>
      <span class="sm-badge ${esc(f.state)}">${esc(T.state[f.state] || f.state)}</span>
    </a>`).join('');
    box.innerHTML = `<div class="sm-home">
      <p class="sm-home-lead">${EN
        ? 'Browse the library by type or topic below. Type a designation or keyword at any time to search full text.'
        : '下面按类型和主题分组概览文档，点「查看全部」浏览该分类；输入编号或关键词即可全文检索。'}</p>
      <div class="sm-cat-grid">${types.map(typeCard).join('')}</div>
      <section class="sm-home-block">
        <h3>${EN ? 'By topic' : '按主题'}</h3>
        <p class="sm-home-hint">${EN ? 'Topics are assigned from titles, scopes and keywords; click one to filter.' : '主题按文档标题、Scope 与关键词归类；点击即可筛选。'}</p>
        <div class="sm-topic-chips">${topics}</div>
      </section>
      <section class="sm-home-block">
        <h3>${EN ? 'Recently published' : '最近发布'}</h3>
        <div class="sm-recent">${recentRows}</div>
      </section>
    </div>`;
  }

  function renderBrowse() {
    const box = $('#sm-results');
    box.removeAttribute('aria-busy');
    const list = families.filter((f) => familyPass(f));
    if (!list.length) return renderEmpty();
    const order = ['ST', 'RP', 'EG', 'RDD', 'OV'];
    const groups = new Map(order.map((t) => [t, []]));
    for (const f of list) {
      if (!groups.has(f.type)) groups.set(f.type, []);
      groups.get(f.type).push(f);
    }
    let html = '';
    for (const [type, items] of groups) {
      if (!items.length) continue;
      items.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
      html += `<h3 class="sm-typehead">${esc(type)} · ${fmt(items.length)}</h3>
        <table class="sm-table"><thead><tr>
          <th>${esc(T.designation)}</th><th>${EN ? 'Title' : '标题'}</th>
          <th class="hide-sm">${EN ? 'State' : '状态'}</th><th>${EN ? 'Year' : '年份'}</th><th></th>
        </tr></thead><tbody>
        ${items.map((f) => `<tr>
          <td class="num">${esc(f.designation)}</td>
          <td class="ttl"><a href="${esc(f.latest_official_url || f.official.family_url)}" target="_blank" rel="noopener">${esc(f.title)}</a></td>
          <td class="st hide-sm"><span class="sm-badge ${esc(f.state)}">${esc(T.state[f.state] || f.state)}</span></td>
          <td class="yr">${esc((f.latest_date || '').slice(0, 4))}</td>
          <td><button type="button" class="sm-detail" data-detail="${esc(f.id)}">${esc(T.detail)}</button></td>
        </tr>`).join('')}
        </tbody></table>`;
    }
    box.innerHTML = html;
    $('#sm-more').hidden = true;
    const bar = $('#sm-toolbar');
    if (bar) {
      const note = ($('#sm-q') && $('#sm-q').value.trim())
        ? (EN ? 'the search box applies to the Search tab only' : '搜索框仅在「检索」页生效')
        : '';
      bar.innerHTML = `<div class="sm-count">${esc(T.browse)} · <b>${fmt(list.length)}</b> ${EN ? 'documents' : '部文档'}</div>
        <div class="sm-sort">${note || (hasFilters() ? esc(T.clearAll) : '—')}</div>`;
    }
  }

  async function renderKeywords() {
    const box = $('#sm-results');
    const bar = $('#sm-toolbar');
    if (bar) bar.innerHTML = `<div class="sm-count">${esc(T.keywordIndex)} · <b>${fmt(keywords.length)}</b> ${EN ? 'terms' : '个词条'}</div>`;
    if (!kwLoaded) {
      box.innerHTML = `<div class="sm-empty"><p>${esc(T.loading)}</p></div>`;
      await loadKeywords();
    }
    const q = ($('#sm-kwq') || {}).value || '';
    const list = keywords.filter((k) => {
      if (!q) return true;
      const ql = q.toLowerCase();
      return [k.term, k.zh, k.abbr, ...(k.aliases || [])].join(' ').toLowerCase().includes(ql);
    });
    const groups = new Map();
    for (const k of list) {
      const ch = (k.term || '#')[0].toUpperCase();
      const letter = /[A-Z]/.test(ch) ? ch : '#';
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(k);
    }
    for (const arr of groups.values()) arr.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
    const letters = Array.from(groups.keys()).sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
    const az = letters.map((l) => `<a href="#sm-kw-${l}">${l}</a>`).join('');
    const body = letters.map((l) => `<section class="sm-kwgroup" id="sm-kw-${l}">
      <h3>${l}</h3>
      <div class="sm-kwlist">${groups.get(l).map((k) => `
        <button type="button" class="sm-kww" data-kw-term="${esc(k.term)}">
          <b>${esc(k.term)}</b>${k.zh && k.zh !== k.term ? `<span>${esc(k.zh)}</span>` : ''}${k.abbr && k.abbr !== k.term ? `<em>${esc(k.abbr)}</em>` : ''}
          <span>${fmt(k.count)}</span>
        </button>`).join('')}</div>
    </section>`).join('');
    box.innerHTML = `<p class="sm-note" style="margin-bottom:1rem">${esc(T.kwHint)}</p>
      <div class="sm-kwbar"><input id="sm-kwq" type="search" placeholder="${EN ? 'Filter terms…' : '筛选关键词…'}" value="${esc(q)}">
      <span class="sm-count">${fmt(list.length)} / ${fmt(keywords.length)}</span></div>
      <nav class="sm-az">${az}</nav>${body}`;
    $('#sm-more').hidden = true;
    const input = $('#sm-kwq');
    let composing = false;
    const apply = debounce(() => {
      const val = input.value;
      renderKeywords().then(() => {
        const el = $('#sm-kwq');
        if (el) { el.value = val; el.focus(); el.setSelectionRange(val.length, val.length); }
      });
    }, 180);
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; apply(); });
    input.addEventListener('input', () => { if (!composing) apply(); });
  }

  function renderAbout() {
    const box = $('#sm-results');
    $('#sm-more').hidden = true;
    if ($('#sm-toolbar')) $('#sm-toolbar').innerHTML = `<div class="sm-count">${esc(T.about)}</div>`;
    const rows = [
      [EN ? 'Documents' : '文档族', fmt(meta.families)],
      [EN ? 'Versions' : '版本', fmt(meta.versions)],
      [EN ? 'Locally mirrored' : '本地已镜像', fmt(meta.local_versions)],
      [EN ? 'Keyword entries' : '关键词条', fmt(meta.keywords)],
      [EN ? 'OCR fallback' : 'OCR 补充', fmt(meta.ocr || 0)],
      [EN ? 'Official snapshot' : '官网快照', esc(meta.snapshot_date || '')],
      [EN ? 'Index built' : '索引构建', esc(meta.built_at || '')],
      [EN ? 'Types' : '类型', Object.entries(meta.types || {}).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')],
      [EN ? 'States' : '状态', Object.entries(meta.states || {}).map(([k, v]) => `${T.state[k] || k} ${fmt(v)}`).join(' · ')],
    ];
    box.innerHTML = `<div class="sm-about">
      <h2>${EN ? 'About this index' : '关于这个索引'}</h2>
      <p>${EN
        ? 'This page indexes the public SMPTE Document Library. Every result links to the official version page on pub.smpte.org; no PDF is hosted or proxied here.'
        : '本页索引 SMPTE 公开文档库（pub.smpte.org）。每条结果都指向官网对应的版本页；本站不托管、不代理任何 PDF。'}</p>
      <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <h2>${EN ? 'Document types' : '文档类型'}</h2>
      <p>${EN
        ? 'The SMPTE designation prefix tells you what kind of document it is.'
        : 'SMPTE 编号前缀表示文档类型，效力与用途不同。'}</p>
      <table>${Object.entries(TYPE_INFO).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td><b>${esc(v.name)}</b><br><span style="color:#666">${esc(v.desc)}</span></td></tr>`).join('')}</table>
      <p class="sm-note">${EN
        ? 'Type descriptions follow the SMPTE document system; the foreword of each document governs.'
        : '类型说明按 SMPTE 文档体系整理；具体效力以各文档的 Foreword / 前言为准。'}</p>
      <h2>${EN ? 'Topics' : '主题'}</h2>
      <p>${EN
        ? 'Topics are assigned automatically from titles, scopes and keyword matches; one document can belong to several topics.'
        : '主题按标题、Scope 与关键词自动归类，一篇文档可属于多个主题。'}</p>
      <table>${Object.entries(CAT).map(([k, v]) => `<tr><td><b>${esc(catLabel(k))}</b></td><td>${esc(catDesc(k))}</td></tr>`).join('')}</table>
      <h2>${EN ? 'How it is built' : '构建方式'}</h2>
      <ul>
        <li>${EN ? 'Titles, states, versions and official URLs are crawled from pub.smpte.org and cached as a snapshot.' : '标题、状态、版本与官网链接来自 pub.smpte.org 的快照抓取；'}</li>
        <li>${EN ? 'Full text is extracted from the local mirror (PDF / HTML package) only to build the Pagefind index.' : '全文来自本地镜像（PDF / HTML 包）的抽取，仅用于生成 Pagefind 索引；'}</li>
        <li>${EN ? 'Results open the official entry; local files never leave this machine.' : '结果跳转官网条目；本地文件不进入站点、不对外提供。'}</li>
      </ul>
      <p class="sm-note">${EN ? 'SMPTE, the SMPTE logo and document texts are property of the Society of Motion Picture and Television Engineers. This is an independent research index.' : 'SMPTE 名称、标识与文档正文归 Society of Motion Picture and Television Engineers 所有；本页是独立的研究性索引。'}</p>
      <p><a href="https://pub.smpte.org/doc/" target="_blank" rel="noopener">pub.smpte.org/doc/</a></p>
    </div>`;
  }

  // ---------------------------------------------------------------- detail

  async function openDetail(id, update = true) {
    const f = byId.get(id);
    if (!f) return;
    state.doc = id;
    const drawer = $('#sm-drawer');
    const body = $('#sm-drawer-body');
    const panel = $('.sm-panel', drawer);
    if (panel) panel.scrollTop = 0;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    body.innerHTML = `<div class="sm-d-loading">${esc(T.loading)}</div>`;
    const closeBtn = $('.sm-close', drawer);
    if (closeBtn) closeBtn.focus();
    if (update) updateUrl();
    try {
      const d = await getJSON(cfg.docBase + id + '.json');
      body.innerHTML = detailHTML(d, f);
    } catch (err) {
      body.innerHTML = `<div class="sm-empty"><p>${esc(String(err))}</p></div>`;
    }
  }

  function detailHTML(d, f) {
    const url = f.latest_official_url || f.official.family_url;
    const year = f.latest_date ? f.latest_date.slice(0, 4) : '';
    const kws = (d.keywords || []).slice(0, 12).map((k) =>
      `<button type="button" data-kw-term="${esc(k.term)}">${esc(k.abbr || k.term)}${k.zh ? ' · ' + esc(k.zh) : ''}</button>`).join('');
    const versions = (d.versions || []).map((v) => `<li>
      <span class="d">${esc(v.date)}</span>
      <span class="k">${v.kind === 'amendment' ? (EN ? 'amendment' : '修正案') : (EN ? 'publication' : '发布')}</span>
      <span class="s">${v.present_locally ? `<span class="sm-badge local">${esc(T.mirrored)}</span>` : `<span class="sm-badge miss">${esc(T.notMirrored)}</span>`}
      <a href="${esc(v.official_url)}" target="_blank" rel="noopener">${esc(T.open)}</a></span>
    </li>`).join('');
    const refs = (d.refs || []).map((r) => `<button type="button" data-open="${esc(r.id)}">${esc(r.designation)}</button>`).join('');
    const cited = (d.cited_by || []).map((r) => `<button type="button" data-open="${esc(r.id)}">${esc(r.designation)}</button>`).join('');
    const outline = (d.outline || []).slice(0, 40).map((o) =>
      `<li><b>${esc(o.title)}</b>${o.page ? ` <span style="color:#999">${esc(T.page)} ${fmt(o.page)}</span>` : ''}</li>`).join('');
    const defs = (d.definitions || []).slice(0, 12).map((x) =>
      `<li><b>${esc(x.term)}</b> — ${esc(x.definition)}</li>`).join('');
    const scope = d.scope || f.scope_short || '';
    return `<div class="sm-d-head">
        <p class="sm-kicker">${esc(f.type)}${f.suite ? ' · ' + (EN ? 'suite ' : '套件 ') + esc(f.suite) : ''}</p>
        <h2 id="sm-drawer-title">${esc(f.designation)}</h2>
        <p class="sm-d-title">${esc(f.title)}</p>
        <div class="sm-badges">${`<span class="sm-badge ${esc(f.state)}">${esc(T.state[f.state] || f.state)}</span>`}
          ${f.newer_official ? `<span class="sm-badge new">${esc(T.newer)}</span>` : ''}
          ${f.ocr ? '<span class="sm-badge ocr">OCR</span>' : ''}
          ${(f.versions_local || 0) > 0 ? `<span class="sm-badge local">${esc(T.mirrored)}</span>` : `<span class="sm-badge miss">${esc(T.notMirrored)}</span>`}</div>
        <div class="sm-d-meta">
          <span>${esc(year)}</span><span>${fmt(f.versions_official)} ${esc(T.versions)}</span>
          ${f.pages ? `<span>${fmt(f.pages)} ${esc(T.page)}</span>` : ''}
          ${f.official.checked_at ? `<span>${esc(T.snapshot)} ${esc(f.official.checked_at)}</span>` : ''}
        </div>
      </div>
      <div class="sm-d-actions">
        <a href="${esc(url)}" target="_blank" rel="noopener">${esc(T.open)}</a>
        <a href="${esc(f.official.family_url)}" target="_blank" rel="noopener">${esc(T.family)}</a>
        <button type="button" id="sm-copy">${esc(T.copy)}</button>
      </div>
      ${scope ? `<section class="sm-d-sec"><h3>${esc(T.scope)}</h3><p>${esc(scope)}</p></section>` : ''}
      ${kws ? `<section class="sm-d-sec"><h3>${esc(T.keyword)}</h3><div class="sm-d-kws">${kws}</div></section>` : ''}
      ${versions ? `<section class="sm-d-sec"><h3>${EN ? 'Versions' : '版本'} · ${fmt((d.versions || []).length)}</h3><ul class="sm-timeline">${versions}</ul></section>` : ''}
      ${outline ? `<section class="sm-d-sec"><h3>${esc(T.outline)}</h3><ul class="sm-d-list">${outline}</ul></section>` : ''}
      ${refs ? `<section class="sm-d-sec"><h3>${esc(T.refs)}</h3><div class="sm-refs">${refs}</div></section>` : ''}
      ${cited ? `<section class="sm-d-sec"><h3>${esc(T.citedBy)}</h3><div class="sm-refs">${cited}</div></section>` : ''}
      ${defs ? `<section class="sm-d-sec"><h3>${esc(T.definitions)}</h3><ul class="sm-d-list">${defs}</ul></section>` : ''}
      <p class="sm-note" style="margin-top:2rem">${esc(T.localNote)}</p>`;
  }

  function closeDetail() {
    const drawer = $('#sm-drawer');
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    state.doc = null;
    updateUrl();
    const q = $('#sm-q');
    if (q) q.focus();
  }

  function copyCitation() {
    const f = byId.get(state.doc);
    if (!f) return;
    const year = f.latest_date ? f.latest_date.slice(0, 4) : '';
    const text = `${f.designation}:${year}, ${f.title}, SMPTE. ${f.latest_official_url || f.official.family_url}`;
    const done = () => { const b = $('#sm-copy'); if (b) b.textContent = T.copied; };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        const b = $('#sm-copy');
        if (b) b.textContent = EN ? 'Copy failed' : '复制失败';
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  // ---------------------------------------------------------------- tabs / url

  function setTab(tab, rerender = true) {
    if (!['search', 'keywords', 'browse', 'about'].includes(tab)) tab = 'search';
    state.tab = tab;
    $$('#sm-tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    const layout = $('.sm-layout');
    const side = $('#sm-side');
    const wide = tab === 'keywords' || tab === 'about';
    if (layout) layout.classList.toggle('sm-wide', wide);
    if (side) side.hidden = wide;
    const ft = $('#sm-filter-toggle');
    if (ft) ft.style.display = wide ? 'none' : '';
    if (rerender) renderAll();
  }

  function updateUrl() {
    const p = new URLSearchParams();
    if (state.tab !== 'search') p.set('tab', state.tab);
    if (state.q) p.set('q', state.q);
    for (const [key, set] of Object.entries(state.filters)) {
      for (const v of set) p.append(key, v);
    }
    if (state.keyword && state.tab === 'search') p.set('kw', state.keyword.term);
    if (state.doc) p.set('doc', state.doc);
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  async function applyUrl() {
    const p = new URLSearchParams(location.search);
    state.q = p.get('q') || '';
    const q = $('#sm-q');
    if (q) q.value = state.q;
    for (const key of Object.keys(state.filters)) {
      for (const v of p.getAll(key)) state.filters[key].add(v);
    }
    const tab = p.get('tab') || 'search';
    if (tab !== 'search') setTab(tab, true);
    else setTab('search', false);
    const doc = p.get('doc');
    const kw = p.get('kw');
    if (doc) {
      await openDetail(doc, false);
      renderAll();
    } else if (kw) {
      await loadKeywords();
      const found = keywords.find((k) => k.term === kw || (k.abbr || '') === kw);
      if (found) await showKeyword(found, false);
      else await doSearch({ updateUrl: false });
    } else if (state.q || hasFilters()) {
      await doSearch({ updateUrl: false });
    } else {
      renderAll();
    }
  }

  // ---------------------------------------------------------------- events

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function bindStaticEvents() {
    $('#sm-form').addEventListener('submit', (e) => { e.preventDefault(); doSearch(); });
    const input = $('#sm-q');
    input.addEventListener('input', debounce(() => {
      if (state.tab !== 'search') setTab('search', false);
      doSearch();
    }, 220));

    const filterToggle = $('#sm-filter-toggle');
    if (filterToggle) {
      filterToggle.addEventListener('click', () => {
        const side = $('#sm-side');
        const open = side.classList.toggle('is-open');
        filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    $('#sm-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      const tab = b.dataset.tab;
      if (tab === 'search') {
        const typed = ($('#sm-q').value || '').trim();
        if (typed && typed !== state.q) { doSearch(); return; }
        if (!typed && !hasFilters()) {
          state.q = '';
          state.keyword = null;
          state.mode = 'idle';
          state.results = [];
          state.matchedKeywords = [];
          setTab('search', true);
          updateUrl();
          return;
        }
        setTab('search', true);
        updateUrl();
        return;
      }
      setTab(tab, true);
      updateUrl();
    });

    $('#sm-side').addEventListener('change', (e) => {
      const el = e.target.closest('input[data-facet]');
      if (!el) return;
      const key = el.dataset.facet;
      if (el.checked) state.filters[key].add(el.dataset.value);
      else state.filters[key].delete(el.dataset.value);
      if (state.tab === 'browse') renderAll();
      else doSearch();
    });

    $('#sm-side').addEventListener('click', (e) => {
      const all = e.target.closest('[data-reset-all]');
      const one = e.target.closest('[data-reset]');
      if (all) {
        Object.values(state.filters).forEach((s) => s.clear());
        refreshSideChecks();
        doSearch();
        return;
      }
      if (one) {
        state.filters[one.dataset.reset].clear();
        refreshSideChecks();
        doSearch();
      }
    });

    $('#sm-results').addEventListener('click', (e) => {
      const detail = e.target.closest('[data-detail]');
      if (detail) { openDetail(detail.dataset.detail); return; }
      const kw = e.target.closest('[data-kw-term]');
      if (kw) {
        const found = keywords.find((k) => k.term === kw.dataset.kwTerm || (k.abbr || '') === kw.dataset.kwTerm);
        if (found) showKeyword(found);
        return;
      }
      const catType = e.target.closest('[data-cat-type]');
      if (catType) {
        Object.values(state.filters).forEach((set) => set.clear());
        state.filters.type.add(catType.dataset.catType);
        state.q = '';
        $('#sm-q').value = '';
        doSearch();
        return;
      }
      const catFilter = e.target.closest('[data-cat-filter]');
      if (catFilter) {
        Object.values(state.filters).forEach((set) => set.clear());
        state.filters[catFilter.dataset.catFilter].add(catFilter.dataset.value);
        state.q = '';
        $('#sm-q').value = '';
        doSearch();
        return;
      }
      const quick = e.target.closest('[data-quick]');
      if (quick) {
        $('#sm-q').value = quick.dataset.quick;
        doSearch();
      }
    });

    $('#sm-toolbar').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip) {
        state.filters[chip.dataset.chip].delete(chip.dataset.chipValue);
        refreshSideChecks();
        doSearch();
      }
    });

    $('#sm-more-btn').addEventListener('click', () => {
      state.shown += 40;
      renderResults();
    });

    $('#sm-drawer').addEventListener('click', (e) => {
      if (e.target.closest('[data-sm-close]')) { closeDetail(); return; }
      const open = e.target.closest('[data-open]');
      if (open) { openDetail(open.dataset.open); return; }
      const kw = e.target.closest('[data-kw-term]');
      if (kw) {
        const found = keywords.find((k) => k.term === kw.dataset.kwTerm || (k.abbr || '') === kw.dataset.kwTerm);
        if (found) { closeDetail(); showKeyword(found); }
        return;
      }
      if (e.target.id === 'sm-copy') copyCitation();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('#sm-q').focus();
        $('#sm-q').select();
      } else if (e.key === '/' && document.activeElement !== $('#sm-q')) {
        e.preventDefault();
        $('#sm-q').focus();
      } else if (e.key === 'Escape') {
        closeDetail();
      }
    });

    window.addEventListener('popstate', () => applyUrl());
  }

  boot();
})();
