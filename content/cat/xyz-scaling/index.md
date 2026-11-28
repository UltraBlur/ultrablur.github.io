+++
title = "XYZ Scaling"
date = 2026-11-28T14:00:00+08:00
draft = false
type = "colour"
layout = "cat-single"
year = "—"
standard = "基准：无锥体空间"
standardEn = "Baseline: no cone space"
cone = "无：直接在 XYZ 上缩放"
coneEn = "None: scaling XYZ directly"
matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
matrixInv = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
srcWhite = "D65"
dstWhite = "D50"
intro = "最朴素的对照：不换锥体空间，直接在 XYZ 上按白点比值缩放。白点仍然对得上，颜色却会拉偏。"
dNote = "这条基准本身不带 D；它只按两个白点的 XYZ 比值缩放，用来暴露「不对锥体响应做适应」的代价。"
dNoteEn = "This baseline carries no D of its own; it simply scales XYZ by the ratio of the two whites, exposing the cost of not adapting cone responses."
sources = [
  { title = "Fairchild, M. D. (2013). Color Appearance Models (3rd ed.). Wiley." },
  { title = "CIE 15:2018 — Colorimetry, 4th edition（Annex D，锥体空间写法）", url = "https://cie.co.at/publications/colorimetry-4th-edition" }
]
+++

## 做法

把 M 取成单位阵，von Kries 形式就退化成直接在 XYZ 上逐通道缩放：

```
D_X = X_wr / X_w    D_Y = Y_wr / Y_w    D_Z = Z_wr / Z_w
```

D65 → D50、D = 1 时，等效矩阵是对角的 `diag(1.0146, 1.0000, 0.7576)`：X 放大、Z 压到约四分之三。白点当然精确落到 D50，因为这三个比值本来就是按白点算的。

## 为什么拿它当反例

色适应发生在锥体响应上，不是在 XYZ 上。XYZ 的三个通道并不对应三种独立感受器：X 里混着长波与短波，Z 几乎只由短波贡献，Y 又同时带亮度。直接缩放它们，等于假设「白点的 X 变化只该由样品的 X 承担」，这个假设对白光成立，对别的颜色不成立。

结果在 `u'v'` 图上很明显：白点虽然完全重合，但红、蓝、紫几个方向的落点相对 Bradford / CAT16 偏移很大，色相和饱和度都跟着变了。单看对比图本身只能说明它和主流 CAT 预测不同，但结合对应色视觉实验来看，直接缩放 XYZ 的预测误差明显更大——也就是说，**白点对得上，不代表其他颜色也对**，这就是它排在清单最前的原因。

## 什么时候还会见到它

一是做对照实验，用来衡量「先换到锥体空间」到底带来多大改善；二是一些只关心白点对齐、不要求色相保真的简单处理。在对色彩准确度有要求的流程里通常不选它。

本页的 D65 → D50 矩阵见上方；把它切到索引页实验室的 CAT B，与 Bradford 并排看 24 色卡，差异会直接出现在色块与位移矢量上。
