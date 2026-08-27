# gameStarterKit

基于 **Cocos Creator 3.8.8 + Colyseus 0.17 + TypeScript** 的游戏开发期 monorepo 骨架。
仓库提供客户端、服务端和共享层的代码组织、契约同步、示例玩法、本地调试与本地测试基础。

账号与选服示例通过 HTTP 消费独立 `gono-webplatform` 的开发契约。本仓只使用精确锁定的
`@gono/webplatform-contract`，不包含该服务的业务源码。

深入说明见：

- [技术总览](docs/OVERVIEW.md)
- [客户端开发](docs/CLIENT.md)
- [服务端开发](docs/SERVER.md)
- [外部身份服务开发边界](docs/WEBPLATFORM.md)

## 目录

```text
apps/
├── client/     纯 TypeScript 游戏代码，源码唯一真相
├── Cocos/      Cocos Creator 工程壳，代码由 sync:client 写入 assets/src
├── Unity/      Unity 方向的研究占位，不是可用客户端
├── server/     Colyseus 服务端开发工程
├── shared/     双端共享协议、公式与常量
├── art/        FairyGUI 编辑器工程
└── website/    项目说明站点源码
docs/           当前开发架构说明
tools/          codegen、配置转换和本地检查工具
```

`apps/client/src/shared/` 和 `apps/Cocos/assets/src/` 是生成镜像，不是源码入口。
WebPlatform 不属于本 monorepo；旧提交中的 `apps/WebPlatform` 仅用于历史追溯。

## 本地开发

安装与同步：

```bash
npm install
npm run sync:shared
```

启动服务端本地依赖与开发进程：

```bash
npm --workspace @game/server run stack
npm --workspace @game/server run db:bootstrap
npm run dev
```

账号示例需要另行启动与当前契约匹配的 `gono-webplatform` 本地开发服务。默认开发约定通常为：

- Public HTTP：`http://127.0.0.1:2570`
- Internal HTTP：`http://127.0.0.1:2571`

客户端预览：

1. 用 Cocos Dashboard 3.8.8 打开 `apps/Cocos`。
2. 等待首次资源导入完成。
3. 在场景 `Main` 组件中设置本地 WebPlatform Public origin。
4. 在编辑器中预览，使用开发会话进入 Lobby 和 ballMove 示例房间。

这里的启动脚本、开发会话与调试页面只用于本地开发和代码验证。

## 常用开发命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动服务端开发进程 |
| `npm run dev:client` | 监听 shared/client 改动并同步到 Cocos 工程 |
| `npm run sync:webplatform-contract` | 刷新外部身份服务契约生成物并级联同步 |
| `npm run verify:webplatform-contract` | 本地校验契约版本、hash 与生成物 |
| `npm run fetch:fgui` | 更新锁定的 FairyGUI 技术依赖 |
| `npm run fetch:colyseus` | 更新锁定的 Colyseus 客户端库 |
| `npm run sync:shared` | shared → client → Cocos |
| `npm run sync:client` | client → Cocos |
| `npm run typecheck` | shared/server/client 类型检查及镜像校验 |
| `npm run verify:sync` | 检查镜像漂移、孤儿和 `.meta` |
| `npm run test:fgui` | FGUI 结构契约及客户端无头测试 |
| `npm run codegen:fgui -- <Pkg> <Comp>` | 生成或更新 View 的 AUTO 区块 |
| `npm run verify:ecs` | 校验锁定的 bitECS 文件 |
| `npm --workspace @game/server run test` | 服务端单元测试 |
| `npm --workspace @game/server run smoke` | 本地功能链路冒烟 |
| `npm --workspace @game/server run test:int` | 使用本地 Redis/MySQL 的集成测试 |

## 开发红线

1. **不要手改生成区**：
   - 改 `apps/shared/src` 后运行 `npm run sync:shared`。
   - 改 `apps/client/src` 后运行 `npm run sync:client`。
   - `apps/Cocos/assets/src` 整体由同步脚本生成。
2. **不要修改锁定的 bitECS 源码**：`apps/client/src/lib/bitecs/` 的 12 个 TypeScript 文件由
   `npm run verify:ecs` 校验。
3. **协议、消息名、错误码和公式从 shared 导入**，不要在两端复制。
4. **相对导入不带扩展名**，以兼容 Cocos 编译链。
5. **shared 保持零依赖**：不得使用 npm 包、Node API、DOM 或渠道平台全局对象。
6. **View 与 Logic 分离**：`logic/` 不导入 `cc` 或 `fairygui-cc`；View 只负责绑定和数据搬运。
7. **FairyGUI 只通过动态 import 进入 View 打开链**，避免进入普通脚本的静态依赖图。
8. **外部身份服务只走契约化 HTTP 边界**，本仓不得重新导入其业务源码或账号数据库实现。

新功能的推荐开发顺序：

```text
shared 契约
  → npm run sync:shared
  → 服务端 endpoint
  → 客户端 Logic + View + viewRegistry
  → npm run sync:client
  → 本地类型检查与测试
```

## 技术栈

- 客户端：Cocos Creator 3.8.8、FairyGUI 1.2.2、bitECS 0.4。
- 服务端：Colyseus 0.17、Node.js 22+、TypeScript、Redis、MySQL 8。
- 客户端网络：`@colyseus/sdk` 0.17.43 UMD，是通用网络客户端库。
- 共享层：`apps/shared`，零依赖纯 TypeScript。

## 项目边界

本仓库定位为游戏项目的**开发期基础框架**，仅提供客户端、服务端和共享代码的工程骨架，以及
本地开发、调试与验证所需的示例实现；它不是面向生产环境的一站式交付方案。

本仓库不提供，也不对以下能力作实现承诺：

- 生产环境部署、持续集成或持续交付、扩缩容、监控告警、备份恢复及其他生产运行与运维保障；
- 支付、订单、退款、对账等商业化能力；
- 微信、抖音等渠道平台的账号、登录、支付、广告、分享或其他 SDK/API 接入；
- 渠道包构建、上架审核、灰度、热更新、合规办理、发行及运营能力。

仓库中的本地启动脚本、调试页面、开发会话、测试命令，以及 `@colyseus/sdk`、FairyGUI、bitECS
等通用技术依赖，仅用于开发和本地验证，不代表具备上述生产、渠道或发行能力。使用者应根据目标
平台和实际环境，在本仓库之外自行设计、接入并验证相关系统。
