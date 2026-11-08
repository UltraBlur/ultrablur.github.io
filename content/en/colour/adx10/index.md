+++
title = "ADX10"
type = "colour"
variant = "en"
ref = "adx10"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
intro = "ADX is the integer encoding of APD (Academy Printing Density): per-channel density mapped linearly to 10-bit or 16-bit code values. Density is logarithmic, but this encoding has no curve and defines no gamut."
sources = [
  { title = "SMPTE ST 2065-2:2020: Academy Printing Density (APD) — Spectral Responsivities, Reference Measurement Device and Spectral Calculation (PDF)", url = "https://pub.smpte.org/pub/st2065-2/st2065-2-2020.pdf" },
  { title = "SMPTE ST 2065-3:2020: Academy Density Exchange Encoding (ADX10 / ADX16) (PDF)", url = "https://pub.smpte.org/pub/st2065-3/st2065-3-2020.pdf" }
]
primaries = [[0.663747, 0.322376], [0.150934, 0.745125], [0.127573, 0.063536]]
whitePoint = [0.32168, 0.33767]
whiteName = "ACES D60"
matrixLabel = "Relative exposure RGB → XYZ"
matrix = [[0.688563361694, 0.120315061426, 0.143767650444], [0.334429500163, 0.593968684274, 0.071602536889], [0.014395935381, 0.082854812395, 0.911564348372]]
noteBox = "The chromaticity diagram and curve here are not part of the SMPTE standard: ADX defines code values only, with no primaries, no white point and no transfer curve. The triangle is the set of primaries that the ACES ADX → ACES transform assigns to the negative signal — its three vertices are the chromaticities obtained when only the red, green or blue relative exposure is non-zero. It appears only once the scanned densities are interpreted as an RGB signal; it is neither the spectral colour of the film dyes nor a colour of the photographed scene. This step is the same ACES transform in every implementation (the ADX10 input in DaVinci Resolve and in Baselight are both this transform), so the figure itself is fixed; what changes with stock and scanner calibration is the density values fed into it — Dmin, base and calibration."
+++

## Code values

ST 2065-3 defines code values and their conversion only: it subtracts the sample's Dmin from each APD channel and maps the result linearly to an integer. There is no curve at this step, only gain, offset, rounding and clamping.

```text
ADX16_c = clamp(round(gain_c × (APD_c − Dmin_c) × 8000 + 1520),  0, 65535)
ADX10_c = clamp(round(gain_c × (APD_c − Dmin_c) ×  500 +   95),  0, 1023)
gain_R = 1.00   gain_G = 0.92   gain_B = 0.95
```

| Channel | Gain | Density difference (APD − Dmin) covered by ADX16 | Density difference (APD − Dmin) covered by ADX10 |
| --- | --- | --- | --- |
| R | 1.00 | −0.190 … 8.002 | −0.190 … 1.856 |
| G | 0.92 | −0.207 … 8.698 | −0.207 … 2.017 |
| B | 0.95 | −0.200 … 8.423 | −0.200 … 1.954 |

The slope is the same for both (8000 versus 500 codes per unit of density); the range is not. 16-bit covers about 8.2 density units, 10-bit only about 2.05 — the same 2.048 span as Cineon 10-bit — and values beyond it clamp to 1023.

The two numbers measure different things: the horizontal axis of the curve is the negative's **exposure latitude**, while the code value on the vertical axis is the **density range the encoding can hold**. A typical colour negative covers roughly 2–3 density units, which ADX10's 2.05 matches only just; ADX16's 8.2 is far larger — film never reaches such densities, so the excess is headroom for scanning and calibration rather than picture information.

The vertical axis of the curve is normalised differently on the two pages: ADX16 divides the code value by 16368 (the ADX10 maximum ×16), ADX10 divides by 1023, so the two curves have the same shape. Values above 1 in ADX16 remain valid, up to 65535.

### Converting between the two bit depths

ADX10 → ADX16 is exactly ×16 (Equation 3). The reverse is not a division by 16: Equation 4 looks at the parity of FLOOR(ADX16/16), using FLOOR((ADX16+7)/16) when even and FLOOR((ADX16+8)/16) when odd, then clamps to 1023.

### Dmin and the dark end

Code value 0 is neither “zero density” nor Dmin: it is 0.19 density more transparent than Dmin. The scale places Dmin at code 1520 (95 in 10-bit) and keeps 0.19 density of headroom below it — that difference is APD minus Dmin, written `APD − Dmin`, and equals −0.19 at code 0. Physical density itself cannot be negative (APD = −log₁₀T with T ≤ 1); only the difference relative to Dmin can. Dmin is the measured minimum density of each negative, normally taken from the unexposed head or tail of the roll; a new roll or a fresh calibration shifts the whole code range while leaving the slope unchanged.

Densities below −0.19 have no code value and are clamped to 0 when encoding. In the ACES transform, −0.19 corresponds to a relative exposure of about 10⁻⁶; further down the curve extrapolates linearly at the first segment's slope (about 16.4 decades per unit density), and OpenColorIO clamps log exposure at −10, so the darkest values are pushed toward zero instead of going negative.

Between 0 and 0.6 the density-to-exposure relation is not a straight line: that stretch is a fitted toe, undoing the bend of the film's characteristic curve at low exposure — which is why the dark end cannot be extrapolated linearly.

## ADX → ACES: where chromaticity enters

ADX is density; it has no primaries and no white point. To place it on a chromaticity diagram it must first be mapped into some RGB space. ACES uses the following chain (CTL `ACEScsc.Academy.ADX10_to_ACES`, with the OpenColorIO implementation matching it):

```text
ADX code value
  → dequantise to channel-dependent density (CDD)
  → CDD → CID matrix, giving channel-independent density (CID)
  → 11-point non-uniform LUT: density → relative log exposure
  → 10^x: log exposure → relative linear exposure
  → EXP → ACES matrix: ACES AP0 linear
```

```text
CDD → CID
[ 0.75573  0.22197  0.02230 ]
[ 0.05901  0.96928 −0.02829 ]
[ 0.16134  0.07406  0.76460 ]

EXP → ACES
[ 0.72286  0.12630  0.15084 ]
[ 0.11923  0.76418  0.11659 ]
[ 0.01427  0.08213  0.90359 ]
```

The first matrix compensates the interlayer effect: changing the exposure of one channel changes the density of the other two, so density has to be mixed across channels before it can correspond to exposure. Both matrices have rows summing to 1, so a neutral (equal densities) stays neutral.

As for provenance, ACES states that the matrix was supplied by Kodak and Fuji as an average suitable across films; no derivation is published, and it is not part of any SMPTE standard.

The LUT handles the toe of the density curve: above the toe the slope is a fixed 100/55, below it the curve is interpolated point by point.

Because the chain contains both a matrix and a non-linear LUT, the triangle in the figure is only the set of primaries of the “relative exposure” layer, not a gamut boundary for ADX: the whole code-value range passes through the same non-linearity, so the balance between channels is reshaped by the curve. For the reverse direction ACES provides no official ACES → ADX transform, because recording stock and lab conditions differ.

The primaries and RGB → XYZ matrix at the top of this page are AP0's RGB → XYZ multiplied by EXP → ACES — that is, the “relative exposure” layer treated as an RGB space.
