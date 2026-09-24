#!/usr/bin/env python3
"""只读复核已安装图集与原切片 RGBA、381 个入口及其完整引用树。需要原包与已切片 out。"""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image
import asset_source as source
import land_variants as LV
import prefab_bin
import prefab_scene
from build_tops import FAMILIES
from texture_layout import resolved_cells, validate_textures


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--map', default='s1'); ap.add_argument('--report'); args = ap.parse_args()
    data = Path(__file__).resolve().parents[2] / 'apps/kits/mapOriginal/data/maps' / args.map
    read = lambda name: json.loads((data / name).read_text())
    decor, city, region = (read(n) for n in ('decor-atlas.info.json', 'cities.info.json', 'region-atlas.info.json'))
    paths = {p['source'] for p in city['pieces']}
    cr = LV.client_res_rows()
    paths.update(cr[rid]['src_name'] for m in decor['variants']['resIds'].values() for rid in m.values())
    paths.update(cr[rid]['src_name'] for m in region['variants']['resIds'].values() for rid in m.values())
    for kind, template in FAMILIES:
        paths.update(e[0][:-6] + '_top_group.prefab.bin' for e in json.loads(source.resolve(template % args.map).read_text()))
    nodes = 0
    for path in sorted(paths):
        prefab_bin.parse(source.resolve(path).read_bytes())
        nodes += sum(1 for _ in prefab_scene.walk(prefab_scene.load(path)))
    assert len(paths) == 381, len(paths)
    assert decor['substitutions'] == []
    report = {'prefabEntries': len(paths), 'expandedNodes': nodes, 'substitutions': 0, 'atlases': {}}
    layouts = {'region': region, 'city': city['atlas'], 'road': read('roads.info.json')['atlas']}
    layouts.update({kind+'-top': atlas for kind, atlas in read('top-atlas.info.json')['atlases'].items()})
    for name, layout in layouts.items():
        with Image.open(data / (name+'-atlas.png')) as image:
            validate_textures(layout, image.convert('RGBA'))
    groups = [('decor', decor['cells'], (256, 192)), ('city', resolved_cells(city['atlas']), None),
              ('region', resolved_cells(region), tuple(region['storageLimit'])),
              ('road', resolved_cells(read('roads.info.json')['atlas']), None)]
    groups += [(kind + '-top', resolved_cells(a), None) for kind, a in read('top-atlas.info.json')['atlases'].items()]
    choose = read('choose.info.json')
    groups.append(('choose', list({p['source']: p for p in choose['pieces']}.values()), None))
    for name, cells, thumbnail in groups:
        atlas = Image.open(data / (name + ('' if name == 'choose' else '-atlas') + '.png')).convert('RGBA')
        semi, pixels = 0, 0
        for c in cells:
            im = Image.open(source.sprite(c['source'])).convert('RGBA')
            x, y, w, h = c['rect']
            if 'native' in c: assert list(im.size) == c['native'], f'{name}: native canvas changed'
            if thumbnail: im.thumbnail(thumbnail, Image.Resampling.LANCZOS)
            else: im = im.resize((w, h), Image.Resampling.LANCZOS)
            expected = np.asarray(im)
            actual = np.asarray(atlas.crop((x, y, x + w, y + h)))
            assert np.array_equal(expected, actual), f'{name}: RGBA 改变 {c["source"]}'
            semi += int(((expected[:, :, 3] > 0) & (expected[:, :, 3] < 255)).sum())
            pixels += w * h
        report['atlases'][name] = {'cells': len(cells), 'pixels': pixels, 'semiTransparentPixels': semi, 'rgbaMismatch': 0}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.report: Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__': main()
