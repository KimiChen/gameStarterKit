# scripts/packages/ —— 已安装包（plugin / kit）的登记与文件清单锁

每个已安装包（插件或 kit，共享同一 id 空间，撞名即拒绝）一把 `<id>.lock`（writer：`npm --workspace @game/server run plugin -- install`
与 `install --reinstall-from-tree`（同仓作者迭代）；checker：`apps/server/test/plugin-lock.test.ts` 随 `verify:all`，以及 `plugin -- check`）。

- 抬头 `# manifest {...}` 承载 plugin.json / kit.json 的归一化值（id / version / kinds / constantName / domains /
  fguiPackages；kit 另有 class/modes/api，声明依赖时含 `requires`），`# source {...}` 记录锁来源（package / tree）与文件清单 sha256；
- 其余每行 `<仓库相对路径> <sha256>`，是该插件写入仓库的**全部**文件——升级时「旧有新无」按它删，
  卸载按它删，本地改动按它点名；
- ⛔ 不手改；⛔ 插件包本身不得携带本目录下的任何文件（`scripts/` 是硬排除前缀）。

设计基线见 [docs/PLUGIN.md](../../docs/PLUGIN.md) §5/§7，实现见 `apps/server/tools/plugin/`。
