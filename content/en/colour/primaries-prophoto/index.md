+++
title = "ProPhoto RGB (ROMM)"
aliases = ["/en/colour/prophoto/", "/en/colour/romm/"]
type = "colour"
variant = "en"
ref = "primaries-prophoto"
date = 2026-11-11T21:30:00+08:00
draft = false
gamutNote = "Primaries and D50 white point are per the ROMM RGB specification; the blue primary has y = 0.0001, almost on the xy axis. The matrix is rebuilt from the primaries + D50, with the white point normalised to Y = 1."
transferNote = "ROMM RGB encoding: E′ = 16E for E < 1/512, otherwise E′ = E^(1/1.8); decoding: E = E′/16 for E′ < 1/32, otherwise E = E′^1.8."
sources = [
  { title = "Spaulding, Woolfe & Giorgianni: Reference Input/Output Medium Metric RGB Color Encodings (RIMM/ROMM RGB, 2000, PDF)", url = "https://www.imaging.org/common/uploaded%20files/pdfs/Papers/2000/PICS-0-81/1637.pdf" }
]
intro = "ProPhoto RGB is Kodak's ROMM RGB (Reference Output Medium Metric): a D50 white point, very wide primaries, and a gamma 1.8 curve with a slope-16 linear toe."
+++
