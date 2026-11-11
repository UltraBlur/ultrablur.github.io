+++
title = "ADX10"
type = "colour"
variant = "en"
ref = "adx10"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
sources = [
  { title = "SMPTE ST 2065-2:2020: Academy Printing Density (APD) — Spectral Responsivities, Reference Measurement Device and Spectral Calculation (PDF)", url = "https://pub.smpte.org/pub/st2065-2/st2065-2-2020.pdf" },
  { title = "SMPTE ST 2065-3:2020: Academy Density Exchange Encoding (ADX10 / ADX16) (PDF)", url = "https://pub.smpte.org/pub/st2065-3/st2065-3-2020.pdf" },
  { title = "ACES: Background on ADX Channel Gains (PDF)", url = "https://community.acescentral.com/uploads/default/original/2X/b/bb88519b27540c6015a330b6665523e33f493b6e.pdf" }
]
noteBox = "The chromaticity diagram is not part of ADX, and it is not a film gamut. The triangle is the set of primaries of the “Relative Exposure” layer — obtained by factoring the ACES EXP → ACES matrix through AP0; its area is 0.18, while AP0 alone is 0.396, so they are not the same triangle. The ADX standard defines code values only: no primaries, no white point, no transfer curve."
intro = "ADX is the integer encoding of APD (Academy Printing Density): per-channel printing density mapped linearly to 10-bit (or 16-bit) code values. It has no curve and defines no gamut."
+++

## From density to code values

ST 2065-3 defines code values and their conversion only: it subtracts the sample's Dmin from each APD channel and maps the result linearly to an integer. There is no curve at this step, only gain, offset, rounding and clamping.

```text
ADX16_c = clamp(round(gain_c × (APD_c − Dmin_c) × 8000 + 1520),  0, 65535)
ADX10_c = clamp(round(gain_c × (APD_c − Dmin_c) ×  500 +   95),  0, 1023)
gain_R = 1.00   gain_G = 0.92   gain_B = 0.95
```

| Channel | Gain | Density difference (APD − Dmin) covered by ADX16 | Density difference covered by ADX10 |
| --- | --- | --- | --- |
| R | 1.00 | −0.190 … 8.002 | −0.190 … 1.856 |
| G | 0.92 | −0.207 … 8.698 | −0.207 … 2.017 |
| B | 0.95 | −0.200 … 8.423 | −0.200 … 1.954 |

The slope is the same for both (8000 versus 500 codes per unit of density); the range is not. 16-bit covers about 8.2 density units, 10-bit only about 2.05 — the same 2.048 span as Cineon 10-bit — and values beyond it clamp to 1023.

The two numbers measure different things: the horizontal axis of the curve is the negative's **exposure latitude**, while the code value on the vertical axis is the **density range the encoding can hold**. A typical colour negative covers roughly 2–3 density units, which ADX10's 2.05 matches only just; ADX16's 8.2 is far larger — film never reaches such densities, so the excess is headroom for scanning and calibration rather than picture information.

The vertical axis of the curve is the code value divided by 1023, so 1.0 is full scale; samples above 1 come from extrapolating the curve itself and do not mean there is usable code space left.

### Converting between the two bit depths

ADX10 → ADX16 is exactly ×16 (Equation 3). The reverse is not a division by 16: Equation 4 looks at the parity of FLOOR(ADX16/16), using FLOOR((ADX16+7)/16) when even and FLOOR((ADX16+8)/16) when odd, then clamps to 1023.

### Dmin and the dark end

Code value 0 is neither “zero density” nor Dmin: it is 0.19 density more transparent than Dmin. The scale places Dmin at code 1520 (95 in 10-bit) and keeps 0.19 density of headroom below it — that difference is APD minus Dmin, written `APD − Dmin`, and equals −0.19 at code 0. Physical density cannot be negative (APD = −log₁₀T with T ≤ 1); only the difference relative to Dmin can. Dmin is the measured minimum density of each negative, normally taken from the unexposed head or tail of the roll; a new roll or a fresh calibration shifts the whole code range while leaving the slope unchanged.

Densities below −0.19 have no code value and are clamped to 0 when encoding. In the ACES transform, −0.19 corresponds to a relative exposure of about 10⁻⁶; further down the curve extrapolates linearly at the first segment's slope, and OpenColorIO clamps log exposure at −10, so the darkest values are pushed toward zero instead of going negative.

## Why the three channel gains differ

The gains 1.00 / 0.92 / 0.95 are not physical constants. The ACES note gives the reason: contemporary motion picture negatives do not satisfy the ideal “neutral exposure in, equal density out” condition, so a statistically averaged set of gains is used to bring the neutral point of common stocks back onto the neutral axis:

> … encoding gain factors were computed as a weighted average of gain factors necessary to make commonly used motion picture films stocks neutral. The gain factors of 1.00, 0.92, and 0.95 for Red, Green, and Blue channels, respectively, are intended to better center the point cloud of samples from films along the neutral axis.

The same note points out that scanners are usually balanced on Dmin rather than LAD, and that the gains are linear — the further from the anchor, the more the three channels diverge.

## Where chromaticity enters

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

The first matrix compensates the interlayer effect: changing the exposure of one channel changes the density of the other two, so density has to be mixed across channels before it can correspond to exposure. Both matrices have rows summing to 1, so a neutral stays neutral.

As for provenance, ACES states that the matrix was supplied by Kodak and Fuji as an average suitable across films; no derivation is published, and it is not part of any SMPTE standard.

## What that triangle is

The primaries and RGB → XYZ matrix at the top of this page are AP0's RGB → XYZ multiplied by EXP → ACES — that is, the “relative exposure” layer treated as an RGB space. The primaries work out to (0.6637, 0.3224), (0.1509, 0.7451), (0.1276, 0.0635).

**They are not AP0's primaries.** AP0's own are (0.7347, 0.2653), (0, 1), (0.0001, −0.077), with an area of 0.396; this triangle has an area of 0.180, less than half of AP0.

Nor is it ADX's gamut. Two posts on ACESCentral are explicit: Nick Shaw says the matrix “would be the matrix from the Relative Exposure values … to XYZ”, not an ADX → XYZ matrix; Kevin Wheatley notes that decomposing EXP → ACES into primaries “was not explicit documented and is an interpretation of the EXP_TO_ACES in the CTL files”.

So the figure says one thing only: **what display gamut this encoding assumes**. The whole code-value range passes through the same non-linear LUT, so the balance between channels is reshaped by the curve and the triangle cannot serve as an ADX boundary.

For the reverse direction ACES provides no official ACES → ADX transform, because recording stock and lab conditions differ.

## Anchors

On the “black / white point (10-bit code value)” row: the ADX standard's own anchor is Dmin = 95, with the range topping out at 1023; the 82 / 649 listed here are the **code values where relative exposure 0 and 1.0 land on the curve** (82 is where the first linear segment crosses zero, 649 where EXP → ACES returns 1.0), matching the FilmLight `.flspace` header. Do not mix the two conventions.

18% grey lands at code 445 (0.4346), which is also the usual LAD code value in 10-bit DPX. Stop 0 on the curve is 18% grey.
