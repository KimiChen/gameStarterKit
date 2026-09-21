# mapOriginal — 三战**原版**大地图 kit

把《三国志·战略版》2084.1768 的大地图**用它自己的地块数据与美术**在本框架上复刻。
逆向可读源码在仓外 `sourceVersion/sgzz-2084.1768/`，原始素材在 `apkdecode/sgzz-1768.2084/elp-unpacked/`
（**仓外只读**，⛔ 永不入库）。

## 一、身份与边界

- **宿主自有 kit**（`kit.json` 无 `version`）：与 `apps/kits/{slg,sgzzmap}` 同形，只活在主树里，
  不打包、不进锁。⛔ 因此 `plugin -- pack/install/test` 与 `verify:kit-clean-install` 都不适用，
  验收靠 `verify:all`。
- **与 `sgzzmap` 的关系**：机制同源、内容不同。sgzzmap 是「三战**式**」——机制复刻 + AI 概念图派生的
  自造地形；本 kit 是「三战**原版**」——**原版 1500×1500 地块数据 + 原版美术**。
  ⛔ 机检禁 kit 依赖 kit（`docs/KIT.md:162`），所以 `hexmap` 面是**抄改**的一份；
  ⚠ 两边的六邻表 / 环序 / 投影公式 / LOD 滞回必须保持一致，改一边记得同步另一边。

| 维度 | sgzzmap | mapOriginal |
|---|---|---|
| 地形来源 | 10 张 AI 概念图 + seed 程序化 | **原版 `map/s1/cn/res.bytes` 等 23 个数据层** |
| 地形类数 | 9 | **16**（原版 `LAND_TYPE` 语义） |
| 远档底图 | 概念图 warp 进世界空间 | **由地形烘焙**（逐格精确对齐） |
| 近档贴片 | 概念图切片 + 美术重绘 | **原版可平铺 3D 地表 albedo 合成** |
| 玩法 | 占领 / 行军 / 同盟 / 鸟瞰聚合 | ⛔ v1 无（无 SQL / 无 RPC / 无 worker） |

## 二、v1 范围：只做「看得见的原版地图」

有：原版地形 + 原版美术 + 相机（拖拽/捏合/惯性/钳位）+ 6 档 LOD + 远档底图 + 缩略图 +
点选详情 + **画面设置四项**。
⛔ 没有：占领、连地、行军、同盟、鸟瞰聚合、AOI —— 那些要服务端，抄 sgzzmap 的现成面即可，
但 ⛔ 不在 v1 里留半套。

## 三、地形数据：**两层**，这是本 kit 最要紧的一条

| 层 | 类数 | 落点 | 用途 |
|---|---:|---|---|
| **通行层** | 4（陆/河/山/水） | `apps/shared/src/kits/mapOriginal/content/terrain.data.ts`（varint-RLE + base64，**333 KB**） | 首帧即可画轮廓；将来服务端通行判定 |
| **显示层** | 16 | `data/maps/s1/terrain.bytes`（2.25 MB）+ Cocos 镜像，客户端 **BufferAsset** 加载 | 近档选贴片、点选详情 |

⚠ **为什么显示层不进 shared**：它一阶熵 **2.95 bit/格**（zlib 也只到 772 KB），
varint-RLE 反而**胀到 125.6%**（3.9 MB TS）。通行层游程平均 19.2，RLE 后 237 KB / base64 309 KB，
与 sgzzmap 的 282 KB 同量级 —— 所以只有它能进 shared。
⚠ 显示层没到位时 `mapoDisplayClassAt` **退回通行层**，面板会标「读取中…」；
⛔ 不拿退回值冒充真相，也 ⛔ 不让首帧空着。

### 原版字节语义（权威表 `asset/config/S1/cn/res_pro/terrain_attr.lua`）

```
res==1            LAND 平地
2 <= res <= 41    LAND_TYPE = (res-2)%10 + 2，(res-2)//10 是 4 款变体
                  2木 3石 4粮 5铁 6金 7水 8森林 9湿地 10荒漠 11丘陵
42 <= res <= 46   未定性（7321/2924/1363/402/100 递减，像要塞/关隘分级）
res==47           RIVER 河流
res==0 或 >=48    **多格地形本体/锚点**，类型取 res_multi：
                  60/61 平均 26 格、最大 228 ⇒ 山脉（⛔ 不可通行）
                  57/58/59 平均 8 格 ⇒ 林丛；52..55 中小；48..51 单格地物
```
⚠ 字节值**就是资源 id**：`res_bytes_id_map.lua` 的 id 集合跳过 56，而数据里 56 恰好零命中。

## 四、美术：⛔ 两条否定结论（省得重走）

1. **原版 2D 档地表 `.group` 不在基础包里**。`*_path.json` 里那 205 条
   `scene/ground/{river,snow,desert}/*.group` 直查与 8 种扩展名变体**全 0** —— 按需热更下发的。
   所以近档贴片由**原版可平铺 3D albedo**（gaodi/grass、mountain_new_lod、dibiaohuawen、
   terrain/albedo_river_v2、pcg_v5/water）**合成**，⛔ 包里不存在「拿来即用的一张地块图」。
2. **原版鸟瞰底图不能当远档 plate**。`noexpo_birdview_map_1.ktx`（4096×2048 ETC2）是
   **3D 相机的透视渲染**，与本仓正交等距 ⛔ 不存在可靠 2D 对齐 ——
   实测相似变换 IoU 0.62、河网 NCC 0.30、全仿射拟合退化成竖条纹假峰（NCC 0.51）。
   逐格对齐的层必须自己烘（`bake_content.py`，与 `mapoWorldBounds()` 同式 ⇒ **对齐是构造出来的**）。
   原版那张改作**装饰性缩略图**，落位只做近似（`plate.calib.json`）。

素材授权按九字段登记在 [`art/LICENSES.md`](art/LICENSES.md)（⚠ 法务 load-bearing，⛔ 不得删改）。

## 五、画面设置（复刻原作「设置 → 画面设置」）

| 项 | 档位 | v1 状态 |
|---|---|---|
| 沙盘模式 | 2D 沙盘 / 3D 沙盘 | ✅ 2D；**3D 置灰** —— 框架 Stage3D（`docs/3d.md` SC0–SC5）零实施，⛔ 不在 kit 内自建相机 |
| 镜头视角 | 鸟瞰开关 / FOV 档 | **置灰** —— 与原作同因：「2D沙盘不支持鸟瞰视角」「2d不支持调整镜头参数」 |
| 色彩模式 | 标准 / 鲜艳 / 低饱和 | ✅ 在 `mapoPalette` 的顶点色 + tonemapping 预补偿那层做。⚠ 原作选项名是图片按钮、没留字符串，这是**等价实现** |
| 画质 | 流畅 / 普通 / 高清 / 超高 | ✅ 映射到分帧建格步长与摆件密度 |

⚠ 四项契约（`logic/mapoSettings.ts`）**一次做对**：不可用项禁用并给出与原作同义的理由，
将来接 3D ⛔ 不改协议。⛔ 不许出现「选中但不生效」的档位（`mapoNormalizeGraphics` 会落回）。

## 六、分层门控

`logic/mapoLayers.ts` 的 `MAPO_LAYERS` 是唯一真源，每层带 `implemented`。
⚠ **未实现的层 `mapoLayerVisible` 恒回 false** —— ⛔ 不许「门控说该建、渲染器根本没写」的两张皮
（sgzzmap 真机重放为此红过一次）。

| 层 | 档位 | 状态 |
|---|---|---|
| `terrain` 地表菱形 | L0–L2 | ✅ 合并 mesh + 图集贴片 + 逐格 UV 翻转 |
| `grid` 网格线 | L0–L1 | ✅ |
| `plate` 远档底图 | L3–L5 | ✅ 由地形烘焙 |
| `decor` / `banner` / `label` | — | ⛔ **未实现**（摆件图集策展 / 目标旗 / 地名数据都还没有） |

## 七、客户端五条硬规矩（与 sgzzmap 同，⛔ 别再踩）

1. **只有一台正交 UI 相机**：一切经 `UIMeshRenderer` 走 2D UI 管线，深度**只有兄弟序**。
2. ⛔ **不写 `director.getScene().globals`**：只**读**管线档位，由 `mapoCompensate` 预补偿顶点色。
3. **地表必须是合并 mesh**：原作每格一个场景节点（`grid_state_2d_view.lua`），在 Cocos 上会是上万节点。
4. **平移只动父节点 transform**，⛔ 不重建网格。
5. **资源加载失败也 resolve**、路由关掉按代际自收 —— 否则晚到的成功回调会给已 decRef 的资源再 addRef。

## 八、复现

```bash
P=/tmp/maporiginal-venv/bin/python     # python3 -m venv + pip install texture2ddecoder pillow numpy scipy
$P tools/maporiginal-assets/build_name_map.py          # 素材反查（namehash）
$P tools/maporiginal-assets/decode_batch.py            # 选材解码 KTX → PNG + 存证
$P tools/maporiginal-assets/slice_atlas.py --all       # 图集切片
$P tools/maporiginal-assets/build_terrain.py           # 原版层 → terrain.bytes + 通行层 + 调色板
$P tools/maporiginal-assets/bake_content.py            # 远档底图 / 缩略图 / 近档图集
$P tools/maporiginal-assets/emit_shared_terrain.py --layer pass \
     --out apps/shared/src/kits/mapOriginal/content/terrain.data.ts
$P tools/maporiginal-assets/install_to_kit.py          # 装 kit + Cocos 镜像 + 铸 .meta
$P tools/maporiginal-assets/emit_ledger.py --out apps/kits/mapOriginal/art/LICENSES.md
npm --workspace @game/server run codegen:plugins && npm run sync:shared
```

⚠ **别在 `/tmp` 下跑脚本**：本机 `/tmp/token.py` 会遮蔽标准库 `token`，numpy 导入即炸。
⚠ **首次用 Creator 打开本仓**：`resources/kits/mapOriginal/**` 的 `.meta` 是脚本确定性铸的、
不是 Creator 导入出来的。Creator 会正式导入并可能改写 uuid —— 把它改完的 `.meta` 一并提交。

## 九、进度

- ✅ **P0** namehash 反查（`SipHash-2-4(零 key, 去 asset/ 前缀路径)`），11,489 个文件改回真名。
- ✅ **P1** 素材管线：29 张 KTX 解码 + 805 张图集切片 + 九字段台账。
- ✅ **P2** 内容包：s1 全 23 层定性、16 类显示层 + 4 类通行层、远档底图/缩略图/三档图集。
- ✅ **P3** kit 骨架 + `hexmap` 面（抄改 700 行）+ shared 内容模块。
- ✅ **P4** 客户端地图页 `mapOriginalWorld`（首屏菜单「原版大地图」）+ 画面设置面板。
- ⛔ **P5 真引擎验收未做**：`tools/creator-preview/` 还没登记本 kit，渲染**尚未经真引擎目视确认**。
  在那之前，保障只有 5 条内容用例 + 双 tsconfig + 抄自 sgzzmap 的 mesh 批次纪律。
- ⛔ **P6 3D 沙盘**：等框架 `docs/3d.md` 的 SC0–SC1。
