# 登录装饰动画的原素材与静态导出

2026-09-22 SC0：用户确认将这处登录动画改为静态展示，再切换工程级 Spine 4.2。
原 FGUI `Dynamic_Spine` 包及 `Login/1/` 的 `.skel` / `.atlas.txt` / PNG 保留原字节，
从活动 `assets/` 移到这里；不能把这些 3.8.99 素材直接交给 4.2 运行时。
本目录不再参与 FairyGUI 发布，也不导入 Cocos。素材授权沿用原素材，不引入外部美术。

`Dynamic_Spine.bin` 是静态迁移前的真实 FGUI 发布包，保留原字节，仅作作者留档和
`scripts/fgui-roundtrip.test.mjs` 的解析夹具；不属于活动发布产物，不能复制回运行时 `resources`。
测试将它和原伴生文件复制到临时目录，走真实 `readPackageBin` 验证 type 9 / Spine 解析、
原基名外部文件寻址与 `require=` 伴生文件的缺失 / 恢复，结束后清理临时目录。

`export-static.mjs` 用本机 Creator **3.8.8** 自带的 **Spine 3.8 WASM** 读取原 `.skel`，
播放 `idle` 并在 **t=0** 更新骨骼，取得运行时实际的 433 个顶点、395 个三角与 atlas UV。
它按原始绘制顺序做普通 alpha 混合及双倍分辨率三角光栅化，再缩回原设计像素；
不把 atlas 整图当姿态，也不通过修改版本头转换骨骼。当前脚本明确拒绝多纹理、非普通混合或顶点染色，
仅用于归档这份确定的旧素材，不作为通用 Spine 转换工具。

原控件在 Login 坐标 `(-66,106)`，原 package item 的骨骼锚点为 `(441,705)`，
因此骨骼原点仍应位于 Login 坐标 **(375,811)**。实际 idle t=0 超出原 item 的 872×1283 参考框，
静态图使用带 2 px 边缘的 **882×1305** 透明画布，原点 `(432,729)`，
FGUI `n101` image 位于 **(-57,82)**；骨骼整体没有缩放或平移，仍保留 `bottom-bottom` relation。

从仓库根重生成 / 比对（Node 22+，使用仓库现有 `sharp@0.35.4` 依赖）：

```bash
node apps/art/fairygui/archive/Dynamic_Spine/export-static.mjs
node apps/art/fairygui/archive/Dynamic_Spine/export-static.mjs --check
```

默认 Creator 路径为 `/Applications/Cocos/Creator/3.8.8/CocosCreator.app`；其他安装位置通过
`COCOS_CREATOR_APP` 指定。输出为活动 Login 包的 `RGBA/login_animals_static.png`，
`static-pose.json` 记录原文件、WASM 与静态图 SHA256、几何数量、画布和锚点。
`--check` 只重算比对，不落盘。

使用 **FairyGUI Editor 6.1.4** 的官方发布器刷新本地开发产物：

```bash
/Applications/FairyGUI-Editor.app/Contents/MacOS/FairyGUI-Editor \
  -batchmode -nographics \
  -p "$PWD/apps/art/fairygui/FairyGUI.fairy" -b View_AreaList_Login \
  -o "$PWD/apps/Cocos/assets/resources/ui" \
  -logFile "$PWD/.cache/stage3d/fgui-static-publish.log"
node scripts/fgui-manifest.mjs --write
npm run verify:fgui
npm run test:fgui
```

本机需 `-batchmode -nographics` 才执行 CLI 发布并退出；普通启动进入欢迎页。发布器日志与产物往返
检查共同确认成功，不能只依据进程退出。已先用未改 Login 源做重复发布，原 bin、图集与背景 jpg
全部逐字节一致后才发布静态版本。官方参数说明见 [FairyGUI 发布文档](https://www.fairygui.com/docs/editor/publish)。
