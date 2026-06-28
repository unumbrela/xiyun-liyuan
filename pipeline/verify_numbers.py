"""数字一致性核查：重算 README.md / docs/答题卡.md 引用的头条数字，
与当前 data/processed/ 产物比对，打印 PASS/FAIL 差异表。

用途：避免「答题卡/报告里的数字」与「软件实际产出」对不上（评审硬伤，
§6 要求结论须依据自己作品所揭示的规律）。

运行：conda activate llm && python pipeline/verify_numbers.py
"""
import json

import pandas as pd

from config import PROCESSED, ROOT

CHECKS = []  # (任务, 论断, 期望值, 实际值, 容差)

# 头条数字（字符串形式）——必须同时出现在答题卡的 Markdown 与 LaTeX(PDF) 两份源里，
# 防止「改了数据/某一处文案、另一处渲染没跟上」导致 PDF 与作品产出对不上（评审硬伤）。
HEADLINE_TOKENS = [
    "0.704", "0.696", "7656", "7428", "15034", "5670", "4129", "5235",
    "0.30", "0.21", "0.70", "0.16",          # T2 网络结构 / 同配系数
    "K=10", "0.46", "0.54",                  # T3 选 K / 稳健性对照
    "288", "202", "181", "151", "143",       # T4 五类叙事弧线计数
    "0.58", "0.45", "0.35", "0.226", "0.092",  # T5 相关 / 预测验证
]


def chk(task, claim, expected, actual, tol=0.01):
    CHECKS.append((task, claim, expected, actual, tol))


def check_prose():
    """核查答题卡两份源（.md 顺述版 / .tex→PDF 精化版）头条数字一致，互不矛盾。
    用户要求两套写法各自独立，故此处只查「数字都在、不缺失」而非逐句统一行文。"""
    docs = ROOT / "docs"
    sources = {
        "答题卡.md": (docs / "答题卡.md"),
        "answersheet.tex(PDF源)": (docs / "answersheet.tex"),
    }
    for label, path in sources.items():
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        for tok in HEADLINE_TOKENS:
            chk("文案", f"{label}∋{tok}", True, tok in text, tol=0)


def jload(name):
    return json.loads((PROCESSED / name).read_text(encoding="utf-8"))


def pair_sig(block, metric, a, b):
    """从 type_significance 块取 (a,b) 在 metric 上是否显著。"""
    for p in block["pairs"][metric]:
        if {p["a"], p["b"]} == {a, b}:
            return p["significant"]
    return None


def main():
    # ---------- 任务一 ----------
    m1 = jload("task1_metrics.json")
    rep = m1["report"]
    chk("T1", "macro-F1", 0.704, round(m1["macro_f1"], 3))
    chk("T1", "GroupKFold macro-F1", 0.696, round(m1["group_play_cv"]["macro_f1"], 3))
    chk("T1", "角色标注总数", 7656, int(m1["n_role_annotations"]), tol=0)
    chk("T1", "训练实例数", 7428, int(m1["n_train_instances"]), tol=0)
    for r, exp in [("旦", 0.85), ("生", 0.79), ("丑", 0.69), ("净", 0.68)]:
        chk("T1", f"{r}行 F1", exp, round(rep[r]["f1-score"], 2))

    pred = pd.read_parquet(PROCESSED / "predictions.parquet")
    chk("T1", "推断未标注角色数", 15034, int(pred["is_inferred"].sum()), tol=0)
    chk("T1", "低置信待核角色数", 5235,
        int(m1["confidence_bands"]["inferred"]["低"]["count"]), tol=0)

    tmp = jload("task1_temporal.json")
    dist = {p: tmp["by_period"][p]["role_dist"] for p in tmp["period_order"]}
    per = tmp["period_order"]
    chk("T1", "净占比·清末民国", 0.224, round(dist[per[0]].get("净", 0), 3))
    chk("T1", "净占比·建国初期", 0.212, round(dist[per[1]].get("净", 0), 3))
    chk("T1", "净占比·当代", 0.162, round(dist[per[2]].get("净", 0), 3))
    chk("T1", "丑占比·当代", 0.207, round(dist[per[2]].get("丑", 0), 3))
    # 误判结构（新增方法·零重训）：最大误判方向
    cm, labs = m1["confusion_matrix"], m1["labels"]
    best = (-1, "")
    for i in range(len(cm)):
        for j in range(len(cm)):
            if i != j and cm[i][j] > best[0]:
                best = (cm[i][j], f"{labs[i]}→{labs[j]}")
    chk("T1", "最大误判方向(真→预测)", "生→净", best[1], tol=0)

    # ---------- 任务二 ----------
    t2 = jload("task2_typestats.json")
    bt = t2["by_type"]
    chk("T2", "历史戏剧目数", 580, bt["历史戏"]["count"], tol=0)
    chk("T2", "公案戏剧目数", 241, bt["公案戏"]["count"], tol=0)
    chk("T2", "家庭戏剧目数", 212, bt["家庭戏"]["count"], tol=0)
    chk("T2", "神怪戏剧目数", 143, bt["神怪戏"]["count"], tol=0)
    chk("T2", "公案戏均角色数", 15.4, round(bt["公案戏"]["mean"]["n_nodes"], 1), tol=0.1)
    chk("T2", "公案戏均关系数", 68.6, round(bt["公案戏"]["mean"]["n_edges"], 1), tol=0.2)
    chk("T2", "公案戏中心势", 0.30, round(bt["公案戏"]["mean"]["centralization"], 2))
    chk("T2", "历史戏模块度", 0.21, round(bt["历史戏"]["mean"]["modularity"], 2))
    chk("T2", "家庭戏密度", 0.70, round(bt["家庭戏"]["mean"]["density"], 2))
    # 论断核查：谁的中心势最高？谁的密度最高（仅四大命名类型）？
    named = ["历史戏", "家庭戏", "公案戏", "神怪戏"]
    top_centr = max(named, key=lambda t: bt[t]["mean"]["centralization"])
    top_dens = max(named, key=lambda t: bt[t]["mean"]["density"])
    # 注：历史戏(0.306)略高于公案戏(0.296)；答题卡已据此改为「中心势高·并列最高档」
    chk("T2", "中心势最高类型", "历史戏", top_centr, tol=0)
    chk("T2", "密度最高类型(四大命名型)", "家庭戏", top_dens, tol=0)
    # 结构角色 / 阵营同质度（新增方法）
    rstruct = t2["role_structure"]
    top_bridge = max(rstruct, key=lambda r: rstruct[r]["mean_betweenness"])
    chk("T2", "桥接位最高行当", "生", top_bridge, tol=0)
    chk("T2", "生行桥接主座占比", 0.508, rstruct["生"]["bridge_share"], tol=0.005)
    chk("T2", "行当同配·全库(负=互补异配)", -0.157,
        t2["assortativity_by_type"]["全库"], tol=0.02)
    # 类型间显著性（新增方法）
    ts2 = t2["type_significance"]
    chk("T2", "模块度 历史戏≠家庭戏(显著)", True, pair_sig(ts2, "模块度", "历史戏", "家庭戏"), tol=0)
    chk("T2", "模块度 历史戏~公案戏(不显著)", False, pair_sig(ts2, "模块度", "历史戏", "公案戏"), tol=0)
    # 网络结构时期演化（新增方法）
    pe = t2["period_evolution"]
    chk("T2", "网络规模·当代(随时代增大)", 18.35, pe["by_period"]["当代"]["网络规模"], tol=0.1)
    chk("T2", "网络规模时期演化显著", True, pe["significance"]["网络规模"]["significant"], tol=0)

    # ---------- 任务三 ----------
    t3 = jload("task3_topics.json")
    chk("T3", "主题数 K(数据驱动)", 10, t3["K"], tol=0)
    t3p = jload("task3_patterns.json")
    sizes = [a.get("size", a.get("count", 0)) for a in t3p["archetypes"]]
    chk("T3", "原型组合数", 6, len(t3p["archetypes"]), tol=0)
    chk("T3", "最大原型规模(约500)", 501, max(sizes) if sizes else 0, tol=40)
    # 主题随时期演化（新增方法）
    trends = t3p["period_trends"]
    chk("T3", "时期演化显著主题数", 10, sum(t["significant"] for t in trends), tol=0)
    tdir = lambda sub: next((t["direction"] for t in trends if sub in t["label"]), "?")
    chk("T3", "征战母题(攻打)趋势", "下降", tdir("攻打"), tol=0)
    chk("T3", "家庭母题(投江)趋势", "上升", tdir("投江"), tol=0)
    # 主题稳健性对照（新增方法）
    st = t3["stability"]
    chk("T3", "主题稳健·NMF匹配余弦", 0.461, st["nmf_mean_cosine"], tol=0.03)
    chk("T3", "主题稳健·多seed LDA余弦", 0.537, st["lda_seed_mean_cosine"], tol=0.03)

    # ---------- 任务四 ----------
    t4 = jload("task4_patterns.json")
    arcs = {a["id"]: a for a in t4["arcs"]}
    total = sum(a["size"] for a in t4["arcs"])
    chk("T4", "参与聚类剧目数(≥4场)", 965, total, tol=0)
    chk("T4", "平稳铺陈式", 288, arcs[3]["size"], tol=0)
    chk("T4", "中段经典弧线", 143, arcs[2]["size"], tol=0)
    chk("T4", "前段先声夺人", 151, arcs[4]["size"], tol=0)
    chk("T4", "结尾陡升式", 202, arcs[1]["size"], tol=0)
    chk("T4", "后段高潮式(渐强)", 181, arcs[0]["size"], tol=0)
    n_labels = len({a["label"] for a in t4["arcs"]})
    chk("T4", "弧线名互异(5种)", 5, n_labels, tol=0)
    # 类型间节奏显著性（新增方法）
    ts4 = t4["type_significance"]
    chk("T4", "做打量 历史戏≠家庭戏(显著)", True, pair_sig(ts4, "做打量", "历史戏", "家庭戏"), tol=0)
    chk("T4", "做打量 历史戏~公案戏(不显著)", False, pair_sig(ts4, "做打量", "历史戏", "公案戏"), tol=0)

    # ---------- 任务五 ----------
    t5 = jload("task5_corr.json")
    fmap = {(f["a"], f["b"]): f["r"] for f in t5["findings"]}
    fmap.update({(f["b"], f["a"]): f["r"] for f in t5["findings"]})
    chk("T5", "网络规模↔做打量", 0.58, round(fmap.get(("网络规模", "做打量"), 0), 2))
    chk("T5", "模块度↔做打量", 0.45, round(fmap.get(("模块度", "做打量"), 0), 2))
    chk("T5", "模块度↔净占比", 0.35, round(fmap.get(("模块度", "净占比"), 0), 2))
    chk("T5", "模块度↔旦占比", -0.32, round(fmap.get(("模块度", "旦占比"), 0), 2))
    # 偏相关控混淆（新增方法）：控制剧目体量后协同是否稳健
    pmap = {(f["a"], f["b"]): f.get("r_partial") for f in t5["findings"]}
    pmap.update({(f["b"], f["a"]): f.get("r_partial") for f in t5["findings"]})
    chk("T5", "网络规模↔做打·控体量", 0.12, round(pmap.get(("网络规模", "做打量"), 0), 2), tol=0.03)
    chk("T5", "模块度↔做打·控后体量驱动", 0.02, round(pmap.get(("模块度", "做打量"), 0), 2), tol=0.03)
    chk("T5", "模块度↔净占比·控体量(稳健)", 0.21, round(pmap.get(("模块度", "净占比"), 0), 2), tol=0.03)
    chk("T5", "控体量后稳健项数", 26, int(t5.get("n_robust", 0)), tol=0)
    # 轻量预测验证（新增方法）
    pr = t5["prediction"]
    chk("T5", "弧型预测 macro-F1", 0.226, pr["macro_f1"], tol=0.03)
    chk("T5", "弧型预测>多数类基线", True, pr["macro_f1"] > pr["baseline_macro_f1"], tol=0)

    # ---------- 文案数字一致性（答题卡 .md / .tex 两份源）----------
    check_prose()

    # ---------- 打印 ----------
    print(f"{'任务':<5}{'论断':<26}{'期望':>10}{'实际':>10}  结果")
    print("-" * 64)
    n_fail = 0
    for task, claim, exp, act, tol in CHECKS:
        if isinstance(exp, str):
            ok = exp == act
        else:
            ok = abs(float(exp) - float(act)) <= tol + 1e-9
        if not ok:
            n_fail += 1
        flag = "PASS" if ok else "**FAIL**"
        print(f"{task:<5}{claim:<26}{str(exp):>10}{str(act):>10}  {flag}")
    print("-" * 64)
    print(f"共 {len(CHECKS)} 项，FAIL {n_fail} 项。")
    if n_fail:
        print("→ 请据上表 FAIL 行修订 README.md / docs/答题卡.md 中对应数字/论断。")


if __name__ == "__main__":
    main()
