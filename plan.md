# gameStarterKit 当前代码审阅与改进计划

> 审阅日期：2026-08-28
>
> 实现基线：分支 `new`；本轮已完成 P0-01 至 P0-05、P1-01 至 P1-09、P2-01 至 P2-03 的计划内收口，
> 并分别落在 `0bfa70f`、`9dff8f9`、`1a49eb3`、`04280b0`、`91fdf02`、`a461398`、`808fcc3`、
> `0531c2b`、`8e767a1` 等提交中。当前 inventory 登记 14 项能力（13 项 core + 1 项 extra relayer）和 5 个默认入口。
> `apps/website/` 保留为新设计站点的本地 Sites checkout/构建工作区，仍由 `.gitignore` 忽略，不属于本仓受控
> 源码、workspace 或核心验证能力；本仓不恢复 gitlink/submodule，也不删除该物理目录。
>
> 文档状态：`plan.md` 已纳入 Git，本文件是核心改进优先级的唯一真相
>
> 评估范围：开发期游戏基础框架的正确性、可测试性、可替换性和本地开发体验
>
> 复核记录（过程记录，非代码证据；代码侧结论一律以各条目内的 file:line 为准）：
> 第一轮（2026-08-28，实施方自查，落库于 `a54b791`）逐条核对「完成声明 vs 代码」约 60 条并重跑 §3 基线。
> 第二轮（2026-08-28，历史基线 `8e07c3b`）按子系统分 8 组并行复核、每组配一名独立怀疑者做对抗式验证，
> 共 92 条裁决：45 条完成声明经独立复核成立、47 条需要回填（含 10 条此前未列入计划的代码缺陷）。
> 第三轮（2026-08-28，实现基线 `940b3c9`）逐项复核 17 个计划条目及第二轮回填点；当时计划内可执行缺口
> 均已闭合，保留边界只涉及本文明确列出的额外功能、人工 Creator 验证和完整外部 smoke。
> 第四轮（2026-08-28，HEAD `6c00606`）对第三轮后的 12 个收口提交逐 commit 独立复核（约 20 条裁决）：
> 各 commit 的实质声称与各条目文字均同代码/测试一致；第四轮历史基线中的 `verify:all`、`test:fgui`（45/45）、`test:int`
> （第四轮当时为 99/99）与 `test:faults:int`（4 组 fault point 全部实测执行）在本轮重跑复现。两处提交归属备注：
> effect「ledger 重复+异 payload」专项用例实际由 `11cd22f` 引入（`3583dae` 闭合的是 trimApplied 原子
> 清理断言）；Area/Notice「迟到结果 0 回调」断言由 `15e93fd` 引入（非本轮三提交）。两者均不影响缝隙
> 已在当前树闭合的结论。
> 第五轮（2026-08-28，历史 HEAD `368d99e`）对第四轮后的 47 个提交按子系统分 8 组并行复核、每组配独立怀疑者
> 做对抗式验证，共 69 条裁决：50 条「上一轮缺陷已修复且有测试锁定」、1 条 claim-holds、18 条需要回填。
> 上一轮登记的 10 条缺陷（D1–D10）与 5 处「仅等价覆盖」缺口基本全部闭合；随后已修复并验证
> 此前的 `apps/website` 索引残留、`setField` UTF-16/UTF-8 单位分歧和文档树登记缺口。
> 第六轮（2026-08-28，本轮收口）复核上述修复：角色 ready marker/legacy fallback、默认进程正常停服、
> 会话 fence 的 Lua SHA/NOSCRIPT、FGUI `checkManifest` 编排反例及 legacy 全源类型闸门均有定向测试；当前计划内缺口已全部闭合。
> 第七轮（2026-08-29，HEAD `ca8251c`）对 `368d99e..ca8251c` 的 14 个提交逐 commit 独立复核（客户端 4 件、
> 服务端 4 件、文档 4 件、仓库元数据 1 件 `6aea37f`、构建脚本 1 件 `808fcc3`；其中 `9884f26` 仅含本文件的
> 第五轮复核记录，`ca8251c` 含第六轮记录与 `docs/EXTRAFEATURES.md` 的站点登记更新，约 25 条裁决）：
> 机制与测试均真实落地。`verify:all`（服务端 203/203、客户端 217/217）与 `test:fgui`（47/47）有实测支撑；
> `test:int`（102/102）与 `test:faults:int`（四组故障矩阵、共 13 个 fault point 全部实测执行）由实施方在本地 Redis/MySQL 栈上
> 执行，复核方核对了新增用例增量（99+3=102、196+7=203、213+4=217、45+2=47）与 §3 一致。本轮修正三处条目
> 文字（P0-01 测试文件归因、P0-04 marker 语义与覆盖面、P1-01 catalog 装配口径）、图例的小标题定义及
> `◐` 当前无条目使用的注记。两处判断性备注：`0bfa70f` 实为接缝抽取＋语义钉住而非行为修复——其新增用例
> 真正锁定的是「陈旧续体返回 undefined 且只对自己捕获的 owner 调用一次 `stop({kind:'cancelled'})`」，而
> `freshStops`/`currentController` 两条断言因新 controller 从未进入被测函数而恒真；`9dff8f9` 收紧了 wire
> 接受域但未 bump `PROTOCOL_VERSION`（仍 v5，开发期无线上客户端可接受，首个有线上兼容义务的版本前应留意）。
>
> 第八轮（2026-08-29，HEAD `ca8251c`）按子系统分 5 组并行复核、每组配独立怀疑者做对抗式验证，共 49 条裁决：
> 33 条「上一轮缺陷/保留边界已闭合且有测试锁定」，16 条需要回填（含 4 条新登记的代码/门禁缺口）。上一轮
> 3 条缺陷（`apps/website` gitlink、`setField` UTF-16/UTF-8 单位分歧、`docs/undergroundIdle` 未登记）经
> 只读 clone、`utf8ByteLength` 与 Node `Buffer.byteLength` 的差分测试（14 定例 + 5000 随机串全一致）、
> 登记链路核对，确认全部闭合；P1-08 的 legacy include 盲区亦经定位探针复验闭合（上一轮的逃逸点
> `apps/client/src/` 根目录现在会被 TS2550 拦下）。
> 各轮结论一致的部分不重复记录；新增差异统一写进各条目的「复核备注」。
> 真实 Creator 预览和完整 smoke 仍不纳入 Node/本地栈测试的通过声明。

## 1. 计划边界

本计划只给核心框架排优先级。托管、真实支付、渠道、GM、运行辅助、冷档、多区拓扑、Unity、配表和
项目特定业务样例的现状统一记录在 [docs/EXTRAFEATURES.md](docs/EXTRAFEATURES.md)；`docs/undergroundIdle/`
的玩法策划案同属额外内容，其状态和文档入口已由该文件统一记录。额外功能不构成核心完成
门槛；但已经进入默认入口的可选代码仍必须可停止、可隔离，不能破坏核心构建和本地调试。

P0 表示继续扩展核心玩法前应先修复的确定性问题；P1 表示把现有 Demo 接缝收敛为可复用框架；P2 表示
在正确性稳定后再做的增强。条目内的四类小标题含义不同：「复核备注（已收口）」＝有测试/门禁证据的结论；
「原审阅证据（已收口）」＝实现前的复现记录，仅说明改动动机，不代表当前基线仍存在这些缺陷；「保留
边界」＝已知且当前不打算做的范围限制；「已知语义回退（待闭合）」＝为达成本条目标而付出的运行行为代价，
已识别闭合方案但尚未实施（与「保留边界」区别在于它改变了行为，而非只是测得不够）。
`✅` 表示当前基线已完成并有测试/门禁证据，`◐` 表示核心接缝已完成但保留明确限制（当前无条目使用）。
本文同时保留原审阅证据，避免把 Demo 的边界误写成线上能力。

## 2. 总体结论

项目已经具备有价值的框架骨架：shared 单源、两级源码镜像、第三方锁定、客户端 Logic 纯净守门、
GameRoom ownership、Lobby RPC 登记、外部身份 HTTP 边界，以及 lock/fence/UoW/outbox 等服务端原语。
现有本地单元测试整体稳定。

截至当前分支，P0/P1 的核心收口和 P2-01/P2-02/P2-03 已完成。剩余风险集中在明确未承诺的扩展边界：relayer
仍在持锁事务内等待外部 I/O，archive 表缺少完整区隔离与容量方案，坏 stream entry 的处置和热档
schema 迁移仍待补齐，Game HTTP request schema 尚未直接由 shared validator 生成，match evidence 也
不足以重放完整输入序列。以上限制不影响本轮已完成的核心验收，但不能把
当前 Demo 描述成通用生产框架。

`apps/website/` 与 `docs/undergroundIdle/` 的仓库登记状态现已明确：前者是被忽略、保留在本机的新设计站点
checkout，后者是已受控的未实现玩法策划案；两者都不伪装成核心运行能力，也不再构成计划缺口。

本轮改变运行语义的取舍有两处：`9dff8f9` 把 `setField` 文本的接受域从 UTF-16 码元收紧为 UTF-8 字节
（CJK 值的可写长度实际缩到约 1/3，未 bump `PROTOCOL_VERSION`，见第七轮记录）；以及 P0-04 的热档回访改为
信任本地 `ready` marker、不再每次 join 幂等重申外部角色行——它换来「外部登记不可用时不再拒绝全量 join」，
代价是移除了一条既有自愈属性，详见 P0-04 的「已知语义回退（待闭合）」（含对 09·F4 数据丢失判据的削弱）。
其余本轮新登记项均为测试覆盖面与门禁口径，不改变运行行为。

## 3. 本轮验证基线

| 验证项 | 结果 | 实际覆盖与限制 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 含 `verify:webplatform-contract` 契约镜像一致、shared/server 与客户端两套 `tsc`、`verify:sync` 两段镜像一致且入库 `.meta` 齐全；客户端无头探针以最小 cc/FairyGUI 桩严格覆盖 `src/**/*.ts`、`test/**/*.ts`，legacy 探针以 ES2017 lib 递归覆盖全部 `apps/client/src/**/*.ts` |
| `npm --workspace @game/server run test` | 203/203 通过 | 服务端单元测试；不等于真实外部服务或 Creator 集成已验证 |
| `npm --workspace @game/server run test:int` | 102/102 通过 | 使用本地 Redis/MySQL 的集成测试；外部 WebPlatform 边界使用契约兼容测试替身 |
| `npm run test:client` | 217/217 通过 | 客户端无头行为、运行时 wire/生命周期、生产页面/渲染接缝、vendor lock integrity 和 strict include 守门 |
| `npm run test:fgui` | 47/47 通过 | FGUI manifest 编排、codegen、registry 与结构契约专项测试 |
| `npm run verify:core` | 通过 | toolchain、项目元数据、typecheck/sync、bitECS/vendor、FGUI manifest + 专项测试、inventory + 12 个正反例、perf 和 client tests 聚合门禁 |
| `npm run verify:all` | 通过 | 完整执行一次 `verify:core`，再追加服务端 203 个单元测试；不重复客户端测试 |
| `npm run verify:ecs` | 12/12 通过 | bitECS 哈希及“实际 TypeScript 文件集合 = 锁定集合”均校验 |
| `npm run verify:vendor` | 3/3 通过 | vendored runtime 的内容锁、实际文件集合和本地 WebPlatform tarball integrity 均有测试 |
| `npm run verify:perf` | 2/2 cases 通过 | 固定 seed/input checksum、生产共享渲染命令数、render/frame/aggregate/sink checksum 与 snapshot 估算；真实 View trace 由 client tests 守门，计时/heap 不作门禁 |
| `npm run test:faults` / `npm run test:faults:int` | unit 119/119；集成 143/143 | unit 为 server-boundaries 63 例 + client-transitions 56 例（7 个 fault point）；集成超集再加 storage-effects 11 例 + character-ready 13 例（共 13 个 fault point），全部要求实际执行并 fail-closed |
| `npm run config:excel-to-json:check` | 通过 | 读取并校验 3 条 item，warnings 0；不会比较缺失或陈旧的生成 JSON |
| client tests 严格编译探针 | 通过 | `apps/client/tsconfig.test.json` 纳入 Main、全部 View、`pages.ts`/ViewMgr 与客户端 tests；Node 桩只证明 TypeScript/API 形状，真实 Creator 类型与资源仍需编辑器验证 |
| `npm run verify:inventory` / `npm run test:inventory` | 14 项能力、5 个默认入口 / 12/12 通过 | 校验登记/权威文档及其中的相对链接与锚点；`docs/undergroundIdle/` 已有额外内容权威入口；被忽略的 `apps/website/` 不属于清单能力；该工具不是通用全仓 Markdown 语法或链接扫描器 |

最终收口（2026-08-29）已在当前实现基线执行 `verify:all`、`test:int`、`test:faults`、`test:faults:int`
与配置检查，结果与表中一致；服务端单元测试为 203/203，客户端为 217/217，FGUI 为 47/47，集成测试为
102/102，故障矩阵四组共 143/143。`test:int`/`test:faults:int` 仍依赖本地 Redis/MySQL 与当前
Node/Colyseus 运行时；若 schema decorator 在环境中触发既有兼容错误，应记录为环境边界，不得把它误写成
新回归。
`test:fgui` 和 `test:client` 已各由 `verify:core` 执行一次，`verify:all` 仅在其后追加服务端单元测试。
真实 Creator 预览和目标设备性能采样仍是人工边界；端到端 `smoke` 仍需要外部 WebPlatform 与运行中的
游戏服，本轮未把它们写成已通过证据。

## 4. 已具备且应保留的设计

1. `apps/shared` 作为协议、错误码、公式和外部契约生成物的零依赖真源。
2. `shared → client → Cocos` 的按字节同步、孤儿检查、删除保护和 `.meta` 管理。
3. bitECS、Colyseus UMD、FairyGUI runtime 的版本与内容锁定机制。
4. Logic 禁止依赖 `cc`/`fairygui-cc`，客户端禁止导入服务端 Colyseus 的守门测试。
5. `RoomClient` 的 slot/ownership、完整 join-options key 和旧 room 回调身份守卫。
6. `ViewMgr` 已有 registry、动态 import、onlyOne 在途合流、close-during-load 取消和 handle 身份/交互计数基础。
7. Lobby RPC 的文件路由登记、pending 配对、幂等 request ID 和稳定错误码方向。
8. 服务端 strict auth、区号复核、session 栅栏和外部 WebPlatform Internal 响应校验。
9. per-user 串行、lock/fence、UoW、ledger/outbox/applied marker 等一致性原语。
10. Redis durable/cache/coord 语义分层、路由校验、Lua SHA 与 `NOSCRIPT` 恢复。

后续维护应沿用这些接缝和登记点；新增能力不得建立第二套网络、协议、镜像或页面入口。明确未承诺的
扩展边界见第 2 节和 `docs/EXTRAFEATURES.md`。

## 5. P0：核心正确性

### P0-01 收口客户端会话、连接、导航与输入竞态 ✅

状态：已完成。`SessionTransition`、join deadline/cancel、slot ownership、统一回登录清理和掉线输入
reconcile 已落地；客户端 session/transport 测试覆盖重复导航、迟到 room、旧 bearer 与 desired stop。

复核备注（已收口）：登录整段 flow 锁（一个 session、一次 Lobby join）由 `pageLogic.test.ts` 覆盖；
`viewLifecycle.test.ts` 进一步以最小引擎桩动态执行生产 `pages.ts`，直接验证重复 `openLogin` 与重复 Enter
共享同一完整 continuation；active flight 在 Login setup Promise 完成后继续覆盖 Enter/Home continuation，
该窗口再次 `openLogin` 仍只签发一个开发会话、执行一次 Lobby join/GetInfo/Home 导航，并保留最新的
`onEnterBattle` 回调。该用例复现了真实 `ViewHandle.close()` 会同步使 Login context 失效；生产实现关闭
Login 后改由仍有效的 page flight 与 session generation 守卫 Home 导航，scope/session 失效后迟到成功的
Home 只通过原 `ViewHandle` 关闭，不会按名误伤后来世代。Home 的 open 或 setup 失败则走统一
return-to-login transition，运行时测试直接验证
清 session/bearer、leave Lobby、提示、重开可用 Login，并能再次登录成功，不再留下“有会话但无页面”半状态。

复核备注（已收口）：`Main.handleGameplayStartFailure` 调用 Logic 层的
`recoverGameplayStartFailure`；专项测试直接验证 `plugin-error` stop 先于统一回登录、同步抛出或异步拒绝的
stop 均被观察且不会阻断 `BATTLE_JOIN_FAILED` 恢复，而回登录自身的失败仍向调用方传播。该接缝只依赖
TypeScript 与 gameplay 类型，不导入 `cc`、FairyGUI、View 或网络单例。战斗 transition 另捕获所属 session
generation，并在动态页面加载、room start、失败 stop 之后统一复核 Main 实例、AbortSignal 与 generation；
旧 Main 的迟到清理只能停止自己的 controller，不会清掉后来建立的新会话。

复核备注（已收口）：`gameplayStartRecovery.test.ts` 用 deferred AbortSignal 与 session-generation 两组
行为用例直接执行生产启动接缝（`RoomController.reconcileGameplayStartResult`），验证迟到结果只停止自己的
旧 controller；旧实例的清理不会触碰后来建立的会话。`roomClientOwnership.test.ts:591` 的源码正则只守
`Main.ts` 的装配接线（registry/controller/catalog 与 `presentationHost`）；真实 Creator 生命周期继续由
编辑器预览承担。

保留边界：`reconcileGameplayStartResult` 之外的启动判据没有执行级用例——`Main.startGameplay`
（`Main.ts:157-160`）对 `destroyed`、`AbortSignal` 与 `getSessionGeneration()` 的三元组复核只由
`loginFlight.test.ts:41-43` 的源码正则锁定；该正则要求源码出现 `getSessionGeneration() === sessionGeneration`
字面形态，因此真正能逃逸的是「在调用点把 `isCurrent()` 的结果先缓存成布尔再复用」这类保留字面量、语义已破的
改写，不会被现有测试拦下。

复核备注（已收口）：`WebSocketClient.forgetImplicitOwners` 按 slot 身份回收隐式 ownership，并覆盖 join
失败/迟到、room 绑定失败、物理 `onLeave`、`closeSlot` 以及 `leave()` 的空 slot 提前返回路径。
`webSocketClient.test.ts` 三条专项用例直接验证重复「掉线→重登」不累积闭包、旧 room 迟到回调不清新代，
以及主动 leave 后迟到 join 只释放旧物理 room、不回填记录；客户端与 Cocos 镜像保持一致。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- `LoginLogic.inflight` 只包住 dev-login HTTP；`setSession → Lobby join → GetInfo → 导航` 位于锁外。
- `RoomClient` 与 `WebSocketClient` 的 `joinOrCreate` 均没有 deadline/cancel，`leave()` 还会先等待在途 join。
- `WebSocketClient.doJoin` 没有冻结本次 `client/endpoint`：join(A) 等待期间 `init(B)`，物理 A 可被记录为 B，
  后续请求错误复用 A；该交错已用探针复现。
- `WebSocketClient.leaving` 是跨 room 的布尔值，leave timeout 成功后也不清 timer。
- authInvalid、battleLost、connLost 和 `Main.abortBattle` 是四套 detached 回登录路径，可能重复弹窗、清理和导航。
- 回登录路径不清会话，下一次登录请求会带上一次会话的 Bearer：`core/http.ts:109-111` 只要模块级 token 非空
  就无条件设 `Authorization`，而 `Main.abortBattle`（`Main.ts:226-237`）与 pages 的 onConnLost 处置
  （`view/pages.ts:86-101`）只 `leave()` + 重开登录页、不 `clearSession()`；于是 `doLogin → devLogin →
  portalRequest(POST, DevLogin)` 携带旧凭证，与 `core/http.ts:95-98` 自身注释「登录时本地尚无 token」矛盾。
- 掉线时 `Main.sendDir` 在记录 desired state 前返回；断线期间松手后重连不会发送 stop，服务端可延续旧方向。

**已实施**

1. 建立单一 `SessionTransition`，完整覆盖登录、setSession、Lobby、character ready、首页导航与失败回滚。
2. join 固化 client、endpoint、完整 options 和 generation，增加统一 deadline、取消和迟到结果释放。
3. Lobby 连接也使用 per-slot ownership；leave 的 timer 必须在先完成分支清理，主动离开状态按精确 room 归属。
4. 所有失效事件进入一个可等待、幂等的 `returnToLogin(reason)` 队列，不再使用散落 IIFE；该出口统一
   `clearSession()`（`net/session.ts:127`，进入 transition 即清态），与 authInvalid 路径
   （`net/session.ts:195-199`，先清态再广播）对齐，使回登录页后不残留旧 Bearer。
5. 输入保存 desired direction + monotonic seq/lease；断线仍更新 desired，恢复后先 reconcile 并重放或发送 stop。

**验收（已通过）**

- join(A) 期间 init(B) 不会错记或复用物理 A；黑洞 join 到期后没有无主连接。
- 任一 await 边界重复点击只产生一个 session、一个 Lobby 和一次最终导航。
- 三类失效事件同时到达只执行一次清理，所有 Promise rejection 都被观察。
- 移动中断线并松手，重连后的第一条有效输入为 stop 或更新后的 desired state。

### P0-02 修复 GameRoom 的运行时边界和状态转换 ✅

状态：已完成。`GameRoom` 的 C2S/S2C runtime validator、phase gate、awaited start lock、全量 reset、
fixed-step clock 和双向身份索引均已落地；`game-room.test.ts` 覆盖故障与确定性 fixture。

复核备注（已收口）：默认播种用 `Date.now()` 与进程内单调序列组合；专项测试冻结同一毫秒连续构造 8 个
真实 `GameRoom`，断言 seed 逐一推进、互不重复，并把输出 seed 重新注入构造器验证可精确回放。不同等待历史
的对照测试则在一侧额外执行 observer join/ping/leave，随后比较相同 seed 下的完整正式模拟快照，并继续执行
move 与消费随机数的技能帧，钉住 admission/match RNG 隔离（展示昵称不属于正式模拟快照）。

复核备注（已收口）：消息预算测试直接验证同一 session 前 60 条均为正常 Pong、第 61 条只返回受控
`BadRequest`、另一 session 不受影响且下一秒窗口恢复。accepted input evidence 使用生产上限
`MAX_ACCEPTED_INPUTS = 16_384`；测试覆写为 1 后断言第二条输入既不增长 evidence，也不产生玩法副作用并
返回 `BadRequest`，因此长期房间不会再无界增长该数组。玩法本身是否增加对局时长上限仍是规则设计决策，
不属于本条内存有界性缺陷。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- C2S handler 直接把 wire value 当成 TypeScript 类型；NaN/Infinity、错类型、未知字段和超长内容没有统一拒绝。
- Move 在非 Playing 阶段也能改变方向，update 在 Waiting/Settle 仍推进；Waiting 明确允许技能伤害和死亡。
- 开始比赛只清部分记录，没有统一重置 hp/alive/dir/cooldown/tick；Waiting 历史会进入正式局。
- `lock()` 在 phase 已切 Playing 后 detached 执行，失败只记录日志。
- Waiting 玩家离开时删除 state，却没有同步清 `sessionUserId`；同用户可能无法重新加入仍存活的房间。
- seed 使用 `Date.now() >>> 0`，Waiting join 已消费 RNG，模拟又依赖 wall clock/dt，无法稳定重放。

**已实施**

1. 为每个 C2S 建立 exact runtime schema、finite/range/length 校验和每客户端消息预算。
2. 由 phase 明确消息白名单；只有 Playing 接受模拟输入并推进玩法状态。
3. 单一 `startMatch()` 初始化所有状态、fixed-step clock、seed/RNG、死亡序和输入序列。
4. 等待 room lock 成功后再公开 Playing；失败回滚或关闭房间，只有一个可测试终态。
5. 玩家加入/离开同步维护所有双向索引；seed、clock 和 accepted input 可在测试中注入。

**验收（已通过）**

- 畸形 C2S 不进入玩法逻辑，也不会把 NaN 写入 Schema state。
- Waiting/Settle 输入不改变正式模拟；任意等待历史后开局状态完全一致。
- lock 失败、Waiting 离开再加入和同毫秒建房均有确定结果。
- 相同 seed、初始状态、fixed-step 与 accepted inputs 得到相同输出。

### P0-03 保证 asset effect 原子性与区级数据隔离 ✅

状态：已完成。effect 入口先做 shared/runtime validate，Lua 采用 validate-then-apply，保留字段和跨区
`server_id` 谓词均有守门测试；非法批次不会留下 Redis、applied 或 durable 业务结果。

复核备注（已收口）：`effect-atomic.test.ts` 直接执行同 op-id、不同 canonical effect 的两次 `purchaseTx`，
断言稳定冲突且 ledger/outbox 仍各只有原始一行；同文件还分别向 `sendMail` 传非法附件、构造历史坏附件后
执行 `claimMailAttach`，断言 mail/read/claimed、outbox、Redis effect/applied 均不产生半状态。

复核备注（已收口）：shared 为每个 `setField` allowlist 字段登记 text/integer/flag 值域，
`wire-contract.test.ts` 直接覆盖数字垃圾、越界整数、非规范开关和超长文本，Lua 保留同结构的 durable
防御。`trimApplied` 通过单个 `TRIM_APPLIED` Lua 同时删除 ZSET marker 与 payload hash 字段；经济集成用例
断言 pending 时二者均保留、done 后二者同时清除，不再产生无法枚举的孤儿绑定。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- `APPLY_EFFECT` 在循环中立即 `HINCRBY/HSET`，applied marker 最后才写；Lua 后续运行时错误不会回滚前面的写。
- unknown kind 被静默跳过，`setField` 可写任意字段，effect 没有版本化运行时 schema。
- 如果非法 effect 已先写入 MySQL ledger/outbox，之后仅让 Redis 失败也不能撤销 durable intent。
- `outbox.readBack(uid,sId,opId)` 查询缺 `server_id` 条件，可把另一区的 operation 结果与本区余额拼接。

**已实施**

1. 在写 ledger/outbox 前使用 shared 零依赖 validator 检查 schemaVersion、exact keys、kind、整数范围、
   数量上限与字段 allowlist。
2. Lua 分为完整 validate pass 和 apply pass；禁止修改 uid/serverId/version/fence/applied 等保留字段。
3. unknown kind/version/field 返回稳定领域错误，失败时 Redis 字段和 applied marker 均不变化。
4. 所有区级 MySQL read/write predicate 带 `server_id`，并以跨区同 uid/op fixture 验证。

**验收（已通过）**

- “第一条合法、第二条非法”时 Redis、applied、ledger/outbox 都没有新增的业务结果。
- 相同 op-id 并发或重试只生效一次；同 ID 不同 payload 可判别冲突。
- s1 的 operation 不能从 s2 查询或影响响应。

复核备注（已收口）：`apps/shared/src/protocol/lobbyRpc/economy.ts` 以 `utf8ByteLength` 和
`maxBytes` 作为 setField 的唯一文本口径，并显式拒绝不成对代理项；服务端 Lua 投影使用同一字节上限。
`wire-contract.test.ts` 与 `effect-atomic.test.ts` 以 CJK、emoji、信封级 `drainProbe` 上下界直接比较
shared validator 和 Lua 结果，确认合法值可落盘、越界值在首个写入前返回 `EFFECT_VALUE`，不存在 durable
重放才失败的分歧。

### P0-04 明确 Lobby 首角色 ready 契约 ✅

状态：已完成。`LobbyRoom.onJoin` 等待有界的 `ensureCharacterReady` flight，初始化失败/超时拒绝本次
join；并发合流、超时语义与 admission 开关由 `apps/server/test/character-ready.test.ts` 覆盖（注入假
initializer，不触外部依赖）；空库首登与并发 join 由 `apps/server/test/int/lobby-zone.test.ts` 覆盖；登记
失败与 repair intent 由 `apps/server/test/int/character-repair.test.ts` 覆盖，热档回访短路由本轮新增用例锁定。
复核备注（已收口）：`character-ready.test.ts` 通过生产 `ensureCharacterWithDependencies` 接缝逐一挂起
`ensureLive`（Redis/MySQL archive 路径）、`createUser`（Redis 写入）与 `registerCharacterWithRepair`
（WebPlatform PUT + repair），直接断言每个慢阶段均有界拒绝 ready、不会越过未完成阶段，底层 flight 放行后
仍完整收敛。客户端 `pageLogic.test.ts` 直接覆盖 join/GetInfo 任一失败时清 session + leave、null profile
同样拒绝导航，以及成功取得具体角色后才保留会话。

复核备注（已收口）：新建档在 Redis 原子写入 `characterRegistration=pending`，外部登记成功后再以单 Lua
操作把已有档标为 `ready`；`ready` 热档回访跳过 WebPlatform PUT。legacy 无 marker 档先调用
`hasCharacter`：远端已有登记时只补 marker，未登记时执行带 durable repair 的幂等 PUT；存在性查询失败会
持久化 repair intent 并拒绝 ready。repair worker 成功 PUT 后补 marker，且 marker 写入带 EXISTS 守卫，
在档已被删除时不会重新创建 hash。`character-ready.test.ts` 与 `lobby-zone.test.ts` 覆盖其余状态转移；
marker 的区维度目前只由「s1 marker 落 `s1_user`、s1 回访不建 s2 档」间接覆盖，「s1 已 ready 不得短路 s2
首次登记」这一方向尚无用例；「repair worker 成功 PUT 后补 marker」这一转移由生产代码路径保证，暂无直接断言。

已知语义回退（待闭合）：`ready` marker 一经写入即被永久信任（`character.ts:95-98` 直接 return，无 TTL、无周期重探、
无再次 PUT/`hasCharacter` 路径）。这是本次修复唯一改变线上语义的取舍——它正是「外部登记不可用时不再拒绝
全量 join」的手段，但同时移除了「每次 join 幂等重申外部角色行」这条既有自愈属性：外部目录若单方面丢行，
游戏侧不再有恢复路径，并会削弱 `core/archive/thaw.ts:210` 的 09·F4 判据（ABSENT + 外部有本区登记 = 数据
丢失）——热/冷档若随后也丢失，会被判成真新角而非 `UserDataLostError`，`thaw.ts:37-38` 声明「必须恒为 0」的
`userDataLost` 计数可能静默不报。若要闭合，可给 marker 加低频重探（按 marker 写入时间或 `lastActiveAt`
做 N 天一次 `hasCharacter` 复核）。
另：新增的档字段 `characterRegistration` 不在 `apps/shared/src/protocol/lobbyRpc/economy.ts` 的
`EFFECT_RESERVED_FIELDS` 内。当前不可利用（`EFFECT_FIELD_ALLOWLIST` 未收录该字段，且值规则对 allowlist
穷尽，扩表必须同时补规则），且其它 `CREATE_USER` 写入的字段（如 `registerTime`）同样不在保留表内，故不是
与现有习惯的不一致；区别只在后果——叠加上面的永久信任语义后不可自愈。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

`LobbyRoom.onJoin` detached 启动 `ensureCharacter`；join 已成功时初始化可能仍在进行或已经失败。
shared 的 `GetInfo` 当前允许 `user: null`，因此代码与客户端需要共同决定：null 是合法 initializing 状态，
还是 Lobby ready 后必须有角色。现有测试大多预建角色或轮询，没有覆盖空库首次 join 后立即 GetInfo。

**已实施**

1. Lobby `onJoin` 以有界 `ensureCharacterReady` flight 作为 ready gate；依赖角色的 RPC 只在 gate 完成后可用。
2. `GetInfo` 的 nullable 结果不再表示未受控的初始化中间态；初始化失败/超时以稳定错误拒绝 join，客户端
   不会把 `null` 当作随机成功。
3. MySQL、Redis repair intent 和外部角色登记的迟到结果均被观察并收敛；ready 之后的在线工会索引仍明确
   标为 best-effort。

**验收（已通过）**

- 空库首登、并发重复 join、外部登记超时、Redis/MySQL 单点故障均有确定结果。
- 客户端不会进入“已登录但角色永久未就绪”的半状态。

### P0-05 统一本地默认进程的生命周期 ✅

状态：已完成。默认进程使用单一 `LifecycleRegistry` 和 shutdown aggregator，组件 dispose 可等待、幂等；
阻塞 consumer、重复关闭和迟到登记有 `lifecycle.test.ts`，启动半失败同时有 registry 级故障注入和真实
`index.ts` 子进程用例。

复核备注（已收口）：`shutdown-aggregator.test.ts` 以 fake host + fake deps 执行抽出的 `shutdown.ts`
顺序契约，断言只占用一对 before/shutdown
槽位、before 同步关闸并把 producer drain 交给 Colyseus 等待、最终资源清理不提前；
`index-startup-lifecycle.test.ts` 在隔离子进程触发真实顶层启动失败，证明 `index.ts` 的 catch 会等待已登记
cleanup 后以原始异常退出。`loop-monitor.test.ts` 覆盖重复 start/幂等 stop、停服 admission、关闭 registry
显式重启以及两代 MySQL enqueue listener 均被卸载；生产 `startInfraMonitors` 已执行
`assertAdmissionOpen()` 并在显式重开 admission 后 reset 终态 registry。`stream-depth-lifecycle.test.ts` 同样
覆盖 timer 的 start/stop/restart 与停服关闸，不再存在原复核记录中的生命周期测试缺口。

**原审阅证据（已收口）**

以下条目是实现前的复现记录，仅用于说明改动动机，不代表当前基线仍存在这些缺陷。

- `src/index.ts` 连续注册两次 `app.onBeforeShutdown`；当前 Colyseus 实现只有单回调槽，后一次覆盖前一次
  ——实际被覆盖丢失的是 `stopCharacterRepairWorker`，停服时 repair worker 没有停止入口。
- 默认启动 loop monitor、stream-depth timer、kick consumer、character repair；Lobby 创建还启动 mail wake。
  多个组件没有统一 stop handle，`StreamConsumer.stop()` 也不等待阻塞 read 完成。
- 因为这些额外样例进入默认进程，它们的残留 handle 会影响核心本地启停，即使其业务完整度不属于核心承诺。

**已实施**

1. 建立单一 lifecycle registry；每个默认组件返回幂等、可等待的 `dispose()`。
2. Colyseus 只注册一个 shutdown aggregator，按依赖顺序停止接收、timer/consumer/worker、外部 client、连接池。
3. 启动中途失败也执行已经登记的 cleanup；汇总错误但不跳过后续释放。

**验收（已通过）**

- 重复关闭与启动半失败时，每个资源恰好释放一次（registry 级 `lifecycle.test.ts`，真实入口子进程
  用例 `index-startup-lifecycle.test.ts`，故障注入 `fault-mutation.test.ts`）；`shutdown-aggregator.test.ts`
  另以声明式 producer 列表验证顺序、异常隔离和幂等。
- 默认入口的真实依赖装配、`listen(app, PORT)` 以及「只注册一处 aggregator」这件事本身，由
  `index-startup-lifecycle.test.ts:81` 的**源码级断言**守门（该用例不执行 `index.ts`）；而「同一 Server
  禁止注册第二个 `onBeforeShutdown`」的机制有行为用例（`shutdown-aggregator.test.ts:145` 以
  `assert.throws` 锁定）；真实 Colyseus
  `gracefullyShutdown(false)` 释放监听句柄与 `shutdown.ts` 的停止/清理次序才是行为用例，最终 cleanup 固定按
  `character-ready → detached-tasks → registered-resources` 执行。XREAD、repair worker、loop monitor、
  stream depth alert 和存储入口仍有连续 start/stop 与停服关闸用例。

保留边界：完整外部 Redis/MySQL/WebPlatform smoke、真实 Creator 预览和目标设备采样仍不在 Node 证据内；
默认进程的真实启动依赖这些本地/外部服务，测试中的 Colyseus 句柄证据只验证框架停服语义，不等于生产拓扑
或第三方服务可用性承诺。
`index.ts` 的装配语义也没有执行级用例：等价改写（换别名、把 `startKickConsumer` 移到未被 await 的分支、
在保留字面量的前提下调整实际执行顺序）可继续通过源码断言，纯格式化则会误红。默认进程「启动成功 → 收到
停服信号 → 按序释放 → 正常退出」同样仍无端到端用例——现有证据是源码断言、抽出接缝的行为用例与裸
Colyseus 句柄用例三段拼接，进程级正常停服继续由本地 `smoke` 承担。

## 6. P1：稳定框架接缝

### P1-01 拆分 App/Session/Scene/Room/Gameplay 生命周期 ✅

状态：已完成当前 Demo 所需的可替换接缝。`Main` 已收缩为 shell；服务端/客户端玩法分别通过
`GameMode` catalog、`GameplayRegistry` catalog 和精确 room capability 装配；重复 ECS entity 会被幂等清理。

复核缺口已收口：shared 提供 canonical `GameplayModeId` 与 validator，Game join 强制显式 `mode` 并按
`sId + mode` 隔离撮合；服务端只在 `onCreate` 验证后实例化对应 mode，等待型 lifecycle hook 可观察，开局
回滚与 dispose 均 exactly-once 清理。客户端 registration 同时拥有 factory/joiner，`RoomController` 在所有
接管、拒绝、取消和失败路径等待同一个 dispose Promise，畸形 capability 也会释放可用的 leave ownership。

`idle` 已通过服务端 `modes/catalog.ts`、客户端 `gameplay/catalog.ts` 和真实 `GameRoomTransport` 接入生产装配，
同区同 mode 可合流、不同 mode 必隔离；它不依赖 `ballMove` factory，也不会写入 ballMove casual evidence。
客户端 catalog entry 同时拥有自己的 factory/joiner；catalog 装配的通用参数是
`GameplayPresentationHost`（context 另带可选的玩法 joiner 字段），由具体 entry 按需动态 import 并创建
presentation，因此 `Main` 不持有或命名具体玩法 View。新增无 presentation 或自带 presentation 的玩法只需
增加 shared mode id、双端 mode/plugin、room adapter 与 catalog 登记；需要引擎宿主时消费该通用 host，
不修改 `RoomClient`、`RoomController` 或通用 `GameRoom` transport。`Main` 侧守门用例断言它不直接引用
玩法 joiner/登记函数与具体 presentation 模块（`BallMoveView`/`ballMovePresentation` 等）；
`GameECS.addPlayer` 对重复 collection key 幂等，`clear()` 不遗留 bitECS entity。

保留边界：共享的 `GameRoomState`、Waiting/Playing/Settle 相位、两人开局与部分 reset/settle 仍以 ballMove
Demo 为基线；`idle` 只是无 presentation 的最小 multi-mode 证明，不代表已交付完整第二玩法 UI 或通用多玩法
状态模型。接入不同房间状态/结算语义的玩法仍需先扩展相应 shared Schema 与 mode 契约。

保留边界：presentation 的覆盖面——现有用例只锁定「idle 不创建 `BallMoveView`」与「缺 host 时 ballMove
fail-closed 并释放 lease」两条反例；经 catalog `presentationFactory` 真实解析动态 import 并挂载/卸载适配器
的正向链路仍只由 Creator 预览确认，尚无 Node 用例——相对路径或分块在 Creator 侧解析失败时，Node 侧全绿
也发现不了。

### P1-02 补齐 View、Logic 和异步页面生命周期 ✅

状态：已完成 Node 可测试边界。View lifecycle hook、AbortSignal/generation、open 失败回滚、交互租约和
迟到异步结果均已收口；真实 Creator 引擎行为仍需编辑器预览。
复核缺口已收口：`pageLogic.test.ts` 与 `guildLogic.test.ts` 恢复并扩展逻辑层生命周期用例，直接覆盖 stop 后
迟到结果零回调、AreaList 世代/快照/恶意响应隔离、LoginNotice 迟到响应，以及旧 Guild pull 不阻塞新世代。
`viewLifecycle.test.ts` 通过最小 cc/FairyGUI 运行时桩动态加载真实 `FguiView`、`ViewMgr` 和具体 View，覆盖
cacheable 页面 mount/onOpen/setup/render 四段打开失败回滚、输入租约计数与恢复、具体 View 的
`closeLifecycle → logic.stop`、重复 setup 100 次不叠监听、进度归一化和占位控件置灰。事件层 `observeAsync`
与页面组合层 `observePageAction` 的 rejection 都有 `unhandledRejection` 实证，并守住 Login 两个真实导航
调用点；未被读取的旧上下文接缝已删除。句柄每次重挂都新建，`state.closed` 一旦
置位即保持失效，重复 `close` 与旧世代句柄均不会触碰当前页面。
覆盖面：陈旧句柄的两道门中，`state.closed` 幂等门有用例（`viewLifecycle.test.ts:645-647`）；「未关闭的旧
世代句柄不得按名字关掉新重挂世代」的身份门（`ViewMgr.ts:271`）尚无定向用例——`viewLifecycle.test.ts:665`
的同名断言实际由 `state.closed` 早退满足，误删该行仍会通过。要真正覆盖需构造「从未 close 过的旧句柄在
`close(name)` + 重新 open 之后才调用 close」的场景。

已实施的生命周期边界：

1. `onCreate/onOpen/onClose/dispose`，永久接线只能执行一次。
2. 每次打开持有 AbortSignal/generation；Area/Notice HTTP、Guild pull 等迟到结果在 close/stop 后不得回调。
3. 场景/root generation 变化时取消旧 pending load；mount/setup/render 失败统一回滚并释放交互租约，
   多实例 Confirm 也不会留下已挂载孤儿。
4. Login/Home/AreaList/Notice 的重复 `setup()` 不得追加相同监听。
5. `LoginView.setProgress` 更新 ratio；未参与行为的 Login 控件在契约中保持为明确的展示/占位字段。
6. 事件入口必须观察 async 错误，不留下 `void openLogin(...)` 的 unhandled rejection。

**完成标准**：同一 View 重复 `setup()` 100 次后一次事件只触发一次 action；关闭后 deferred 完成产生 0 次
UI/Logic 回调。真实 Creator 输入与资源行为仍由编辑器预览确认。

### P1-03 建立完整 wire runtime contract ✅

状态：已完成当前核心 endpoint/transport 覆盖。HTTP、Lobby RPC、Game C2S/S2C 和 WebPlatform Public
response 均有 runtime validator 与 malformed/extra-key 测试；未来新增 endpoint 仍须登记 contract map。

当前实现由 `GameHttpContractMap`、shared zero-dependency validators、Lobby/Game transport validators 和
WebPlatform consumer facade 共同守住 method/path/request/response、exact keys、枚举、finite number 与
安全 origin；服务端 route 与客户端 wrapper 的核心 endpoint 从 contract key 派生。仍保留的边界是 Game
HTTP request schema 由 endpoint options 维护，但 `composeRequestSchema` 已在本地 schema 前后各夹一次
shared validator，并有 route/shared 接受集合漂移用例。Game C2S 生产 schema 已包装 shared
`validateC2SPayload`；`game-room-wire-contract.test.ts` 同时锁定 shared validator、服务端 schema、真实
`room.messages` handler 的消息集合、接受域、归一化结果和非法请求错误，单个字段上界漂移也会失败。
复核备注：WebPlatform consumer map 还登记了仓内未调用的 Livez/Readyz 两个契约，属 consumer 子集而非
生成全集，当前无实际暴露面。

**完成标准**：畸形 2xx/RPC/S2C、未知字段和非法 endpoint 在状态写入或连接前失败；HTTP path/method、HTTP
request 域、Lobby RPC request shape、Game C2S 和 Schema wire 投影的任一侧漂移均使本地测试失败。真实
`GameRoomState`/`PlayerState` 实例会直接进入 shared validator；测试还锁定 `state.toJSON()` 的顶层与玩家
精确字段集合、内部字段不外泄，并断言序列化投影和实例得到相同的 shared 校验结果。因此 Schema 字段改名、
删除、新增或误暴露不再只到客户端运行期才被发现。

### P1-04 渐进推进 schema-first 协议 ✅

状态：已完成第一阶段 schema-first 收口：shared exact validators、RPC/HTTP contract map、Colyseus state
镜像和协议 fingerprint 已接入；更广泛的自动生成 state/schema 仍属于后续演进，不作为当前能力承诺。

shared exact validators、RPC/HTTP contract map、Colyseus state mirror、fixtures 与 fingerprint 已接入，
并收紧 phase、RPC reply 判别和错误码映射。`protocol-fingerprint.mjs` 现只接受唯一顶层 export、忽略
注释并对重复声明报错；反例测试已覆盖“注释旧版本、声明新版本”。更广泛的自动生成 state/schema 仍是
后续演进，不属于当前核心承诺。

### P1-05 补齐 FairyGUI 结构和资源闭包 ✅

状态：已完成当前页面集合。递归/list-item/manual 契约、包依赖闭包、导出物 manifest/hash、deadline/cancel
和失败回滚均有 codegen/FGUI 门禁；编辑器中的 `autoClearItems` 等行为仍需人工预览。

当前 codegen 已递归记录嵌套/list-item/manual binding、relation、controller 和 `ui://` 引用；四个 AUTO
区仍由单源生成。required/shared package 缺失或超时会返回可重试错误，View open 贯通 deadline/generation，
`verify:fgui` 维护 XML、`.bin`、图集和生成绑定的 manifest/hash。

复核备注（已收口）：`scripts/fgui-manifest.test.mjs` 直接调用可注入 manifest 路径、当前快照和 logger 的
`checkManifest`，以临时 fixture 覆盖 root、package id、package.xml 组件声明和 View/AUTO 漂移；纯校验层仍
覆盖 source/export 哈希不符、记录缺失或多余、路径越界、导出物多重归属、manifest 结构非法、重复 package
name/id、非法 `ui://` 引用和 package.xml 伪声明。CLI 子进程用漂移 manifest 确认退出码为 1，并确认
`--check` 不会隐式改写 manifest；另保留对真实仓库资源闭包的只读正例。

保留边界：`checkManifest` 编排层仍有 package 缺失/多余、package.xml 资源声明变化、View 缺失/多余五类分支
没有反例，只由 `compareRecords`、`sourcePathProblems`、`outputOwnershipProblems` 等纯校验单测间接覆盖；
manifest 不存在与 JSON 无法解析两条 throw 路径也无用例。现有编排用例对真实仓库资源顺序有隐式依赖
（`packages[0].name === "Common_Btn"`、`views[0].pkg !== "View_Home_Home"`），资源重排会让断言以误导性
信息失败。另：`checkManifest` 的 `manifestPath` 默认读 `FGUI_MANIFEST_PATH`
（`scripts/fgui-manifest.mjs:427`），该 env 对生产 CLI 同样生效——`verify:fgui`（经 `verify:core`/
`verify:all`）会改为与该变量指定的文件比对且不提示真源被替换（指向不存在的路径会显式报错；指向**与当前工程一致的异源副本**——例如刚 `--write` 出来的临时文件或
另一分支的同步副本——则会报绿、门禁静默失效，而真正陈旧的副本反而会报红），而 `--write` 分支（`:481-484`）硬编码写回 `MANIFEST`、完全
忽略该 env。正式门禁必须在未设置该变量的环境运行；收敛方向是把子进程用例改为传显式 `--manifest <path>`，
或在 `manifestPath !== MANIFEST` 时打印一行显式告警。

**完成标准**：设计源变更未重新导出、嵌套字段改名、加载中关闭或 required 包缺失都被本地检查稳定捕获。

### P1-06 收紧服务端配置、任务和存储防腐层 ✅

状态：已完成计划内边界。数字 parser、compute admission、dispatcher timer、strict request、Redis route
URL、freeze keyset 和坏值校验已落地；relayer 事务边界、archive 隔离和热档迁移仍列为明确限制。
复核备注（已收口）：`03515e2` 已补生产接缝测试。`compute-pool.test.ts` 用独立进程和最小容量稳定触发
running + queued 饱和；`dispatcher-idem.test.ts` 直接执行 deadline helper，覆盖成功/超时两支的 timer
`unref/clear`，`config-guard.test.ts` 另锁定 `IDEM_PENDING_MS > HANDLER_TIMEOUT_MS`。freeze janitor 测试覆盖
`(frozen_at,user_id)` 游标跨调用续扫、失败行不推进及短页/空页重置；`batch ≤ 0` 继续按兼容语义钳到 1，
并由测试钉死。

1. 完整数字 parser 拒绝尾随垃圾、指数写法、NaN/Infinity 和非安全整数；负值与上下界由调用方传入的
   min/max 选项拒绝（parser 本身不内置非负约束，`numbers.ts:16`/`:36` 的正则显式允许前导 `-`），当前 65
   处调用点全部显式传 min。
2. compute pool 有总队列容量、admission policy 和稳定 overload 错误；周期任务不进入请求池。
3. dispatcher 成功路径清理/unref timeout，pending lease 与执行窗口保持明确边界；timeout 仍不取消 handler，
   迟到副作用由数据层幂等收敛。
4. Redis/MySQL 数字读取统一做 finite/integer/range/schema 校验，坏值不会进入领域和协议。
5. 需要 exact 的 Zod 边界使用 strict 语义；unknown message 先经过有界 per-principal 限流。
6. redis-route 在装载期校验每个 durable/cache URL 和 bucket 覆盖，错误配置 fail-fast，不回退到 ioredis
   默认地址。`redis-route.test.ts` 通过临时 YAML 和真实 `REDIS_ROUTE_FILE` loader 覆盖解析、排序、每条
   durable/cache URL、buckets 常量、range 合法性、桶无缝覆盖 `[0,BUCKETS)` 与缺文件 fallback。
7. freeze janitor 已收口为有界 keyset 扫描：`core/archive/freezeWorker.ts` 每轮把 `batch` 作为总扫描
   预算，按 `(frozen_at,user_id)` 游标跨调用续扫。正常冷档行经无锁 EXISTS 预筛 `continue` 不删行，
   但不会长期占据排序前段，后面的陈旧残留行与 PITR 后的 ARCHIVE_NEWER 行可在后续轮次被扫描；游标
   只保存在 worker 进程内，重启后从头开始仍保持幂等安全。显式非法 `batch` 与损坏的 `frozen_at` 在
   边界拒绝，失败行不会推进游标。⚠ freeze worker 默认硬关闭（`FREEZE_ENABLED`），默认配置下不触发，
   且 archive 的区隔离/容量方案仍不属于当前核心承诺。
8. 认证组 sess fence 也纳入统一脚本登记：`core/auth/session.ts` 以 `defineScript` 声明
   `SESS_FENCE_LUA`，写入经 `evalshaWithReload` 执行；集成用例注入一次 `NOSCRIPT` 并验证自动
   `SCRIPT LOAD` 重试，同时锁定 `written`/`unchanged`/`stale` 语义。该用例注入的是伪造的含
   `NOSCRIPT` 文本的 Error，只验证会话写路径确实经过 `evalshaWithReload`；真实 Redis 的 NOSCRIPT
   报文形状由 `int/effect-atomic.test.ts` 的 fault matrix 用例（每次运行唯一、必然未缓存的探针脚本）
   覆盖，两者合起来才完整。

### P1-07 收敛区目录和跨端确定性语义 ✅

状态：已完成当前目录/玩法接缝。目录快照、HTTP/WS 双端点、fixed-step seed/input 和 reconnect reconcile
均有单源实现与测试；目录 hash 不承担 join 准入语义。

- `openAreaList` 刷新成功后通过 `setServerList` 原子替换 `AreaListLogic` 与 `serverSession` 共享的目录快照，
  同时保留仍存在的当前区；失败保持完整旧快照。列表、hash 和 selection 不再由三个分步模块变量拼接。
- 页面 HTTP consumer 与房间 joiner 分别消费 `gameHttpUrl`、`gameWsUrl`；目录响应中的 `hash` 不进入 join
  options，因而不会暗示不存在的陈旧目录准入语义。
- shared `logic/time.ts` 使用显式 UTC/configured offset 计算自然日，并有跨时区 golden tests。
- `GameRoom` 的 transport 重连只做 desired input 对账（`net/RoomClient.ts:721-726`、`:865-879`，用例见
  `test/roomClientOwnership.test.ts` 的「掉线输入 reconcile」），不当作业务恢复；大厅连接最终死亡统一走
  `notifyConnLost` → `returnToLogin` 后整段重新登录来重建 session 与角色快照，目前没有独立的 session/角色
  快照对账层；大厅房也未注册 `onReconnect`，`net/WebSocketClient.ts:205` 的 `slot.dropping` 当前无消费方。

复核备注（已收口）：两个 `gameWsUrl` 消费点（`view/pages.ts` 的大厅 join、
`net/rooms/GameRoomTransport.ts:14` 的玩法 join——`createBallMoveRoomJoiner` 与 `createIdleRoomJoiner`
共用同一 transport）分别由 `pageLogic.test.ts:341` 直接执行生产 `joinSelectedServerLobby` helper、
`roomClientOwnership.test.ts:515`/`:551` 直接执行对应 joiner，均断言明确 WS endpoint；页面 HTTP
consumer 的 `gameHttpUrl` 仍在 `openAreaList` 选服接线中直接传给 `initHttp`。
公告存储日期已改用 shared `naturalDayIndex`（UTC+8），`pageLogic.test.ts` 直接执行生产纯函数并钉住跨自然日
边界；无生产调用方的 `clearServerList()` 公共写入点已删除，测试用合法空目录响应复位状态。

### P1-08 闭合本地验证与依赖锁 ✅

状态：已完成。客户端完整无头 strict 探针与 ES2017 legacy 探针均可独立通过，后者已进入根 `typecheck`
以及上层 `verify:core` / `verify:all` 聚合链。失效的 loadtest、Excel 产物链和真实 Creator 预览仍按
额外/人工验证边界处理。

1. 独立 client-test tsconfig（Node 22 lib + 最小 cc/FGUI stubs）已纳入 Main/View/tests，旧字段已修复。
2. `test:fgui` 已拆成准确的 `test:client` 与 FGUI 专项命令，并提供分层 `verify:core`/`verify:all`。
   `verify:core` 同时执行 manifest 正向检查与 `test:fgui` 反例/registry 契约；`verify:all` 只继承一次
   `verify:core` 再追加服务端单元测试，不再重复执行客户端测试。
3. root 显式拥有 `tsx/tsc` 等脚本依赖，不依赖 server workspace 偶然 hoist；推荐 Node 22.x 约束已写入
   工具链与文档。无第三方依赖的 `verify-toolchain.mjs` 作为 `verify:core` 首闸，检查 `.node-version`、根与
   server engines、`@types/node`/`tsx`/`typescript` 直接声明、lockfile 投影及解析版本；并精确锁定
   `typecheck`、`verify:sync`、`verify:core`、`verify:all` 的命令集合/顺序和三类负向测试入口。
   `toolchainContract.test.ts` 会逐项删除聚合命令、漂移依赖/lock 声明、弱化测试入口或删除自身，确保
   verifier 不会因脚本或反例测试被移除而自举放行。
4. bitECS/vendor lock 现在校验实际文件集合与应锁集合相等；vendored WebPlatform tgz integrity 也有
   `vendorLock.test.ts` 覆盖。`.gitattributes` 已为 `apps/Cocos/extensions/**`、`apps/art/fairygui/assets/**`
   等机检域钉 `eol=lf`，避免字节锁在不同平台误报。
5. `dev-stack.sh` 通过 PID、实例标识、启动时间、二进制、端口和数据目录确认所有权；
   `apps/server/tools/smoke.ts`（`smoke:framework`）使用本次运行唯一脚本验证 `NOSCRIPT`（`:51-61` 的
   nonce），不对共享 Redis 执行无条件 `SCRIPT FLUSH`（全仓无任何 `SCRIPT FLUSH` 调用）；端到端的
   `apps/server/test/smoke.ts`（`smoke`）不触碰 SCRIPT 缓存。
6. 失效的 loadtest 与未闭合的 Excel 生成链继续归额外功能；它们不进入 `verify:core` 的核心门禁。
7. `d96186b` 先补齐了 legacy `cc-stub.d.ts` 的 `Color`、`EventTouch`、`Graphics`、`Input`、`UITransform`、
   `input` 与 `Vec3.set`，使当时 include 白名单范围内的 legacy 探针可独立通过；`10cf94d` 再把
   `apps/client/tsconfig.json` 的 include 收敛为递归 `src/**/*.ts`（exclude 只剩 `**/*.meta`）并补齐 Main 与
   全部 View 所需的 cc/FairyGUI 声明桩，`npm run typecheck:client:legacy` 才覆盖全部客户端源码（该覆盖面换来
一处严格性放宽：legacy 配置新增 `noUnusedLocals: false`，以容纳 FGUI codegen 生成的绑定字段，其余严格项
不变）；根
   `typecheck` 明确串行执行完整 ES2022 无头探针和 ES2017 legacy 探针，因此 `verify:core` / `verify:all`
   会守住全部客户端源码的运行时下限。`clientTypecheckConfig.test.ts` 递归收集并断言每个
   `apps/client/src/**/*.ts` 都在 legacy program 中，同时注入 `Object.fromEntries` 与 `Promise.allSettled`
   反例，确认 ES2017 API floor 和根聚合命令均不可被静默削弱。
8. `apps/client/tsconfig.json`、`cc-stub.d.ts`、根/客户端/Cocos README 与 CLIENT/OVERVIEW 文档均已区分
   `typecheck:client`（完整源码与测试、ES2022 桩）和 `typecheck:client:legacy`（全部 `src/**/*.ts`、
   ES2017 下限），并明确根 `typecheck` 同时运行两者。

保留边界：legacy probe 使用本地引擎声明桩，能守住 TypeScript 文件集合和 ES2017 API 下限，但不能替代
真实 Creator 引擎、资源导入、运行时交互和目标设备验证；这些仍由编辑器预览与人工采样承担。

### P1-09 建立能力—代码—测试—文档清单 ✅

状态：已完成。`docs/inventory.json` 登记能力、默认入口、真源、wire/runtime 边界、验证命令和权威文档，
`verify:inventory` 会检查路径、命令、链接、默认模块与能力归类。

每个核心能力必须能定位到活跃入口、真源、运行时边界和测试；每个默认活跃模块也必须在 OVERVIEW/就近
README 标明。`plan.md` 是核心优先级真相，`docs/EXTRAFEATURES.md` 是额外能力真相，不再维护第二套路线图。

本轮已同步修正 AGENTS/CLAUDE、CLIENT/SERVER/WEBPLATFORM、第三方依赖域、说明站保留约定和失效链接，
并把能力归类、默认入口、真源、wire/runtime 边界、验证命令和权威文档固化到 `docs/inventory.json`。
`verify:inventory` 会检查默认活跃模块未漏记、命令/链接存在、两份助手指令口径一致以及核心计划与
额外功能没有重新分叉。根 `LICENSE`、项目身份和第三方来源登记均由项目元数据契约统一校验。

复核备注（已收口）：`scripts/verify-inventory.test.mjs` 在隔离 checkout 中提供 12 个正反例，覆盖漏记
workspace main、`app.config.ts` 组合根、Creator scene 压缩 UUID 对应的 `Main.ts`、命令消失、文档链接
失效/越界、AGENTS/CLAUDE 分叉或共同删除关键条款，以及 verifier 参数边界；fixture 会纳入未忽略的未跟踪
文件，避免反例测试首次入库前发生自举假红。

清单语义也已纠正：核心资产 effect 指向真实 purchase 入口；独立 relayer 单列为 extra，并校验 workspace
launch 命令确实启动登记入口。默认入口从 workspace main 的直接静态组合 import 与默认 scene 脚本 UUID
独立发现，不依赖清单自报 `sceneClass`。AGENTS/CLAUDE 除空白外全文一致，并锁定镜像、shared、View/Logic、
FGUI、外部身份和 inventory 命令等必要条款；README 命令表已补 vendor、inventory 反例和 perf 门禁。

说明站边界已闭合：`apps/website/` 保留为新设计站点的本地 Sites checkout/构建工作区，由 `.gitignore`
忽略，不进入 Git 索引、workspace、能力清单或核心验证；本仓不恢复 gitlink/submodule，也不删除该物理目录。
额外文档边界也已闭合：`docs/undergroundIdle/` 已在 README、AGENTS/CLAUDE 和
`docs/EXTRAFEATURES.md` 登记为未实现的玩法策划案，不伪装成活跃能力或默认入口。

保留边界：`apps/client/src/gameplay/` 是 inventory 登记的 `gameplay-boundary.defaultEntry`，`91fdf02` 后
允许依赖 `cc` 与动态 import `view/`（`catalog.ts:1` 的 `import type { Node } from "cc"`、`:50` 的动态
import），且不在 `logic-purity.test.ts` 的 `LOGIC_DIR` 覆盖范围内；但它当前没有就近 README——是
`apps/client/src` 下唯一「自身含源码文件却没有就近 README」的顶层目录——CLAUDE/AGENTS 的 README 缺口
枚举也未列它。后续应补 README 或把该目录加入枚举；`docs/OVERVIEW.md` 已提及该目录，故不违反本条的
「默认活跃模块须在 OVERVIEW/就近 README 标明」，`verify:inventory` 也不会因此变红。

保留边界：组合根发现不声称构建完整 TypeScript import graph，scene 发现不扫描动态 prefab，Markdown
检查守住登记链接与锚点而不是通用语法解析。

## 7. P2：正确性稳定后的增强

### P2-01 建立可重复的性能基线 ✅

状态：已完成当前开发期基线。`tools/client-perf-baseline.ts` 使用固定 seed、Float64 input tape 和
100/500 entity workload，记录 tick、self lookup、snapshot 分配以及生产渲染命令路径；schema v2 的结构
投影写入 `docs/perf/client-ballMove-baseline.json`，`npm run verify:perf` 会重跑并比较输入、命令数、
`renderChecksum`、`frameRenderChecksum`、聚合 checksum 和分配估算值。计时分布、heap delta 与
Node/平台信息仅用于同机趋势观察，不构成 Cocos/GPU 性能阈值。

复核备注（已收口）：`BallMoveGameplay.ts` 中的 `renderBallMoveWorld` 是生产渲染命令序列的单一实现，
`BallMoveView.render` 与无头性能 sink 均调用该函数。`performanceBaseline.test.ts` 通过最小 `cc` 桩动态加载、
mount 并执行真实 `BallMoveView`，将完整有序 trace 同无头路径及显式命令字面量比较，覆盖 self/other/dead、
`maxHp=0`、全部颜色和几何分支。摘要按唯一 opcode 与固定小端 Float64 全字节流式计算，setter、颜色、线宽、
命令顺序和每个参数均在契约内；反例直接锁定整数几何、参数换位、opcode、顺序与样式变异。`snapshotPlayers`
仍是用于比较临时快照分配代价的独立探针，不表示生产渲染会构造该快照；真实 Creator/GPU 阈值继续由本地
预览和目标设备采样承担。

### P2-02 风险加权的故障与变异测试 ✅

状态：已完成当前风险矩阵。`scripts/fault-matrix.config.json` 登记 2 个 unit 组
（`server-boundaries`、`client-transitions`）和 2 个 Redis/MySQL integration 组
（`storage-effects`、`character-ready`）；`test:faults` 与 `test:faults:int` 均要求每个 fault point 实际
执行并由 coverage 证明 fail-closed。它是定向故障/变异矩阵，不是自动源码 mutation 或全局覆盖率指标，
集成组需要本地 Redis/MySQL；WebPlatform 登记故障使用契约兼容的本地测试替身，不要求外部 WebPlatform
进程在线。

复核备注（已收口）：`fault-mutation.test.ts` 使用真实 Worker 分别触发 `error` 与 exit-only 死亡，直接断言
在途任务拒绝、尸体 reap、1 秒退避后只补一个健康 worker，并覆盖故障前已排队与故障后才入队两种时序。
待补位 timer 计入池容量，后到请求不能 eager spawn 绕过 backoff；队列非空时 timer 保活，排队任务先超时并
清空队列后恢复 unref。structured-clone 与任务级异常仍分别验证健康 worker 可复用、后续任务可继续完成。

### P2-03 Starter 初始化与项目元数据 ✅

状态：已完成当前 Starter 范围。幂等 `init:project`、项目身份/包名推导、生成区标识、根 MIT `LICENSE`
和第三方来源登记已落地并纳入 `verify:project`。Unity、托管、渠道与商业化不进入该命令的必选项。

复核备注（已收口）：`projectMetadata.test.ts` 现以相同参数连续运行两次真实 `init-project.mjs`，断言第二次
明确报告「已更新 0 个文件」，并递归比较第一次运行后的完整 fixture 文本快照，确保没有隐蔽改写或新增；
`docs/PROJECT.md` 的幂等承诺已进入客户端核心测试门禁。

## 8. 实施顺序与收口状态

```text
阶段 A：正确性止血（已完成）
  P0-01 客户端会话/连接
  P0-02 GameRoom 边界/状态
  P0-03 effect/区隔离
  P0-04 character ready
  P0-05 默认生命周期

阶段 B：稳定框架接缝（已完成当前核心范围）
  P1-01/P1-02 App、玩法与 View 生命周期
  P1-03/P1-04 wire contract 与 schema-first
  P1-05/P1-06 FGUI、配置、任务与存储防腐

阶段 C：开发体验收口（已完成当前核心范围）
  P1-07 区目录与确定性
  P1-08 验证与锁定
  P1-09 文档真相 ✅
  P2-01/P2-02/P2-03 已完成
```

依赖原则已按上述顺序执行：先修竞态和数据原子性，再抽象状态机/玩法接口；先定义生命周期，再做资源
释放；先让测试源码进入严格类型检查，再把聚合 verify 作为重构护栏。

## 9. 首批任务完成记录

1. 已增加 `WebSocketClient` join(A)→init(B) 回归测试，并冻结 join 身份。
2. 已为两类 join 增加 deadline/cancel，覆盖黑洞连接和迟到成功释放。
3. 已把登录至 Home 与三类失效事件收敛成单一 transition 测试。
4. 已覆盖掉线期间松手→重连 stop/desired replay。
5. 已给 GameRoom C2S 增加 exact validator、phase gate 和 Waiting→Playing 全量初始化。
6. 已重写 effect 为 validate-then-apply，并补 durable intent 与跨区 `readBack` 测试。
7. 已明确 Lobby ready 契约并覆盖空库首次 GetInfo、并发与超时。
8. 已建立 shutdown aggregator，为默认组件补可等待 dispose。
9. 已新增 client-test tsconfig，修复登录字段并把 Main/View 纳入最小类型桩。
10. 已修复 View 重复 setup、迟到 callback 和 GameECS duplicate-add 幽灵实体。

## 10. 统一完成定义

本轮核心条目按以下定义完成并已由对应测试/门禁核对：

1. 真源、生成镜像、登记表和就近文档一致，不手改生成目录；额外策划案和本地站点边界由
   `docs/EXTRAFEATURES.md` 统一登记。
2. 外部/wire 边界有 malformed、extra-key、NaN、timeout 和过大输入测试。
3. 竞态由 deferred promise/fake clock 稳定复现，并断言最终领域状态而非仅调用次数。
4. timer/listener/room/worker/request 都有明确 ownership、cancel 和 dispose 语义。
5. `typecheck`、client/server tests、sync/vendor/config checks 按变更范围通过。
6. 新增生成物能确定性重建，并能检查缺失、陈旧和集合漂移。
7. 若功能属于额外范围，不把其完整度升级为核心验收项；若进入默认入口，只验失败隔离和生命周期。

## 11. 当前目标形态

在当前基线，项目表现为一个边界清晰的开发期游戏框架：

- shared 同时描述静态类型和关键 wire runtime 边界；
- client shell、session、navigation、room、gameplay 与 View 生命周期可取消、可替换、可无头测试；
- GameRoom 和数据原语在坏输入、并发与故障测试下保持明确不变量；
- FGUI、镜像与锁定依赖能判断“是否来自当前真源”；
- 新增玩法主要扩展 GameMode/GameplayPlugin 和登记点，不修改通用接缝；presentation 由玩法 catalog entry 按需创建，见 P1-01；
- 核心计划与额外功能各有唯一文档，不再互相制造隐含承诺。
