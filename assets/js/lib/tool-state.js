/*
 * 工具页 URL 状态：把 compare / transfer / volume 的选项同步到查询串。
 *
 * schema 的每一项：
 *   type: 'string' | 'bool' | 'list' | 'number'
 *   default: 默认值（list 用数组）
 *   values: 可选值白名单（string / list）
 *   max: list 最多保留几项
 *   min / max: number 的上下限
 *
 * 约定：默认值不写进 URL；未知值回落到默认值；不认识的查询参数原样保留。
 * 浏览器里用 window.ToolState；Node 测试用 require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ToolState = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clone(value) {
    return Array.isArray(value) ? value.slice() : value;
  }

  function same(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    return a === b;
  }

  function parseList(raw, spec) {
    var seen = {};
    var out = [];
    raw.split(',').forEach(function (part) {
      var value = part.trim();
      if (!value || seen[value]) return;
      if (spec.values && spec.values.indexOf(value) < 0) return;
      seen[value] = true;
      out.push(value);
    });
    if (spec.max && out.length > spec.max) out = out.slice(0, spec.max);
    return out;
  }

  function parse(schema, search) {
    var params = new URLSearchParams(search || '');
    var out = {};
    Object.keys(schema).forEach(function (key) {
      var spec = schema[key] || {};
      var def = spec.default;
      var raw = params.get(key);
      if (raw === null) {
        out[key] = clone(def);
        return;
      }
      if (spec.type === 'bool') {
        if (raw === '1' || raw === 'true') out[key] = true;
        else if (raw === '0' || raw === 'false') out[key] = false;
        else out[key] = clone(def);
      } else if (spec.type === 'list') {
        var list = parseList(raw, spec);
        out[key] = list.length ? list : clone(def);
      } else if (spec.type === 'number') {
        var n = Number(raw);
        if (!isFinite(n)) {
          out[key] = clone(def);
        } else {
          if (typeof spec.min === 'number') n = Math.max(spec.min, n);
          if (typeof spec.max === 'number') n = Math.min(spec.max, n);
          out[key] = n;
        }
      } else {
        out[key] = spec.values && spec.values.indexOf(raw) < 0 ? clone(def) : raw;
      }
    });
    return out;
  }

  function encode(value) {
    if (Array.isArray(value)) return value.join(',');
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
  }

  /*
   * 把 state 写回查询串。opts.href 用于测试/非浏览器环境，只返回
   * pathname + search + hash，不碰 history；浏览器里默认 replaceState。
   */
  function write(schema, state, opts) {
    opts = opts || {};
    var external = typeof opts.href === 'string';
    var url = new URL(external ? opts.href : window.location.href);
    Object.keys(schema).forEach(function (key) {
      var spec = schema[key] || {};
      var value = state[key];
      var empty = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (empty || same(value, spec.default)) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, encode(value));
      }
    });
    /* URLSearchParams 会把列表的逗号编码成 %2C；列表用逗号更好读，换回来。 */
    url.search = url.search.replace(/%2C/g, ',');
    var href = url.pathname + url.search + url.hash;
    if (!external) {
      if (opts.push) window.history.pushState(null, '', href);
      else window.history.replaceState(null, '', href);
    }
    return href;
  }

  return { parse: parse, write: write };
});
