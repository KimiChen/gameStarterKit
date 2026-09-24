#!/usr/bin/env python3
"""O4 发布审计：地址闭合、ASTC 实际头/质量绑定、逐字节 PNG fallback、无额外 mip。

python3 tools/maporiginal-assets/audit_bundle_build.py --build-dir <web-mobile output> --quality-report <trials/report.json> --out <report.json>
不把磁盘大小当作下载流量；GPU 选择与真正 fallback 另由发布包引擎探针验证。
"""
import argparse
import hashlib
import json
from pathlib import Path
from measure_compression import astc_info
from texture_policy import POLICY, quality_failures

ROOT = Path(__file__).resolve().parents[2]


def verify_quality_binding(manifest, quality, previous_manifest=None):
    if quality['contentVersion'] == manifest['contentVersion']: return
    if not previous_manifest or quality['contentVersion'] != previous_manifest['contentVersion']:
        raise ValueError('压缩画质报告版本不符')
    visual = lambda m: {k: v for k, v in m['assets'].items() if v['type'] in ('texture', 'effect')}
    if manifest['mapId'] != previous_manifest['mapId'] or visual(manifest) != visual(previous_manifest):
        raise ValueError('复用画质证据要求所有源纹理、effect、尺寸和地址完全相同')


def audit(base, manifest, quality, previous_manifest=None):
    verify_quality_binding(manifest, quality, previous_manifest)
    configs = {}
    for p in (base / 'assets').glob('*/config.*.json'):
        if p.parent.name in configs:
            raise ValueError(f'多个版本残留，需使用干净构建目录：{p.parent}')
        configs[p.parent.name] = json.loads(p.read_text())
    name = manifest['bundle']
    config = configs[name]
    paths = {v[0] for v in config['paths'].values()}
    required = {'2d/manifest'} | {a['path'] + ('/texture' if a['type'] == 'texture' else '') for a in manifest['assets'].values()}
    if not required <= paths: raise ValueError(f'缺加载地址：{required - paths}')
    for other, cfg in configs.items():
        if other != name and any(v[0].startswith('kits/mapOriginal/') or v[0] in required for v in cfg['paths'].values()):
            raise ValueError(f'{other} 包含重复地图素材')
    native = [p for p in (base / 'assets' / name / 'native').rglob('*') if p.is_file()]
    verified = set()
    textures = {}
    for logical, record in manifest['assets'].items():
        if record['type'] == 'effect': continue
        extension = '.png' if record['type'] == 'texture' else '.bin'
        meta = json.loads((ROOT / 'apps/Cocos/assets/bundles' / name / (record['path'] + extension + '.meta')).read_text())
        uuid = meta['uuid']
        files = list((base / 'assets' / name / 'native' / uuid[:2]).glob(uuid + '.*'))
        expected = {extension}
        compressed = record['type'] == 'texture' and POLICY['assets'][logical] == 'color'
        if compressed: expected.add('.astc')
        if {p.suffix for p in files} != expected or len(files) != len(expected):
            raise ValueError(f'平台变体多余/缺失：{logical}')
        original = next(p for p in files if p.suffix == extension)
        if hashlib.sha256(original.read_bytes()).hexdigest() != record['sourceSha256']:
            raise ValueError(f'PNG fallback / binary 发布字节不符：{logical}')
        verified.update(files)
        if record['type'] != 'texture': continue
        imports = list((base / 'assets' / name / 'import' / uuid[:2]).glob(uuid + '.*.json'))
        if len(imports) != 1: raise ValueError(f'缺失/重复 image import：{logical}')
        def formats(value):
            if isinstance(value, dict):
                return ([value['fmt']] if 'fmt' in value else []) + sum((formats(v) for v in value.values()), [])
            return sum((formats(v) for v in value), []) if isinstance(value, list) else []
        # Creator 3.8.8 ImageAsset.extnames[7]=astc, [0]=png; ASTC_RGBA_4X4=89.
        expected_fmt = '7@89_0' if compressed else '0'
        if formats(json.loads(imports[0].read_text())) != [expected_fmt]:
            raise ValueError(f'ImageAsset 未登记对应变体：{logical}')
        png_bytes = record['size'][0] * record['size'][1] * 4
        row = {'size': record['size'], 'rgba8Bytes': png_bytes, 'gpuBytes': png_bytes,
               'format': 'RGBA8', 'levels': 1, 'native': [str(p.relative_to(base)) for p in files]}
        if compressed:
            astc = next(p for p in files if p.suffix == '.astc')
            info = astc_info(astc.read_bytes())
            if info['size'] != record['size'] or info['block'] != [4, 4]: raise ValueError(f'错误 ASTC 格式：{logical}')
            trial = quality['images'][logical]
            if trial['sourceSha256'] != record['sourceSha256'] or trial['4x4']['astcSha256'] != hashlib.sha256(astc.read_bytes()).hexdigest():
                raise ValueError(f'发布 ASTC 与画质试验不一致：{logical}')
            failures = quality_failures(trial['4x4']['errors'])
            if failures: raise ValueError(f'压缩质量不通过：{logical}: {failures}')
            row.update(info, format='ASTC_RGBA_4X4')
        textures[logical] = row
    if verified != set(native): raise ValueError('额外或缺失 native 文件')
    allfiles = [p for p in base.rglob('*') if p.is_file()]
    def size(folder):
        files = [p for p in folder.rglob('*') if p.is_file()]
        return {'files': len(files), 'bytes': sum(p.stat().st_size for p in files)}
    bundles = {p.name: size(p) for p in (base / 'assets').iterdir() if p.is_dir()}
    total = sum(p.stat().st_size for p in allfiles)
    return {'basis': 'Uncompressed Web build files on disk, not network transfer bytes or miniGame main package',
            'mapId': manifest['mapId'], 'contentVersion': manifest['contentVersion'],
            'qualitySourceContentVersion': quality['contentVersion'],
            'totalFiles': len(allfiles), 'totalBytes': total, 'bundles': bundles,
            'mapBundleBytes': bundles[name]['bytes'], 'mainApplicationExcludingMapBytes': total - bundles[name]['bytes'],
            'mainResourcesMapPaths': 0, 'verifiedRuntimeAddresses': len(required), 'verifiedNativeFiles': len(native),
            'textures': textures, 'astcTextures': sum(t['format'] == 'ASTC_RGBA_4X4' for t in textures.values()),
            'sourceTexturePngBytes': sum(t['rgba8Bytes'] for t in textures.values()),
            'sourceTextureAstcCapableBytes': sum(t['gpuBytes'] for t in textures.values()),
            'pngAndBinarySourceSha256Matches': True, 'bundleDependencies': config['deps'],
            'md5ImportEntries': len(config['versions']['import']) // 2, 'md5NativeEntries': len(config['versions']['native']) // 2}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--quality-report', type=Path, required=True)
    parser.add_argument('--previous-manifest', type=Path, help='仅配置变更时，显式用旧 manifest 核对所有纹理/effect 完全相同；仍逐张核验发布 ASTC hash')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'apps/kits/mapOriginal/data/maps/s1/manifest.json').read_text())
    report = audit(args.build_dir, manifest, json.loads(args.quality_report.read_text()),
                   json.loads(args.previous_manifest.read_text()) if args.previous_manifest else None)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['mapBundleBytes', 'mainApplicationExcludingMapBytes', 'verifiedNativeFiles']}))


if __name__ == '__main__':
    main()
