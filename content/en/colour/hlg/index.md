+++
title = "HLG"
type = "colour"
variant = "en"
ref = "hlg"
date = 2026-11-06T10:00:00+08:00
draft = false
sources = [
  { title = "ITU-R BT.2100-3: Parameter values for HDR television (HLG, PQ) (PDF)", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.2100-3-202502-I!!PDF-E.pdf" }
]
intro = "HLG is the BT.2100 transfer function (OETF + OOTF); system gamma is 1.2 at the 1000 cd/m² reference display."
+++

The HLG OETF is fixed: it maps scene-linear light to a 0–1 signal and does not depend on the display. Display light comes from the OOTF — F_D = α·Y_S^(γ−1)·R_S (and likewise for G and B), where α is the display's nominal peak luminance and γ the system gamma: 1.2 at 1000 cd/m², otherwise per Note 5f of Table 5 in BT.2100. The same signal therefore produces different light on displays of different peak luminance. The curve below is the neutral axis: with equal channels Y_S equals the signal, and the OOTF reduces to a power law.
