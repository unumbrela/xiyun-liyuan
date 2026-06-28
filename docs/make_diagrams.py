# -*- coding: utf-8 -*-
"""用 matplotlib 生成两张示意图：系统分层架构图、数据处理流程图。
输出到 docs/figures/diagram_arch.png 与 diagram_pipeline.png。"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.font_manager import FontProperties

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "figures")

FONT = FontProperties(fname="/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc")
FONTB = FontProperties(fname="/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc")

# 宣纸米白 + 朱红/黛青 配色，与系统主题呼应
PAPER = "#f7f1e3"
INK = "#3a332b"
RED = "#9e2b25"
JADE = "#3f6f63"
GOLD = "#b8860b"
BLUE = "#3a5a7a"


def box(ax, x, y, w, h, text, fc, tc="white", fs=13, bold=True, sub=None):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.06",
                       linewidth=1.2, edgecolor=INK, facecolor=fc, mutation_aspect=1)
    ax.add_patch(p)
    fp = FONTB if bold else FONT
    if sub:
        ax.text(x + w / 2, y + h * 0.62, text, ha="center", va="center",
                fontproperties=fp, fontsize=fs, color=tc)
        ax.text(x + w / 2, y + h * 0.27, sub, ha="center", va="center",
                fontproperties=FONT, fontsize=fs - 4, color=tc)
    else:
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
                fontproperties=fp, fontsize=fs, color=tc)


def arrow(ax, x0, y0, x1, y1, color=INK):
    ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>",
                 mutation_scale=18, linewidth=1.6, color=color, shrinkA=2, shrinkB=2))


def make_arch():
    fig, ax = plt.subplots(figsize=(9, 5.4), dpi=200)
    ax.set_xlim(0, 10); ax.set_ylim(0, 10); ax.axis("off")
    fig.patch.set_facecolor(PAPER); ax.set_facecolor(PAPER)
    ax.text(5, 9.6, "图  系统分层架构：数据管线 → 产物 → 服务 → 前端 → 桌面封装",
            ha="center", fontproperties=FONTB, fontsize=14, color=RED)

    box(ax, 0.6, 8.1, 8.8, 1.0, "原始数据集", JADE, fs=14,
        sub="38 个来源集合 · 1473 部嵌套压缩 PDF（含中文文件名乱码）")
    box(ax, 0.6, 6.5, 8.8, 1.0, "pipeline/  离线计算管线（Python）", GOLD, fs=14,
        sub="递归解压 + 规则解析 + 行当分类 / 关系网络 / 主题 / 叙事 / 综合关联 五任务")
    box(ax, 0.6, 4.9, 8.8, 1.0, "data/processed/  产物层", BLUE, fs=14,
        sub="corpus.jsonl 逐剧语料 · plays.sqlite · 各任务 JSON 结果 · 质量报告")
    box(ax, 0.6, 3.3, 8.8, 1.0, "backend/  FastAPI 只读服务", "#6a4c93", fs=14,
        sub="加载产物并提供 JSON API · network_lib.py 前后端共用建网保证口径一致")
    box(ax, 0.6, 1.7, 8.8, 1.0, "frontend/  React + Vite + ECharts 九模块仪表盘", RED, fs=14,
        sub="开篇导览 · 总览 · 任务一~五 · 双剧对比 · 结语余韵（全局当前剧目联动）")
    box(ax, 2.6, 0.3, 4.8, 0.85, "Electron 桌面封装（后端随应用自动起停）", INK, fs=12)

    for y0, y1 in [(8.1, 7.5), (6.5, 5.9), (4.9, 4.3), (3.3, 2.7), (1.7, 1.15)]:
        arrow(ax, 5, y0, 5, y1)
    plt.tight_layout()
    p = os.path.join(OUT, "diagram_arch.png")
    fig.savefig(p, facecolor=PAPER, bbox_inches="tight"); plt.close(fig)
    print("saved", p)


def make_pipeline():
    fig, ax = plt.subplots(figsize=(9.2, 4.4), dpi=200)
    ax.set_xlim(0, 12); ax.set_ylim(0, 6); ax.axis("off")
    fig.patch.set_facecolor(PAPER); ax.set_facecolor(PAPER)
    ax.text(6, 5.6, "图  数据工程流程：从原始压缩包到统一结构化语料底座",
            ha="center", fontproperties=FONTB, fontsize=14, color=RED)

    steps = [
        ("①嵌套解压", "外层包内\n再嵌 41 子包", JADE),
        ("②中文名修复", "GBK 编码\n乱码还原", GOLD),
        ("③PDF 文本抽取", "可抽取文本\n非扫描免 OCR", BLUE),
        ("④规则解析", "角色/场次/\n对白结构化", "#6a4c93"),
        ("⑤质量自检", "1473 部\n100% 解析", RED),
    ]
    n = len(steps); w = 1.95; gap = (12 - n * w) / (n + 1)
    xs = []
    for i, (t, s, c) in enumerate(steps):
        x = gap + i * (w + gap)
        xs.append(x)
        box(ax, x, 2.6, w, 1.5, t, c, fs=12.5, sub=s)
        if i > 0:
            arrow(ax, xs[i - 1] + w, 3.35, x, 3.35)
    # 产物
    box(ax, 2.2, 0.5, 3.0, 1.1, "corpus.jsonl", INK, fs=12, sub="逐剧 JSON 语料")
    box(ax, 6.8, 0.5, 3.0, 1.1, "plays.sqlite", INK, fs=12, sub="便于检索的库")
    arrow(ax, 5.0, 2.6, 3.7, 1.6)
    arrow(ax, 7.0, 2.6, 8.3, 1.6)
    ax.text(6, 0.05, "五项任务共享同一份被严格校验的结构化语料",
            ha="center", fontproperties=FONT, fontsize=11, color=INK)
    plt.tight_layout()
    p = os.path.join(OUT, "diagram_pipeline.png")
    fig.savefig(p, facecolor=PAPER, bbox_inches="tight"); plt.close(fig)
    print("saved", p)


if __name__ == "__main__":
    make_arch()
    make_pipeline()
