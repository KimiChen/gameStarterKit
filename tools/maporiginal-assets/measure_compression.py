#!/usr/bin/env python3
"""O4 ASTC trials. Source PNGs are read-only; reports/decoded candidates belong in .cache.

Uses Creator's astcenc -cl / -medium (no alpha-weighted or premultiply preprocessing).
Errors are in 8-bit channel units. Local 64px tiles and alpha edges prevent transparent
atlas padding from diluting the result. This does not replace the in-engine/device check.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def astc_info(data):
    if len(data) < 16 or data[:4] != bytes.fromhex('13aba15c'):
        raise ValueError('invalid ASTC header')
    block = list(data[4:7])
    size = [int.from_bytes(data[i:i + 3], 'little') for i in (7, 10, 13)]
    if block[:2] not in ([4, 4], [5, 5]) or block[2] != 1 or size[2] != 1 or min(size) < 1:
        raise ValueError('unsupported map ASTC shape')
    payload = ((size[0] + block[0] - 1) // block[0]) * ((size[1] + block[1] - 1) // block[1]) * 16
    if len(data) != 16 + payload:
        raise ValueError('truncated ASTC or unexpected mip chain')
    return {'size': size[:2], 'block': block[:2], 'levels': 1, 'gpuBytes': payload, 'fileBytes': len(data)}


def error_stats(diff, mask):
    values = diff[mask]
    if not len(values):
        return {'pixels': 0, 'mae': 0, 'p99': 0, 'bad32Fraction': 0, 'worstTileMae': 0}
    worst = 0
    for y in range(0, diff.shape[0], 64):
        for x in range(0, diff.shape[1], 64):
            tile_mask = mask[y:y + 64, x:x + 64]
            tile = diff[y:y + 64, x:x + 64][tile_mask]
            if len(tile):
                worst = max(worst, float(tile.mean()))
    return {'pixels': len(values), 'mae': float(values.mean()), 'p99': float(np.percentile(values, 99)),
            'bad32Fraction': float(np.mean(np.max(values, axis=-1) > 32)), 'worstTileMae': worst}


def image_error(source, candidate):
    a = np.asarray(Image.open(source).convert('RGBA'), dtype=np.float32)
    b = np.asarray(Image.open(candidate).convert('RGBA'), dtype=np.float32)
    if a.shape != b.shape:
        raise ValueError('image dimensions changed')
    visible = np.maximum(a[:, :, 3], b[:, :, 3]) > 0
    alpha = a[:, :, 3]
    edge = (alpha > 0) & (alpha < 255)
    # Include one-pixel silhouette neighbours, also for fully opaque cutouts.
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        edge |= alpha != np.roll(alpha, (dy, dx), (0, 1))
    composites = {}
    for bg in (0, 128, 255):
        ac = a[:, :, :3] * (a[:, :, 3:] / 255) + bg * (1 - a[:, :, 3:] / 255)
        bc = b[:, :, :3] * (b[:, :, 3:] / 255) + bg * (1 - b[:, :, 3:] / 255)
        diff = np.abs(ac - bc)
        composites[str(bg)] = {'visible': error_stats(diff, visible), 'edge': error_stats(diff, edge)}
    return {'composite': composites,
            'alphaEdge': error_stats(np.abs(a[:, :, 3:] - b[:, :, 3:]), edge),
            'sampledRgbAllPixels': error_stats(np.abs(a[:, :, :3] - b[:, :, :3]), np.ones_like(visible)),
            'sampledRgbTransparentPixels': error_stats(np.abs(a[:, :, :3] - b[:, :, :3]), alpha == 0),
            'sampledRgAllPixels': error_stats(np.abs(a[:, :, :2] - b[:, :, :2]), np.ones_like(visible))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--encoder', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    if ROOT / '.cache' not in out.parents:
        raise ValueError('--out must be inside repo .cache')
    source = ROOT / 'apps/kits/mapOriginal/data/maps/s1'
    manifest = json.loads((source / 'manifest.json').read_text())
    encoder_hash = sha(args.encoder)
    report = {'contentVersion': manifest['contentVersion'], 'encoderSha256': encoder_hash,
              'encoderVersion': subprocess.check_output([str(args.encoder), '-version'], text=True).strip(),
              'arguments': ['-cl', '<source>', '<astc>', '<4x4|5x5>', '-medium'], 'images': {}}
    for block in ('4x4', '5x5'):
        folder = out / block
        folder.mkdir(parents=True, exist_ok=True)
        for name, record in manifest['assets'].items():
            if record['type'] != 'texture':
                continue
            png = source / name
            astc = folder / (png.stem + '.astc')
            decoded = folder / name
            identity = {'source': sha(png), 'encoder': encoder_hash, 'block': block, 'quality': 'medium'}
            stamp = folder / (png.stem + '.input.json')
            cache = json.loads(stamp.read_text()) if stamp.exists() else {}
            if not (cache.get('input') == identity and astc.exists() and decoded.exists()
                    and cache.get('astcSha256') == sha(astc) and cache.get('decodedSha256') == sha(decoded)):
                subprocess.run([str(args.encoder), '-cl', str(png), str(astc), block, '-medium', '-silent'], check=True)
                subprocess.run([str(args.encoder), '-dl', str(astc), str(decoded), '-silent'], check=True)
                stamp.write_text(json.dumps({'input': identity, 'astcSha256': sha(astc), 'decodedSha256': sha(decoded)}))
            info = astc_info(astc.read_bytes())
            if info['size'] != record['size']:
                raise ValueError(f'dimensions changed: {name}')
            report['images'].setdefault(name, {'sourceSha256': identity['source'], 'size': record['size'],
                'rgba8Bytes': record['size'][0] * record['size'][1] * 4})[block] = {
                    **info, 'astcSha256': sha(astc), 'decodedSha256': sha(decoded), 'errors': image_error(png, decoded)}
            print(json.dumps({'name': name, 'block': block, 'gpuBytes': info['gpuBytes'],
                'compositeGray': report['images'][name][block]['errors']['composite']['128']['visible']}), flush=True)
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
