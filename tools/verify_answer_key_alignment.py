#!/usr/bin/env python3
"""Verify S1–S3 MCQ letters against the official Answer Key and picture audit.

Reports:
  matched / fixed / still-disabled / sheet-vs-pic conflicts

Usage:
  python3 tools/verify_answer_key_alignment.py
  python3 tools/verify_answer_key_alignment.py --xlsx /path/to/Answer-Key-S1-6.xlsx
  python3 tools/verify_answer_key_alignment.py --refresh-sheet-json --xlsx /path/to/Answer-Key-S1-6.xlsx
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from answer_key_lib import (  # noqa: E402
    DECISIONS_PATH,
    SHEET_LETTERS_PATH,
    classify,
    iter_mapped_questions,
    load_decisions,
    load_qdb,
    load_sheet_letters,
    parse_xlsx_letters,
)

DEFAULT_XLSX_CANDIDATES = [
    Path("/home/ubuntu/.cursor/projects/workspace/uploads/Answer-Key-S1-6_830d.xlsx"),
    Path("/home/ubuntu/.cursor/projects/workspace/uploads/Answer-Key-S1-6.xlsx"),
]


def find_xlsx(explicit: Path | None) -> Path | None:
    if explicit and explicit.exists():
        return explicit
    for p in DEFAULT_XLSX_CANDIDATES:
        if p.exists():
            return p
    return None


def known_sample_errors(rows: list[dict]) -> list[str]:
    """Spot-check previously documented picture-truth items."""
    want = {
        "2A05/JSMATH2A05MCQ1.png": {"live": True, "letter": "A"},
        "2A05/JSMATH2A05MCQ2.png": {"live": False},
        "2A05/JSMATH2A05MCQ3.png": {"live": False},
        "2A05/JSMATH2A05MCQ21.png": {"live": False},
        "2A05/JSMATH2A05MCQ51.png": {"live": False},
        "2A05EN/JSMATH2A05MCQEng11.png": {"live": False},
        "2A02/JSMATH2A02MCQ6.png": {"live": True, "letter": "D"},
        "2A03/JSMATH2A03MCQ51.png": {"live": True, "letter": "C"},
    }
    by_guid = {r["guid"]: r for r in rows}
    errors = []
    for guid, spec in want.items():
        rec = by_guid.get(guid)
        if not rec:
            errors.append(f"找不到 GUID {guid}")
            continue
        if spec["live"]:
            if rec["disabled"] or rec["db"] != spec["letter"]:
                errors.append(
                    f"{guid}: 題圖正解應為 {spec['letter']} 且啟用，實際 C_A={rec['db']} disabled={rec['disabled']}"
                )
        else:
            if not rec["disabled"]:
                errors.append(f"{guid}: A–D 無正解，應維持停用，實際 C_A={rec['db']}")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", type=Path, default=None)
    ap.add_argument("--decisions", type=Path, default=DECISIONS_PATH)
    ap.add_argument(
        "--refresh-sheet-json",
        action="store_true",
        help="Rewrite tools/answer_key_s1s3_letters.json from the xlsx",
    )
    ap.add_argument("--json-out", type=Path, default=None)
    ap.add_argument(
        "--require-resolved",
        action="store_true",
        help="Fail if any live C_A still disagrees with the sheet (unreviewed leftover)",
    )
    args = ap.parse_args()

    xlsx = find_xlsx(args.xlsx)
    if args.refresh_sheet_json:
        if not xlsx:
            print("FAILED: --refresh-sheet-json 需要 xlsx")
            return 1
        letters = parse_xlsx_letters(xlsx)
        SHEET_LETTERS_PATH.write_text(
            json.dumps(letters, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {SHEET_LETTERS_PATH} ({len(letters)} letters)")

    sheet = load_sheet_letters(xlsx)
    if not sheet:
        print("FAILED: 沒有官方答案表（xlsx 或 tools/answer_key_s1s3_letters.json）")
        return 1

    db = load_qdb()
    rows = iter_mapped_questions(db, sheet)
    decisions = load_decisions(args.decisions)
    report = classify(rows, decisions)
    counts = report["counts"]

    print("== 官方答案表對題庫 ==")
    print(f"sheet letters: {len(sheet)}")
    print(f"bank S1–S3:    {counts['bank_total']}")
    print(f"xlsx source:   {xlsx if xlsx else SHEET_LETTERS_PATH}")
    print(f"decisions:     {len(decisions)} ({args.decisions})")
    print()
    print("== counts ==")
    print(f"matched:                {counts['matched']}")
    print(f"fixed:                  {counts['fixed']}")
    print(f"still-disabled:         {counts['still_disabled']}")
    print(f"sheet-vs-pic conflicts: {counts['sheet_vs_pic_conflicts']}")
    print(f"keep_db (pic=db≠sheet): {counts['keep_db']}")
    print(f"live mismatch leftover: {counts['mismatch_live']}")
    print(f"reviewed:               {counts['reviewed']}")
    print(f"no_sheet:               {counts['no_sheet']}")
    print(f"pic_missing:            {counts['pic_missing']}")
    print(f"guid_parse_fail:        {counts['guid_parse_fail']}")
    print()

    print("== 已知樣本（題圖數學優先）==")
    for guid in (
        "2A05/JSMATH2A05MCQ1.png",
        "2A05/JSMATH2A05MCQ2.png",
        "2A05/JSMATH2A05MCQ3.png",
        "2A05/JSMATH2A05MCQ21.png",
        "2A05/JSMATH2A05MCQ51.png",
        "2A05EN/JSMATH2A05MCQEng11.png",
        "2A02/JSMATH2A02MCQ6.png",
        "2A03/JSMATH2A03MCQ51.png",
    ):
        rec = next((r for r in rows if r["guid"] == guid), None)
        if not rec:
            print(f"- {guid}: MISSING")
            continue
        status = "DISABLED" if rec["disabled"] else f"C_A={rec['db']}"
        print(f"- {guid}: {status} sheet={rec['sheet']}")

    errors = known_sample_errors(rows)
    if counts["guid_parse_fail"]:
        errors.append(f"GUID 解析失敗 {counts['guid_parse_fail']} 題")
    if counts["pic_missing"]:
        errors.append(f"題圖缺失 {counts['pic_missing']} 題")
    if args.require_resolved and counts["mismatch_live"]:
        errors.append(
            f"仍有 {counts['mismatch_live']} 題活題 C_A 與官方表不同（應已用題圖裁定 fix 或 keep_db）"
        )

    if args.json_out:
        payload = {
            "counts": counts,
            "xlsx": str(xlsx) if xlsx else None,
            "decisions": str(args.decisions),
            "errors": errors,
        }
        args.json_out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if errors:
        print()
        print("FAILED:")
        for e in errors:
            print(" -", e)
        return 1
    print()
    print(
        "OK: matched / fixed / still-disabled / sheet-vs-pic conflicts "
        f"= {counts['matched']} / {counts['fixed']} / {counts['still_disabled']} / {counts['sheet_vs_pic_conflicts']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
