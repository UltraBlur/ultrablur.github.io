# `.flspace` 库盘点

扫描于 2026-11-06。目录 `.tmp/colourspaces`，其中 `.flspace` 共 **137** 个（同目录另有 20 个 `.cub`、6 个 `.fltransform`、1 个 json，不在本表）。

「已使用」指条目 front matter 的 `sourceSpace` 记录了该文件名。

| | 数量 |
| --- | ---: |
| 目录内 `.flspace` | 137 |
| 已挂到条目 | **25** |
| 未引用 | **112** |

---

## 1. 已使用（25）

| 文件 | `.flspace` 里的名称 | 条目 |
| --- | --- | --- |
| `ACES_lin` | ACES: Linear / AP0 | [`aces2065-1`](../content/colour/aces2065-1/index.md) |
| `ACEScc` | ACEScc: ACEScc / AP1 | [`acescc`](../content/colour/acescc/index.md) |
| `ACEScct` | ACEScct: ACEScct / AP1 | [`acescct`](../content/colour/acescct/index.md) |
| `ACEScg` | ACEScg: Linear / AP1 | [`acescg`](../content/colour/acescg/index.md) |
| `AdobeRGB` | Adobe: 2.2 Gamma / Adobe RGB (1998) | [`adobe-rgb`](../content/colour/adobe-rgb/index.md) |
| `ARRI_LogC_WG_full` | ARRI: LogC3 / ARRI Wide Gamut 3 | [`arri-logc3`](../content/colour/arri-logc3/index.md) |
| `BMD_BMDFilm_GammaGen5_BMD_Wide_GamutRGB` | BMD: BMD Film Gen5 / BMD Wide GamutRGB | [`blackmagic-film-gen5`](../content/colour/blackmagic-film-gen5/index.md) |
| `BMD_Intermediate_DaVinci_Wide_Gamut` | BMD: DaVinci Intermediate / DaVinci Wide Gamut | [`davinci-intermediate`](../content/colour/davinci-intermediate/index.md) |
| `DJI_DLog_DGamut` | DJI: D-Log / D-Gamut | [`dji-dlog`](../content/colour/dji-dlog/index.md) |
| `FilmLight_CPD_GenericNegative` | FilmLight: Cineon PD Log / Generic Negative | [`filmlight-generic-negative`](../content/colour/filmlight-generic-negative/index.md) |
| `FilmLight_PDLog_ADX` | FilmLight: Academy PD Log / ~ADX | [`filmlight-pdlog-adx`](../content/colour/filmlight-pdlog-adx/index.md) |
| `Fujifilm_FLog_FGamut` | Fujifilm: F-Log / F-Gamut | [`flog`](../content/colour/flog/index.md) |
| `Fujifilm_FLog2_FGamut` | Fujifilm: F-Log2 / F-Gamut | [`flog2`](../content/colour/flog2/index.md) |
| `Rec2100_HLG_2020_1000` | Rec.2100: HLG 1.2 Gamma / Rec.2020 / 1000 nits | [`hlg`](../content/colour/hlg/index.md) |
| `Red_Log3G10_REDWideGamut` | RED: Log3G10 / REDWideGamutRGB | [`log3g10`](../content/colour/log3g10/index.md) |
| `Apple_Display_P3D65` | Apple: 2.2 Gamma / P3 D65 | [`p3-d65`](../content/colour/p3-d65/index.md) |
| `P3` | DCI: 2.6 Gamma / P3 DCI | [`p3-dci`](../content/colour/p3-dci/index.md) |
| `Rec2020_lin` | CGI: Linear / Rec.2020 | [`rec2020`](../content/colour/rec2020/index.md) |
| `Rec709_lin` | CGI: Linear / Rec.709 | [`rec709`](../content/colour/rec709/index.md) |
| `Sony_SLog3_Gam3` | Sony: S-Log3 / S-Gamut3 | [`slog3`](../content/colour/slog3/index.md) |
| `Sony_SLog3_Gam3Cine` | Sony: S-Log3 / S-Gamut3.Cine | [`slog3-cine`](../content/colour/slog3-cine/index.md) |
| `sRGB` | sRGB: ~2.2 Gamma / Rec.709 | [`srgb`](../content/colour/srgb/index.md) |
| `Rec2084_Rec2020` | Rec.2100: ST 2084 PQ / Rec.2020 / 1000 nits | [`st2084`](../content/colour/st2084/index.md) |
| `FilmLight_TLog_EGamut` | FilmLight: T-Log / E-Gamut | [`tlog-egamut`](../content/colour/tlog-egamut/index.md) |
| `Panasonic_VLog_VGamut` | Panasonic: V-Log / V-Gamut | [`vlog`](../content/colour/vlog/index.md) |

---

## 2. 未使用（112）

### 2.1 站内已有这个空间，只是没记 `sourceSpace`（12）

这批文件就是对应条目的数据来源，建议把文件名补进 front matter。

| 文件 | 名称 | 对应条目 |
| --- | --- | --- |
| `ADX` | ACES: ADX Log / ADX | [`adx10`](../content/colour/adx10/index.md) |
| `ADX16` | ACES: ADX16 Log / ADX | [`adx16`](../content/colour/adx16/index.md) |
| `ARRI_LogC4_AWG4` | ARRI: LogC4 / ARRI Wide Gamut 4 | [`arri-logc4`](../content/colour/arri-logc4/index.md) |
| `Apple_Log_Rec2020` | Apple: Apple Log / Rec.2020 | [`apple-log`](../content/colour/apple-log/index.md) |
| `FilmLight_TLog_EGamut2` | FilmLight: T-Log / E-Gamut 2 | [`tlog-egamut2`](../content/colour/tlog-egamut2/index.md) |
| `Fujifilm_FLog2_FGamutC` | Fujifilm: F-Log2 / F-GamutC | [`fujifilm-flog2c`](../content/colour/fujifilm-flog2c/index.md) |
| `Nikon_NLog` | Nikon: N-Log / Rec.2020 | [`nikon-nlog`](../content/colour/nikon-nlog/index.md) |
| `Red_Col2_LogFilm` | RED: REDlog Film / REDcolor 2 | [`red-logfilm`](../content/colour/red-logfilm/index.md) |
| `Sony_SLog` | Sony: S-Log / S-Gamut | [`sony-slog`](../content/colour/sony-slog/index.md) |
| `Sony_SLog2` | Sony: S-Log2 / S-Gamut | [`sony-slog2`](../content/colour/sony-slog2/index.md) |
| `Sony_SLog3_Gam3_Venice` | Sony: S-Log3 / S-Gamut3 / Venice | [`sony-slog3-venice`](../content/colour/sony-slog3-venice/index.md) |
| `Sony_SLog3_Gam3Cine_Venice` | Sony: S-Log3 / S-Gamut3.Cine / Venice | [`sony-slog3-cine-venice`](../content/colour/sony-slog3-cine-venice/index.md) |

### 2.2 现有条目的变体（63）

线性版、Legal / Full 范围版、Dolby 的亮度版、Canon 的 D55 / 钨丝白平衡版、OCIO 纹理版。同一色域或同一传递函数的不同封装，不单独成条目。

| 文件 | 名称 |
| --- | --- |
| `ARRI_Linear_AWG4` | ARRI: Linear / ARRI Wide Gamut 4 |
| `ARRI_Linear_WG` | ARRI: Linear / ARRI Wide Gamut 3 |
| `Apple_HLG_P3D65_1000` | Apple: HLG 1.2 Gamma / P3D65 / 1000 nits |
| `BMD_Linear_DaVinci_Wide_Gamut` | BMD: Linear / DaVinci Wide Gamut |
| `Canon_Linear_CineGamut_D55` | Canon: Linear / CinemaGamut / Daylight |
| `Canon_log1_CineGamut_D55` | Canon: Canon-Log / CineGamut / Daylight |
| `Canon_log1_CineGamut_T` | Canon: Canon-Log / CineGamut / Tungsten |
| `Canon_log1_P3_D55` | Canon: Canon-Log / P3+ / Daylight |
| `Canon_log1_P3_T` | Canon: Canon-Log / P3+ / Tungsten / 4.4 compatible |
| `Canon_log2_CineGamut_D55` | Canon: Canon-Log2 / CineGamut / Daylight |
| `Canon_log2_CineGamut_T` | Canon: Canon-Log2 / CineGamut / Tungsten |
| `Canon_log2_P3_D55` | Canon: Canon-Log2 / P3+ / Daylight |
| `Canon_log2_P3_T` | Canon: Canon-Log2 / P3+ / Tungsten |
| `Canon_log3_CineGamut_D55` | Canon: Canon-Log3 / CinemaGamut / Daylight |
| `Canon_log3_CineGamut_T` | Canon: Canon-Log3 / CinemaGamut / Tungsten |
| `Canon_log3_Rec2020` | Canon: Canon-Log3 / Rec.2020 |
| `CinityLog_CinityRGBD65_110` | Cinity 2D: Cinity Log / Cinity RGB D65 / 110 nits |
| `DCI_P3D65` | DCI: 2.6 Gamma / P3 D65 |
| `DJI_Linear_DGamut` | DJI: Linear / D-Gamut |
| `DisplayP3linear_1600nits` | Apple: Linear / P3 / 1600 nits |
| `DolbyPQ` | Dolby: ST 2084 PQ / P3 D65 / 4000 nits |
| `DolbyPQ_P3D65_10000nits` | Dolby: ST 2084 PQ / P3 D65 / 10000 nits |
| `DolbyPQ_P3D65_1000nits` | Dolby: ST 2084 PQ / P3 D65 / 1000 nits |
| `DolbyPQ_P3D65_108nits` | Dolby Cin: ST 2084 PQ / P3 D65 / 108 nits |
| `DolbyPQ_P3D65_1600nits` | Dolby: ST 2084 PQ / P3 D65 / 1600 nits |
| `DolbyPQ_P3D65_2000nits` | Dolby: ST 2084 PQ / P3 D65 / 2000 nits |
| `DolbyPQ_P3D65_300nits` | DCI: ST 2084 PQ / P3 D65 / 300 nits |
| `DolbyPQ_P3D65_5000nits` | Dolby: ST 2084 PQ / P3 D65 / 5000 nits |
| `DolbyPQ_P3D65_600nits` | Dolby: ST 2084 PQ / P3 D65 / 600 nits |
| `FilmLight_Linear_EGamut` | FilmLight: Linear / E-Gamut |
| `FilmLight_Linear_EGamut2` | FilmLight: Linear / E-Gamut 2 |
| `Legacy_Linear` | Legacy: Linear / Rec.709 |
| `Legacy_Log` | Legacy: Cineon Log / Rec.709 |
| `OCIO_Linear_P3D65` | OCIO: Linear / P3D65 |
| `OCIO_g18_Rec709_tx` | OCIO: 1.8 Gamma / Rec.709 / Texture |
| `OCIO_g22_AP1_tx` | OCIO: 2.2 Gamma / AP1 / Texture |
| `OCIO_g22_Rec709_tx` | OCIO: 2.2 Gamma / Rec.709 / Texture |
| `OCIO_g24_Rec709_tx` | OCIO: 2.4 Gamma / Rec.709 / Texture |
| `OCIO_sRGBencoding_AP1_tx` | OCIO: ~2.2 Gamma / AP1 / Texture |
| `OCIO_sRGBencoding_P3D65_tx` | OCIO: ~2.2 Gamma / P3D65 / Texture |
| `Panasonic_Linear_VGamut` | Panasonic: Linear / V-Gamut |
| `Rec2084_Rec2020_10000nits` | Rec.2100: ST 2084 PQ / Rec.2020 / 10000 nits |
| `Rec2084_Rec2020_108nits` | Dolby Cin: ST 2084 PQ / Rec.2020 / 108 nits |
| `Rec2084_Rec2020_1600nits` | Rec.2100: ST 2084 PQ / Rec.2020 / 1600 nits |
| `Rec2084_Rec2020_2000nits` | Rec.2100: ST 2084 PQ / Rec.2020 / 2000 nits |
| `Rec2084_Rec2020_300nits` | DCI: ST 2084 PQ / Rec.2020 / 300 nits |
| `Rec2084_Rec2020_4000nits` | Rec.2100: ST 2084 PQ / Rec.2020 / 4000 nits |
| `Rec2084_Rec2020_5000nits` | Rec.2100: ST 2084 PQ / Rec.2020 / 5000 nits |
| `Rec2084_Rec2020_600nits` | Rec.2100: ST 2084 PQ / Rec.2020 / 600 nits |
| `Rec2100_HLG_2020_1000_PreviewSDR` | Rec.2100: HLG 1.2 Gamma / Rec.2020 / Preview SDR |
| `Rec2100_HLG_Legal_2020_1000` | Rec.2100: HLG 1.2 Gamma Legal Range / Rec.2020 / 1000 nits |
| `Red_Linear_REDWideGamut` | RED: Linear / REDWideGamutRGB |
| `Sony_Linear_Gam3` | Sony: Linear / S-Gamut3 |
| `Sony_Linear_Gam3Cine_Venice` | Sony: Linear / S-Gamut3.Cine / Venice |
| `Sony_Linear_Gam3_Venice` | Sony: Linear / S-Gamut3 / Venice |
| `Sony_SLog2_Day` | Sony: S-Log2 / S-Gamut Daylight |
| `Sony_SLog2_Tung` | Sony: S-Log2 / S-Gamut Tungsten |
| `UHDTV_Full` | Rec.2020: 2.4 Gamma / Rec.2020 |
| `UHDTV_Legal` | Rec.2020: 2.4 Gamma Legal / Rec.2020 |
| `Video_Full` | Rec.1886: 2.4 Gamma / Rec.709 |
| `Video_Legal` | Rec.1886: 2.4 Gamma Legal / Rec.709 |
| `sRGB_Display` | sRGB Display: 2.2 Gamma / Rec.709 |
| `sRGB_Legal` | sRGB: ~2.2 Gamma Legal / Rec.709 |

### 2.3 工具 / 矩阵 / IDT（6）

不是色彩空间，是推导中间量。

| 文件 | 名称 | 用途 |
| --- | --- | --- |
| `BaseLMS` | Linear Base LMS | CAT 用的 LMS 基底 |
| `BaseLMS_12_stops` | Linear Base LMS 12 stops | 同上，12 档 |
| `BaseLMS_Achromatic_12_stops` | Achromatic ACEScc Base LMS 12 stops | 同上，消色差版 |
| `BradfordLMS` | Linear Bradford LMS | Bradford CAT 矩阵 |
| `VonKriesLMS` | Von Kries: linear / LMS | von Kries CAT 矩阵 |
| `Nikon_Linear_XYZ_D65` | Nikon: Linear / XYZ / D65 | N-Log 的 IDT 矩阵，不是独立空间 |

### 2.4 与站内无重合的空间（18）

这批是唯一有「新增条目」价值的部分，逐条判断如下。

| 文件 | 名称 | 判断 |
| --- | --- | --- |
| `ACES_cinlog` | ACES: Cineon Log / AP0 | ACES 文档是否给出该编码待查 |
| `ACES_P3D60` | DCI: 2.6 Gamma / P3 D60 | ACES 输出变换里的 D60 版 P3，待查 |
| `DCI_XYZ` | DCI: 2.6 Gamma / X′Y′Z′ | DCI 规范（与 P3-DCI 同一份 PDF）覆盖，可做 |
| `DCI_PQ_XYZ_300nits` | DCI: ST 2084 PQ / X′Y′Z′ / 300 nits | DCI XYZ + PQ 的亮度变体，暂不做 |
| `DolbyPQ_XYZ_108nits` | Dolby Cin: ST 2084 PQ / X′Y′Z′ / 108 nits | 同上，暂不做 |
| `Cintel_Negative` | BMD: Cintel Negative | 未见公开规范；可仿 Generic Negative 不写来源 |
| `Cintel_Print` | BMD: Cintel Print | 同上 |
| `ARRI_LogC_FG_full` | ARRI: LogC3 / ARRI Film Gamut | Film Gamut 原色是否公布待查；用处极窄 |
| `CanonC500_D55` | Canon: Canon-Log / C500 Type A Daylight | Canon 支持库可能 401，待查 |
| `CanonC500T` | Canon: Canon-Log / C500 Type A Tungsten | 同上 |
| `Dolby_HSV_ICtCp` | Rec.2100: ICtCp HSV | BT.2100 定义 ICtCp，HSV 是自定义变体，不建议 |
| `RLab` | RLab | 原始论文，不是厂商/标准文档，待定 |
| `RLabDisplay` | RLab Display | 同上 |
| `OCIO_Rec709_OETF` | OCIO: ~1.95 Gamma / Rec.709 | BT.709 免费 PDF 覆盖，可做 |
| `Legacy_Video` | Rec.709 Camera: ~1.95 Gamma / Rec.709 | 同上 |
| `Legacy_Video_Legal` | Rec.709 Camera: ~1.95 Gamma Legal / Rec.709 | 同上，Legal 范围 |
| `FilmLight_Linear_tRGB` | FilmLight: Linear / tRGB | FilmLight 私有模型，未见公开规范 |
| `FilmLight_Linear_TCS_XYZ_Scene` | FilmLight: Linear / TCS XYZ | 同上 |

### 2.5 FilmLight 私有模型与解析不了的文件（13）

FilmLight 自家的外观模型（HSB / HSE / Eab / tRGB / Yxy），没有公开规范；其中多数文件是压缩格式，开头是 `` ` `` 加二进制，zlib / lz4 都解不开，要读得用 FilmLight 自己的工具。

| 文件 | 名称 | 备注 |
| --- | --- | --- |
| `BMD_Linear_WG` | BMD 线性版（WG） | 压缩格式，无法读取 |
| `FilmLight_Eab` | FilmLight Eab | 压缩格式 |
| `FilmLight_Eab2` | FilmLight Eab 2 | 压缩格式 |
| `FilmLight_HSB` | FilmLight HSB | 压缩格式 |
| `FilmLight_HSE` | FilmLight HSE | 压缩格式 |
| `FilmLight_HSE2` | FilmLight HSE 2 | 压缩格式 |
| `FilmLight_LinearEab` | FilmLight 线性 Eab | 压缩格式 |
| `FilmLight_LinearEab2` | FilmLight 线性 Eab 2 | 压缩格式 |
| `FilmLight_Linear_tRGB_1931` | FilmLight 线性 tRGB（1931） | 压缩格式 |
| `FilmLight_Linear_tRGB_1931_2` | FilmLight 线性 tRGB（1931，v2） | 压缩格式 |
| `FilmLight_VideoLog_EGamut_ish_v1` | FilmLight VideoLog / E-Gamut | 压缩格式 |
| `FilmLight_Yxy_VideoLog` | FilmLight Yxy / VideoLog | 压缩格式 |
| `WebVideo_Rec709_2025` | Web 视频 / Rec.709（2025） | 压缩格式，无法读取 |

---

## 3. 结论

- **25 个已用、11 个该记没记**，补齐 `sourceSpace` 属于低风险清理，不涉及新增条目。
- **64 个是变体**，除非要展示「同一色域不同白平衡」这类对照，否则不必动。
- **真正可能新增的只有 4 个左右**：DCI XYZ、Rec.709 相机 OETF（含 Legal 版），以及待查的 ACES Cineon Log 与 P3-D60。
- **Cintel Negative / Print** 与已上线的 FilmLight Generic Negative 同性质：只有 `.flspace`，没有一手文档，要收只能按「无来源」处理。
- 其余（FilmLight 私有模型、RLab、ICtCp-HSV）按现行来源标准进不了库。

重新盘点：

```bash
# 列出条目里记录的 .flspace
grep -h '^sourceSpace' content/colour/*/index.md | sed "s/.*= *//;s/[\"']//g" | sort -u
# 与 .tmp/colourspaces 下的文件比对
```
