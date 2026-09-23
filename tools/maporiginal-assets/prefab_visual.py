"""静态精灵的完整显示参数。布局与客户端 mapoPrefab.ts 对应，禁止借 native 代替 size。"""
import math
import struct

VISUAL_BYTES = 56


def visual_fields(node):
    out = {key: node[key] for key in ('size', 'pivot', 'skew', 'color', 'add_color', 'mirror_x', 'mirror_y')}
    numbers = [v for key in ('size', 'pivot', 'skew') for v in out[key]]
    if not all(math.isfinite(x) for x in numbers) or min(out['size']) <= 0:
        raise ValueError('非法 prefab 显示参数: ' + str(out))
    return out


def pack_visual(item, cell):
    floats = [*item['pos'], *item['scale'], item['angle'], *item['size'], *item['pivot'], *item['skew']]
    if not all(math.isfinite(x) for x in floats): raise ValueError('非法 prefab transform')
    return struct.pack('>H11f2B8B', cell, *floats, item['mirror_x'], item['mirror_y'],
                       *item['color'], *item['add_color'])
