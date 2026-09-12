# Server AI 入口

先按改动路径选择最近的 README，再打开目标文件；不要先通读整个 `src/` 或 `test/`。

| 改动路径 | 先读 | 常用验证 |
| --- | --- | --- |
| `src/rooms/**` | `src/rooms/README.md` | `npm run test:rooms` |
| `src/websocket/**` | `src/websocket/README.md` | `npm run test:websocket` |
| `src/http/**` | `src/http/README.md` | `npm run codegen:http -- --check` |
| `src/core/**` | `src/core/README.md` | `npm run test:core` |
| `src/platform/**` | `src/platform/README.md` | `npm test -- --test-name-pattern='auth|webplatform'` |
| `tools/*codegen/**` | 对应目录 README | `npm run test:codegen` |

生成物只通过对应命令刷新：`codegen:http`、`codegen:gameplays`、`codegen:plugins`。跨 workspace 的同步由仓库根命令负责。
