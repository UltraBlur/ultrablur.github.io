+++
title = "CMCCAT2000"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 2002
standard = "Li, Luo, Rigg & Hunt 2002"
cone = "锐化锥体（CMCCAT2000）"
coneEn = "CMCCAT2000 sharpened cone space"
matrix = [[0.7982, 0.3389, -0.1371], [-0.5918, 1.5512, 0.0406], [0.0008, 0.0239, 0.9753]]
matrixInv = [[1.076450048679, -0.237662388093, 0.161212339414], [0.410964325480, 0.554341804147, 0.034693870373], [-0.010953765424, -0.013389356309, 1.024343121733]]
srcWhite = "D65"
dstWhite = "D50"
intro = "CMC 色差体系的 CAT；完整式比纯 von Kries 多一个亮度因子。"
dNote = "D = F·[0.08·log₁₀(0.5(L_A1+L_A2)) + 0.76 − 0.45(L_A1−L_A2)/(L_A1+L_A2)]，截到 0–1。系数式里不直接用 D，而用亮度因子 a = D·Y_w/Y_wr：D_R = a·R_wr/R_w + 1 − D。"
dNoteEn = "D = F·[0.08·log₁₀(0.5(L_A1+L_A2)) + 0.76 − 0.45(L_A1−L_A2)/(L_A1+L_A2)], clipped to 0–1. The coefficients use a luminance factor a = D·Y_w/Y_wr rather than D itself: D_R = a·R_wr/R_w + 1 − D."
sources = [
  { title = "Li, C., Luo, M. R., Rigg, B., & Hunt, R. W. G. (2002). CMC 2000 chromatic adaptation transform: CMCCAT2000. Color Research & Application, 27(1), 49–58.", url = "https://doi.org/10.1002/col.10005" }
]
+++

## 两个观看条件

CMCCAT2000 是少数同时要源与目标两个观看条件的 CAT：D 由 L_A1、L_A2 一起算（平均亮度进对数，亮度差进最后一项），再乘上亮度因子 a = D·Y_w/Y_wr。系数因此写成 D_R = a·R_wr/R_w + 1 − D；两个白点都归一到 Y = 100 时 a = D，退化成 D_R = D·R_wr/R_w + 1 − D，与 CIE 15:2018 式 D.2 同形。本页的 D65 → D50 矩阵取 D = 1。
