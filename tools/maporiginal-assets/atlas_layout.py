"""Deterministic, non-rotating MaxRects trials shared by the audit and packers.

Positions include exterior padding on every side. No pixels are generated here;
source guard pixels and exterior packing padding are different quantities.
"""

ORDERS = ("area", "max", "height", "width")


def validate_layout(placements, width, height):
    seen = set()
    for i, (name, x, y, w, h) in enumerate(placements):
        if name in seen or min(x, y) < 0 or min(w, h) <= 0 or x+w > width or y+h > height:
            raise ValueError(f"duplicate or out-of-bounds rectangle: {name}")
        seen.add(name)
        for other, bx, by, bw, bh in placements[i+1:]:
            if not (x+w <= bx or bx+bw <= x or y+h <= by or by+bh <= y):
                raise ValueError(f"overlapping rectangles: {name}, {other}")


def pack(rects, width, height, order="area", padding=2):
    if order not in ORDERS or padding < 0 or min(width, height) <= 0:
        raise ValueError("invalid packing policy")
    rects = list(rects)
    if len({name for name, _ in rects}) != len(rects):
        raise ValueError("duplicate rectangle key")
    if any(min(size) <= 0 for _, size in rects):
        raise ValueError("empty rectangle")

    def rank(rect):
        name, (w, h) = rect
        return {"area": (-w*h, -max(w, h), name), "max": (-max(w, h), -min(w, h), name),
                "height": (-h, -w, name), "width": (-w, -h, name)}[order]

    free, placed = [(0, 0, width, height)], []
    for name, (rw, rh) in sorted(rects, key=rank):
        w, h = rw+2*padding, rh+2*padding
        choices = [(min(fw-w, fh-h), max(fw-w, fh-h), fy, fx)
                   for fx, fy, fw, fh in free if w <= fw and h <= fh]
        if not choices:
            return None
        _, _, y, x = min(choices)
        placed.append((name, x, y, w, h))
        split = []
        for fx, fy, fw, fh in free:
            if x >= fx+fw or x+w <= fx or y >= fy+fh or y+h <= fy:
                split.append((fx, fy, fw, fh))
                continue
            if x > fx:
                split.append((fx, fy, x-fx, fh))
            if x+w < fx+fw:
                split.append((x+w, fy, fx+fw-x-w, fh))
            if y > fy:
                split.append((fx, fy, fw, y-fy))
            if y+h < fy+fh:
                split.append((fx, y+h, fw, fy+fh-y-h))
        split = list(dict.fromkeys(split))
        free = [a for i, a in enumerate(split) if not any(
            i != j and a[0] >= b[0] and a[1] >= b[1]
            and a[0]+a[2] <= b[0]+b[2] and a[1]+a[3] <= b[1]+b[3]
            for j, b in enumerate(split))]
    validate_layout(placed, width, height)
    return placed


def trial(rects, padding=2, max_side=4096):
    """Try four stable orders; failure is not proof that a smaller pack is impossible."""
    rects = list(rects)
    if not rects:
        return None
    area = sum((w+2*padding)*(h+2*padding) for _, (w, h) in rects)
    sides = [2**i for i in range(6, 13) if 2**i <= max_side]
    options = sorted((w*h, abs(w-h), w, h) for w in sides for h in sides
                     if w*h >= area and max(w, h) <= 4*min(w, h))
    for _, _, w, h in options:
        for order in ORDERS:
            placed = pack(rects, w, h, order, padding)
            if placed is not None:
                return {"size": [w, h], "rgbaBytes": w*h*4, "order": order,
                        "paddingPerSide": padding, "paddedUtilization": area/(w*h),
                        "imageUtilization": sum(a*b for _, (a, b) in rects)/(w*h),
                        "placements": placed, "kind": "rectangle-trial-only"}
    return None
