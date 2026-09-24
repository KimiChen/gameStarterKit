#!/usr/bin/env python3
"""O3 Web PNG 构建审计：地址闭合、无重复主包路径、源文件与 native 字节一致、体积分开。

python3 tools/maporiginal-assets/audit_bundle_build.py --build-dir <web-mobile output> --out <report.json>
不把未压缩的磁盘大小当作下载流量；O4 的压缩平台另设格式验证。
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def audit(base, manifest):
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
    hashes = {hashlib.sha256(p.read_bytes()).hexdigest() for p in native}
    records = [a for a in manifest['assets'].values() if a['type'] in ('texture', 'buffer')]
    for record in records:
        if record['sourceSha256'] not in hashes: raise ValueError(f'PNG / binary 发布字节不符：{record["path"]}')
    if len(native) != len(records): raise ValueError('额外或缺失 native 文件')
    allfiles = [p for p in base.rglob('*') if p.is_file()]
    def size(folder):
        files = [p for p in folder.rglob('*') if p.is_file()]
        return {'files': len(files), 'bytes': sum(p.stat().st_size for p in files)}
    bundles = {p.name: size(p) for p in (base / 'assets').iterdir() if p.is_dir()}
    total = sum(p.stat().st_size for p in allfiles)
    return {'basis': 'Uncompressed Web build files on disk, not network transfer bytes or miniGame main package',
            'mapId': manifest['mapId'], 'contentVersion': manifest['contentVersion'],
            'totalFiles': len(allfiles), 'totalBytes': total, 'bundles': bundles,
            'mapBundleBytes': bundles[name]['bytes'], 'mainApplicationExcludingMapBytes': total - bundles[name]['bytes'],
            'mainResourcesMapPaths': 0, 'verifiedRuntimeAddresses': len(required), 'verifiedNativeFiles': len(native),
            'pngAndBinarySourceSha256Matches': True, 'bundleDependencies': config['deps'],
            'md5ImportEntries': len(config['versions']['import']) // 2, 'md5NativeEntries': len(config['versions']['native']) // 2}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'apps/kits/mapOriginal/data/maps/s1/manifest.json').read_text())
    report = audit(args.build_dir, manifest)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['mapBundleBytes', 'mainApplicationExcludingMapBytes', 'verifiedNativeFiles']}))


if __name__ == '__main__':
    main()
