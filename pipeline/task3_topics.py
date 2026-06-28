"""B6 任务三：主题提取与比较。

- 语料：每部剧的「情节」摘要（99.5% 覆盖、主题信号密集）。
- 分词：jieba 词性标注，仅保留内容词（名/动/形/习用语），剔除人名/地名等实体，
  使主题反映「题材/母题」而非具体人物。
- 模型：sklearn LDA（无需 gensim）。
- 产出：主题词、每剧主题构成、主题共现（组合模式）、原型聚类、跨类型/时期比较。

输出（data/processed/）：
- task3_topics.json        K 个主题的 top 词 + 全局占比
- task3_play_topics.parquet 每剧主题分布 + 主导主题
- task3_patterns.json      主题共现矩阵 / 原型组合 / 按剧目类型·时期的主题分布
"""
import json
import re
from collections import defaultdict

import jieba.posseg as pseg
import numpy as np
import pandas as pd
from scipy.spatial.distance import jensenshannon
from scipy.stats import kruskal
from sklearn.cluster import KMeans
from sklearn.decomposition import LatentDirichletAllocation, NMF
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.manifold import MDS

from config import CORPUS_JSONL, PROCESSED
from task1_temporal import period_of, PERIOD_ORDER
from task5_synthesis import bh_fdr

K_RANGE = range(5, 16)  # K 候选区间（数据驱动选 K，见 choose_k）
N_ARCHETYPE = 6         # 主题组合原型（聚类）数
# 角色名常见前/后缀：从带缀全名剥出裸名，一并并入实体黑名单
NAME_AFFIX = ("公主", "将军", "元帅", "夫人", "娘娘", "国母", "太后", "皇后", "贵妃",
              "老爷", "大人", "员外", "丞相", "先生", "和尚", "道士", "婆婆", "丫鬟")
NAME_PREFIX = ("老", "小", "大", "二", "三", "四")
KEEP_POS = {"n", "v", "a", "vn", "an", "nz", "nl", "ad", "vd", "ng", "vg"}
STOP = set("一 二 三 不 被 将 命 遂 后 又 终于 互相 等 无 有 某 此 乃 因 为 中 上 下 "
           "同 各 之 其 所 而 与 于 以 及 并 即 则 但 却 已 还 更 最 很 太 都 也 "
           "这 那 个 们 是 在 了 着 过 把 给 让 使 令 至 自 从 对 向 往 该 系 "
           "前 后 内 外 间 时 日 年 人 事 处 地方 一个 这个 起来 出来 不肯 不料 "
           "只得 只好 不得 如此 因此 于是 原来 当时 此时 二人 三人 众人 "
           "不能 不可 不知 不意 无人 全剧 剧本 始知 乘机 奉命 询问 相见 不久 "
           "不料 一面 一同 一起 不得已 只见 遂将 遂以 部下 率领 率兵 领兵 发兵 "
           "出兵 不肯 不愿 不许 即位 此事 其事 此人 之事 一事 不和 不睦 闻知 "
           "得知 见状 不从 应允 答应 前往 同往 同上 同下".split())


def _bare_names(name: str):
    """从带前/后缀的角色全名剥出裸名变体，捕捉「金花公主→金花」「老张→张」等泄漏。"""
    out = set()
    for suf in NAME_AFFIX:
        if name.endswith(suf) and len(name) - len(suf) >= 2:
            out.add(name[: -len(suf)])
    for pre in NAME_PREFIX:
        if name.startswith(pre) and len(name) - len(pre) >= 2:
            out.add(name[len(pre):])
    return out


def build_name_set(recs):
    """用数据自身的角色名/说话人作为实体黑名单（高精度去名），并补入裸名变体。"""
    names = set()
    for r in recs:
        for role in r.get("roles", []):
            names.add(role["name"])
        for s in r.get("scenes", []):
            for ln in s["lines"]:
                names.update(ln["speakers"])
    bare = set()
    for n in names:
        bare |= _bare_names(n)
        if len(n) >= 3:                # 全名→裸名：黄三泰→三泰、李金花→金花（剥姓/取名）
            bare.add(n[-2:])
            bare.add(n[1:])
    names |= bare
    return {n for n in names if 2 <= len(n) <= 4}


_VOL_RE = re.compile(r"【.*?】|[（(].*?[）)]|[头二三四五六七八九十上中下前后续]*本|\d+")


def story_key(title: str) -> str:
    """把多卷剧名（头本/二本/【三本】/上下…）归并到同一"故事"，用于按故事计文档频率。"""
    t = _VOL_RE.sub("", title or "").strip()
    return t or (title or "")


def drop_series_terms(X, vocab, story_keys, min_stories=5):
    """剔除只在极少数"故事"里出现的剧目专属名/道具（按故事而非分卷计文档频率）。

    多卷剧（九龙杯头/二/三本…）会让单剧角色名（三泰/国母/莲灯/仙果）在很多 play_id
    里重复，骗过 min_df。改按归并后的故事数计频：跨故事 < min_stories 的词判为专名/道具
    剔除，保留跨故事泛化的母题动作词（出战/夫妻/杀死…）。
    """
    Xc = X.tocsc()
    sk = np.asarray(story_keys)
    keep, dropped = [], []
    for j in range(Xc.shape[1]):
        rows = Xc.indices[Xc.indptr[j]:Xc.indptr[j + 1]]
        if len(set(sk[rows])) < min_stories:
            dropped.append(vocab[j])
            continue
        keep.append(j)
    return X[:, keep], vocab[keep], dropped


def matched_cosine(Ha, Hb):
    """两组主题-词分布的最优匹配(Hungarian)余弦相似度。返回 (每个 Ha 主题匹配到的余弦,
    Ha→Hb 的匹配列号)。这是主题稳健性的标准度量：值越高=另一模型/seed 复现出语义相同的主题。"""
    from scipy.optimize import linear_sum_assignment
    A = Ha / (np.linalg.norm(Ha, axis=1, keepdims=True) + 1e-12)
    B = Hb / (np.linalg.norm(Hb, axis=1, keepdims=True) + 1e-12)
    S = A @ B.T
    r, c = linear_sum_assignment(-S)
    cos = np.empty(Ha.shape[0])
    cos[r] = S[r, c]
    return cos, c


def choose_k(k_selection, tol=0.02):
    """数据驱动选 K：在 coherence 接近最优（容差 tol）的候选里取最大 K，
    即"一致性退化前最细的划分"，兼顾连贯性与可解释粒度。"""
    best = max(c["coherence"] for c in k_selection)
    cands = [c["k"] for c in k_selection if c["coherence"] >= best - tol]
    return max(cands)


def tokenize(text: str, names: set):
    out = []
    for w, flag in pseg.cut(text):
        if len(w) < 2 or w in STOP or w in names:
            continue
        if flag[0] not in {"n", "v", "a"} and flag not in KEEP_POS:
            continue
        if flag in {"nr", "ns", "nt", "nrfg", "nrt"}:  # 人名/地名/机构
            continue
        out.append(w)
    return out


def umass_coherence(H, Xbin, top_n=10, per_topic=False):
    """u_mass 主题一致性（越接近 0 越好/越高越连贯，取各主题均值）。

    Xbin: 文档×词 的二值稀疏矩阵；H: 主题×词。基于词共现文档频率。
    per_topic=True 时额外返回每个主题的一致性列表。
    """
    import numpy as _np
    df = _np.asarray(Xbin.sum(0)).ravel()                 # 各词文档频率
    scores = []
    for k in range(H.shape[0]):
        top = H[k].argsort()[::-1][:top_n]
        s, cnt = 0.0, 0
        for mi in range(1, len(top)):
            wm = top[mi]
            col_m = Xbin[:, wm]
            for li in range(mi):
                wl = top[li]
                co = int(col_m.multiply(Xbin[:, wl]).sum())   # 共现文档数
                s += _np.log((co + 1.0) / (df[wl] + 1e-9))
                cnt += 1
        scores.append(s / cnt if cnt else 0.0)
    mean = float(_np.mean(scores)) if scores else 0.0
    return (mean, scores) if per_topic else mean


def scan_k(X, k_range=range(5, 16)):
    """扫不同主题数 K：困惑度（越低越好）+ u_mass 一致性（越高越连贯）。"""
    Xbin = (X > 0).astype(int)
    out = []
    for k in k_range:
        m = LatentDirichletAllocation(n_components=k, learning_method="batch",
                                      max_iter=30, random_state=42, n_jobs=-1)
        m.fit(X)
        out.append({"k": int(k),
                    "perplexity": round(float(m.perplexity(X)), 1),
                    "coherence": round(umass_coherence(m.components_, Xbin), 4)})
        print(f"  K={k:>2}  perplexity={out[-1]['perplexity']:>8.1f}  "
              f"coherence={out[-1]['coherence']:+.4f}")
    return out


def main():
    recs = [json.loads(l) for l in open(CORPUS_JSONL, encoding="utf-8")]
    names = build_name_set(recs)
    print(f"实体黑名单（角色名）: {len(names)}")
    docs, meta = [], []
    for r in recs:
        plot = r.get("plot", "")
        if len(plot) < 20:
            continue
        toks = tokenize(plot, names)
        if len(toks) < 5:
            continue
        docs.append(" ".join(toks))
        meta.append({"play_id": str(r["play_id"]), "title": r["title"],
                     "collection": r["collection"], "source": r.get("source", "")})
    print(f"参与主题建模剧目: {len(docs)}")

    vec = CountVectorizer(token_pattern=r"(?u)\b\w+\b", min_df=5, max_df=0.4,
                          max_features=4000)
    X = vec.fit_transform(docs)
    vocab = np.array(vec.get_feature_names_out())
    print(f"词表大小(初): {len(vocab)}")
    # 按"故事"计频过滤：剔除只在极少数故事里出现的专名/道具（三泰/国母/莲灯/仙果…）
    story_keys = [story_key(m["title"]) for m in meta]
    print(f"归并故事数: {len(set(story_keys))}（共 {len(meta)} 卷/剧）")
    X, vocab, dropped = drop_series_terms(X, vocab, story_keys, min_stories=5)
    print(f"按故事计频剔除 {len(dropped)} 词，词表大小(净): {len(vocab)}；"
          f"例: {' '.join(dropped[:14])}")

    print(f"\nK 选择扫描（perplexity ↓ 越好 / coherence ↑ 越连贯）:")
    k_selection = scan_k(X, K_RANGE)
    K = choose_k(k_selection)
    chosen = next(c for c in k_selection if c["k"] == K)
    print(f"选定 K={K}（coherence={chosen['coherence']:+.4f}，"
          f"一致性退化前最细划分）")

    lda = LatentDirichletAllocation(n_components=K, learning_method="batch",
                                    max_iter=30, random_state=42, n_jobs=-1)
    W = lda.fit_transform(X)          # 文档-主题
    W = W / W.sum(1, keepdims=True)
    H = lda.components_               # 主题-词

    # ---- 主题间 2D 坐标（JS 距离 + MDS，供主题分布图）+ 每主题一致性 ----
    Hn = H / H.sum(1, keepdims=True)
    Dist = np.zeros((K, K))
    for i in range(K):
        for j in range(i + 1, K):
            d = float(jensenshannon(Hn[i], Hn[j]))
            Dist[i, j] = Dist[j, i] = d if np.isfinite(d) else 0.0
    coords = MDS(n_components=2, dissimilarity="precomputed", random_state=42,
                 normalized_stress="auto").fit_transform(Dist)
    _, topic_coh = umass_coherence(H, (X > 0).astype(int), per_topic=True)

    # ---- 主题词 + 标签 ----
    topics = []
    for k in range(K):
        top_idx = H[k].argsort()[::-1][:15]
        words = [{"word": vocab[i], "weight": round(float(H[k][i]), 2)} for i in top_idx]
        topics.append({"id": k, "label": "·".join(vocab[top_idx[:3]]),
                       "top_words": words, "share": round(float(W[:, k].mean()), 4),
                       "coherence": round(float(topic_coh[k]), 4),
                       "x": round(float(coords[k, 0]), 4),
                       "y": round(float(coords[k, 1]), 4)})
    print("\n主题（top 词）:")
    for t in topics:
        print(f"  T{t['id']:>2} [{t['share']*100:4.1f}%] coh={t['coherence']:+.2f} "
              f"{t['label']:<14} {' '.join(w['word'] for w in t['top_words'][:8])}")

    # ---- 主题稳健性对照：NMF + 多 seed LDA（证"10 母题非单次随机产物"）----
    # 用主题-词分布的最优匹配余弦相似度（标准主题稳健性度量，对短文本 argmax 噪声不敏感）。
    nmf = NMF(n_components=K, init="nndsvd", solver="mu", beta_loss="frobenius",
              random_state=42, max_iter=600)   # solver='mu' 直接吃稀疏阵
    nmf.fit(X.tocsr())
    nmf_cos, _ = matched_cosine(H, nmf.components_)
    seed_cos = []
    for sd in (0, 7):
        m2 = LatentDirichletAllocation(n_components=K, learning_method="batch",
                                       max_iter=30, random_state=sd, n_jobs=-1).fit(X)
        seed_cos.append(matched_cosine(H, m2.components_)[0])
    seed_cos_mean = np.mean(seed_cos, axis=0)   # 逐主题对多 seed 取平均
    stability = {
        "nmf_mean_cosine": round(float(np.mean(nmf_cos)), 3),
        "lda_seed_mean_cosine": round(float(np.mean(seed_cos_mean)), 3),
        "seeds": [0, 7],
        "per_topic": [{"id": k, "label": topics[k]["label"],
                       "nmf_cosine": round(float(nmf_cos[k]), 3),
                       "lda_seed_cosine": round(float(seed_cos_mean[k]), 3)}
                      for k in range(K)],
    }
    print(f"\n主题稳健性（主题-词分布最优匹配余弦）：NMF {stability['nmf_mean_cosine']}、"
          f"多 seed LDA {stability['lda_seed_mean_cosine']}")

    # ---- 每剧主题分布 ----
    df = pd.DataFrame(meta)
    for k in range(K):
        df[f"t{k}"] = W[:, k].round(4)
    df["dominant"] = W.argmax(1)
    net = pd.read_parquet(PROCESSED / "task2_metrics.parquet")[["play_id", "drama_type"]]
    net["play_id"] = net["play_id"].astype(str)
    df = df.merge(net, on="play_id", how="left")
    df["drama_type"] = df["drama_type"].fillna("其他")
    df["period"] = [period_of(c, s) for c, s in zip(df["collection"], df["source"])]
    # 每主题代表剧目（主题权重 top-6，供主题分布图点选联动）
    for k in range(K):
        order = W[:, k].argsort()[::-1][:6]
        topics[k]["representative"] = (
            df.iloc[order][["play_id", "title", "drama_type"]].to_dict("records"))
    df.to_parquet(PROCESSED / "task3_play_topics.parquet", index=False)

    # ---- 主题共现（组合模式）：软共现提升度 lift ----
    # 注意：主题占比是成分数据（每剧 10 维占比恒和为 1），直接对各主题列做
    # 皮尔逊相关会因单纯形约束系统性偏负——本语料下全部 ≤0，再砍负值即归零，
    # 故弃用相关。改用 lift：观测的共享概率质量 ÷ 独立假设下的期望。
    #   co[i,j]  = Σ_d W[d,i]·W[d,j]          （两主题在同剧的共享权重质量）
    #   exp[i,j] = (Σ_d W[d,i])(Σ_d W[d,j])/N （边际独立时的期望共享）
    #   lift     = co / exp                    （>1 相对常同台，<1 低于随机）
    # 不二值化、不砍负，保留全部数值的相对结构（本语料剧目高度单主题，
    # 整体 lift<1，但相对最强的母题组合仍清晰可辨）。
    co = W.T @ W
    exp = np.outer(W.sum(0), W.sum(0)) / W.shape[0]
    cooc = np.divide(co, exp, out=np.zeros_like(co), where=exp > 0)
    np.fill_diagonal(cooc, 0)

    # ---- 原型主题组合（KMeans）----
    km = KMeans(n_clusters=N_ARCHETYPE, random_state=42, n_init=10).fit(W)
    arche = []
    for c in range(N_ARCHETYPE):
        mask = km.labels_ == c
        mean_t = W[mask].mean(0)
        top = mean_t.argsort()[::-1][:3]
        members = df[mask]
        reps = members.assign(score=W[mask][:, top[0]]).nlargest(
            6, "score")[["play_id", "title", "drama_type"]].to_dict("records")
        arche.append({
            "id": c, "size": int(mask.sum()),
            "label": " + ".join(topics[i]["label"].split("·")[0] for i in top),
            "top_topics": [int(i) for i in top],
            "mean_topics": [round(float(x), 4) for x in mean_t],
            "representative": reps,
        })
    arche.sort(key=lambda a: -a["size"])

    # ---- 跨类型 / 跨时期主题分布 ----
    def group_mean(col):
        g = {}
        for key, sub in df.groupby(col):
            g[key] = [round(float(sub[f"t{k}"].mean()), 4) for k in range(K)]
        return g

    by_period = group_mean("period")

    # ---- 主题随时期演化趋势 + 显著性（清末民国→建国初期→当代）----
    # 趋势：各时期占比的 delta/斜率；显著性：三时期每剧主题权重的 Kruskal–Wallis
    # 组间差异检验 + BH-FDR 多重比较校正，回答题意"不同时期变化规律"。
    period_trends, kw_pvals = [], []
    for k in range(K):
        shares = [by_period.get(p, [0.0] * K)[k] for p in PERIOD_ORDER]
        groups = [df[df["period"] == p][f"t{k}"].dropna().values
                  for p in PERIOD_ORDER]
        groups = [g for g in groups if len(g) > 0]
        try:
            kp = kruskal(*groups)[1] if len(groups) >= 2 else 1.0
        except Exception:
            kp = 1.0
        kw_pvals.append(float(kp))
        delta = shares[-1] - shares[0]
        slope = float(np.polyfit(range(len(shares)), shares, 1)[0])
        period_trends.append({
            "id": k, "label": topics[k]["label"],
            "shares": [round(float(s), 4) for s in shares],
            "delta": round(float(delta), 4), "slope": round(slope, 4),
            "direction": "上升" if delta > 0.01 else "下降" if delta < -0.01 else "平稳",
            "kw_p": round(float(kp), 4)})
    for tr, pa in zip(period_trends, bh_fdr(kw_pvals)):
        tr["kw_p_adj"] = round(float(pa), 4)
        tr["significant"] = bool(pa < 0.05)

    patterns = {
        "K": K,
        "cooccurrence": [[round(float(cooc[i, j]), 3) for j in range(K)] for i in range(K)],
        "archetypes": arche,
        "by_drama_type": group_mean("drama_type"),
        "by_period": by_period,
        "period_order": PERIOD_ORDER,
        "period_trends": period_trends,
        "topic_labels": [t["label"] for t in topics],
    }

    (PROCESSED / "task3_topics.json").write_text(
        json.dumps({"K": K, "topics": topics, "k_selection": k_selection,
                    "stability": stability},
                   ensure_ascii=False, indent=2),
        encoding="utf-8")
    (PROCESSED / "task3_patterns.json").write_text(
        json.dumps(patterns, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n原型主题组合（前{N_ARCHETYPE}）:")
    for a in arche:
        print(f"  C{a['id']} ({a['size']}部) {a['label']}  例: "
              f"{'、'.join(r['title'] for r in a['representative'][:3])}")
    print(f"\n主题随时期演化（{'/'.join(PERIOD_ORDER)}；*=BH-FDR 校正后显著）:")
    for tr in sorted(period_trends, key=lambda t: -abs(t["delta"])):
        star = "*" if tr["significant"] else " "
        print(f" {star}T{tr['id']:>2} {tr['label']:<14} {tr['shares']} "
              f"Δ={tr['delta']:+.3f} {tr['direction']} p_adj={tr['kw_p_adj']:.3f}")

    print(f"\n写出 task3_topics.json / task3_play_topics.parquet / task3_patterns.json")


if __name__ == "__main__":
    main()
