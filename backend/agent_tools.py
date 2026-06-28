"""智能体工具层：把京剧分析产物暴露为「可被大模型调用的查询函数」。

每个工具都是纯函数，直接读取由 backend/main.py 启动时加载的内存对象（通过 `ctx` 传入，
避免与 main 形成循环 import）。返回值是**紧凑 JSON**（限定条数、保留 3 位小数），
既省 token 又便于模型消化。所有数字均来自 data/processed/* 预计算产物，确定可复现。

对外导出：
  · TOOL_SCHEMAS   —— OpenAI function-calling 规格清单（交给模型）
  · dispatch(name, args, ctx) -> dict —— 按名分发执行（含未知工具/参数错误兜底）

ctx 需提供的属性（由 main.py 组装）：
  CORPUS, PRED, NET, PT, NAR, T5PLAYS, COLL_PERIOD, T3LABELS, T4ARCLABEL, TK,
  METRICS, TYPESTATS, T3PAT, T4PAT, T5CORR, DRAMA_TYPES, PERIODS, play_digest(pid)
"""
from __future__ import annotations

from typing import Any

import pandas as pd

_ROLES = ["生", "旦", "净", "丑"]

# 友好排序名 → T5PLAYS 列名。模型可用中文或英文列名指定排序。
_SORT_MAP = {
    "n_nodes": "n_nodes", "角色数": "n_nodes", "网络规模": "n_nodes",
    "density": "density", "密度": "density",
    "centralization": "centralization", "中心势": "centralization",
    "modularity": "modularity", "模块度": "modularity",
    "rising_index": "rising_index", "渐强": "rising_index", "渐强指数": "rising_index",
    "peak_pos": "peak_pos", "高潮位置": "peak_pos",
    "action_total": "action_total", "做打量": "action_total",
    "sing_ratio": "sing_ratio", "唱腔占比": "sing_ratio",
}


def _round(v: Any, n: int = 3):
    try:
        if pd.isna(v):
            return None
        return round(float(v), n)
    except (TypeError, ValueError):
        return v


def _topic_label(ctx, k: int) -> str:
    labs = ctx.T3LABELS
    return f"T{k}（{labs[k]}）" if 0 <= k < len(labs) else f"T{k}"


def _play_brief(ctx, row) -> dict:
    """T5PLAYS 一行 → 紧凑画像（用于检索结果列表）。"""
    period = ctx.PERIOD_BY_PID.get(str(row["play_id"]), "—")
    dom = int(row["dominant"])
    arc = None if pd.isna(row["arc"]) else int(row["arc"])
    role_ratios = {r: _round(row[r], 3) for r in _ROLES}
    lead_role = max(_ROLES, key=lambda r: row[r] if not pd.isna(row[r]) else -1)
    return {
        "play_id": str(row["play_id"]), "title": row["title"],
        "drama_type": row["drama_type"], "period": period,
        "n_nodes": int(row["n_nodes"]), "density": _round(row["density"]),
        "centralization": _round(row["centralization"]),
        "modularity": _round(row["modularity"]),
        "dominant_topic": _topic_label(ctx, dom),
        "arc": ctx.T4ARCLABEL.get(arc, "—"),
        "archetype": int(row["archetype"]),
        "lead_role": lead_role, "role_ratios": role_ratios,
    }


# ==================== 工具实现 ====================
def search_plays(ctx, *, name: str | None = None, drama_type: str | None = None,
                 period: str | None = None, role: str | None = None,
                 topic_id: int | None = None, archetype: int | None = None,
                 sort: str | None = None, order: str = "desc",
                 limit: int = 10) -> dict:
    """按多条件检索剧目并排序。空条件即全库排序。"""
    df = ctx.T5PLAYS
    if not len(df):
        return {"total": 0, "plays": [], "note": "系统数据中暂无剧目产物。"}
    g = df
    if name:
        g = g[g["title"].astype(str).str.contains(name, na=False)]
    if drama_type:
        g = g[g["drama_type"] == drama_type]
    if period:
        pids = {p for p, per in ctx.PERIOD_BY_PID.items() if per == period}
        g = g[g["play_id"].astype(str).isin(pids)]
    if role in _ROLES:
        g = g[g[_ROLES].idxmax(axis=1) == role]
    if topic_id is not None and 0 <= int(topic_id) < ctx.TK:
        g = g[g["dominant"] == int(topic_id)]
    if archetype is not None:
        g = g[g["archetype"] == int(archetype)]
    total = int(len(g))
    col = _SORT_MAP.get(sort or "", "n_nodes")
    g = g.sort_values(col, ascending=(order == "asc"))
    plays = [_play_brief(ctx, r) for _, r in g.head(max(1, min(int(limit), 25))).iterrows()]
    return {"total": total, "sorted_by": col, "order": order, "plays": plays}


def get_play(ctx, *, play_id: str) -> dict:
    """单部剧目的四维结构化画像 + 文字梗概。"""
    pid = str(play_id)
    digest = ctx.play_digest(pid)
    if digest is None:
        return {"found": False, "note": f"剧目 {pid} 在系统数据中未找到。"}
    out: dict = {"found": True, "play_id": pid, "digest": digest}
    row = ctx.T5PLAYS[ctx.T5PLAYS["play_id"].astype(str) == pid]
    if len(row):
        out["metrics"] = _play_brief(ctx, row.iloc[0])
    return out


def compare_plays(ctx, *, play_ids: list[str]) -> dict:
    """2~4 部剧目的关键指标并排对比。"""
    ids = [str(p) for p in (play_ids or [])][:4]
    if len(ids) < 2:
        return {"note": "请至少提供 2 个 play_id 进行对比。"}
    rows = []
    for pid in ids:
        r = ctx.T5PLAYS[ctx.T5PLAYS["play_id"].astype(str) == pid]
        if len(r):
            rows.append(_play_brief(ctx, r.iloc[0]))
        else:
            rows.append({"play_id": pid, "note": "未找到"})
    return {"compare": rows}


def corpus_stat(ctx, *, task: str) -> dict:
    """取某任务的全库结论摘要。task ∈ overview/task1..task5。"""
    t = (task or "overview").lower().replace("任务", "task")
    if t in ("overview", "全库", "总览"):
        return {
            "n_plays": len(ctx.CORPUS),
            "n_roles": int(len(ctx.PRED)),
            "drama_types": ctx.DRAMA_TYPES,
            "periods": ctx.PERIODS,
            "tasks": "一行当分类·二关系网络·三主题·四叙事·五四维协同",
        }
    if t == "task1":
        icv = ctx.METRICS.get("instance_cv", {})
        return {
            "macro_f1_5class": _round(icv.get("macro_f1", ctx.METRICS.get("macro_f1")), 3),
            "macro_f1_official_4class": _round(icv.get("official_macro_f1"), 3),
            "n_inferred_instances": ctx.METRICS.get("n_inferred_instances", 0),
            "roles": _ROLES + ["杂"],
            "note": "逻辑回归 5 折交叉验证；唱念做打/台词特征详见 get_play 的行当画像。",
        }
    if t == "task2":
        by = ctx.TYPESTATS.get("by_type", {})
        out = {}
        for ty, d in by.items():
            m = d.get("mean", {})
            out[ty] = {"count": d.get("count"),
                       "n_nodes": _round(m.get("n_nodes"), 1),
                       "density": _round(m.get("density"), 3),
                       "centralization": _round(m.get("centralization"), 3),
                       "modularity": _round(m.get("modularity"), 3)}
        return {"by_drama_type_mean": out}
    if t == "task3":
        return {"K": ctx.TK,
                "topics": [_topic_label(ctx, i) for i in range(len(ctx.T3LABELS))]}
    if t == "task4":
        arcs = ctx.T4PAT.get("arcs", [])
        return {"arcs": [{"id": a["id"], "label": a["label"], "size": a.get("size")}
                         for a in arcs],
                "note": "全库高潮多置于后半。"}
    if t == "task5":
        return corr_findings(ctx, limit=8)
    return {"note": f"未知 task「{task}」，可选 overview/task1..task5。"}


def topic_plays(ctx, *, topic_id: int, drama_type: str | None = None,
                limit: int = 8) -> dict:
    """某主题母题下权重最高的代表剧目。"""
    k = int(topic_id)
    if not (0 <= k < ctx.TK):
        return {"note": f"topic_id 越界，应在 0~{ctx.TK - 1}。"}
    col = f"t{k}"
    df = ctx.PT
    if drama_type:
        df = df[df["drama_type"] == drama_type]
    df = df.sort_values(col, ascending=False).head(max(1, min(int(limit), 20)))
    return {"topic": _topic_label(ctx, k),
            "plays": [{"play_id": str(r["play_id"]), "title": r["title"],
                       "drama_type": r["drama_type"], "weight": _round(r[col], 3)}
                      for _, r in df.iterrows()]}


def arc_plays(ctx, *, arc_id: int, limit: int = 8) -> dict:
    """某叙事弧线类别下的代表剧目（按渐强指数排序）。"""
    a = int(arc_id)
    df = ctx.NAR[ctx.NAR["arc"] == a].sort_values("rising_index", ascending=False)
    df = df.head(max(1, min(int(limit), 20)))
    return {"arc": ctx.T4ARCLABEL.get(a, str(a)),
            "plays": [{"play_id": str(r["play_id"]), "title": r["title"],
                       "drama_type": r["drama_type"],
                       "peak_pos": _round(r["peak_pos"]),
                       "rising_index": _round(r["rising_index"]),
                       "climax_type": r.get("climax_type", "")}
                      for _, r in df.iterrows()]}


def corr_findings(ctx, *, limit: int = 8) -> dict:
    """任务五：四维之间的显著相关清单（含偏相关/控制变量）。"""
    finds = ctx.T5CORR.get("findings", [])[:max(1, min(int(limit), 20))]
    return {"findings": [
        {"a": f"{f['a']}({f.get('a_dim', '')})", "b": f"{f['b']}({f.get('b_dim', '')})",
         "r": _round(f.get("r"), 3), "r_partial": _round(f.get("r_partial"), 3),
         "controls": f.get("controls", []), "robust": f.get("robust"),
         "n": f.get("n")} for f in finds]}


# ==================== 分发与 schema ====================
_TOOLS = {
    "search_plays": search_plays, "get_play": get_play,
    "compare_plays": compare_plays, "corpus_stat": corpus_stat,
    "topic_plays": topic_plays, "arc_plays": arc_plays,
    "corr_findings": corr_findings,
}


def dispatch(name: str, args: dict, ctx) -> dict:
    """按名执行工具；未知工具或参数异常都返回可读的兜底 dict（绝不抛出）。"""
    fn = _TOOLS.get(name)
    if fn is None:
        return {"error": f"未知工具「{name}」。可用：{', '.join(_TOOLS)}"}
    try:
        return fn(ctx, **(args or {}))
    except TypeError as e:
        return {"error": f"工具「{name}」参数有误：{e}"}
    except Exception as e:  # noqa: BLE001
        return {"error": f"工具「{name}」执行出错：{type(e).__name__}: {e}"}


def build_schemas(drama_types: list[str], periods: list[str], tk: int) -> list[dict]:
    """生成 OpenAI function-calling 规格（枚举随产物动态注入）。"""
    dt = {"type": "string", "enum": drama_types} if drama_types else {"type": "string"}
    pe = {"type": "string", "enum": periods} if periods else {"type": "string"}
    topic_max = max(tk - 1, 0)
    return [
        {"type": "function", "function": {
            "name": "search_plays",
            "description": "按剧名/类型/时期/主导行当/主导主题/综合原型检索京剧剧目，并按某网络或叙事指标排序。问『哪些X戏最…』『有哪些关于…的剧』时用。",
            "parameters": {"type": "object", "properties": {
                "name": {"type": "string", "description": "剧名包含的关键字"},
                "drama_type": {**dt, "description": "剧目类型"},
                "period": {**pe, "description": "年代时期"},
                "role": {"type": "string", "enum": _ROLES, "description": "主导行当（生/旦/净/丑）"},
                "topic_id": {"type": "integer", "description": f"主导主题母题编号 0~{topic_max}"},
                "archetype": {"type": "integer", "description": "综合原型聚类编号"},
                "sort": {"type": "string", "description": "排序指标：中心势/密度/模块度/网络规模/渐强/做打量/唱腔占比 等"},
                "order": {"type": "string", "enum": ["desc", "asc"], "description": "排序方向，默认 desc"},
                "limit": {"type": "integer", "description": "返回条数，默认 10，上限 25"},
            }},
        }},
        {"type": "function", "function": {
            "name": "get_play",
            "description": "取单部剧目在行当/关系网络/主题/叙事/综合原型五方面的结构化画像与剧情梗概。已知 play_id 或用户问『这部剧』时用。",
            "parameters": {"type": "object", "properties": {
                "play_id": {"type": "string", "description": "剧目 id"},
            }, "required": ["play_id"]},
        }},
        {"type": "function", "function": {
            "name": "compare_plays",
            "description": "并排对比 2~4 部剧目的关键指标（网络规模/密度/中心势/模块度/主导主题/叙事弧线/行当构成）。",
            "parameters": {"type": "object", "properties": {
                "play_ids": {"type": "array", "items": {"type": "string"},
                             "description": "2~4 个剧目 id"},
            }, "required": ["play_ids"]},
        }},
        {"type": "function", "function": {
            "name": "corpus_stat",
            "description": "取某一分析任务的全库结论摘要。task 取 overview 或 task1~task5。问宏观规律/某任务整体结论时用。",
            "parameters": {"type": "object", "properties": {
                "task": {"type": "string",
                         "enum": ["overview", "task1", "task2", "task3", "task4", "task5"]},
            }, "required": ["task"]},
        }},
        {"type": "function", "function": {
            "name": "topic_plays",
            "description": "列出某个主题母题下权重最高的代表剧目，可限定剧目类型。",
            "parameters": {"type": "object", "properties": {
                "topic_id": {"type": "integer", "description": f"主题母题编号 0~{topic_max}"},
                "drama_type": {**dt, "description": "可选：限定剧目类型"},
                "limit": {"type": "integer", "description": "返回条数，默认 8"},
            }, "required": ["topic_id"]},
        }},
        {"type": "function", "function": {
            "name": "arc_plays",
            "description": "列出某种叙事弧线类别下的代表剧目（按渐强指数排序）。",
            "parameters": {"type": "object", "properties": {
                "arc_id": {"type": "integer", "description": "叙事弧线类别编号"},
                "limit": {"type": "integer", "description": "返回条数，默认 8"},
            }, "required": ["arc_id"]},
        }},
        {"type": "function", "function": {
            "name": "corr_findings",
            "description": "任务五：关系×主题×叙事×行当四维之间的显著相关清单（含偏相关与控制变量、稳健性）。",
            "parameters": {"type": "object", "properties": {
                "limit": {"type": "integer", "description": "返回条数，默认 8"},
            }},
        }},
    ]
