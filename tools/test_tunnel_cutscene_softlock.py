#!/usr/bin/env python3
"""Guard the Map040 dark-tunnel cutscene against the dialogue softlock.

RPG Maker MZ re-starts autorun common events whenever:
  commonEvent.trigger === 1  AND  $gameSwitches.value(commonEvent.switchId)

Command 121 parameters [id, id, 0] turn a switch ON; 1 turns it OFF.
If SW132 is left ON and CE7 is Autorun, the interpreter never idles —
dialogue loops and the player cannot move.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CE_PATH = ROOT / "data" / "CommonEvents.json"
MAP_PATH = ROOT / "data" / "Map040.json"

TUNNEL_CE_ID = 7
TUNNEL_MAP_EVENT_ID = 40
SW132 = 132  # 劇情2.1數學村地道 — must end OFF
ZOMBIE_IDS = (83, 87, 89, 93, 94, 382, 383, 384, 385, 386, 387, 388, 389, 390)


def would_autorun_common_event(common_event: dict, switches_on: set[int]) -> bool:
    """Mirror Game_Map.setupAutorunCommonEvent for one common event."""
    return bool(common_event) and common_event.get("trigger") == 1 and common_event.get("switchId") in switches_on


def switches_after_ce7(ce7: dict) -> set[int]:
    """Net switch state after CE7, assuming all listed switches start OFF except 131."""
    on = {131}
    for cmd in ce7.get("list") or []:
        if cmd.get("code") != 121:
            continue
        start, end, op = cmd["parameters"][:3]
        for sid in range(start, end + 1):
            if op == 0:
                on.add(sid)
            else:
                on.discard(sid)
    return on


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ce7() -> dict:
    ev = load_json(CE_PATH)[TUNNEL_CE_ID]
    assert ev["id"] == TUNNEL_CE_ID
    return ev


def ev40() -> dict:
    events = load_json(MAP_PATH)["events"]
    return next(e for e in events if e and e["id"] == TUNNEL_MAP_EVENT_ID)


def test_ce7_turns_sw132_off() -> None:
    ev = ce7()
    ops = [c["parameters"][2] for c in ev["list"] if c.get("code") == 121 and c["parameters"][0] == SW132]
    assert ops == [1], ops  # 1 = OFF
    final = switches_after_ce7(ev)
    assert SW132 not in final, final


def test_ce7_does_not_autorun_after_completion() -> None:
    ev = ce7()
    assert ev["name"] == "地道劇情1"
    final = switches_after_ce7(ev)
    assert not would_autorun_common_event(ev, final)
    # Even if a later event turned 132 ON, trigger None still blocks the loop.
    assert ev.get("trigger") == 0


def test_ev40_calls_ce7_once_without_sw132() -> None:
    page0 = ev40()["pages"][0]
    codes = [cmd["code"] for cmd in page0["list"]]
    assert 117 in codes
    assert page0["list"][codes.index(117)]["parameters"] == [TUNNEL_CE_ID]
    assert not any(c.get("code") == 121 for c in page0["list"]), page0["list"]
    assert page0["list"][0] == {"code": 123, "indent": 0, "parameters": ["A", 0]}


def test_ev40_done_page_is_not_autorun() -> None:
    page1 = ev40()["pages"][1]
    assert page1["conditions"]["selfSwitchValid"] is True
    assert page1["conditions"]["selfSwitchCh"] == "A"
    assert page1["trigger"] != 3


def test_player_can_move_after_ce7() -> None:
    """Autorun idle + no leftover SW132 means Game_Player.canMove is not blocked."""
    ev = ce7()
    final = switches_after_ce7(ev)
    assert not would_autorun_common_event(ev, final | {133, 134})
    page1 = ev40()["pages"][1]
    assert page1["trigger"] != 3


def test_miller_escape_cannot_softlock_wait() -> None:
    escape = None
    for cmd in ce7()["list"]:
        if cmd.get("code") != 205:
            continue
        target, route = cmd["parameters"]
        if target == 41 and any(step.get("code") == 14 for step in route["list"]):
            escape = route
    assert escape is not None
    assert escape["skippable"] is True
    assert escape["list"][0]["code"] == 37


def test_zombies_hidden_until_sw134() -> None:
    events = {e["id"]: e for e in load_json(MAP_PATH)["events"] if e}
    for zid in ZOMBIE_IDS:
        ev = events[zid]
        p0 = ev["pages"][0]
        assert p0["image"].get("characterName") == "", zid
        assert p0["through"] is True, zid
        assert p0["moveType"] == 0, zid
        assert p0["trigger"] == 0, zid
        p1 = ev["pages"][1]
        assert p1["conditions"].get("switch1Valid") is True
        assert p1["conditions"].get("switch1Id") == 134


def test_zombies_warp_not_gameover() -> None:
    events = {e["id"]: e for e in load_json(MAP_PATH)["events"] if e}
    for zid in ZOMBIE_IDS:
        for pg in events[zid]["pages"]:
            codes = [c["code"] for c in pg["list"]]
            assert 353 not in codes, zid
            transfers = [c["parameters"] for c in pg["list"] if c["code"] == 201]
            assert [0, 40, 7, 189, 8, 0] in transfers, (zid, transfers)


def main() -> int:
    tests = [
        test_ce7_turns_sw132_off,
        test_ce7_does_not_autorun_after_completion,
        test_ev40_calls_ce7_once_without_sw132,
        test_ev40_done_page_is_not_autorun,
        test_player_can_move_after_ce7,
        test_miller_escape_cannot_softlock_wait,
        test_zombies_hidden_until_sw134,
        test_zombies_warp_not_gameover,
    ]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {fn.__name__}: {exc}")
    if failed:
        print(f"{failed}/{len(tests)} failed")
        return 1
    print(f"{len(tests)}/{len(tests)} passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
