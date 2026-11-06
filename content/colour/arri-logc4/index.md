+++
title = 'ARRI Wide Gamut 4 / LogC4'
date = 2026-11-06T10:00:00+08:00
draft = false
category = "Scene Referred"
intro = "ARRI Wide Gamut 4（AWG4）与 LogC4 分别定义色域与传递函数。"
primaries = [[0.7347,0.2653],[0.1424,0.8576],[0.0991,-0.0308]]
whitePoint = [0.3127,0.3290]
whiteName = 'D65'
transferNote = "编码值达到 1.0 时对应线性 469.8；该曲线按 12-bit 为最低量化位深设计；ARRI 规范注明 10-bit 的 LogC4 影像不应用于存档或交换。"
matrix = [[0.704858320407232, 0.129760295170463, 0.115837311473977], [0.254524176404027, 0.781477732712002, -0.036001909116029], [0.000000000000000, 0.000000000000000, 1.089057750759878]]
matrixInverse = [[1.509215472242109, -0.250597345204380, -0.168811475294074], [-0.491545451660619, 1.361245545929351, 0.097282942013729], [0.000000000000000, 0.000000000000000, 0.918224951158248]]
sourceSpace = "ARRI_LogC4_AWG4.flspace"
sources = [
  { title = "ARRI：《ARRI LogC4 Logarithmic Color Space Specification》（2023-05，PDF）", url = "https://www.arri.com/resource/blob/278790/db65b86066de1f74852edb8f15acf082/2023-05-arri-logc4-specification-data.pdf" },
  { title = "ACES 官方转换实现：CSC.Arri.LogCv4_to_ACES.ctl", url = "https://github.com/aces-aswf/aces-input-and-colorspaces/blob/main/arri/CSC.Arri.LogCv4_to_ACES.ctl" }
]
+++
