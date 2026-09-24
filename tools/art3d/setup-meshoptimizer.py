#!/usr/bin/env python3
"""Install the integrity-pinned upstream WASM simplifier into an ignored cache."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

HERE = Path(__file__).resolve().parent
DEFAULT = HERE.parent.parent / '.cache/art3d/meshoptimizer-0.25.0'


def install(destination=DEFAULT):
    lock = json.loads((HERE / 'meshoptimizer.lock.json').read_text())
    with urllib.request.urlopen(lock['url'], timeout=60) as response:
        archive = response.read()
    actual = 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode()
    if actual != lock['integrity']:
        raise ValueError('meshoptimizer archive integrity mismatch')
    # Never use extractall: only the two required upstream files and their license.
    wanted = ['meshopt_simplifier.module.js', 'package.json', 'LICENSE.md']
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
        files = {name: tar.extractfile('package/' + name).read() for name in wanted}
    if {name: hashlib.sha256(data).hexdigest() for name, data in files.items()} != lock['files']:
        raise ValueError('meshoptimizer extracted file integrity mismatch')
    if json.loads(files['package.json'])['version'] != lock['version']:
        raise ValueError('meshoptimizer package version mismatch')
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (destination / name).write_bytes(data)
    manifest = {'lock': lock, 'files': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
    (destination / 'integrity.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=DEFAULT)
    args = parser.parse_args()
    print(json.dumps(install(args.out), indent=2))
