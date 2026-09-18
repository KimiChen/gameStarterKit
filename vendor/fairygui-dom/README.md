# fairygui-dom（锁定）

- npm：`fairygui-dom@1.0.0`
- 制品：`vendor/fairygui-dom-1.0.0.tgz`
- sha256：`d48b4dc9d107dffe9ab2abe8140e88aeec91ed1f04d258740df432d45eec4702`
- 用途：`ui:preview-fgui` 的官方 DOM 运行库。不是游戏客户端运行时，不进 `scripts/vendor.sha256`。

升级：替换 tarball 后改 `scripts/lib/uniflex-fgui/vendor.mjs` 里的哈希，再跑 `node scripts/fetch-fairygui-dom.mjs --check`。
