"""不依赖原包的严格边界回归；字段值刻意包含中文、非中心锚点和尾部残留。"""
import struct
import unittest
from prefab_bin import parse, read_component, R


def string(value):
    b = value.encode(); return struct.pack('<I', len(b)) + b


def node(name, children=(), child=False):
    base = struct.pack('<H', 1) + string('default') + struct.pack('<i', 123456) + string(name) + struct.pack('<I', 0)
    base += struct.pack('<9f', 3, 7, 0, 0, 0, 2, 1, 1, 1) + bytes([128, 129, 130, 150, 17, 0, 0, 0])
    base += struct.pack('<hh5BIhI', 0, -2, 0, 0, 1, 1, 1, 0, 0, 0) + string('ground')
    base += struct.pack('<BII', 0, 0, len(children)) + b''.join(children)
    tail = struct.pack('<H2f2B4fB', 1, 816, 471, 1, 0, .020633, -.623905, -43.5742, 0, 1)
    data = struct.pack('<I', len(base)) + base + tail
    return string('node_2d') + struct.pack('<I', len(data)) + (b'\x01' if child else b'') + data


class PrefabParserTest(unittest.TestCase):
    def test_nested_chinese_nodes_and_visual_fields(self):
        root = parse(node('根', [node('雪片', child=True)]))
        self.assertEqual(root['render_level'], 123456)  # i32，不能错读成 i16。
        child = root['children'][0]
        self.assertEqual(child['name'], '雪片')
        self.assertEqual(child['size'], [816, 471])
        self.assertTrue(child['mirror_x']); self.assertFalse(child['mirror_y'])
        self.assertAlmostEqual(child['pivot'][1], -.623905, places=6)
        self.assertAlmostEqual(child['skew'][0], -43.5742, places=4)
        self.assertEqual(child['color'], [128, 129, 130, 150])
        self.assertEqual(child['add_color'], [17, 0, 0, 0])

    def test_truncated_child_and_extra_bytes_are_errors(self):
        for blob in [node('根')[:-1], node('根') + b'junk', node('根', [node('子', child=True)[:-1]])]:
            with self.assertRaises(ValueError): parse(blob)

    def test_unknown_component_is_not_silently_skipped(self):
        with self.assertRaisesRegex(ValueError, '未支持的组件'):
            read_component(R(string('future_component') + struct.pack('<IH', 2, 1)))


if __name__ == '__main__': unittest.main()
