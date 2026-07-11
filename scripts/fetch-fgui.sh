#!/usr/bin/env bash
# 生成 Cocos Creator 的 fairygui-cc 扩展运行时（fairygui.mjs + fairygui.d.ts）。
#
# 从 npm 下载 fairygui-cc（Cocos Creator 3.4+ / ccc3.0 分支，覆盖 3.8）。运行时体积大、可再生，
# 故 .gitignore 忽略（每台机跑一次 `npm run fetch:fgui`）；扩展外壳（package.json/browser.js）入库。
#
# ⚠ 官方对 3.8 淡维护：生产建议在此基础上打社区 3.8 补丁（mask/输入偏移/GLoader/位图字体，
#   见 docs/research/fairygui-eval.md §4 与 Cocos 论坛 topic 153699），并自维一份 fork。
# 用法: npm run fetch:fgui
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ROOT/apps/client/extensions/fairygui-cc/runtime"
mkdir -p "$RUNTIME"

echo "▶ 从 npm 下载 fairygui-cc…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(cd "$TMP" && npm pack fairygui-cc --silent > /dev/null && tar xzf ./*.tgz)
cp "$TMP/package/dist/fairygui.mjs"  "$RUNTIME/fairygui.mjs"
cp "$TMP/package/dist/fairygui.d.ts" "$RUNTIME/fairygui.d.ts"

echo "✅ fairygui-cc 运行时已更新：$RUNTIME"
echo "   代码里用：import * as fgui from \"db://fairygui-cc/fairygui.mjs\""
echo "   ⚠ 3.8 需打社区补丁(fairygui-eval §4)；并在 Creator 扩展管理器里启用 fairygui-cc。"
