# 第三方软件声明（入库 vendored 产物）

本仓库把以下第三方运行时**直接提交入库**（版本钉死、clone 即可用；升级用对应 fetch 脚本 +
提交 diff）。npm 安装的常规依赖（apps/server、apps/shared 的 node_modules）不在此列——
其许可证随各包分发，见 `package-lock.json` 与各包自带 LICENSE。

| 组件 | 版本 | 许可证 | 入库位置 | 升级工具 |
|---|---|---|---|---|
| [bitECS](https://github.com/NateTheGreatt/bitECS)（NateTheGreatt） | 0.4.0（tag，commit `efacc63`） | **MPL-2.0**（文件级 copyleft：改动须保持 MPL 并公开——本仓库因此字节锁定不改逻辑，见 `lib/bitecs/README.md` 的两处兼容性偏差记录） | `apps/client/src/lib/bitecs/`（含 LICENSE 原文）+ Cocos 镜像 | 无（字节锁，`verify:ecs`） |
| [@colyseus/sdk](https://github.com/colyseus/colyseus)（Endel Dreyer / Colyseus） | 0.17.43 | MIT | `apps/client/src/lib/colyseus/colyseus.js` + Cocos 镜像（UMD 构建原样，未修改） | `npm run fetch:colyseus`（钉 registry sha512） |
| [fairygui-cc](https://github.com/fairygui/FairyGUI-cocoscreator)（Guzhu / FairyGUI） | 1.2.2 | MIT | `apps/Cocos/extensions/fairygui-cc/runtime/`（fairygui.mjs + fairygui.d.ts，npm dist 原样；如打社区 3.8 补丁，diff 由 git 追踪） | `npm run fetch:fgui`（钉 registry sha512） |

版本一致性由 `apps/client/test/vendorLock.test.ts` 机检（fetch 脚本钉的版本 ⇔ 入库产物内容 ⇔
package-lock ⇔ 双端 Colyseus major.minor 一致（铁律 7）⇔ CLAUDE.md 技术栈声明），随
`npm run test:fgui` / CI 跑。产物**内容**另有 `scripts/vendor.sha256` 锁（fairygui 运行时不内嵌
版本串且在 verify:sync 镜像域外，内容锁是其唯一守门）：fetch 脚本升级后自动重钉；给 fairygui
打补丁后手动 `node scripts/vendor-lock.mjs` 重钉并连锁文件一起提交。
