# 大地图迁移为 `slg` kit（worldmap + march 两面）实施计划

## 0. 结论先行

「迁移」= **设计移植，不是代码搬运**。源包（zlbAllVersion）是别家引擎的 C++/Lua 逆向产物，代码与素材已经获得授权、但语言/引擎完全不同，一行都不能拷；要移植的是它的大地图架构：两级网格坐标、相机版本门控、环形扩张流式加载、滞回带、LOD 差分集合（added/removed）、逐层 LOD 隐藏开关、水面/内容层按相机距离连续混合的思想。

框架侧勘察结论（三路 explore 已核实）：

- **客户端全 2D**（UI 空间正交相机），无 3D/自由相机/手势缩放先例；但 snake 已验证「世界层节点 scale/translate 伪相机 + 动态网格合批（snakeQuadMesh）+ logic 纯度门无头测试」整条管线，大地图可直接站上这条管线。
- **kit 机制已完整落地**（K0 全部 ✅），arena 样本四件套（SQL 世界表 + 多 mode + api 面 + requires.kits）全覆盖；`docs/KIT.md` §3 的示例字面上就是 `id:"slg"`（worldmap/march/alliance 三 api 面）。
- **AOI 是最大空白**：无兴趣集/视野过滤/StateView 任何使用；但 snake 的 per-client 有序 delta 流 + 分块 baseline + checksum + 重同步载体现成，`docs/MMO.md` 已定「消息级 AOI」为方向（MF1 未实施）——本 kit 是它的首个实践者。
- **mode 目录可直读 Redis**（snake `rooms/modes/snake/runRewards.ts:25` import `core/infra/redisRoute` 先例）；kit 边界机检只扫 `apps/server/src/kits/**`。
- **Lobby RPC 与 GameRoom 不互通**（无 RPC→live room 缝隙）；世界状态权威在 SQL，房间只是实时视图——这正是 arena 已验证的分工形态。

用户已拍板：2D UI 空间瓦片渲染 / `slg` kit（worldmap 首面）/ 首版含行军与 AOI 动态单位 / 地图数据静态配表。

## 1. 总体架构（源游戏机制 → 本框架落点对照）

| 源游戏设计（zlbAllVersion） | 本框架落点 |
| --- | --- |
| 两级网格：Tile（流式单元）/ Grid（玩法格），`id=(x+30)\|((z+30)<<16)` | shared 零依赖数学库 `apps/shared/src/kits/slg/api/worldmap/`：格/chunk 两级坐标、id 打包（偏移量按本图尺寸定）、视口→可见矩形→chunk 矩形换算 |
| 环形扩张加载器 + 滞回带 + 相机版本门控 + 4 格外扩 margin | 客户端 logic 层纯 TS 流式器 `apps/client/src/kits/slg/logic/mapStreamer.ts`（吃纯度门，无头全测） |
| 视口六档 LOD（阈值 187/320/600/1120/2080，≈1.8 倍几何级数）+ 俯瞰分块六档（grid 10..60） | 适配为 2D 缩放逐档表（常量进 shared，v0 四档），越档发事件、按档建销内容层 |
| native 差分 API（total/added/removed 三表，有序归并求对称差） | 双端各一份同构实现：客户端流式器对 chunk 集做 added/removed；**服务端 AOI 内核对每个会话的兴趣集做 added/removed**（同一套 shared 算法） |
| 逐层 LOD 隐藏开关表（map_layer_lod：军队/行军线/格子线/资源地…） | 客户端内容层注册表：每层声明 `hideAtLod`，LOD 事件驱动显隐 |
| AOI：LEGACY_AOI / ZOOM_AOI 三级，按 chunk 批量找/清 AOI 对象 | 服务端 `slgWorld` 房内：会话上报视口（中心+档）→ 兴趣 chunk 集 → tile/army 的 enter/update/leave 增量流 |
| 世界状态（占地）在 Lua 层，SQL 无关 | **SQL 是权威**：`k_slg_tile` per-zone 稀疏表（只存非默认格，无主格不落行）+ Lobby RPC 幂等写（arena 模式原样放大） |
| 行军线/军队层 | `k_slg_march` per-zone 表 + 确定性位置函数 `pos=f(now, 行军令)`（免 checkpoint）+ AOI 增量流下发 |
| 地形贴图/PCG | 静态配表：地形类型由 excel→JSON 配表给出，输出到 kit 命名空间 |

## 2. 数据与同步模型（先把最难的想清楚）

- **地块**：`k_slg_tile(server_id, tile_id, owner_uid, guard_power, updated_at)` per-zone 稀疏表（`server_id+tile_id` 主键）。地图总量可配（v0 默认 200×200 = 4 万格），只有被占/被改的格才有行 → 避开万行 INSERT 种子。
- **行军**：`k_slg_march(server_id, march_id, uid, from_tile, to_tile, depart_at, arrive_at, status, …)` per-zone。位置是 `f(now)` 的确定函数 → 房间崩溃/重启从 SQL 重放即恢复，**不需要框架还没有的 checkpoint 接缝**；到达结算用懒结算（任何触碰该行军/该地块的 RPC 或房间 tick 扫描到 `arrive_at<=now` 即结算写库）。
- **RPC→房同步**：`slg.*` 写端点（websocket 层）提交事务后，对 Redis 脏标记 `HINCRBY`（mode 目录直读 Redis，snake 先例）；`slgWorld` 房 tick 低频（1–2Hz）读脏标记，变了才 `WHERE updated_at > last` 增量拉回 → 转 AOI 增量流。⛔ 不在 websocket 端点里 import 房间。
- **AOI 载体**：照 snake 消息级形态——C2S `mapSubscribe{center, lod}` / S2C `tilesEnter/tilesUpdate/tilesLeave`、`armiesEnter/Update/Leave`，per-client 有序 seq + 分块 baseline + checksum + `baselineRequest` 重同步。世界格子**不进 Colyseus Schema root**（全房广播且无法按人过滤），root 只放房级摘要 + players map。
- **房间形态**：`slgWorld` mode，dropIn profile，`filterBy(["sId","mode","profile"])` 天然每区一房；manifest `maxPlayers` v0 定 100（现有先例最大 8，超 8 的容量与 50ms patchRate 开销列入验证项）。

## 3. 阶段划分

### 阶段 1：kit 骨架 + worldmap 面（静态世界 + 地图页）——可独立验收

**登记与单源**

1. `apps/kits/slg/kit.json`：`schemaVersion:1`、`id:"slg"`（宿主自有，无 `version`）、`api:{worldmap:{version:1,minSupported:1}}`、`domains:["slg"]`、`modes:[{id:"slgWorld",constantName:"SlgWorld"}]`（mode 骨架随阶段 2 补齐内容；若阶段 1 想完全不带 mode，则先不登记，`gameplays/` 目录也阶段 2 再加——**推荐阶段 1 就不带**，codegen 对 `modes≡gameplays/ 子目录集` 有双向断言）、`sql.files:["sql/001-init.sql"]`、`sql.tables:[{name:"k_slg_tile",zone:"per-zone"}]`、`userKeys:["stats"]`、entry/routes/menu/viewDirs/views/owners 按 arena 形状。
2. `apps/kits/slg/sql/001-init.sql`：`k_slg_tile` 建表（server_id 进主键，遵守 lint 白名单）。
3. `apps/kits/slg/README.md`：定义了什么、插件怎么用 api 面（照 arena README 格式）。

**shared（零依赖，铁律 4）**

4. `apps/shared/src/kits/slg/api/worldmap/index.ts`：坐标/id 打包、chunk 换算、LOD 档表常量（如 `SLG_MAP_W/H`、`SLG_CHUNK_SIZE=16`、`SLG_LOD_SCALE_THRESHOLDS`）、`ISlgTile`、校验器、`canCaptureTile` 式纯规则函数。常量⛔ 不手抄进别端（铁律 6）。
5. `apps/shared/src/protocol/lobbyRpc/domains/slg.ts`：`SlgRpc = { MapTiles:"slg.mapTiles", TileCapture:"slg.tileCapture" }`，req/res + fail-closed validator + errorCodes `["SLG_TILE_TAKEN"]`；`slg.mapTiles` 入参 = chunk 矩形（分页上限），响应 = 稀疏行集。
6. `apps/server/test/lobbyRpcVectors/slg.ts`：每路由向量。

**服务端**

7. `apps/server/src/kits/slg/`：`tileRepo.ts`（内部 SQL）、`api/worldmap/index.ts`（`readTiles(sId,rect)`、`captureTile(uid,sId,tile,opId)`——回执幂等照 arena：可加 `k_slg_capture` 回执表或复用 tile 行 + outbox 幂等，设计时对照 arena `captureTile`）、`host.ts`。⛔ 只 import `core/infra/kitApi` + `@game/shared*`（kit-import-boundary 机检）。
8. `apps/server/src/websocket/slg/{mapTiles,tileCapture}.ts`：薄壳端点（`currentZoneId()` + api 调用 + RpcFault 映射）。

**配表（静态地形）**

9. `tools/excel-config/` 加 `slg_terrain.xlsx`（或等价 csv/xlsx 源），用 `excel-to-json.mjs --output=apps/kits/slg/data/terrain.config.json --client-output="apps/Cocos/assets/resources/kits/slg/terrain.json"` 双出（两条路径都在 kit 推导集内）；`config:excel-to-json:check` 纳入。

**客户端（全部走已有管线）**

10. `apps/client/src/kits/slg/index.ts`（`createPluginModule`）、`api/worldmap/index.ts`（`fetchMapTiles(lobbyRpc)` + 展示助手，⛔ 不 import cc）。
11. logic 层（纯度门保护，可无头全测）：
    - `logic/mapCamera.ts`：pan + **pinch 双指缩放**（全新，纯数学：两指距离比→scale，锚点保持）+ 惯性；scale→LOD 分档 + 越档事件。
    - `logic/mapStreamer.ts`：源游戏 §6 的 2D 移植——可见矩形、外扩 margin、滞回带、环形扩张、chunk 集 added/removed 差分。
    - `logic/mapLayers.ts`：内容层注册表 + `hideAtLod` 显隐规则；地块占有色块层、格子线层。
12. view 层：`view/SlgMapView.ts` + `.view.json` sidecar（`kind:"cocos"`、`interactive:false` + scrim 吞触摸，照 ArenaBoardView）；世界根节点 scale/translate；瓦片渲染**用 snake 动态网格合批**（每 chunk 一张 dynamic mesh，⛔ 不用每格一个 Sprite）；输入走全局 `input.on` + 多点路由（SnakePointerRouter 先例）；地形贴图 `resources.load("kits/slg/terrain")`。
13. kit.json 登记 `route {id:"slgMap", view:"SlgMap"}` + menu 一条（kind:"route"）。

**阶段 1 验收**：`codegen:plugins` → `sync:shared` → `sync:client` → `db:bootstrap`（应用 k_slg_tile）→ `npm run typecheck` / `test:client` / `plugin -- test slg` → `verify:all` 绿 → Creator 预览实证：地图页打开、平移/缩放四档 LOD、占领一格写库并重读。

### 阶段 2：march 面 + `slgWorld` 房（AOI 动态单位）

**玩法单源**

14. `apps/kits/slg/gameplays/slgWorld/{manifest.json,state.json}`：manifest（dropIn profile、`maxPlayers:100`、`wireExposed` 默认）；state root 只放 tick/phase/matchId/players（房级摘要），players 只放 id/name/视口摘要。kit.json 补 `modes:[{id:"slgWorld",constantName:"SlgWorld"}]` 与 `api.march:{version:1,minSupported:1}`。
15. `apps/shared/src/gameplays/slgWorld/wire.ts`（手写真源）：C2S `MapSubscribe{chunkAnchor,lod}`、`MapUnsubscribe`、`BaselineRequest`（rateCost）；S2C `BaselineBegin/Chunk/End`（checksum）、`TilesEnter/Update/Leave`、`ArmiesEnter/Update/Leave`——消息族形态照 snake wire。改 wire 一字节必须 bump `modeVersion`。

**服务端**

16. `apps/kits/slg/sql/002-march.sql`：`k_slg_march`（+ 可能的 `k_slg_march_receipt` 回执表）；追加式，⛔ 不改 001。
17. `apps/shared/src/kits/slg/api/march/index.ts`：行军令类型、路径/速度/到达时刻纯函数（`positionAt(order, now)`）、校验器。
18. `apps/server/src/kits/slg/`：`marchRepo.ts`、`api/march/index.ts`（`dispatchMarch`（`tx.debit` 扣体力/粮食 + 写行军 + enqueueEffect，照 arena `boostTile` 形态）、`recallMarch`、`settleDueMarches`）。
19. `apps/shared/src/protocol/lobbyRpc/domains/slg.ts` 增量：`MarchDispatch/MarchRecall` 路由 + errorCodes + contractVersion bump；websocket 端点两个薄壳；向量 sidecar 同步补。
20. `apps/server/src/rooms/modes/slgWorld/index.ts`：GameMode——roster dropIn、`createPlayer`、commands（MapSubscribe 等）、`onStep` 低频扫描（脏标记 → 增量拉 SQL → 逐会话兴趣集差分 → per-client 有序 S2C）；AOI 内核独立文件 `./aoi.ts`（兴趣集 = 视口 chunk 矩形；enter/leave 差分；复用 shared chunk 数学）；脏标记读写 import `core/infra/redisRoute`+`keys`（snake 先例）。**先读 SQL 全量 active 行军进内存，房即该区行军缓存；结算写库经 kit-api**。
21. Redis 新 key 登记进契约表/登记点（SERVER.md §13，铁律 8）。

**客户端四件套**

22. `apps/client/src/net/rooms/SlgWorldRoom.ts`（adapter：joinOrCreate 带 sId/mode/profile、typed capability、重连续发）；`apps/client/src/logic/rooms/slgWorld/`（snapshot buffer 重组/delta 应用/重同步——照 SnakeSnapshotBuffer）；`apps/client/src/gameplay/modes/slgWorld/index.ts`（装配）。
23. 地图页接房间：视口变化→`MapSubscribe`；`tilesEnter/…`→地块层增量刷；军队层（图标 Sprite 池 + 位置插值）与行军线层（动态网格折线）按 `hideAtLod` 显隐。表现件挂法设计点：v0 由 SlgMapView 直接消费 SlgWorldRoom adapter（不走 gameplay presentationHost），若 codegen 对 mode 的客户端四件套有强制再补最小 presentation。
24. `apps/client/test/slg-*.test.ts`：地图数学/流式器/LOD/AOI buffer 无头测试；`apps/server/test/slg-*.test.ts`：repo/api/RPC/mode/AOI 差分（arena/snake 测试形态）。命名吃 `<id>-*` 所有权前缀。

**阶段 2 验收**：两客户端进同区房互见行军；dispatch→对方 2s 内看到军队出现并移动；到达后地块易主、双方收到 tilesUpdate；断线重连走 baseline 重同步；`verify:all` 绿。

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

- **maxPlayers=100 无先例**（现存最大 8）：Schema root 极小、重数据走消息，预期可控；列为实证项，不达标则降档或分片。
- **懒结算的边界**：房内 tick 扫描覆盖在线期；全房无人时到达的行军靠「下次 RPC/进房触发结算」——写进 kit README 的已知取舍。
- **compute 池不载周期任务**：v0 不需要（懒结算 + 房 tick 足够）；若将来加采集/屯田周期结算，需独立编排（登记为后续项）。
- **kit-api 未再导出 `kKitShared`**：脏标记 key 走 mode 目录直读 Redis（snake 先例），⛔ 不在 `apps/server/src/kits/slg/**` 里碰 Redis。
- **版权红线**：⛔ 不拷 zlbAllVersion 的任何代码/素材/数值表文件；LOD 阈值等数值自行调参定标（可「参考其约 1.8 倍几何级数」的设计思想）。
- **文档回写**：落地后更新 `apps/kits/slg/README.md`、根 `AGENTS.md` 速查清单、`docs/KIT.md` §9 实施状态（kit 机制文档的状态回写点）。