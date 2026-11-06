+++
title = "3D gamut volume (experimental)"
date = 2026-11-07T01:00:00+08:00
draft = false
layout = "volume"
type = "colour"
variant = "en"
+++

**What this view is:** the normalised linear RGB cube [0,1]³ mapped through each space's own RGB→XYZ matrix and then into the selected coordinates. White is normalised to Y = 1 and all three axes share the same scale, so nothing is stretched.

**What it is not:** for cameras and working spaces the body is the *nominal* RGB unit cube, not the range a sensor can record. Display-luminance volumes and ICC profile gamuts need additional luminance and measurement conditions and are out of scope here.

**Section:** a horizontal plane at the current vertical coordinate (L\*, J′, I, Jz …) cuts the volume; everything above the plane is clipped and the cut is filled with the colour at the intersection, outlined in a darker line. Drag the slider to move the plane; the number is the actual value on that axis.

**Viewing conditions:** CAM02-UCS uses surround, adapting luminance and background luminance (CIE 159:2004). The defaults are average surround, L<sub>A</sub> = 20% of white and Y<sub>b</sub> = 20% of white; dim or dark surround changes F, c and N<sub>c</sub> together.

**Axes:** the three axes sit on the bottom edges of the bounding box with ticks facing outwards, and the ground grid lies on the L\* = 0 plane (Y = 0 for XYZ).

**HDR models:** ICtCp and JzAzBz are absolute-luminance spaces (PQ takes L/10000 as input), so a reference white level is required — 100 cd/m² by default, switchable between 48 / 203 / 1000. **Lab, Luv, Oklab, XYZ and xyY are relative**, where white is always L\* = 100 / L = 1 regardless of luminance, so the control is hidden for those coordinates.

**Colour:** surface colour is a screen approximation — anything outside sRGB is clipped. Tick "Neutral surface" to judge the shape without it.

**Known limits:** the chromaticity of black (0,0,0) is undefined in xyY, so no surface is generated there; the filled section relies on closed intersection loops and can degrade to fragments in rare cases; picking and export are not implemented yet.
