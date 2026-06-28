#!/usr/bin/env bash
# 一键复现整条数据流水线：解析 PDF → 语料底座 → 任务一~五分析产物 → 提交前数字自检。
# 产物写入 ../data/processed/，供 backend 读取。任一步失败即停（set -e）。
#
# 前置：conda env: llm 已建并 pip install -r requirements.txt；
#       data/raw 下已有竞赛 1-I 的 41 个嵌套 zip（或已解压的剧本 PDF）。
# 用法：cd pipeline && conda activate llm && ./run_all.sh
set -euo pipefail
cd "$(dirname "$0")"

run() { echo; echo "==== [$(date +%H:%M:%S)] $* ===="; python "$@"; }

run extract.py          # 解压嵌套 zip -> data/raw（中文名 GBK 修正）
run build_corpus.py     # 解析全部 PDF -> corpus.jsonl + plays.sqlite + 质量报告
run task1_features.py   # 角色实例特征表 instances.parquet
run task1_classify.py   # 训练/交叉验证/推断 -> predictions/metrics/patterns
run task1_subrole.py    # 细分行当分层分类 -> task1_subroles.json
run task1_temporal.py   # 时期映射、行当演化 -> task1_temporal.json
run task2_network.py    # 角色关系网络指标 + 剧目类型统计 -> task2_*
run task3_topics.py     # LDA 主题提取 + 组合模式 + 跨类型/时期 -> task3_*
run task4_narrative.py  # 叙事强度曲线 + 关键阶段 + 典型弧线聚类 -> task4_*
run task5_synthesis.py  # 跨维度相关 + 协同链路 + 综合原型 -> task5_*
run verify_numbers.py   # 核查 README/答题卡引用数字与产物一致（提交前自检）

echo; echo "==== 全部流水线完成。产物见 ../data/processed/ ===="
