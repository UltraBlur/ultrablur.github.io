+++
title = "Bianco PC 2010"
date = 2026-11-28T14:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 2010
standard = "Bianco & Schettini 2010（正约束解）"
standardEn = "Bianco & Schettini 2010 (positive-constrained solution)"
cone = "锐化锥体（正约束数值优化）"
coneEn = "Sharpened cone space from positive-constrained numerical optimisation"
matrix = [[0.6489, 0.3915, -0.0404], [-0.3775, 1.3055, 0.0720], [-0.0271, 0.0888, 0.9383]]
matrixInv = [[1.312315029860, -0.399472145589, 0.087157115729], [0.379360343522, 0.654530799717, -0.033891143239], [0.001999934780, -0.073481860983, 1.071481926203]]
srcWhite = "D65"
dstWhite = "D50"
intro = "Bianco 与 Schettini 的第二组解：给锥体灵敏度加正约束，把负瓣压到接近零。"
dNote = "D = 1。论文的对应色实验按完全适应处理；要演示不完全适应，可套 CIECAM02 的 D 式子。"
dNoteEn = "D = 1. The paper's corresponding-colour experiment assumes complete adaptation; for incomplete adaptation, the CIECAM02 D formula can be applied."
sources = [
  { title = "Bianco, S., & Schettini, R. (2010). Two new von Kries based chromatic adaptation transforms found by numerical optimization. Color Research & Application, 35(3), 184–192.", url = "https://doi.org/10.1002/col.20573" }
]
+++

## 两组解里的第二组

同一篇论文给了两组矩阵。第一组是无约束的数值优化解（见 Bianco–Schettini 页），第二组是这里的正约束解（positive constrained，PC）。两组的优化目标相同：让变换预测的对应色尽量接近实验数据；差别在约束。

```
无约束   [ 0.8752  0.2787 -0.1539 ]
         [ -0.8904 1.8709  0.0195 ]
         [ -0.0061 0.0162  0.9899 ]

PC       [ 0.6489  0.3915 -0.0404 ]
         [ -0.3775 1.3055  0.0720 ]
         [ -0.0271 0.0888  0.9383 ]
```

矩阵本身仍有负元素——锐化锥体空间通常都需要负元素来拉开通道。论文在优化目标里加入了**负响应惩罚项**，尽量把 CIE 1931 2° 光谱三刺激值经 M 算出的三条灵敏度曲线压回零以上，而不是对任意 XYZ 都保证严格非负。

## 负瓣去哪了

无约束解的第一行 [0.8752, 0.2787, −0.1539] 会在蓝端把 ρ 拉成明显的负值；PC 解把这一行改成 [0.6489, 0.3915, −0.0404]，负系数大幅缩小，肉眼可见的负瓣基本消失（用已舍入的四位小数矩阵在 380–780 nm 逐 nm 验算，389 nm 处仍留有约 −1.5×10⁻⁶ 的极小负值，属于舍入与软惩罚的余量）。在索引页的锥体灵敏度图上把主变换切到 Bianco PC 2010，大片负瓣填充会消失——这是它与 Bradford、CAT02、Sharp 最直观的差别。

## 代价与适用

约束会占用一部分拟合自由度，所以它不是在每个对应色数据集上都优于无约束解；选它的理由通常是响应形状：后续处理（色域映射、模型内的幂次与对数运算）不希望遇到负的锥体响应。它仍然是 3×3 的线性变换，只作用在三刺激值上，不解决同色异谱。

白点映射与其它变换一样精确：D65 → D50、D = 1 的等效矩阵见上方。
