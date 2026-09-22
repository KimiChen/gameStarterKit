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

| 层 | 值空间 | 落点 | 用途 |
|---|---|---|---|
| **通行层** | 3（0 陆 / 1 河 / 2 山） | `apps/shared/src/kits/mapOriginal/content/terrain.data.ts`（varint-RLE + base64，**157 KB**） | 首帧即可画轮廓；将来服务端通行判定 |
| **显示层** | **原版 res 值 1..61** | `data/maps/s1/terrain.bytes`（2.25 MB）+ Cocos 镜像，客户端 **BufferAsset** 加载 | 近档选地表粗类 + **逐格摆件** + 点选详情 |

★ **显示层存的就是原版的值本身**（⛔ 不再折算成 16 个自造类）。一个字节无损承载原版全部语义，
于是「这一格长什么样」变成**纯查表**：
`MAPO_VALUE_KIND_ID[v]` → 地表图集第几行；`v` 本身 → 摆件图集第几格；`MAPO_VALUE_BY_ID.get(v)` → 中文名/颜色/通行。
⚠ **为什么显示层不进 shared**：它一阶熵 **2.95 bit/格**（zlib 也只到 772 KB），
varint-RLE 反而**胀到 125.6%**（3.9 MB TS）。通行层只有 3 类、游程极长，RLE 后 111 KB —— 只有它能进 shared。
⚠ 显示层没到位时 `mapoValueAt` 按通行类**退回同一值空间**（陆→1 / 河→47 / 山→60），面板标「读取中…」；
⛔ 不拿退回值冒充真相，也 ⛔ 不让首帧空着，更 ⛔ 不让渲染器去分辨「这个数是 3 类还是原版值」。

### 原版字节语义（权威表 `asset/config/S1/cn/res_pro/terrain_attr.lua`）

```
res==1            LAND 平地                                    844,134 格 37.5%
2 <= res <= 41    资源地块：类型 = (res-2)//10、等级 = (res-2)%10+1   42.7%
42 <= res <= 46   金矿 1..5 级                                            0.5%
res==47           RIVER 河流                                             10.5%
res==0 或 >=48    **多格地形本体/锚点**，类型取 res_multi：
                  60/61 平均 26 格、最大 228 ⇒ 山脉（⛔ 不可通行）        1.9%
                  52..55 + 57..59 ⇒ 林丛 6.1%；48..51 单格散落地物 0.8%
```
⚠ **这里更正过一次**：早先把 `(res-2)%10+2` 读成 LAND_TYPE、`(res-2)//10` 读成「4 款变体」，
**是反的**。统计实证：块序号（`//10`）在全图分布均匀、随距中心半径**平坦不变**（1.50 恒定）⇒ 是**资源类型**；
块内序号（`%10`）的均值随半径从 3.26 递减到 1.33 ⇒ 是**地块等级**（越靠边越低级，这正是三战的分布）。
⚠ 类型编号→中文（0木/1铁/2石/3粮）是**假设**：静态数据定不了是否被置换，见 `MAPO_RES_TYPE_CN`。
⚠ 字节值**就是资源 id**：`res_bytes_id_map.lua` 的 id 集合跳过 56，而数据里 56 恰好零命中。

## 四、美术：⛔ 两条否定结论（省得重走）

1. **`.group` 预制体不在包里，但它引用的精灵在**（⚠ 早先这条写反过，已更正）。
   205 条 `scene/ground/**.group` 确实不在 ELP（预制体按需热更），但
   `scene/_output_atlas_scene/atlas_tex/` 下的 62 个图集里有**逐格地皮精灵、小建筑、城、营、道路、
   鸟瞰图标**共 3,510 张。找不到它们的原因是图集页扩展名：XML 的 `imagePath` 写 `.png`、
   包里是构建期转出的 `.ktx`。⇒ **摆件层直接用原版切片**；底下那层菱形仍由可平铺 3D albedo 合成。
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
| 画质 | 流畅 / 普通 / 高清 / 超高 | ✅ 映射到分帧建格步长与**建不建摆件层**。⚠ 摆件是**全有或全无**（见下），⛔ 不是密度系数 |

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
| `decor` 摆件 | L0–L2 | ✅ ★ **按原游戏参数摆放**：图集**按原版值建格**（格 id = res 值 2..46，45 格资源/金矿 + 8 格城址），客户端拿到格值直接查到图，⛔ 零概率零哈希。249 座城按 `city_center.lua` 的**真坐标**恒放并放大。⚠ 超出菱形 ⇒ 必须画在地表之上并按**画家序**排 |
| `label` 地名 | L0–L5 | ✅ **原版地名**：9 个大区（西凉/山东/河北/巴蜀/荆楚/江东/司隶/关中/江汉）+ 55 个郡，坐标取原表自带的 `grid`。⚠ 远档只画大区、近档只画郡，⛔ 两档不要一起画 |
| `banner` 目标旗 | — | ⛔ **未实现**（要服务端的归属数据） |

### 摆件为什么是「全有或全无」

原作近档不是「底图 + 撒一些装饰」，而是**底图 + 逐格一个 `res_field` 单位**，那个单位由该格的
`res` 值（类型 + 等级）唯一决定。所以：

- 摆件图集 `decor-atlas.png` 的**格 id 就是原版值**（2..46 资源与金矿；城址从 `MAPO_DECOR_CITY_BASE = 64` 起）；
- `mapoDecorAt(row, col, value, enabled)` 是**纯查表**，⛔ 没有概率、没有哈希撒件
  （哈希只剩一处：在 8 件城址图里按位置稳定挑一件）；
- ⛔ **别再加「密度系数」**：按密度砍一半会出现「同样的 3 级粮田有的有有的没有」的穿帮。
  要省开销只有整层关掉（流畅档）这一条路 —— 近档一屏本来也只有几十格（一格 300×150 世界像素）。
- 原版没单独出图的等级用**最近一级**顶上，逐条记在 `MAPO_DECOR_SUBSTITUTIONS`（当前 8 条，
  如「粮 1..4 级用 5 级图」）；⚠ 这是**存证**不是兜底，将来补图要把它清空。

⚠ 相应地，**地表图集改按 8 个粗类建**（plain/resource/gold/river/mountain/grove/scatter/unknown
× 4 变体 = 32 格）：61 个原版值铺不进 8×4 的图集，而值里的「等级」差别本来就该由摆件层体现，
地表那层只需垫底色调。值 → 粗类走 `MAPO_VALUE_KIND_ID`，⛔ 别把原版值直接喂给 `mapoAtlasCellId`。

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
$P tools/maporiginal-assets/build_terrain.py           # 原版层 → terrain.bytes（原版值）+ 通行层 + 调色板
$P tools/maporiginal-assets/bake_content.py            # 远档底图 / 缩略图 / 近档图集（按粗类）
$P tools/maporiginal-assets/pack_decor.py              # ★ 摆件图集：格 id = 原版 res 值
$P tools/maporiginal-assets/build_labels.py && $P tools/maporiginal-assets/emit_labels.py
$P tools/maporiginal-assets/emit_display_palette.py \
     --out apps/shared/src/kits/mapOriginal/content/display.data.ts   # ★ 61 值调色板 + 粗类下标表
$P tools/maporiginal-assets/emit_shared_terrain.py --layer pass \
     --out apps/shared/src/kits/mapOriginal/content/terrain.data.ts
$P tools/maporiginal-assets/install_to_kit.py          # 装 kit + Cocos 镜像 + 铸 .meta
$P tools/maporiginal-assets/emit_ledger.py --out apps/kits/mapOriginal/art/LICENSES.md
npm --workspace @game/server run codegen:plugins && npm run sync:shared
```

⚠ **别在 `/tmp` 下跑脚本**：本机 `/tmp/token.py` 会遮蔽标准库 `token`，numpy 导入即炸。
⚠ **首次用 Creator 打开本仓**：`resources/kits/mapOriginal/**` 的 `.meta` 是脚本确定性铸的、
不是 Creator 导入出来的。Creator 会正式导入并可能改写 uuid —— 把它改完的 `.meta` 一并提交。

## 八·五、真机重放抓出来的两条（2026-09-22）

单测钉的是我当时**写错的那个假设**，所以两条都只有真引擎能发现。

| # | 症状 | 根因 | 封印 |
|---|---|---|---|
| 1 | 地图区**全黑**，只剩选中框 | world 节点 transform 把「相机坐标原点」当节点位置用了 —— 相机坐标原点在地图区**左上**且 y 向下，而根局部原点在屏幕中心、y 向上。整张网格被推到屏幕外 | `refresh()` 里改成 `rootX=(wx−cam.x)·scale`、`rootY=centre+(wy−cam.y)·scale`；选中框与 world **共用同一套换算**，⛔ 不再各写一份 |
| 2 | 详情把「森林」显示成「可走陆地」、近档配色全落回第 0 类 | 拿显示层 id 去查**通行层**的 `MAPO_TERRAIN_PALETTE` | 新增生成物 `content/display.data.ts`；⛔ 两份调色板不许混用 |

### 追加一条：重放第一次红是**旧 chunk**，不是代码错（2026-09-22）

改完源码直接跑重放，第 9 步「点选一格」超时，可见文本里详情还是旧格式 `(750, 750) 平地`。
根因：**Creator 只在应用被激活时才重编译脚本**（`tools/creator-preview/README.md` 已写），
预览拿的是上一次的 chunk。⇒ 跑重放前先 `osascript -e 'tell application "CocosCreator" to activate'`
并等 `apps/Cocos/temp/programming/packer-driver/targets/preview/chunks` 出现新文件。
⚠ 这不是「重放不稳定」，⛔ 别去加重试 —— 判据是 chunk 的 mtime。

### 追加一条：`res` 字节语义读反了（2026-09-22，非真机、统计自查）

近档接摆件时发现「同一块地里资源等级乱跳」，回头做分布检验才发现把 `(res-2)//10` 当成了变体、
`(res-2)%10+2` 当成了地形类型 —— **正好反了**（更正见 §三）。这一条**单测钉不出来**：
当时的用例钉的就是那个错假设。判据是两条与地理相关的统计量：

| 量 | 若 `//10` 是类型 | 实测 | 结论 |
|---|---|---|---|
| `//10` 随距中心半径的均值 | 平坦（类型与远近无关） | 1.50 → 1.50 恒平 | ✔ 是类型 |
| `%10` 随距中心半径的均值 | 递减（越靠边越低级） | 3.26 → 1.33 | ✔ 是等级 |

⇒ 从此**显示层直接存原版值**，不再折算成自造类；地表按粗类垫底、等级差交给摆件层。

⚠ 还有一条**不是本 kit 的**但会挡住所有重放：登录页 Spine 骨骼版本不匹配
（`GLoader3D.onChangeSpine` → `Cannot read properties of null (reading 'skins')`）会弹出 DOM 浮层
`#error`，它盖在画布之上、吃掉 CDP 的全部点击。已在 `runner.tap()` 里统一关掉并记进
`report.json` 的 `overlayDismissals`。

## 九、进度

- ✅ **P0** namehash 反查（`SipHash-2-4(零 key, 去 asset/ 前缀路径)`），11,489 个文件改回真名。
- ✅ **P1** 素材管线：29 张 KTX 解码 + 805 张图集切片 + 九字段台账。
- ✅ **P2** 内容包：s1 全 23 层定性、**原版值显示层**（61 值）+ 3 类通行层、远档底图/缩略图/三档图集
  （地表按 8 粗类 × 4 变体）、**摆件图集按原版值建格**（45 资源 + 8 城址）、原版地名三级。
- ✅ **P3** kit 骨架 + `hexmap` 面（抄改 700 行）+ shared 内容模块。
- ✅ **P4** 客户端地图页 `mapOriginalWorld`（首屏菜单「原版大地图」）+ 画面设置面板。
- ✅ **P5 真引擎验收**：`node tools/creator-preview/run.mjs mapOriginal --out <dir>` 十一步全绿
  （进入 → 近档地表 → 点选含坐标换算判据 → 色彩模式生效 → **3D 沙盘断言切不过去** →
  拉远换远档底图 → 缩略图跳转 → 推回近档）。实测 LOD0 近档 48 FPS / 130 draw call / 4234 三角形。
  ⚠ 真机重放抓出的**两条**缺陷（673 条绿单测一条没抓到，见下）已修并有回归。
- ⛔ **P6 3D 沙盘**：等框架 `docs/3d.md` 的 SC0–SC1。
- ⛔ **多格地形（值 48..61，占 8.8%）还没有摆件**：原作是一个模型跨整片连通区（山脉平均 26 格、
  最大 228），`.group` 预制体不在 ELP 里。正确补法是**连通域 → 每区一件、锚在区内最低格、按区尺寸缩放**；
  ⛔ 不是逐格放一棵树（那是我们编的，不是原版参数）。这是近档最后一块平菱形区域。
