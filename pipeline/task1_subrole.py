"""任务一·细分行当：在大类(生/旦/净/丑)之上做分层细分分类，对齐官方
"推断行当归属（如生、旦、净、丑及其细分支）"的要求。

策略（hierarchical）：
- 生、旦 标注充足(生 2650、旦 688 个带细分标注实例) → 各训一个细分分类器，
  复用 task1 的数值特征 + 台词 TF-IDF，5 折 CV 报告 macro-F1，推断该大类下未标注角色的细分。
- 净、丑 标注稀疏且体系非标准(净 184、丑 65，且缺铜锤/架子等核心区分) →
  **不建模**，仅保留已标注细分用于展示，并在产物中显式标记 subrole_modeled=false + 覆盖率。

稀有细分按戏曲行当体系就近归并(见 MERGE)，避免极小类破坏训练。

输入：predictions.parquet(大类 final_role + sub_label) + instances.parquet(台词 text)
输出：
- predictions.parquet 增列 sub_pred / sub_confidence / sub_is_inferred(净丑置空)
- task1_subroles.json：各大类细分分布/CV指标/混淆矩阵/覆盖率/是否建模 + 两层旭日数据
"""
import json
import warnings

import jieba
import numpy as np
import pandas as pd
from scipy.sparse import hstack, csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.preprocessing import StandardScaler

from config import PROCESSED
from task1_classify import NUM_COLS, jtok

warnings.filterwarnings("ignore")
jieba.setLogLevel(20)

MODELED = ["生", "旦"]          # 标注充足，建模推断细分
NOT_MODELED = ["净", "丑"]      # 标注稀疏，仅展示已标注细分

# 稀有细分就近归并（戏曲行当体系常识）
MERGE = {
    "生": {"须生": "老生", "正生": "老生", "冠生": "小生", "巾生": "小生",
           "雉尾生": "小生"},
    "旦": {"青衣": "正旦", "花衫": "花旦", "刀马旦": "武旦", "闺门旦": "花旦"},
}
MIN_SUB = 20  # 归并后样本数低于此的细分仍剔除（不参与训练/推断）


def build_matrix(df, tfidf, scaler, fit):
    num = df[NUM_COLS].fillna(0).values.astype(float)
    num = scaler.fit_transform(num) if fit else scaler.transform(num)
    txt = tfidf.fit_transform(df["text"]) if fit else tfidf.transform(df["text"])
    return hstack([csr_matrix(num), txt]).tocsr()


def model_one(big, df_big):
    """对单个大类训练细分分类器并推断。返回 (更新后的 df_big, 信息字典)。"""
    merged = df_big["sub_label"].replace(MERGE.get(big, {}))
    df_big = df_big.assign(sub_merged=merged)
    train = df_big[df_big["sub_merged"].notna()].copy()
    keep = train["sub_merged"].value_counts()
    keep = keep[keep >= MIN_SUB].index.tolist()
    train = train[train["sub_merged"].isin(keep)].reset_index(drop=True)
    y = train["sub_merged"].values

    tfidf = TfidfVectorizer(tokenizer=jtok, token_pattern=None,
                            min_df=2, max_features=12000, sublinear_tf=True)
    scaler = StandardScaler()
    Xtr = build_matrix(train, tfidf, scaler, fit=True)
    clf = LogisticRegression(max_iter=2000, class_weight="balanced", C=4.0)

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    yp = cross_val_predict(clf, Xtr, y, cv=skf, n_jobs=-1)
    macro = f1_score(y, yp, average="macro")
    labs = sorted(set(y))
    cm = confusion_matrix(y, yp, labels=labs).tolist()
    per_class = {c: round(f1_score(y == c, yp == c), 3) for c in labs}
    print(f"  [{big}] 细分 5 折 macro-F1 = {macro:.3f}  类别 {labs}")

    # 全量训练 + 推断该大类全部成员
    clf.fit(Xtr, y)
    Xall = build_matrix(df_big, tfidf, scaler, fit=False)
    proba = clf.predict_proba(Xall)
    df_big["sub_pred"] = clf.classes_[proba.argmax(1)]
    df_big["sub_confidence"] = proba.max(1).round(3)
    # 有标注则用标注(归并后)作为最终；否则用推断
    has = df_big["sub_merged"].notna() & df_big["sub_merged"].isin(keep)
    df_big["sub_final"] = np.where(has, df_big["sub_merged"], df_big["sub_pred"])
    df_big["sub_is_inferred"] = ~has

    dist = df_big["sub_final"].value_counts().to_dict()
    info = {
        "modeled": True, "cv_macro_f1": round(float(macro), 3),
        "classes": labs, "per_class_f1": per_class,
        "confusion_matrix": cm, "confusion_labels": labs,
        "labeled_n": int(has.sum()), "inferred_n": int((~has).sum()),
        "coverage": round(float(has.sum()) / max(len(df_big), 1), 3),
        "dist": {k: int(v) for k, v in dist.items()},
        "merge_map": MERGE.get(big, {}),
    }
    return df_big, info


def main():
    pred = pd.read_parquet(PROCESSED / "predictions.parquet")
    inst = pd.read_parquet(PROCESSED / "instances.parquet")[
        ["play_id", "name", "text"]]
    df = pred.merge(inst, on=["play_id", "name"], how="left")
    df["text"] = df["text"].fillna("")

    df["sub_pred"] = pd.NA
    df["sub_confidence"] = np.nan
    df["sub_final"] = pd.NA
    df["sub_is_inferred"] = False

    out = {"modeled": MODELED, "not_modeled": NOT_MODELED,
           "min_sub": MIN_SUB, "by_class": {}}

    # ---- 建模：生/旦 ----
    print("细分行当建模：")
    for big in MODELED:
        mask = df["final_role"] == big
        sub_df, info = model_one(big, df[mask].copy())
        for col in ["sub_pred", "sub_confidence", "sub_final", "sub_is_inferred"]:
            df.loc[mask, col] = sub_df[col].values
        out["by_class"][big] = info

    # ---- 不建模：净/丑（仅展示已标注） ----
    for big in NOT_MODELED:
        mask = df["final_role"] == big
        sub_df = df[mask]
        labeled = sub_df["sub_label"].dropna()
        # 已标注细分直接作为 sub_final，便于前端统一展示
        df.loc[mask & df["sub_label"].notna(), "sub_final"] = \
            df.loc[mask & df["sub_label"].notna(), "sub_label"]
        out["by_class"][big] = {
            "modeled": False,
            "labeled_n": int(labeled.notna().sum()),
            "total_n": int(mask.sum()),
            "coverage": round(float(labeled.notna().sum()) / max(int(mask.sum()), 1), 3),
            "dist": {k: int(v) for k, v in labeled.value_counts().items()},
            "note": "该大类细分标注稀疏且体系非标准（缺铜锤/架子等核心区分），仅展示已标注细分，不作推断。",
        }

    # ---- 两层旭日（大类 -> 细分）数据 ----
    sunburst = []
    for big in ["生", "旦", "净", "丑"]:
        ci = out["by_class"].get(big, {})
        children = [{"name": k, "value": v}
                    for k, v in sorted(ci.get("dist", {}).items(),
                                       key=lambda x: -x[1])]
        sunburst.append({"name": big, "modeled": ci.get("modeled", False),
                         "children": children})
    out["sunburst"] = sunburst

    # ---- 落盘 ----
    keep_cols = list(pred.columns) + ["sub_pred", "sub_confidence",
                                      "sub_final", "sub_is_inferred"]
    df[keep_cols].to_parquet(PROCESSED / "predictions.parquet", index=False)
    (PROCESSED / "task1_subroles.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n细分行当分布（最终，含推断）：")
    for big in ["生", "旦", "净", "丑"]:
        ci = out["by_class"][big]
        tag = f"CV-F1 {ci['cv_macro_f1']}" if ci["modeled"] else "未建模"
        print(f"  {big}({tag}): {ci['dist']}")
    print(f"\n写出 {PROCESSED/'task1_subroles.json'} + 扩展 predictions.parquet")


if __name__ == "__main__":
    main()
