+++
title = "纯幂函数 Gamma"
date = 2026-11-06T10:00:00+08:00
draft = false
category = "Display Referred"
transferOnly = true
eotfDefault = "gamma22"
# 本页只讲纯幂函数：下拉只列有明确出处的幂次，最后一项可手动输入幂指数
eotfOptions = ["gamma18", "gamma1961", "gamma563", "gamma22", "gamma2222", "gamma235", "gamma24", "gamma26", "gamma28", "custom"]
eotfGamma = 2.2
sources = [
  { title = "ICC：sRGB 的分段传递函数与约 2.2 的参考显示描述", url = "https://registry.color.org/rgb-registry/srgb" },
  { title = "Apple QuickTime TN2307：历史上 Macintosh 的 1.8 RGB 缓冲", url = "https://developer.apple.com/library/archive/technotes/tn2307/_index.html" },
  { title = "Adobe RGB (1998) 规范：精确指数 2.19921875", url = "https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf" },
  { title = "ITU-R BT.709-6：分段 OETF（0.45 幂段）", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/r-rec-bt.709-6-201506-i!!pdf-e.pdf" },
  { title = "ITU-R BT.1886：参考显示 EOTF（γ = 2.4，含黑位参数）", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1886-0-201103-I!!PDF-E.pdf" },
  { title = "EBU Tech 3320 v3.0：2.35、0.51 的历史解释与改用 2.4 的说明", url = "https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf" },
  { title = "SMPTE EG 432-1：数字影院选用 2.6 的编码依据", url = "https://pub.smpte.org/pub/eg432-1/eg0432-1-2010.pdf" },
  { title = "ITU-R BT.470-5：模拟电视制式中假定的显示 γ", url = "https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.470-5-199802-S!!PDF-E.pdf" }
]
intro = "L = V^γ，全区间单一幂次，无暗部线性段。"
+++

## 这些 γ 的出处

表里的 γ 都是纯幂 EOTF 指数，即 L = V^γ（归一化码值 V 映射到相对线性亮度 L）。有些数值取自标准里的分段曲线、单幂近似或历史制式假设；在这里选它只是按该指数画一条纯幂曲线，并不会还原原标准的分段或黑位。需要实际分段曲线时，请看对应传递函数页。

| γ | 出处 | 备注 |
|---|---|---|
| 1.8 | [Apple QuickTime TN2307](https://developer.apple.com/library/archive/technotes/tn2307/_index.html) 记载的早期 Macintosh RGB 缓冲约定 | 早期 Mac 系统的编码与工作流约定，与当时显示器的物理响应未必一致。 |
| ≈1.961 | 1/0.51；[EBU Tech 3320 v3.0 附录 A](https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf) 将 BT.709 类分段 OETF 的单幂近似记作约 0.51 | 单幂近似的倒数，仅用于粗略对照，并非 BT.709 规定的显示 EOTF。 |
| 563/256 | [Adobe RGB (1998)](https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf) 规定的解码幂指数，精确为 2.19921875 | 色彩空间本身定义的纯幂传递函数，没有暗部线性段。 |
| 2.2 | [ICC sRGB 概述](https://registry.color.org/rgb-registry/srgb) 中的参考显示约值；[BT.470-5](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.470-5-199802-S!!PDF-E.pdf) 系统 M 的假定显示 γ | sRGB 规范实际采用分段编码（暗部线性，亮部为 1.055L^(1/2.4) − 0.055），整条曲线近似纯幂 2.2。 |
| 2.222… | 1/0.45；[BT.709-6](https://www.itu.int/dms_pubrec/itu-r/rec/bt/r-rec-bt.709-6-201506-i!!pdf-e.pdf) OETF 亮部幂段 0.45 的倒数 | BT.709 OETF 含暗部线性段以及亮部的系数和偏置，接纯幂 2.222… 解码后仍有残余偏差，不会完全抵消为线性。 |
| 2.35 | [EBU Tech 3320 v3.0 附录 A](https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf) 记载的 CRT 近似值与 EBU 早期偏好 | EBU 在 2014 年对比测试后改用名义值 2.4，2.35 属于历史沿用值。 |
| 2.4 | [BT.1886](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1886-0-201103-I!!PDF-E.pdf) EOTF 指数；[EBU Tech 3320](https://tech.ebu.ch/docs/tech/tech3320v3_0.pdf) 推荐的名义显示 γ | BT.1886 只在黑位 L_B = 0 时退化为纯幂 V^2.4（峰值亮度 L_W 不限于 100 cd/m²）；sRGB 亮部公式里虽有 2.4，整条曲线也不等于纯幂 2.4。 |
| 2.6 | [SMPTE EG 432-1](https://pub.smpte.org/pub/eg432-1/eg0432-1-2010.pdf) 为 SDR 数字影院编码选定的幂指数 | 按暗厅下的亮度码值分配与人眼可见阈值权衡选出，是数字影院编码约定，不代表投影机硬件的原生响应。 |
| 2.8 | [BT.470-5](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.470-5-199802-S!!PDF-E.pdf) 若干 625 线模拟电视制式预校正所假定的显示 γ | 历史广播制式的名义参数，实际 PAL/SECAM CRT 的响应通常低于此值；其中系统 N 另注有 2.2（2.8）。 |

纯幂数值对照：相对亮度 L = 0.18 时，γ = 2.2 与 2.4 的编码值分别为 0.45866 与 0.48944，相差 0.03078——在 10-bit 视频范围（64–940）里约 **27 个码值**（全范围约 31.5）。码值 V = 0.5 时，两者解码亮度分别为 0.21764 与 0.18946，γ = 2.4 比 γ = 2.2 低约 12.9%。
