+++
title = "Xiaomi Mi-Log / Rec.2020"
aliases = ["/colour/mi-log/"]
date = 2026-11-11T21:30:00+08:00
draft = false
category = "Scene Referred"
primaries = [[0.7080, 0.2920], [0.1700, 0.7970], [0.1310, 0.0460]]
whitePoint = [0.31270, 0.32900]
whiteName = "D65"
matrix = [[0.636958048301, 0.144616903586, 0.168880975164], [0.262700212011, 0.677998071519, 0.059301716470], [0.000000000000, 0.028072693049, 1.060985057711]]
gamutNote = "原色、白点与亮度系数（Y = 0.2627R + 0.6780G + 0.0593B）均按白皮书第 4 节 / BT.2020-2；色度坐标使用 CIE 1931 2° 观察者。"
transferNote = "编码分三段：R ≥ 0.01974185 时 P = 0.09271529·log₂(R + 0.01384578) + 0.67291850；−0.09023729 ≤ R < 0.01974185 时 P = 18.10531998·(R + 0.09023729)²；R < −0.09023729 时 P = 0。18% 灰 → 0.45345968（10-bit 全范围 463）。"
sources = [
  { title = "Xiaomi：Xiaomi Log Profile White Paper（2024-12，ZIP 内附 PDF；官方 Mi-Log ACES 包）", url = "https://cdn.alsgp0.fds.api.mi-img.com/e-commerce/global/Mi-Log_ACES%20Profiles.zip" }
]
+++
