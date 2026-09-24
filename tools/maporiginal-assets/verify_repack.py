#!/usr/bin/env python3
"""Compare O0/O1 installed or staged data: every logical slice and placement byte.

--before is a snapshot of the data/maps/s1 directory; --after defaults to the kit.
Source package fidelity remains a separate gate (verify_fidelity.py).
"""
import argparse
import json
from pathlib import Path

from PIL import Image

from texture_layout import resolved_cells, validate_textures


def groups(data):
    read = lambda n: json.loads((data / n).read_text())
    result = {"decor": read("decor-atlas.info.json"), "region": read("region-atlas.info.json"),
              "city": read("cities.info.json")["atlas"], "road": read("roads.info.json")["atlas"]}
    result.update({kind+"-top": layout for kind, layout in read("top-atlas.info.json")["atlases"].items()})
    result["choose"] = {"cells": read("choose.info.json")["pieces"]}
    return result


def verify(before, after):
    report = {"groups": {}, "unchangedDataFiles": []}
    old_groups, new_groups = groups(before), groups(after)
    assert old_groups.keys() == new_groups.keys()
    for kind, new in new_groups.items():
        old = old_groups[kind]
        filename = kind + (".png" if kind == "choose" else "-atlas.png")
        a, b = (Image.open(root / filename).convert("RGBA") for root in (before, after))
        if "textures" in new: validate_textures(new, b)
        old_cells = resolved_cells(old) if "textures" in old else old["cells"]
        new_cells = resolved_cells(new) if "textures" in new else new["cells"]
        assert len(old_cells) == len(new_cells), (kind, "logical count")
        storage = {"cell", "art", "rect", "textureId"}
        for ca, cb in zip(old_cells, new_cells):
            assert {k: v for k, v in ca.items() if k not in storage} == {k: v for k, v in cb.items() if k not in storage}, (kind, ca["id"], "logical data")
            if "rect" not in ca:
                cx, cy = ca["cell"][:2]; ox, oy, w, h = ca["art"]; rect = [cx+ox, cy+oy, w, h]
            else: rect = ca["rect"]
            x, y, w, h = rect; nx, ny, nw, nh = cb["rect"]
            assert (w, h) == (nw, nh), (kind, ca["id"], "resampling")
            assert a.crop((x, y, x+w, y+h)).tobytes() == b.crop((nx, ny, nx+nw, ny+nh)).tobytes(), (kind, ca["id"], "RGBA")
        report["groups"][kind] = {"logicalEntries": len(new_cells), "rgbaMismatch": 0,
                                  "beforeSize": list(a.size), "afterSize": list(b.size),
                                  "savedRgbaBytes": (a.width*a.height-b.width*b.height)*4}
    for old in sorted(before.iterdir()):
        if old.suffix in (".bin", ".bytes"):
            assert old.read_bytes() == (after / old.name).read_bytes(), old.name
            report["unchangedDataFiles"].append(old.name)
    for filename in ("cities.info.json", "top-atlas.info.json"):
        old, new = (json.loads((root / filename).read_text()) for root in (before, after))
        for key in ("pieces", "placements", "anchorOffsets", "families", "recordBytes"):
            assert old.get(key) == new.get(key), (filename, key)
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", type=Path, required=True)
    ap.add_argument("--after", type=Path, default=Path(__file__).resolve().parents[2] / "apps/kits/mapOriginal/data/maps/s1")
    ap.add_argument("--report", type=Path, required=True)
    args = ap.parse_args()
    result = verify(args.before, args.after)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"logicalEntries": sum(g["logicalEntries"] for g in result["groups"].values()),
                      "savedRgbaBytes": sum(g["savedRgbaBytes"] for g in result["groups"].values()),
                      "unchangedDataFiles": len(result["unchangedDataFiles"])}))
