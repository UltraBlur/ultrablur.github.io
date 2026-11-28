+++
title = "von Kries"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 1902
standard = "von Kries 1902"
cone = "HPE（Hunt–Pointer–Estevez），按 D65 归一化"
coneEn = "Hunt–Pointer–Estevez, normalised to D65"
matrix = [[0.40024, 0.70760, -0.08081], [-0.22630, 1.16532, 0.04570], [0, 0, 0.91822]]
matrixInv = [[1.859936387456, -1.129381618580, 0.219897409596], [0.361191436242, 0.638812463285, -0.000006370597], [0, 0, 1.089063623097]]
srcWhite = "D65"
dstWhite = "D50"
intro = "系数律：把 XYZ 换成锥体响应，逐通道乘一个系数，使源白落到参考白上。"
dNote = "系数律本身不带 D；把不完全适应并进式子的做法见「基本问题」页。"
dNoteEn = "The law itself carries no D; folding incomplete adaptation into it is described on the basic-problems page."
sources = [
  { title = "von Kries, J. (1902). Festschrift der Albrecht-Ludwigs-Universität." },
  { title = "Hunt, R. W. G. (2004). The Reproduction of Colour (6th ed.). Wiley." }
]
+++

## 系数律与现代实现

von Kries 在 1902 年提出的是「系数律」思路：把三类锥体响应各自乘一个系数，让源白对齐到目标白。当时还没有 CIE XYZ 和现代锥体基函数，上面展示的 XYZ → HPE 矩阵是后来的现代实现。

HPE 矩阵常见有两种归一化写法：本页这组让 D65 白点映到接近 (1, 1, 1)（按站内四位小数算是 1.000004 / 1.000002 / 0.999995）；CIECAM02 用的那组（CIE 15:2018 式 D.9）第三行是 [0, 0, 1]。理论上两组只差每行一个常数倍（约 1.0270 / 0.9847 / 0.9182），系数律对逐行缩放不变，所以两套 HPE 的适应结果几乎完全一样（仅因系数舍入存在极微小的数值差）。
