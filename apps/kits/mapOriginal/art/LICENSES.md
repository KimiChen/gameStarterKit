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
| 1 | `terrain.bytes` | （合成，见说明） | `a77826d39e72e677f1f4c25e258ed5f7dbf2c966050c6fe6e21788f2737604a3` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/terrain.bytes` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 2 | `terrain.pass.bytes` | （合成，见说明） | `27a36a16754c83de04bb4816c8b1d31df3dcc132ca5e7d2a392f23e35d3718e2` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/terrain.pass.bytes` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 3 | `terrain.info.json` | （合成，见说明） | `22033c1d5261585b86c366324390cf1e7e08ec7abc315b7ea02a95ff8df4ca97` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/terrain.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 4 | `atlas-lod0.png` | （合成，见说明） | `8b8911a09075806ec8aa393866e1adeb4956c74761efc053e0aba34db8334690` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod0.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 5 | `atlas-lod0.info.json` | （合成，见说明） | `53d56c8a158041da89526a59a7527fe58369f4f1bc9bd8a8944487ebfd7275d8` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod0.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 6 | `atlas-lod1.png` | （合成，见说明） | `87cf1d86d8374b46c00a3bc005f4077ae939a25fc9da76e15ab2c3c311edf932` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod1.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 7 | `atlas-lod1.info.json` | （合成，见说明） | `88812908bc79c870bcb27951d9557b7cc23601a12bb6213b8f8f91443e8dc7dd` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod1.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 8 | `atlas-lod2.png` | （合成，见说明） | `bef57c68c6cfa57931f59a84b2c37d3f428ac1195c11d6dcabe010446c6124f6` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod2.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 9 | `atlas-lod2.info.json` | （合成，见说明） | `e2724df5613f7eabecfc902ac3efb7cf96dac1d703b7be91c40ac7d559833f44` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/atlas-lod2.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 10 | `plate-lod4.png` | （合成，见说明） | `da7ed3e14f873552b497990f8ee3da9b203c76a41f712958645b746c7e304f4d` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod4.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 11 | `plate-lod4.info.json` | （合成，见说明） | `43cef3b2f467fe8de685fe401f598b58fa5ffe4737b9d7dc04a325b8c1f41dfb` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod4.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 12 | `plate-lod5.png` | （合成，见说明） | `2a2ed0492964cbe33b1e0dedd850d7d0a37b7a1a66ec14839570e01b86d29107` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod5.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 13 | `plate-lod5.info.json` | （合成，见说明） | `a7e1f6827adfebd67ef349bca83b0bacfcc7749d271dffa5c75cebc83b3afba0` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate-lod5.info.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 14 | `minimap.png` | （合成，见说明） | `b6c9328fef36fbae1e29039a5b522ce2367af2abcd1a69a1d95f4fcd98d882a4` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/minimap.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 15 | `minimap-mask.png` | （合成，见说明） | `5606bcf12a163623c995c01c0edb831674d19fcbc183f7f7a922f162808f02eb` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/minimap-mask.png` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |
| 16 | `plate.calib.json` | （合成，见说明） | `21b1afd3a7489756781ddcb963569e6e920cb2f62e42d7bcf7d368e7d1d0e4b4` | 见抬头 | 见抬头 | `apps/kits/mapOriginal/data/maps/s1/plate.calib.json` | 由 tools/maporiginal-assets 管线从原版数据层/贴图派生（见 out/sources.jsonl） | `本仓确定性铸造 uuid=sha1(mapOriginal::<相对路径>)` | 已引入，待验收 |

## B. 源素材清单（仓外只读，⛔ 不入库）

### B.1 直接解码的原始条目（29）

| Catalog 逻辑名 | ELP 容器/下标 | namehash | 源格式 | 尺寸 | 源 SHA-256 |
|---|---|---|---|---|---|
| `fairy/atlas_3d/map_s1-1.ktx` | `61df8ff71af3`/028 | `d1e8924f18fb9b94` | ASTC 4x4 | 1648x216 | `aba75c1c736d09fd24364ac7bf74cfa1058bea2128893a2f20c0308e06f949ce` |
| `fairy/ui/ui_common_map/map/map_s1/image/noexpo_birdview_map_1.ktx` | `e5038e0e7fc8`/018 | `611353ba9194fa64` | ETC2 RGB | 4096x2048 | `ee36d2dfeaf20008f726e18758911fa4c68c7c53ec719ac519823230af65d641` |
| `scene/_output_atlas_scene/atlas_tex/alliance_extend_build-1.ktx` | `9fe37aeeb6f4`/066 | `0359657cd282078a` | ETC2 RGBA | 928x1768 | `23dbe447f2135101b5ab5b6c4cbf9c795590aecd481fb777a8d36848795a9dc7` |
| `scene/_output_atlas_scene/atlas_tex/armyline-1.ktx` | `a5becdb1d63a`/107 | `90c20ea147368ae9` | ETC2 RGBA | 512x1076 | `5017d30397d6f3dfc244f838fca7b2f35f723e741c12fcac9d61bfed1c471a89` |
| `scene/_output_atlas_scene/atlas_tex/armyline_i18n-1.ktx` | `a5becdb1d63a`/051 | `e97b774468d31f75` | ETC2 RGBA | 2048x1660 | `5eb275d6c4fa7a22a85062aaba8f57d27c3bf712ff238401e19e3a080360afb2` |
| `scene/_output_atlas_scene/atlas_tex/build_attachment-1.ktx` | `0940cfd8bc70`/025 | `814880594a22fc78` | ETC2 RGBA | 128x908 | `ba9e85e8cefbc32b797992c786921bca255174362fe6b3f4c1f6e47e48971c2c` |
| `scene/_output_atlas_scene/atlas_tex/ext_building_flag-1.ktx` | `a5becdb1d63a`/097 | `ca766349d57cdad7` | ETC2 RGBA | 1256x480 | `8025cffd7438d68ff571b8bbe058e42fe8053e46c5604f917e843328c9169f15` |
| `scene_3d/ground/dibiaohuawen/tex/xiaobujian_ao.ktx` | `a75045aa8a4e`/001 | `8dcc797f65f0e307` | ASTC 5x5 | 128x128 | `467a97fb23da7b7234694da65c55e8e786fd16f7861a6d4144377c46639e3966` |
| `scene_3d/ground/dibiaohuawen/tex/xiaobujian_d.ktx` | `a75045aa8a4e`/011 | `d70ad077d42c8c3c` | ASTC 4x4 | 256x256 | `8786c9de7a1c7c200fbc06ab51a8d357f036b14d6dbf45578c8d96b6534a9a24` |
| `scene_3d/ground/dibiaohuawen/tex/xiaobujian_n.ktx` | `a75045aa8a4e`/008 | `44787f7bde517231` | ASTC 5x5 | 128x128 | `b9b4307bfecfa0bc47eb0a4eb4ddf72f7ff0725aeb35eede8baccbf713c3ddb1` |
| `scene_3d/ground/dibiaohuawen_snow/tex/xiaobujian_d.ktx` | `841dec2808ff`/004 | `61303b27443c5448` | ASTC 4x4 | 256x256 | `4e086f70bb74f5d1746dba1644c0b31ed5a6cb2edbfaa6932b01aae08ddc1c96` |
| `scene_3d/ground/gaodi/tex/grass.ktx` | `d0c71efd65b5`/002 | `fe1bacffddf95595` | ETC2 RGBA | 1024x1024 | `8806ef567c06bcbc0da8c346ce986740f127f09922498a5921e0048a389c9d62` |
| `scene_3d/ground/gaodi_shan/tex/m_grass_xl_04_d.ktx` | `a75045aa8a4e`/030 | `a56da4669ab4e2b8` | ASTC 4x4 | 256x256 | `457d65264871c1267be979f4577b10cbc5e6441bad6d577e205d88ff4af20f1b` |
| `scene_3d/ground/gaodi_shan/tex/m_grass_xl_04_n.ktx` | `a75045aa8a4e`/022 | `bd7e7d8e5cd8ac7e` | ASTC 5x5 | 256x256 | `ca43f6a80c743f9dba0b5a8bf00c947f3a29ed3136feef6008bbec6b96234d74` |
| `scene_3d/ground/gaodi_snow/tex/grass.ktx` | `cfaee0a1ccc7`/011 | `0da4131db3fdaa4b` | ETC2 RGBA | 1024x1024 | `8806ef567c06bcbc0da8c346ce986740f127f09922498a5921e0048a389c9d62` |
| `scene_3d/ground/gaodi_snow/tex/zhandao_02_d.ktx` | `cfaee0a1ccc7`/005 | `ea301e6a80695416` | ASTC 4x4 | 1024x1024 | `3a4869d5df21a752eef83af2b846cf66e19035b332abfbb6f4b7ed1f2d165eac` |
| `scene_3d/ground/mountain_new/grass/tex/m_grass_xl_slope_01_d.ktx` | `8b6c7178848c`/007 | `be19842491fe13e7` | ASTC 4x4 | 1024x1024 | `3db44f823791fc8182e37c5b0e77b741ce03c032dce6a1d180679671e8f88481` |
| `scene_3d/ground/mountain_new/grass/tex/m_grass_xl_slope_03_d.ktx` | `8b6c7178848c`/006 | `b5247573b90fe3e5` | ASTC 4x4 | 1024x1024 | `22258d86a3a125c66ed5890a0553cbfde076f209767d8847279b4d79623f98cf` |
| `scene_3d/ground/mountain_new/grass_fall/tex/m_grass_fall_xl_slope_01_d.ktx` | `e74671e85297`/003 | `23850e64c739238e` | ASTC 4x4 | 1024x1024 | `d15f1de6b948133e4398fa7fbba2dbb2e674bde006111a6af5c7193d1cc5b95f` |
| `scene_3d/ground/mountain_new/grass_fall/tex/m_grass_fall_xl_slope_03_d.ktx` | `e74671e85297`/006 | `84ea44a18f2792d2` | ASTC 4x4 | 1024x1024 | `e057c07973a3d8f35f96652f2da40b306a94db773d9351761983b1912f1a306a` |
| `scene_3d/ground/mountain_new/th_shan/tex/m_grass_xl_slope_01_d.ktx` | `00a67a7a5aa7`/011 | `a93a5207470f5a8d` | ASTC 4x4 | 1024x1024 | `3db44f823791fc8182e37c5b0e77b741ce03c032dce6a1d180679671e8f88481` |
| `scene_3d/ground/mountain_new/th_shan/tex/m_grass_xl_slope_03_d.ktx` | `00a67a7a5aa7`/007 | `c3cfed48e5673474` | ASTC 4x4 | 1024x1024 | `22258d86a3a125c66ed5890a0553cbfde076f209767d8847279b4d79623f98cf` |
| `scene_3d/ground/terrain/albedo_river_v2.ktx` | `32bfb38b3af7`/010 | `f6380b0cebe6e59a` | ETC2 RGBA | 512x64 | `f01e803fa9d75010c7d461fceb56c40b9bf63f046d0d6f4cb29be3c86c35395c` |
| `scene_3d/ground/terrain/albedo_sky_day.ktx` | `32bfb38b3af7`/019 | `b2c23fbc6d9c51ff` | ETC2 RGB | 256x256 | `f60dd95e28e0a4de8bd9084e95432387387520b7c1ef72f68f8af626717c8ea7` |
| `scene_3d/ground/terrain/normal_river_v2.ktx` | `35ba29becc16`/007 | `b1bdc3fa65cc5c30` | ETC2 RGBA | 512x64 | `84b3fe1394a411ff1799867f33b55e120dae7219ff5248e1c431d4a88626f4db` |
| `scene_3d/pcg_v5/water/bank.ktx` | `450f93c60d8c`/034 | `33056a7a52a88dcd` | ETC2 RGBA | 256x256 | `f55af030aef823473c5e0d609666a62ac9a90886461787f23831cbaa1b4d91bd` |
| `scene_3d/pcg_v5/water/mask_white.ktx` | `450f93c60d8c`/017 | `34726531f09b2c91` | ASTC 4x4 | 8x8 | `5b501ea7786f7b89f9dbacedcf297b5ab4f57ab48338df414c36a51e5035dd07` |
| `scene_3d/pcg_v5/water/normal.ktx` | `450f93c60d8c`/006 | `a92ed37894457431` | ETC2 RGBA | 256x256 | `53a079505b0121fcd0d73d7f15a1e15e246d08d9e217080437c6999958cccae9` |
| `scene_3d/pcg_v5/water/whitwave.ktx` | `71dabfcff0b0`/086 | `e67f46b168bc2a95` | ETC2 RGBA | 64x64 | `7e6deb7e3bce0403f08148f5da147fb4b49e2f1156cdc7eb8702977093108323` |

### B.2 图集切片（805 张，来自上表的图集页）

| 来源图集页 | 切出 | 说明 |
|---|---:|---|
| `fairy/atlas_3d/map_s1-1.ktx` | 41 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/alliance_extend_build-1.png` | 44 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/armyline-1.png` | 38 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/armyline_i18n-1.png` | 180 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/build_attachment-1.png` | 37 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |
| `scene/_output_atlas_scene/atlas_tex/ext_building_flag-1.png` | 465 | 按同名 `<TextureAtlas>` XML 的 sprite 矩形切出，含解旋转(`r="y"`)与去白边还原(`oW/oH/oX/oY`) |

完整逐张记录见仓外 `tools/maporiginal-assets/out/{sources,sprites}.jsonl`（已 gitignore，可由管线复现）。
