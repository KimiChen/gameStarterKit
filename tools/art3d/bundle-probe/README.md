# SC1-B7：Creator 3.8.8 干净 bundle 安装探针

只安装在显式指定的隔离工程。扩展入口检查 `local-config.json` 的工程绝对路径，
只接受状态、导入、bundle 配置、固定灰盒资产创建及依赖检查，不接受任意代码。
`local-config.json` 与真实制品、截图、Library 都留在 ignored 输出目录。

准备独立工作目录（以下 `$BUNDLE_PROBE_OUT` 是用户选择的空目录，建议在外置盘 `.cache/`）：

```bash
node --import tsx tools/art3d/bundle-fixture.ts prepare "$BUNDLE_PROBE_OUT"
```

通过 Dashboard 打开输出的 `author/apps/Cocos`，等待 `author-probe/ready.json` 与资源导入完成，然后：

```bash
node --import tsx tools/art3d/bundle-fixture.ts job "$BUNDLE_PROBE_OUT" author create-001 configure-bundles create-chain create-graph inspect-chain bundle-settings
```

每个 job ID 唯一；查看 `result-<id>.json` 或 `error-<id>.json`，失败记录不改写。
`create-chain` 用本仓自制灰盒的实际 Mesh 与外置 PNG，经 Creator 序列化器生成独立 Prefab / Material / AnimationClip，
不直接序列化一个尚未解除嵌套关系的导入 Prefab 实例。`create-graph` 生成 AnimationGraph → Clip / Mask 的独立依赖。
所有 `.meta`（含模型、纹理子资产与 bundle 根）由 Creator 生成，根配置经 AssetDB 保存。
相邻 kit `bundleFixtureExtra` 提供卸载干扰样本；内容包 `bundleFixture` 的两个 bundle 交叉引用。

```bash
node --import tsx tools/art3d/bundle-fixture.ts install "$BUNDLE_PROBE_OUT"
```

这一步调用正式 pack / install，生成 ZIP 后安装进全新的 `clean/`：没有作者源码树、node_modules、
Library 或 temp；仅有最小 Creator 宿主设置、验收场景、探针和从 ZIP 安装的文件。
`git/postinstall` 关闭，仅验证本批的制品文件链，不声称执行完整游戏宿主 codegen 或登录。
`clean-install.json` 保存原始包清单和缓存缺席记录。

关闭作者工程并把 `author/` 移到其它位置，使其原路径不可访问；再从 Dashboard 打开 `clean/apps/Cocos`。
不复制任何导入缓存。首次导入后运行：

```bash
node --import tsx tools/art3d/bundle-fixture.ts job "$BUNDLE_PROBE_OUT" clean load-001 status inspect-chain bundle-settings
node --import tsx tools/art3d/bundle-fixture.ts check "$BUNDLE_PROBE_OUT"
node tools/creator-preview/probe-bundle-install.mjs "$BUNDLE_PROBE_OUT" clean-preview
```

浏览器探针连接已有 Chrome `127.0.0.1:9222`，按 ready 中的 PID 解析隔离预览端口，只开新的预览标签。
它按真实 scene UUID 等待，使用 `assetManager.loadBundle` + `bundle.load` 的 bundle / path 地址加载 Prefab 和动画图，
核对 Mesh、材质、真实 64² 图片、内置 effect、动画图 / 遮罩 / 1 s 动画，保存 console、JSON 与截图。
无头与引擎结果分别保留；截图仍需人工查看。

```bash
node --import tsx tools/art3d/bundle-fixture.ts uninstall-neighbour "$BUNDLE_PROBE_OUT"
node --import tsx tools/art3d/bundle-fixture.ts job "$BUNDLE_PROBE_OUT" clean after-uninstall-001 inspect-chain
node tools/creator-preview/probe-bundle-install.mjs "$BUNDLE_PROBE_OUT" after-uninstall
```

卸载后再次从新浏览器上下文加载，避免仅以编辑器内存中已加载对象证明依赖仍在。
`check.json` / `uninstall-neighbour.json` / 原始引擎报告与图片的哈希汇入批次验收摘要。
当前内置 allowlist 仅含标准 / unlit effect，版本、源文件与 meta 哈希在
`apps/server/tools/plugin/creator-builtins-3.8.8.json`；本批验收时对照实际安装引擎核验。

本探针不代替 SC1-B5 的完整资产格式、GLB、压缩、预算、授权检查。
构建政策对应 Creator 官方 [Asset Bundle 文档](https://docs.cocos.com/creator/3.8/manual/en/asset/bundle.html)，
具体 `package3d` profile 与 `.meta.bundleConfigID` 由当前安装版 3.8.8 的 Profile / AssetDB API 验证。
