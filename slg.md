# 大地图迁移为 `slg` kit（worldmap + march 两面）实施计划

## 0. 结论先行

「迁移」= **设计移植，不是代码搬运**。源包（zlbAllVersion）是别家引擎的 C++/Lua 逆向产物，代码与素材已经获得授权、但语言/引擎完全不同，一行都不能拷；要移植的是它的大地图架构：两级网格坐标、相机版本门控、环形扩张流式加载、滞回带、LOD 差分集合（added/removed）、逐层 LOD 隐藏开关、水面/内容层按相机距离连续混合的思想。

框架侧勘察结论（三路 explore 已核实）：

- **客户端全 2D**（UI 空间正交相机），无 3D/自由相机/手势缩放先例；但 snake 已验证「世界层节点 scale/translate 伪相机 + 动态网格合批（snakeQuadMesh）+ logic 纯度门无头测试」整条管线，大地图可直接站上这条管线。
- **kit 机制已完整落地**（K0 全部 ✅），arena 样本四件套（SQL 世界表 + 多 mode + api 面 + requires.kits）全覆盖；`docs/KIT.md` §3 的示例字面上就是 `id:"slg"`（worldmap/march/alliance 三 api 面）。
- **AOI 是最大空白**：无兴趣集/视野过滤/StateView 任何使用；但 snake 的 per-client 有序 delta 流 + 分块 baseline + checksum + 重同步载体现成，`docs/MMO.md` 已定「消息级 AOI」为方向，并把兴趣集 / `perSession` token / 有界出站队列定为**框架原语 MF5**（未实施）。（2026-09-09 审核补）本 kit ⛔ 不在 kit 内自建 AOI 内核，而是 **MF5 的第一个真实消费方**：kit 只提供 chunk 数学与兴趣矩形（shared 纯函数），差分与投递用框架原语；阶段 2b 的排期跟随 MMO.md §5。
- **mode 目录直读 Redis 是治理盲区，不是许可**（2026-09-09 审核补）：snake `rooms/modes/snake/runRewards.ts:25` import `core/infra/redisRoute` 的先例为真，kit 边界机检也确实只扫 `apps/server/src/kits/**`（`apps/server/test/kit-import-boundary.test.ts:17`），但 `rooms/modes/<kitMode>/**` 属 kit 所有权集，用它绕闸等于把接缝缺失当合法通道，且 MMO.md MF0（KIT K1 前置）就是要补这类边界。脏标记改走一个一行的框架小 PR：`core/infra/kitApi.ts` 再导出 `kKitShared`（现只导出 `kKitUser`，`kitApi.ts:59`）并给脏标记一个门面；⛔ 不在 `rooms/modes/slgWorld/**` import `core/infra/*`。
- **Lobby RPC 与 GameRoom 不互通**（无 RPC→live room 缝隙）；世界状态权威在 SQL，房间只是实时视图——这正是 arena 已验证的分工形态。

用户已拍板：2D UI 空间瓦片渲染 / `slg` kit（worldmap 首面）/ 首版含行军与 AOI 动态单位 / 地图数据静态配表。
（2026-09-09 追加拍板）阶段 2b（`slgWorld` 房 + AOI 动态单位）走路线 A：**等 MMO.md MF5 落地后再做**；阶段 1 与 2a 不依赖房间，先做。

### 0.1 与 docs/MMO.md 的关系（2026-09-09 审核补）

| 项 | 本 kit 口径 |
| --- | --- |
| 世界形态 | **SQL 权威 + 视图房**：世界状态在 `k_slg_*`，`slgWorld` 房只是 dropIn GameRoom 上的实时视图（arena 放大）。与 MMO.md 的 WorldRoom（内存权威 + 租约 + 控制权 + 检查点 + 交接）是两种形态，MMO.md §4.1.1 已登记 |
| 不需要的框架阶段 | MF2（persona / 资产主体：本 kit 用 uid 主体，`tx.debit` 旧 API 默认 account 语义，MF2 迁移时零变）、MF4（权威租约 / 控制权）、MF8（交接）、MF7 的检查点（行军位置是 `f(now)` 的确定函数，重启从 SQL 重放） |
| 依赖的框架阶段 | **MF5**（按会话裁剪同步：`InterestSet` / `diffAndEmit` / `perSession` token / 有界出站队列）——阶段 2b 的前置；**MF7 的 `kit.json.workers[]`**——无人在线时的行军到达结算 |
| 可见性 | 按 MMO.md D4 缺省：名册不进 Schema；本 kit 的 `players` map 只放 id / name（是否全区公开名册由产品拍板），视口只在服务端会话表 |
| 登记 | MMO.md §6.7 把本 kit 登记为 MF5 原语的第二消费方（tile / army 兴趣集与 mmo 的 entity 兴趣集共用同一原语）；本 kit 落地后在 MMO.md §12 回写一行 |
| 与 mmo kit | 两个独立 kit（KIT.md v0 不做 kit-on-kit）；共用的只有框架原语 |

## 1. 总体架构（源游戏机制 → 本框架落点对照）

| 源游戏设计（zlbAllVersion） | 本框架落点 |
| --- | --- |
| 两级网格：Tile（流式单元）/ Grid（玩法格），`id=(x+30)\|((z+30)<<16)` | shared 零依赖数学库 `apps/shared/src/kits/slg/api/worldmap/`：格/chunk 两级坐标、id 打包（偏移量按本图尺寸定）、视口→可见矩形→chunk 矩形换算 |
| 环形扩张加载器 + 滞回带 + 相机版本门控 + 4 格外扩 margin | 客户端 logic 层纯 TS 流式器 `apps/client/src/kits/slg/logic/mapStreamer.ts`（吃纯度门，无头全测） |
| 视口六档 LOD（阈值 187/320/600/1120/2080，≈1.8 倍几何级数）+ 俯瞰分块六档（grid 10..60） | 适配为 2D 缩放逐档表（常量进 shared，v0 四档），越档发事件、按档建销内容层 |
| native 差分 API（total/added/removed 三表，有序归并求对称差） | 客户端流式器对 chunk 集做 added/removed（shared 纯函数）；服务端只算「视口 → 兴趣 chunk 矩形」（同一套 shared 数学），**每会话的 added/removed 差分与投递交框架 MF5 `InterestSet` / `diffAndEmit`**（2026-09-09 审核改，⛔ kit 内不自建） |
| 逐层 LOD 隐藏开关表（map_layer_lod：军队/行军线/格子线/资源地…） | 客户端内容层注册表：每层声明 `hideAtLod`，LOD 事件驱动显隐 |
| AOI：LEGACY_AOI / ZOOM_AOI 三级，按 chunk 批量找/清 AOI 对象 | 服务端 `slgWorld` 房内：会话上报视口（中心+档）→ 兴趣 chunk 集 → tile/army 的 enter/update/leave 增量流 |
| 世界状态（占地）在 Lua 层，SQL 无关 | **SQL 是权威**：`k_slg_tile` per-zone 稀疏表（只存非默认格，无主格不落行）+ Lobby RPC 幂等写（arena 模式原样放大） |
| 行军线/军队层 | `k_slg_march` per-zone 表 + 确定性位置函数 `pos=f(now, 行军令)`（免 checkpoint）+ AOI 增量流下发 |
| 地形贴图/PCG | 静态配表：地形类型由 excel→JSON 配表给出，输出到 kit 命名空间 |

## 2. 数据与同步模型（先把最难的想清楚）

- **地块**：`k_slg_tile(server_id, tile_id, owner_uid, guard_power, updated_at)` per-zone 稀疏表（`server_id+tile_id` 主键）。地图总量可配（v0 默认 200×200 = 4 万格），只有被占/被改的格才有行 → 避开万行 INSERT 种子。（2026-09-09 拍板，落实 S2）**并发竞争契约 = 唯一键插入 + 冲突事务内重读**：占无主格用裸 `INSERT` 撞 `(server_id,tile_id)` 主键；撞唯一键即在本事务内重读该行，按**实际获得的状态**走加固 / 削守备分支；地块结果 + 回执 + 奖励 intent 同一事务原子提交。⛔ 不依赖 `SELECT … FOR UPDATE` 对不存在行的间隙行为，⛔ 不把 `withKitTx`（READ COMMITTED）当作已处理竞争。请求级幂等另有回执表 `k_slg_capture`（同 opId 重放原样回读，照 arena `k_arena_attempt`）。
- **行军**：`k_slg_march(server_id, march_id, uid, from_tile, to_tile, depart_at, arrive_at, status, …)` per-zone。位置是 `f(now)` 的确定函数 → 房间崩溃/重启从 SQL 重放即恢复，**不需要框架还没有的 checkpoint 接缝**；到达结算用懒结算（任何触碰该行军/该地块的 RPC 或房间 tick 扫描到 `arrive_at<=now` 即结算写库）。懒结算**必须**带回执表 `k_slg_march_receipt`（并发 RPC 结算同一行军会双写，幂等靠回执 + `withKitTx` 内事务，照 arena `k_arena_attempt`）；无人在线时的到达结算登记为 MMO.md MF7 `kit.json.workers[]` 落地后接 worker（S6：worker 须用租约保护的受限 KitTx，见 §6），落地前是已知取舍（写进 README）。（2026-09-09 拍板，落实 S3）**守备制规则包**：同目标事件按 `arrive_at` 升序、并列再按 `march_id` 升序逐条结算；到达 = 交战——无主格直接占领，敌格削 `guard_power`、归零夺取（改主、power=1）；撤回在 `arrive_at` 前任意时刻可发起、已到达不可撤；派遣 / 撤回 / 懒结算共用 kit API 单一写入口，RPC、视图房、未来 worker 只调该入口；锁顺序冻结为 tile → march → receipt → 经济/effect，批次有界。
- **RPC→房同步**（2026-09-09 拍板，落实 S1）：**变更日志表 + 游标**。`slg.*` 写端点、房内懒结算与未来 worker 共用同一 kit API 写入口；每次世界状态变更在**同一事务内**追加 `k_slg_tile_log` / `k_slg_march_log`（per-zone 单调 revision；删除 / 结束有 tombstone 记录；提交顺序 = revision 序）。每个消费方（`slgWorld` 房 / worker）自持游标按 revision 增量消费，并定期向 SQL 对账；Redis 脏标记（经 kit-api 门面，待 §0 的小 PR）**只做低延迟提示，不是正确性来源**；日志有保留窗口，游标落后出窗即走 baseline 重建。⛔ 不在 websocket 端点里 import 房间；⛔ 不在 `rooms/modes/slgWorld/**` import `core/infra/*`。
- **AOI 载体**（2026-09-09 审核改）：消费 MMO.md MF5 的框架原语——兴趣集 `InterestSet`（本 kit 的兴趣集 = 视口 chunk 矩形，chunk 数学与矩形计算是 shared 纯函数）、`diffAndEmit` 产出 enter / update / leave、`defineS2C(..., { perSession: true })` 声明 `tilesEnter/tilesUpdate/tilesLeave`、`armiesEnter/Update/Leave`（框架对 perSession token 的 `broadcastS2C` fail-closed）、只含兴趣集的分块 baseline + checksum + `baselineRequest` 重同步、有界出站队列。C2S `mapSubscribe{center, lod}` 是本 kit 的 token。世界格子**不进 Colyseus Schema root**，root 只放房级摘要 + `players` map（只有 id / name，⛔ 无视口摘要，见 §0.1）。⛔ kit 内不自建第二套差分 / 投递。
- **房间形态**：`slgWorld` mode，dropIn profile，`filterBy(["sId","mode","profile"])` 每区一房**只在未满员时成立**（满员 `joinOrCreate` 开第二房，`apps/server/src/websocket/loader.ts:60`；两房各自缓存与轮询，正确性靠 SQL 权威，验收要补「不同房互见」）；manifest `maxPlayers` v0 定 100——上限来自各 mode 自己的 manifest（`apps/server/src/rooms/GameMode.ts:299-306`，schema 上限 1024），⛔ 不需要改任何框架常量（`MAX_PLAYERS = 4` 只是未进 catalog 的兜底，snake 已用 8）；验证项改为 `patchRate = 50`（`GameRoom.ts:289`）下 100 人 Schema patch 开销，建议复用 MMO.md MF1 的基准台。⚠ GameRoom 未设 `autoDispose`（默认 true）：无人即销毁，仓内唯一零客户端保活是 LobbyRoom；重建成本 = 全量拉 active 行军。（2026-09-09 审核补）

## 3. 阶段划分

### 阶段 1：kit 骨架 + worldmap 面（静态世界 + 地图页）——可独立验收

**登记与单源**

1. `apps/kits/slg/kit.json`：`schemaVersion:1`、`id:"slg"`（宿主自有，无 `version`）、`api:{worldmap:{version:1,minSupported:1}}`、`domains:["slg"]`、**阶段 1 不登记 `modes`**（`gameplays/` 目录 2b 再加，codegen 对 `modes≡gameplays/ 子目录集` 有双向断言）、`sql.files:["sql/001-init.sql"]`、`sql.tables:[{name:"k_slg_tile",zone:"per-zone"},{name:"k_slg_capture",zone:"per-zone"},{name:"k_slg_tile_log",zone:"per-zone"}]`、`userKeys:["stats"]`、entry/routes/menu/viewDirs/views/owners 按 arena 形状。
2. `apps/kits/slg/sql/001-init.sql`：`k_slg_tile`（地块，稀疏）+ `k_slg_capture`（占领回执，照 `k_arena_attempt`）+ `k_slg_tile_log`（S1 变更日志：`(server_id, revision)` 主键 + tile_id + op 类型 + payload + tombstone）三张表；server_id 进主键，遵守 lint 白名单。
3. `apps/kits/slg/README.md`：定义了什么、插件怎么用 api 面（照 arena README 格式）。

**shared（零依赖，铁律 4）**

4. `apps/shared/src/kits/slg/api/worldmap/index.ts`：坐标/id 打包、chunk 换算、LOD 档表常量（如 `SLG_MAP_W/H`、`SLG_CHUNK_SIZE=16`、`SLG_LOD_SCALE_THRESHOLDS`）、`ISlgTile`、校验器、`canCaptureTile` 式纯规则函数。常量⛔ 不手抄进别端（铁律 6）。
5. `apps/shared/src/protocol/lobbyRpc/domains/slg.ts`：`SlgRpc = { MapTiles:"slg.mapTiles", TileCapture:"slg.tileCapture" }`，req/res + fail-closed validator + errorCodes `["SLG_TILE_TAKEN"]`；`slg.mapTiles` 入参 = chunk 矩形（分页上限），响应 = 稀疏行集。
6. `apps/server/test/lobbyRpcVectors/slg.ts`：每路由向量。

**服务端**

7. `apps/server/src/kits/slg/`：`tileRepo.ts`（内部 SQL）、`api/worldmap/index.ts`（`readTiles(sId,rect)`、`captureTile(uid,sId,tile,opId)`——写路径按 §2 拍板的 S2 契约：裸 INSERT 撞主键 → 冲突事务内重读 → 加固/削守备分支；地块结果 + `k_slg_capture` 回执 + `k_slg_tile_log` 日志 + 奖励 intent 同事务提交）、`host.ts`。⛔ 只 import `core/infra/kitApi` + `@game/shared*`（kit-import-boundary 机检）。
8. `apps/server/src/websocket/slg/{mapTiles,tileCapture}.ts`：薄壳端点（`currentZoneId()` + api 调用 + RpcFault 映射）。

**配表（静态地形）**

9. （2026-09-09 审核改）v0 由 kit 直接带冻结 JSON：`apps/kits/slg/data/terrain.json`（服务端读）+ `apps/Cocos/assets/resources/kits/slg/terrain.json`（客户端读），两条路径都在 kit 推导集内（`apps/server/tools/plugin/ownership.ts:269` / `:297`），与 MMO.md「静态内容 = 冻结 JSON 内容包」同口径。excel 管线：`tools/excel-to-json.mjs` 的 `--output` / `--client-output` 存在（`:85-88`），但源表只登记了 `items.xlsx`（`:47-49`），加 `slg_terrain.xlsx` 要改宿主脚本（kit 推导集外）——列为可选后续项，不在阶段 1。

**客户端（全部走已有管线）**

10. `apps/client/src/kits/slg/index.ts`（`createPluginModule`）、`api/worldmap/index.ts`（`fetchMapTiles(lobbyRpc)` + 展示助手，⛔ 不 import cc）。
11. logic 层（纯度门保护，可无头全测）：
    - `logic/mapCamera.ts`：pan + **pinch 双指缩放**（全新，纯数学：两指距离比→scale，锚点保持）+ 惯性；scale→LOD 分档 + 越档事件。
    - `logic/mapStreamer.ts`：源游戏 §6 的 2D 移植——可见矩形、外扩 margin、滞回带、环形扩张、chunk 集 added/removed 差分。
    - `logic/mapLayers.ts`：内容层注册表 + `hideAtLod` 显隐规则；地块占有色块层、格子线层。
12. view 层：`view/SlgMapView.ts` + `.view.json` sidecar（`kind:"cocos"`、`interactive:false` + scrim 吞触摸，照 ArenaBoardView）；世界根节点 scale/translate；瓦片渲染**用 snake 动态网格合批**（每 chunk 一张 dynamic mesh，⛔ 不用每格一个 Sprite）；输入走全局 `input.on` + 多点路由（SnakePointerRouter 先例）；地形贴图 `resources.load("kits/slg/terrain")`。
13. kit.json 登记 `route {id:"slgMap", view:"SlgMap"}` + menu 一条（kind:"route"）。

**阶段 1 验收**：`codegen:plugins` → `sync:shared` → `sync:client` → `db:bootstrap`（应用 k_slg_tile）→ `npm run typecheck` / `test:client` / `plugin -- test slg` → `verify:all` 绿 → Creator 预览实证：地图页打开、平移/缩放四档 LOD、占领一格写库并重读。

### 阶段 2：march 面（2a，可先做）+ `slgWorld` 房 / AOI 动态单位（2b，等 MF5）

（2026-09-09 审核补 + 拍板）本阶段拆两半：**2a = 第 16–19 条 + S5 登记**（`k_slg_march` + `k_slg_march_receipt` + `k_slg_march_log` 三张表与 kit.json 的 `api.march` / `sql.files` / `sql.tables` 增量同批登记、march 面、`slg.marchDispatch/marchRecall` RPC、按 §2 冻结的守备制规则包做幂等懒结算、向量与测试），不依赖房间，可紧接阶段 1；**2b = 第 14、15、20–24 条**（`slgWorld` mode 与客户端四件套、消费 MF5 原语的兴趣集接线、地图页接房间、军队 / 行军线层），等 MMO.md MF5 落地后开工。**MF5 / MF7 框架工作由本仓按 MMO.md §5 排期自行实施（2026-09-09 拍板），本 kit 是 MF5 的第一个真实消费方；2b 开工条件 = MF5 落地且含 §6 S4 的 GameRoom 消费路径与名册策略验收。**

**玩法单源**

14. `apps/kits/slg/gameplays/slgWorld/{manifest.json,state.json}`：manifest（dropIn profile、`maxPlayers:100`、`wireExposed` 默认）；state root 只放 tick/phase/matchId/players（房级摘要），players 只放 id/name（⛔ 视口摘要移除——视口只驻服务端会话表，见 §6 S4；名册可见性 v0 暂接受 codegen 默认 id/name 同房可见，产品拍板后随 MF5 的 D4 策略收口）。kit.json 补 `modes:[{id:"slgWorld",constantName:"SlgWorld"}]`（`api.march` 与 SQL 登记已在 2a 完成，见第 16 条）。
15. `apps/shared/src/gameplays/slgWorld/wire.ts`（手写真源）：C2S `MapSubscribe{chunkAnchor,lod}`、`MapUnsubscribe`、`BaselineRequest`（rateCost）；S2C `BaselineBegin/Chunk/End`（checksum）、`TilesEnter/Update/Leave`、`ArmiesEnter/Update/Leave`——消息族形态照 snake wire。改 wire 一字节必须 bump `modeVersion`。（2b）S2C 全部以 MF5 的 `defineS2C(..., { perSession: true })` 声明，baseline 族由框架原语注入 token，⛔ 不自写分块 / checksum 逻辑。

**服务端**

16. `apps/kits/slg/sql/002-march.sql`：`k_slg_march` + `k_slg_march_receipt` 回执表 + `k_slg_march_log`（S1 变更日志，与业务写同事务追加）；追加式，⛔ 不改 001。**同批完成 S5 的 kit.json 登记**：`api.march:{version:1,minSupported:1}`、`sql.files` 追加 `sql/002-march.sql`、`sql.tables` 追加三张表（均 per-zone）——不为登记 march 面提前制造空 mode。
17. `apps/shared/src/kits/slg/api/march/index.ts`：行军令类型、路径/速度/到达时刻纯函数（`positionAt(order, now)`）、校验器。
18. `apps/server/src/kits/slg/`：`marchRepo.ts`、`api/march/index.ts`（`dispatchMarch`（`tx.debit` 扣体力/粮食 + 写行军 + enqueueEffect，照 arena `boostTile` 形态）、`recallMarch`、`settleDueMarches`）。
19. `apps/shared/src/protocol/lobbyRpc/domains/slg.ts` 增量：`MarchDispatch/MarchRecall` 路由 + errorCodes + contractVersion bump；websocket 端点两个薄壳；向量 sidecar 同步补。
20. `apps/server/src/rooms/modes/slgWorld/index.ts`：GameMode——roster dropIn、`createPlayer`、commands（MapSubscribe 等）、`onStep` 低频扫描（脏标记 → 增量拉 SQL → 逐会话兴趣集差分 → per-client 有序 S2C）；AOI 接线 `./aoi.ts` 只做「视口 chunk 矩形 → 兴趣集」（shared 纯函数），差分与投递交 MF5 的 `InterestSet` / `diffAndEmit`（2b，⛔ 不自建差分内核）；脏标记读写经 kit-api 门面（§0 小 PR），⛔ 不 import `core/infra/*`。**先读 SQL 全量 active 行军进内存，房即该区行军缓存；结算写库经 kit-api**。
21. Redis 新 key 登记进契约表/登记点（SERVER.md §13，铁律 8）。

**客户端四件套**

22. `apps/client/src/net/rooms/SlgWorldRoom.ts`（adapter：joinOrCreate 带 sId/mode/profile、typed capability、重连续发）；`apps/client/src/logic/rooms/slgWorld/`（snapshot buffer 重组/delta 应用/重同步——照 SnakeSnapshotBuffer）；`apps/client/src/gameplay/modes/slgWorld/index.ts`（装配）。
23. 地图页接房间：视口变化→`MapSubscribe`；`tilesEnter/…`→地块层增量刷；军队层（图标 Sprite 池 + 位置插值）与行军线层（动态网格折线）按 `hideAtLod` 显隐。表现件挂法设计点：v0 由 SlgMapView 直接消费 SlgWorldRoom adapter（不走 gameplay presentationHost），codegen 对客户端四件套是**硬性要求**（`apps/server/tools/gameplay-codegen/lib.ts:445-471`：`apps/client/src/gameplay/modes/slgWorld/index.ts` 必须存在并导出 `createGameplayModule`；`rooms/modes/` 子目录集合与 canonical 集合精确相等），2b 必须同批补齐服务端 `index.ts` 与客户端四件套。
24. `apps/client/test/slg-*.test.ts`：地图数学/流式器/LOD/AOI buffer 无头测试；`apps/server/test/slg-*.test.ts`：repo/api/RPC/mode/AOI 差分（arena/snake 测试形态）。命名吃 `<id>-*` 所有权前缀。

**阶段 2a 验收**：`marchDispatch` 扣资源 + 写行军 + 回执幂等（同 `clientReqId` 重放不双写）；`arrive_at<=now` 的行军由任一触碰 RPC 结算且并发结算只生效一次；`plugin -- test slg` / `verify:all` 绿。

**阶段 2b 验收**（等 MF5）：两客户端进同区房互见行军，**不同房（满员后第二房）也互见**；dispatch→对方 2s 内看到军队出现并移动；到达后地块易主、双方收到 tilesUpdate；视口外的会话收不到该 chunk 的 tiles / armies（perSession 零泄露）；断线重连走 baseline 重同步；`verify:all` 绿。

## 4. 全局验证动线（每阶段必跑）

```
npm --workspace @game/server run codegen:plugins   # 改 kit.json/domains/向量后
npm --workspace @game/server run codegen:gameplays # 改 gameplays/ 后（阶段 2）
npm run sync:shared && npm run sync:client         # 镜像刷新（铁律 2）
npm --workspace @game/server run db:bootstrap      # SQL 迁移（阶段 1 起）
npm run typecheck && npm run test:client
npm --workspace @game/server run test
npm --workspace @game/server run plugin -- test slg
npm run verify:all                                  # 提交闸
```

cc 桩缺口按需补 `apps/client/cc-stub.d.ts` / `client-test-stubs.d.ts`（`clientTypecheckConfig.test.ts` 守门）。Creator 本地预览实证两阶段各做一次（真引擎渲染 + 资源）。

## 5. 风险与开放项

- **maxPlayers=100 的 patch 开销无实证**（2026-09-09 审核改：上限本身合法、来自 manifest，无需改常量）：Schema root 极小、重数据走消息，预期可控；列为实证项（`patchRate = 50` 下 100 人），建议复用 MMO.md MF1 基准台；不达标则降档或分片。
- **AOI 依赖框架 MF5**（2026-09-09 审核补 + 拍板）：MF5 / MF7 由本仓按 `docs/MMO.md` §5 排期**自行实施**（独立排期、先于 2b）；2b 排期跟随 MF5，本 kit 是 MF5 的第一个真实消费方，MF5 的夹具验收不等于本 kit 验收（S4：MF5 验收须含 GameRoom 消费路径与名册策略）。
- **懒结算的边界**：房内 tick 扫描覆盖在线期；全房无人时到达的行军靠「下次 RPC/进房触发结算」——写进 kit README 的已知取舍。
- **compute 池不载周期任务**：v0 不需要（懒结算 + 房 tick 足够）；若将来加采集/屯田周期结算，需独立编排（登记为后续项）。
- **kit-api 未再导出 `kKitShared`**（2026-09-09 审核改）：提一个一行的框架小 PR（`kitApi.ts:59` 再导出 + 脏标记门面），⛔ 不用 mode 目录绕闸；PR 合入前 2b 本就未开工，不阻塞 1 / 2a。
- **版权红线**：⛔ 不拷 zlbAllVersion 的任何代码/素材/数值表文件；LOD 阈值等数值自行调参定标（可「参考其约 1.8 倍几何级数」的设计思想）。
- **文档回写**：落地后更新 `apps/kits/slg/README.md`、根 `AGENTS.md` 速查清单、`docs/KIT.md` §9 实施状态（kit 机制文档的状态回写点）；`docs/MMO.md` §12 回写一行（MF5 第二消费方落地）。

## 6. 第二轮审阅意见（2026-09-09，待落实）

> 本节是对现有计划与仓内源码的静态复核，所有条目均为**审阅建议 / 待落实**，不表示实施、测试或验收完成。本轮未运行真实 MySQL 并发、Redis 故障、进程崩溃或多房同步实验。保留正文及既有路线 A：阶段 1 / 2a 先行，阶段 2b 等 MF5；下列建议不新增已拍板决策。
>
> 与[本轮审阅的 MMO 基线（另一工作树）](/Volumes/KimData/work/gameStarterKit/docs/MMO.md) §13 的第二轮审阅互相对应：S1 ↔ R3（SQL 同步与补偿），S4 ↔ R1 / R2（GameRoom 适配与名册），S6 ↔ R4（worker 契约）。正文中的旧描述须在后续设计消化时逐条修订，不能因为本节已登记就视为已修复。

### S1：SQL 提交、脏标记与增量游标尚未形成可恢复同步协议

**原文定位**：§0 的「一行框架小 PR」、§2「RPC→房同步」与「房间形态」、阶段 2 第 20 条及 2b 的「不同房互见 / 2s 内出现」验收。

**风险**：`COMMIT → Redis HINCRBY` 之间退出或 Redis 写失败，会留下已提交 SQL 而没有脏标记变化；仅在标记变化时回源的房可能持续漏更。标记只写在 websocket 端点，也没有覆盖房内懒结算及未来 worker。即使通知成功，`updated_at > last` 仍可能漏掉同时间戳更新、较早打时间戳却较晚提交的事务；恢复默认而删除的稀疏格、结束后退出 active 查询集的行军也需要明确的移除信号。arena 的 `selectBoard` 每次整板读取（`apps/server/src/kits/arena/boardRepo.ts`），不是该增量协议的现成证明；`kitApi.applyKitEffect` 的补发只覆盖已入 outbox 的 effect intent，不能自动补这个新标记。

**建议（待落实）**：在领域写事务内维护持久修订记录或变更日志，让 RPC、房和 worker 共用该写入口；每房保有独立读取进度并定期向 SQL 对账，Redis 只作低延迟提示，不能是唯一正确性来源。v0 可评估「持久修订变化后按有界范围重建快照」；如选日志增量，须明确提交顺序、删除 / 结束记录、分页及 baseline 与游标接续、日志保留与缺口重同步。时间戳或普通自增 ID 均不天然等于提交顺序。修订、快照的读取一致性与并发扫描的合并规则也应冻结，避免旧查询结果覆盖新投影。通用门面、租约或可靠通知缺口走框架 PR，`k_slg_*` 领域表与状态规则留 kit；不能把再导出 `kKitShared` 等同于完成可靠同步。具体方案尚待选择。

**验收建议**：注入 SQL 提交后、Redis 标记前退出；Redis 不可用；同毫秒并发写；早写晚提交；地块删除及行军结束；跨分页并发更新。两房各自恢复到 SQL 当前状态，且任一房不消费或清除另一房所需进度。用重建成本、对账周期和投影积压实测 2b 的延迟目标；故障期的恢复窗口单列，不把正常期「2s」直接当故障保证。

### S2：稀疏空地块的并发占领需要独立于请求幂等的竞争契约

**原文定位**：§2「地块」、阶段 1 第 7 条「回执可加 / 照 arena」及阶段 1 的占领验收。

**风险**：相同 opId 重放与两个不同 opId 争同一格是两类问题。`withKitTx` 使用 READ COMMITTED（`apps/server/src/core/infra/kitApi.ts`）；对不存在的稀疏行做 `SELECT … FOR UPDATE`，不能据此假定两个事务已经串行。直接照 arena 的「缺行返回默认值 → 无条件 upsert」形态放大，可能让两个请求都按无主格计算并发奖，后写者覆盖前者；每请求一条回执不能消除这种不同操作之间的竞争。

**建议（待落实）**：阶段 1 的写入前先确定请求回执、结果重放与 payload 冲突口径，不能仍以「可加回执或靠 outbox」留空；地块竞争另采用唯一键条件插入、冲突后整事务重读 / 重试，或按需建立可锁定行等方案。无论选择哪种，规则计算必须依据该事务实际获得的有效状态，地块结果、回执与奖励 intent 原子提交；稀疏表允许保留什么中性行也要与此一致。锁竞争重试仅包无事务外副作用、可幂等重放的事务体，不把 `withKitTx` 当作已自动处理全部竞争。

**验收建议**：真实 MySQL 下两用户、不同 opId 同时占同一不存在格，以及同时操作已有格；断言地块结果符合冻结的竞争规则、奖励与成功回执一致。另测同 opId 并发 / 超过 RPC 缓存期重放、冲突载荷、唯一键冲突与事务回滚；不能只用串行假 repo 证明并发正确。

### S3：行军回执不能代替同目标事件顺序和撤回裁决

**原文定位**：§2「行军」、阶段 2a 第 16–19 条、`settleDueMarches` 与「任一触碰 RPC 并发结算只生效一次」验收。

**风险**：每支军队只结算一次，不代表多支军队作用于同一地块时结果正确。两房 / 两 RPC 扫描顺序不同，可能先结算较晚到达者；撤回与到达并发也可能各自依据过期状态通过。仅新增 `k_slg_march_receipt`，没有定义状态转换、目标竞争、锁顺序与结果裁决；无人在线后集中补算时，这些问题仍会出现。

**建议（待落实）**：2a 写路径开工前冻结行军状态机、服务端结算操作身份、撤回截止与到达裁决口径，以及同目标的事件顺序（例如按 `arrive_at` 再以稳定 ID 排序，具体规则待定）。派遣 / 撤回 / 懒结算共用 kit API，RPC、视图房和未来 worker 只能调用该入口；在处理某事件前按既定规则处理该目标更早的待结算事件，而非只排序当前扫描批次。定义地块、行军、回执及涉及钱包的统一锁顺序与有界批次；状态 / 地块变更、回执、扣返资源或奖励 intent 在同一事务提交，外部提示在提交后处理并服从 S1 的恢复契约。

**验收建议**：同目标先后 / 同时到达、反向扫描、两房同时结算、撤回与到达竞争、断线后补算、事务中崩溃及回执提交后重试。按冻结规则得到同一结果，不重复扣返资源或奖励；失败事务不遗留半完成地块或行军状态，批量补算有预算且不会长期占住 RPC。

### S4：MF5 必须验证 GameRoom 消费路径，名册与视口描述仍待收口

**原文定位**：§0.1「可见性」、§2「AOI 载体」、阶段 2 第 14 / 15 / 20 条；对应 MMO 审阅 R1 / R2。

**风险**：路线 A 等待的是可被 `slgWorld` 的 dropIn GameRoom 消费的 MF5，而非只有 WorldRoom 与其客户端 adapter 接入成功。当前生成器要求 root 有 `players` map 且值含 id/name（`apps/server/tools/gameplay-codegen/stateRenderer.ts` 的 `ROOT_LIFECYCLE_FIELDS` / `PLAYER_LIFECYCLE_FIELDS`），GameRoom 也把参与者写入该 map；仅用 `perSession` 消息不能隐藏 root Schema 里的名册。§0.1 一面写「名册不进 Schema」，一面又保留 id/name，尚未解决冲突；第 14 条还残留「视口摘要」，与前文仅服务端持有视口直接矛盾。公开名册尚未获产品批准，不能视为默许例外。

**建议（待落实）**：将 GameRoom 与客户端 adapter 的消费路径及 codegen、exact validator、baseline、背压 / 重同步一并列入 MF5 的框架验收，再由 SLG 接线验证；框架阶段同时说明如何满足 D4 的名册策略，必要的生成器 / 房壳接缝由框架修改，不以 kit 绕行。后续正文应移除第 14 条视口摘要；视口只驻服务端会话表，不广播。id/name 是否公开及何种范围公开须另行明确；本节不批准公共名册，也不擅定实现方案。

**验收建议**：SQL 视图房使用正式 MF5 API 建立完整客户端连接并收发；检查实际 Schema patch、baseline 与消息流，超视距会话拿不到未授权名册、视口和实体字段。保留同房 / 不同房互见、慢客户端、重连、兴趣集改变测试；WorldRoom 夹具通过不能替代这一组 GameRoom 消费证据。

### S5：2a 的 manifest 登记不能随 mode 一起延后到 2b

**原文定位**：阶段 1 第 1 条只登记 worldmap 与 `001-init.sql` / `k_slg_tile`；阶段 2 拆分说明、第 14 条和第 16–19 条。

**风险**：2a 宣称可以独立交付 march API 与 SQL，但 `api.march` 目前写在属于 2b 的第 14 条，`sql.files` / `sql.tables` 的追加也未列入 2a。若只执行第 16–19 条，文件存在不等于包能力和迁移已登记，干净安装与 bootstrap 无法据此证明完整交付。

**建议（待落实）**：把下列 manifest 增量明确归入 2a：`api.march`、`sql.files` 中的 `sql/002-march.sql`、`sql.tables` 中的 `k_slg_march` 与 `k_slg_march_receipt`（均声明 per-zone），以及实际需要的回执 / 修订表登记。`modes`、`gameplays/slgWorld/`、wire 与房间客户端四件套仍留在 2b；不为登记 march 面提前制造空 mode，也不改变路线 A。

**验收建议**：在不含 `slgWorld` mode 的干净环境安装 2a 包，codegen / check / bootstrap 能发现 march API 和全部迁移表，RPC 可用且幂等懒结算测试通过；重复 bootstrap 不重复应用迁移，2b 再追加 mode 时保持目录与 manifest 双向一致。

### S6：无人在线 worker 需要租约保护的受限 KitTx，不能只登记入口

**原文定位**：§0.1「依赖 MF7 的 workers」、§2「行军」与 §5「懒结算边界」；对应 MMO 审阅 R4。

**风险**：`workers[] → bootstrap 预置 lease → 启动入口` 尚不足以保证失租旧 worker 不再写库。现有 `withKitTx` 只提供本 kit 表及经济 / effect 通道，不含 worker 租约守卫；kit 也不能通过 `tx.query()` 越过前缀闸读写框架 `singleton_lease` 表。若先检查租约、再另开事务结算，检查与写入之间仍存在失租窗口。SLG 的 SQL 权威后台结算不需要为了获得这一能力而引入 WorldRoom、persona 或内存世界检查点。

**建议（待落实）**：MF7 在框架侧提供通用 SQL worker 的受限事务能力：绑定 kit / worker / 区与持有代次，租约有效性或 fence 的存储守卫与业务写入使用同一连接、同一事务，并向回调只暴露受限 KitTx；不得要求 kit 使用 `.conn` 或直接操作框架租约表。worker 有有界批次、失租停写、退出与停用 / 卸载纪律；行军业务仍复用 S3 的结算 API，并让 S1 的修订 / 通知路径覆盖 worker。接口名称、租约方案及是否拆出独立 MF7 子交付均待设计消化。该建议不取消 worker 落地前已声明的无人在线延迟结算取舍。

**验收建议**：不启动 WorldRoom、也不创建 persona 的 SQL kit 夹具即可运行已登记 worker；首版用同进程两个独立 worker 实例争租，并注入旧 worker 暂停后恢复、事务前后失租，验证失效写入被存储边界拒绝、已提交结算可幂等重放；跨进程实验证据列后续项，与 MMO 基线 D7 的「跨进程设计 / 同进程首版验收」口径一致，不新增首版硬闸。未登记 worker 不启动；停用 / 卸载不遗留可继续提交的旧 worker，待处理业务有明确处置。

### 阶段进入条件建议（待落实）

- 阶段 1 的坐标数学、静态内容与地图展示可继续；占领写路径先落实 S2 的回执和竞争契约。
- 2a 保持不依赖房间，但应先明确 S3 的状态 / 顺序 / 锁契约，并补齐 S5 的 manifest 与迁移登记；需要与未来 S1 同步协议衔接的持久字段在建表时一并审查。
- 2b 继续等待 MF5；“MF5 完成”应包含 S4 所述 SQL 视图 GameRoom 的消费验收，并与 S1 的可靠 SQL 投影恢复共同验证，不以 WorldRoom 单一路径或空连接压测代替。
- 无人在线自动结算仍等待 MF7 通用 SQL worker 能力；S6 是该能力的审阅要求，不能据此回写为已经实施。

### 第三轮拍板（2026-09-09，用户已选定）

| 审阅项 | 拍板结果 |
| --- | --- |
| S1 同步协议 | **变更日志表 + 游标**：`k_slg_tile_log` / `k_slg_march_log` 与业务写同事务追加（单调 revision、tombstone 覆盖删除/结束）；消费方自持游标 + 定期对账；Redis 仅提示；日志有保留窗口，出窗走 baseline 重建。已并入 §2 与阶段 1 / 2a 建表清单。 |
| S2 地块竞争 | **唯一键插入 + 冲突事务内重读**（稀疏表保留）；请求级幂等由 `k_slg_capture` 回执承担。已并入 §2 与阶段 1 第 7 条。 |
| S3 行军规则 | **守备制规则包**：同目标 `arrive_at`→`march_id` 升序逐条结算；到达 = 交战（无主格占领 / 敌格削守备归零夺取）；`arrive_at` 前可撤；kit API 单写入口；锁顺序 tile → march → receipt → 经济/effect。已并入 §2 与 2a。 |
| S4 名册可见性 | v0 暂接受 codegen 默认（root `players` map 含 id/name、同房可见）；不视为产品批准，随 MF5 的 D4 名册策略一并收口，2b 验收按 S4 复核。第 14 条视口摘要已移除。 |
| S5 manifest 登记 | march 面的 `api.march` / `sql.files` / `sql.tables` 增量归入 2a（第 16 条同批）；mode / wire / 四件套仍留 2b。 |
| S6 worker | 维持等待 MF7；MF7 须供「租约保护的受限 KitTx」（同一连接同一事务内验租约 + 业务写），本 kit 不碰框架租约表、不用 `.conn`。 |
| MF5 / MF7 归属 | **本仓按 MMO.md §5 自行实施**（独立排期、先于 2b）；2b 开工条件 = MF5 落地且含 S4 GameRoom 消费路径验收。 |

阶段进入条件（更新后）：阶段 1 全部开工（S2 契约已冻结）；2a 开工条件已满足（S1 / S3 已冻结、S5 登记已并入第 16 条）；2b 等待 MF5（含 S4）；无人在线 worker 等待 MF7（S6）。
