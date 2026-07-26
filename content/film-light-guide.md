+++
title = 'Film Light 使用说明书 / User Guide'
date = 2026-07-26T21:00:00+08:00
draft = false
showDate = false
+++

Film Light 是一款为胶片摄影设计的手持测光与拍摄记录工具。本页面同时提供中文和英文说明，供 App Store 技术支持参考。

*Film Light is a handheld light-metering and shooting-log tool built for film photography. This page provides both Chinese and English documentation for App Store technical support purposes.*

如有问题，请通过 [gaohuyuchen@foxmail.com](mailto:gaohuyuchen@foxmail.com) 联系我们。

*For questions, please contact us at [gaohuyuchen@foxmail.com](mailto:gaohuyuchen@foxmail.com).*

> 本文档由 Claude（Anthropic 的 AI 助手）根据当前代码实现撰写，作为 App Store 上线前的过渡版本。更详细、更准确的正式版说明书将由开发者本人后续更新。
>
> *This document was written by Claude (Anthropic's AI assistant) based on the current codebase, as an interim version for App Store submission. A more detailed and refined guide will be provided by the developer in a future update.*

---

## 目录 / Contents

- [测光系统 / Metering](#metering)
- [曝光参数：ISO・EV・ND / Exposure Controls](#exposure)
- [两种界面风格 / Interface Styles](#style)
- [拍摄方式 / Shutter Controls](#shutter)
- [曝光锁定 AE-L / Exposure Lock](#ae-lock)
- [LUT 滤镜预览 / LUT Preview](#lut)
- [胶卷日志 Logbook / Film Roll Logbook](#logbook)
- [相册 Album](#album)
- [天气记录 / Weather Logging](#weather)
- [系统权限 / Permissions](#permissions)
- [常见问题 / FAQ](#faq)

---

## 测光系统 / Metering {#metering}

Film Light 提供四种测光方式，可在顶部控制栏切换：

- **点测光 (Spot)** — 取样范围较小，用于精确测量画面中某一小块区域的曝光值。点击预览画面即可设置测光点，测光点会常驻显示，直到您点击新的位置。
- **局部测光 (Partial)** — 取样范围适中，兼顾主体与周边环境。
- **平均测光 (Average)** — 对整个画面取样，给出整体曝光参考。
- **智能测光 (Smart)** — 在 HLG（BT.2020）色彩空间下自动启用的全局测光模式，直接读取硬件曝光参数，不显示取样框。

*Film Light offers four metering modes, switchable from the top control bar:*

- ***Spot*** *— a small sample area for precise metering of one part of the frame. Tap the preview to set the metering point; the marker stays on screen until you tap a new location.*
- ***Partial*** *— a medium sample area balancing subject and surroundings.*
- ***Average*** *— samples the entire frame for an overall exposure reference.*
- ***Smart*** *— an automatic global mode used in HLG (BT.2020) color space, reading exposure directly from hardware without a sample overlay.*

> 提示：在 HLG 全局模式下，点测光不可用，画面上的测光点会自动清除。
>
> *Note: Spot metering is unavailable while in HLG global mode; any existing spot point is cleared automatically.*

---

## 曝光参数：ISO・EV・ND / Exposure Controls {#exposure}

- **ISO**：12–12800，按 1/3 档步进调节。
- **曝光补偿 (EV)**：-3.0 EV 至 +3.0 EV，按 1/3 档步进调节。
- **ND 滤镜**：提供「清晰」及 ND0.3 至 ND2.4 共 8 档可选，用于模拟中灰密度镜的减光效果。

以上三项均可通过顶部胶囊按钮或底部快捷键（可自定义左右两个快捷位）打开对应的调节面板。

*All three parameters below can be opened via the top capsule buttons, or via the two customizable quick-access slots at the bottom of the screen.*

- ***ISO***: *12–12800, adjustable in 1/3-stop increments.*
- ***Exposure Compensation (EV)***: *-3.0 to +3.0 EV, in 1/3-stop increments.*
- ***ND Filter***: *Clear plus 8 steps from ND0.3 to ND2.4, simulating neutral-density filtration.*

---

## 两种界面风格 / Interface Styles {#style}

您可以在设置中切换两种测光界面风格：

- **线性样式 (Linear)**：所有参数以水平滑块形式呈现，适合习惯触屏滑动操作的用户。
- **仪表盘样式 (Dial)**：以模拟旋钮的形式呈现参数，通过旋转手势调节，更接近实体测光表的操作体验。

*You can switch between two metering interface styles in Settings:*

- ***Linear***: *all parameters shown as horizontal sliders, suited to touch-drag interaction.*
- ***Dial***: *parameters shown as a simulated rotary dial, adjusted by rotation gestures — closer to the feel of a physical light meter.*

> 注意：两种界面风格下锁定曝光的方式不同——线性样式用独立的 AE-L 按钮，仪表盘样式用拨盘上的 "M" 手动模式。切换界面风格时，线性样式下的锁定会自动解除。详见下方「曝光锁定」章节。
>
> *Note: The two interface styles lock exposure differently — Linear style uses a dedicated AE-L button, Dial style uses the "M" manual mode on the dial. Switching interface style releases a Linear-style lock automatically. See the Exposure Lock section below.*

---

## 拍摄方式 / Shutter Controls {#shutter}

支持三种快门触发方式，效果完全一致：

1. 点击屏幕上的快门按钮
2. 使用 iPhone 侧键（Camera Control / Action Button，仅支持机型）
3. 按下并释放任意音量键

拍摄时会有触感反馈；若上一张照片仍在保存中，再次按下快门会给出提示性的轻触反馈，而不会丢帧或崩溃。

*Three equivalent ways to trigger the shutter:*

1. *Tap the on-screen shutter button*
2. *Use the iPhone side control (Camera Control / Action Button, on supported models)*
3. *Press and release either volume button*

*Capture triggers haptic feedback. If the previous photo is still being saved, pressing the shutter again gives a distinct "busy" haptic instead of silently failing or dropping the frame.*

---

## 曝光锁定 AE-L / Exposure Lock {#ae-lock}

两种界面风格下锁定曝光的操作方式不同，但效果一致：曝光目标被固定，画面构图变化时不会跟随调整。

**线性样式**：底部快门区旁有一个独立的 AE-L 按钮，点击即可锁定当前测光值，再次点击解锁。锁定状态下按钮以红底 "HOLD" 文字高亮显示。锁定与曝光补偿（EV）是两个独立维度——锁定只固定"基础测光值"，您仍可以在锁定状态下继续调整 EV 补偿。

**仪表盘样式**：点击右侧快门拨盘中心的 "M" 图标，即可进入手动曝光模式：当前曝光值被设为目标并锁定，此后转动光圈或快门拨盘会直接调整曝光，不再由测光自动跟随场景变化。再次点击 "M" 退出，恢复自动测光。

> 注意：仪表盘样式的 "M" 手动模式与线性样式的 AE-L 是两套独立机制，锁定状态不会在两种界面之间共享——从线性样式切换到仪表盘样式时，线性样式下的锁定会自动解除。

*Locking exposure works differently depending on interface style, but the effect is the same: the exposure target is fixed and won't drift as framing changes.*

***Linear style**: a dedicated AE-L button sits beside the shutter area — tap to lock the current metering value, tap again to release. While locked, the button highlights with a red "HOLD" label. Lock and EV compensation are independent: locking only freezes the base metering reading, and you can still adjust EV compensation while locked.*

***Dial style**: tap the "M" icon at the center of the shutter-speed dial to enter manual exposure mode — the current exposure reading becomes a fixed target, and rotating either the aperture or shutter dial adjusts exposure directly instead of following the scene automatically. Tap "M" again to exit and return to automatic metering.*

*Note: Dial style's "M" manual mode and Linear style's AE-L are two independent mechanisms, and the locked state is not shared between the two interface styles — switching from Linear to Dial style automatically releases a Linear-style lock.*

---

## LUT 滤镜预览 / LUT Preview {#lut}

LUT（Look-Up Table）是应用在实时预览画面上的色彩风格滤镜，用于模拟不同胶片或调色风格的观感。**LUT 只影响您在取景时看到的画面效果，不会改变保存下来的原始影像文件**——原图始终以未经风格化处理的状态保存，方便您后期使用任意软件重新调色。

内置预设：

- **PORTRA 400**（默认启用）
- **VELVIA 100**
- **STD 709**
- **EL ZONE**
- **B&W HC**
- **B&W Neg**

您可以在顶部控制栏的 LUT 胶囊按钮中开启或关闭 LUT 预览，并在弹出的横向选择条中切换预设。

**导入自定义 LUT**：支持标准 `.cube` 格式文件。在 LUT 面板中选择导入，系统会将文件复制到应用内部存储；如果文件名重复，会自动添加序号加以区分。导入的 LUT 可以删除，内置预设不可删除。

*LUT (Look-Up Table) is a color-style filter applied to the live preview, simulating the look of different film stocks or color grades. **LUTs only affect what you see while framing a shot — they never alter the saved original image file**, which is always stored ungraded so you can color it yourself afterward in any software.*

*Built-in presets: **PORTRA 400** (enabled by default), **VELVIA 100**, **STD 709**, **EL ZONE**, **B&W HC**, and **B&W Neg**.*

*Toggle LUT preview on/off from the LUT capsule in the top control bar, and switch presets from the horizontal picker that appears.*

***Importing custom LUTs**: standard `.cube` files are supported. Import from the LUT panel — files are copied into the app's private storage, and duplicate filenames are automatically suffixed. Imported LUTs can be deleted; built-in presets cannot.*

---

## 胶卷日志 Logbook / Film Roll Logbook {#logbook}

Logbook 模拟了实体胶卷的拍摄记录习惯，帮助您追踪每一卷胶片对应的拍摄参数。

新建一卷时可以填写：

- 胶卷名称
- 胶片型号（如 Tri-X 400）
- 原厂 ISO / 定级 ISO
- 画幅规格（如 135、120）
- 相机型号、镜头型号
- 帧容量（例如 36 张或 120 张；容量非必填）

设置了帧容量后，接近或达到容量上限时会有提示。每次拍摄会自动记录为该卷的下一帧，帧号自动递增，无需手动操作。

在相册的详情页中，您可以为每一帧补充备注、评分（1–5 星）以及自定义标签。

*Logbook mirrors the habit of keeping a physical film log, tracking the shooting parameters for each roll.*

*When starting a new roll, you can record: roll name, film stock (e.g. Tri-X 400), box speed / rated ISO, format (e.g. 135, 120), camera and lens, and an optional frame capacity (e.g. 36 or 120 exposures).*

*If a capacity is set, you'll see a warning as you approach or reach the limit. Each shot is automatically logged as the next frame on the active roll, with frame numbers incrementing automatically.*

*From a photo's detail view in the Album, you can add notes, a 1–5 star rating, and custom tags to each frame.*

---

## 相册 Album {#album}

拍摄的照片保存在应用的私有存储空间中，而不是直接写入系统照片库——这样才能同时保存原始影像和完整的拍摄参数记录。

**删除与恢复**：删除照片会先移入应用内部的回收站，30 天后自动清空。删除后会出现「撤销」提示，可立即恢复刚删除的照片。

**导出到系统相册**：在相册中选择照片后可导出到 iPhone 系统照片库，导出的是按当前 LUT 渲染后的图像。

**详情页信息**：每张照片的详情页可查看光圈、快门、ISO、ND 挡位、色彩空间、拍摄时间、地理位置（如授权）、天气记录，以及所用 LUT 预设名称。

**相对 EV 点表**：详情页还提供一个基于原图重新估算相对曝光值的小工具——点击照片上的不同区域，即可得到各区域相对于整体曝光的差值，用于回顾拍摄时的光比判断。此功能仅做估算参考，不会改变已保存的影像。

*Photos are stored in the app's private storage rather than written directly to the system Photo Library — this is what allows both the original image and its full shooting metadata to be preserved together.*

***Delete & undo**: deleting a photo first moves it to an in-app trash, which is emptied automatically after 30 days. An "Undo" prompt appears immediately after deleting, letting you restore the photo right away.*

***Export to Photos**: select photos in the Album to export them to the iPhone Photo Library, rendered with whichever LUT was active.*

***Detail view**: each photo's detail page shows aperture, shutter speed, ISO, ND stop, color space, capture time, location (if authorized), weather log, and the LUT preset used.*

***Relative EV chart**: the detail view also includes a tool for re-estimating relative exposure values from the saved original image — tap different areas of the photo to see how their exposure compares to the overall reading, useful for reviewing lighting ratios after the fact. This is an estimate for reference only and never modifies the saved image.*

---

## 天气记录 / Weather Logging {#weather}

在授权定位权限的前提下，拍摄时应用会根据当前位置自动查询并记录天气信息，包括天气状况、温度、体感温度、湿度、气压、能见度、云覆盖率、紫外线指数以及昼夜状态。整个查询过程限时进行，若超时不会拖慢或阻止拍摄保存，仅会在记录中标注获取失败。

*With location permission granted, the app automatically looks up and logs weather at the time of capture — condition, temperature, feels-like temperature, humidity, pressure, visibility, cloud cover, UV index, and day/night state. The lookup is time-boxed: if it times out, it never delays or blocks saving the photo, and the log simply notes the lookup failed.*

---

## 系统权限 / Permissions {#permissions}

| 权限 / Permission | 用途 / Purpose |
|---|---|
| 相机 Camera | 实时取景与拍摄照片 / Live preview and photo capture |
| 照片 Photo Library | 仅用于将编辑后的照片导出到您的系统相册（添加权限，不读取您相册中的其他内容） / Only used to export edited photos to your system Photo Library (add-only access — the app never reads your existing photos) |
| 定位 Location | 记录拍摄地点，并用于自动获取天气信息 / Records the shooting location and enables automatic weather lookup |

以上权限均为可选：拒绝授权不会导致应用无法使用，仅对应功能会不可用（例如未授权定位则不会记录位置与天气）。

*All permissions above are optional: declining does not prevent the app from working — only the corresponding feature becomes unavailable (e.g. without location access, location and weather are simply not logged).*

---

## 常见问题 / FAQ {#faq}

**Q: 删除的照片能找回吗？**
A: 可以。删除后 30 天内的照片都在应用内部的回收站中，删除后立即弹出的「撤销」提示可以马上恢复；30 天后会被永久清除。

**Q: LUT 会不会影响我拍出来的照片？**
A: 不会。LUT 只是取景时的实时预览效果，保存的原始文件始终不经风格化处理。

**Q: 仪表盘样式下怎么锁定曝光？**
A: 点击快门拨盘中心的 "M" 图标进入手动曝光模式，此时转动拨盘即可直接调整曝光，不再自动跟随场景。这与线性样式的 AE-L 按钮是两套独立机制，从线性样式切换过来的锁定不会保留。

**Q: 不授权定位权限会怎样？**
A: 应用仍可正常测光和拍摄，只是不会记录拍摄地点，也无法自动获取天气信息。

**Q: 支持哪种格式的自定义 LUT？**
A: 支持标准 `.cube` 格式文件。

---

*Q: Can I recover a deleted photo?*
*A: Yes. Deleted photos stay in an in-app trash for 30 days. The "Undo" prompt that appears right after deletion restores it immediately; after 30 days it's permanently erased.*

*Q: Does the LUT affect the photo I actually capture?*
*A: No. The LUT is a live preview effect only — the saved original file is always stored ungraded.*

*Q: How do I lock exposure in Dial style?*
*A: Tap the "M" icon at the center of the shutter dial to enter manual exposure mode — rotating the dials then adjusts exposure directly instead of following the scene. This is a separate mechanism from Linear style's AE-L button, and a lock carried over from Linear style is not preserved.*

*Q: What happens if I don't grant location access?*
*A: Metering and capture work normally — the app just won't log the shooting location or fetch weather automatically.*

*Q: What custom LUT format is supported?*
*A: Standard `.cube` files.*
