+++
title = "CAT16"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
variant = "en"
ref = "cat16"
intro = "The CAT of CAM16, which completes colour and luminance adaptation in a single space."
sources = [
  { title = "Li, C., Li, Z., Wang, Z., Xu, Y., Luo, M. R., Cui, G., Melgosa, M., Brill, M. H., & Pointer, M. (2017). Comprehensive color solutions: CAM16, CAT16, and CAM16-UCS. Color Research & Application, 42(6), 703–718.", url = "https://doi.org/10.1002/col.22131" }
]
+++

## How it differs from CAT02

CAM16 completes colour and luminance adaptation in the **same space**, and CAT16 is the step that replaces CAT02 (Li et al. 2017). CIECAM02 does it in two: CAT02 for chromatic adaptation, then the HPE space for luminance adaptation. So CAT16 is not a tweak of CAT02 — it is that half of a different structure.

Inside CAM16 the target of this scale is the neutral response Y_w (the white point's Y in all three channels), so the D65 → D50 matrix on this page is again the pure-chromatic-adaptation form.

## Negative responses

Some saturated stimuli produce negative responses under CAT02 (see the CAT02 page). The same stimulus is positive under CAT16:

| 470 nm monochromatic, Y = 100 | R | G | B |
| --- | --- | --- | --- |
| CAT02 | −29.5 | 27.3 | 1393.8 |
| CAT16 | 78.4 | 131.6 | 1353.4 |

Scanning monochromatic stimuli from 380 nm to 780 nm at 1 nm steps (each normalised to Y = 100), 252 of them have at least one negative channel under CAT02; none do under CAT16.
