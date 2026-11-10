+++
title = "ADX16"
type = "colour"
variant = "en"
ref = "adx16"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
intro = "ADX16 is the 16-bit encoding of APD: the same density scale as ADX10 with 4 more bits of precision and 2 more bits of range, covering about 8.2 density units."
sources = [
  { title = "SMPTE ST 2065-2:2020: Academy Printing Density (APD) — Spectral Responsivities, Reference Measurement Device and Spectral Calculation (PDF)", url = "https://pub.smpte.org/pub/st2065-2/st2065-2-2020.pdf" },
  { title = "SMPTE ST 2065-3:2020: Academy Density Exchange Encoding (ADX10 / ADX16) (PDF)", url = "https://pub.smpte.org/pub/st2065-3/st2065-3-2020.pdf" },
  { title = "ACES: Background on ADX Channel Gains (PDF)", url = "https://community.acescentral.com/uploads/default/original/2X/b/bb88519b27540c6015a330b6665523e33f493b6e.pdf" }
]
noteBox = "The chromaticity diagram is not part of ADX, and it is not a film gamut. The triangle is the set of primaries of the “Relative Exposure” layer — obtained by factoring the ACES EXP → ACES matrix through AP0; its area is 0.18, while AP0 alone is 0.396. The ADX standard defines code values only: no primaries, no white point, no transfer curve; ADX16 and ADX10 are just two bit depths of the same scale."
+++

## Relation to ADX10

ST 2065-3 defines code values and their conversion only: it subtracts the sample's Dmin from each APD channel and maps the result linearly to an integer.

```text
ADX16_c = clamp(round(gain_c × (APD_c − Dmin_c) × 8000 + 1520),  0, 65535)
ADX10_c = clamp(round(gain_c × (APD_c − Dmin_c) ×  500 +   95),  0, 1023)
gain_R = 1.00   gain_G = 0.92   gain_B = 0.95
```

16-bit is not a different scale: it is the 10-bit scale with 4 bits more precision and 2 bits more range — `95 × 16 = 1520`, `500 × 16 = 8000`. So ADX10 → ADX16 is ×16 (Equation 3); the reverse is not a plain division, Equation 4 first checks the parity of FLOOR(ADX16/16) — FLOOR((ADX16+7)/16) when even, FLOOR((ADX16+8)/16) when odd — then clamps to 1023.

| Channel | Gain | Density difference (APD − Dmin) covered by ADX16 | Density difference covered by ADX10 |
| --- | --- | --- | --- |
| R | 1.00 | −0.190 … 8.002 | −0.190 … 1.856 |
| G | 0.92 | −0.207 … 8.698 | −0.207 … 2.017 |
| B | 0.95 | −0.200 … 8.423 | −0.200 … 1.954 |

## What the extra 8.2 density units are

A typical colour negative covers roughly 2–3 density units. ADX10's 2.05 matches that only just; ADX16's 8.2 is far larger — film never reaches such densities, so the excess is headroom for scanning and calibration rather than picture information.

In other words, most of ADX16's extra 2 bits are empty on real material. What they buy is finer quantisation in the shadows (16× the code values for the same density difference) and room for Dmin calibration error and high-density regions without saturation. ST 2065-3 itself says to use 16-bit wherever possible.

## Curve and anchors

The curve on this page is the code value divided by 16368 (16368 = 16 × 1023, the ADX10 full scale ×16), so it coincides exactly with the ADX10 page; values above 1 are still valid, up to code 65535 (4.0 on this axis).

The “black / white point (10-bit code value)” row lists 82 / 649 — the **code values where relative exposure 0 and 1.0 land on the curve**, expressed in 10-bit terms; in 16-bit they are 1312 / 10384. The ADX standard's own anchor is Dmin = 95 (1520 in 16-bit). Do not mix the two conventions.

18% grey lands at code 7120 (16-bit), which is 0.435 on the ÷16368 axis — the same point as 445 in ADX10.

## Chromaticity and the triangle

Same as ADX10: the primaries and matrix are AP0 × EXP → ACES, describing the “relative exposure” layer rather than an ADX gamut. The full derivation, including the two ACESCentral explanations (Nick Shaw, Kevin Wheatley), is on the [ADX10](/en/colour/adx10/) page.

The whole code-value range passes through the same non-linear LUT, so the balance between channels is reshaped by the curve and the triangle cannot serve as a boundary. ACES also provides no ACES → ADX transform.
