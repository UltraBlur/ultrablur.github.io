+++
title = "CAT02 Brill 2008"
date = 2026-11-28T14:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 2008
standard = "Brill & Süsstrunk 2008"
cone = "锐化锥体（CAT02，第三行改为 [0, 0, 1]）"
coneEn = "CAT02 sharpened cone space with the third row set to [0, 0, 1]"
matrix = [[0.7328, 0.4296, -0.1624], [-0.7036, 1.6975, 0.0061], [0, 0, 1]]
matrixInv = [[1.097856663006, -0.277843430001, 0.179986766995], [0.455052694015, 0.473937768867, 0.071009537118], [0, 0, 1]]
srcWhite = "D65"
dstWhite = "D50"
intro = "Brill 与 Süsstrunk 对 CAT02 的修补：前两行不动，把第三行从 [0.0030, 0.0136, 0.9834] 换成 [0, 0, 1]，用来缓解 CIECAM02 的部分色域问题。"
dNote = "沿用 CIECAM02 的 D 式子（CIE 15:2018 式 D.1）；Brill 修正只改 M 的第三行，不改 D。"
dNoteEn = "Same D as CIECAM02 (CIE 15:2018, Equation D.1); the Brill repair changes only the third row of M, not D."
sources = [
  { title = "Brill, M. H., & Süsstrunk, S. (2008). Repairing gamut problems in CIECAM02: A progress report. Color Research & Application, 33(5), 424–426.", url = "https://doi.org/10.1002/col.20432" },
  { title = "CIE 159:2004 — A colour appearance model for colour management systems: CIECAM02", url = "https://cie.co.at/publications/colour-appearance-model-colour-management-systems-ciecam02" }
]
+++

## 改了什么

与 CAT02 相比只动第三行：

```
CAT02        [ 0.7328  0.4296 -0.1624 ]
             [ -0.7036 1.6975  0.0061 ]
             [ 0.0030  0.0136  0.9834 ]

CAT02 Brill  [ 0.7328  0.4296 -0.1624 ]
             [ -0.7036 1.6975  0.0061 ]
             [ 0.0000  0.0000  1.0000 ]
```

换成 `[0, 0, 1]` 之后，蓝通道直接取 Z，不再掺入原来的少量 X、Y（原第三行 `[0.0030, 0.0136, 0.9834]` 本身全为正，但和前两行耦合时在极端色域边界会放大越界问题）。Brill 与 Süsstrunk 用这个改动改善了论文讨论的部分色域与逆变换越界问题，但它不是对所有色域问题的彻底解决——前两行的负响应和其他限制依然存在。

## 没改什么

前两行的负系数原样保留。所以 470 nm 附近的 ρ 负瓣仍然存在（见 CAT02 页与索引页的锥体灵敏度图）；这条修正针对的是 CIECAM02 的色域与逆变换，不是「锥体响应出现负值」这件事本身。把灵敏度图的主变换在 CAT02 与 CAT02 Brill 之间切换，变化只出现在 β 曲线，ρ、γ 两条完全不动。

## 与 CAT02 的取舍

CAT02 Brill 不是一条独立提出的新 CAT，而是对 CAT02 的局部修补。需要与 CIECAM02 的原始定义逐项对拍时用 CAT02；需要缓解第三行带来的部分色域问题时可以参考这一版，但遇到前两行负响应或其他边界情况时仍会受限。两者对白点的映射相同，对普通颜色的适应结果只在蓝通道有轻微差别。

D65 → D50 的等效矩阵见上方；本页按完全适应（D = 1）给出。
