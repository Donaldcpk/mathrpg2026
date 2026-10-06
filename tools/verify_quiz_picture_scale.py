#!/usr/bin/env python3
"""Smoke-test MZQuizzer per-image quiz picture layout.

Expected on-screen layout (1024×768 game canvas, defaults 92% × 48%, topY=24):
  - After ImageManager loads the question PNG, read bitmap.width/height.
  - Scale that one image to fit a target box (~942×369) while keeping aspect ratio.
  - Small stems (e.g. 400×180, 118×133) scale UP; huge stems (e.g. 2277×1063) scale DOWN.
  - Never overflow the target box; left-align X (origin top-left, x=0); Y stays above the 4-choice window.
  - MZQ_picBG (pic 97) uses the same top-left position and destination rectangle as pic 98.

Does not re-enable 2A05 and does not touch AUTH / answers.

Usage:
  python3 tools/verify_quiz_picture_scale.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MZQ = ROOT / "js/plugins/MZQuizzer.js"
PLUGINS = ROOT / "js/plugins.js"
AUTH = ROOT / "tools/AUTH.md"

BOX_W = 1024
BOX_H = 768
MAX_W_PCT = 92
MAX_H_PCT = 48
TOP_Y = 24

# Representative classroom sizes (measured from current quiz PNGs).
CASES = [
    ("typical_s1_wide", 560, 180, "up"),
    ("typical_s1_narrow", 400, 180, "up"),
    ("tiny_s2", 87, 95, "up"),
    ("sample_s1_ch", 603, 170, "up"),
    ("sample_tsa", 446, 270, "up"),
    ("huge_s3", 2277, 1063, "down"),
    ("wide_s1_oversize", 1342, 378, "down"),
    ("tall_tsa", 980, 723, "down"),
]


def extract_layout_fn() -> str:
    text = MZQ.read_text(encoding="utf-8")
    m = re.search(
        r"/\* MZQ_COMPUTE_QUIZ_PICTURE_LAYOUT_START \*/([\s\S]*?)/\* MZQ_COMPUTE_QUIZ_PICTURE_LAYOUT_END \*/",
        text,
    )
    if not m:
        raise SystemExit("MZQuizzer.js 找不到 mzqComputeQuizPictureLayout 標記區段")
    return m.group(1)


def run_layouts(fn_src: str) -> list[dict]:
    cases_js = json.dumps([[name, w, h] for name, w, h, _ in CASES])
    js = f"""
{fn_src}
const cases = {cases_js};
const out = cases.map(([name, w, h]) => {{
  const layout = mzqComputeQuizPictureLayout(w, h, {BOX_W}, {BOX_H}, {MAX_W_PCT}, {MAX_H_PCT}, {TOP_Y});
  return Object.assign({{ name, srcW: w, srcH: h }}, layout);
}});
process.stdout.write(JSON.stringify(out));
"""
    r = subprocess.run(
        ["node", "--input-type=module", "-e", js],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(r.stdout)


def nearly(a: float, b: float, tol: float = 1.05) -> bool:
    return abs(a - b) <= tol


def check_layouts(rows: list[dict]) -> list[str]:
    errors: list[str] = []
    max_w = BOX_W * MAX_W_PCT / 100
    max_h = BOX_H * MAX_H_PCT / 100
    by_name = {row["name"]: row for row in rows}

    print("== 預期版面（1024×768，目標框 92%×48%，左上 x=0、頂端 y=24）==")
    print(f"目標框最大 {max_w:.1f}×{max_h:.1f}；左上對齊；底部留給訊息／A–D 選項")
    print()
    for name, src_w, src_h, direction in CASES:
        row = by_name[name]
        dest_w = float(row["destW"])
        dest_h = float(row["destH"])
        scale = float(row["scaleX"])
        print(
            f"- {name}: {src_w}×{src_h} → {dest_w:.1f}×{dest_h:.1f} "
            f"scale={scale:.2f}% x={row['x']} y={row['y']}"
        )
        if dest_w > max_w + 1.0:
            errors.append(f"{name}: 寬 {dest_w} 超出目標框 {max_w}")
        if dest_h > max_h + 1.0:
            errors.append(f"{name}: 高 {dest_h} 超出目標框 {max_h}")
        if not nearly(float(row["scaleX"]), float(row["scaleY"])):
            errors.append(f"{name}: scaleX/scaleY 不一致，比例被拉開")
        if int(row["x"]) != 0:
            errors.append(f"{name}: 應左上對齊 x=0，實際 x={row['x']}")
        if int(row.get("origin", 0)) != 0:
            errors.append(f"{name}: origin 應為左上 0，實際 {row.get('origin')}")
        if int(row["y"]) != TOP_Y and dest_h + TOP_Y <= BOX_H:
            errors.append(f"{name}: y={row['y']} 應為 {TOP_Y}（選項窗之上）")
        if dest_h + int(row["y"]) > BOX_H + 1:
            errors.append(f"{name}: 下緣超出畫布")
        if direction == "up" and scale <= 100:
            errors.append(f"{name}: 小圖應放大，實際 scale={scale}")
        if direction == "down" and scale >= 100:
            errors.append(f"{name}: 大圖應縮小，實際 scale={scale}")
        # Must hit at least one side of the target box (contain).
        if dest_w < max_w - 2 and dest_h < max_h - 2:
            errors.append(f"{name}: 未貼齊目標框（寬高都明顯小於上限）")
    return errors


def check_plugin_wiring() -> list[str]:
    errors: list[str] = []
    mzq = MZQ.read_text(encoding="utf-8")
    plugins = PLUGINS.read_text(encoding="utf-8")
    for token in (
        "quizPictureMaxWidthPercent",
        "quizPictureMaxHeightPercent",
        "quizPictureTopY",
        "mzqComputeQuizPictureLayout",
        "mzqApplyQuizPictureLayout",
        "mzqApplyBackgroundFrame",
        "bitmap.width",
    ):
        if token not in mzq:
            errors.append(f"MZQuizzer.js 缺少 {token}")
    for token in (
        "quizPictureMaxWidthPercent",
        "quizPictureMaxHeightPercent",
        "quizPictureTopY",
    ):
        if token not in plugins:
            errors.append(f"js/plugins.js 未掛上參數 {token}（執行期讀不到）")
    if re.search(r"showPicture\(98,\s*first,\s*0,\s*0,\s*0,\s*100,\s*100", mzq):
        errors.append("題圖仍以 100% 釘在 (0,0)，未改為自適應縮放")
    if re.search(r"showPicture\(97,\s*'MZQ_picBG',\s*0,\s*0,\s*0,\s*100,\s*100", mzq):
        errors.append("MZQ_picBG 仍以 100% 釘在 (0,0)，未對齊題圖框")
    if re.search(r"\(canvasW\s*-\s*destW\)\s*/\s*2", mzq):
        errors.append("題圖仍水平置中，應改為左上對齊 x=0")
    return errors


def check_auth_untouched() -> list[str]:
    r = subprocess.run(
        ["git", "diff", "--name-only", "HEAD", "--", "tools/AUTH.md", "js/plugins/questionDatabase.js"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    touched = [line for line in r.stdout.splitlines() if line.strip()]
    if touched:
        return [f"不應改動 AUTH／題庫答案：{', '.join(touched)}"]
    return []


def main() -> int:
    fn_src = extract_layout_fn()
    rows = run_layouts(fn_src)
    errors: list[str] = []
    errors += check_layouts(rows)
    errors += check_plugin_wiring()
    errors += check_auth_untouched()
    print()
    if errors:
        print("FAILED:")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: 每題依位圖自適應縮放；小圖放大、大圖縮小；左上對齊且不遮選項；AUTH／答案未改")
    return 0


if __name__ == "__main__":
    sys.exit(main())
