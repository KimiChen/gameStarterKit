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
| `hexmap` | 1/1 | cell key、六邻与环序、cube 距离、等距投影、6 档 LOD + 滞回、地形内容、长程邻接校验 | ✅ P1 |
| `territory` | — | 19 态 GRID_STATE、连地判定、占领结算 | ⏳ P2 |
| `march` | — | 转折点路径、插值、结算 | ⏳ P4 |
| `chunk` | — | 鸟瞰分块摘要 | ⏳ P5 |
| `alliance` | — | 最小同盟 | ⏳ P3 |

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
| `links.json` | 长程邻接（关隘/渡口）。**可以不存在** = 本图没有长程链接，⛔ 不是错误 |

当前内容包 `zhongyuan`（中原）：陆 68.9% / 海 9.7% / 图外 21.4%，**可玩陆地 1,549,931 格**。
陆内 平原 55.9%、森林 14.9%、丘陵 12.1%、山地 8.0%、水域 6.1%、湿地 2.9%。

**素材来历与边界**：源于 10 张 AI 生成的国风缩放概念图（仓外 `~/Downloads/maps/`，**原图不入库**，
只入派生产物）。⚠ 它们**不是同一张图的多级切片**——只有 Z08/Z09 画了整个世界，Z00/Z02/Z04/Z06 是
区域特写。因此世界轮廓与郡分区只能取自 Z09，陆内地形按 seed 程序化铺设。详见
`tools/sgzzmap-maps/README.md`。

## 四、加载约定

- 服务端 `content/terrain.ts` / `content/links.ts`：**⛔ 无导入期副作用**，首次调用才读盘校验；
  地形与区无关，缓存按**进程**一份（约 2.25 MB RSS 常量）。
- `sha256` 闸在服务端（shared 零依赖、没有 crypto）；**形状**闸在 shared 的 `loadSgzzTerrain`，
  两端跑同一个校验器。
- 取地形用展平 `Uint8Array` 的 O(1) 读。⛔ 不要照抄 slg 的 `terrainAt`（逐格线扫矩形表），
  1500² 格上跑不动。

## 五、进度

- ✅ **P0** 素材管线（`tools/sgzzmap-maps/`）：机检闸 `verify-redraw.py` 全绿，人工 `--overlay` 已目检。
- ✅ **P1** kit 骨架 + `hexmap` 面 + 冻结内容：16 条用例绿。
- ⏳ P2 SQL + 占领 + `territory` 面 + RPC 域 ／ P3 同盟 ／ P4 行军 + worker ／ P5 鸟瞰 + 缩略图 ／ P6 客户端页。

## 六、运维

重跑内容包：见 `tools/sgzzmap-maps/README.md`，末步 `install-to-kit.py <mapId>` 装入双份并铸 `.meta`；
`install-to-kit.py <mapId> --check` 只校验不写。

⚠ **`db:bootstrap` 对已应用的迁移文件 sha256 fail-closed**（P2 起才有 SQL）。每阶段**追加**迁移没问题，
但**回头改**已 bootstrap 过的文件会按设计拒启。开发机恢复：
`DELETE FROM kit_migration WHERE kit_id='sgzzmap'` + `DROP` 掉 `k_sgzzmap_*`。
