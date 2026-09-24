#!/usr/bin/env python3
"""Compare O6 incremental GPU output with a full reference upload at the same frozen time."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image


def compare(directory):
    report = json.loads((directory / 'report.json').read_text())
    if not report.get('ok') or not report.get('geometry'):
        raise ValueError('Require a completed --verify animation probe')
    rows = []
    for item in report['geometry']:
        files = [directory / (item['prefix'] + suffix) for suffix in ('-incremental.png', '-reference.png')]
        images = [np.asarray(Image.open(p).convert('RGBA')).astype(np.int16) for p in files]
        if images[0].shape != images[1].shape:
            raise ValueError('Screenshot size mismatch')
        difference = np.abs(images[0] - images[1])
        mae = float(difference.mean())
        over = float(np.any(difference > 8, axis=2).mean())
        rows.append({'name': item['prefix'], 'maeByte': mae, 'pixelsOver8': over, 'maxByte': int(difference.max()),
                     'ok': mae <= 1 and over <= .001,
                     'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
                     'geometry': item['validation']})
    return {'ok': all(r['ok'] for r in rows), 'scope': 'Same engine, camera, shader and frozen animation time; full framebuffer, no omitted regions',
            'reportSha256': hashlib.sha256((directory / 'report.json').read_bytes()).hexdigest(), 'pairs': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    result = compare(args.directory)
    (args.directory / 'pixels.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'ok': result['ok'], 'pairs': len(result['pairs']), 'maxMAE': max(r['maeByte'] for r in result['pairs']),
                      'maxPixelsOver8': max(r['pixelsOver8'] for r in result['pairs'])}))
    if not result['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
