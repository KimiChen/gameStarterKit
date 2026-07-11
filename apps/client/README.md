# game-client（Cocos Creator 3.8.8）

微信小游戏客户端工程。**本包不加入 npm workspaces**（Cocos 依赖自身工程目录结构，
第三方库直接以源码/UMD 形式放在 assets 内，见下）。

## 目录结构

```text
assets/script/
├── Main.ts              # 入口组件（挂到 Canvas）：登录 → 进房 → 状态同步 → 渲染演示
├── lib/
│   ├── ecs/             # Oops Framework ECS（8 个纯 TS 文件，字节不变，禁止修改，见其 README）
│   └── colyseus/        # @colyseus/sdk 0.17 UMD 插件 + 全局类型声明（见其 README）
├── shared/              # ⚠ 由 `npm run sync:shared` 从 apps/shared 生成，禁止手改
├── net/
│   ├── wechat-compat.ts # 微信小游戏兼容补丁（必须最先导入）
│   ├── NetManager.ts    # Colyseus 房间连接/消息/状态回调封装
│   └── HttpApi.ts       # HTTP 模拟接口客户端（XHR，三端一致）
└── game/                # ECS 用法示例：组件/系统/世界管理
    └── ui/              # FairyGUI 三层模型：契约(fguiContracts) + presenter(rankRows，无头测)
        └── fgui/        # 绑定层（FguiView 薄基类 + RankView 示例；依赖 fairygui-cc，Creator 侧验证）

assets/resources/ui/     # FairyGUI 发布产物（Original/Rank 的 .bin + 图集；源在 apps/art/fairygui）
extensions/fairygui-cc/  # fairygui-cc 运行时扩展（外壳入库；运行时 `npm run fetch:fgui` 生成）
```

## 首次打开（一次性步骤）

1. 在仓库根目录执行 `npm run sync:shared`（生成 `assets/script/shared/`，本仓库已提交生成结果）
2. 在仓库根目录执行 `npm run fetch:fgui`（生成 `extensions/fairygui-cc/runtime/`，
   运行时 600K+ 可再生、不入库——不跑这步 FairyGUI 相关脚本在 Creator 里会报模块缺失）
3. 用 **Cocos Dashboard 3.8.8** 打开本目录，等待首次导入（生成 `temp/`、`library/`、`.meta`）
4. 选中 `assets/script/lib/colyseus/colyseus.js` → 属性检查器勾选
   **导入为插件** + 各平台加载（详见 `lib/colyseus/README.md`），应用后重启编辑器
5. 菜单「扩展 → 扩展管理器 → 已安装扩展」确认 **fairygui-cc** 已启用
   （挂载 `db://fairygui-cc/fairygui.mjs`）
6. 新建场景（含 Canvas），把 `Main.ts` 挂到 Canvas 节点，保存场景
7. 启动服务端：仓库根目录 `npm run dev:server`（默认 http://localhost:2568，
   端口在 `apps/server/.env.development` 配置，需与 Main 组件的 `serverUrl` 一致）
8. 编辑器预览：控制台应输出 mock 登录成功、进房日志；按住屏幕可移动小圆点。
   勾选 Main 组件的 **showRankDemo** 可在启动时打开 FairyGUI 排行榜示例
   （公司标准组件库 Original + Rank 包，假数据；关闭按钮即公司库 CloseButton1 跨包复用）

> `.meta` 文件由编辑器生成后要**连同资源一起提交**（uuid 不稳定会丢引用）。

## 微信小游戏构建

- 构建面板选择「微信小游戏」，appid 在构建面板填写（存于本机 `profiles/`，不进仓库）
- **本地联调的域名校验已自动关闭**：`build-templates/wechatgame/project.private.config.json`
  会在每次构建时拷入产物（`urlCheck: false`，等价于手动勾选开发者工具的
  「详情 → 本地设置 → 不校验合法域名」）。若仍报"http://localhost:2568 不在 request
  合法域名列表中"，说明用的是旧构建产物——重新构建，或在开发者工具手动勾选一次
- 真机/正式环境要求 `wss://` + `https://`，两个域名都需在微信后台加白名单
- 微信运行时缺失的 Headers/URL/URLSearchParams/TextEncoder 及 WebSocket 二进制发送
  兼容问题已由 `net/wechat-compat.ts` 处理（参考 colyseus/colyseus#945），
  Main.ts 已在模块加载期最先安装补丁
- 主包 4MB 限制：`colyseus.js` 约 440KB，后续资源增长请规划分包

## 约定

- 网络消息名/协议类型/纯逻辑一律 import 自 `./shared/`，不允许手写字符串或复制公式
- `assets/script/shared/` 与 `assets/script/lib/ecs/` 都是"生成/外部"目录：
  改共享代码去 `apps/shared/src`，改后重新 `npm run sync:shared`
- 客户端只允许用 `@colyseus/sdk`（全局 `Colyseus`），禁止引入服务端包 `colyseus`/`@colyseus/core`
- FairyGUI 视图走三层模型：绑定层（`game/ui/fgui/`，只"取组件+搬数据"）/
  presenter（纯函数，无头单测）/ 结构契约（`fguiContracts.ts`，`npm run test:fgui` 对
  `apps/art/fairygui` 的设计师 XML 把关）。新视图引用公司库组件前先
  `FguiView.ensurePackages(["ui/Original"])`，UI 源改动在 FairyGUI 编辑器里做、
  发布到 `assets/resources/ui` 后连 .bin/.meta 一起提交
- FairyGUI 经 `Main.ts` 的**动态 import** 进入（rankOpener 桥），不进静态依赖图——
  扩展没挂/运行时没 fetch 时其余功能不受影响
