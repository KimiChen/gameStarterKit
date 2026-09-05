# apps/plugins/ —— 插件目录（作者侧真源）

一个插件一个目录 `apps/plugins/<id>/`（PLUGIN.md §5.5 阶段 1 形态）：

| 文件 | 作用 |
| --- | --- |
| `plugin.json` | 身份声明（schemaVersion / id / version / kinds / constantName / domains / fguiPackages / requires），⛔ 不放路径映射、⛔ 不放位置（slot/order） |
| `feature.json` | kinds 含 feature 时的登记面（module / viewDirs / views / owners / routes / menu），与宿主 `features/<dir>/feature.json` 同等被 `codegen:features` 发现 |
| `README.md` | 插件自述文档（feature.json 的 `docs` 指向它） |
| `gameplay/{manifest.json,state.json}` | kinds 含 gameplay 时的玩法单源，与 `apps/shared/schema/gameplays/<id>/` 同等被 `codegen:gameplays` 发现 |

- 插件写入仓库的其余路径（shared / server / client 源码、测试、镜像与 `.meta`）仍由 plugin.json 与 feature.json
  **纯函数推导**（`apps/server/tools/plugin/ownership.ts`），不在推导集内的路径整包拒绝；
- 已安装状态在 `scripts/plugins/<id>.lock`（writer 产物），本目录只有作者手写的真源；
- 当前仓内 snake / ballMove / idle 是框架自带玩法，⛔ 不是插件，本目录下没有它们；
- 目录名 = 插件 id；`registry` 是保留 id。

命令、包格式、安装动线见 [docs/PLUGIN.md](../../docs/PLUGIN.md) §5。
