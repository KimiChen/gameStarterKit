# 3D 作者态资产检查

`npm run verify:assets3d` 是 SC1-B5 的只读检查入口，已接入 `verify:core` / `verify:all`。
反例矩阵在 `scripts/verify-assets3d.test.mjs`，随 `test:client` 执行，也可单独运行：

```bash
node --test scripts/verify-assets3d.test.mjs
node scripts/verify-assets3d.mjs --root /path/to/repository --json
```

规范仍以 [3D-ASSETS.md](../../docs/3D-ASSETS.md) 为准。检查器不创建 `.meta`、修改设置、
导入资源或读取 Library；Creator 目检、资源释放与帧时由真实预览验收。
SC0–SC5 的证据与实际覆盖范围见 [冻结索引](../../docs/3d.md#101-v1-冻结面与证据索引)，
工具 PASS 不替代消费方内容的预览与性能验收。

## 扫描与配置

框架配置在 [scripts/assets3d.config.json](../../scripts/assets3d.config.json)。包配置固定放在
`apps/{kits,plugins}/<id>/art/3d/art3d.config.json`，同目录必须有 `LICENSES.md`。
框架 `framework` 对象与包配置使用以下形状，所有路径均相对仓库根，禁止 glob 和符号链接：

```json
{
  "schemaVersion": 1,
  "creatorVersion": "3.8.8",
  "budgets": {
    "totalBytes": 64000000,
    "maxGlbBytes": 8000000,
    "maxPngBytes": 4000000,
    "texturesBytes": 32000000,
    "lightmapsBytes": 32000000
  },
  "textures": {
    "apps/Cocos/assets/bundles/kit-example/3d/textures/T_Rock_BC.png": {
      "usage": "surface", "sampling": "tiling", "colorSpace": "srgb"
    }
  },
  "models": {
    "apps/Cocos/assets/bundles/kit-example/3d/models/SM_Rock/SM_Rock.glb": {
      "category": "world"
    }
  },
  "exceptions": [],
  "provenance": []
}
```

示例包名 `example` 只是说明，不能直接放入工程作为有效配置。每个实际文件都需登记授权映射。

扫描 `resources/stage3d/`、`resources/{kits,plugins}/*/3d/` 和全部 `bundles/`；bundle 必须归属
存在的 manifest，使用 B7 的 `kit/plugin-<id>[-<map>]` 边界。包 bundle 的资产必须在 `3d/`，
包 `resources/.../3d/` 只收 `data/` JSON。既有 2D 资源保留；GLB / FBX / HDR / MTL 不能借相邻
`resources/` 目录存放。包作者输入也被枚举，禁止以遗漏配置隐藏未授权来源。

预算以字节计，允许包收紧、不允许扩大 SC0 上限。单 GLB、单 PNG、全部图片（含 HDR）、lightmap
和包总量分别检查。同包细分 bundle 合计，引用次数不增加体积；作者输入与运行时导入源是不同
文件时分别计入包总量。`.meta` 单独报告，配置和 LICENSES 不算源素材。lightmap 上限沿用全部
图片 32 MB 的包含关系，包可单独收紧；不是新增或放大 SC0 容量承诺。

## 图片、模型与 Creator 元数据

`usage` 取 `surface / ui / vfx / lightmap / sky / reflection`，`sampling` 取 `tiling / atlas`。
每张外置图片必须登记，不能靠目录名推断不压缩资格。lightmap / sky / reflection 禁压；ui / vfx
若需不压，登记 `uncompressed:true` 和非空 `reason`，其余图片引用 B8 的两个平台预设。
所有平台须保留 PNG quality80 回落，并显式开启压缩 mipmap 生成。

检查 PNG 签名、chunk 边界 / CRC、8 位 RGB(A)、像素解压长度和 POT / 尺寸档；HDR 检查 Radiance
RGBE 头及扫描行。2048 档需 `allow2048:true` 和 `reason`；其它尺寸与 UI 非 POT 走精确例外。
普通采样要求 linear min / mag / mip、anisotropy 0，图集 clamp、平铺 repeat。独立图片与模型
导出的 texture 子资产均受检；HDR cube 的六个面按实际两级 `image@cube@face` UUID 建索引。

`colorSpace` 按通道声明：BC / E 为 srgb，N / ORM / M 为 linear；HDR / lightmap 为 linear。
检查线性图上的 sRGB / gAMA 冲突及 glTF、独立材质的普通纹理槽。
Creator 3.8.8 的标准 shader 在槽位中做颜色转换，普通 texture inspector 没有通用 sRGB 开关；
因此不向 `.meta` 发明无效字段。自定义 effect 的实际色彩行为仍须 Creator 目检。

模型按真实 skin、JOINTS / WEIGHTS 判断蒙皮，名称不能代替数据。GLB 检查头、JSON / BIN 长度、
bufferView / accessor 边界、三角 / 顶点、UV2、骨架以及对应导入子资产；图片必须是同所有者的
外置 PNG，相对 URI 经过解码和规范化，禁止远程、越界、内嵌图片和外部 buffer。

模型 `category` 为 `world / building / hero`，对应 3k / 10k / 20k 面数；远档 300、单位 30 骨、
主角 80 骨。导入选项依据 3.8.8 实际字段：`meshOptimize.enable`、`meshSimplify.enable`，
不是规范旧文中的 `meshOptimizer` 拼写。其它导入规则见素材规范 §3。省略值采用 3.8.8 inspector
默认值：`mountAllAnimationsOnPrefab:true`、`allowMeshDataAccess:true`；因此静态网格必须显式
关闭 CPU 访问，蒙皮必须保留。FBX 只在精确文件例外下接受，并检查 FBX 特有导入设置。

保留 CPU 数据的模型登记 `cpuDataBudgetBytes`，以源 BIN 数据量检查其分配；混合静态 / 蒙皮和
工具用途的静态模型还需 `cpuReason`。SC0 两份蒙皮灰盒各登记 32 KiB 的源数据分配，源 BIN 各 16,244 B，
已导入 mesh native buffer 各 15,936 B。源 BIN 包括动画等数据，不等同于 mesh 的 native 数据；
两者都不代表实测总 CPU 内存，报告字段 `retainedSourceBinBytes` 仅记录前者，不能替代资源验收。
SC5 的 `SK_OfflineColumn` 主模型与两档 LOD 分别登记 CPU 分配，不能沿用 SC0 的数字；
静态 `SM_OfflineColumn` 三档关闭 CPU 访问。当前逐文件数据以框架配置与检查报告为准。

## 精确例外与引用边界

`exceptions[]` 每项必须带 `path / uuid / sha256 / reason / rules`；采样例外还带
`metaSha256 / textureUuid / usage`。路径、文件身份或哈希变化立即失败。可登记的偏差只有：
`naming:true`、`dimensions:[w,h]`、`sampler:{...}`、`model:{导入字段:值}`、`fbx:true`、
`staticCpuAccess:true`。蒙皮 CPU 访问不能用导入字段例外关闭。

框架正式配置已逐项接管 [SC0 例外清单](sc0-asset-exceptions.json) 的四个固定模型名、64² 棋盘
和一张 LightFX 图。该 LightFX 图同时登记作者输出名、固定距离采样、PNG / meta 哈希及纹理 UUID；
采样许可不会传播到同图的其它 texture 子资产。原 SC0 清单保留证据和适用范围，已转为历史移交记录。

UUID 闭合复用 [B7 核心](../../apps/server/tools/plugin/assetReferences.ts)：区分 `__id__`，规范化
压缩 UUID 和层级子资产标识，同包多 bundle 可互引。包依赖声明不授权读取另一个包内部素材；
未登记宿主 / 验收场景、缺文件 / 缺子资产和伪内置 UUID 都失败。内置资源只接受框架维护的
[3.8.8 精确清单](../../apps/server/tools/plugin/creator-builtins-3.8.8.json)，没有新增宽泛豁免。
宿主级 `allowedExternal` 项须钉文件路径、UUID、文件 / meta SHA 和理由，内容包不能提供该名单。

## 授权与来源映射

包 `provenance[]` 覆盖每份作者输入和运行时源资产，不含 `.meta`、配置本身与 LICENSES：

```json
{
  "path": "apps/Cocos/assets/bundles/kit-example/3d/textures/T_Rock_BC.png",
  "sources": ["apps/kits/example/art/3d/T_Rock_BC.png"],
  "license": "own-art",
  "transform": "Copied losslessly; imported as texture by Creator 3.8.8"
}
```

来源文件本身也必须有记录，源头用 `sources:[]` 和非空 `origin` 说明来源；派生链必须存在、无环。
每项都有 `transform`，外提贴图和各 LOD 分开登记。`LICENSES.md` 用 `## own-art` 这类精确标题
标明来源、许可、允许用途，并以反引号逐项列出该许可覆盖的仓库相对文件路径。检查器守存在、
覆盖和来源链；许可内容与使用权判断仍由人工完成。
