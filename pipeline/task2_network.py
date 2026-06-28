"""B5 任务二：批量构建角色关系网络，按剧目类型统计网络结构特征。

输出（data/processed/）：
- task2_metrics.parquet  每部剧的网络指标 + 剧目类型 + 主角
- task2_typestats.json   按剧目类型聚合的结构特征 + 代表剧目
"""
import json
from collections import defaultdict
from itertools import combinations

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu, kruskal

from config import CORPUS_JSONL, PROCESSED
from network_lib import (build_network, compute_metrics, classify_drama,
                         null_model_z, structural_roles, DRAMA_TYPES)
from task1_temporal import period_of, PERIOD_ORDER
from task5_synthesis import bh_fdr


def load_role_map():
    pred = pd.read_parquet(PROCESSED / "predictions.parquet")
    pred["play_id"] = pred["play_id"].astype(str)
    return {(r.play_id, r.name): r.final_role for r in pred.itertuples()}


def main():
    role_map = load_role_map()
    rows = []
    # 结构角色累计：按行当聚合 度/介数中心性 + 桥接主座 + 各类型 role assortativity
    role_deg, role_btw = defaultdict(list), defaultdict(list)
    role_count, bridge_count = defaultdict(int), defaultdict(int)
    n_bridge_plays = 0
    assort_by_type = defaultdict(list)
    with open(CORPUS_JSONL, encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            rec["play_id"] = str(rec["play_id"])
            G = build_network(rec, role_map)
            if G.number_of_nodes() < 2:
                continue
            dtype = classify_drama(rec["title"], rec.get("plot", ""))
            mt = compute_metrics(G)
            mt.update(null_model_z(G))           # modularity_z / centralization_z
            mt.update({
                "play_id": rec["play_id"], "title": rec["title"],
                "collection": rec["collection"], "drama_type": dtype,
                "period": period_of(rec["collection"], rec.get("source", "")),
            })
            rows.append(mt)
            # —— 结构角色 / 阵营同质度累计 ——
            per, bridge, assort = structural_roles(G)
            for p in per:
                role_deg[p["role"]].append(p["deg"])
                role_btw[p["role"]].append(p["btw"])
                role_count[p["role"]] += 1
            if bridge is not None:
                bridge_count[bridge] += 1
                n_bridge_plays += 1
            if assort is not None:
                assort_by_type[dtype].append(assort)

    df = pd.DataFrame(rows)
    df.to_parquet(PROCESSED / "task2_metrics.parquet", index=False)
    print(f"网络指标: {len(df)} 部剧 -> task2_metrics.parquet")

    # ---- 按类型聚合 ----
    metric_cols = ["n_nodes", "n_edges", "density", "avg_degree", "max_degree",
                   "avg_clustering", "centralization", "modularity", "n_communities",
                   "centralization_z", "modularity_z"]
    typestats = {"types": DRAMA_TYPES, "by_type": {}}
    for t in DRAMA_TYPES:
        sub = df[df["drama_type"] == t]
        if not len(sub):
            continue
        typestats["by_type"][t] = {
            "count": int(len(sub)),
            "mean": {c: round(float(sub[c].mean()), 4) for c in metric_cols},
            "median": {c: round(float(sub[c].median()), 4) for c in metric_cols},
            # 代表剧目：节点数最多的前若干
            "representative": sub.nlargest(8, "n_nodes")[
                ["play_id", "title", "n_nodes", "n_edges", "density",
                 "centralization", "main_char"]].to_dict("records"),
        }
    typestats["metric_cols"] = metric_cols

    # ---- 结构角色：哪个行当占据中心/桥接位（degree×betweenness×行当）----
    ROLE_ORDER = ["生", "旦", "净", "丑", "杂"]
    role_structure = {}
    for r in sorted(role_count, key=lambda x: ROLE_ORDER.index(x)
                    if x in ROLE_ORDER else 99):
        if r not in ROLE_ORDER:           # 未知/末等非主行当不进结构面板
            continue
        role_structure[r] = {
            "mean_degree_centrality": round(float(np.mean(role_deg[r])), 4),
            "mean_betweenness": round(float(np.mean(role_btw[r])), 4),
            "n_nodes_total": int(role_count[r]),
            "bridge_share": round(bridge_count[r] / n_bridge_plays, 4)
            if n_bridge_plays else 0.0,
        }
    typestats["role_structure"] = role_structure
    typestats["n_bridge_plays"] = int(n_bridge_plays)

    # ---- 社群是否=行当阵营：各剧目类型平均 role assortativity（>0 同质）----
    assortativity_by_type = {
        t: round(float(np.mean(assort_by_type[t])), 4)
        for t in DRAMA_TYPES if assort_by_type[t]}
    all_assort = [a for v in assort_by_type.values() for a in v]
    if all_assort:
        assortativity_by_type["全库"] = round(float(np.mean(all_assort)), 4)
    typestats["assortativity_by_type"] = assortativity_by_type

    # ---- 类型间两两差异显著性（Mann–Whitney U + BH-FDR）----
    # 把"公案戏规模最大""历史戏模块度最高"从点估计均值升级为带 p 的统计判断。
    NAMED = ["历史戏", "家庭戏", "公案戏", "神怪戏"]
    SIG_METRICS = [("n_nodes", "网络规模"), ("centralization", "中心势"),
                   ("modularity", "模块度"), ("density", "密度")]
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
    typestats["type_significance"] = {
        "types": NAMED, "metrics": [lab for _, lab in SIG_METRICS], "pairs": type_sig}

    # ---- 网络结构的时期演化（清末民国→建国初期→当代）----
    # 回答"京剧人物网络是否随时代变密/变集中"，各指标做 Kruskal–Wallis 组间检验 + BH-FDR。
    EVO_METRICS = [("n_nodes", "网络规模"), ("density", "网络密度"),
                   ("centralization", "中心势"), ("modularity", "模块度")]
    evo_by_period = {}
    for per in PERIOD_ORDER:
        sub = df[df["period"] == per]
        evo_by_period[per] = {"count": int(len(sub)),
                              **{lab: round(float(sub[col].mean()), 4) for col, lab in EVO_METRICS}}
    evo_p = []
    for col, lab in EVO_METRICS:
        groups = [df[df["period"] == per][col].dropna().values for per in PERIOD_ORDER]
        groups = [g for g in groups if len(g) > 0]
        evo_p.append(float(kruskal(*groups)[1]) if len(groups) >= 2 else 1.0)
    evo_adj = bh_fdr(evo_p)
    typestats["period_evolution"] = {
        "period_order": PERIOD_ORDER, "metrics": [lab for _, lab in EVO_METRICS],
        "by_period": evo_by_period,
        "significance": {lab: {"kw_p": round(p, 4), "kw_p_adj": round(float(pa), 4),
                               "significant": bool(pa < 0.05)}
                         for (_, lab), p, pa in zip(EVO_METRICS, evo_p, evo_adj)}}

    (PROCESSED / "task2_typestats.json").write_text(
        json.dumps(typestats, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---- 控制台报告 ----
    print("\n各剧目类型网络结构特征（均值）：")
    show = ["count", "n_nodes", "n_edges", "density", "avg_clustering",
            "centralization", "modularity"]
    tab = {}
    for t, s in typestats["by_type"].items():
        tab[t] = {"count": s["count"], **{k: s["mean"][k]
                  for k in show if k != "count"}}
    print(pd.DataFrame(tab).T.to_string())

    print("\n结构角色（按行当聚合，bridge_share=占桥接主座的剧目比例）：")
    print(pd.DataFrame(role_structure).T.to_string())
    print("\n各剧目类型 role assortativity（>0 同行当相连/社群偏阵营同质）：")
    print({k: v for k, v in assortativity_by_type.items()})
    print("\n类型间模块度两两检验（Mann–Whitney BH-FDR；*=显著）：")
    for c in type_sig["模块度"]:
        print(f"  {c['a']}({c['median_a']}) vs {c['b']}({c['median_b']}): "
              f"p_adj={c['p_adj']:.3f} {'*' if c['significant'] else ' '}")
    print("\n网络结构时期演化（均值；*=Kruskal BH-FDR 显著）：")
    pe = typestats["period_evolution"]
    for lab in pe["metrics"]:
        vals = [pe["by_period"][per][lab] for per in PERIOD_ORDER]
        star = "*" if pe["significance"][lab]["significant"] else " "
        print(f" {star}{lab:<8} " + " → ".join(f"{v}" for v in vals))
    print(f"\n写出 task2_typestats.json")


if __name__ == "__main__":
    main()
