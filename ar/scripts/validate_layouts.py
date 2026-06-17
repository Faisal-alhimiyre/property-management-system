"""Validate all 25 bed×bath layouts for overlaps (pure Python port)."""
import re
import sys
from pathlib import Path

GR = 12

def room(key, x0, x1, z0, z1):
    return {"key": key, "x0": x0, "x1": x1, "z0": z0, "z1": z1}

def clamp(n, lo, hi):
    return max(lo, min(hi, n))

def tile_dims(beds, baths):
    total = beds + baths + 1
    if total <= 4:
        return {"bedW": 4, "bedH": 4, "bathW": 4, "bathH": 2, "kitW": 4, "kitH": 3}
    if total <= 7:
        return {"bedW": 3, "bedH": 3, "bathW": 3, "bathH": 2, "kitW": 3, "kitH": 3}
    return {"bedW": 3, "bedH": 3, "bathW": 3, "bathH": 1, "kitW": 3, "kitH": 3}

def resolve_slots(d):
    G = GR
    mid_c = (G - d["kitW"]) // 2
    mid_r = (G - d["kitH"]) // 2
    mid_bed_c = (G - d["bedW"]) // 2
    mid_bed_r = (G - d["bedH"]) // 2
    mid_bath_c = (G - d["bathW"]) // 2
    return {
        "kit_BL": {"c": 0, "r": 0, "w": d["kitW"], "h": d["kitH"]},
        "kit_TL": {"c": 0, "r": G - d["kitH"], "w": d["kitW"], "h": d["kitH"]},
        "kit_TR": {"c": G - d["kitW"], "r": G - d["kitH"], "w": d["kitW"], "h": d["kitH"]},
        "kit_TC": {"c": mid_c, "r": G - d["kitH"], "w": d["kitW"], "h": d["kitH"]},
        "kit_MR": {"c": G - d["kitW"], "r": mid_r, "w": d["kitW"], "h": d["kitH"]},
        "kit_BC": {"c": mid_c, "r": 0, "w": d["kitW"], "h": d["kitH"]},
        "bed_TL": {"c": 0, "r": G - d["bedH"], "w": d["bedW"], "h": d["bedH"]},
        "bed_BL": {"c": 0, "r": 0, "w": d["bedW"], "h": d["bedH"]},
        "bed_TR": {"c": G - d["bedW"], "r": G - d["bedH"], "w": d["bedW"], "h": d["bedH"]},
        "bed_BR": {"c": G - d["bedW"], "r": 0, "w": d["bedW"], "h": d["bedH"]},
        "bed_ML": {"c": 0, "r": mid_bed_r, "w": d["bedW"], "h": d["bedH"]},
        "bed_MR": {"c": G - d["bedW"], "r": mid_bed_r, "w": d["bedW"], "h": d["bedH"]},
        "bed_TC": {"c": mid_bed_c, "r": G - d["bedH"], "w": d["bedW"], "h": d["bedH"]},
        "bath_TL": {"c": d["bedW"], "r": G - d["bathH"], "w": d["bathW"], "h": d["bathH"]},
        "bath_TR": {"c": G - d["bathW"] - d["bedW"], "r": G - d["bathH"], "w": d["bathW"], "h": d["bathH"]},
        "bath_BL": {"c": d["bedW"], "r": 0, "w": d["bathW"], "h": d["bathH"]},
        "bath_BR": {"c": G - d["bathW"] - d["bedW"], "r": 0, "w": d["bathW"], "h": d["bathH"]},
        "bath_TC": {"c": mid_bath_c, "r": G - d["bathH"], "w": d["bathW"], "h": d["bathH"]},
        "bath_BC": {"c": mid_bath_c, "r": 0, "w": d["bathW"], "h": d["bathH"]},
        "bath_ML": {"c": 0, "r": mid_bed_r, "w": d["bathW"], "h": d["bathH"]},
        "bath_MR": {"c": G - d["bathW"], "r": mid_bed_r, "w": d["bathW"], "h": d["bathH"]},
        "bath_M7L": {"c": 0, "r": mid_bed_r + d["bedH"], "w": d["bathW"], "h": d["bathH"]},
        "bath_M7R": {"c": G - d["bathW"], "r": mid_bed_r + d["bedH"], "w": d["bathW"], "h": d["bathH"]},
        "bath_M8L": {"c": 0, "r": mid_bed_r + d["bedH"] + 1, "w": d["bathW"], "h": d["bathH"]},
        "bath_M8R": {"c": G - d["bathW"], "r": mid_bed_r + d["bedH"] + 1, "w": d["bathW"], "h": d["bathH"]},
        "bath_mid7": {"c": d["bedW"], "r": mid_bed_r + d["bedH"], "w": d["bathW"], "h": d["bathH"]},
        "bath_mid8": {"c": G - d["bathW"] - d["bedW"], "r": mid_bed_r + d["bedH"] + 1, "w": d["bathW"], "h": d["bathH"]},
    }

def load_explicit():
    text = (Path(__file__).resolve().parents[1] / "js" / "apartment-plan-templates.js").read_text(
        encoding="utf-8"
    )
    m = re.search(r"var EXPLICIT_SLOTS = (\{[\s\S]*?\n  \});", text)
    if not m:
        raise SystemExit("Could not parse EXPLICIT_SLOTS")
    block = m.group(1)
    block = re.sub(r"(\w+):", r'"\1":', block)
    block = block.replace("'", '"')
    block = re.sub(r',\s*}', '}', block)
    block = re.sub(r',\s*]', ']', block)
    import json

    return json.loads(block)

EXPLICIT = load_explicit()

def create_grid():
    return [[None] * GR for _ in range(GR)]

def can_place(grid, c, r, w, h):
    if c < 0 or r < 0 or c + w > GR or r + h > GR:
        return False
    for y in range(r, r + h):
        for x in range(c, c + w):
            if grid[y][x]:
                return False
    return True

def mark_grid(grid, c, r, w, h, key):
    for y in range(r, r + h):
        for x in range(c, c + w):
            grid[y][x] = key

def slot_to_room(slot, key):
    return room(key, slot["c"] / GR, (slot["c"] + slot["w"]) / GR, slot["r"] / GR, (slot["r"] + slot["h"]) / GR)

def try_place_named(grid, resolved, names, key, rooms):
    for name in names:
        slot = resolved.get(name)
        if not slot:
            continue
        if not can_place(grid, slot["c"], slot["r"], slot["w"], slot["h"]):
            continue
        mark_grid(grid, slot["c"], slot["r"], slot["w"], slot["h"], key)
        rooms.append(slot_to_room(slot, key))
        return True
    return False

def living_rects_from_grid(grid):
    rects = []
    active = {}
    for r in range(GR):
        runs = []
        c = 0
        while c < GR:
            while c < GR and grid[r][c]:
                c += 1
            start = c
            while c < GR and not grid[r][c]:
                c += 1
            if c > start:
                runs.append((start, c))
        new_active = {}
        for x0, x1 in runs:
            key = f"{x0}-{x1}"
            if key in active:
                active[key]["r1"] = r + 1
                new_active[key] = active[key]
            else:
                new_active[key] = {"c0": x0, "c1": x1, "r0": r, "r1": r + 1}
        for key, a in active.items():
            if key not in new_active:
                rects.append(room("living", a["c0"] / GR, a["c1"] / GR, a["r0"] / GR, a["r1"] / GR))
        active = new_active
    for a in active.values():
        rects.append(room("living", a["c0"] / GR, a["c1"] / GR, a["r0"] / GR, a["r1"] / GR))
    return rects

errors = []


def validate_all():
    global errors
    errors = []
    for b in range(1, 6):
        for ba in range(1, 6):
            rooms = build_layout(b, ba)
            sat = [r for r in rooms if r["key"] != "living"]
            for i, a in enumerate(sat):
                for c in sat[i + 1 :]:
                    if overlaps(a, c):
                        errors.append(f"{b}x{ba}: {a['key']} vs {c['key']}")
    return errors


def build_layout(beds, baths):
    d = tile_dims(beds, baths)
    resolved = resolve_slots(d)
    grid = create_grid()
    satellites = []
    explicit = EXPLICIT.get(f"{beds}x{baths}")
    if not explicit:
        raise SystemExit(f"Missing explicit layout {beds}x{baths}")
    failed = []
    if not try_place_named(grid, resolved, explicit["kitchen"], "kitchen", satellites):
        failed.append("kitchen")
    for i, bed_names in enumerate(explicit["beds"]):
        if not try_place_named(grid, resolved, bed_names, "bedroom", satellites):
            failed.append(f"bedroom_{i}")
    for i, bath_names in enumerate(explicit["baths"]):
        if not try_place_named(grid, resolved, bath_names, "bathroom", satellites):
            failed.append(f"bathroom_{i}")
    if failed:
        errors.append(f"{beds}x{baths}: failed to place {', '.join(failed)}")
    living = living_rects_from_grid(grid)
    return satellites + living

def overlaps(a, b):
    return a["x0"] < b["x1"] and a["x1"] > b["x0"] and a["z0"] < b["z1"] and a["z1"] > b["z0"]


if __name__ == "__main__":
    issues = validate_all()
    if issues:
        print("LAYOUT ISSUES:\n" + "\n".join(issues))
        sys.exit(1)
    print("All 25 layouts OK")
