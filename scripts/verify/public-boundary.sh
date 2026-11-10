#!/usr/bin/env bash
# 公开边界检查：只依赖公开信息（static/internal 密文页的路径与内容标记）。
# 在 CI 里位于 hugo 构建之后、部署之前；任何一项失败都会让部署停下。
set -euo pipefail
cd "$(dirname "$0")/../.."

fail=0
err() { printf '✗ %s\n' "$*" >&2; fail=1; }

# 1) 本地私有扩展（Eab 等）不得被 git 跟踪
if [ -n "$(git ls-files 'assets/js/local/*' 2>/dev/null)" ]; then
  err "assets/js/local 下有被跟踪文件"
fi

# 2) static/internal 下每个 HTML 都必须是 StatiCrypt 密文
if [ -d static/internal ]; then
  total=$(find static/internal -type f -name '*.html' | wc -l | tr -d ' ')
  enc=$(grep -rl 'staticrypt' static/internal --include='*.html' | wc -l | tr -d ' ')
  if [ "$total" -eq 0 ]; then
    err "static/internal 下没有 HTML"
  elif [ "$total" != "$enc" ]; then
    err "static/internal 有非密文 HTML（$enc/$total 带 staticrypt 标记）"
  fi
else
  err "缺少 static/internal"
fi

if [ ! -d public ]; then
  err "public/ 不存在：请先跑 hugo 构建"
  exit 1
fi

# 3) 内部工具页（由密文页路径反推）不得以明文出现在公开构建里
for dir in static/internal/tools/*/ static/internal/en/tools/*/; do
  [ -d "$dir" ] || continue
  slug=$(basename "$dir")
  # 公开站与内部站双开的页面：公开构建里本来就有同名页
  [ "$slug" = "gamut-volume" ] && continue
  for prefix in "public/tools" "public/en/tools"; do
    if [ -f "$prefix/$slug/index.html" ]; then
      err "公开构建里出现内部页明文：$prefix/$slug/index.html"
    fi
  done
done

# 4) 公开构建不得包含本地扩展或其内部函数名
if [ -d public/js/local ]; then
  err "public/js/local 存在"
fi
if grep -rIlq -e 'lmsToEab' -e 'volume-ext' public 2>/dev/null; then
  err "公开构建里含本地扩展标识（lmsToEab / volume-ext）"
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ 公开边界检查通过"
fi
exit "$fail"
