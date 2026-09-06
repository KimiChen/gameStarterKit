# apps/kits/ —— kit（地基层）目录（作者侧真源）

一个 kit 一个目录 `apps/kits/<id>/`（[docs/KIT.md](../../docs/KIT.md) §2/§3），与 `apps/plugins/<id>/` 对称：kit 是「定义了一类
游戏是什么」的地基（SQL 世界表、玩法、给插件用的 api 面），插件建在它上面。**kit 与 plugin 共享同一 id 空间与同一锁目录
`scripts/packages/`**（撞名即拒绝，同一 id 不能既是插件又是 kit）；宿主自有的 kit 没有 `version`，不可打包、不进锁。

| 文件 | 作用 |
| --- | --- |
| `kit.json` | 一个文件多面：**身份**（id / version / domains / description）+ **api 面**（`api.<surface>.{version,minSupported}`）+ **玩法清单**（`modes[]` ≡ `gameplays/` 子目录）+ **SQL 账本声明**（`sql.files` / `sql.tables[].zone`）+ **冷档键清单**（`userKeys`）+ **effect kind**（`effects`）+ 客户端登记（entry / viewDirs / views / owners / routes / menu …，命名空间是 `kits/`）。schema 单源 `apps/server/tools/plugin/kit-schema-v1.json` |
| `README.md` | kit 自述（`docs` 指向它）：定义了什么、插件该怎么用 api 面——审核清单里的人工项 |
| `gameplays/<modeId>/{manifest.json,state.json}` | 每个 mode 的玩法单源，与 `apps/shared/schema/gameplays/<id>/`、`apps/plugins/<id>/gameplay/` 同等被 `codegen:gameplays` 发现 |
| `sql/NNN-<name>.sql` | 迁移文件（表名 `k_<id 小写>_*`）：只由 `db:bootstrap` 按账本应用，`install` ⛔ 不碰数据库，⛔ 不改已发布迁移 |

- kit 写入仓库的其余路径（`apps/{shared,server,client}/src/kits/<id>/**`、每个 mode 的玩法落点、域文件、测试、镜像与 `.meta`）
  由 kit.json **纯函数推导**（`apps/server/tools/plugin/ownership.ts`，class=kit 规则集），不在推导集内的路径整包拒绝；
- 插件只能 import kit 的 api 门面 `apps/{shared,server,client}/src/kits/<id>/api/<surface>/index.ts`，并在 `plugin.json`
  的 `requires.kits.<id>.<surface>` 声明所依赖的面版本（`minSupported ≤ 声明 ≤ version`）；
- **可分发但须 gono 团队审核**（KIT.md §6）：kit 能碰的东西（SQL、玩法、世界状态、账本）比插件多得多，审核线就是安全线；
- 首个样本：[`arena`](arena/README.md)（一张 per-zone 世界表 + 两个 mode + 两个 api 面）与建在其 `board` 面上的插件
  [`apps/plugins/arenaShop`](../plugins/arenaShop/README.md)。

命令（与插件同一套 `plugin -- pack/install/uninstall/check/test`，kit 多出来的闸）见 [docs/PLUGIN.md](../../docs/PLUGIN.md) §5.4。
