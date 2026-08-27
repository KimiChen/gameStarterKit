# 第三方软件声明（入库 vendored 产物）

本仓库把以下第三方运行时**直接提交入库**（版本钉死、clone 即可用）。首次打开和普通开发
不需要抓取这些运行时；Colyseus/FairyGUI 的 fetch 脚本仅由框架维护团队在显式升级时使用，
bitECS 则由维护团队按上游版本手工更新并提交完整锁定变更。npm 安装的常规依赖
（apps/server、apps/shared 的 node_modules）不在此列——其许可证随各包分发，见
`package-lock.json` 与各包自带 LICENSE。

| 组件 | 版本 | 许可证 | 入库位置 | 升级工具 |
|---|---|---|---|---|
| [bitECS](https://github.com/NateTheGreatt/bitECS)（NateTheGreatt） | 0.4.0（tag，commit `efacc63`） | **MPL-2.0**（文件级 copyleft：改动须保持 MPL 并公开——本仓库因此字节锁定不改逻辑，见 `lib/bitecs/README.md` 的两处兼容性偏差记录） | `apps/client/src/lib/bitecs/`（含 LICENSE 原文）+ Cocos 镜像 | 维护团队手工替换 12 个锁定文件并重算 `scripts/bitecs.sha256`；开发者运行 `npm run verify:ecs` |
| [@colyseus/sdk](https://github.com/colyseus/colyseus)（Endel Dreyer / Colyseus） | 0.17.43 | MIT | `apps/client/src/lib/colyseus/colyseus.js` + Cocos 镜像（UMD 构建原样，未修改） | 维护团队显式升级时运行 `npm run fetch:colyseus`（固定版本 + registry sha512） |
| [fairygui-cc](https://github.com/fairygui/FairyGUI-cocoscreator)（Guzhu / FairyGUI） | 1.2.2 | MIT | `apps/Cocos/extensions/fairygui-cc/runtime/`（fairygui.mjs + fairygui.d.ts，npm dist 原样；如打社区 3.8 补丁，diff 由 git 追踪） | 维护团队显式升级时运行 `npm run fetch:fgui`（固定版本 + registry sha512） |

这里的“维护团队手动更新”表示人工决定并审核升级，不表示放弃自动化校验。保留两个 fetch 脚本是为了让维护升级可重复且可审计：脚本下载指定版本、校验 registry
sha512，并更新各自负责的入库产物。`fetch:colyseus` 还会维护 Cocos 侧 `.meta`；
`fetch:fgui` 只覆盖 FairyGUI runtime，不会代改扩展壳 `package.json`、`browser.js` 或 `.meta`。
两个脚本都会重钉 `scripts/vendor.sha256`。它们不是首次打开或日常开发步骤。

维护团队升级后必须人工同步 FGUI 扩展壳版本，以及 Colyseus 服务端依赖和根
`package-lock.json`，并复核服务端/客户端 Colyseus major.minor、类型声明和社区补丁；再由本地
`npm run test:fgui` 等校验确认版本、产物内容、`package-lock` 与镜像一致。FairyGUI 若有社区
3.8 补丁，重新抓取会覆盖补丁；补丁必须重新应用，并手动运行 `node scripts/vendor-lock.mjs`
重钉后与相关文件一起提交。
