"""A2 解析单个剧本 PDF -> 结构化 dict。

版式（实测高度统一）：
  [running header 每页 3 行: banner / 《标题》 / 页码]
  《全称标题》(可能含 一名：别名)
  主要角色  -> 角色：行当...（每行一个）
  情节      -> 剧情梗概
  [注释]    -> 评注（可选）
  根据《…》…整理  -> 出处
  【第N场】 -> 场次（部分剧本无场次标记）
  角色　（表演类型）　台词    -> 对白；续行以全角空格起头
  （…上/下/起霸…）           -> 舞台提示（做打信号）
"""
import re
import fitz

from role_dict import parse_role_line

FW = "　"  # 全角空格

SCENE_RE = re.compile(r"^【[^】]{1,10}】$")
SOURCE_RE = re.compile(r"^根据.+")
# 对白行：名字（可空）（类型）台词
SPEAKER_RE = re.compile(
    r"^(?P<name>[^　（()]*?)\s*[（(](?P<act>[^）)]{1,12})[）)]\s*(?P<text>.*)$"
)
# 纯舞台提示：整行以（或〔起
STAGE_RE = re.compile(r"^[（(〔【].*")

ACT_KEYWORDS = ["起霸", "走边", "趟马", "开打", "同打", "对枪", "亮相", "圆场",
                "档子", "劈叉", "对刀", "舞剑", "翻", "跌扑", "扑跌", "厮杀"]


def act_category(act: str) -> str:
    if "唱" in act:
        return "唱"
    if any(k in act for k in ("念", "引", "诗", "数板", "点绛唇", "叫头", "哭头", "曲")):
        return "念"
    if "白" in act:
        return "白"
    return "其他"


def _clean_pages(doc) -> list[str]:
    """去掉每页 running header，返回正文行列表。"""
    if doc.page_count == 0:
        return []
    p0 = doc[0].get_text().splitlines()
    banner = p0[0].strip() if p0 else ""
    running_title = p0[1].strip() if len(p0) > 1 else ""
    out: list[str] = []
    for i in range(doc.page_count):
        lines = doc[i].get_text().splitlines()
        j = 0
        # 跳过页眉：banner / running_title / 纯页码 / 空行
        while j < len(lines):
            s = lines[j].strip()
            if s == banner or s == running_title or s == "" or re.fullmatch(r"\d{1,4}", s):
                j += 1
            else:
                break
        out.extend(lines[j:])
    return out


def parse_pdf(path) -> dict:
    doc = fitz.open(path)
    play_id = path.stem.split("_")[0]
    title = path.stem.split("_", 1)[-1]
    lines = _clean_pages(doc)
    doc.close()

    # ---- 定位各区块 ----
    idx = {k: None for k in ("role", "plot", "note", "source", "body")}
    for i, ln in enumerate(lines):
        s = ln.strip()
        if idx["role"] is None and s == "主要角色":
            idx["role"] = i
        elif idx["plot"] is None and s == "情节":
            idx["plot"] = i
        elif idx["note"] is None and s == "注释":
            idx["note"] = i
        elif idx["source"] is None and SOURCE_RE.match(s):
            idx["source"] = i
        if idx["body"] is None and (SCENE_RE.match(s) or
                                    (idx["plot"] is not None and STAGE_RE.match(s)
                                     and i > (idx["source"] or idx["plot"]))):
            idx["body"] = i

    # ---- 主要角色 ----
    roles = []
    if idx["role"] is not None:
        end = idx["plot"] or idx["note"] or idx["source"] or idx["body"] or len(lines)
        for ln in lines[idx["role"] + 1:end]:
            r = parse_role_line(ln)
            if r:
                name, big, sub, costume = r
                roles.append({"name": name, "role_type": big,
                              "sub_type": sub, "costume": costume})

    # ---- 情节 / 出处 ----
    plot = ""
    if idx["plot"] is not None:
        end = idx["note"] or idx["source"] or idx["body"] or len(lines)
        plot = "".join(l.strip() for l in lines[idx["plot"] + 1:end])
    source = lines[idx["source"]].strip() if idx["source"] is not None else ""

    # ---- 场次 + 对白 ----
    body_start = idx["body"] if idx["body"] is not None else (
        (idx["source"] or idx["plot"] or idx["role"] or -1) + 1)
    scenes = _parse_scenes(lines[body_start:])

    return {
        "play_id": play_id,
        "title": title,
        "roles": roles,
        "plot": plot,
        "source": source,
        "scenes": scenes,
    }


def _parse_scenes(lines: list[str]) -> list[dict]:
    scenes: list[dict] = []
    cur = {"idx": 0, "name": "", "lines": [], "stage": []}
    pending_names: list[str] = []
    last_line = None

    def flush_scene():
        if cur["lines"] or cur["stage"]:
            scenes.append(dict(cur))

    for raw in lines:
        s = raw.rstrip()
        if not s.strip():
            continue
        if SCENE_RE.match(s.strip()):
            flush_scene()
            cur = {"idx": len(scenes), "name": s.strip("【】"),
                   "lines": [], "stage": []}
            pending_names, last_line = [], None
            continue
        body = s.strip()
        # 续行：全角空格起头且非舞台提示且非新说话人
        is_cont = raw.startswith(FW) or raw.startswith("  ")
        m = SPEAKER_RE.match(body)
        # 多说话人前缀： "名、"
        if m is None and not is_cont and body.endswith("、") and len(body) <= 14:
            pending_names.append(body.rstrip("、"))
            continue
        if STAGE_RE.match(body) and (m is None or m.group("name") == ""):
            cur["stage"].append(body)
            last_line = None
            continue
        if m and (m.group("name") or pending_names):
            names = [n for n in (pending_names + [m.group("name").strip()]) if n]
            pending_names = []
            entry = {"speakers": names, "act": m.group("act"),
                     "cat": act_category(m.group("act")), "text": m.group("text")}
            cur["lines"].append(entry)
            last_line = entry
        elif m and not m.group("name"):  # 无名字的续唱/续念： （唱）...
            entry = {"speakers": last_line["speakers"] if last_line else [],
                     "act": m.group("act"), "cat": act_category(m.group("act")),
                     "text": m.group("text")}
            cur["lines"].append(entry)
            last_line = entry
        elif is_cont and last_line is not None:
            last_line["text"] += body
        # 其余行忽略
    flush_scene()
    return scenes


if __name__ == "__main__":
    import sys, json
    from pathlib import Path
    p = Path(sys.argv[1])
    r = parse_pdf(p)
    print(f"标题={r['title']} 角色={len(r['roles'])} 场次={len(r['scenes'])} "
          f"出处={r['source'][:40]}")
    for role in r["roles"]:
        print("  ", role)
    nlines = sum(len(s["lines"]) for s in r["scenes"])
    print(f"对白条目={nlines}")
    print(json.dumps(r["scenes"][0]["lines"][:3], ensure_ascii=False, indent=2))
