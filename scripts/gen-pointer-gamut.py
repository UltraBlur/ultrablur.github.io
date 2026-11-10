#!/usr/bin/env python3
"""生成 data/pointerGamut.json（Pointer's Gamut）。

数据源：colour-science 的 DATA_POINTER_GAMUT_VOLUME / CCS_POINTER_GAMUT_BOUNDARY，
转写自 Pointer, M. R. (1980). The Gamut of Real Surface Colours.
Color Research & Application, 5(3), 145-155. doi:10.1002/col.5080050308

用法：python3 scripts/gen-pointer-gamut.py
依赖：colour-science、numpy、scipy
"""
import json
import pathlib

import colour
import numpy as np
from scipy.spatial import ConvexHull
from colour.models import (
    CCS_ILLUMINANT_POINTER_GAMUT,
    CCS_POINTER_GAMUT_BOUNDARY,
    DATA_POINTER_GAMUT_VOLUME,
    LCHab_to_Lab,
    Lab_to_XYZ,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "pointerGamut.json"


def area(points):
    p = np.asarray(points, float)
    x, y = p[:, 0], p[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def main():
    lch = DATA_POINTER_GAMUT_VOLUME
    xyz = Lab_to_XYZ(LCHab_to_Lab(lch), CCS_ILLUMINANT_POINTER_GAMUT)
    xy = colour.XYZ_to_xy(xyz)

    hull = xy[ConvexHull(xy).vertices]
    # 以左下角为起点、逆时针排列，便于直接画多边形
    order = np.argsort(np.arctan2(hull[:, 1] - hull[:, 1].mean(), hull[:, 0] - hull[:, 0].mean()))
    hull = hull[order]

    data = {
        "source": "Pointer, M. R. (1980). The Gamut of Real Surface Colours. Color Research & Application, 5(3), 145-155.",
        "doi": "10.1002/col.5080050308",
        "observer": "CIE 1931 2°",
        "illuminant": "CIE C",
        "note": "576 个样本 = 16 个 L*（15–90，步长 5）× 36 个色相（0–350°，步长 10°）；hull 为其在 xy 上的凸包。",
        "area": round(float(area(hull)), 4),
        "lch": [[int(v) for v in row] for row in lch],
        "hull": [[round(float(x), 4), round(float(y), 4)] for x, y in hull],
        "boundary": [[round(float(x), 4), round(float(y), 4)] for x, y in CCS_POINTER_GAMUT_BOUNDARY],
    }

    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}  hull={len(data['hull'])}  area={data['area']}")


if __name__ == "__main__":
    main()
