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

## D3 · view 层**可无头单测**：最小 fairygui 桩 + 契约深解析 【中】

> ⚠ **2026-07 重新表述**：本条以前叫「类型盲区收敛」，把目标写成"把 View 类拉回 strict 检查"——
> **重点是偏的**。类型那一半其实已经有闸了（见下），D3 真正换来的是**能不能写测试**。

- **类型这一半：已覆盖，但只在本地。** `apps/Cocos/tsconfig.json` 曾显式 `strict: false`，
  已删除（`4517d77`，实测开关两侧皆 0 错），现继承 Creator base 的 `strict: true`；
  `--listFiles` 确认它真的在检 `Main.ts`/`view/*.ts`，解析的是**真 fairygui d.ts**。
  ⛔ **但它不是机检**：该 tsconfig `extends` 的 `temp/` 是 Creator 生成物、已 gitignore
  ⇒ 无头 CI 里 resolve 不了。进 CI 那条路是「微信小游戏真实产物构建 CI」条目，⛔ 不是 D3。
- **测试这一半：完全空白，这才是 D3 的目标。** `apps/client/tsconfig.json`（无头线，自带 50 行
  cc 桩）排除 `Main.ts` + 9 个 view 文件——因为 fairygui-cc 的 d.ts 又引真 cc，50 行桩顶不住。
  排除的真正代价**不是没类型**，而是这些文件**无法被无头 `import`** ⇒ 写不了单测。
- **⚠ 为什么这很要紧（有实例）**：2026-07 评审打中的四条客户端缺陷（`enterBattle` 无世代号 /
  订阅解绑器被丢弃 / `openConfirm` detached promise 悬挂 / 连接端点不一致）**全是时序与生命周期
  问题，类型完全合法** ⇒ strict 一条都抓不到（已实测：修复前后皆 0 类型错误）。
  能抓住它们的只有针对这些文件的单测，而那正是本条要解锁的东西。
  ⚠ 反过来也要诚实：`net/session.ts` 的订阅 API **在检查范围内、也有 session.test.ts**，
  它返回解绑器这件事是对的——**缺陷落在没被测的 `Main.ts` 那一侧**。分界线本身就是风险线。
- **要做**：① 对齐 cc-stub 做最小 fairygui 桩（GButton/GTextField/GList/GLoader/GRoot/
  UIPackage/Event 等本仓实际用到的面），把 10 个文件逐个搬出排除清单，**目标是能 import 进单测**，
  strict 只是顺带；② parseFgui 扩展嵌套/列表 item 解析 + `.bin` 与 `.fui` 的新鲜度校验。
- **⚠ 工作量存疑**：原写"约一天"，但把 9 个 view 文件拉进无头 strict 大概率炸出一批既有类型错误
  （Cocos 侧 0 错 ≠ cc 桩侧 0 错，两边的 cc 类型不是同一套）。开工前先估一次真实错误量。
- **⚠ 那条"先评估 lint"的建议已结案**：见 **E7**（结论不引入；`no-floating-promises` 的能力已由
  `test/floating-promise.test.ts` 零依赖复刻）。⛔ 别再把 lint 当 D3 的替代——实测它对 D3 范围内的
  10 个文件**只多抓 1 处**（`ViewMgr.ts`），`Main.ts` 本身 **0 处** ⇒ **两者互补，不能二选一**。
- **触发条件**：无（随时可做）。

## ⚠ 支付接入 · 微信小游戏支付方案与全链 【上线阻断级】

- **现状**：`apps/server/src/http/pay/wxNotify.ts` 用**共享密钥头占位**（WXPAY_NOTIFY_SECRET），
  代码注释自认「上线前必须换 APIv3 平台证书验签」——它无法证明请求来自微信，共享密钥
  一旦泄漏，任意调用方都能伪造发货；`createOrder()`
  只有内部函数、没有下单端点，客户端也没有支付调起代码；当前 SKU 发的是游戏内虚拟资产，
  却尚未确认应走小游戏虚拟支付还是普通微信支付，⛔ 当前不是可上线的支付链。
- **先做通道决策闸**：按上线地区、主体、终端平台及商品性质，对照**接入时最新微信小游戏
  官方规则**确认支付产品；游戏币/皮肤/道具等虚拟商品不得想当然套用小程序
  `wx.requestPayment`。结论、平台限制、费率/结算差异及降级策略写成 ADR，再允许实现：
  - 若走**小游戏虚拟支付/Midas**：服务端按官方协议创建业务订单并生成支付签名，客户端调用
    当期小游戏虚拟支付 API，服务端校验发货通知、商品 ID/价格/数量/用户/订单并幂等发货；
  - 只有商品和主体明确允许走**普通微信支付**时，才使用 APIv3 JSAPI/小程序下单：商户请求
    签名 → `prepay_id` → 服务端生成客户端调起参数 → `wx.requestPayment`；回调做平台证书验签
    （Wechatpay-Signature/Serial/Timestamp/Nonce + SHA256-RSA2048）、AES-256-GCM 解密、
    时间窗/重放防护及证书按 serial 自动轮换。HTTP 层必须保留**原始请求体**，先对 raw body
    验签，再解密并做 schema 校验，⛔ 不得拿解析后重新序列化的 JSON 验签。
- **两条通道都必须闭环**：查单/超时订单收敛、退款及退款回调、账单对账、差异告警和人工修复；
  退款状态 CAS、ledger 幂等以及已发虚拟资产的补偿/追回策略；客户端成功回调不作为发货依据，
  金额与商品配置以服务端为准。
- **入手点**：purchases 状态机/幂等（wx_txn_id 去重）可复用；先把支付通道抽象与渠道订单号
  纳入模型，避免把现有 APIv3 占位字段固化成唯一方案。凭证走 env/KMS，生产缺失即拒启。
- **触发条件**：接入真实支付前**必须**完成；在此之前 wxNotify 生产环境应直接 501。

## Excel 配置表管线 · 后半程 【中】

- **现状**：只有前半截——`tools/excel-to-json.mjs` 导表脚本 + `config:excel-to-json(:check)`
  npm 命令；**双端消费代码为零**（服务端不读 `apps/server/data/items.config.json`，客户端
  不读 `assets/resources/config/items.json`）、产物未生成入库、`:check` 未进 CI；当前
  `--check` 只校验源表且跳过输出，**不会比较入库 JSON**，还不能发现“表改了但没重导”。
- **要做**：生成产物并入库；服务端加载器（启动读 + 类型校验，接 economy/catalog 的
  「将来由 Excel 导表取代」预留位）；客户端加载器（resources 读 + shared 类型）；
  把生成过程抽成纯函数，使 `--check` 在内存生成规范化的服务端/客户端 JSON，与入库产物
  **逐字节比较**（缺失或漂移即失败），再把 `config:excel-to-json:check` 挂进 CI。
- **触发条件**：第一张真实配置表需求出现时；漂移闸可先行，但顺序必须是「增强 check →
  首次生成并提交两份产物 → 挂 CI」，不能把当前只校验源表的命令直接挂上去。


## D4 余项 · 服务端安全边界收口 【中】

- 游戏房（GameRoom）消息缺运行时 zod 校验与独立频控（lobby 有、game 房没有）；
- 未知 Lobby RPC 在限流**之前**返回 UNKNOWN_TYPE（可被用作零成本探测/刷日志面）。
- **注**：伪 token 降游客、INTERNAL 泄 message、任意 gid 铸键已在前批修复；
  WebPlatform 侧的同类泄漏（Fastify 默认错误处理回显原始 MySQL 错误码/文本）已补 `setErrorHandler`。
- **触发条件**：对外可访问的部署（内网 demo 可缓）。

## D6 · 客户端「回登录页」收敛成单一出口 【小】

- **现状**（本批已修三处泄漏后仍在）：回登录页的路径有 authInvalid / battleLost / connLost /
  abortBattle 四条，各自手写「拆战斗态 + 退大厅 + 开登录页」的组合。这批修复是逐条补齐的，
  ⛔ 下次再加一条路径大概率还会漏掉其中一步。
- **要做**：抽一个 `returnToLogin(reason)` 出口，四条路径全部改调它；`Main` 与 `pages` 的职责
  切分保持现状（Main 拆战斗态、pages 做导航）。
- **触发条件**：无（随 D2 状态机做最省，但可独立先行）。

## A4 · 部署形态的测试覆盖：CI 只初始化一个库 【中】

- **现状**：split 的 e2e 在**同进程同库**跑（测试进程内起 WebPlatform Fastify、两侧共用一个 MySQL）
  ⇒ 它证的是**接缝正确**，⛔ 证不了真 split 的部署形态（跨进程、独立账号库、LB 之后）。
  docs 里两处「split 全链 e2e 绿」已按此收窄。
- **⚠ 别读成"集成测试没用"**：现有集成测试对 in-process 形态完全有效，失效的只是**对 split 的推论**。
- **✅ 目标形态已拍板（2026-07-26）**：**独立进程 + 独立数据库**——即 WebPlatform 单独起进程、
  账号库与组库**物理分离**。⇒ A4 要覆盖的正是这个形态，⛔ 不必再为"要不要分库"留分支。
- **要做**：CI 起两个库（账号库/组库分开）+ 跨进程拉起 WebPlatform 的一条冒烟；与「两物理组测试拓扑」
  （DUAL_MODE §5.4/§6.3）可合并排期。
- **⚠ 分库后会立刻暴露的既有待办**：**W2**（组侧 `banUser` 的 `auditLogin` 写的是**组库**，
  分库后封号审计就真的落错库了）；`db-bootstrap` 目前只建一套 schema，需要拆出账号库那半
  （回问 Q8「哪些表归 WebPlatform 库、由谁提供建库脚本」——这条不定，split 就没有可执行的部署路径）。
- **触发条件**：split 形态启用前。

## wx.login 微信侧接入 【小，编号 D5】

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
  - **XAUTOCLAIM 游标/公平性**：不能每轮固定从 `0` 开始并丢弃返回 cursor；保存下一起点，
    按有界批次续扫直至 `0-0` 后再开启新一轮，保证 PEL 很大或前段持续活跃时尾部孤儿也能被接管；
    增加「超过 COUNT 的多页 PEL + 前段未过 min-idle + 尾部已过期」回归用例；
  - **告警消费**：流深度/DLQ 深度接入 E3 的真实告警通道（现仅 console）；
  - **多消费组安全位点**：verifier 组接入后 XTRIM MINID 取各组位点 min（原 M10 项）。
- **触发条件**：对局战绩/奖励/审计依赖该链路时（= 真实玩法上线前）。

## 区服 openTime 服务端硬校验 【小】

- **现状**：客户端三处已统一为 shared `isServerEnterable(s)`（`t!==9 && openTime>0`，
  protocol/http.ts）：pickDefaultServer 跳过不可进服（全不可进兜底 al[0] 展示位）、
  AreaListLogic.choose 拦截（运维模式 isOps 豁免——维护/未开服的开服前验证可选中）、
  pages.ts onEnter 进服闸（同豁免，文案分「维护中」「未开服」）。**但这些全是 UX**：
  服务端在房间准入上对维护态/openTime 零校验，绕过客户端直连仍可进。
- **要做**：每个游戏服实例由生产配置注入可信 `SERVER_ID`（当前尚无），启动时从服务端目录
  解析自身区服，GameRoom/准入层按该目录项的维护态/openTime 做硬校验，**直接复用 shared
  `isServerEnterable`**（⛔ 不信客户端传入的 sId/t/openTime，客户端值最多用于一致性核对）。
  补绕过客户端直接进房的服务端拒绝用例；生产缺失/未知 `SERVER_ID` 应拒绝启动。
- **触发条件**：部署配置（实例→区服映射的注入方式）确定后。

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
  drain 语义见 SERVER.md §3）。
  **⚠ 网关不是裸奔**——Colyseus 默认注册 SIGTERM→房间收尾；真正空白的是
  **WebPlatform / relayer / freezeWorker 三个入口**，别把工作量估成四份；
- readiness（依赖就绪）/liveness 端点。**⚠ 小修正**：WebPlatform 的 `/healthz` 已带 `SELECT 1`，
  缺的是**游戏服侧**与统一语义（游戏服 `/healthz` 目前只是进程活着）；
- **五**进程编排模板：网关 + relayer + freeze-worker + settle **+ WebPlatform**（docker compose 起步）。
  ⚠ 此前本行漏了 WebPlatform（split 形态下它是登录入口，漏了就没有可执行的部署路径）。
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

## E7 · eslint：**已评估、结论暂不引入**（留档，⛔ 别再从零讨论一遍）【存档】

> 2026-07-26 完整评估过一轮。**结论：不引入**，改用「tsc 严格性开关 + 自制机检」两条更划算的路。
> 本条留档的目的是 ⛔ 防止下次有人重新问一遍「为什么没有 lint」——要重开请先驳掉下面的数字。

- **已落地的替代（评估的直接产出，均零新依赖）**：
  ① `tsconfig.strict.json` 单源 + 四端 7 个零成本开关 + 清 9 处死代码（`3a93d09`）；
  ② `test/floating-promise.test.ts` —— 用 TS 编译器 API 复刻 `no-floating-promises`，
     顺带挖出并修掉 `GameRoom.lock()` 的真 bug（`fd32a51`）；
  ③ `test/shared-zero-dep.test.ts` —— 铁律 4 的两半此前**完全没有闸**（`e8c0cf5`）。
     ⚠ 这本是评估认定的「eslint 唯一净增能力」，30 行自制机检拿到了同等覆盖。
- **不引入的依据（实测）**：
  - 收益：`no-floating-promises` 全仓真阳性 **2 处**（已修 1，另一处是顶层 `listen`，本就该炸）。
    `recommended` 规则集的语法类规则在 203 个源文件上只有 3 处命中。
  - 成本：**87 个包**；4 份 flat config（四个 tsconfig 互不继承）；**104 个 .ts（全仓 35%）**
    必须 ignore（Cocos 镜像 69 + shared 镜像 23 + bitecs 字节锁 12）；typescript-eslint 想拉
    TS 6.0.3 而本仓钉 5.9.3（多一条 `vendorLock` 式的版本对齐负担）。
  - **⛔ 危险项（最该记住的一条）**：`@typescript-eslint/prefer-nullish-coalescing` 的**默认配置
    会把已修的缺陷种回去** —— `wxClient.ts` 那处修复正是把 `unionid ?? null` 改成 `|| null`
    （`??` 放行空串 ⇒ 账号串号 + 新用户全登不上），而该规则会报错并建议改回 `??`。
    ⇒ **通用规则集不知道本仓的教训**；真要引入，必须逐条过一遍本仓的历史缺陷。
  - `--fix` 与镜像纪律冲突：手滑一次跑在生成物上，同时炸 `verify:sync` 与 `verify:ecs`。
- **63 条 09·XX ⛔ 不要迁成 eslint 自定义规则**：它们多数是**跨文件集合等式与运行时不变量**
  （`viewRegistry` 的双向集合相等、`vendorLock` 的五方版本对齐含 .md 正文、`config-guard` 的
  子进程 env 注入），不是 AST 节点判断。本仓 14 道自制机检已证明这条路更短（30 行 vs 一个 plugin 包）、
  更强（能读 .md/.mjs/UMD 产物/package-lock）、且自带反例测试。
- **什么情况下值得重开**：团队规模上来、需要统一代码风格时——⚠ 但那件事的对口工具是
  **formatter**（Prettier/biome），不是 lint，且同样受那 104 个生成物的 ignore 纪律约束。
- **触发条件**：无（⛔ 刻意不排期）。

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

- ~~**GameRoom 房级区上下文**（原 U6 的一半）~~ → `onCreate` 读 `options.sId` 存**房级常量**
  （`filterBy(["sId"])` 保证一间房同区 ⇒ 区是房级的，⛔ 不必像 LobbyRoom 那样每消息 `zoneCtx.run`）；
  `MatchEvidence` 加 `sId` 并**提升为 XADD 顶层字段**（同 matchId/mode，消费侧⛔不必解 payload JSON）；
  `match_results` 加 `server_id` + `idx_zone_time`。
  ⚠ **为什么必须在证据里带**：XADD 之后房间即 dispose，那时再问"这局属于哪个区"**无处可查**；
  发奖（U6）按区记账靠 `deriveOpId(uid, sId, …)`，拿错区 = 钱记错区且幂等键错误、重发也修不回。
  ⚠ **`server_id` 只作普通列 + 索引，⛔ 绝不进 PK**：该表按 `created_at` RANGE 分区，
  PK 必须含分区列，塞进去会改变分区语义与既有 REORGANIZE 流程（09·DB4）。
  ⚠ **`match_index` 刻意不加区**：它是**全局**去重闸，matchId 本身全局唯一；关区删 `match_results`
  后这里留孤行是**对的**——去重必须永久且全局，否则同一 matchId 重放会重复落库。
  ⚠ 旧条目（本字段上线前 XADD 的）**缺 sId 按 0 兜底、⛔ 不判结构损坏丢弃**（否则丢证据），已有用例。
  机检：int 三条（端到端 `createRoom({sId:7})` → 落库 `server_id=7` / 直发证据带区 / 旧条目兜底），
  **端到端那条做过变异测试**（`onCreate` 不读 sId 即红，用真实 `node --import tsx` loader 验的）。

- ~~**A3** 跨物理组顶号不收敛~~ → **2026-07-26 用户拍板：改模型，⛔ 不重开跨组协调层。**
  单端语义的作用域从**账号**收窄到 **(账号, 区)**（M12e）：会话权威从 `accounts.token_hash` 单列
  搬到新表 `account_sessions`（PK `(user_id, server_id)`），token **只对签发它的那个区有效**。
  ⇒ 某个区的全部会话必然落在**承载该区的那一个物理组**内（每组 GROUP_ZONES 固定、区的经济/冷档
  分区也在该组库）⇒ **顶号的踢人永远不需要跨组送达** —— A3 是被**取消**的，⛔ 不是"修好了"。
  ⚠ **封号不受影响、仍是账号级**（`status=1` + 清光该 uid 全部区的会话行）⇒ 各区在线连接仍靠
  GM 逐节点 `/admin/kick`（09·G7b）。**跨组踢人这件事本身没有消失**，消失的只是顶号对它的依赖。
  ⚠ **明确接受的代价**（用户拍板）：账号被盗时，小偷在别区玩，本人在自己那区**完全无感** ——
  盗号的发现时间从"立即被踢"变成"下次进那个区"。缓解办法（跨区登录给其他区推通知但不踢）未做。
  ⚠ `PROTOCOL_VERSION` 1→2：老包登录不带 `sId` ⇒ 拿 s0 token 进别区只会得到莫名其妙的
  「登录已过期」，bump 后在 join 处明确 `ProtocolMismatch` 拒掉。
  机检：int「M12e 单端语义作用域 = (账号, 区)」（变异测试验证过会红）+ 既有 130 条全绿。

- ~~**A5** 客户端连接端点不一致（大厅连 `getBaseUrl()`、战斗连所选 `wsUrl`）~~ →
  大厅 `init()` 改为跟随所选区（`cur.wsUrl` → http，缺 wsUrl 才回退全局，换算与战斗侧同款）；
  `endpoint + sId` 纳入连接复用判据（`WebSocketClient` 记 `joinedEndpoint`/`joinedSId`，任一变化即
  要求先 `leave()`）——⛔ 只比 token 拦不住换区：换区时 token 不变，会静默复用旧区连接。
  ⚠ **本条曾有一处口径错误，已更正**：上一版写「大厅连接不带所选 `sId` ⇒ 大厅侧落默认区」——
  **不实**。`pages.ts` 的 `join(token, { sId: cur.sId })` → `doJoin` → `joinOpts.sId` →
  `LobbyRoom.onAuth` 读 `options.sId` → `zoneCtx.run`，整条链**早就是通的**（`52e290b` 落地）。
  A5 真正的缺口**只有端点**：今天各区 `wsUrl` 相同所以看不出来，W4 接真实配置后就是"大厅连在
  默认那台机器上"（sId 传对了也没用——那是**另一台机器上的** s2）。
  ⛔ **无机检**：`Main.ts`/`view/pages.ts`/`net/WebSocketClient.ts` 的相关面在 D3 类型盲区内，
  只能 Creator 人工验证。

- ~~**A6** `exceptHash` 不是单调栅栏（积压踢人事件误踢赢家）~~ → 复用 A1 铺好的单调量：
  `broadcastKick` 带上发起方 `issuedAtMs`，消费侧回读组 sess 的 `issuedAt`，**事件更旧即整条丢弃**。
  ⛔ 只对带 `issuedAt` 的事件做该判断：封号/撤销不绑定任何一次登录，必须无条件踢；旧发布端的
  条目也没有该字段，因"没带"就丢会静默漏踢。⚠ 顺带把 `startStreamConsumer` 的 `onEntry` 改成
  可返回 Promise 并**逐条 await**（消费侧要回读 Redis）——⛔ 不能发射后不管：try/catch 兜不住
  rejection，且同 uid 事件会乱序。机检：int「A6 单调栅栏」（变异测试验证过会红）。

- ~~**A1** split 会话写入无 fence（旧 token 覆盖新 token）~~ → 权威侧 `issueToken` 用
  `GREATEST(NOW(3), 上次+1ms)` 保证 `token_issued_at` **同 uid 严格递增**（⛔ 消掉同毫秒打平，
  那正是"单调量"能成立的前提）；`/verify` 带回 `issuedAtMs`；`writeGroupSess` 改为**单条 Lua**
  「只接受更大的 issuedAt」，陈旧写直接丢弃且 ⛔ **不触发顶号踢**（旧实现会拿自己的 hash 当判别位
  把合法的新登录端踢掉）。⚠ 评审推翻的 `oldHash` CAS 药方**没有采用**：两个请求都读到 H0 时
  旧请求也满足 CAS ⇒ 它先写成功、赢家反被拒。机检：int「A1 组 sess 写入栅栏」（变异测试验证过会红）。
  ⚠ 未做也不需要做：`sessionVersion` 新列——`token_issued_at` 已是权威侧单调量，⛔ 别再加一个。
- ~~**A2** 邮件与公会未按 sId 隔离~~ → 邮件三处补 `server_id` 谓词（`mail/list` 查询、`markRead`
  UPDATE、`mailer.claimMailAttach` 的 `SELECT ... FOR UPDATE`——领取权限那处最要紧）；公会在线索引
  由 `gid → Set` 改为 `` `${sId}:${gid}` → Set ``，`pushToGuild` 增 `sId` 必填参。
  ⚠ 索引里**存下区号**而非清理时现取：下线清理（`unregisterOnline`）⛔ 不在 zoneCtx 内，
  在那里调 `currentZoneId()` 会在 GROUP_ZONES 非空时直接抛。
  机检：int「A2 邮件按区隔离」「A2 公会在线索引按区分桶」（邮件那条变异测试验证过会红）。

- ~~冷档 ARCHIVE_NEWER + overwrite 重置 fence counter~~ → `f148879`：overwrite 分支保留
  计数器并取 `MAX(counter,hwm)`。旧问题不是绝对不可达：resolve 读完 counter 后，其他实例
  抢锁失败也会先 INCR，使 counter 在 Lua 前反超 hwm；修复已闭合该竞态，构造性用例已入 int 套件。
- ~~withUser/uow 的“有 dirty 冷写”不主动 thaw~~ → `f148879`：commit cold → 锁外
  ensureLive → 重试一次；「冻结用户无条件 set 后写入成功」用例已入 int 套件。条件读/无 dirty
  与 callback 重跑余项尚未关闭，已在上文重新登记。
- ~~withUser 冷档「条件读后写假成功」与 callback 重跑~~ → 与本条同一提交：锁内 callback
  **前**预检档存在性（冷路径 callback 零执行；guild.leave 形态反例封堵）；四项验收全部
  入 int 套件——条件读后写读到归档真值 + 回调恰跑一次 / 并发冷写 singleFlight 无死锁双写
  皆落 / thaw 限流 ThawingError 原样上抛且档保持冻结（二次 cold 映射由 ERR_MAP 承接）。
