"""Pixel identity and physical layout regressions; no original package required."""
import copy
import io
import unittest

from PIL import Image

from texture_layout import build_atlas, runtime_textures, validate_textures


class TextureLayoutTests(unittest.TestCase):
    def test_aliases_keep_full_rgba_and_native_canvas(self):
        a = Image.new("RGBA", (5, 3), (71, 24, 9, 0))
        b = a.copy(); b.putpixel((0, 0), (72, 24, 9, 0))
        atlas, layout, refs = build_atlas("test", [("base", a, [10, 6]), ("snow", a, [10, 6]),
                                                  ("hidden-rgb", b, [10, 6]), ("other-canvas", a, [20, 12])])
        self.assertEqual(refs["base"], refs["snow"])
        self.assertEqual(len(layout["textures"]), 3)
        for source, original in (("base", a), ("snow", a), ("hidden-rgb", b), ("other-canvas", a)):
            x, y, w, h = layout["textures"][refs[source]]["rect"]
            self.assertEqual(atlas.crop((x, y, x+w, y+h)).tobytes(), original.tobytes())
        self.assertTrue(all("sources" not in t for t in runtime_textures(layout).values()))

    def test_stable_ids_and_byte_determinism(self):
        images = [(str(i), Image.new("RGBA", (12+i*3, 8+i*2), (i, 23, 34, 128)), [40, 40]) for i in range(6)]
        a, la, ra = build_atlas("test", images)
        b, lb, rb = build_atlas("test", list(reversed(images)))
        self.assertEqual(la, lb); self.assertEqual(ra, rb)
        ab, bb = io.BytesIO(), io.BytesIO(); a.save(ab, format="PNG"); b.save(bb, format="PNG")
        self.assertEqual(ab.getvalue(), bb.getvalue())
        _, _, rc = build_atlas("test", images + [("large", Image.new("RGBA", (250, 130)), [500, 260])])
        self.assertTrue(all(rc[k] == v for k, v in ra.items()))

    def test_layout_rejects_corruption(self):
        atlas, layout, refs = build_atlas("test", [("x", Image.new("RGBA", (8, 4), (200, 5, 30, 128)), [16, 8])])
        layout["cells"] = [{"id": 17, "source": "x", "textureId": refs["x"]}]
        validate_textures(layout, atlas)
        for key, value in (("contentHash", "0"*64), ("layoutVersion", 999), ("atlasId", "other"),
                           ("trimRect", [0, 0, 7, 4]), ("rect", [-1, 2, 8, 4])):
            broken = copy.deepcopy(layout); broken["textures"][refs["x"]][key] = value
            with self.assertRaises(ValueError): validate_textures(broken, atlas)


if __name__ == "__main__": unittest.main()
