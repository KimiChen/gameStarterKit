# apps/Cocos — Cocos Creator 3.8.8 工程壳

Cocos 客户端开发工程（引擎、资源与编辑器壳）。**游戏代码不在这里写**——
源码在 [../client](../client)（纯 TS 工程），由 `npm run sync:client` 灌入 `assets/src`。

## 目录

- `assets/src/` —— ⚠ 生成物，禁手改：`apps/client/src` 经 `sync:client` 同步而来
  （`.meta` 由 Cocos 编辑器生成/复用，随目录提交保证 uuid 稳定，新 checkout 可直接打开工程）
- `assets/resources/` —— FGUI 本地导出物等资源（见 [docs/CLIENT.md](../../docs/CLIENT.md)）
- `assets/scene.scene` —— 默认启动场景（登录 / AppRuntime）
- `assets/uniflex.scene` —— UniFlex 独立预览场景，入口是 `UniFlexPreview`，不经过 `Main`
- `settings/` —— 工程配置（提交入库）
  - `logo-diy.png` —— Dashboard 项目列表图标（512×512 透明 PNG）；`logo-diy.svg` 保留原始矢量图。
- `extensions/fairygui-cc/` —— fairygui-cc 扩展（外壳 + 运行库均入库；仅框架维护团队显式升级时运行
  `npm run fetch:fgui`，普通开发无需抓取）

## 打开方式

Cocos Dashboard 3.8.8 打开本目录，等首次导入（生成 `temp/`、`library/`，均已 gitignore）。
首次使用前先在仓库根目录跑 `npm install && npm run sync:shared && npm run build:uniflex-ui`
（`sync:shared` 已级联 `sync:client`；运行时产物——colyseus UMD、fairygui-cc 运行时和锁定的
 bitECS 源码——已入库，无需 fetch。依赖抓取脚本只用于框架维护团队显式升级。）

UniFlex 独立场景预览使用独立 Cocos CLI，并要求兼容的 Node.js 22 环境：

```bash
cocos preview --project "$PWD" --scene db://assets/uniflex.scene --no-open
```

项目根目录的 `npm run build:uniflex-ui` 会调用仓库内
`vendor/uniflex/bin/<platform>-<arch>/uniflex-compiler`，不依赖 SDK 仓库缓存。
可用 `node tools/uniflex-compiler.mjs version` 检查 compiler 制品是否已正确取到；
如果出现 `vfs: failed to get executable path`，先检查安全软件是否拦截、隔离或替换了
`vendor/uniflex/bin/<platform>-<arch>/uniflex-compiler`，按组织安全策略仅放行或恢复该文件，
再校验 SHA-256；不要整体关闭安全防护。

Node 无头 strict 探针（`npm run typecheck:client`）已经覆盖 `Main.ts`、全部 View、`pages.ts`、
ViewMgr 和客户端测试，使用 `apps/client/tsconfig.test.json` 的最小引擎桩；`npm run typecheck:client:legacy`
再以 ES2017 lib 检查 `apps/client/src/**/*.ts` 全部源码（含 Main、View、gameplay）。Creator 本地预览仍是真实入口装配、引擎类型、
资源导入和页面交互的必要验证；Cocos 工程自身的 `tsconfig.json` 只负责编辑器侧兼容编译。准确范围见
[客户端文档](../../docs/CLIENT.md#8-本地检查)，核心/额外能力边界见
[根 README](../../README.md#项目边界)。

## 3D 开工配置（SC0-B1）

`settings/v2/packages/engine.json` 以 Creator **3.8.8** 的
`modules.configs.defaultConfig` 显式登记引擎特性；`globalConfigKey` 指向该配置。
内置新管线的 `custom-pipeline`、`custom-pipeline-builtin-scripts`、
`custom-pipeline-post-process` 开启，`legacy-pipeline` 关闭；
`graphics.customPipeline=true`、`macroConfig.CUSTOM_PIPELINE_NAME="Builtin"`
选择引擎自带实现，不装载 Cyberpunk 自研管线。
Creator 3.8.8 保存配置时会把 `custom-pipeline-builtin-scripts` 从 `includeModules`
正规化移除，保留其 `cache._value=true`；该特性在 `cc.config.json` 中没有模块入口，
而是登记内置脚本依赖。已在真实编译预览中确认 `BuiltinPipelineBuilder` 与
`rendering.setCustomPipeline('Builtin', ...)` 可用；不要为了追求清单字面一致反复手改编辑器产物。

保留 WebGL1 / WebGL2、3D、动画 / 骨骼动画、3D 粒子、light-probe、primitive、profiler、
meshopt（3D 的引擎依赖），以及已有 2D UI、RichText、Mask、Graphics、UI skew、仿射变换、
音频、视频、WebView 和 tween 能力。关闭 terrain、tiled-map、dragon-bones、XR、全部物理后端、
particle-2d、WebGPU、原生 websocket 和未使用的调试渲染模块。
Spine 是工程级单选：`spine._option="spine-4.2"`，构建清单只有 `spine-4.2`；
原登录页经 FGUI `Dynamic_Spine` 使用 **3.8.99** 的 `loading_animals.skel`，不能直接切运行时。
SC0 已按用户确认改成原 `idle` 动画 **t=0** 的透明静态图：使用 Creator 自带 3.8 WASM 解析
原二进制，按真实网格 / UV 渲染，保留登录页原始骨骼锚点和底部 relation。
旧骨骼、图集与贴图完整归档到 `apps/art/fairygui/archive/Dynamic_Spine/`，
不再从 `resources` 导入；Login 也不再加载 `ui/Dynamic_Spine`。
重导出步骤及逐字节检查见该归档目录 README，未改 skeleton 版本头、未修改 vendor。
以后导入 Spine 素材须匹配 4.2，不同时开启 3.8。

`project.json.layer` 预留以下用户层（`value` 是位掩码）：

| 名称 | 位 | value | 用途 |
| --- | --- | --- | --- |
| `STAGE3D_HIDDEN` | 0 | 1 | 框架隐藏 / 拾取忽略 |
| `STAGE3D_OVERLAY` | 1 | 2 | 框架相机叠加专用 |

普通 3D 内容仍用内置 `DEFAULT`，UI 仍用 `UI_2D`。SC0 相机原型须挂场景根，
透视相机先绘制、UI 相机后绘制；不能把模型挂到 `CocosView` 的 UI 层根节点。
配置入库不等于已验证管线或相机：真实预览需读到 `cc.director.root.pipeline.constructor.name`、
`cc.director.root.usesCustomPipeline` 和 `cc.macro.CUSTOM_PIPELINE_NAME`，并在 WebGL2 / WebGL1
分别核对 UI 叠加，证据由 SC0-B3 保存。

配置依据为本机 Creator 安装目录 `Contents/Resources/` 下的：

- `app.asar/builtin/engine/package.json` 与 `@types/module.d.ts`：配置容器与 cache 的
  `_value` / `_option` / `_flags`，`includeModules` 是实际特性清单。
- `resources/3d/engine/editor/engine-features/render-config.json`、`cc.config.json`：模块 ID、
  依赖和 Spine 单选；`cocos/core/platform/macro.ts` 的内置管线名为 `Builtin`。
- `app.asar/builtin/project/package.json` 的 `layer` 登记；编辑器层配置存掩码，运行时
  `customLayers` 转成 `{ name, bit }`，不能把两种形状混用。
- `app.asar/modules/platform-extensions/extensions/wechatgame/package.json` 与 `@types/index.d.ts`：
  扩展版本 `1.0.4`；`appid` / `orientation` 等属于构建任务 `packages.wechatgame`。
  因此 `settings/.../wechatgame.json` 只登记扩展版本，不塞入不会生效的构建选项。

### 隔离工程与可选桌面构建

从目标 worktree 的仓库根运行以下命令（先完成安装与源码同步），在终端 PTY 内前台启动
独立 Creator 实例，并保持该终端会话存活。使用工具启动时启用 `tty: true`；
`--home` 指向的目录必须先存在，否则 Creator 会回退到默认 `~/.CocosCreator`。

```bash
mkdir -p .cache/stage3d/creator-home
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator \
  --project "$PWD/apps/Cocos" \
  --home "$PWD/.cache/stage3d/creator-home" \
  --user-data-dir="$PWD/.cache/stage3d/creator-user-data" \
  --remote-debugging-port=9233 --remote-debugging-address=127.0.0.1 \
  > .cache/stage3d/creator-restart.log 2>&1
```

检查 Creator 标题 / 工程路径与本 worktree 一致。原工程已占用 7456 时，读取新实例实际的预览地址，
本次隔离工程自动使用 7457；不要让探针仍连到原工程。9233 是仅绑定本机的编辑器开发 API
调试端口，不是预览端口；Chrome 调试端口优先复用本机 9222。首次导入的 `library/`、`temp/`
与构建产物保持 ignored。

桌面构建可先验证显式引擎清单：

```bash
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator \
  --project "$PWD/apps/Cocos" \
  --build "platform=web-desktop;debug=true;outputName=stage3d-sc0-web;startScene=33a6cd88-ca61-42f3-97e1-6b18a9096a34"
```

Creator 命令行构建成功码为 **36**，32 是参数失败、34 是构建失败；不能仅用常见的退出码 0 规则判断。
参数和退出码见 [Creator 3.8 官方命令行文档](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-in-command-line.html)。
2026-09-22 按用户要求，微信测试项目 / AppID 与可运行构建证据不再是 3D 实施前置或验收 / 退出条件。
SC0-B1 的引擎配置与真实预览已完成；SC0 的剩余工作是 B4 预算冻结与原型移交，见
[施工单 §8](../../docs/3D-PLAN.md#8-批次状态只在本文回写阶段级完成回写-3dmd-10)。
WebGL1 逐阶段证据与 SC4 真实微信 low 档 / 远程加载 / 缓存验收按各自阶段执行。
