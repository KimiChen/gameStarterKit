# game 微信小游戏 monorepo

Cocos Creator **3.8.8** 客户端 + Colyseus **0.17** 服务端 + 双端共享协议包。

```text
game/
├── package.json              # npm workspaces（只含 shared + server，client 不入 workspace）
├── tsconfig.base.json
├── scripts/
│   ├── sync-shared.mjs       # shared/src → client/assets/script/shared 同步（--watch 可监听）
│   ├── fetch-fgui.sh         # 拉取 fairygui-cc 运行时到客户端扩展（npm run fetch:fgui）
│   └── ecs.sha256            # ECS 库字节不变校验基线（npm run verify:ecs）
├── tools/
│   └── fgui-codegen/         # FairyGUI 组件 XML 解析 + 绑定 codegen + 结构契约校验（纯 Node 零依赖）
├── docs/
│   ├── server/               # 服务端框架规则文档（01-10 + 冒烟/验证记录；写服务端前先读 09）
│   └── research/             # FairyGUI 引入方案/上手/设计师工作流
└── apps/
    ├── shared/               # @game/shared：协议/常量/纯逻辑（零依赖，Cocos 编译器安全）
    │   └── src/{protocol,constants,logic}
    ├── server/               # @game/server：Colyseus 0.17（公司服务端框架 + 模拟接口共存）
    │   ├── src/{app.config.ts,rooms,mock}          # 房间 + mock 接口
    │   ├── src/{infra,core,auth,gateway,economy,rank,archive,gameplay,routes}  # 框架（见下）
    │   ├── sql/schema.sql    # MySQL 8 全量 DDL
    │   └── tools/            # dev-stack.sh 本地栈 / db-bootstrap / 框架冒烟 / M0 验证工具
    ├── art/
    │   └── fairygui/         # FairyGUI 编辑器工程：公司标准组件库 Original(+A) + Rank 示例包
    └── client/               # Cocos Creator 3.8.8 工程（微信小游戏），见其 README
        ├── assets/script/{Main.ts,lib/ecs,lib/colyseus,shared,net,game}
        ├── assets/resources/ui/      # FairyGUI 发布产物（Original/Rank 的 .bin + 图集）
        └── extensions/fairygui-cc/   # fairygui-cc 运行时扩展（外壳入库，运行时 fetch:fgui 生成）
```

## 快速开始

```bash
# 环境：Node >= 22（Colyseus 0.17 要求）
npm install                 # 安装 shared + server 依赖
npm run dev:server          # 启动服务端 http://localhost:2568
                            #   端口在 apps/server/.env.development 中配置
                            #   （Colyseus 默认端口 2567 在本机被其他项目占用）
                            #   /          → Playground（开发调试台）
                            #   /monitor   → 房间监控
                            #   /api/*     → HTTP 模拟接口（假数据）
```

客户端：用 Cocos Dashboard 3.8.8 打开 `apps/client`，按
[apps/client/README.md](apps/client/README.md) 完成一次性配置后预览。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev:server` | tsx watch 启动服务端（端口 2568，见 server/.env.development，可用 PORT 覆盖） |
| `npm run sync:shared` | 同步共享代码到客户端（改完 `apps/shared/src` 后执行） |
| `npm run sync:shared:watch` | 监听模式持续同步 |
| `npm run typecheck` | shared + server 类型检查 |
| `npm run verify:ecs` | 校验 ECS 库 8 个文件与上游字节一致 |
| `npm run fetch:fgui` | 拉取 fairygui-cc 运行时（每台机一次，扩展运行时不入库） |
| `npm run test:fgui` | FairyGUI 结构契约 + presenter 无头测试 |
| `npm --workspace @game/server run smoke` | mock 链路冒烟（12 项，需服务端已启动） |
| `npm --workspace @game/server run stack` | 起本地栈：redis-durable(6401)+redis-cache(6402)+MySQL(3316) |
| `npm --workspace @game/server run db:bootstrap` | 建 `game` 库 + 全量 DDL + 预置行 |
| `npm --workspace @game/server run smoke:framework` | 框架连通性冒烟（Redis 形态/表齐全/Lua 重载） |
| `npm --workspace @game/server run test` | 服务端单测 |
| `npm --workspace @game/server run test:int` | 集成测试（真实 Redis+MySQL，先起本地栈） |

## 架构决策（为什么这样搭）

1. **共享代码用"复制同步"而不是 npm 包 / 符号链接 / import map 进客户端**：
   符号链接有 Cocos 编辑器确认的资源刷新 bug 且会把 `.meta` 写进共享源码目录；
   import map 是实验特性、对 assets 外目标和小游戏构建行为未文档化；
   同步后的文件是普通项目脚本，任何平台构建 100% 兼容。
   服务端则通过 workspace 直接依赖 `@game/shared` 源码（tsx 直跑 TS）。
2. **shared 包零依赖、Cocos 编译器安全**：只用 TS 语言与 ES 标准库；禁止 `const enum`
   （Cocos 按 isolatedModules 单文件转译）；相对导入不带扩展名（Cocos 要求 .ts 导入省略后缀，
   服务端为此使用 Bundler 解析而非官方模板的 NodeNext）。
3. **客户端 Colyseus 用 `@colyseus/sdk` 的自包含 UMD**（`lib/colyseus/colyseus.js`，插件方式加载）：
   0.17 起客户端包由 colyseus.js 更名为 @colyseus/sdk，其 ESM 构建含裸 `ws` 导入，
   在 Cocos/小游戏构建下不可靠；UMD 是官方文档的 Cocos 集成方式。
   双端版本必须保持 major.minor 一致（当前 0.17.x）。
4. **微信小游戏兼容**集中在 `client/assets/script/net/wechat-compat.ts`
   （Headers/URL/URLSearchParams/TextEncoder 补丁 + WebSocket 构造签名/二进制发送修正，
   对应上游 issue colyseus/colyseus#945），仅在 MINIGAME 环境生效。
5. **Colyseus 0.17 新 API**：服务端用 `defineServer`/`defineRoom` + `messages` 属性
   （0.16 的 `initializeGameServer`/`Room<State>` 泛型已废弃）；
   状态 Schema（依赖 @colyseus/schema）只存在于服务端，客户端靠反射握手解码，
   以 shared 的 `IGameRoomState` 纯接口做类型标注 —— 保持 shared 零依赖。
6. **ECS 库字节不变**：`client/assets/script/lib/ecs/` 的 8 个文件与
   oops-plugin-framework@46bcb58 逐字节一致（MIT），校验：`npm run verify:ecs`。

## 服务端：公司框架 + mock 共存

服务端框架整体同步自公司标准实现（Arthur 项目 M0–M9，规则见 `docs/server/09-dev-constraints.md`）：

- **infra**：双 Redis 桶路由（durable/cache 物理分实例，16384 桶）、MySQL 池（RC 事务/
  死锁重试/关 FOUND_ROWS）、Lua 注册 + NOSCRIPT 自动重载
- **core**：两层用户锁（localMutex→lease）+ fence、UnitOfWork 脏表、幂等占位 pending/done
- **auth**：`POST /account/wx-login`（限流/熔断）+ 不透明 token（`{uid}.{hex}` 反查）+
  token_epoch 撤销；**LobbyRoom（房间 `lobby`）**：取数/邮件/商店走单一 rpc 消息通道
  （中间件链：鉴权→限流→zod→幂等）
- **economy**：三阶段 outbox + 充值状态机 + relayer 单例进程；**rank**：Redis ZSET +
  encodeScore 时间戳 tie-break + 赛季轮换；**archive**：冷档 freeze/thaw + ensureLive
- **结算证据链（M8a）**：房间 `game` 收局 XADD `stream:match` → consumer group 落
  `match_index`/`match_results`（幂等闸 + 安全位点 XTRIM）

以上依赖本地栈（`run stack` + `db:bootstrap`）；微信登录需 `WX_APPID/WX_SECRET`。

**mock 接口照旧可用（不依赖任何外部服务）**，替换时逐个删掉：
- HTTP：`POST /api/login`（任意 code 成功）、`GET /api/player/profile`（Bearer token）、
  `GET /api/rank`（固定种子假榜单）、`GET /api/health`
- 房间 `game`：进出房、移动积分（20fps 逻辑帧）、技能伤害结算（shared 共享公式）、
  聊天广播、心跳 —— 玩法数据均为内存假数据，重启即重置；
  带框架 token 进房的玩家收局时战绩自动落库（游客局不产生任何外部依赖）

## FairyGUI（公司标准组件库）

- 编辑器工程 `apps/art/fairygui`（FairyGUI 编辑器打开 `FairyGUI.fairy`）：
  公司原子组件库 **Original**（id k85eojd9，CloseButton1/CommonButton/CompTab…）+ **A** +
  排行榜示例包 **Rank**（跨包复用 Original 组件的完整范例）
- 运行时 `fairygui-cc` 以 Creator 扩展挂载（`db://fairygui-cc/fairygui.mjs`），
  外壳入库、运行时 `npm run fetch:fgui` 生成；发布产物（.bin+图集）在 `client/assets/resources/ui`
- 代码层三层模型：`FguiView` 薄基类（绑定层）+ 纯 presenter（`rankRows`，无头单测）+
  结构契约（`fguiContracts` ↔ 设计师 XML，`npm run test:fgui` 把关）
- 上手/方案/设计师工作流见 `docs/research/fairgui-setup-guide.md` 等
