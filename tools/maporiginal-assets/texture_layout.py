"""Image identity/layout contract. Never resample, rotate or multiply alpha.

Logical cells keep their original IDs/order/transforms. Equal full RGBA canvases
with equal native sizes share one physical image *within* a family. The canonical
source path identifies that image independently of atlas coordinates/content;
source paths/aliases remain audit metadata, not runtime node properties.
"""
from collections import defaultdict
import hashlib
from pathlib import Path
import struct

from PIL import Image

from atlas_layout import trial, validate_layout

LAYOUT_VERSION = 1
PADDING = 2
SOURCE_GUARD = 2


def trim_rect(image):
    """Only alpha-zero pixels may be removed; retain original 2px source guard."""
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        return [0, 0, 1, 1]
    x, y = max(0, bounds[0]-SOURCE_GUARD), max(0, bounds[1]-SOURCE_GUARD)
    right, bottom = min(image.width, bounds[2]+SOURCE_GUARD), min(image.height, bounds[3]+SOURCE_GUARD)
    return [x, y, right-x, bottom-y]


def validate_trim(original, rect, cropped):
    """Independent source check: exact guard, no lost alpha, retained RGBA identical."""
    if rect != trim_rect(original):
        raise ValueError("incorrect alpha guard rectangle")
    x, y, w, h = rect
    expected = original.crop((x, y, x+w, y+h))
    if expected.size != cropped.size or expected.tobytes() != cropped.tobytes():
        raise ValueError("retained RGBA changed")
    alpha = original.getchannel("A").copy()
    alpha.paste(0, (x, y, x+w, y+h))
    if alpha.getbbox() is not None:
        raise ValueError("trim removed visible pixels")


def pixel_hash(image):
    return hashlib.sha256(struct.pack(">II", *image.size) + image.convert("RGBA").tobytes()).hexdigest()


def image_id(atlas_id, source):
    return atlas_id + ":" + hashlib.sha256(source.encode("utf-8")).hexdigest()[:20]


def build_atlas(atlas_id, images, *, legacy_size=None, trim=False):
    """images: (source, RGBA image at existing storage size, nativeSize).

    legacy_size preserves the river/desert top pages for O1. Other families use
    deterministic MaxRects with 2px of external padding per side. Logical ordering
    is deliberately not returned: callers retain their existing cell numbering.
    """
    images = list(images)
    if trim and legacy_size:
        raise ValueError("trim requires repacking")
    groups, by_source = defaultdict(list), {}
    for source, image, native in images:
        if image.mode != "RGBA" or len(native) != 2 or min(native) <= 0:
            raise ValueError("expected RGBA image and positive native canvas")
        key = (tuple(native), pixel_hash(image))
        if source in by_source and by_source[source] != key:
            raise ValueError(f"source has inconsistent pixels/canvas: {source}")
        by_source[source] = key
        groups[key].append((source, image, list(native)))
    unique, aliases = {}, {}
    for key, members in groups.items():
        source, image, native = min(members, key=lambda m: m[0])
        texture_id = image_id(atlas_id, source)
        if texture_id in unique:
            raise ValueError("texture ID collision")
        storage = list(image.size)
        rect = trim_rect(image) if trim else [0, 0, *storage]
        x, y, w, h = rect
        cropped = image.crop((x, y, x+w, y+h))
        if trim:
            validate_trim(image, rect, cropped)
        unique[texture_id] = (cropped, native, pixel_hash(cropped), sorted({m[0] for m in members}), storage, rect)
        for alias, _, _ in members:
            aliases[alias] = texture_id
    if legacy_size:
        # Unchanged shelf placements for families outside O1's packing targets.
        width, height = legacy_size
        placements, x, y, row_h, seen = [], PADDING, PADDING, 0, set()
        for source, image, _ in images:
            texture_id = aliases[source]
            if texture_id in seen:
                continue
            seen.add(texture_id)
            w, h = image.size
            if x + w + PADDING > width:
                x, y, row_h = PADDING, y + row_h + PADDING, 0
            placements.append((texture_id, x, y, w, h))
            x += w + PADDING
            row_h = max(row_h, h)
        order, padding = "legacy-height-shelf", {"between": PADDING}
    else:
        packed = trial((key, item[0].size) for key, item in unique.items())
        if packed is None:
            raise ValueError(f"{atlas_id}: cannot pack without resampling")
        width, height = packed["size"]
        placements = [(key, x+PADDING, y+PADDING, w-2*PADDING, h-2*PADDING)
                      for key, x, y, w, h in packed["placements"]]
        order, padding = packed["order"], {"perSide": PADDING}
    validate_layout(placements, width, height)
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    textures = {}
    for key, x, y, w, h in sorted(placements):
        image, native, digest, sources, storage, rect = unique[key]
        atlas.paste(image, (x, y))  # No mask: preserve transparent RGB / straight alpha.
        textures[key] = {"textureId": key, "atlasId": atlas_id, "rect": [x, y, w, h],
                         "nativeSize": native, "storageSize": storage, "trimRect": rect,
                         "layoutVersion": LAYOUT_VERSION, "contentHash": digest, "sources": sources}
    return atlas, {"atlasId": atlas_id, "layoutVersion": LAYOUT_VERSION, "size": [width, height],
                   "packing": {"order": order, "padding": padding, "rotation": False, "sourceGuard": SOURCE_GUARD if trim else None},
                   "textures": textures}, aliases


def runtime_textures(layout):
    return {key: {k: v for k, v in item.items() if k != "sources"}
            for key, item in layout["textures"].items()}


def resolved_cells(atlas):
    """Audit adapter for generated layouts; no duplicated rect/native on logical cells."""
    textures = atlas["textures"]
    result = []
    for cell in atlas["cells"]:
        texture = textures[cell["textureId"]]
        result.append({**cell, "rect": texture["rect"], "native": texture["nativeSize"],
                       "storageSize": texture["storageSize"], "trimRect": texture["trimRect"]})
    return result


def validate_textures(layout, atlas):
    """Check installed bytes against the layout, including alpha-zero RGB."""
    if list(atlas.size) != layout["size"]:
        raise ValueError("atlas size mismatch")
    rectangles = []
    for key, texture in layout["textures"].items():
        x, y, w, h = texture["rect"]
        if texture["textureId"] != key or texture["atlasId"] != layout["atlasId"]:
            raise ValueError("texture identity mismatch")
        if texture["layoutVersion"] != LAYOUT_VERSION or layout["layoutVersion"] != LAYOUT_VERSION:
            raise ValueError("unsupported layout version")
        sw, sh = texture["storageSize"]
        tx, ty, tw, th = texture["trimRect"]
        if any(type(n) is not int for n in [sw, sh, tx, ty, tw, th]) or min(sw, sh, tw, th) <= 0:
            raise ValueError("invalid storage/trim dimensions")
        if min(tx, ty) < 0 or tx+tw > sw or ty+th > sh or [tw, th] != [w, h]:
            raise ValueError("trim outside storage canvas or wrong packed size")
        if pixel_hash(atlas.crop((x, y, x+w, y+h))) != texture["contentHash"]:
            raise ValueError(f"texture content mismatch: {key}")
        rectangles.append((key, x, y, w, h))
    validate_layout(rectangles, *atlas.size)
    for cell in layout["cells"]:
        texture = layout["textures"][cell["textureId"]]
        if cell["source"] not in texture["sources"]:
            raise ValueError("missing source alias")


def write_types(out):
    Path(out, "atlas-layout.types.ts").write_text('''/** Generated by texture_layout.py; do not edit. Storage is independent of prefab geometry. */
export interface IMapoTextureLayout {
    readonly textureId: string;
    readonly atlasId: string;
    readonly rect: readonly [number, number, number, number];
    readonly nativeSize: readonly [number, number];
    readonly storageSize: readonly [number, number];
    readonly trimRect: readonly [number, number, number, number];
    readonly layoutVersion: number;
    /** SHA-256 of big-endian uint32 rect width/height followed by retained RGBA pixels. */
    readonly contentHash: string;
}
export type MapoTextureLayouts = Readonly<Record<string, IMapoTextureLayout>>;
''')
