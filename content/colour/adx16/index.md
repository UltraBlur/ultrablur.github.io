+++
title = "ADX16"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
category = "Scene Referred"
sources = [
  { title = "SMPTE ST 2065-2:2020：Academy Printing Density（APD）——光谱响应度、参考测量装置与光谱计算（PDF）", url = "https://pub.smpte.org/pub/st2065-2/st2065-2-2020.pdf" },
  { title = "SMPTE ST 2065-3:2020：Academy Density Exchange Encoding（ADX10 / ADX16）（PDF）", url = "https://pub.smpte.org/pub/st2065-3/st2065-3-2020.pdf" },
  { title = "ACES：Background on ADX Channel Gains（PDF）", url = "https://community.acescentral.com/uploads/default/original/2X/b/bb88519b27540c6015a330b6665523e33f493b6e.pdf" }
]
primaries = [[0.663747, 0.322376], [0.150934, 0.745125], [0.127573, 0.063536]]
whitePoint = [0.32168, 0.33767]
whiteName = "ACES D60"
matrixLabel = "相对曝光 RGB → XYZ"
matrixLabelEn = "Relative exposure RGB → XYZ"
matrix = [[0.688563361694, 0.120315061426, 0.143767650444], [0.334429500163, 0.593968684274, 0.071602536889], [0.014395935381, 0.082854812395, 0.911564348372]]
noteBox = "色度图不是 ADX 的内容，也不是胶片的色域。三角形是「相对曝光（Relative Exposure）」这一层的三原色——把 ACES 的 EXP → ACES 矩阵经 AP0 反解得到，面积 0.18，而 AP0 自己是 0.396。ADX 标准只定义码值，没有原色、白点或传递曲线；ADX16 与 ADX10 只是同一刻度的不同位深。"
intro = "ADX16 是 APD 的 16 位编码：与 ADX10 同一套密度刻度，多 4 位精度和 2 位量程，覆盖约 8.2 个密度单位。"
+++

## 与 ADX10 的关系

ST 2065-3 只定义码值与换算：把 APD（ST 2065-2）的每通道密度减掉该样品的 Dmin，再线性映射成整数。

```text
ADX16_c = clamp(round(gain_c × (APD_c − Dmin_c) × 8000 + 1520),  0, 65535)
ADX10_c = clamp(round(gain_c × (APD_c − Dmin_c) ×  500 +   95),  0, 1023)
gain_R = 1.00   gain_G = 0.92   gain_B = 0.95
```

16 位不是另一套刻度，而是 10 位加了 4 位精度、2 位量程：`95 × 16 = 1520`、`500 × 16 = 8000`。所以 ADX10 → ADX16 是乘 16（式 3）；反向不能直接除，式 4 要先看 FLOOR(ADX16/16) 的奇偶——偶数取 FLOOR((ADX16+7)/16)，奇数取 FLOOR((ADX16+8)/16)——再钳位到 1023。

| 通道 | 增益 | ADX16 覆盖的密度差（APD 减 Dmin） | ADX10 覆盖的密度差（APD 减 Dmin） |
| --- | --- | --- | --- |
| R | 1.00 | −0.190 … 8.002 | −0.190 … 1.856 |
| G | 0.92 | −0.207 … 8.698 | −0.207 … 2.017 |
| B | 0.95 | −0.200 … 8.423 | −0.200 … 1.954 |

## 8.2 个密度单位是多出来的什么

常规彩色负片的密度范围在 2～3 个密度单位之间。ADX10 的 2.05 个与之相当，甚至略紧；ADX16 的 8.2 个远大于此——负片达不到那么高的密度，多出来的部分对应的是扫描与标定端的余量，而不是画面信息。

也就是说，ADX16 的「多 2 位」在真实素材上大部分是空的。它换来的是：暗部量化更细（同一密度差有 16 倍码值）、以及容纳 Dmin 标定偏差与高密度区不饱和的空间。ST 2065-3 自己也写了「尽可能用 16 位」。

## 曲线与锚点

本页曲线按码值 ÷ 16368 归一化（16368 = 16 × 1023，即 ADX10 满码 ×16），所以和 ADX10 页的曲线完全重合；纵轴大于 1 的部分仍然有效，码值最高到 65535（对应 4.0）。

页面上的「黑点 / 白点（10-bit 码值）」给的是 82 / 649：这是**相对曝光 0 与 1.0 落在曲线上的位置**，按 10 位计；换成 16 位就是 1312 / 10384。ADX 标准自己的锚点是 Dmin = 95（16 位 1520），两套口径不要混用。

18% 灰落在码值 7120（16 位），按 ÷16368 归一化就是 0.435——和 ADX10 的 445 是同一个点。

## 色度与三角形

与 ADX10 相同：原色与矩阵是 AP0 × EXP → ACES 的结果，描述的是「相对曝光」这一层，不是 ADX 的色域。这一点在 [ADX10](/colour/adx10/) 页有完整推导，包括 ACESCentral 上 Nick Shaw 与 Kevin Wheatley 的两处说明。

整个码值范围都要过同一条非线性 LUT，三通道比例会被曲线改写，所以三角形不能当作边界。ACES 也没有提供反向的 ACES → ADX 变换。
