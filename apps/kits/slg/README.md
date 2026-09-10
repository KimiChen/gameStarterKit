# 大地图 kit（slg）

`slg` 是 SQL 权威的大地图机制样例，提供分别版本化的 `worldmap` / `march` 两个 API 面。阶段 1 包含地图页与即时占领，阶段 2a 包含行军 Lobby RPC 与懒结算；二者同批登记 SQL 与 API，不登记 `slgWorld` mode。地图现已接入「青原仙洲」地表、透明装饰和独立总览，默认入口仍由宿主 placement 决定。

阶段 1 / 2a 已于 2026-09-09 实现并验收：主树全量校验、真实 Creator 桌面地图预览、临时制品干净安装与独立空数据库迁移/包测试均通过。证据见 [本轮验收记录](../../../docs/evidence/creator-2026-09-09/slg/README.md)。实施依据见根 [slg.md](../../../slg.md)，框架接缝见 [docs/MMO.md](../../../docs/MMO.md)。

## 定义了什么

| 面 | 能力 |
| --- | --- |
| `worldmap` v1 | 10000×10000 地图坐标、16×16 chunk 数学、四档 LOD；按 chunk 矩形读稀疏地块；免费即时占领、攻击、加固 |
| `march` v1 | 行军令、确定性位置与时间计算；派遣、撤回、按目标顺序懒结算 |
| Lobby RPC 域 `slg` | `slg.mapTiles`、`slg.tileCapture`、`slg.marchDispatch`、`slg.marchRecall` |
| 客户端入口 | 菜单“大地图”，route `slgMap`，View `SlgMap`；拖动、惯性、双指缩放及桌面滚轮；“总览”含可定位的实地图与山河绘卷预览；阶段 2a 不提供行军操作面板 |
| `stats` / `trophy` | per-user `stats.trophies`；只有 `kit:slg:trophy` effect 增加奖杯，独立于金币，不可兑换 |

## 冻结规则

- 地图没有主城、连地、地形阻挡或路径搜索。静态地形只影响显示；免费即时操作允许对任意合法格发起。
- 无主格占领后守备为 1；己方格加固 1，最高 99；敌方格削守备 1，归零的这次操作立即夺取并设守备为 1。每次改主给新主人 1 个奖杯，加固不发奖杯。
- 行军只能从当前己方格出发，每用户每区最多 3 支活动行军；起终点不同。直线匀速每秒 1 格，按欧氏距离计算到达时间；每次到达的守备作用固定为 1，与即时操作使用同一规则。
- 派遣扣现有经济账本的 1 金币；撤回不退款。不新增赠币或测试货币渠道，使用宿主已有开发测试种币方式。起点非法、非己方、起终相同、活动上限或余额不足均拒绝且不扣款。
- 出发后起点失守不取消行军。到达时按目标的实际归属结算；同一目标依 `arrive_at`、再依 `march_id` 升序逐条处理，即时操作先处理该目标已到达的行军。
- `arrive_at` 前可撤回；已到达的行军先结算，不能靠迟到撤回来撤销结果。到达或撤回即结束，没有兵力库存、返程行军或资源返还。

## SQL、回执与变更日志

所有表均为 per-zone，`server_id` 进入主键。`sql/001-init.sql` 登记 `k_slg_revision`、`k_slg_tile`、`k_slg_capture`、`k_slg_tile_log`；`sql/002-march.sql` 追加 `k_slg_march`、`k_slg_march_receipt`、`k_slg_march_log`。迁移只由 `db:bootstrap` 按 `kit_migration` 账本应用；发布后只能追加迁移，安装命令不操作数据库。

- 地块采用稀疏存储，缺行表示默认无主格。写入走唯一键插入、冲突后事务内重读，再依据实际状态计算结果。
- 每区先锁 `k_slg_revision` 行，持锁至事务提交；地块/行军日志逐行分配同一序列的 revision，避免较小 revision 晚提交。单独一张日志可能有缺号。该串行化是当前机制样例的明确取舍，后续按容量证据优化。
- `k_slg_capture` 和 `k_slg_march_receipt` 持久绑定操作身份、用户、规范载荷摘要、契约版本及原始响应。相同请求跨 RPC 缓存期重放，不重复扣款、削守备、加固或发奖；操作身份与载荷不一致时拒绝。
- 世界状态、回执、日志、金币账本与奖励 intent 在同一事务提交。领域锁顺序为 revision → tile → march → receipt → 经济/effect；批次有界。服务端 kit 只经 `core/infra/kitApi` 访问 SQL、经济与 effect，不取原始连接。
- 行军结束追加 tombstone。阶段 1 / 2a 先写耐久日志；阶段 2b 才实现各房独立游标、保留窗口与 baseline 接续。日志与回执目前不主动裁剪，不能假定仅凭日志表已完成跨房同步。

当前懒结算按全区到达总序处理，每个事务最多 32 条；新操作先推进到期队列，积压超过单轮预算时提交本轮进度，再返回 `SLG_SETTLEMENT_PENDING`，客户端可稍后重试。`slg.mapTiles` 因此登记为 natural-write，读取地图也可能推进到期行军。请求回执重放优先于补算，已完成请求不会因为积压再次执行。

## 插件怎么消费

插件在 `plugin.json` 声明所需的 API 面，例如：

```json
{ "requires": { "kits": { "slg": { "worldmap": 1, "march": 1 } } } }
```

只从 `apps/{shared,server,client}/src/kits/slg/api/<surface>/index.ts` 导入公开能力。服务端/shared 可使用 `@game/shared/kits/slg/api/<surface>/index` 子路径，客户端使用不带扩展名的相对路径；不要导入 repo、host 或 View 内部实现。RPC 请求与响应形态属于对应 API 面，契约变化需同步维护该面的版本兼容范围。

| 服务端 API 面 | 当前公开方法与类型 |
| --- | --- |
| `worldmap` v1 | `readTiles(uid, sId, rect)`、`captureTile(uid, sId, tileId, operation)`；`ISlgMapTilesRes`、`ISlgTileCaptureRes` |
| `march` v1 | `dispatchMarch(uid, sId, fromTile, toTile, operation)`、`recallMarch(uid, sId, marchId, operation)`、`settleDueMarches(sId)`；`ISlgMarchDispatchRes`、`ISlgMarchRecallRes` |

两面均提供 `SlgOperation` 与 `slgOperation` 操作身份助手，摘要和契约版本只取框架注入的 `ctx.operation`。总工厂与跨实体 `readChanges` 留在内部 `service` 供事务测试使用；阶段 2b 再按面提供消费者游标 API，声明 `worldmap` 依赖不能直接取得行军能力。

`worldmap` 面负责地图读取和即时操作，`march` 面负责行军数学与派遣/撤回。服务端 API 统一负责世界写入，未来房 tick 和 worker 复用同一结算入口；插件不另写 SQL 或直接发送房间 AOI 数据。

## 静态内容与素材

`data/terrain.json` 是原创「青原仙洲」地图，客户端资源 `apps/Cocos/assets/resources/kits/slg/terrain.json` 为其逐字节镜像。现有布局使用六类地形与 55 个矩形区域：北部雪岭、西部赤岩、南部林地、东部灵海和中央青原，并以水域连接各区。格式仍为 `name / width / height / palette / regions`：id 为 0 的草地隐式覆盖全图，矩形按登记顺序覆盖；保持 16 色与 512 区域上限。

世界仍为 10000×10000 格（1 亿格），每个 chunk 为 16×16 格。SQL 只保存发生变化的地块，客户端只加载视口附近的 chunk；静态内容和总览均不生成或遍历 1 亿条地形记录。

美术源文件见 [青原仙洲素材包](art/qingyuan-v1/README.md)：地表和透明装饰图集各为 1536×1024（3 列×2 行，每格 512×512），山河绘卷为 1254×1254。三张运行时图片位于 `apps/Cocos/assets/resources/kits/slg/qingyuan/`，逐字节镜像已批准的源图；纯洋红底稿只保留在素材目录。图集索引、地标和装饰配置的唯一真源是 `apps/client/src/kits/slg/logic/mapArt.ts`，没有另建 `atlas.json`。

- 地表每 chunk 使用一个贴图动态网格。UV 按世界格 x/y 奇偶分别镜像，使同地形相邻格在块内与跨块边界采样相同图像边；同时内缩半个纹理像素。导入采样为线性、clamp-to-edge、无 mipmap。地表 ID 0–5 保留原图颜色，6–15 使用色板 RGB 为草地后备纹理着色。
- 地块归属使用独立的无贴图半透明网格：我方蓝色、敌方红色、alpha 0.40；与地表格位置对齐，近景网格间隙由 `mapLayers.ts` 统一控制。装饰位于地表之上、选中框之下。
- 装饰按 chunk 确定性布置，每块最多 7 件（含最多 1 个地标），每个非空块一个透明贴图网格。内部 LOD 0–3 的普通装饰数量上限为 6/4/2/0，已加载块内的地标四档均保留；装饰完整范围留在所属块内。缓存只随块增删和 LOD 更新，权威地块版本变化不重建静态装饰；离开保留范围后销毁对应节点和网格，未实现对象池。
- “实地图”直接从同一份 `terrain.json` 绘制区域轮廓，显示同源地标、当前位置和视野框；点击地图或地标可定位。“山河绘卷”显示独立美术预览，不参与坐标导航。总览不请求全世界地块；打开期间隔离局部地图手势、惯性和选格输入。
- 页面通过 `SlgArtResources` 统一加载地形和三张贴图并持有引用，关闭时先销毁网格、材质与 SpriteFrame，再释放资源引用。失败及过期加载会回收已取得的引用；加载失败可点击“刷新”重试。

本轮只改变静态布局和显示，不新增地形阻挡、寻路、宗门经营、采矿、传送或行军规则。改动地形或图片时保持源文件与资源镜像一致；源码镜像仍通过 `sync:client` 刷新。具体文件与接入状态见 [实施记录](art/qingyuan-v1/IMPLEMENTATION-PLAN.md)。

## 验收与后续边界

2026-09-09 验收通过：`verify:all` 退出 0（FGUI 66、inventory 115、客户端 487、服务端 749 个测试）；Creator 桌面预览 17 步、13 张截图、console 空，涵盖地图打开、选格占领及刷新、鼠标拖动、滚轮四档 LOD、关闭；临时制品干净安装后按包锁执行 `plugin -- test slg --int`，35/35 通过，含真实 SQL/Redis 集成 9 条。独立空库首次应用 SLG 001/002 的 4+3 条建表语句，重复 bootstrap 新应用 0、跳过 3（含 arena）；临时库已清理。完整证据及范围见 [验收记录](../../../docs/evidence/creator-2026-09-09/slg/README.md)。触屏 pinch 当前只有逻辑测试，截图中的 60 FPS 是单次预览读数，未作容量结论。

2026-09-10「青原仙洲」美术接入已验收：`verify:all` 退出 0（FGUI 66、inventory 115、客户端 513、服务端 751 个测试）；Creator 23 步、19 张截图、console 空，覆盖地表和透明装饰、占领刷新、四档 LOD、实地图定位、绘卷输入隔离、关闭及重开资源。资源加载失败后的引用回收由客户端测试覆盖；未做真实触屏、失败资源注入或长跑内存实验。详见 [美术接入验收记录](../../../docs/evidence/creator-2026-09-10/slg-art/README.md)。

2026-09-10 修复设置页 ScrollView 吞掉地图输入的回归：地图改用全屏前景节点接收触摸、鼠标和滚轮，关闭时解绑，鼠标离开画布时取消手势；预览入口适配 `card-map`。Chrome 标准流程 23/23 步、补充隔离检查 7/7 步通过，console 空，确认中央操作不滚动后台设置，标题栏和总览不穿透，关闭后设置恢复滚动。详见 [输入修复验收记录](../../../docs/evidence/creator-2026-09-10/slg-input-fix/README.md)。

主树的 SLG 是宿主自有包，manifest 保持无 `version`，不可直接 pack 或执行要求已安装包锁的 `plugin -- test slg`。包测试在临时副本补 `version:"0.1.0"` 后生成制品，再安装到临时宿主，依据 install 产生的锁运行 `npm --workspace @game/server run plugin -- test slg --int`；测试版本和临时安装锁不回灌主树。主树通过源码测试及 `verify:all` 验证。

阶段 2b 等待 MF5 的正式原语及 GameRoom 消费验收，才加入地图房、按视野同步、军队与行军线、客户端连接四件套。正式 SLG 名册不广播全房 id/name，只随视野内地块/军队提供必要归属；视口仅存在于服务端会话表。MF5 必须同时处理 GameRoom 当前 root `players` 约束，不能仅靠 perSession 消息宣称完成可见性隔离。

无人在线自动到达结算等待 MF7 的租约保护受限 KitTx worker。此前只在后续相关 RPC 触发时懒结算；尚无房间阶段，不能承诺后台按时执行。MF5/MF7 按 MMO 框架阶段独立实施，SLG 不自行建立 AOI 内核或绕过框架租约表。
