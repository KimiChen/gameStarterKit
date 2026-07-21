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
- **显式验收项**（评审补）：**token 持久化**（微信 storage；现仅内存，重启即需重登）与
  **冷启动自动恢复**（有有效 token → 静默续会话进 Home，失效 → 登录页）；
  连同换号/踢线/掉线场景一起过端到端验收。
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

## ⚠ 支付验签 · 微信支付 APIv3 全链 【上线阻断级】

- **现状**：`apps/server/src/http/pay/wxNotify.ts` 用**共享密钥头占位**（WXPAY_NOTIFY_SECRET），
  代码注释自认「上线前必须换 APIv3 平台证书验签」——伪造回调即可发货，⛔ 不得带着它上线。
- **要做**（APIv3 全链，不止验签一件）：平台证书验签（Wechatpay-Signature/Serial/
  Timestamp/Nonce 四头 + SHA256-RSA2048）；回调报文 AES-256-GCM（APIv3 密钥）解密；
  **证书轮换**（平台证书下载/缓存/按 serial 选取，过期自动更新）；退款接口 + 退款回调；
  **对账**（下载账单 ↔ purchases 状态机核对，差异告警）。
- **入手点**：purchases 状态机/幂等（wx_txn_id 去重）已就绪，只换鉴权与增补链路；
  凭证走 env/KMS（AUTH_DEV_ENABLED 同款「生产缺失即拒启」断言保护 WXPAY 配置项）。
- **触发条件**：接入真实支付前**必须**完成；在此之前 wxNotify 生产环境应直接 501。

## Excel 配置表管线 · 后半程 【中】

- **现状**：只有前半截——`tools/excel-to-json.mjs` 导表脚本 + `config:excel-to-json(:check)`
  npm 命令；**双端消费代码为零**（服务端不读 `apps/server/data/items.config.json`，客户端
  不读 `assets/resources/config/items.json`）、产物未生成入库、`:check` 未进 CI。
- **要做**：生成产物并入库；服务端加载器（启动读 + 类型校验，接 economy/catalog 的
  「将来由 Excel 导表取代」预留位）；客户端加载器（resources 读 + shared 类型）；
  `config:excel-to-json:check` 挂进 CI（表改了没重导 = 红）。
- **触发条件**：第一张真实配置表需求出现时；`:check` 进 CI 可先行（半小时）。

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

## 结算链 · 从「可运行」到生产闭环 【中】

- **现状**（A 批后）：settle worker 有独立入口（npm run settle）、XAUTOCLAIM 接管死消费者
  PEL、网关有流深度告警——「可运行」；但尚未生产闭环。
- **要做**：
  - **DLQ/隔离区**：结构损坏条目现在是「告警 + ACK 丢弃」——改为移入隔离流
    （`stream:match:quarantine` 之类）保留取证；反复失败（非损坏但落库持续报错）的条目
    加 attempts 上限进 DLQ，防单条毒丸卡住消费；
  - **多实例恢复细节**：消费者名 per 主机——同机多 settle 实例会撞名（各领各的 PEL 语义
    失效），需实例序号/env 区分；XAUTOCLAIM min-idle 与处理时长上限的关系写成契约
    （处理慢于 min-idle 会被同伴抢走 → 双处理靠幂等闸兜底，量化验证）；
  - **告警消费**：流深度/DLQ 深度接入 E3 的真实告警通道（现仅 console）；
  - **多消费组安全位点**：verifier 组接入后 XTRIM MINID 取各组位点 min（原 M10 项）。
- **触发条件**：对局战绩/奖励/审计依赖该链路时（= 真实玩法上线前）。

## 区服 openTime 统一校验 【小】

- **现状**：`openTime===0`（未开服）只在 AreaList 的 `choose()` 拦——**默认选服**
  （serverSession.pickDefaultServer：最近服 ul[0] 优先/首个非维护服）与**最终进服维护闸**
  （pages.ts onEnter：只查 t===9）都没查 openTime：未开服区可被默认选中并直接进入。
- **要做**：三处统一为同一判定函数（shared 或 serverSession 导出 `isServerEnterable(s)`：
  `t!==9 && openTime>0`），pickDefaultServer 跳过不可进服、onEnter 维护闸复用；
  服务端 GameRoom/area 侧要不要二次校验一并定（⛔ 不信客户端）。补 pageLogic 用例。
- **触发条件**：无（一小时内）。

## 发布期硬校验 · 生产 URL / HTTPS / 微信合法域名 【小中】

- **现状**：serverUrl/devEnv 全链默认 `http://localhost`；无任何「生产构建禁止 localhost/
  http/ws 明文」的机检。微信真机要求 https/wss + 后台配置合法域名——现在只能靠人记得。
- **要做**：构建/发布期校验脚本（生产构建时：serverUrl 与 area catalog 的 wsUrl 必须
  https/wss、非 localhost/内网段；给出微信后台需登记的域名清单）；服务端生产启动断言
  已有先例（AUTH_DEV_ENABLED/PROJECT_ID），客户端侧缺同款。
- **触发条件**：首次真机/提审前。

## 微信小游戏真实产物构建 CI 【中】

- **现状**：CI 只跑无头检查与真栈集成——**Creator 构建从未进 CI**：tsconfig 排除清单 +
  Cocos strict:false 的类型盲区、fairygui 扩展装配、微信平台产物（4MB 主包水位）全靠
  本地人肉。report:size 也没有消费者。
- **要做**：Cocos Creator 命令行构建（Creator 支持 CLI：`--project --build platform=wechatgame`）
  进 CI（需 Creator 许可证/容器镜像的解法调研）；构建产物跑 report:size 并设水位红线；
  构建失败 = 类型盲区兜底网。做不动全量时，先做「Creator 编译期 tsc」这一半。
- **触发条件**：D3（fairygui 桩）落地后收益最大；首次提审前必须有一次。

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

---

## 近期已修（不在待办，留档防重复登记）

- ~~冷档 ARCHIVE_NEWER + overwrite 重置 fence counter~~ → `f148879`：overwrite 分支保留
  计数器（脚本自身不变量，janitor 门控下原不可达）；构造性回归用例已入 int 套件。
- ~~通用 withUser/uow 冷写不主动 thaw~~ → `f148879`：cold → 锁外 ensureLive → 重试一次
  （fn 重跑幂等约束已注释）；「冻结用户直接 withUser 写入成功」用例已入 int 套件。
