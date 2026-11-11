+++
transferOnly = true
eotfDefault = "hlg"
title = "HLG"
date = 2026-11-06T10:00:00+08:00
draft = false
category = "Display Referred"
sources = [
  { title = "ITU-R BT.2100-3：HDR 电视参数值（HLG、PQ）（PDF）", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.2100-3-202502-I!!PDF-E.pdf" }
]

intro = "HLG 是 BT.2100 的传递函数（OETF + OOTF），参考显示 1000 cd/m² 时系统伽马 1.2。"
+++

HLG 的 OETF 是固定的：把场景线性光映射成 0–1 的信号，与显示无关。显示端的亮度由 OOTF 决定——F_D = α·Y_S^(γ−1)·R_S（三通道同理），α 是显示峰值亮度，γ 是系统伽马：1000 cd/m² 时为 1.2，其它峰值亮度按 BT.2100 表 5 注 5f 换算。所以同一个信号在不同亮度的显示器上输出不同。下图画的是中性轴：三通道相等时 Y_S 就等于信号值，OOTF 退化为幂函数。
