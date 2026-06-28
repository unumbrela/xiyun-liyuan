"""京剧可视分析系统 后端（FastAPI）。读取 data/processed/* 提供 JSON API。

运行： conda activate llm && uvicorn backend.main:app --reload --port 8000
（在项目根目录运行）
"""
import json
import os
import sys
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# 产物缺失/损坏时记录，由 /api/health 上报，避免单个文件缺失导致整服务无法启动。
MISSING: list[str] = []
LIMIT_MAX = 1000          # 列表端点返回上限钳制，防止单次请求把全库灌入内存


def _load_parquet(name: str) -> pd.DataFrame:
    try:
        return pd.read_parquet(PROC / name)
    except Exception as e:                       # noqa: BLE001
        MISSING.append(name)
        print(f"[load] 产物缺失/损坏 {name}: {e}", file=sys.stderr)
        return pd.DataFrame()


def _load_json(name: str, default):
    try:
        return json.loads((PROC / name).read_text(encoding="utf-8"))
    except Exception as e:                       # noqa: BLE001
        MISSING.append(name)
        print(f"[load] 产物缺失/损坏 {name}: {e}", file=sys.stderr)
        return default


def _clamp(limit: int) -> int:
    return max(1, min(int(limit), LIMIT_MAX))


def _require(name: str):
    """端点依赖的产物缺失时返回 503，前端据此显示错误态而非空白。"""
    if name in MISSING:
        raise HTTPException(503, f"数据产物 {name} 缺失，请先运行 pipeline 生成")

ROOT = Path(__file__).resolve().parent.parent
# 数据根与 pipeline 路径可由环境变量覆盖（打包成桌面应用时由 Electron 注入）。
PROC = Path(os.environ.get("OPERA_DATA", str(ROOT / "data" / "processed")))
PIPELINE = Path(os.environ.get("OPERA_PIPELINE", str(ROOT / "pipeline")))
sys.path.insert(0, str(PIPELINE))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # 让 `import llm` 在各启动方式下可用
from network_lib import build_network, graph_payload  # noqa: E402
from narrative_lib import compute as narrative_compute  # noqa: E402
import llm  # noqa: E402  大模型 Provider 封装（backend/llm.py）
import agent  # noqa: E402  智能体工具调用编排（backend/agent.py）

app = FastAPI(title="戏韵·梨园谱系 — 京剧可视分析系统")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

# ---- 启动时载入（任一产物缺失只记入 MISSING，不让整服务崩溃）----
import numpy as np  # noqa: E402


def _as_str_pid(df: pd.DataFrame) -> pd.DataFrame:
    if "play_id" in df.columns:
        df["play_id"] = df["play_id"].astype(str)
    return df


PRED = _as_str_pid(_load_parquet("predictions.parquet"))
PATTERNS = _load_json("task1_patterns.json", {})
METRICS = _load_json("task1_metrics.json", {})
TEMPORAL = _load_json("task1_temporal.json", {})
SUBROLES = _load_json("task1_subroles.json", {})
QUALITY = _load_json("quality_report.json", {})
try:
    CORPUS = {r["play_id"]: r for r in
              (json.loads(l) for l in (PROC / "corpus.jsonl").open(encoding="utf-8"))}
except Exception as e:                           # noqa: BLE001
    MISSING.append("corpus.jsonl")
    print(f"[load] 产物缺失/损坏 corpus.jsonl: {e}", file=sys.stderr)
    CORPUS = {}
COLL_PERIOD = TEMPORAL.get("collection_period", {})
ROLE_MAP = {(r.play_id, r.name): r.final_role
            for r in PRED.itertuples()} if len(PRED) else {}

# 任务二
NET = _as_str_pid(_load_parquet("task2_metrics.parquet"))
TYPESTATS = _load_json("task2_typestats.json", {"types": [], "by_type": {}})

# 任务三
TOPICS = _load_json("task3_topics.json", {})
T3PAT = _load_json("task3_patterns.json", {})
PT = _as_str_pid(_load_parquet("task3_play_topics.parquet"))
TK = int(TOPICS.get("K", 0))
TCOLS = [f"t{k}" for k in range(TK)]
if TK and all(c in PT.columns for c in TCOLS):
    TMAT = PT[TCOLS].values
    TNORM = TMAT / (np.linalg.norm(TMAT, axis=1, keepdims=True) + 1e-9)
else:
    TMAT = np.zeros((len(PT), 0))
    TNORM = TMAT

# 任务四
NAR = _as_str_pid(_load_parquet("task4_metrics.parquet"))
T4PAT = _load_json("task4_patterns.json", {"arcs": []})

# 任务五
T5PLAYS = _as_str_pid(_load_parquet("task5_plays.parquet"))
T5CORR = _load_json("task5_corr.json", {})
T5SANKEY = _load_json("task5_sankey.json", {"nodes": [], "links": []})
T5ARCHE = _load_json("task5_archetypes.json", {})
T3LABELS = T3PAT.get("topic_labels", [])
T4ARCLABEL = {a["id"]: a["label"] for a in T4PAT.get("arcs", [])}

# 与前端 theme.js ROLE_COLORS 同步（清新科研色）。生·蓝/旦·玫/净·青绿/丑·琥珀/杂·灰。
ROLE_COLORS = {"生": "#4F9DE8", "旦": "#E0598B", "净": "#1FB6A6",
               "丑": "#F0C24B", "杂": "#8F9BA8"}


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    """统一兜底：未预期异常返回 JSON 500 而非裸栈，前端可稳定解析。"""
    print(f"[500] {request.url.path}: {exc!r}", file=sys.stderr)
    return JSONResponse(status_code=500,
                        content={"error": "internal_error", "detail": str(exc)})


@app.get("/api/health")
def health():
    """供桌面应用主进程探活：服务可达即 ok；degraded 标记部分产物缺失。"""
    return {"ok": True, "degraded": bool(MISSING),
            "missing": sorted(set(MISSING)), "plays": QUALITY.get("parsed", 0)}


@app.get("/api/quality")
def quality():
    return QUALITY


@app.get("/api/overview")
def overview():
    """总览仪表盘聚合：全库剧目按剧目类型 / 时期的计数（来源 task3 全库 per-play 表）。"""
    by_type, by_period = [], []
    if not PT.empty and "drama_type" in PT.columns:
        order = TYPESTATS.get("types") or list(PT["drama_type"].dropna().unique())
        vc = PT["drama_type"].value_counts()
        by_type = [{"name": t, "value": int(vc.get(t, 0))} for t in order if vc.get(t, 0)]
    if not PT.empty and "period" in PT.columns:
        order = TEMPORAL.get("period_order") or list(PT["period"].dropna().unique())
        vc = PT["period"].value_counts()
        by_period = [{"name": p, "value": int(vc.get(p, 0))} for p in order if vc.get(p, 0)]
    return {"by_type": by_type, "by_period": by_period, "total": int(len(PT))}


@app.get("/api/task1/metrics")
def metrics():
    _require("task1_metrics.json")
    return METRICS


@app.get("/api/task1/patterns")
def patterns():
    return PATTERNS


@app.get("/api/task1/temporal")
def temporal():
    return TEMPORAL


@app.get("/api/task1/distribution")
def distribution():
    """行当分布：大类(labeled vs inferred) + 细分支旭日 + 置信度审计。"""
    by_role = []
    for rt in ["生", "旦", "净", "丑", "杂"]:
        g = PRED[PRED["final_role"] == rt]
        by_role.append({
            "role": rt, "color": ROLE_COLORS[rt],
            "labeled": int((~g["is_inferred"]).sum()),
            "inferred": int(g["is_inferred"].sum()),
            "low_confidence": int(g.get("needs_review", False).sum()),
            "total": int(len(g)),
        })
    # 旭日：大类 -> 细分支（仅 labeled 有细分支）
    lab = PRED[PRED["label"].notna()]
    sunburst = []
    for rt in ["生", "旦", "净", "丑", "杂"]:
        g = lab[lab["label"] == rt]
        subs = g["sub_label"].fillna(f"{rt}(未细分)").value_counts()
        sunburst.append({
            "name": rt, "itemStyle": {"color": ROLE_COLORS[rt]},
            "children": [{"name": s, "value": int(v)} for s, v in subs.items()],
        })
    return {"by_role": by_role, "sunburst": sunburst,
            "confidence_bands": METRICS.get("confidence_bands", {})}


@app.get("/api/task1/subroles")
def subroles():
    """细分行当：生/旦 建模推断 + 净/丑 仅展示已标注；含两层旭日与各大类 CV 指标。"""
    return SUBROLES


@app.get("/api/plays")
def plays(collection: str | None = None, period: str | None = None,
          q: str | None = None, limit: int = 200):
    g = PRED.groupby("play_id")
    rows = []
    for pid, sub in g:
        rec = CORPUS.get(pid, {})
        coll = sub["collection"].iloc[0]
        per = COLL_PERIOD.get(coll, "建国初期")
        if collection and coll != collection:
            continue
        if period and per != period:
            continue
        if q and q not in rec.get("title", ""):
            continue
        rows.append({
            "play_id": pid, "title": rec.get("title", ""),
            "collection": coll, "period": per,
            "n_roles": int(len(sub)),
            "n_labeled": int((~sub["is_inferred"]).sum()),
            "n_inferred": int(sub["is_inferred"].sum()),
            "n_low_confidence": int(sub.get("needs_review", False).sum()),
            "n_scenes": len(rec.get("scenes", [])),
        })
    rows.sort(key=lambda r: -r["n_roles"])
    return {"total": len(rows), "plays": rows[:_clamp(limit)]}


@app.get("/api/play/{pid}")
def play_detail(pid: str):
    rec = CORPUS.get(pid)
    if not rec:
        raise HTTPException(404, "play not found")
    sub = PRED[PRED["play_id"] == pid]
    roles = []
    for _, r in sub.iterrows():
        sub_final = r.get("sub_final")
        sub_conf = r.get("sub_confidence")
        roles.append({
            "name": r["name"], "label": r["label"], "sub_label": r["sub_label"],
            "pred": r["pred"], "final_role": r["final_role"],
            "official_role": None if pd.isna(r.get("official_role")) else r.get("official_role"),
            "is_inferred": bool(r["is_inferred"]),
            "confidence_band": None if pd.isna(r.get("confidence_band")) else r.get("confidence_band"),
            "needs_review": bool(r.get("needs_review", False)),
            "alias_match_reason": r.get("alias_match_reason", ""),
            "sub_final": None if pd.isna(sub_final) else sub_final,
            "sub_is_inferred": bool(r.get("sub_is_inferred", False)),
            "sub_confidence": None if pd.isna(sub_conf) else round(float(sub_conf), 3),
            "confidence": round(float(r["confidence"]), 3),
            "n_lines": int(r["n_lines"]),
            "ratio_chang": round(float(r["ratio_chang"]), 3),
            "ratio_nian": round(float(r["ratio_nian"]), 3),
            "ratio_bai": round(float(r["ratio_bai"]), 3),
        })
    roles.sort(key=lambda x: -x["n_lines"])
    return {
        "play_id": pid, "title": rec["title"], "collection": rec["collection"],
        "period": COLL_PERIOD.get(rec["collection"], "建国初期"),
        "source": rec.get("source", ""), "plot": rec.get("plot", ""),
        "n_scenes": len(rec.get("scenes", [])), "roles": roles,
    }


@app.get("/api/task1/inferred")
def inferred(role: str | None = None, min_conf: float = 0.0,
             band: str | None = None, needs_review: bool | None = None,
             limit: int = 300):
    g = PRED[PRED["is_inferred"]]
    if role:
        g = g[g["pred"] == role]
    if band:
        g = g[g["confidence_band"] == band]
    if needs_review is not None:
        g = g[g["needs_review"] == needs_review]
    g = g[g["confidence"] >= min_conf].sort_values("confidence", ascending=False)
    return {"total": int(len(g)), "items": [
        {"play_id": r["play_id"], "title": CORPUS.get(str(r["play_id"]), {}).get("title", ""),
         "name": r["name"], "pred": r["pred"],
         "confidence_band": r.get("confidence_band"),
         "needs_review": bool(r.get("needs_review", False)),
         "confidence": round(float(r["confidence"]), 3),
         "n_lines": int(r["n_lines"])}
        for _, r in g.head(limit).iterrows()]}


@app.get("/api/meta")
def meta():
    return {"collections": sorted(PRED["collection"].unique().tolist()),
            "periods": TEMPORAL["period_order"],
            "role_colors": ROLE_COLORS,
            "drama_types": TYPESTATS["types"]}


# ==================== 任务二：角色关系网络 ====================
@app.get("/api/task2/typestats")
def task2_typestats():
    _require("task2_typestats.json")
    return TYPESTATS


@app.get("/api/task2/scatter")
def task2_scatter():
    """全部剧目在 (节点数, 中心势) 空间的散点，按剧目类型着色。"""
    cols = ["play_id", "title", "drama_type", "n_nodes", "n_edges", "density",
            "centralization", "modularity", "avg_clustering", "main_char"]
    return {"points": NET[cols].to_dict("records")}


@app.get("/api/task2/plays")
def task2_plays(drama_type: str | None = None, q: str | None = None,
                sort: str = "n_nodes", limit: int = 200):
    g = NET
    if drama_type:
        g = g[g["drama_type"] == drama_type]
    if q:
        g = g[g["title"].str.contains(q, na=False)]
    if sort not in NET.columns:
        sort = "n_nodes"
    total = int(len(g))
    g = g.sort_values(sort, ascending=False).head(limit)
    return {"total": total, "plays": g[
        ["play_id", "title", "drama_type", "n_nodes", "n_edges", "density",
         "centralization", "modularity", "n_communities", "main_char"]
    ].to_dict("records")}


@lru_cache(maxsize=256)
def _network_payload(pid: str):
    """实时建网较重，按 pid 缓存（产物启动后不变，结果稳定可复用）。"""
    rec = CORPUS.get(pid)
    if not rec:
        return None
    rec = dict(rec, play_id=str(rec["play_id"]))
    G = build_network(rec, ROLE_MAP)
    payload = graph_payload(G)
    row = NET[NET["play_id"] == pid]
    payload["title"] = rec["title"]
    payload["collection"] = rec["collection"]
    payload["drama_type"] = (row["drama_type"].iloc[0] if len(row) else "其他")
    payload["plot"] = rec.get("plot", "")
    payload["role_colors"] = ROLE_COLORS
    return payload


@app.get("/api/task2/network/{pid}")
def task2_network(pid: str):
    payload = _network_payload(pid)
    if payload is None:
        raise HTTPException(404, "play not found")
    return payload


# ==================== 任务三：主题提取与比较 ====================
@app.get("/api/task3/topics")
def task3_topics():
    _require("task3_topics.json")
    return TOPICS


@app.get("/api/task3/patterns")
def task3_patterns():
    return T3PAT


@app.get("/api/task3/plays")
def task3_plays(topic: int | None = None, drama_type: str | None = None,
                q: str | None = None, limit: int = 200):
    g = PT
    if topic is not None:
        g = g[g["dominant"] == topic]
    if drama_type:
        g = g[g["drama_type"] == drama_type]
    if q:
        g = g[g["title"].str.contains(q, na=False)]
    total = int(len(g))
    # 按主导主题强度排序
    g = g.assign(strength=g[TCOLS].max(axis=1)).sort_values("strength", ascending=False).head(limit)
    return {"total": total, "plays": [{
        "play_id": r.play_id, "title": r.title, "drama_type": r.drama_type,
        "period": r.period, "dominant": int(r.dominant),
        "strength": round(float(r.strength), 3),
    } for r in g.itertuples()]}


@lru_cache(maxsize=256)
def _task3_play(pid: str):
    row = PT[PT["play_id"] == pid]
    if not len(row):
        return None
    i = row.index[0]
    vec = TMAT[PT.index.get_loc(i)]
    # 相似剧（主题向量余弦）
    sims = TNORM @ TNORM[PT.index.get_loc(i)]
    order = np.argsort(sims)[::-1]
    similar = []
    for j in order[1:9]:
        rr = PT.iloc[j]
        similar.append({"play_id": rr["play_id"], "title": rr["title"],
                        "drama_type": rr["drama_type"],
                        "sim": round(float(sims[j]), 3),
                        "dominant": int(rr["dominant"])})
    rec = CORPUS.get(pid, {})
    return {
        "play_id": pid, "title": row.iloc[0]["title"],
        "drama_type": row.iloc[0]["drama_type"], "period": row.iloc[0]["period"],
        "plot": rec.get("plot", ""),
        "topics": [round(float(x), 4) for x in vec],
        "topic_labels": T3PAT["topic_labels"],
        "similar": similar,
    }


@app.get("/api/task3/play/{pid}")
def task3_play(pid: str):
    out = _task3_play(pid)
    if out is None:
        raise HTTPException(404, "play not found")
    return out


# ==================== 任务四：叙事结构 ====================
@app.get("/api/task4/patterns")
def task4_patterns():
    _require("task4_patterns.json")
    return T4PAT


@app.get("/api/task4/plays")
def task4_plays(arc: int | None = None, drama_type: str | None = None,
                climax: str | None = None, q: str | None = None, limit: int = 200):
    g = NAR
    if arc is not None:
        g = g[g["arc"] == arc]
    if drama_type:
        g = g[g["drama_type"] == drama_type]
    if climax:
        g = g[g["climax_type"] == climax]
    if q:
        g = g[g["title"].str.contains(q, na=False)]
    total = int(len(g))
    g = g.sort_values("n_scenes", ascending=False).head(limit)
    return {"total": total, "plays": [{
        "play_id": r.play_id, "title": r.title, "drama_type": r.drama_type,
        "n_scenes": int(r.n_scenes), "peak_pos": float(r.peak_pos),
        "climax_type": r.climax_type, "rising_index": float(r.rising_index),
        "arc": (None if pd.isna(r.arc) else int(r.arc)),
    } for r in g.itertuples()]}


@lru_cache(maxsize=256)
def _task4_play(pid: str):
    rec = CORPUS.get(pid)
    if not rec:
        return None
    nar = narrative_compute(rec)
    if nar is None:
        return None
    row = NAR[NAR["play_id"] == pid]
    nar["play_id"] = pid
    nar["title"] = rec["title"]
    nar["drama_type"] = (row["drama_type"].iloc[0] if len(row) else "其他")
    nar["arc"] = (None if not len(row) or pd.isna(row["arc"].iloc[0])
                  else int(row["arc"].iloc[0]))
    nar["arc_label"] = next((a["label"] for a in T4PAT["arcs"]
                             if a["id"] == nar["arc"]), "")
    nar["plot"] = rec.get("plot", "")
    return nar


@app.get("/api/task4/play/{pid}")
def task4_play(pid: str):
    nar = _task4_play(pid)
    if nar is None:
        raise HTTPException(404, "play not found or no scenes")
    return nar


# ==================== 任务五：综合关联 ====================
@app.get("/api/task5/corr")
def task5_corr():
    _require("task5_corr.json")
    return T5CORR


@app.get("/api/task5/sankey")
def task5_sankey():
    return T5SANKEY


@app.get("/api/task5/archetypes")
def task5_archetypes():
    return T5ARCHE


@app.get("/api/task5/plays")
def task5_plays(archetype: int | None = None, drama_type: str | None = None,
                q: str | None = None, limit: int = 200):
    g = T5PLAYS
    if archetype is not None:
        g = g[g["archetype"] == archetype]
    if drama_type:
        g = g[g["drama_type"] == drama_type]
    if q:
        g = g[g["title"].str.contains(q, na=False)]
    total = int(len(g))
    g = g.sort_values("n_nodes", ascending=False).head(limit)
    return {"total": total, "plays": [{
        "play_id": r.play_id, "title": r.title, "drama_type": r.drama_type,
        "archetype": int(r.archetype),
        "dominant": int(r.dominant), "theme": T3LABELS[int(r.dominant)],
    } for r in g.itertuples()]}


@app.get("/api/task5/play/{pid}")
def task5_play(pid: str):
    """联动档案：一部剧在 关系/主题/叙事/行当 四维的统一画像。"""
    row = T5PLAYS[T5PLAYS["play_id"] == pid]
    if not len(row):
        raise HTTPException(404, "play not found")
    r = row.iloc[0]
    tcols = [c for c in T5PLAYS.columns if c.startswith("t") and c[1:].isdigit()]
    topics = sorted(([int(c[1:]), float(r[c])] for c in tcols),
                    key=lambda x: -x[1])[:5]
    arc = None if pd.isna(r["arc"]) else int(r["arc"])
    narrow = NAR[NAR["play_id"] == pid]
    return {
        "play_id": pid, "title": r["title"], "drama_type": r["drama_type"],
        "archetype": int(r["archetype"]),
        "network": {"n_nodes": int(r["n_nodes"]), "density": round(float(r["density"]), 3),
                    "centralization": round(float(r["centralization"]), 3),
                    "modularity": round(float(r["modularity"]), 3)},
        "roles": {k: round(float(r[k]), 3) for k in ["生", "旦", "净", "丑"]},
        "topics": [{"id": i, "label": T3LABELS[i], "w": round(w, 3)}
                   for i, w in topics if w > 0.02],
        "narrative": {
            "arc": T4ARCLABEL.get(arc, "—"),
            "peak_pos": round(float(r["peak_pos"]), 3),
            "rising_index": round(float(r["rising_index"]), 3),
            "action_total": int(r["action_total"]),
            "sing_ratio": round(float(r["sing_ratio"]), 4),
            "climax_type": (narrow["climax_type"].iloc[0] if len(narrow) else ""),
        },
    }


# ==================== AI 助手：数据接地对话 ====================
def _global_digest() -> str:
    """全库分析结论的紧凑摘要（一次构建、常驻复用），作为 AI 接地的事实底座。"""
    lines: list[str] = []
    lines.append("【数据集】京剧剧本 1473 部，7656 标注角色，约 36 万条对白。")

    icv = METRICS.get("instance_cv", {})
    lines.append(
        f"【任务一·行当分类】五类(生/旦/净/丑/杂)逻辑回归，实例级 5 折 macro-F1 "
        f"{icv.get('macro_f1', METRICS.get('macro_f1')):.3f}，官方四类 macro-F1 "
        f"{icv.get('official_macro_f1', 0):.3f}；推断 {METRICS.get('n_inferred_instances', 0)} 个未标注出场角色。")
    fp = PATTERNS.get("feature_profile", {})
    perf = "；".join(
        f"{rt}: 唱{fp[rt]['ratio_chang']:.2f}/念{fp[rt]['ratio_nian']:.2f}/白{fp[rt]['ratio_bai']:.2f}"
        for rt in ["生", "旦", "净", "丑"] if rt in fp)
    if perf:
        lines.append(f"  各行当表演型(唱/念/白占比)：{perf}。")

    by_type = TYPESTATS.get("by_type", {})
    nettxt = []
    for t, d in by_type.items():
        m = d.get("mean", {})
        nettxt.append(f"{t}(n={d.get('count')}): 角色{m.get('n_nodes', 0):.1f}/密度"
                      f"{m.get('density', 0):.2f}/中心势{m.get('centralization', 0):.2f}/模块度{m.get('modularity', 0):.2f}")
    if nettxt:
        lines.append("【任务二·关系网络】按剧目类型均值：" + "；".join(nettxt) + "。")

    lines.append("【任务三·主题】LDA 提取 12 母题：" + "、".join(
        f"T{i}({lab})" for i, lab in enumerate(T3PAT.get("topic_labels", []))) + "。")

    arcs = T4PAT.get("arcs", [])
    lines.append("【任务四·叙事】KMeans 得 5 类典型弧线：" + "、".join(
        f"{a['label']}(n={a['size']})" for a in arcs) + "；全库高潮多置于后半。")

    finds = T5CORR.get("findings", [])[:6]
    if finds:
        lines.append("【任务五·四维协同】显著相关：" + "；".join(
            f"{f['a']}↔{f['b']} r={f['r']:+.2f}" for f in finds) + "。")
    return "\n".join(lines)


_GLOBAL_DIGEST = _global_digest()


def _play_digest(pid: str) -> str | None:
    """单部剧目在 行当/网络/主题/叙事/综合 四维的紧凑画像；不存在返回 None。

    只取指标与剧情梗概，绝不灌入全场对白（单剧可达数万字）。
    """
    rec = CORPUS.get(pid)
    if not rec:
        return None
    parts: list[str] = [f"《{rec['title']}》（{rec.get('collection', '')}，"
                        f"时期：{COLL_PERIOD.get(rec.get('collection'), '—')}）"]
    if rec.get("plot"):
        parts.append("剧情梗概：" + rec["plot"][:300])

    sub = PRED[PRED["play_id"] == pid].sort_values("n_lines", ascending=False)
    if len(sub):
        top = "、".join(f"{r['name']}({r['final_role']},{int(r['n_lines'])}句)"
                       for _, r in sub.head(8).iterrows())
        dist = sub["final_role"].value_counts().to_dict()
        parts.append(f"行当：主要角色 {top}；行当分布 {dist}。")

    nrow = NET[NET["play_id"] == pid]
    if len(nrow):
        r = nrow.iloc[0]
        parts.append(f"关系网络：类型「{r['drama_type']}」，{int(r['n_nodes'])} 节点/"
                     f"{int(r['n_edges'])} 关系，密度 {float(r['density']):.2f}，"
                     f"中心势 {float(r['centralization']):.2f}，模块度 {float(r['modularity']):.2f}，"
                     f"核心人物 {r.get('main_char', '—')}。")

    prow = PT[PT["play_id"] == pid]
    if len(prow):
        rr = prow.iloc[0]
        tv = sorted(((k, float(rr[f"t{k}"])) for k in range(TK)), key=lambda x: -x[1])[:3]
        labels = T3PAT.get("topic_labels", [])
        parts.append("主题：主导 " + "、".join(
            f"{labels[k] if k < len(labels) else k}({w:.2f})" for k, w in tv if w > 0.02) + "。")

    arow = NAR[NAR["play_id"] == pid]
    if len(arow):
        r = arow.iloc[0]
        arc = None if pd.isna(r["arc"]) else int(r["arc"])
        parts.append(f"叙事：弧线「{T4ARCLABEL.get(arc, '—')}」，高潮位置 "
                     f"{float(r['peak_pos']):.2f}，渐强指数 {float(r['rising_index']):+.2f}，"
                     f"高潮类型 {r.get('climax_type', '')}。")

    t5 = T5PLAYS[T5PLAYS["play_id"] == pid]
    if len(t5):
        arch = int(t5.iloc[0]["archetype"])
        parts.append(f"综合原型：第 {arch} 类。")
    return "\n".join(parts)


_MODULE_HINT = {
    "overview": "用户正在『总览』页，可侧重数据集整体概况与跨任务结论。",
    "task1": "用户正在『任务一·行当分类』模块，可侧重行当与唱念做打、台词特征、置信度。",
    "task2": "用户正在『任务二·角色关系网络』模块，可侧重网络规模/密度/中心势/模块度与剧目类型差异。",
    "task3": "用户正在『任务三·主题提取』模块，可侧重 12 母题构成、主题组合与跨类型/时期差异。",
    "task4": "用户正在『任务四·叙事结构』模块，可侧重戏剧强度曲线、高潮位置、文武分野与典型弧线。",
    "task5": "用户正在『任务五·综合关联』模块，可侧重关系×主题×叙事×行当四维协同与综合原型。",
}


def build_grounding_context(play_id: str | None, module: str | None) -> str:
    """拼装 system prompt：角色设定 + 全库事实 + 当前剧目画像 + 当前模块侧重。"""
    blocks = [
        "你是「戏韵·梨园谱系」京剧可视分析系统内置的 AI 分析助手。"
        "请基于下面系统已计算出的真实数据回答用户问题，用中文、口吻贴合戏曲与数据分析。",
        "重要约束：只依据所给数据作答；数据中没有的内容（如某个未提供的剧目、具体唱词原文、"
        "系统未计算的指标），要如实说明「系统数据中暂无」，绝不编造数字或情节。回答简洁、可读，"
        "适当用要点；引用指标时点明出处任务。",
        "=== 全库分析结论 ===\n" + _GLOBAL_DIGEST,
    ]
    if play_id:
        pd_txt = _play_digest(str(play_id))
        if pd_txt:
            blocks.append("=== 当前选中剧目（用户正在联动查看，问『这部剧』即指此剧）===\n" + pd_txt)
        else:
            blocks.append("（用户选中的剧目在系统数据中未找到，如被问及请说明。）")
    else:
        blocks.append("（用户当前未选中具体剧目；如问及某剧细节，可提示在左栏搜索框选中该剧后再问。）")
    hint = _MODULE_HINT.get(module or "")
    if hint:
        blocks.append("=== 当前界面 ===\n" + hint)
    return "\n\n".join(blocks)


# ---- 智能体数据上下文：把已加载的产物 + 接地助手打包给工具层/编排层复用 ----
import types as _types  # noqa: E402

_PERIOD_BY_PID = (dict(zip(NET["play_id"].astype(str), NET["period"]))
                  if {"play_id", "period"}.issubset(NET.columns) else {})

AGENT_CTX = _types.SimpleNamespace(
    CORPUS=CORPUS, PRED=PRED, NET=NET, PT=PT, NAR=NAR, T5PLAYS=T5PLAYS,
    METRICS=METRICS, TYPESTATS=TYPESTATS, T3PAT=T3PAT, T4PAT=T4PAT, T5CORR=T5CORR,
    COLL_PERIOD=COLL_PERIOD, T3LABELS=T3LABELS, T4ARCLABEL=T4ARCLABEL, TK=TK,
    PERIOD_BY_PID=_PERIOD_BY_PID,
    DRAMA_TYPES=TYPESTATS.get("types", []),
    PERIODS=TEMPORAL.get("period_order", []),
    play_digest=_play_digest,
    module_hint=lambda m: _MODULE_HINT.get(m or "", ""),
)


@app.get("/api/ai/models")
def ai_models():
    """AI 助手可选模型清单 + 推荐项 + 服务端是否已内置 Key。供前端「设置」面板渲染。"""
    return {
        "models": llm.MODELS,
        "recommended": llm.RECOMMENDED_MODEL,
        "server_has_key": llm.has_key(),
        "provider": "DeepSeek 原生 / ZenMux",
    }


class ChatRequest(BaseModel):
    messages: list[dict]
    play_id: str | None = None
    module: str | None = None
    api_key: str | None = None   # 前端「设置」里填写的 Key（免重启）
    model: str | None = None     # 前端选择的模型 id；为空则用服务端默认/推荐


def _sse(obj_or_text) -> str:
    """编码一条 SSE。dict → 整行 JSON（前端按 t 分流工具事件）；str → 文本块。
    文本块把换行/反斜杠转义，避免被 data: 行边界截断；前端解码还原。"""
    if isinstance(obj_or_text, dict):
        return "data: " + json.dumps(obj_or_text, ensure_ascii=False) + "\n\n"
    safe = obj_or_text.replace("\\", "\\\\").replace("\n", "\\n")
    return f"data: {safe}\n\n"


@app.post("/api/chat")
def chat(req: ChatRequest):
    """智能体数据接地流式对话（SSE）。

    事件两类：
      · 工具轨迹：`data: {"t":"tool"|"tool_result", ...}`（JSON，前端渲染检索轨迹卡）
      · 答案文本：`data: <token>`（与旧前端兼容）；末尾 `data: [DONE]`。
    """
    def gen():
        try:
            for ev in agent.run_agent(
                    req.messages, req.play_id, req.module, AGENT_CTX,
                    api_key=req.api_key, model=req.model,
                    build_grounding=build_grounding_context):
                t = ev.get("type")
                if t == "token":
                    yield _sse(ev["text"])
                elif t == "tool":
                    yield _sse({"t": "tool", "name": ev["name"], "args": ev.get("args", {})})
                elif t == "tool_result":
                    yield _sse({"t": "tool_result", "name": ev["name"],
                                "summary": ev.get("summary", "")})
        except Exception as exc:  # noqa: BLE001 — 任何失败都给前端可读反馈
            yield _sse(f"\n\n⚠️ 智能体执行出错：{type(exc).__name__}: {exc}")
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
