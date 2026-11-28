+++
title = "CAT16"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 2017
standard = "Li et al. 2017"
cone = "锐化锥体（CAT16）"
coneEn = "CAT16 sharpened cone space"
matrix = [[0.401288, 0.650173, -0.051461], [-0.250268, 1.204414, 0.045854], [-0.002079, 0.048952, 0.953127]]
matrixInv = [[1.862067855087, -1.011254630532, 0.149186775444], [0.387526543236, 0.621447441931, -0.008973985168], [-0.015841498849, -0.034122938029, 1.049964436878]]
srcWhite = "D65"
dstWhite = "D50"
intro = "CAM16 的色适应矩阵；色适应与亮度适应放在同一个空间完成。"
dNote = "沿用 CIECAM02 的 D 式子（CIE 15:2018 式 D.1）；差别只在 M。"
dNoteEn = "Same D as CIECAM02 (CIE 15:2018, Equation D.1); the only difference is M."
sources = [
  { title = "Li, C., Li, Z., Wang, Z., Xu, Y., Luo, M. R., Cui, G., Melgosa, M., Brill, M. H., & Pointer, M. (2017). Comprehensive color solutions: CAM16, CAT16, and CAM16-UCS. Color Research & Application, 42(6), 703–718.", url = "https://doi.org/10.1002/col.22131" }
]
+++

## 和 CAT02 的差别

CAM16 把色适应与亮度适应放到**同一个空间**里完成，CAT16 就是替换 CAT02 的那一步（Li et al. 2017）。CIECAM02 则分两步：CAT02 做色适应、换到 HPE 空间再做亮度适应。所以 CAT16 矩阵不是对 CAT02 的微调，是换了一套结构后的那一半。

在 CAM16 里，这一步的缩放目标是中性响应 Y_w（三路都取白点的 Y），所以本页的 D65 → D50 矩阵同样是把它当纯色度适应用时的形式。

## 负响应

有的高饱和刺激在 CAT02 里会得到负响应（见 CAT02 页）。同一刺激送进 CAT16 是正的：

| 470 nm 单色光，Y = 100 | R | G | B |
| --- | --- | --- | --- |
| CAT02 | −29.5 | 27.3 | 1393.8 |
| CAT16 | 78.4 | 131.6 | 1353.4 |

按 380–780 nm、1 nm 间隔逐点扫描单色光（各点归一到 Y = 100），CAT02 有 252 个点至少一路为负，CAT16 没有。
