"""不依赖原包的严格边界回归；字段值刻意包含中文、非中心锚点和尾部残留。"""
import struct
import unittest
from prefab_bin import parse, read_component, read_drawable_tail, R
from build_blocks import validate_polygon_uv


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
    def test_polygon_uv_fields_follow_native_serializer_order(self):
        tail = struct.pack('<H2f2B4fB', 1, 256, 256, 0, 0, .5, .5, 0, 0, 1)
        tail += struct.pack('<H4B', 1, 0, 0, 0, 0) + string('material') + struct.pack('<IIH', 4, 0, 0)
        tail += struct.pack('<5I', 0, 0, 0, 0, 0)  # 五个空几何/属性数组
        tail += struct.pack('<3B5f', 1, 0, 1, 2, 3, 30, 17, -9) + string('ground.png')
        reader, poly = R(tail), {'class': 'polygon_2d'}
        read_drawable_tail(reader, poly)
        self.assertEqual(reader.left(), 0)
        self.assertEqual([poly[k] for k in ('has_v_color', 'simple', 'calc_uv_in_world')], [True, False, True])
        self.assertEqual(poly['uv_scale'], [2, 3])
        self.assertEqual(poly['uv_angle'], 30)
        self.assertEqual(poly['uv_offset'], [17, -9])

    def test_block_export_rejects_unsupported_uv_instead_of_silently_simplifying(self):
        valid = dict(simple=False, calc_uv_in_world=True, uv_scale=[1, 1], uv_angle=0, uv_offset=[0, 0])
        validate_polygon_uv(valid, 'fixture')
        for key, value in dict(simple=True, calc_uv_in_world=False, uv_scale=[2, 1], uv_angle=90, uv_offset=[1, 0]).items():
            with self.assertRaisesRegex(ValueError, key):
                validate_polygon_uv({**valid, key: value}, 'fixture')

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
