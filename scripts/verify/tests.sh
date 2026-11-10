#!/usr/bin/env bash
# 公开测试入口：只跑依赖全部在公开仓库里的套件。
# 缺依赖的套件打印「跳过」而不是失败，这样公开分支在没有内部数据时也能绿；
# 发布边界检查（scripts/verify/public-boundary.sh）另跑。
set -euo pipefail
cd "$(dirname "$0")/../.."

skipped=0
run() {
  local name=$1; shift
  if [ ! -f "tests/$name.test.mjs" ]; then
    echo "– 跳过 ${name}：测试文件不在公开分支"
    skipped=$((skipped + 1))
    return 0
  fi
  local dep
  for dep in "$@"; do
    if [ ! -e "$dep" ]; then
      echo "– 跳过 ${name}：缺少公开依赖 ${dep}"
      skipped=$((skipped + 1))
      return 0
    fi
  done
  echo "== ${name}"
  node "tests/$name.test.mjs"
}

run colour-codec      data/curves.json assets/js/lib/colour-codec.js
run pointer-gamut     data/pointerGamut.json assets/js/lib/geom2d.js
run colour-appearance assets/js/colour-models.js
run aces-jmh          assets/js/lib/aces-jmh.js
run volume-geometry   assets/js/colour-volume-geom.js assets/js/colour-models.js assets/js/lib/aces-jmh.js data/pointerGamut.json
run local-exclude

if [ "$skipped" -gt 0 ]; then
  echo "（${skipped} 个套件因缺少公开依赖被跳过）"
fi
