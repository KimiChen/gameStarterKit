# 部署

## 构建合同

- `scripts/build/package-release.sh` 每次都会清空 `dist`；分别发布 service 和管理 HTTP 时，必须分别构建并在下一次构建前取走对应产物。
- service 构建入口是 `sh scripts/build/package-release.sh service`，运行入口为 `dist/app/index.js`。
- 管理 HTTP 构建入口是 `sh scripts/build/package-release.sh http`，运行入口为 `dist/http/index.js`，同时生成 `dist/tool/index.js`。
- 构建包必须包含 `generated/records/`、`generated/adjust/` 和运行配置，不得包含 `resources/` 或数数工作簿。
- 每个目标构建都会把匹配的 PM2 控制脚本输出为 `dist/pubRestart.sh`；不要混用 service 与 HTTP 构建产生的控制脚本。
- `all` 仅用于本地完整验证，会分别输出 `pubRestart-service.sh` 和 `pubRestart-http.sh`，不会生成含义不清的 `pubRestart.sh`，不得直接作为单一发布包上传。

## 发布和重启

- 上传目标构建的完整 `dist` 后，在发布目录执行其中的 `pubRestart.sh`；service 控制脚本接收 `_ <platform> <version> <start|stop|restart>`。
- service 固定以 `sid=1` 启动；管理 HTTP 与 `ErrorLogMonitor` 是独立 PM2 进程，发布时必须使用 HTTP 构建的脚本共同更新。
- 发布前后核对 PM2 进程名、端口和当日日志；不得通过复制旧控制脚本掩盖产物不匹配。

## Docker 和 CI

- Docker build context 必须是项目根，Dockerfile 使用 `deploy/docker/Dockerfile`；对应忽略文件是 `deploy/docker/Dockerfile.dockerignore`。
- 镜像依赖 Node 基础镜像、USTC Alpine 镜像、项目私有 npm registry 和 `patches/`；网络或 registry 不可达时应先修复构建环境，不要重写锁文件绕过。
- Docker 中固定使用与 lockfile v9 兼容的 pnpm 10，并以 `pnpm install --frozen-lockfile` 安装；本地或 CI 不得用其他大版本重建锁文件。
- GitLab CI 从项目根发现 `.gitlab-ci.yml`，Dockerfile、专用 ignore、package、lock、`.npmrc` 或 patch 变化都必须触发镜像重建。
- Registry 地址和凭据只从 CI 环境提供，文档和仓库不得保存具体密码或临时登录命令。
