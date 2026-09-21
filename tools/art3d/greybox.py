#!/usr/bin/env python3
"""Deterministic SC0 authoring fixtures; deliberately does not create Creator .meta files."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

import numpy as np
from pygltflib import (
    ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, FLOAT,
    UNSIGNED_SHORT, Accessor, Animation, AnimationChannel, AnimationChannelTarget,
    AnimationSampler, Asset, Attributes, Buffer, BufferView, GLTF2, Image,
    Material, Mesh, Node, PbrMetallicRoughness, Primitive, Sampler, Scene, Skin,
    Texture, TextureInfo,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DEFAULT_OUT = ROOT / "apps/Cocos/assets/resources/stage3d"
TEXTURE = "T_Greybox_Checker_BC.png"
MANIFEST = HERE / "greybox-manifest.json"
GENERATOR = "gono SC0 greybox v1 (pygltflib 1.16.5)"
ACCESSOR_TYPE_TO_NUM_ELEMENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
BIPED_RIG_ROOT = "GreyboxBiped"


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def checker_png() -> bytes:
    """No DCC/library metadata, timestamp, or compressor-version-dependent encoding."""
    y, x = np.indices((64, 64))
    pixels = np.empty((64, 64, 4), dtype=np.uint8)
    pixels[:, :, :3] = np.where(((x // 8 + y // 8) % 2)[:, :, None] == 0, 220, 70)
    pixels[:, :, 3] = 255
    pixels[:8, :8, :3] = [230, 60, 60]
    pixels[:8, -8:, :3] = [60, 200, 90]
    pixels[-8:, :8, :3] = [65, 100, 230]
    pixels[-8:, -8:, :3] = [230, 190, 60]
    raw = b"".join(b"\0" + row.tobytes() for row in pixels)
    # One uncompressed DEFLATE block (< 65536 bytes), with deterministic zlib wrapper.
    packed = b"\x78\x01\x01" + struct.pack("<HH", len(raw), len(raw) ^ 0xFFFF)
    packed += raw + struct.pack(">I", zlib.adler32(raw))
    return (b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"IHDR", struct.pack(">IIBBBBB", 64, 64, 8, 6, 0, 0, 0))
            + png_chunk(b"IDAT", packed) + png_chunk(b"IEND", b""))


class Model:
    def __init__(self, name: str):
        self.name = name
        self.gltf = GLTF2(asset=Asset(version="2.0", generator=GENERATOR), scene=0,
                          scenes=[Scene(name=name, nodes=[0])],
                          nodes=[Node(name=name, mesh=0)], buffers=[Buffer(byteLength=0)])
        self.blob = bytearray()

    def accessor(self, data, shape: str, component=FLOAT, target=None, bounds=False) -> int:
        dtype = "<f4" if component == FLOAT else "<u2"
        values = np.asarray(data, dtype=dtype)
        width = ACCESSOR_TYPE_TO_NUM_ELEMENTS[shape]
        values = values.reshape((-1, width))
        self.blob += b"\0" * ((-len(self.blob)) % 4)
        offset = len(self.blob)
        self.blob += values.tobytes()
        view = len(self.gltf.bufferViews)
        self.gltf.bufferViews.append(BufferView(buffer=0, byteOffset=offset,
                                               byteLength=values.nbytes, target=target))
        index = len(self.gltf.accessors)
        self.gltf.accessors.append(Accessor(bufferView=view, byteOffset=0,
                                           componentType=component, count=len(values), type=shape,
                                           min=values.min(axis=0).tolist() if bounds else [],
                                           max=values.max(axis=0).tolist() if bounds else []))
        return index

    def mesh(self, vertices, normals, tangents, uv, uv2, indices, joints=None, weights=None):
        attrs = Attributes(
            POSITION=self.accessor(vertices, "VEC3", target=ARRAY_BUFFER, bounds=True),
            NORMAL=self.accessor(normals, "VEC3", target=ARRAY_BUFFER),
            TANGENT=self.accessor(tangents, "VEC4", target=ARRAY_BUFFER),
            TEXCOORD_0=self.accessor(uv, "VEC2", target=ARRAY_BUFFER),
            TEXCOORD_1=self.accessor(uv2, "VEC2", target=ARRAY_BUFFER),
        )
        if joints is not None:
            attrs.JOINTS_0 = self.accessor(joints, "VEC4", UNSIGNED_SHORT, ARRAY_BUFFER)
            attrs.WEIGHTS_0 = self.accessor(weights, "VEC4", target=ARRAY_BUFFER)
        self.gltf.meshes = [Mesh(name=f"{self.name}-mesh", primitives=[Primitive(
            attributes=attrs, indices=self.accessor(indices, "SCALAR", UNSIGNED_SHORT,
                                                    ELEMENT_ARRAY_BUFFER), material=0)])]

    def material(self, textured=False):
        pbr = PbrMetallicRoughness(baseColorFactor=[0.65, 0.68, 0.72, 1],
                                 metallicFactor=0, roughnessFactor=0.85)
        if textured:
            self.gltf.images = [Image(name="GreyboxChecker", uri=TEXTURE)]
            self.gltf.samplers = [Sampler(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)]
            self.gltf.textures = [Texture(name="GreyboxChecker", sampler=0, source=0)]
            pbr.baseColorFactor = [1, 1, 1, 1]
            pbr.baseColorTexture = TextureInfo(index=0, texCoord=0)
        self.gltf.materials = [Material(name="M_Greybox", pbrMetallicRoughness=pbr)]

    def encode(self) -> bytes:
        self.gltf.buffers[0].byteLength = len(self.blob)
        self.gltf.set_binary_blob(bytes(self.blob))
        return b"".join(self.gltf.save_to_bytes())


def boxes(specs):
    """Split face vertices keep flat normals, tangents and non-overlapping UV2 charts."""
    vertices, normals, tangents, uv, uv2, indices, joints, weights = ([] for _ in range(8))
    # Tangent U and bitangent V have U x V = outward normal (counter-clockwise).
    faces = [([1, 0, 0], [0, 0, -1], [0, 1, 0]),
             ([-1, 0, 0], [0, 0, 1], [0, 1, 0]),
             ([0, 1, 0], [1, 0, 0], [0, 0, -1]),
             ([0, -1, 0], [1, 0, 0], [0, 0, 1]),
             ([0, 0, 1], [1, 0, 0], [0, 1, 0]),
             ([0, 0, -1], [-1, 0, 0], [0, 1, 0])]
    columns = 3
    rows = 2 * len(specs)
    for part, (minimum, maximum, joint) in enumerate(specs):
        minimum, maximum = np.array(minimum), np.array(maximum)
        center, radius = (minimum + maximum) / 2, (maximum - minimum) / 2
        for face, (n, u, v) in enumerate(faces):
            n, u, v = np.array(n), np.array(u), np.array(v)
            base = len(vertices)
            for s, t in [(0, 0), (1, 0), (1, 1), (0, 1)]:
                vertices.append(center + n * radius + (2 * s - 1) * u * radius + (2 * t - 1) * v * radius)
                normals.append(n)
                tangents.append([*u, 1])
                uv.append([s, t])
                uv2.append([(face % 3 + 0.05 + 0.9 * s) / columns,
                            (part * 2 + face // 3 + 0.05 + 0.9 * t) / rows])
                joints.append([joint, 0, 0, 0])
                weights.append([1, 0, 0, 0])
            indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])
    return vertices, normals, tangents, uv, uv2, indices, joints, weights


def cube() -> bytes:
    model = Model("greybox-cube")
    model.mesh(*boxes([([-0.5, 0, -0.5], [0.5, 1, 0.5], 0)])[:6])
    model.material(textured=True)
    return model.encode()


def plane() -> bytes:
    model = Model("greybox-plane")
    model.mesh([[-32, 0, 32], [32, 0, 32], [32, 0, -32], [-32, 0, -32]],
               [[0, 1, 0]] * 4, [[1, 0, 0, 1]] * 4,
               [[0, 0], [1, 0], [1, 1], [0, 1]],
               [[0.01, 0.01], [0.99, 0.01], [0.99, 0.99], [0.01, 0.99]],
               [0, 1, 2, 0, 2, 3])
    model.material()
    return model.encode()


def biped(alternate=False) -> bytes:
    name = "greybox-biped-atlas-b" if alternate else "greybox-biped"
    model = Model(name)
    model.mesh(*boxes([
        ([-0.29, 0, -0.15], [-0.07, 0.90, 0.15], 0),
        ([0.07, 0, -0.15], [0.29, 0.90, 0.15], 0),
        ([-0.30, 0.85, -0.16], [0.30, 1.02, 0.16], 0),
        ([-0.30, 1.0, -0.17], [0.30, 1.55, 0.17], 1),
        ([-0.19, 1.56, -0.20], [0.19, 1.92, 0.18], 1),
        ([-0.53, 1.04, -0.12], [-0.32, 1.49, 0.12], 1),
        ([0.32, 1.04, -0.12], [0.53, 1.49, 0.12], 1),
        # The nose makes -Z forward visible without using an external texture.
        ([-0.07, 1.65, -0.28], [0.07, 1.74, -0.20], 1),
    ]))
    model.material()
    # Scene/file names stay distinct, but imported skeletal paths must match so an
    # AtlasB clip can animate the main prefab during a controlled atlas switch.
    model.gltf.nodes = [Node(name=BIPED_RIG_ROOT, children=[1, 2]),
                        Node(name="Body", mesh=0, skin=0),
                        Node(name="Root", children=[3]),
                        Node(name="Upper", translation=[0, 1, 0])]
    inverse = np.repeat(np.eye(4, dtype="<f4")[None, :, :], 2, axis=0)
    inverse[1, 1, 3] = -1
    # glTF matrices are column-major; each matrix must be transposed before flattening.
    bind_accessor = model.accessor(inverse.transpose(0, 2, 1).reshape(2, 16), "MAT4")
    model.gltf.skins = [Skin(name="GreyboxTwoBones", joints=[2, 3], skeleton=2,
                             inverseBindMatrices=bind_accessor)]
    time = model.accessor([0, 0.25, 0.5, 0.75, 1], "SCALAR", bounds=True)
    # Literal quaternions avoid differences between platform transcendental libraries.
    # Both loops are exactly one second; alternate clips have distinct names and bytes.
    angle = (0.2588190451, 0.9659258263) if alternate else (0.1736481777, 0.9848077530)
    for action, axis in [("Sway", 2), ("Bow", 0)]:
        rotations = []
        for sign in [0, 1, 0, -1, 0]:
            q = [0, 0, 0, 1]
            if sign:
                q[axis], q[3] = sign * angle[0], angle[1]
            rotations.append(q)
        suffix = "AtlasB" if alternate else "Main"
        clip = Animation(name=f"ANIM_Greybox_{action}_{suffix}",
                         samplers=[AnimationSampler(input=time, output=model.accessor(rotations, "VEC4"),
                                                    interpolation="LINEAR")],
                         channels=[AnimationChannel(sampler=0,
                                                    target=AnimationChannelTarget(node=3, path="rotation"))])
        model.gltf.animations.append(clip)
    return model.encode()


def generated_assets() -> dict[str, bytes]:
    return {"greybox-cube.glb": cube(), "greybox-plane.glb": plane(),
            "greybox-biped.glb": biped(), "greybox-biped-atlas-b.glb": biped(True),
            TEXTURE: checker_png()}


def require(condition: bool, message: str):
    if not condition:
        raise ValueError(message)


def read_glb(data: bytes) -> tuple[dict, bytes]:
    require(len(data) >= 20, "GLB header truncated")
    magic, version, length = struct.unpack_from("<4sII", data)
    require(magic == b"glTF" and version == 2 and length == len(data), "GLB header invalid")
    chunks, cursor = [], 12
    while cursor < length:
        require(cursor + 8 <= length, "GLB chunk header truncated")
        size, kind = struct.unpack_from("<I4s", data, cursor)
        cursor += 8
        require(size % 4 == 0 and cursor + size <= length, "GLB chunk bounds invalid")
        chunks.append((kind, data[cursor:cursor + size]))
        cursor += size
    require([kind for kind, _ in chunks] == [b"JSON", b"BIN\0"], "GLB needs JSON then BIN")
    document = json.loads(chunks[0][1])
    return document, chunks[1][1]


def read_accessor(document: dict, blob: bytes, index: int) -> np.ndarray:
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    types = {FLOAT: "<f4", UNSIGNED_SHORT: "<u2"}
    require(accessor["componentType"] in types, "Unexpected accessor component type")
    width = ACCESSOR_TYPE_TO_NUM_ELEMENTS[accessor["type"]]
    size = np.dtype(types[accessor["componentType"]]).itemsize * width * accessor["count"]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    require(view["buffer"] == 0 and offset % 4 == 0, "Accessor alignment/buffer invalid")
    require(size + accessor.get("byteOffset", 0) <= view["byteLength"], "Accessor exceeds view")
    require(offset + size <= len(blob), "Accessor exceeds BIN")
    return np.frombuffer(blob, dtype=types[accessor["componentType"]], count=accessor["count"] * width,
                         offset=offset).reshape((-1, width))


def validate_png(data: bytes):
    require(data.startswith(b"\x89PNG\r\n\x1a\n"), "PNG signature invalid")
    cursor, chunks = 8, []
    while cursor < len(data):
        require(cursor + 12 <= len(data), "PNG chunk truncated")
        size = struct.unpack_from(">I", data, cursor)[0]
        kind = data[cursor + 4:cursor + 8]
        payload = data[cursor + 8:cursor + 8 + size]
        require(cursor + 12 + size <= len(data), "PNG payload truncated")
        crc = struct.unpack_from(">I", data, cursor + 8 + size)[0]
        require(crc == zlib.crc32(kind + payload), "PNG CRC invalid")
        chunks.append((kind, payload))
        cursor += size + 12
    require([kind for kind, _ in chunks] == [b"IHDR", b"IDAT", b"IEND"], "Unexpected PNG chunks")
    require(struct.unpack(">IIBBBBB", chunks[0][1]) == (64, 64, 8, 6, 0, 0, 0), "PNG must be 64x64 RGBA8")
    raw = zlib.decompress(chunks[1][1])
    require(len(raw) == 64 * 257 and all(raw[row * 257] == 0 for row in range(64)), "PNG pixels invalid")


def validate_assets(assets: dict[str, bytes]) -> dict[str, dict]:
    """Independent binary read-back, including topology, bind pose and animation contracts."""
    validate_png(assets[TEXTURE])
    summary = {}
    for filename, data in assets.items():
        if not filename.endswith(".glb"):
            summary[filename] = {"kind": "texture", "width": 64, "height": 64, "channels": "RGBA8"}
            continue
        document, blob = read_glb(data)
        stem = Path(filename).stem
        require(document["scenes"][document["scene"]]["name"] == stem, f"{filename}: scene name drift")
        require(len(document["buffers"]) == 1 and "uri" not in document["buffers"][0], "External geometry buffer")
        require(len(blob) - 3 <= document["buffers"][0]["byteLength"] <= len(blob), "BIN length mismatch")
        for image in document.get("images", []):
            require(set(image) >= {"uri"} and "bufferView" not in image, "Embedded image forbidden")
            require(image["uri"] == TEXTURE and image["uri"] in assets, "Image URI must resolve within fixtures")
        for index in range(len(document["accessors"])):
            require(np.isfinite(read_accessor(document, blob, index)).all(), "Nonfinite accessor")
        primitive = document["meshes"][0]["primitives"][0]
        attrs = primitive["attributes"]
        values = {key: read_accessor(document, blob, index) for key, index in attrs.items()}
        position = values["POSITION"]
        indices = read_accessor(document, blob, primitive["indices"]).reshape(-1)
        require(len(indices) % 3 == 0 and np.max(indices) < len(position), "Triangle indices invalid")
        require(len(position) < 65536, "Fixture exceeds 16-bit vertex count")
        require(all(len(value) == len(position) for value in values.values()), "Attribute lengths differ")
        require(np.allclose(np.linalg.norm(values["NORMAL"], axis=1), 1), "Normals not normalized")
        require(np.allclose(np.linalg.norm(values["TANGENT"][:, :3], axis=1), 1), "Tangents not normalized")
        require(np.allclose((values["NORMAL"] * values["TANGENT"][:, :3]).sum(axis=1), 0), "Tangent not orthogonal")
        require(np.all((values["TEXCOORD_1"] >= 0) & (values["TEXCOORD_1"] <= 1)), "UV2 out of bounds")
        triangles = position[indices.reshape(-1, 3)]
        crosses = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        require(np.all((crosses * values["NORMAL"][indices.reshape(-1, 3)[:, 0]]).sum(axis=1) > 0),
                "Degenerate triangle or winding disagrees with normal")
        lo, hi = position.min(axis=0), position.max(axis=0)
        record = {"kind": "model", "sceneName": stem, "vertices": len(position),
                  "triangles": len(indices) // 3, "bounds": {"min": lo.tolist(), "max": hi.tolist()},
                  "uvSets": [0, 1], "clips": []}
        if stem == "greybox-plane":
            require(np.allclose(lo, [-32, 0, -32]) and np.allclose(hi, [32, 0, 32]), "Plane is not 64x64")
        if stem.startswith("greybox-biped"):
            require(document["nodes"][0]["name"] == BIPED_RIG_ROOT,
                    "Biped rig root must remain identical across clip libraries")
            skin = document["skins"][0]
            require(skin["joints"] == [2, 3] and skin["skeleton"] == 2, "Expected Root/Upper two-bone rig")
            require(np.max(values["JOINTS_0"]) < 2 and np.all(values["WEIGHTS_0"] >= 0), "Skin indices/weights invalid")
            require(np.allclose(values["WEIGHTS_0"].sum(axis=1), 1), "Weights not normalized")
            bind = read_accessor(document, blob, skin["inverseBindMatrices"]).reshape(2, 4, 4).transpose(0, 2, 1)
            worlds = np.repeat(np.eye(4)[None, :, :], 2, axis=0)
            worlds[1, 1, 3] = 1
            require(np.allclose(worlds @ bind, np.eye(4)), "Inverse bind matrices do not restore rest pose")
            animations = document["animations"]
            require(len(animations) == 2 and animations[0]["name"] != animations[1]["name"], "Expected two named clips")
            outputs = []
            for animation in animations:
                sampler = animation["samplers"][0]
                times = read_accessor(document, blob, sampler["input"]).reshape(-1)
                rotations = read_accessor(document, blob, sampler["output"])
                require(times[0] == 0 and times[-1] == 1 and np.all(np.diff(times) > 0), "Clip must span exactly one second")
                require(np.allclose(np.linalg.norm(rotations, axis=1), 1), "Quaternion not normalized")
                require(len(rotations) == len(times) and not np.allclose(rotations[0], rotations[1]), "Clip is static or malformed")
                require(animation["channels"][0]["target"] == {"node": 3, "path": "rotation"}, "Clip target invalid")
                record["clips"].append({"name": animation["name"], "durationSeconds": 1, "keyframes": len(times)})
                outputs.append(rotations)
            require(not np.allclose(*outputs), "The two clips are indistinguishable")
            record["jointCount"] = 2
            record["rigRootNode"] = BIPED_RIG_ROOT
        summary[filename] = record
    return summary


def manifest(assets: dict[str, bytes], summary: dict[str, dict]) -> dict:
    records = []
    for filename, data in assets.items():
        records.append({"file": filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                        "source": "tools/art3d/greybox.py (procedural; no external assets)", **summary[filename]})
    return {
        "schemaVersion": 1,
        "generator": GENERATOR,
        "runtimeRoot": "apps/Cocos/assets/resources/stage3d",
        "generatedAssets": records,
        "namingAndTextureExceptions": {"scope": "framework SC0 fixtures only",
                                       "modelNames": [name for name in assets if name.endswith(".glb")],
                                       "textureSize": {TEXTURE: [64, 64]},
                                       "reason": "SC0-B2 explicitly requires greybox-* and a 64x64 external PNG"},
        "creatorVerification": {
            "status": "pending",
            "creatorVersion": "3.8.8",
            "prefabs": [{"file": name, "candidatePrefabPath": f"stage3d/{Path(name).stem}/{Path(name).stem}",
                         "observedPrefabPath": None, "observedSubAssetUuid": None, "loadAsPrefab": "pending"}
                        for name in assets if name.endswith(".glb")],
            "externalImageImport": {"status": "pending", "file": "greybox-cube.glb", "imageUri": TEXTURE,
                                    "textureSubMetaObserved": None},
            "skinning": {"status": "pending", "sameAtlasCandidate": "greybox-biped.glb",
                         "separateAtlasCandidate": "greybox-biped-atlas-b.glb",
                         "observedJointTextures": None,
                         "requiredEvidence": ["Create separate Joint Texture Layout entries using imported skeleton/clip UUIDs",
                                              "Record actual jointTexture identity for both clips in each model",
                                              "Verify same-atlas play and cross-atlas switching with rendered animation",
                                              "Separate GLB files and clip UUIDs alone do not prove separate joint textures"]},
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Generated asset directory (default: framework fixtures)")
    parser.add_argument("--check", action="store_true", help="Read-only regeneration, structural checks and byte comparison")
    args = parser.parse_args()
    assets = generated_assets()
    summary = validate_assets(assets)
    expected_manifest = (json.dumps(manifest(assets, summary), indent=2, ensure_ascii=False) + "\n").encode()
    if args.check:
        problems = []
        for filename, expected in assets.items():
            target = args.out / filename
            if not target.is_file() or target.read_bytes() != expected:
                problems.append(f"missing or byte drift: {target}")
        if not MANIFEST.is_file() or MANIFEST.read_bytes() != expected_manifest:
            problems.append(f"missing or byte drift: {MANIFEST}")
        if problems:
            raise ValueError("\n".join(problems))
        print(f"PASS: {len(assets)} deterministic assets and manifest; Creator import remains pending")
        return 0
    args.out.mkdir(parents=True, exist_ok=True)
    for filename, data in assets.items():
        target = args.out / filename
        if not target.is_file() or target.read_bytes() != data:
            target.write_bytes(data)
        print(f"{filename}: {len(data)} bytes sha256={hashlib.sha256(data).hexdigest()}")
    if not MANIFEST.is_file() or MANIFEST.read_bytes() != expected_manifest:
        MANIFEST.write_bytes(expected_manifest)
    print("Structure PASS. Creator import, Prefab paths and jointTexture allocation are NOT verified.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
