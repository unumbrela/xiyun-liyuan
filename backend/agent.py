"""智能体编排：工具调用循环（Agentic RAG）。

把用户问题交给大模型，模型自主决定调用 backend/agent_tools.py 里的查询工具 →
后端查 data/processed 实时数据 → 结果回灌 → 多轮迭代（≤MAX_ROUNDS）→ 作答。

run_agent 是生成器，yield **分类型事件**，由 main.py 编码为 SSE：
  {"type": "tool",        "name": str, "args": dict}     —— 模型发起一次工具调用
  {"type": "tool_result", "name": str, "summary": str}   —— 工具返回（紧凑摘要）
  {"type": "token",       "text": str}                    —— 最终答案文本块

降级：模型不支持 function calling（如 deepseek-reasoner）→ 直接走 build_grounding
（静态 digest 注入）+ stream_chat 单轮，行为与升级前一致。
"""
from __future__ import annotations

import json
from typing import Callable, Iterator

import agent_tools
import llm

MAX_ROUNDS = 4           # 工具调用最多迭代轮数（含最后强制作答前）
_ANSWER_CHUNK = 24       # 非流式最终答案的切片大小，便于前端逐块渲染


def _persona(module_hint: str, selected_note: str) -> str:
    base = (
        "你是「戏韵·梨园谱系」京剧可视分析系统内置的 AI 分析助手，一个会查数据的智能体。"
        "你不能凭空作答：回答前请调用工具检索系统已计算出的真实数据，再据此作答。\n"
        "可用工具：search_plays(检索剧目)、get_play(单剧画像)、compare_plays(对比)、"
        "corpus_stat(任务级全库结论)、topic_plays(主题代表剧)、arc_plays(弧线代表剧)、"
        "corr_findings(四维相关)。\n"
        "原则：① 只依据工具返回的数据下结论，绝不编造剧名、数字或情节；数据中没有的就说"
        "「系统数据中暂无」。② 引用指标时点明出处任务（如『任务二·中心势』）。③ 回答用中文、"
        "简洁可读，适当用要点，口吻贴合戏曲与数据分析。④ 一次可并行调用多个工具；信息足够即作答，"
        "不必反复检索。"
    )
    if module_hint:
        base += "\n当前界面：" + module_hint
    if selected_note:
        base += "\n" + selected_note
    return base


def _selected_note(ctx, play_id: str | None) -> str:
    if not play_id:
        return "用户当前未选中具体剧目。"
    rec = ctx.CORPUS.get(str(play_id))
    title = rec.get("title", "") if rec else ""
    return (f"用户正在联动查看剧目 play_id={play_id}《{title}》；问『这部剧/本剧』即指它，"
            f"需要其指标请调用 get_play(play_id=\"{play_id}\")。")


def _summarize_result(name: str, result: dict) -> str:
    """把工具返回压成一句给前端轨迹卡显示（不外泄完整 JSON）。"""
    if not isinstance(result, dict):
        return "完成"
    if "error" in result:
        return "⚠ " + str(result["error"])
    if name == "search_plays":
        n = len(result.get("plays", []))
        return f"命中 {result.get('total', n)} 部，返回前 {n} 部（按{result.get('sorted_by', '')}）"
    if name == "get_play":
        m = result.get("metrics", {})
        return f"《{m.get('title', result.get('play_id', ''))}》画像" if result.get("found") else "未找到"
    if name == "compare_plays":
        return f"对比 {len(result.get('compare', []))} 部"
    if name == "corpus_stat":
        return "全库结论"
    if name in ("topic_plays", "arc_plays"):
        return f"{result.get('topic', result.get('arc', ''))} · {len(result.get('plays', []))} 部"
    if name == "corr_findings":
        return f"{len(result.get('findings', []))} 条显著相关"
    return "完成"


def _assistant_toolcall_msg(msg) -> dict:
    """把模型返回的 tool_calls 消息序列化回 conversation（供下一轮回灌）。"""
    return {
        "role": "assistant",
        "content": msg.content or "",
        "tool_calls": [
            {"id": tc.id, "type": "function",
             "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in (msg.tool_calls or [])
        ],
    }


def _chunks(text: str, size: int = _ANSWER_CHUNK) -> Iterator[str]:
    for i in range(0, len(text or ""), size):
        yield text[i:i + size]


def run_agent(messages: list[dict], play_id: str | None, module: str | None,
              ctx, *, api_key: str | None = None, model: str | None = None,
              build_grounding: Callable[[str | None, str | None], str]) -> Iterator[dict]:
    """主入口。build_grounding 为 main.py 的静态接地函数（降级路径复用）。"""
    history = [m for m in messages
              if m.get("role") in ("user", "assistant") and m.get("content")][-12:]

    # —— 降级：模型不支持工具 → 静态 digest 注入 + 单轮流式 ——
    if not llm.supports_tools(model):
        system = build_grounding(play_id, module)
        for piece in llm.stream_chat(system, history, api_key=api_key, model=model):
            yield {"type": "token", "text": piece}
        return

    schemas = agent_tools.build_schemas(ctx.DRAMA_TYPES, ctx.PERIODS, ctx.TK)
    system = _persona(ctx.module_hint(module), _selected_note(ctx, play_id))
    conv: list[dict] = list(history)

    for _ in range(MAX_ROUNDS):
        msg, err = llm.chat_once(system, conv, tools=schemas,
                                 api_key=api_key, model=model)
        if err:
            yield {"type": "token", "text": err}
            return
        tcs = msg.tool_calls or []
        if not tcs:                                   # 模型已给出最终答案
            for ch in _chunks(msg.content or "（未生成内容）"):
                yield {"type": "token", "text": ch}
            return

        conv.append(_assistant_toolcall_msg(msg))
        for tc in tcs:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            yield {"type": "tool", "name": name, "args": args}
            result = agent_tools.dispatch(name, args, ctx)
            yield {"type": "tool_result", "name": name,
                   "summary": _summarize_result(name, result)}
            conv.append({"role": "tool", "tool_call_id": tc.id,
                         "content": json.dumps(result, ensure_ascii=False)})

    # —— 轮数耗尽：禁用工具，强制基于已检索数据作答 ——
    msg, err = llm.chat_once(system, conv, tools=None, api_key=api_key, model=model)
    if err:
        yield {"type": "token", "text": err}
        return
    for ch in _chunks(msg.content or "（已检索足够数据，但未生成结论。）"):
        yield {"type": "token", "text": ch}
