"""大语言模型封装：Provider 适配 + 两种调用形态（流式文本 / 工具调用一回合）。

本模块只负责「把 system + messages（+ 可选 tools）交给某个大模型 → 拿回结果」，
不碰任何业务数据。业务接地由 backend/agent.py（工具循环）与 backend/main.py
（静态 digest 降级路径）负责。

支持两个 Provider，二者皆 OpenAI 兼容：
  · **deepseek**（原生，默认/推荐）：base=https://api.deepseek.com
      - deepseek-chat：旗舰对话，支持 function calling（工具循环走它）
      - deepseek-reasoner：深度推理，不支持工具 → Agent 自动降级为静态注入
  · **zenmux**（聚合平台，可选多模型来源）：base=https://zenmux.ai/api/v1
      一把 Key 通调 GPT / Claude / Gemini / Qwen 等。

模型 id 形态即 Provider 路由依据：含 "/"（如 openai/gpt-5.4）走 ZenMux；
否则（如 deepseek-chat）走 DeepSeek 原生。

配置优先级（高 → 低）：
  1) 前端每次请求显式传入的 api_key / model（用户在 AI 面板「设置」里填写，免重启）
  2) 环境变量：DeepSeek → DEEPSEEK_API_KEY；ZenMux → ZENMUX_API_KEY
  3) 内置默认：模型 = RECOMMENDED_MODEL（deepseek-chat），base 取对应 Provider 默认

为方便 Web 调试，启动时若存在 backend/.env 则极简解析注入（不覆盖已有环境变量）。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

_ENV_FILE = Path(__file__).resolve().parent / ".env"


def _load_dotenv() -> None:
    """极简 .env 读取（stdlib，无新依赖）。仅在文件存在时生效，不覆盖已有环境变量。"""
    if not _ENV_FILE.exists():
        return
    try:
        for raw in _ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError:
        pass


_load_dotenv()

# ==================== Provider 注册表 ====================
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
ZENMUX_BASE_URL = "https://zenmux.ai/api/v1"
RECOMMENDED_MODEL = "deepseek-chat"   # 原生 DeepSeek 旗舰对话，支持工具调用


def provider_of(model: str | None) -> str:
    """由模型 id 形态判定来源：含 '/' → zenmux；否则 → deepseek 原生。"""
    return "zenmux" if (model and "/" in model) else "deepseek"


# 精选模型清单：供前端「设置」下拉选择。price 为「输入/输出」美元每百万 token。
# supports_tools=False 的模型（如 reasoner）会让 Agent 自动降级为静态注入单轮。
MODELS: list[dict] = [
    # —— DeepSeek 原生（默认推荐，开箱即用）——
    {"id": "deepseek-chat", "name": "DeepSeek Chat", "provider": "DeepSeek 原生",
     "hint": "中文最佳性价比 · 支持工具调用（智能体）", "price": "$0.27 / $1.10",
     "recommended": True, "supports_tools": True},
    {"id": "deepseek-reasoner", "name": "DeepSeek Reasoner", "provider": "DeepSeek 原生",
     "hint": "深度推理（思维链）· 不支持工具，自动降级", "price": "$0.55 / $2.19",
     "supports_tools": False},
    # —— ZenMux 聚合（可选多模型来源）——
    {"id": "deepseek/deepseek-v3.2", "name": "DeepSeek V3.2", "provider": "ZenMux",
     "hint": "ZenMux 转发 · 旗舰对话", "price": "$0.29 / $0.44", "supports_tools": True},
    {"id": "openai/gpt-5.4", "name": "GPT-5.4", "provider": "ZenMux",
     "hint": "GPT 旗舰 · 综合能力强", "price": "$2.5 / $15", "supports_tools": True},
    {"id": "openai/gpt-5.4-mini", "name": "GPT-5.4 mini", "provider": "ZenMux",
     "hint": "GPT 高性价比 · 速度快", "price": "$0.75 / $4.5", "supports_tools": True},
    {"id": "anthropic/claude-sonnet-4.6", "name": "Claude Sonnet 4.6", "provider": "ZenMux",
     "hint": "均衡旗舰 · 中文与长文优秀", "price": "$3 / $15", "supports_tools": True},
    {"id": "anthropic/claude-opus-4.8", "name": "Claude Opus 4.8", "provider": "ZenMux",
     "hint": "Claude 最强 · 深度分析", "price": "$5 / $25", "supports_tools": True},
    {"id": "google/gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "ZenMux",
     "hint": "极速低价 · 1M 上下文", "price": "$0.3 / $2.5", "supports_tools": True},
    {"id": "qwen/qwen3.6-plus", "name": "通义千问 3.6 Plus", "provider": "ZenMux",
     "hint": "中文原生 · 1M 上下文", "price": "$0.5 / $3", "supports_tools": True},
    {"id": "moonshotai/kimi-k2.6", "name": "Kimi K2.6", "provider": "ZenMux",
     "hint": "月之暗面 · 长文与中文强", "price": "$0.95 / $4", "supports_tools": True},
]

_MODEL_INDEX = {m["id"]: m for m in MODELS}


def supports_tools(model: str | None) -> bool:
    """该模型是否支持 function calling（未知模型保守按支持，失败时 Agent 仍会兜底）。"""
    mdl = _resolve_model(model)
    info = _MODEL_INDEX.get(mdl)
    if info is not None:
        return bool(info.get("supports_tools", True))
    # 未登记的模型：reasoner 类一律视为不支持工具，其余默认支持。
    return "reasoner" not in mdl.lower()


def _resolve_model(model: str | None) -> str:
    return (model or os.environ.get("DEEPSEEK_MODEL")
            or os.environ.get("ZENMUX_MODEL") or RECOMMENDED_MODEL).strip()


def _resolve_key(api_key: str | None, provider: str) -> str | None:
    """请求显式 Key 优先；否则按 Provider 取对应环境变量，最后互为兜底。"""
    if api_key and api_key.strip():
        return api_key.strip()
    if provider == "zenmux":
        env = os.environ.get("ZENMUX_API_KEY") or os.environ.get("DEEPSEEK_API_KEY")
    else:
        env = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("ZENMUX_API_KEY")
    return (env or "").strip() or None


def _resolve_base_url(provider: str) -> str:
    if provider == "zenmux":
        return (os.environ.get("ZENMUX_BASE_URL") or ZENMUX_BASE_URL).strip()
    return (os.environ.get("DEEPSEEK_BASE_URL") or DEEPSEEK_BASE_URL).strip()


def has_key() -> bool:
    """服务端环境是否已配置任一 Key（前端未填时的兜底来源）。"""
    return bool(os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("ZENMUX_API_KEY"))


def _client(api_key: str | None, model: str | None):
    """构造 OpenAI 兼容客户端（按模型路由到对应 Provider）。失败返回 (None, 错误文案)。"""
    mdl = _resolve_model(model)
    prov = provider_of(mdl)
    key = _resolve_key(api_key, prov)
    if not key:
        where = "DeepSeek（api.deepseek.com）" if prov == "deepseek" else "ZenMux"
        return None, mdl, (
            f"⚠️ 未配置 {where} 的 API Key。请点击右上角「设置」填入 Key，"
            f"或在 backend/.env 配置后重启后端。")
    from openai import OpenAI
    return OpenAI(api_key=key, base_url=_resolve_base_url(prov), timeout=60.0), mdl, None


def _trim_history(messages: list[dict]) -> list[dict]:
    """防御性截断对话历史，避免超长上下文（保留最近 12 轮 user/assistant）。"""
    history = [m for m in messages
              if m.get("role") in ("user", "assistant") and m.get("content")]
    return history[-12:]


def chat_once(system_prompt: str, messages: list[dict], *,
              tools: list | None = None, api_key: str | None = None,
              model: str | None = None):
    """单回合调用（非流式），供 Agent 工具循环使用。

    返回 (assistant_message, error_text)：
      · assistant_message: 原始 message 对象（含 .content 与 .tool_calls）；出错为 None。
      · error_text: 出错时的中文提示；正常为 None。
    messages 里可包含 role 为 "tool"/"system" 的回灌消息（已由调用方组织好）。
    """
    client, mdl, err = _client(api_key, model)
    if err:
        return None, err
    payload = [{"role": "system", "content": system_prompt}, *messages]
    try:
        kwargs = dict(model=mdl, messages=payload, temperature=0.4, max_tokens=1200)
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        resp = client.chat.completions.create(**kwargs)
        return resp.choices[0].message, None
    except Exception as exc:  # noqa: BLE001
        return None, f"\n\n⚠️ 调用大模型出错（模型 {mdl}）：{type(exc).__name__}: {exc}"


def stream_chat(system_prompt: str, messages: list[dict], *,
                api_key: str | None = None, model: str | None = None) -> Iterator[str]:
    """把 system_prompt + 对话历史交给大模型，逐块 yield 文本（最终作答 / 降级路径）。

    任何异常都被吞掉并以中文提示收尾，保证前端永远拿到可读文本而非 500。
    """
    client, mdl, err = _client(api_key, model)
    if err:
        yield err
        return
    payload = [{"role": "system", "content": system_prompt}, *_trim_history(messages)]
    try:
        stream = client.chat.completions.create(
            model=mdl, messages=payload, stream=True,
            temperature=0.6, max_tokens=1200)
        for chunk in stream:
            if not chunk.choices:
                continue
            piece = getattr(chunk.choices[0].delta, "content", None)
            if piece:
                yield piece
    except Exception as exc:  # noqa: BLE001 — 任何失败都要给前端可读反馈
        yield f"\n\n⚠️ 调用大模型出错（模型 {mdl}）：{type(exc).__name__}: {exc}"


def stream_messages(system_prompt: str, messages: list[dict], *,
                    api_key: str | None = None, model: str | None = None) -> Iterator[str]:
    """与 stream_chat 同，但直接透传 messages（可含 tool 回灌），不做 user/assistant 过滤。

    供 Agent 在「最后一回合让模型基于工具结果作答」时复用。
    """
    client, mdl, err = _client(api_key, model)
    if err:
        yield err
        return
    payload = [{"role": "system", "content": system_prompt}, *messages]
    try:
        stream = client.chat.completions.create(
            model=mdl, messages=payload, stream=True,
            temperature=0.5, max_tokens=1200)
        for chunk in stream:
            if not chunk.choices:
                continue
            piece = getattr(chunk.choices[0].delta, "content", None)
            if piece:
                yield piece
    except Exception as exc:  # noqa: BLE001
        yield f"\n\n⚠️ 调用大模型出错（模型 {mdl}）：{type(exc).__name__}: {exc}"
