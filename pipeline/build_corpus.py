"""A3 汇总：解析 data/raw 下全部 PDF -> corpus.jsonl + plays.sqlite + 质量报告。"""
import json
import sqlite3
import traceback
from collections import Counter

from config import RAW, PROCESSED, CORPUS_JSONL, PLAYS_DB
from parse_pdf import parse_pdf


def build():
    pdfs = sorted(RAW.rglob("*.pdf"))
    print(f"待解析 PDF: {len(pdfs)}")

    db = sqlite3.connect(PLAYS_DB)
    db.executescript("""
    DROP TABLE IF EXISTS plays; DROP TABLE IF EXISTS roles; DROP TABLE IF EXISTS lines;
    CREATE TABLE plays(play_id TEXT, title TEXT, collection TEXT, source TEXT,
        plot TEXT, n_roles INT, n_scenes INT, n_lines INT);
    CREATE TABLE roles(play_id TEXT, name TEXT, role_type TEXT, sub_type TEXT,
        costume TEXT, labeled INT);
    CREATE TABLE lines(play_id TEXT, scene_idx INT, speaker TEXT, act TEXT,
        cat TEXT, text TEXT);
    """)

    stats = Counter()
    by_coll = Counter()
    role_labeled = Counter()
    big_dist = Counter()
    failed = []

    with open(CORPUS_JSONL, "w", encoding="utf-8") as out:
        for p in pdfs:
            collection = p.parent.name
            try:
                rec = parse_pdf(p)
            except Exception:
                failed.append((str(p), traceback.format_exc().splitlines()[-1]))
                continue
            rec["collection"] = collection
            n_lines = sum(len(s["lines"]) for s in rec["scenes"])
            rec["n_lines"] = n_lines

            out.write(json.dumps(rec, ensure_ascii=False) + "\n")

            db.execute("INSERT INTO plays VALUES(?,?,?,?,?,?,?,?)",
                       (rec["play_id"], rec["title"], collection, rec["source"],
                        rec["plot"], len(rec["roles"]), len(rec["scenes"]), n_lines))
            for r in rec["roles"]:
                db.execute("INSERT INTO roles VALUES(?,?,?,?,?,?)",
                           (rec["play_id"], r["name"], r["role_type"],
                            r["sub_type"], r["costume"], 1))
                big_dist[r["role_type"]] += 1
            for s in rec["scenes"]:
                for ln in s["lines"]:
                    for sp in ln["speakers"]:
                        db.execute("INSERT INTO lines VALUES(?,?,?,?,?,?)",
                                   (rec["play_id"], s["idx"], sp, ln["act"],
                                    ln["cat"], ln["text"]))

            stats["plays"] += 1
            by_coll[collection] += 1
            stats["roles"] += len(rec["roles"])
            stats["lines"] += n_lines
            if rec["roles"]:
                role_labeled["有行当标注剧目"] += 1
            else:
                role_labeled["无行当标注剧目"] += 1
            if not rec["scenes"]:
                stats["无场次/对白剧目"] += 1

    db.commit()
    db.close()

    # ---- 报告 ----
    print("\n========= 数据质量报告 =========")
    print(f"成功解析剧目: {stats['plays']} / {len(pdfs)}  "
          f"(失败 {len(failed)})")
    print(f"角色标注总数: {stats['roles']}   对白条目: {stats['lines']}")
    print(f"行当标注覆盖: {dict(role_labeled)}")
    print(f"无场次/对白剧目: {stats['无场次/对白剧目']}")
    print(f"行当大类分布(已标注): {dict(big_dist.most_common())}")
    print("\n各集合剧目数:")
    for c, n in by_coll.most_common():
        print(f"  {c:<22} {n:>4}")
    if failed:
        print("\n失败样例(前10):")
        for f, e in failed[:10]:
            print(" ", f.split('/')[-1], "->", e)

    report = {
        "total_pdf": len(pdfs), "parsed": stats["plays"], "failed": len(failed),
        "roles": stats["roles"], "lines": stats["lines"],
        "role_label_coverage": dict(role_labeled),
        "no_scene_plays": stats["无场次/对白剧目"],
        "big_type_dist": dict(big_dist.most_common()),
        "by_collection": dict(by_coll.most_common()),
        "failed_samples": failed[:30],
    }
    (PROCESSED / "quality_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n写出: {CORPUS_JSONL}\n      {PLAYS_DB}\n      "
          f"{PROCESSED/'quality_report.json'}")


if __name__ == "__main__":
    build()
