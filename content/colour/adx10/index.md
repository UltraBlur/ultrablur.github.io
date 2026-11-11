+++
title = "ADX10"
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
noteBox = "色度图不是 ADX 的内容，也不是胶片的色域。三角形是「相对曝光（Relative Exposure）」这一层的三原色——把 ACES 的 EXP → ACES 矩阵经 AP0 反解得到，面积 0.18，而 AP0 自己是 0.396，两者不是同一个三角形。ADX 标准只定义码值，没有原色、白点或传递曲线。"
intro = "ADX 是 APD（Academy Printing Density）的整数编码：把负片的印片密度按通道线性映射成 10 位（或 16 位）码值。它没有曲线，也不定义色域。"
+++

## 从密度到码值

ST 2065-3 只定义码值与换算：把 APD（ST 2065-2）的每通道密度减掉该样品的 Dmin，再线性映射成整数。编码这一步没有曲线，只有增益、偏移、取整与钳位。

```text
ADX16_c = clamp(round(gain_c × (APD_c − Dmin_c) × 8000 + 1520),  0, 65535)
ADX10_c = clamp(round(gain_c × (APD_c − Dmin_c) ×  500 +   95),  0, 1023)
gain_R = 1.00   gain_G = 0.92   gain_B = 0.95
```

| 通道 | 增益 | ADX16 覆盖的密度差（APD 减 Dmin） | ADX10 覆盖的密度差（APD 减 Dmin） |
| --- | --- | --- | --- |
| R | 1.00 | −0.190 … 8.002 | −0.190 … 1.856 |
| G | 0.92 | −0.207 … 8.698 | −0.207 … 2.017 |
| B | 0.95 | −0.200 … 8.423 | −0.200 … 1.954 |

两者斜率相同（每个密度单位 8000 / 500 个码值），量程不同：16 位约 8.2 个密度单位，10 位只有约 2.05 个，与 Cineon 10 位的 2.048 一致；超出部分钳位到 1023。

这两个数字要分开看：曲线横轴的档位描述的是**底片的曝光宽容度**，纵轴的码值描述的是**编码能容纳的密度范围**。常规彩色负片的密度范围在 2～3 个密度单位之间，ADX10 的 2.05 个与之相当、甚至略紧；ADX16 的 8.2 个远大于此——负片达不到那么高的密度，多出来的部分对应的是扫描、标定端的余量，而不是画面信息。

曲线图的纵轴：ADX10 按码值 ÷ 1023 归一化，所以纵轴 1.0 就是满码；超过 1 的采样点来自曲线本身的外推，不代表还有可用码值。

### 两种位深的换算

ADX10 → ADX16 就是乘 16（式 3）。反向不能直接除以 16：式 4 先看 FLOOR(ADX16/16) 的奇偶，偶数取 FLOOR((ADX16+7)/16)，奇数取 FLOOR((ADX16+8)/16)，最后钳位到 1023。

### Dmin 与极暗部

码值 0 既不是「零密度」，也不是 Dmin，而是比 Dmin 还透 0.19 个密度。刻度把 Dmin 放在码值 1520（10 位是 95）处，再往下留 0.19 个密度的余量，这个差值记作 APD 减 Dmin，写作 `APD − Dmin`，在码值 0 处等于 −0.19。物理密度本身不会为负（APD = −log₁₀T，T ≤ 1），负的只是相对 Dmin 的差值。Dmin 是每卷底片的实测最小密度，扫描时通常取片头或片尾的未曝光区；换一卷或重新标定一次，整条码值区间整体平移，斜率不变。

低于 −0.19 的密度没有码值可用，编码时直接钳位到 0。在 ACES 变换里，−0.19 对应约 10⁻⁶ 的相对曝光；再往暗处，曲线按首段斜率线性外推，实现上（OpenColorIO）把 log 曝光限在 −10，因此极暗部被压向 0，不会出现负曝光。

## 三个通道增益为什么不同

增益 1.00 / 0.92 / 0.95 不是物理常数。ACES 的说明文档给出的理由是：现代彩色负片并不满足「中性曝光 → 三通道密度相等」的理想条件，所以取一组统计平均的增益，让常见底片的中性点回到中性轴上：

> … encoding gain factors were computed as a weighted average of gain factors necessary to make commonly used motion picture films stocks neutral. The gain factors of 1.00, 0.92, and 0.95 for Red, Green, and Blue channels, respectively, are intended to better center the point cloud of samples from films along the neutral axis.

同一份文档还指出，实际生产中扫描仪多半用 Dmin 而不是 LAD 来定标，而增益是线性的——离锚点越远，三条通道分得越开。

## 色度从哪一步出现

ADX 是密度，本身没有原色，也没有白点；要把它放进色度图，必须先映射到某个 RGB 空间。ACES 采用的链路如下（CTL `ACEScsc.Academy.ADX10_to_ACES`，OpenColorIO 的实现与之一致）：

```text
ADX 码值
  → 去量化，得到通道相关密度 CDD
  → CDD → CID 矩阵，得到通道无关密度 CID
  → 11 点非均匀 LUT：密度 → 相对 log 曝光
  → 10^x：log 曝光 → 线性相对曝光
  → EXP → ACES 矩阵：ACES AP0 线性
```

```text
CDD → CID
[ 0.75573  0.22197  0.02230 ]
[ 0.05901  0.96928 −0.02829 ]
[ 0.16134  0.07406  0.76460 ]

EXP → ACES
[ 0.72286  0.12630  0.15084 ]
[ 0.11923  0.76418  0.11659 ]
[ 0.01427  0.08213  0.90359 ]
```

第一步矩阵补偿胶片的层间效应：一个通道的曝光变化会改变另外两个通道的密度，所以密度要先按通道混合，才能与曝光对应。两条矩阵的行和都是 1，三通道密度相等的中性在映射后仍然中性。

矩阵来源，ACES 的说法是由 Kodak 与 Fuji 提供、作为适用于各种胶片的平均值；公开资料里没有推导过程，它也不属于 SMPTE 标准。

## 图里那个三角形是什么

页面顶部的原色与 RGB → XYZ 矩阵，是 AP0 的 RGB → XYZ 乘上 EXP → ACES 的结果——相当于把「相对曝光」当成一个 RGB 空间来看。反解出来的三原色是 (0.6637, 0.3224)、(0.1509, 0.7451)、(0.1276, 0.0635)。

**它不是 AP0 的三角形**——AP0 自己的原色是 (0.7347, 0.2653)、(0, 1)、(0.0001, −0.077)，面积 0.396；这里这个面积 0.180，不到 AP0 的一半。

它也不是 ADX 的色域。ACESCentral 上的两处说明把这件事讲得很清楚：Nick Shaw 说那个矩阵「would be the matrix from the Relative Exposure values … to XYZ」，不是 ADX → XYZ；Kevin Wheatley 则指出，把 EXP → ACES 分解成原色「was not explicit documented and is an interpretation of the EXP_TO_ACES in the CTL files」。

所以这张图能说明的只有一件事：**这套编码假定什么样的显示色域**。整个码值范围都要过同一条非线性 LUT，三通道的比例会被曲线改写，所以三角形不能当作 ADX 的边界。

反向的 ACES → ADX，ACES 没有提供官方变换，理由是录制片与洗印条件各不相同。

## 锚点

页面上的「黑点 / 白点（10-bit 码值）」：ADX 标准里的锚点是 Dmin = 95，量程上界是 1023；这里列的 82 / 649 是**相对曝光 0 与 1.0 落在曲线上的码值**（82 是首段线性外推过零的位置，649 是 EXP → ACES 给出 1.0 的位置），与 FilmLight 的 `.flspace` 文件头一致。两套口径不要混用。

18% 灰落在码值 445（0.4346），这也是 LAD 在 10 位 DPX 里的常用码值。曲线图上的 0 档就是 18% 灰。
