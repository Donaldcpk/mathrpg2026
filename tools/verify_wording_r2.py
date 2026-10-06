#!/usr/bin/env python3
"""Verify second-round school wording: reds gone, replacements present, extracts gone.

Usage:
  python3 tools/verify_wording_r2.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLE = ROOT / "tools/wording_r2_replacements.json"
ENCYC = ROOT / "js/plugins/OmniscientEncyclopedia.js"
AUTH = ROOT / "tools/AUTH.md"

RED_GONE = [
    "這什麼糞 Game 啊！！",
    "（我X！這難道就是傳說中的彩蛋！）",
    "合法常數！",
    "本小姐的「絕對領",
    "域」就要崩塌了！",
]
RED_PRESENT = [
    "這什麼爛遊戲啊！！",
    "（嘩！這難道就是傳說中的彩蛋！）",
    "不變常數！",
    "本小姐的「完美肌",
    "膚」就要崩塌了！",
]
PRE_PR7_PROFANITY = [
    "彼母",
    "糞game",
    "糞 Game",
    "我D)@!$*@#$_L@@#$(+!(*LQ&Y$M!Q@)C(",
    "你他($%&@#(#*&$y*q",
    "形同廢人",
    "數學腦殘粉",
    "數學白痴",
]
UNUSED_EXTRACTS = [
    ROOT / "data/CommonEvents_Script.txt",
    ROOT / "data/劇本提取結果.txt",
]
NICK_TERMS = ["仆街", "撚", "柒", "他媽", "傻逼", "fuk", "屌"]
NICK_WHITELIST = ["dickson", "Dickson"]


def game_data_blob() -> str:
    files = [
        ROOT / "data/CommonEvents.json",
        ROOT / "data/Map001.json",
        ROOT / "data/Map002.json",
        ROOT / "data/Map035.json",
        ROOT / "data/Map038.json",
        ROOT / "data/Map048.json",
        ROOT / "data/Map062.json",
        ROOT / "data/Map098.json",
        ROOT / "data/Weapons.json",
        ROOT / "data/Skills.json",
        ROOT / "data/Troops.json",
    ]
    return "\n".join(p.read_text(encoding="utf-8") for p in files)


def check_table() -> list[str]:
    errors: list[str] = []
    rows = json.loads(TABLE.read_text(encoding="utf-8"))
    if len(rows) != 83:
        errors.append(f"替換表應有 83 筆，實際 {len(rows)}")
    levels: dict[str, int] = {}
    for row in rows:
        levels[row["level"]] = levels.get(row["level"], 0) + 1
        path = ROOT / row["file"]
        if not path.exists():
            errors.append(f"找不到 {row['file']}")
            continue
        text = path.read_text(encoding="utf-8")
        leftover = text.count(row["find"])
        if leftover and row["find"] not in row["replace"]:
            errors.append(
                f"仍殘留 {row['level']}「{row['find']}」於 {row['file']}（{leftover}）"
            )
        present = text.count(row["replace"])
        if present < row["count"]:
            errors.append(
                f"缺少替換結果「{row['replace']}」於 {row['file']}："
                f"預期至少 {row['count']}，實際 {present}"
            )
    if levels.get("紅") != 5:
        errors.append(f"紅線應為 5 筆，表上 {levels.get('紅')}")
    return errors


def check_reds(blob: str) -> list[str]:
    errors = []
    for phrase in RED_GONE:
        if phrase in blob:
            errors.append(f"紅線原文仍在：{phrase}")
    for phrase in RED_PRESENT:
        if phrase not in blob:
            errors.append(f"紅線替換結果缺失：{phrase}")
    return errors


def check_extracts() -> list[str]:
    errors = []
    for path in UNUSED_EXTRACTS:
        if path.exists():
            text = path.read_text(encoding="utf-8", errors="replace")
            hits = [p for p in PRE_PR7_PROFANITY if p in text]
            if hits:
                errors.append(
                    f"{path.relative_to(ROOT)} 仍含 #7 前粗口：{', '.join(hits)}"
                )
            else:
                errors.append(
                    f"{path.relative_to(ROOT)} 仍存在；執行期不載入，應自 repo 刪除"
                )
    return errors


def check_nickname_behavior(src: str) -> list[str]:
    start = src.find("static normalizeNickname")
    end = src.find("static generatePlayerPayload")
    if start < 0 or end < 0 or end <= start:
        return ["無法擷取暱稱過濾函式做行為測試"]
    js = f"""
class NetworkManager {{
{src[start:end]}
}}
const cases = [
  ['Dickson', true],
  ['Dick', true],
  ['D.ickson', true],
  ['數學勇者', true],
  ['fuk', false],
  ['f u k', false],
  ['仆街', false],
  ['bigdick', false],
  ['他媽', false],
  ['傻逼', false],
  ['柒神', false],
  ['撚', false],
];
const bad = [];
for (const [name, expectOk] of cases) {{
  const got = NetworkManager.validateNickname(name);
  if (got.ok !== expectOk) {{
    bad.push(name + ' expect ' + expectOk + ' got ' + got.ok);
  }}
}}
if (bad.length) {{
  console.log(JSON.stringify(bad));
  process.exit(2);
}}
"""
    r = subprocess.run(
        ["node", "-e", js],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        detail = (r.stdout or r.stderr or "").strip()
        return [f"暱稱過濾行為測試失敗：{detail or r.returncode}"]
    return []


def check_nickname_filter() -> list[str]:
    errors = []
    if not ENCYC.exists():
        return ["找不到 js/plugins/OmniscientEncyclopedia.js"]
    src = ENCYC.read_text(encoding="utf-8")
    if "validateNickname" not in src:
        errors.append("缺少 validateNickname")
    for term in NICK_TERMS:
        if term not in src:
            errors.append(f"暱稱封鎖清單缺少：{term}")
    if "normalizeNickname" not in src and "replace(/[" not in src:
        errors.append("暱稱過濾缺少空白／符號正規化")
    if not any(w in src for w in NICK_WHITELIST):
        errors.append("暱稱過濾缺少 Dickson 白名單")
    errors += check_nickname_behavior(src)
    return errors


def check_auth_untouched() -> list[str]:
    r = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "tools/AUTH.md"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    if r.stdout.strip():
        return ["不應改動 tools/AUTH.md"]
    if not AUTH.exists():
        return ["找不到 tools/AUTH.md"]
    return []


def check_2a05_still_disabled() -> list[str]:
    """2A05 may be picture-audited; broken items stay C_A=?."""
    qdb = (ROOT / "js/plugins/questionDatabase.js").read_text(encoding="utf-8")
    if "2A05/JSMATH2A05MCQ1.png" not in qdb:
        return ["questionDatabase 缺少 2A05 MCQ1"]
    if '"C_A": "?"' not in qdb:
        return ["2A05 應仍有停用題（C_A=?）"]
    return []


def main() -> int:
    blob = game_data_blob()
    errors: list[str] = []
    errors += check_table()
    errors += check_reds(blob)
    errors += check_extracts()
    errors += check_nickname_filter()
    errors += check_auth_untouched()
    errors += check_2a05_still_disabled()

    print("== wording r2 ==")
    print(f"- 替換表：{TABLE.relative_to(ROOT)}")
    print(f"- 提取稿已刪：{all(not p.exists() for p in UNUSED_EXTRACTS)}")
    print("- 暱稱過濾擴充：仆街／撚／柒／他媽／傻逼／fuk + Dickson 白名單")
    print()
    if errors:
        print("FAILED:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: 紅線已清、黃線／錯字已套、提取稿已刪、暱稱過濾已擴、AUTH 未動")
    return 0


if __name__ == "__main__":
    sys.exit(main())
