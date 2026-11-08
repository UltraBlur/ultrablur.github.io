# 工具站规划

## 1. 定位

| 分区 | 中文 | 英文 | 内容 |
| --- | --- | --- | --- |
| `/colour/` | RGB 色彩空间数据库 | RGB colour space reference | 每个空间的原始数据：原色、白点、矩阵、传递函数、锚点、来源 |
| `/tools/` | 工具 | tools | 交互工具，每个工具一个页面、一个独立模块 |

`/colour/` 不再放交互式可视化，只保留静态图（xy 三角形、编码曲线、EOTF）与数据表。

## 2. 目录

```text
/colour/                数据库首页（原目录页）
/colour/<slug>/         单空间页（现状不变）
/tools/                 工具索引
/tools/gamut-volume/    色体积（现有原型迁入）
/tools/compare/         空间比对（计划）
/tools/convert/         码值换算
/tools/inspector/       取色读数（计划）
/tools/delta-e/         色差（计划）
```

菜单从 `posts / gallery / colour / archive` 变为 `posts / gallery / colour / tools / archive`。

## 2.1 列条目的规则

只列**定义了原色的色域**；传递函数不单列。PQ（ST 2084）与 HLG 的原色借自 BT.2020，线性光下与 Rec.2020 是同一个体，因此不作为独立条目。

## 3. 模块

| 模块 | 状态 | 范围 | 依赖 |
| --- | --- | --- | --- |
| 色体积 | 已迁入 `/tools/gamut-volume/` | 7 个色域 × 8 个坐标，旋转/缩放/归一化/坐标轴 | 已有 |
| 空间比对 | 未开始 | 2–3 个空间叠 xy 三角形、叠编码曲线、面积/体积比 | 2D 图表抽象 |
| 码值换算 | 完成 | 两端各自色域 / 传递函数 / 码值范围；整数 Full 与 Video；场景与显示之间的标定单独开关 | 数据 + 内核 |
| 取色读数 | 未开始 | 输入色值，输出各空间坐标，标出是否越界 | 数据 + 模型 |
| 色差 | 未开始 | CIE76/94/2000、ΔE ITP、ΔE Jz | 模型 |
| 曲线工具 | 未开始 | 自定义 EOTF 参数并与内置曲线对比 | 2D 图表 |

## 4. 共享基础设施

现在有两个页面各自带一套图表代码，工具化后重复会失控，先抽公共层：

```text
assets/js/lib/colour-data.js    目录 + 矩阵 + 白点（从 front matter 生成一份 JSON）
assets/js/lib/colour-models.js  Lab/Luv/Oklab/CAM02/ICtCp/JzAzBz（已有）
assets/js/lib/chart2d.js        xy 图、曲线图、EOTF 图
assets/js/lib/viewer3d.js       色体积渲染器（从 colour-volume.js 拆出）
```

数据来源统一：构建时由 Hugo 从 `content/colour/*/index.md` 生成 `data/spaces.json`，工具页只读这份 JSON，不再 `site.GetPage` 取参数。

## 4.1 进度

| 步骤 | 状态 |
| --- | --- |
| 1 抽数据层 | 完成：`layouts/partials/tool-spaces.html`，返回色域清单（slug / title / primaries / white / matrix），色体积页已改为调用它 |
| 2 迁页 | 完成：`/tools/gamut-volume/` |
| 3 抽 chart2d | 部分完成：`assets/js/chart2d.js` 提供比例/网格/轨迹/三角形图元，比对页已改用它；单空间页仍走 `colour.js` |
| 4.1 比对 | 完成：色域任选两个，CIE 1931 轨迹背景、面积与交集；正式环境 40 个色域（施工中条目不计入） |
| 4.2 码值换算 | 完成：`/tools/convert/`，内核在 `assets/js/lib/colour-codec.js`，自检 `tests/colour-codec.test.mjs`；场景→显示未标定时阻断，HLG 只允许 BT.2020，采样曲线标为近似 |
| 4.3 取色工具 | 完成：HSV / LCH / OKLCH / JMH / JzCH 五种选色平面（含色相滑杆与十六进制输入），右侧同时给出五种模型的坐标；越界区域显示为灰 |
| 4.4 色差 | 已删除：色差工具与 `tool-deltae.js` 一并移除，输入模块完善后再做 |

| 5 工具索引 | 完成：`/tools/` 列出五个工具与一句话说明（中英） |

## 5. 顺序

1. 抽 `colour-data.js`，色体积改用同一份数据
2. 迁移页面到 `/tools/gamut-volume/`，`/colour/` 去掉三维入口
3. 抽 `chart2d.js`，单空间页与比对页共用
4. 比对 → 换算器 → 取色读数 → 色差

## 6. 待定

- `/colour/` 的中英文命名是否采用上表
- 工具是否需要 URL 状态（可分享的视角/参数）
- 色体积是否只保留显示空间，还是加 ACEScg / AWG4 / DWG 三个代表空间
