# 致 FilmLight 的反馈邮件（草稿）

发送方式：FilmLight 官网的 Contact 表单，或你手上已有的支持渠道。下面是可直接粘贴的纯文本。

注意：不提及站点，只说在研读库里的 .flspace 文件。

Subject: Possible typo in ARRI LogC3 help text - "Reference white at 67%"

---

Dear FilmLight team,

I have been going through the .flspace files in the FilmLight colour space library to understand how the different camera encodings are defined, and I noticed what looks like a typo in one of the Help texts.

File: ARRI_LogC_WG_full.flspace ("ARRI: LogC3 / ARRI Wide Gamut 3")
Help text: "Reference white at 67%"

Four points suggest 57% was intended:

1. The file's own convertFromLinear maps a linear value of 1.0 to 0.5706, i.e. 57.1%.
2. Its WhitePoint is 584, and 584 / 1023 = 57.1%.
3. The companion file ARRI_LogC_FG_full.flspace ("ARRI: LogC3 / ARRI Film Gamut") has an identical curve - same constants (0.0106232 / 5.3676533 / 0.0926363 / 0.5696259 / 0.1073531 / 0.00937677) and the same WhitePoint of 584 - yet its Help reads "Reference white at 57%".
4. Entries that genuinely sit near 67% (Red_Col2_LogFilm, Legacy_Log) are Cineon-based and do map linear 1.0 to about 0.670.

I also checked whether this could be an exposure-index effect. Using the EI 160-1600 parameters from ARRI's "ALEXA Log C Curve - Usage in VFX", encode(1.0) only moves between 0.5649 and 0.5840, and 18% grey remains at 0.391 (400/1023) at every EI, so no exposure index produces 67%.

Could you confirm whether "67%" is a typo for "57%"? If it is intentional, I would also be grateful for one sentence on how "reference white" is defined in the library: most entries match encode(linear 1.0), while the Cineon-derived ones appear to follow the code value 685 out of 1000. Either way it would help me read the entries correctly.

Thank you - the encode/decode functions in the files have been very helpful for understanding these spaces.

Kind regards,

[Your name]
[Your email]
