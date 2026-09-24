#!/usr/bin/env python3
"""Build an isolated two-page candidate from the O1 snapshot; never install it.
Keep logical IDs/full animation references. Page classification is storage only.
"""
import argparse
import json
from pathlib import Path
from PIL import Image
from audit_assets import json_exports, texture_refs
from texture_layout import build_atlas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--before', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    args = ap.parse_args()
    if not args.out.resolve().is_relative_to(Path('.cache').resolve()):
        raise ValueError('trial output must be inside .cache')
    names = ['MAPO_DECOR_CELLS', 'MAPO_DECOR_SNOW_CELLS', 'MAPO_DECOR_DESERT_CELLS']
    scenes = json_exports(args.before/'content/decor.data.ts', names)
    animated = set().union(*(texture_refs(c['scene'], True) for a in scenes.values() for c in a))
    meta = json.loads((args.before/'data/decor-atlas.info.json').read_text())
    atlas = Image.open(args.before/'data/decor-atlas.png').convert('RGBA')
    args.out.mkdir(parents=True, exist_ok=True)
    output = {'cells': [None]*len(meta['cells']), 'pages': {}}
    for name, frames in [('decor-other-trial', False), ('decor-frames-trial', True)]:
        chosen = [c for c in meta['cells'] if (c['id'] in animated) == frames]
        images = []
        for c in chosen:
            x,y,w,h = c['rect']
            images.append((c['source'],atlas.crop((x,y,x+w,y+h)),c['native']))
        page, layout, aliases = build_atlas(name,images,trim=True)
        page.save(args.out/(name+'.png'))
        output['pages'][name] = layout
        for c in chosen:
            t = layout['textures'][aliases[c['source']]]
            x,y,w,h = t['rect']; aw,ah = layout['size']
            output['cells'][c['id']] = {'id':c['id'], 'textureId':t['textureId'],
                'rect':[x/aw,y/ah,w/aw,h/ah], 'window':t}
    (args.out/'pages.json').write_text(json.dumps(output,indent=1)+'\n')
    print(json.dumps({k:{'size':v['size'],'textures':len(v['textures'])} for k,v in output['pages'].items()}))

if __name__ == '__main__': main()
