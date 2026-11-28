+++
title = "von Kries"
date = 2026-11-11T22:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
variant = "en"
ref = "von-kries"
intro = "The coefficient law: XYZ into cone responses, one scale factor per channel, so the source white lands on the target white."
sources = [
  { title = "von Kries, J. (1902). Festschrift der Albrecht-Ludwigs-Universität." },
  { title = "Hunt, R. W. G. (2004). The Reproduction of Colour (6th ed.). Wiley." }
]
+++

## The coefficient law and its modern form

In 1902 von Kries proposed the coefficient law: multiply each cone response by a factor so the source white aligns with the target white. Neither CIE XYZ nor modern cone fundamentals existed in 1902; the XYZ → HPE matrix shown above is a modern implementation.

The HPE matrix comes in two normalisations: the one on this page maps D65 close to (1, 1, 1) (1.000004 / 1.000002 / 0.999995 with this site's four-decimal xy); the CIECAM02 set (CIE 15:2018 Equation D.9) has [0, 0, 1] as its third row. In theory they differ only by a constant per row (about 1.0270 / 0.9847 / 0.9182) and the coefficient law is invariant to row scaling, so both give virtually identical adapted results (differing only slightly from matrix rounding).
