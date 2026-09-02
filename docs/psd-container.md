# PSD 可 diff 容器（`.psdt.io`）方案稿

> 版本：0.1（方案稿）<br>
> 日期：2026-09-02<br>
> 状态：设计已定稿，`ui:psd:unpack` / `ui:psd:build` / `verify:psd`、合成引擎、夹具与登记均未实现<br>
> 决策：git 只保存 PSD 的容器层同构展开目录 `<name>.psdt.io/`；`.psd` 不进入 git，由 `ui:psd:build` 按需重建；
> 编解码只用 `ag-psd@31.0.2` + `pngjs@7.0.0`；锁定 renderer 是仓库自研的 Node 合成引擎；styled 层在 G4c 栅格化为
> 导出叶，原层留在不可导出子组；历史样例字节冻结、只作负样本。
>
> 本文服从 [PSD 到 FairyGUI 的“CLI 编译器 PSD 版”实施方案](psd.md)、
> [FairyGUI UI 生产、装配与自动化工作流](FairyGUI.md) 与 [分层 PSD 生成流程](psd-maker.md)。它只回答“PSD 在 git
> 里以什么形式存、如何无损往返”，不改变三层契约、`psdInputMaturity`、G4a～G4c 与 Editor 权威的任何规定。

## 1. 结论与决策

PSD 是二进制，git 无法 diff、无法 merge、无法 blame，14.8 MB 的整页文件每次保存都是一个不透明的整体。本文把 PSD 拆成
“结构文本 + 每层一张位图”的目录，让层名、坐标、可见性、文字内容和层序进入行级 diff，让像素进入平台自带的图像 diff，
同时保证目录与 PSD 之间可以确定性地互相重建。

```text
<name>.psdt.io/                      ← git 真源（可编辑、可 diff、可 merge）
  ├── pack-manifest.json
  ├── document.json                  ← ag-psd Psd 对象的全量 canonical JSON（不含像素）
  ├── composite.png                  ← 文档级合成图
  ├── layers/<组目录>/<slug>.png     ← 每个像素层一张 RGBA PNG；蒙版 <slug>.mask.png
  └── blobs/*.bin                    ← 其它二进制字段（嵌入智能对象数据等）
        │ ui:psd:build（确定性）
        ▼
<name>.psd                           ← 不进 git；Photoshop / 审阅 / IR 的输入
        │ ui:psd:unpack（本仓产物字节等价；Photoshop 保存件归一化导入）
        ▼
<name>.psdt.io/
```

本轮已拍板的决策：

| 决策 | 结论 |
| --- | --- |
| 目录后缀 | `<name>.psdt.io/`，与原本放 `.psd` 的位置同目录同名（例如 `40-production/psd/<Page>.artist-editable.psdt.io/`） |
| `.psd` 是否入库 | 不入库；`docs/**/*.psd` 进 `.gitignore`，任何人用 `ui:psd:build` 重建，批准哈希继续钉 `.psd` 的 SHA-256 |
| 编解码器 | `ag-psd@31.0.2` + `pngjs@7.0.0`，精确钉进根 `devDependencies`；不 fork、不打开 `MOCK_HANDLERS`、不引入 psd-tools |
| 锁定 renderer | 仓库自研 Node 合成引擎（整数 src-over），服务栈序对账、`source-reference-excluded composite`、solo sheet 与哨兵 diff；Pillow 只保留在 maker 的像素处理链 |
| styled 层 | 允许在 `GROUP::<stableKey>` 内使用 MASK/SHADOW/FX/ADJUST 与非 normal 混合做创作；每个可导出 stable key 必须在 G4c 由 Photoshop 栅格化出一个 plain 导出叶，原层移入不可导出的 `SRC::<stableKey>` 子组；CI 只渲染 plain 叶，从不渲染效果 |
| 历史样例 | `docs/psd-maker/ug_main_layered_source_v02.psd` 字节冻结（方案 A）：展开后入库、SHA 不变，`knownIssues` 登记栈序反转，只作合成序负样本；栈序修正落在 maker 与新批次 |
| PNG 编码 | `deflateLevel 0`、`filterType 0`、colorType 6；工作区约 30 MB/整页，git 历史每次局部编辑只增 KiB 级 |
| 命令 | `ui:psd:unpack` / `ui:psd:build` / 根脚本 `verify:psd`（进 `verify:core`）；不占用 psd.md §9.2 已定义为 maker 的 `ui:psd:pack` 与页面级语义门 `ui:psd:verify` |
| 像素主从 | G4c 之后容器 `layers/` 是唯一可编辑像素；`source/<stableKey>/` 是 G4b 来源证据（带 `sourceSha256`），verify 校验二者一致或登记确定性变换 |
| Photoshop 往返 | 保存件放 ignored 的 `staging/photoshop/`，`ui:psd:unpack --from-foreign` 归一化导入；`photoshop-roundtripped` 挂在 evidence，不挂在文件字节上 |

## 2. 目标与非目标

### 2.1 目标

- PSD 的结构、层名、坐标、可见性、层序、Type 描述进入行级 diff，可 merge、可 blame。
- 像素按层进入 PNG，GitHub/GitLab 的 2-up / swipe / onion-skin 可直接审阅；相同像素的层由 git 按 blob 自动去重。
- 目录 → PSD 确定性重建；本仓产物 PSD → 目录 → PSD 字节等价；Photoshop 保存件导入时逐项报告丢弃与归一化，绝不静默。
- 补上现有 `psd[0]` AE=0 对账看不见的盲区：按 PSD 真实栈序自底向上重算合成图，与存储的合成图对账。
- 让 docs/psd.md §6.5 的命名校验、G4c 的 solo sheet、`source-reference-excluded composite`、ownership 报告和哨兵 diff
  都消费同一个目录与同一个合成引擎，不再各造一套解析器或合成器。

### 2.2 非目标

- 不把容器变成第二套语义真源：`document.json` 只允许 ag-psd `Psd` / `Layer` 类型键，stable key 语义、inset、pivot、
  九宫格、Controller、Relation、批准状态一律不进容器。
- 不承诺 Photoshop 保存件的字节级复原。ag-psd 是语义级编解码器：未登记的 image resource 与 tagged block 静默丢弃、
  文字 EngineData 由 `text` 对象重生成、ICC 丢弃、块序按 handler 登记序重排。
- 不用 CI 渲染图层效果、调整层、蒙版和非 normal 混合；不引入 psd-tools、ImageMagick 之外的第四个渲染器。
- 不改变 `psdInputMaturity`、G4a～G4c、`PsdHandoffBundle`、Editor 权威与 `.meta` 规则。
- 不迁移 `docs/ui/undergroundIdle/ue-v01/`：其 11 份 PSD 尚未入库，入库时按 §11 走 `unpack`，不直接 `git add` `.psd`。

## 3. 设计依据：已实证的事实

以下事实在本机（Node 25.9、ag-psd@31.0.2、pngjs@7.0.0、ImageMagick 7.1.2）实测，设计建立在这些事实之上：

| 事实 | 数值 |
| --- | --- |
| 样例 PSD | 14,866,179 B，SHA-256 `6fb8c2009ce9ac9355f4937212901a2011577f3c422dfb9ffb799416dc1b1f5f`，44 节点（11 组、20 像素层、13 文字层） |
| ag-psd 读→写 | 字节与原文件相同；两次写一致；二次往返一致 |
| 展开再重组 | 34 张 PNG（33 层 + composite）+ document.json 57 KB，重组后 SHA 与原文件相同；展开两次 35 个文件全部一致 |
| 必须保留的字段 | `opened`（否则折叠组变展开）、`text.left/top/right/bottom`（否则写 NaN）、完整 `text.style` / `paragraphStyle`（否则 autoLeading 0→1.2） |
| 可归一的字段 | 颜色分量整数与 `173.99925` 类浮点写出字节相同 |
| 写入参数 | `trimImageData:true` 改 24 层 bbox，必须 false；`compress:true` 是纯编码改字节；省略 composite 写出全黑（11,478,034 B） |
| git 增量（每次局部像素编辑） | ag-psd 写出的 PSD +7～13 KiB；层 PNG level 0 +1～31 KiB；层 PNG level 9 +2～3 MiB |
| ag-psd 丢失点 | 未知 resource / tagged block 静默丢弃；`MOCK_HANDLERS=false` 编译掉 ICC 1039 等 13 个 raw 直通 handler；TySh EngineData 重生成且 `toFixed(5)`；非 8-bit 不可写；CMYK / Lab 不可读 |
| composite 白底舍入 | 文档 composite 含 alpha<254 像素时每轮写读单调漂移（α=128 每轮 −2，α=64 每轮 −4），不收敛；层像素不受影响 |
| 图层栈序 | ag-psd `children[0]` 是 PSD 栈底（两层测试 `[RED, BLUE]` 拍平后 BLUE 在上）；样例把自上而下列表原样写进 children，按真实栈序合成 23 个可见叶层只得到单色 `#182129`，反转后与存储 composite 逐像素相同 |
| 跨渲染器一致性 | 含 mask / effects / multiply / clipping 的组，ImageMagick、psd-tools、整数 src-over 两两差 1270～1282 / 4096 像素，ImageMagick 忽略调整层；plain 叶层三者单通道最大差 1 |
| Node 下读取 | `readPsd` 需要 `initializeCanvas` 的纯 JS `createImageData` 桩；`generateThumbnail` 需 canvas 包，永远 false |
| 其它 | `placedLayer.id` 必须是 GUID；adjustment 字段中非 ag-psd 类型键会被静默丢弃并写零值 |

## 4. 容器形式

### 4.1 目录布局

```text
docs/ui/<feature>/<page>/40-production/psd/
├── <Page>.artist-editable.psdt.io/          # git 真源
│   ├── pack-manifest.json                   # 信封：schema、codec 锁、写入参数、期望 .psd sha、来源、丢弃/归一清单、knownIssues
│   ├── document.json                        # ag-psd Psd 对象去掉像素后的全量 canonical JSON
│   ├── composite.png                        # 文档级合成图（预览语义：全部可见层，含文字预览）
│   ├── layers/                              # 目录树 = 组树；文件 = 叶层像素；文件名不带序号
│   │   ├── GROUP_ui.storage.panel/
│   │   │   ├── IMG_ui.storage.panel.png     # plain 导出叶
│   │   │   ├── SRC_ui.storage.panel/        # 不可导出子组：styled 原层
│   │   │   │   ├── SOURCE_base.png
│   │   │   │   ├── SOURCE_base.mask.png     # MASK::cutout = SOURCE 的图层蒙版
│   │   │   │   └── FX_glow.png
│   │   └── …
│   └── blobs/                               # linkedFiles[].data、thumbnailRaw 等 typed array
└── <Page>.artist-editable.psd               # ignored；ui:psd:build 产物
```

历史样例平铺在 `docs/psd-maker/ug_main_layered_source_v02.psdt.io/`，位置遵守 psd.md §5“历史样例不要求迁移目录”。

容器落点是 path-agnostic 的：它只要求与原本放 `.psd` 的位置同目录同名；`verify:psd` 按 `docs/**/*.psdt.io` 扫描，
不绑定某一棵 40-production 树。

### 4.2 canonical 序列化规则

1. **JSON**：递归按键的 UTF-16 码元升序（数组保序），`JSON.stringify(obj, null, 2) + "\n"`，UTF-8 无 BOM、LF，
   非 ASCII 原样不转义；数字用 ES Number 最短往返；`NaN` / `Infinity` 直接报错；`undefined` 键省略。
2. **全量而非省默认值**：`document.json` 是 `readPsd(P, { useImageData: true, skipThumbnail: true })` 返回对象“读出来
   什么存什么”的形态，不做 DEFAULTS 投影，避免依赖 ag-psd 默认值不变。三处结构改写：层 `imageData` →
   `{"$png": "layers/…"}`，`mask.imageData` / `realMask.imageData` → `{"$png": "….mask.png" | "….realmask.png"}`，
   其它 typed array → `{"$bin": "blobs/…"}`；顶层 `imageData` → `{"$png": "composite.png"}`；`canvas` 永不出现。
3. **唯一数值归一**：Type 描述内 `fillColor` / `strokeColor` 分量若 `|v − round(v)| ≤ 0.002` 写整数（EngineData
   `toFixed(5)` 伪影，已证与浮点写出字节相同）。其它浮点原样。
4. **层序**：`children` 顺序 = ag-psd 顺序 = PSD 图层记录顺序，**index 0 = 栈底**。这条语义写进合成引擎与单测，
   也是未来 `ui:psd:pack`（maker）的 adapter 契约。
5. **slug**（只做文件定位，层名真源永远是 `name`）：NFC → 非 `[A-Za-z0-9_.-]` 连续串替换为 `_` → 去首尾 `_` / `.` →
   截 48 字符 → 空则 `layer`；Windows 保留名前缀 `_`；同级冲突按不区分大小写判定，冲突各方追加 `-` +
   `sha1(name)` 前 6 位（与顺序无关）。`ROLE::stableKey` 在同级内必须唯一（psd.md §6.4 已要求 partKey 组内唯一），
   verify 落为不变量。slug 字符集本身杜绝 `../`、绝对路径与控制字符。
6. **PNG**：`pngjs@7.0.0` `PNG.sync.write`，colorType 6（蒙版 colorType 0），`deflateLevel 0`，`filterType 0`，无辅助
   chunk。同像素同字节（pngjs 已证确定性），git 按 blob 自动去重；校验一律比像素不比 PNG 字节。
7. **写入参数**固定 `{ noBackground: true, trimImageData: false, invalidateTextLayers: false, generateThumbnail: false,
   compress: false, psb: false }`，写在 `pack-manifest.writeOptions`，`build` 拒绝偏离。

### 4.3 `pack-manifest.json`

```json
{
  "schemaVersion": 1,
  "origin": "generated",
  "codec": { "ag-psd": "31.0.2", "pngjs": "7.0.0" },
  "png": { "colorType": 6, "deflateLevel": 0, "filterType": 0 },
  "writeOptions": { "noBackground": true, "trimImageData": false, "invalidateTextLayers": false,
                    "generateThumbnail": false, "compress": false, "psb": false },
  "psd": { "fileName": "UndergroundIdleMain.artist-editable.psd", "sha256": "…" },
  "contentHash": "…",
  "compositeAlphaOpaque": true,
  "stackClass": "plain",
  "renderLeaves": { "ui.storage.panel": { "leaf": "layers/GROUP_ui.storage.panel/IMG_ui.storage.panel.png",
                                          "srcPartsSha256": "…" } },
  "provenance": { "importedFrom": null },
  "untestedFeatures": [],
  "knownIssues": []
}
```

- `origin`：`generated`（由本仓 maker 或 build 产生）或 `frozenEvidence`（历史证据，见 §11）。
- `psd.sha256`：`build` 输出的期望 SHA-256；`.psd` 不入库，它就是批准记录、`PsdHandoffIR` 与 SHA256SUMS 引用的哈希。
- `contentHash` = `sha256(document.json ‖ 各层 raw RGBA sha ‖ composite raw sha ‖ blobs sha)`，与 PNG 编码器无关，
  只作工具漂移探针，不作批准主键。
- `compositeAlphaOpaque`：composite 是否全 alpha=255，决定 §5 对 composite 的不动点规则。
- `stackClass`：`plain` / `styled`，由 `document.json` 判定（§7.1）。
- `renderLeaves`：每个可导出 stable key 的 plain 导出叶及其 `SRC::` 原层内容哈希（§7.2），用于检测“原层改了、导出叶没重栅格化”。
- `provenance.importedFrom`：外来导入时记录 `{ sha256, photoshopVersion, byteExact: false, droppedResources,
  droppedTaggedBlocks, strippedVolatile, normalizedKeys }`。
- 不含时间戳、不含 `psdInputMaturity`、不含任何 sidecar 语义。

### 4.4 角色语义零知识

容器不认识 `ROLE::stableKey`、`REF::`、`BG::`、fullCanvas 白名单或 decomposition-spec；这些由 psd.md §6 和
`ui:psd:verify`（页面级语义门）负责。容器提供的是它们需要的两样东西：`document.json` 的层名树（`psdLayerPath`
与之同源）和逐层像素。ownership 报告由 `decomposition-spec.json × asset-manifest.psdLayerPath × document.json`
派生，fullCanvas 白名单由 bbox 等于画布加 alpha 覆盖率机检，都不需要往 `document.json` 加键。

`document.json` 的键集以 ag-psd `Psd` / `Layer` 类型键做白名单，出现 `stableKey`、`inset`、`pivot`、`approval`
之类字段即报错。`psdInputMaturity` 只落在 `evidence/psd.approval.json` 或 `delivery-spec.json`，`verify:psd`
读取它来选择检查档位（`referenceCompositeOnly` 允许可见整画布 base 并跳过 ownership 类检查）。

## 5. 无损定义与不动点

三级定义，各自的成立范围与机检方法：

| 等级 | 定义 | 成立范围 | 机检 |
| --- | --- | --- | --- |
| L0 字节等价 | `sha256(build(unpack(P))) == sha256(P)` | P 由本仓锁定的 ag-psd 以固定写入参数写出 | 样例已实证；CI 对 `origin=generated` 目录执行 |
| L1 解析等价 | `strip(readPsd(P1)) deepEqual strip(readPsd(P2))`，strip 去像素 | 任意 P，含 Photoshop 保存件，模 unpack-report 列出的丢弃项 | 结构 JSON diff = 0 |
| L2 像素等价 | 每个节点 imageData（含 mask）字节相等 | 任意 P | 逐层 RGBA 比对 |

不动点的方向：

- **目录侧是流水线钉住的不动点**：committed 的 X 必须满足 `unpack(build(X)) == X`，比较对象是 `document.json`、
  `layers/**`、`blobs/**`。`composite.png` 在 `compositeAlphaOpaque=true` 时同样要求相等；alpha 有小于 255 的像素时，
  PSD 内 composite 是 ag-psd 白底变换后的有损派生，不参与相等比较，`composite.png` 以容器为真源。
- **PSD 侧是推论**：`build` 确定性（同一 X 两次输出字节相同）加上 L0，使 `.psd` 无需入库也能被任何人重建到同一 SHA。
- **非 canonical 输入一轮收敛**：手写或手改的 X 经 `build` 再 `unpack` 一轮即为规范形（已证手写 text 对象第二次写即不动点）；
  `ui:psd:build --normalize` 就地重写 X，verify 跑两轮，第二轮零 diff 才通过，否则报 non-canonical 并附归一化 diff。
- **Photoshop 保存件**只承诺 L1 + L2：未知块丢、EngineData 重生成、块序重排、ICC 丢，`build(unpack(P))` 是归一化 PSD，
  不是 P。

## 6. 未知数据与外来导入

`unpack` 先跑 section 级扫描器（不解码像素，约 90 行）列出全部 image resource id 与每层 tagged key，对照 ag-psd dist
导出的 `resourceHandlersMap`（35 个）与 `infoHandlersMap`（65 个含别名），再按四档处理，绝不静默：

| 档 | 内容 | 默认行为 |
| --- | --- | --- |
| T0 语义保留 | ag-psd 有 handler 的一切：组、像素、mask / realMask、TySh 文字、lfx2 效果、调整层、嵌入智能对象（SoLd + lnk2 数据）、矢量蒙版、layer comps、clipping、混合、lyid、lclr、XMP | 原样进 `document.json` / PNG / blobs |
| T1 易变元数据 | 缩略图 1036、XMP 1060、versionInfo 1057、idsSeedNumber 1044、pixelAspectRatio 1064、layerSelectionIds 1069 | 保留；`--strip-volatile` 显式剥离并把每项 `{id, bytes, sha256}` 写进 unpack-report |
| T1' ICC 1039 | ag-psd 必丢 | 其 sha256 命中 sRGB IEC61966-2.1 白名单才允许丢弃（对应 psd.md §6.1 锁定 sRGB），否则退出码 3 |
| T2 未登记 | 任何不在 handler 表中的 resource id / tagged key（含注入的 `9999`、`zzzz`）| 退出码 3；只有 `--allow-drop <id,key>` 才继续，被丢弃字节原样落 `evidence/dropped/<owner>-<key>.bin` 并把 sha 写进 unpack-report |
| T3 不可读写 | 16/32-bit、CMYK / Lab / Duotone、非 8BPS | 退出码 4，提示按 psd.md §6.1 转 RGB 8-bit，不做自动转换 |

别名键（`lsdk→lsct`、`lnkD/lnk3→lnk2`、`Pat2/Pat3→Patt`、`vsms→vmsk`、`SoLE→SoLd`、`FXid→FEid`）由 ag-psd 改名写回，
记入 unpack-report 的 `renamedKeys`，视为 T0。

外来导入（`--from-foreign`）额外做：`build(unpack(P))` 与 P 用扫描器逐段定位首差并记 `firstDiffSection`；
`provenance.importedFrom` 写 Photoshop 保存件 sha256 与版本；输出 `evidence/unpack-report.json`。Photoshop 保存件本体
只存在于 ignored 的 `staging/photoshop/`，永不入库。

## 7. 合成引擎（锁定 renderer）

### 7.1 定义与 plain / styled 判定

引擎是仓库自研的纯 Node 模块 `compositeTree(doc, layersDir, predicate)`：8-bit 直通 alpha 的整数 src-over，公式与 Pillow
`ImagingAlphaComposite` 一致，按 `children` 栈序自底向上，组隐藏向下继承，组视为 pass-through，谓词决定哪些叶层参与。
它只支持 normal 混合、opacity 1、无 mask、无 effects、无 adjustment、无 clipping 的**plain 叶层**；同一引擎对同一输入
逐字节确定，单测用 golden 向量钉死。

`stackClass` 由 `document.json` 判定：参与合成的可见叶层全部 plain 则为 `plain`，否则为 `styled`。判定不看层名，
只看 ag-psd 字段（`blendMode`、`opacity`、`mask`、`effects`、`adjustment`、`clipping`、`vectorMask`）。

跨渲染器对账（可选 `--magick`）只做诊断，允许 ±1 单通道容差；引擎内部对账要求 0 差。

### 7.2 styled 层：G4c 栅格化导出叶

这是本轮择优的结论，选它的理由：没有任何可在 CI 锁定的渲染器能对效果、调整层、蒙版与非 normal 混合给出与 Photoshop
一致或彼此一致的结果（§3），而 psd.md §6.1 已经规定“不支持或跨渲染器不一致的图层效果必须经批准后栅格化，原始效果层
保留在不可导出的 source 组”，只是没说何时、由谁栅格化。本文把它落成机检规则：

1. `GROUP::<stableKey>` 内允许 `SOURCE::` / `MASK::` / `SHADOW::` / `FX::` / `ADJUST::` 与任意混合模式做创作，
   容器按 L1/L2 无损携带它们，CI 永不渲染。
2. 每个可导出 stable key 必须恰好有一个 **plain 导出叶**：要么整个组本身是 plain，要么组内有 `IMG::<stableKey>` 或
   `NINE::<stableKey>` 作为导出叶，由美术在 Photoshop 中对 styled 部件“合并可见 / 栅格化副本”得到。
3. styled 原层整体移入 `SRC::<stableKey>` 子组：默认隐藏、`exportPolicy: exclude`、不参与任何 composite。这是
   psd.md §6.2 需要新增的一个保留角色。
4. `pack-manifest.renderLeaves` 记录导出叶与 `SRC::` 原层的内容哈希；原层改动后导出叶未重栅格化，verify 报
   `staleRender` 警告；导出叶缺失或本身 styled，verify 报 `needsRasterization` 阻断。
5. Photoshop 隐藏 REF / TEXT / HIT 后导出的整页图只作人工 A/B 证据（hash 冻结在 evidence），不是 CI 真源。

部件编码定义（psd.md §6.4 尚未指明，本文先定）：`MASK::<partKey>` 是 `SOURCE::` 或 `GROUP::` 的图层蒙版（ag-psd
`mask` 字段，容器存 `<slug>.mask.png`），不是独立层；需要剪贴时用 `clipping=true` 的 `FX::` / `SHADOW::` 栅格层；
`ADJUST::` 只允许出现在 `SRC::` 内；psd.md §6.4 白名单里的 `FX::<stableKey>` 全画布前景遮挡必须是 plain 栅格叶，与
组内 `FX::<partKey>` 是两种键，命名校验器要区分。

### 7.3 两种合成图

| 图 | 谓词 | 产出者 | 用途 |
| --- | --- | --- | --- |
| `composite.png`（文档级） | 全部可见叶层，含文字预览 | plain 栈：引擎；styled 栈：Photoshop 保存件导入 | PSD 预览兼容数据、PR 整页图像 diff |
| `source-reference-excluded composite` | 可见 ∧ `exportPolicy != exclude` ∧ 非 `REF/TEXT/HIT/IGNORE/SRC/审阅组` | 引擎（导出叶按 §7.2 恒为 plain） | G4c 证据、与 target 做分区 / 感知差异 |

文档级 composite 与源重组图不是同一张（前者含文字预览，后者排除），psd-maker.md §15 “从可导出独立叶层生成
source-reference-excluded composite 再写入文档级 imageData”需要改为两张图各自生成；文字层是否参与源重组图，
FairyGUI.md 与 live-plan 目前口径不一，本文按“不参与”执行，待同事确认。

### 7.4 栈序对账

对 plain 栈：`compositeTree(doc, layers, visible) == composite.png` 0 像素差，否则阻断。对 styled 栈：跳过重算，
只冻结 `composite.png` 哈希。对 `knownIssues` 含 `stack-order-inverted` 的 `frozenEvidence` 目录：只警告。

这条检查是现有 `magick 'x.psd[0]'` AE=0 的补集：AE=0 比较的是脚本自己写进文档的合成图与脚本自己生成的 preview，
对层序和 REF 误可见完全失明；本文靠这条检查发现了样例的栈序反转。

## 8. 真源、入库与工作流位置

### 8.1 `.psd` 不入库

- `.gitignore` 追加 `docs/**/*.psd` 与 `docs/**/40-production/staging/`、`tmp/`。
- 需要 PSD 的场景（Photoshop 编辑、审阅下载、`PsdHandoffIR` / `inspectPsd.ts` 读取）先 `ui:psd:build`；IR 里的
  “PSD 文件哈希”就是 `pack-manifest.psd.sha256`，因为 build 确定性，两者不可能分叉。
- SHA256SUMS 继续钉 `.psd` 一行；`verify:psd` 在内存 build 后与该行比对，不要求文件存在。
- 代价：仓库外无法直接下载 PSD，clone 后需要 `npm install` 与 build；`composite.png` 提供无需构建的整页预览。

### 8.2 在现有 Gate 中的位置

```text
G4a  decomposition-spec.json（不变，容器不参与）
G4b  独立源 source/<stableKey>/（不变；G4c 后为来源证据，不再编辑）
G4c  重组 PSD：maker 直接产出 <Page>.artist-editable.psdt.io/（Pillow 输出 PNG + Type 描述本来就是它的中间物）
       → ui:psd:build 得到 .psd（ignored）
       → Photoshop 两段协议（§8.4）
       → verify:psd（容器不变量、栈序对账、renderLeaves）
       → ui:psd:verify / ui:psd:editability-check 消费同一目录与引擎：命名、ownership、fullCanvas 白名单、
         REF 排除、solo sheet、source-reference-excluded composite、哨兵 diff
G5   只消费 productionFromAcceptedAssets bundle；导出仍从 build 出的 .psd / IR + manifest，容器 PNG 不是运行资产
```

容器目录里的 PNG 含 padding、隐藏层、REF、1×1 占位与文字预览，`extractAssets` 不得直接引用 `.psdt.io/`。

### 8.3 与 sidecar、decomposition-spec 与独立源的边界

- 容器只是 psd.md 三层契约中“第一层命名”的载体加像素容器；`document.json` 的 `name` 就是 `ROLE::stableKey` 文本。
- `decomposition-spec.json`、`asset-manifest.json`、`assembly-recipe.json` 仍是唯一语义真源；容器任何改动会改变
  `build` 输出 SHA，从而按 psd.md §3.4 使批准记录失效，链条不变。
- `source/<stableKey>/` 与容器 `layers/` 是同一像素两份编码，G4c 在 Photoshop 里编辑后必然分叉。本文定：G4c 之后
  容器 `layers/` 是唯一可编辑像素，`source/<stableKey>/` 只作来源证据；verify 对每个带 `psdLayerPath` 的 manifest
  条目校验 `pixels(layer png) == pixels(sourceFile)`，或登记确定性变换（裁切、位移），否则阻断。

### 8.4 G4c 两段协议

Photoshop 会重写块序、重生成 EngineData、丢 ICC、加 lyid/lclr/shmd，首次保存的噪声必须与编辑造成的差异分开，
否则 unpack-report 无法证明“未编辑层未变”：

1. **无编辑往返归一化**：`build` 出 `.psd`（记录 H0）→ Photoshop 打开、保存、关闭、重开、不编辑 → 取证 sha256 与版本
   → `unpack --from-foreign` → 与 H0 目录做逐层结构 diff（`{path, type, name, 栈序, hidden, bbox, alphaBBox,
   pixelSha, text 字段}`）→ 差异作为归一化白名单候选，人工批准 → 该目录成为批次新版本（不改写已批准 evidence）。
   未编辑 Type 层的像素是否被 Photoshop 重绘由这一步实测决定，不预设。
2. **哨兵编辑**：以归一化真源为基线，移动、隐藏、替换、调色、改字五类各写 `staging/sentinel-diffs/<id>.expected.json`
   （目标层、属性 / 像素变更、influenceBounds）→ Photoshop 编辑保存 → 取证 → `unpack` 到 staging（不覆盖真源）→
   `verify --against` 真源 → 判定 `actual ⊆ expected ∪ 白名单`。被编辑的 Type 层比 `text` 对象字段，不比预览像素。
3. 五类全部通过才记 `psd-artist-editable-accepted`；`photoshop-roundtripped` 记录在 `evidence/psd.approval.json`
   （保存件 sha256 + Photoshop 版本 + unpack-report hash），重建的 `.psd` 仍是 ag-psd 写出物。

## 9. 命令、机检与登记点

全部为**计划命令**，实现落在 `tools/ui-pipeline/psdContainer/`，入口按 psd.md §9.1 为 `tools/ui-pipeline/cli.ts`，
默认 dry-run，写入必须显式 `--out` / `--write`，输出只能落在 page root 或 `tmp/ui-pipeline`。

```bash
# PSD → 容器；--from-foreign 走归一化导入；未登记块默认退出 3
npm run ui:psd:unpack -- --psd <file.psd> --out <dir.psdt.io> [--from-foreign] [--allow-drop 1039,zzzz] [--strip-volatile] [--report <evidence/unpack-report.json>] [--write]

# 容器 → PSD；--check 只在内存 build 比 sha；--normalize 先 build→unpack 重写目录为规范形
npm run ui:psd:build -- --dir <dir.psdt.io> [--out <file.psd>] [--check] [--normalize] [--write]

# 容器级机检：扫描 docs/**/*.psdt.io（进 verify:core）
npm run verify:psd

# 只读清单：section 级扫描 + ag-psd 摘要，接受 .psd 或 .psdt.io（对应 psd.md §5 inspectPsd.ts）
npm run ui:psd:inspect -- --psd <file> | --dir <dir>

npm run test:psd    # node --import tsx --test tools/ui-pipeline/psdContainer/*.test.ts
```

`verify:psd` 检查项与退出码：

| 项 | 内容 | 失败码 |
| --- | --- | --- |
| codec 锁 | `pack-manifest.codec` 与 package-lock 精确版本一致 | 2 |
| mirror | 内存 `build(X)` 的 sha256 == `pack-manifest.psd.sha256` == SHA256SUMS 对应行 | 2 |
| 确定性 | `build(X)` 两次字节相同 | 2 |
| 不动点 | `unpack(build(X))` 与 X 逐文件比对（composite 按 §5 规则），两轮 | 2 |
| canonical | JSON 重序列化字节相同；slug 与文件名一致；颜色归一已应用；无 NaN | 2 |
| 键白名单 | `document.json` 键 ⊆ ag-psd 类型键；`placedLayer.id` 为 GUID | 2 |
| 不变量 | 像素层 `right-left == png.width`、`bottom-top == png.height`；无 imageData 的层（调整层、组）不生成 PNG；组含 `opened`；文字层含 `text.left/top/right/bottom` 与完整 `style` / `paragraphStyle` | 2 |
| 栈序对账 | plain 栈引擎重算 == `composite.png`；styled 栈哈希冻结；`frozenEvidence` 只警告 | 2 |
| renderLeaves | 每个可导出 key 有 plain 导出叶；`SRC::` 原层哈希未漂移 | 2 / 警告 |
| 独立源一致 | manifest `psdLayerPath` 条目像素 == `source/<stableKey>/`（或登记变换） | 2 |
| 未知数据 | 扫描器清单 ⊆ handler 表 ∪ 已批准丢弃清单 | 3 |
| 不可支持 | 色彩模式 / 位深 | 4 |
| 环境 | `--magick` 要求 ImageMagick 时缺席 | 7（未指定时标 skipped） |

新增根脚本必须同一提交内同步：`package.json` scripts 与 `verify:core` 链、`scripts/verify-toolchain.mjs` 的
`VERIFY_CORE_COMMANDS`（`ROOT_TOOL_DEPENDENCIES` 不动，否则 `apps/server` 也要声明相同版本范围）、CLAUDE.md 与
AGENTS.md 的“常用本地命令”唯一 bash 块（两文件除空白外一致）、README 的“常用开发命令”表；`ag-psd@31.0.2` 与
`pngjs@7.0.0` 精确钉进根 `devDependencies`。否则 `verify:inventory` / `verify:core` 直接失败。

## 10. Git 机制

```text
# .gitattributes 追加
docs/**/*.psdt.io/**/*.json   text eol=lf
docs/**/*.psdt.io/**/*.png    binary
docs/**/*.psdt.io/**/*.bin    binary
# .gitignore 追加
docs/**/*.psd
docs/**/40-production/staging/
tmp/
```

- **体积**：level 0 展开整页约 30 MB 工作区、首提 pack 约 4～6 MiB，此后每次局部像素编辑 +1～31 KiB；同内容层（样例里
  黄金 target 两份、1×1 占位七份）git 按 blob 只存一份。不引入 LFS：GitHub 对 LFS 图片不显示图像 diff，且需重写历史。
- **diff**：`document.json` 行级（层名、bbox、hidden、opened、文字内容、字号、颜色、层序）；PNG 走平台图像 diff；
  `composite.png` 的图像 diff 等价于整页变化。可选本地 `diff.psd.textconv` 指向 `ui:psd:inspect`，仅 `git diff/log` 生效。
- **merge**：`document.json` 普通文本三方合并（每节点约 15～20 行）；同一层 PNG 两边都改只能二选一；合并后必须
  `ui:psd:build --check`，CI 的 mirror / 不动点检查兜底。
- **blame**：层属性查 `document.json` 行，层像素查 `layers/<组>/<层>.png`；改组名与改像素分两次提交以保住 rename 检测。
- **PR 审阅**：看 `document.json` diff、变化的层 PNG、`composite.png`、`unpack-report.json` 与 CI 的 verify 报告。

## 11. 历史样例迁移

`docs/psd-maker/ug_main_layered_source_v02.psd` 走方案 A：字节冻结、已记录哈希不动、只作负样本。

1. `ui:psd:unpack --psd docs/psd-maker/ug_main_layered_source_v02.psd --out docs/psd-maker/ug_main_layered_source_v02.psdt.io`：
   预期 33 张层 PNG + `composite.png` + `document.json`；`pack-manifest.origin = "frozenEvidence"`，
   `knownIssues = ["stack-order-inverted"]`，`psd.sha256 = 6fb8c200…1b1f5f`。
2. `ui:psd:build --check` 必须得到同一 SHA（已实证），否则迁移中止。
3. `git rm --cached` 该 `.psd`（历史保留 blob），追加 ignore 规则；SHA256SUMS 保留 `.psd` 行并追加 `pack-manifest.json`、
   `document.json` 两行；`verify:psd` 对该行按内存 build 校验。
4. psd-maker.md §3.5 新增一行“展开目录（git 真源，`.psd` 由 build 重建）”，并新增“已知缺陷：children 顺序与显示顺序
   相反，文件未改”记录；新增记录不是改写 evidence。
5. 该目录在测试中作为栈序负样本读取（断言引擎重算得到单色 `#182129`）；它没有 `ROLE::` 命名，不作命名或 ownership 负样本。
6. maker 脚本（psd-maker.md §11.3 顶层结构写入顺序、ue-v01 的 `write-psd.cjs`）先修 children 顺序再产任何新批次。

`docs/ui/undergroundIdle/ue-v01/` 的 11 份 PSD 尚未入库；入库时按 §6 走 `unpack`（本仓 ag-psd 产物应满足 L0），
`.psd` 本体不进 git，栈序在 `unpack` 后由 §7.4 核实。

## 12. 测试与夹具

- **正样本**：测试内用 ag-psd 合成的微型 PSD（几层、小画布）覆盖嵌套组、同名层、大小写冲突名、中文名、隐藏组、半透明层、
  文字 run、`SRC::` 子组内的 mask / effects / clipping / 调整层 / 嵌入智能对象；断言 L0 不动点、两轮零 diff、
  `stackClass` 判定、renderLeaves 检查。
- **负样本**：历史样例（栈序）；注入 `9999` / `1039` / `zzzz` 块、CMYK 头、16-bit、`../` 层名、缺 `opened` / `text.left`
  的手写目录、`document.json` 出现 `stableKey`、导出叶 styled、`SRC::` 漂移。
- **引擎 golden 向量**：src-over 整数公式、组隐藏继承、栈序、谓词过滤，与 Pillow `alpha_composite` 逐样本 0 差。
- **对应 psd.md §12.2**：第 4、5 项失败样本首版覆盖；第 1～3 项正样本与 Photoshop 回归随 G4c 试点补齐。

## 13. 风险

1. 工具升级即格式变更：ag-psd 或 pngjs 换版会改 `document.json` 形态或 PNG 字节，全部目录需显式重 unpack；codec 锁与
   `contentHash` 让漂移第一时间可见，但升级是一次人工迁移。
2. Photoshop 保存件不可能字节无损；`--from-foreign` 只承诺 L1/L2 并逐项报告。
3. 无不透明底的组件级 PSD，PSD 内 composite 每轮漂移；本文以 `composite.png` 为真源规避，但 Photoshop 侧看到的预览可能
   与容器差 ±1 以上。
4. 手改 `document.json` 会引入非 canonical 状态或被 ag-psd 静默丢弃的字段（adjustment 非类型键写零）；verify 报错并指向
   `--normalize`，但 `--normalize` 的静默改写要靠审阅 diff 发现。
5. 工作区体积：level 0 每整页约 30 MB，十页 300 MB checkout。
6. 栅格化导出叶是人工步骤，`staleRender` 只能警告，最终靠 G4c 人工签字。
7. 命名层面的双义（`FX::<partKey>` vs `FX::<stableKey>`、REF 组名三种拼法）在 psd.md 统一前，命名校验器只能按本文口径实现。
8. 容器 PNG 被误当运行资产；靠 `extractAssets` 路径守门与文档。

## 14. 实施计划

| 阶段 | 内容 | 退出条件 | 估计 |
| --- | --- | --- | --- |
| P0 锁定 | `ag-psd@31.0.2` / `pngjs@7.0.0` 进根 devDependencies；命令名与四处登记点；`.gitignore` / `.gitattributes`；本文决策写入 psd.md ADR（§15） | `verify:inventory` / `verify:core` 登记机检绿 | 0.5 天 |
| P1a 容器核心 | `tools/ui-pipeline/psdContainer/`：unpack / build / verify:psd / inspect、合成引擎、section 扫描、canonical、slug；§12 正负夹具 | 样例 unpack→build 字节等价；两轮不动点零 diff；夹具按预期通过或阻断；历史样例迁移完成 | 2～3 天 |
| 人工 G4a/b/c 试点（并行） | 无文字九宫格面板：decomposition-spec 草案、独立源、Photoshop 保存件取证；maker 修 children 顺序 | G4c 人工验收记录 | 美术 / TA 排期 |
| P1b 外来导入与编辑探针 | `--from-foreign`、unpack-report、基线 diff、expected-delta、归一化与 ICC 白名单、文字层策略 | 无编辑往返白名单获批；五类哨兵 diff ⊆ 期望 ∪ 白名单；首个 `artistEditableSource` 目录入库 | 2 天，依赖 Photoshop 样本 |
| P1c 页面级 verify | decomposition-spec schema、ownership 闭包、fullCanvas 白名单、REF 排除、两种 composite、solo sheet，复用引擎 | psd.md §6.5 每条拒绝项有夹具 | 2～3 天 |
| P2 起 | 沿用 psd.md §14 Phase 2 | | |

容器先于 G4c 金样落地是本文的决策，不是从现有文档推出的结论：FairyGUI.md §11 第 5 条“先金样再 pack/verify”指的是
maker 级 `PsdHandoffBundle` pack/verify，对容器沉默；容器是捕获与审阅金样所需的仪器，与 psd.md Phase 0“锁 parser /
codec + 只读 POC”相容。

## 15. 需要同步的文档改动

本文落地时需在上位文档补充或修正，其中前半部分是本方案的直接后果，后半部分是审阅新提交时发现、需要同事确认的项：

- psd.md §5 目录树加 `psd/<Page>.artist-editable.psdt.io/`，§6.2 增加保留角色 `SRC::<stableKey>`，§6.4 指明
  `MASK::` / `FX::` / `ADJUST::` 的编码与 styled 层栅格化时点，§9.2 增加 `ui:psd:unpack` / `ui:psd:build` /
  `verify:psd` / `ui:psd:inspect`，§9.3 把 composite 生成从 Pillow adapter 改为“Node 合成引擎为锁定 renderer”，
  §12.2 增加容器不动点与栈序负样本；CLAUDE.md / AGENTS.md 文档清单与铁律 2 增加“`.psdt.io/` 为真源、`.psd` 不入库”。
- psd-maker.md §3.5 增加展开目录行与栈序已知缺陷记录；§15 检查清单把“同一 composite 写入 imageData”改为两张图各自生成。
- FairyGUI.md §3.2 真源表加“PSD 容器结构与像素 → `.psdt.io/`”，并与 live-plan 统一文字层是否参与源重组图。
- 提醒同事：ue-v01 的 40-production 文件未入库却在 psd.md §1.1 与 FairyGUI.md 开头被当作已存在证据引用；psd-maker 与
  ue-v01 的 `psd[0]` AE=0 都是同源对账、对栈序失明，G4c 新增的叶层重建未钉住重建顺序来自 PSD 栈序；solo 与 composite
  证据一处放 `staging/`（psd.md）一处放 `evidence/`（FairyGUI.md）；文档所说“schemaVersion 0 的 inputTier”在仓库内
  没有载体（唯一入库 sidecar 是 `version: 1`）；`.gitignore` 缺 `tmp/` 与 `staging/`；08、09 与 art/production README
  残留“target ↔ composite”旧术语；psd-maker.md 引用的 `main_bitmap_v02/validate-manifest.mjs` 不存在；plan-v5.md 没有
  PSD 开放项。

## 16. 参考

- [PSD 到 FairyGUI 的“CLI 编译器 PSD 版”实施方案](psd.md)
- [FairyGUI UI 生产、装配与自动化工作流](FairyGUI.md)
- [分层 PSD 生成流程](psd-maker.md)
- [Underground Idle UE PSD 批次 v01](ui/undergroundIdle/ue-v01/README.md)
- [黄金位图到 FairyGUI Editor 生产流程](undergroundIdle/10-image-to-fairygui-live-plan.md)
- [ag-psd](https://github.com/Agamnentzar/ag-psd)（其测试夹具 `data.json + layer-N.png` 即本文容器的雏形）
- [OpenRaster 文件布局规范](https://www.openraster.org/baseline/file-layout-spec.html)（“结构文本 + 每层 PNG”的开放先例）
