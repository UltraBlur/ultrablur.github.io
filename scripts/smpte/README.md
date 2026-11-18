# SMPTE 文档检索：本地构建

## 前置

- Python 3.10+，安装 `pymupdf`
- Node.js 20+（脚本会调用 `npx pagefind`）
- Tesseract 5（仅扫描件 OCR 用；`brew install tesseract`，需要 `eng` 语言包）
- 本地文档镜像：默认 `~/Downloads/SMPTE standards document 202606`，可用 `SMPTE_SOURCE` 覆盖

```bash
python3 -m venv .cache/smpte-venv
.cache/smpte-venv/bin/pip install pymupdf
```

## 构建

```bash
# 1. 抓取/刷新官网快照（写入 .cache/smpte/official；可选，已缓存）
.cache/smpte-venv/bin/python scripts/smpte/crawl_official.py
#    只抓元数据页（标题/状态/版本），不抓正文；6 并发约 1 分钟

# 2. 构建数据与 Pagefind 索引
SMPTE_SOURCE="$HOME/Downloads/SMPTE standards document 202606" \
  .cache/smpte-venv/bin/python scripts/smpte/build.py

# 3. 构建静态预览（避开 hugo server 与其它实例共享 resources/_gen 的冲突）
hugo --quiet --baseURL "http://127.0.0.1:1313/" --destination .tmp/smpte-preview
python3 -m http.server 1313 --directory .tmp/smpte-preview
# 打开 http://127.0.0.1:1313/tools/smpte/
```

构建产物（均不包含 PDF 本体）：

```
static/smpte/data/families.json     905 条
static/smpte/data/variants.json     1,234 条
static/smpte/data/keywords.json     440 条（受控 115 + 定义 202 + 缩略语 123）
static/smpte/data/facets.json
static/smpte/data/official.json     官网快照
static/smpte/doc/<id>.json          905 个详情
static/smpte/pagefind/              Pagefind 索引（1,234 个元数据页，约 1.2 MB）
.cache/smpte/ocr/                   扫描件 OCR 缓存（按 PDF SHA-1）
```

## 说明

- `scripts/smpte/taxonomy.json` 是受控词表（115 条）；`scripts/smpte/overrides.json` 存放少量人工 Scope 与长尾关键词补全。
- 当前关键词覆盖：905/905（100%）均有 ≥3 个关键词；0 篇空 Scope、0 篇 `other` 分类（少量长尾文档使用 `overrides.json` 人工补词）。
- Pagefind 只索引标题、编号、Scope 与关键词，**不索引标准正文**；页面只发布元数据与摘要。
- 检索范围：编号、标题、Scope、关键词；不提供正文/条款全文检索。
- 本地 PDF/HTML 只用于构建期抽取 Scope、定义、大纲与关键词，不对外提供。
- 每条结果指向 `pub.smpte.org` 的官方版本页；本页不托管 PDF。
- 官网快照包含标题、状态（active / stabilized / withdrawn）、版本与修正案；同步记录见 `docs/smpte-summary.md`。
- 图片型 PDF 会被自动 OCR（Tesseract `eng`，300 dpi，4 线程），结果按 SHA-1 缓存；当前 12 个版本、241 页已 OCR，详情页显示 `OCR` 徽章。
