# scripts/ —— 同步、校验脚本与提交版锁文件

脚本本身的用途见根 [README.md](../README.md#常用开发命令) 的命令表（与 `package.json.scripts`
双向相等，由 `npm run verify:inventory` 守）。本 README 只登记目录里**提交版锁 / 治理文件**的
provenance——它们不是普通生成物，每一份都有显式的 writer 与只读 checker：

| 文件 | 真源 | Writer | 只读检查 | 性质 |
| --- | --- | --- | --- | --- |
| `protected-paths.json` | 人工评审 | 人工（提交中显式声明改了哪条、为什么） | `apps/client/test/protectedPaths.test.ts` 无侵入矩阵（随 `npm run test:client` 进 `verify:core`） | 显式治理锁 |
| `protocol.fingerprint` | `apps/shared/src/protocol/**` + 双协议身份整数 | `node scripts/protocol-fingerprint.mjs --write` | `--check` 与 `protocolFingerprint.test.ts` | 显式协议审计锁 |
| `protected-paths.lock` | `protected-paths.json` 两组手写保护路径的当前字节 | `node scripts/protected-paths-lock.mjs --write` | `npm run verify:protected-paths`（`--check`） | 显式治理锁的执行力 |
| `fgui.manifest.json` | FGUI 设计源、导出物与 View AUTO 区 | `node scripts/fgui-manifest.mjs --write` | `npm run verify:fgui` | 显式资源审计锁 |
| `bitecs.sha256` | 上游 bitECS + 项目补丁 | 维护团队人工 | `npm run verify:ecs` | 内容锁 |
| `vendor.sha256` | 锁定的 Colyseus/FairyGUI 运行时 | `fetch:*` 脚本（维护团队显式升级时） | `npm run verify:vendor` / `test:vendor` | 内容锁 |
| `plugins/<id>.lock` | 已安装插件 `<id>` 的 plugin.json 归一化值 + 全部写入文件的 sha256 清单 | `npm --workspace @game/server run plugin -- install`（uninstall 删除） | `apps/server/test/plugin-lock.test.ts`（随 `npm --workspace @game/server run test` 进 `verify:all`）与 `plugin -- check` | 已安装插件登记面 + 内容锁（docs/PLUGIN.md §5） |

## protected-paths.json（保护路径规则）

canonical 保护路径规则文件（docs/Non-intrusive.md §8.5）。约束的是**普通 plugin / gameplay
module 的新增动线**：清单内的中央文件在该动线中禁手改，仍需手改即视为框架扩展点缺失。
§11.3 的散文清单只是它的视图，矩阵测试对两者做**双向 deepEqual**，任一侧单方面增删即红；
全仓只有这一份规则文件，⛔ 不产生第二份。显式框架侵入（Non-intrusive §12.3）不适用本清单，
但必须在提交中声明并同批更新规则文件与散文视图。
