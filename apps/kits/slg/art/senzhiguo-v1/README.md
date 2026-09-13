# 森之国 v1 · 素材包

2026-09-10：slg 大地图从「青原仙洲」换为《杖剑传说》**森之国**主题（地图 ClassId 11），地图尺寸改用
《三国志·战略版》标准图 **1500×1500**（zlbAllVersion `code/script/config/config_3d.lua:11` 的
`MAP_WIDTH/MAP_HEIGHT = 1500`），正方形格不变。

## 文件与来源

| 文件 | 形态 | 来源与做法 |
| --- | --- | --- |
| [terrain-atlas.png](terrain-atlas.png) | 1536×1024，RGB PNG，6 格 | **真贴图 + 程序化混合**：草地 = 真实地砖 `ground11/ground_1.png`；林地 = 真草地乘色加深；岩石 = `ground11/sactx-0-2048x2048-ASTC 6x6-Ground11_Atlas-a2189f17.png` 崖壁切（像素框 (360,676)-(628,816)）；水面/沙滩/裸土包内无平铺真贴图（水面是 shader+mask）→ 程序化生成（PIL 值噪声，环形采样保证四边可平铺）。最初计划用 UnityPy 从 bundle 还原 Tilemap 地砖全链，但 chunk sprite 外部引用 bundle（`CAB-a4f77805…`）不在学习包内；真实瓦片后经 `Mapscence/map11/ground11/` 的 PNG 直供解决（用户指路），不再需要 UnityPy 链。 |
| [decoration-atlas.png](decoration-atlas.png) | 1536×1024，RGBA PNG，6 格 | 从 `zjcs-1.2.6/yoo-assets/map-assets/Assets/AppearanceAssets/Map/` 的多 sprite 部件图**人工策展子矩形**切片：藤蔓（map_mingYunShuTeng）、宝箱（map_baoXiang_01 第 3 帧）、传送门（map_dingDianChuanSongMen_E_1 左扉）、祭坛（map_fangJianBei_B_2 主体）、灵晶（map_shuangYanShanMai_G 蓝晶簇）、古剑碑（map_guJianCheng_D_1 主体）。裁剪坐标见 [pipeline/build-atlases.py](pipeline/build-atlases.py) 的 `CROPS` 表。 |
| [world-overview.png](world-overview.png) | 1024×1024，RGBA PNG | 程序绘制：terrain.json 区域矩形 + forest-layout 装饰剪影 + 地标金点（pipeline/build-overview.py），非原始美术。 |
| `../data/forest-layout.json`（kit 数据） | JSON | 森之国布局包 `mapinfowrap_11_mspack.bytes`（MessagePack，77 区 1803 实体）经 [pipeline/build-layout.py](pipeline/build-layout.py) 解码：坐标 5× 放大复刻到本图中心区，实体按 `entity_map_display.csv` 的 DisplayPath 归六类装饰（怪物/NPC 不进装饰层）。 |

## 接入约束

- 图集索引、装饰尺寸、地标、布局分桶的唯一真源是 `apps/client/src/kits/slg/logic/mapArt.ts`；运行时使用
  `apps/Cocos/assets/resources/kits/slg/senzhiguo/`（逐字节镜像本目录成品）与 `apps/Cocos/assets/resources/kits/slg/forest-layout.json`。
- 装饰完整足迹留在所属 chunk 内、每 chunk 最多 7 件、地标各占独立 chunk 且不下水——客户端测试钉住。
- 地形区域改动必须同步 `apps/kits/slg/data/terrain.json` 与资源镜像（逐字节），服务端测试 `slg-shared.test.ts` 钉住镜像一致性。

## 版权与边界

- 素材来自本机两个逆向学习包（zlbAllVersion / zjcs-1.2.6），仅本仓私有研究用，**禁止二次分发**；
  版权归原厂商（灵犀互娱 / 心动）所有。
- 本包不改变玩法规则：地形与装饰只影响显示（无阻挡/寻路/资源点语义），行军与占领规则不变。

## 2026-09-13 增补：Tilemap 近档地表

- [tileset-0.png](tileset-0.png)：4096×4096 RGBA 单页图集（16×16=256 格，等比装满），瓦片全部解自
  原游戏 bare Tilemap（Ground/Ground_Under/Ground_Above）与 TileChunkData 全层的 sprite 引用，去重后单页。
- `../../data/maps/senzhiguo/tiles.json`：格→瓦片引用表（层按原版 sortLayer/Order 排序，每层带宿主 m_TileAnchor，
  每瓦片带 scale/pivot/内容子矩形），管线 `tools/slg-maps/extract-tileset.py` 产出，客户端 SlgTilemapRenderer 逐格铺设。
- 自此近档地表不再用渲染图切块（ground-tiles 已退役删除），与原版同构：同纹理瓦片全图复用。
