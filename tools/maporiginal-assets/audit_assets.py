#!/usr/bin/env python3
"""Read-only S1 artifact audit. Requires Pillow/numpy, not the original game package.

JSON is deterministic for identical repository inputs; all source hashes are recorded.
Pixel/rectangle estimates are not GPU residency or implemented packing savings.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import struct

import numpy as np
from PIL import Image

from atlas_layout import trial, validate_layout
from texture_layout import resolved_cells

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "apps/shared/src/kits/mapOriginal/content"
SHADERS = ROOT / "tools/maporiginal-assets/shaders"
GROUPS = ("decor", "region", "city", "road", "river-top", "snow-top", "desert-top", "choose")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def pixel_hash(image):
    return sha(struct.pack(">II", *image.size) + image.convert("RGBA").tobytes())


def json_exports(path, names):
    """Read JSON-valued generated constants only; fail on missing or malformed data."""
    text = path.read_text()
    found = {}
    for name in names:
        match = re.search(r"^export const " + re.escape(name) + r"(?:\s*:[^=\n]+)?\s*=\s*", text, re.M)
        if not match:
            raise ValueError(f"{path.name}: missing {name}")
        value, end = json.JSONDecoder().raw_decode(text[match.end():])
        if not text[match.end()+end:].lstrip().startswith(";"):
            raise ValueError(f"{name}: expected a JSON constant, not an expression")
        found[name] = value
    return found


def texture_refs(node, frames_only=False):
    ids = set(node.get("frames", []))
    if not frames_only:
        ids.add(node.get("texture", -1))
    for track in node.get("tracks", []):
        if track["type"] == 5:
            ids.update(key["value"] for key in track["keys"])
    if any(type(i) is not int or i < -1 for i in ids):
        raise ValueError("invalid texture reference")
    ids.discard(-1)
    for child in node.get("children", []):
        ids.update(texture_refs(child, frames_only))
    return ids


def duplicate_groups(entries, field):
    groups = defaultdict(list)
    for entry in entries:
        groups[entry[field]].append(entry["key"])
    return [keys for _, keys in sorted(groups.items()) if len(keys) > 1]


def storage_summary(entries):
    physical = {(e["group"], tuple(e["rect"])) for e in entries}
    # Dedup is per atlas family. Cross-family sharing needs a separate draw-call study.
    unique = {(e["group"], e["rgbaHash"]) for e in entries}
    return {"logicalEntries": len(entries), "physicalRects": len(physical),
            "uniqueImagesWithinFamilies": len(unique), "redundantPhysicalRects": len(physical)-len(unique)}


def atlas_cells(data):
    read = lambda name: json.loads((data / name).read_text())
    groups = {"decor": read("decor-atlas.info.json")["cells"], "region": [],
              "city": resolved_cells(read("cities.info.json")["atlas"]),
              "road": resolved_cells(read("roads.info.json")["atlas"]),
              "choose": read("choose.info.json")["pieces"]}
    groups["region"] = resolved_cells(read("region-atlas.info.json"))
    for kind, atlas in read("top-atlas.info.json")["atlases"].items():
        groups[kind+"-top"] = resolved_cells(atlas)
    return groups


def audit_atlases(data):
    result, entries = {}, []
    for group, cells in sorted(atlas_cells(data).items()):
        name = group + (".png" if group == "choose" else "-atlas.png")
        with Image.open(data / name) as source:
            atlas = source.convert("RGBA")
        items, physical = [], {}
        for index, cell in enumerate(cells):
            x, y, w, h = cell["rect"]
            if any(type(v) is not int for v in (x, y, w, h)):
                raise ValueError(f"non-integer rectangle: {group}:{index}")
            physical.setdefault((x, y, w, h), (f"{group}:{index}", x, y, w, h))
            validate_layout([(str(index), x, y, w, h)], *atlas.size)
            image = atlas.crop((x, y, x+w, y+h))
            bbox = image.getchannel("A").getbbox()
            guard = (max(0, bbox[0]-2), max(0, bbox[1]-2), min(w, bbox[2]+2), min(h, bbox[3]+2)) if bbox else (0, 0, 1, 1)
            item = {"key": f"{group}:{index}", "group": group, "id": cell["id"],
                    "source": cell["source"], "variant": cell.get("variant"), "rect": [x, y, w, h],
                    "nativeSize": cell.get("native"), "storageSize": [w, h],
                    "alphaBounds": list(bbox) if bbox else None,
                    "guardTrimRect": [guard[0], guard[1], guard[2]-guard[0], guard[3]-guard[1]],
                    "nonzeroAlphaPixels": int(np.count_nonzero(np.asarray(image)[:, :, 3])),
                    "rgbaHash": pixel_hash(image)}
            items.append(item)
        validate_layout(list(physical.values()), *atlas.size)
        unique = {}
        for item in items:
            unique.setdefault(item["rgbaHash"], item)
        no_trim = trial((i["key"], i["storageSize"]) for i in unique.values())
        trimmed = trial((i["key"], i["guardTrimRect"][2:]) for i in unique.values())
        result[group] = {**storage_summary(items), "size": list(atlas.size), "rgbaBytes": atlas.width*atlas.height*4,
                         "alphaCoverage": float(np.mean(np.asarray(atlas)[:, :, 3] > 0)),
                         "duplicates": duplicate_groups(items, "rgbaHash"),
                         "noTrimTrial": no_trim, "guardTrimTrial": trimmed}
        entries.extend(items)
    return result, entries


def check_refs(ids, entries, group):
    available = {e["id"] for e in entries if e["group"] == group}
    missing = ids - available
    if missing:
        raise ValueError(f"{group}: missing texture IDs {sorted(missing)}")
    return sorted(available - ids)


def audit_references(data, entries):
    names = ["MAPO_DECOR_CELLS", "MAPO_DECOR_SNOW_CELLS", "MAPO_DECOR_DESERT_CELLS"]
    decor = json_exports(CONTENT / "decor.data.ts", names)
    terrain_bytes, bands_bytes = (data / "terrain.bytes").read_bytes(), (data / "bands.bytes").read_bytes()
    rows, cols = struct.unpack_from(">II", terrain_bytes)
    if struct.unpack_from(">HH", bands_bytes) != (rows, cols):
        raise ValueError("terrain/bands dimensions differ")
    if len(terrain_bytes) != 8+rows*cols or len(bands_bytes) != 4+rows*cols:
        raise ValueError("invalid terrain/bands byte length")
    terrain = np.frombuffer(terrain_bytes, np.uint8, offset=8)
    bands = np.frombuffer(bands_bytes, np.uint8, offset=4)
    classes = np.where(bands == 2, 2, np.where(bands == 3, 3, 1))
    variants, members, all_refs, animated = {}, defaultdict(list), set(), set()
    for code, (kind, key) in enumerate(zip(("base", "snow", "desert"), names), 1):
        counts = Counter(map(int, terrain[classes == code]))
        used = [c for c in decor[key] if counts[c["id"]]]
        declared = set().union(*(texture_refs(c["scene"]) for c in decor[key]))
        used_ids = set().union(*(texture_refs(c["scene"]) for c in used))
        animated.update(set().union(*(texture_refs(c["scene"], True) for c in decor[key])))
        check_refs(declared, entries, "decor")
        for i in declared:
            members[i].append(kind)
        all_refs.update(used_ids)
        variants[kind] = {"prefabs": len(decor[key]), "mapReferencedPrefabs": len(used),
                          "textureIds": sorted(declared), "mapReferencedTextureIds": sorted(used_ids)}
    reach = {"decor": {"variants": variants, "unreferencedTextureIds": check_refs(all_refs, entries, "decor"),
                       "scope": "All map cells by biome; city overlap is not permanent invisibility proof."}}
    scenes = json_exports(CONTENT / "top-scenes.data.ts", ["MAPO_TOP_SCENES"])["MAPO_TOP_SCENES"]
    for kind in ("river", "snow", "desert"):
        placed = (data / ("rivers.bin" if kind == "river" else kind+".bin")).read_bytes()
        n = struct.unpack_from(">I", placed)[0]
        if len(placed) != 4+n*6:
            raise ValueError(f"{kind}: invalid placements")
        used_groups = {placed[4+i*6+4]-1 for i in range(n)}
        table = (data / (kind+"-tops.bin")).read_bytes()
        ng = struct.unpack_from(">H", table)[0]
        counts = struct.unpack_from(f">{ng}H", table, 2)
        if not used_groups <= set(range(ng)):
            raise ValueError(f"{kind}: unknown group")
        offset, ids = 2+ng*2, set()
        for i, count in enumerate(counts):
            if i in used_groups:
                scene = scenes.get(kind, {}).get(str(i))
                ids.update(texture_refs(scene) if scene else
                           (struct.unpack_from(">H", table, offset+j*60)[0] for j in range(count)))
            offset += count*60
        if offset != len(table):
            raise ValueError(f"{kind}: invalid top table length")
        reach[kind+"-top"] = {"mapReferencedGroups": len(used_groups), "groups": ng,
                              "textureIds": sorted(ids), "unreferencedTextureIds": check_refs(ids, entries, kind+"-top")}
    table = (data / "cities.bin").read_bytes()
    ng, nq = struct.unpack_from(">HH", table)
    counts = struct.unpack_from(f">{ng}H", table, 4)
    offset, pieces = 4+ng*2, []
    for n in counts:
        pieces.append({struct.unpack_from(">H", table, offset+j*56)[0] for j in range(n)})
        offset += n*56
    if len(table) != offset+nq*6:
        raise ValueError("invalid city table")
    used = {struct.unpack_from(">H", table, offset+i*6)[0] for i in range(nq)}
    if not used <= set(range(ng)):
        raise ValueError("unknown city piece")
    ids = set().union(*(pieces[i] for i in used))
    reach["city"] = {"pieces": ng, "mapReferencedPieces": len(used), "placements": nq, "sprites": sum(counts),
                     "textureIds": sorted(ids), "unreferencedTextureIds": check_refs(ids, entries, "city")}
    for group, filename in (("region", "regions.bin"), ("road", "roads.bin")):
        table = (data / filename).read_bytes()
        n = struct.unpack_from(">I", table)[0]
        stride = 8 if group == "region" else 6
        if len(table) != 4+n*stride:
            raise ValueError(f"{group}: invalid placement length")
        # Variant selection is runtime biome based. Preserve every logical variant.
        reach[group] = {"placements": n, "policy": "Keep all biome variants; pixel equality does not merge logical IDs."}
    frame_items = [e for e in entries if e["group"] == "decor" and e["id"] in animated]
    other_items = [e for e in entries if e["group"] == "decor" and e["id"] not in animated]
    return {"mapReachability": reach, "decorMembership": dict(sorted(members.items())),
            "decorReferenceCombinations": dict(sorted(Counter("+".join(v) for v in members.values()).items())),
            "decorFrameTextureIds": sorted(animated), "decorFrameCount": len(animated),
            "decorFramePixelArea": sum(e["storageSize"][0]*e["storageSize"][1] for e in frame_items),
            "decorFrameGuardTrimArea": sum(e["guardTrimRect"][2]*e["guardTrimRect"][3] for e in frame_items),
            "decorTwoPageTrial": {key: trial((e["key"], e["guardTrimRect"][2:]) for e in items)
                                  for key, items in (("frameReferences", frame_items), ("otherReferences", other_items))}}


def sampling(name):
    if name == "river-mask.png":
        return {"channels": "RGB", "alpha": "ignored; output alpha=1", "trim": "forbidden: world UV data texture", "shader": "mapo-river.effect"}
    if name == "river-normal.png":
        return {"channels": "RG", "alpha": "ignored", "trim": "forbidden: repeat normal data", "shader": "mapo-river.effect"}
    if name in ("ground-base.png", "snow-base.png", "desert-base.png"):
        return {"channels": "RGBA", "trim": "forbidden: POT repeat integer-period texture", "shader": "mapo-sprite.effect"}
    if name == "minimap-mask.png":
        return {"channels": None, "trim": "not currently consumed"}
    return {"channels": "RGBA", "alpha": "sprite blending", "trim": "candidate only with geometry/guard validation" if "atlas" in name else "excluded from general trim", "shader": "mapo-sprite.effect or builtin UI sprite"}


def build_report(map_id):
    data = ROOT / "apps/kits/mapOriginal/data/maps" / map_id
    runtime = ROOT / "apps/Cocos/assets/resources/kits/mapOriginal/maps" / map_id
    groups, entries = audit_atlases(data)
    files = []
    for path in sorted(data.glob("*.png")):
        with Image.open(path) as im:
            a = np.asarray(im.convert("RGBA"))
            row = {"name": path.name, "bytes": path.stat().st_size, "sha256": sha(path.read_bytes()),
                   "size": list(im.size), "rgbaBytes": im.width*im.height*4, "sampling": sampling(path.name)}
        row["mirrorMatches"] = (runtime / path.name).is_file() and sha((runtime / path.name).read_bytes()) == row["sha256"]
        if not row["mirrorMatches"]:
            raise ValueError(f"runtime mirror differs: {path.name}")
        meta = json.loads((runtime / (path.name+".meta")).read_text())
        row["imageImport"] = meta.get("userData", {})
        row["textureImport"] = [s.get("userData", {}) for s in meta["subMetas"].values() if s["importer"] == "texture"]
        if path.name == "river-mask.png":
            nonblack = np.any(a[:, :, :3] != 0, axis=2)
            row.update(uniqueRgbColors=len(np.unique(a[:, :, :3].reshape(-1, 3), axis=0)),
                       nonBlackAlphaZeroPixels=int(np.count_nonzero(nonblack & (a[:, :, 3] == 0))),
                       blackRgbFraction=float(np.mean(~nonblack)))
        files.append(row)
    roots = (data, CONTENT, SHADERS, ROOT / "apps/client/src/kits/mapOriginal", ROOT / "tools/maporiginal-assets")
    inputs = sorted({p for root in roots for p in root.rglob("*") if p.is_file()
                     and "out" not in p.relative_to(root).parts and "__pycache__" not in p.parts
                     and p.suffix in (".png", ".json", ".ts", ".py", ".bytes", ".bin", ".effect")})
    inputs.extend(sorted(runtime.glob("*.meta")))
    hashes = {p.relative_to(ROOT).as_posix(): sha(p.read_bytes()) for p in inputs}
    runtime_files = [p for p in runtime.iterdir() if p.is_file() and p.suffix != ".meta"]
    def inventory(paths):
        return {"count": len(paths), "bytes": sum(p.stat().st_size for p in paths),
                "files": [{"path": p.relative_to(ROOT).as_posix(), "bytes": p.stat().st_size,
                           "sha256": sha(p.read_bytes())} for p in sorted(paths)]}
    return {"schemaVersion": 1, "mapId": map_id, "inputHash": sha(json.dumps(hashes, sort_keys=True).encode()),
            "inputs": hashes, "scope": "Current generated artifacts; no upstream mutation; rectangle trials do not modify images.",
            "packingPolicy": {"sourceGuardPixels": 2, "exteriorPaddingPerSide": 2, "rotation": False, "mipmaps": False,
                              "claim": "Trial dimensions only, not proven runtime savings or globally optimal packing."},
            "files": files, "runtimeFiles": inventory(runtime_files),
            "contentTs": inventory(list(CONTENT.glob("*.ts"))),
            "runtimeBinary": inventory([p for p in runtime_files if p.suffix in (".bin", ".bytes")]),
            "totals": {"pngFiles": len(files), "pngBytes": sum(f["bytes"] for f in files),
                       "allPngRgbaBytes": sum(f["rgbaBytes"] for f in files)},
            "storage": storage_summary(entries), "atlases": groups, "entries": entries,
            "crossFamilyDuplicates": [v for v in duplicate_groups(entries, "rgbaHash") if len({k.split(":")[0] for k in v}) > 1],
            **audit_references(data, entries)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", default="s1", choices=["s1"])
    parser.add_argument("--out", type=Path, required=True, help="JSON report, outside source directories")
    args = parser.parse_args()
    # Keep audits read-only with respect to maintained code and assets.
    if ROOT in args.out.resolve().parents and ROOT / ".cache" not in args.out.resolve().parents:
        parser.error("in-repository audit output must be under .cache/")
    report = build_report(args.map)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)+"\n")
    print(json.dumps({"report": str(args.out), "inputHash": report["inputHash"], **report["storage"], **report["totals"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
