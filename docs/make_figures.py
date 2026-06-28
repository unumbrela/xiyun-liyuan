# -*- coding: utf-8 -*-
"""把 7 张整页截图（3000x2160）按面板裁成聚焦子图，输出到 docs/figures/sub/。
裁切框为 (x0, y0, x1, y1)，坐标基于全分辨率 3000x2160。"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "figures")
OUT = os.path.join(SRC, "sub")
os.makedirs(OUT, exist_ok=True)

# 每个源图 -> [(子图名, (x0,y0,x1,y1)), ...]
CROPS = {
    "fig_intro": [
        ("intro_timeline", (432, 720, 2980, 1130)),
        ("intro_map",      (432, 1320, 2980, 2120)),
    ],
    "fig0_overview": [
        ("ov_metrics", (432, 300, 2980, 560)),
        ("ov_dist",    (432, 600, 2980, 1450)),
    ],
    "fig1_roles": [
        ("roles_dist",       (500, 900, 1700, 2110)),
        ("roles_conf_tiers", (1740, 900, 2980, 2110)),
        ("roles_confusion",  (500, 85, 1700, 905)),
        ("roles_pairs",      (1740, 85, 2980, 905)),
    ],
    "fig2_network": [
        ("net_roles", (480, 68, 2980, 862)),
        ("net_sig",   (480, 925, 2980, 1780)),
    ],
    "fig3_topics": [
        ("topic_evolution", (432, 60, 2980, 890)),
        ("topic_single",    (432, 928, 2980, 2120)),
    ],
    "fig4_narrative": [
        ("narr_sig",         (432, 60, 2980, 890)),
        ("narr_silhouette",  (488, 928, 1660, 1770)),
        ("narr_sensitivity", (1720, 928, 2980, 1770)),
    ],
    "fig5_synthesis": [
        ("synth_heat",     (488, 410, 1660, 1330)),
        ("synth_findings", (1720, 410, 2980, 1330)),
        ("synth_predict",  (432, 1380, 2980, 1850)),
    ],
}


def main():
    n = 0
    for src, crops in CROPS.items():
        path = os.path.join(SRC, src + ".png")
        im = Image.open(path).convert("RGB")
        for name, box in crops:
            sub = im.crop(box)
            outp = os.path.join(OUT, name + ".png")
            sub.save(outp)
            print(f"{name}: {sub.size}  <- {src}{box}")
            n += 1
    print(f"done, {n} sub-figures -> {OUT}")


if __name__ == "__main__":
    main()
