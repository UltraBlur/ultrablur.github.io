+++
title = "FilmLight Cineon PD Log / Generic Negative"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
intro = "通用摄影负片的近似响应：扫描仪按 Cineon 标定、假定理想 SMPTE 印片密度；光谱灵敏度取自一种通用现代底片。它不是色域定义，下面的矩阵也不是 RGB → XYZ。"
category = "Scene Referred"
sourceSpace = "FilmLight_CPD_GenericNegative.flspace"
gamutNote = "这里不画色度图：矩阵是 Von Kries 锥体空间的逆（见正文），三列落在 alychne 与 y=0 线上，没有一个是可见色。"
matrixLabel = "LMS → XYZ（Von Kries 锥体空间）"
matrixLabelEn = "LMS → XYZ (Von Kries cone space)"
matrix = [[1.85994, -1.12938, 0.21990], [0.36119, 0.63881, 0.0], [0.0, 0.0, 1.08906]]
+++

## 这是什么

FilmLight 色彩空间库里的一条近似条目。文件自己的说明：

> This is an approximate original camera negative film response scanned on a film scanner calibrated to Cineon assuming ideal SMPTE Printing Density. A generic modern film stock was used for the spectral sensitivity. Tone Curve: Cineon Printing Density Log. Primaries: Spectral sensitivity of generic modern camera negative stock. Reference white at 68.5%

三句话对应三件事：曲线是 Cineon 印片密度对数；「密度」按理想 APD 理解（真实扫描仪的偏差不在这里表达）；光谱灵敏度用的是「一种通用现代底片」，不对应任何具体型号。

**没有公开规范**：下面的数值全部来自 `.flspace` 的实现，属于 FilmLight 自己的近似，不是 SMPTE 内容。

## 三段实现

```text
convertToLinear:
  P = rgb × Dye Absorption Matrix（K. Vision 5207）
  P = Cineon 曲线（线性趾部 / 指数段）
  P = P × K. Spectral Sensitivity
convertFromLinear: 反向顺序
```

```text
Dye Absorption（正向）  0.81129611  0.16813581  0.02056807
                        0.0848841   0.77211884  0.14299706
                        0.07672217  0.21710741  0.70617042

K. Spectral Sensitivity 0.38306     0.68160981 −0.06466981
                        0.16551671  0.81607662  0.01840668
                       −0.05766855  0.05788586  0.99978269
```

两条矩阵的行和都是 1，所以三通道相等的中性在每步之后仍然中性。

## 曲线

Cineon 曲线，黑点 95、白点 685，约 300 个码值 / decade。它与公开实现逐位一致：

- `colour-science` 的 `log_encoding_Cineon(0.18) = 0.45732`，本文件给出 0.45731；
- 本机 Resolve Studio 21 的 REDlogFilm 解码实测（REDlogFilm 就是这条曲线）与 `(10^((1023x−685)/300) − b)/(1−b)`、`b = 10^(−590/300)` 逐点相差不超过 5.5×10⁻⁶。

曲线在 18% 灰处落在 0.4573，线性 1.0 落在 0.6696（= 685/1023）。

**参考白 68.5% 是 685/1000**，不是 685/1023（= 67.0%）。FilmLight 的百分比口径按 1000 计，与 10 位码值不是同一个分母。

## 为什么没有色度图

页面下方那个矩阵，`RGB_XYZ`，看起来像 RGB → XYZ，其实不是：

```text
RGB_XYZ = inv(HPE)
```

HPE 是注释里给的 Von Kries（Hunt-Pointer-Estevez）矩阵：

```text
0.40024   0.70760  −0.08081
−0.22630  1.16532   0.04570
0.00000   0.00000   0.91822
```

求逆再乘 (1,1,1) 得到 (0.950451, 0.999998, 1.089064)——D65；与文件里的矩阵逐项差不超过 6.4×10⁻⁶。同库还有一份 `VonKriesLMS.flspace`（DisplayName「Von Kries: linear / LMS」，带 `Invisible = 1`），用的是同一个矩阵。

也就是说：**这条空间的「线性」其实是 LMS（锥体响应），不是 RGB**——底片的光谱灵敏度完全收在上面那条 `K. Spectral Sensitivity` 里，`RGB_XYZ` 不含任何底片信息——换一种底片，这个矩阵一个数都不会变。

三列因此是 HPE 的几何：

| | x | y | 结构 |
| --- | --- | --- | --- |
| R（L） | 0.8374 | 0.1626 | Z = 0，在 alychne 上（x + y = 1） |
| G（M） | 2.3022 | −1.3022 | Z = 0，在 alychne 上（x + y = 1） |
| B（S） | 0.1680 | 0.0000 | Y = 0，在 y = 0 线上 |

所以这里既画不出色域三角形，也不该画：**「原色」在这个条目里没有色域含义**。想知道胶片本身的色彩，得看扫描仪、底片和印片条件，那是另一套东西。
