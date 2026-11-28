+++
title = "Bianco–Schettini"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 2010
standard = "Bianco & Schettini 2010"
cone = "锐化锥体（数值优化）"
coneEn = "Sharpened cone space found by numerical optimisation"
matrix = [[0.8752, 0.2787, -0.1539], [-0.8904, 1.8709, 0.0195], [-0.0061, 0.0162, 0.9899]]
matrixInv = [[0.991970834186, -0.149130503032, 0.157159668846], [0.472116251613, 0.463616479189, 0.064267269198], [-0.001613558125, -0.008506195607, 1.010119753732]]
srcWhite = "D65"
dstWhite = "D50"
intro = "用数值优化找出来的一组锥体响应；论文给了两组解。"
dNote = "D = 1。"
dNoteEn = "D = 1."
sources = [
  { title = "Bianco, S., & Schettini, R. (2010). Two new von Kries based chromatic adaptation transforms found by numerical optimization. Color Research & Application, 35(3), 184–192.", url = "https://doi.org/10.1002/col.20573" }
]
+++

## 两个版本

论文给了两组解。本页的 M 是第一组，第二组的矩阵是：

```
[ 0.6489 0.3915 -0.0404 ]
[ -0.3775 1.3055 0.0720 ]
[ -0.0271 0.0888 0.9383 ]
```

第二组解独立成页：[Bianco PC 2010](/cat/bianco-pc/)。
