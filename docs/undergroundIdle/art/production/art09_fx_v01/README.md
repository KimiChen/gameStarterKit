# ART-09 程序动效素材生产规范 v01

本目录规定 Underground Idle 轻量程序动效素材的 PNG 生产目标。候选可从批准 target 的局部光效经 mask 提取，
或以 target 为 reference 独立生成透明纹理/atlas；生产过程不建立 SVG 中间真源。输出必须为原尺寸、透明背景、
straight-alpha。当前不表示任何纹理或 atlas 已经生成、采用或审计通过。

## 使用边界

- 核心状态必须由建筑、角色、图标和运行时文字表达；关闭本包全部素材后，生产、满仓、锁定、领取等语义仍应成立。
- 动效只通过 Cocos 节点的位移、旋转、缩放、透明度、裁切和少量粒子驱动，不承担权威时间、库存或奖励结算。
- 页面失焦、切后台、节点不可见或对象离屏时暂停循环与发射器。
- 工作灯半径不超过 160 逻辑像素，默认只在局部使用；尘埃和火花保持低密度，不做全屏粒子层。
- 金光扫必须被目标建筑或 UI 容器 mask 裁切；矿石飞入由运行时贝塞尔曲线驱动，纹理中不预绘轨迹。
- 所有资产无文字、数字、黑底、大场景和伪 UI。透明边缘至少保留 20 px，图集帧之间没有跨帧像素。

## 计划文件组织

- 单纹理：`lamp_halo`、`dust_mote`、`spark`、`gold_sweep`、`ore_fly`。
- 4 帧横向图集：`collect_particles_atlas`、`upgrade_particles_atlas`、`unlock_particles_atlas`；每帧 256×256，顺序从左到右。
- 候选生成后，`asset-manifest.json` 必须登记生产 mode、来源、混合方式、锚点、pivot、运行尺寸、帧矩形、逐帧时长与循环策略；
- 计划生成 `ug_art09_fx_contact_sheet_v01.png` 仅用于审阅；标签必须位于 `90_REVIEW_ANNOTATION`，
  不属于运行时切图。

## 验收后的 Cocos 约定

- `alphaMode` 为 straight；不要对本包重复做黑底抠图。
- `additive` 使用 `SRC_ALPHA / ONE`；`alpha` 使用 `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`。
- 图集设置 `wrapMode: clamp`、`filterMode: linear`；按 manifest 的 `frameRects` 建 SpriteFrame。
- atlas 动画默认不循环；播放结束后回收到对象池。灯晕只做低幅呼吸，尘埃由发射器控制生命周期。

## 待执行验收

- [ ] 5 个单纹理与 3 组四帧 atlas 的数量、尺寸和文件名闭合；
- [ ] PNG 为 sRGB RGBA straight-alpha，无文字、黑底、场景和伪 UI；
- [ ] atlas 帧之间无跨帧像素，每个 frame 边界透明且 rect/pivot/时长与 manifest 一致；
- [ ] additive/alpha 候选在目标材质下无黑边、白边或亮度爆炸；
- [ ] 关闭全部程序动效后，核心业务状态仍清晰；
- [ ] 候选生成后进入 `To audit`，自动检查与人工动效预览通过后才能标记为 `Accepted`；候选尚未生成时保持
  `To generate`。
