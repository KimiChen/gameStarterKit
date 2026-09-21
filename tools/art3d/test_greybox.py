"""Binary-readback and mutation regressions for SC0 fixtures, without importing Creator."""
import copy
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

import numpy as np

import greybox


def encode_glb(document, blob):
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    blob += b"\0" * (-len(blob) % 4)
    return (struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(blob))
            + struct.pack("<I4s", len(encoded), b"JSON") + encoded
            + struct.pack("<I4s", len(blob), b"BIN\0") + blob)


class GreyboxTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets = greybox.generated_assets()

    def replace_glb(self, filename, change):
        assets = copy.copy(self.assets)
        document, blob = greybox.read_glb(assets[filename])
        blob = bytearray(blob)
        change(document, blob)
        assets[filename] = encode_glb(document, bytes(blob))
        return assets

    def test_contract_and_repeatability(self):
        self.assertEqual(self.assets, greybox.generated_assets())
        summary = greybox.validate_assets(self.assets)
        self.assertEqual(summary["greybox-cube.glb"]["triangles"], 12)
        self.assertEqual(summary["greybox-plane.glb"]["bounds"],
                         {"min": [-32, 0, -32], "max": [32, 0, 32]})
        for name in ("greybox-biped.glb", "greybox-biped-atlas-b.glb"):
            self.assertEqual(summary[name]["jointCount"], 2)
            self.assertEqual(summary[name]["rigRootNode"], "GreyboxBiped")
            self.assertEqual([clip["durationSeconds"] for clip in summary[name]["clips"]], [1, 1])
        primary, _ = greybox.read_glb(self.assets["greybox-biped.glb"])
        alternate, _ = greybox.read_glb(self.assets["greybox-biped-atlas-b.glb"])
        self.assertNotEqual(primary["scenes"][0]["name"], alternate["scenes"][0]["name"])
        self.assertEqual([node["name"] for node in primary["nodes"]],
                         [node["name"] for node in alternate["nodes"]])
        result = greybox.manifest(self.assets, summary)
        self.assertEqual(result["creatorVerification"]["status"], "pending")
        for prefab in result["creatorVerification"]["prefabs"]:
            self.assertIsNone(prefab["observedPrefabPath"])
            self.assertIsNone(prefab["observedSubAssetUuid"])

    def test_check_is_read_only_and_rejects_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory)
            for name, data in self.assets.items():
                (out / name).write_bytes(data)
            meta = out / "greybox-cube.glb.meta"
            meta.write_text("Creator-owned sentinel")
            command = [sys.executable, str(greybox.HERE / "greybox.py"), "--out", directory, "--check"]
            before = {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in out.iterdir()}
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(before, {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in out.iterdir()})
            broken = out / "greybox-plane.glb"
            broken.write_bytes(b"broken")
            run = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(run.returncode, 1)
            self.assertIn("byte drift", run.stderr)
            self.assertEqual(broken.read_bytes(), b"broken")
            self.assertEqual(meta.read_text(), "Creator-owned sentinel")

    def test_embedded_and_escaping_images_are_rejected(self):
        for replacement in ({"bufferView": 0, "mimeType": "image/png"},
                            {"uri": "../foreign/T_Greybox_Checker_BC.png"},
                            {"uri": "data:image/png;base64,AA=="}):
            with self.subTest(image=replacement):
                assets = self.replace_glb("greybox-cube.glb",
                                          lambda document, _: document.update(images=[replacement]))
                with self.assertRaises(ValueError):
                    greybox.validate_assets(assets)

    def test_wrong_winding_is_rejected(self):
        def change(document, blob):
            index = document["meshes"][0]["primitives"][0]["indices"]
            accessor = document["accessors"][index]
            offset = document["bufferViews"][accessor["bufferView"]]["byteOffset"]
            first, second = struct.unpack_from("<HH", blob, offset)
            struct.pack_into("<HH", blob, offset, second, first)
        with self.assertRaisesRegex(ValueError, "winding"):
            greybox.validate_assets(self.replace_glb("greybox-cube.glb", change))

    def test_missing_upper_inverse_bind_translation_is_rejected(self):
        def change(document, blob):
            index = document["skins"][0]["inverseBindMatrices"]
            accessor = document["accessors"][index]
            offset = document["bufferViews"][accessor["bufferView"]]["byteOffset"]
            # Second column-major MAT4, y component of translation column.
            struct.pack_into("<f", blob, offset + 64 + 13 * 4, 0)
        with self.assertRaisesRegex(ValueError, "bind matrices"):
            greybox.validate_assets(self.replace_glb("greybox-biped.glb", change))

    def test_duplicate_clip_motion_is_rejected(self):
        def change(document, _):
            document["animations"][1]["samplers"][0]["output"] = document["animations"][0]["samplers"][0]["output"]
        with self.assertRaisesRegex(ValueError, "indistinguishable"):
            greybox.validate_assets(self.replace_glb("greybox-biped.glb", change))
        with self.assertRaisesRegex(ValueError, "rig root"):
            greybox.validate_assets(self.replace_glb("greybox-biped-atlas-b.glb",
                                    lambda document, _: document["nodes"][0].update(name="wrong-root")))

    def test_underweighted_skin_is_rejected(self):
        def change(document, blob):
            index = document["meshes"][0]["primitives"][0]["attributes"]["WEIGHTS_0"]
            accessor = document["accessors"][index]
            offset = document["bufferViews"][accessor["bufferView"]]["byteOffset"]
            struct.pack_into("<f", blob, offset, 0.5)
        with self.assertRaisesRegex(ValueError, "Weights not normalized"):
            greybox.validate_assets(self.replace_glb("greybox-biped.glb", change))

    def test_truncated_glb_and_corrupt_png_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "header invalid"):
            greybox.read_glb(self.assets["greybox-cube.glb"][:-4])
        png = bytearray(self.assets[greybox.TEXTURE])
        png[50] ^= 1
        with self.assertRaisesRegex(ValueError, "CRC"):
            greybox.validate_png(bytes(png))


if __name__ == "__main__":
    unittest.main()
