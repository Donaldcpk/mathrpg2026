#!/usr/bin/env python3
"""Apply school-safe S2 answer + dialogue fixes.

Does not touch AUTH.md / passwords.
Does not alter CommonEvents CE7 tunnel-softlock control flow.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QDB = ROOT / "js/plugins/questionDatabase.js"
CE = ROOT / "data/CommonEvents.json"
MAP094 = ROOT / "data/Map094.json"
MAP001 = ROOT / "data/Map001.json"
MAP035 = ROOT / "data/Map035.json"

LETTERS = "ABCD"
GUID_RE = re.compile(r'"GUID":\s*"([^"]+)"')
NOTE_RE = re.compile(r'"Note":\s*"([^"]+)"')

FIX_ANSWERS = {
    "2A02/JSMATH2A02MCQ6.png": "D",
    "2A03/JSMATH2A03MCQ51.png": "C",
}

DISABLE_NOTES = {"2A05", "2A05EN"}
DISABLE_REASON = "school-disabled-2A05-unverified"

DIALOGUE_REPLACEMENTS = [
    # Red-line (must)
    ("彼母之劇情殺...", "呢個劇情殺都太犯規啦…"),
    ("我D)@!$*@#$_L@@#$(+!(*LQ&Y$M!Q@)C(", "可、可惡啊——！"),
    ("你他($%&@#(#*&$y*q....", "呢個陷阱都太狠啦……"),
    ("如今城裡的百姓連九九乘法表都背不出來，簡直形", "……連九九乘法表都忘記了，"),
    ("同廢人！", "生活都亂晒套！"),
    # Yellow-line (quick, keep voice)
    ("糞game", "爛遊戲"),
    ("數學腦殘粉", "數學死忠粉"),
    ("數學白痴", "數學苦手"),
    ("是哪個混蛋幹的", "是哪個惡徒幹的"),
    ("發動軍事政變的混蛋", "發動軍事政變的惡徒"),
    ("那個叫數地的混蛋", "那個叫數地的惡徒"),
    ("這傢伙是哪來的神經病？", "這傢伙是哪來的怪人？"),
    ("既然 Boss 是個殘血的神經病", "既然 Boss 是個殘血的怪人"),
    ("聽懂了嗎？笨蛋。", "聽懂了嗎？糊塗鬼。"),
    ("你這台鐵皮笨蛋！", "你這台鐵皮糊塗鬼！"),
    ("還有凱爾那個笨蛋", "還有凱爾那個糊塗鬼"),
    ("揮劍毫無章法的笨蛋", "揮劍毫無章法的糊塗鬼"),
    ("笨蛋！別隨便亂碰那個！", "糊塗鬼！別隨便亂碰那個！"),
]


def other_letters(correct: str) -> tuple[str, str, str]:
    rest = [x for x in LETTERS if x != correct]
    return rest[0], rest[1], rest[2]


def patch_question_block(block: str, guid: str, note: str) -> tuple[str, str | None]:
    if note in DISABLE_NOTES:
        block = re.sub(r'"C_A":\s*"[ABCD?]"', '"C_A": "?"', block, count=1)
        block = re.sub(r'"A2":\s*"[ABCD?]"', '"A2": "?"', block, count=1)
        block = re.sub(r'"A3":\s*"[ABCD?]"', '"A3": "?"', block, count=1)
        block = re.sub(r'"A4":\s*"[ABCD?]"', '"A4": "?"', block, count=1)
        block = re.sub(
            r'"A5_Why":\s*"[^"]*"',
            f'"A5_Why": "{DISABLE_REASON}"',
            block,
            count=1,
        )
        return block, "disable_2A05"
    if guid in FIX_ANSWERS:
        letter = FIX_ANSWERS[guid]
        a2, a3, a4 = other_letters(letter)
        idx = LETTERS.index(letter)
        block = re.sub(r'"A":\s*-?\d+', f'"A": {idx}', block, count=1)
        block = re.sub(r'"C_A":\s*"[ABCD?]"', f'"C_A": "{letter}"', block, count=1)
        block = re.sub(r'"A2":\s*"[ABCD?]"', f'"A2": "{a2}"', block, count=1)
        block = re.sub(r'"A3":\s*"[ABCD?]"', f'"A3": "{a3}"', block, count=1)
        block = re.sub(r'"A4":\s*"[ABCD?]"', f'"A4": "{a4}"', block, count=1)
        block = re.sub(
            r'"A5_Why":\s*"[^"]*"',
            f'"A5_Why": "image-verified-{letter}"',
            block,
            count=1,
        )
        return block, f"fix_{letter}"
    return block, None


def patch_question_database() -> dict:
    text = QDB.read_text(encoding="utf-8")
    obj_re = re.compile(r"\{\n(?:            .+\n)+        \}")
    counts = {"disable_2A05": 0, "fix_C": 0, "fix_D": 0}

    def repl(m: re.Match[str]) -> str:
        block = m.group(0)
        guid_m = GUID_RE.search(block)
        note_m = NOTE_RE.search(block)
        if not guid_m or not note_m:
            return block
        new_block, action = patch_question_block(block, guid_m.group(1), note_m.group(1))
        if action:
            counts[action] = counts.get(action, 0) + 1
        return new_block

    new_text, n = obj_re.subn(repl, text)
    if n == 0:
        raise RuntimeError("questionDatabase.js objects were not matched")
    QDB.write_text(new_text, encoding="utf-8")
    return counts


def patch_text_file(path: Path) -> list[tuple[str, int]]:
    text = path.read_text(encoding="utf-8")
    hits = []
    for old, new in DIALOGUE_REPLACEMENTS:
        c = text.count(old)
        if c:
            text = text.replace(old, new)
            hits.append((old, c))
    if hits:
        path.write_text(text, encoding="utf-8")
    return hits


def main() -> None:
    q_counts = patch_question_database()
    dialogue_hits = {}
    for path in (CE, MAP094, MAP001, MAP035):
        hits = patch_text_file(path)
        if hits:
            dialogue_hits[str(path.relative_to(ROOT))] = hits

    report = {
        "question_database": q_counts,
        "dialogue": {
            rel: [{"from": old, "count": c} for old, c in hits]
            for rel, hits in dialogue_hits.items()
        },
    }
    out = ROOT / "tools/school_content_fix_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
