# S5：Demo 全链路验收与 Creator 预览

[上一阶段：S4 Demo 养成奖励](s4-reliable-progression-rewards.md) · [专项索引](README.md)

## 状态与范围

| 项目 | 口径 |
|---|---|
| 状态 | `[进行中]`（S5-01 已冻结、S5-02 自动门禁部分已跑；S5-02 真栈、S5-03/04/05 未做） |
| 目标 | 验证 S0～S4 的 demo 动线、生成镜像、自动测试和 Creator 3.8.8 桌面预览 |
| 数据范围 | 进程内衣柜/养成 + Redis 单 HASH profile 投影 |
| 交付物 | 一个可复现的内部 demo 候选和证据记录 |
| 不包含 | 物理真机、生产部署、玩家灰度、渠道发行和生产资产可靠性 |

S5 只回答“这个 demo 是否能完整演示并通过仓库门禁”。它不把 S2R～S4 的进程内实现包装成生产能力，
也不要求为演示项目补建持久化、补偿、后台处理或发布基础设施。

## 冻结口径

内部 demo 候选继续锁定五层玩法身份：

| 层 | 冻结 ID | 核心语义 |
|---|---|---|
| 战场 | `newEndlessPortraitV2Map4096` | 4096² 竖版世界、1000 Dot + 30 Star |
| 生命周期 | `sourceEndlessTotalTime0` | 无房级倒计时与统一结算 |
| 复活流程 | `sourceEndlessReliveFlow` | 真人限时选择，AI 约 40 tick 独立重生 |
| 复活策略 | `onlineCoinRelive5V1` | `100/200/300/300/300`，5 秒选择窗 |
| 联机适配 | `onlineEndlessDropInV2` | 最多 8 真人、稳定态 17 蛇、Playing 可入 |

`onlineCoinRelive5V1` 只是配置 ID。生产环境继续禁用 demo economy，S5 不开启玩家发布开关。

数据口径固定为：

- Redis 逻辑 key 只有 `gp:snake:user:{uid}`，允许字段精确为 `coinBalance`、`equippedSkinId`、
  `ownedSkinIds`、`fragmentBalances`、`snakeXp` 和 `achievementProgress`。
- key、field 和 value 都不增加 `sId`；集合/映射字段使用经过严格校验的 JSON。
- 当前 profile 先在进程内更新，再 best-effort 镜像 Redis；run 去重和最近结果只在当前进程内存在。
- Redis 写失败不使已经完成的复活或奖励失败。
- Redis 写成功时重启后可回灌 profile；未写成功的变化、run 去重和最近结果不会恢复。

## 实施任务

### S5-01：冻结 demo 候选

- [x] 候选身份已冻结（2026-09-05，commit `80d78e2`）：

| 项 | 值 |
|---|---|
| commit | `80d78e2` |
| gameplay | `snake@5`（S4-04 的结果 wire v2 触发 4→5，是 S4 唯一一次 bump） |
| 战场层 | `newEndlessPortraitV2Map4096` · `6750cb34…a07e` |
| 生命周期层 | `sourceEndlessTotalTime0` · `efc56090…b477` |
| 复活流程层 | `sourceEndlessReliveFlow` · `9b33262d…b865` |
| 复活策略层 | `onlineCoinRelive5V1` · `e668f382…c646` |
| 联机适配层 | `onlineEndlessDropInV2@2` · `3a61016c…a53f` |
| 五层组合 hash | `2c74f005…e8e7`（S0 旧值 `2319d173…f87e2` 仅作历史证据） |
| public 皮肤目录 | `a1cdecbc…b075`（S1 起未变） |
| server 业务目录 | **`b851e345…9d2c`**（S3-01 填入业务值后搬家，⛔ 不再是 S1 的 `9ed3762e…fa19`） |
| client 表现目录 | `8615596a…d629`，`presentationVersion=2`（S1-12 起未变） |
| 协议指纹 | `g8 l7 57af8eb6…357b` |

- [x] S0～S4 状态与实现一致（见 [专项 README §8](README.md#8-总状态与证据汇总)）。
      ⚠ 两处**未完成项不得被 S5 文案标成通过**：① S0 证据不可重新生成（归档非 git 检出）；
      ② 皮肤预览是静态合成图、底色不透明。

### S5-02：执行仓库自动门禁

- [ ] 运行并记录：

```bash
npm run verify:all
npm run verify:sync
npm run test:fgui
```

- [ ] 在本地 Redis 可用时运行 Snake profile 集成用例：

```bash
cd apps/server
node --import tsx --test --test-concurrency=1 test/int/snake-*-demo.test.ts
```

- [x] **已跑（2026-09-05 · `80d78e2`）**：`npm run verify:all` **exit 0** —— client 435/435、
      server 604/604、FGUI 66/66、inventory 110/110（能力 14 项 / 默认入口 5 个）、
      sync-mirror-matrix 5/5，零失败。`verify:sync` 与 `test:fgui` 均含在该链内并通过。
- [ ] ⛔ **未跑**：`test/int/snake-*-demo.test.ts` —— 本机**没有运行中的 Redis**
      （`redis-cli ping` 无响应、无本地栈容器）。按本页规矩「未运行的命令不得写通过」，
      本条保持未勾选；需先 `npm --workspace @game/server run stack` 起本地 Redis/MySQL 再跑。

### S5-03：执行无头玩法验收

- [ ] 固定 seed 验证 4096² 世界、17 蛇、1030 食物、Star/磁铁运动和 1800 tick 后继续 Playing。
- [ ] 验证左右手操作区、Safe Area 注入、多 pointer 归属、输入 seq 和重连。
- [ ] 验证五档复活、余额不足、第六次死亡、保护时间、AI 独立重生和个人结束。
- [ ] 验证 S3 衣柜、S4 奖励、连续两局换装与结果只影响本人。

### S5-04：执行 demo 数据检查

- [ ] 用非零 `sId` 进入房间，确认 Redis key 与 `sId=0` 时相同。
- [ ] 确认 Redis HASH 只有六项允许字段，没有 `sId`、run、结果、处理标记或请求字段。
- [ ] 注入 Redis 写失败，确认复活与奖励结果仍成功，且留下受控 warning。
      ⚠ **按形态分开记，⛔ 不要笼统写「已覆盖」或「无法覆盖」**：
      ① **内存形态已自动覆盖**——复活/衣柜/结算各有一条「写失败只告警、不回滚」用例，随 `verify:all` 跑；
      ② **真 Redis 形态零自动覆盖**，本条是**人工步骤**。`test:faults:int` 是有意留在 verify 链外的
      历史决策（见 plan-v3 归档），⛔ 不要顺手把它接进 `verify:all`。
- [ ] 在当前进程重复提交同一死亡和同一 run 终局，分别确认只扣一次、只奖一次。
- [ ] 重启开发进程，确认写成功的衣柜/养成 profile 可回灌，而 run 去重与最近结果会重置。

### S5-05：完成 Creator 3.8.8 桌面预览

- [ ] 用 `750 x 1624` 视口和 `safeBottom=0/100` 验证战场、HUD、操作区和弹窗不重叠。
- [ ] 检查 16 套皮肤预览、装备、合成、红点、资源 fallback 和动态 FGUI 打开/关闭。
      ⚠ 另需目视确认：战场底色 dark 主题、`walls[]` **有意不渲染**（边界走 4px 描边，不是墙块平铺）。
- [ ] 走完死亡、金币复活、余额不足、放弃、超时、第六次死亡和个人结果页。
- [ ] 连续完成两局，验证 XP、等级、碎片、成就、新解锁皮肤及下一局外观。
- [ ] 记录 Creator 版本、commit、视口、操作步骤、截图/录屏和控制台日志。

#### 首跑记录（2026-09-06）

环境：Creator 3.8.8 桌面预览（Chrome 9222，`Apple iPhone X` 预设，画布 750 x 1624），本地开发服
`dev-63bfdde39b49cc16`，账号金币 10000。操作通过 CDP 注入点击驱动，截图裁到画布区域，
存放于 `docs/s/evidence/s5/creator/`。

⚠ **取证方法学（踩过的坑，后来者必读）**：Chrome 在标签页**不可见**时停发 `requestAnimationFrame`，
Cocos 随之 `cc.game` 暂停，画布**定格在最后一帧**。此时节点树照常被逻辑改写，于是「标签能读到弹层、
截图里却没有」——会被误判成 `layer_popup` 渲染缺陷。⛔ 截图前必须先 `Page.bringToFront`，
并断言 `cc.director.getTotalFrames()` 在推进；本轮的取证脚本已内建该闸，帧不推进直接 exit 3。

| 证据 | 内容 | 结论 |
|---|---|---|
| `01-login.png` | 登录页、实名/协议合规文案、本地开发服选择 | ✅ |
| `02-home.png` | 首屏：`协议 game v8 · lobby v7 · 已登记玩法 6` | ✅ |
| `03-settings.png` | 宿主固定项 + 插件入口按 featureId 字母序，含「衣柜 · snakeCosmetic」 | ✅ S3-5 登记生效 |
| `04-wardrobe.png` | 衣柜「全部」页，6/16 分页，已装备态 | ⚠ 见 F7 |
| `05-wardrobe-craftable.png` | 「可合成」筛选空态「该筛选下没有皮肤」（新账号 0 碎片，符合预期） | ✅ |
| `06-battle.png` | F2/F3/F4 修复后重拍：身体呈小红皮肤红色贴图（与头一致）、食物为图集彩球与星星、引擎零告警 | ⚠ 身体白齿见 F10 |
| `07-relive.png` | 死亡与金币复活提示：`第 1 次，金币 100 · 余额 10000 · 3s` | ⚠ 见 F6 |
| `08-result.png` | 个人结算页，含 `本局不计奖励（时长不足或无有效操作）` | ✅ S4 合格闸生效；⚠ 见 F5 |

##### 发现（真引擎独有，Node 桩与 `verify:all` 全部漏过）

- **F1｜已修**：`SnakeWorldView.definedFrame` 向 `SpriteFrame.pivot` 赋值。Cocos 3.8 该属性
  **只有 getter**（引擎侧实测 `set:false`，且原型上没有 `setPivot`），ES module 严格模式下直接抛
  `TypeError`。该函数在 `loadAssets()` 里建 magnet aura 帧时即被调用，一抛就让**整条资源装载链
  reject**、`this.assets` 永不赋值，表现为 11 个 skinId 全报 `default-unavailable` + 一条无来源的
  `PromiseRejectionEvent`。
  漏过的原因是两层：`as unknown as {...}` 强制转换抹掉了 `SpriteFrame` 的真实类型，而两套 cc 桩
  **都没声明 `pivot`**。修复同时补了两道闸：桩里 `pivot` 声明为 `readonly`（变异验证：写回赋值
  → `TS2540`），以及 `snakePresentation.test.ts` 钉住目录 156 处 pivot 全为 `(0.5, 0.5)`
  （变异验证：改一处为 0.25 → 转红）。`void this.loadAssets()` 也补了 `.catch`。
- **F2｜已修**：`SnakeMeshRenderer` / `SnakeFoodMeshRenderer` 在节点上只加了
  `UIMeshRenderer`，再用 `as unknown as` 往它身上写 `.mesh` / `.material`。引擎侧实测
  `UIMeshRenderer` **既无 `mesh` 也无 `material`**——它只是 UI 桥，靠同节点上的 `MeshRenderer`
  提供模型。运行期实测每个 `snake-mesh-*` 节点只有 `UIMeshRenderer` + `UITransform`，
  `modelComponent === false`，控制台刷 `node 'snake-mesh-ai-1' doesn't have any renderable component`。
  ⚠ 结论（已按 `06-battle.png` 复核，⛔ 不要把范围说大）：**只有蛇身/食物的纹理网格零渲染**，
  身体退化成 `fxGraphics` 画的白色分段管（场景内 Graphics 恰为 Background + Fx 两个）。
  蛇**头与尾走的是普通 `Sprite`（`sprite.spriteFrame = headFrame`），皮肤贴图在这条路径上正常生效**
  ——`06-battle.png` 里自机是小红的红色蛇头带眼睛，AI-8/AI-6 各有自己的头部贴图，食物也是贴图精灵。
  ⚠ 即：皮肤**只显示头/尾，身体纹理从未在真引擎出现过**；衣柜预览里的红/蓝/黄分段身体在战斗中看不到。
  修复：新增共用接缝 `view/rooms/snake/snakeQuadMesh.ts`，把三条引擎硬约束收在一处；两个渲染器
  改为先 `addComponent(MeshRenderer)` 再 `addComponent(UIMeshRenderer)`（⚠ 顺序即契约：桥只在
  `onLoad` 查一次 `cc.ModelRenderer`），四处 `as unknown as` 强制转换全部删除。
  ⚠ `MeshRenderer` 只在 `cc` **模块**里导出，**不在** `cc` 全局对象上（全局旧名 `ModelComponent`）——
  ⛔ 别用 `cc.MeshRenderer` 判断它是否可用。
- **F3｜已修**：`utils.createMesh` 建的是静态网格，逐帧更新被 `warnID(14200)` 拒绝。改用
  `utils.MeshUtils.createDynamicMesh`。⚠ 它的 `options` 是**整体默认、不是逐字段合并**
  （源码 `options || {...}`），`maxSubMeshes` / `maxSubMeshVertices` / `maxSubMeshIndices` 必须一起给全。
  ⚠ 顺带删掉了逐帧清尾循环：实测顶点与索引数由传入 subarray 的长度决定（传一半 → 计数同步减半），
  所以只需上传实际用到的前 N 个四边形；旧写法每条蛇每帧要写满整个容量（约 8.3 万次浮点写），
  那是为静态网格做的补偿。
- **F4｜已修**：根因比字面更深——effect 名 `builtin-ui` **在引擎里根本不存在**，材质因此拿到
  **零 pass**，于是任何 `setProperty` 都必然报 `illegal property name`。⚠ 改用 `for2d/builtin-sprite`
  也不行：它的 `cc_spriteTexture` 位于 local 描述符集，由 2D 批处理器按各自 SpriteFrame 逐次覆写。
  只有 `builtin-unlit` 把 `mainTexture` 声明为真正的 per-material 贴图槽。
  技法按**名**解析到 `alpha-blend`，⛔ 不用 `transparent`——两者混合状态相同，但后者多挂一个
  `planar-shadow` pass，会在纯 2D 战场上多画一层阴影。同时 `cullMode: NONE`：蛇身缎带的法线随
  转向翻正负，背面剔除会让一半转弯段消失。
- **F5｜未修**：结算页排版——标题「本次游玩结束」与「返回主页」落在结算底板**之外**（上/下溢出），
  只有中间三行在板内；且战斗 HUD（左右手／结束本次／排行榜／加速键／摇杆）在结算期仍可见可点。
- **F6｜未修**：复活提示无底板，文字直接压在蛇身上，`金币复活` 按钮被蛇身遮挡（见 `07-relive.png`）。
- **F7｜未修**：衣柜行的皮肤预览条向左**溢出面板边界**，并压住「皮肤 N」名称与稀有度行
  （见 `04-wardrobe.png`）。⚠ 这与 S3-04 已登记的「预览图底色色差」是两回事，那条是烘死在 PNG 里的
  不透明底，本条是排版溢出。对应 S5-CR-06。
- **F8｜未修·边界**：run 已结束、结算页在显示时，「结束本次」仍可点，弹出的确认框与结算页
  叠加互相压字。
- **F10｜已修**：蛇身贴图的 UV 映射是「每段拉伸一整帧」。⚠ 段长
  `pointSpacing = 8`、带宽 `bodyWidth = 36`，而身体帧 `snakebody0` 是 **96×96 的方形圆点**——
  整张方形帧被压进 8 单位长度（约 4.5 倍压缩），圆点自带的白色描边被挤成密集细带，表现为身体
  两侧的白色锯齿（见 `06-battle.png`）。⚠ 这是既有的几何设计，**不是 F2 修复引入的**——此前整条
  网格链是死的，所以从未显现。⛔ 也不是图集边界溢出，别去加半像素内缩。
  修复：`writeSnake` 从「每段一个四边形」改为「每隔 `repeatedBodyPointDistance` 个路径点画一个
  按该点朝向旋转的完整帧」，尺寸取 `rect × frameScale`（`frameScale` 新从 `deriveSkinLayoutMetrics`
  导出，此前只在函数内部用过）。⚠ 写入顺序必须是**尾 → 头**：所有四边形共用一个 mesh、按索引顺序
  绘制且不写深度，倒序才能让每个圆盖住身后那个、只露出朝尾一侧的圆弧。
  口径与三处已冻结的参照一致：原作 `SnakeGLNode.calRenderData` 的 NormalRepeat(2) 分支、
  S0 golden `tools/snake-s0-replication/render.mjs`、以及 16 张衣柜预览图的排布。
  实测各皮肤间距 16~32 世界单位、精灵恒为 36 宽，故必然重叠（原作重叠率 19%~50%）。
  ⚠ 路径点不足时一个身体精灵都放不下（短蛇只有头），这是**正确行为**，⛔ 不是缺陷。
- **F11｜新发现·已修**：F2 修好后新暴露的色彩管理问题——`builtin-unlit` 的输出走 `CCFragOutput`，
  在 `CC_USE_HDR && CC_TONE_MAPPING_TYPE == HDR_TONE_MAPPING_ACES`（本工程缺省成立）下会执行
  `ACESToneMap()` + `LinearToSRGB()`，而 `unlit-fs` 入口已做过 `SRGBToLinear()`，净传递函数是
  `out = sqrt(ACES(tex²))`。⚠ 蛇头/蛇尾是 `cc.Sprite`（`for2d/builtin-sprite` 原样输出），
  于是**同一条蛇的身体与头出现肉眼可见色差**（实测 255→229、128→156、32→22）。
  修复：建材质时把场景 `postSettings.toneMappingType` 置为 `LINEAR(1)`，ACES 分支不成立，两次 gamma
  正好抵消。⚠ 实测该宏参与着色器变体标识（变体名多出 `CC_TONE_MAPPING_TYPE1`），确认是重新编译
  而非命中旧变体；影响面仅限走 `CCFragOutput` 的材质，本仓纯 2D 只有这两个批渲染器用到。
  ⛔ 别改用给 `Material.initialize` 传 `CC_USE_HDR: false`——`program-lib` 会
  `Object.assign(defines, pipeline.macros)`，管线宏恒覆盖材质 defines（已实测无效）。
- **F12｜新发现·已修**：F10 删掉「逐帧清尾」后暴露的引擎硬约束——`Mesh.updateSubMesh` 只写
  `struct` 与 `subMesh.drawInfo`，**⛔ 不动 InputAssembler**；而 `gl.drawElements` 读的正是
  `inputAssembler.drawInfo.indexCount`，它在建网格时按满容量定死。实测（容量 24 索引）：上传一半后
  `subMesh.drawInfo` = 12 而 `inputAssembler.drawInfo` 仍是 24，调用 `MeshRenderer.onGeometryChanged()`
  后才降到 12。⚠ 后果是**绘制数量永不收缩**：蛇变短时上一帧写在尾部的四边形会继续被画出来。
  旧实现的「逐帧把尾部顶点清零成退化三角形」正是在补偿这一点（代价是每条蛇每帧约 8.3 万次浮点写）。
  修复：`attachQuadMesh` 把 `MeshRenderer` 交回调用方，每次 `uploadQuads` 后调 `onGeometryChanged()`。
  ⚠ 这一步同时让 `minPos/maxPos` 扫描变成有用功——它们的唯一读者就是其中的
  `Model.createBoundingShape`，两者是一对。
  ⚠ 本条由本轮的对抗性审阅发现（14 条候选、6 条经反驳后存活），⛔ 不是真机目视发现的——
  真机上它只在蛇变短时才显形。
- **F9｜观察**：`getComponent: Type must be non-nil`（传入 undefined 的组件类型，未定位）；
  `@colyseus/sdk: onMessage() not registered for type 's2c.pong'`。

⛔ F5～F8 未修，故 S5-05 本身**尚未完成**；F1/F2/F3/F4/F10/F11/F12 已修。

##### 本轮补的回归闸（全部做过变异验证）

⚠ F2 这一类缺陷的共同特征是「写了属性但到不了 GPU，且不抛异常」，Node 侧的假件与 .d.ts 桩
此前恰好把这些虚构成员声明成了存在的——所以补闸的重点不是多加断言，而是让**假件与真引擎同形**：

| 闸 | 变异（转红即有效） |
|---|---|
| 桩里 `UIMeshRenderer` 去掉 `mesh`/`material`、`SpriteFrame.pivot` 改 `readonly` | 写回赋值 → `TS2540` |
| 假 `UIMeshRenderer` 在 `onLoad` 查同节点 `MeshRenderer` | 颠倒组件添加顺序 |
| 材质 effect/technique/defines/states 逐项断言 | 退回 `builtin-ui`、硬编码 `transparent`、去掉 `USE_TEXTURE`、去掉 `cullMode:NONE` |
| 身体精灵数 = 由 `repeatedBodyPointDistance` 决定 | 退回按路径段、步长写死 1 |
| 精灵宽度 = `bodyWidth` | 漏乘 `frameScale` |
| 写入顺序尾 → 头 | 改成正序 |
| 每次上传后 `onGeometryChanged` | 去掉通知 |
| 蛇变短时上传顶点数下降 | 去掉通知（同上） |
| 清理时销毁动态网格 | `destroyRecord` 不销毁 |
| 建材质时切 LINEAR 色调映射 | 去掉调用、常量写成 ACES |

⚠ F10/F11 的**真引擎目视验证尚未完成**：本仓位于 `/Volumes/KimData` 非启动卷，Creator 的资源
监听收不到该卷的文件变更（实测原子替换与浏览器硬重载都无效），必须手动重开/刷新 Creator 才会
重新编译。已用运行时判据确认当前预览仍在跑旧几何：出生瞬间蛇身网格为 204 顶点 = 51 个四边形
= `initialPointCount - 1`，正是按段实现的特征值；新几何应约为其 1/4。

### S5-06：回写 demo 结论

- [ ] 把真实命令结果和 Creator 证据写入本页、专项 README 与 `plan-v5.md`。
- [ ] 全部完成后仅标记 `readyForDemoApproval=true`，由用户决定是否接受内部 demo。
- [ ] 最终说明必须保留 best-effort 写可能丢数据、多实例不一致和生产关闭三项限制。

## 验收矩阵

### 战场与输入

| ID | 断言 | 证据 |
|---|---|---|
| S5-WORLD-01 | 4096²、17 蛇、1000 Dot + 30 Star，无房级 deadline | 固定 seed fixture |
| S5-WORLD-02 | Star/磁铁按 20 Hz 权威推进，重连 baseline 一致 | tick 快照 |
| S5-WORLD-03 | 左右手、Safe Area 与多指输入不互抢 | 自动事件轨迹 |
| S5-WORLD-04 | 最后真人离开后房间可回收，集合回到基线 | churn 快照 |

### Demo 金币复活

| ID | 断言 | 证据 |
|---|---|---|
| S5-RELIVE-01 | 五档费用为 `100/200/300/300/300`，第六次不再提供 | 死亡序列 |
| S5-RELIVE-02 | 同一业务死亡换请求 ID 重试仍只扣一次 | 余额前后值 |
| S5-RELIVE-03 | S2R 单独运行时 key 不含 `sId`，HASH 只有 `coinBalance` | 真 Redis `HKEYS` |
| S5-RELIVE-04 | Redis 写失败不撤销复活 | 故障注入与 warning |
| S5-RELIVE-05 | 真人选择只冻结本人；AI 约 40 tick 重生 | 双真人/AI fixture |

### Demo 衣柜与奖励

| ID | 断言 | 证据 |
|---|---|---|
| S5-GROW-01 | 客户端自报皮肤无效，装备只影响下一 run | 连续两局快照 |
| S5-GROW-02 | 四款碎片门槛、超额保留和重复解锁正确，并写入同一 Redis HASH | profile 与 `HKEYS` + 白名单 `HMGET` 前后值（⛔ 判据不用 `HGETALL`，09·R1 全仓禁令） |
| S5-GROW-03 | 同一 run 只奖一次，AI/假榜/排名不发账号奖励 | 重复终局 fixture |
| S5-GROW-04 | 金币/XP 硬顶、等级、成就和碎片公式边界正确 | 参数化测试 |
| S5-GROW-05 | 结果只推送本人，其他玩家继续 Playing | 双真人 fixture |
| S5-GROW-06 | 写成功的 profile 可在重启后回灌；去重和最近结果不恢复 | 重启前后快照 |

### Creator

| ID | 断言 | 证据 |
|---|---|---|
| S5-CR-01 | 资源导入、`.meta`/UUID、动态包与 SpriteFrame 正常 | ✅ F1/F2/F3/F4 修复后战斗期控制台零告警（`06-battle.png`） |
| S5-CR-02 | `750 x 1624` 下 HUD、摇杆、按钮和弹窗无重叠 | 两组 Safe Area 录屏 |
| S5-CR-03 | 16 套皮肤、衣柜、复活和结果页完整可操作 | ⚠ 部分：衣柜/复活/结果页已取证，身体纹理已能渲染；⛔ 16 套逐一装备验证与 F10 白齿未做 |
| S5-CR-04 | 资源缺失时有稳定 fallback，不阻断退出 | 故障截图/日志 |
| S5-CR-05 | 战场底色为 `BACKGROUND_THEME = "dark"`（⚠ 与来源 fresh-install 的 light 不同，是已登记的实施选型） | ✅ `06-battle.png`/`07-relive.png` 深蓝底 + 网格 |
| S5-CR-06 | 衣柜行的皮肤预览与长名排版不挤压按钮区 | ⛔ 未过：见 F7，预览条溢出面板并压住名称/稀有度（`04-wardrobe.png`） |

## 退出条件

- [ ] S5-01～S5-06 全部完成，验收矩阵均有真实证据。
- [ ] 全量自动门禁和 Snake Redis profile 用例通过，生成镜像无漂移。
- [ ] `GameMode.ts`、`GameRoom.ts` 和 SQL schema 无本专项差异 —— ✅ **三者现已全部机检**：
      `npm run verify:protected-paths`（`apps/server/sql/schema.sql` 于 2026-09-05 加入 `gameplayFlow.paths`）。
- [ ] Creator 3.8.8 桌面预览完成；没有用无头测试冒充 Creator 证据。
- [ ] 文档只宣称内部 demo，不宣称生产金币或养成数据可靠。
- [ ] 用户基于绑定 commit 的证据明确接受后，S5 才能标记 `[已完成]`。

## 已知限制

- 物理真机、真实 Safe Area、真机多指和移动端性能未验证。
- Redis 写失败期间的衣柜/养成变化会在进程重启后丢失；去重与最近结果总会重置。
- 多进程下同账号数据可能分叉或覆盖。
- Redis 短暂失败后不会自动补写。
- 生产环境保持禁用，生产部署与渠道发行另立任务。

## 证据回写

| 项 | 状态 | commit | 自动验证 | Redis / Creator 证据 | 备注 |
|---|---|---|---|---|---|
| S5-01 冻结候选 | `[已完成]` | `80d78e2` | 不适用（台账） | 不适用 | 五层 + 三层目录 + 指纹见上表 |
| S5-02 自动门禁 | `[进行中]` | `80d78e2` | `verify:all` **exit 0**：client 435/435、server 604/604、FGUI 66/66、inventory 110/110 | 不适用 | ⛔ 真栈 int 用例**未跑**：本机无运行中的 Redis |
| S5-03 无头玩法验收 | `[未开始]` | - | - | - | 需逐条对照现有用例，⛔ 不能用 grep 计数冒充覆盖 |
| S5-04 demo 数据检查 | `[阻塞·需本地栈]` | - | - | - | 全部条目都要真 Redis |
| S5-05 Creator 预览 | `[进行中]` | 8 张证据 | - | - | 首跑完成并修复 F1；F2～F8 未修，F2 阻断皮肤目视 |
| S5-06 回写结论 | `[未开始]` | - | - | - | 待前五项齐备 |

---

[上一阶段：S4 Demo 养成奖励](s4-reliable-progression-rewards.md) · [专项索引](README.md)
