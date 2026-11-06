# `.flspace` 描述摘录

从各文件 `Help` 字段与 `//` 注释里摘出来的**原文陈述**，供判断是否写进页面。英文保留原话，中文只做转述。

两条前提先说清楚：

1. `.flspace` **不是可引用来源**，文件里的说法要上页面，仍得按现行来源标准判断（多半只能以「无来源」的形式出现）。
2. 下面所有内容都只是「文件这么写」，不等于「厂商规范这么写」。有些是 FilmLight 自己的实现约定。

**覆盖范围**：47 个条目里 44 个能对上 `.flspace`；Apple Log 2、OPPO O-Log、OPPO O-Log 2 三条没有对应文件（数据直接来自白皮书），本文件不涉及。

---

## 1. 「参考白 X%」的口径分析

多数 Help 里有一句 `Reference white at X%`。把它和两个可复算的量并排看——`encode(线性 1.0)` 与 `WhitePoint / 1023`：

| 空间 | 文件写 | encode(1.0) × 100 | 与前者之差 |
| --- | ---: | ---: | ---: |
| ARRI LogC4 | 42.8 | 42.75 | +0.05 |
| ARRI LogC3 | **67** | 57.06 | **+9.94** |
| REDlog Film | 67 | 66.96 | +0.04 |
| Sony S-Log | 64 | 63.79 | +0.21 |
| Sony S-Log2 | 59 | 58.45 | +0.55 |
| Sony S-Log3 | 60 | 59.60 | +0.40 |
| Panasonic V-Log | 59 | 59.91 | −0.91 |
| BMD Film Gen5 | 53 | 53.05 | −0.05 |
| ADX10 / ADX16 | 63 | 63.46 | −0.46 |
| FilmLight CPD | **68.5** | 66.96 | +1.54 |
| FilmLight PD Log | **63** | 70.21 | **−7.21** |

**十一个空间里，八个的 `X%` 就是 `encode(线性 1.0)`**（误差 ±1 个点以内）。剩下三个各自不同：

- **ARRI LogC3**：文件写 67%，自身的曲线是 57.1%，`WhitePoint` 字段 584（= 0.5706 × 1023）也是 57.1%。67% 恰好是 Cineon 系（REDlog Film、CPD）的数值，疑似从那里带过来的。
- **FilmLight CPD**：68.5% = 685 / 1000，也就是 Cineon 的参考白码值 685（用 0–1000 计），不是它自己曲线的 67%。
- **FilmLight PD Log**：63% 是 ADX 的参考白，不是它自己曲线的 70.2%。

### 已确认：LogC3 的 67% 是笔误

同库另有一个 ARRI 文件 `ARRI_LogC_FG_full.flspace`（LogC3 + ARRI Film Gamut）：

| | `ARRI_LogC_WG_full` | `ARRI_LogC_FG_full` |
| --- | --- | --- |
| `WhitePoint` | 584 | 584 |
| 曲线常数 | `0.0106232 / 5.3676533 / 0.0926363 / 0.5696259 / 0.1073531 / 0.00937677` | 完全相同 |
| 转译后 161 点曲线 | — | **逐点相同** |
| `e0 / e18 / e1` | 0.0926 / 0.3910 / 0.5706 | 0.0926 / 0.3910 / 0.5706 |
| Help | Reference white at **67%** | Reference white at **57%** |

同一条曲线、同一个白点，一个写 67%、一个写 57%。`e1 = 0.5706` = 57.06%，`584 / 1023` = 57.09%，且与 LogC4 的口径一致（42.8% ↔ 42.75%）。加上 EI 扫过 160–1600 也到不了 67%（见下），结论是 **67% 系 57% 的笔误**；67% 恰好是 Cineon 系（REDlog Film、Legacy_Log）的数值，疑为复制粘贴。

**处理**：本地副本 `.tmp/colourspaces/ARRI_LogC_WG_full.flspace` 第 8 行已改为 57% 并加注释，原文件备份为 `.tmp/ARRI_LogC_WG_full.flspace.orig`。该字段不参与任何解析，站点数值不受影响。另两处 67%（`Legacy_Log`、`Red_Col2_LogFilm`）属于 Cineon 曲线，`encode(1.0)=0.670`，是正确的，保留。

> 附：LUTCalc（`cameramanben.github.io/LUTCalc`）的主程序里 ARRI LogC 把 18% 灰锚在 400/1023，但没有公开「参考白 %」这个量，无法作为直接佐证，只与 0.391 的锚点一致。

### EI 能不能解释 LogC3 的 67%？不能

ARRI 白皮书确认 Log C V3 是**一组按 EI 划分的曲线**，但那影响的是高光上限与趾部，不是 1.0 的位置。用附录的曝光值参数算：

| EI | encode(0.18) | encode(1.0) | 饱和时编码 |
| ---: | ---: | ---: | ---: |
| 160 | 0.3910 | 0.5840 | 0.8128 |
| 400 | 0.3910 | 0.5764 | 0.8968 |
| 800 | 0.3910 | 0.5706 | 0.9539 |
| 1600 | 0.3910 | 0.5649 | 1.0000 |

`encode(1.0)` 全程只在 0.565–0.584（56.5–58.4%）之间移动，**任何 EI 都到不了 67%**。18% 灰则恒定在 0.391。

所以 67% 不是 EI 造成的，就是一个错值。真正属于 LogC3 的 EI 特性另有其事：EI 决定高光上限（0.813 → 1.000），这个已经写进页面（见第 8 节）。

### 结论

不引入「参考白 X%」这一行。页面已有「线性 1.0 → 编码」与「黑点 / 白点（10-bit 码值）」，两者都有定义、可复算；`X%` 至少混了三种口径（`encode(1.0)`、Cineon 685/1000、ADX 63%），写上去只会制造矛盾。

---

## 2. 位深与量化限制

> **ARRI LogC4**（`ARRI_LogC4_AWG4`）
> "The ARRI LogC4 Curve function was designed for 12bpc (bits per channel) encoding as its minimum quantization threshold, **10bpc ARRI LogC4 encoded images should not be used**."

这是唯一一条明确说「别在某些位深用我」的说明，页面上没有。

> **FilmLight T-Log**（`FilmLight_TLog_EGamut`、`_EGamut2`，写在注释里）
> "Clip so output fits half float limit"

> **ST 2084**（`Rec2084_Rec2020`）
> "Scaled so 1.0 (Linear Light) match **100 nits** … Mastering Colour Space **clips at 1000 nits**"

这三条都在讲量化/范围，属于「不写会误用」的类型。

---

## 3. 显示参考亮度

DR 条目的 Help 普遍带白点亮度，页面目前只有色域和传递函数，没有亮度参照：

| 空间 | 文件原文 |
| --- | --- |
| P3-DCI | `White: DCI 48 nits` |
| DCI XYZ | `CIE E 52.37 nits white point` |
| P3-D65（Display P3） | `From ICC Profile: Display P3` / `White: D65 100 nits` |
| Adobe RGB | `White: D65 160 nits … The Adobe RGB gamut is a bit larger than the P3 gamut. It can be matched by real displays.` |
| ST 2084 | `White: D65 10000 nits` / `Creative = 100 nits` / `Clip = 1000 nits` |
| HLG | `Lw = 1000nits, Lb=0.0nits, Gamma=1.2` / `White = 1000 nits` / `Creative = 100 nits` / `Clip = 1000 nits` |
| CINITY | `White = 110 nits` / `Creative = 48 nits` / 注释：`0.01 nits flare / 100 nits white` |
| Rec.709（线性版） | `White normalised to display's native white point (D65)` |

`Creative = 100 nits`、`Clip = 1000 nits` 这类是 FilmLight 自己的调色约定，不是标准内容——要用得说明来源。

---

## 4. 设计用途（Help 原话）

> **ACEScg**："It should be used as a **VFX Working Space only**"
> **ACEScc**："Standard colour space for ACES grading. This colour space is **identical to ACESproxy scaled for CDL and without clipping**."
> **ACEScct**："Alternate colour space for ACES grading. Similar to ACEScc above black, but **adds a toe** for more traditional log-like colour grading behavior."
> **RED Wide Gamut**："a camera colour space designed to **encompass all colours a RED camera can generate without clipping**"
> **FilmLight E-Gamut / T-Log**："designed to be used as **Working Colour Space**"
> **ARRI Film Gamut**（未收录）：`Primaries: ARRI film-like` / `Tone curve: ARRI LogC3 similar to Cineon log` / `Reference white at 57%`

ACES 三条和 RED 那条是判断「这个空间该拿来干什么」的依据，属于可写的事实；「Working Space」这类属于实现者的设计意图。

---

## 5. 建模说明

### FilmLight Cineon PD Log / Generic Negative（全文）

> "This is an **approximate** original camera negative film response scanned on a film scanner calibrated to Cineon assuming **ideal SMPTE Printing Density**. A generic modern film stock was used for the spectral sensitivity. Tone Curve: Cineon Printing Density Log. Primaries: Spectral sensitivity of generic modern camera negative stock. Reference white at 68.5%"

注释里另有：`Dye Absorption Matrix K. Vision 5207`、`K. Spectral Sensitivity (for mid grey)`、`Inverse transpose of Von Kries matrix normalised to D65`。

### FilmLight Academy PD Log / ~ADX（全文）

> "This is an **approximate** negative film response using the **ADX matrix** and a **sigmoid tone curve**. It maps the positive scene exposure range into the 0–1 Cineon log range. **The scene 18% grey is mapped to the 50% output** (negative density 1.0), with a **gamma value of about 0.6 at the mid point**. Reference white at 63%"

注释里另有：`from aces-dev … ADX10_to_ACES.ctl`。

这两段是目前页面上最缺的东西——两个条目现在只有数值，没有任何「它是什么」的说明。PD Log 那句「18% 灰映射到 0.5」还能和页面上的 `18% 灰 → 编码 0.5000` 互证。

### 其他

> **ADX**（ADX10/16）："Academy Density Exchange (ADX) is a **logarithmic encoding of negative film** defined as part of ACES."
> **ARRI LogC4**：注释写 `Decoding/Encoding Function per 20220501_LogC_Specification.pdf`

---

## 6. 文件注释里点名的出处

这些 URL 出现在注释里，可能是补来源的线索（**尚未按核验流程复验**）：

| 文件 | 注释里的出处 |
| --- | --- |
| ARRI LogC3 | `arri.com/…/2017-03-alexa-logc-curve-in-vfx-data.pdf` |
| ARRI LogC4 | `ARRI LogC4 Logarithmic Color Space SPECIFICATION Date: 1st May 2022` |
| Sony S-Log3 ×4 | `pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf` |
| RED Wide Gamut | `red.com/download/white-paper-on-redwidegamutrgb-and-log3g10` |
| Fujifilm F-Log2 C | `dl.fujifilm-x.com/support/lut/F-Log2C_DataSheet_E_Ver.1.0.pdf` |
| BMD DaVinci Wide Gamut | `documents.blackmagicdesign.com/InformationNotes/DaVinci_Resolve_17_Wide_Gamut_Intermediate.pdf` |
| ACEScc / cct / cg | `docs.acescentral.com/specifications/acescg/` |
| ADX / FilmLight PD Log | `github.com/ampas/aces-dev/…/ACEScsc.Academy.ADX10_to_ACES.ctl` |
| Apple Log / F-Log / Rec.2020 系 | `itu.int/…/R-REC-BT.2020-2-201510-I!!PDF-E.pdf` |
| Rec.709 / sRGB | `itu.int/…/R-REC-BT.709-6-201506-I!!PDF-E.pdf` |
| Nikon N-Log | `N-Log_Specification_(En)01.pdf`（无 URL） |
| Panasonic V-Log | `Formulae derived from Panasonic IDT`（无 URL） |
| Canon 系 | `Canon_EOS_C300_mk2_IDT_…_Ver.1.0.ctl` 等 CTL 文件名，并注明取自 `ampas/aces-dev` 的 `IDT.Canon.…ctl` |
| Adobe RGB | 维基百科（不合格） |

对应到**目前没有来源**的 12 条：Canon P3+ ×2、Blackmagic Gen 5、REDcolor 2、Sony S-Log2、Sony Venice ×2、FilmLight E-Gamut ×2、FilmLight 两个 PD Log、CINITY —— 注释里都没有可用的 URL（REDcolor 2 和 BMD Gen 5 连注释都没有）。

---

## 7. 三处对不上的地方

1. **Canon 注释里的白点是 D60**（`White = D60: 0.32168,0.33767`），因为那些矩阵是 ACES IDT；页面用的是 D65。两个白点指的不是一件事，放一起容易被误读。
2. **参考白 % 与白点码值不是同一套**（见第 1 节），LogC3 和两个 FilmLight PD Log 尤其明显。
3. **`WhitePoint` 字段的含义不统一**：多数空间里它约等于「线性 1.0 的码值」，但 CPD 的 685 = 68.5% 又是另一种算法。

---

## 8. 落地情况

2026-11-06 已写进页面的：

- **`intro` 字段**（标题下一句话，13 条）：两个 FilmLight 条目、ACEScg / cc / cct、ADX10 / ADX16、Log3G10、T-Log ×2、P3-DCI、HLG、ST.2084
- **LogC4 的 12-bit 说明**：写进 `arri-logc4` 正文，已按 ARRI 规范复核（"should not be used for archival or interchange"）
- ACES 三条的描述按 `docs.acescentral.com` 原文核过，不是照抄 FilmLight 的措辞

还没做的：

- **参考白 X%**：分析见第 1 节，结论是不引入（三种口径混在一起）
- **Log C V3 的 EI 依赖性**：写进 `arri-logc3` 页面，含 EI 160–1600 的参数表（数据在 `data/logcEI.yaml`）
- **FilmLight 的显示预设亮度**（100 nits 对应 1.0、clip 1000 nits、creative 100 nits）：属于 FilmLight 调色约定，没有对应标准条文，未采用
- **Canon 的 D60 注释**：与页面用的 D65 是两套语境，未改动
