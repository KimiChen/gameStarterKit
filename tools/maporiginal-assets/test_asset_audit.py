"""O0 audit/packer regressions, no external game package required."""
import random
from pathlib import Path
import tempfile
import unittest

from PIL import Image
import numpy as np

from atlas_layout import pack, trial, validate_layout
from audit_assets import json_exports, pixel_hash, storage_summary, texture_refs, check_refs
from compare_images import compare


class LayoutTests(unittest.TestCase):
    def test_deterministic_and_independent_of_input_order(self):
        rng = random.Random(1701)
        rectangles = [(str(i), (rng.randint(2, 64), rng.randint(2, 64))) for i in range(45)]
        expected = trial(rectangles)
        self.assertIsNotNone(expected)
        for _ in range(5):
            rng.shuffle(rectangles)
            self.assertEqual(trial(rectangles), expected)
        validate_layout(expected["placements"], *expected["size"])
        sizes = dict(rectangles)
        for name, _, _, w, h in expected["placements"]:
            self.assertEqual((w, h), (sizes[name][0]+4, sizes[name][1]+4))

    def test_padding_and_invalid_layouts(self):
        self.assertIsNone(pack([("a", (8, 8))], 10, 10))
        self.assertEqual(pack([("a", (8, 8))], 12, 12), [("a", 0, 0, 12, 12)])
        for placements in ([('a', 0, 0, 4, 4), ('b', 3, 0, 4, 4)], [('a', -1, 0, 4, 4)],
                           [('a', 0, 0, 20, 4)], [('a', 0, 0, 1, 1), ('a', 4, 4, 1, 1)]):
            with self.assertRaises(ValueError):
                validate_layout(placements, 10, 10)
        with self.assertRaises(ValueError):
            pack([('a', (0, 2))], 10, 10)


class AuditTests(unittest.TestCase):
    def test_local_image_error_cannot_hide_in_a_large_background(self):
        before = np.zeros((100, 100, 4), dtype=np.uint8)
        after = before.copy()
        after[50, 50] = 255
        result = compare(before, after, [('selection', (48, 48, 4, 4))])
        self.assertTrue(result['regions'][0]['pass'])
        self.assertFalse(result['pass'])
        self.assertTrue(compare(before, before, [('selection', (48, 48, 4, 4))])['pass'])
        with self.assertRaises(ValueError):
            compare(before, after, [])

    def test_logical_aliases_are_not_extra_stored_images(self):
        entries = [dict(group='choose', rect=[0, 0, 4, 4], rgbaHash='same') for _ in range(8)]
        entries += [dict(group='choose', rect=[8, 0, 4, 4], rgbaHash='same')]
        self.assertEqual(storage_summary(entries), dict(logicalEntries=9, physicalRects=2,
                         uniqueImagesWithinFamilies=1, redundantPhysicalRects=1))

    def test_hash_includes_transparent_rgb_dimensions_and_alpha(self):
        image = Image.new('RGBA', (2, 2), (2, 3, 4, 0))
        self.assertNotEqual(pixel_hash(image), pixel_hash(Image.new('RGBA', (2, 2), (9, 3, 4, 0))))
        self.assertNotEqual(pixel_hash(image), pixel_hash(Image.new('RGBA', (1, 4), (2, 3, 4, 0))))
        self.assertNotEqual(pixel_hash(image), pixel_hash(Image.new('RGBA', (2, 2), (2, 3, 4, 1))))

    def test_frames_tracks_children_and_sentinel(self):
        node = {'texture': 1, 'frames': [-1, 2, 3], 'tracks': [
            {'type': 5, 'keys': [{'value': -1}, {'value': 4}]}, {'type': 1, 'keys': [{'value': 99}]}],
            'children': [{'texture': 5, 'frames': [6]}]}
        self.assertEqual(texture_refs(node), {1, 2, 3, 4, 5, 6})
        self.assertEqual(texture_refs(node, True), {2, 3, 4, 6})
        with self.assertRaises(ValueError):
            texture_refs({'texture': -2})
        with self.assertRaises(ValueError):
            check_refs({7}, [dict(id=1, group='decor')], 'decor')

    def test_generated_constant_parser_is_strict(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'content.ts'
            file.write_text('export const CELLS: readonly number[] = [1,\n2];\nexport const BAD = [3].map(f);')
            self.assertEqual(json_exports(file, ['CELLS']), {'CELLS': [1, 2]})
            with self.assertRaises(ValueError):
                json_exports(file, ['BAD'])
            with self.assertRaises(ValueError):
                json_exports(file, ['MISSING'])


if __name__ == '__main__':
    unittest.main()
