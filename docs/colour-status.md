# 色彩空间数据库 · 状态快照

更新于 2026-11-06（含图表前置的改版）。用于快速恢复上下文；规范见 [colour-method.md](colour-method.md)，后续计划见 [colour-next-steps.md](colour-next-steps.md)。

## 站点

- 仓库：`/Users/gaohuyuchen/Documents/ultrablur.github.io`，Hugo 0.162.1 extended，主题 `themes/sam`
- 页面：`/colour/`（索引）、`/colour/<slug>/`（条目）
- 布局覆盖：`layouts/colour/{single,list}.html`、`layouts/partials/colour-{nav,figure,sources}.html`、`layouts/shortcodes/colour-chart.html`
- 资源：`assets/css/colour.css`、`assets/js/colour.js`（图表）、`colour-locus.js`（光谱轨迹）
- 数据：`data/colourspaces.yaml`（目录）、`data/curves.json`（曲线采样）、`data/anchors.json`（锚点 + 函数原文）
- 构建：68 页，0 warning

## 内容

47 个条目，两分类：

- **Scene Referred 38**：相机 27（Apple 2、OPPO 2、ARRI 2、Blackmagic 1、Canon 6、DJI 1、FUJIFILM 3、Nikon 1、Panasonic 1、RED 2、Sony 6）+ 胶片 4（ADX10、ADX16、FilmLight Generic Negative、FilmLight Academy PD Log）+ ACES 4 + 工作空间 3
- **Display Referred 9**：sRGB、Rec.709、Rec.2020、ST.2084、HLG、P3-DCI、P3-D65、Adobe RGB、CINITY Log

**条目页顺序**（2026-11-06 调整）：图表在前，坐标表在后——

1. 一句话描述（`intro`，13 条有）
2. 色域图 + 第二张图（DR 为 EOTF，SR 为编码曲线）
3. 原色与白点表
4. 备注（`gamutNote` / `whiteNote`）
5. 传递函数（曲线名、黑/白点、三个锚点）
6. 编码 / 解码函数原文
7. RGB → XYZ 矩阵
8. 来源

所有条目现在都由模板生成（`arri-logc4` 已从手写正文改为 front matter）；两页 Log C 的结构与其余条目一致。

## 关键实现

- 图表零依赖：Canvas 画光谱色，SVG 画轴 / 三角形 / 曲线；色域图坐标范围按原色自适应，避免宽色域被裁
- 曲线来源：`.flspace` 的 `convertFromLinear` 经 Node 转译后采样（−8…+12 档，161 点）；无 `.flspace` 的按厂商文档 / CTL 手写
- 验收值：sRGB 0.4614、LogC3 0.3910、S-Log 0.3846、V-Log 0.4233、F-Log 0.4593、Apple Log 0.4883
- EOTF 图（仅 DR）：7 种传递函数 × 归一化 / 量化码值 × 8/10/12-bit × Full / Legal / SMPTE 范围，可调满量程白与黑位，可切对数纵轴

## 来源

**35 / 47** 有来源，全部一手文档并逐条 curl 复验（Canon 403 经浏览器确认返回 PDF）。

未收录的 12 条：Canon P3+ ×2（401 登录库）、Blackmagic Gen 5、REDcolor 2 / REDlog Film、Sony S-Log2、Sony Venice ×2、FilmLight E-Gamut / E-Gamut 2、FilmLight Generic Negative、FilmLight Academy PD Log、CINITY Log（均无公开规范）。

## 待办

- `.flspace` 库已盘点：137 个文件，23 个在用、114 个未用，明细见 [colour-flspace-inventory.md](colour-flspace-inventory.md)；其中 13 个条目其实是拿 `.flspace` 做的，但没记 `sourceSpace`
- 「参考白 X%」已分析：三种口径混杂，决定不写进页面（详见 colour-flspace-notes.md 第 1 节）
- `gamutNote` 是否保留：现存 7 条都是「原色与某标准一致」类表述，待用户确认是留还是整段去掉
- 手机厂 Log：vivo、小米未挖到官方白皮书；Samsung / GoPro / Insta360 只有菜单级说明
- DJI D-Log M（运动相机）可能另有白皮书
- CINITY 同族变体（P3-D65 110、XYZ 120）可再补，其余亮度变体不建议铺开
- EOTF 图控件已按「传递函数 / 亮度 / 横轴」三组分开，窄屏下每组各占一行，不再挤成一排
- EOTF 图的七个选项里没有 HLG 与 Cinity Log 本体：HLG 页默认 sRGB、CINITY 页默认 Gamma 2.2，目前把这张图当作显示传递函数的对照图用，需确认是否补上本体曲线
- 下一阶段三项功能见 colour-next-steps.md（三维色体积、空间比对、换算器）

## 常用命令

```bash
hugo --gc --minify --destination .tmp/build   # 生产构建，看退出码
hugo server --bind 127.0.0.1 --port 1313      # 本地预览（渲染到 public/）
```

删条目后记得清 `public/colour/<slug>/`，否则 dev server 仍能访问旧页。
