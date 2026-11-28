+++
title = "Pure power-law gamma"
type = "colour"
variant = "en"
ref = "tf-power"
date = "2026-11-06T10:00:00+08:00"
draft = false
sources = [
  { title = "ICC: sRGB piecewise transfer function and approximate 2.2 reference display gamma", url = "https://registry.color.org/rgb-registry/srgb" },
  { title = "Apple QuickTime TN2307: historical 1.8 Macintosh RGB buffers", url = "https://developer.apple.com/library/archive/technotes/tn2307/_index.html" },
  { title = "Adobe RGB (1998) specification: exact exponent 2.19921875", url = "https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf" },
  { title = "ITU-R BT.709-6: piecewise OETF with a 0.45 high segment", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/r-rec-bt.709-6-201506-i!!pdf-e.pdf" },
  { title = "ITU-R BT.1886: reference display EOTF with gamma 2.4 and black-level terms", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1886-0-201103-I!!PDF-E.pdf" },
  { title = "EBU Tech 3320 v3.0: historical 2.35 and 0.51 discussion and change to 2.4", url = "https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf" },
  { title = "SMPTE EG 432-1: rationale for the cinema encoding exponent 2.6", url = "https://pub.smpte.org/pub/eg432-1/eg0432-1-2010.pdf" },
  { title = "ITU-R BT.470-5: assumed display gamma for analogue television systems", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.470-5-199802-S!!PDF-E.pdf" }
]
intro = "L = V^γ — a single exponent across the full range, with no linear toe."
+++

## Where these γ values come from

Every γ below is a pure-power EOTF exponent mapping normalized code V to relative linear luminance L = V^γ. Several values originate from piecewise standards, single-power fits, or historical broadcast assumptions; selecting one here draws a pure power law with that exponent rather than reproducing the original piecewise curve or black-level term. See the individual transfer-function pages for the full standards.

| γ | Origin | Note |
|---|---|---|
| 1.8 | Traditional Macintosh RGB buffer convention documented in [Apple QuickTime TN2307](https://developer.apple.com/library/archive/technotes/tn2307/_index.html) | An early Mac encoding and workflow convention that did not necessarily match the physical response of displays at the time. |
| ≈1.961 | 1/0.51; [EBU Tech 3320 v3.0 Annex A](https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf) cites ~0.51 as a single-power approximation of a BT.709-type piecewise OETF | The inverse of that approximation, useful for rough comparison rather than as a BT.709 display EOTF. |
| 563/256 | Exact decoding exponent (2.19921875) defined in [Adobe RGB (1998)](https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf) | A pure-power colour-space transfer function with no linear toe. |
| 2.2 | Reference display approximation in the [ICC sRGB overview](https://registry.color.org/rgb-registry/srgb); assumed display γ for System M in [BT.470-5](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.470-5-199802-S!!PDF-E.pdf) | Normative sRGB is piecewise (linear near black, 1.055L^(1/2.4) − 0.055 above); the combined curve approximates a 2.2 power law. |
| 2.222… | 1/0.45; inverse of the upper-segment exponent in the [BT.709-6 OETF](https://www.itu.int/dms_pubrec/itu-r/rec/bt/r-rec-bt.709-6-201506-i!!pdf-e.pdf) | Because BT.709 also includes a linear toe, scale, and offset, decoding it with a pure 2.222… power leaves a residual deviation from linearity. |
| 2.35 | Historical CRT approximation and former EBU preference noted in [EBU Tech 3320 v3.0 Annex A](https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf) | EBU moved to a nominal 2.4 after 2014 viewing tests, leaving 2.35 as a legacy figure. |
| 2.4 | Exponent parameter in [BT.1886](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1886-0-201103-I!!PDF-E.pdf) and nominal display γ recommended in [EBU Tech 3320](https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf) | BT.1886 simplifies to V^2.4 only when L_B = 0 (and L_W need not be 100 cd/m²). sRGB uses 2.4 in its upper segment, but the full curve is not a pure 2.4 power. |
| 2.6 | Encoding exponent for SDR digital cinema in [SMPTE EG 432-1](https://pub.smpte.org/pub/eg432-1/eg0432-1-2010.pdf) | Chosen to balance code allocation against visibility thresholds in a dark theatre; it is an encoding convention rather than a projector's native response. |
| 2.8 | Assumed display γ for camera pre-correction in several 625-line analogue systems ([BT.470-5](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.470-5-199802-S!!PDF-E.pdf)) | A nominal broadcast-system parameter; real PAL/SECAM CRTs typically measured lower. System N is separately noted as 2.2 (2.8). |

Pure-power comparison: at L = 0.18, γ = 2.2 and 2.4 encode to 0.45866 and 0.48944, a difference of 0.03078—about **27 code values** in 10-bit video range 64–940 (31.5 at full range). At V = 0.5, they decode to 0.21764 and 0.18946, with γ = 2.4 about 12.9% darker than γ = 2.2.
