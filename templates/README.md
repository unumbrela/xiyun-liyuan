# 排版模板与数据集说明

本目录用于存放期末作业的**排版模板**与**数据集获取说明**。

---

## 1. 排版模板：IEEE TVCG（已就绪 ✅）

考核 PPT 强烈建议采用 **IEEE Transactions on Visualization and Computer Graphics (TVCG)** 排版格式。
此格式即 IEEE VGTC（可视化与图形技术委员会）官方模板的 **journal（期刊）模式**。

### 位置

```
templates/ieee-tvcg-latex/
└── paper/
    ├── template.tex     # 主文件（已默认 journal/TVCG 模式）
    ├── vgtc.cls          # 文档类（支持 journal/conference/review 等）
    ├── template.bib      # 参考文献示例
    ├── abbrv-doi*.bst    # 参考文献样式
    └── pictures/         # 示例图片
```

来源：官方仓库 [ieee-vgtc/vis-latex-submission-template](https://github.com/ieee-vgtc/vis-latex-submission-template)
（该仓库已 archive，最新版见 <https://tc.computer.org/vgtc/publications/journal/>）。

### `template.tex` 开头已设为 TVCG 期刊样式

```latex
\documentclass[journal]{vgtc}                % final (journal style) ← 当前使用
%\documentclass[review,journal]{vgtc}         % 评审模式（带行号）
%\documentclass[preprint,journal]{vgtc}       % 预印本模式
```

> 注意：技术报告要求**正文 5 号字、单倍行距、≥5 页 A4**。TVCG 模板为双栏、固定字号，
> 与“5 号字”不完全对应——若老师严格要求 5 号字，可改用 Word 版 IEEE 模板；若以
> “TVCG 风格 + ≥5 页”为准，则本 LaTeX 模板直接可用。建议向老师确认以哪条为准。

### 如何编译

**方式 A：Overleaf（推荐，无需本地安装）**
1. 打开 <https://www.overleaf.com> → New Project → Upload Project；
2. 把 `templates/ieee-tvcg-latex/paper/` 整个文件夹打包上传；
3. 设 `template.tex` 为主文件，编译器选 **pdfLaTeX** 即可。
   也可直接用社区模板：<https://www.overleaf.com/latex/templates/ieee-tvcg-conference-style-template/htqfqtgkvcqf>

**方式 B：本地编译**
```bash
cd templates/ieee-tvcg-latex/paper
latexmk -pdf -bibtex template.tex
```
> ⚠️ 本机 conda 环境（`llm`）里的 TeX Live 不完整：缺少 `pdflatex.fmt`，
> `mktexfmt`/`mktexlsr.pl` 报错，**当前无法本地编译**。
> 解决：安装完整 TeX Live（`sudo apt install texlive-full`）或改用 Overleaf。

---

## 2. 京剧数据集（需手动获取 ⚠️）

赛题 I「戏韵万象」京剧数据可视分析挑战赛的数据集**无法在本环境自动下载**，原因有二：

1. **本机/沙箱网络无法访问 `chinavis.org`**（DNS 被解析到占位 IP `198.18.0.27`，连接超时）。
2. 数据集**仅向报名队伍发放**，通过竞赛官方的简道云（jiandaoyun）表单分发，未公开镜像
   （已检索 GitHub / 网盘均无公开副本）。

### 获取途径（任选其一）

1. **找任课老师索要**：课程仅借用该赛题数据集作为考核题目，老师通常会直接提供数据包
   （最稳妥，也无需真正报名）。
2. **ChinaVis 2026 官网下载**：在能访问外网的机器上打开
   <https://chinavis.org/2026/zh/challenge_call_for_participation>，
   按页面“数据下载/报名”指引获取。相关入口（来自官网，供参考）：
   - 报名入口：`https://s99x45wjic.jiandaoyun.com/f/6a0ae5b7d2ebb735eedc664d`
   - 赛道 1 提交：`https://s99x45wjic.jiandaoyun.com/f/6a0ae5b7d2ebb735eedc664e`
   > 注：官方报名截止 2026-06-07、作品截止 2026-06-20 均已过期，能否仍下载数据需以官网为准。

### 拿到数据后

把数据集放到项目下的 `data/` 目录（建议结构）：
```
final-project/
├── data/            # ← 京剧数据集放这里
├── templates/       # 本目录
└── 课程考核要求.md
```
拿到数据后告诉我，我可以帮你解析字段结构、做数据清洗与可视化原型。
