# serverNew 迁移区

- `engine/` 是从 `/Users/kk/26/alloy/` 迁入的游戏服务端框架，`server/` 是同时迁入的游戏服务端业务项目。
- 两个目录统一由父级 `gameKit` 仓库管理，不保留各自的 `.git`；修改前先判断需求属于框架能力还是业务逻辑。
- 当前只完成迁入和目录归位，尚未承诺依赖、构建或运行链路可用；后续集成应按明确任务逐项验证。
- `ts-test/` 仅用于用户调研测试，常规开发不要使用或修改。
- 游戏进程按 `--sid` 固定承载一个区服，并从线路目录的 `sN.json5` 读取配置。
- 客户端 HTTP 与 WebSocket 由区服复用同一端口；后台管理 HTTP 必须继续使用独立进程和端口。

## 本地 Cocos Web 原生 Lobby 联调

- 推荐从仓库根目录运行 `node tools/creator-preview/native-lobby-stack.mjs --secret <gmSecret>`；默认使用 Cocos 预览 `7458`、WebPlatform `2570/2571`、原生 Lobby `18091` 和内部动作口 `28090`。
- 浏览器预览必须显式带 `lobby=native&lobbyUrl=ws://127.0.0.1:18091`；`lobbyUrl` 必须与启动日志中的实际监听端口一致。旧端口或端口不一致时，登录页的“开始游戏”会表现为无响应。
- 查询参数要分别传递，不能把 `&lobby=...` 编码进 `server` 参数。启动后先确认 `18091`、`28090`、`7458` 可达，再操作客户端。
- 原生 Lobby transport v2 支持用户数据 `sync`：客户端请求造成的自身变更随同一条 `reply.sync` 返回；没有请求上下文或影响其他在线用户的已提交变更走独立 `sync` 帧。两条出口共用 engine `ModSync` 的模块差异与版本，不额外改变业务响应字段。
