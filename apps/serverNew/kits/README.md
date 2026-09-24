# serverNew kit

每个子目录是一个可分发的 `serverNew` kit 源包：`kit.json` 列出包所拥有的文件，`files/` 下按仓库相对路径存放这些文件。
使用 `pnpm -C apps/serverNew/server kit -- pack <source> --out-dir <artifact>`、`install <artifact>`、`check <id>`、`uninstall <id>`；
kit 只能拥有自己的 C2S schema 与 `src/modules/<id>/`，每个 schema API 必须有对应 Action。完整约束见 [docs/KIT.md](../../../docs/KIT.md)。

- `kitSample`：框架工具链的最小样例（单路由 `kitSample.ping`），由 `pnpm verify:kit-clean-host` 在干净宿主中打包、安装、启动与卸载。

仓内玩法（如 gameDemo）直接在宿主模块与 `apps/plugins/<id>/` 开发，不在这里保留第二份源码。
