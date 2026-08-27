# TODO —— 开发期框架待办

> 本清单只登记 gameStarterKit 作为开发期基础框架的代码质量、可测试性和可扩展性事项。
> 超出项目边界的事项不在本清单登记，边界见 [README](README.md#项目边界)。

## D1 · 客户端生命周期状态机与玩法入口插件化

**现状**

- `Main.ts` 同时负责启动、导航、HTTP、选服、房间、ECS、输入、渲染和失败处理。
- `RoomClient`、`WebSocketClient`、GameECS、HTTP session 与 ViewMgr 通过多个全局单例协作。
- ballMove 被静态绑定到入口，替换玩法需要修改框架编排。

**目标**

1. app/session/scene/room 四层状态机。
2. 玩法通过 registry 提供 `create/bind/update/dispose`。
3. 唯一 `returnToLogin(reason)` 出口。
4. session 持久化通过可注入 adapter 提供，框架不绑定具体宿主 API。
5. join、页面加载与状态迁移均有 timeout/cancel。

**验收**

- 换账号、连接失败、房间退出、场景重载分别通过状态迁移测试。
- 任一时刻最多一个有效 session、Lobby、GameRoom 和导航事务。
- 新增第二个最小玩法不修改 Main、RoomClient 或通用 loader。

## D2 · View 层可无头测试

**现状**

- `apps/client/tsconfig.json` 为避免引入完整 Cocos/FairyGUI 类型，排除了 Main 和部分 View。
- 当前契约测试能检查结构，却不能完整 import 页面并覆盖生命周期竞态。

**要做**

1. 扩展最小 `cc` / FairyGUI stub，只覆盖本仓实际使用的 API。
2. 逐个把 Main/View 移出测试排除清单。
3. 为 onlyOne、重复 setup、关闭后的迟到响应和页面加载失败增加测试。
4. 扩展 FGUI XML 解析，覆盖嵌套组件、列表 item 和设计源/导出物新鲜度。
5. 新增 client-test tsconfig，对测试源码本身做严格类型检查。

**验收**

- View 可在 Node 测试中 import。
- 并发打开同一页面只绑定一次。
- 页面关闭后，迟到请求不再更新已释放实例。
- 测试中使用旧接口字段会在类型阶段失败。

## D3 · 客户端连接与输入竞态

### join timeout

RoomClient、WebSocketClient 和进入房间编排缺统一 deadline。补充可取消 timeout，并保证失败后
`joining/inBattle/ownership` 全部回滚。

### 登录事务互斥

当前 mutex 只覆盖开发会话 HTTP，后续 join/RPC/导航仍可重复触发。把整个流程提升为一个顶层事务，
按钮状态由事务状态驱动。

### 掉线输入状态

掉线期间不能简单丢弃 stop/方向变化。输入改为“当前期望状态 + 单调序号或短租约”，连接恢复后重放
当前状态；服务端旧方向应过期或在 drop 时清零。

### session 事件串行化

authInvalid、battleLost、connLost 等复合事件进入单一串行出口，避免重复弹窗、重复 setup 和迟到事件
污染当前页面。

## D4 · FairyGUI 与资源开发链

1. 把“编辑设计源 → 导出 `.bin`/图集 → Cocos `.meta` → codegen”做成可检查的本地流程。
2. Required/optional 包使用不同失败语义。
3. View 加载失败显示开发错误页并支持重试，不以黑屏结束。
4. 共享包依赖闭包继续由 viewRegistry 声明和测试。
5. 页面释放时清理非共享资源、监听和计时器。

## D5 · Excel 配置管线后半程

**现状**

- `tools/excel-to-json.mjs` 已能校验源表并写客户端/服务端 JSON。
- 双端加载器与 committed output 新鲜度检查尚未完成。

**要做**

1. 把转换核心抽成纯函数。
2. `--check` 在内存生成规范化结果并与入库 JSON 逐字节比较。
3. 服务端开发进程读取并校验配置。
4. 客户端通过资源 loader 读取同一 schema/version。
5. 配置类型、默认值和引用关系进入 shared。

**验收**

- 改表但忘记重导时，本地 check 失败。
- 两端使用相同 schemaVersion 和内容 hash。
- 非法 ID、重复键、悬空引用和越界数值在生成阶段失败。

## D6 · 服务端输入边界与配置校验

1. GameRoom 所有 C2S 消息增加运行时 schema。
2. 拒绝 NaN、Infinity、错类型、过大数组和未知字段。
3. 未知 Lobby RPC 与普通消息共享有界处理顺序。
4. HTTP body 增加开发边界大小限制与 413 测试。
5. `envInt/envFloat` 改成 finite、范围明确的统一 config parser。
6. 缺少 Authorization 等输入返回稳定协议错误，不落成 INTERNAL。

## D7 · 资产 effect 原子性

**问题**

当前 Lua 可能边遍历边写；若后续 effect 非法，之前的修改不会自动撤销。未知 kind 和保留字段写入也
需要显式拒绝。

**要做**

1. effect 增加 type/version 与共享运行时 schema。
2. Lua 第一遍完整验证，第二遍统一写入。
3. 限制数组长度、整数范围、itemId/count 和可写字段。
4. 购买示例、邮件附件、结算和重放工具共用同一验证入口。

**验收**

- “第一条合法、第二条非法”时资产零变化。
- 未知 kind/version 与保留字段明确失败。
- 同一 op-id 重试多次只生效一次。

## D8 · 对局 evidence 与后台处理样例

1. 对局结束信息先进入可测试的 durable intent，再由 consumer 处理。
2. 定义 `started/settling/settled/aborted` 的开发状态模型。
3. 损坏 payload 进入可查询的隔离数据，不直接 ACK 丢弃。
4. relayer 使用短事务 claim，外部 I/O 不留在持锁事务内。
5. transient/permanent 错误分类与退避逻辑可由 fake clock 测试。
6. `applied:{uid}` 裁剪算法必须可证明不会删除未完成 intent 的 marker。

这些内容用于验证代码一致性算法，不代表本仓提供后台任务运行保障。

## D9 · HTTP 与外部契约单源

1. 建立 `GameHttpContractMap`：method、path、request、response、auth class。
2. server endpoint 与 client request 从 map 派生，禁止散落路径字符串。
3. 从 WebPlatform contract 生成客户端可用的零依赖 validator。
4. 统一 UserId pattern/maxLength，与 MySQL 字段一致。
5. 明确 `gameHttpUrl/gameWsUrl/listHash` 的开发语义，删除未使用的死字段或完成消费。

## D10 · schema-first 协议生成

当前 TS interface、zod、Colyseus Schema 镜像和 handler 登记仍有重复维护。选择一个 schema 真源，
生成：

- TypeScript 类型。
- 运行时 validator。
- RPC/HTTP contract map。
- Colyseus state 镜像。
- 协议 fixture 与 fingerprint 输入。

目标是让改字段、漏 handler、错 method/path 或未同步生成物在本地检查中立即失败。

## D11 · 玩法模式接口与确定性测试

服务端从 GameRoom 拆出：

```text
validateJoin
  → createState
  → acceptInput
  → tick
  → finish/buildEvidence
  → abort/dispose
```

客户端建立引擎无关 `InputAction`，触摸、键鼠与测试回放只是 adapter。相同 seed 和输入序列应得到
相同结果；simulation 不直接依赖 Cocos 节点或 Wall Clock。

## D12 · 客户端基础服务

按实际玩法需要渐进补充：

- Audio：BGM/SFX bus、静音和资源释放。
- Localization：message key、fallback、日期/数字格式和伪本地化。
- SafeArea：四边 inset 与多分辨率页面策略。
- Connection/Reconcile：连接恢复后主动 pull 当前领域状态。
- Performance：缓存 ECS query/self eid，减少每帧临时对象和全量重画。

这些 service 通过接口注入，不绑定具体渠道 API。

## D13 · Starter Kit 初始化与文档一致性

1. 增加幂等 `init:project`，替换 project id、包名、显示名和示例品牌。
2. root 显式声明工具依赖，不依靠 workspace 偶然 hoist。
3. 增加 tracked package inventory 的本地检查。
4. README、AGENTS、CLAUDE 与 docs 使用同一边界措辞。
5. 易漂移的路径、命令和常量尽量由脚本生成或校验。

## D14 · Unity 转译 spike

`apps/Unity` 当前只是目录占位。投入前先完成限时 spike：

1. 确定 Unity 版本与最小工程。
2. 验证 shared 协议/公式的 TypeScript → C# 生成或等价实现。
3. 验证一个 ballMove system 的数据模型转换。
4. 记录可共享与必须端侧实现的边界。

若 spike 不成立，就把 Unity 定位收缩为只共享协议/公式，不继续维护代码复用假设。

## 存档：eslint 暂不引入

2026-07 已评估：当前更适合继续使用 TypeScript strict 选项和小型定制检查，不引入完整 ESLint
工具链。重新讨论前应先证明它能覆盖现有检查无法发现的具体缺陷。
