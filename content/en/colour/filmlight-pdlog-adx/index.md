+++
title = "FilmLight Academy PD Log / ~ADX"
type = "colour"
variant = "en"
ref = "filmlight-pdlog-adx"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
intro = "An approximate negative film response using the ADX matrix and a sigmoid tone curve, mapping scene exposure into the 0–1 Cineon log range; 18% grey lands at 0.5, with a gamma of about 0.6 at the mid point."
gamutNote = "No chromaticity diagram here: its chromaticity is the same borrowed “relative exposure” space as ADX, and this curve's own black/white landings disagree with the file header (see below)."
transferNote = "The “black / white point” of 82 / 649 is the .flspace header (inherited from ADX), not this curve's landing points — by the formula on this page, linear 0 encodes to 0.0000 (code 0) and linear 1.0 to 0.7021 (code 718)."
+++

## What this is

An approximate entry in the FilmLight library that uses the ADX matrix plus a sigmoid curve to model a negative's response to scene exposure:

> This is an approximate negative film response using the Academy Density Exchange (ADX) matrix and a sigmoid tone curve. It maps the positive scene exposure range into the 0-1 Cineon log range. The scene 18% grey is mapped to the 50% output (negative density 1.0), with a gamma value of about 0.6 at the mid point. Reference white at 63%

**There is no public specification**; every number below comes from the `.flspace`.

## The curve

```text
toLinear:  c = rgb × CDD→CID
           c = c < 0.75 ? c/(1−c) : 16c−9
           c = c² × 0.18
```

Each claim in the description can be checked directly:

- **18% grey → 0.5**: feed 0.5 into the chain — `0.5/(1−0.5) = 1`, squared and multiplied by 0.18 gives 0.18.
- **mid-point gamma ≈ 0.6**: the logarithmic slope of the sigmoid around 0.5, as the file states.
- **linear clip above 0.75**: `16c−9` extends the tangent of `c/(1−c)` at 0.75. That point corresponds to `c₀ = 3`, i.e. relative exposure 1.62 (18% × 9), which the file comment calls “3× the native white point”. The clip exists to keep the inverse transform from producing odd results at extreme scene values.

The encode direction (`convertFromLinear`) normalises by 0.18, takes a square root, applies `c/(1+c)`, then multiplies by the inverse of the ADX matrix. 18% grey therefore lands at 0.5 and linear 1.0 at 0.7021.

## Difference from ADX

Both use the same matrix (the ADX CDD → CID) and the same primaries, but **the non-linearity sits in a different place**:

```text
ADX     : code → (density domain) matrix → density/exposure LUT → exposure
PD Log  : code → (code domain) matrix    → sigmoid              → exposure
```

So this is not “ADX at another bit depth” but a different modelling path: ADX applies its non-linearity in the density domain, this one in the code domain.

## Black point, white point, reference white

The header says `BlackPoint = 82`, `WhitePoint = 649`, the same as ADX, with a reference white of 63% (649 / 1023). Neither number holds for this curve: by the formula above, linear 0 encodes to 0.0000 (code 0) and linear 1.0 to 0.7021 (code 718); 82 and 649 correspond to linear 0.0014 and 0.54.

The likely reason is inheritance from the ADX file — there 82 / 649 are the code values where relative exposure 0 and 1.0 land, and this curve has a different scale. The “black / white point” row keeps the header's original values so they can be compared with the `.flspace`; use the three encoded values 0.0000 / 0.5000 / 0.7021 when reading the curve.

## Chromaticity

The file labels its gamut “~ADX”, i.e. an approximation of ACES ADX; the primaries are the same as ADX10 / ADX16, which is the ACES “relative exposure” space, not a film gamut. The full derivation is on the [ADX10](/en/colour/adx10/) page. Because the matrix acts in the code domain and is followed by the sigmoid, the whole code range passes through the same curve and the channel balance is reshaped — so even if a diagram were drawn, it could not serve as a boundary.
