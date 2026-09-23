"""只读原包入口：统一大小写、atlas 别名、容器索引与切片查询。"""
import json
from pathlib import Path
from functools import lru_cache
from build_tops import normalize

HERE = Path(__file__).resolve().parent
CFG = json.loads((HERE / 'assets.config.json').read_text())
OUT = HERE / CFG['outDir']


@lru_cache(None)
def names():
    return {k.lower(): v for k, v in json.loads((OUT / 'name_map.json').read_text()).items()}


@lru_cache(None)
def directory(path):
    p = Path(path)
    return {f.name.split('_', 1)[0]: f for f in p.iterdir()} if p.is_dir() else {}


@lru_cache(None)
def resolve(path):
    p = path.removeprefix('asset/').lower()
    aliases = [p, p + '.bin', normalize(path).lower(), normalize(path).lower() + '.bin']
    row = next((names()[k] for k in aliases if k in names()), None)
    if row is None:
        from namehash import namehash_hex
        wanted = {namehash_hex(alias) for alias in aliases}
        for root in [CFG['elpRoot'], *CFG.get('elpRootsExtra', [])]:
            for container in (Path(root) / 'files').iterdir():
                if not container.is_dir(): continue
                for found in directory(str(container)).values():
                    if found.name.split('_', 1)[-1].split('.')[0] in wanted: return found
        raise FileNotFoundError(path)
    for root in [CFG['elpRoot'], *CFG.get('elpRootsExtra', [])]:
        found = directory(str(Path(root) / 'files' / row['container'])).get(f"{row['idx']:03d}")
        if found: return found
    raise FileNotFoundError(path)


@lru_cache(None)
def slices():
    out = {}
    for line in (OUT / 'sprites.jsonl').open():
        item = json.loads(line)
        out.setdefault(normalize(item['logical']).lower(), OUT / item['out'])
    return out


def sprite(path):
    p = normalize(path)
    found = slices().get(p.lower(), OUT / 'png' / p)
    if not found.is_file(): raise FileNotFoundError('缺切片 ' + path)
    return found
