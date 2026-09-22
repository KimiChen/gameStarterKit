# tools/art3d — SC0 合成灰盒

当前交付 `greybox.py` 与隔离 Creator 作者态探针模板 `editor-probe/`；
SC5 的 Unity 抽取、素材转换与离线 LOD 尚未实现。
灰盒模型、动画和棋盘 PNG 由代码合成，B5 lightmap 由 Creator LightFX 烘焙，不读取外部素材。生成器不写 `.meta`，不调用 Creator，
结构检查通过不表示 SC0-B2 的真实导入与 Prefab 加载已经通过。

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

各 GLB 的 scene 名等于文件 stem（不带 `.glb`）；两个 biped 的内部模型根节点均固定为
`GreyboxBiped`，使导入后的 `GreyboxBiped/Root/Upper` 等骨架与动画相对路径一致，允许夹具
在同一模型上选择主组／备用组 clip（是否跨纹理仍须实测）。所有模型都带 POSITION / NORMAL / TANGENT /
TEXCOORD_0 / TEXCOORD_1；蒙皮再带 JOINTS_0 / WEIGHTS_0，骨骼矩阵按 glTF 列主序写入。
主 biped 的 clip 为 `ANIM_Greybox_Sway_Main`（绕 Z 摆动）和 `ANIM_Greybox_Bow_Main`（绕 X 鞠躬）；
备用组为对应 `_AtlasB` 名称，角度从主样本的 ±20° 增至 ±30°。每段 0、0.25、0.5、0.75、1 s
共五个关键帧，首尾闭合。两骨是机制样本，不代表完整角色骨架或步行动画。

manifest 的 `generatedAssets` 记录生成来源、SHA256、尺寸／面数／动画结构；
`namingAndTextureExceptions` 保留生成器对四个固定文件名及 64² PNG 的需求说明。
实际 SC0 例外统一登记在 [sc0-asset-exceptions.json](sc0-asset-exceptions.json)，按精确路径、
UUID 与文件 SHA 匹配；这份临时清单不是资产检查器。正式 `scripts/assets3d.config.json` 与
SC1-B5 检查器尚未实现，后续按清单迁移，不能据此放宽业务资产规范。

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
   能力并产生格式与 shader 分支不一致。该注入不代表天然低端设备或真实微信硬件。
   两个 GLB 文件、两个 skeleton UUID 或不同 clip 名字都不能证明纹理分开；若引擎仍放同一纹理，
   调整布局后重验，跨图集验收继续 pending，不能以文件分组替代引擎证据。
4. 烘焙 / instancing / 浮点与 RGBA8 关节纹理 / WebGL1 行为属于 SC0-B3/B5 的真实引擎证据，
   本工具不会宣称这些检查已经通过。实时蒙皮实例不得沿用开启 instancing 的预烘焙材质。

自检独立回读 GLB chunk、buffer/accessor、三角朝向、法线／切线、UV2、外部图片依赖、
inverse bind、骨骼权重和动画。测试含反向三角、丢 bind 平移、权重不足、动画重复、内嵌／越界
图片、截断 GLB 与 PNG CRC 破坏，验证错误确实被拒绝；不依赖 Creator 缓存。

## SC1-B8 画质资料

[quality.md](quality.md) 登记画质端口、JSON 契约、默认值生成、压缩预设与独立验收场景。
本批不实现 SC3 的加载计划 / 池，也不提前交付 SC5 离线变体工具。

## SC1-B7 bundle 验证

包工具已接入 bundle 精确所有权及 Creator 序列化 UUID / 子资产闭合检查。
[bundle-probe/README.md](bundle-probe/README.md) 提供合成 kit → pack → 干净安装 → Creator 重导入 / 浏览器加载 →
卸载邻包的可重复步骤。`bundle-fixture.ts` 只准备隔离验证数据，不改生产包；完整 `verify:assets3d` 留 SC1-B5。
