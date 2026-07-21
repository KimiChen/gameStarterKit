# 客户端

Cocos Creator **3.8.8** 微信小游戏工程 + FairyGUI（fairygui-cc 1.2.2）+ bitECS（数据导向 ECS）。
整体设计意图见 [OVERVIEW.md](OVERVIEW.md)；服务端见 [SERVER.md](SERVER.md)。

> 引擎壳与游戏代码分离（对标 sect）：**代码全在 `apps/client/src/`（纯 TS 工程，源码唯一真相）**；
> `apps/Cocos` 是 Creator 工程壳（**不在 npm workspaces**），`npm run sync:client` 把代码灌入
> `apps/Cocos/assets/src/` 后由编辑器编译。第三方库以源码/UMD 形式直接放在 `assets/` 内。
> Unity 壳（`apps/Unity`）是骨架，规划消费同一份 TS。

---

## 首次打开（一次性配置）

```bash
# 仓库根目录先跑（fetch 在 sync 前：sync 的孤儿清理对 fetch 产物有豁免，但顺序对更省心）：
npm run fetch:fgui     # 拉 fairygui-cc 运行时到 apps/Cocos/extensions/fairygui-cc/runtime/（每台机一次）
npm run fetch:colyseus # 拉 colyseus UMD 到 lib/colyseus/（440KB 可再生，每台机一次；
                       #  .meta 的「导入为插件 + 全平台加载」标记由脚本保证，无需编辑器手勾）
npm run sync:shared    # apps/shared/src → apps/client/src/shared，并级联 sync:client
npm run sync:client    # apps/client/src → apps/Cocos/assets/src（已入库；上一步已级联，单改 client 时用）
```

> 日常迭代建议常驻 `npm run dev:client`（双 watcher：shared→client→Cocos 全链自动级联，
> 保存即同步）；忘跑同步有机检兜底——`npm run typecheck` 尾部挂了 `verify:sync`
> （`--check` 只读校验：镜像漂移/孤儿/入库文件缺 `.meta` 都会红）。

然后在 Cocos 里：

1. 用 **Cocos Dashboard 3.8.8** 打开 `apps/Cocos`，等首次导入（生成 `temp/`、`library/`、`.meta`）；
2. 菜单「扩展 → 扩展管理器 → 已安装扩展」确认 **fairygui-cc** 已启用
   （挂载只读 `db://fairygui-cc/fairygui.mjs`）；
3. 新建场景（含 Canvas），把 `Main.ts` 挂到 Canvas 节点，保存；
4. 仓库根 `npm run dev:server`（http://localhost:2568）；
5. 编辑器 **预览**：控制台应输出 mock 登录成功 + 进房日志，**按住屏幕可拖动小圆点**。

> `.meta` 由编辑器生成后**连同资源一起提交**（uuid 不稳会丢引用）。
> `fetch:fgui` 版本钉死 1.2.2、`fetch:colyseus` 版本钉死 0.17.43（⛔ 不飘 latest 免各机分叉）；
> 产物均可再生、`.gitignore` 忽略、每台机跑一次。

**常见卡点**：`db://fairygui-cc` 不出现→扩展没启用/没重启；`import fairygui.mjs` 报红→无头 typecheck
排除的正常现象（Creator 自带 tsconfig 能解析，运行时以预览为准）；图不显示→图片导入类型设 RAW/BufferAsset；
`Call GRoot.create first!`→GRoot 未在 Canvas 就绪后调（`Main.ts` 的 `setupFairyGUI()` 已接线自动找 Canvas）。

---

## 2. 目录导览（`apps/client/src/` 根 = 入口两文件 + 6 目录，每目录有 README）

**根层文件 = 入口与全局真源；目录 = 层/域**（与服务端同构）。

| 条目 | 职责 |
|---|---|
| `Main.ts` | 入口组件（挂 Canvas）：微信补丁 → mock 登录 → 进房 → 状态同步 → 渲染演示 → 触摸输入 |
| `designSpec.ts` | 设计分辨率真源（750×1624，见 §6） |
| `view/` | **视图层**（依赖 cc/fairygui-cc，只搬数据）：FguiView/ViewMgr 机械件 + 每页面 XxxView.ts + 双登记点 |
| `logic/` | **逻辑层**（⛔ 禁 import cc/fairygui，无头单测）：`page/` 页面行为 + `rooms/<玩法>/` 局内 ECS |
| `net/` | 通道面：RoomClient / WebSocketClient / http/ / mock/（两端映射表见 README） |
| `core/` | 平台与基建桥（日常不动）：`http.ts`（XHR+token）· `wechat-compat.ts`（微信补丁，必须最先导入） |
| `lib/` | 第三方锁定区：`bitecs/`（12 文件字节锁）· `colyseus/`（UMD 插件）——⛔ 不可手改 |
| `shared/` | `sync:shared` 生成物——⛔ 不可手改（改 `apps/shared/src` 再同步） |

**命名规则**：目录一律小写；导出类的文件 PascalCase 与类同名；纯函数/配置模块 camelCase。

**大厅壳页面（迁移自 sect 项目，走 FGUI）**：登录 `Login` → 选服 `AreaList`（HTTP `/area/list`）/
公告 `LoginNotice`（HTTP `/notice/list`）→ 主界面 `Home`（点「进入游戏」→ ballMove 玩法房）；
`Confirm` 通用提示框（多实例）。组合根在 `view/pages.ts`（ViewMgr + Logic + net 依赖 + 导航接线，
Main.ts 走动态 import 调 `openLogin`）。各页 logic 在 `logic/page/`（纯 TS，`test/pageLogic.test.ts` 无头测）。

**选服链路（区服 = 独立实例，对齐原项目）**：`openLogin` 开机拉 `/area/list` 存 `net/serverSession.ts`
（当前选中服 `currentServer` + 列表 + 哈希 `h`）并 `pickDefaultServer` 默认选中（最近登录服 `ul[0]` 优先，
否则首个非维护服）→ Login 显示当前服（`showCurrentServer`：名 + `login_status_{status}` 图标）→ 点选服进
`AreaList`（页签：推荐 `t===1` / 我的角色 `ul∩al` / 全部 / `1-10区` 分组）选服改 `currentServer` 并刷新 Login →
「进入游戏」经维护闸（无服 / `t===9` 且非运维不进）登录 → Home →「进入游戏」时 **Main 连 `currentServer.wsUrl`**
（`ws→http` 传 Colyseus Client，非固定 `serverUrl`）。`serverSession` 是纯状态模块（只 import shared，无 cc/fairygui）。
⚠ FGUI 包源已迁进 `apps/art/fairygui/assets`（12 包闭包），但 **`.bin` 需在 FairyGUI 编辑器发布到
`apps/Cocos/assets/resources/ui/`**、新 `.ts` 需 `sync:client` 灌入后开一次 Cocos 生成 `.meta`——见本文件末尾「迁移页面的一次性手动步骤」。

**客户端登记点四处**：页面注册 → `view/viewRegistry.ts`；FGUI 命名元素 → `view/fguiContracts.ts`；
分辨率/适配 → `designSpec.ts`；微信兼容 → `core/wechat-compat.ts`（只加补丁不删）。

---

## 3. 视图 / 逻辑二分（铁律 9）

核心洞察：无头测只测**结构 + 行为**，不测「好不好看」。三层职责：

| 层 | 谁负责 | 落点 | 验证 |
|---|---|---|---|
| 视觉排版 | **设计师** | FairyGUI 编辑器工程 `apps/art/fairygui`（`.fui`/`.bin`） | 预览/人看 |
| 结构契约 | 程序定/设计师满足 | `view/fguiContracts.ts` 的 `FGUI_CONTRACTS`（命名元素→类型，提交版事实源） | 解析 FGUI XML 断言（无头） |
| 行为/数据 | 程序 | `logic/`（⛔ 禁 cc/fairygui，`logic-purity.test.ts` 机检） | 无头单测 |

- **视图 `view/`**：依赖 cc/fairygui-cc，只做「取组件 + 搬数据」，Creator 侧验证。
- **行为 `logic/`**：纯 TS 无头可测。`page/XxxLogic.ts` 页面行为（与 `view/XxxView.ts` 同名前缀配对）、
  `rooms/<玩法>/` 局内玩法域 ↔ 服务端 `rooms/`（`ballMove/` 是 demo 玩法名，fork 后改名）。
- `logic-purity.test.ts` 机检 `logic/` 全目录禁 import `cc`/`fairygui-cc`/`db://fairygui-cc`，
  以及**经 `view/` 间接引入**（view 静态依赖 fairygui，间接引入同等违规）。

---

## 4. 页面生命周期：defineView + viewRegistry + ViewMgr

页面**声明式注册**（借鉴 Sect-TsProject 的 initWidget）——元数据挂在注册表，`ViewMgr` 按元数据接管
生命周期。业务层 ⛔ 不手工 `mountFullScreen`/`ensurePackages`/`setInputEnabled`。

**新页面四步动线**：

```
① FairyGUI 编辑器出图 → 发布 bin 到 apps/Cocos/assets/resources/ui
② npm run codegen:fgui -- <Pkg> <Comp>   生成 view/XxxView.ts（四个 AUTO 区块）
   契约条目加进 fguiContracts.FGUI_CONTRACTS；新 View 加进 apps/client/tsconfig.json 排除清单
③ logic/page/XxxLogic.ts   写行为（同名前缀配对，无头单测）
④ viewRegistry.ts   加一条 defineView（layer/fullscreen/onlyOne/permanent/interactive + load 闭包）
⑤ npm run sync:client   灌入 apps/Cocos/assets/src，开一次 Creator 生成新 .ts 的 .meta
```

打开 = `ViewMgr.open("Xxx")`（返回句柄）；关闭 = `handle.close()` 或 `ViewMgr.close("Xxx")`，
⛔ **不直调 `view.dispose()`**（交互输入的恢复挂在关闭路径，直调会永久吞掉游戏触摸）。ensurePackages/
挂载/分层/单例/常驻/交互输入全由注册表元数据接管；依赖包在条目 `sharedPkgs` 声明，`ViewMgr.open`
前自动 ensurePackages（共享库全程常驻、⛔ 不许 removePackage）。
⚠ **`sharedPkgs` 必须是页面 art 依赖的传递闭包**——fairygui 不自动加载依赖包，少一个跨包元素就**空白不
渲染**（典型：`btn_login` 图标 `login_enterGame` 在 L10n_zh_hans，漏声明按钮就消失）；清单由 art XML 的
`pkg=`/`ui://` 引用推导，`viewRegistry.test` 机检 `sharedPkgs ⊇ 闭包`。

守门 `viewRegistry.test.ts`：① 页面文件 ⇔ 注册表键；② 注册表 contract ⇔ FGUI_CONTRACTS 双向相等；
③ Logic 配对文件存在；④ AUTO 区块与 `.fui` 同步；⑤ `sharedPkgs ⊇ art 依赖传递闭包。漏任何一步测试红。

### `interactive` 语义（引擎现实，选错必出事）

fairygui 只有**一个全局 InputProcessor**：启用 = 全屏捕获（页面可点、但**背后游戏触摸被挡**）；
禁用 = 整棵 FGUI 树无输入。所以 `interactive` 的判据是「页面有没有可点的东西」：

- 有按钮/输入 → `interactive: true`（想「不挡游戏」做不到，这是引擎约束不是配置问题）；
- 纯展示 HUD、要与战斗拖拽共存 → `interactive: false`（页面自身也收不到点击）。

### FairyGUI 常用 API 陷阱（无头 typecheck 抓不到，view/ 只 Creator 侧验）

- **列表项点击注册用 `list.on(Event.CLICK_ITEM, (item, evt) => {…}, this)`**（`Event` import 自
  `db://fairygui-cc/fairygui.mjs`，回调首参 = 被点子项 `GObject`）。⛔ `list.onClickItem(cb, this)` 是**内部
  处理器不是注册方法**——直接调它会走 `GObject.cast(evt.currentTarget)`，`evt` 变成你传的回调、`currentTarget`
  为 `undefined`，运行时炸 `Cannot read properties of undefined (reading '$gobj')`。
- 按钮点击才用 `btn.onClick(cb, this)`（这个是对的）；解绑对应 `off(Event.CLICK_ITEM, …)` / `offClick`。
- **本 fairygui-cc 版只有 `.asCom` 一个类型转换 getter**，⛔ 没有 `.asTextField`/`.asList`/`.asLoader`/
  `.asButton`/`.asRichTextField`…（读它们得 `undefined`，再 `.text`/`.url` 就崩，或 `&&` 短路成静默不渲染）。
  取类型化子项用**泛型** `getChild<GTextField>("txt_x").text = …` / `getChild<GLoader>("ld_x").url = …`
  （与 codegen AUTO BIND 同款，getChild 运行时返回的就是真实子类实例）。
- **虚拟列表（`setVirtual()`）点项取索引**：`Event.CLICK_ITEM` 回调里 `getChildIndex(obj)` 是**渲染子索引**，
  滚动后 ≠ 逻辑项索引——必须 `childIndexToItemIndex(getChildIndex(obj))` 转换后再索引数据数组。非虚拟列表无此问题。

### 铁律 10：FairyGUI 只走动态 import

ViewMgr/FguiView 静态依赖 fairygui。`ViewMgr.open` 只允许在 `view/` 内部或动态 import 闭包
（`const { ViewMgr } = await import("./view/ViewMgr")`）里调用；`logic/` 禁（logic-purity 机检），
cc 场景组件也不许静态 import ViewMgr——否则把 fairygui 拉进 root 脚本静态依赖图，扩展没挂时连锁炸掉整个启动。

---

## 5. codegen：四个 AUTO 区块幂等重写

`tools/fgui-codegen`（纯 Node 零依赖，无 fairygui-cc 运行时）：`parseFgui.ts` 解析组件 XML →
`binding.ts` 按命名前缀生成绑定。

**命名前缀 → fairygui-cc 类型**（真源 `binding.ts`）：`btn_`/`tge_`→GButton · `txt_`→GTextField ·
`ld_`→GLoader · `lst_`→GList · `img_`→GImage · `jb_`→GComponent（嵌套自定义组件，kit 无
UIObjectFactory 扩展机制，运行时就是 GComponent）；标签直接映射 text/richtext/image/loader/list/
graph(GGraph)/group(GGroup)/movieclip。无识别前缀的元素不生成字段。

**四个 AUTO 区块**：`// #region AUTO <IMPORT|REQUIRED|FIELD|BIND> DONT CHANGE` …
`// #endregion AUTO <KIND>`（结束标记带 KIND——通用 `#endregion` 会与业务代码折叠标记混淆而误吞代码）。
区块内 = codegen 领地（`.fui` 变更后 `npm run codegen:fgui` 幂等重写，⛔ 手改）；区块外 = 业务代码
领地（重写一字不动）。手改生成区或忘跑 codegen → `viewRegistry.test.ts` 恒等断言红。

命令：`npm run codegen:fgui -- <Pkg> <Comp> [ViewClass]`。测试：`npm run test:fgui`。

---

## 6. 设计分辨率与设计师工作流

**设计分辨率 750×1624 竖屏 + FIXED_WIDTH**（宽恒铺满、高随机型浮动 ≈1334~1730，全机型无黑边）。
真源 `designSpec.ts`，与 `apps/Cocos/settings/v2/packages/project.json` 的 designResolution（fitWidth=true 烘焙值）、
`Main.ts` 的 `setDesignResolutionSize` **三处必须一致**；⛔ 视图层禁写 640/1386、960×640 等旧稿魔法数。
全屏 FGUI 页在 viewRegistry 声明 `fullscreen: true`（高浮动由 relation 吸收），贴顶 HUD 加
`FguiView.safeTopInset()`。

**设计师侧**：只碰 `apps/art/fairygui`（`FairyGUI.fairy`），调排版/字号/颜色随意；⛔ **别改元素命名**
（命名 = 契约，改了 CI 契约测红）。改完**发布 `.bin` + 图集到 `apps/Cocos/assets/resources/ui/`**——
必须在 `resources/` 下（`UIPackage.loadPackage("ui/<Pkg>")` 无 bundle 参数固定走 resources bundle）。
发布后先开一次 Creator 生成 `.meta`，连产物一起提交。公司标准组件库发布为 `ui/Original`，跨包用
在 viewRegistry 条目 `sharedPkgs: ["ui/Original"]` 声明。引入旧稿坐标系的 FGUI 包源时先等比迁 750 系再发布 bin。

**FairyGUI 固定成本**（采购/升级须知）：官方对 Cocos 3.8 淡维护（`ccc3.0` 分支停在 2024-05），生产建议
自维一份打了社区 3.8 补丁的 fork（mask 渲染/文本输入偏移/无扩展名 GLoader 等）；无官方小游戏支持声明，
须早测真机；分辨率自适应直接吃 Cocos 的，⛔ 别用 `Director.setContentScaleFactor`（破 FGUI 布局）。

---

## 7. 网络通道面（`net/`，两端映射）

| 客户端 | 服务端 | 语义 |
|---|---|---|
| `RoomClient.ts` | `rooms/`（GameRoom） | 实时房：join / 移动输入 / 状态同步（fire-and-forget） |
| `WebSocketClient.ts` | `websocket/`（ws-RPC） | 单次请求-响应：`rpc` / `rpcIdem` / `onPush`（信封 id 配对） |
| `http/<域>.ts` | `http/`（真实 HTTP） | XHR（`area.ts` 选服 / `notice.ts` 公告等真实调用面） |
| `mock/<接口>.ts` | `mock/api/`（假数据） | `/mock/` 前缀 = 假数据，`core/http.ts` XHR 底座 |
| `serverSession.ts` | （无，纯客户端状态） | 当前选中区服 + 列表 + 哈希；大厅写、Main 进房读 `currentServer.wsUrl` |

- **WebSocketClient**：`rpc<T>(type, payload)` 按 shared 契约推导返回类型；**写接口一律 `rpcIdem`**
  （clientReqId 生成一次、重试复用，失败回填 `err.clientReqId`）；`onPush` 订阅服务端唤醒式推送。
  join/leave 有掉线窗口保护 + room 身份守卫（防旧连接迟到事件误清新房）。
- **RoomClient**：join 并发合流、leave 停自动重连 + 超时兜底、onDrop/onLeave 身份守卫、`dropping`
  状态（掉线窗口暂停心跳/方向上发，防 SDK 重连补发过期包）。
- 消息名/协议类型一律 import 自 `shared`（铁律 6）。

---

## 8. 微信小游戏踩坑实录（均已实机验证并修复，改动前先读）

兼容补丁集中在 `core/wechat-compat.ts`（上游依据 colyseus/colyseus#945；⚠ import 顺序敏感——
必须先于 Colyseus SDK 首次使用执行，`Main.ts` 里保持最前）：

1. **SDK 在插件求值阶段就捕获了 `globalThis.WebSocket`**（插件脚本先于一切项目脚本），事后替换全局
   WebSocket 对 SDK 无效。构造签名修复必须打在 **`wx.connectSocket` 层**（清洗 protocols，否则 SDK 的
   Node 签名 options 对象会被适配层当子协议传给 wx，握手静默失败）。
2. **微信开发者工具把全局 `WebSocket` 设为只读**，严格模式下直接赋值抛 TypeError 炸掉启动。所有全局
   写入必须走 `setGlobal()` 容错，关键补丁（send 原型转换）排在可能失败的操作之前。
3. 微信缺 fetch/Headers/URL/URLSearchParams/TextEncoder/Blob，补丁已提供；⛔ 不要用 npm 的
   url-polyfill（依赖 DOM，小游戏里报 `a.checkValidity is not a function`）。
4. `WebSocket.prototype.send` 补丁里 `data.slice().buffer` 的 `slice()` 不能省——Uint8Array 可能是带
   byteOffset 的视图，直接取 `.buffer` 会发错数据。
5. 兼容层里 ⛔ 不用 `flatMap`（ES2019，超 ES2017 下限，铁律 4）——老 JSCore 会在建连路径的兼容层自身抛错。
6. 开发者工具报 `webapi_getwxaasyncsecinfo:fail -80002` 是**工具自身噪音**（测试 appid 后台查询失败），忽略。
7. 连 localhost 需关开发者工具的合法域名校验。该开关在**构建产物**的 `project.private.config.json` 里，
   重新构建会重置——已用构建模板 `apps/Cocos/build-templates/wechatgame/project.private.config.json`（urlCheck:false）
   每次构建自动拷入。真机要求 wss/https 且域名过白名单。

---

## 9. 构建与其他

- **微信构建**：构建面板选「微信小游戏」，appid 在面板填（存本机 `profiles/`，不进仓库）。
- **主包 4MB 限制**：`colyseus.js` 约 440KB。`npm run report:size` 出主包/分包体积报告（3.5MB 触发水位
  提示走资源分包）。
- **ECS 单例**：`GameECS.inst` 持有 bitECS world 与 sessionId→eid 表；场景重载重复建实例会让旧房间回调喂旧 world（幽灵 isSelf）。
- **程序化渲染节点**：Cocos `new Node()` 默认 DEFAULT layer 且不继承父 layer，UI 相机会剔除它——
  必须手动设 `node.layer`，否则画面空白无报错。

---

## 10. 迁移页面的一次性手动步骤（FGUI 发布 + Cocos 导入）

登录/选服/公告/Home/Confirm 的**代码、契约、服务端、logic/单测已就绪并全绿**，但两件必须在编辑器里做
（`.bin` 是 FairyGUI 编辑器编译产物、`.meta` 由 Cocos 生成，无法脚本化）：

1. **FairyGUI 编辑器**：打开 `apps/art/fairygui/FairyGUI.fairy`，把这 12 个包发布 `.bin`+图集到
   `apps/Cocos/assets/resources/ui/`：`View_AreaList_Login`/`View_AreaList_AreaList`/
   `View_AreaList_LoginNotice`/`View_Home_Home`/`View_SharedWidget_Confirm` + 依赖库
   `Common_Btn`/`Common_ComboBox`/`Common_Component`/`Common_RGBA`/`Dynamic_Login`/`Dynamic_Spine`/
   `L10n_zh_hans`。✅ `View_AreaList_LoginNotice` 的 `jb_tabbar` 已同步源项目最新版：改用**本包内建**
   `CompTab`/`CompTabItem`（+`RGBA/b6_png`、`b7_png`），不再依赖缺失的外部 `GameTabBar1`；公告页改为
   **顶部标签（每条公告一个）+ `txt_content` 正文内联切换**（原 `lst_notice` 列表已废弃）。
2. **Cocos Creator**：先 `npm run sync:client` 灌入 `apps/Cocos/assets/src`，再打开 `apps/Cocos` 生成新 `.ts` 的 `.meta`（view/logic/net 下的迁移文件已手工建 meta，
   编辑器若微调 uuid，diff 确认后提交即可）；把默认场景的 Canvas 挂 `Main.ts`（Main 现以 **Home 为默认**
   起大厅流程，登录→选服→Home，Home 点「进入游戏」进 ballMove demo 房）。

发布前无 `.bin` 时，`ViewMgr.open` 会 warn「包未加载」并降级空占位（面板不炸，其余功能不受影响，铁律 10）。
