# game 微信小游戏 monorepo

Cocos Creator **3.8.8** 客户端 + Colyseus **0.17** 服务端 + 双端共享协议包。

```text
game/
├── package.json              # npm workspaces（只含 shared + server，client 不入 workspace）
├── tsconfig.base.json
├── scripts/
│   ├── sync-shared.mjs       # shared/src → client/assets/script/shared 同步（--watch 可监听）
│   └── ecs.sha256            # ECS 库字节不变校验基线（npm run verify:ecs）
└── apps/
    ├── shared/               # @game/shared：协议/常量/纯逻辑（零依赖，Cocos 编译器安全）
    │   └── src/{protocol,constants,logic}
    ├── server/               # @game/server：Colyseus 0.17（模拟接口 + 假数据）
    │   └── src/{app.config.ts,rooms,mock}
    └── client/               # Cocos Creator 3.8.8 工程（微信小游戏），见其 README
        └── assets/script/{Main.ts,lib/ecs,lib/colyseus,shared,net,game}
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
| `npm --workspace @game/server run smoke` | 端到端冒烟测试（需服务端已启动） |

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

## 服务端现状（全部为模拟数据）

- HTTP：`POST /api/login`（任意 code 成功）、`GET /api/player/profile`（Bearer token）、
  `GET /api/rank`（固定种子假榜单）、`GET /api/health`
- 房间 `game`：进出房、移动积分（20fps 逻辑帧）、技能伤害结算（shared 共享公式）、
  聊天广播、心跳 —— 数据均为内存假数据，重启即重置
