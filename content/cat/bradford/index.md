+++
title = "Bradford"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = 1985
standard = "Lam 1985 · ICC.1:2010 Annex E"
cone = "锐化锥体（Bradford）"
coneEn = "Bradford sharpened cone space"
matrix = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]]
matrixInv = [[0.986992905467, -0.147054256421, 0.159962651664], [0.432305269723, 0.518360271537, 0.049291228213], [-0.008528664575, 0.040042821654, 0.968486695788]]
srcWhite = "D65"
dstWhite = "D50"
intro = "把 XYZ 换成锐化锥体空间再逐通道缩放；ICC.1:2010 附录 E 的 PCS 白点适应矩阵就是它。"
dNote = "常用的是完全适应（D = 1）；要写不完全适应，一般套 CIECAM02 的 D 式子（CIE 15:2018 式 D.1）。"
dNoteEn = "Complete adaptation (D = 1) is the usual case; for incomplete adaptation the CIECAM02 D formula (CIE 15:2018, Equation D.1) is the usual extension."
sources = [
  { title = "Lam, K. M. (1985). Metamerism and colour constancy (PhD thesis). University of Bradford." },
  { title = "ICC.1:2010 — Annex E: Chromatic adaptation", url = "https://www.color.org/specification/ICC1v43_2010-12.pdf" }
]
+++
