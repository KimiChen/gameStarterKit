# TODO —— 已识别、未排期

> 来源：2026-07 全面评审后的批次收尾（B/C/D1'/A/E④E⑤① 已落地并提交）。
> 本清单是**剩余项的唯一登记处**：每项含背景与入手点，可独立开工，不依赖当时的讨论上下文。
> 排期原则：标了「触发条件」的等条件到了再做；没标的按需插队。

## D2 · 客户端生命周期状态机 + 玩法入口插件化 【大，先出设计再动】

- **现状**：Main.ts 同时负责启动/导航/HTTP/选服/房间连接/ECS 同步/输入/渲染/失败处理；
  RoomClient、WebSocketClient、GameECS、http token、ViewMgr 均为全局单例；
  Main 静态绑定 ballMove 的 GameECS（fork 换玩法需手动改入口）。
- **目标**：app / session / scene / room 四层生命周期状态机；玩法入口插件化
  （fork 换玩法 = 一处注册）。换号、重连、回登录、切场景、热更新都依赖这个分层。
- **入手点**：net/session（D1' 已建，踢线/掉线/换号事件枢纽）是 session 层的雏形；
  从「Main 只保留 cc 组件壳、编排全部下沉」开始。
- **触发条件**：正式游戏立项 / demo 玩法被替换之前。

## D3 · view 层类型盲区收敛：最小 fairygui 桩 + 契约深解析 【中】

- **现状**：apps/client/tsconfig.json 排除 Main.ts + 9 个 view 文件（cc 桩测不了 fairygui），
  Cocos 侧 strict:false——约 700 行视图绑定层只有 Creator 人工验证（tsconfig 内有 TODO）。
  FGUI 契约（tools/fgui-codegen/parseFgui.ts）只解析根组件直接子项：列表 item、嵌套组件、
  手工 getChild、已发布 .bin 的新鲜度都不在机检内。
- **目标**：对齐 cc-stub 做最小 fairygui 桩（GButton/GTextField/GList/GLoader/GRoot/
  UIPackage/Event 等本仓实际用到的面），把 View 类逐个拉回无头 strict、逐步清空排除清单；
  parseFgui 扩展嵌套/列表 item 解析 + .bin 与 .fui 的新鲜度校验。
- **触发条件**：无（随时可做；约一天）。

## D4 余项 · 服务端安全边界收口 【中】

- 游戏房（GameRoom）消息缺运行时 zod 校验与独立频控（lobby 有、game 房没有）；
- 未知 Lobby RPC 在限流**之前**返回 UNKNOWN_TYPE（可被用作零成本探测/刷日志面）。
- **注**：伪 token 降游客、INTERNAL 泄 message、任意 gid 铸键已在前批修复。
- **触发条件**：对外可访问的部署（内网 demo 可缓）。

## wx.login 微信侧接入 【小】

- **现状**：服务端 /account/wx-login（code2session 全链）就绪，缺 WX_APPID/WX_SECRET 凭证；
  客户端 net/http/account.wxLogin(code) 函数就绪，pages.ts 现走 devLogin。
- **要做**：小游戏环境检测 → wx.login 取 code → wxLogin(code)；devLogin 保留为非微信环境
  （Creator 预览/CI）路径。凭证走 env 注入（KMS，不进代码库）。
- **触发条件**：拿到微信小游戏凭证。

## E1 · 部署成立 【中大】

- tsx 在 devDependencies 且无 dist 构建——`npm ci --omit=dev` 生产装无法启动：
  esbuild 打包服务端到 dist（开发仍 tsx 直跑）；
- `/monitor` 无鉴权常挂——按 NODE_ENV 收权或加 basic auth（playground 已收）；
- SIGTERM 优雅停机：排空在途请求 + 房间收尾 + Redis/MySQL 连接关闭（进程不持权威状态，
  drain 语义见 SERVER.md §3）；
- readiness（依赖就绪）/liveness 端点（/healthz 目前只是进程活着）；
- 四进程编排模板：网关 + relayer + freeze-worker + settle（docker compose 起步）。
- **触发条件**：第一次真实部署前。

## E2 · MySQL migration 版本表 + 分区轮转 【中】

- db-bootstrap 是「全量 schema + 手写 ALTER 数组」，不适合长期多环境升级：
  引入 migrations/ 目录 + 版本表（自研轻量即可，不必上重框架）。
- **⚠ 有时间敏感项**：match_results 只有两个固定分区，**2026-09 起新数据全落 pmax**——
  分区轮转例行任务（建 N+1 月分区/清过期分区）应进 settle worker 或独立 ops 任务。
- **触发条件**：分区轮转部分 **2026-08 前必须做**；migration 框架在下一次 schema 演进前。

## E3 · 观测出口 【中】

- 现状：告警全部 console（[rpc-budget]/loopMonitor/流深度/outbox 滞留），无人消费即无告警；
- 要做：结构化日志（pino 级即可）、metrics 出口（prometheus：事件循环 p99、outbox
  pending 深度/最老年龄、stream:match 深度、freeze/thaw 速率）、告警接到真实通道；
- 顺带：Redis 热档（真源不落库）的 RPO/RTO 明确化——AOF everysec ≈ RPO 1s，写进运维文档
  并给恢复 runbook。
- **触发条件**：E1 同期（部署了没人看 = 白部署）。

## E5② · 协议 schema-first codegen 【中大】

- 现状：Schema ↔ state.ts 手工镜像、TS interface ↔ zod 双维护、C2S/S2C 常量与 handler
  表分别登记；rpc.ts 自认无法阻止「zod 多出必填字段 / 漏掉 shared 可选字段静默剥离」。
  E⑤① 协议指纹硬闸已落地（变更必须显式重钉），这是它的二期。
- 要做：单源（倾向 zod 定义出发）生成 TS 类型 + 服务端校验 + 客户端类型；
  fingerprint 与 PROTOCOL_VERSION 的 bump 规则并入 codegen。
- **触发条件**：协议进入高频变更期（真实玩法开发启动）。

## E6 · 两种拓扑成本文档化 【小】

- README/OVERVIEW 写清楚：**demo 拓扑**（网关 + 本地栈，两条命令）vs **全能力拓扑**
  （网关 + relayer + freeze-worker + settle + MySQL + Redis×2，6 组件）——让 fork 者
  第一天知道账单。顺带把「哪些能力默认关/未接线」列成一张表（FREEZE_ENABLED 等）。
- **触发条件**：无（半小时的事，随下一次文档批捎带）。

## Unity 转译 spike 【探索】

- apps/Unity 骨架声称消费 apps/client 的引擎无关子集（logic/shared/bitecs），但
  bitECS 的 TypedArray/SoA 布局 + 12 文件字节锁约束下，pyts 类 TS→C# 管线从未验证。
- 要做：拿 logic/rooms/ballMove + lib/bitecs 跑一次转译 spike，结论写回 apps/Unity/README
  （可行 → 保留承诺并列出改造清单；不可行 → 收缩为只共享 apps/shared 契约）。
- **触发条件**：决定投入 Unity 之前（⛔ 在 spike 前不得对外承诺双引擎排期）。
