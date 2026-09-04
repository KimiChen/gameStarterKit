# plugins/ —— 插件的作者侧自述

`plugins/<id>/plugin.json` 是一个插件在本仓的**身份声明**（schemaVersion / id / version / kinds /
constantName / domains / fguiPackages / requires），⛔ 不放路径映射、⛔ 不放位置（slot/order）。
它是 `plugin -- pack` 的输入，也随包分发并由 `plugin -- install` 原样落回这里。

- 插件写入仓库的路径集合由 plugin.json 与 `features/<id>/feature.json` **纯函数推导**
  （`apps/server/tools/plugin/ownership.ts`），不在推导集内的路径整包拒绝；
- 已安装状态在 `scripts/plugins/<id>.lock`（writer 产物），本目录只有作者手写的自述；
- 当前仓内 snake / ballMove / idle 是框架自带玩法，⛔ 不是插件，本目录下没有它们。

命令、包格式、安装动线见 [docs/PLUGIN.md](../docs/PLUGIN.md) §5。
