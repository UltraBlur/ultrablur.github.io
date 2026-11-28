+++
title = "Sharp"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 2000
standard = "Finlayson & Süsstrunk 2000"
cone = "锐化锥体（Sharp）"
coneEn = "Sharp sharpened cone space"
matrix = [[1.2694, -0.0988, -0.1706], [-0.8364, 1.8006, 0.0357], [0.0297, -0.0315, 1.0018]]
matrixInv = [[0.815633309578, 0.047154778818, 0.137216627082], [0.379114399111, 0.576942424774, 0.044000870357], [-0.012260137475, 0.016743051956, 0.995518759824]]
srcWhite = "D65"
dstWhite = "D50"
intro = "依据视觉对应色实验优化出的光谱锐化色适应矩阵；它的等效响应不等于实测相机或生理锥体响应。"
dNote = "D = 1。"
dNoteEn = "D = 1."
sources = [
  { title = "Finlayson, G. D., & Süsstrunk, S. (2000). Performance of a chromatic adaptation transform based on spectral sharpening. Proc. IS&T/SID 8th Color Imaging Conference, 49–53." }
]
+++

## 来源

Finlayson & Süsstrunk (2000) 用 Lam 的视觉对应色实验数据拟合出这组光谱锐化（spectral sharpening）矩阵，用来替代 HPE 锥体空间。它的三条等效灵敏度曲线是数学优化的结果，不等于实测相机传感器或人眼生理锥体响应；论文据此比较了它与其他 CAT 在对应色预测上的表现。
