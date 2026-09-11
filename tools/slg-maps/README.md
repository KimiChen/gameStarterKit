# tools/slg-maps — SLG 五国地图素材管线

把 zjcs-1.2.6 学习包（仓外，只读）的地图数据转成 slg kit 的运行时数据：`terrain.json`（地形矩形）、
`layout.json`（装饰/地标/生态）、`terrain-atlas.png`（地表图集）、`decoration-atlas.png`（装饰图集）、
`island-ground.png`（远档岛貌烘图）、`world-overview.png`（山河绘卷）。

五国：森之国 `senzhiguo`(11)、山之国 `shanzhiguo`(12)、泽之国 `zezhiguo`(13)、鲸背岛 `jingbeidao`(16)、
羽之国 `yuzhiguo`(17)（ClassId 见 `maps.config.json`）。

## 依赖

```bash
python3 -m venv /tmp/slg-maps-venv
/tmp/slg-maps-venv/bin/pip install UnityPy==1.25.3 msgpack pillow numpy
```

`maps.config.json` 的 `zjcsRoot` 指向学习包根（含 `yoo-assets/`、`scripts/render_map_full.py`）。

## 流程（每张新图）

```bash
P=/tmp/slg-maps-venv/bin/python
$P render-ground.py <mapId>          # 纯地表渲染（复用学习包 render_map_full 的装载/解码）
                                     # → out/<mapId>/ground.png + ground.meta.json（窗回填 config render.window）
$P calibrate.py <mapId> --overlay    # 实体散点×渲染叠图 → 目检调 entityToRender
$P calibrate.py <mapId> --suggest-centroids   # 主色建议 → 人工映射六类后回填 centroids
$P classify-terrain.py <mapId>       # 反分类+矩形分解 → terrain.json（含 islandRect）
$P extract-layout.py <mapId>         # mapinfowrap → layout.json（地标按 landmarkNames 找区域）
$P calibrate.py <mapId> --check-landmarks     # 地标旱地+9×9 足迹校验，不过则 config 加 nudge 重跑上一步
$P build-atlases.py <mapId>          # 装饰切片图集 + 地表图集（config atlas/terrainTiles 策展）
$P bake-island.py <mapId>            # island-ground.png（纯地表缩放到 2400 宽，远档地表）
$P frame-overview.py <mapId>         # world-overview.png（MapNN_web.jpg 装裱 2048² 海青底）+ 256² mini
$P build-ground-tiles.py <mapId>     # 近档真地表：世界格 64×64 切块 1024² JPG（剔全海块）+ ground-tiles.json
```

装饰切片策展（config `atlas`）：从 `Image/Mapscence/mapNN/objectNN/` 与 `AppearanceAssets/Map/` 挑摆件
图，框子矩形 `[x0,y0,x1,y1]`，kind 顺序即图集格序（3 列×2 行上限 6 种）。kind 集合与
`entity_map_display.csv` 的 DisplayPath 分类规则（extract-layout.py `classify`）对应。

## 坐标系

- 实体格（mapinfowrap PosInfo）位于逻辑格坐标系（0..W-1），范围必在 `groundSize` 内。
- 渲染世界格（Tilemap 瓦片坐标）是另一原点：`实体格 + entityToRender = 渲染世界格`，每图校准一次。
- 本 kit 世界格：`渲染窗格 (gx,gy) × scale + worldOrigin`（terrain）；`实体格 × scale + entityToWorld.offset`（layout）。
  森之国为 2026-09-11 已验收 legacy 参数（offset 408/465 与渲染原点 420/531 有 ±6 格历史差，勿动）；
  新图统一用派生式 `entityToWorld.offset = (entityToRender - [win.x0, win.y0]) * scale + margin`，与地形严格同帧。
- 新图世界尺寸 = 渲染窗格 × scale + 2×margin（海环），上限 2048（tileId 打包 11bit）。

## 森之国回归基线（改动管线后必跑）

```bash
$P extract-layout.py senzhiguo && diff <(cat out/senzhiguo/layout.json) ../../apps/kits/slg/data/forest-layout.json
$P classify-terrain.py senzhiguo   # regions/palette/尺寸与 apps/kits/slg/data/terrain.json 一致（多 islandRect 新字段）
$P build-atlases.py senzhiguo      # 两图集与 apps/Cocos/assets/resources/kits/slg/senzhiguo/ 逐像素一致
$P bake-island.py senzhiguo        # island-ground.png 与入库逐像素一致
```

绘卷例外：入库版 `world-overview.png` 的源图裁窗与整图装裱规则略有出入（视觉一致、像素不可复现），
不入回归基线；新图统一用整图装裱规则。

## 注意

- 学习包只读；管线产物先落 `out/<mapId>/`，目检后人工拷贝入库（`apps/kits/slg/data/maps/<id>/` 与
  `apps/Cocos/assets/resources/kits/slg/maps/<id>/`，含 .meta 由编辑器导入生成）。
- 鲸背岛（16）无专属贴图目录，地砖/装饰走共享图集，render-ground.py 经 bundle 依赖自动解析。
- render-ground.py 画 Ground/WaterMask/Ground_Under + TileChunkData 植被层（Rug/Highland/Shadow/
  UnderObject/Object·Dense_Object——树阵/贴花/崖沿，反分类「林地」与近档真地表的纹理来源），
  跳过 Ground_Manual（纯遮罩）与 prefabs 大装饰。
- 近档地表（2026-09-12 起）= `ground-tiles/` 块贴图（B 方案：渲染图本身切块，替代 palette 图集平铺）；
  terrain-atlas.png 保留为装饰/回退色用，全水块不产贴图（海色顶点色回退）。
