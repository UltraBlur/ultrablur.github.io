+++
title = "CAT02"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 2004
standard = "CIE 159:2004 · CIE 15:2018 式 D.8"
standardEn = "CIE 159:2004 · CIE 15:2018, Equation D.8"
cone = "锐化锥体（CAT02）"
coneEn = "CAT02 sharpened cone space"
matrix = [[0.7328, 0.4296, -0.1624], [-0.7036, 1.6975, 0.0061], [0.0030, 0.0136, 0.9834]]
matrixInv = [[1.096123820836, -0.278869000218, 0.182745179383], [0.454369041975, 0.473533154307, 0.072097803717], [-0.009627608738, -0.005698031216, 1.015325639955]]
srcWhite = "D65"
dstWhite = "D50"
intro = "CIECAM02 的色适应矩阵；高饱和刺激会给出负的锥体响应。"
dNote = "D = F·[1 − (1/3.6)·exp(−(L_A + 42)/92)]（CIE 15:2018 式 D.1），F 取 1 / 0.9 / 0.8，结果截到 0–1。"
dNoteEn = "D = F·[1 − (1/3.6)·exp(−(L_A + 42)/92)] (CIE 15:2018, Equation D.1), F = 1 / 0.9 / 0.8, clipped to 0–1."
sources = [
  { title = "CIE 15:2018 — Colorimetry, 4th edition（Annex D.1，式 D.1–D.9）", url = "https://cie.co.at/publications/colorimetry-4th-edition" },
  { title = "CIE 159:2004 — A colour appearance model for colour management systems: CIECAM02", url = "https://cie.co.at/publications/colour-appearance-model-colour-management-systems-ciecam02" },
  { title = "Brill, M. H., & Süsstrunk, S. (2008). Repairing gamut problems in CIECAM02: A progress report. Color Research & Application, 33(5), 424–426.", url = "https://doi.org/10.1002/col.20432" }
]
+++

## 在 CIECAM02 里的位置

CIECAM02 的顺序是：**先转进 CAT02 空间 → 按适应度 D 逐通道缩放（朝模型内部基准等能白 `X_wr = Y_wr = Z_wr = 100` 对齐）→ 转到 HPE 空间 → 再做非线性亮度压缩**（CIE 15:2018 式 D.1、D.2、D.6、D.7、D.18）。也就是说，色适应和亮度适应不在同一个空间里完成。

本页的 D65 → D50 矩阵，是把 CAT02 单独抽出来当纯色度适应用、目标白取 D50 时的形式。

## 负响应

M 的第一行是 0.7328 / 0.4296 / −0.1624，第三项为负，所以深蓝光在原始 CAT02 响应里容易掉到 0 以下。比如 470 nm 单色光（Y = 100，XYZ = 214.73 / 100.00 / 1415.3）送进 CAT02：

```
R = −29.5    G = 27.3    B = 1393.8
```

要注意的是，**原始 CAT02 出现负值，不等于后面送进亮度压缩的 HPE 响应也一定是负的**（例如 D65、L_A = 20 下这个 470 nm 样品适应并换到 HPE 后三路均为正）。只有当换到 HPE 空间后响应仍然为负时，CIECAM02 才会走 CIE 15:2018 式 D.18 的保号压缩分支（取绝对值压缩后再恢复负号）。Brill & Süsstrunk (2008) 讨论的是由此引发的部分色域与逆变换问题，修补方式见 [CAT02 Brill 2008](/cat/cat02-brill/)；CAM16 则干脆把两步合并到一个空间里，见 [CAT16 页](/cat/cat16/)。
