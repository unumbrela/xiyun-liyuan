"""智能体工具层 + 编排层测试（不打真实网络，mock llm 调用）。

运行（项目根目录）：
    conda activate llm && pytest backend/tests/test_agent.py -q
"""
from types import SimpleNamespace

import pytest

import backend.main as m
import agent
import agent_tools
import llm

CTX = m.AGENT_CTX


def _some_pids(n=2):
    return [str(p) for p in m.T5PLAYS["play_id"].astype(str).head(n)]


# ==================== 工具层 ====================
def test_search_plays_structure_and_sort():
    out = agent_tools.dispatch("search_plays",
                               {"drama_type": "公案戏", "sort": "中心势", "limit": 5}, CTX)
    assert "plays" in out and len(out["plays"]) <= 5
    assert out["sorted_by"] == "centralization"
    if len(out["plays"]) >= 2:
        cs = [p["centralization"] for p in out["plays"]]
        assert cs == sorted(cs, reverse=True)        # 降序排序生效
    for p in out["plays"]:
        assert {"play_id", "title", "drama_type", "centralization"} <= set(p)


def test_search_plays_limit_clamped():
    out = agent_tools.dispatch("search_plays", {"limit": 9999}, CTX)
    assert len(out["plays"]) <= 25


def test_get_play_found_and_missing():
    pid = _some_pids(1)[0]
    ok = agent_tools.dispatch("get_play", {"play_id": pid}, CTX)
    assert ok["found"] is True and ok["digest"]
    bad = agent_tools.dispatch("get_play", {"play_id": "zzz999"}, CTX)
    assert bad["found"] is False


def test_compare_plays():
    pids = _some_pids(2)
    out = agent_tools.dispatch("compare_plays", {"play_ids": pids}, CTX)
    assert len(out["compare"]) == 2
    out1 = agent_tools.dispatch("compare_plays", {"play_ids": pids[:1]}, CTX)
    assert "note" in out1                            # 少于 2 个给提示


@pytest.mark.parametrize("task", ["overview", "task1", "task2", "task3", "task4", "task5"])
def test_corpus_stat_all_tasks(task):
    out = agent_tools.dispatch("corpus_stat", {"task": task}, CTX)
    assert isinstance(out, dict) and "error" not in out


def test_topic_and_arc_and_corr():
    t = agent_tools.dispatch("topic_plays", {"topic_id": 0, "limit": 3}, CTX)
    assert len(t["plays"]) <= 3 and "topic" in t
    c = agent_tools.dispatch("corr_findings", {"limit": 4}, CTX)
    assert len(c["findings"]) <= 4


def test_dispatch_unknown_and_bad_args():
    assert "error" in agent_tools.dispatch("nope", {}, CTX)
    assert "error" in agent_tools.dispatch("get_play", {"wrong": 1}, CTX)  # 缺 play_id


# ==================== 编排层（mock llm） ====================
def _toolcall(name, args_json, cid="c1"):
    fn = SimpleNamespace(name=name, arguments=args_json)
    return SimpleNamespace(id=cid, function=fn)


def test_run_agent_tool_loop(monkeypatch):
    """第一回合发起工具调用，第二回合给出最终答案。"""
    calls = {"n": 0}

    def fake_chat_once(system, conv, *, tools=None, api_key=None, model=None):
        calls["n"] += 1
        if calls["n"] == 1:
            msg = SimpleNamespace(content="",
                                  tool_calls=[_toolcall("corpus_stat", '{"task":"task2"}')])
            return msg, None
        return SimpleNamespace(content="历史戏网络更大。", tool_calls=None), None

    monkeypatch.setattr(llm, "chat_once", fake_chat_once)
    monkeypatch.setattr(llm, "supports_tools", lambda model: True)

    events = list(agent.run_agent(
        [{"role": "user", "content": "各类型网络差异？"}], None, "task2", CTX,
        build_grounding=m.build_grounding_context))
    types = [e["type"] for e in events]
    assert "tool" in types and "tool_result" in types and "token" in types
    tool_ev = next(e for e in events if e["type"] == "tool")
    assert tool_ev["name"] == "corpus_stat"
    answer = "".join(e["text"] for e in events if e["type"] == "token")
    assert "历史戏" in answer


def test_run_agent_degrade_when_no_tools(monkeypatch):
    """模型不支持工具 → 走静态接地单轮流式，不应产生 tool 事件。"""
    monkeypatch.setattr(llm, "supports_tools", lambda model: False)
    monkeypatch.setattr(llm, "stream_chat",
                        lambda system, msgs, **kw: iter(["降级", "作答"]))
    events = list(agent.run_agent(
        [{"role": "user", "content": "你好"}], None, "overview", CTX,
        build_grounding=m.build_grounding_context, model="deepseek-reasoner"))
    assert all(e["type"] == "token" for e in events)
    assert "".join(e["text"] for e in events) == "降级作答"


# ==================== 接口冒烟 ====================
def test_ai_models_exposes_supports_tools():
    from fastapi.testclient import TestClient
    c = TestClient(m.app, raise_server_exceptions=False)
    body = c.get("/api/ai/models").json()
    assert body["recommended"] == "deepseek-chat"
    assert any(mm.get("supports_tools") for mm in body["models"])
    assert all("provider" in mm for mm in body["models"])
