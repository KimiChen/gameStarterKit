# 《Underground Idle》IdleMain FairyGUI 装配契约

> [返回总目录](README.md) · [上一篇：主界面视觉落地与效果图任务书](08-main-screen-art-brief.md) ·
> [下一篇：图片标注到 FairyGUI 自动编译实时计划](10-image-to-fairygui-live-plan.md)
>
> 文档版本：0.1<br>
> 编写日期：2026-08-28<br>
> 当前状态：`初始装配契约 / IdleMain 尚未制作、发布或接线`<br>
> 目标：在 ART-01～ART-09 首次制作并通过审稿后，将其装成可状态化、可绑定、可在 Creator 验收的主界面

## 1. 拟定真源与初始状态

FairyGUI 包名固定为 `idle`，主组件固定为 `IdleMain`，设计画板为 `750×1624`、左上原点、`MatchWidth`。
设计真源目标目录为 `apps/art/fairygui/assets/idle/`。该路径、包、组件、发布物、绑定代码和业务接线均属于首次
实施任务，不能因本文列出名称就视为已经存在。常规制作优先由 FairyGUI Editor 写入；只有获得项目负责人对
明确文件范围的显式授权时，才允许直接维护 XML。手工维护后必须同时通过 XML 解析、编辑器整项目重载、单包
发布、代码生成漂移检查和 Creator 导入，不能只凭文本 diff 宣称可用。

初始状态全部为 `未开始`：

- 等待 08 文档的效果图、规范板、1500×3248 分层 Master 与 ART-01～ART-09 通过对应 Gate；
- 等待创建 `idle / IdleMain`、`HotspotButton`、`WarehouseProgress`、根绑定、controller 与九宫格；
- 等待 FairyGUI Editor 首次发布 `idle.bin`、图集和独立纹理，再由 Creator 生成稳定 `.meta`；
- 等待生成或实现 `IdleMainView`、结构契约、动态注册和纯 TypeScript `IdleMainLogic`；
- 等待按 02～05 的权威边界实现 shared/服务端 RPC、客户端网络 port、三页签与结果未知恢复；
- 等待通过第 8 节完整 Creator 状态矩阵与 ART-09 程序动效/性能终检。

如为审稿增加固定只读预览数据，它只能用于视觉验收，不能替代权威玩法存档；正式路径必须从服务端完整快照
自愈。

资源与约束的真相优先级：玩法/数值见 02～04，视觉语义见 07～08；生产文件创建后以各包 `manifest.json`
登记的 pivot/九宫格为准；本文件约束首次编辑器节点、坐标和状态组合。

## 2. 导入边界

### 2.1 拟定首屏最小集

| 包 | 首屏导入内容 | 关键属性 |
| --- | --- | --- |
| ART-01 | `00_BACKGROUND`、`10_STRUCTURE`、`50B_FRONT_OCCLUSION`、`60_LIGHT_FX` 四张 PNG | 1500×3248 同画布；显示 750×1624；禁止 tight crop；灯光优先 `screen` |
| ART-03 | mine/hoist/warehouse Stage 01；`state/main/` 七个主界面状态件 | 建筑共用 `[768,1504]` pivot；状态件按 manifest 的 source anchor 放置 |
| ART-04 | Glen/Nora/Eve 三张 `*_scene_v01.png` | 512×768；等比显示；使用各自脚底 pivot；Otto 默认隐藏 |
| ART-06 | panel、primary/disabled button、active/inactive tab、capacity/status track | 必须在编辑器设置 manifest 登记的九宫格 |
| ART-07 | 顶部资源、标题两侧、三页签、四指标、收取、锁等语义图标 | 256×256；中心 pivot；常用显示 64～96px |

首屏静态装配不导入 ART-02、ART-05、ART-08。ART-09 的收取/升级/解锁反馈由 Cocos 程序动效阶段按需加载；
ART-01 制作时需包含默认静态灯光和克制尘埃，首帧不要重复叠 `lamp_halo` 或 `dust_mote`。

### 2.2 拟定生产资源映射

路径前缀拟统一为 `docs/undergroundIdle/art/production/`。表内文件均为首次 ART 制作的目标，不表示资源存在。

| FairyGUI 资源名 | 源 PNG | 用途 |
| --- | --- | --- |
| `ug_main_00_background_v01` | `art01_scene_v01/background/ug_main_00_background_v01.png` | 全屏岩层背景 |
| `ug_main_10_structure_v01` | `art01_scene_v01/midground/ug_main_10_structure_v01.png` | 梁、轨、管线与平台 |
| `ug_main_50b_front_occlusion_v01` | `art01_scene_v01/foreground/ug_main_50b_front_occlusion_v01.png` | 脚底窄前景遮挡 |
| `ug_main_60_light_fx_v01` | `art01_scene_v01/light/ug_main_60_light_fx_v01.png` | 默认工作灯、尘埃与深层冷光 |
| `ug_building_mine_stage_01_v01` | `art03_buildings_v01/buildings/ug_building_mine_stage_01_v01.png` | 初始矿井 |
| `ug_building_hoist_stage_01_v01` | `art03_buildings_v01/buildings/ug_building_hoist_stage_01_v01.png` | 初始升降机 |
| `ug_building_warehouse_stage_01_v01` | `art03_buildings_v01/buildings/ug_building_warehouse_stage_01_v01.png` | 初始仓库 |
| `ug_state_warehouse_05_v01` | `art03_buildings_v01/state/main/ug_state_warehouse_05_v01.png` | 新手约 5% 仓储物件 |
| `ug_state_empty_cart_v01` | `art03_buildings_v01/state/main/ug_state_empty_cart_v01.png` | 开采瓶颈空矿车 |
| `ug_state_cart_load_v01` | `art03_buildings_v01/state/main/ug_state_cart_load_v01.png` | 平衡态矿车装载层 |
| `ug_state_job_plate_v01` | `art03_buildings_v01/state/main/ug_state_job_plate_v01.png` | 四岗位复用空牌 |
| `ug_state_depth_locked_v01` | `art03_buildings_v01/state/main/ug_state_depth_locked_v01.png` | 深层锁链与锁 |
| `ug_state_depth_unlockable_v01` | `art03_buildings_v01/state/main/ug_state_depth_unlockable_v01.png` | 深层可解锁提示底图 |
| `ug_state_depth_unlocked_v01` | `art03_buildings_v01/state/main/ug_state_depth_unlocked_v01.png` | 深层开放入口 |
| `ug_worker_glen_scene_v01` | `art04_characters_v01/glen/ug_worker_glen_scene_v01.png` | 格伦场景角色 |
| `ug_worker_nora_scene_v01` | `art04_characters_v01/nora/ug_worker_nora_scene_v01.png` | 诺拉场景角色 |
| `ug_worker_eve_scene_v01` | `art04_characters_v01/eve/ug_worker_eve_scene_v01.png` | 伊芙场景角色 |

ART-06、ART-07 资源名沿用文件名去扩展名。顶部与页签使用 `ug_icon_ore/shard/stamina/guild/settings/
mine_tab/workers_tab/expedition_tab_v01`；四指标使用 `ug_icon_mining/transport/effective/bottleneck_v01`。

### 2.3 明确禁止导入

- 任意 `*_raw_*`、`*contact_sheet*`、`review/`、`*_review.*`；
- `art/effects/`、`art/specs/` 中的扁平效果图或标注板；
- `ug_main_master_*`、`ug_main_80_runtime_text_*`、parts sheet 与 prompt；
- 同一资产的 SVG 和 PNG 两份；本轮只导入 manifest 登记的运行 PNG；
- ART-03 独立状态 PNG与同内容 atlas 同时导入；
- 任何示例中文、数字、安全区 guide、设备刘海/圆角或手势条。

## 3. 固定区、安全区与热区

以下坐标属于 `AUTHORING_LOCAL`，即 `safeTop=0 / safeBottom=0`。

| ID | 区域 | `(x,y,w,h)` |
| --- | --- | --- |
| R1 | 标题/大厅/设置 | `(0,0,750,108)` |
| R2 | 三资源栏 | `(0,108,750,99)` |
| R3 | 仓库与收取 | `(0,207,750,162)` |
| R4 | 矿井舞台 | `(0,369,750,938)` |
| R5 | 四指标卡 | `(0,1307,750,195)` |
| R6 | 三页签底栏 | `(0,1502,750,122)` |
| Mask | 场景裁切 | `(0,365,750,960)` |

安全区转换：

```text
R1～R3：y' = y + safeTop
R5～R6：y' = y - safeBottom
R4：y' = 369 + safeTop
    h' = 938 - safeTop - safeBottom
s = R4.h' / 938
舞台节点 y' = R4.y' + (y - 369) × s
舞台节点 h' = h × s
```

角色图片不做纵向拉伸，只移动脚底 pivot；结构通过裁切或弹性间隔吸收高度差。`safeTop=88 / safeBottom=68`
时，R4 为 `(0,457,750,782)`，R6.y 为 `1434`。

| 节点 | 交互 | `(x,y,w,h)` |
| --- | --- | --- |
| `btn_guild` | 大厅/徽章 | `(10,8,100,100)` |
| `btn_settings` | 设置 | `(650,8,92,96)` |
| `btn_warehouse` | 仓库详情 | `(14,214,454,142)` |
| `btn_collect` | 全部收取 | `(476,226,262,132)` |
| `btn_mine` | 矿井 | `(22,414,452,320)` |
| `btn_hoist` | 升降机 | `(484,392,254,568)` |
| `btn_depth` | 深层入口 | `(498,986,240,252)` |
| `btn_mineTab` | 矿场页签 | `(14,1502,234,122)` |
| `btn_workersTab` | 矿工页签 | `(258,1502,232,122)` |
| `btn_expeditionTab` | 远征页签 | `(502,1502,236,122)` |
| `btn_refresh` | 异常态确认/刷新（`stateOverlay` 条件显示） | `(301,764,148,96)` |

表中前十项依次为常驻语义热区 H01～H10；`btn_refresh` 为异常态条件热区 H11。H11 固定宽高为 `148×96`，
横向居中；安全区下只重算纵坐标：`y' = safeTop + (1624 - safeTop - safeBottom - 96) / 2`。因此 `0/0` 时
为 `(301,764,148,96)`，`88/68` 时为 `(301,774,148,96)`，均不与 H01～H10 相交。H11 出现时
`stateOverlay` 必须屏蔽 H01～H10，不能让异常态刷新与底层生产操作同时命中。

热区不等于可见图标边界；视觉状态、建筑阶段和安全区变化不能改变其语义。设计热区不小于 88×88，Creator
复测不小于 44×44pt。资源卡和指标卡在首版不设独立交互契约，不新增点击区。

## 4. 节点树与图层

```text
IdleMain
├─ 00_BACKGROUND                    全屏、同画布左上锚
├─ warehouseVisual                  R3 仓库建筑与仓储状态，不受场景 Mask 裁切
├─ sceneMask                        (0,365,750,960)
│  ├─ 10_STRUCTURE
│  ├─ 30_BUILDING                   mine / hoist
│  ├─ 40_PROP_STATE                 cart / job plates / depth
│  ├─ 50_CHARACTER                  Glen / Nora / Eve / Otto(hidden)
│  ├─ 50B_FRONT_OCCLUSION
│  └─ 60_LIGHT_FX
├─ 70_UI_COMPONENT                  六固定区的面板、按钮、页签、轨道与图标
├─ 80_RUNTIME_TEXT                  所有中文、数字、倒计时、角标与禁用原因
└─ stateOverlay                     Loading/Mutating/ResultUnknown 等同槽位遮罩与 H11 btn_refresh
```

UI 永远盖住角色、矿车和灯光；前景遮挡只覆盖脚底约 6～10px。`Guide`、`Review` 与示例值不得发布。

## 5. 建筑、状态件与角色放置

### 5.1 建筑

建筑资源拟统一为 1536×1536，节点 pivot 固定为 `(0.5,1504/1536)`。以下是首次装配的编辑器起始值；
切换 Stage 02/03 只换资源，保持节点尺寸、pivot、位置、热区与岗位锚点不变。

| 节点 | 显示尺寸 | 节点锚点坐标 | 约略左上位置 |
| --- | --- | --- | --- |
| `ld_mineStage` | `399.61×399.61` | `(248,734)` | `(48.20,342.46)` |
| `ld_hoistStage` | `592.70×592.70` | `(611,960)` | `(314.65,379.49)` |
| `ld_warehouseStage` | `198.27×198.27` | `(109,369)` | `(9.86,174.86)` |

公会大厅完整建筑主页默认不显示；H01 的公会徽章承担大厅入口语义。

### 5.2 主界面状态件

`state/main/` 资产制作后使用紧凑裁切，不允许再次 tight crop。每张 Loader 的尺寸、pivot 和页面锚点必须逐项
读取首次生成的 `art03_buildings_v01/manifest.json#mainStateOverlays`。关键状态组合：

| 状态 | 显示 |
| --- | --- |
| 新手初始 | `warehouse_05 + empty_cart + 4×job_plate + depth_locked` |
| 产能平衡 | 空矿车保持，叠 `cart_load`；指标改为正常 |
| 运输瓶颈 | 切 ART-03 `ore_pile + hoist_load`，不显示平衡装载层 |
| 深层可解锁 | `depth_locked` 可继续保留弱底，叠 `depth_unlockable` 一次提示 |
| 深层已解锁 | 关闭 `depth_locked/unlockable`，只显示 `depth_unlocked` |

岗位牌实例矩形：Mine01 `(147,535,96,34)`、Mine02 `(427,535,96,34)`、Transport01
`(334,794,96,34)`、Transport02 `(187,794,96,34)`；牌面文字和加号属于运行时文本。

### 5.3 角色与岗位

角色显示尺寸统一约 `213.33×320`，不拉伸；使用 ART-04 个体 pivot。

| Loader | 岗位锚点 | 初始角色 | 左上位置 | 显示后局部 pivot |
| --- | --- | --- | --- | --- |
| `ld_jobMine01` | `(195,700)` | Glen | `(59.17,400)` | `(135.83,300)` |
| `ld_jobMine02` | `(475,700)` | 空 | 按绑定角色 pivot 推导 | — |
| `ld_jobTransport01` | `(382,936)` | Nora | `(275.75,636)` | `(106.25,300)` |
| `ld_jobTransport02` | `(235,936)` | 空 | 按绑定角色 pivot 推导 | — |
| `ld_idle01` | `(308,1174)` | Eve | `(208,874)` | `(100,300)` |
| `ld_idle02` | `(435,1174)` | Otto，默认隐藏 | `(329.17,874)` | `(105.83,300)` |

远征中只隐藏离岗角色并保留岗位牌；到达 `endAt` 后角色已自动归队，不能等到领取后才归队。

## 6. 代码绑定命名

首轮至少需要下列 33 个核心绑定。完成 FairyGUI 组件后，由 codegen 生成 `IdleMainView` 并建立 `REQUIRED` 与
`fguiContracts.ts` 单源；在生成物实际产生前，不登记 required 绑定总数：

```text
txt_title               btn_guild               btn_settings
txt_ore                 txt_shards              txt_stamina
txt_warehouse           pg_warehouse            btn_warehouse
btn_collect
ld_mineStage            ld_hoistStage           ld_warehouseStage
ld_jobMine01            ld_jobMine02            ld_jobTransport01
ld_jobTransport02       ld_idle01                ld_idle02
btn_mine                btn_hoist                btn_depth
txt_miningRate          txt_transportRate        txt_effectiveRate
txt_bottleneck
btn_mineTab             btn_workersTab           btn_expeditionTab
ld_expeditionState      txt_expedition
txt_status              btn_refresh
```

需要代码访问的节点必须保留类型前缀；静态装饰不加伪绑定名。按钮内部 `button` controller 是 FairyGUI 保留名。
页面根的主状态 controller 必须叫 `view`。

## 7. Controller 契约

| Controller | Pages |
| --- | --- |
| `view` | `loadingSnapshot`、`ready`、`mutating`、`resultUnknown`、`reconnecting`、`insufficientBalance`、`insufficientStamina`、`workerBusy`、`stateConflict`、`disabledReason` |
| `production` | `balanced`、`miningBottleneck`、`transportBottleneck` |
| `warehouseFill` | `empty`、`quarter`、`half`、`threeQuarter`、`full` |
| `collect` | `disabledEmpty`、`ready`、`pressed`、`processing`、`success` |
| `depth` | `locked`、`unlockable`、`unlocked` |
| `expedition` | `empty`、`running`、`claimable` |
| `nav` | `mine`、`workers`、`expedition` |
| `mineStage` / `hoistStage` / `warehouseStage` | `stage1`、`stage2`、`stage3` |

首次发布默认值必须使用 `view=loadingSnapshot`，防止首帧误开放写操作；编辑器审稿切到 `ready`。`ResultUnknown` 只表达
“正在确认”，允许查询原请求或刷新快照，不能显示失败叉号或“重新提交”。存在挂起写时掉线进入
`resultUnknown`；没有挂起写才进入 `reconnecting`。

H11 `btn_refresh` 只在 `view=resultUnknown`、`reconnecting`、`stateConflict` 时显示并可点击，其余 page 必须
隐藏且不可触摸。`resultUnknown` 下按钮语义为“确认状态”，优先查询原 `clientReqId`，不能重发原写操作；
`reconnecting` 与 `stateConflict` 下语义为“刷新”，只重新拉取权威快照。三种状态都由 `stateOverlay` 接管输入，
底层 H01～H10 同时禁用。

## 8. 首轮 Creator 验收矩阵

本节全部为首次装配后的人工签字项，初始状态均为 `未开始`。必须通过 Cocos Dashboard 启动 Creator 3.8.8，
使用 750×1624 Canvas 完成稳定资源导入、三页切换与 0 error 控制台检查；不得把文档中的示例值当作运行证据。

1. 初始真实快照：`100 / 0 / 30/30`、仓库 `50/1,000`、产率 `12.8 / 19.8 / 12.8`、瓶颈开采；
   Glen/Nora/Eve 在位、Otto 隐藏、深层锁定、矿场页签选中。
2. 安全区：至少 `0/0` 与 `88/68` 两组；热区、岗位、Mask 与六固定区换算正确；H11 分别为
   `(301,764,148,96)` 与 `(301,774,148,96)`，且不与 H01～H10 相交。
3. 长数字：资源 `9.99M`、详情 `9,999,999`；固定槽宽、右对齐、等宽数字，不推动邻居。
4. 生产：平衡、开采瓶颈、运输瓶颈；运输瓶颈同时显示矿堆与升降负荷。
5. 仓库：空、近满 `900/1,000`、满 `1,000/1,000`；满仓停止卸货和矿石飞入。
6. 收取：禁用、可收取、按下、处理中、成功；处理中阻止重复触发。
7. 深层：锁定、可解锁、已解锁；已解锁必须移除默认锁链。
8. 远征：空槽；进行中 `00:45`、`29/30`、Eve 离岗；待领取时 `30/30`、Eve 已归队、页签显示领取态。
9. 建筑：三阶段切换时，热区和岗位锚点完全不动。
10. 网络：LoadingSnapshot、Mutating、ResultUnknown、普通重连、资源/行动力不足、矿工忙碌、旧状态刷新；
    H11 只在 ResultUnknown/普通重连/状态冲突出现，ResultUnknown 点击后查询原请求而非重提，其他异常态只拉
    权威快照，且遮罩期间 H01～H10 均不能响应。
11. 降级：关闭粒子、灯效呼吸和装饰动画后，核心状态仍可辨。
12. 三秒扫描：不读说明能找到“全部收取”“瓶颈：开采”“远征”。

## 9. 编辑器到客户端动线

1. 在 FairyGUI Editor 工程中首次创建 `idle / IdleMain`，保存并确认可完整重载；目标工程路径为
   `apps/art/fairygui/FairyGUI.fairy`，实施前先确认该工程可用；
2. 在编辑器内维护资源、九宫格、pivot、relation、controller、默认页和热区；显式授权的 XML 修改也必须回到
   编辑器完整重载验证；
3. 确认发布目录配置后，只发布 `idle` 到 `apps/Cocos/assets/resources/ui/`，禁止用“仅发布描述”代替完整发布；
4. 运行 `node scripts/fgui-manifest.mjs --write`，把设计源与发布输出闭包钉入清单；
5. 运行 `npm run codegen:fgui -- idle IdleMain`，再核对 `fguiContracts`、`viewRegistry`、View 与 Logic；
6. 运行 `npm run sync:client`，并由 Cocos Creator 3.8.8 为新增真源镜像和 UI 资源生成稳定 `.meta`；
7. 运行 `npm run test:fgui`、`npm run typecheck`、`npm run test:client`、`npm run verify:sync`；
8. 用 Cocos Creator 3.8.8 完成第 8 节状态预览并保存证据。

`idle.*` 服务端/shared 契约与客户端接线必须按 02～05 首次实现并单独验证；Creator 的预览数据只负责表现
验收，不能替代服务端权威快照。若需要脱离外部 WebPlatform 审稿，可规划 `previewIdleMain` 只读开关：它应在
初始化 HTTP、外部登录、WebSocket 和 gameplay Room 之前进入固定组合根，所有高层操作只显示审稿提示；审稿
后必须恢复为 `false`。该开关在代码实际实现和测试前仅为计划。Creator 只能通过 Cocos Dashboard 启动，不能
用命令行启动替代本验收。

---

[返回总目录](README.md) · [上一篇：主界面视觉落地与效果图任务书](08-main-screen-art-brief.md) ·
[下一篇：图片标注到 FairyGUI 自动编译实时计划](10-image-to-fairygui-live-plan.md)
