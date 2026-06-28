"""B7 任务四：批量计算叙事强度曲线，聚类典型叙事模式。

输出（data/processed/）：
- task4_metrics.parquet  每剧叙事指标（高潮位置/类型/渐强指数/叙事原型）
- task4_patterns.json    典型叙事弧线原型 + 高潮位置分布 + 跨类型节奏特征
"""
import json
from collections import Counter
from itertools import combinations

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

from config import CORPUS_JSONL, PROCESSED
from narrative_lib import compute, L
from task5_synthesis import bh_fdr

# 强度合成权重敏感性测试用的 (文, 武, 冲突) 组合；首项为采用值。
WEIGHT_SETS = [(0.4, 0.4, 0.2), (0.5, 0.3, 0.2), (0.3, 0.5, 0.2),
               (0.34, 0.33, 0.33), (0.6, 0.2, 0.2), (0.2, 0.6, 0.2)]


def _rownorm(M):
    """逐行 min-max 归一（与 narrative_lib 单曲线归一口径一致）。"""
    lo = M.min(1, keepdims=True)
    rng = M.max(1, keepdims=True) - lo
    return np.where(rng > 1e-9, (M - lo) / rng, 0.0)


def arc_label(curve):
    """按平均曲线形状给叙事原型起名（保证 5 簇产出可辨名）。"""
    c = np.asarray(curve)
    if float(c.max() - c.min()) < 0.25:
        return "平稳铺陈式"
    peak = int(np.argmax(c)) / (len(c) - 1)
    if peak >= 0.66:
        # 后段高潮再分：高潮压在最末=结尾陡升；落在后段但非末端=后段渐强
        return "结尾陡升式" if peak >= 0.9 else "后段高潮式(渐强)"
    if peak <= 0.34:
        return "前段高潮式(先声夺人)"
    return "中段高潮式(经典弧线)"


def main():
    drama = pd.read_parquet(PROCESSED / "task2_metrics.parquet")[["play_id", "drama_type"]]
    drama["play_id"] = drama["play_id"].astype(str)
    dt_map = dict(zip(drama["play_id"], drama["drama_type"]))

    rows, curves, ids = [], [], []
    comp_l, comp_m, comp_c = [], [], []     # 文/武/冲突 分量重采样曲线（供权重敏感性）
    with open(CORPUS_JSONL, encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            pid = str(rec["play_id"])
            nar = compute(rec)
            if nar is None:
                continue
            rows.append({
                "play_id": pid, "title": rec["title"],
                "drama_type": dt_map.get(pid, "其他"),
                "n_scenes": nar["n_scenes"], "peak_pos": nar["peak_pos"],
                "climax_type": nar["climax_type"], "rising_index": nar["rising_index"],
                "sing_ratio": nar["sing_ratio"], "action_total": nar["action_total"],
            })
            if nar["n_scenes"] >= 4:        # 仅足够长的剧参与弧线聚类
                curves.append(nar["resampled"]["overall"])
                comp_l.append(nar["resampled"]["lyric"])
                comp_m.append(nar["resampled"]["martial"])
                comp_c.append(nar["resampled"]["conflict"])
                ids.append(pid)

    df = pd.DataFrame(rows)
    C = np.array(curves)
    print(f"叙事曲线: {len(df)} 部；参与聚类(>=4场) {len(C)}")

    # ---- 弧线数 K 选择：silhouette（轮廓系数，越大越好）----
    sil = []
    for k in range(2, 9):
        lab = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(C)
        sil.append({"k": k, "silhouette": round(float(silhouette_score(C, lab)), 4)})
    print("弧线数 K 选择(silhouette): " +
          " ".join(f"K{s['k']}={s['silhouette']}" for s in sil))

    # ---- 典型叙事弧线聚类 ----
    KM = 5
    km = KMeans(n_clusters=KM, random_state=42, n_init=10).fit(C)
    arc_of = dict(zip(ids, km.labels_))
    df["arc"] = df["play_id"].map(arc_of).astype("Int64")

    # ---- 强度权重敏感性：不同 (文,武,冲突) 权重下弧线划分与采用值的一致性(ARI) ----
    # 全部权重组合走同一重组管线，与采用权重(WEIGHT_SETS[0])的划分对比，故采用项 ARI=1.0。
    Lc, Mc, Cc = np.array(comp_l), np.array(comp_m), np.array(comp_c)

    def _cluster(wf, wm, wc):
        combined = _rownorm(wf * Lc + wm * Mc + wc * Cc)
        return KMeans(n_clusters=KM, random_state=42, n_init=10).fit_predict(combined)

    base_lab = _cluster(*WEIGHT_SETS[0])
    weight_sensitivity = [{
        "weights": list(w),
        "ari": round(float(adjusted_rand_score(base_lab, _cluster(*w))), 3),
    } for w in WEIGHT_SETS]
    print("权重敏感性(ARI vs 采用 0.4/0.4/0.2): " +
          " ".join(f"{w['weights']}={w['ari']}" for w in weight_sensitivity[1:]))

    patterns = {"L": L, "arcs": [], "peak_hist": None, "by_drama_type": {},
                "k_selection": sil, "weight_sensitivity": weight_sensitivity,
                "adopted_weights": list(WEIGHT_SETS[0])}
    for c in range(KM):
        mask = km.labels_ == c
        member_curves = C[mask]
        mean_curve = member_curves.mean(0)
        p25 = np.percentile(member_curves, 25, axis=0)   # 簇内逐点分位带（离散度）
        p75 = np.percentile(member_curves, 75, axis=0)
        sub = df[df["play_id"].isin([ids[i] for i in np.where(mask)[0]])]
        reps = sub.assign(_p=sub["peak_pos"]).nlargest(6, "n_scenes")[
            ["play_id", "title", "drama_type", "n_scenes", "peak_pos", "climax_type"]
        ].to_dict("records")
        patterns["arcs"].append({
            "id": c, "label": arc_label(mean_curve), "size": int(mask.sum()),
            "mean_curve": [round(float(x), 3) for x in mean_curve],
            "p25": [round(float(x), 3) for x in p25],
            "p75": [round(float(x), 3) for x in p75],
            "peak_pos": round(float(np.argmax(mean_curve) / (L - 1)), 3),
            "drama_type_dist": dict(Counter(sub["drama_type"]).most_common()),
            "climax_type_dist": dict(Counter(sub["climax_type"]).most_common()),
            "representative": reps,
        })
    patterns["arcs"].sort(key=lambda a: -a["size"])

    # 高潮位置分布直方
    hist, edges = np.histogram(df["peak_pos"], bins=10, range=(0, 1))
    patterns["peak_hist"] = {"bins": [round(float(x), 2) for x in edges[:-1]],
                             "counts": [int(x) for x in hist]}
    # 跨剧目类型节奏特征
    for t, sub in df.groupby("drama_type"):
        patterns["by_drama_type"][t] = {
            "count": int(len(sub)),
            "mean_peak_pos": round(float(sub["peak_pos"].mean()), 3),
            "mean_rising": round(float(sub["rising_index"].mean()), 3),
            "mean_sing_ratio": round(float(sub["sing_ratio"].mean()), 4),
            "mean_action": round(float(sub["action_total"].mean()), 2),
            "climax_type_dist": dict(Counter(sub["climax_type"]).most_common()),
        }

    # ---- 类型间节奏差异显著性（Mann–Whitney U + BH-FDR）----
    # 把"历史戏做打最多""高潮多在后半"从均值升级为带 p 的类型间统计判断。
    NAMED = ["历史戏", "家庭戏", "公案戏", "神怪戏"]
    SIG_METRICS = [("action_total", "做打量"), ("peak_pos", "高潮位置"),
                   ("sing_ratio", "唱腔占比")]
    type_sig = {}
    for col, lab in SIG_METRICS:
        combos, pv = [], []
        for a, b in combinations(NAMED, 2):
            ga, gb = df[df["drama_type"] == a][col].dropna(), df[df["drama_type"] == b][col].dropna()
            p = float(mannwhitneyu(ga, gb, alternative="two-sided")[1]) if len(ga) > 1 and len(gb) > 1 else 1.0
            combos.append({"a": a, "b": b, "median_a": round(float(ga.median()), 4),
                           "median_b": round(float(gb.median()), 4), "pvalue": round(p, 4)})
            pv.append(p)
        for cmb, pa in zip(combos, bh_fdr(pv)):
            cmb["p_adj"] = round(float(pa), 4)
            cmb["significant"] = bool(pa < 0.05)
        type_sig[lab] = combos
    patterns["type_significance"] = {
        "types": NAMED, "metrics": [lab for _, lab in SIG_METRICS], "pairs": type_sig}

    df.to_parquet(PROCESSED / "task4_metrics.parquet", index=False)
    (PROCESSED / "task4_patterns.json").write_text(
        json.dumps(patterns, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n典型叙事弧线原型:")
    for a in patterns["arcs"]:
        print(f"  C{a['id']} [{a['size']:>4}部] {a['label']:<18} 峰位{a['peak_pos']:.2f} "
              f"主类型{list(a['drama_type_dist'])[:2]}")
    print("\n各剧目类型节奏特征:")
    for t, s in patterns["by_drama_type"].items():
        print(f"  {t:<5} 高潮位{s['mean_peak_pos']:.2f} 渐强{s['mean_rising']:+.2f} "
              f"唱占比{s['mean_sing_ratio']:.2f} 做打{s['mean_action']:.1f} "
              f"高潮类型{list(s['climax_type_dist'])}")
    print("\n类型间做打量两两检验（Mann–Whitney BH-FDR；*=显著）：")
    for c in type_sig["做打量"]:
        print(f"  {c['a']}({c['median_a']}) vs {c['b']}({c['median_b']}): "
              f"p_adj={c['p_adj']:.3f} {'*' if c['significant'] else ' '}")
    print("\n写出 task4_metrics.parquet / task4_patterns.json")


if __name__ == "__main__":
    main()
