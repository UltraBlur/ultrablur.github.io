+++
title = "Bianco PC 2010"
date = 2026-11-28T14:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
variant = "en"
ref = "bianco-pc"
intro = "The second solution from Bianco and Schettini: a positive constraint on the cone sensitivities, pressing the negative lobes down to almost nothing."
sources = [
  { title = "Bianco, S., & Schettini, R. (2010). Two new von Kries based chromatic adaptation transforms found by numerical optimization. Color Research & Application, 35(3), 184–192.", url = "https://doi.org/10.1002/col.20573" }
]
+++

## The second of two solutions

The paper gives two matrices. The first is the unconstrained numerically optimised solution (see the Bianco–Schettini page); the second is the positive-constrained (PC) solution on this page. Both optimise the same objective — make the transform's predicted corresponding colours match the experimental data — and differ only in the constraint.

```
unconstrained  [ 0.8752  0.2787 -0.1539 ]
               [ -0.8904 1.8709  0.0195 ]
               [ -0.0061 0.0162  0.9899 ]

PC             [ 0.6489  0.3915 -0.0404 ]
               [ -0.3775 1.3055  0.0720 ]
               [ -0.0271 0.0888  0.9383 ]
```

The matrix itself still contains negative entries — sharpened cone spaces generally need them to separate the channels. The paper adds a **negative-response penalty** during optimisation to push the three CIE 1931 2° spectral sensitivity curves nearly above zero, rather than proving strict non-negativity for every possible XYZ input.

## Where the negative lobe went

The unconstrained first row [0.8752, 0.2787, −0.1539] drives ρ clearly negative at the blue end; the PC row [0.6489, 0.3915, −0.0404] shrinks that negative entry so visible negative lobes almost disappear (checking the rounded four-decimal matrix from 380–780 nm at 1 nm steps still leaves a tiny −1.5×10⁻⁶ dip at 389 nm). On the index page's cone chart, switching the main transform to Bianco PC 2010 removes the visible negative-lobe shading — the clearest difference from Bradford, CAT02 and Sharp.

## Cost and use

The constraint consumes part of the fitting freedom, so this is not uniformly better than the unconstrained solution on every corresponding-colour dataset; it is chosen for the shape of its responses, when downstream processing (gamut mapping, the powers and logarithms inside appearance models) would rather not meet a negative cone response. It is still a linear 3×3 transform acting on tristimulus values, and it does not address metamerism.

White-point mapping is as exact as any other transform here: the D65 → D50 equivalent matrix at D = 1 is shown above.
