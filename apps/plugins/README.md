# apps/plugins/ —— 插件目录（作者侧真源）

一个插件一个目录 `apps/plugins/<id>/`（PLUGIN.md §5.5）；宿主自带的（builtin / snake / snakeCosmetic）和安装进来的
（redeem / tally …）是同一种东西，区别只有一条：**宿主自有的没有 `version`，不可打包、不进锁**。

| 文件 | 作用 |
| --- | --- |
| `plugin.json` | 一个文件两面：**身份**（id / version / domains / fguiPackages / description）+ **客户端登记**（entry / viewDirs / views / owners / routes / menu / dependencies / resident / category / docs / capabilities）。schema 单源 `apps/server/tools/plugin/plugin-schema-v2.json`；⛔ 没有 kinds / constantName / requires——有客户端登记即 client 形态，有 `gameplay/` 即 gameplay 形态，constantName 从 gameplay manifest 派生 |
| `README.md` | 插件自述文档（`docs` 指向它） |
| `gameplay/{manifest.json,state.json}` | 玩法单源，与 `apps/shared/schema/gameplays/<id>/` 同等被 `codegen:gameplays` 发现 |
| `host.json`（本目录根） | 宿主 placement：默认玩法与首屏入口顺序，⛔ 插件无权声明位置；`host` / `registry` 是保留 id |

- 插件写入仓库的其余路径（shared / server / client 源码、测试、镜像与 `.meta`）由 plugin.json **纯函数推导**
  （`apps/server/tools/plugin/ownership.ts`），不在推导集内的路径整包拒绝；
- 已安装状态在 `scripts/packages/<id>.lock`（writer 产物），本目录只有作者手写的真源；
- ballMove / idle 是框架自带玩法，⛔ 不是插件，本目录下没有它们（它们没有客户端登记面）。

命令、包格式、安装动线见 [docs/PLUGIN.md](../../docs/PLUGIN.md) §5。
