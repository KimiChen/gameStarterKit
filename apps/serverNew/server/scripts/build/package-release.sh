#!/bin/sh
set -e

# 要发布的类型是 service、http、all
serviceType=$1
if [ "$serviceType" != "service" ] && [ "$serviceType" != "http" ] && [ "$serviceType" != "all" ]; then
    echo "发布类型不正确，可选值: service、http、all"
    exit 1
fi

# 第一步，使用 Bean transformer 完成严格检查和 JavaScript 编译
rm -rf dist build/compiled
pnpm 编译js

buildHttp=0
buildService=0
if [ "$serviceType" = "http" ] || [ "$serviceType" = "all" ]; then
    buildHttp=1
fi
if [ "$serviceType" = "service" ] || [ "$serviceType" = "all" ]; then
    buildService=1
fi

# 第二步，NCC 只打包已经检查并转换过的 JavaScript
if [ "$buildHttp" -gt 0 ]; then
    pnpm 编译operations
    pnpm ncc -s -t build build/compiled/alloy-server/src/http/main.js -o dist/http
    pnpm ncc -s -t build build/compiled/alloy-server/tools/operations/main.js -o dist/tool

    # 编译migration
    tsc migration/* --outDir dist/migration/
fi

if [ "$buildService" -gt 0 ]; then
    pnpm ncc -s -t build build/compiled/alloy-server/src/main.js -o dist/app
    node scripts/build/build-alloy-core-runtime.mjs production
fi

# 第三步，复制需要的文件
rm -rf dist/src
cp -r generated/records dist/generated/
cp -r generated/adjust dist/generated/
cp -r generated/modules dist/generated/
cp -r config config_game dist/

if [ "$buildHttp" -gt 0 ]; then
    cp -r src/http/views dist/http
fi

if [ "$serviceType" = "service" ]; then
    cp deploy/pm2/service-control.sh dist/pubRestart.sh
elif [ "$serviceType" = "http" ]; then
    cp deploy/pm2/management-http-control.sh dist/pubRestart.sh
else
    cp deploy/pm2/service-control.sh dist/pubRestart-service.sh
    cp deploy/pm2/management-http-control.sh dist/pubRestart-http.sh
fi

node scripts/structure-baseline/verify-build-artifacts.js "$serviceType"
