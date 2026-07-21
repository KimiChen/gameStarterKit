#!/usr/bin/env bash
# 升级 Cocos Creator 的 fairygui-cc 扩展运行时（fairygui.mjs + fairygui.d.ts）。
#
# 运行时**已入库**（连同扩展外壳 package.json/browser.js），新机 clone 即可用——本脚本只在
# **升级版本**时跑：拉 npm 包、验完整性、覆盖运行时，然后把 diff 提交入库。
#
# ⚠ 官方对 3.8 淡维护：生产建议在此基础上打社区 3.8 补丁（mask/输入偏移/GLoader/位图字体，
#   见 docs/CLIENT.md §4 与 Cocos 论坛 topic 153699）——补丁直接改入库的运行时文件并提交，
#   git 追踪补丁演进（⚠ 打过补丁后勿再裸跑本脚本，会用干净的上游版覆盖补丁）。
#   补丁后跑 `node scripts/vendor-lock.mjs` 重钉内容锁（否则 vendorLock.test 红）。
# 用法: npm run fetch:fgui
set -euo pipefail

FGUI_VERSION="1.2.2"
# 该版本 tarball 的 registry 完整性哈希（npm view fairygui-cc@1.2.2 dist.integrity）；
# 升版本时同步更新——内容钉死，registry/镜像源被篡改或分叉时 fail-fast
FGUI_INTEGRITY="sha512-hDxK6xtr8AcTerhJUUe7Hg6i8DiFhvcF/+lOKONRFTlRaPxXtvydzllwchse5ZHqc20oTtNU6aEQ2HG4YZM4Yg=="

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ROOT/apps/Cocos/extensions/fairygui-cc/runtime"
mkdir -p "$RUNTIME"

echo "▶ 从 npm 下载 fairygui-cc@${FGUI_VERSION}…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# 版本钉死（对齐扩展外壳 package.json 的 1.2.x；上游淡维护，⛔ 不飘 latest——各机运行时会分叉）
(cd "$TMP" && npm pack "fairygui-cc@${FGUI_VERSION}" --silent > /dev/null)
TGZ="$(ls "$TMP"/*.tgz)"
ACTUAL="sha512-$(openssl dgst -sha512 -binary "$TGZ" | base64 | tr -d '\n')"
if [ "$ACTUAL" != "$FGUI_INTEGRITY" ]; then
    echo "✘ tarball sha512 不符：期望 $FGUI_INTEGRITY，实得 $ACTUAL——registry/镜像源内容与钉死版本不一致，拒绝落盘" >&2
    exit 1
fi
(cd "$TMP" && tar xzf ./*.tgz)
cp "$TMP/package/dist/fairygui.mjs"  "$RUNTIME/fairygui.mjs"
cp "$TMP/package/dist/fairygui.d.ts" "$RUNTIME/fairygui.d.ts"
node "$ROOT/scripts/vendor-lock.mjs"   # 升级后重钉内容锁（vendorLock.test 校验）

echo "✅ fairygui-cc 运行时已更新：$RUNTIME"
echo "   代码里用：import * as fgui from \"db://fairygui-cc/fairygui.mjs\""
echo "   ⚠ 3.8 需打社区补丁(fairygui-eval §4)；并在 Creator 扩展管理器里启用 fairygui-cc。"
