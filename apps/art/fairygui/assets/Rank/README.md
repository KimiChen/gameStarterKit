# Rank —— 排行榜 FairyGUI 源（复刻原版，基于**更新后的**公司标准库重做）

从反编译原版生成的结构骨架（忠实原版布局 + 命名），放在 `apps/art/fairygui/assets/Rank`（与公司库 `Original`、`A` 平铺同级）。

## 复用策略（重做背景）
公司标准库更新为 `Original`（包 id `k85eojd9`，原子组件库）后，原 `Rank` 包被删，本包为**重做**。
排行榜要复用的公司原子里,**只有关闭按钮 `CloseButton1` 标了 `exported`、能跨包引用**；其余理想原子
（`CommonPopupBg` 弹窗框 / `CompTab`·`CompTabItem` / `CompSquareAvatar` / `CompHeroEquipStarItem`）**未 export**，
暂无法跨包引用。故按「混合」策略：

| 部件 | 现状 | 待公司 export 后换入 |
|---|---|---|
| 关闭按钮 | ✅ 跨包复用 `Original/CloseButton1`（`src=rftu3 pkg=k85eojd9`） | —（完成） |
| 面板外框 | 原版 `rankBg1`（三国屋檐 9宫）`img_panel` | `CommonPopupBg` |
| 总榜/省榜 Tab | 原版 `countryBtn`(选中金)/`provinceBtn`(未选灰)，代码换皮 | `CompTab`/`CompTabItem` |
| 排行行 / 奖牌 / 星 / 头像框 | 原版反编译美术（见下），代码驱动 | `CompSquareAvatar` / `CompHeroEquipStarItem` 等 |

换入套路（已被 CloseButton 验证）：公司把目标原子标 `exported="true"` → 本包 `<component src=资源id pkg=k85eojd9>` 引用 →
`RankView.ensurePackages(["ui/Original"])` 先加载 → 全局发布。见文末「待办·请公司 export」。

## 组件（对应原版）
| 组件 | 原版 | 作用 |
|---|---|---|
| `RankEntry` | `rankBtn` | 显示入口备用（运行时入口由 `MainMenuView` 代码按钮画） |
| `RankMain` | `RankScene.ls` | 全屏模态：屋檐面板 + 标题 + 关闭 + 总榜/省榜 Tab + 虚拟列表 + 固定「我的名次」行 |
| `RankItem` | `rankItem.lh` | 单行：行底/奖牌/名次数/头像框/昵称/省份/军衔/星级 |

## 命名契约（presenter/RankView 按名绑，改名 = 契约测红）
- **RankMain**：`ctrl_scope`(总榜/省榜)、`lst_rank`(虚拟 GList)、`jb_playerRank`、`btn_close`、`btn_country`/`btn_province`(Tab 皮 GLoader)、`txt_title`。
- **RankItem**：`img_bg`/`img_bg0`/`img_bg1`/`img_bg2`/`img_bgSelf`(5 行底叠放)、`ld_medal`、`txt_rankNum`、`img_avatarBg`+`ld_avatar`、`txt_name`、`txt_province`、`txt_rankTitle`、`ld_star0..4`+`ld_bigStar`、`txt_level`。全部**代码驱动、无控制器**。

## 榜单专属美术（`art/`，从原版反编译图集抽，忠实原版；配方 `tools/rank-extract-sprites.cjs`）
行底 `rankItem0/1/2/3`+`rankItemSelf`、奖牌 `rankImg0-3`、头像框 `avatarBg`、星 `star0/1`（皇帝大星复用 `star1`）、
面板 `rankBg1`、标题底 `titleBg`、Tab `countryBtn`/`provinceBtn`。换皮/星/奖牌逻辑忠实 `IndexedComponent.oK/lK`。
保留：头像本体（`avatarId` 1..16）原版运行时按 id/URL 动态载、不在图集，`ld_avatar` 先空（只显框）。

## 发布（编辑器·全局发布）
`Publish.json` 已修回 `../../client/assets/resources/ui`（曾被库更新重置到 `../assets/resources/UI`）。
**全局发布**（Original + A + Rank 一起）到 `resources/ui`：生成 `Rank.bin`+`Rank_atlas0.png` 与 `Original.bin`。
旧 demo 残包 `originalBag/Basics/MainMenu.bin` 已失源，可删。

## 🔖 待办·请公司把这些原子标 `exported`（标后按套路零重算换入）
`CommonPopupBg`（面板外框）、`CompTab`+`CompTabItem`（Tab）、`CompSquareAvatar`（头像）、`CompHeroEquipStarItem`（星级）。
