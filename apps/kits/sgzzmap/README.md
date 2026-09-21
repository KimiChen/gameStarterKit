# sgzzmap — 三战式大世界地图 kit

把《三国志·战略版》2084.1768 的**大地图机制**（逆向可读源码在仓外 `sourceVersion/sgzz-2084.1768/`）
在本框架上复刻的地基 kit。

## 一、身份与边界

- **宿主自有 kit**（`kit.json` 无 `version`）：与 `apps/kits/slg` 同形，只活在主树里，不打包、不进锁。
  ⛔ 因此 `plugin -- pack/install/test sgzzmap` 与 `verify:kit-clean-install` 都不适用，验收靠 `verify:all`。
- **与 `slg` 的关系**：`slg` 是**方格**大地图，本 kit 是**odd-q 六边形 + 等距菱形**，两套机制不相干。
  ⛔ v0 禁跨 kit import（`apps/client/test/kitImportBoundary.test.ts` 机检），slg 的成熟模块只能抄改。

| 维度 | slg | sgzzmap |
|---|---|---|
| 网格 | 方格 4 邻 | **odd-q 六边形 6 邻** |
| 投影 | 轴对齐 | **等距菱形**（奇数行错半格） |
| LOD | 4 档 | **6 档**，LOD≥4 切鸟瞰并换 AOI 模式 |
| 领地 | 我方蓝/敌方红 | **19 态 GRID_STATE 关系着色** |
| 行军 | 直线 lerp | **转折点下发 + 客户端逐格展开** |

## 二、API 面

| 面 | 版本 | 内容 | 状态 |
|---|---|---|---|
| `hexmap` | 1/1 | cell key、六邻与环序、cube 距离、等距投影、6 档 LOD + 滞回、chunk 矩形、地形内容与解码器、长程邻接校验 | ✅ P1 |
| `territory` | 1/1 | 19 态 GRID_STATE、关系态推导、连地判定、占领 / 弃地结算 | ✅ P2 |
| `march` | 1/1 | 转折点路径与逐格展开、确定性插值、到达结算 | ✅ P4 |
| `chunk` | 1/1 | 鸟瞰三档分块聚合（20/40/60 格）、摘要契约 | ✅ P5 |
| `alliance` | 1/1 | 最小同盟（建盟 / 加入 / 退出，⛔ 无外交、无职位、无仓库） | ✅ P3 |

### `hexmap` 的三条易错点（都有专门用例钉住）

1. **六邻表的次序有语义**：下标+1 就是 `dirIndex`，美术边片与行军方向都按它取。
   ⛔ 不要重排（`SGZZ_NEIGHBOURS_EVEN/ODD`，钉的是原作 `move_util.lua:2-19`）。
   **环序是另一张表**（`SGZZ_RING_EVEN/ODD`，顺时针绕圈），六向描边按它取 `res_dir`。
2. **`sgzzStepsAlongDirection` 与 `sgzzCubeDistance` 是两个函数**：前者是原作
   `move_util.distance`（`Δrow==0 ? |Δcol| : |Δrow|`），**只在共线时正确**，只该喂给行军
   转折点展开；后者才是真·六边形距离。混用会让行军长度错得很隐蔽。
3. **`sgzzPos2GridRaw` 里 `y = -y` 必须发生在奇数行半格偏移之前**。顺序反了整体错半格，
   而且只有奇数行显形。

## 三、冻结内容（`data/maps/<mapId>/`）

由 `tools/sgzzmap-maps` 管线产出，**目检通过后**手工拷入；同时镜像到
`apps/Cocos/assets/resources/kits/sgzzmap/maps/<mapId>/`，两处逐字节一致由
`apps/server/test/sgzzmap-content.test.ts` 钉住。

| 文件 | 内容 |
|---|---|
| `terrain.bytes` | 1500×1500，8 字节大端头（rows/cols）+ 行主序 u8，共 **2,250,008** 字节 |
| `terrain.info.json` | 尺寸、`sha256`、9 类调色板（含 `passable`）、管线溯源（seed/密度/权威图） |
| `regions.json` | 135 个郡分区的统计 |
| `plate-lod4/5.png` + `.info.json` | 远档世界底图（已 warp 进等距世界空间）+ 世界包围盒元数据 |
| `atlas-lod0..3.png` + `.info.json` | 近档地块贴片图集（2:1 格，菱形四边中点取 UV）+ 逐格来源 |
| `minimap.png` / `minimap-mask.png` | 缩略图与菱形蒙版 |
| （长程邻接） | 关隘/渡口表。v1 为空 = 本图没有长程链接，⛔ 不是错误 |

当前内容包 `zhongyuan`（中原）：陆 68.9% / 海 9.7% / 图外 21.4%，**可玩陆地 1,549,931 格**。
陆内 平原 55.9%、森林 14.9%、丘陵 12.1%、山地 8.0%、水域 6.1%、湿地 2.9%。

**素材来历与边界**：源于 10 张 AI 生成的国风缩放概念图（仓外 `~/Downloads/maps/`，**原图不入库**，
只入派生产物）。⚠ 它们**不是同一张图的多级切片**——只有 Z08/Z09 画了整个世界，Z00/Z02/Z04/Z06 是
区域特写。因此世界轮廓与郡分区只能取自 Z09，陆内地形按 seed 程序化铺设。详见
`tools/sgzzmap-maps/README.md`。

## 四、加载约定（⚠ 这里有一条硬边界）

**kit 服务端代码 ⛔ 不得 import `node:*`**（`apps/server/test/kit-import-boundary.test.ts` 规则 ①：
裸说明符只允许 `@game/shared*`）。mmo 的灰盒内容包因同一条规则用 TS 字面量，我们沿用：

- 地形以 **shared TS 模块** `apps/shared/src/kits/sgzzmap/content/terrain.data.ts` 进两端
  （varint-RLE + base64，约 254 KB；由 `tools/sgzzmap-maps/emit-shared-terrain.py` 生成，⛔ 勿手改）。
  shared 零依赖 ⇒ 没有 `atob`/`Buffer`/`zlib`，解码器 `sgzzDecodeBase64` / `sgzzDecodeRle` 自带。
- `data/maps/<id>/terrain.bytes` 仍是**权威产物**，只留在 kit 数据目录（⛔ 不再多存一份二进制到
  Cocos 运行时）；一致性由 `sgzzmap-content.test.ts` 用 `sgzzTerrainToBytes` 逐字节 + sha256 钉住。
- `content/terrain.ts` / `content/links.ts`：**⛔ 无导入期副作用**，首次调用才解码；地形与区无关，
  缓存按**进程**一份（约 2.25 MB RSS 常量）。
- 取地形用展平 `Uint8Array` 的 O(1) 读。⛔ 不要照抄 slg 的 `terrainAt`（逐格线扫矩形表），
  1500² 格上跑不动。

## 五、RPC 域 `sgzzmap`（contractVersion 7）

| 路由 | 模式 | 说明 |
|---|---|---|
| `sgzzmap.view` | natural-write | 近景视窗；一次最多 64 chunk = 80×80 格；带回**自己**的在途行军 |
| `sgzzmap.tile` | query | 单格详情 |
| `sgzzmap.occupy` | idempotent-write | 连地闸 + 稀疏插入竞争重读 |
| `sgzzmap.abandon` | idempotent-write | 只有地主能弃 |
| `sgzzmap.alliance` | idempotent-write | 单路由 `{act: create/join/leave}`——三者锁同一组表 |
| `sgzzmap.marchDispatch` | idempotent-write | 出发格须自有、在途上限 3、扣框架货币 |
| `sgzzmap.marchRecall` | idempotent-write | 只能撤自己的、还在途的 |
| `sgzzmap.zoom` | query | 鸟瞰分块摘要，只读预聚合表 |

响应体积：框架硬上限 64 KB、幂等写结果上限 32 KB。`view` 把 uid / 同盟折叠进
`owners` / `alliances` 字典，地块行只带下标 ⇒ 400 行稳在 28 KB 以内。
⚠ 改 `domains/sgzzmap.ts` 的字节必须**同 commit** 抬 `contractVersion`，否则 codegen 拒绝生成。

#### 「回领地」：`viewer.home`

`view` / `tile` 的 `viewer` 带一个 `home`（我名下任意一块地的 cell，`-1` = 无地），页眉那颗按钮据此在
**回中**（回地图中心）与**回领地**之间翻转。

⚠ 这是可用性的**必需**件而非锦上添花：1500×1500 = 225 万格，关掉页面再进来视野落在地图正中，
自己的地可能在几百格外——没有这个入口就真的找不回去了。

取值走 `idx_owner (server_id, owner_uid)` **现查**（`readAnyOwnedCell`，cell 升序第一块），
⛔ 不落列：行军夺地 / 弃地都会让落列的值变陈旧，而现查永远是真的。
只在 `holding.tiles > 0` 时才查 ⇒ 无地的号零开销。

#### 近景窗的两条预算（2026-09-21 真机重放校正，⛔ 别再按手算改）

`SGZZ_MAX_QUERY_CHUNKS`（窗口尺寸）与 `SGZZ_MAX_VIEW_TILES`（响应行数）约束的是**不同的东西**，
早先把后者由前者推导，结果窗口被响应预算拖成 2×2 块（20×20 格），只盖了 LOD0 屏幕的四分之一 ——
而客户端把「没数据」显示成「无主」，真机上点哪都说无主。现在：

| 常量 | 值 | 由什么决定 |
|---|---|---|
| `SGZZ_MAX_QUERY_CHUNKS` | 64（8×8 块 = 80×80 格） | LOD0 实测可视半径 ±32 格，由 `sgzzmap-aoi.test.ts` 现场量 |
| `SGZZ_MAX_VIEW_TILES` | 400 | 每行 JSON ≈ 75 B，28 KB 目标 |

窗内非默认格超过 400 时服务端按 cell 升序截断并回 `truncated: true`，⛔ 不静默丢。
⚠ **已知 v1 限制**：LOD1 要 11×11 块、LOD2 要 16×16 块，都超预算 ⇒ 这两档的**领地叠色只覆盖屏幕中心**。
点选窗外的格会标 pending 并单独走 `sgzzmap.tile` 拿真相（面板显示「读取中…」），⛔ 不拿默认空格冒充无主。

### 占领闸

```
A. 地形不可通行 → SGZZMAP_IMPASSABLE（先于一切）
B. 邻居集 = 六邻 ∪ 长程邻接，裁边界、去重、按 cell 升序（= 锁序，⛔ 否则并发必死锁）
C. 目标 + 邻居一次 FOR UPDATE；再锁 holding
D. 零地块 + 出生区 + 目标无主 → 放行；⛔ 其余一律要 SGZZ_COMMON_CONNECT_STATE 里的邻居
E. tile 写 + holding ± + log(revision++) + receipt，同一事务
```

⚠ **友盟已落定的地⛔不连地，只有它正在攻占的才连** —— 这条不对称照搬原作，有专门用例。

## 六、进度

- ✅ **P0** 素材管线（`tools/sgzzmap-maps/`）：机检闸 `verify-redraw.py` 全绿，人工 `--overlay` 已目检。
- ✅ **P1** kit 骨架 + `hexmap` 面 + 冻结内容。
- ✅ **P2** SQL + 占领 / 弃地 + `territory` 面 + RPC 域：35 条 sgzzmap 用例绿
  （hex 11 / content 7 / territory 8 / service 8 + 真栈 int 4）+ 向量闸 6 条全绿；
  `db:bootstrap` 连跑两遍，第二遍新应用 0 个文件。
- ✅ **P3** 最小同盟：`alliance` 面 + 路由（contractVersion → 2）+ 两张表；
  UNION / GANG_MASTER 两态由此可达，真栈 int 用例证明「入盟后同一格立刻可连地」。
- ✅ **P4** 行军 + 结算 worker：`march` 面（转折点路径、共线硬校验、确定性插值）、
  `k_sgzzmap_march`、dispatch/recall 路由（contractVersion → 3）、`marchSettle` worker。
- ✅ **P5** 鸟瞰聚合：`chunk` 面（三档 20/40/60 格）、`k_sgzzmap_chunk`、`zoom` 路由
  （contractVersion → 4）；远档底图与缩略图资源在 P0 已入库。
- ✅ **P6** 客户端地图页：路由 `sgzzmapWorld`（首屏菜单「大地图」）。
  - 纯逻辑层（Node 可测、`logic-purity` 自动看守）：相机（拖拽/捏合锚点/惯性/钳位）、
    可视格模板、分层门控、菱形网格与画家序、六向描边引用计数、页模型（节流 + 代际围栏）、
    配色与 tonemapping 预补偿。
  - View 层：`SgzzMeshBatch`（创建/上传/扩容/销毁纪律只写一遍）+ `SgzzMapRenderer`
    （地表 / 网格线 / 领地 / 描边各一张合并 mesh）+ `SgzzmapWorldView`。
  - 地形直接消费 shared 内容模块 ⇒ **首帧即可绘制**，⛔ 不等资源加载、⛔ 不需要 BufferAsset 类型桩。
  - 远档底图 + 鸟瞰聚合色块 + 常显缩略图 + 行军线（简线/细线/部队位置）均已接上，见下。

### ⚠ 六邻接与菱形的四条边**对不上**

这套投影里六个邻格是 ±a、±b、±(a+b)（a=(TW,TH)、b=(0.5TW,−1.5TH)），
只有 ±a（`resDir` 1 / 4）正好共享菱形的 SW / NE 边，其余四个方向的边界是**斜穿**过去的。
所以描边 ⛔ 不能按「菱形的某条边」画，而是画在**本格与该邻格连线的中垂线**上、贴着菱形内缘，
六段合起来围成一圈。美术规范见 `~/Downloads/maps/美术规范-sgzzmap地图资产.md` §5。

### 分层门控：哪些层**真的**会建

`sgzzLayers.ts` 的 `SGZZ_LAYERS` 是唯一真源，每层带一个 `implemented`。
⚠ **未实现的层 `sgzzLayerVisible` 恒回 false** —— ⛔ 不许出现「门控说该建、渲染器根本没写」的两张皮：
真机重放发现 LOD0 没有网格线，就是因为表里 grid 写着可见而 `SgzzMapRenderer` 里一行都没有。

| 层 | 档位 | 状态 |
|---|---|---|
| `terrain` 地表菱形 | L0–L2 | ✅ |
| `grid` 网格线 | L0–L1 | ✅ 每格只画 NE/SE 两条边（每条边恰好一遍），线宽按 `屏幕像素 / scale` 折算 |
| `territory` 领地叠色 | L0–L3 | ✅ |
| `border` 六向描边 | L0–L2 | ✅ |
| `marchLine` / `marchDetail` 行军线 | L0–L4 / L0–L2 | ✅ |
| `plate` 世界底图 | L3–L5 | ✅ |
| `birdview` 聚合色块 | L4–L5 | ✅ |
| `decor` 摆件/地标 | L0–L1 | ⛔ **未实现**（等地块图集人工策展） |
| `banner` 目标旗 | L0–L1 | ⛔ **未实现**（等图集） |
| `label` 地名 | L0–L2 | ⛔ **未实现**（还缺地名数据） |

绘制序 = 兄弟序：地表(0) → 网格线(1) → 领地(2) → 描边(3)。
⚠ 网格线压在领地叠色**下面**：叠色是半透明的，压上面会把格线糊成一片。

### 客户端的五条硬规矩

1. **只有一台正交 UI 相机**（`docs/3d.md` 零实施）：一切经 `UIMeshRenderer` 走 2D UI 管线，
   深度**只有兄弟序**，⛔ 不要指望 z。
2. **⛔ 不写 `director.getScene().globals`**。slg 为抵消 tonemapping 去改场景全局
   （`docs/3d.md` §0.1 已点名为待迁移侵入），两个 kit 同时在场时 restore 会互相吃掉。
   本 kit 只**读**管线档位，由 `sgzzPalette.sgzzCompensate` 预补偿顶点色。
3. **领地叠色必须是合并 mesh**：原作每格一个节点，那在 Cocos 上会是成千上万个节点。
4. **平移只动父节点 transform**，⛔ 不重建网格；只有 chunk 集或数据变了才重建。
5. **代际围栏**：每次请求带 generation，回来对不上就整批丢弃，
   ⛔ 否则快速平移时迟到的旧响应会把新视野覆盖掉。

### 远档、缩略图与行军线

- **远档底图**：LOD3/4 用 `plate-lod4.png`（Z08），LOD5 用 `plate-lod5.png`（Z09）。
  底图的世界矩形由 `sgzzWorldBounds()` 算出，**⛔ 不读 `plate-lod*.info.json`** ——
  管线烘图时用的就是同一个函数（`tools/sgzzmap-maps/lib/projection.py` 逐式对齐，
  实测两边都是 `-48000,-48008 → 47984,0`）。少读一个资源、少一处可能漂移的真源。
  ⚠ 近三档的素材是**区域特写**，⛔ 不能当整幅底图，所以只烘了 lod4/lod5 两张。
- **鸟瞰色块**：一个分块在等距世界里是**平行四边形**（四角 = 四个角格各外扩半格），
  ⛔ 不要拿包围盒去画，那会让相邻块互相盖住、边界成锯齿。
  配色按**关系**（我盟/敌/无主），浓淡按主导同盟在这块里的占比；⛔ 仍然不给同盟分色相。
- **缩略图**：常显 HUD，纯 Sprite/Plate 拼的（⛔ 不建网格）。`minimap.png` 是正方、内容垂直居中，
  所以世界↔缩略图要带**上下各 1/4 的留白**；留白区点一下会夹回内容带，⛔ 不能算出图外的世界点。
  贴图没加载出来也留一块可点的底板，⛔ 不让缩略图整个消失。
- **行军线**：简线（起点直连终点，LOD ≤ 4）+ 细线（逐格，LOD ≤ 2）+ 部队位置标记。
  ⚠ 线宽按缩放**反算**（网格建在世界坐标里、由父节点统一缩放），不反算的话缩远了会细成头发丝。
  ⚠ 逐格展开按 `marchId` 缓存 + 分帧游标一帧只推一条，⛔ 不在一帧里把所有线全重建。

#### ⚠ v1 只画**自己**的行军

`sgzzmap.view` 的 `marches` 字段只带观察者自己的在途行军（≤ 3，走 `idx_uid`）。
⛔ 不带别人的：原作里敌军是经 AOI 实体流（`sc_enter_aoi_army` 那一套）+ 侦察才看得到的，
「把窗内所有敌军都发下去」既不忠实、也没有空间索引可依（`k_sgzzmap_march` 只存 `path_json`）。
等 AOI 实体流做出来再扩，那时是**加字段**而不是改语义。

### 真引擎证据

```bash
node tools/creator-preview/run.mjs sgzzmap --reuse --out /tmp/sgzzmap-run
```

八步重放（进入 → 近档 → **回领地** → 点选 → 占领 → 拉远 → 缩略图跳转 → 推回），落截图 + `report.json`。
⚠ **重放契约节点**：`sgzz-map-anchor`（不可见，只有 UITransform，位置 = 地图区正中）
与 `sgzz-header` / `sgzz-footer`。可点区由重放从它们的**页面坐标**实测算出。

⛔ 两条都踩过：① 按百分比猜（20%/68%，而 View 用 `min(150, h*0.14)` / `min(270, h*0.26)`）；
② 拿 `node.center.width/height` 参与运算——那是**设计单位**，而 `center.x/y` 是**页面像素**
（见 `tools/creator-preview/lib.mjs` 的 walk），混用照样差一格。
两次的症状一样：「回领地」之后点正中，选到的是家**旁边**那一格，占领于是被连地闸拒绝。
现在正中那一格不是我方地会直接判红，⛔ 不再悄悄降级成「拒绝」那一支。
⚠ 「回领地」那步同时是 `sgzz-territory` / `sgzz-border` 两层**唯一的真机证据**：dev 账号跨轮累积领地、
出生豁免早就失效，不先把镜头带到自己的地就永远看不到领地叠色与描边。
判据全部来自**渲染出来的节点与文本**，⛔ 不调 Logic、⛔ 不直接发 RPC。
纯函数部分（证据解析器、点击区、缩略图中心）由 `apps/server/test/creator-preview-tool.test.ts` 进门禁。

⚠ **本 kit 的渲染尚未经真引擎目视确认过** —— 上面这条命令需要 Cocos Creator 开着（预览 7456）
+ 本地栈与游戏服（`npm run dev`）。在那之前，保障只有纯逻辑用例 + 双 tsconfig + 抄自 slg 的 mesh 批次纪律。

⚠ **首次用 Creator 打开本仓**：`resources/kits/sgzzmap/**` 的 `.meta` 是脚本确定性铸的、
不是 Creator 导入出来的。Creator 会正式导入并可能改写 uuid —— 把它改完的 `.meta` 一并提交。
在此之前 `resources.load` 多半找不到底图/缩略图贴图，届时远档只剩鸟瞰色块、缩略图只剩可点底板
（两处都有兜底，⛔ 不崩）。

### 真机重放抓出来的四条（2026-09-21，673 条绿单测一条都没抓到）

单测钉的是我当时**写错的那个假设**，所以四条都只有真引擎能发现。全部已修 + 各有回归：

| # | 症状 | 根因 | 封印 |
|---|---|---|---|
| 1 | 点哪都说「无主」 | 近景窗只有 2×2 块且只往 min 方向扩，整体偏到相机左上 | `sgzzClampChunkRect` 对称收缩 + 「盖住 LOD0 整屏」一条 |
| 2 | 点「占领」顺手把选中格换成按钮底下那一格 | 手势绑在整页 root，页脚按钮的触摸**冒泡**上来被当成点选 | `sgzzInMapBand` 挡住地图区外的点 |
| 3 | 操作结果活不过 220 ms，屏幕上什么提示都没有 | view 轮询一成功就无差别清空 notice | `noticeKind`：只清「读出来的」提示 |
| 4 | 窗外的格显示成「无主」（撒谎） | `tileAt` 缺 key 即默认空格，`sgzzmap.tile` 路由从未接线 | `select` 标 pending + 单格补查 |
| 5 | **孤地永远加固不了**（回 `SGZZMAP_NOT_ADJACENT`） | 连地闸只看六邻，目标就是自己的地时也照查 | `sgzzOccupyRefusal` 先放行 `target.ownerUid === viewer.uid` |
| 6 | LOD0 **一条网格线都没有** | 门控表里 grid 写着可见，`SgzzMapRenderer` 里一行都没写（两张皮） | 补 `sgzz-grid` 层；层表加 `implemented`，未实现的层恒不可见；`nearLoaded` 判据把网格线算进去 |
| 7 | 己方地块**整格涂成不透明黄**，领地色看不见 | 描边把 `resDir` 丢了，每个边界方向铺**一整格**菱形；孤地 6 个方向叠 6 层 alpha 0.85 ⇒ 几乎不透明 | `sgzzBorderStripPoly`：逐 `resDir` 画贴内缘的**短条** |

⚠ 第 7 条是写美术规范、逐条核对事实时才发现的 —— 六向描边在真机上**从来就不是描边**，
而是把整格重涂六遍。之前几轮截图里「己方那格是黄的而不是蓝的」就是它，只是没人往这儿想。

⚠ 第 5 条是**重放自己差点放过的**：判据写成「地块是我方 + 叠色描边在」，而点选时它本来就是我方，
于是 RPC 被拒也照样判过（run 8：守军前后都是 1、提示在后面三步才浮出来）。
判据已改成必须证明这一发**真的生效**——加固要守军上涨、占领要从无主翻成我方。
⛔ 别再写「断言一个动作前后都成立的状态」。

### P6 余留

无。远档底图、鸟瞰色块、缩略图、行军线均已接上。
下一步的自然延伸：

- ~~「回到领地」入口~~ **已做**（`viewer.home` + 页眉按钮，见第五节）；
- AOI 实体流（敌军可见性）；
- 地块/摆件图集的人工策展（现在近景是按地形 id 顶色，图集已烘好但还没贴上去）。
