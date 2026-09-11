#!/usr/bin/env python3
"""zjcs-1.2.6 学习包公共读取库：mapinfowrap 解码、区域名表、实体外观表。

只读仓外学习包，不写。所有路径相对 maps.config.json 的 zjcsRoot。
"""
import csv
import json
from pathlib import Path

import msgpack

CONFIG_PATH = Path(__file__).resolve().parent.parent / "maps.config.json"


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def map_config(cfg: dict, map_id: str) -> dict:
    for m in cfg["maps"]:
        if m["id"] == map_id:
            return m
    raise SystemExit(f"maps.config.json 里没有地图 {map_id}")


def zjcs(cfg: dict, *parts: str) -> Path:
    return Path(cfg["zjcsRoot"]).joinpath(*parts)


def config_dir(cfg: dict) -> Path:
    """658 明文版配置根（mapinfowrap / map_area.csv / entity_map_display.csv）。"""
    return zjcs(cfg, "yoo-assets", "embedded-decrypted", "Assets", "Config")


def load_mapinfowrap(cfg: dict, class_id: int) -> dict:
    """返回 {区域号: [实体, ...]}；实体 = [LoEntityId, RefreshGroupId, pub, priv, PosInfo, DefSpawn, ...]。"""
    raw = (config_dir(cfg) / "MapInfoWrap" / f"mapinfowrap_{class_id}_mspack.bytes").read_bytes()
    data = msgpack.unpackb(raw[2:], strict_map_key=False)
    assert data[0] == class_id, f"mapinfowrap_{class_id} 首字段 {data[0]} 不符"
    return data[1]


def load_area_names(cfg: dict, class_id: int) -> dict:
    """map_area.csv → {区域号: 区域名}。"""
    rows = list(csv.reader(open(config_dir(cfg) / "Map" / "map_area.csv", encoding="utf-8-sig")))
    return {int(r[1]): r[2] for r in rows[2:] if r and r[0] == str(class_id) and r[1].isdigit()}


def load_display(cfg: dict) -> dict:
    """entity_map_display.csv → {EntityClassId: (DisplayPath, memo)}（含 MapClassId=0 通用行）。"""
    rows = list(csv.reader(open(config_dir(cfg) / "Map" / "entity_map_display.csv", encoding="utf-8-sig")))
    return {int(r[0]): (r[5], r[8] if len(r) > 8 else "") for r in rows[2:] if r and r[0].isdigit()}


def entity_xy(entity) -> tuple[float, float]:
    """PosInfo（实体第 5 字段）的格坐标。"""
    return entity[4][0][0], entity[4][0][1]


def entity_class_id(entity) -> int:
    """DefSpawnEntityInfo（实体第 6 字段）的 EntityClassId，用于查外观。"""
    d = entity[5]
    return d[0] if isinstance(d, list) and d else 0


def resolve_ground_image(cfg: dict, mc: dict) -> Path:
    """纯地表渲染图：config render.groundImage 为 "@local"（或缺失）时用本管线 out/<id>/ground.png，
    否则按 zjcs map-assets 相对路径（如 renders/Map11_ground_web.jpg）。"""
    render = mc.get("render") or {}
    local = CONFIG_PATH.parent / "out" / mc["id"] / "ground.png"
    src = render.get("groundImage")
    if not src or src == "@local":
        if not local.exists():
            raise SystemExit(f"{mc['id']}: 先跑 render-ground.py 生成 {local}")
        return local
    return zjcs(cfg, "yoo-assets", "map-assets", src)
