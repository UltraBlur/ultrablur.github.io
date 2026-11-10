/* 本地私有扩展的防泄漏自检：Eab / Eab2 的系数只能待在 assets/js/local/，
   该目录被 .git/info/exclude 排除，绝不能出现在 git 跟踪文件里。
   运行：node tests/local-exclude.test.mjs
   本文件不含任何系数，只检查 git 状态。 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fails.push(name + (extra === undefined ? '' : '  →  ' + extra));
}

function git(args) {
  return execSync('git ' + args, { cwd: root, encoding: 'utf8' }).trim();
}

const trackedLocal = git('ls-files assets/js/local');
ok('assets/js/local 未被 git 跟踪', trackedLocal === '', trackedLocal.split('\n').slice(0, 3).join(', '));

let exclude = '';
try { exclude = readFileSync(path.join(root, '.git/info/exclude'), 'utf8'); } catch (e) { /* 非 git 环境 */ }
/* CI / 公开克隆没有本地私有扩展目录；只在本机开发环境才要求 exclude 规则 */
if (existsSync(path.join(root, 'assets/js/local'))) {
  ok('.git/info/exclude 含 assets/js/local/', exclude.includes('assets/js/local'));
} else {
  ok('无 assets/js/local 目录，跳过 exclude 规则检查', true);
}

const trackedAll = git('ls-files');
ok('没有已跟踪文件落在 assets/js/local 下', !trackedAll.split('\n').some((f) => f.startsWith('assets/js/local/')));

/* 生产构建产物里不应出现本地脚本（public/ 被忽略，这里只检查公开部署模板的开关） */
const volumeLayout = readFileSync(path.join(root, 'layouts/colour/volume.html'), 'utf8');
const refsLocalExt = volumeLayout.includes('assets/js/local/volume-ext.js');
if (existsSync(path.join(root, 'assets/js/local'))) {
  ok('volume 布局引用本地扩展', refsLocalExt);
  ok('volume 布局用 hugo.IsServer 包住本地扩展', refsLocalExt && /if hugo\.IsServer/.test(volumeLayout));
} else if (refsLocalExt) {
  ok('公开分支引用本地扩展时必须用 hugo.IsServer 包住', /if hugo\.IsServer/.test(volumeLayout));
} else {
  ok('公开布局不含本地扩展引用', true);
}

console.log(`${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
