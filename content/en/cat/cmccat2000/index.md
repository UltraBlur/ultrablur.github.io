+++
title = "CMCCAT2000"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
variant = "en"
ref = "cmccat2000"
intro = "The CAT of the CMC colour-difference system; the full model adds a luminance factor."
sources = [
  { title = "Li, C., Luo, M. R., Rigg, B., & Hunt, R. W. G. (2002). CMC 2000 chromatic adaptation transform: CMCCAT2000. Color Research & Application, 27(1), 49–58.", url = "https://doi.org/10.1002/col.10005" }
]
+++

## Two viewing conditions

CMCCAT2000 is one of the few CATs that takes both viewing conditions at once: D is computed from L_A1 and L_A2 together (the mean luminance enters the logarithm, the difference the last term), then multiplied by a luminance factor a = D·Y_w/Y_wr, so the coefficients read D_R = a·R_wr/R_w + 1 − D. With both whites normalised to Y = 100, a = D and that reduces to D_R = D·R_wr/R_w + 1 − D, the same shape as CIE 15:2018 Equation D.2. The D65 → D50 matrix on this page takes D = 1.
