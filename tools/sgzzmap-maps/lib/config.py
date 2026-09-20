"""maps.config.json 的读取与路径解析。⛔ 脚本里不写死任何路径或阈值，一律从配置取。"""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # tools/sgzzmap-maps
REPO = ROOT.parent.parent                              # 仓库根
OUT = ROOT / "out"                                     # 中间产物（.gitignore）


def load(map_id: str) -> dict:
    cfg = json.loads((ROOT / "maps.config.json").read_text(encoding="utf-8"))
    for entry in cfg["maps"]:
        if entry["id"] == map_id:
            entry["_sourceRoot"] = os.path.expanduser(cfg["sourceRoot"])
            return entry
    raise SystemExit(f"maps.config.json 里没有地图 {map_id!r}")


def source_path(cfg: dict, filename: str) -> Path:
    """仓外只读素材。⛔ 绝不写入这个目录。"""
    p = Path(cfg["_sourceRoot"]) / filename
    if not p.is_file():
        raise SystemExit(f"素材缺失：{p}\n（原图留在仓外，见 maps.config.json 的 sourceRoot）")
    return p


def out_dir(map_id: str) -> Path:
    d = OUT / map_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def band(cfg: dict, lod: int) -> dict:
    for b in cfg["bands"]:
        if b["lod"] == lod:
            return b
    raise SystemExit(f"地图 {cfg['id']} 没有 LOD {lod} 的档位配置")
