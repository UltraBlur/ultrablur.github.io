+++
title = "基本问题"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-prose"
catViz = true
sources = [
  { title = "CIE 15:2018 — Colorimetry, 4th edition（Annex D，式 D.1、D.2、D.14、D.15）", url = "https://cie.co.at/publications/colorimetry-4th-edition" },
  { title = "CIE 159:2004 — A colour appearance model for colour management systems: CIECAM02", url = "https://cie.co.at/publications/colour-appearance-model-colour-management-systems-ciecam02" },
  { title = "CIE 109-1994 — A method of predicting corresponding colours under different chromatic and illuminance adaptations" },
  { title = "Li, C., Luo, M. R., Rigg, B., & Hunt, R. W. G. (2002). CMC 2000 chromatic adaptation transform: CMCCAT2000. Color Research & Application, 27(1), 49–58.", url = "https://doi.org/10.1002/col.10005" },
  { title = "Brill, M. H., & Süsstrunk, S. (2008). Repairing gamut problems in CIECAM02: A progress report. Color Research & Application, 33(5), 424–426.", url = "https://doi.org/10.1002/col.20432" },
  { title = "Bianco, S., & Schettini, R. (2010). Two new von Kries based chromatic adaptation transforms found by numerical optimization. Color Research & Application, 35(3), 184–192.", url = "https://doi.org/10.1002/col.20573" },
  { title = "Zhai, Q., & Luo, M. R. (2018). Study of chromatic adaptation via neutral white matches on different viewing conditions. Optics Express." }
]
+++

两组色刺激，如果在一组观看条件下看第一组、在另一组观看条件下看第二组，看起来一样，这两组就互为**对应色**（corresponding colours）。色适应变换（CAT）预测的就是这层关系：给定源白与参考白，把一组 XYZ 换成参考白下的对应色。

下面的符号沿用 CIE 15:2018 Annex D（那一节写的是 CIECAM02 的 CAT02）。本站为了方便把十条变换放在同一口径下横向比较，统一用这一套线性对照式（换不同矩阵 M）；但这不代表各模型原论文都只是“换一个 M”，像原始 Bradford 蓝通道带非线性，CMCCAT2000 完整式另带亮度因子，CIECAM02/CAM16 还有后续色貌步骤。三刺激值一律按 Y 归一到 100。

## 一般式

<div class="c-eq">
  <span class="c-eq-l">(R<sub>w</sub>, G<sub>w</sub>, B<sub>w</sub>)ᵀ = M · XYZ<sub>w</sub></span>
  <span class="c-eq-r">源白进锥体空间（式 D.1）</span>
  <span class="c-eq-l">(R<sub>wr</sub>, G<sub>wr</sub>, B<sub>wr</sub>)ᵀ = M · XYZ<sub>wr</sub></span>
  <span class="c-eq-r">参考白（即目标白）同样算一次（式 D.1）</span>
  <span class="c-eq-l">D<sub>R</sub> = D · R<sub>wr</sub>/R<sub>w</sub> + 1 − D</span>
  <span class="c-eq-r">三路各一，D 是色适应程度（式 D.2）</span>
  <span class="c-eq-l">(R, G, B)ᵀ = M · XYZ</span>
  <span class="c-eq-r">样品进同一个空间（式 D.14）</span>
  <span class="c-eq-l">(R<sub>c</sub>, G<sub>c</sub>, B<sub>c</sub>)ᵀ = diag(D<sub>R</sub>, D<sub>G</sub>, D<sub>B</sub>) · (R, G, B)ᵀ</span>
  <span class="c-eq-r">逐通道相乘（式 D.15）</span>
  <span class="c-eq-l">(X<sub>c</sub>, Y<sub>c</sub>, Z<sub>c</sub>)ᵀ = M⁻¹ · (R<sub>c</sub>, G<sub>c</sub>, B<sub>c</sub>)ᵀ</span>
  <span class="c-eq-r">回到三刺激值</span>
</div>

下标：w 是源白，wr 是参考白（reference white），c 是适应后的值。D 是色适应程度（标量，0–1），D_R、D_G、D_B 是三个系数。两个名字撞在一起是 CIE 的写法，读的时候要分开：等号左边是系数，右边第一项里的 D 是程度。

## 三个系数

系数只回答一个问题：源白的这一路响应，要乘几倍才能变成参考白的响应。完全适应（D = 1）时就是

```
D_R = R_wr / R_w        D_G = G_wr / G_w        D_B = B_wr / B_w
```

它们只由两个白点决定，与样品无关——所以一张图上的所有颜色共用同一组系数。不完全适应只是把每个系数朝 1 拉：`D_R = D · R_wr/R_w + 1 − D`，D 越小，白得越不彻底；D = 0 时三个系数都等于 1，变换退化成恒等。

## 有效锥体光谱灵敏度

把 M 直接作用到 CIE 1931 2° 的光谱三刺激值上，就得到这条变换下的三条有效锥体灵敏度曲线。它们不是生理学上测得的锥体基函数，而是「这组矩阵把光谱看成什么样」的可视化：锐化会让峰更窄、通道重叠更小，也会在蓝绿区拉出负瓣。

{{< cat-cones >}}

负瓣不是绘图 bug：它说明某些单色光在这个通道上会算出负数。CAT02 在 470 nm 附近最明显；Brill 2008 只改了第三行，所以 ρ 的负瓣还在；Bianco PC 2010 在优化时加了负响应惩罚，把肉眼可见的负瓣基本压平（已舍入矩阵在 389 nm 仍留有约 −1.5×10⁻⁶ 的极小负值）。

## 十条变换差多少

同一个样品（D65 下 XYZ = 16.67 / 20.00 / 30.00，xy 0.25 / 0.30）用十条变换各走一遍，取 D = 1：

{{< cat-compare >}}

十条里 X_c 的极差主要来自两端：XYZ Scaling 直接在 XYZ 上缩放，Bianco PC 又把 X 拉向另一侧；去掉这两条后，锥体变换彼此只差百分之一量级。Z_c 的差异更小，D_B 都落在「约四分之三」附近。换成哪一条只影响白点附近几个百分点，不改变「D65 的白比 D50 蓝得多，蓝响应要乘掉约四分之一」这件事。单条变换的逐行演算见各条目页的「逐步演算」。

## 白点

源白与参考白都写成 xy，再换 XYZ。站内用四位小数：D65 为 0.3127 / 0.3290，D50 为 0.3457 / 0.3585；更高精度写作 0.312 71 / 0.329 02 与 0.345 67 / 0.358 50。条目页的等效矩阵据此算出，两个白点相同就不需要变换。

## 色适应程度 D

**CIECAM02**（CIE 15:2018 式 D.1）：

```
D = F · [1 − (1/3.6) · exp(−(L_A + 42)/92)]
```

F 是环绕因子，平均 1.0、昏暗 0.9、黑暗 0.8（CIE 159:2004），L_A 是适应场亮度（cd/m²）。算出的 D 大于 1 或小于 0 时，按同一条的规定截到 1 或 0。D 只由观看条件决定，与两个白点无关。

**CMCCAT2000**（Li et al. 2002）：它同时要源、参考两个适应场的亮度 L_A1、L_A2，

```
D = F · [ 0.08·log₁₀(0.5(L_A1 + L_A2))
        + 0.76 − 0.45·(L_A1 − L_A2)/(L_A1 + L_A2) ]
```

同样截到 0–1。它的系数式里不直接用 D，而用亮度因子 a = D · Y_w/Y_wr：

```
D_R = a · R_wr/R_w + 1 − D
```

两个白点都归一到 Y = 100 时 a = D，就回到上面的式子。

**CIE 109-1994** 不把适应程度压成一个标量：它按测试与参考的照度 E_o1、E_o2、背景亮度因子 Y_o 和各锥体响应逐项算有效适应响应，没有上面那种 D。

## 单步与两步

上面的一般式只描述「源条件 → 参考条件」一次缩放。源、目标两个观看条件各自的适应程度不同（D_b ≠ D_d）时，单步写法把两个状态折进一个 D，换一个方向再算一遍不会严格回到原值。

Zhai & Luo (2018) 把它拆成两步：先按源适应度 D_b 把样品从源白送到基线照明体（通常取等能白 E），再按目标适应度 D_d 从基线送到目标白。因为源、目标各自只看自己的适应度，交换源和目标并保留各自参数（D_b、D_d 互换）时往返严格对称；当 D_b = D_d = 0 时退化为恒等，当 D_b = D_d = 1 时基线精确消去，回到标准的完全适应。

{{< cat-twostep >}}

右图把源白 A 本身当作样品：红色虚线是只用 D_b 的单步落点，蓝色实线是经 E 的两步落点。两条路径在白点附近看起来接近，但把 D_b、D_d 拉开后，单步落点会系统性偏在一侧——这不是数值误差，是模型结构不同。

## 这个形状的边界

- **CIECAM02 的色适应和亮度适应分在两个空间里做**。先用 `M_CAT02` 把刺激转进 CAT02 空间，按 D 做逐通道缩放（参考白固定为等能白 `X_wr = Y_wr = Z_wr = 100`，是模型内部基准），再经 `M_HPE · M_CAT02⁻¹` 转到 HPE 空间做非线性亮度压缩（式 D.6、D.7、D.18）。条目页上的「D65 → D50」矩阵，是把 CAT02 单独抽出来当纯色度适应用时的形式。
- **只作用在三刺激值上，是线性变换，不含光谱**。两个在 D65 下同色的样品，换到窄带光源下未必仍然同色；这类同色异谱（metamerism）的失配，任何 3×3 的 CAT 都预测不了。白点之外的观看条件（亮度、周边）只通过 D 进来。
- **Bradford 在这里是线性化版本**。Lam (1985) 原式的蓝通道带一个非线性项 `p = (B_w/B_wr)^0.0834`；ICC.1:2010 附录 E 推荐使用把蓝通道线性化的矩阵，本站各页与 colour-science 的 `bradford` 都用后者。两者在白点附近差别很小，在大跨度蓝端白点变换时会分开。
- **不保证非负**。M 的行里有负系数，高饱和刺激可能算出负的锥体响应。需要注意：原始 CAT02 出现负值，不等于适应并换到 HPE 空间后一定还是负值；只有在送进非线性压缩的 HPE 响应仍为负时，才走 CIE 15:2018 式 D.18 的保号压缩分支（例子见 CAT02 页）。
