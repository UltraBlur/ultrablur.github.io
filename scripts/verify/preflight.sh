#!/usr/bin/env bash
# push/publish 前的一键预检：在 release worktree 里跑，不推送、不发布。
# 用法：bash scripts/verify/preflight.sh [--base main]
set -euo pipefail
cd "$(dirname "$0")/../.."

base="main"
if [ "${1:-}" = "--base" ] && [ -n "${2:-}" ]; then base="$2"; fi
pub=".preflight-public"
fail=0
cleanup() { rm -rf "$pub"; }
trap cleanup EXIT

if [ -n "$(git status --porcelain)" ]; then
  echo "! 工作区不干净：预检只代表 HEAD，未提交改动不会被执行"
  git status --short | head -5
fi

echo "== 1/5 公开测试 + 源码同步检查"
bash scripts/verify/tests.sh || fail=1

echo "== 2/5 生产构建（${pub}）"
rm -rf "$pub"
if hugo --gc --minify --destination "$pub" >/dev/null; then
  echo "✓ 构建通过"
else
  echo "✗ 构建失败"
  fail=1
fi

echo "== 3/5 公开边界检查"
PUBLIC_DIR="$pub" bash scripts/verify/public-boundary.sh || fail=1

echo "== 4/5 构建产物同步检查"
node scripts/verify/sync_check.mjs --built "$pub" || fail=1

echo "== 5/5 发布规则干跑（${base}..HEAD）"
policy="${UB_PREFLIGHT_POLICY:-}"
if [ -n "$policy" ] && [ -f "$policy" ]; then
  python3 scripts/verify/guard_dryrun.py --base "$base" --policy "$policy" || fail=1
else
  echo "– 跳过发布规则干跑：未设置 UB_PREFLIGHT_POLICY（公开仓库不含策略文件）"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "PASS：可以进入签名发布"
else
  echo "FAIL：不要推送/发布"
  exit 1
fi
