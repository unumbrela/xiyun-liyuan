"""后端 API 冒烟测试：覆盖各端点 200 + 关键字段 + 404/503/限流路径。

运行（项目根目录）：
    conda activate llm && pytest backend/tests -q
"""
import pytest
from fastapi.testclient import TestClient

import backend.main as m

client = TestClient(m.app, raise_server_exceptions=False)
PID = "04001001"  # 空城计（基准剧，必然存在）


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "missing" in body and "degraded" in body


@pytest.mark.parametrize("url", [
    "/api/task1/metrics", "/api/task1/patterns", "/api/task1/temporal",
    "/api/task1/distribution", "/api/task1/subroles", "/api/meta",
    "/api/task2/typestats", "/api/task2/scatter",
    "/api/task3/topics", "/api/task3/patterns",
    "/api/task4/patterns", "/api/task5/corr", "/api/task5/sankey",
    "/api/task5/archetypes",
])
def test_module_endpoints_200(url):
    assert client.get(url).status_code == 200


def test_method_deepening_fields_present():
    """P1/P2 方法深化新增字段应随端点透出。"""
    metrics = client.get("/api/task1/metrics").json()
    assert metrics["baselines"] and "calibration" in metrics      # M1
    temporal = client.get("/api/task1/temporal").json()
    assert "cramers_v" in temporal["significance"]                # M3
    typestats = client.get("/api/task2/typestats").json()
    hist = typestats["by_type"]["历史戏"]["mean"]
    assert "modularity_z" in hist                                 # A3
    rs = typestats["role_structure"]["生"]                         # 本轮：结构角色
    assert {"mean_degree_centrality", "mean_betweenness", "bridge_share"} <= set(rs)
    assert "全库" in typestats["assortativity_by_type"]            # 本轮：阵营同质度
    ts2 = typestats["type_significance"]                          # 类型间显著性
    assert ts2["pairs"]["模块度"] and "significant" in ts2["pairs"]["模块度"][0]
    assert typestats["period_evolution"]["by_period"]["当代"]     # P2/P3：时期演化
    topics = client.get("/api/task3/topics").json()
    assert len(topics["k_selection"]) > 0                         # A1
    t0 = topics["topics"][0]                                      # 轮三：主题质量字段
    assert {"coherence", "x", "y", "representative"} <= set(t0)
    assert topics["stability"]["per_topic"]                       # P2/P3：主题稳健性
    assert t0["representative"]                                   # 代表剧目非空
    t4 = client.get("/api/task4/patterns").json()
    assert t4["weight_sensitivity"] and t4["k_selection"]         # M2
    assert t4["type_significance"]["pairs"]["做打量"]              # 本轮：节奏显著性
    a0 = t4["arcs"][0]                                            # 轮三：弧线分位带
    assert len(a0["p25"]) == t4["L"] and len(a0["p75"]) == t4["L"]
    assert len({a["label"] for a in t4["arcs"]}) == len(t4["arcs"])  # 弧线名互异
    t3pat = client.get("/api/task3/patterns").json()             # 本轮：主题时期演化
    assert t3pat["period_trends"] and "period_order" in t3pat
    assert {"shares", "delta", "direction", "significant"} <= set(t3pat["period_trends"][0])
    corr = client.get("/api/task5/corr").json()
    assert "sig_matrix" in corr and "n_significant" in corr       # A2
    assert "n_robust" in corr and "controls" in corr             # 本轮：偏相关控混淆
    assert {"r_partial", "robust", "controls"} <= set(corr["findings"][0])
    assert corr["prediction"]["macro_f1"] > corr["prediction"]["baseline_macro_f1"]  # P2/P3：预测验证


@pytest.mark.parametrize("url", [
    f"/api/play/{PID}", f"/api/task2/network/{PID}",
    f"/api/task3/play/{PID}", f"/api/task4/play/{PID}",
    f"/api/task5/play/{PID}",
])
def test_play_endpoints_200(url):
    r = client.get(url)
    assert r.status_code == 200
    assert r.json().get("play_id") == PID or "title" in r.json()


def test_bogus_pid_404():
    assert client.get("/api/task2/network/zzz999").status_code == 404
    assert client.get("/api/play/zzz999").status_code == 404


def test_limit_is_clamped():
    plays = client.get("/api/plays?limit=99999").json()["plays"]
    assert len(plays) <= m.LIMIT_MAX


def test_missing_artifact_returns_503():
    m.MISSING.append("task5_corr.json")
    try:
        assert client.get("/api/task5/corr").status_code == 503
    finally:
        m.MISSING.remove("task5_corr.json")
