# 项目初始化与元数据

`project.metadata.json` 是 Starter 的项目身份真源。它记录项目命名空间、包名、展示名、Demo 品牌、
生成目录和第三方运行时来源；服务端和客户端不应各自维护一份项目名常量。

## 初始化

在仓库根目录运行：

```bash
npm run init:project -- \
  --project-id arena \
  --name arena-kit \
  --display-name "Arena Kit" \
  --scope @example \
  --brand ballMove
```

可用选项：

| 选项 | 说明 |
| --- | --- |
| `--project-id` | Redis 前缀和 MySQL 库名使用的命名空间；必须匹配 `^[a-z][a-z0-9_]{0,31}$`。 |
| `--name` | npm 项目名片段；用于根包和 Cocos 客户端包。 |
| `--display-name` | 面向开发者/玩家显示的项目名，可含空格。 |
| `--scope` | workspace 的 npm scope；可写 `example` 或 `@example`，写 `none`/`unscoped` 表示不使用 scope。 |
| `--brand` | 当前 Demo 或玩法品牌，例如 `ballMove`。 |
| `--root` | 另一个 Starter checkout 的根目录；默认是当前仓库。 |
| `--dry-run` | 只列出将更新的文件，不写文件，也不运行同步。 |
| `--force` | 允许覆盖已有 `project.metadata.json` 身份冲突或修复已漂移的包名。 |
| `--skip-verify` | 写入并同步后跳过 `verify:core`，仅适合离线或正在迁移的工作树。 |

命令是幂等的：重复使用相同参数不会产生额外文件变更。检测到已有元数据与参数不一致时默认拒绝，
避免在错误目录中覆盖身份；确认目标后才使用 `--force`。初始化完成后会先执行 `npm run sync:shared`，
再执行 `npm run verify:core`（除非显式跳过）。

## 身份与包名

元数据中的 `projectId` 是运行时区隔离标识，不等于 npm 包名。`name` 和 `scope` 推导出以下包名：

| 元数据键 | 默认仓库路径 | 推导规则 |
| --- | --- | --- |
| `packages.root` | 根 `package.json` | `<scope>/<name>`，无 scope 时为 `<name>` |
| `packages.shared` | `apps/shared/package.json` | `<scope>/shared` |
| `packages.server` | `apps/server/package.json` | `<scope>/server` |
| `packages.website` | `apps/website/package.json` | `<scope>/website` |
| `packages.client` | `apps/Cocos/package.json` | `<name>-client`（Cocos 工程包不使用 npm scope） |

初始化器会同步根 `package-lock.json`、说明站 lockfile、server 对 shared 的依赖和源码中的 workspace
导入；不会改写外部身份包 `@gono/webplatform-contract`。`apps/shared/src/project.ts` 由元数据生成，
通过 `apps/shared/src/index.ts` 导出，服务端/客户端可安全读取这些无依赖常量。

## 生成区边界

源码与镜像关系登记在 `project.metadata.json.generated`：

```text
apps/shared/src ── sync:shared ──▶ apps/client/src/shared
                                  └▶ apps/Cocos/assets/src/shared
apps/client/src ── sync:client ──▶ apps/Cocos/assets/src
```

镜像目录和 `.meta` 文件禁止手改。改动 shared 或 client 源码后分别运行同步命令；`verify:project` 检查
登记的源/镜像目录和身份文件存在，`verify:sync` 检查逐字节一致性。

## 第三方来源与许可证

`project.metadata.json.thirdParty` 为入库运行时的 provenance 登记，包含来源 URL、版本、许可证、产物
路径以及 `THIRD_PARTY_NOTICES.md` 的登记文件。当前仓库自身使用 MIT，许可证全文在根 `LICENSE`；第三方
许可证不被项目许可证替代，升级 vendored 运行时时应同时更新来源记录和对应内容锁。

只读检查：

```bash
npm run verify:project
npm run verify:core
```

`verify:project` 不连接 Redis、MySQL 或外部 WebPlatform，因此可在初始化迁移的早期阶段单独运行；
跳过 `verify:core` 不会跳过元数据写入后的镜像同步。
