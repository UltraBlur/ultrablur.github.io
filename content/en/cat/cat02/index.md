+++
title = "CAT02"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
variant = "en"
ref = "cat02"
intro = "The CAT of CIECAM02 — and the step where saturated stimuli can produce negative cone responses."
sources = [
  { title = "CIE 159:2004 — A colour appearance model for colour management systems: CIECAM02", url = "https://cie.co.at/publications/colour-appearance-model-colour-management-systems-ciecam02" }
]
+++

## Where it sits in CIECAM02

CIECAM02 runs in four steps: **transform into CAT02 space → scale each channel by D toward the model's internal equal-energy white (`X_wr = Y_wr = Z_wr = 100`) → convert into HPE space → apply non-linear luminance compression** (CIE 15:2018 Equations D.1, D.2, D.6, D.7 and D.18). Colour and luminance adaptation therefore happen in two different spaces.

The D65 → D50 matrix on this page is CAT02 pulled out as a standalone chromatic adaptation with D50 as the target.

## Negative responses

The first row of M is 0.7328 / 0.4296 / −0.1624; the negative third entry lets R drop below zero for deep blues. A 470 nm monochromatic stimulus (Y = 100, XYZ = 214.73 / 100.00 / 1415.3) gives

```
R = −29.5    G = 27.3    B = 1393.8
```

Note that **a negative raw CAT02 response does not automatically mean the HPE response entering luminance compression is also negative** (for this 470 nm stimulus under D65 and L_A = 20, all three adapted HPE responses are positive). Only when an HPE response remains negative does CIECAM02 take CIE 15:2018 Equation D.18's sign-preserving branch (compress the absolute value, then restore the minus sign). Brill & Süsstrunk (2008) address part of the resulting gamut problems ([CAT02 Brill 2008](/en/cat/cat02-brill/)), while [CAT16](/en/cat/cat16/) merged both steps into a single space.
