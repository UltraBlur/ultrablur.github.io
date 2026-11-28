+++
title = "Basic problems"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-prose"
catViz = true
variant = "en"
sources = [
  { title = "CIE 15:2018 — Colorimetry, 4th edition (Annex D, Equations D.1, D.2, D.14, D.15)", url = "https://cie.co.at/publications/colorimetry-4th-edition" },
  { title = "CIE 159:2004 — A colour appearance model for colour management systems: CIECAM02", url = "https://cie.co.at/publications/colour-appearance-model-colour-management-systems-ciecam02" },
  { title = "CIE 109-1994 — A method of predicting corresponding colours under different chromatic and illuminance adaptations" },
  { title = "Li, C., Luo, M. R., Rigg, B., & Hunt, R. W. G. (2002). CMC 2000 chromatic adaptation transform: CMCCAT2000. Color Research & Application, 27(1), 49–58.", url = "https://doi.org/10.1002/col.10005" },
  { title = "Brill, M. H., & Süsstrunk, S. (2008). Repairing gamut problems in CIECAM02: A progress report. Color Research & Application, 33(5), 424–426.", url = "https://doi.org/10.1002/col.20432" },
  { title = "Bianco, S., & Schettini, R. (2010). Two new von Kries based chromatic adaptation transforms found by numerical optimization. Color Research & Application, 35(3), 184–192.", url = "https://doi.org/10.1002/col.20573" },
  { title = "Zhai, Q., & Luo, M. R. (2018). Study of chromatic adaptation via neutral white matches on different viewing conditions. Optics Express." }
]
+++

Two colour stimuli are **corresponding colours** when the first, seen under one viewing condition, looks the same as the second seen under another. A chromatic adaptation transform (CAT) predicts exactly that relation: given a source white and a reference white, it maps XYZ to the corresponding colour under the reference white.

The symbols below follow CIE 15:2018 Annex D (which writes out CIECAM02's CAT02). To compare all ten transforms on one footing, this site uses this same linear reference form with different matrices M. That does not mean every original paper is just "swap M": original Bradford has a non-linear blue channel, full CMCCAT2000 adds a luminance factor, and CIECAM02/CAM16 add appearance steps after adaptation. Tristimulus values are normalised to Y = 100 throughout.

## The general form

<div class="c-eq">
  <span class="c-eq-l">(R<sub>w</sub>, G<sub>w</sub>, B<sub>w</sub>)ᵀ = M · XYZ<sub>w</sub></span>
  <span class="c-eq-r">the source white into cone space (Eq. D.1)</span>
  <span class="c-eq-l">(R<sub>wr</sub>, G<sub>wr</sub>, B<sub>wr</sub>)ᵀ = M · XYZ<sub>wr</sub></span>
  <span class="c-eq-r">the reference white, likewise (Eq. D.1)</span>
  <span class="c-eq-l">D<sub>R</sub> = D · R<sub>wr</sub>/R<sub>w</sub> + 1 − D</span>
  <span class="c-eq-r">one per channel, with D the degree of adaptation (Eq. D.2)</span>
  <span class="c-eq-l">(R, G, B)ᵀ = M · XYZ</span>
  <span class="c-eq-r">the sample, same space (Eq. D.14)</span>
  <span class="c-eq-l">(R<sub>c</sub>, G<sub>c</sub>, B<sub>c</sub>)ᵀ = diag(D<sub>R</sub>, D<sub>G</sub>, D<sub>B</sub>) · (R, G, B)ᵀ</span>
  <span class="c-eq-r">multiplied channel by channel (Eq. D.15)</span>
  <span class="c-eq-l">(X<sub>c</sub>, Y<sub>c</sub>, Z<sub>c</sub>)ᵀ = M⁻¹ · (R<sub>c</sub>, G<sub>c</sub>, B<sub>c</sub>)ᵀ</span>
  <span class="c-eq-r">back to tristimulus values</span>
</div>

Subscripts: w is the source white, wr the reference white, c an adapted value. D is the degree of chromatic adaptation (a scalar, 0–1); D_R, D_G and D_B are the three coefficients. The name collision is CIE's own, so read carefully: on the left of D.2 is a coefficient, and the D inside the first term is the degree.

## The three coefficients

A coefficient answers one question: by how much must this cone response of the source white be multiplied to become the reference white's? At complete adaptation (D = 1) that is simply

```
D_R = R_wr / R_w        D_G = G_wr / G_w        D_B = B_wr / B_w
```

They depend only on the two white points, never on the sample — every colour in the image shares the same three. Incomplete adaptation just pulls each coefficient toward 1: `D_R = D · R_wr/R_w + 1 − D`. Smaller D means a weaker discount; at D = 0 all three coefficients are 1 and the transform collapses to the identity.

## Effective cone sensitivities

Applying M directly to the CIE 1931 2° colour-matching functions gives the three effective cone sensitivity curves of that transform. They are not measured physiological cone fundamentals; they show what the matrix "sees": sharpening narrows the peaks and reduces overlap, and can pull negative lobes out of the blue-green region.

{{< cat-cones >}}

The negative lobe is not a plotting bug: it means some monochromatic lights produce a negative number in that channel. CAT02 is the clearest case near 470 nm; Brill 2008 changes only the third row, so the ρ lobe stays; Bianco PC 2010 adds a negative-response penalty during optimisation to press visible negative lobes nearly flat (the rounded matrix still leaves a tiny −1.5×10⁻⁶ dip at 389 nm).

## How much the ten transforms differ

The same sample (XYZ = 16.67 / 20.00 / 30.00 under D65, xy 0.25 / 0.30) through all ten, with D = 1:

{{< cat-compare >}}

The X_c spread comes mostly from the two ends: XYZ Scaling scales X directly, while Bianco PC pulls it the other way; without those two, the cone transforms differ only in the second decimal. Z_c varies less, and D_B stays around three quarters for all of them. Which transform you pick moves things by a few percent near the white point; it does not change the fact that D65's white is far bluer than D50's, so roughly a quarter of the blue response is discounted. For the line-by-line arithmetic of a single transform, see the worked example on any entry page.

## White points

Source and reference whites are given as xy and converted to XYZ. This site uses four decimals: D65 as 0.3127 / 0.3290 and D50 as 0.3457 / 0.3585, i.e. 0.312 71 / 0.329 02 and 0.345 67 / 0.358 50 at full precision. The equivalent matrices on the entry pages follow from those numbers; identical whites need no transform.

## Degree of adaptation D

**CIECAM02** (CIE 15:2018 Equation D.1):

```
D = F · [1 − (1/3.6) · exp(−(L_A + 42)/92)]
```

F is the surround factor: 1.0 average, 0.9 dim, 0.8 dark (CIE 159:2004); L_A is the adapting field luminance in cd/m². If the computed D exceeds 1 or falls below 0, the same clause clips it to 1 or 0. D follows from the viewing conditions alone, not from the two white points.

**CMCCAT2000** (Li et al. 2002) needs both adapting luminances, L_A1 and L_A2:

```
D = F · [ 0.08·log₁₀(0.5(L_A1 + L_A2))
        + 0.76 − 0.45·(L_A1 − L_A2)/(L_A1 + L_A2) ]
```

also clipped to 0–1. Its coefficients do not use D directly but a luminance factor a = D · Y_w/Y_wr:

```
D_R = a · R_wr/R_w + 1 − D
```

With both whites normalised to Y = 100, a = D and this returns to the expression above.

**CIE 109-1994** does not compress adaptation into a scalar: it computes effective adapting responses term by term from the test and reference illuminances E_o1, E_o2, the background luminance factor Y_o and each cone response. There is no D of the kind above.

## One step and two steps

The general form above describes a single scaling from the source condition to the reference condition. When the two viewing conditions have different degrees of adaptation (D_b ≠ D_d), the one-step form folds both into one D, and running it in the reverse direction does not return exactly to the original.

Zhai & Luo (2018) split it into two steps: first apply D_b from the source white to a baseline illuminant (usually equal-energy E), then apply D_d from the baseline to the target white. Because each side uses its own degree, swapping source and target together with (D_b, D_d) makes the round trip exact; at D_b = D_d = 0 it is the identity, and at D_b = D_d = 1 the baseline cancels exactly and returns to complete adaptation.

{{< cat-twostep >}}

The right-hand chart uses the source white A itself as the sample: the red dashed landing is the one-step result using D_b only, the blue solid path goes through E and uses both D_b and D_d. Near the white point the two look close, but pull D_b and D_d apart and the one-step landing drifts systematically to one side — a difference in model structure, not numerical error.

## Limits of this shape

- **CIECAM02 splits chromatic and luminance adaptation across two spaces.** It maps XYZ into CAT02 space with `M_CAT02`, scales channels by D toward the model's internal equal-energy reference (`X_wr = Y_wr = Z_wr = 100`), then converts via `M_HPE · M_CAT02⁻¹` into HPE space for non-linear luminance compression (Equations D.6, D.7, D.18). The "D65 → D50" matrix on an entry page is CAT02 pulled out as a standalone chromatic adaptation.
- **It acts on tristimulus values only; it is linear and carries no spectrum.** Two samples that match under D65 need not match under a narrow-band source, and no 3×3 CAT predicts that metameric failure. Viewing conditions other than the white point (luminance, surround) enter only through D.
- **Bradford here is the linearised version.** Lam's (1985) original carries a non-linear term in the blue channel, `p = (B_w/B_wr)^0.0834`; ICC.1:2010 Annex E recommends the linearised matrix, and both this site's pages and colour-science's `bradford` follow the latter. The two differ little near the white point and diverge for wide blue-end white-point changes.
- **Nothing guarantees non-negative responses.** The rows of M carry negative coefficients, so saturated stimuli can produce negative cone responses. Note that a negative raw CAT02 value does not automatically mean the HPE response sent to compression is also negative; CIE 15:2018 Equation D.18's sign-preserving branch only applies when an HPE response remains negative (see the CAT02 page).
