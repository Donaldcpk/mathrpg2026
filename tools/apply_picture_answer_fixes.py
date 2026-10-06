#!/usr/bin/env python3
"""Apply picture-audited MCQ letters onto questionDatabase.js.

Reads tools/answer_key_picture_decisions.json (or --decisions).
Does not touch AUTH, wording, or MZQuizzer path code.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(ROOT / "tools"))

from answer_key_lib import DECISIONS_PATH, LETTERS, other_letters  # noqa: E402

QDB = ROOT / "js/plugins/questionDatabase.js"
GUID_RE = re.compile(r'"GUID":\s*"([^"]+)"')
OBJ_RE = re.compile(r"\{\n(?:            .+\n)+        \}")


def why_for(dec: dict) -> str:
    pic = str(dec.get("picture_answer") or "").strip().upper()
    action = dec.get("action")
    sheet = str(dec.get("sheet") or "").strip().upper()
    if action == "keep_disabled":
        return "image-no-correct-option"
    if pic in LETTERS and sheet in LETTERS and pic != sheet:
        return f"image-verified-{pic}-sheet-conflict"
    if pic in LETTERS:
        return f"image-verified-{pic}"
    return "image-reviewed"


def patch_block(block: str, dec: dict) -> tuple[str, str | None]:
    action = dec.get("action")
    pic = str(dec.get("picture_answer") or "").strip().upper()
    if action == "keep_disabled":
        block = re.sub(r'"C_A":\s*"[ABCD?]"', '"C_A": "?"', block, count=1)
        block = re.sub(r'"A2":\s*"[ABCD?]"', '"A2": "?"', block, count=1)
        block = re.sub(r'"A3":\s*"[ABCD?]"', '"A3": "?"', block, count=1)
        block = re.sub(r'"A4":\s*"[ABCD?]"', '"A4": "?"', block, count=1)
        block = re.sub(
            r'"A5_Why":\s*"[^"]*"',
            f'"A5_Why": "{why_for(dec)}"',
            block,
            count=1,
        )
        return block, "keep_disabled"
    if action in ("fix", "keep_db") and pic in LETTERS:
        a2, a3, a4 = other_letters(pic)
        idx = LETTERS.index(pic)
        block = re.sub(r'"A":\s*-?\d+', f'"A": {idx}', block, count=1)
        block = re.sub(r'"C_A":\s*"[ABCD?]"', f'"C_A": "{pic}"', block, count=1)
        block = re.sub(r'"A2":\s*"[ABCD?]"', f'"A2": "{a2}"', block, count=1)
        block = re.sub(r'"A3":\s*"[ABCD?]"', f'"A3": "{a3}"', block, count=1)
        block = re.sub(r'"A4":\s*"[ABCD?]"', f'"A4": "{a4}"', block, count=1)
        block = re.sub(
            r'"A5_Why":\s*"[^"]*"',
            f'"A5_Why": "{why_for(dec)}"',
            block,
            count=1,
        )
        return block, action
    return block, None


def load_decision_rows(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data["decisions"] if isinstance(data, dict) and "decisions" in data else data
    out = {}
    for row in rows:
        guid = row.get("guid")
        if guid:
            out[guid] = row
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--decisions", type=Path, default=DECISIONS_PATH)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not args.decisions.exists():
        print(f"FAILED: missing {args.decisions}")
        return 1

    decisions = load_decision_rows(args.decisions)
    text = QDB.read_text(encoding="utf-8")
    counts: dict[str, int] = {}
    hit = 0

    def repl(m: re.Match[str]) -> str:
        nonlocal hit
        block = m.group(0)
        gm = GUID_RE.search(block)
        if not gm:
            return block
        dec = decisions.get(gm.group(1))
        if not dec:
            return block
        new_block, action = patch_block(block, dec)
        if action:
            counts[action] = counts.get(action, 0) + 1
            hit += 1
        return new_block

    new_text, n = OBJ_RE.subn(repl, text)
    if n == 0:
        print("FAILED: questionDatabase.js objects were not matched")
        return 1
    if not args.dry_run:
        QDB.write_text(new_text, encoding="utf-8")
    print(json.dumps({"patched": hit, "actions": counts, "dry_run": args.dry_run}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
