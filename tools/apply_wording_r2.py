#!/usr/bin/env python3
"""Apply second-round school-safe wording replacements.

Reads tools/wording_r2_replacements.json (exact find strings) and patches
RMMZ data JSON in place. Does not touch AUTH, questionDatabase, or CE7 flow.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE = ROOT / "tools/wording_r2_replacements.json"


def apply() -> dict:
    rows = json.loads(TABLE.read_text(encoding="utf-8"))
    by_file: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_file[row["file"]].append(row)

    report: dict[str, list[dict]] = {}
    errors: list[str] = []
    for rel, items in by_file.items():
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        hits = []
        for row in items:
            found = text.count(row["find"])
            if found != row["count"]:
                errors.append(
                    f"{rel} {row['where']}: expect {row['count']} of {row['find']!r}, found {found}"
                )
                continue
            text = text.replace(row["find"], row["replace"])
            hits.append(
                {
                    "level": row["level"],
                    "where": row["where"],
                    "from": row["find"],
                    "to": row["replace"],
                    "count": found,
                }
            )
        if hits and not errors:
            path.write_text(text, encoding="utf-8")
        report[rel] = hits

    if errors:
        raise SystemExit("APPLY FAILED:\n - " + "\n - ".join(errors))
    return {"applied": report, "total": sum(len(v) for v in report.values())}


def main() -> int:
    result = apply()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
