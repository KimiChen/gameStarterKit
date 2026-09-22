# mapOriginal 素材授权台账

⚠ **本文件是法务 load-bearing 件，⛔ 不得删改字段或降级表述。**
格式与状态词典照 [`apps/plugins/snake/README.md`](../../../plugins/snake/README.md) §2；
口径依据 [`docs/3D-ASSETS.md`](../../../../docs/3D-ASSETS.md) §14「逆向来源（`../sourceVersion/*`）按各自全记录的授权口径，转换产物同样登记」。

| 项 | 值 |
|---|---|
| 上游 | 《三国志·战略版》2084.1768（灵犀互娱/简悦），仓外只读逆向产物 apkdecode/sgzz-1768.2084/ |
| 唯一授权证据 | 用户会话指令（2026-09-22）：「阅读 ../sourceVersion/sgzz-2084.1768/ 项目将其中大地图的实现，在本项目中用一个 kit mapOriginal 来实现，**美术素材完全使用 sgzz-2084.1768**」；同日就入库口径的选项确认：「切片 PNG 直接入库 + 九字段台账」。 |
| 批准日期与负责人 | 2026-09-22 / KimiChen（仓库所有者） |
| 台账生成日期 | 2026-09-22 |
| 状态词典 | 待授权，不得引入 / 已授权，待转换 / 已引入，待验收 / 已验收 / 已移除 |

⛔ **「网上可见」「同一台机器上存在」「旧项目能运行」都不是授权证据。**
⛔ 原始 ELP / KTX / APK **永远留仓外只读**，不入库、不软链、不进 submodule；只入派生产物。
⛔ 只导入实际像素文件；切片、图集布局、UUID 与 `.meta` 全部由本仓重建，⛔ 不复制上游的 import / native 元数据关系。

## A. 入库产物（每个九字段）

| # | Catalog 逻辑名 | 源绝对路径 | SHA-256 | 许可证证据 | 批准 | 目标路径 | 转换/重绘说明 | 新 .meta | 状态 |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `terrain.bytes` | （合成，见说明） | `1de825dd604e7c4bd5938de49d5754017e22ca215502660ea3b24ca5d4f1b67b` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/terrain.bytes` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 2 | `terrain.pass.bytes` | （合成，见说明） | `1aff1ac3de735f49fe5a1fe8b11cf0b6db8b9d19f45bd5275242d8c039d333f2` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/terrain.pass.bytes` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 3 | `terrain.info.json` | （合成，见说明） | `9237f51b5bde23868990c44bbb4845b2cd1caaede24b1876f16bc057d1c83245` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/terrain.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 4 | `atlas-lod0.png` | （合成，见说明） | `d5d19e4d74a8de579b2f0fbfdd980bf9adc0552250a75865b32c0211a9408a1a` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod0.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 5 | `atlas-lod0.info.json` | （合成，见说明） | `ecee6895b9f19b0db47b3d3ed93db2f366a2756ae99f6b431ace4289451f1919` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod0.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 6 | `atlas-lod1.png` | （合成，见说明） | `5bd2d5948edf57f725d2e3c44c67e60c6cf0fd33423f8e5580086fdddc89fa61` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod1.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 7 | `atlas-lod1.info.json` | （合成，见说明） | `5ab7b2e6c53b6745c7b5fb8f2de3a83e0ead295f24a858648d3b049af23ddac6` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod1.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 8 | `atlas-lod2.png` | （合成，见说明） | `f92fbf0f5ffb75cf80ae9a02608d5abcceb56f7d7f70727bd77ec29e2f15d66e` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod2.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 9 | `atlas-lod2.info.json` | （合成，见说明） | `f40a04609429eff293b70b8568b679979b843f6848c585549b6927b237445b43` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod2.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 10 | `plate-lod4.png` | （合成，见说明） | `5c313272089d5af1cd538e6fda4a7ae043455564129e147f0974e93c77bea7eb` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod4.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 11 | `plate-lod4.info.json` | （合成，见说明） | `43cef3b2f467fe8de685fe401f598b58fa5ffe4737b9d7dc04a325b8c1f41dfb` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod4.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 12 | `plate-lod5.png` | （合成，见说明） | `28d8dc01b30fb36b9393457e14efb365ed74c4b1d094c751da0fb5f460df3b7c` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod5.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 13 | `plate-lod5.info.json` | （合成，见说明） | `a7e1f6827adfebd67ef349bca83b0bacfcc7749d271dffa5c75cebc83b3afba0` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod5.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 14 | `minimap.png` | （合成，见说明） | `b6c9328fef36fbae1e29039a5b522ce2367af2abcd1a69a1d95f4fcd98d882a4` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/minimap.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 15 | `minimap-mask.png` | （合成，见说明） | `5606bcf12a163623c995c01c0edb831674d19fcbc183f7f7a922f162808f02eb` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/minimap-mask.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 16 | `decor-atlas.png` | （合成，见说明） | `093773e18d5dc4aca7a3ceec78beb589abe4f820d8c88a3231916c533dd26e6c` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/decor-atlas.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 17 | `decor-atlas.info.json` | （合成，见说明） | `7adb5e41e416d0a879c9e6b175e127f1fdd11d0b09953b5e1d6460c7764933ae` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/decor-atlas.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 18 | `region-atlas.png` | （合成，见说明） | `5bfa100d2ee94b2b9676e7fb61b243e2ef877e921fd83a6c84ac2834402a7749` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/region-atlas.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 19 | `region-atlas.info.json` | （合成，见说明） | `192ec98a612eb7216e199dcba029329d9b203abd8d741b372fef8ccfb85b3bef` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/region-atlas.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 20 | `regions.bin` | （合成，见说明） | `71f5c0cbeb51e529911df54eab77cbb9c154c3641b3580cf9a33ae2af7332b90` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/regions.bin` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 21 | `regions.info.json` | （合成，见说明） | `e797e912416288b410088747d928b0cb8e618ff4284f566c5dc943c36d4d8ff5` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/regions.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 22 | `labels.json` | （合成，见说明） | `ab7b38af0f076d74f43446c280d8f2468de1b8be6a733773bda7cd09e1720cf8` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/labels.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 23 | `plate.calib.json` | （合成，见说明） | `21b1afd3a7489756781ddcb963569e6e920cb2f62e42d7bcf7d368e7d1d0e4b4` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate.calib.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |

## B. 源素材清单（仓外只读，⛔ 不入库）

### B.1 直接解码的原始条目（94）

| Catalog 逻辑名 | ELP 容器/下标 | namehash | 源格式 | 尺寸 | 源 SHA-256 |
|---|---|---|---|---|---|
| `fairy/ui/ui_common_map/map/map_s1/image/noexpo_birdview_map_1.ktx` | `e5038e0e7fc8`/018 | `611353ba9194fa64` | ETC2 RGB | 4096x2048 | `ee36d2dfeaf20008f726e18758911fa4c68c7c53ec719ac519823230af65d641` |
| `ground_down/underground1.ktx` | `7cc5137e33e0`/022 | `48175bd78fb8dbf6` | ETC2 RGB | 256x256 | `30a38ab91b10c918fd53a2279a3b2668cc1504a511addba8af17cd76e6b3d0ee` |
| `ground_down/underground2.ktx` | `7cc5137e33e0`/011 | `f931b4c77058d167` | ETC2 RGB | 256x256 | `c302b0d3f53456b21afa396bddfb636b483c40ee0f4bf6fa00c3887138fd3743` |
| `ground_down/underground3.ktx` | `7cc5137e33e0`/009 | `a0bb7c5d8a043560` | ETC2 RGB | 256x256 | `417e703e89f6a6803760be2069e32b3c8c3baf80e6afbe04da69225587b25862` |
| `ground_down/underground_ashes.ktx` | `9b88c72f3b98`/012 | `66fcc7357aab19ce` | ETC2 RGB | 512x512 | `dd945f054fa66ae4b683483f7623fa8f6427b3fa037e5bb90eac845e2177667e` |
| `scene/_output_atlas_scene/atlas_tex/alliance_extend_build-1.ktx` | `9fe37aeeb6f4`/066 | `0359657cd282078a` | ETC2 RGBA | 928x1768 | `23dbe447f2135101b5ab5b6c4cbf9c795590aecd481fb777a8d36848795a9dc7` |
| `scene/_output_atlas_scene/atlas_tex/alliance_extend_build2-1.ktx` | `532e97b47b58`/000 | `5f0aa8a03a411342` | ETC2 RGBA | 1868x1424 | `d54d7f8fda7744b966dd4dd293dd0749840c88469acce0fdae7e3829a8ea2823` |
| `scene/_output_atlas_scene/atlas_tex/armyline-1.ktx` | `a5becdb1d63a`/107 | `90c20ea147368ae9` | ETC2 RGBA | 512x1076 | `5017d30397d6f3dfc244f838fca7b2f35f723e741c12fcac9d61bfed1c471a89` |
| `scene/_output_atlas_scene/atlas_tex/armyline_i18n-1.ktx` | `a5becdb1d63a`/051 | `e97b774468d31f75` | ETC2 RGBA | 2048x1660 | `5eb275d6c4fa7a22a85062aaba8f57d27c3bf712ff238401e19e3a080360afb2` |
| `scene/_output_atlas_scene/atlas_tex/build_attachment-1.ktx` | `0940cfd8bc70`/025 | `814880594a22fc78` | ETC2 RGBA | 128x908 | `ba9e85e8cefbc32b797992c786921bca255174362fe6b3f4c1f6e47e48971c2c` |
| `scene/_output_atlas_scene/atlas_tex/ext_building_flag-1.ktx` | `a5becdb1d63a`/097 | `ca766349d57cdad7` | ETC2 RGBA | 1256x480 | `8025cffd7438d68ff571b8bbe058e42fe8053e46c5604f917e843328c9169f15` |
| `scene/_output_atlas_scene/atlas_tex/grid-1.ktx` | `a5becdb1d63a`/054 | `4de95185de972579` | ETC2 RGBA | 2044x1652 | `c6e24acfb17387ef3f26f7d0eed970dacd8ebf93223505e0b84f9d47e5c251db` |
| `scene/_output_atlas_scene/atlas_tex/ground-1.ktx` | `a5becdb1d63a`/047 | `01dec89964b6426d` | ETC2 RGBA | 2032x1992 | `c7690ff2be3e7dac76c418724c3b8505c3f0658f59e6a7c432d412a8ead9b714` |
| `scene/_output_atlas_scene/atlas_tex/ground_dibiaohuawen-1.ktx` | `7cc5137e33e0`/021 | `ad783f31d10976f4` | ETC2 RGBA | 492x512 | `ab4b86b2e98019fdb2aef04a56a03e949fbc5409c4f64b7500132ab45e485712` |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_cao-1.ktx` | `0f4a15d1ba13`/024 | `0a32635dd7f380e2` | ETC2 RGBA | 1008x1208 | `81a6d16fe2bcf1cba5aba340b2cb8958a83c8e03e191c0c807de89844dc121f0` |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_keng-1.ktx` | `7cc5137e33e0`/010 | `25c198bc923fbf67` | ETC2 RGBA | 460x436 | `56715f16cd70d8c8dba468b118e040a06540c55c395c7b54c5350d01ba154e8e` |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_tu-1.ktx` | `0f4a15d1ba13`/029 | `c69f828e20de05f7` | ETC2 RGBA | 412x1668 | `b7beb1bbecd153876f6dcfa1e1eddb4310f95419b87c68313ab57a505ee11e3d` |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_xiaolu-1.ktx` | `3d57472208c9`/000 | `8018de83ecd99927` | ETC2 RGBA | 1808x1216 | `ae50cc78cb0f9e81b808719e9842612aa55d8c25cac2fe92723ca8fc43d9745f` |
| `scene/_output_atlas_scene/atlas_tex/ground_qiutian-1.ktx` | `bb518b8b1c2c`/000 | `94c93999898c320f` | ETC2 RGBA | 2028x512 | `fa9710e1c970cac81921c87cb703a79f656cb8579905c875d585680a9af11c90` |
| `scene/_output_atlas_scene/atlas_tex/ground_zhuangshi-1.ktx` | `0737875379a5`/004 | `4b5e662517bea8db` | ETC2 RGBA | 2008x468 | `cfa6fbb60109444e7449bf4db0c782f383450a109cd3b64603b1addf5bccbf23` |
| `scene/_output_atlas_scene/atlas_tex/ground_zhuangshi_manzu-1.ktx` | `f6f3407dba57`/002 | `bc44aff8feace582` | ETC2 RGBA | 464x444 | `6b6385c911d97d832b66b7ddea792b69cf3fa00154c780974a1a9e975722cc5b` |
| `scene/_output_atlas_scene/atlas_tex/ground_zudang-1.ktx` | `0737875379a5`/000 | `3a1dc42b8cbb5b1f` | ETC2 RGBA | 912x1372 | `86720462b4dc58c1b05d39ebd7a29c3726113d10dc07316c357544f479545f87` |
| `scene/_output_atlas_scene/atlas_tex/junying-1.ktx` | `0940cfd8bc70`/036 | `1156889ffc96a89a` | ETC2 RGBA | 2028x1036 | `8c08c67fdd8dc55bb4360b0d62aaf3b07b509ccd7725d5df0a69fa19288af8e1` |
| `scene/_output_atlas_scene/atlas_tex/map_birdview_icons-1.ktx` | `c2d6b2c2549d`/026 | `a750fcd50d4e7278` | ETC2 RGBA | 968x1108 | `757874a0c062937495c4af70b5fb168544f4d08fde7b307df5538b3456d01277` |
| `scene/_output_atlas_scene/atlas_tex/npc_city-1.ktx` | `6f093d8c1555`/002 | `af59b7bb9daaba8a` | ETC2 RGBA | 3584x4044 | `713cd643047d828a7a6724c1b0b805cafa6ec61127a4748fefac686660b579bd` |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask1_5-1.ktx` | `55408de399da`/000 | `4fed230db2f29b13` | ETC2 RGBA | 1848x1896 | `5cb8be17ad08eb8317ea49469f29990c0bdc6ed734d324f5a2a00e55f466e5c2` |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask1_5_yandi-1.ktx` | `55408de399da`/020 | `b4bbc19193c1ead2` | ETC2 RGBA | 1940x1996 | `ed47f01546322ef7392ee6202e772416138588df593506b86e66cc20ca4ee97b` |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask_other-1.ktx` | `55408de399da`/010 | `bb534c72c1053a79` | ETC2 RGBA | 1896x1648 | `28d95559ca5e3be81c90746ea7a35540c7fb7b35b56bfad7434dd1a01c0fc9db` |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask_other_yandi-1.ktx` | `033864811b81`/022 | `217d0f865478c2c8` | ETC2 RGBA | 1992x1720 | `cf1f953e391aa40de58f6b74d8967c0a98cb5e35ca72b38c1bccac5f3953648b` |
| `scene/_output_atlas_scene/atlas_tex/player_city-1.ktx` | `e9d889ebeb24`/001 | `f313c1df0660640b` | ETC2 RGBA | 2036x1820 | `fc7c886b9e2fc2d936fa9db5eb0410ae7c9eff2badcc64d555caa89ba36bf2a3` |
| `scene/_output_atlas_scene/atlas_tex/player_city_1-1.ktx` | `502aee60be67`/003 | `08c2830a2a1c593c` | ETC2 RGBA | 1916x1408 | `37b4dc96043b293265df1cc52d3bcdfb28ad8f068052927e3ed0c347f1d04df1` |
| `scene/_output_atlas_scene/atlas_tex/player_city_2-1.ktx` | `9b26c6832d5e`/060 | `b7692dd89c195e73` | ETC2 RGBA | 1440x1024 | `d9bfcdb53e2c8e2080c1d32672ab8e43a6db7367fbe5f0b7dfdc9899e6c7b160` |
| `scene/_output_atlas_scene/atlas_tex/player_city_3-1.ktx` | `9b26c6832d5e`/017 | `268ce2dd6873702a` | ETC2 RGBA | 1020x1688 | `f950b5d5d75351985fbc6e8aeefd2dfa0d9db99f7dda586c397387e5dc209921` |
| `scene/_output_atlas_scene/atlas_tex/player_city_4-1.ktx` | `0c3ed3a2b8b8`/039 | `0366aa2ef38234eb` | ETC2 RGBA | 1024x1288 | `9d48da3b47ee4a35ba8712754e2e985ad231603b5d05e7ecf2ac43452562fcf7` |
| `scene/_output_atlas_scene/atlas_tex/player_city_5-1.ktx` | `4bb3cabcdc2a`/010 | `07f4864b58dfb59d` | ETC2 RGBA | 992x1848 | `e6102e9c235383856e68a802a4463855a6d4110f4a9a94f9488046bafe2d6e08` |
| `scene/_output_atlas_scene/atlas_tex/player_city_i18n-1.ktx` | `aaf4b339bf15`/014 | `a980fb1279db43a8` | ETC2 RGBA | 1588x1012 | `7f4c19827d83c7dfcc8ffc41f76e12f714566752cfd4344156b8c1252953a007` |
| `scene/_output_atlas_scene/atlas_tex/player_city_i18n_2-1.ktx` | `aaf4b339bf15`/000 | `0c9451261d9e8308` | ETC2 RGBA | 1588x1012 | `7617340ba2318c3cb6ba2c105450906e6aa6b0dbe9293bf5053dfb0e00f0da9b` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-1.ktx` | `0c3ed3a2b8b8`/000 | `dbdefc2f5f23e506` | ETC2 RGBA | 2048x2048 | `d49024026f623910601c300915633ad545078c5eaf1fa114f1c6c3bfb7f84d96` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-10.ktx` | `a5becdb1d63a`/066 | `43bb893878dfca89` | ETC2 RGBA | 2048x2048 | `5fde681da035dd9ef76ff40ddd8b4bc991ef2dd29825f18729bcfd979709eaaa` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-11.ktx` | `6f093d8c1555`/004 | `a1881fb31b567cc0` | ETC2 RGBA | 2048x2048 | `dbcb914f67799a6d90dbe99f36645a7a060da950dd3217307d45b29be219681a` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-12.ktx` | `6f093d8c1555`/003 | `7e97eef513db19b6` | ETC2 RGBA | 2048x2048 | `5d1e7725088927ca002a2787c9ee175d1fea7bef15d8526e664a581ebcf5110b` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-13.ktx` | `6f093d8c1555`/000 | `0eed54f802d66d16` | ETC2 RGBA | 2048x2048 | `5447db848b3df535a61a068b6854d350786666ac7c2958388fec455427b15d6f` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-14.ktx` | `6f093d8c1555`/001 | `29bef74fff34fb4b` | ETC2 RGBA | 2048x2048 | `f4692714c7e9f0992844059a27b743afb7376d61d50077789f04b23d8c59d3f8` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-15.ktx` | `45ccdbdf548c`/004 | `964caa899dcd3a8e` | ETC2 RGBA | 2048x2048 | `a309f4f32b372d2fc791d7ae0749685c5d73d024480d3437471f7a09165f8a96` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-16.ktx` | `75d12d14d011`/016 | `902a5518e937b3e0` | ETC2 RGBA | 2048x2048 | `bb4d0365f7e70f42956c295abeda934a385a75ac4953f80b052dde1b9dc8cc2f` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-17.ktx` | `75d12d14d011`/012 | `0e4c6faa57c05071` | ETC2 RGBA | 1840x1580 | `349f388712b0c64a1379351e4ef8463978119a3a8e390061bc7ddb400feada4c` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-2.ktx` | `0c3ed3a2b8b8`/001 | `71ff54498c24950c` | ETC2 RGBA | 2048x2048 | `841f0403ce61ffcde7178dd793106decfbac375c8829747c17ce53cb96532ea8` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-3.ktx` | `0c3ed3a2b8b8`/033 | `151520fb365949cc` | ETC2 RGBA | 2048x2048 | `8c371217d8a48d9cf183014a4c69a5b1c7f93e4d8ad72236a468e7b8d2792e1d` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-4.ktx` | `75d12d14d011`/003 | `1673d8ad01360024` | ETC2 RGBA | 2048x2048 | `e8164d24f2f9d6e3ea02c242b33ecbf08839c86c0668cc09f18babbd92a97058` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-5.ktx` | `2411143473bb`/019 | `ad80e80cb28bf866` | ETC2 RGBA | 2048x2048 | `cef121af5b06c328be63bce0c48ada829df6bb47bef1dfa13dbc79f02727a330` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-6.ktx` | `93f2f0085443`/007 | `fa39a61c35933d78` | ETC2 RGBA | 2048x2048 | `a64fe6e66c6b21be2d61d2cba256c510bfff7a345bf820e2f8373602ea542c08` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-7.ktx` | `45ccdbdf548c`/008 | `623916256a9eb4e3` | ETC2 RGBA | 2048x2048 | `2f130c9c380b804d037edaabb7da428adc75bf2c5af5b9ac39a44fbf7c5f6363` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-8.ktx` | `45ccdbdf548c`/007 | `41777310944fe4da` | ETC2 RGBA | 2048x2048 | `e3e4741a8d64e7b35a6a04b9ce0b920a9b31a42eeff0f9dc811a752fb34adc2e` |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-9.ktx` | `45ccdbdf548c`/002 | `2bfcc3261d894327` | ETC2 RGBA | 2048x2048 | `2595e347d19857d7fc6931ba5c20dfeb32c7327f1d54b632e1c5b7bf466460b9` |
| `scene/_output_atlas_scene/atlas_tex/resource-1.ktx` | `502aee60be67`/007 | `fd75c85b77a58657` | ETC2 RGBA | 2044x2032 | `f9c7ad61ee75b8e7d4a789c532389008b7d51b2785d3c0f86be63cb3f96175fe` |
| `scene/_output_atlas_scene/atlas_tex/resource_food-1.ktx` | `502aee60be67`/014 | `b028ebe646c41a91` | ETC2 RGBA | 2048x1200 | `184c82202e16af4d17fdcc4f8d003fe30ca2f39dc2c27e59c664786923d7cf10` |
| `scene/_output_atlas_scene/atlas_tex/resource_gold-1.ktx` | `c3055a29ef82`/003 | `265cd62c61f8d821` | ETC2 RGBA | 496x1368 | `fdc6811d01e1160804eef06d8c40475c3cbc33b100e3ea441667526136266f43` |
| `scene/_output_atlas_scene/atlas_tex/road-1.ktx` | `ec05793043d0`/001 | `210779c4da7b0311` | ETC2 RGBA | 1008x1252 | `7879b463842ae4d7ce261852c41502b33d578fc557a4698fa25af231f8d89e88` |
| `scene/_output_atlas_scene/atlas_tex/road_direct-1.ktx` | `55408de399da`/014 | `57d7e4b58e8cafae` | ETC2 RGBA | 256x820 | `52daad9faf052c32084cf282a3054d58af95292f83ae72b1e371b59a24e61e7b` |
| `scene/_output_atlas_scene/atlas_tex/road_liangdao-1.ktx` | `3db0a0406be2`/000 | `ae078ef9aa186c68` | ETC2 RGBA | 2044x1892 | `595e0d19b3b18ba89b411635bd9e348e3d1b5f2c17f192d080d8531001d05aff` |
| `scene/_output_atlas_scene/atlas_tex/road_liangdao-2.ktx` | `3db0a0406be2`/001 | `203830c5513e67b1` | ETC2 RGBA | 1944x1948 | `45f0698af4e303d267eaf69487ed7dc5bb21bf50f1bdf84d592a4694bfeb058f` |
| `scene/_output_atlas_scene/atlas_tex/road_official-1.ktx` | `0e22aa707f4d`/001 | `269e4a70c67a553c` | ETC2 RGBA | 2032x2048 | `477c5d1232b8b9b77d2736fd366c0e70e52a200bfd9ba1fda72e8d9eafd81997` |
| `scene/_output_atlas_scene/atlas_tex/road_official-2.ktx` | `0e22aa707f4d`/002 | `9557182527f2f695` | ETC2 RGBA | 1788x904 | `1afc4aa234b7f07aef895fd0f237e1aba5ed237d2f941d7145acf38480d6f512` |
| `scene/_output_atlas_scene/atlas_tex/small_build-1.ktx` | `ec05793043d0`/010 | `de3864e73f51c190` | ETC2 RGBA | 2036x2012 | `6626d09214d1392560f1090457aea433236a009ca908329c30a3ffbef0bd1006` |
| `scene/_output_atlas_scene/atlas_tex/small_build-2.ktx` | `75d12d14d011`/013 | `3b99958b7eb78472` | ETC2 RGBA | 1628x496 | `18e7f10b611f7bc2f9a6c99ebd745c2610057abdbd768de691e4b13fd6bedd31` |
| `scene/_output_atlas_scene/atlas_tex/small_build_1-1.ktx` | `502aee60be67`/019 | `db8b8269f83ad7b7` | ETC2 RGBA | 844x116 | `b5adf63dbab16626f2b009b002786b1735dfb165265034260813abe17d0afaea` |
| `scene/_output_atlas_scene/atlas_tex/small_build_2-1.ktx` | `ec05793043d0`/000 | `af60f4c19faaf808` | ETC2 RGBA | 968x1440 | `3c87645a019f418ade7448b811774002eae55875b8c7a73698bfd6362ec8d640` |
| `scene/_output_atlas_scene/atlas_tex/small_build_3-1.ktx` | `20fc60c74025`/009 | `cbfdd637aa92bd20` | ETC2 RGBA | 1012x1048 | `91e61f5d6d9d2777e3c044475e4b9b62f23b783e15789905efa0177d3e2fb271` |
| `scene/_output_atlas_scene/atlas_tex/small_build_i18n-1.ktx` | `0f4a15d1ba13`/014 | `d17921621b014875` | ETC2 RGBA | 328x208 | `f12d8dccd80b734d33394180320b5b584db56e4a6e2635fd9520ac34934460b1` |
| `scene/ground/caodi_gan/png/tt_01.ktx` | `7021cff61b46`/290 | `37efbfa69aea5510` | ETC2 RGBA | 512x512 | `eaf83868cdd685e9df1509368737a36189fa322d73c3e2d5c6437e168ac195d6` |
| `scene/ground/caodi_gan/png/tt_02.ktx` | `7021cff61b46`/814 | `695d358046bf352e` | ETC2 RGB | 512x512 | `2d440d1e0f174a57e1ea86e5862b1ae6686b8380e75bc122248117eb1ea84022` |
| `scene/ground/caodi_gan/png/tt_04.ktx` | `7021cff61b46`/3141 | `0e26214c30c909b6` | ETC2 RGBA | 512x512 | `f117b75b2fe007469804b5f50d2600db51f5c703160ded605173ab4574d00893` |
| `scene/ground/caodi_huijin/png/1.ktx` | `951007466ddb`/042 | `ca02177e01146b63` | ETC2 RGBA | 1201x601 | `7cd771bb52ff8565a89c283432b6651691e3113067cb251e956e202da2cf69de` |
| `scene/ground/caodi_huijin/png/3.ktx` | `951007466ddb`/083 | `b31f8c8603d4ceb8` | ETC2 RGBA | 744x374 | `d00eda5d0a744a113467b84ae7f95bed941df4aedfcbbfa20127de9da2ba79dc` |
| `scene/ground/caodi_huijin/png/4.ktx` | `951007466ddb`/054 | `ae8ce1f9a4f8e87e` | ETC2 RGBA | 744x374 | `299a7acd553dbbd33328d78463a4f2e3aee06b0da048979e9be66d8c70ed3e52` |
| `scene/ground/caodi_huijin/png/tt_01.ktx` | `951007466ddb`/065 | `9ed4e978277a9e97` | ETC2 RGBA | 512x512 | `eaf83868cdd685e9df1509368737a36189fa322d73c3e2d5c6437e168ac195d6` |
| `scene/ground/caodi_huijin/png/tt_02.ktx` | `951007466ddb`/016 | `c77dbd5fe94e8823` | ETC2 RGB | 512x512 | `8bd3cb4611cac8becd60d16977fc083b688c5634a68ece303d9c23ad61d8d568` |
| `scene/ground/caodi_huijin/png/tt_04.ktx` | `951007466ddb`/062 | `23dae16afaae2895` | ETC2 RGBA | 512x512 | `f117b75b2fe007469804b5f50d2600db51f5c703160ded605173ab4574d00893` |
| `scene/ground/caodi_shi/png/tt_01.ktx` | `f80f251905f6`/102 | `1eb3c1fc99b196d3` | ETC2 RGBA | 512x512 | `eaf83868cdd685e9df1509368737a36189fa322d73c3e2d5c6437e168ac195d6` |
| `scene/ground/caodi_shi/png/tt_02.ktx` | `f80f251905f6`/084 | `0a3b98299a410ca7` | ETC2 RGB | 512x512 | `a92ed6141f7b977ef4e6f38b737ef91a13903a62c78c8c161496d86f7c7801b9` |
| `scene/ground/caodi_shi/png/tt_04.ktx` | `f80f251905f6`/005 | `c2d11ddbeab72909` | ETC2 RGBA | 512x512 | `f117b75b2fe007469804b5f50d2600db51f5c703160ded605173ab4574d00893` |
| `scene/ground/dongtu_tuxue/png/tt_01.ktx` | `111a419f35b0`/012 | `2337bed3dbb06e22` | ETC2 RGBA | 512x512 | `eaf83868cdd685e9df1509368737a36189fa322d73c3e2d5c6437e168ac195d6` |
| `scene/ground/dongtu_tuxue/png/tt_02.ktx` | `111a419f35b0`/083 | `b1f7d8702b3a418a` | ETC2 RGB | 512x512 | `ef525d857428dcb6594b33ad643ec0ec1bd1f67523ade4375f200f2b11fb624b` |
| `scene/ground/dongtu_tuxue/png/tt_04.ktx` | `111a419f35b0`/126 | `e220ee75cfeffdd4` | ETC2 RGBA | 512x512 | `f117b75b2fe007469804b5f50d2600db51f5c703160ded605173ab4574d00893` |
| `scene/ground/huangmo/png/tt_01.ktx` | `f80f251905f6`/117 | `75d7f0dde7d124f0` | ETC2 RGBA | 512x512 | `eaf83868cdd685e9df1509368737a36189fa322d73c3e2d5c6437e168ac195d6` |
| `scene/ground/huangmo/png/tt_02.ktx` | `f80f251905f6`/000 | `96d93f645f9b1b01` | ETC2 RGB | 512x512 | `be6a34a1a95030ca13bcc1a77401cf10f988be8f827bac17254ea7ae91753f78` |
| `scene/ground/huangmo/png/tt_04.ktx` | `f80f251905f6`/046 | `adb6456a4eb2975c` | ETC2 RGBA | 512x512 | `f117b75b2fe007469804b5f50d2600db51f5c703160ded605173ab4574d00893` |
| `scene/ground/senlin/png/tt_01.ktx` | `5bfce0e329d0`/4031 | `e5bf9f1db5b169f7` | ETC2 RGBA | 512x512 | `eaf83868cdd685e9df1509368737a36189fa322d73c3e2d5c6437e168ac195d6` |
| `scene/ground/senlin/png/tt_02.ktx` | `5bfce0e329d0`/3798 | `2e89b712f8084bea` | ETC2 RGB | 512x512 | `4c5459b6398cb09f0118f8d52cca16eeee1b5c2a55f4db322181ebd171484c23` |
| `scene/ground/senlin/png/tt_04.ktx` | `7021cff61b46`/1661 | `6cd1ebaafc79905e` | ETC2 RGBA | 512x512 | `f117b75b2fe007469804b5f50d2600db51f5c703160ded605173ab4574d00893` |
| `scene/ground/zhaoze/png/10.ktx` | `ccbf9e04dbfb`/059 | `3e599ab4543123ee` | ETC2 RGBA | 1652x827 | `3bba9d870177c022f0a1a5180cc46859d3e5c670de9643d6af0bc56c1b0c1e90` |
| `scene/ground/zhaoze/png/tt_01.ktx` | `ccbf9e04dbfb`/021 | `32d8e0feac2bee5a` | ETC2 RGBA | 512x512 | `eaf83868cdd685e9df1509368737a36189fa322d73c3e2d5c6437e168ac195d6` |
| `scene/ground/zhaoze/png/tt_02.ktx` | `ccbf9e04dbfb`/041 | `572aeee9f8d23caa` | ETC2 RGBA | 512x512 | `4f3b66de1328f5de735f688fa2b4909b11f67a23f8e7e8a6d3034f172752b6ba` |
| `scene/ground/zhaoze/png/tt_04.ktx` | `ccbf9e04dbfb`/026 | `4dc30723d6504e6f` | ETC2 RGBA | 512x512 | `f117b75b2fe007469804b5f50d2600db51f5c703160ded605173ab4574d00893` |

### B.2 图集切片（5418 张，来自上表的图集页）

| 来源图集页 | 切出 | 说明 |
|---|---:|---|
| `scene/_output_atlas_scene/atlas_tex/alliance_extend_build-1.png` | 44 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/alliance_extend_build2-1.png` | 69 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/armyline-1.png` | 38 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/armyline_i18n-1.png` | 180 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/build_attachment-1.png` | 37 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ext_building_flag-1.png` | 465 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/grid-1.png` | 97 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground-1.png` | 49 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_dibiaohuawen-1.png` | 8 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_cao-1.png` | 8 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_keng-1.png` | 8 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_tu-1.png` | 8 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_pk24_decal_xiaolu-1.png` | 8 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_qiutian-1.png` | 10 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_zhuangshi-1.png` | 39 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_zhuangshi_manzu-1.png` | 6 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ground_zudang-1.png` | 34 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/junying-1.png` | 276 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/map_birdview_icons-1.png` | 141 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/npc_city-1.png` | 572 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask1_5-1.png` | 5 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask1_5_yandi-1.png` | 5 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask_other-1.png` | 4 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/npc_city_flood_mask_other_yandi-1.png` | 4 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city-1.png` | 198 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city_1-1.png` | 187 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city_2-1.png` | 115 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city_3-1.png` | 117 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city_4-1.png` | 44 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city_5-1.png` | 51 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city_i18n-1.png` | 2 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/player_city_i18n_2-1.png` | 2 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-1.png` | 36 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-10.png` | 49 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-11.png` | 60 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-12.png` | 92 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-13.png` | 92 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-14.png` | 107 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-15.png` | 104 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-16.png` | 163 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-17.png` | 232 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-2.png` | 25 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-3.png` | 21 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-4.png` | 57 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-5.png` | 49 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-6.png` | 56 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-7.png` | 34 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-8.png` | 37 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/remain_tex-9.png` | 70 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/resource-1.png` | 186 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/resource_food-1.png` | 398 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/resource_gold-1.png` | 28 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/road-1.png` | 58 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/road_direct-1.png` | 20 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/road_liangdao-1.png` | 11 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/road_liangdao-2.png` | 23 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/road_official-1.png` | 14 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/road_official-2.png` | 6 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/small_build-1.png` | 263 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/small_build-2.png` | 87 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/small_build_1-1.png` | 15 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/small_build_2-1.png` | 135 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/small_build_3-1.png` | 58 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/small_build_i18n-1.png` | 1 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |

完整逐张记录见仓外 `tools/maporiginal-assets/out/{sources,sprites}.jsonl`（已 gitignore，可由管线复现）。
