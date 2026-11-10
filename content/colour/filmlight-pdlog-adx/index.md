+++
title = "FilmLight Academy PD Log / ~ADX"
date = 2026-11-06T10:00:00+08:00
draft = false
wip = true
intro = "用 ADX 矩阵与 sigmoid 曲线近似负片响应，把场景曝光压进 0–1 的 Cineon 对数范围；18% 灰落在 0.5，中点伽马约 0.6。"
category = "Scene Referred"
sourceSpace = "FilmLight_PDLog_ADX.flspace"
gamutNote = "这里不画色度图：它的色度跟 ADX 是同一份借用（相对曝光空间），而且这条曲线自己的黑/白落点与文件头标注不一致，见正文。"
transferNote = "「黑点 / 白点」82 / 649 是 .flspace 文件头的标注（继承自 ADX），不是这条曲线的落点——按本页公式，线性 0 的编码是 0.0000（码值 0），线性 1.0 是 0.7021（码值 718）。"
+++

## 这是什么

FilmLight 色彩空间库里的一条近似条目，用 ADX 的矩阵加上一条 sigmoid 曲线，模拟负片对场景曝光的响应：

> This is an approximate negative film response using the Academy Density Exchange (ADX) matrix and a sigmoid tone curve. It maps the positive scene exposure range into the 0-1 Cineon log range. The scene 18% grey is mapped to the 50% output (negative density 1.0), with a gamma value of about 0.6 at the mid point. Reference white at 63%

**没有公开规范**，下面的数值全部来自 `.flspace`。

## 曲线

```text
toLinear:  c = rgb × CDD→CID
           c = c < 0.75 ? c/(1−c) : 16c−9
           c = c² × 0.18
```

三句话可以直接验：

- **18% 灰 → 0.5**：0.5 代进去，`0.5/(1−0.5) = 1`，再平方乘 0.18 得 0.18。
- **中点伽马 ≈ 0.6**：sigmoid 在 0.5 附近的对数斜率，与文件描述一致。
- **0.75 以上线性截断**：`16c−9` 是把 `c/(1−c)` 在 0.75 处的切线延长线。0.75 对应 `c₀ = 3`，即相对曝光 1.62（18% × 9）——文件注释称其为「3× the native white point」。截断是为了避免反向变换在极端场景值下产生怪异结果。

编码方向（`convertFromLinear`）先把线性值按 0.18 归一、开方，再取 `c/(1+c)`，最后乘 ADX 矩阵的逆。18% 灰因此落在 0.5，线性 1.0 落在 0.7021。

## 与 ADX 的区别

两者用的是同一个矩阵（ADX 的 CDD → CID）和同一份原色，但**非线性不在同一步**：

```text
ADX     ：码值 →（密度域）矩阵 → 密度/曝光 LUT → 曝光
PD Log  ：码值 →（码值域）矩阵 → sigmoid      → 曝光
```

所以它不是「ADX 的另一种位深」，而是另一条建模路径：ADX 在密度域做非线性，这里在码值域做。

## 黑点、白点与参考白

文件头写 `BlackPoint = 82`、`WhitePoint = 649`，与 ADX 相同，参考白 63%（649 / 1023）。但这两个数对这条曲线不成立：按本页公式，线性 0 的编码是 0.0000（码值 0），线性 1.0 是 0.7021（码值 718），82 / 649 对应的是线性 0.0014 / 0.54。

原因很可能是从 ADX 文件继承——ADX 的 82 / 649 是「相对曝光 0 / 1.0 落在曲线上的码值」，而这条曲线的刻度不同。页面的「黑点 / 白点」一栏保留文件头原值，方便对照 `.flspace`；判断曲线落点时以 0.0000 / 0.5000 / 0.7021 三个编码值为准。

## 色度

文件把色域标为「~ADX」，即近似 ACES ADX；原色与 ADX10 / ADX16 相同，也就是 ACES 的「相对曝光」空间，不是胶片的色域。这一点在 [ADX10](/colour/adx10/) 页有完整推导。因为这里的矩阵作用在码值域、后面还跟着 sigmoid，整个码值范围过的是同一条曲线，三通道比例会被改写——所以即使画出色度图，也不能当作边界。
