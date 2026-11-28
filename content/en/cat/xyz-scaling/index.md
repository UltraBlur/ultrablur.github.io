+++
title = "XYZ Scaling"
date = 2026-11-28T14:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
variant = "en"
ref = "xyz-scaling"
intro = "The plainest control: no cone space, just scale XYZ by the ratio of the two whites. The white point still lands exactly; colours do not."
sources = [
  { title = "Fairchild, M. D. (2013). Color Appearance Models (3rd ed.). Wiley." },
  { title = "CIE 15:2018 — Colorimetry, 4th edition (Annex D, cone-space formulation)", url = "https://cie.co.at/publications/colorimetry-4th-edition" }
]
+++

## What it does

Set M to the identity and the von Kries form collapses into a per-channel scaling of XYZ itself:

```
D_X = X_wr / X_w    D_Y = Y_wr / Y_w    D_Z = Z_wr / Z_w
```

For D65 → D50 at D = 1 the equivalent matrix is the diagonal `diag(1.0146, 1.0000, 0.7576)`: X is stretched, Z is cut to about three quarters. The white point lands on D50 exactly, because those three ratios were computed from the whites in the first place.

## Why it is the counterexample

Chromatic adaptation happens to cone responses, not to XYZ. The three XYZ channels are not three independent receptors: X mixes long- and short-wavelength contributions, Z is almost purely short-wave, and Y carries luminance. Scaling them directly assumes that a change in the white's X should be carried entirely by the sample's X. That holds for the white itself and fails for everything else.

The difference stands out in the `u'v'` diagram: the white points coincide, while reds, blues and purples land far from where Bradford or CAT16 put them. The chart alone only shows that it disagrees with mainstream CATs, and visual corresponding-colour experiments confirm that scaling XYZ directly has much larger prediction errors — in short, **matching the white point does not mean other colours match**, which is why this page sits first.

## Where it still shows up

As a control in experiments to measure how much converting into cone space helps, and in simple workflows that only need white-point normalisation without hue fidelity. Colour-critical pipelines rarely choose it.

The D65 → D50 matrix is shown above. Load it as CAT B in the index-page lab next to Bradford and the difference appears directly in the 24 patches and the displacement vectors.
