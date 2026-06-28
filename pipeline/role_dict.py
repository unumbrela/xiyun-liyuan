"""B1 行当规范化词典：把散见的行当标注归一到 5 大类 + 细分支。

主要角色块里的标注混用大类（生/旦/净/丑/杂）与细分支（小生/青衣…），
本模块把任意标注字符串解析为 (big, sub)。
"""
import re

BIG_TYPES = ["生", "旦", "净", "丑", "末", "杂"]

# 细分支 -> 大类。键尽量长（先匹配长词），值为大类。
SUB_TO_BIG = {
    # 生
    "老生": "生", "须生": "生", "正生": "生", "小生": "生", "武生": "生",
    "红生": "生", "娃娃生": "生", "文生": "生", "穷生": "生", "雉尾生": "生",
    "巾生": "生", "冠生": "生", "扇子生": "生",
    # 旦
    "青衣": "旦", "正旦": "旦", "花旦": "旦", "闺门旦": "旦", "刀马旦": "旦",
    "武旦": "旦", "老旦": "旦", "彩旦": "旦", "花衫": "旦", "贴旦": "旦",
    "玩笑旦": "旦", "泼辣旦": "旦", "刺杀旦": "旦",
    # 净
    "铜锤": "净", "黑头": "净", "正净": "净", "副净": "净", "架子花": "净",
    "架子": "净", "二花脸": "净", "大花脸": "净", "武净": "净", "摔打花": "净",
    "油花脸": "净", "花脸": "净",
    # 丑
    "文丑": "丑", "武丑": "丑", "方巾丑": "丑", "袍带丑": "丑", "茶衣丑": "丑",
    "小丑": "丑", "彩旦丑": "丑", "三花脸": "丑", "小花脸": "丑",
    # 末（多数体系并入生）
    "老外": "末", "副末": "末",
    # 杂
    "龙套": "杂", "院子": "杂", "宫女": "杂", "校尉": "杂", "上手": "杂",
    "下手": "杂", "马童": "杂", "文堂": "杂", "马夫": "杂", "旗牌": "杂",
}

# 大类别名（有些写法不规范）
BIG_ALIAS = {"净": "净", "靚": "净", "末": "末"}

# 先长后短，便于"老生"早于"生"匹配
_SUB_KEYS = sorted(SUB_TO_BIG, key=len, reverse=True)


def normalize(label: str):
    """解析行当标注 -> (big, sub)；无法识别返回 (None, None)。

    label 可能含服饰描述尾串，这里只看开头若干字。
    """
    if not label:
        return None, None
    s = label.strip().lstrip("：:").strip()
    head = s[:6]  # 行当词一般在最前
    for sub in _SUB_KEYS:
        if sub in head:
            return SUB_TO_BIG[sub], sub
    for big in BIG_TYPES:
        if big in head:
            return big, None
    for alias, big in BIG_ALIAS.items():
        if alias in head:
            return big, None
    return None, None


# 主要角色行：角色名：行当（其余为服饰）。兼容双冒号、中英文冒号。
ROLE_LINE = re.compile(
    r"^(?P<name>[^：:，,；;\s]{1,12})\s*[：:]+\s*"
    r"(?P<rt>生|旦|净|丑|末|杂|[一-鿿]{2,3}(?=[：:，,；;]|$))"
)


def parse_role_line(line: str):
    """从主要角色块的一行解析 (name, big, sub, costume)；失败返回 None。"""
    line = line.strip()
    m = ROLE_LINE.match(line)
    if not m:
        return None
    name = m.group("name").strip()
    rt = m.group("rt").strip()
    big, sub = normalize(rt)
    if big is None:
        return None
    costume = line[m.end():].lstrip("：:，,；; ").strip()
    return name, big, sub, costume
