#!/usr/bin/env python3
"""Summarize O4 color/alpha/local-tile gates and fixed scene/water shader replay.

Water captures use raw RGBA uploads, including RGB in alpha=0 texels. Their results
do not stand in for an engine build or physical mobile-device render.
"""
import argparse
import json
from pathlib import Path
from measure_compression import image_error, sha
from texture_policy import POLICY, quality_failures, limit_failures

ROOT = Path(__file__).resolve().parents[2]


def verify_sources(capture, manifest, trials, variants):
    """Bind render inputs to the exact source/decoded bytes in the measured trial."""
    for key, actual in capture['sourceHashes'].items():
        name = key.lstrip('/')
        variant = variants.get(name)
        expected = (trials['images'][name][variant]['decodedSha256'] if variant
                    else manifest['assets'][name]['sourceSha256'])
        if actual != expected:
            raise ValueError(f'replay texture/data bytes differ: {name} ({variant or "source"})')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True, help='folder containing trials, layout and water-raw')
    args = parser.parse_args()
    base = args.evidence
    trials = json.loads((base / 'trials/report.json').read_text())
    manifest = json.loads((ROOT / 'apps/kits/mapOriginal/data/maps/s1/manifest.json').read_text())
    if trials['contentVersion'] != manifest['contentVersion']: raise ValueError('stale texture trials')
    report = {'contentVersion': trials['contentVersion'], 'trialsSha256': sha(base / 'trials/report.json'),
              'policy': POLICY, 'color': {}, 'render': {}, 'water': {}, 'ok': True}
    if set(trials['images']) != set(POLICY['assets']): raise ValueError('texture trial coverage changed')
    for name, row in trials['images'].items():
        if row['sourceSha256'] != manifest['assets'][name]['sourceSha256']:
            raise ValueError('stale texture trial source: ' + name)
    for block in ('4x4', '5x5'):
        report['color'][block] = {name: quality_failures(row[block]['errors'])
                                  for name, row in trials['images'].items() if POLICY['assets'][name] == 'color'}
    report['ok'] = not any(report['color']['4x4'].values())
    for name in ['grass', 'snow', 'desert', 'luoyang', 'cache-boundary', 'gallery-base', 'gallery-snow', 'gallery-desert']:
        before, after = base / 'layout/png' / name, base / 'layout/4x4' / name
        a, b = (json.loads((p / 'report.json').read_text()) for p in (before, after))
        if a['sourceHashes'].keys() != b['sourceHashes'].keys(): raise ValueError('changed scene texture set')
        verify_sources(a, manifest, trials, {})
        verify_sources(b, manifest, trials, {name: '4x4' for name in trials['images']})
        for field in ['geometrySha256', 'geometryWithoutUv', 'bounds', 'animationSeconds', 'width', 'height', 'background', 'shader', 'drawCalls', 'textureSwitches']:
            if a[field] != b[field]: raise ValueError(f'{name}: changed replay input/output {field}')
        for image in ['overview.png', 'minimap.png']:
            stats = image_error(before / image, after / image)['sampledRgbAllPixels']
            failures = limit_failures(stats, POLICY['renderLimits'], name + '/' + image)
            report['render'][name + '/' + image] = {'beforeSha256': sha(before / image), 'afterSha256': sha(after / image), 'errors': stats, 'failures': failures}
            report['ok'] &= not failures
    reference = base / 'water-raw/png'
    for block in ['4x4', '5x5', 'mask-4x4', 'normal-4x4']:
        candidate = base / 'water-raw' / block
        a, b = (json.loads((p / 'report.json').read_text()) for p in (reference, candidate))
        required = {'/river-mask.png', '/river-normal.png'}
        if set(a['sourceHashes']) != required or set(b['sourceHashes']) != required:
            raise ValueError('changed water texture set')
        if a['shaderSha256'] != sha(ROOT / 'tools/maporiginal-assets/shaders/mapo-river.effect'):
            raise ValueError('stale water shader')
        variants = {name.lstrip('/'): block for name in required} if block in ('4x4', '5x5') else {
            'river-mask.png' if block == 'mask-4x4' else 'river-normal.png': '4x4'}
        verify_sources(a, manifest, trials, {})
        verify_sources(b, manifest, trials, variants)
        for field in ['shaderSha256', 'samples', 'upload']:
            if a[field] != b[field]: raise ValueError('changed water replay ' + field)
        if len(a['samples']) != 13: raise ValueError('missing water sample/time')
        report['water'][block] = {}
        for sample in a['samples']:
            file = sample['name'] + '.png'
            stats = image_error(reference / file, candidate / file)['sampledRgbAllPixels']
            report['water'][block][file] = {'errors': stats, 'failures': limit_failures(stats, POLICY['waterLimits'], file)}
    (base / 'quality-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'ok': report['ok'], 'color4x4': len(report['color']['4x4']),
        'color5x5Rejected': [n for n, f in report['color']['5x5'].items() if f], 'renders': len(report['render'])}))
    if not report['ok']: raise SystemExit(1)


if __name__ == '__main__': main()
