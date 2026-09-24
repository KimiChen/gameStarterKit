"""Map-only texture policy. Does not alter the global 3D mip/preset contract."""
from copy import deepcopy
import json
import math
from pathlib import Path

POLICY = json.loads(Path(__file__).with_name('texture-policy.json').read_text())


def apply_texture_policy(meta, logical):
    role = POLICY['assets'][logical]  # New runtime textures must be classified explicitly.
    result = deepcopy(meta)
    user = result.setdefault('userData', {})
    user['fixAlphaTransparencyArtifacts'] = False
    if role == 'color':
        user['compressSettings'] = {'useCompressTexture': True, 'presetId': POLICY['preset']}
    else:
        user.pop('compressSettings', None)
    textures = [m for m in result['subMetas'].values() if m['importer'] == 'texture']
    if len(textures) != 1:
        raise ValueError(f'{logical}: expected exactly one texture sub-asset')
    textures[0]['userData']['mipfilter'] = POLICY['mipfilter']
    return result


def validate_builder(builder):
    preset = builder['textureCompressConfig']['userPreset'][POLICY['preset']]
    expected = {POLICY['format']: {'quality': POLICY['quality']}, 'png': {'quality': POLICY['pngQuality']}}
    for platform in POLICY['platforms']:
        actual = preset.get('overwrite', {}).get(platform, preset['options'].get(platform))
        if actual != expected:
            raise ValueError(f'map texture preset drift: {platform}: {actual}')


def limit_failures(stats, limits, label):
    return [f'{label}/{metric}: {stats[metric]} > {limit}' for metric, limit in limits.items()
            if not math.isfinite(stats[metric]) or stats[metric] > limit]


def quality_failures(errors):
    failures = []
    groups = [(f'composite/{bg}/{area}', stats, POLICY['colorLimits'])
              for bg, regions in errors['composite'].items() for area, stats in regions.items()]
    groups.append(('alphaEdge', errors['alphaEdge'], POLICY['alphaEdgeLimits']))
    for label, stats, limits in groups:
        failures.extend(limit_failures(stats, limits, label))
    return failures
