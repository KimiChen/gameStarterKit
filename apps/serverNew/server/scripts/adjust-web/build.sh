#!/bin/sh
set -eu

SERVER_ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
WEB_ROOT=${NEWGS_WEB_DIR:-"$SERVER_ROOT/../../newgs-web"}
TARGET_ROOT="$SERVER_ROOT/src/http/public"

if [ ! -f "$WEB_ROOT/package.json" ]; then
    echo "未找到 newgs-web: $WEB_ROOT"
    echo "可通过 NEWGS_WEB_DIR 指定源码目录"
    exit 1
fi

VITE_API_BASE_URL= \
VITE_BACKEND_PROFILE=alloy \
VITE_AI_API_KEY= \
VITE_AI_BASE_URL= \
VITE_AI_MODEL= \
pnpm --dir "$WEB_ROOT" build

if [ ! -f "$WEB_ROOT/dist/index.html" ]; then
    echo "newgs-web 构建失败: dist/index.html 不存在"
    exit 1
fi

rm -rf "$TARGET_ROOT"
mkdir -p "$TARGET_ROOT"
cp -R "$WEB_ROOT/dist/." "$TARGET_ROOT/"

WEB_COMMIT=$(git -C "$WEB_ROOT" rev-parse HEAD 2>/dev/null || printf 'unknown')
WEB_DIRTY=false
if ! git -C "$WEB_ROOT" diff --quiet --ignore-submodules -- 2>/dev/null; then
    WEB_DIRTY=true
fi

node "$SERVER_ROOT/scripts/adjust-web/write-build-info.mjs" \
    "$TARGET_ROOT/build-info.json" \
    "$WEB_COMMIT" \
    "$WEB_DIRTY"

echo "调试工具已构建到: $TARGET_ROOT"
