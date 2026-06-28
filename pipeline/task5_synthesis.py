"""B8 任务五：综合关联分析。打通任务二/三/四 + 行当，分析三维协同。

产出（data/processed/）：
- task5_plays.parquet     每剧 关系×主题×叙事×行当 联合特征 + 综合原型聚类
- task5_corr.json         跨维度相关矩阵（带维度标签）+ 关联发现
- task5_sankey.json       剧目类型→核心主题→叙事模式 协同链路
- task5_archetypes.json   综合原型（稳定结构特征）签名 + 代表剧目
"""
import json
from collections import Counter

import numpy as np
import pandas as pd
from scipy.stats import pearsonr
from sklearn.cluster import KMeans
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler

from config import PROCESSED


def partial_corr(df, x, y, covars):
    """偏相关：控制 covars 后 x 与 y 的相关。对 x、y 各自用 covars(含截距)做最小二乘
    回归，取残差再算 Pearson。covars 为空时退化为普通相关。返回 (r, p)。"""
    covars = [c for c in covars if c != x and c != y]
    sub = df[[x, y] + covars].dropna()
    if len(sub) < len(covars) + 4:
        return 0.0, 1.0
    if not covars:
        if sub[x].std() < 1e-9 or sub[y].std() < 1e-9:
            return 0.0, 1.0
        r, p = pearsonr(sub[x], sub[y])
        return float(r), float(p)
    C = np.column_stack([np.ones(len(sub))] + [sub[c].to_numpy(float) for c in covars])

    def _resid(v):
        beta, *_ = np.linalg.lstsq(C, v, rcond=None)
        return v - C @ beta

    rx, ry = _resid(sub[x].to_numpy(float)), _resid(sub[y].to_numpy(float))
    if rx.std() < 1e-9 or ry.std() < 1e-9:
        return 0.0, 1.0
    r, p = pearsonr(rx, ry)
    return float(r), float(p)


def bh_fdr(pvals):
    """Benjamini-Hochberg FDR 校正，返回与输入同序的校正后 p 值。"""
    p = np.asarray(pvals, dtype=float)
    n = len(p)
    order = np.argsort(p)
    ranked = p[order] * n / (np.arange(n) + 1)
    # 保证单调不减（从大到小取累计最小）
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(n)
    out[order] = np.clip(ranked, 0, 1)
    return out

# 维度 -> (列名, 中文标签)
DIM_FEATURES = {
    "关系网络": [("n_nodes", "网络规模"), ("density", "网络密度"),
              ("centralization", "中心势"), ("modularity", "模块度")],
    "叙事结构": [("peak_pos", "高潮位置"), ("rising_index", "渐强指数"),
              ("action_total", "做打量"), ("sing_ratio", "唱腔占比")],
    "角色行当": [("生", "生占比"), ("旦", "旦占比"),
              ("净", "净占比"), ("丑", "丑占比")],
}


def load_merged():
    net = pd.read_parquet(PROCESSED / "task2_metrics.parquet")
    top = pd.read_parquet(PROCESSED / "task3_play_topics.parquet")
    nar = pd.read_parquet(PROCESSED / "task4_metrics.parquet")
    pred = pd.read_parquet(PROCESSED / "predictions.parquet")
    for d in (net, top, nar, pred):
        d["play_id"] = d["play_id"].astype(str)

    rc = pred.groupby(["play_id", "final_role"]).size().unstack(fill_value=0)
    rc = rc.div(rc.sum(1), axis=0)
    for r in ["生", "旦", "净", "丑", "杂"]:
        if r not in rc:
            rc[r] = 0.0
    rc = rc.reset_index()

    tcols = [c for c in top.columns if c.startswith("t") and c[1:].isdigit()]
    m = (net[["play_id", "title", "n_nodes", "density", "centralization",
              "modularity", "drama_type"]]
         .merge(nar[["play_id", "peak_pos", "rising_index", "sing_ratio",
                     "action_total", "n_scenes", "climax_type"]], on="play_id")
         .merge(top[["play_id", "dominant"] + tcols], on="play_id")
         .merge(rc[["play_id", "生", "旦", "净", "丑", "杂"]], on="play_id"))
    return m, tcols


def main():
    m, tcols = load_merged()
    print(f"三维联合特征: {len(m)} 部剧")

    topics_meta = json.loads((PROCESSED / "task3_topics.json").read_text(encoding="utf-8"))
    t3pat = json.loads((PROCESSED / "task3_patterns.json").read_text(encoding="utf-8"))
    t4pat = json.loads((PROCESSED / "task4_patterns.json").read_text(encoding="utf-8"))
    topic_labels = t3pat["topic_labels"]
    arc_label = {a["id"]: a["label"] for a in t4pat["arcs"]}

    # ---- 跨维度相关矩阵 ----
    # 主题维度：取全局占比最高的 4 个主题
    top4 = sorted(topics_meta["topics"], key=lambda t: -t["share"])[:4]
    dim_feats = dict(DIM_FEATURES)
    dim_feats["主题表达"] = [(f"t{t['id']}", f"T{t['id']} {t['label']}") for t in top4]

    cols, labels, dims = [], [], []
    for dim, feats in dim_feats.items():
        for col, lab in feats:
            cols.append(col); labels.append(lab); dims.append(dim)
    corr = m[cols].corr().values
    # 逐格 p 值（仅上三角检验、BH-FDR 校正后镜像填充），供热力图标注显著性。
    ncol = len(cols)
    pmat = np.ones((ncol, ncol))
    tri_p, tri_ij = [], []
    for i in range(ncol):
        for j in range(i + 1, ncol):
            pair = m[[cols[i], cols[j]]].dropna()
            if len(pair) >= 3 and pair[cols[i]].std() > 0 and pair[cols[j]].std() > 0:
                _, p = pearsonr(pair[cols[i]], pair[cols[j]])
            else:
                p = 1.0
            tri_p.append(p); tri_ij.append((i, j))
    for (i, j), pa in zip(tri_ij, bh_fdr(tri_p)):
        pmat[i, j] = pmat[j, i] = pa
    sig = (pmat < 0.05)
    np.fill_diagonal(sig, True)
    corr_json = {
        "labels": labels, "dims": dims,
        "matrix": [[round(float(corr[i, j]), 3) for j in range(ncol)]
                   for i in range(ncol)],
        "sig_matrix": [[bool(sig[i, j]) for j in range(ncol)] for i in range(ncol)],
    }
    # 关联发现：不同维度间相关，带显著性检验 + BH-FDR 多重比较校正
    raw = []   # (i, j)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            if dims[i] != dims[j]:
                raw.append((i, j))
    # 控制"剧目体量"混淆：大戏既人多、又做打多、又主题杂，原始相关可能由体量共同驱动。
    CONTROLS = ["n_nodes", "n_scenes"]
    CTRL_LABEL = {"n_nodes": "网络规模", "n_scenes": "场次数"}
    pvals, ppvals, recs = [], [], []
    for i, j in raw:
        pair = m[[cols[i], cols[j]]].dropna()
        if len(pair) >= 3 and pair[cols[i]].std() > 0 and pair[cols[j]].std() > 0:
            r, p = pearsonr(pair[cols[i]], pair[cols[j]])
        else:
            r, p = 0.0, 1.0
        covars = [c for c in CONTROLS if c not in (cols[i], cols[j])]
        rp, pp = partial_corr(m, cols[i], cols[j], covars)
        pvals.append(p)
        ppvals.append(pp)
        recs.append({"a": labels[i], "a_dim": dims[i], "b": labels[j],
                     "b_dim": dims[j], "r": round(float(r), 3),
                     "r_partial": round(float(rp), 3),
                     "p_partial": round(float(pp), 4),
                     "controls": [CTRL_LABEL[c] for c in covars],
                     "pvalue": float(p), "n": int(len(pair))})
    p_adj = bh_fdr(pvals)
    pp_adj = bh_fdr(ppvals)
    for rec, pa, ppa in zip(recs, p_adj, pp_adj):
        rec["p_adj"] = round(float(pa), 4)
        rec["significant"] = bool(pa < 0.05)
        rec["r2"] = round(float(rec["r"] ** 2), 3)
        rec["pvalue"] = round(rec["pvalue"], 4)
        rec["p_adj_partial"] = round(float(ppa), 4)
        rec["robust"] = bool(ppa < 0.05)          # 控体量后仍显著
        rec["attenuation"] = round(abs(rec["r"]) - abs(rec["r_partial"]), 3)
    recs.sort(key=lambda d: -abs(d["r"]))
    n_sig = sum(r["significant"] for r in recs)
    corr_json["findings"] = recs[:10]
    corr_json["n_tests"] = len(recs)
    corr_json["n_significant"] = int(n_sig)
    corr_json["n_robust"] = int(sum(r["robust"] for r in recs))
    corr_json["controls"] = [CTRL_LABEL[c] for c in CONTROLS]
    # task5_corr.json 延后到补充"轻量预测验证"(需 arc)后再写，见下。

    # ---- 协同链路 Sankey: 类型 -> 主题 -> 叙事模式 ----
    nar2 = pd.read_parquet(PROCESSED / "task4_metrics.parquet")
    nar2["play_id"] = nar2["play_id"].astype(str)
    m = m.merge(nar2[["play_id", "arc"]], on="play_id", how="left")
    m["theme"] = m["dominant"].map(lambda k: f"主题·{topic_labels[int(k)]}")
    m["arc_name"] = m["arc"].map(lambda a: f"叙事·{arc_label.get(int(a), '其他')}"
                                 if pd.notna(a) else None)

    # ---- 轻量预测验证：用 网络+行当+主题 特征 CV 预测"叙事弧型" ----
    # 叙事弧型由叙事强度曲线导出，用"非叙事"维度预测它——检验跨维度"可由 A 预测 B"（强于相关）。
    pred_df = m.dropna(subset=["arc"]).copy()
    feat_pred = ["n_nodes", "density", "centralization", "modularity",
                 "生", "旦", "净", "丑"] + tcols
    Xp = StandardScaler().fit_transform(pred_df[feat_pred].fillna(0))
    yp = pred_df["arc"].astype(int).values
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    yhat = cross_val_predict(
        LogisticRegression(max_iter=2000, class_weight="balanced", C=2.0, n_jobs=-1),
        Xp, yp, cv=skf, n_jobs=-1)
    ybase = cross_val_predict(DummyClassifier(strategy="most_frequent"), Xp, yp, cv=skf)
    cls = sorted(set(int(c) for c in yp))
    per_f1 = f1_score(yp, yhat, average=None, labels=cls)
    corr_json["prediction"] = {
        "target": "叙事弧型",
        "feature_groups": ["网络结构(4)", "行当占比(4)", f"主题分布({len(tcols)})"],
        "n": int(len(yp)),
        "macro_f1": round(float(f1_score(yp, yhat, average="macro")), 3),
        "baseline_macro_f1": round(float(f1_score(yp, ybase, average="macro")), 3),
        "by_class": [{"arc": arc_label.get(int(c), str(c)), "f1": round(float(per_f1[i]), 3)}
                     for i, c in enumerate(cls)],
    }
    (PROCESSED / "task5_corr.json").write_text(
        json.dumps(corr_json, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n轻量预测验证：网络+行当+主题 → 叙事弧型 "
          f"macro-F1={corr_json['prediction']['macro_f1']} "
          f"(多数类基线 {corr_json['prediction']['baseline_macro_f1']})")

    sankey = _sankey(m)
    (PROCESSED / "task5_sankey.json").write_text(
        json.dumps(sankey, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---- 综合原型（联合聚类）----
    feat_cols = ["n_nodes", "density", "centralization", "modularity",
                 "peak_pos", "rising_index", "action_total", "sing_ratio",
                 "生", "旦", "净", "丑"] + tcols
    X = StandardScaler().fit_transform(m[feat_cols].fillna(0))
    K = 6
    km = KMeans(n_clusters=K, random_state=42, n_init=10).fit(X)
    m["archetype"] = km.labels_

    sig_cols = [("n_nodes", "网络规模"), ("centralization", "中心势"),
                ("modularity", "模块度"), ("action_total", "做打量"),
                ("peak_pos", "高潮位置"), ("rising_index", "渐强"),
                ("sing_ratio", "唱腔"), ("净", "净占比"), ("旦", "旦占比"),
                ("生", "生占比")]
    arche = []
    for c in range(K):
        sub = m[m["archetype"] == c]
        center = X[km.labels_ == c].mean(0)
        dists = ((X[km.labels_ == c] - center) ** 2).sum(1)
        reps = sub.iloc[np.argsort(dists)[:6]][
            ["play_id", "title", "drama_type"]].to_dict("records")
        arche.append({
            "id": c, "size": int(len(sub)),
            "drama_type": dict(Counter(sub["drama_type"]).most_common(3)),
            "top_theme": topic_labels[int(sub["dominant"].mode().iloc[0])],
            "top_arc": arc_label.get(int(sub["arc"].dropna().mode().iloc[0]), "其他")
            if sub["arc"].notna().any() else "其他",
            "signature": {lab: round(float(sub[col].mean()), 3) for col, lab in sig_cols},
            "representative": reps,
        })
    arche.sort(key=lambda a: -a["size"])
    (PROCESSED / "task5_archetypes.json").write_text(
        json.dumps({"archetypes": arche,
                    "signature_cols": [lab for _, lab in sig_cols]},
                   ensure_ascii=False, indent=2), encoding="utf-8")

    m[["play_id", "title", "drama_type", "archetype", "dominant", "arc"]
      + feat_cols].to_parquet(PROCESSED / "task5_plays.parquet", index=False)

    # ---- 报告 ----
    print(f"\n跨维度关联发现（|r| top6；{corr_json['n_significant']}/"
          f"{corr_json['n_tests']} 显著；控体量后 {corr_json['n_robust']} 仍稳健）:")
    for f in corr_json["findings"][:6]:
        star = "*" if f["significant"] else " "
        rob = "稳健" if f["robust"] else "体量驱动"
        print(f" {star}{f['a']}({f['a_dim']}) ~ {f['b']}({f['b_dim']}): "
              f"r={f['r']:+.2f} | 控体量 r={f['r_partial']:+.2f} ({rob}) "
              f"p_adj={f['p_adj']:.3f}")
    print("\n综合原型（稳定结构特征）:")
    for a in arche:
        print(f"  原型{a['id']} [{a['size']:>4}部] 主类型{list(a['drama_type'])[:2]} "
              f"主题:{a['top_theme'][:8]} 叙事:{a['top_arc']}")
    print("\n写出 task5_corr/sankey/archetypes.json + task5_plays.parquet")


def _sankey(m):
    nodes, links = set(), Counter()
    for _, r in m.iterrows():
        if pd.isna(r["arc_name"]):
            continue
        dt, th, ar = r["drama_type"], r["theme"], r["arc_name"]
        nodes |= {dt, th, ar}
        links[(dt, th)] += 1
        links[(th, ar)] += 1
    # 过滤弱链路
    links = {k: v for k, v in links.items() if v >= 8}
    used = set()
    for a, b in links:
        used |= {a, b}
    return {
        "nodes": [{"name": n} for n in sorted(used)],
        "links": [{"source": a, "target": b, "value": v}
                  for (a, b), v in sorted(links.items(), key=lambda x: -x[1])],
    }


if __name__ == "__main__":
    main()
