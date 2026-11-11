#!/usr/bin/env python3
"""生成色体积页的叠加层数据：Munsell 2734 个重标定色片 + 三维光谱轨迹。

数据取自 colour-science 0.4.6：
  colour.notation.datasets.munsell.MUNSELL_COLOURS_REAL
  colour.MSDS_CMFS["CIE 1931 2 Degree Standard Observer"]

输出：
  data/munsellRenotation.json {"points": [[x, y, Y], ...]}           （Y 为 0–100）

运行：python3 scripts/gen-overlay-data.py
"""
import json
import os

import numpy as np
import colour
from colour.notation.datasets.munsell import MUNSELL_COLOURS_REAL

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data")


def gen_munsell():
    """每项：((hue, value, chroma), [x, y, Y])，Y 为 0–100。"""
    rows = []
    for spec, xyY in MUNSELL_COLOURS_REAL:
        x, y, Y = (float(v) for v in xyY)
        rows.append([round(x, 4), round(y, 4), round(Y, 2)])
    out = {
        "source": "Newhall, S. M., Nickerson, D., & Judd, D. B. (1943). Final Report of the "
                  "O.S.A. Subcommittee on the Spacing of the Munsell Colors. "
                  "Journal of the Optical Society of America, 33(7), 385. doi:10.1364/JOSA.33.000385",
        "observer": "CIE 1931 2°",
        "illuminant": "CIE C",
        "note": "Munsell 重标定（renotation）的 2734 个色片；每项 [x, y, Y]，Y 是 0–100 的相对亮度。",
        "count": len(rows),
        "points": rows,
    }
    path = os.path.join(DATA, "munsellRenotation.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    return path, len(rows)


def gen_locus():
    """光谱轨迹的立体版：每个波长带上 ȳ(λ)，于是它在 xyY 里是一条 3D 曲线。"""
    cmf = colour.MSDS_CMFS["CIE 1931 2 Degree Standard Observer"]
    wl = cmf.wavelengths
    sel = (wl >= 380) & (wl <= 700)
    X, Y, Z = cmf.values[sel].T
    tot = X + Y + Z
    rows = []
    for i in range(len(wl[sel])):
        rows.append([round(float(X[i] / tot[i]), 4), round(float(Y[i] / tot[i]), 4), round(float(Y[i]), 5)])
    out = {
        "source": "CIE 1931 2° Standard Observer（colour-science 0.4.6 MSDS_CMFS），380–700 nm、1 nm 步进",
        "observer": "CIE 1931 2°",
        "note": "每项 [x, y, ybar]：x, y 是色度，ybar = ȳ(λ) 是该波长在单位辐射功率下的相对亮度（555 nm = 1）。"
                "把 ybar 当 Y 用，光谱轨迹就从 xy 平面上的曲线变成三维空间里的一条曲线；"
                "俯视时 ybar 被压掉，投影回熟悉的马蹄形。",
        "count": len(rows),
        "points": rows,
    }
    path = os.path.join(DATA, "spectralLocus.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    return path, len(rows)


if __name__ == "__main__":
    print("colour-science", colour.__version__)
    p2, n2 = gen_munsell()
    p3, n3 = gen_locus()
    for path, n in ((p2, n2), (p3, n3)):
        print("%-42s %5d 条  %.1f KB" % (os.path.relpath(path, HERE), n, os.path.getsize(path) / 1024))
