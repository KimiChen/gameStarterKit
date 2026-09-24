# 客户端开发

> 本文只描述 Cocos 客户端在开发阶段的源码组织、页面接入、本地预览和测试方式；完整范围见
> [根 README](../README.md#项目边界)。

## 1. 首次打开

在仓库根目录执行：

```bash
npm install
npm run sync:shared
```

随后使用 Cocos Dashboard 3.8.8 打开 `apps/Cocos`，等待资源导入完成。游戏代码来自
`apps/client/src`，由 `sync:client` 复制到 `apps/Cocos/assets/src`。

第三方技术依赖已经锁定并入库：

- `apps/client/src/lib/colyseus/colyseus.js`
- `apps/Cocos/extensions/fairygui-cc/runtime/`
- `apps/client/src/lib/bitecs/`
- `apps/client/src/lib/uniflex/`

上述依赖已随仓库锁定并入库，首次打开或普通开发不需要抓取。`fetch:colyseus`、`fetch:fgui` 和 `fetch:uniflex` 仍保留为框架维护团队在需要显式升级对应依赖时使用的工具；它们会校验下载内容并更新
仓库内的运行时镜像。若运行时存在针对 Cocos 3.8 的社区补丁，升级后必须重新应用补丁并重算
`scripts/vendor.sha256`，不能把裸抓取结果直接视为最终版本。bitECS 没有自动抓取命令，其
`apps/client/src/lib/bitecs/` 下的 12 个锁定源文件及 `scripts/bitecs.sha256` 由维护团队按上游版本
手动更新，保留项目补丁后运行 `npm run sync:client`、`npm run verify:ecs` 和 `npm run verify:sync`。
普通开发者直接使用已入库版本，并运行校验命令确认依赖未漂移。

本地预览需要：

1. 场景中存在挂载 `Main` 的节点。
2. FairyGUI 扩展已由工程加载。
3. `portalUrl` 指向与当前契约匹配的本地开发服务；dev 动线（服务端 `AUTH_PROVIDER=dev`）
   下留空即可——portal 回落为游戏服自身端口（见 [外部身份服务开发边界](WEBPLATFORM.md) §1.1）。
4. shared/client 镜像保持新鲜。

`Main` 组件另有一个可留空的 `serverUrl`：留空时使用 `sync:client` 生成的 `core/devEnv.ts`（跟随根
`.env.development` 的 `PORT`，默认 `http://localhost:2568`），填写即覆盖。它只是区服目录加载前的默认
游戏服 HTTP 地址——登录页拉到目录后会用所选区的 `gameHttpUrl` 重新初始化 HTTP 底座。`portalUrl` 留空时回落
`DEV_SERVER_URL`（dev 动线）；显式给了非法值（非 http(s) 绝对地址）时（见
[外部身份服务开发边界](WEBPLATFORM.md) §5）`Main.start()` 直接抛错，后续的会话事件订阅与登录页都不会执行。

目录中的 `gameHttpUrl` 与 `gameWsUrl` 是两个独立、不可互相推导的端点：前者用于游戏 HTTP 请求，后者
是各角色 WS 地址的兼容回落。每次登录在 Lobby join 前，从所选区的游戏 HTTP `GET /version` 读取可选
`lobbyWs / gameWs / worldWs`；每个字段独立使用其非空值，缺字段或空串才回落目录 `gameWsUrl`，
不会用发现的 `gameWs` 代替缺失的 `worldWs`。合法旧版三字段响应继续可用，HTTP 失败或响应非法则本次登录失败，
不静默回落。发现字段只允许无路径、无查询、无 userinfo 的 WS(S) origin；外部 WebPlatform 目录契约不变。
Lobby join 只允许 `v/token/sId`；Game join 还必须携带 shared 定义的 canonical
`mode`，用于撮合隔离和玩法选择。目录响应中的 `hash` 不会被伪装成服务端准入校验。
目录刷新成功后保留仍存在的当前 `serverId`；当前区消失才按默认规则回退，刷新失败则保留完整旧快照。
发现结果在 `serverSession` 按 `serverId / gameHttpUrl / gameWsUrl` 绑定：切服或目录端点改变会清除缓存，
同端点目录刷新可保留已发现值；切服、目录刷新和后发发现请求都会使旧的在途响应失效。
Lobby 初登与最终断线重进使用 lobby 地址，GameRoom 使用 `getCurrentGameWsUrl()`，两者各持自己的 SDK Client。

## 2. 源码与工程壳

```text
apps/client/src/
├── Main.ts             Cocos 组件入口：@property 三件 + 分辨率/兼容桥 + AppRuntime 转发
├── designSpec.ts       设计分辨率数值真源（750×1624）
├── app/                AppRuntime 宿主、NavigationService、SessionCoordinator、PluginHost、
│                       RefreshCoordinator、loginFlow 等横切协调件
├── core/               HTTP 底座、生成的开发配置、开发期错误弹框与宿主环境桥
├── gameplay/           每玩法 modes/<id>/ 模块 + 生成 catalog + services 注入面
├── generated/          codegen:plugins 的 View/契约/plugin 注册表产物（禁手改）
├── kits/               kit 自带客户端代码（apps/kits/<id> 的客户端面）
├── lib/                锁定的第三方技术依赖
├── logic/              引擎无关页面与玩法行为
├── net/                Room、RPC 与 HTTP 适配
├── plugins/            插件自带客户端代码（apps/plugins/<id> 的客户端面）
├── shared/             apps/shared 的生成镜像
└── view/               Cocos/FairyGUI 视图绑定与 ViewMgr（registry/契约为生成 façade）

apps/Cocos/
├── assets/src/         apps/client/src 的生成镜像
├── assets/resources/   FGUI 导出物等本地资源
├── assets/scene.scene  默认启动场景（登录 / AppRuntime）
├── assets/uniflex.scene  UniFlex 独立预览场景（不经过 Main）
├── extensions/         Cocos 编辑器扩展
└── settings/           工程设置
```

修改规则：

- `apps/client/src` 是源码真相。
- UniFlex 通用 UI 核心在 `src/kits/uniflex/`，由独立的 `api/cocos/index.ts`、
  `api/web/index.ts` 提供宿主入口，共用资源与导航生命周期；业务侧不得导入 kit 内部实现。
  清单与 API 规则见 [UniFlex kit](../apps/kits/uniflex/README.md)，不将业务作者态、Logic 或路由放入 kit。
- UniFlex 增量迁移的作者态在 `src/ui-uniflex/modules/<module>/<Page>/*.tsx`，共享组件在
  `src/ui-uniflex/components/` 与 `gamecomponents/`。按切图实现新页时先读 [UNIFLEX-UI.md](UNIFLEX-UI.md)。`generated/` 子目录及
  `apps/Cocos/assets/resources/uniflex/` 由 `npm run build:uniflex-ui` 生成，不手改、不入库。
  编译器默认使用项目内 `tools/uniflex-compiler.mjs` 调用
  `vendor/uniflex/bin/<platform>-<arch>/`；显式设置 `UNIFLEX_COMPILER` 可覆盖项目内制品。
  运行时以
  `src/lib/uniflex/` 入库副本为准，`vendor/uniflex/` 的 npm 制品只作为 AOT 与
  `fetch:uniflex` 的输入。生成后运行 `sync:client`，`check:uniflex-ui` 只读检查新鲜度。
- Confirm 已通过既有 `confirm → Confirm` 路由接入 UniFlex；`openConfirm(): Promise<boolean>` 与
  `ConfirmLogic` 保持原契约，`ConfirmView.setup()` 的异步资源就绪纳入句柄回滚。其他页面仍使用各自
  既有渲染方式。Cocos 默认启动场景仍是 `assets/scene.scene`。UniFlex 独立预览场景是
  `assets/uniflex.scene`，入口组件为 `UniFlexPreview`，不经过 `Main` / AppRuntime；URL 加
  `cancel=0` 验证单按钮模式；加 `screen=backpack` 可预览 PSD 导入页面，点击后由
  `BackpackAction` 回调输出动作。独立 WebProvider 宿主在 `apps/web-ui-preview/`，通过
  `npm run dev:uniflex-web` 启动，消费相同 AOT、字体和页面资源。
- PSD ↔ UniFlex 走锁定的 `vendor/web-ui-to-psd-*.tgz`（`npm ci` 安装到
  `node_modules/web-ui-to-psd`），不依赖本机转换器源码目录；`ui:import-psd` /
  `ui:export-psd` / `ui:roundtrip` 默认解析该包。转换器还需要本机 Chrome 与 `uv`。
  `ui:export-fgui` / `ui:preview-fgui` 从同一套 snapshot 另出一份候选独立 FairyGUI 工程（只写 `--out`）和官方 FairyGUI-dom 预览包；`--screens` / `--all` 出多页工程。不写 `apps/art/fairygui`，也不实现 `docs/psd.md` 的 `ui:fgui:*`。
  预览快照会给每个节点打上组件身份；导出写成 PSD 原生 layer ID + 图层名
  `label [ui:key#role]`（octane-lite 同款），并带上 UniFlex 布局框。`uniflex-package`
  按这些身份还原 `PopupFrame` / `ConfirmButton` 等 catalog 组件，而不是摊成 view；
  PSD 里换图、改大小、位置或文本内容只覆盖视觉，不改组件结构。文本回写只落在
  纯字面量、`expr ?? '兜底'` 的兜底字面量或组件已声明 prop 的新增插入；无兜底纯绑定
  （如 `label={p.confirmText}`）跳过并记入导入包 IMPORT.md 的 Text and style write-back 段。
  排版属性（对齐 / 行高 / 粗体 / 字体，沿用 `${base}FontSize` 同款 `${base}Align` /
  `${base}LineHeight` / `${base}Bold` / `${base}Font` 命名）按组件已声明 prop 回写，
  未声明被白名单过滤并记报告；图层不透明度回写组件 `opacity` prop 或具名原生节点的
  `style` 对象；`role === 'fill'` 的色块被重涂成均匀纯色（±8/通道容差）时回写
  `backgroundColor` 而不再换图，非均匀则维持换图。删除有身份的图层会删掉页面里对应
  组件标签（For 列表则只删 items 对象字面量）或具名原生节点子树，标签带 `on*=` 事件
  绑定或非常量表达式 prop 时拒删；智能对象链接换到另一个 catalog 组件时标签换型
  （同名 prop 保留、新组件必填缺失记报告、import 同步增删），换到未知 catalog 组件记
  conflict 不动 TSX。同一组件的智能对象被换成新预览、且像素与
  `components/<Key>/<Key>.psd` 合成图不同时，按已声明 prop 回写图片和位置；
  预览里含组件文本时先抠掉文本区再回写底图和图标，文案仍由文本节点绘制。同一身份的
  第二张可见图替换原图。复制到 `restored/` 时，组件之间的相对导入保持不变，主题等
  不跟着移动的模块按新位置重写。PSD 新增图层（无身份且子树不含任何既有身份的整棵新子树）按
  父级身份链插入对应 TSX 标签内（找不到父级落到页面根 view 并记 root-fallback），
  生成绝对定位的纯视觉 view/image/text（文本带 paint，位图像素作为新资源落包），
  根标签带 `data-psd-add="true"` 人工审批标记；与同时被判删除的图层同尺寸同位置
  （±4px，按导出时 captureFrame 比对）视为移动而非新增，记 conflict [possible-move]
  双向不动 TSX；实例内部新增记 skipped（组件结构权威在组件 TSX）。这几类结构变更
  全部只写 `*Restored` 并记入 IMPORT.md 的
  removed / blocked / swapped / conflict / added / skipped 条目。
  设计师可编辑 PSD 的落点是 `apps/art/uniflex/<Page>/<Page>.psd`（建议 Git LFS；本机未装则按二进制入库）。
  组件 PSD 只放会继承的结构。可以覆盖的文字和图片各自是同目录下的一份 PSD
  （例如 `ScreenHeaderText.psd`、`ScreenHeaderImage.psd`）。引用和默认值相同的，
  这一层链到那份默认 PSD；已经不同的，写成普通 `#override` 图层。改默认 PSD 后，
  在 Photoshop 里执行「更新链接」只会刷新仍链着它的引用，不会改写已经覆盖的图层。
  不另加刷新脚本。例如背包覆盖了 `ScreenHeader` 的标题和底图，再改标题默认值不会改背包标题；
  没覆盖底图的页面会跟着默认底图变。直接改某一页上的普通文字图层，只影响那一页。
  每个组件 PSD 和属性 PSD 都带稳定的 `xmpMM:DocumentID`，页面链接的 `childDocumentID` 必须等于它，
  并且链接记录的文件大小等于目标文件。编号为空时，Photoshop 会在首次保存时自行编号，
  一次重链会把共用该链接的全部实例改指向另一个文件（背包页签被绑到 `ResourceCounter.psd`
  就是这种）。`ui:art-check` 会拒绝图层身份和链接文件不一致。
  导入时，普通 `#override` 图层写回该实例的属性；仍指向默认 PSD 且内容没变的链接不写。
  能写回的是字面量、`expr ?? 'fallback'` 和组件已声明的文字、图片、位置、排版属性。
  事件、循环数据和没有兜底的纯绑定不在 PSD 里，也不会被还原。
  `ui:art-export` 从原稿功能页导出；`ui:art-import` / `ui:art-sync` 按身份 overlay 回去。
  当前 catalog `applyTarget` 为 `restored`，只写 `*Restored`，不覆盖原稿；`ui:art-check` 是只读新鲜度闸。
  PreviewHome 与还原预览首页不进 art catalog。中间产物仍在 `.cache/psd/`。
  PSD 导入包必须经过 `npm run ui:check-source -- --package <package> --strict`；
  `apps/client/resources/ui/<Page>/design.json` 的 `canvas` 是正式验收输入，Web 只能先与独立源图形成 proposal，
  经人工批准后才允许 Cocos 对照。导入组件保持纯展示态，业务 Logic、路由和服务端命令绑定放在
  业务目录，不写入资源包目录。
  对 `design.json` 源图可使用
  `npm run ui:render-source -- --package <package> --out <source.png>` 按契约独立合成 RGB
  源图；它读取 `roots`、group 相对坐标、资源和 opacity，不读取 Web 预览截图。随后使用
  `npm run ui:verify -- --package <package> --source-image <source.png> --web-image <proposal.png>`
  形成 Web 对照，只有通过后才可用 `ui:approve-web` 生成批准件。
  Web proposal 通过后用 `npm run ui:approve-web -- --package <package> --source-image <source.png>
  --web-image <proposal.png> --approval <approval.json>` 生成批准件；Cocos 证据必须带同一批准件。
  Cocos 正式 Golden 使用真实 Creator 预览中的 RenderTexture 采集，命令为
  `npm run ui:capture-cocos-golden -- --screen backpack --out /tmp/backpack-cocos.png`；
  该命令输出必须是 `design.json.canvas` 的原生尺寸，再交给
  `npm run ui:verify -- ... --cocos-image /tmp/backpack-cocos.png --approval <approval.json>`。
  Creator 工具栏截图只能作为运行佐证，不能作为像素验收输入。
- `apps/client/src/shared` 禁止手改；改 `apps/shared/src`。
- `apps/Cocos/assets/src` 整体禁止手改；运行 `npm run sync:client`。
- `.meta` 与镜像一起提交，保持 UUID 稳定。
- plugin/页面/路由/Home 入口的手写登记在仓库根 `apps/plugins/<id>/plugin.json` 与 View 同目录的
  `<Name>View.view.json` sidecar；`src/generated/` 与 `gameplay/catalog.generated.ts` 是
  `codegen:plugins` / `codegen:gameplays` 的产物，禁止手改。
- 普通 plugin/玩法动线的中央禁改集合以 `scripts/protected-paths.json` 为机检真源
  （`test:client` 的无侵入矩阵校验，散文视图见 docs/Non-intrusive.md §11.3）。

## 3. View 与 Logic 分层

### Logic

`logic/` 只能依赖 TypeScript、ES 标准库、shared 和显式注入的 port：

- 不 import `cc`。
- 不 import `fairygui-cc`。
- 不直接读写节点。
- 不自行创建网络单例。

页面行为通过依赖注入连接 HTTP/RPC/View port，因此可在 Node 环境无头测试。

`logic/scene3d/` 提供投影无关的场景数学，2D 与 3D 消费方共用；双端都需要的 LOD 公式位于
`apps/shared/src/logic/lodBands.ts`（客户端消费同步后的 `shared/logic/`），不从 shared 反向依赖客户端。

| 模块 | 消费方式与边界 |
| --- | --- |
| `shared/logic/lodBands.ts` | `lodForValue` / `lodForValueStable`；消费方传严格升序阈值与 `[0,1)` 滞回比例，0 为最细档，支持一次跨多档。SLG 的 `slgLodForScale` / `slgLodForScaleStable` 已为薄包装，阈值与 8% 滞回仍归 SLG。 |
| `logic/scene3d/cameraRig.ts` | `CameraRig` 管 pan / pinch / `zoomBy`、惯性、边界、指针及 `version` / `touched`；注入 `projection.offsetAt / halfExtents` 与手感参数，输出 `center / zoom / version`。`follow(target)` 采样目标引用，手动输入或 `cancel` 退出跟随；SLG `MapCamera` 保留 2D 投影和公开 API。 |
| `logic/scene3d/chunkStreamer.ts` | `ChunkStreamer` 注入地图宽高、chunk 边长、数值 `key / unkey`、加载 / 保留外扩；`update` 产差分，`take / takeBatch` 中心向外调度，`current / accept / reject / defer / reset` 守请求代次。只调度不发请求；`defer` 回队首，重试时机由调用方负责。SLG `MapStreamer` 已为薄包装。 |
| `logic/scene3d/assetPlan.ts` | `AssetPlan(catalog, { now, graceMs? })`：`update(quality, lod, visibleChunks)` 先按层过滤，再选显式变体，输出 `acquire / release`；共享地址按 kind / bundle / path 去重。出档默认保留 5 秒，`flush()` 处理静止视口的到期释放，重入取消释放；`close()` 立即清空并终结计划。 |
| `logic/scene3d/pickMath.ts` | `rayPlane` 求水平面 `y = height` 交点，`rayAabb` 求闭合实体盒首次相交；前向命中返回 `{ t, point }`，未命中返回 `null`，方向不必归一化。`unprojectDesignPx(x, y, lease.screenToRay, height)` 经当前舞台相机反投影到水平面。 |
| `logic/scene3d/viewport.ts` | `resolveViewport / designToScreen` 处理设计矩形、留黑边与屏幕像素换算，由 Stage3D 适配器消费。拾取方使用 `lease.screenToRay`，不重复缩放或翻转 Y。 |

`CameraRig` 的指针与缩放锚点是**相对视口中心的设计像素**，`start / move / end` 时间单位为毫秒，
`step` 为秒；`unprojectDesignPx` 与舞台视口则使用**左下原点的绝对设计像素**，保留已归属拖拽的越界坐标。
View 接收框架 raw-input，转换坐标后交给 Logic，并在 cancel / hide / 关闭时清空手势；相机姿态和节点更新
仍由 View 经舞台租约执行。数学模块不自行订阅输入、加载资产或操作节点。

`AssetPlan` 的 catalog 复用已登记的 quality / pool / detail-layers 表；chunk 只引用预制地址、pool id、
texture id，层归属保持单源。可选 `prefabLods` 显式列出 0 / 1 / 2 档地址，两级模型在后两格重复远档；
纹理直接选 quality × LOD 单元，不再次应用 textureStepDown，也不改变网格 LOD。缺失单元、未知引用
或冲突归属在建计划时拒绝；catalog 为脱离输入的快照，内容表改变需创建新计划。
`now` 注入单调毫秒时钟，调用方每帧执行 `update` 或 `flush`；已有 LOD 滞回仍由 `lodForValueStable` 提供。
View 将差分中的 kind 映射到 Prefab / Texture2D，并按每个返回 token 管理 AssetLease 请求与租约。
加载失败后 `reject(token)` 使下一次 update 可重试，完成回调先验 `current(token)`；旧代次不得接管新请求。
`current` 包括仍在宽限期的持有状态，不能当作当前可见或可激活的判据。降档时 View 立即隐藏被禁用层；
收到 release 或 close 的结果后取消在途请求，并在节点 / 渲染引用退休后释放成功租约。
`AssetCatalog` 是计划与实体池共用的选择器；detail-layers.json 可给 `hideAtLod: [{ prefab: { bundle, path }, lod: 0 | 1 | 2 }]`，达到此档及更远时
同时停止请求与激活，已加载计划资产仍按自身宽限期释放。省略该字段不隐藏。

`view/scene3d/EntityPool.ts` 按 pool id 与预制地址复用节点。生产入口
`createCocosEntityPool(catalog, lease.root, { quality: ports.stage3d.quality, signal: lease.signal })`
自动订阅引擎帧；`spawn(id, configure)` 返回含 `state / node / error / retry / despawn` 的独立句柄，
达到当前表中 capacity 时返回 undefined。configure 在 inactive 节点上执行，应重设本实体的变换与状态。
spawn 只排队，加载完成也不激活；池内所有预制共用每帧预算，失败尝试同样计数。无头适配器用
`step(frameId)` 注入单调帧序号，同一序号重复调用不刷新额度，不能传每秒归零的 root.frameCount。

`setLod` / `setQuality` 取消不再适用的加载与队列；同一个远档地址保持复用，低档 details 既不请求也不激活。
capacity 同时约束逻辑实体数和每个池跨 LOD 的 active + inactive 节点数；降档保留最早的实体、释放超额句柄。
隐藏实体仍占逻辑名额，恢复可见后重新排队。静态池容量来自 pool.json，单位 / 特效的额外预算由 SC4 消费。
`despawn()` 保留可复用的 inactive 节点和预制租约；`evict()` 只淘汰闲置节点，`close()` 终结所有队列、节点和帧订阅。
实例只借用源 mesh，材质按源身份与 instancing 能力共享一份池内副本；实时蒙皮在本适配器始终禁用 instancing。
Cocos 适配器先停用、摘除和销毁节点，再于 AFTER_DRAW 回收渲染缓存、材质与 AssetLease，不由调用方裸 decRef。

SC4-B1 的 `createCocosSkinnedUnits(catalog, lease.root, { quality, signal, allowRealtime?, clips? })`
以同一 `EntityPool` 为底，增加整个单位池的 `quality.maxUnits` 上限；预制须有一个 `SkeletalAnimation`，
所有 `SkinnedMeshRenderer` 指向该动画根。`spawn(poolId, clipName, configure?, mode?)` 返回相同生命周期句柄，
另有只读 `clip / mode`；默认 baked，`play(entity, clipName, mode?)` 可在排队期间更新请求，
或在活动节点上切 clip / 模式。动画及材质由此接口管理，调用方只改变换和挂点内容。
`socket(entity, jointPath)` 只接受活动实体，返回引擎真实 socket；切 clip / 实时模式保持同一挂点，
despawn 或 LOD 更换预制后须重新取得，调用方在 despawn 前摘除自己挂载的内容。

实际 mesh、源材质、关节纹理对象、实例属性格式 / 顺序 / stride 一起决定共享材质组；跨图集切 clip
立即重分组，各 pass 使用独立父材质。可选 `registerJointTextureLayouts` 须在第一次实例化 / 烘焙前调用，
以真实 skeleton / clip hash 声明兼容图集；相同声明复用，冲突拒绝。宽度按 12 对齐以同时满足浮点与 RGBA8 行采样，
内容须由作者保证能放入图集。布局不能替代运行时实际纹理分组，也不能迁移已烘焙的纹理句柄。
额外 `clips` 为已加载的兼容 clip，模板通过统一 retainer 持有到节点退休后。素材与源材质均不被改写。

SC4-B2 的 `createCocosVfx(catalog, lease.root, { quality, signal: lease.signal })` 管理 ParticleSystem
Prefab 池。`play(poolId, { at: { x, y, z } }, durationMs)` 或 `play(poolId, { follow: () => position }, durationMs)`
返回只读 `state / node / error` 与 `stop()` 句柄；坐标为世界坐标，跟随返回 undefined 即结束。
寿命从实际激活开始，以单调毫秒计时，长帧或暂停后恢复不延长寿命；自动帧订阅在 AFTER_UPDATE 更新。
同键容量来自 pool.json，全池 pending + active 额外受 `quality.maxEffects` 限制；超额返回 undefined。
LOD2 一律拒播，内容 `hideAtLod` 与 details 门同样生效；禁用或降档回收旧效果，回近档不自动重播。
停止与超时先清粒子再归池；`evict()` 销毁空闲节点，租约释放 / `close()` 回收全部节点、订阅与资源。
调用方只借用当前活动节点，不自行改粒子容量或材质。Creator 3.8.8 默认粒子材质在节点退休后的 AFTER_DRAW
由适配器补充回收，源 Prefab / 源材质保持不变。无头适配器用 `step(frameId, nowMs)` 注入单调帧号和时间。

实时蒙皮须 `allowRealtime:true` 并显式选择 `mode:"realtime"`；同池实时单位另受
`maxUnitsWithoutInstancing` 上限约束，换模型前先安装关闭 instancing 的副本。首次进入实时的每个 clip
重建一次求值状态，后续切换复用；不因缺少浮点纹理直接放弃可用的 RGBA8 预烘焙。
`setLod / setQuality / evict / close` 沿用实体池语义；若新能力完全没有关节纹理，调用方先显式转换或移除 baked 单位。
SC4-B3 已提供显式 low 退化策略与远档公告板；RGBA8 可用时保留烘焙，只有关节纹理不可用或提供的实测帧时超预算才退化。接法见 [预览工具说明](../tools/creator-preview/README.md#sc4-b3-low-退化)。

玩法通过 `logic/gameplay/GameplayRegistry` 登记 factory 与该玩法自己的 room joiner，
`RoomController.startRegistered` 取得同一 registration 的快照后接管精确 room capability。组合点采用生成式
catalog：每个玩法一个 `gameplay/modes/<id>/index.ts` 模块（导出
`createGameplayModule(services)`：validateLaunch + joiner + createPlugin，services 是
`gameplay/services.ts` 的稳定注入面），由生成的 `gameplay/catalog.generated.ts`
（`registerGeneratedGameplays`）静态聚合登记；`gameplay/catalog.ts` 只提供零状态转发，不参与 registration。
`ballMove` 带 Cocos presentation（字面量动态 import，输入经 generation-fenced
`GameplayInstanceHost` 回流），`idle` 是无 presentation、但拥有独立 state 与 pulse 输入的最小真实
玩法。每个模块注入自己的 raw state exact validator、允许发送的消息集合和可选 reconnect
reconcile；新增玩法只新增 `modes/<id>/` 模块文件与自己的 logic/room adapter，不修改通用
`RoomClient`、`RoomController`、`gameplay/services.ts` 或 `Main` 的启动流程。

### View

`view/` 允许依赖 Cocos 与 FairyGUI，但职责受限：

- 查找命名元素。
- 绑定点击和列表回调。
- 把展示数据搬进组件。
- 把用户动作转发给 Logic。

业务判定、排序、时间规则、错误分支和网络编排不进入 View。

### 3D 舞台、资源与画质（SC1 / SC3）

3D 页面仍用 `kind:"cocos"`，其 UI 根只承载页面；3D 内容挂在框架舞台的 `lease.root` 下。
kit / 插件从 `PluginInstallContext.ports.stage3d` 注入端口，在本次打开的 setup / `onOpen` 中调用
`acquire(context, options)`；`ViewLifecycleContext` 直接满足 owner 的 `signal / isActive()`。
gameplay 则从 `GameplayServicesContext.stage3d` 取得同一端口，在 presentation 的 mount / unmount
绑定当前玩法世代。不要另建 Stage3D 单例、Camera，或把 3D 内容挂到 UI_2D 页面根。

同时只允许一份舞台租约，重复取得抛 `Stage3DBusy`。相机姿态、视口和射线走 `lease.camera` /
`lease.screenToRay`；视口与拾取输入均用设计像素。关闭、打开失败、owner 失效或场景销毁会自动释放，
显式 `lease.release()` 也幂等；permanent 页重开必须取得新租约。只需全局设置的 2D 页可用
`acquireGlobals(owner, patch)`，不占舞台。它与 `lease.setGlobals(patch)` 共用按取得顺序覆盖的 token 表：
后取得者覆盖自己声明的字段，更新不改变优先级，乱序释放按仍有效的 patch 重算，最后恢复基线。
`setGlobals` 替换整份 patch，省略字段即撤回该覆盖，不直接写 `director.getScene().globals`。

已开放 `toneMapping`、fog 的 `enabled/type/density/start/end`、`ambient.skyIllum` 和
shadows 的 `enabled/kind`。SC3-B4 增加 `skybox.enabled`、`envmap/diffuseMap/reflectionMap`
（已加载的 `TextureCube | null`）与 `lighting: "hemisphere" | "reflection" | "diffuse"`。
只管理项目当前 HDR/LDR 槽，HDR 模式仍由项目设置决定；调用方先用 AssetLease 加载并持有资源，
`setGlobals` 不异步加载。框架为基线与每份 patch 各持有引用，被覆盖的 patch 仍持有；
成功替换后先更新场景再归还旧引用，失败恢复旧状态，双重失败保留可能仍被场景使用的资源直至重放成功。
同一 patch 内相同资源去重，不同 token 仍独立持有。`undefined` 撤回字段，`null` 明确清空纹理。
SC3-B1 的通用加载入口是 `view/scene3d/cocosAssetLoader.ts` 的 `assetLease`：
`await assetLease.acquire([{ bundle, path, type }], { signal, deadlineMs })` 返回 `{ assets, release }`，
`assets` 按请求顺序保留具体资产类型与身份；重复地址仍逐请求持有一份引用。`resources` 也是 bundle 名，
其余包先经 `assetManager.loadBundle` 再 `bundle.load`，不推导 URL，不移除共享 bundle 缓存。
默认 deadline 为 15,000 ms，覆盖 bundle 与资产两个加载阶段；可覆盖为 0–2,147,483,647 的整数毫秒。
`AssetLoadError.code` 为 `ASSET_MISSING / ASSET_TIMEOUT / ASSET_CANCELLED`，前两者可重试，
错误携带具体地址、原因与清理异常。失败或取消立即整包回收，迟到成功仍经同一 retainer 成对持有 / 归还；
成功租约须显式 `release()`，**signal 只取消在途加载，不会提前释放仍被节点使用的成功资产**。
无头测试通过 `new AssetLease(loader, { scheduler, onError })` 注入 transport、时钟与迟到清理错误观察者；
同步 retainer 仍是框架内部引用边界，不是 kit 的额外 retain API。

`Stage3dFixtureView` 与 `Stage3dDevScene` 均使用正式 AssetLease，临时 loader 已删除。
SLG 的八件套包装逐件取得租约、收齐结果后统一校验，保留既有失败等待与错误信息；
页面关闭 / 切图取消在途加载，卸下旧图节点后于 AFTER_DRAW 归还八件套，迟到成功仍由框架回收。
缩略图保留 `loadSlgMapMini` 的纹理返回值，
每次成功对应 `releaseSlgMapMini(texture)` 一次，不裸调 decRef；面板关闭在绘制退休后统一归还。
两个 SLG Renderer 接收由页面注入的 globals 获取函数，随 dispose 归还各自的 linear tone mapping 租约。
释放遵循先取消输入、撤下节点
及其渲染引用，再归还材质和资产的顺序；迟到加载也必须成对归还。kit 不复制 loader 或裸调资源引用计数。

世界页声明 `inputMode:"passive"`，可点击 FGUI HUD 声明 `inputMode:"overlay"`，弹窗用 `modal`；
原始触摸、wheel 和 cancel 通过 [§4 的框架输入端口](#inputmode-与原始输入) 送给 Logic。
模态关闭只接受新手势，取消回调清空拖拽、摇杆和持续动作。通用相机、LOD、流式与拾取求交已由 SC2 交付，
消费方式见上方 Logic 模块表；夹具的固定相机移动仍只是验收行为。

读取 `ports.stage3d.quality`（或 `services.stage3d.quality`）取得只读画质快照，不占舞台。
微信、WebGL1 / GLES2、未知平台或 GPU 默认 low；消费 `details`、`shadows`、`maxUnits`、`maxEffects`、
纹理及蒙皮能力字段，不自行重新判档。开发预览可用 `?quality=low|medium|high&shadows=0`；生产忽略覆写，
开发覆写也不能开启硬件缺失的能力。SC1 已交付判档、数据表校验和压缩预设，SC3 已交付 `AssetPlan` / `EntityPool`
的细节层加载门控与逐帧激活预算；蒙皮容量与退化验收归 SC4。数据表和保守回退政策见 [画质说明](../tools/art3d/quality.md)。

正式先例为 `Stage3dFixtureView` 与独立 `stage3d-dev.scene`（后者不进构建）；资产路径使用
`{ bundle, path }`，GLB 取已登记的 Prefab 子路径，不能按 GLB 根路径加载 Prefab。
包的 3D 重资产归 `bundles/<kit|plugin>-<id>[-<map>]/3d/`，小数据归
`resources/{kits,plugins}/<id>/3d/data/`。`verify:assets3d` 已进 `verify:core / verify:all`，守格式、
导入、压缩、预算、授权和 UUID 依赖闭合；配置见 [资产闸说明](../tools/art3d/assets3d.md)，
设计边界与阶段证据见 [3d.md](3d.md) 及 [SC1 汇总](perf/stage3d/2026-09-23-sc1-review.json)。

#### 纯色矩形一律走 `view/uiPlate.ts`，⛔ 不要用 `Graphics`

手搓 Cocos 页（`kind:"cocos"`，无 FGUI 资源）用色块拼版是允许的，但**每块底板一个 `Graphics`
组件**这种写法有两个实测代价，Creator 3.8.8 预览下经 CDP 读引擎 profiler 得到：

| 页面 | 改造前 Graphics | 缓冲显存 | 改造后 | 缓冲显存 |
|---|---|---|---|---|
| 首屏 | 3 | 6.8 MB | 3 个 Sprite | 0.0 MB |
| 设置 | 25 | 56.3 MB | 25 个 Sprite | 0.0 MB |
| 衣柜 | 50 | 112.6 MB | 56 个 Sprite | 0.1 MB |

⚠ **每个 `Graphics` 组件固定占用约 2.25MB 显存缓冲**，与它实际画多少内容无关（三点线性，
缓冲显存几乎全部由 Graphics 个数解释）。衣柜那 50 个各自只画一个 4 顶点的矩形，却合计吃掉 113MB
——桌面看不出来，手机视口是事故。改用共享白帧的 `Sprite` 后基本清零。

- 纯色矩形 → `createSolidPlate()`（`apps/client/src/view/uiPlate.ts`）。
- ⚠ **draw call 基本不会因此下降**（实测衣柜 116 → 107，约 8%）：底板与 Label 在节点树里交替
  出现，UI 合批一遇材质切换就断。要真正合批得把底板与文字分层重排，会改变遮挡语义，
  ⛔ 在当前帧时间（0.4~0.8ms）下不值得。
- ⚠ ⛔ **不要图省事直接用 `builtinResMgr.get("default-spriteframe")`**：那张帧 `packable` 为 true，
  动态图集会去打包它，而它的 `ImageAsset.data` 是 `Uint8Array` 不是 `HTMLImageElement`，
  `texSubImage2D` 重载解析失败会让**整个渲染循环当场死掉**（画面定格、帧数不再推进）。
  `uiPlate` 自建帧并置 `packable = false` 正是为此。
- `Graphics` 仍是画线、圆、折线的正确工具（战场网格、轨迹、降级描边），⛔ 只禁「纯色矩形」这一种用法。

## 4. 页面定义与生命周期

页面由三部分组成：

1. `view/XxxView.ts`：结构绑定（codegen 维护四个 AUTO 区块）与手写接线。
2. 同目录 `XxxView.view.json` sidecar：owner/layer/实例策略/logic 指向与手写契约段
   （manualRequired/nested/listItems/controllers/relations/assetUrls）的唯一手写真源。
3. `apps/plugins/<id>/plugin.json`：把 sidecar、路由（group/restore 在 sidecar）与入口
   contribution（只有身份：entryId/label/labelKey/icon/launch，launch 可为 gameplay 或 route，
   ⛔ 无 slot/order）登记进 plugin；首屏入口顺序与默认玩法由宿主 `apps/plugins/host.json` 声明
   （docs/PLUGIN.md §6「位置归宿主」）；`npm --workspace @game/server run codegen:plugins` 据此生成
   `src/generated/{views,fguiContracts,plugins}.generated.ts`（含 `GENERATED_HOST`）。`view/viewRegistry.ts` 与
   `view/fguiContracts.ts` 只是生成值的稳定 façade，⛔ 禁止手改。

页面打开经 plugin route / `app/NavigationService`；登录/选区/公告等既有页面的组合根在
`app/loginFlow.ts`（`view/pages.ts` 是零状态转发 façade；新增 plugin ⛔ 只通过 plugin route，禁止向它添加
`openXxx`）。回登录 transition 的固定次序与文案映射由
`app/SessionCoordinator` 拥有。

打开页面：

```ts
const handle = await ViewMgr.open("Home");
await handle.run((_view, context) => {
  // 组合根（app/loginFlow 或 plugin route）在这里注入 view.setup(...)，并把 context.signal 传给异步 Logic。
});
```

`ViewMgr.open` 接受页面名和可选的 setup 回调，不把业务参数塞进 registry。返回句柄带有本次打开的
`signal` 与 `generation`；页面数据、回调和异步首拉应在 `handle.run(...)` 内注入。setup/render 或
`onCreate/onOpen` 失败会自动走同一条关闭、交互租约回收和实例销毁路径。

不要从普通脚本静态 import `fairygui-cc` 或具体 View。所有 View 都通过 registry 的动态 import
进入加载链，避免编辑器扩展尚未就绪时污染根脚本。

ViewMgr 的生命周期语义：onlyOne/permanent 页面的在途 open 会合流到同一个加载 Promise；所有页面（包括
多实例 Confirm）的在途 open 都可通过句柄/按名关闭取消，并在 mount 前拦截。场景/root generation 变化时
旧 pending 会失效；mount、setup 或渲染失败统一回滚。permanent 页面只运行一次 `onCreate`，每次重开
生成新的 `signal/generation` 并运行 `onOpen`；关闭会使旧异步上下文失效。FguiView 在首个视图挂载时才
懒建 GRoot 且默认关闭全局输入（避免全屏 InputProcessor 吞掉玩法触摸），包加载按全进程在途合流防重复加载。

页面开发应遵守：

- onlyOne 页面只创建一个实例。
- 事件接线应幂等，关闭时释放监听和异步上下文。
- 数据刷新与第一次 setup 分离。
- detached Promise 必须显式处理错误。
- 关闭页面后，迟到的 HTTP/RPC 结果不得继续更新 View。

### `inputMode` 与原始输入

页面 `.view.json` 声明 `inputMode: "modal" | "overlay" | "passive"`。`interactive` 保留为兼容别名：
true 对应 modal，false 对应 passive；两个字段均省略时为 passive，同时声明必须一致。
codegen 与 `defineView` 均拒绝矛盾声明、未知值及非 FGUI overlay。

- `modal`：按 `base < popup < top` 和同层置顶顺序建立最高模态边界。下层 FGUI 槽不参与命中，
  Cocos 页面暂停节点事件和 Button；恢复时保留 Button 原开关。Cocos 模态页仍须提供全屏输入屏障。
- `overlay`：仅限 FGUI，控件可点击、空白可穿透，不暂停下层世界。框架把挂载槽和页面根设为
  `opaque:false`；作者须对内部空白容器同样设置，并把装饰对象设为 `touchable:false`。
- `passive`：不建立模态边界。FGUI 槽不参与命中；Cocos 世界页可接收世界原始输入，仍受上层模态遮挡。

框架 `view/input/` 在玩法 router 之前按起点固定每根 pointer 的 HUD / 世界归属，跨边界保持至 end / cancel；
wheel 按当前命中分流。FGUI overlay 从 GRoot 显式转发世界事件，宿主的全局输入仅在它未捕获时接收，
避免丢事件和重复派发。装饰、空白及命中使用锁定 FairyGUI 的相机和坐标转换，不改 vendor。

Cocos 世界页通过 `this.subscribeRawInput(context, { touch, wheel, cancel })` 订阅；gameplay 模块把
`services.presentationHost.rawInput` 与当前 `GameplayInstanceHost` 注入 presentation，后者在 mount 时
调用 `port.subscribe(owner, subscriber)`，unmount 归还返回的释放函数。owner 的 signal / isActive 共同守住
打开或玩法世代；单个活动世界订阅被替换后不会被旧释放函数恢复。原始事件提供 pointer ID 和
`getUILocation()` 设计坐标。Snake 与 BallMove 已迁移；新增表现件不再自行注册全局触摸。

模态切换、HUD 关闭 / 置顶、页面关闭 / 重挂、GRoot 重建及宿主 hide 会取消在途按压，清空 router、
摇杆和 boost；恢复只接受新手势，不补 click。取消回调先于宿主 hide 的业务意图禁用执行，必要停止意图
仍可走原 `dispatchInput`；该业务通道继续守玩法世代与后台状态，HUD 主动发出的业务动作也使用它。
FGUI InputProcessor 仍只有一个：无 overlay 时保持既有 modal 仲裁，有 overlay 时由框架适配器管理
当前 root 的处理器安装 / 释放，页面不自行安装输入桥。

关闭必须走 open 返回的 `ViewHandle.close()`；onlyOne/permanent 页也可用 `ViewMgr.close(name)`——它会
取消该名字下的在途 open，但对已挂载的多实例实例是空操作。直调 `view.dispose()` 会让 `interactive`
租约无法恢复。

## 5. FairyGUI codegen

命令：

```bash
npm run codegen:fgui -- <Package> <Component>
```

生成器只改 View 中的四个 AUTO 区块：

- `IMPORT`：FairyGUI 类型导入。
- `REQUIRED`：包名、组件名和契约常量。
- `FIELD`：字段声明。
- `BIND`：`getChild` 绑定。

AUTO 区块外是手写区。重复执行应得到稳定结果。

命名元素契约的 `required` 段由生成器从 FGUI XML 按 binding 规则计算（与 View AUTO REQUIRED 单源）；
手写契约段（manualRequired/nested/listItems 等）写在 View 同目录的 `.view.json` sidecar，经
`codegen:plugins` 汇入 `generated/fguiContracts.generated.ts`（`view/fguiContracts.ts` 只是
re-export façade）。跨包组件依赖通过 sidecar 的 `sharedPkgs` 声明，不要在页面中临时加载隐式依赖。

常见约束：

- `GLoader` 使用 `url`，不是引擎 Sprite API。
- Controller 切页使用约定的 page name。
- XML parser 保留 `displayList` 直接元素作为 AUTO 绑定真源，同时递归记录嵌套组件/list item 的
  `children`/`nestedElements`、`path`、`defaultItem`/模板数量、relation、controller 和 `ui://` 资源引用；
  手写嵌套 `getChild` 契约必须显式声明 `path`，避免同名元素误匹配。生成契约的
  `required` 只由 codegen 维护；未加前缀的手写字段使用 sidecar 的 `manualRequired`，外部组件和
  列表模板分别使用 `nested`/`listItems`，并由无头测试按 `ui://` 资源实际解析后校验字段、
  controller 与 `defaultItem`。
- `scripts/fgui-manifest.mjs --check`（`npm run verify:fgui`）钉住每个 package 的 XML/资源声明与哈希、
  `ui://` 包及资源 ID 闭包、Cocos `.bin`/图集/Spine 等导出物和 View 四个 AUTO 区块哈希；设计源或
  package 导出物变化后必须重新导出并执行 `--write`，否则本地闸失败。
- 测试还会检查导出组件、页面包依赖闭包、registry/Logic 配对，以及 `view/<Pkg>View.ts` 内的
  `ui://<Pkg>` 字面量；`view/` 下其他文件（如集中状态图标 URL 的 `areaPresentation.ts`）不在该扫描
  范围内，那里的包名写错不会被本地测试发现。
- 页面自身包和 `sharedPkgs` 都必须在创建前成功加载；失败不会降级为空占位，而会抛出
  `FguiPackageLoadError`（`code=FGUI_PACKAGE_MISSING`，`retryable=true`）。FairyGUI 的底层回调没有取消
  API，因此关闭页面或场景/root 世代变化时只取消当前等待者；迟到回调会被观察，成功共享包仍留在进程缓存中。
- 包加载使用统一 deadline，默认 `15000ms`，可由宿主调用 `FguiView.configurePackageLoading({ deadlineMs })`
  调整；超时抛 `FGUI_PACKAGE_TIMEOUT`（可重试）。`ViewMgr` 会把每次 open 的 `AbortSignal` 传给共享包和
  页面包加载，关闭/场景重载不会让旧 Promise 在之后挂载页面。

## 6. 设计分辨率与资源导出

当前竖屏设计基线为 750×1624 / `FIXED_WIDTH`，对应位置是：

- 代码数值真源：`apps/client/src/designSpec.ts`。
- 运行时适配策略：`apps/client/src/Main.ts`。
- Cocos 设置：`apps/Cocos/settings/v2/packages/project.json`。
- FairyGUI 设置：`apps/art/fairygui/settings/Adaptation.json`。

现有测试会核对代码常量、Main 策略和 FairyGUI 设置，但尚未读取 Cocos `project.json`；四处当前一致，
仍可能在以后发生未被测试发现的漂移，收口项登记在 [EXTRAS.md §5.2](EXTRAS.md#52-未实现的开放项登记2026-09-06-自-plan-系列归并) G3。

资源动线：

```text
apps/art/fairygui 中修改设计源
  → 在 FairyGUI 编辑器中导出 .bin 与图集
  → 输出到 apps/Cocos/assets/resources/ui
  → 打开 Cocos 生成或复用 .meta
  → 运行 codegen 和本地契约测试
```

“导出”在本文中只指把设计源转换为本地开发资源。

## 7. 网络层

GameRoom 的通用 join/leave ownership 与 mode adapter 契约位于 `net/rooms/GameRoomTransport.ts`；
`BallMoveRoom.ts`、`IdleRoom.ts` 只把一个已捕获的物理 room 适配成各玩法能力。玩法启动目标经
Home 菜单 contribution → `LaunchPort.launch` → AppRuntime launch 通道选择（gameplay target 进玩法，
route target 经 PluginHost 闸后打开 route；`Main.gameplayId` 只是默认 launch target 的开发调试
@property 兜底，缺省 = `apps/plugins/host.json` 的 defaultLaunch；删除属场景资产 diff，需 Creator）。adapter 必须把对应
`mode`、生成的 state 类型/validator 和允许的 C2S 集合传给 Game join，不能依赖服务端默认值；
Game join 信封（v8）必填 `mode/modeVersion/profile`——默认撮合由 `joinGameRoom` 按 catalog 注入，
私房由 `net/rooms/PrivateRoomService.ts`（prepareCreate→create / resolve→joinById，携带 access
ticket）配合 `net/rooms/matchmaking.ts` 的 strategy 判别联合注入。ballMove adapter 独占 Move
reconcile；idle 没有该 hook，join/reconnect 都不会构造 Move。

世界房（MMO MF4-B7，`RoomName.World`）走独立的 `net/rooms/WorldRoomTransport.ts`（⛔ RoomClient / GameRoomTransport 零改动）：
`world.enter`（MF8）签发的 `{ personaId, ticket }` + `matchmaking.ts` 的 `WorldRoomMatchmakingStrategy { kind:"world", mapId, line? }`
→ 信封 `v = WORLD_ROOM_PROTOCOL_VERSION`、`modeVersion` 取 client catalog（mode 必须是 `kind:"world"`）、`profile` 恒 `"world"`、
token / sId 取会话，本地先过 `validateWorldRoomJoinOptions` 再 `client.joinOrCreate(RoomName.World, options)`；一个 transport 同时
只持一个世界房；出站只放行 core 与本 mode 的 C2S 且掉线期间拒发（⛔ 不重放旧意图）；入站先过 `validateS2CPayload`；离开分类
`consented / drained（WITH_ERROR：须经 world.enter 重进）/ replaced（同 persona 别处取得控制权）/ dropped（SDK 自动重连）`。
默认端点由 `getCurrentWorldWsUrl()` 提供，即 `/version.worldWs`，缺省回落目录 `gameWsUrl`，并在创建 transport 时捕获。
首次 `world.enter` 与交接都通过 `transport.transfer()` 消费服务端返回的 `endpoint`：非空的节点地址优先，
空串使用该 transport 的默认 world 端点。Lobby 的 `world.enter` 只定位实例记录、签发凭据，实际 `joinOrCreate` 发往 world 端点。
交接（MMO MF8-B5）：收到 mode 的「交接就绪」token（或 Lobby `world.resolveTransfer { transferId }` 的结果）后调
`transport.transfer({ mode, personaId, ready })`——退源房（有界等待 `WORLD_TRANSFER_LEAVE_TIMEOUT_MS` = 3 s，`leaveTimeoutMs` 可注入：LEAVE 无回执 ⇒ 本地收尾继续，服务端 Committed 后本就离座；MMO MF11 R2-02） → 带凭据 join 目标分线（`ready.endpoint` 非空且注入 `clientFor` 时换 world 进程的 SDK client）→ 新句柄
`transferId`（重连凭它 resolveTransfer）；strategy 形态 `{ kind:"transfer", transferId, mapId, line? }`（凭据仍在请求的 `ticket`，⛔ 进 strategy / 日志）。视野流 / baseline 的 reconcile 端口 = `WorldRoomHandle.bindObserverStream(types, sink)`（MMO MF5b-B2，
与 `GameRoomTransport.bindObserverStream` 同形：六个 perSession S2C 经 wire 校验绑到 `logic/rooms/observer/ObserverReconciler`；本人私有流走
`onMessage` 且要喂给 reconciler 的 cursor——它与视野流共用单 seq 流）。

### RoomClient

负责有状态房间：

- join 与连接复用。
- ownership/generation 守卫。
- 只通过不含原始 SDK room/send 的 typed facade 暴露玩法能力。
- 按 adapter allowlist 校验并发送输入；首个真实 `ROOM_STATE` 前和 reconnect 下一帧前 `stateReady` 保持关闭。
- 经 adapter raw exact validator 守卫的初始 root、异构 Schema state change 与 reconnect 恢复；JOIN handshake
  产生的默认 root 不作为首帧证据。
- SDK 离线消息队列固定为 0，并在 drop/reconnect 清空，防止其先于下一份 state 自动 flush。
- drop/reconnect/leave 事件。

复用判据必须包含 endpoint 和完整 join options；旧连接的迟到事件无权修改新 slot。ballMove gameplay
插件每 5 秒发一次 ping 测算 RTT，掉线窗口内暂停发送；网络层只负责发送与回调边界。

### WebSocketClient

负责 Lobby RPC：

- `rpc` / `rpcIdem`。
- timeout 与 pending 清理。
- push 分发。
- session 错误归类。

写请求的 `clientReqId` 只生成一次，重试复用同一个 ID。join 复用判据包含 endpoint、区号、token 和完整
options，不符即抛错而非静默复用；本次 `client`/`endpoint`/options/generation 会在 join 开始时冻结，
`init()` 换端点不会污染在途连接。join 的 deadline/cancel 契约由 `net/joinControl.ts` 定义，RoomClient
与 WebSocketClient 共用；timeout 或 AbortSignal 会立即结束本地 ownership，SDK 迟到的 room 仍在后台释放。
两个 transport 共用的其余 wire 原语（join options 克隆与稳定序列化、控制字段拆分、错误文本卫生与离线
重放闸）收敛在 `net/wireCommon.ts`；低层连接事件契约类型在 `net/connectionEvents.ts`。
LobbyRoom 只为四个 SDK 会自动重试的 transport close code（1001/1005/1006/4010）**加上「框架未给关闭码」
的兜底分支**保留 10 秒重连窗口（`code === undefined` 时无从判定是否可重试，fail-open 最多多占 10 秒
seat / online registration）；主动退出、停服和 49xx 强踢直接最终清理。客户端 onDrop 会立即把全部在途
RPC 判为 CONN_LOST，onDrop 之后的新 RPC 也 fail-fast。socket 已关而 onDrop 尚未回调的间隙里，本地闸
（`slot.dropping`）还没合上，`room.send()` 仍会被调用且 SDK **不抛异常**；因此 `WebSocketClient` 在
bindRoom、onDrop 与 onReconnect 三处把 SDK 的离线重放队列钉死（`maxEnqueuedMessages = 0` 并清空
`enqueuedMessages`），使这类请求既不会入队也不会在重连 JOIN_ROOM 后被 flush——否则调用方已按 CONN_LOST
处理的写 RPC 会迟到执行。装闸失败时 fail-closed：bindRoom 阶段直接让 join 失败，掉线/重连阶段主动摘除
slot 并把在途 RPC 判 CONN_LOST。当前 generation 的
onReconnect 只恢复发送能力，room、ownership 与 push listener 继续存活。只有最终 onLeave 才进入下述
session/profile 对账。
`net/session.ts` 是登录态与 authInvalid/connLost/battleLost 三类 transport 事件的稳定 façade——
状态与派生逻辑由 `app/SessionCoordinator` 统一拥有（低层 connection/battle 事件经
`app/LifecycleBus` 转发，battle transport 事件由 RoomClient 发布、SessionCoordinator 派生
battleLost）；authInvalid 在未登录时幂等吞掉迟到上报。Lobby 最终 `onLeave` 后，页面组合根先复用当前内存 token，以显式 ownership
重进所选区 Lobby，再拉 `user.getInfo`；只有完整 identity 仍匹配的结果才能原子替换角色快照并恢复 Home。
join 使用 15 秒显式超时并随页面 scope 取消，失败才进入统一 `returnToLogin` 清旧 bearer。重复最终断线
在同一 generation 内合流；旧 continuation 只能释放自己的 ownership，不能覆盖新快照或关闭后来登录。
authInvalid、battleLost、对账失败与 Main 的进房失败（BATTLE_JOIN_FAILED）仍由 `returnToLogin` 串行编排。

### HTTP

HTTP 底座在 `core/http.ts`，业务调用在 `net/http/`。外部返回值必须在边界校验，不能把
`JSON.parse(...) as T` 当成数据可信证明。

外部身份示例只使用开发契约。

## 8. 本地检查

```bash
npm run typecheck
npm run typecheck:client
npm run typecheck:client:legacy
npm run test:client
npm run test:fgui
npm run verify:sync
npm run verify:ecs
npm run verify:perf
```

### 8.1 客户端性能基线

`npm run perf:client` 在 Node 无头环境运行固定 seed 和 Float64 输入 tape，默认覆盖 100 与 500 个
玩家，分别记录输入同步、ECS tick、self entity 查找、快照分配探针、渲染命令探针以及组合帧的
`p50/p95/p99/max/mean`。这是开发期比较工具，不是 Cocos/GPU 性能承诺：

- `render` 使用 `GraphicsSink` 调用与 `BallMoveView.render` 相同的 `renderBallMoveWorld`，覆盖
  `clear + 边框 + 每玩家圆形/血条` 的样式、命令与几何；sink 以唯一 opcode 和固定小端 Float64
  参数流摘要颜色、线宽与完整命令顺序。它不会加载 Cocos，也不测真实 GPU、批次或材质。
- `snapshot` 是显式的临时对象数组分配探针；当前 `BallMoveView.render` 直接遍历 ECS，因此该指标用于评估
  是否值得引入缓存快照，而不是声称当前帧已经分配了这些对象。
- `snapshotBytesEstimatePerFrame` 是按 `(entityCount + 1) * 64` 的比较用估算，`heapDeltaBytes` 受
  V8 垃圾回收和宿主进程影响；有条件时可用 `NODE_OPTIONS=--expose-gc` 重跑，但不要把 heap 数值当作
  稳定阈值。
- 计时样本先经过 warmup；`frame` 样本把输入同步计入计时，其余单项把输入同步放在计时外。固定
  seed/input checksum、渲染命令数、独立 `renderChecksum` / `frameRenderChecksum` 和分配估算由无头
  测试锁定，timing 只用于同机趋势比较。

保存 JSON 结果（文件不含时间戳，便于版本间 diff）：

```bash
npm run --silent perf:client -- --json --output /tmp/client-baseline.json
```

仓库入库的结构基线位于 `docs/perf/client-ballMove-baseline.json`。运行
`npm run verify:perf` 会按该文件的 seed、帧数和实体数重跑探针，并校验输入 checksum、渲染命令数、
快照分配估算、单项/组合帧渲染 checksum 与带标签的聚合 sink checksum；计时、堆占用和 Node/平台信息
只作观察，不参与门禁。需要生成或更新
结构投影时使用 `--deterministic`：

```bash
npm run --silent perf:client -- --json --deterministic --output docs/perf/client-ballMove-baseline.json
```

可用 `--seed`、`--frames`、`--warmup` 和 `--entities 100,500` 调整工作负载；比较时应保持 Node
版本、平台、实体数和帧数一致，并同时查看 `input.checksum` 与 `sinkChecksum` 确认 tape/几何路径未漂移。

- `typecheck` 先校验外部身份契约，再检查 shared、server、客户端无头 strict probe 和 ES2017 legacy probe，
  并校验镜像；`apps/client/test/clientTypecheckConfig.test.ts` 分别守门两套配置的文件集合，防止新增源码或
  测试脱离 include。legacy 配置以递归 `src/**/*.ts` 覆盖 Main、全部 View 和 gameplay，并另外守住 Creator
  运行时的 ES2017 API 下限。
- `verify:sync` 检查漂移、孤儿和 `.meta`：既查入库文件缺不缺配套 `.meta`，也查已入库 `.meta` 的内容
  （可解析、有 uuid、形状合法）与 uuid 在整棵 `apps/Cocos/assets` 树内的唯一性——撞 uuid 时 Creator
  只认一个，另一个的场景/prefab 引用会静默解析到错资源。
- `test:client` 运行全部客户端无头行为测试；`test:fgui` 只运行 codegen/registry/结构契约专项测试，
  两者都通过 `tsx` 执行。
- `verify:ecs` 检查 vendored bitECS 文件。

Creator 编辑器预览用于补充验证引擎绑定、资源导入和页面交互；它仍然是开发活动。

### 8.2 3D 性能证据

`creator-preview stage3d --perf` 在真实 Creator 3.8.8 的独立 `stage3d-dev.scene` 运行静态实体灰盒。
**此动线由人工触发，不进 `verify:core` / `verify:all`**；聚合门禁只运行采样器和报告格式的无头测试。
先打开 `apps/Cocos` 并完成导入，确认预览服务与本机 Chrome 9222 可用；在 Creator 原生预览设备菜单选择
「网页全屏」（`WebpageFullScreen`），关闭 Rotate。工具打开可见窗口并校验 375×812 CSS、DPR 2、750×1624
backing；此独立场景不需要登录或游戏服。

```bash
node tools/creator-preview/run.mjs stage3d --perf --quality high --expect-webgl 2 --new-window \
  --out .cache/stage3d/sc3-b6/high-webgl2 --summary docs/perf/stage3d/2026-09-24-sc3-b6-high-webgl2.json
node tools/creator-preview/run.mjs stage3d --perf --quality high --expect-webgl 1 --force-webgl1 --new-window \
  --out .cache/stage3d/sc3-b6/high-webgl1 --summary docs/perf/stage3d/2026-09-24-sc3-b6-high-webgl1.json
```

这是复跑示例；按实际日期 / 批次命名 `--out` 与 `--summary`，保留已有证据。依次把 `high` 改为 `low`、
`medium` 并使用各自输出路径即可覆盖三档；完整六条命令及可选端口见
[creator-preview 说明](../tools/creator-preview/README.md#sc3-b5-3d-性能证据)。`--force-webgl1` 在新页面启动前
拒绝 WebGL2 context，`--expect-webgl 1` 再断言实际设备；WebGL1 的 medium / high 是开发覆写，缺省仍为 low。

采样从开发场景就绪后开始，覆盖实体池首次预制请求 / 激活的 120 个帧间隔，以及稳态 60 帧预热后 240 个帧间隔；
不测编辑器导入或整个场景的冷启动。`report.json.perf` 中的原始
样本取 `AFTER_DRAW` 回调的 `performance.now()` 相邻差值（毫秒），使用独立递增序号；同帧记录实体数、draw call、
三角数、实例数与 GFX buffer / texture 字节数。引擎 dt 仅为辅助字段，超过 1 秒的长帧照常保留；前后台切换或
窗口不完整会保留失败报告并拒绝出 PASS 摘要，需重新采样。首次关闭并稳定 60 帧后建立内存基线，再做 20 次开关，
每次检查节点、业务实体和 GFX 字节回到基线。原始报告留本地，入库数字摘要通过 SHA256 关联它。

SC3 退出沿用并复核 [B5 六份报告](perf/stage3d/2026-09-24-sc3-b5.json)：每档请求 500 个立方体，low 的 100 个
名额受 details 门控而隐藏，medium / high 激活 300 / 500 个；两种上下文各档 draw call 为 3 / 4 / 4、三角数为
194 / 3794 / 6194。桌面 M4 的稳态 p95 范围为 17.9–34.6 ms，六组各 20 次开关的 GFX 内存均回基线。
这些数字不构成 60fps、移动端或微信容量承诺；蒙皮 / 特效与 low 退化验收归 SC4，阶段证据索引见
[SC3 汇总](perf/stage3d/2026-09-24-sc3-review.json)。

## 9. 新页面开发清单

1. 在 FairyGUI 编辑器中修改并导出组件。
2. 运行 `codegen:fgui`（生成/更新 View 四个 AUTO 区块；⛔ 禁止手改 `fguiContracts.ts` /
   `viewRegistry.ts`——两者是生成值的稳定 façade）。
3. 在 View 手写区接入必要事件。
4. 同目录写 `<Name>View.view.json` sidecar（实例策略、logic 指向与手写契约段）；选择 `inputMode`：
   模态页用 `modal`，非模态 FGUI HUD 用 `overlay`，世界页用 `passive`。未声明 inputMode / interactive
   时为 passive；overlay 不与 interactive 并用，且只允许 FGUI，空白容器与装饰按 §4 配置命中。
5. 在 Logic 中实现行为并注入依赖。
6. 把 sidecar、路由与 Home 入口登记进 `apps/plugins/<id>/plugin.json`，运行
   `npm --workspace @game/server run codegen:plugins` 刷新生成注册表（共享包依赖写在 sidecar）。
7. 审阅 Editor 设计源、发布物、View AUTO、sidecar 和生成 catalog，再运行
   `node scripts/fgui-manifest.mjs --write` 更新 FGUI 发布闭包锁。
8. 页面打开经 plugin route / NavigationService；登录/选区/公告页面的组合根在 `app/loginFlow.ts`
   （`view/pages.ts` 为零状态转发 façade；新增 plugin ⛔ 禁止添加 `openXxx`）。
9. 增加无头测试。
10. 纯色底板用 `createSolidPlate()`（`view/uiPlate.ts`），⛔ 不要每块一个 `Graphics`——理由见 §3。
11. 运行 `sync:client`。
12. 通过 Cocos Dashboard 打开 Creator 并本地预览。

3D 页另按 §3 注入舞台端口并绑定打开世代，消费 `stage3d.quality`，验证 HUD / 世界双指、跨边界、wheel
和模态取消；资源依所属包登记 `art3d.config.json` / `LICENSES.md` 后跑 `verify:assets3d`。
参照正式夹具，在 WebGL2 / 实际 WebGL1 验证加载失败、提前关闭及预热后反复开关的节点 / 引用 / GFX 回收；
无头测试和类型桩通过不能替代 Creator 证据。SC1–SC3 的消费接口见 §3，3D 性能证据按 §8.2 执行。

## 10. 范围

现有场景、开发账号和演示页面只用于本地开发。微信小游戏兼容层等渠道接缝属于
[额外功能与参考实现](EXTRAS.md)，不构成核心能力承诺；完整项目边界见根 README，已知客户端
缺口登记在 [EXTRAS.md §5.2](EXTRAS.md#52-未实现的开放项登记2026-09-06-自-plan-系列归并)。
