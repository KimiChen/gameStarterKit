#!/usr/bin/env python3
"""按发行商 CDN 的资源清单全量取包（APK 里没有的那部分）。

    python3 fetch_cdn_assets.py --manifest            # 只拉 version_v2.conf 并打印差集
    python3 fetch_cdn_assets.py --run                 # 全量下载（断点续传）
    python3 fetch_cdn_assets.py --run --module scene_2d_S1   # 只拉某些模块（可重复）

★ 线索链（全部来自包内，⛔ 无猜测）：
  `assets/unisdk/ejoy_pack_config.json` → 资源根 `files/data/Library/ejoy_s3`（internal，
    所以真机上读不到）；`assets/pkg/version.conf` → 四组 URL + `mods/sub_mod` 清单。
  频道由 `version.conf` 的 `is_review` 决定：本包 `is_review="true"` ⇒ **REVIEW_RELEASE**。

⚠ **URL 方案（探测实证）**：`{urls[频道]}/Newest/<md5>_<size>.elp`。
  `sound/video/asset_raw/asset_extra` 这些 `is_elp:false` 的模块**也用 `.elp` 后缀**
  （它们在 sub_mod 里有 `base_path`，但 CDN 上仍按 `<md5>_<size>.elp` 寻址）——
  ⛔ 别按 base_path 拼 URL，那是 404。
⚠ 文件名自带 md5 与字节数 ⇒ **校验就是比对文件名**，不必另算哈希；大小不符即重下。
⛔ 产物落仓外（默认 `apkdecode/sgzz-1768.2084/cdn-pkg/`），⛔ 不进仓库。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_OUT = os.path.join(HERE, "out")
APK_PKG = "/Volumes/KimData/unlockTheWorld/apkdecode/sgzz-1768.2084/apktool/assets/pkg"
DEFAULT_OUT = "/Volumes/KimData/unlockTheWorld/apkdecode/sgzz-1768.2084/cdn-pkg"
CHANNEL = "REVIEW_RELEASE"          # ⚠ 由 version.conf 的 is_review 决定
MANIFEST_URL = ("https://p10445-ob-hotfix-cdn.ejoy.com/S3-CN-OB-Publish/"
                "ob_v7_review/Newest/version_v2.conf")
UA = "Mozilla/5.0 (Linux; Android 16) sgzz-asset-fetch/1.0"


def http_get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_manifest(path: str, refresh: bool) -> dict:
    if refresh or not os.path.exists(path):
        print("拉清单 %s" % MANIFEST_URL)
        data = http_get(MANIFEST_URL)
        open(path, "wb").write(data)
        print("  → %s（%.0f KB）" % (path, len(data) / 1024))
    return json.load(open(path, encoding="utf-8"))


def entries(man: dict) -> list:
    out = []
    for m in man["mods"]:
        is_elp = m.get("is_elp", True)
        for s in m.get("sub_mod", []):
            if not s.get("md5") or not s.get("size"):
                continue
            out.append({
                "mod": m["name"], "is_elp": is_elp,
                "module_name": s.get("module_name"), "md5": s["md5"],
                "size": int(s["size"]), "base_path": s.get("base_path"),
                # ⚠ 无论是不是 ELP，CDN 上都叫 <md5>_<size>.elp
                "name": "%s_%d.elp" % (s["md5"], int(s["size"])),
            })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--run", action="store_true", help="真的下载（缺省只统计）")
    ap.add_argument("--manifest", action="store_true", help="只刷新清单并统计")
    ap.add_argument("--refresh", action="store_true", help="强制重拉清单")
    ap.add_argument("--module", action="append", default=[], help="只取这些 module_name（可重复）")
    ap.add_argument("--jobs", type=int, default=6, help="并发数。⚠ 别调太高，这是别人的 CDN")
    a = ap.parse_args()

    os.makedirs(REPO_OUT, exist_ok=True)
    man = load_manifest(os.path.join(REPO_OUT, "version_v2.conf"), a.refresh)
    base = man["urls"][CHANNEL][0].rstrip("/") + "/Newest"
    rows = entries(man)
    have_apk = set(os.listdir(APK_PKG)) if os.path.isdir(APK_PKG) else set()
    os.makedirs(a.out, exist_ok=True)

    todo, skip_apk, done = [], 0, 0
    for r in rows:
        if a.module and r["module_name"] not in a.module:
            continue
        if r["name"] in have_apk:
            skip_apk += 1
            continue
        p = os.path.join(a.out, r["name"])
        if os.path.exists(p) and os.path.getsize(p) == r["size"]:
            done += 1
            continue
        todo.append(r)
    total = sum(r["size"] for r in todo)
    print("清单 %d 条；APK 已有 %d；本地已下 %d；**待下 %d 条 / %.2f GB**"
          % (len(rows), skip_apk, done, len(todo), total / 2 ** 30))
    if not a.run or not todo:
        return 0

    lock = threading.Lock()
    state = {"n": 0, "bytes": 0, "bad": []}
    t0 = time.time()

    def fetch(r):
        p = os.path.join(a.out, r["name"])
        tmp = p + ".part"
        for attempt in range(4):
            try:
                data = http_get(base + "/" + r["name"], timeout=300)
                if len(data) != r["size"]:
                    raise OSError("大小不符 %d != %d" % (len(data), r["size"]))
                open(tmp, "wb").write(data)
                os.replace(tmp, p)
                break
            except Exception as e:                        # noqa: BLE001
                if attempt == 3:
                    with lock:
                        state["bad"].append((r["name"], str(e)))
                    return
                time.sleep(1.5 * (attempt + 1))
        with lock:
            state["n"] += 1
            state["bytes"] += r["size"]
            if state["n"] % 50 == 0 or state["n"] == len(todo):
                el = max(time.time() - t0, 0.001)
                print("  %5d/%d  %6.2f/%.2f GB  %.1f MB/s  剩 %.0f s"
                      % (state["n"], len(todo), state["bytes"] / 2 ** 30, total / 2 ** 30,
                         state["bytes"] / 2 ** 20 / el,
                         (total - state["bytes"]) / max(state["bytes"] / el, 1)))

    with ThreadPoolExecutor(max_workers=a.jobs) as ex:
        list(ex.map(fetch, todo))
    print("完成 %d/%d，失败 %d，耗时 %.0f s" % (state["n"], len(todo), len(state["bad"]), time.time() - t0))
    for n, e in state["bad"][:20]:
        print("  ✘ %s：%s" % (n, e))
    return 1 if state["bad"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
