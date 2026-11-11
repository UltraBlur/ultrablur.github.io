+++
title = "FilmLight Cineon PD Log / Generic Negative"
type = "colour"
variant = "en"
ref = "filmlight-generic-negative"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
gamutNote = "No chromaticity diagram here: the matrix is the inverse of the Von Kries cone space (see below), and its three columns fall on the alychne and on the y = 0 line — none of them is a visible colour."
intro = "An approximate response for a generic camera negative: scanned on a film scanner calibrated to Cineon and assuming ideal SMPTE printing density, with spectral sensitivity taken from a generic modern stock. It is not a gamut definition, and the matrix below is not RGB → XYZ."
+++

## What this is

An approximate entry in the FilmLight colour space library. The file's own description:

> This is an approximate original camera negative film response scanned on a film scanner calibrated to Cineon assuming ideal SMPTE Printing Density. A generic modern film stock was used for the spectral sensitivity. Tone Curve: Cineon Printing Density Log. Primaries: Spectral sensitivity of generic modern camera negative stock. Reference white at 68.5%

Three things in one sentence: the curve is Cineon printing density log; “density” is understood as ideal APD (a real scanner's deviation is not expressed here); and the spectral sensitivity comes from “a generic modern stock”, i.e. no particular product.

**There is no public specification.** Every number below comes from the `.flspace` implementation and is FilmLight's own approximation, not SMPTE content.

## Three-stage implementation

```text
convertToLinear:
  P = rgb × Dye Absorption Matrix (K. Vision 5207)
  P = Cineon curve (linear toe / exponential segment)
  P = P × K. Spectral Sensitivity
convertFromLinear: reverse order
```

```text
Dye Absorption          0.81129611  0.16813581  0.02056807
                        0.0848841   0.77211884  0.14299706
                        0.07672217  0.21710741  0.70617042

K. Spectral Sensitivity 0.38306     0.68160981 −0.06466981
                        0.16551671  0.81607662  0.01840668
                       −0.05766855  0.05788586  0.99978269
```

Both matrices have rows summing to 1, so a neutral stays neutral after each step.

## The curve

Cineon, with black at 95 and white at 685, about 300 code values per decade. It agrees with public implementations to the last digit:

- `colour-science`'s `log_encoding_Cineon(0.18) = 0.45732`; this file returns 0.45731.
- A measured REDlogFilm decode from Resolve Studio 21 on this machine (REDlogFilm is this curve) matches `(10^((1023x−685)/300) − b)/(1−b)` with `b = 10^(−590/300)` to within 5.5×10⁻⁶ at every point.

18% grey lands at 0.4573, linear 1.0 at 0.6696 (= 685/1023).

**The 68.5% reference white is 685/1000**, not 685/1023 (= 67.0%). FilmLight's percentage convention counts against 1000, a different denominator from the 10-bit code value.

## Why there is no chromaticity diagram

The matrix shown lower on this page, `RGB_XYZ`, looks like RGB → XYZ. It is not:

```text
RGB_XYZ = inv(HPE)
```

where HPE is the Von Kries (Hunt-Pointer-Estevez) matrix quoted in the file's comment:

```text
0.40024   0.70760  −0.08081
−0.22630  1.16532   0.04570
0.00000   0.00000   0.91822
```

Inverting it and multiplying by (1,1,1) gives (0.950451, 0.999998, 1.089064) — D65; the entry differs from the quoted matrix by at most 6.4×10⁻⁶. The library also ships a `VonKriesLMS.flspace` (DisplayName “Von Kries: linear / LMS”, marked `Invisible = 1`) that carries the same matrix.

Which means: **the “linear” of this space is LMS (cone response), not RGB.** The film's spectral sensitivity is fully contained in the `K. Spectral Sensitivity` matrix above; `RGB_XYZ` holds no film information at all — change the stock and not one number in it moves.

The three columns are therefore HPE geometry:

| | x | y | structure |
| --- | --- | --- | --- |
| R (L) | 0.8374 | 0.1626 | Z = 0, on the alychne (x + y = 1) |
| G (M) | 2.3022 | −1.3022 | Z = 0, on the alychne (x + y = 1) |
| B (S) | 0.1680 | 0.0000 | Y = 0, on the y = 0 line |

So a gamut triangle can't be drawn here, and shouldn't be: **“primaries” have no gamut meaning in this entry.** The colour of the film itself lives in the scanner, the stock and the printing conditions — a different subject.
