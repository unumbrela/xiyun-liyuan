"""任务四 共享叙事库：从单个剧目记录计算逐场叙事强度曲线 + 关键阶段。

被 pipeline（批量聚类典型叙事模式）和 backend（单剧曲线出图）共用。

每场强度由表演形式标记合成：
- 唱腔强度(文)：该场「唱」占比 —— 抒情/情感高潮信号。
- 武打强度(武)：该场舞台提示中的做打动作标记密度 —— 武戏冲突高潮信号。
- 冲突强度    ：发言人切换率 × 同场人数 —— 对峙/争斗的快节奏信号。
综合强度 = 0.4·文 + 0.4·武 + 0.2·冲突（各自按全剧归一），刻画剧情起伏与节奏。
"""
import numpy as np

# 做打动作标记（出现在舞台提示括号内）
ACTION_KW = ["起霸", "走边", "趟马", "开打", "对打", "同打", "对枪", "对刀", "对剑",
             "厮杀", "交战", "混战", "困战", "圆场", "档子", "舞剑", "舞刀", "亮相",
             "上马", "败下", "杀上", "杀下", "追下", "逃下", "夺刀", "夺枪", "格斗",
             "翻身", "跌扑", "扑跌", "劈叉", "起打"]
L = 16  # 重采样曲线长度


def _scene_features(scene):
    lines = scene["lines"]
    n = len(lines)
    sing = sum(1 for l in lines if l["cat"] == "唱")
    nian = sum(1 for l in lines if l["cat"] == "念")
    bai = sum(1 for l in lines if l["cat"] == "白")
    speakers = []
    for l in lines:
        speakers.extend(l["speakers"])
    distinct = len(set(speakers))
    switches = sum(1 for a, b in zip(speakers, speakers[1:]) if a != b)
    action = sum(1 for d in scene.get("stage", []) for k in ACTION_KW if k in d)
    return {"name": scene.get("name", ""), "n_lines": n,
            "sing": sing, "nian": nian, "bai": bai,
            "n_speakers": distinct, "switches": switches, "action": action}


def _norm(arr):
    a = np.asarray(arr, float)
    rng = a.max() - a.min()
    return (a - a.min()) / rng if rng > 1e-9 else np.zeros_like(a)


def resample(curve, length=L):
    c = np.asarray(curve, float)
    if len(c) == 1:
        return np.repeat(c, length)
    xp = np.linspace(0, 1, len(c))
    x = np.linspace(0, 1, length)
    return np.interp(x, xp, c)


def compute(rec):
    scenes = [_scene_features(s) for s in rec["scenes"] if s["lines"]]
    n = len(scenes)
    if n == 0:
        return None

    lyric = np.array([s["sing"] / max(s["n_lines"], 1) for s in scenes])
    martial_raw = np.array([s["action"] / max(s["n_lines"], 1) for s in scenes])
    conflict = np.array([s["switches"] / max(s["n_lines"], 1)
                         * np.log1p(s["n_speakers"]) for s in scenes])

    lyric_n, martial_n, conflict_n = _norm(lyric), _norm(martial_raw), _norm(conflict)
    intensity = 0.4 * lyric_n + 0.4 * martial_n + 0.2 * conflict_n
    intensity_disp = _norm(intensity) if n > 1 else np.array([0.5])

    peak = int(np.argmax(intensity_disp))
    peak_pos = peak / (n - 1) if n > 1 else 0.5
    climax_type = "唱腔(文)" if lyric_n[peak] >= martial_n[peak] else "武打(武)"

    # 关键阶段：以高潮为界划 开端/发展/高潮/结局
    stage_labels = []
    for i in range(n):
        if i == peak:
            stage_labels.append("高潮")
        elif i < max(1, int(n * 0.2)) and i < peak:
            stage_labels.append("开端")
        elif i < peak:
            stage_labels.append("发展")
        else:
            stage_labels.append("结局")

    pos = np.linspace(0, 1, n)
    rising = float(np.corrcoef(pos, intensity_disp)[0, 1]) if n > 2 else 0.0

    for i, s in enumerate(scenes):
        s["intensity"] = round(float(intensity_disp[i]), 3)
        s["lyric"] = round(float(lyric_n[i]), 3)
        s["martial"] = round(float(martial_n[i]), 3)
        s["stage_label"] = stage_labels[i]

    return {
        "n_scenes": n,
        "scenes": scenes,
        "peak_idx": peak, "peak_pos": round(peak_pos, 3),
        "climax_type": climax_type,
        "rising_index": round(rising, 3) if not np.isnan(rising) else 0.0,
        "sing_ratio": round(float(sum(s["sing"] for s in scenes)
                                  / max(sum(s["n_lines"] for s in scenes), 1)), 4),
        "action_total": int(sum(s["action"] for s in scenes)),
        "resampled": {
            "overall": [round(float(x), 3) for x in resample(intensity_disp)],
            "lyric": [round(float(x), 3) for x in resample(lyric_n)],
            "martial": [round(float(x), 3) for x in resample(martial_n)],
            "conflict": [round(float(x), 3) for x in resample(conflict_n)],
        },
    }
