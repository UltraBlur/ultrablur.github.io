+++
title = "ProPhoto RGB（ROMM）"
aliases = ["/colour/prophoto/", "/colour/romm/"]
date = 2026-11-11T21:30:00+08:00
draft = false
category = "Scene Referred"
gamutOnly = true
primaries = [[0.7347, 0.2653], [0.1596, 0.8404], [0.0366, 0.0001]]
whitePoint = [0.3457, 0.3585]
whiteName = "D50"
matrix = [[0.797760489672, 0.135185837176, 0.031349349582], [0.288071128229, 0.711843217810, 0.000085653961], [0.000000000000, 0.000000000000, 0.825104602510]]
gamutNote = "原色与 D50 白点按 ROMM RGB 规范；蓝原色 y = 0.0001，几乎贴在 xy 轴上。矩阵由原色 + D50 重建，白点归一化到 Y = 1。"
transferNote = "ROMM RGB 编码：E′ = 16E（E < 1/512），否则 E′ = E^(1/1.8)；解码：E = E′/16（E′ < 1/32），否则 E = E′^1.8。"
sources = [
  { title = "Spaulding, Woolfe & Giorgianni：Reference Input/Output Medium Metric RGB Color Encodings（RIMM/ROMM RGB，2000，PDF）", url = "https://www.imaging.org/common/uploaded%20files/pdfs/Papers/2000/PICS-0-81/1637.pdf" }
]
intro = "ProPhoto RGB 是 Kodak 的 ROMM RGB（Reference Output Medium Metric）：D50 白点、很宽的原色，用 γ 1.8 加斜率 16 的线性暗部。"
+++
