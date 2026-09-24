# tools/art3d — 离线 3D 作者工具

SC0 合成灰盒、SC5-B1 Unity 抽取 / GLB / 独立 PNG / 两档 LOD / 往返校验已交付。
工具只在作者机运行，依赖不进入客户端。规范以 [3D-ASSETS.md](../../docs/3D-ASSETS.md) 为准；
批次状态与证据见 [3D-PLAN §8](../../docs/3D-PLAN.md#8-批次状态只在本文回写阶段级完成回写-3dmd-10)。
SC5-B2 文档汇总和 API 冻结仍待完成。

## SC5 转换链

使用 CPython 3.14.6、Node 22+；Python 直接 / 传递依赖逐项固定，meshoptimizer **0.25.0** 的
官方 npm 制品以 SHA512 锁定，解包后的模块 / package / MIT LICENSE 再以 SHA256 校验。
获取脚本只写忽略目录 `.cache/art3d/meshoptimizer-0.25.0`，每次简化重新核对锁与文件哈希；
不执行 npm 安装脚本，不更改根依赖，也不向 Creator 复制 WASM。
上游：[UnityPy](https://github.com/K0lb3/UnityPy)、[meshoptimizer v0.25](https://github.com/zeux/meshoptimizer/tree/v0.25)。

```bash
python3 -m venv .cache/art3d/venv
.cache/art3d/venv/bin/python -m pip install -r tools/art3d/requirements.txt
.cache/art3d/venv/bin/python tools/art3d/setup-meshoptimizer.py
.cache/art3d/venv/bin/python tools/art3d/unity-fixture.py --out .cache/art3d/fixtures/offline.assets

# 对 static / skinned 分别运行。每一步非零退出即停止；最后一步重新读取 Unity 真源。
for model in static skinned; do
  for step in extract material-map to-gltf textures lod verify-roundtrip; do
    .cache/art3d/venv/bin/python tools/art3d/$step.py --config tools/art3d/fixtures/$model.conversion.json || exit 1
  done
done
.cache/art3d/venv/bin/python -m unittest discover -s tools/art3d -p 'test_*.py' -v
npm run verify:assets3d
```

自制输入是按 Unity 2019.4.40f1 类型树生成的真实 SerializedFile v17，包含 Mesh、Renderer、
Transform、Texture2D、Material、Shader 和独立 legacy AnimationClip。它由代码原创，
**不是 Unity Editor 导出的 AssetBundle，也不证明任意 Unity 版本 / 商业游戏资产都可转换**。
输入二进制与中间 JSON 留 `.cache`；入库的是生成器、自制 GLB / PNG、Creator 元数据和验收摘要。
所有样例内容继承本仓许可，没有借用 Cyberpunk 或其它游戏素材。

| 工具 | 输入 → 输出 / 检查 |
| --- | --- |
| `extract.py` | UnityPy 只读选中 GameObject 层级，解 Mesh / 子网格、局部 TRS、bind pose、明确列出的 clip、PBR 参数和图片；写 `workDir/extracted.json` 与临时 PNG |
| `material-map.py` | 每个材质必须精确登记 shader 与目标；当前映射 opaque Unity Standard：`_Color` RGB 从 sRGB 转线性 factor（alpha 不变）、metallic、1−smoothness → roughness；BC PNG 保持 sRGB |
| `to-gltf.py` | 左手米制 → 右手 Y-up：反射 Z、反转三角绕序、UV 的 V 翻转、四元数 / 逆绑定矩阵转换；保留两套 UV / 法线 / 切线、骨骼和无加权 Hermite TRS 曲线（glTF CUBICSPLINE） |
| `textures.py` | 解 PNG / JPEG / TGA / WebP、GLB bufferView 或 PNG/JPEG data URI；去元数据并转独立 RGBA8 PNG；按 `textureMaxSize` 下采样、保留 POT 与最低 256；重写同目录 URI、移除内嵌图片与废弃 BIN 数据 |
| `lod.py` | 每个材质 primitive 分别 meshopt `simplifyWithAttributes`，法线与 UV 参与误差；仅重排 / 压紧已有顶点，不移动或重算属性，输出 `lod_1.glb` / `lod_2.glb` |
| `verify-roundtrip.py` | 重读 Unity 真源并核对中间记录；主模型逐顶点 / 绕序 / TRS / 材质 / 像素 / 绑定 / 关键帧往返，LOD 检查面数、每槽包围盒、双向顶点及三角重心到表面的误差、保留顶点属性、骨架和全部动画数据；最后复读输出文件 |

`conversion.schema.json` 是**转换作业**的 schema，与 [资产闸配置](assets3d.md) 中的
`art3d.config.json` 分工不同。路径相对作业 JSON；`source.path` 必须在工作与输出目录之外。
`source.rootGameObject` 是唯一 GameObject path ID，`animationClips` 是明确选择的独立 clip ID；
同一个 bundle 中 path ID 不能歧义。包作者把 `outputDir` 指向自身 `bundles/<class>-<id>/3d/models/<model>/`，
图片与三档模型同目录，另在包的资产闸配置 / LICENSES 登记全部产物。工具不触碰输入、不删除未知文件，
不生成 `.meta`；先让 Creator 导入，再按规范设置保留 CPU 数据、法线 / 切线、UV2 和压缩预设。
样例配置指向已入库的框架目录；只重建原样例时才使用它们。

颜色转换依据 [UnityGLTF 的 Standard 导出路径](https://github.com/KhronosGroup/UnityGLTF/blob/main/Runtime/Scripts/SceneExporter/ExporterMaterials.cs)
与 [glTF 2.0 metallic-roughness 规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#metallic-roughness-material)。
独立测试固定 `0.5 sRGB → 0.21404114048223255 linear`，直接透传 gamma factor 会令往返校验失败。

### 支持范围与失败条件

当前自动链支持单一自包含 Unity 序列化文件内的静态三角网格，和明确节点绑定的蒙皮网格。
支持 legacy、非压缩、无加权切线的 TRS 曲线；拒绝 Mecanim、Euler、事件、属性动画、外部 PPtr / stream、
blendshape、未映射 shader / texture 通道、alpha 模式、脚本 / 约束 / 粒子组件、缺失 UV2 或不合法权重。
这些失败需要 DCC / 人工作品，工具不会补默认动画或静默丢弃通道。

**自动蒙皮 LOD 只接收每个 primitive 内相同的 joints / weights（可含四个非零权重）**。
这使该 primitive 的蒙皮矩阵一致；任意随顶点变化的权重会明确要求审核手工变体，
不以“骨骼数量没变”冒充变形保真。样例是四骨四权重的机械验证，不是完整角色或复杂骨架容量证据。
对手工作品的美术审核不能由本自动链的 PASS 替代。

两档目标按 primitive 为主档的 1/4、1/10，容差不超过 10%（最少一个三角的整数舍入余量），
严格递减。包围盒容差按源 primitive 对角线计，配置最多 5%；误差阈值最多 10%。
浮点简化留下的近零面积三角会被过滤，随后仍执行目标与双向表面误差检查；原始顶点属性不变。
这是离线结构与采样保真检查，不是连续曲面误差的数学证明。
源骨架、bind pose、动画轨 / 时间 / 切线逐项比较；缺档、面数不降、错槽位、丢动画均失败。

### Creator 验收

本批静态 / 蒙皮均为 **1200 → 297 → 118** 面、两个材质槽、512² 独立 BC PNG；蒙皮四骨、
每点四个非零权重、两段各 1 秒动画。六份 GLB 的真实 `gltf-scene` 子 UUID / 子路径从 Creator
`.meta` 读取，不能把 GLB 父路径作为 Prefab 加载。

```bash
# 先让当前 Creator 3.8.8 导入 offline/，使用已有 Chrome 9222。
node tools/creator-preview/probe-offline-lod.mjs --webgl 2 --out .cache/sc5-b1/webgl2
node tools/creator-preview/probe-offline-lod.mjs --webgl 1 --out .cache/sc5-b1/webgl1
```

探针新开并最终关闭自己的标签页，断言预览端口归属本工程。复用正式 Stage3D、EntityPool 与
SkinnedUnits，显式登记三档地址，切 `0 → 1 → 2 → 0`；核对实际 Mesh UUID / 面数、两个材质槽、
512² 图片、当前 GLB 的实际材质因子、两段动画、四骨关节纹理、socket 推进与各 20 次开关。
切档后再等 30 个渲染帧并核对实际提交，避免首帧 / 旧缓存截图冒充完整画面。实体先退休并完成 AFTER_DRAW，
再关闭最后一台舞台相机；不让无相机的缓存队列冒充已完成清理。WebGL1 在页面启动前拒绝
WebGL2 context，并断言实际 `WebGLDevice`，不改引擎能力或全局设置。
截图仍需人工复核；探针保留 `visualReview: pending`，人工结论记录在批次摘要。此负载不做帧时容量承诺。
完整证据与限制：[SC5-B1 摘要](../../docs/perf/stage3d/2026-09-24-sc5-b1.json)。

## SC0 合成灰盒（保留的独立生成器）

`greybox.py` 与隔离 Creator 作者态探针模板 `editor-probe/` 保持原动线；B5 lightmap 由 Creator
LightFX 烘焙。生成器不写 `.meta`、不调用 Creator，结构自检不替代真实导入与 Prefab 加载。

## 隔离依赖与运行

已验证环境：CPython **3.14.6** / macOS arm64；Python 依赖及传递依赖逐项固定在
`requirements.txt`。venv 在仓外，既不修改根 npm 依赖，也不成为客户端运行时依赖。

```bash
python3 -m venv /tmp/codex-stage3d-greybox-venv
/tmp/codex-stage3d-greybox-venv/bin/python -m pip install -r tools/art3d/requirements.txt

/tmp/codex-stage3d-greybox-venv/bin/python tools/art3d/greybox.py --out apps/Cocos/assets/resources/stage3d
/tmp/codex-stage3d-greybox-venv/bin/python tools/art3d/greybox.py --check
/tmp/codex-stage3d-greybox-venv/bin/python -m unittest discover -s tools/art3d -p 'test_*.py' -v
```

`--out` 可指向临时目录；缺省为本仓框架灰盒目录。`--check` 仅在内存重生成并比对指定输出目录
及工具目录中的 `greybox-manifest.json`，不修复、创建或删除文件；文件缺失／字节变化均非零退出。
普通生成只写所列五个产物及 manifest，不删除未知文件，不覆盖已有 `.meta` 或烘焙产物。
PNG 使用固定字节的无压缩 DEFLATE，GLB 使用固定顺序与小端 buffer，不带时间戳。

## 合成内容

| 文件 | 内容 |
| --- | --- |
| `greybox-cube.glb` | 底部中心枢轴、1 m 立方体、12 三角、两套 UV；通过 `images[].uri` 引用同目录外部 PNG |
| `T_Greybox_Checker_BC.png` | 64×64 RGBA8 棋盘，四角颜色标记用于检查方向；SC0-B2 的显式尺寸例外 |
| `greybox-plane.glb` | Y=0、X/Z 各 64 m，UV2 位于 0.01–0.99，供静态光烘焙 |
| `greybox-biped.glb` | Root / Upper 两骨、192 顶点 / 96 三角、脚底枢轴；鼻子指向 -Z；两个 1 s 动画 |
| `greybox-biped-atlas-b.glb` | 同样 rig / mesh，另一组命名及角度不同的 1 s 动画；用于请求独立 Joint Texture Layout 的受控候选 |
| `FX_Stage3d_Sparks.prefab` | SC4-B2 原创粒子灰盒：Cocos 内置 ParticleSystem / 默认材质，无外部图片；容量50、发射30/s、寿命1s、速度2、尺寸0.25；手写作者态，不由 greybox.py 覆盖 |

粒子尺寸在 Creator 3.8.8 的序列化兼容键为 `startSize`，运行时属性为 `startSizeX`；
`--perf --vfx` 读取并断言实际尺寸 / 速度 / 发射率 / 寿命，防止导入时默默回落默认值。

各 GLB 的 scene 名等于文件 stem（不带 `.glb`）；两个 biped 的内部模型根节点均固定为
`GreyboxBiped`，使导入后的 `GreyboxBiped/Root/Upper` 等骨架与动画相对路径一致，允许夹具
在同一模型上选择主组／备用组 clip（是否跨纹理仍须实测）。所有模型都带 POSITION / NORMAL / TANGENT /
TEXCOORD_0 / TEXCOORD_1；蒙皮再带 JOINTS_0 / WEIGHTS_0，骨骼矩阵按 glTF 列主序写入。
主 biped 的 clip 为 `ANIM_Greybox_Sway_Main`（绕 Z 摆动）和 `ANIM_Greybox_Bow_Main`（绕 X 鞠躬）；
备用组为对应 `_AtlasB` 名称，角度从主样本的 ±20° 增至 ±30°。每段 0、0.25、0.5、0.75、1 s
共五个关键帧，首尾闭合。两骨是机制样本，不代表完整角色骨架或步行动画。

manifest 的 `generatedAssets` 记录生成来源、SHA256、尺寸／面数／动画结构；
`namingAndTextureExceptions` 保留生成器对四个固定文件名及 64² PNG 的需求说明。
原 SC0 例外与证据保存在 [sc0-asset-exceptions.json](sc0-asset-exceptions.json)。
SC1-B5 已迁移至正式 `scripts/assets3d.config.json`，由 `npm run verify:assets3d` 按精确路径、
UUID、文件 SHA 及采样元数据身份执行；配置、授权映射与检查边界见 [assets3d.md](assets3d.md)。

其中唯一采样例外是 `lightmaps/LightFX/output/LFX_Mesh_0000.png`：保留本次 Creator 3.8.8
官方烘焙流程及默认导入得到的 `mipfilter:none`、`wrapModeS/T:repeat`。这不是 LightFX 对所有
内容的采样规定；`min/mag:linear`、POT、尺寸预算和 lightmap 不压缩要求仍适用。
例外同时钉 PNG、ImageAsset / Texture2D UUID、PNG 与 `.meta` SHA，不按目录或 `LFX_*` 前缀放行。

当前 B5 对比范围仅为相机 `(7,7,7)` 看向 `(0,0.4,0)`、FOV 45、375×812 CSS / DPR 2 的固定距离。
两个 128² 分配区域的 UV 变换覆盖 126²，起点分别为 `(1,1)` 与 `(129,1)` 个图集 texel；
约 1 texel 的图块边界不证明 UV 岛内部或整条 mip 链有足够 padding。
烘焙参数 `filter:true` 不等于生成 mipmap，整张图集的 clamp 也不解决内部图块串色。
连续缩放、远距离与 mip 链保真尚未验证；修改采样或重新烘焙后须重核哈希、UV / padding、
导入与独立预制画面对比。普通 3D 贴图继续开 mip，这个例外不能推广到其他 lightmap。

## Creator 3.8.8 导入与后续验收

`greybox-manifest.json.creatorVerification` 是**待验收需求**，所有 observed 字段保持 null，
`candidatePrefabPath` 只是推测路径，不能直接作为已验证的运行时清单。实际证据另存
`tools/art3d/creator-import-report.json` 或本轮证据目录，不手改确定性生成 manifest。

1. 让 Creator 作者态导入上述资源及目录，保留其生成的 `.meta`；确认 GLB 顶层 importer 为 `gltf`。
   根据真实 `subMetas` 中 `gltf-scene` 名称／UUID 填写导入报告，实际以 Prefab 类型成功加载后
   才能将路径交给夹具页。2026-09-22 已在隔离 Creator 3.8.8 实际导入并加载四份 Prefab，
   路径均为 `stage3d/<文件 stem>/<文件 stem>`，其中包括
   `stage3d/greybox-biped/greybox-biped`；UUID、产物哈希和外部 PNG 目检记录见
   [creator-import-report.json](creator-import-report.json)。不把 GLB 父路径当 Prefab。
2. 特别检查 cube 的外部 PNG URI 能解析、图片／texture 子 meta 生成、材质棋盘可见；64² PNG 按
   texture 导入，设置 mipfilter 为 linear。若 GLB 外部 URI 不被支持，保留失败证据并走设计拍板，
   不能静默改为内嵌图片。模型导入设置按 `docs/3D-ASSETS.md §3`，UV2 由文件提供。
3. 用主 biped 的两个 clip 验证同图集路径。当前固定夹具在首次实例化前调用 3.8.8
   `jointTexturePool.registerCustomTextureLayouts`，按实际 `Skeleton.hash / AnimationClip.hash`
   分别登记两块布局；编辑器资产 UUID 用于导入引用，不是这个运行时 API 的参数。
   同图实例共用材质；切到备用图时使用独立父材质 Pass，回主图时恢复共享材质，因为此版本
   `InstancedBuffer.merge` 没有把关节纹理列入分批键。实际是否分离仍由探针读取 GPU 对象判断。
   记录 clip、skeleton、布局与渲染器取得的 texture 身份，再演示切 clip 后动画及分组正确。
   固定布局宽度为 72（RGBA32F）或 144（RGBA8）；每骨每帧分别占 3 / 12 个 texel，
   行宽及像素起点必须按该跨度对齐，避免 shader 的同一行连续取样跨越边界。原 64 / 128
   布局在实际动画中失败，最终三路径近景及矩阵证据已重验，旧失败证据保留。
   RGBA8 验证使用显式能力故障注入，同时关闭 RGBA32F 的 SAMPLED_TEXTURE / RENDER_TARGET
   能力，核对实际纹理格式为 RGBA8、宽度 144，且实际编译 shader 的
   `CC_DEVICE_SUPPORT_FLOAT_TEXTURE` 为 0；只屏蔽 OES_texture_float 会留下 render-target
   能力并产生格式与 shader 分支不一致。该注入不代表天然低端硬件。
   两个 GLB 文件、两个 skeleton UUID 或不同 clip 名字都不能证明纹理分开；若引擎仍放同一纹理，
   调整布局后重验，跨图集验收继续 pending，不能以文件分组替代引擎证据。
4. 烘焙 / instancing / 浮点与 RGBA8 关节纹理 / WebGL1 行为属于 SC0-B3/B5 的真实引擎证据，
   本工具不会宣称这些检查已经通过。实时蒙皮实例不得沿用开启 instancing 的预烘焙材质。

自检独立回读 GLB chunk、buffer/accessor、三角朝向、法线／切线、UV2、外部图片依赖、
inverse bind、骨骼权重和动画。测试含反向三角、丢 bind 平移、权重不足、动画重复、内嵌／越界
图片、截断 GLB 与 PNG CRC 破坏，验证错误确实被拒绝；不依赖 Creator 缓存。

## SC1-B8 画质资料

[quality.md](quality.md) 登记画质端口、JSON 契约、默认值生成、压缩预设与独立验收场景。
该记录描述 SC1-B8 时点；当前 SC3 / SC5-B1 实施状态见 3D-PLAN §8。

## SC1-B7 bundle 验证

包工具已接入 bundle 精确所有权及 Creator 序列化 UUID / 子资产闭合检查。
[bundle-probe/README.md](bundle-probe/README.md) 提供合成 kit → pack → 干净安装 → Creator 重导入 / 浏览器加载 →
卸载邻包的可重复步骤。`bundle-fixture.ts` 只准备隔离验证数据，不改生产包；完整格式 / 导入 / 预算 / 授权检查已由 [SC1-B5 资产闸](assets3d.md) 接入。
