# 胶片色彩空间 · 研究底稿

> 用途：`/colour/` 胶片组 4 条（ADX10、ADX16、FilmLight Cineon PD Log / Generic Negative、FilmLight Academy PD Log / ~ADX）改写前的底稿。四条现为 `wip`，正式构建只留提示、正文与图表都不下发；本地 `hugo server` 照常显示。
>
> 日期：2026-11-10。证据等级标注：**【标准】** SMPTE / ISO 原文；**【实现】** 厂商文件（`.flspace`、CTL）里的写法；**【推算】** 本稿用数值复算过；**【待验】** 没找到出处，暂不下结论。

---

## 0. 结论

1. **胶片没有色彩空间，只有密度编码。** 彩色底片记录的是三层染料的积分密度（CMY），不是三原色。密度没有原色、没有白点，也没有显示端意义上的「传递函数」——它有的是「密度 → 码值」的标定刻度。
2. 所以胶片组放的不是空间，是**密度域的编码与响应近似**。模板的「原色 / 白点 / RGB→XYZ 矩阵 / 曲线」四件套对它不适用；硬套会造出一个假色域。
3. ADX10 / ADX16 页上的三角形**不是 ACES AP0 的三角形**。`AP0 × EXP→ACES` 确实与页面矩阵逐位一致（差 <1e-12），但矩阵相等不等于原色相等：AP0 自己的原色是 (0.7347, 0.2653)、(0, 1)、(0.0001, −0.077)，面积 0.396；页面三角形是 (0.6637, 0.3224)、(0.1509, 0.7451)、(0.1276, 0.0635)，面积 0.180。它是把 `EXP→ACES` 经 AP0 反解出来的**相对曝光（Relative Exposure）空间**。ACESCentral 的讨论与此一致（§5）。三角形可以保留，但要叫「ACES 相对曝光空间」——它不是「ADX 的色域」，也不是 AP0。
4. Generic Negative 的 `RGB_XYZ` **就是 Von Kries / HPE 锥体矩阵的逆**（同库 `VonKriesLMS.flspace` 用了同一个矩阵）：`inv(HPE)·(1,1,1) = D65`，与页面矩阵逐项差 ≤ 6.4×10⁻⁶。所以它的「线性」是 **LMS**，不是 RGB；三个「原色」是 HPE 的几何——R、G 落在 alychne 上（x+y=1），B 落在 y=0 上——与底片无关，换哪种底片这个矩阵都不变。顺带纠正上一轮的论证：「顶点在轨迹外」不能当判据，本站 41/47 个空间都有顶点在外。
5. PD Log / ~ADX 与 ADX **同原色、不同曲线**。它真正的内容是那条 sigmoid：18% 灰 → 0.5、中点 gamma ≈ 0.6、0.75 以上线性截断。
6. 「Cineon」在实践里是**两套刻度**：ADX 用 500 码值/APD（0.002 密度/码值），VFX 传输函数用 300 码值/decade。比值 0.6 恰好是负片 gamma 的量级——两者不是谁写错了，是两个不同的量。
7. ADX 的语义是**印片链路的中间量**：它编码的是「这张负片在印片机上会怎样」，不是相机空间、也不是显示空间。印片模拟（2383 / 3510）跳过密度直接给显示码值，所以是 LUT 不是空间。

---

## 1. 问题：胶片到底有没有「色彩空间」

一个色彩空间通常要回答四件事：原色（色域）、白点、RGB↔XYZ 矩阵、传递函数。胶片一件都不给：

| 要素 | 数字摄影机 / 显示空间 | 胶片 |
| --- | --- | --- |
| 记录量 | 线性或 log 的 RGB 信号 | 三层染料的积分密度 |
| 原色 | 由 CFA 光谱灵敏度或标准定义 | 染料没有「原色」；只有吸收光谱 |
| 白点 | 拍摄白平衡 / 标准白 | 由印片机光源与正片共同决定，不是常数 |
| 传递函数 | 光 → 信号（OETF/EOTF） | 密度 → 码值（标定刻度），不是光电转换 |
| 色域 | 可画三角形 | 三角形是下游变换造的 |

真正存在的三层是：

```text
场景曝光（相对，stops）
   │  胶片特性曲线（H&D curve，斜率≈0.6）
   ▼
负片密度（染料层 CMY，物理量；受层间效应影响）
   │  扫描仪 / 密度计（按某套光谱响应加权）
   ▼
印片密度 APD（不是透射率，见 §2）
   │  ST 2065-3 线性映射
   ▼
ADX 码值（10 / 16 bit）
   │  ACES ADX→ACES 变换（矩阵 + LUT + 矩阵）
   ▼
ACES AP0 线性（这时才有「原色」）
```

**关键点：色度只在最后一步出现，而且是 ACES 定义的那一步给的。** 前面所有环节都没有「颜色」，只有密度和曝光。

---

## 2. 密度：三个不同的 D

「密度」这个词在胶片语境里至少指三样东西，混用会让整页数字错位。

| 名称 | 出处 | 光谱响应由什么决定 | 用途 |
| --- | --- | --- | --- |
| Status M | ISO 5-3（ANSI/ISO 5-3） | 通用彩色负片评价条件 | 冲洗控制、常规密度测量 |
| Status A | ISO 5-2 | 正片 / 反转片评价条件 | 正片、透明片测量 【待验：本条未从所引标准原文核到】 |
| Printing Density | SMPTE RP 180:1999 | 印片机光源 + 光学元件 + **正片光谱灵敏度** | 负片印片、扫描仪标定 |
| APD（Academy Printing Density） | SMPTE ST 2065-2:2020 | 同上，但规定了具体器件 | ACES / ADX 的密度基准 |

**【标准】** RP 180 对三者的关系说得很直接：

> The ISO has defined status M density for the evaluation of color photographic materials intended for printing. […] However, given the large number of films in use, status M densities can only approximate printing densities for most materials. A definition of printing density appropriate to the specific motion-picture negative and intermediate materials being used is needed for the calibration of film scanners and definition of the metric used in computer data files for electronic post-production of film.

**【标准】** ST 2065-2 规定了 APD 的光谱响应乘积：

> The spectral responsivities associated with any printing density metric are the product of the spectral power distribution of a printer light source, the spectral transmittance, reflection, and absorbance of the optical components of the photographic printer, and the spectral sensitivities of the print medium onto which the sample is to be printed.

具体器件：Kodak Vision 家族、Fujifilm Eterna 家族、Fujifilm F-CP 的正片光谱灵敏度；Bell & Howell Model C 印片机灯箱（含二向色滤光片）；Eastman Kodak Wratten No. 2B 滤光片。

**【推算】APD 与 1999 年的 RP 180 不是同一套响应。**两份文件的表都能取到数值，直接比半高宽：

| | R 峰值 / 半高宽 | G 峰值 / 半高宽 | B 峰值 / 半高宽 |
| --- | --- | --- | --- |
| RP 180:1999（Table 1，10 nm 步进） | 670 nm / 38.3 nm | 530 nm / 33.9 nm | 430 nm / 39.3 nm |
| APD，ST 2065-2:2020（CSV，2 nm 步进） | 692 nm / 38 nm | 550 nm / 14 nm | 466 nm / 22 nm |

变化不是「整体更窄」，而是**峰位整体红移 20–36 nm、G 收窄到不足一半**：R 宽度几乎没变（38.3 → 38），G 33.9 → 14，B 39.3 → 22。这**更像是两代正片的差别**：RP 180 没有点名具体正片（只说「大量印片机与材料」），APD 点名了 Kodak Vision / Fujifilm Eterna / F-CP；但两标准的测量条件、器件也不同，不能把差异全部归给正片。

所以「APD 被正片吸收带裁过」这句要说得更准：**它被 21 世纪初的正片裁过**，而不是被所有正片裁过。同一条负片按 RP 180 和按 APD 测，会得到不同的密度值。

**这带来一个反直觉的结论**：APD 不是底片的物理属性，而是「这张底片被这类正片看到的样子」。同一张底片，换一代正片，APD 会变。它比 Status M 更「印片化」。【待验：与 Status M 的定量差仍未算——手上没有 ISO 5-3 的响应数据；但 RP 180 与 APD 的差已经算出来了，见上表】

> 本站现有的 `gamutNote` 里没有这条，但它是理解 ADX 的前提：ADX 编码的是 APD，不是透射率。

### 2.1 扫描链

```text
负片（染料密度）
  → 扫描仪：光源 + 滤光片 + 传感器
  → 每通道密度
  → 去 Dmin、乘通道增益、量化
  → ADX 码值
```

扫描仪自己也是一套光谱响应，与 APD 不完全相同——这部分叫 scanner density。ST 2065-2 的 NOTE 3 明确把它排除在标准之外：

> Conversions between other density metric values (i.e. ISO Status M density, scanner density, etc.) and APD values are possible and can be particularly useful in process control efforts. These transformations are product specific: a separate transformation needs to be determined for each sample (e.g. color negative and internegative film products).

CPD 的 Help 正是在处理这件事：

> …scanned on a film scanner calibrated to Cineon **assuming ideal SMPTE Printing Density**.

也就是说：CPD 描述的是「扫描仪被标定成理想 APD」之后的那条曲线。现实中的扫描仪偏差，属于标定问题，不是这个条目能表达的。

### 2.2 印片链

```text
负片（APD）
  → 印片机：光源 + 二向色滤光（printer lights / points）
  → 正片曝光
  → 正片密度（Status A / projection density）
  → 放映机 + 银幕
```

- APD 的定义（§2 引文）就是把这台印片机的光源、光学元件、正片灵敏度全部乘进光谱响应里。所以 APD 天生是**印片链**的量。
- 印片机的曝光用「点」微调。相邻点对应的 log 曝光差常引作 0.025（≈1/12 档），但依机型与滤光系统而变——【待验：未取到一手条文】。
- **LAD**（Laboratory Aim Density）是用一块已知密度的负片 patch 把印片机与冲洗锚定的方法。RP 180 也承认密度可以「相对 100% 透射参考、相对 Dmin、或相对某个参考灰阶」测量——LAD 就是最后一种。
- 正片（Kodak Vision 2383、Fuji 3510 一类）的密度范围约 2–3；这是观众最终看到画面的那一层，但它仍然是**密度**，不是 RGB。把它变成 RGB 需要放映测量或扫描，又是另一套标定。

### 2.3 APD 是两条链的交点

- 扫描链要复现「印片机看到的东西」，两边就必须用同一个密度定义 → 这就是 APD 存在的理由。
- ADX 编码 APD，等于把「这张负片在印片机上会怎样」写进了数字文件。
- 所以 ADX 的语义是**印片链路的中间量**，不是「相机的色彩空间」，也不是「显示色彩空间」。页面标题里若只写「胶片」，读者会默认它是后者。

---

## 3. ADX：把 APD 装进整数

### 3.1 公式

**【标准】** ST 2065-3:2020 式 1 / 式 2（本站 ADX10 页面已录）：

```text
ADX16_c = clamp(round(gain_c × (APD_c − Dmin_c) × 8000 + 1520), 0, 65535)
ADX10_c = clamp(round(gain_c × (APD_c − Dmin_c) ×  500 +   95), 0, 1023)
gain_R = 1.00   gain_G = 0.92   gain_B = 0.95
```

- `95 × 16 = 1520`、`500 × 16 = 8000`：16 位就是 10 位的同一刻度加 4 位精度、2 位量程，所以 ADX10 → ADX16 是乘 16（反向有取整规则，见页面）。
- 码值 0 不是「零密度」，而是比 Dmin 还透 0.19 个密度（`95 × 0.002`）；这是 ST 2065-3 明说的 footroom，用来容纳 `APD − Dmin` 的负值。
- 1024 × 0.002 = 2.048，这就是页面解码式里的 `×2.048`。

### 3.2 为什么三个通道增益不同

**【标准/实现】** ACES 的说明文档《Background on ADX Channel Gains》给的理由：

> While historically present in systems that comply with the Silver criterion, this ideal system behavior is not a characteristic of contemporary motion picture negative films stocks. In order to produce printing densities that were more equal, encoding gain factors were computed as a weighted average of gain factors necessary to make commonly used motion picture films stocks neutral. The gain factors of 1.00, 0.92, and 0.95 for Red, Green, and Blue channels, respectively, are intended to better center the point cloud of samples from films along the neutral axis.

同一份文档还说明锚点的选择：

> … this relies on the assumption of using LAD as the anchor of the process, i.e. to set scanner calibration. In practice, scanner gains are almost always set using Dmin. (This is due to the fact that LAD patches are rarely available, especially in restoration scans. So instead of balancing on LAD, scanner gains are most often set using Dmin, which can be found in the head or tail segments of every piece of film.)

**含义**：三个增益是统计意义上的「让常见底片的中性点落回中性轴」，不是物理常数；而且因为它们线性、锚点又在 Dmin，离锚点越远，三条线分得越开。页面正文里「低于 −0.19 没有码值」「换一卷整体平移、斜率不变」两句与此一致。

### 3.3 ADX 不定义什么

**【标准】** ST 2065-3 的正文只做一件事：APD 值 ↔ 10/16 位整数。它**不定义原色、不定义白点、不定义传递函数**。`ADX.flspace` 里的 `RGB_XYZ` 是 FilmLight 从 ACES 的 ADX→ACES 变换反推的，不是标准内容。

---

## 4. 「Cineon」的两套刻度

这是本轮最容易踩的坑，也是四条页面里最值得写清楚的一条。

| 刻度 | 出处 | 斜率 | 18% 灰落点 |
| --- | --- | --- | --- |
| APD 密度刻度 | ST 2065-3（ADX10） | 500 码值 / 单位 APD（0.002 密度/码值） | 445 |
| VFX 传输函数 | Kodak Cineon 约定（685 / 300 / 95） | 300 码值 / decade（0.00333 密度/码值） | 468 |

**【推算】** 两处都验过：

- ADX10：由 `ADX.flspace` 的 `convertToLinear`，相对曝光 0.18 落在码值 444.6 → 445（0.18 = 场景 18% 灰，见 ACES ADX→ACES 的 LUT 段）。
- Cineon：`colour-science` 的 `log_encoding_Cineon(0.18) = 0.4573196…`，即 10 位 467.6 → 468。
- **CPD 的曲线与标准 Cineon 逐位一致**：`convertFromLinear` 在 0.18 处给出 0.45731，与上式相同；黑点 95、白点 685、`encode(1.0) = 0.670`（即 685/1023）也一致。所以 CPD 的「Cineon Printing Density Log」就是教科书里那条 Cineon，不是自制曲线。

**【交叉验证】Resolve 的 Cineon 也是这一条。**本机 Resolve Studio 21 的 REDlogFilm 解码实测（`davinci-cst-re/oracle/out/dec_29`，256 级斜坡）与 `(10^((1023x−685)/300) − b)/(1−b)`、`b = 10^(−590/300)` 逐点吻合，最大差 **5.5×10⁻⁶**，码值 1.0 解码为 13.5217。REDlogFilm 就是 Cineon 曲线，所以这等于用第二个独立实现确认了 300 码值/decade。

**为什么两个都能叫 Cineon**：APD 是密度，Cineon 的横轴是相对曝光；负片的密度对 log 曝光的斜率约 0.6（PD Log 的 Help 也写「gamma value of about 0.6 at the mid point」），于是

```text
500 码值/APD × 0.6 APD/decade ≈ 300 码值/decade
```

数量级正好对上。**这不是矛盾，是把同一个胶片响应写成了两个量**；但页面上一旦混用，18% 灰的落点就会差 23 个码值。

> 建议：胶片组的两类曲线在页面上必须标清横轴是「APD 密度」还是「相对曝光 decade」，否则读者会以为 ADX 与 Cineon 自相矛盾。

---

## 5. 从密度到色度：ADX → ACES 那一步

**【实现】** 链路（ACES CTL / OCIO 一致，ADX 页面已录）：

```text
ADX 码值
  → 去量化 → CDD（通道相关密度）
  → CDD→CID 矩阵 → CID（通道无关密度）
  → 11 点非均匀 LUT：密度 → 相对 log 曝光
  → 10^x：log 曝光 → 线性相对曝光
  → EXP→ACES 矩阵 → AP0 线性
```

**【推算】** 页面矩阵 = 最后一步矩阵乘 AP0：

```text
AP0 × EXP→ACES = [[0.688563, 0.120315, 0.143768],
                   [0.334430, 0.593969, 0.071603],
                   [0.014396, 0.082855, 0.911564]]
```

与 `adx10/index.md` 的 `matrix` 逐位相同（差值 < 1e-12）——这说明页面数字与这条链路自洽，但**只证明矩阵，不证明原色归属**。乘积的三列才是这个空间的基色，而它们不是 AP0 的三列：

| | 三原色 | 三角形面积 |
| --- | --- | --- |
| AP0 | (0.7347, 0.2653)、(0, 1)、(0.0001, −0.077) | 0.396 |
| 页面三角形（相对曝光） | (0.6637, 0.3224)、(0.1509, 0.7451)、(0.1276, 0.0635) | 0.180 |
| 参照：AP1 | (0.713, 0.293)、(0.165, 0.830)、(0.128, 0.044) | 0.225 |

页面三角形不到 AP0 的一半（0.180 vs 0.396），与 AP1 接近（0.225）——这也解释了 ACESCentral 那张图「ADX 的映射大部分落在 AP1 内」。

**【外部印证】** ACESCentral 两个帖子把这件事说得很准：

- Nick Shaw（2021-12-14）：「ADX is not a simple RGB primaries based encoding. Certainly the ADX to ACES conversion is more involved than a linearisation and a 3x3 matrix. So that matrix would not be a direct ADX to XYZ matrix. It would be the matrix from the **Relative Exposure** values (created by going through lines 56 to 85 of the CTL) to XYZ.」
- Kevin Wheatley（2021-07-07）：「In ADX you can look at the matrices converting to AP0 as encoding the intended display gamut… this was **not explicit documented and is an interpretation** of the EXP_TO_ACES in the CTL files.」

所以：**三角形是 ACES 对「相对曝光」这一层的解释，不是 ST 2065-3 的内容，也不是胶片的色域。**页面可以保留它——它能说明「这个编码假定什么样的显示色域」——但标题与图注必须写明「ACES 相对曝光空间，由 EXP→ACES 反解，非标准内容」。现有 `noteBox` 其实已经这么写了，方向是对的；要补的是把「面积 0.18，不是 AP0」这句话说破。

另一层证据：链路里 `CDD→CID` 与 LUT 都是非线性的，整个码值范围送进同一套非线性，三通道比例会被改写——所以即使把「相对曝光」当基准，三角形也不是 ADX 的边界。

---

## 6. 两个 FilmLight 条目

这两条只有 front matter、没有正文，但 `.flspace` 里的实现足够把「它是什么」说清。

### 6.1 Cineon PD Log / Generic Negative

**【实现】** Help 原文：

> This is an approximate original camera negative film response scanned on a film scanner calibrated to Cineon assuming ideal SMPTE Printing Density. A generic modern film stock was used for the spectral sensitivity. Tone Curve: Cineon Printing Density Log. Primaries: Spectral sensitivity of generic modern camera negative stock. Reference white at 68.5%

实现分三段，解码是反向：

```text
convertToLinear:
  P = rgb × Dye Absorption Matrix（K. Vision 5207）
  P = Cineon 曲线（分段：线性趾部 / 指数段）
  P = P × K. Spectral Sensitivity
convertFromLinear:
  反向顺序
```

两条矩阵：

```text
Dye Absorption（正向）  0.81129611  0.16813581  0.02056807
                        0.0848841   0.77211884  0.14299706
                        0.07672217  0.21710741  0.70617042

K. Spectral Sensitivity 0.38306     0.68160981 −0.06466981
                        0.16551671  0.81607662  0.01840668
                       −0.05766855  0.05788586  0.99978269
```

**【推算】这个 `RGB_XYZ` 不是底片的东西，它是 HPE 的逆。**文件注释给了它用的矩阵：

```text
Von Kries（HPE，D65 归一化）  0.40024   0.70760  −0.08081
                             −0.22630   1.16532   0.04570
                              0.00000   0.00000   0.91822
```

求逆再乘 `(1,1,1)`，得到 (0.950451, 0.999998, 1.089064)——D65。与页面矩阵逐项比较，**最大差 6.4×10⁻⁶**（剩下的差异只是列缩放因子 1.000004 / 1.000002 / 0.999995）。

也就是说：

```text
CPD 的 RGB_XYZ  =  inv(HPE)
```

**证据不止这一条。**同库有一份 `VonKriesLMS.flspace`，`DisplayName` 就叫 **「Von Kries: linear / LMS」**，`Help` 写「Primaries: Von Kries (Hunt-Pointer-Estevez)」，还带 `Invisible = 1`（FilmLight 把它当隐藏的辅助空间）。它的 `RGB_XYZ` 与 CPD 的逐项差 **7.5×10⁻⁶**——CPD 的矩阵就是从这份 LMS 空间抄过来的，只把 B 列的 Y 归零（−0.00001 → 0）。

**这一步的含义比「原色在轨迹外」重得多**：CPD 的「线性」其实是 **LMS（锥体响应）**，`RGB_XYZ` 是锥体空间 → XYZ 的转换。底片的光谱灵敏度完全收在上面那两条 GLSL 矩阵里，`RGB_XYZ` 里没有任何底片信息——换一种底片，这个矩阵一个数都不会变。

三原色因此是 HPE 的几何，不是胶片的：

| 通道 | X | Y | Z | x | y | 结构 |
| --- | --- | --- | --- | --- | --- | --- |
| R（L） | 1.85994 | 0.36119 | 0 | 0.8374 | 0.1626 | Z=0 → 在 alychne 上，x+y=1 |
| G（M） | −1.12938 | 0.63881 | 0 | 2.3022 | −1.3022 | Z=0 → 在 alychne 上，x+y=1 |
| B（S） | 0.21990 | 0 | 1.08906 | 0.1680 | 0.0000 | Y=0 → 在 y=0 线上 |
| 白 | 0.95046 | 1.0 | 1.08906 | 0.3127 | 0.3290 | D65（HPE 已按 D65 归一化） |

R 与 G 的 x+y 严格等于 1、B 的 y 严格等于 0，都是 HPE 的结构决定的：HPE 的 S 只由 Z 决定，于是逆矩阵里 Z 只由 B 给出（R、G 的 Z 系数为 0）；Y 只由 L、M 给出（B 的 Y 系数 ≈0）。**G 落在 (2.30, −1.30) 也只是 inv(HPE) 的第二列，不是测量值。**

**关于「在轨迹外」**：本站 47 个有原色的空间里 41 个至少有一个顶点在轨迹外（中位数 0.073，Log3G10 到 0.661，AP0 也有 0.181），所以「在轨迹外」不构成任何判据。这条真正的结论是：**这个矩阵描述的是锥体空间，不是底片的色域**，`gamutNote` 那句「因此不画 CIE 色度图」应该升级为「这里的『原色』根本没有色域含义」。

另外两条可核对的细节：

- **参考白 68.5% 是 685/1000**，不是 685/1023（= 67.0%）。FilmLight 的口径是「1000 计」，与 10 位码值不是同一个分母——这正是 `colour-flspace-notes.md` 第 1 节记的「参考白 X% 混了三种口径」。
- 注释措辞是「Inverse transpose of Von Kries matrix normalised to D65」；数值上就是**逆**，没有转置——.flspace 的 `mat3` 是列主序，注释里的「转置」来自那个存储约定。

### 6.2 Academy PD Log / ~ADX

**【实现】** Help 原文：

> This is an approximate negative film response using the Academy Density Exchange (ADX) matrix and a sigmoid tone curve. It maps the positive scene exposure range into the 0-1 Cineon log range. The scene 18% grey is mapped to the 50% output (negative density 1.0), with a gamma value of about 0.6 at the mid point. Reference white at 63%

**实际实现与 ADX 不同**：它把 ADX 的 `CDD→CID` 矩阵**先**作用在码值上，再套 sigmoid，最后平方并乘 0.18：

```text
toLinear:  c = rgb × CDD→CID
           c = c < 0.75 ? c/(1−c) : 16c−9
           c = c² × 0.18
```

**【推算】** 由此可复核 Help 的三句话：

- 0.5 → `0.5/(1−0.5)=1` → `1² × 0.18 = 0.18`：**18% 灰确实落在 0.5**。
- 0.75 是分段点；`16c−9` 是把 `c/(1−c)` 在 0.75 处的切线延长。0.75 对应 `c₀ = 3`（因为 `3/(1+3)=0.75`），即相对曝光 `0.18×9 = 1.62`——文件注释称其为「3× the native white point」。
- 文件头 `BlackPoint = 82`、`WhitePoint = 649`：**与 ADX 完全相同**。但这两个值对它自己的曲线不成立——按本节公式，线性 0 的编码是 0.0000（码值 0）、线性 1.0 的编码是 0.7021（码值 718），82 / 649 对应的是线性 0.0014 / 0.54。

**与 ADX 的关系**：同原色（相对曝光空间，见 §5）、同矩阵、**不同曲线**；且非线性顺序不同（ADX 是「密度域矩阵 → 密度/曝光 LUT」，这里是「码值矩阵 → sigmoid」）。所以它不是「ADX 的另一种位深」，是另一条建模路径。

**这里有一处页面上已经存在的自相矛盾**：现页面「黑点 / 白点」一栏写 82 / 649（照抄文件头），紧挨着的「线性 0 → 编码」写 0.0000、「线性 1.0 → 编码」写 0.7021。两组数对不上，读者能一眼看出来。原因如前：82 / 649 是**从 ADX 继承的**参考白口径（63%），不是这条曲线的黑/白落点。改写时必须二选一——要么把「黑点/白点」改成「文件头标注」，要么按曲线重算成 0 / 718。

> 【待验】`.flspace` 没有文字说明 `BlackPoint/WhitePoint` 的语义。对 ADX 文件，它们恰好等于「线性 0 / 1 的落点」（82 → 3×10⁻⁵，649 → 0.9986）；对 CPD 文件，95 / 685 同时是 Cineon 黑/白点与线性 0 / 1 的落点（95 → 1.5×10⁻⁵，685 → 1.0）；对 PDLog 文件则两组都不是。所以「继承」是最省事的解释，但需在 Baselight 里用探针确认。

---

## 7. 边界：什么该进「胶片组」

按 §1 的判据，能进 `/colour/` 的必须至少有「编码定义」；有原色的才画三角形。

| 对象 | 编码 | 原色 | 结论 |
| --- | --- | --- | --- |
| ADX10 / ADX16 | ✅ 码值 ↔ APD | ⚠️ 标准不定义；页面三角形是 ACES 相对曝光空间（§5） | 进；三角形可保留，但必须标为 ACES 的解释 |
| Cineon（Kodak 约定） | ✅ 密度→码值 300/decade | ❌ | 可作 CPD 的曲线基准，不单列 |
| FilmLight CPD / Generic Negative | ✅ Cineon + 两个矩阵 | ❌ `RGB_XYZ` = inv(HPE)，是锥体空间，与底片无关 | 进；只讲扫描仪响应近似 |
| FilmLight PD Log / ~ADX | ✅ sigmoid + ADX 矩阵 | ⚠️ 名义上 ~ADX | 进；只画曲线 |
| ARRI Film Gamut（未收录） | LogC3 | ✅ R (0.684, 0.313) G (0.221, 0.848) B (0.086, −0.102)，D65 | **唯一能画的「film-like」原色**；但它是 ARRI 人为定义，不是胶片 |
| Kodak 2383 / Fuji 3510 印片模拟 | — | ❌ | **不进**：它跳过密度（§2.2），直接把场景映射成显示码值，是 LUT 不是空间 |
| Status M / APD | 密度度量 | ❌ | 不进：是 §2 的口径，写在正文档里 |

**ARRI Film Gamut 的定位**要单独决定：它是「胶片感」的原色，但原色是 ARRI 定的、不是胶片给的。可以放「工作空间」或独立一组，**不宜放胶片组**——否则「胶片组有可画色域」这个错误印象会被强化。

---

## 8. 四条页面的改写（2026-11-11 已执行，仍保持 `wip`）

原则：**胶片组不画「胶片色域」；三角形只能是 ACES 相对曝光空间，且必须有正文解释。** 执行结果：

| slug | 做了什么 |
| --- | --- |
| `adx10` | 正文重写：密度→码值、增益来源（ACES 原文）、ADX→ACES 链路、专节「图里那个三角形是什么」（含 AP0 面积对比、ACESCentral 两处引文）、锚点口径说明 |
| `adx16` | 正文重写：位深关系、8.2 密度单位是多出来的余量、曲线归一化、18% 灰 7120；色度一节链回 ADX10 |
| `filmlight-generic-negative` | 全新正文：三段实现、两条矩阵、Cineon 曲线（与 colour-science / Resolve 实测互证）、`RGB_XYZ = inv(HPE)` 与 alychne 结构；矩阵标题改为「LMS → XYZ」 |
| `filmlight-pdlog-adx` | 全新正文：sigmoid 三句可复核、与 ADX 的顺序差异、82/649 与自身曲线矛盾的解释；删除 `primaries` / `whitePoint` / `matrix`，只剩曲线 |

配套改动：

1. **`data/anchors.json`**：新增 `adx10` / `adx16` 两条（`ACES-ADX-log`，82 / 649，0.0802 / 0.4346 / 0.6344），编码/解码函数取 `.flspace` 原文；两页因此有了传递函数表。
2. **`data/curves.json`**：`adx16` 曲线改为与 `adx10` 相同——原数据按 ÷65535 归一化，与页面文字（÷16368）和 `.flspace` 的 `8.192` 都不一致；统一到 ÷16368 后两页曲线重合，18% 灰 0.4346。
3. **`layouts/colour/single.html`**：矩阵标题改为取 `matrixLabel`（仅这 3 条胶片页设了该字段），否则仍是「RGB → XYZ 矩阵」；`<pre>` 不再重复打印标签。
4. **中英两版同步**：`content/en/colour/` 下四条全部重写，数值仍从中文页读。
5. **`wip` 保持**：正式构建仍只输出「施工中」提示（已验证：正文不出现）。

### 解除 wip 还差什么

- [x] 三角形标为「相对曝光空间」，不出现「胶片色域」「ADX 色域」
- [x] `anchors.json` 补齐，18% 灰与曲线一致
- [x] 两个 FilmLight 条目有正文，并写明「无公开规范，数值来自 `.flspace`」
- [x] 中英两版同步
- [ ] `BlackPoint / WhitePoint` 的语义待 Baselight 探针确认（§9 第 2 条）——目前页面上按「文件头标注 + 曲线落点」两套口径并列解释
- [ ] 若确认 FilmLight 的百分比口径按 1000 计，`68.5%` 与 `63%` 两句可保留；否则要改

---

## 9. 待验证 / 未决

1. ~~**CPD 的 `RGB_XYZ` 无法外部复算**~~ → **已解决**：它等于 `inv(HPE)`，而且同库的 `VonKriesLMS.flspace` 就是同一个矩阵（§6.1）。剩下的未知只有「FilmLight 为什么把锥体空间当线性输出」——`VonKriesLMS` 设了 `Invisible=1`，说明它们知道这是辅助空间，但 CPD 仍然把它当「原色」发布，这个意图文件没写。
2. **`BlackPoint/WhitePoint` 语义**：ADX / CPD 文件里它们数值上等于「线性 0 / 1 的落点」，PDLog 文件里则是从 ADX 继承的 82 / 649、与自己曲线不符。**这不是全库一致的约定**：把 31 条有 `anchors` 的条目逐一比对文件头与曲线落点，16 条吻合（±2 码值，Sony / ARRI / Log3G10 / Cineon / ADX 都在内），6 条不吻合（BMD Gen5、DaVinci Intermediate、DJI D-Log、PD Log、ST 2084、V-Log），9 条头是 0/1023 默认值。所以「头 = 曲线落点」只在部分文件成立，ADX / CPD 属于成立的那批；最终仍需 Baselight 探针确认 FilmLight 的字段语义。
3. **Status A 的引用**：§2 表里 Status A 一条未从所引标准核到原文，先标【待验】，写进页面前应补 ISO 5-2。
4. ~~**RP 180 与 APD 的数值差**~~ → **已算**：两者都是 10 nm / 2 nm 表，半高宽与峰位见表 §2（R 38.3→38、G 33.9→14、B 39.3→22；峰位 670→692、530→550、430→466）。剩下没算的只有 Status M（无 ISO 5-3 响应数据）。
5. **印片点与 LAD 的一手条文**：§2.2 里「每点约 0.025 log E」与 LAD 的密度定义都没有取到原文（Kodak 的 LAD 文档链接 404）。若要写进正文，需补 Kodak 技术支持文档或 SMPTE 相关 RP。
6. **ADX 曲线的趾部**：`ADX.flspace` 是三分段（0.01 / 0.6 两个断点），ACES CTL 是 11 点 LUT。页面说「逐点拟合」，对 CTL 成立、对 `.flspace` 不成立；改写时按实现分别说。
7. **`adx10` 页的 445 与 LAD**：445 是「相对曝光 0.18」在 ADX10 下的解（§4 已复算）。LAD 在 10 位 DPX 里也常记作 445，两者数值重合是因为 LAD patch 就是那个灰阶锚点；写页面时必须说明是哪一个定义，不要互相替代。

---

## 附：复算脚本

```python
import numpy as np
AP0 = np.array([[0.9525523959, 0, 0.0000936786],
                [0.3439664498, 0.7281660966, -0.0721325464],
                [0, 0, 1.0088251844]])
EXP2ACES = np.array([[0.72286, 0.12630, 0.15084],
                     [0.11923, 0.76418, 0.11659],
                     [0.01427, 0.08213, 0.90359]])
print(AP0 @ EXP2ACES)          # 与 adx10 页的 matrix 逐位一致；注意原色取的是乘积的列，不是 AP0 的列

# CPD 的 RGB_XYZ 是 HPE 的逆
HPE = np.array([[0.40024, 0.70760, -0.08081],
                [-0.22630, 1.16532, 0.04570],
                [0.0, 0.0, 0.91822]])
print(np.linalg.inv(HPE) @ np.ones(3))   # -> D65
print(np.abs(np.linalg.inv(HPE) - CPD).max())  # -> ~6.4e-6

CPD = np.array([[1.85994, -1.12938, 0.21990],
                [0.36119, 0.63881, 0],
                [0, 0, 1.08906]])
for c in CPD.T:
    s = c.sum(); print(c[0]/s, c[1]/s)   # R/G/B 的 xy
```

## 来源

- SMPTE ST 2065-2:2020 — <https://pub.smpte.org/doc/st2065-2/20200527-pub/st2065-2-2020.pdf>
- SMPTE ST 2065-3:2020 — <https://pub.smpte.org/pub/st2065-3/st2065-3-2020.pdf>
- SMPTE RP 180:1999 — <https://pub.smpte.org/pub/rp180/rp0180-1999_stable2006.pdf>
- ACES《Background on ADX Channel Gains》 — <https://community.acescentral.com/uploads/default/original/2X/b/bb88519b27540c6015a330b6665523e33f493b6e.pdf>
- colour-science `log_encoding_Cineon` — <https://github.com/colour-science/colour/blob/develop/colour/models/rgb/transfer_functions/cineon.py>
- ACESCentral《ADX to XYZ 3x3 matrix》（Nick Shaw 关于 Relative Exposure 的说明） — <https://community.acescentral.com/t/adx-to-xyz-3x3-matrix/4171>
- ACESCentral《Film stock/ADX10 Gamut》（Kevin Wheatley 关于「不是显式文档、是解释」） — <https://community.acescentral.com/t/film-stock-adx10-gamut/3855/5>
- 本地实现：`.tmp/colourspaces/{ADX,ADX16,FilmLight_CPD_GenericNegative,FilmLight_PDLog_ADX,ARRI_LogC_FG_full}.flspace`
- 本地原文（2026-11-10 核对，与上列 URL 的下载件 sha1 一致）：
  - `~/Downloads/SMPTE standards document 202606/rp180/19990423-pub/rp0180-1999_stable2006.pdf`（3 页，sha1 `3ff70ab4…`）
  - `~/Downloads/SMPTE standards document 202606/st2065-2/20200527-pub/st2065-2-2020.pdf`（9 页，含 NOTE 3 与 Annex A）
  - 同目录另有 `st2065-1-2021.pdf`（20 页，AP0 原色见 Table 1）、`st2065-3-2020.pdf`（8 页，ADX 式 1/2）、`st2065-4-2023.pdf`、`st2065-5-2023.pdf`
  - 数据包：`st2065-2/20200527-pub/st2065-2-20200527-pub.zip` → 内层 zip 含 `st2065-2a-2020.csv`（APD 光谱响应）与 `st2065-2b-2020.csv`（印片光源 S_APD）
- 对照实现：`.tmp/colourspaces/VonKriesLMS.flspace`（DisplayName「Von Kries: linear / LMS」，`Invisible = 1`，与 CPD 同矩阵）
- 交叉验证：`~/Documents/davinci-cst-re/oracle/out/dec_29/out.npy`（Resolve Studio 21 的 REDlogFilm 解码实测，256 点）
