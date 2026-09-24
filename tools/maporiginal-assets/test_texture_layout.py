"""Pixel identity and physical layout regressions; no original package required."""
import copy
import io
import unittest

from PIL import Image

from texture_layout import build_atlas, runtime_textures, validate_textures, validate_trim


class TextureLayoutTests(unittest.TestCase):
    def test_trim_keeps_alpha_one_shadows_and_original_guard_rgb(self):
        original = Image.new('RGBA', (30, 20), (65, 23, 12, 0))
        original.putpixel((9, 7), (132, 47, 200, 1))
        original.putpixel((14, 10), (13, 247, 30, 128))
        page, layout, refs = build_atlas('trim', [('source', original, [300, 200])], trim=True)
        cell = layout['textures'][refs['source']]
        self.assertEqual(cell['storageSize'], [30, 20])
        self.assertEqual(cell['trimRect'], [7, 5, 10, 8])
        x,y,w,h = cell['rect']; cropped = page.crop((x,y,x+w,y+h))
        self.assertEqual(cropped.getpixel((0,0)), (65,23,12,0))
        self.assertEqual(cropped.getpixel((7,5)), (13,247,30,128))
        validate_trim(original, cell['trimRect'], cropped)
        for rect in ([9,7,6,4], [8,5,9,8], [0,0,1,1]):
            with self.assertRaises(ValueError): validate_trim(original,rect,cropped)

    def test_empty_and_canvas_edge_trim_are_deterministic(self):
        empty = Image.new('RGBA', (25,19), (75,32,12,0))
        edge = empty.copy(); edge.putpixel((0,18),(3,4,5,1))
        inputs = [('empty',empty,[25,19]),('edge',edge,[25,19])]
        a, layout, refs = build_atlas('trim',inputs,trim=True)
        b, second, aliases = build_atlas('trim',list(reversed(inputs)),trim=True)
        self.assertEqual(a.tobytes(),b.tobytes()); self.assertEqual(layout,second); self.assertEqual(refs,aliases)
        self.assertEqual(layout['textures'][refs['empty']]['trimRect'],[0,0,1,1])
        self.assertEqual(layout['textures'][refs['edge']]['trimRect'],[0,16,3,3])

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
