"""B2 特征工程：为每个"剧目内出场角色"构造特征表 instances.parquet。

每条记录 = 一个 (play_id, name) 角色实例：
- 结构特征：台词数、出场场次、共现度中心性、是否群演
- 表演特征：唱/念/白/其他 占比（唱念做打的可量化信号）
- 画像特征：从角色名提取的性别/身份关键词命中（可解释、零依赖）
- 文本：该角色全部台词拼接（供分类器做 TF-IDF）
- label：已标注=大类行当；未标注=None（任务一推断对象）
"""
import json
import re
from collections import defaultdict

import pandas as pd

from config import CORPUS_JSONL, PROCESSED

# 角色名身份/性别关键词（用于可解释画像特征）
KEYWORDS = {
    "kw_female": ["公主", "娘娘", "夫人", "小姐", "丫鬟", "氏", "后", "妃", "女",
                  "婆", "妈", "姑", "姐", "媒", "嫂", "娘", "宫女", "院君"],
    "kw_official": ["王", "帝", "君", "相", "侯", "将", "官", "爷", "公", "尉",
                    "帅", "监", "丞", "太师", "大人", "老爷"],
    "kw_martial": ["将", "兵", "卒", "校尉", "御林", "大铠", "刀", "枪", "马", "番"],
    "kw_servant": ["院子", "家院", "丫鬟", "太监", "旗牌", "中军", "报子", "探子",
                   "院公", "书童", "马童", "更夫", "店家", "酒保", "禁卒"],
    "kw_group": ["龙套", "上手", "下手", "文堂", "青袍", "铠", "宫女", "校尉",
                 "众", "群"],
    "kw_old": ["老", "公公", "婆", "翁", "叟"],
}
GROUP_RE = re.compile(r"^(四|二|八|六|众|群)")


def keyword_feats(name: str) -> dict:
    f = {k: int(any(w in name for w in ws)) for k, ws in KEYWORDS.items()}
    f["is_group"] = int(bool(GROUP_RE.match(name)) or f["kw_group"])
    f["name_len"] = len(name)
    return f


def build():
    rows = []
    with open(CORPUS_JSONL, encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            rows.extend(_play_instances(rec))
    df = pd.DataFrame(rows)
    out = PROCESSED / "instances.parquet"
    df.to_parquet(out, index=False)
    print(f"实例特征表: {len(df)} 行 -> {out}")
    print(f"  已标注 {df['label'].notna().sum()}  未标注 {df['label'].isna().sum()}")
    print(df["label"].value_counts(dropna=False).to_dict())
    return df


def _play_instances(rec: dict) -> list[dict]:
    label_map = {r["name"]: r["role_type"] for r in rec["roles"]}
    sub_map = {r["name"]: r["sub_type"] for r in rec["roles"]}

    # 收集每个说话人的台词与场次
    agg = defaultdict(lambda: {"chang": 0, "nian": 0, "bai": 0, "other": 0,
                               "scenes": set(), "texts": [], "tlen": 0})
    scene_speakers = defaultdict(set)  # scene_idx -> speakers（算共现）
    for s in rec["scenes"]:
        for ln in s["lines"]:
            for sp in ln["speakers"]:
                a = agg[sp]
                a[{"唱": "chang", "念": "nian", "白": "bai"}.get(ln["cat"], "other")] += 1
                a["scenes"].add(s["idx"])
                a["texts"].append(ln["text"])
                a["tlen"] += len(ln["text"])
                scene_speakers[s["idx"]].add(sp)

    # 共现度：与之同场出现过的不同角色数
    cooc = defaultdict(set)
    for sps in scene_speakers.values():
        for sp in sps:
            cooc[sp] |= (sps - {sp})
    n_sp = max(len(agg), 1)

    out = []
    for name, a in agg.items():
        n_lines = a["chang"] + a["nian"] + a["bai"] + a["other"]
        if n_lines == 0:
            continue
        feat = {
            "play_id": rec["play_id"], "collection": rec["collection"],
            "name": name,
            "n_lines": n_lines,
            "n_scenes": len(a["scenes"]),
            "ratio_chang": a["chang"] / n_lines,
            "ratio_nian": a["nian"] / n_lines,
            "ratio_bai": a["bai"] / n_lines,
            "ratio_other": a["other"] / n_lines,
            "sing_lines": a["chang"],
            "avg_text_len": a["tlen"] / n_lines,
            "total_text_len": a["tlen"],
            "degree": len(cooc[name]) / max(n_sp - 1, 1),
            "text": " ".join(a["texts"]),
            "label": label_map.get(name),
            "sub_label": sub_map.get(name),
        }
        feat.update(keyword_feats(name))
        out.append(feat)
    return out


if __name__ == "__main__":
    build()
