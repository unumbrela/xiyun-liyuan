"""B3 行当分类：训练（已标注主要角色）-> 推断未标注角色 -> 归纳特征对应模式。

输出（data/processed/）：
- predictions.parquet  全部实例 + 预测行当 + 置信度
- task1_metrics.json    交叉验证 macro-F1 / 分类报告 / 混淆矩阵
- task1_patterns.json   各行当的可解释特征画像 + 典型台词词
"""
import json
import warnings

import jieba
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import GroupKFold, StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, label_binarize

from config import PROCESSED
from task1_temporal import PERIOD_ORDER, period_of

warnings.filterwarnings("ignore")
jieba.setLogLevel(20)

NUM_COLS = ["n_lines", "n_scenes", "ratio_chang", "ratio_nian", "ratio_bai",
            "ratio_other", "sing_lines", "avg_text_len", "total_text_len",
            "degree", "kw_female", "kw_official", "kw_martial", "kw_servant",
            "kw_group", "kw_old", "is_group", "name_len"]
CLASSES = ["生", "旦", "净", "丑", "末", "杂"]
OFFICIAL_CLASSES = ["生", "旦", "净", "丑"]
AUXILIARY_CLASSES = ["杂"]
CONF_BANDS = [
    ("高", 0.75, 1.01),
    ("中", 0.55, 0.75),
    ("低", 0.0, 0.55),
]
STOPWORDS = {
    "", " ", "\n", "\t", "的", "了", "着", "也", "都", "又", "还", "便", "就",
    "却", "才", "只", "且", "与", "和", "及", "把", "被", "叫", "让", "在",
    "于", "是", "有", "无", "不", "未", "非", "莫", "休", "来", "去", "上",
    "下", "中", "里", "外", "此", "那", "这", "甚", "什么", "怎么", "哪里",
    "我", "你", "他", "她", "它", "咱", "俺们", "我们", "你们", "他们", "吓",
    "啊", "呀", "哎", "哦", "嗳", "罢", "吧", "么", "呢", "吗", "也罢",
    "一个", "一同", "一齐", "今日", "如今", "这里", "那里", "起来", "下去",
    "不可", "不能", "不是", "如此", "正是", "知道", "听说", "只见", "众位",
}
KEEP_ONE_CHAR = {"妾", "俺", "孤", "臣", "儿", "母", "娘", "爷", "官", "贼"}


def jtok(s: str):
    return [w for w in jieba.lcut(str(s)) if w.strip()]


def make_pipeline(max_features=20000, min_df=3, clf=None):
    pre = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUM_COLS),
            ("text", TfidfVectorizer(tokenizer=jtok, token_pattern=None,
                                     min_df=min_df, max_features=max_features,
                                     sublinear_tf=True), "text"),
        ],
        sparse_threshold=0.3,
    )
    if clf is None:
        clf = LogisticRegression(max_iter=2000, class_weight="balanced", C=4.0,
                                 n_jobs=-1)
    return Pipeline([("pre", pre), ("clf", clf)])


def baseline_macro_f1(clf, train, y, skf):
    """同特征下用 clf 跑 5 折交叉验证，返回 macro-F1（为 LR 提供对照基线）。"""
    pipe = make_pipeline(clf=clf)
    yp = cv_predict(pipe, train, y, skf)
    return float(f1_score(y, yp, average="macro"))


def calibration_report(y, proba, classes):
    """多类 Brier 分数 + 置信度可靠性曲线（按 max-proba 分箱：平均置信 vs 实际准确率）。"""
    Y = label_binarize(y, classes=list(classes))
    brier = float(np.mean(np.sum((proba - Y) ** 2, axis=1)))
    yp = np.asarray(classes)[proba.argmax(1)]
    conf = proba.max(1)
    correct = (yp == y).astype(float)
    curve = []
    for lo in np.arange(0.0, 1.0, 0.1):
        hi = lo + 0.1
        m = (conf >= lo) & (conf < hi if hi < 1.0 else conf <= hi)
        if m.sum() == 0:
            continue
        curve.append({
            "bin": round(float(lo + 0.05), 2),
            "mean_confidence": round(float(conf[m].mean()), 3),
            "accuracy": round(float(correct[m].mean()), 3),
            "count": int(m.sum()),
        })
    return {"brier": round(brier, 4), "curve": curve}


# 末行历史上并入生行；任务给定行当体系为 生/旦/净/丑，杂(龙套/群演)作实用第5类
LABEL_MERGE = {"末": "生"}


def main():
    df = pd.read_parquet(PROCESSED / "instances.parquet")
    q = json.loads((PROCESSED / "quality_report.json").read_text(encoding="utf-8"))
    df["label"] = df["label"].replace(LABEL_MERGE)
    train = df[df["label"].notna()].reset_index(drop=True)
    y = train["label"].values

    # ---- 交叉验证（用 proba 同时支撑标签指标与置信度校准）----
    pipe = make_pipeline()
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    classes_sorted = np.unique(y)
    proba_cv = cross_val_predict(pipe, train, y, cv=skf, method="predict_proba",
                                 n_jobs=-1)
    yp = classes_sorted[proba_cv.argmax(1)]
    instance_cv = eval_cv(y, yp)
    calibration = calibration_report(y, proba_cv, classes_sorted)
    print(f"置信度校准 Brier={calibration['brier']}")

    gkf = GroupKFold(n_splits=5)
    groups = train["play_id"].astype(str).values
    ypg = cv_predict(pipe, train, y, gkf, groups=groups)
    group_cv = eval_cv(y, ypg)

    # ---- 基线对照：多数类 / 随机森林（非线性），佐证逻辑回归选型 ----
    print("基线对照中…")
    baselines = [
        {"name": "多数类", "macro_f1": baseline_macro_f1(
            DummyClassifier(strategy="most_frequent"), train, y, skf)},
        {"name": "随机森林", "macro_f1": baseline_macro_f1(
            RandomForestClassifier(n_estimators=160, class_weight="balanced",
                                   n_jobs=-1, random_state=42), train, y, skf)},
        {"name": "逻辑回归(采用)", "macro_f1": instance_cv["macro_f1"]},
    ]
    for b in baselines:
        print(f"  {b['name']}: macro-F1 = {b['macro_f1']:.3f}")

    macro = instance_cv["macro_f1"]
    rep = instance_cv["report"]
    labs = instance_cv["labels"]
    cm = instance_cv["confusion_matrix"]
    print(f"实例级 5折交叉验证 macro-F1 = {macro:.3f}")
    print(classification_report(y, yp, zero_division=0))
    print(f"按剧目分组 GroupKFold macro-F1 = {group_cv['macro_f1']:.3f}")

    metrics = {
        # 旧字段保留给现有前后端；其值为实例级 CV。
        "macro_f1": macro, "report": rep,
        "labels": labs, "confusion_matrix": cm,
        "n_train": len(train),
        # 新增审计字段。
        "n_role_annotations": int(q.get("roles", train["label"].notna().sum())),
        "n_train_instances": int(len(train)),
        "n_inferred_instances": int(df["label"].isna().sum()),
        "official_classes": OFFICIAL_CLASSES,
        "auxiliary_classes": AUXILIARY_CLASSES,
        "instance_cv": instance_cv,
        "group_play_cv": group_cv,
        "baselines": baselines,
        "calibration": calibration,
    }

    # ---- 全量训练 + 预测未标注 ----
    pipe.fit(train, y)
    proba = pipe.predict_proba(df)
    classes = pipe.named_steps["clf"].classes_
    pred = classes[proba.argmax(1)]
    conf = proba.max(1)
    df["pred"] = pred
    df["confidence"] = conf
    df["final_role"] = np.where(df["label"].notna(), df["label"], df["pred"])
    df["is_inferred"] = df["label"].isna()
    df["confidence_band"] = [confidence_band(v) for v in conf]
    df["needs_review"] = df["is_inferred"] & (df["confidence_band"] == "低")
    df["official_role"] = df["final_role"].where(df["final_role"].isin(OFFICIAL_CLASSES), pd.NA)
    df["alias_match_reason"] = np.where(
        df["is_inferred"],
        "未在主要角色标注中命中，使用分类器推断",
        "主要角色精确匹配",
    )
    metrics["confidence_bands"] = confidence_summary(df)

    df[["play_id", "collection", "name", "label", "sub_label", "pred",
        "confidence", "confidence_band", "needs_review", "official_role",
        "alias_match_reason", "final_role", "is_inferred", *NUM_COLS]].to_parquet(
        PROCESSED / "predictions.parquet", index=False)
    print(f"\n推断未标注角色 {int(df['is_inferred'].sum())} 个，"
          f"平均置信度 {conf[df['is_inferred']].mean():.2f}")

    # ---- 可解释模式：各行当特征画像 + 典型词 ----
    patterns = _patterns(train, df, pipe)
    (PROCESSED / "task1_metrics.json").write_text(json.dumps(
        metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    (PROCESSED / "task1_patterns.json").write_text(
        json.dumps(patterns, ensure_ascii=False, indent=2), encoding="utf-8")
    print("特征对应模式已导出 task1_patterns.json")


def cv_predict(estimator, X, y, cv, groups=None):
    return cross_val_predict(estimator, X, y, cv=cv, groups=groups,
                             n_jobs=-1, method="predict")


def eval_cv(y, yp):
    labs = sorted(set(y))
    return {
        "macro_f1": float(f1_score(y, yp, average="macro")),
        "official_macro_f1": float(f1_score(y, yp, labels=OFFICIAL_CLASSES,
                                            average="macro", zero_division=0)),
        "report": classification_report(y, yp, output_dict=True, zero_division=0),
        "labels": labs,
        "confusion_matrix": confusion_matrix(y, yp, labels=labs).tolist(),
    }


def confidence_band(v):
    for label, lo, hi in CONF_BANDS:
        if lo <= float(v) < hi:
            return label
    return "低"


def confidence_summary(df):
    out = {"thresholds": {"高": ">=0.75", "中": "0.55-0.75", "低": "<0.55"}}
    for scope, sub in [("all", df), ("inferred", df[df["is_inferred"]])]:
        total = max(len(sub), 1)
        counts = sub["confidence_band"].value_counts().to_dict()
        out[scope] = {
            b: {"count": int(counts.get(b, 0)),
                "ratio": round(float(counts.get(b, 0)) / total, 4)}
            for b, *_ in CONF_BANDS
        }
        out[scope]["total"] = int(len(sub))
    by_role = {}
    inf = df[df["is_inferred"]]
    for role, g in inf.groupby("pred"):
        total = max(len(g), 1)
        vc = g["confidence_band"].value_counts().to_dict()
        by_role[role] = {
            "total": int(len(g)),
            "mean_confidence": round(float(g["confidence"].mean()), 3),
            "low_count": int(vc.get("低", 0)),
            "low_ratio": round(float(vc.get("低", 0)) / total, 4),
        }
    out["by_pred_role"] = by_role
    return out


def _patterns(train, all_df, pipe):
    # 每个行当的数值特征均值（对应"特征↔行当"模式）
    profile = {}
    prof_cols = ["ratio_chang", "ratio_nian", "ratio_bai", "n_lines",
                 "degree", "kw_female", "kw_servant", "is_group"]
    for c in sorted(train["label"].unique()):
        sub = train[train["label"] == c]
        profile[c] = {col: round(float(sub[col].mean()), 3) for col in prof_cols}
        profile[c]["count"] = int(len(sub))
    # 每个行当 TF-IDF 系数最高的台词词
    tfidf = pipe.named_steps["pre"].named_transformers_["text"]
    clf = pipe.named_steps["clf"]
    feat_names = tfidf.get_feature_names_out()
    n_num = len(NUM_COLS)
    # 数值特征重要性：标准化后逻辑回归系数（带符号，越大越偏向该行当）
    numeric_importance = {}
    for i, c in enumerate(clf.classes_):
        coef_num = clf.coef_[i][:n_num]
        order = np.argsort(np.abs(coef_num))[::-1][:6]
        numeric_importance[c] = [
            {"feature": NUM_COLS[j], "coef": round(float(coef_num[j]), 3)}
            for j in order]
    top_words = {}
    clean_top_words = {}
    blacklist = role_name_blacklist(all_df)
    for i, c in enumerate(clf.classes_):
        coef = clf.coef_[i][n_num:]  # 跳过数值特征
        idx = np.argsort(coef)[::-1][:80]
        raw = [feat_names[j] for j in idx[:20]]
        top_words[c] = raw
        clean = []
        for j in idx:
            w = feat_names[j]
            if keep_word(w, blacklist):
                clean.append(w)
            if len(clean) >= 20:
                break
        clean_top_words[c] = clean
    return {
        "feature_profile": profile,
        "top_words": top_words,
        "clean_top_words": clean_top_words,
        "numeric_importance": numeric_importance,
        "feature_groups": {
            "表演型": ["ratio_chang", "ratio_nian", "ratio_bai", "ratio_other", "sing_lines"],
            "结构": ["n_lines", "n_scenes", "degree", "avg_text_len", "total_text_len"],
            "画像": ["kw_female", "kw_official", "kw_martial", "kw_servant",
                   "kw_group", "kw_old", "is_group", "name_len"],
            "台词": ["text_tfidf"],
        },
        "feature_delta_by_period": period_feature_delta(train, prof_cols),
        "profile_cols": prof_cols,
    }


def role_name_blacklist(df):
    names = set(str(x).strip() for x in df["name"].dropna())
    toks = set()
    for name in names:
        toks.add(name)
        toks.update(jieba.lcut(name))
    return {x for x in toks if x}


def keep_word(w, blacklist):
    w = str(w).strip()
    if not w or w in STOPWORDS or w in blacklist:
        return False
    if any(ch.isdigit() for ch in w):
        return False
    if all(not ("\u4e00" <= ch <= "\u9fff") for ch in w):
        return False
    if len(w) == 1 and w not in KEEP_ONE_CHAR:
        return False
    return True


def period_feature_delta(train, prof_cols):
    corpus = pd.read_json(PROCESSED / "corpus.jsonl", lines=True,
                          dtype={"play_id": str})[
        ["play_id", "source"]].drop_duplicates("play_id")
    df = train.copy()
    df["play_id"] = df["play_id"].astype(str)
    df = df.merge(corpus, on="play_id", how="left")
    df["period"] = [period_of(c, s) for c, s in zip(df["collection"], df["source"])]
    out = {}
    for role in sorted(df["label"].unique()):
        rg = df[df["label"] == role]
        base = {c: float(rg[c].mean()) for c in prof_cols}
        out[role] = {}
        for per in PERIOD_ORDER:
            pg = rg[rg["period"] == per]
            if not len(pg):
                continue
            out[role][per] = {
                c: {
                    "mean": round(float(pg[c].mean()), 3),
                    "delta": round(float(pg[c].mean() - base[c]), 3),
                }
                for c in prof_cols
            }
            out[role][per]["count"] = int(len(pg))
    return out


if __name__ == "__main__":
    main()
