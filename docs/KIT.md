# kit（地基层）设计提案

> 状态：**提案 v2 已拍板（2026-09-06；v1 经三名审阅者对抗审阅后改写，53 条发现全部消化；§9 五条拍板项用户全部同意，待实施）**。本文定义框架与
> 插件之间的第三层 **kit**——「定义了一类游戏是什么」的地基（SLG 的 worldmap 这种），商城 / 邮件 / 好友这类插件建在它
> 上面，同一个商城在不同 kit 上是不同的插件。已定前提（用户拍板）：kit **可分发**，但**只有经 gono 开发团队审核的 kit
> 才能进注册表**；`feature` 一词不再是仓内概念。实施状态只在本文 §9 回写；⛔ 不进 plan-v5。
>
> 前置文档：[docs/PLUGIN.md](PLUGIN.md)（包格式、所有权推导、安装动线）、[docs/PLUGIN-REGISTRY.md](PLUGIN-REGISTRY.md)
> （注册表）。本文只写 kit 相对于插件**多出来**的东西；相同部分直接复用。凡是要动框架的地方都标了「框架 PR」——
> 它们是 kit 机制的前置，不是 kit 自己能带进来的。

## 1. 三层与信任模型

| 层 | 谁定义 | 谁审核 | 能定义什么 | 依赖 |
| --- | --- | --- | --- | --- |
| 框架（gono 本仓） | gono 团队 | 框架 PR | 协议信封、房间 / 大厅 / 经济原语、`plugin-api` / `kit-api` 门面、迁移账本、区表登记 | — |
| kit | 任何人 | **gono 团队审核后才可分发**（§6） | 一类游戏的地基契约：shared 类型、RPC 域、持久世界状态（含 SQL 表）、服务端服务、玩法（可多个）、客户端基础页与端口、给插件用的 `kit-api` | 只依赖框架（v0 ⛔ 不依赖别的 kit） |
| plugin | 可信同事 | 自发布（owners） | ⛔ 不能定义，只消费框架与所声明 kit 的 api | 框架 + 0..n 个 kit |

PLUGIN.md §1 的核心判据「插件只能消费不能定义」不变；kit 是**被审核的定义方**。审核线就是安全线：kit 能碰的东西
（SQL、玩法、世界状态）比插件多得多，分发门槛也高得多。

一个 SLG 游戏 = 框架 + `slg` kit（worldmap / march / alliance 是它的三个 **api 面**，§4）+ 建在它上面的商城 / 邮件 / 好友插件。

## 2. kit 能定义什么、不能定义什么（划线）

**可以（kit 的推导集内；包 id 与目录名相同，⛔ 不复用 `plugins/` 命名空间）**

| 面 | 落点 | 说明 |
| --- | --- | --- |
| 登记与单源 | `apps/kits/<id>/{kit.json, README.md, gameplays/<modeId>/, sql/}` | 一个 kit 一个目录，与 `apps/plugins/<id>/` 对称 |
| shared 类型与校验器 | `apps/shared/src/kits/<id>/**` | 零依赖 shared 规则不变；跨包复用的类型只能从这里出 |
| Lobby RPC 域 | `domains/<d>.ts` + `websocket/<d>/` + 向量 sidecar | 域名必须以包 id 开头（`slg`、`slgAdmin`）；**该规则对插件同样生效**（框架 PR，否则插件可先占 kit 的前缀） |
| 持久世界状态（SQL） | `apps/kits/<id>/sql/NNN-<name>.sql` | 表名 `k_<id 小写>_*`；每张表在 `kit.json.sql.tables` 里声明 `zone`（§5）；**插件 ⛔ 不可** |
| Redis 键 | `kKitUser` / `kKitShared` 工厂，前缀 `kt:` | 与 `gp:` / `pl:` 互不可达；共享键的 hash-tag 必须带区或分片键（`{<id>:s<sId>}` / `{<id>:<shard>}`），⛔ 不允许整 kit 一个 tag |
| 服务端服务与任务 | `apps/server/src/kits/<id>/**`、`core/compute/tasks/kits/<id>/**` | 长计算仍走 compute 任务（铁律 11）；⛔ 不再给 `core/<id>/`（那是插件的落点） |
| 玩法 | `apps/kits/<id>/gameplays/<modeId>/{manifest,state}.json` + 各玩法既有落点 | 一个 kit 可带多个 mode；modeId 是全仓玩法 id 空间的成员，⛔ 不得与任何包 id 大小写归一相等 |
| 客户端基础页、端口、路由、菜单 | `apps/client/src/kits/<id>/**`，登记面写在 `kit.json` | 与插件登记面同一字段集，但命名空间是 `kits/` |
| 给插件用的 API | `apps/{shared,server,client}/src/kits/<id>/api/<surface>/index.ts` | §4 |
| FGUI 包、资源、配表 | `apps/art/fairygui/assets/<Pkg>/`、`resources/kits/<id>/`、配表 `<id>_*` | 与插件同一形态 |

**不可以（硬排除，与插件相同再加四条）**

- 框架保护面：协议信封、`LOBBY_PROTOCOL_VERSION` / `GAME_ROOM_PROTOCOL_VERSION` 语义、`core/infra`、`rooms/core`、`app/**`、
  `apps/server/sql/`（含字节锁的 `schema.sql`）、`protected-paths.json` 登记的一切；
- npm 依赖、根命令、tsconfig、`.env`；
- 经济原语：⛔ 不得自建第二套货币账本；扣款 / 入账只经 `kit-api/server` 暴露的 `debitInTx` / `creditInTx`（§4）；
- 别的 kit / 插件的表、键、目录；
- SQL 里 ⛔ TRIGGER / EVENT / PROCEDURE / FUNCTION / GRANT / USE / 指向非本 kit 表的外键 / 任何 `DROP`；
- 导入期副作用（模块顶层只允许声明与注册）。

## 3. 包格式：`kit.json`

`kit.json` 有自己的 schema（`apps/server/tools/plugin/kit-schema-v1.json`）：登记面字段与 `plugin.json` v2 同名同义，但路径
pattern、命名空间闸（`isKitClientDir`）、entry 形态都指向 `kits/`——⛔ 不是「复用 plugin schema 片段」，是两份 schema 共用一个解释器。

```json
{
  "schemaVersion": 1,
  "id": "slg",
  "version": "1.0.0",
  "description": "SLG 地基：世界地图 / 行军 / 联盟",
  "api": { "worldmap": { "version": 1, "minSupported": 1 }, "march": { "version": 1, "minSupported": 1 } },
  "domains": ["slg", "slgAdmin"],
  "modes": [{ "id": "battle", "constantName": "SlgBattle" }, { "id": "march", "constantName": "SlgMarch" }],
  "sql": { "files": ["sql/001-init.sql"], "tables": [{ "name": "k_slg_tile", "zone": "per-zone" }, { "name": "k_slg_world", "zone": "global" }] },
  "userKeys": ["tileOwner", "marchQueue"],
  "entry": "apps/client/src/kits/slg/index.ts",
  "routes": [], "menu": [], "viewDirs": [], "views": [], "owners": []
}
```

- `api`：命名 api 面集合（§4）；任一面变化必 bump `version`。单面 kit 用 `default`。
- `modes`：kit 自带的玩法清单（id + constantName），锁抬头用它替代插件的单个 `constantName`；所有权按每个 mode 各推一组
  gameplay 规则（`gameplays/<modeId>/`、`apps/shared/src/gameplays/<modeId>/`、`rooms/modes/<modeId>/`、`<Constant>Room.ts`、
  `wire-vectors/<modeId>.ts`、`<modeId>-*.test.ts`）。
- `sql.files`：迁移文件顺序；`sql.tables`：每张表的 `zone`（§5）。
- `userKeys`：kit 的 per-user Redis 键名清单——冷档 freeze/thaw 按它快照与 UNLINK（框架 PR：freeze/thaw 读该清单）。
- 没有 `version` = 宿主自有 kit（与插件同规则：不可打包、不进锁）。
- 派生形态：`client`（有登记）/ `gameplay`（modes 非空）/ `server`（有 sql 或 `apps/server/src/kits/<id>/`）——纯 SQL + 服务的
  kit 合法（插件工具的「两者皆无即拒绝」对 kit 放宽为「三者皆无即拒绝」）。
- 锁：与插件同一目录、同一形态，抬头多一个 `"class":"kit"`。**锁目录改为 `scripts/packages/`**（框架 PR：两把插件锁
  `git mv`，`plugin-lock.test.ts`、`foreignLockOwners`、两两不交、id 大小写归一唯一都只扫这一处）——kit 与 plugin 的 id
  共享同一命名空间，撞名即拒绝。

## 4. kit-api：插件怎么建在 kit 上

- kit 在三端各导出若干 **api 面**：`apps/{shared,server,client}/src/kits/<id>/api/<surface>/index.ts`。插件只能 import 门面，
  ⛔ 不能 import kit 内部模块。导入边界**按解析后的路径**机检（不是按裸说明符）：客户端只有相对导入（Cocos 编译链，铁律 3），
  允许的目标是 `apps/client/src/kits/<id>/api/**` 与自身目录；服务端 / shared 允许 `@game/shared/kits/<id>/api/<surface>/index`
  子路径与 `apps/server/src/kits/<id>/api/**`。这与 PLUGIN-REGISTRY §4.3 的 plugin-api 边界是同一道闸的两条规则。
- `kit-api/server` 由框架提供三样插件与 kit 都拿不到的东西（框架 PR）：`withKitTx(sId, fn(conn))`（限定在 `k_<id>_*` 表的
  事务句柄）、`debitInTx` / `creditInTx`（经济主账本的事务内调用）、outbox 写入；以及构建期登记命名空间化 effect kind
  （`kit:<id>:<name>` + 零依赖 validator，随 codegen 汇入 effect 表与 Lua 镜像）。没有这三样，「世界状态在 SQL、经济在框架」
  之间没有原子路径。
- 插件声明依赖：`plugin.json` 加 `requires: { kits: { "slg": { "worldmap": 1 } } }`（**plugin schema v2 → v3**，`requires` 进
  锁抬头、身份摘要、注册表索引；PLUGIN.md §5.3 与 PLUGIN-REGISTRY §2.1 / §5 同步改口径：依赖解析只做 plugin → kit 单向）。
  判定：`kit.api.<surface>.minSupported ≤ 声明 ≤ version`；`install` / `check` / 注册表 `validate` 都查；宿主未装该 kit 即拒绝。
  `codegen:plugins` 把 `requires.kits` 自动并入 PluginHost 的 `dependencies`（有 entry 的 kit 先装载），⛔ 不写两遍。
- **kit 升级的反向闸**：kit 的 `install` / `--reinstall-from-tree` 落盘前读全部已安装插件的 `requires.kits`，任一声明落到新的
  `[minSupported, version]` 之外即拒绝并点名插件，显式 `--break-dependents` 才放行。
- 同一个商城在 SLG 与 MMO 上是**两个插件 id**（`shopSlg` / `shopMmo`）；⛔ v0 不做「商城接口 + 多实现」。
- kit 之间：v0 ⛔ 不允许 kit 依赖 kit。SLG 做成一个 `slg` kit，worldmap / march / alliance 是三个 api 面，各自独立
  versioning——alliance 的破坏性变化不连坐只依赖 worldmap 面的插件。等真出现第二个要复用 worldmap 的 kit 再开 kit-on-kit。

## 5. 数据：SQL 迁移账本与区（相对插件多出来的核心）

**原则：`install` / `uninstall` 只做文件级操作，⛔ 不碰 MySQL。** 表的唯一应用者是 `db:bootstrap`（树 + 账本），install 的
`nextSteps` 只打印「运行 db:bootstrap」。理由：安装是离线、可在 CI / fixture 跑通的（PLUGIN.md §5.4），DDL 隐式提交、不可
回滚，把它挂在 install 上会制造「文件回滚了、表留下了」的半态。

| 项 | 规则 |
| --- | --- |
| 账本（框架 PR） | `schema.sql` 增加 `kit_migration(kit_id, file, sha256, applied_at)`；`db:bootstrap` 在 `singleton_lease('db_bootstrap')` 下、按 kit id + 文件序，只应用账本里没有的文件，逐条语句执行（`multipleStatements:false`），失败点名到语句；已应用文件 sha256 变化即 fail-closed（这就是「⛔ 不改已发布迁移」的机检形态） |
| 幂等 | 有账本后 `.sql` 不必自身幂等：`CREATE TABLE`、`ALTER TABLE ADD COLUMN` 都只跑一次。审核清单里的「应用两遍」改为「重跑 bootstrap 零 DDL」 |
| 区 | `sql.tables[].zone` 无缺省：`per-zone` 表必须有 `server_id SMALLINT UNSIGNED NOT NULL` 且进主键与每个 UNIQUE；`global` 表不得有；框架维护「按区表登记」（框架 PR），关单区 / 统计 / 冷档遍历时自动汇入 kit 表 |
| 卸载 | `uninstall` 删文件、收缩生成物，表**保留**；`uninstall --drop-data` 的 drop 清单来自账本 + `INFORMATION_SCHEMA` 的 `k_<id>_` 前缀（⛔ 不读已删的文件），同时按 `kt:<id>:` 前缀 SCAN 有界清理 Redis；`check`（或 bootstrap）对「账本有 kit X 而树无 kit X」告警 |
| 冷档 | kit 的 per-user 键按 `kit.json.userKeys` 进 freeze 快照与 thaw 恢复（框架 PR）；共享键不冻结 |
| 升级 | 新增迁移只追加文件；表结构演进用 `ALTER … ADD COLUMN`（账本保证只跑一次），需要守卫的复杂变更写成 TS 迁移步（沿用 db-bootstrap 的 INFORMATION_SCHEMA 先例） |

## 6. 审核线（注册表侧）

注册表多出一个包类别与一个追加式审核记录：

```text
packages/<id>/<version>/publish.json        多 "class": "kit" | "plugin"
packages/<id>/<version>/reviews/NNN.json    仅 kit，追加式：{ action: "approve"|"reject"|"revoke", reviewer:{login,githubId},
                                            at, frameworkCommit, checklist:{…}, notes, zipSha256, filesLockSha256, signature }
```

- **状态**由 reviews/ 派生：无记录 = pending；最后一条 approve = approved；reject / revoke 即不可安装。`revoke` 是审核方
  对已批准坏 kit 的撤销路径（与 owner 的 `yank` 并列，二者任一即下架）。索引里 kit 的 `latest` = **最高的已批准版本**，
  pending 版本默认不被解析。
- **谁能审**：注册表自己做 GitHub OAuth（独立 App，scope `read:org`），审核动作实时复核 `gono-maintainers` 团队成员关系；
  发布者 ∪ owners 不能审自己的。v0 若 OAuth App 未就绪，退路是制品树里一份签名过的 `maintainers.json`（githubId 列表，改动走审计）。
  ⚠ 这意味着注册表的身份源是 GitHub 本身（WebPlatform 契约不暴露 GitHub 身份），PLUGIN-REGISTRY §3「鉴权」行同步改。
- **签名与可信根**：批准时注册表用 gono 审核密钥对 `reviews/NNN.json` 的规范字节签名，记录内嵌 `zipSha256` 与
  `filesLockSha256` 形成 sig → review → zip 链；公钥钉在框架仓 `scripts/kits/allowed_signers`（登记进 protected-paths.json，
  轮换 = 框架 PR）。`publish.json` 仍由发布者按 PLUGIN-REGISTRY §3.3 签。
- **宿主侧强制**：kit 的 `install --from-registry` 校验签名链，失败拒装；本地 `install <zip>` / `--reinstall-from-tree` 装 kit
  时若 zip 内没有经校验的 review 记录，必须显式 `--allow-unreviewed`，且只在 `NODE_ENV !== production` 生效，锁抬头写
  `"reviewed":false`，`check` 告警、`verify:all` 在 CI 环境（`CI=1`）红。
- **审核清单**（reviews/NNN.json.checklist；机检项由注册表 `validate` 自动填，人工项由审核者勾）：

  | 项 | 机检 / 人工 |
  | --- | --- |
  | `validate` 在固定 commit 通过（所有权 / allowlist / 镜像 / uuid / 域名前缀） | 机检 |
  | 导入边界：只 import 框架门面、`kit-api` 与自身 | 机检（K1 的边界测试） |
  | SQL：表名前缀、`zone` 声明与 `server_id` 形态、禁用语句、账本驱动下重跑零 DDL | 机检（SQL 语法级 lint + 一次性数据库实跑两遍） |
  | api：每个面的 `version` / `minSupported` 相对上一已批版本的变化方向 | 机检（导出符号 diff） |
  | 测试：`plugin -- test <id>`（K0 新增：按锁枚举包内测试单跑）通过 | 机检 |
  | README 写清定义了什么、插件该怎么用 api；设计是否符合 §2 划线 | 人工 |

## 7. 宿主侧落点与工具改动（K0 清单）

- 目录：`apps/kits/<id>/`；代码命名空间 `apps/{shared,server,client}/src/kits/<id>/`（三处新目录进推导集与 `isSharedNamespace`）。
- 发现根（四处都要加）：`codegen:gameplays`（`apps/kits/*/gameplays/*/`，断言 manifest.id === 子目录名且不与任何包 id 撞）、
  `codegen:plugins` 的登记面（`apps/kits/*/kit.json`，catalog 多 `class` 字段）与玩法 id 集、`verify-inventory` 的 capability
  fragment、客户端 `homeMenu.test.ts` 的手写并集。
- 工具：`kit-schema-v1.json` + 同一解释器；`deriveOwnership` 加 class=kit 规则集（按 modes 逐个推玩法规则）；锁目录合并到
  `scripts/packages/`（含两把插件锁迁移）；`check` 加「插件依赖的 kit 都在且 api 兼容」「账本 vs 树」；`uninstall` 加依赖反查
  （依据 = 各插件锁抬头的 `requires`）与 `--drop-data`；`install` 加反向闸 `--break-dependents`；新增 `plugin -- test <id>`。
- 框架 PR（前置，⛔ 不在 kit 包内）：`kit_migration` 账本 + bootstrap 租约 + 逐语句执行；按区表登记；freeze/thaw 读 `userKeys`；
  `kKitUser` / `kKitShared`（`kt:`，共享键强制分片 tag）；`kit-api/server` 的 `withKitTx` / `debitInTx` / `creditInTx` / outbox；
  effect kind 登记通道；域名前缀规则对插件生效；plugin schema v3（`requires`）；`scripts/kits/allowed_signers`。

## 8. 分期与首个样本

| 期 | 内容 |
| --- | --- |
| K0（机制） | §7 全部；样本 kit 走通 pack → install → codegen → bootstrap → 插件建在其上 → uninstall |
| K1（门面与边界） | `kit-api` 路径级导入边界机检（与 plugin-api 同批）；`plugin -- test` |
| K2（注册表） | `class: kit`、`reviews/` 追加式记录、GitHub OAuth + 团队判定、审核签名链、`latest` 按已批准重算、CLI 拒装未审核 |
| 样本 | `arena` kit：一张 SQL 世界表（per-zone）+ 两个 mode（`arenaCapture`、`arenaDuel`）+ 两个 api 面（`board`、`ranking`）+ 一个建在 `board` 面上的 `arenaShop` 插件——这四样正好覆盖 kit 相对插件多出来的全部机制；之后再做 `slg` |

## 9. 实施状态

| 项 | 状态 |
| --- | --- |
| 拍板前提（可分发 + gono 审核；`feature` 不作仓内概念） | ✅ 2026-09-06 用户决定 |
| v1 → v2：对抗审阅（接缝 / 数据 / 审核线三视角，53 条） | ✅ 2026-09-06：SQL 落点统一到 kit 目录、迁移账本取代「幂等 .sql」、install 不碰 MySQL、多 mode 身份模型、api 命名面、锁目录合并、路径级导入边界、reviews/ 追加式 + 签名链 + revoke、GitHub OAuth 作身份源 |
| §2 划线 / §3 格式 / §4 api / §5 数据 / §6 审核线 | ✅ 2026-09-06 用户拍板（下列五条全部同意） |
| K0 / K1 / K2 / 样本 | 未开始 |

**已拍板**（2026-09-06，全部同意）：

1. §5 kit 允许带 SQL（`apps/kits/<id>/sql/`，账本驱动、`install` 不碰数据库、表声明 `zone`、卸载不 drop）。
2. §4 v0 不做 kit-on-kit：SLG 做成一个 `slg` kit，子系统作为独立 **api 面** 各自 versioning。
3. §6 注册表的身份源改为 GitHub OAuth 本身（团队成员关系从 GitHub 读），WebPlatform SSO 不再是注册表的登录方式。
4. §3 锁目录合并为 `scripts/packages/`（kit 与 plugin 共享 id 空间）。
5. §8 先用 `arena` kit + `arenaShop` 插件走通机制，再做 `slg`。
