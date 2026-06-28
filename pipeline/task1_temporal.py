"""B4 时期演化：按集合/出处映射历史时期，统计行当结构与"特征-行当对应"的演化。

时期为代理变量（依据剧本来源集合的编纂/演出年代 + 出处文本中的显式年份），
用于回答"不同时期角色-行当对应关系的变化规律"。
"""
import json
import re
from collections import defaultdict

import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency

from config import PROCESSED

# 集合 -> 历史时期（代理）
PERIOD_OF_COLLECTION = {
    # 清末·民国（约 1900–1949）
    "《戏考》": "清末民国", "《戏考大全》": "清末民国", "《国剧大成》": "清末民国",
    "《剧学月刊》": "清末民国", "《戏典》": "清末民国", "《大众戏曲丛书》": "清末民国",
    "汪笑侬剧本选": "清末民国",
    # 建国初期（约 1949–1966，传统戏整理与名家演出本集中出版/录制）
    "《京剧汇编》": "建国初期", "《京剧丛刊》": "建国初期", "《传统剧目汇编》": "建国初期",
    "《京剧集成》": "建国初期", "《传统戏曲剧目资料汇编》": "建国初期",
    "《中国传统戏曲剧本选集》": "建国初期", "录音、唱片本": "建国初期",
    "周信芳剧本选": "建国初期", "马连良剧本选": "建国初期", "梅兰芳剧本选": "建国初期",
    "程砚秋剧本选": "建国初期", "荀慧生剧本选": "建国初期", "萧长华剧本选": "建国初期",
    "郝寿臣剧本选": "建国初期", "欧阳予倩剧本选": "建国初期", "唐韵笙剧本选": "建国初期",
    "孟小冬剧本选": "建国初期", "俞振飞剧本选": "建国初期", "侯玉山剧本选": "建国初期",
    "马祥麟剧本选": "建国初期", "李洪春剧本选": "建国初期",
    # 当代（约 1978 后改编/新编/当代名家）
    "《京剧流派剧目荟萃》": "当代", "院团改编本、演出本": "当代", "名家藏本、演出本": "当代",
    "翁偶虹剧本选": "当代", "范钧宏剧本选": "当代", "范钧宏、吕瑞明剧本选": "当代",
    "田汉剧本选": "当代", "老舍剧本选": "当代", "方荣翔剧本选": "当代",
    "侯少奎剧本选": "当代",
}
PERIOD_ORDER = ["清末民国", "建国初期", "当代"]
YEAR_RE = re.compile(r"(1[89]\d{2}|20\d{2})\s*年")


def period_of(collection, source):
    m = YEAR_RE.search(source or "")
    if m:
        y = int(m.group(1))
        if y < 1949:
            return "清末民国"
        if y < 1978:
            return "建国初期"
        return "当代"
    return PERIOD_OF_COLLECTION.get(collection, "建国初期")


def main():
    df = pd.read_parquet(PROCESSED / "predictions.parquet")
    plays = pd.read_json(PROCESSED / "corpus.jsonl", lines=True,
                         dtype={"play_id": str})[
        ["play_id", "source"]].drop_duplicates("play_id")
    df["play_id"] = df["play_id"].astype(str)
    df = df.merge(plays, on="play_id", how="left")
    df["period"] = [period_of(c, s) for c, s in zip(df["collection"], df["source"])]

    labeled = df[df["label"].notna()].copy()  # 演化统计用可靠标注

    out = {"period_order": PERIOD_ORDER, "by_period": {}}
    prof_cols = ["ratio_chang", "ratio_nian", "ratio_bai", "n_lines", "degree"]
    for per in PERIOD_ORDER:
        sub = labeled[labeled["period"] == per]
        dist = sub["label"].value_counts(normalize=True).round(4).to_dict()
        cnt = sub["label"].value_counts().to_dict()
        sublab = (sub["sub_label"].dropna().value_counts(normalize=True)
                  .head(12).round(4).to_dict())
        profile = {}
        for rt in ["生", "旦", "净", "丑"]:
            g = sub[sub["label"] == rt]
            if len(g):
                profile[rt] = {c: round(float(g[c].mean()), 3) for c in prof_cols}
        out["by_period"][per] = {
            "n_plays": int(sub["play_id"].nunique()),
            "n_roles": int(len(sub)),
            "role_dist": dist, "role_count": cnt,
            "sub_dist": sublab, "feature_profile": profile,
        }

    # 行当占比是否随时期显著变化：χ² 独立性检验 + Cramér's V 效应量
    roles_for_test = ["生", "旦", "净", "丑"]
    table = np.array([[int(labeled[(labeled["period"] == per) &
                                   (labeled["label"] == rt)].shape[0])
                       for rt in roles_for_test] for per in PERIOD_ORDER])
    chi2, p, dof, _ = chi2_contingency(table)
    n_total = int(table.sum())
    cramers_v = float(np.sqrt(chi2 / (n_total * (min(table.shape) - 1))))
    out["significance"] = {
        "test": "chi2_independence", "dims": "时期 × 行当(生/旦/净/丑)",
        "roles": roles_for_test, "periods": PERIOD_ORDER,
        "contingency": table.tolist(),
        "chi2": round(float(chi2), 2), "dof": int(dof),
        "pvalue": float(p), "significant": bool(p < 0.05),
        "cramers_v": round(cramers_v, 4), "n": n_total,
        "effect": ("强" if cramers_v >= 0.25 else "中" if cramers_v >= 0.15
                   else "弱" if cramers_v >= 0.10 else "极弱"),
    }
    print(f"\n时期×行当 χ²={chi2:.1f} (dof={dof}), p={p:.2e}, "
          f"Cramér's V={cramers_v:.3f}（{out['significance']['effect']}效应）")

    # 各集合 -> 时期（供前端标注）
    out["collection_period"] = {c: period_of(c, "")
                                for c in df["collection"].unique()}
    (PROCESSED / "task1_temporal.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print("各时期行当大类占比：")
    tab = pd.DataFrame({p: out["by_period"][p]["role_dist"]
                        for p in PERIOD_ORDER}).fillna(0).round(3)
    print(tab.to_string())
    print("\n各时期剧目/角色数：")
    for p in PERIOD_ORDER:
        b = out["by_period"][p]
        print(f"  {p:<8} 剧目{b['n_plays']:>4}  标注角色{b['n_roles']:>5}")
    print(f"\n写出 {PROCESSED/'task1_temporal.json'}")


if __name__ == "__main__":
    main()
