+++
title = "CAT02 Brill 2008"
date = 2026-11-28T14:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
variant = "en"
ref = "cat02-brill"
intro = "Brill and Süsstrunk's repair of CAT02: leave the first two rows alone and replace the third row [0.0030, 0.0136, 0.9834] with [0, 0, 1] to ease part of CIECAM02's gamut problems."
sources = [
  { title = "Brill, M. H., & Süsstrunk, S. (2008). Repairing gamut problems in CIECAM02: A progress report. Color Research & Application, 33(5), 424–426.", url = "https://doi.org/10.1002/col.20432" },
  { title = "CIE 159:2004 — A colour appearance model for colour management systems: CIECAM02", url = "https://cie.co.at/publications/colour-appearance-model-colour-management-systems-ciecam02" }
]
+++

## What changes

Only the third row differs from CAT02:

```
CAT02        [ 0.7328  0.4296 -0.1624 ]
             [ -0.7036 1.6975  0.0061 ]
             [ 0.0030  0.0136  0.9834 ]

CAT02 Brill  [ 0.7328  0.4296 -0.1624 ]
             [ -0.7036 1.6975  0.0061 ]
             [ 0.0000  0.0000  1.0000 ]
```

With `[0, 0, 1]` the blue channel is simply Z, without the small X and Y terms (the original third row `[0.0030, 0.0136, 0.9834]` was already all-positive, but coupled with the first two rows at extreme gamut boundaries). This change eases part of the gamut and inverse-transform problems discussed in the paper, though it is not a complete fix for every gamut issue — the negative responses from the first two rows and other limits remain.

## What does not change

The negative coefficients in the first two rows stay exactly as they were. The ρ negative lobe near 470 nm therefore remains (see the CAT02 page and the cone-sensitivity chart on the index page). This repair targets CIECAM02's gamut and inverse-transform problems, not the existence of negative cone responses as such. Switch the cone chart between CAT02 and CAT02 Brill and only the β curve moves; ρ and γ are identical.

## Choosing between them

CAT02 Brill is not an independently proposed CAT but a partial patch on CAT02. Use CAT02 when matching the original CIECAM02 definition term by term; use this version when easing the third-row gamut issue matters, keeping in mind that negative responses from the first two rows still remain. Both map white points identically and differ only slightly in the blue channel for ordinary colours.

The D65 → D50 equivalent matrix is shown above, for complete adaptation (D = 1).
