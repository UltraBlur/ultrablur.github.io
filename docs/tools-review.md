# 验收清单

## 页面

| URL | 检查点 |
| --- | --- |
| `/tools/` | 五个工具条目，中英各一份 |
| `/tools/gamut-volume/` | WebGL 画布渲染；空间 6 项、坐标 8 项；纵轴 0–1 |
| `/tools/compare/` | 光谱轨迹背景 + 两个三角形；正式环境 40 个色域（施工中条目不计入） |
| `/tools/transfer/` | OETF / EOTF 切换；5 种纵轴；正式环境 39 条曲线 |
| `/tools/inspector/` | `#FF0000` → Lab 53.24 / 80.09 / 67.20 |
| `/colour/` | 只保留数据页，44 条目录，无三维入口 |
| `/colour/tf-srgb/` | 只有传递函数曲线，不画色域 |
| `/colour/primaries-p3-d65/` | 只有 xy 色域图，不画曲线 |

## 施工中的条目

胶片一组（ADX10、ADX16、FilmLight Cineon PD Log、FilmLight Academy PD Log）标记 `wip`：

- `HUGO_ENVIRONMENT=development`（本地 `hugo server`）照常显示正文，工具里也照常可选；
- 正式构建只留「施工中」提示，并从比对 / 传递函数工具的数据里剔除。

## 本地运行

```bash
hugo server --bind 127.0.0.1 --port 1313 --disableFastRender
```

新增静态资源后 dev server 可能返回 500（minify 空指针），重启即可；`hugo` 静态构建不受影响。

## 本轮做了什么

- 显示空间拆成「原色」与「传递函数」两组：原色页只画 xy 色域，传递函数页只画曲线 / EOTF
- 旧页面 `/colour/{srgb,rec709,rec2020,p3-d65,p3-dci,adobe-rgb}/` 删除，保留 `aliases` 重定向到拆分后的新页
- 新增工具：色域比对、传递函数比对、取色读数；色体积从 `/colour/volume/` 迁到 `/tools/gamut-volume/`（旧地址保留别名）
- 新增 `layouts/partials/tool-spaces.html`（唯一色域清单）与 `assets/js/chart2d.js`（xy 图元）
- 色域清单排除 PQ / HLG（传递函数，原色借自 BT.2020）

## 已知未做

- 单空间页仍用 `colour.js` 画图，未切到 chart2d
- 所有工具不做白点适应
- 色体积的坐标轴刻度与色体在个别视角下对不齐（未查明）
