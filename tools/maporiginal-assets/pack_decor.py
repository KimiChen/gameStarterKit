#!/usr/bin/env python3
"""land 三套 client_res → 完整 prefab 引用、动画和子节点；禁止主片择大、缺件换级。"""
import argparse
import json
import re
from PIL import Image
import asset_source as source
import land_variants as LV
import prefab_scene
from scene_export import textures, compile_node


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--map', default='s1'); args = ap.parse_args()
    roots, paths, used = {}, {}, set()
    for variant in ('base', 'snow', 'desert'):
        for value in range(2, 47):
            ids = LV.variant_res_ids(value)
            path = LV.res_src_name(ids[variant] or ids['base'])
            root = prefab_scene.load(path)
            roots[variant, value] = root; paths[variant, value] = path
            used.update(textures(root))
    images = []
    for path in sorted(used):
        im = Image.open(source.sprite(path)).convert('RGBA'); native = list(im.size)
        im.thumbnail((256, 192), Image.Resampling.LANCZOS)
        images.append((path, im, native))
    images.sort(key=lambda item: (-item[1].height, -item[1].width, item[0]))
    atlas = Image.new('RGBA', (4096, 4096)); cells = []; x = y = 2; row_h = 0
    for path, im, native in images:
        if x + im.width + 2 > atlas.width: x = 2; y += row_h + 2; row_h = 0
        if y + im.height + 2 > atlas.height: raise ValueError('decor atlas overflow')
        atlas.paste(im, (x, y))
        cells.append({'id': len(cells), 'rect': [x, y, im.width, im.height], 'native': native, 'source': path})
        x += im.width + 2; row_h = max(row_h, im.height)
    cell_of = {c['source']: c['id'] for c in cells}
    variants = {}
    for variant in ('base', 'snow', 'desert'):
        variants[variant] = []
        for value in range(2, 47):
            path = paths[variant, value]
            match = re.search(r'/(wood|stone|food|iron|gold)-new/.*?_(\d+)_group', path)
            if not match: raise ValueError(path)
            variants[variant].append({'id': value, 'kind': 'res', 'variant': variant, 'resType': match[1],
                'level': int(match[2]), 'prefab': path, 'scene': compile_node(roots[variant, value], cell_of)})
    out = source.OUT / 'pack' / args.map; out.mkdir(parents=True, exist_ok=True)
    atlas.save(out / 'decor-atlas.png')
    info = {'schemaVersion': 5, 'mapId': args.map, 'size': list(atlas.size), 'cells': cells,
            'variants': {'resIds': {str(v): LV.variant_res_ids(v) for v in range(2, 47)}},
            'substitutions': [], 'prefabs': 135, 'nodes': sum(sum(1 for n in prefab_scene.walk(root)) for root in roots.values())}
    (out/'decor-atlas.info.json').write_text(json.dumps(info, ensure_ascii=False, indent=1)+'\n')
    ts = '''/** 生成物：pack_decor.py，135 个完整 prefab；不选主片、不借其他等级。 */
import type { IMapoPrefabNode, IMapoPrefabCell } from "./prefabs.types";
export interface IMapoDecorCell {
    readonly id: number;
    readonly kind: "res";
    readonly variant: "base" | "snow" | "desert";
    readonly resType: string;
    readonly level: number;
    readonly prefab: string;
    readonly scene: IMapoPrefabNode;
}
export const MAPO_DECOR_ATLAS_W = 4096;
export const MAPO_DECOR_ATLAS_H = 4096;
'''
    ts += 'export const MAPO_DECOR_TEXTURES: readonly IMapoPrefabCell[] = '+json.dumps(cells,ensure_ascii=False)+';\n'
    for variant, name in [('base','MAPO_DECOR_CELLS'),('snow','MAPO_DECOR_SNOW_CELLS'),('desert','MAPO_DECOR_DESERT_CELLS')]:
        ts += 'export const '+name+': readonly IMapoDecorCell[] = '+json.dumps(variants[variant],ensure_ascii=False,separators=(',',':'))+';\n'
    (out/'decor.data.ts').write_text(ts)
    print(f'完整 prefab:135，节点:{info["nodes"]}，纹理:{len(cells)}，替代等级:0；4096²')

if __name__ == '__main__': main()
