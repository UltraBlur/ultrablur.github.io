# 色彩空间数据库 · 工作规范

本版据 2026-11-06 当日最终状态修订，取代之前的版本。这份文件规定「页面写什么、数据从哪来、什么算合格」；新增或修改条目一律照此执行。

配套文件：[colour-status.md](colour-status.md)（当前状态）、[colour-next-steps.md](colour-next-steps.md)（下一阶段功能）。

---

## 0. 三条硬规则

1. **页面上不写「我组织的语言」。** 没有出处的话不上页面：不写导语、不写「该空间在业界广泛使用」这类总结句，不用营销词。拿不准的句子删掉，不要改成模糊表述。
2. **宁缺毋滥。** 找不到一手文档就不显示「来源」小节，让页面缺一块，也不凑二手链接。
3. **一手文档才算来源。** 厂商白皮书 / 规格书、标准组织、官方 CTL/DCTL 算；Antler Post、FilmLight `.flspace`、colour-science、GitHub 镜像、博客、论坛、百科都不算。

`.flspace` 只用于**推导数值**（曲线采样、矩阵、锚点），属于数据来源而非引用来源——它不出现在任何页面的「来源」里，只在 `sourceSpace` 字段里留痕。

---

## 1. 页面写什么

### 1.1 只写事实

页面承载的东西必须能对着文档逐条核对：名称、原色与白点坐标、传递函数参数、编解码函数、矩阵、出处。

**不上页面**：

- 导语、总结段、「适合用于……的场景」这类建议
- 历史沿革、厂商产品线介绍
- 「出色」「强大」「专为……打造」一类词
- 任何由我组织、无法落到某份文档某句话上的解释

能靠表格或图表达的，一律不进正文。47 个条目现在**全部由模板生成**，没有手写正文页；需要补充的说明用 `intro` / `*Note` 字段，需要整块内容的用可选 partial（如 `eiTable`）。

### 1.2 写法约定

| 项 | 约定 |
| --- | --- |
| 标题 | `色域 / 传递函数`：`ARRI Wide Gamut 4 / LogC4`、`OPPO O-Log 2 / O-Gamut` |
| 行文 | 中文，专有名词保留原文 |
| 术语 | 原色（primaries）、传递函数（transfer function）、码值（code value）、档（stops） |
| 白点 | `D65` / `D60` / `DCI`，不加修饰语 |
| 亮度单位 | `cd/m²`，全文不用「nits」 |
| 精度 | xy 四位小数；矩阵十二位小数；锚点按原文档有效位 |
| 负坐标 | 保留负号，不取整成 0（如 ARRI Blue 的 `−0.0308`） |

---

## 2. 数据结构

一个条目 = 一个 leaf bundle：`content/colour/<slug>/index.md`。

### 2.1 front matter 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 见 1.2 的标题格式 |
| `date` / `draft` | 是 | `draft` 目前全为 `false` |
| `category` | 是 | `Scene Referred` / `Display Referred`，决定画哪种第二张图 |
| `primaries` | 色域条目必填 | `[[x,y],[x,y],[x,y]]`，R / G / B 顺序 |
| `whitePoint` | 同上 | `[x, y]` |
| `whiteName` | 同上 | 显示为表格行名 `White (D65)` |
| `matrix` | 建议 | RGB → XYZ，三行 |
| `eotfDefault` | DR 建议 | EOTF 图初始选中的传递函数，取值见 §6 |
| `gamutNote` | 可选 | 一句可核对的事实备注（如「原色与 ITU-R BT.2020 一致」），7 条在用 |
| `whiteNote` | 可选 | 白点备注，2 条在用 |
| `transferNote` | 可选 | 模板已支持，目前无人使用 |
| `sourceSpace` | 可选 | 记录数值取自哪个 `.flspace` 文件，仅作溯源，不上页面，26 条在用 |
| `intro` | 可选 | 标题下的一句话定性描述（这是什么空间、用来干什么），14 条在用 |
| `eiTable` | 可选 | 置 `true` 时在传递函数后插入 Log C 的 EI 参数表，仅 `arri-logc3` 在用 |
| `matrixInverse` | 可选 | XYZ → RGB 反矩阵，渲染在 RGB → XYZ 之后，仅 `arri-logc4` 在用 |
| `sources` | 可选 | `[{ title, url }]`，渲染为页尾「来源」小节；没有就不渲染 |

备注类字段（`gamutNote` / `whiteNote` / `transferNote`）只允许陈述**可核对的关系**，不写推断。

### 2.2 三个全局数据文件

| 文件 | 作用 |
| --- | --- |
| `data/colourspaces.yaml` | 目录：两个分组（Scene Referred / Display Referred）、子组（`camera` / `film` / `aces` / `working`）、顺序、DR 的 `transfer` 标签；索引页与侧栏共用 |
| `data/curves.json` | 每条曲线的 161 个采样点（−8…+12 档，`L = 0.18 × 2^stops`） |
| `data/anchors.json` | 曲线名 `tf`、黑/白点、三个锚点 `e0`/`e18`/`e1`、编解码函数原文 `fromLin`/`toLin` |

三个文件都以 slug 为键，47 条一一对应。

`anchors.json` 里的数值存成**预格式化字符串**——Hugo 的 `with` 把 `0` 判为假，直接存 float 会让 `0.0000` 那一行消失。

**已知隐患**：`colourspaces.yaml` 里也抄了一份 `primaries` / `whiteName`，当前模板不读它（为将来比对页预留）。两处不一致不会报错，以条目 front matter 为准。

### 2.3 例外

- 目前没有条目使用手写正文（`.Content`）；若将来要用，模板不再生成数据表，正文需自己保证「图表在前、坐标表在后」。
- `filmlight-generic-negative` 没有原色（反解出的绿原色远在光谱轨迹外），只有曲线图和矩阵，图号从 1 起算；`gamutNote` / `whiteNote` / `transferNote` 不依赖原色，没有原色时照常显示。

---

## 3. 页面结构

模板生成的条目页顺序固定：

1. 面包屑 + 标题
2. `intro`（有则显示）：一句话说明这个空间是什么
3. 图：色域图（有原色时）+ 第二张图（DR 用 EOTF 图，SR 用编码曲线图）
4. 原色与白点表（R / G / B / White）
5. `gamutNote` / `whiteNote` / `transferNote`（有则显示，不依赖原色）
6. **传递函数**：曲线名、黑/白点（10-bit 码值）、三个锚点
7. **编码 / 解码**：`convertFromLinear`、`convertToLinear` 原文
8. **RGB → XYZ 矩阵**
9. **来源**

图表放在坐标表之前，是因为图是页面的主体，表格是它的读数备份。

---

## 4. 数值怎么来

### 4.1 曲线：优先从 `.flspace` 转译

FilmLight 色彩空间库的 `.flspace` 里有 `convertFromLinear` / `convertToLinear`，是这些空间的实现定义。`.tmp/gen-curves2.js` 把 GLSL 转成 JS 后执行——那是一次性脚本，规则记在这里：

- `vec3/vec4 X = expr` → 逐分量变量（`X_r = X_g = X_b = expr`），避免三次赋值互相污染
- `val.rgb` / `val.r` → `x`
- `mat3(...)` 按行和为 1 处理（灰输入下矩阵退化为标量）
- `pow / log / exp / max / min / abs / sign / clamp / mix / log2` → `Math.*`
- 按 −8…+12 档、`L = 0.18 × 2^stops` 采样 161 点

**验证**：拿已知值对表，误差超过 1e-4 就是转译错了。

| 空间 | E(18%) 期望 |
| --- | --- |
| sRGB | 0.4614 |
| ARRI LogC3 | 0.3910 |
| Sony S-Log | 0.3846 |
| Panasonic V-Log | 0.4233 |
| FUJIFILM F-Log | 0.4593 |
| Apple Log | 0.4883 |

### 4.2 曲线：没有 `.flspace` 的按官方文档手写

- Apple Log 2：0% → 0.150477、18% → 0.488272、90% → 0.681686
- OPPO O-Log：0 → 0.0631271、0.18 → 0.3895463

手写后同样用文档给出的参考值复核。

### 4.3 矩阵约定

站点统一写成 **`XYZ = M · RGB`**（三行 X/Y/Z，三列 R/G/B，左乘）。

`.flspace` 的 `RGB_XYZ` 是**列主序**的展平数组；按行读会得到转置矩阵——这是最容易出错的一步。

### 4.4 已知的坑

- 一些 `.flspace`（Canon、部分 Sony）存的是 **ACES IDT 矩阵**（RGB → AP0），不能拿来反推白点；这类条目改用厂商公布的原色。
- Canon 文件里的 `D55` / `T` 是**拍摄白平衡**，色彩空间白点仍是 D65。
- Canon P3+ 的两个文件矩阵反解不出合理白点，原色改用 P3-D65。
- CINITY 的 `WhitePoint = 1024`（其余多为 1023），照文件写，不做归一。

---

## 5. 来源

### 5.1 什么算、什么不算

**算**：厂商白皮书 / 规格书、ITU / SMPTE / IEC / ICC / DCI 标准、官方 CTL/DCTL。

**不算**：Antler Post、FilmLight `.flspace`、colour-science、GitHub 镜像、博客、论坛、百度百科、小红书。

### 5.2 核验流程

1. `curl -sIL -A "<桌面 UA>"` 看 HTTP 状态。
2. 200 → 采用。
3. 403 且该站全站拦爬虫 → 用真实浏览器打开，确认 `document.contentType === "application/pdf"` 之后才采用（Canon 属于此类）。
4. 401 / 404 / 需登录 → 不用。
5. 查不到就不写，页面不出现「来源」小节。

改完来源链接要重新跑一遍，不能沿用上次的结论。

### 5.3 当前覆盖

**35 / 47** 有「来源」。没有的 12 条及原因：

| 条目 | 原因 |
| --- | --- |
| Canon P3+ / Log 1、Log 2 | 唯一文档在 Canon 登录后的支持库（401） |
| Blackmagic Film Gen 5 | 厂商从未发布技术文档 |
| REDcolor 2 / REDlog Film | RED 从未发布规范 |
| Sony S-Log2 | 无独立文档 |
| Sony Venice ×2 | 官方摘要定义的是 S-Gamut3，与 Venice 原色不同 |
| FilmLight E-Gamut / E-Gamut 2 | 规范需登录；E-Gamut 2 无任何公开资料 |
| FilmLight Generic Negative、Academy PD Log | 仅见于 `.flspace` |
| CINITY Log | 无公开规范，数据仅来自 `.flspace` |

`arri-logc4` 的来源写在正文里（`## 来源`），不走 `sources` 字段。

---

## 6. 图表

- **零依赖**：Canvas 画光谱色，SVG 画坐标轴 / 三角形 / 曲线，不引第三方库。
- **色域图**：坐标范围按「原色 ∪ 光谱轨迹」自适应，避免宽色域（Canon G=1.14、RED G=1.49）被裁；图必须保持 xy 比例，即正方形。
- **曲线图**：直接用 `data/curves.json` 的采样点，不在前端重算。
- **EOTF 图**：横轴可切归一化码值与量化码值，纵轴为亮度（cd/m²，可切对数）。控件：传递函数、满量程白、黑位、对数纵轴、横轴、位深、范围。

EOTF 图的传递函数选项与量化范围：

| 选项 | 值 |
| --- | --- |
| 传递函数 | `srgb`、`gamma22`、`gamma24`、`gamma26`、`gamma1961`、`bt1886`、`pq` |
| 位深 | 8 / 10 / 12 |
| Full | 0–255、0–1023、0–4095 |
| Legal | 16–235、64–940、256–3760 |
| SMPTE | 1–254、4–1019、16–4079 |

- **尺寸**：单图最大宽 430px（EOTF 因控件较多放到 560px）；桌面两张并排，窄屏堆叠。
- **交互**：悬停读数；不依赖 hover 也能从表格拿到全部数值。

---

## 7. 验收清单

每次改动后逐条过：

1. `hugo --gc --minify` 退出码 0、无 warning。
2. 1280 宽与 390 宽都无横向溢出（`document.documentElement.scrollWidth <= innerWidth`）。
3. 控制台无报错；色域图有 `.c-gamut-tri`，曲线/EOTF 图有 `.c-curve`。
4. 页面顺序符合 §3：`.c-figs` 在坐标表之前。
5. 新增或修改的来源链接全部复验。
6. 删除条目时同时清理 `public/colour/<slug>/`。
7. 新条目在索引页和侧栏都出现，子组标签正确。
8. DR 条目的 `eotfDefault` 是合法值。
9. 非 colour 页面（首页、posts）不受白底样式影响。

---

## 8. 已更正的口径（勿回退）

- **REDlog Film 属于数字摄影机编码**（REDcolor 2 的传递函数），不是胶片空间。胶片组放的是密度域编码：ADX10、ADX16 与 FilmLight 的两个 PD Log。
- **Display P3**：显示端按 Gamma 2.2，编码侧按 ICC 注册表用 sRGB 分段。原先解释 Apple 显示校准的段落查不到出处，已删。
- **sRGB / Adobe RGB 的 `whiteNote`** 只保留可直接核对的两句（IEC 规定 D65；ICC 连接空间用 D50），不再展开。
- **`gamutNote`** 只写「原色与某标准一致」这类可核对关系。

---

## 9. 本地工作流

```bash
hugo --gc --minify --destination .tmp/build          # 生产构建，看退出码
hugo server --bind 127.0.0.1 --port 1313 --disableFastRender   # 本地预览
```

- 构建卡住多半是 `.hugo_build.lock` 被上次的 dev server 占着：杀掉进程后 `rm -f .hugo_build.lock`。
- dev server 渲染到 `public/` 且**从不删旧文件**，删条目后旧页仍可访问，必须手动 `rm -rf public/colour/<slug>/`。
- 截图时 `position: sticky` 的侧栏会错位，用视口截图或先滚动到位，不要用整页截图。
- 浏览器自动化：该 facade 没有 `page.select` / `page.setViewportSize`，改下拉框要设值后手动派发 `change`，改视口用 CDP 的 `Emulation.setDeviceMetricsOverride`。
