"""Find valid explicit slot assignments for failing bed×bath layouts."""
from validate_layouts import tile_dims, resolve_slots, create_grid, try_place_named

KIT = ["kit_BL", "kit_TL", "kit_TR", "kit_TC", "kit_MR", "kit_BC"]
BED = ["bed_TL", "bed_BL", "bed_TR", "bed_BR", "bed_ML", "bed_MR", "bed_TC"]
BATH = [
    "bath_TL", "bath_TR", "bath_BL", "bath_BR", "bath_TC", "bath_BC",
    "bath_ML", "bath_MR", "bath_M7L", "bath_M7R", "bath_M8L", "bath_M8R",
    "bath_mid7", "bath_mid8",
]


def solve(beds, baths, max_solutions=1):
    d = tile_dims(beds, baths)
    resolved = resolve_slots(d)
    solutions = []
    order = [("kitchen", KIT)] + [("bedroom", BED)] * beds + [("bathroom", BATH)] * baths

    def backtrack(i, grid, picks):
        if len(solutions) >= max_solutions:
            return
        if i == len(order):
            solutions.append(list(picks))
            return
        kind, choices = order[i]
        for name in choices:
            g = [row[:] for row in grid]
            rooms = []
            if try_place_named(g, resolved, [name], kind, rooms):
                picks.append(name)
                backtrack(i + 1, g, picks)
                picks.pop()
                if len(solutions) >= max_solutions:
                    return

    backtrack(0, create_grid(), [])
    return solutions


def fmt_js(beds, baths, picks):
    kit = picks[0]
    bed_picks = picks[1 : 1 + beds]
    bath_picks = picks[1 + beds :]
    bed_lines = ", ".join("['" + b + "']" for b in bed_picks)
    bath_lines = ", ".join("['" + b + "']" for b in bath_picks)
    return (
        f"    '{beds}x{baths}': {{\n"
        f"      kitchen: ['{kit}'],\n"
        f"      beds: [{bed_lines}],\n"
        f"      baths: [{bath_lines}],\n"
        f"    }},"
    )


FAILING = [
    (1, 5),
    (2, 5),
    (3, 4),
    (3, 5),
    (4, 3),
    (4, 4),
    (4, 5),
    (5, 3),
    (5, 4),
    (5, 5),
]

for b, ba in FAILING:
    sols = solve(b, ba)
    if not sols:
        print(f"NO SOLUTION {b}x{ba}")
    else:
        print(fmt_js(b, ba, sols[0]))
        print()
