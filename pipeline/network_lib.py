"""任务二 共享建网库：从单个剧目记录构建角色关系网络 + 计算结构指标。

被 pipeline（批量统计）和 backend（按需出图）共用，保证口径一致。

交互定义：
- 同场共现（co-occurrence）：两角色同场出现 -> 关系，权重 += 共同场次数。
- 对话邻接（adjacency）：同场内相邻发言的两角色 -> 更强交互，权重再 += 邻接次数。
默认仅纳入"有实质戏份"的角色（台词 >= min_lines），过滤龙套堆叠造成的伪稠密。
"""
import math
from collections import defaultdict, Counter
from itertools import combinations

import networkx as nx

# 剧目类型关键词（在 标题 + 情节 上打分，取最高；无信号归"其他"）
DRAMA_KW = {
    "公案戏": ["案", "断", "包拯", "包公", "审", "冤", "状", "巡按", "县官",
              "施公", "知府", "清官", "昭雪", "告状", "命案", "查办"],
    "历史戏": ["帝", "王爷", "元帅", "三国", "诸葛", "关羽", "曹操", "点将",
              "出兵", "交战", "征", "反", "金兵", "番邦", "社稷", "江山",
              "登基", "班师", "挂帅", "兵马", "大战", "篡", "起兵"],
    "家庭戏": ["妻", "丈夫", "婆婆", "媳", "嫂", "贞节", "休妻", "改嫁", "团圆",
              "公婆", "姑嫂", "孝", "逼婚", "夫妻", "婚姻", "继母", "守节"],
    "神怪戏": ["仙", "妖", "神", "龙王", "鬼", "白蛇", "观音", "佛", "法术",
              "妖法", "天宫", "下凡", "宝塔", "现身"],
}
DRAMA_TYPES = ["历史戏", "家庭戏", "公案戏", "神怪戏", "其他"]


def classify_drama(title: str, plot: str) -> str:
    text = (title or "") + " " + (plot or "")
    score = {k: sum(text.count(w) for w in ws) for k, ws in DRAMA_KW.items()}
    best = max(score, key=score.get)
    return best if score[best] > 0 else "其他"


def build_network(rec: dict, role_map: dict | None = None, min_lines: int = 2):
    """rec=corpus 单条；role_map={(play_id,name):final_role}。返回 (G, nodes, edges)."""
    role_map = role_map or {}
    pid = rec["play_id"]

    # 统计每个说话人台词数 + 每场说话人序列
    nlines = Counter()
    scene_seq = []  # [(scene_idx, [speaker,...] 按发言顺序)]
    for s in rec["scenes"]:
        seq = []
        for ln in s["lines"]:
            for sp in ln["speakers"]:
                nlines[sp] += 1
                seq.append(sp)
        if seq:
            scene_seq.append(seq)

    keep = {sp for sp, c in nlines.items() if c >= min_lines}
    if len(keep) < 2:
        keep = set(nlines)  # 太小则不过滤

    w = defaultdict(float)
    for seq in scene_seq:
        present = [sp for sp in dict.fromkeys(seq) if sp in keep]
        # 同场共现
        for a, b in combinations(sorted(present), 2):
            w[(a, b)] += 1.0
        # 对话邻接（相邻不同发言者）
        for x, y in zip(seq, seq[1:]):
            if x != y and x in keep and y in keep:
                key = tuple(sorted((x, y)))
                w[key] += 1.0

    G = nx.Graph()
    # 按名排序插入：固定节点顺序，使 betweenness 等按节点遍历求和的指标在运行间可复现
    # （否则 set 迭代序受 PYTHONHASHSEED 影响，会带来 sub-epsilon 浮点漂移）。
    for sp in sorted(keep):
        G.add_node(sp, n_lines=int(nlines[sp]),
                   role=role_map.get((pid, sp), "未知"))
    for (a, b), weight in w.items():
        G.add_edge(a, b, weight=weight)
    return G


def graph_payload(G: nx.Graph):
    """转成前端 graph 数据：nodes(含中心性/社区) + edges。"""
    if G.number_of_nodes() == 0:
        return {"nodes": [], "edges": [], "metrics": _empty_metrics()}
    cent = nx.degree_centrality(G)
    try:
        comms = list(nx.community.greedy_modularity_communities(G, weight="weight"))
    except Exception:
        comms = [set(G.nodes())]
    comm_of = {n: i for i, c in enumerate(comms) for n in c}

    nodes = [{
        "id": n, "name": n, "role": d.get("role", "未知"),
        "n_lines": d.get("n_lines", 0),
        "centrality": round(cent[n], 4), "community": comm_of.get(n, 0),
    } for n, d in G.nodes(data=True)]
    edges = [{"source": a, "target": b, "weight": d["weight"]}
             for a, b, d in G.edges(data=True)]
    return {"nodes": nodes, "edges": edges, "metrics": compute_metrics(G, comms)}


def compute_metrics(G: nx.Graph, comms=None) -> dict:
    n = G.number_of_nodes()
    m = G.number_of_edges()
    if n == 0:
        return _empty_metrics()
    degs = [d for _, d in G.degree()]
    cent = nx.degree_centrality(G)
    # Freeman 度中心势
    cmax = max(cent.values())
    centralization = sum(cmax - c for c in cent.values()) / (n - 2) if n > 2 else 0.0
    if comms is None:
        try:
            comms = list(nx.community.greedy_modularity_communities(G, weight="weight"))
        except Exception:
            comms = [set(G.nodes())]
    try:
        mod = nx.community.modularity(G, comms, weight="weight")
    except Exception:
        mod = 0.0
    main_char = max(cent, key=cent.get)
    return {
        "n_nodes": n, "n_edges": m,
        "density": round(nx.density(G), 4),
        "avg_degree": round(sum(degs) / n, 3),
        "max_degree": max(degs),
        "avg_clustering": round(nx.average_clustering(G), 4),
        "centralization": round(centralization, 4),
        "modularity": round(mod, 4),
        "n_communities": len(comms),
        "main_char": main_char,
        "main_centrality": round(cent[main_char], 4),
    }


def _empty_metrics():
    return {k: 0 for k in ("n_nodes", "n_edges", "density", "avg_degree",
            "max_degree", "avg_clustering", "centralization", "modularity",
            "n_communities")} | {"main_char": "", "main_centrality": 0}


def _structure_stats(G: nx.Graph):
    """轻量取 (centralization, modularity)，供零模型批量比较用（不含主角等额外字段）。"""
    n = G.number_of_nodes()
    if n < 3:
        return 0.0, 0.0
    cent = nx.degree_centrality(G)
    cmax = max(cent.values())
    centralization = sum(cmax - c for c in cent.values()) / (n - 2)
    try:
        comms = list(nx.community.greedy_modularity_communities(G))
        mod = nx.community.modularity(G, comms)
    except Exception:
        mod = 0.0
    return centralization, mod


def null_model_z(G: nx.Graph, n_random: int = 20, seed: int = 42) -> dict:
    """与同规模 ER 随机图（相同节点/边数）对比，给出中心势/模块度的 z-score。

    z>0 表示观测值显著高于随机期望。节点<3 或边过少时返回 0（无法判定）。
    """
    n, m = G.number_of_nodes(), G.number_of_edges()
    if n < 3 or m < 1:
        return {"modularity_z": 0.0, "centralization_z": 0.0, "n_random": 0}
    obs_cent, obs_mod = _structure_stats(G)
    rng = __import__("random").Random(seed)
    cents, mods = [], []
    for _ in range(n_random):
        R = nx.gnm_random_graph(n, m, seed=rng.randint(0, 1 << 30))
        c, md = _structure_stats(R)
        cents.append(c); mods.append(md)

    def _z(obs, arr):
        import statistics
        if len(arr) < 2:
            return 0.0
        sd = statistics.pstdev(arr)
        return 0.0 if sd < 1e-9 else (obs - statistics.fmean(arr)) / sd

    return {
        "modularity_z": round(_z(obs_mod, mods), 3),
        "centralization_z": round(_z(obs_cent, cents), 3),
        "n_random": n_random,
    }


def structural_roles(G: nx.Graph):
    """每节点的「行当 × 结构位势」，用于分析哪个行当占据中心/桥接位。

    - degree centrality：连接广度（剧情组织者）。
    - betweenness centrality（不加权）：拓扑桥接位（连通不同人物群的"桥"）。
    返回 (per_node, bridge_role, role_assortativity)：
      per_node = [{"role","deg","btw"}, ...]
      bridge_role = 该剧 betweenness 最高节点的行当（无明确桥时 None）
      role_assortativity = 边是否倾向连接同行当（>0 同质/社群偏行当阵营；无法判定 None）
    """
    n = G.number_of_nodes()
    if n < 2:
        return [], None, None
    deg = nx.degree_centrality(G)
    btw = nx.betweenness_centrality(G)        # 不加权：取拓扑桥接含义
    per = [{"role": d.get("role", "未知"),
            "deg": round(deg[nd], 4), "btw": round(btw[nd], 4)}
           for nd, d in G.nodes(data=True)]
    # 桥接主座：betweenness 最高的节点行当（存在正桥接时）。
    # 确定性 tie-break（betweenness 降序、节点名升序）——否则 set 迭代序受
    # PYTHONHASHSEED 影响会让并列时的选取在运行间漂移。
    bridge = None
    if n >= 3 and max(btw.values()) > 0:
        bnode = max(G.nodes(), key=lambda nd: (btw[nd], nd))
        bridge = G.nodes[bnode].get("role", "未知")
    # role assortativity：需 ≥2 个不同行当类别，否则 networkx 给 nan
    assort = None
    try:
        a = nx.attribute_assortativity_coefficient(G, "role")
        if a is not None and not math.isnan(a):
            assort = round(float(a), 4)
    except Exception:
        assort = None
    return per, bridge, assort
