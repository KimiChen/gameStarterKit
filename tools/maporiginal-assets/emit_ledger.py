#!/usr/bin/env python3
"""生成九字段素材授权台账（apps/kits/mapOriginal/art/LICENSES.md）。

    /tmp/maporiginal-venv/bin/python emit_ledger.py [--out <path>]

格式照 `apps/plugins/snake/README.md` §2：**每个实际入库的文件登记九个字段，缺一不可**。
状态词典只允许五值：待授权，不得引入 / 已授权，待转换 / 已引入，待验收 / 已验收 / 已移除。

台账分两张表：
  §A 入库产物 —— 真正提交进仓的派生文件（由 out/pack_manifest.json 驱动，P2 install 后才有）
  §B 源素材清单 —— 仓外只读的原始条目，供溯源（sources.jsonl / sprites.jsonl），⛔ 本身不入库
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

# ⚠ 法务 load-bearing：这两行是本批素材的**唯一授权证据**，⛔ 不得删改或泛化。
EVIDENCE = (
    "用户会话指令（2026-09-22）：「阅读 ../sourceVersion/sgzz-2084.1768/ 项目将其中大地图的实现，"
    "在本项目中用一个 kit mapOriginal 来实现，**美术素材完全使用 sgzz-2084.1768**」；"
    "同日就入库口径的选项确认：「切片 PNG 直接入库 + 九字段台账」。"
)
APPROVER = "2026-09-22 / KimiChen（仓库所有者）"
UPSTREAM = "《三国志·战略版》2084.1768（灵犀互娱/简悦），仓外只读逆向产物 apkdecode/sgzz-1768.2084/"


def jsonl(name: str) -> list:
    p = os.path.join(OUT, name)
    return [json.loads(x) for x in open(p, encoding="utf-8")] if os.path.exists(p) else []


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(OUT, "LICENSES.md"))
    a = ap.parse_args()

    srcs = jsonl("sources.jsonl")
    sprites = jsonl("sprites.jsonl")
    packp = os.path.join(OUT, "pack_manifest.json")
    pack = json.load(open(packp)) if os.path.exists(packp) else {}

    L = []
    L.append("# mapOriginal 素材授权台账\n")
    L.append("⚠ **本文件是法务 load-bearing 件，⛔ 不得删改字段或降级表述。**")
    L.append("格式与状态词典照 [`apps/plugins/snake/README.md`](../../../plugins/snake/README.md) §2；")
    L.append("口径依据 [`docs/3D-ASSETS.md`](../../../../docs/3D-ASSETS.md) §14"
             "「逆向来源（`../sourceVersion/*`）按各自全记录的授权口径，转换产物同样登记」。\n")
    L.append("| 项 | 值 |")
    L.append("|---|---|")
    L.append("| 上游 | %s |" % UPSTREAM)
    L.append("| 唯一授权证据 | %s |" % EVIDENCE)
    L.append("| 批准日期与负责人 | %s |" % APPROVER)
    L.append("| 台账生成日期 | 2026-09-22 |")
    L.append("| 状态词典 | 待授权，不得引入 / 已授权，待转换 / 已引入，待验收 / 已验收 / 已移除 |")
    L.append("")
    L.append("⛔ **「网上可见」「同一台机器上存在」「旧项目能运行」都不是授权证据。**")
    L.append("⛔ 原始 ELP / KTX / APK **永远留仓外只读**，不入库、不软链、不进 submodule；只入派生产物。")
    L.append("⛔ 只导入实际像素文件；切片、图集布局、UUID 与 `.meta` 全部由本仓重建，"
             "⛔ 不复制上游的 import / native 元数据关系。\n")

    L.append("## A. 入库产物（每个九字段）\n")
    if not pack:
        L.append("⚠ 尚未执行 P2 的 `install_to_kit.py` —— 本节在内容包落盘后由本脚本重新生成。\n")
    else:
        L.append("| # | Catalog 逻辑名 | 源绝对路径 | SHA-256 | 许可证证据 | 批准 | 目标路径 | 转换/重绘说明 | 新 .meta | 状态 |")
        L.append("|---:|---|---|---|---|---|---|---|---|---|")
        for i, row in enumerate(pack.get("files", []), 1):
            L.append("| %d | `%s` | %s | `%s` | 见抬头 | 见抬头 | `%s` | %s | `%s` | 已引入，待验收 |" % (
                i, row["logical"], row.get("src_abs", "（合成，见说明）"), row["sha256"],
                row["target"], row["convert"], row.get("meta", "本仓确定性铸造")))
        L.append("")

    L.append("## B. 源素材清单（仓外只读，⛔ 不入库）\n")
    L.append("### B.1 直接解码的原始条目（%d）\n" % len(srcs))
    L.append("| Catalog 逻辑名 | ELP 容器/下标 | namehash | 源格式 | 尺寸 | 源 SHA-256 |")
    L.append("|---|---|---|---|---|---|")
    for r in srcs:
        L.append("| `%s` | `%s`/%03d | `%s` | %s | %dx%d | `%s` |" % (
            r["logical"], r["container"][:12], r["idx"], r["namehash"],
            r["src_format"], r["size"][0], r["size"][1], r["sha256"]))
    L.append("")
    L.append("### B.2 图集切片（%d 张，来自上表的图集页）\n" % len(sprites))
    by = {}
    for r in sprites:
        by.setdefault(r["from_atlas"], []).append(r)
    L.append("| 来源图集页 | 切出 | 说明 |")
    L.append("|---|---:|---|")
    for k in sorted(by):
        L.append("| `%s` | %d | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r=\"y\"`)与去白边还原(`oW/oH/oX/oY`) |"
                 % (k, len(by[k])))
    L.append("")
    L.append("完整逐张记录见仓外 `tools/maporiginal-assets/out/{sources,sprites}.jsonl`（已 gitignore，可由管线复现）。")

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as fo:
        fo.write("\n".join(L) + "\n")
    print("台账 -> %s（A 节 %d 条，B.1 %d 条，B.2 %d 张）"
          % (a.out, len(pack.get("files", [])), len(srcs), len(sprites)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
