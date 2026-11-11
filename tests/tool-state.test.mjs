/* 工具页 URL 状态自检：解析、白名单、默认值省略、保留无关参数。
   运行：node tests/tool-state.test.mjs */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const ToolState = require(path.join(root, 'assets/js/lib/tool-state.js'));

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
    'got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected));
}

const schema = {
  a: { type: 'string', values: ['srgb', 'p3'], default: 'srgb' },
  b: { type: 'string', values: ['srgb', 'p3'], default: 'p3' },
  ptr: { type: 'bool', default: true },
  curves: { type: 'list', values: ['x', 'y', 'z'], default: ['x'], max: 2 },
  y: { type: 'string', values: ['abs', 'log'], default: 'abs' },
  ymax: { type: 'number', default: 0, min: 0 }
};

/* ---- parse ---- */

eq('空查询串用默认值', ToolState.parse(schema, ''), {
  a: 'srgb', b: 'p3', ptr: true, curves: ['x'], y: 'abs', ymax: 0
});

eq('读取全部字段', ToolState.parse(schema, '?a=p3&ptr=0&curves=y,z,x&y=log&ymax=1000'), {
  a: 'p3', b: 'p3', ptr: false, curves: ['y', 'z'], y: 'log', ymax: 1000
});

eq('未知字符串回落默认', ToolState.parse(schema, '?a=xxx&b=yyy'), {
  a: 'srgb', b: 'p3', ptr: true, curves: ['x'], y: 'abs', ymax: 0
});

eq('未知布尔值回落默认', ToolState.parse(schema, '?ptr=banana'), {
  a: 'srgb', b: 'p3', ptr: true, curves: ['x'], y: 'abs', ymax: 0
});

eq('布尔 true 的文本写法', ToolState.parse(schema, '?ptr=true')['ptr'], true);
eq('布尔 false 的文本写法', ToolState.parse(schema, '?ptr=false')['ptr'], false);

eq('列表去重、去未知值、限长', ToolState.parse(schema, '?curves=z,y,z,oops,x')['curves'], ['z', 'y']);
eq('列表全非法时回落默认', ToolState.parse(schema, '?curves=oops')['curves'], ['x']);
eq('列表为空时回落默认', ToolState.parse(schema, '?curves=')['curves'], ['x']);

eq('数字下限', ToolState.parse(schema, '?ymax=-20')['ymax'], 0);
eq('数字非数字回落默认', ToolState.parse(schema, '?ymax=abc')['ymax'], 0);

/* 默认数组必须是副本，不能被调用方改掉 schema */
const first = ToolState.parse(schema, '');
first.curves.push('y');
eq('默认数组不被污染', ToolState.parse(schema, '').curves, ['x']);

/* ---- write ---- */

const base = 'https://example.com/tools/compare/?utm_source=test#top';
const href = ToolState.write(schema, {
  a: 'p3', b: 'p3', ptr: false, curves: ['y', 'z'], y: 'log', ymax: 1000
}, { href: base });
const url = new URL('https://example.com' + href);
ok('write 保留无关参数', url.searchParams.get('utm_source') === 'test', href);
ok('write 只写非默认字段', url.searchParams.get('a') === 'p3' && url.searchParams.get('ptr') === '0', href);
ok('write 不写默认字段', url.searchParams.get('b') === null, href);
ok('write 列表用逗号连接', url.searchParams.get('curves') === 'y,z', href);
ok('write 列表保留未编码逗号', href.indexOf('curves=y,z') >= 0, href);
ok('write 保留 hash', url.hash === '#top', href);

const defaults = ToolState.write(schema, {
  a: 'srgb', b: 'p3', ptr: true, curves: ['x'], y: 'abs', ymax: 0
}, { href: base });
ok('全默认时只留无关参数', defaults === '/tools/compare/?utm_source=test#top', defaults);

/* 未提供 href 时不得需要浏览器：测试环境只验证显式 href 分支 */
const encoded = ToolState.write(schema, { a: 'p3' }, { href: 'https://example.com/tools/compare/' });
ok('write 返回相对路径', encoded.indexOf('/tools/compare/?a=p3') === 0, encoded);

if (fails.length) {
  console.error(fails.map((f) => '  ✗ ' + f).join('\n'));
  console.error(`\n${pass} passed, ${fails.length} failed`);
  process.exit(1);
}
console.log(`${pass} passed, 0 failed`);
