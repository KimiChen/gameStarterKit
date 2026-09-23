#!/usr/bin/env python3
"""原版 2D 水面/格线的采样贴图；不重调色、不二次乘 alpha。"""
import argparse
import hashlib
import json
import asset_source as source
from decode_ktx import decode


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--map', default='s1'); args = ap.parse_args()
    out = source.OUT / 'pack' / args.map; out.mkdir(parents=True, exist_ok=True)
    rows = []
    for path, name in [('ground_down/grid_line.ktx', 'grid-line.png'),
                       (f'map/{args.map}/cn/river_color_mask.ktx', 'river-mask.png'),
                       ('scene_3d/water/water_normal2.ktx', 'river-normal.png')]:
        raw = source.resolve(path).read_bytes(); im, fmt = decode(raw); im.save(out / name)
        rows.append({'source': path, 'output': name, 'size': list(im.size), 'format': fmt,
                     'sourceSha256': hashlib.sha256(raw).hexdigest()})
    shader = source.resolve('shaders/3d_water2.fs').read_bytes()
    rows.append({'source': 'shaders/3d_water2.fs', 'sourceSha256': hashlib.sha256(shader).hexdigest(),
                 'port': 'mapo-river.effect: 无结冰状态的 2D normal_river 分支；Flow/Foam 采样未被原 FS 使用'})
    (out/'surface.info.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    print('原版水色蒙版、法线、格线已导出')

if __name__ == '__main__': main()
