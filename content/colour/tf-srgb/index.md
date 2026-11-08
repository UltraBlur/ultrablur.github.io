+++
title = "sRGB 分段曲线"
aliases = ["/colour/srgb/"]
date = 2026-11-06T10:00:00+08:00
draft = false
category = "Display Referred"
transferOnly = true
eotfDefault = "srgb"
intro = "sRGB 定义一对互逆的分段函数：编码（线性光 → 信号）0.0031308 以下为 12.92·L，以上为 1.055·L^(1/2.4) − 0.055；解码（信号 → 线性光）是它的逆，0.04045 以下为 v/12.92，以上为 ((v + 0.055)/1.055)^2.4。解码不是纯 gamma 2.2，只是整体接近。"
+++
