# 《Underground Idle》UndergroundIdleMain FairyGUI 装配契约

> [返回总目录](README.md) · [上一篇：主界面视觉落地与效果图任务书](08-main-screen-art-brief.md) ·
> [下一篇：黄金位图到 FairyGUI Editor 生产流程](10-image-to-fairygui-live-plan.md)
>
> 文档版本：1.0<br>
> 编写日期：2026-09-01<br>
> 当前状态：`规范已定义 / UndergroundIdleMain 尚未制作、发布或接线`<br>
> 目标：在主界面 runtime PNG 与所需 ART 包通过审稿后，将其装成可状态化、可绑定、可在 Creator 验收的主界面

## 1. 真源与实施状态

FairyGUI 包名固定为 `UndergroundIdle`，主组件固定为 `UndergroundIdleMain`，设计画板为 `750×1624`、左上原点、`MatchWidth`。
设计真源目标目录为 `apps/art/fairygui/assets/UndergroundIdle/`。该路径、包、组件、发布物、绑定代码和业务接线均尚未
实施，不能因本文列出名称就视为已经存在。`authoringMode` 固定为 `editor`：最终 XML、`package.xml`
与 package/resource/component/child 内部 ID 只能由 FairyGUI Editor 创建和序列化，外部工具与人工不得直接写入
正式工程。任何辅助产物都必须回到 Editor 完成打开、保存、关闭、重开与正式发布，不能只凭文本 diff 宣称可用；
条件式 raw XML 候选不属于本页面的当前实施路线。

实施状态全部为 `未开始`：

- 等待 08 文档的批准黄金效果图、Bitmap 生产源、生产资产清单与 ART-01～ART-09 通过对应 Gate；
- 等待创建 `UndergroundIdle / UndergroundIdleMain`、`HotspotButton`、`WarehouseProgress`、根绑定、controller 与九宫格；
- 等待 FairyGUI Editor 发布 `undergroundIdle.bin`、图集和独立纹理，再由 Creator 生成稳定 `.meta`；
- 等待生成或实现 `UndergroundIdleMainView`、结构契约、动态注册和纯 TypeScript `UndergroundIdleMainLogic`；
- 等待按 02～05 的权威边界实现 shared/服务端 RPC、客户端网络 port、三页签与结果未知恢复；
- 等待通过第 8 节完整 Creator 状态矩阵与 ART-09 程序动效/性能终检。

如为审稿增加固定只读预览数据，它只能用于视觉验收，不能替代权威玩法存档；正式路径必须从服务端完整快照
自愈。

资源与约束的真相优先级：玩法/数值见 02～04，视觉语义见 07～08；生产文件创建后以页面批次唯一的
`asset-manifest.json` 登记的来源、Alpha、pivot、九宫格与输出策略为准；本文件约束编辑器节点、坐标和状态组合。
生产资产清单不得与 FGUI 发布闭包锁 `scripts/fgui.manifest.json` 混称为“manifest”。

## 2. 导入边界

### 2.1 首屏最小集

| 来源组 | 首屏导入内容 | 关键属性 |
| --- | --- | --- |
| `runtime/full_canvas` | scene clean plate、必要结构、前景遮挡、默认灯光 | 画布尺寸、blend 和 anchor 以 `asset-manifest.json` 为准；禁止 tight crop |
| `runtime/buildings` | mine/hoist/warehouse Stage 01；七个主界面状态件 | 同组建筑共用登记 pivot；状态件按 source anchor 放置 |
| `runtime/characters` | Glen/Nora/Eve 三张 scene PNG | 512×768 目标画布；等比显示；使用各自脚底 pivot；Otto 默认隐藏 |
| `runtime/ui_chrome` | top/resource/warehouse/metrics/tabs chrome、按钮态、capacity/status track | 固定 chrome 不重画；九宫格必须使用 manifest 登记的 source inset |
| `runtime/icons` | 顶部资源、标题两侧、三页签、四指标、收取、锁等语义图标 | 常用显示 64～96px；pivot、安全边与来源以 manifest 为准 |

以上文件必须来自 `production/main_bitmap_v02/asset-manifest.json` 中 `approval=accepted` 的条目，并已通过
target ↔ composite 的 G5 人工 A/B。首屏静态装配不导入 ART-02、ART-05、ART-08。ART-09 的收取/升级/解锁
反馈由 Cocos 程序动效阶段按需加载；clean plate 制作时需包含默认静态灯光或明确拆出的灯光层，首帧不要重复叠
`lamp_halo` 或 `dust_mote`。

### 2.2 生产资源映射

路径前缀为 `docs/undergroundIdle/art/production/main_bitmap_v02/runtime/`。具体文件名、哈希、mode、尺寸和
pivot 以 `asset-manifest.json` 为准；下表只定义 Editor 中必须可识别的语义资源 key，不表示资源存在。

| 语义资源 key | 源目录 | 用途 |
| --- | --- | --- |
| `scene.cleanPlate` | `full_canvas/` | 全屏岩层、结构与已决定烘焙的静态装饰 |
| `scene.frontOcclusion` | `full_canvas/` | 脚底窄前景遮挡 |
| `scene.defaultLightFx` | `full_canvas/` | 默认工作灯、尘埃与深层冷光 |
| `building.mine/hoist/warehouse.stage01` | `buildings/` | 三个初始建筑 |
| `state.warehouse05/emptyCart/cartLoad/jobPlate` | `buildings/` | 新手仓储、瓶颈与岗位状态 |
| `state.depth.locked/unlockable/unlocked` | `buildings/` | 深层入口三态 |
| `character.glen/nora/eve.scene` | `characters/` | 三名初始角色 |
| `ui.top/resource/warehouse/metrics/tabs.chrome` | `ui_chrome/` | 与黄金 target 同源的无字固定 UI 大块 |
| `ui.collect/tab/button.*` | `ui_chrome/` | 收取、页签与按钮状态组件 |
| `icon.*` | `icons/` | 顶部资源、入口、页签、指标、收取和锁图标 |

FairyGUI 资源名由 Editor 在导入时创建并经设计源保存；应保持可读、稳定并能回查 manifest key，但外部脚本不得
据此分配或推算任何内部 ID。

### 2.3 明确禁止导入

- 任意 `*_raw_*`、`*contact_sheet*`、`review/`、`*_review.*`；
- `art/effects/`、`art/specs/` 中的扁平效果图或标注板；
- 任何 Master 合成稿、运行时文字投影、parts sheet 与 prompt；
- SVG 中间稿或同一资产的 SVG/PNG 双份；本批只导入 `asset-manifest.json` 登记并批准的运行 PNG；
- ART-03 独立状态 PNG 与同内容 atlas 同时导入；
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
UndergroundIdleMain
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

建筑资源统一为 1536×1536，节点 pivot 固定为 `(0.5,1504/1536)`。以下是装配时的编辑器起始值；
切换 Stage 02/03 只换资源，保持节点尺寸、pivot、位置、热区与岗位锚点不变。

| 节点 | 显示尺寸 | 节点锚点坐标 | 约略左上位置 |
| --- | --- | --- | --- |
| `ld_mineStage` | `399.61×399.61` | `(248,734)` | `(48.20,342.46)` |
| `ld_hoistStage` | `592.70×592.70` | `(611,960)` | `(314.65,379.49)` |
| `ld_warehouseStage` | `198.27×198.27` | `(109,369)` | `(9.86,174.86)` |

公会大厅完整建筑主页默认不显示；H01 的公会徽章承担大厅入口语义。

### 5.2 主界面状态件

`state/main/` 资产制作后使用紧凑裁切，不允许再次 tight crop。每张 Loader 的尺寸、pivot 和页面锚点必须逐项
读取页面批次唯一的 `asset-manifest.json#mainStateOverlays`。关键状态组合：

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

组件至少需要下列 33 个核心绑定。完成 FairyGUI 组件后，`codegen:fgui` 从 Editor XML 生成
`UndergroundIdleMainView` 的四个 AUTO 区块，直接绑定的 `required` 以 XML → View AUTO 为单源；实例策略和
`manualRequired/nested/listItems/controllers/relations/assetUrls` 写入同目录 `.view.json` sidecar，再由
`codegen:features` 生成契约与注册值。`fguiContracts.ts`、`viewRegistry.ts` 与 `pages.ts` 是稳定 façade，禁止手改；
在生成物实际产生前，不登记 required 绑定总数：

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

发布默认值必须使用 `view=loadingSnapshot`，防止首帧误开放写操作；编辑器审稿切到 `ready`。`ResultUnknown` 只表达
“正在确认”，允许查询原请求或刷新快照，不能显示失败叉号或“重新提交”。存在挂起写时掉线进入
`resultUnknown`；没有挂起写才进入 `reconnecting`。

H11 `btn_refresh` 只在 `view=resultUnknown`、`reconnecting`、`stateConflict` 时显示并可点击，其余 page 必须
隐藏且不可触摸。`resultUnknown` 下按钮语义为“确认状态”，优先查询原 `clientReqId`，不能重发原写操作；
`reconnecting` 与 `stateConflict` 下语义为“刷新”，只重新拉取权威快照。三种状态都由 `stateOverlay` 接管输入，
底层 H01～H10 同时禁用。

## 8. Creator 验收矩阵

本节全部为装配后的人工签字项，当前状态均为 `未开始`。必须通过 Cocos Dashboard 启动 Creator 3.8.8，
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
10. 网络：LoadingSnapshot、Mutating、ResultUnknown、普通重连、资源/行动力不足、矿工忙碌、版本冲突后刷新；
    H11 只在 ResultUnknown/普通重连/状态冲突出现，ResultUnknown 点击后查询原请求而非重提，其他异常态只拉
    权威快照，且遮罩期间 H01～H10 均不能响应。
11. 降级：关闭粒子、灯效呼吸和装饰动画后，核心状态仍可辨。
12. 三秒扫描：不读说明能找到“全部收取”“瓶颈：开采”“远征”。

## 9. 编辑器到客户端动线

1. 在 FairyGUI Editor 工程中创建 `UndergroundIdle / UndergroundIdleMain`，保存并确认可完整重载；目标工程路径为
   `apps/art/fairygui/FairyGUI.fairy`，实施前先确认该工程可用；
2. 在编辑器内维护资源、九宫格、pivot、relation、controller、默认页、热区和全部内部 ID；不得由外部工具或人工
   直接写最终 XML/`package.xml`/ID；
3. 确认发布目录配置后，只发布 `UndergroundIdle` 到 `apps/Cocos/assets/resources/ui/`，禁止用“仅发布描述”代替完整发布；
4. 运行 `npm run codegen:fgui -- UndergroundIdle UndergroundIdleMain`，由真实 XML 生成或更新 View 四个 AUTO 区块；
5. 在 AUTO 区块外完成 View/Logic，写同目录 `<Name>View.view.json`，并将 sidecar、路由和入口登记进对应
   `features/<id>/feature.json`；
6. 运行 `npm --workspace @game/server run codegen:features`，刷新生成的 View、FGUI 契约、feature 与 route catalog；
7. 审阅 Editor 设计源、发布物、View AUTO、sidecar 与生成 catalog 后，运行
   `node scripts/fgui-manifest.mjs --write` 更新 FGUI 发布闭包锁；
8. 运行 `npm run sync:client`，禁止手改 `apps/Cocos/assets/src`；
9. 通过 Cocos Dashboard 打开 Creator 3.8.8，由 Creator 为 UI 资源与新增镜像生成或复用稳定 `.meta`；
10. 运行 `npm run test:fgui`、`npm run typecheck`、`npm run test:client`、`npm run verify:sync`，再完成第 8 节
    状态预览并保存证据。

`undergroundIdle.*` 服务端/shared 契约与客户端接线必须按 02～05 实现并单独验证；Creator 的预览数据只负责表现
验收，不能替代服务端权威快照。若需要脱离外部 WebPlatform 审稿，可规划 `previewUndergroundIdleMain` 只读开关：它应在
初始化 HTTP、外部登录、WebSocket 和 gameplay Room 之前进入固定组合根，所有高层操作只显示审稿提示；审稿
后必须恢复为 `false`。该开关在代码实际实现和测试前仅为计划。Creator 只能通过 Cocos Dashboard 启动，不能
用命令行启动替代本验收。

---

[返回总目录](README.md) · [上一篇：主界面视觉落地与效果图任务书](08-main-screen-art-brief.md) ·
[下一篇：黄金位图到 FairyGUI Editor 生产流程](10-image-to-fairygui-live-plan.md)
