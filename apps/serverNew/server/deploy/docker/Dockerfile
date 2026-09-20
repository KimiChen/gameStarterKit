# 使用官方 Node.js 镜像作为基础镜像
FROM node:20.11-alpine

ENV PNPM_VERSION=10.33.0

# 安装zip
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories \
    && apk update \
    && apk add --no-cache zip tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && corepack enable \
    && corepack prepare pnpm@$PNPM_VERSION --activate \
    && apk del tzdata \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/*

# 设置工作目录
WORKDIR /app

# 复制项目的 package 文件和依赖补丁，游戏项目可复用依赖层缓存
COPY package.json pnpm-lock.yaml .npmrc .
COPY patches ./patches
RUN pnpm config set store-dir /app/cache && pnpm install --frozen-lockfile
