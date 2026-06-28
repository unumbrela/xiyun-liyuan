"""A1 解压：从外层 zip 取出 41 个嵌套 zip 内的全部剧本 PDF。

- 修正中文文件名（zip 内为 GBK，被 Python 当 cp437 读入）。
- 依据《数据说明.xlsx》把每个集合（按 8 位文件前缀）映射到中文集合名，
  PDF 落地到 data/raw/<集合名>/ 。
"""
import io
import zipfile
from xml.etree import ElementTree as ET

from config import OUTER_ZIP, INNER_PREFIX, DATA_DESC, RAW

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def fix_name(raw: str) -> str:
    """zip 里中文名常被当 cp437 解码，回转成 GBK。"""
    try:
        return raw.encode("cp437").decode("gbk")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return raw


def load_collection_map(outer: zipfile.ZipFile) -> dict[str, str]:
    """读《数据说明.xlsx》→ {8位文件前缀: 集合名}。合并单元格用前向填充。"""
    xls = zipfile.ZipFile(io.BytesIO(outer.read(DATA_DESC)))
    ss = []
    root = ET.fromstring(xls.read("xl/sharedStrings.xml"))
    for si in root.findall(NS + "si"):
        ss.append("".join(t.text or "" for t in si.iter(NS + "t")))
    sheet = ET.fromstring(xls.read("xl/worksheets/sheet1.xml"))

    mapping: dict[str, str] = {}
    last_coll = ""
    for row in sheet.iter(NS + "row"):
        cells = []
        for c in row.findall(NS + "c"):
            v = c.find(NS + "v")
            if v is None:
                cells.append("")
            elif c.get("t") == "s":
                cells.append(ss[int(v.text)])
            else:
                cells.append(v.text)
        if not cells or cells[0] in ("集合",):  # 表头
            continue
        coll = cells[0].strip() if cells and cells[0] else last_coll
        if coll:
            last_coll = coll
        fileid = cells[1].strip() if len(cells) > 1 and cells[1] else ""
        if fileid.isdigit():
            mapping[fileid.zfill(8)] = coll
    return mapping


def main():
    outer = zipfile.ZipFile(OUTER_ZIP)
    coll_map = load_collection_map(outer)
    print(f"集合映射 {len(coll_map)} 条")

    inner_zips = [
        n for n in outer.namelist()
        if n.startswith(INNER_PREFIX) and n.lower().endswith(".zip")
    ]
    print(f"内层 zip {len(inner_zips)} 个")

    total_pdf = 0
    for inner_name in sorted(inner_zips):
        prefix = inner_name[len(INNER_PREFIX):][:8]
        collection = coll_map.get(prefix, prefix)
        out_dir = RAW / sanitize(collection)
        out_dir.mkdir(parents=True, exist_ok=True)

        iz = zipfile.ZipFile(io.BytesIO(outer.read(inner_name)))
        n_pdf = 0
        for info in iz.infolist():
            if info.is_dir():
                continue
            fname = fix_name(info.filename)
            if not fname.lower().endswith(".pdf"):
                continue
            # 保留原始 8 位 play_id 前缀（文件名形如 07002001_渡阴平.pdf）
            (out_dir / sanitize(fname)).write_bytes(iz.read(info.filename))
            n_pdf += 1
        total_pdf += n_pdf
        print(f"  [{prefix}] {collection:<24} {n_pdf:>4} PDF")
    print(f"完成：共 {total_pdf} 个 PDF → {RAW}")


def sanitize(name: str) -> str:
    """去掉路径分隔符等非法字符，保留中文。"""
    for ch in '/\\:*?"<>|':
        name = name.replace(ch, "_")
    return name.strip()


if __name__ == "__main__":
    main()
