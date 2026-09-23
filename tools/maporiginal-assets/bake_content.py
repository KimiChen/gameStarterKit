#!/usr/bin/env python3
"""兼容旧构建入口；远景与缩略图改由近景同源几何烘焙，禁止按 res 调色板散点上色。

需要本机 Chrome 9222；实际实现见 bake_overview.ts，产出 overview.png / minimap.png。
"""
import argparse
import pathlib
import subprocess

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", default="s1", choices=["s1"])
    parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[2]
    raise SystemExit(subprocess.call(["node", "--import", "tsx", "tools/maporiginal-assets/bake_overview.ts"], cwd=root))
