#!/usr/bin/env python3
"""普通点选：city_shape.GRID.click_res=2080，导出 UI XML 的八片布局与时间线。

11009/choose_00_group 是行军状态，不能用于普通点选。原资源只读；图集保留直通 RGBA。
"""
import argparse
import json
import xml.etree.ElementTree as ET
from PIL import Image
import asset_source as source
import land_variants as LV


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--map', default='s1'); args = ap.parse_args()
    row = LV.client_res_rows()[2080]
    root_path = 'fairy/' + row['src_name_common'] + '.xml'
    root = ET.fromstring(source.resolve(root_path).read_bytes())
    child = root.find('displayList/component')
    prefix = 'fairy/ui/ui_common_effect/'
    panel = ET.fromstring(source.resolve(prefix + child.attrib['fileName']).read_bytes())
    width, height = map(float, root.attrib['size'].split(','))
    atlas = Image.new('RGBA', (512, 64)); x = 2; cells = {}; pieces = []
    for image in panel.findall('displayList/image'):
        at = image.attrib; path = prefix + at['fileName']
        if path not in cells:
            im = Image.open(source.sprite(path)).convert('RGBA')
            if x + im.width + 2 > atlas.width or im.height + 4 > atlas.height: raise ValueError('selection atlas overflow')
            atlas.paste(im, (x, 2)); cells[path] = {'rect': [x, 2, im.width, im.height], 'source': path}; x += im.width + 2
        pieces.append({'id': at['id'], 'xy': list(map(float, at['xy'].split(','))),
                       'flip': at.get('flip', ''), **cells[path]})
    def tracks(xml):
        return [dict(item.attrib) for item in xml.findall('transition/item') if item.attrib['type'] in ('Scale', 'Color')]
    # 原包 UI XML importer 0x4d6508：缺省 frameRate=24；0x4d6a98：Quad.Out。
    transition = root.find('transition')
    frame_rate = int(transition.attrib.get('frameRate', 24))
    duration = max(float(item.attrib['time']) + float(item.attrib.get('duration', 0))
                   for item in transition.findall('item'))
    data = {'clientResId': 2080, 'size': [width, height], 'atlasSize': list(atlas.size),
            'frameRate': frame_rate, 'durationFrames': duration,
            'pieces': pieces, 'scaleTracks': tracks(root), 'colorTracks': tracks(panel), 'source': root_path}
    out = source.OUT / 'pack' / args.map; out.mkdir(parents=True, exist_ok=True)
    atlas.save(out / 'choose.png')
    (out / 'choose.info.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    (out / 'choose.data.ts').write_text('/** 生成物：build_choose.py 从普通点选 UI XML 导出；不要手改。 */\n'
        + 'export const MAPO_CHOOSE = ' + json.dumps(data, ensure_ascii=False) + ' as const;\n')
    print('普通点选 2080：8 片 / 291×148；XML Scale + Color 时间线')

if __name__ == '__main__': main()
