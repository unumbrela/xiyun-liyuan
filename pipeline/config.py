"""项目路径与公共配置。"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
PROCESSED = DATA / "processed"

OUTER_ZIP = ROOT / "1-I_opera_dataset.zip"
# 外层 zip 内部前缀（GBK 原文）
INNER_PREFIX = "赛题1-I京剧数据集/京剧剧本/"
DATA_DESC = INNER_PREFIX + "数据说明.xlsx"

CORPUS_JSONL = PROCESSED / "corpus.jsonl"
PLAYS_DB = PROCESSED / "plays.sqlite"

for d in (RAW, PROCESSED):
    d.mkdir(parents=True, exist_ok=True)
