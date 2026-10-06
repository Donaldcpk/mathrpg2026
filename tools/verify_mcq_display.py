#!/usr/bin/env python3
"""Verify MCQ stems and question pictures are displayable for all grade bands.

Checks:
  - Active pools have no bare Q="MCQ" (must use the Traditional Chinese prompt).
  - TSA prompts stay consistent with S1–S3.
  - Sample picture files exist under ASCII prefixes for S1/S2/S3/TSA.
  - 2A05 remains disabled (C_A~A4 are "?").
  - AUTH.md is not part of this change set.

Usage:
  python3 tools/verify_mcq_display.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QDB = ROOT / "js/plugins/questionDatabase.js"
MZQ = ROOT / "js/plugins/MZQuizzer.js"
AUTH = ROOT / "tools/AUTH.md"
PICTURES = ROOT / "img/pictures"

PROMPT = "請看題目圖片，選出正確答案。"
ACTIVE_POOLS = ("S1_CH", "S1_EN", "S2_CH", "S2_EN", "S3_CH", "S3_EN", "TSA_ALL")

SAMPLE_PICTURES = [
    ("S1_CH", "quiz/S1/CH/1A01/JSMATH1A01MCQ1.png"),
    ("S1_EN", "quiz/S1/EN/1A01EN/JSMATH1A01MCQEng1.png"),
    ("S2_CH", "quiz/S2/CH/2A01/JSMATH2A01MCQ1.png"),
    ("S2_EN", "quiz/S2/EN/2A01EN/JSMATH2A01MCQEng1.png"),
    ("S3_CH", "quiz/S3/CH/3A01/JSMATH3A01MCQ1.png"),
    ("S3_EN", "quiz/S3/EN/3A01EN/JSMATH3A01MCQEng1.png"),
    ("TSA_ALL", "quiz/TSA/2024TSA/TSA2024Q1.png"),
]

# Old CJK/space prefixes must no longer be the live folders.
LEGACY_PREFIXES = [
    "初中題庫/S1 AI 生成題目/中文題目/",
    "初中題庫/S2 AI生成題目/中文題目/",
    "初中題庫/S3 AI生成題目/中文題目/",
    "初中題庫/TSA/",
]


def load_qdb() -> dict:
    js = r"""
import fs from 'fs';
import vm from 'vm';
const code = fs.readFileSync(process.argv[1], 'utf8');
const sandbox = { questionDatabase: null };
vm.runInNewContext(code.replace(/^\s*var\s+questionDatabase\s*=\s*/, 'questionDatabase = '), sandbox);
const out = {};
for (const [k, arr] of Object.entries(sandbox.questionDatabase)) {
  if (!Array.isArray(arr)) continue;
  out[k] = arr.map(q => ({
    Note: q.Note, GUID: q.GUID, Q: q.Q,
    C_A: q.C_A, A2: q.A2, A3: q.A3, A4: q.A4
  }));
}
process.stdout.write(JSON.stringify(out));
"""
    r = subprocess.run(
        ["node", "--input-type=module", "-e", js, str(QDB)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(r.stdout)


def is_disabled(q: dict) -> bool:
    return all(str(q.get(k) or "") == "?" for k in ("C_A", "A2", "A3", "A4"))


def check_no_bare_mcq(db: dict) -> list[str]:
    errors = []
    for pool in ACTIVE_POOLS:
        arr = db.get(pool)
        if not arr:
            errors.append(f"{pool}: 缺少題庫")
            continue
        bare = [q for q in arr if str(q.get("Q") or "").strip() == "MCQ"]
        if bare:
            errors.append(f"{pool}: 仍有 {len(bare)} 題 Q 為字面 MCQ")
        empty = [q for q in arr if not str(q.get("Q") or "").strip()]
        if empty:
            errors.append(f"{pool}: 有 {len(empty)} 題 Q 空白")
        missing_prompt = [q for q in arr if PROMPT not in str(q.get("Q") or "")]
        if missing_prompt:
            errors.append(
                f"{pool}: 有 {len(missing_prompt)} 題未使用提示「{PROMPT}」"
                f"（例 GUID={missing_prompt[0].get('GUID')}）"
            )
    return errors


def check_sample_pictures(db: dict) -> list[str]:
    errors = []
    for pool, rel in SAMPLE_PICTURES:
        path = PICTURES / rel
        if not path.is_file():
            errors.append(f"{pool}: 找不到樣本題圖 {rel}")
            continue
        if path.stat().st_size < 200:
            errors.append(f"{pool}: 樣本題圖過小 {rel} ({path.stat().st_size} bytes)")
        guid = rel.split("/", 3)[-1]
        if guid.endswith(".png") and pool != "TSA_ALL":
            guid_in_db = guid
        else:
            guid_in_db = guid[:-4] if guid.endswith(".png") else guid
        # GUID in DB is like 1A01/JSMATH1A01MCQ1.png or 2024TSA/TSA2024Q1
        found = False
        for q in db.get(pool, []):
            g = str(q.get("GUID") or "")
            if g.endswith(guid) or g.endswith(guid_in_db) or guid.endswith(g):
                found = True
                break
        if not found:
            errors.append(f"{pool}: 樣本檔 {rel} 對不到題庫 GUID")
    return errors


def check_legacy_folders_gone() -> list[str]:
    errors = []
    if (PICTURES / "初中題庫").exists():
        errors.append("舊資料夾 img/pictures/初中題庫 仍存在，應已改為 quiz/")
    for rel in LEGACY_PREFIXES:
        if (PICTURES / rel).exists():
            errors.append(f"舊路徑仍存在：img/pictures/{rel}")
    return errors


def check_mzquizzer_paths() -> list[str]:
    errors = []
    text = MZQ.read_text(encoding="utf-8")
    if "quiz/S1/" not in text or "quiz/TSA/" not in text:
        errors.append("MZQuizzer.js 未使用 ASCII 前綴 quiz/S1 或 quiz/TSA")
    if "mzqShowPicErrorBanner" not in text:
        errors.append("MZQuizzer.js 缺少題圖載入失敗的中文提示")
    if "mzqShouldNarrowQuizMessage" not in text:
        errors.append("MZQuizzer.js 缺少含 MCQ 的縮窄視窗後備判斷")
    if re.search(r"folderPrefix\s*=\s*'初中題庫/", text):
        errors.append("MZQuizzer.js 仍把舊中文路徑當主路徑")
    return errors


def check_2a05_still_disabled(db: dict) -> list[str]:
    errors = []
    for cat, note in (("S2_CH", "2A05"), ("S2_EN", "2A05EN")):
        qs = [q for q in db.get(cat, []) if q.get("Note") == note]
        if len(qs) != 100:
            errors.append(f"{cat} {note}: 預期 100 題，實際 {len(qs)}")
        live = [q for q in qs if not is_disabled(q)]
        if live:
            errors.append(f"{cat} {note}: 不應重開，仍有 {len(live)} 題未停用")
    return errors


def check_auth_untouched() -> list[str]:
    if not AUTH.exists():
        return ["找不到 tools/AUTH.md"]
    r = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "tools/AUTH.md"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    if r.stdout.strip():
        return ["不應改動 tools/AUTH.md"]
    return []


def main() -> int:
    db = load_qdb()
    errors: list[str] = []
    errors += check_no_bare_mcq(db)
    errors += check_sample_pictures(db)
    errors += check_legacy_folders_gone()
    errors += check_mzquizzer_paths()
    errors += check_2a05_still_disabled(db)
    errors += check_auth_untouched()

    print("== MCQ 顯示檢查 ==")
    for pool in ACTIVE_POOLS:
        arr = db.get(pool, [])
        bare = sum(1 for q in arr if str(q.get("Q") or "").strip() == "MCQ")
        prompt_ok = sum(1 for q in arr if PROMPT in str(q.get("Q") or ""))
        print(f"- {pool}: {len(arr)} 題, 提示語 {prompt_ok}, 裸 MCQ {bare}")
    print()
    print("== 樣本題圖 ==")
    for pool, rel in SAMPLE_PICTURES:
        path = PICTURES / rel
        print(f"- {pool}: {'OK' if path.is_file() else 'MISSING'}  {rel}")
    print()
    if errors:
        print("FAILED:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: 全級別已無裸 MCQ、樣本題圖存在、2A05 仍停用、AUTH 未改")
    return 0


if __name__ == "__main__":
    sys.exit(main())
