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

## 五、RPC 域 `sgzzmap`（contractVersion 1）

| 路由 | 模式 | 说明 |
|---|---|---|
| `sgzzmap.view` | natural-write | 近景视窗；一次最多 4 chunk = 400 格 |
| `sgzzmap.tile` | query | 单格详情 |
| `sgzzmap.occupy` | idempotent-write | 连地闸 + 稀疏插入竞争重读 |
| `sgzzmap.abandon` | idempotent-write | 只有地主能弃 |
| `sgzzmap.alliance` | idempotent-write | 单路由 `{act: create/join/leave}`——三者锁同一组表 |
| `sgzzmap.marchDispatch` | idempotent-write | 出发格须自有、在途上限 3、扣框架货币 |
| `sgzzmap.marchRecall` | idempotent-write | 只能撤自己的、还在途的 |
| `sgzzmap.zoom` | query | 鸟瞰分块摘要，只读预聚合表 |

响应体积：框架硬上限 64 KB、幂等写结果上限 32 KB。`view` 把 uid / 同盟折叠进
`owners` / `alliances` 字典，地块行只带下标 ⇒ 400 格也稳在 28 KB 以内。
⚠ 改 `domains/sgzzmap.ts` 的字节必须**同 commit** 抬 `contractVersion`，否则 codegen 拒绝生成。

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
    （地表 / 领地 / 描边各一张合并 mesh）+ `SgzzmapWorldView`。
  - 地形直接消费 shared 内容模块 ⇒ **首帧即可绘制**，⛔ 不等资源加载、⛔ 不需要 BufferAsset 类型桩。

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

### P6 余留（不挡用）

远档（LOD ≥ 3）目前只关掉近景网格，**底图与聚合色块的绘制尚未接上**
（服务端 `zoom` 与素材 `plate-lod4/5.png`、`minimap.png` 都已就位，缺的是 View 侧的一张
带贴图的四边形与缩略图浮层）；行军线的客户端绘制同理（`march` 面与逐格展开已在 logic 层）。

### 鸟瞰聚合的三条硬规矩

1. **随写更新，⛔ 不定时重算**：占领 / 弃地 / 到达 / 换盟都在**同一事务**里 upsert 三档聚合，
   ⛔ 不实时 `COUNT` 扫地块表（225 万格扫不动）。一条用例钉住「每档 Σtiles 恒等于有主地块数」。
2. **归零即删行**，⛔ 不留 `tiles=0` 的垃圾行。
3. **主导同盟平局按 id 升序**定，⛔ 不能随机——否则同一份数据两次请求画出两种颜色。

体积：最粗档（60 格）整张图 25×25=625 块，一次请求拉得完且 < 20 KB（有 int 用例实测）；
最细档（20 格）整图 75×75=5625 块 > `SGZZ_MAX_ZOOM_CHUNKS`(1024)，**拉不动**——
体积闸不是摆设，近档必须分窗。

### 行军的四条硬规矩

1. **服务端只存转折点**（`path_json`），逐格路径两端用同一个 `sgzzExpandPath` 展开。
2. **每段必须共线**：从 src 朝 `dirIndex` 走 `steps` 步要**恰好**落在 dest 上。
   ⚠ 六边形里「看着像直线」不等于是直线——把拐点抹掉当一段下发会被拒。校验在**域入口**就做，
   ⛔ 不让伪造路径进到事务里。
3. **到达时刻由路径重算**（`validateSgzzMarch`），⛔ 不信任线上传来的数字；仓储读出来也过同一道闸。
4. **结算⛔不走连地闸**：路径合法性在派遣时已闸过，到达是既成事实。

### worker 与懒结算

`marchSettle` worker 是主路径，懒结算（`view` 每次推进一批，积压超批次返回
`SGZZMAP_SETTLEMENT_PENDING`）是兜底。**必须有 worker**：行军到达会改**别人**的地块，
只靠懒结算的话，攻击方下线后防守方的地块状态会无限期停在过去。
一条用例钉住两条路径对同一 fixture 产出**逐字段相同**的世界状态。

```bash
KIT_WORKER_ZONES=0 npm --workspace @game/server run worker -- sgzzmap:marchSettle
```

⚠ 框架已经把 worker 的 `pass` 包在 `withKitWorkerTx` 里：⛔ 里面再开 `withKitTx` 会被直接拒。
worker 必须把自己的 tx 递给 `settleOnTx`，⛔ 不走自开事务的 `settleDueMarches`。
⚠ MySQL 预处理语句不接受 `LIMIT ?`（实测 `Incorrect arguments to mysqld_stmt_execute`），
`readDueMarches` 把 limit 钳成有界整数后内联。

### 同盟的三条硬规矩

1. **一人一盟**靠 `PRIMARY KEY (server_id, uid)`，⛔ 不靠应用层查重。
2. **盟标唯一**靠 `uk_tag`，`INSERT IGNORE` 撞键即 `SGZZMAP_ALLIANCE_TAG_TAKEN`，⛔ 不先查再插（TOCTOU）。
3. **盟主只有在盟里只剩自己时才能退**（退出即解散）——否则同盟会没有盟主、`GANG_MASTER` 态悬空。
   ⛔ v1 不做转让也不做踢人。

`alliance_id` 取「建盟那一刻的 revision」：该行已被锁住、每区唯一且单调。
⛔ 不用随机数（kit 代码没有 `node:crypto`），⛔ 也不用 AUTO_INCREMENT（per-zone 复合 PK 放不下自增列）。
同盟变更会把该玩家名下地块的 `owner_aid` 一次性改写（受 `SGZZ_MAX_TILES_PER_PLAYER` 封顶）。

## 七、运维

重跑内容包：见 `tools/sgzzmap-maps/README.md`，末步 `install-to-kit.py <mapId>` 装入双份并铸 `.meta`；
`install-to-kit.py <mapId> --check` 只校验不写。

⚠ **`db:bootstrap` 对已应用的迁移文件 sha256 fail-closed**（P2 起才有 SQL）。每阶段**追加**迁移没问题，
但**回头改**已 bootstrap 过的文件会按设计拒启。开发机恢复：
`DELETE FROM kit_migration WHERE kit_id='sgzzmap'` + `DROP` 掉 `k_sgzzmap_*`。
