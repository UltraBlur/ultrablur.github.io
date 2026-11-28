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
run tool-state        assets/js/lib/tool-state.js
run custom-gamut      assets/js/lib/custom-gamut.js assets/js/lib/geom2d.js assets/js/colour-volume-geom.js
run cat               assets/js/lib/cat.js
run pointer-gamut     data/pointerGamut.json assets/js/lib/geom2d.js
run colour-appearance assets/js/colour-models.js
run models-munsell data/munsellRenotation.json assets/js/lib/munsell.js
run models-expansion assets/js/colour-models.js
run aces-jmh          assets/js/lib/aces-jmh.js
run colour-polar      assets/js/colour-polar.js assets/js/lib/aces-jmh.js
run colour-wheel      assets/js/colour-wheel-geom.js assets/js/colour-polar.js assets/js/lib/aces-jmh.js
run inspector-space   assets/js/lib/colour-codec.js assets/js/colour-polar.js assets/js/colour-wheel-geom.js assets/js/lib/aces-jmh.js data/curves.json content/colour/primaries-srgb-rec709/index.md
run aces13            assets/js/lib/aces13.js data/aces13.json tests/fixtures/aces13-cases.json
run eotf-options      layouts/partials/colour-figure.html assets/js/colour.js content/colour/tf-power/index.md
run volume-geometry   assets/js/colour-volume-geom.js assets/js/colour-models.js assets/js/lib/aces-jmh.js data/pointerGamut.json
run volume-multi      assets/js/colour-volume-geom.js assets/js/colour-models.js assets/js/lib/aces-jmh.js
run volume-ui         assets/js/colour-volume.js assets/js/colour-volume-geom.js assets/js/colour-models.js assets/js/lib/aces-jmh.js assets/js/lib/tool-state.js
run local-exclude
run fusion-single-node data/davinci-fusion-single-node.json static/data/davinci-fusion-single-node.json
run fusion-model assets/js/lib/fusion-single.js data/davinci-fusion-single-node.json
run fusion-coverage assets/js/lib/fusion-single.js data/davinci-fusion-single-node.json

echo "== sync"
node scripts/verify/sync_check.mjs

if [ "$skipped" -gt 0 ]; then
  echo "（${skipped} 个套件因缺少公开依赖被跳过）"
fi
