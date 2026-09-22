# mapOriginal 对齐原版 2D 机制 · 施工单

> **这份文档是什么**：把 [MAPORIGINAL-2D.md](MAPORIGINAL-2D.md) 的机制结论落成可施工的批次。
> ⛔ **它不是设计真源** —— 任何「原版是怎么做的」以那份为准，本文件只管「做哪些、什么顺序、怎么算完」。
> **批次勾选只在本文件 §5**；⛔ **不进 plan-v5**。
>
> 建单日期 2026-09-22。基线 HEAD `3dbac280`。

---

## 1. 排序原则

**先纠错 → 再止血 → 再对齐 → 最后补层。** 理由：

- **纠错**（M0）= 当前实现与原版机制**矛盾**的项。不做就一直错着，而且后面每一批都建在错的地基上。
- **止血**（M1）= 会**谎报**的项（门控说建了其实没建、文档说有其实是空头）。它们不影响画面，
  但会让下一个人（和真机重放证据）被骗。
- **对齐**（M2）= 架构级改动，有前置。
- **补层**（M3）= 原版有我们没有的整层。属**新增**，⛔ 不是修 bug。

✅ **断言核验已补做完成**（2026-09-22，维护者指派 AI 助手逐条原地核对 + 找反例）：
`MAPORIGINAL-2D.md` 的 54 处证据标记**全部带 ★**（首核 13 条 + 补核轮 41 条）；
内容错误 5 处、证据档位标错 9 处、表述过宽 3 处均已就地修正，清单见该文 §0。
各批「为什么」依赖的断言以修正后的原文为准；若依赖条目带「⚠ 补核轮修正/改标」注记，先读注记再动手。

⚠ 每批的退出判据必须是**机检**（命令 + 断言），⛔ 不许「目视确认」。
可用的闸：`npm --workspace @game/server run test`、`npm run typecheck`、`npm run verify:sync`、
`npm run verify:protected-paths`、`npm run test:client`，以及往
`apps/server/test/mapOriginal-content.test.ts` 加断言。
⚠ 真机重放 `node tools/creator-preview/run.mjs mapOriginal` **不在 verify 链里**，只能当**补充证据**。

---

## 2. M0 · 纠错

### M0-B1　锚点模型：terrain 与 regions 改按 `res.bytes` 的锚点出件

**为什么**　MAPORIGINAL-2D §3.1：`res.bytes` 值 48..61 的 55,127 格**就是锚点**，
`res_multi` 只是覆盖掩码。而 `build_terrain.py` 第一步
`merged = np.where(res == 0, multi, res)` **把 142,958 个覆盖格填成了锚点值**，
自己销毁了锚点信息 —— 这正是本 kit 需要发明连通域的唯一原因。

**落点**
- `tools/maporiginal-assets/build_terrain.py`：停止 merge；显示层保留 `res` 原值，
  **另出一张覆盖掩码**供通行层用
- `tools/maporiginal-assets/build_regions.py`：改由 `res ∈ 48..61` 的 55,127 个锚点直接生成，
  足迹按值查表（1/2/4/7/19）；`mountain_patch` 降为**补件**（第二遍）
- `apps/shared/src/kits/mapOriginal/content/display.data.ts`（生成物）
- `apps/client/src/kits/mapOriginal/logic/mapoRegions.ts`：记录布局若变则同步
- `apps/server/test/mapOriginal-content.test.ts`

**退出**
```bash
npm --workspace @game/server run test
```
新增断言：① `regions.bin` 的条数 == `res ∈ 48..61` 的锚点数（由 `regions.info.json` 的 stats 钉）；
② 每条记录反解出的 `(row,col)` 处 `terrain.bytes` 的值 ∈ 48..61；
③ 足迹表（值→格数）与 `regions.info.json` 里落盘的一致；
④ 通行层的不可通行格数 == 覆盖掩码非零格数（若采纳「整片足迹挡路」，⚠ 该条是**推断**，
   写进断言时要在注释里标明）。
⇒ 再跑 `npm run verify:sync`（改了 shared 真源必须同步两份镜像）。

**风险**　中。产物字节会变（`terrain.bytes` / `regions.bin` / `display.data.ts`），
`.meta` 不变（路径与确定性 uuid 不变）。⚠ 山林件的分布会明显变化，需要真机重放看一眼。

**依赖**　无。**这是全单的第一批。**

---

### M0-B2　件的大小补上 prefab 里的 `scale` / `pos` / `angle`

**为什么**　MAPORIGINAL-2D §3.3：`mountain19m_01_group.prefab` 的 sprite 带 **scale 2.163**、
pos(−7.8, 23.0)；m1..m10 只有 10 张图，**14 个件靠 transform 变出来**。
本 kit 只用了原图像素 ⇒ 所有件都偏小，且 14 形被压成 10 形。

**落点**
- `tools/maporiginal-assets/prefab_bin.py`（读 transform；⚠ 现对某些类会错位，
  只取 transform 时宜先验证该类的偏移）
- `tools/maporiginal-assets/pack_regions.py`：`native` 之外再记 `scale`/`offset`/`angle`
- `apps/shared/src/kits/mapOriginal/content/region.data.ts`（生成物）
- `apps/client/src/kits/mapOriginal/logic/mapoRegions.ts`

**退出**
```bash
npm --workspace @game/server run test && npm run typecheck:client
```
新增断言：`region-atlas.info.json` 每格都有 `scale`（> 0）与 `offset`，且与 shared 的 `region.data.ts` 逐项相等。

**风险**　低。⚠ 实测 `prefab_bin.py` 对**基础季** `mountain_new/` 的 13 个 prefab
零残留可解（`_bytes_left=0`、`size` 与原图 13/13 相等），⛔ 没出现 NaN；
入库校验「scale ∈ (0.1, 8.0)」已加，且加了「解出的必须是一个 node_2d 挂一个 sprite_2d、
根节点 scale 必须为 1」两条硬拦。⚠ 对**秋季**那批仍不可解（见 B3 的依赖注）。

**依赖**　M0-B1（同批改 `pack_regions` / `region.data.ts` 更省）

---

### M0-B3　山体美术换回基础季

**为什么**　本 kit 现在用 `scene/ground/mountain_new/grass_fall_new/png/m1..m10` —— 那是**秋季版**。
基础季在包里（`mountain_new/png/`）。

**落点**　`tools/maporiginal-assets/pack_regions.py` 的 `MOUNTAIN_RE`

**退出**
```bash
npm --workspace @game/server run test
```
现有的「区域件 source 必须 `startsWith("scene/")`」断言已覆盖；追加一条
「mountain 族的 source ⛔ 不含 `grass_fall`」。

**风险**　低。产物像素变。**依赖**　~~M0-B2~~ —— ⚠ **实际次序相反，B3 必须先做**：
秋季 prefab（`grass_fall_new/`）根节点多一段 tag + 组件表，`prefab_bin.py` 会**静默**
解成 0 个子节点却仍报 `_bytes_left=0` ⇒ B2 的 transform 根本取不到；
基础季 `mountain_new/` 的 13 个全部零残留可解。已按 B3 → B2 的次序施工。
⚠ 另：基础季贴图原先不在切片集里，先切 `scene/_output_atlas_scene/atlas_tex/mountain.xml`
（10 张，尺寸与 prefab 的 `size` 13/13 逐项相等 —— 这同时交叉校验了贴图对应）。

---

### M0-B4　`res_field` 补第 4 道筛选门：城格抑制资源件

**为什么**　MAPORIGINAL-2D §2.1：原版第 4 道门是「该格有 build 且 `is_show_res_field()` 为假 → 不画」。
`city.bytes` 的 2,689 个城格 100% 是 `res==1` 平地，所以今天不会撞上资源件；
但城址件与资源件**会在同一格叠画**。

**落点**
- `tools/maporiginal-assets/build_labels.py` 或新脚本：把 `city.bytes` 的 249 城 **占格表**
  （格式见 MAPORIGINAL-2D §5）落进 content
- `apps/client/src/kits/mapOriginal/logic/mapoDecor.ts`：城格不叠资源件

**退出**
```bash
npm --workspace @game/server run test
```
新增断言：`city.bytes` 解出的城数 == 249、每城第 1 格 == `MAPO_CITY_SITES[i]`（249/249）。

**风险**　低。**依赖**　无（可与 M0-B1 并行）

---

## 3. M1 · 止血

### M1-B1　`grid` 层：要么实现，要么 `implemented: false`

**为什么**　`mapoLayers.ts` 的 `grid` 层写着 `implemented: true`，而渲染器里**一行都没有**。
这违反该文件抬头自己立的铁律（「未实现的层 `mapoLayerVisible` 恒回 false」），
并且会向状态行与真机重放证据**谎报**。

**落点**　`apps/client/src/kits/mapOriginal/logic/mapoLayers.ts`（+ 若选实现则 `MapoMapRenderer.ts`）

**退出**
```bash
npm run test:client
```
新增用例：对 `MAPO_LAYERS` 里每个 `implemented: true` 的层，断言渲染树上存在同名节点
（或：改成 `false` 后断言 `mapoLayerVisible("grid", lod)` 恒 false）。
⚠ 这条用例是**通用**的，将来新增层自动受管。

**风险**　零（若选 `false`）。**依赖**　无

---

### M1-B2　画质档 → 分帧建格步长：接上或删掉

**为什么**　`mapoCreateStepFor` / `MapOriginalWorldLogic.createStep` **无任何消费方**，
而 README 写着「画质映射到分帧建格步长」⇒ 空头。

**落点**　`apps/client/src/kits/mapOriginal/logic/mapoSettings.ts` +
`view/MapOriginalWorldView.ts`（接上）或三处删除

**退出**
```bash
npm run typecheck && npm run test:client
```
若选「接上」：新增用例断言不同画质档下 `createStep` 真的改变一帧建格上限；
若选「删掉」：`grep -r mapoCreateStepFor apps/` 零命中。

**风险**　零。**依赖**　无

---

### M1-B3　`TEXTURE_OF` 的口径修正

**为什么**　MAPORIGINAL-2D §1.7：七张 `tt_02` 来自 `*_polygon_mask_group.prefab`，
而驱动那层的四张 `multi_grid_*` 表在 S1 **是空表** ⇒ 那层在 S1 一格都不画。
「2D 侧素材」成立，「S1 画面上真用」**不成立**。

**落点**　`tools/maporiginal-assets/bake_content.py` 的 `TEXTURE_OF` 注释、
`apps/kits/mapOriginal/README.md`

**退出**　文档改动，走
```bash
npm run verify:protected-paths
```
⚠ ⛔ **不改源**（换源属 M2-B1）—— 这一批只消口径矛盾，把「实证」降格为
「2D 侧素材，但 S1 不跑该层；本 kit 的 8 粗类底纹是自创的」。

**风险**　零。**依赖**　无

---

## 4. M2 / M3 · 对齐与补层（有前置，⚠ 本单不排期）

| 批 | 内容 | 前置 |
|---|---|---|
| M2-B1 | 地表底改「一张底纹 + 整数次 REPEAT」（MAPORIGINAL-2D §1.4） | **图集里不能 GL_REPEAT** ⇒ 底纹必须单独出一张贴图、不进图集；要改材质与 UV 生成 |
| M2-B2 | snow / desert 的 block 级覆盖层（§1.3） | M2-B1 |
| M3-B1 | 道路层（§4.2） | `road_info.bytes` 的方向编码未解 |
| M3-B2 | 河流独立几何层（§4.1） | 河格 = 3×3 逻辑格，要新的 mesh 构造 |

---

## 5. 实施状态

⚠ **只在这里勾选。** 阶段级完成回写 [MAPORIGINAL-2D.md](MAPORIGINAL-2D.md) 的对照表。

| 批次 | 状态 | 提交 | 日期 |
|---|---|---|---|
| M0-B1 锚点模型 | ✅ 已完成 | （本轮） | 2026-09-22 |
| M0-B2 件的 transform | ✅ 已完成 | （本轮） | 2026-09-22 |
| M0-B3 山体换基础季 | ✅ 已完成（**先于 B2**，见其「依赖」注） | （本轮） | 2026-09-22 |
| M0-B4 城格抑制资源件 | ✅ 已完成 | （本轮） | 2026-09-22 |
| M1-B1 grid 层止血 | ☐ 未开工 | | |
| M1-B2 createStep 空头 | ☐ 未开工 | | |
| M1-B3 TEXTURE_OF 口径 | ☐ 未开工 | | |
| M2-B1 地表底 REPEAT | ☐ 未排期 | | |
| M2-B2 snow/desert 块层 | ☐ 未排期 | | |
| M3-B1 道路层 | ☐ 未排期 | | |
| M3-B2 河流几何层 | ☐ 未排期 | | |

---

## 6. 明确不做

| 项 | 理由 |
|---|---|
| 逐格一个场景节点 | Cocos 下 225 万格 ⇒ 上万节点。⚠ 但**理由要说对**：原版 2D 对平铺层自己也在合批（MAPORIGINAL-2D §7.1） |
| 运行时按名/按 id 换单件资源 | 我们的像素在合并图集里，UV 只在那张 PNG 的坐标系有意义 ⇒ 与合并 mesh + 单材质单相机冲突 |
| `grid_state` 归属层 / `banner` 目标旗 | 需服务端 AOI 归属数据；v1 无服务端 ⇒ ⛔ 违反「不留半套」 |
| AOI 驱动的建筑/城/营 unit | 同上 |
| 收窄缩放行程到原版 1.4× | 我们把「沙盘 + 小地图面板」压成一条连续缩放，收窄等于砍掉「看全局」的唯一通路 |
| 鸟瞰 / `map_birdview_icons` | 2D 下恒不生效（MAPORIGINAL-2D §8.1），已判归 `mapOriginal3d` |
| 引 `logic_road.bytes` 做通行/行军 | 它是 3D PCG 的压平遮罩源，原版的路是**纯表现层**（§4.2） |
