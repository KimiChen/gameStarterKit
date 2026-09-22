# 隔离 Creator 扩展探针模板

状态：模板已在 SC0 隔离 Creator 3.8.8 工程实际安装；项目路径护栏、资源刷新、场景检查、
独立空场景创建、灰盒工位创建及保存已运行通过；LightFX 实际烘焙已收到 `end`，
两网格的 Texture2D → ImageAsset → PNG 引用检查及独立 Prefab 导出已通过。
2026-09-22 已在 WebGL2 / WebGL1 的全新主预览独立加载两网格，各完成 20 次引用与节点
回收；关闭后的 GFX 回到各自预热基线。主任务已对照完整作者图与独立预览图，确认几何、
棋盘纹理、烘焙明暗一致；背景 clearColor 与 profiler 显示不同。缺 PNG 故障注入也已复验：
加载回调仍成功，运行时检查定位 2×2 替代纹理及其 UUID / native URL；解除拦截后恢复
1024×1024 依赖与两网格，并回收至业务引用 0。
**SC0-B5 的完整批次退出仍等待最终全量验证；`batchComplete:false`、`sc0Exit:false`。**
数字摘要见 [WebGL2](../../../docs/perf/stage3d/2026-09-22-baked.json)、
[WebGL1](../../../docs/perf/stage3d/2026-09-22-baked-webgl1.json)；独立的
[验收记录](../../../docs/perf/stage3d/2026-09-22-baked-review.json) 保存原始报告、源资产、
导出与截图 SHA256、画面复核来源及全量验证待办。原始探针报告的 pending 原样保留，
两上下文与画面对照的合并判断只记在验收记录中。
本目录不是项目扩展发现路径；由主任务安装到隔离工程的 `extensions/stage3d-probe/`。
没有 npm 依赖，不改变项目配置。烘焙入口按安装版 Creator 3.8.8 的真实 Lightmap 面板与
场景实现绑定；不会把通知事件当作命令，也不自动生成渲染通过声明。

安装方必须在**安装后的扩展目录**显式生成 `local-config.json`，可参考
`local-config.example.json`：`expectedProject` 指定隔离 Creator 工程的绝对路径，
`cacheDirectory` 指定该 worktree 内 `.cache/stage3d/editor-probe` 的绝对路径。
这些值没有默认值；缺配置、路径无效或当前工程不匹配时扩展拒绝启动，
不会使用 `Editor.Project.path` 自动认领任意当前工程。实际配置不入库。
Creator 的 `settings/v2/packages/lightmap.json` 只记录含本机绝对输出目录的烘焙历史，也保持 ignored；
独立 Prefab 通过入库 UUID 引用 PNG，不依赖这份编辑器历史。可重复步骤与实际 bake 配置保留在任务报告中。

扩展 `load()` 在指定缓存目录的 `ready.json` 写入规范化工程路径、缓存目录与进程 ID，
每秒读取该目录 `job.json`。请先检查 ready，再用唯一任务 ID 和原子 rename 投递 JSON；
`project` 必须与 ready 中的规范化路径完全一致：

```json
{
  "id": "inspect-001",
  "project": "/absolute/path/to/isolated-worktree/apps/Cocos",
  "steps": [
    { "op": "status" },
    { "op": "scene-call", "method": "inspectScene", "args": [] }
  ]
}
```

按序支持 `refresh` / `reimport`（`urls` 为 `db://assets/...` 数组）、
`open-scene`（`url` 为已导入 `.scene`）、`soft-reload`、`save-scene`、
`scene-call`（方法白名单见 `main.js`）、`bake-workbench` 和 `inspect-workbench-bake`。
操作通过 `Editor.Message.request` 发送到当前进程内的 asset-db / scene / lightmap；
消息传输是官方 API，但 Lightmap 与 `create-prefab` 的具体入口按 3.8.8 内部实现绑定。
不使用全局 UI 或任意代码执行。
`save-scene` 会保存当前场景，应单独确认当前场景是预期的 SC0 场景后才投递。
扩展启动早于场景 ready 时，不要立即投递场景操作；先等待 `status.sceneReady`。

成功任务保存 `result-<id>.json` 和 `done-<id>.json`；错误保存 `error-<id>.json`，
已认领但失败的任务保留 `running-<id>.json`，不会自动重试已执行的步骤。
`refresh-asset` 请求返回不等于预览脚本编译/浏览器重载已完成；需检查 Creator 日志、
实际预览模块版本和资源哈希。未使用不存在于本机公开声明中的 `refresh-script`。

烘焙工位与证据动线：

1. `createEmptyWorkbenchScene()` 在固定 `db://assets/stage3d-bake-workbench.scene` 创建新资产。
   目标存在即拒绝；不修改当前场景。使用锁定版本的 `EditorExtends.serialize` 与公开 AssetDB
   `create-asset`，由 Creator 生成序列化图和 `.meta`。
2. 用返回 UUID 打开场景，`inspectScene()` 取得当前 UUID / 名称，再把它们作为
   `expectedSceneUuid / expectedSceneName` 传给 `createWorkbench()`；另传导入报告中的
   plane / cube Prefab UUID。工位含 8 m 地面、1.5 m 立方体、静态方向光和相机。
   编辑器辅助节点按 `CCObject.Flags.DontSave` 过滤；已有作者内容不会被自动删除。
3. 调用 `save-scene` 保存。该作者场景不加入构建列表；运行时入口仍是主场景。
4. 投递 `bake-workbench`（下例）。场景端 `prepareBake()` 纯同步验证准确 UUID / 名称、
   独立工位内恰好两静态网格及 UV2 / bakeable / 阴影设置，以及唯一静态方向光；不向自身
   scene 进程发请求。输出固定为 `assets/resources/stage3d/lightmaps/LightFX`，存在即拒绝，
   不沿用面板删除旧输出的分支。主进程读取官方 `lightmap/getConfig`，原样保存所有字段，
   仅补固定路径、准确 `sceneUUID` 和 `highp:false`；只创建父目录，然后串行
   `lightmap/savePicPath` → `scene/execute-scene-script` 的 `lightmap.apply(data, Editor.App.path)`。
   没有发送 `lightmap:start` 通知启动烘焙。
5. `bake-workbench` 及时返回请求已发出状态，另存 `bake-<attemptId>.json` 与完整
   `bake-<attemptId>.events.jsonl`。`apply` 的 Promise 返回**不等于烘焙完成**。
   监听安装版 `Editor.Message.__protected__.addBroadcastListener` 声明对应的真实
   `lightmap:start/log/progress/finished/end/cancel` 广播；这些监听 API 同样按 3.8.8 绑定。
   用相同 `options` 投递 `inspect-workbench-bake`；只有实际 `end` 后才检查引用。
   记录仍为 `completed:false`，不能据 native 进程结束判定 B5 或画面通过。
6. 真正烘焙后用 `inspectBake()` 检查 UV2、lightmap Texture2D → ImageAsset → PNG 的 UUID
   链、文件签名和 SHA256。尚无 lightmap 时明确返回失败，不能据 `bakeable` 标记宣称完成。
7. `extractPrefab()` 只接受完整烘焙依赖且目标不存在；调用 3.8.8 已登记的内部
   `scene/create-prefab` 消息（**未标为公开 API，升级 Creator 须重验**），随后读取真实产物
   核对纹理 UUID 和无 Scene 依赖。作者态检查通过之后仍必须关闭原场景，在全新主预览动态
   加载 `stage3d/P_Stage3d_Baked`，完成 WebGL2 / WebGL1 画面与回收验收。

烘焙任务示例（UUID / 名称必须来自当前工位 `inspectScene`；attemptId 不可复用）：

```json
{
  "id": "bake-workbench-001",
  "project": "/absolute/path/to/isolated-worktree/apps/Cocos",
  "steps": [{
    "op": "bake-workbench",
    "options": {
      "attemptId": "b5-001",
      "expectedSceneUuid": "actual-scene-uuid",
      "expectedSceneName": "stage3d-bake-workbench"
    }
  }]
}
```

保留 Creator 日志、事件日志和导出任务报告。原始 `getConfig.giSamples` 会留在记录中，
但安装版 `LFX_App.Init` 没有读取它，不能声称该值影响烘焙。采样器不会接受新协议或登录，
也不在原工程安装；若 native 进程仍在运行，不要卸载探针而丢失后续事件观察。

独立预览探针只连接已运行的 Chrome CDP 与准确隔离 Creator；先关闭作者场景并清掉编辑器
场景状态，再运行。它从 `about:blank` 新标签启动真实 `scene.scene`，不加载作者场景、
不复制场景 lightmap 数组、不添加运行时灯；工具相机复现工位位置。

```bash
node tools/creator-preview/probe-stage3d-baked.mjs \
  --export-report .cache/stage3d/editor-probe/result-extract-bake-001.json \
  --expect-webgl 2 --authoring-shot /absolute/path/to/authoring.png \
  --out docs/evidence/creator-YYYY-MM-DD/stage3d-baked-webgl2
```

另在实际 WebGL1 浏览器上下文运行 `--expect-webgl 1`；此参数只核对上下文，不启动或重配
Chrome。探针核对预览端口监听 PID / 工程路径、独立 Prefab 与 PNG 哈希、实际材质 / UV2 / GFX
lightmap 绑定，保存首载峰值、60 帧预热 + 240 帧原始间隔，以及稳定预热基线后 20 次
`addRef → destroy → decRef` 的引用 / 节点 / GFX 趋势。裸引用操作仅用于 SC0 工具夹具，
不是 kit 的资源加载接口。自动检查通过仍以退出码 `2` 留下画面对照和另一上下文的待办；
人工验收必须据两份报告和截图另行登记，不改探针结果假装视觉自动通过。

受控浏览器的 GL1 冷启动只有一个窄诊断例外：明确 `--expect-webgl 1`、实际设备为
`WebGLDevice` 且管线为 `WebPipeline` 时，首次夹具加载前的完整精确消息
`This device does not support WebGL2` 记录为 `expectedBootDiagnostics`。这是 Creator 3.8.8
先尝试 WebGL2 再回退 WebGL1 的初始化诊断；原始 console 全量保留。缺少冷启动时间证据、
消息文本不同、夹具加载后出现或其他错误仍使检查失败，不能用于豁免微信真机错误。

`inspectLightmapApi()` 仅检查已加载模块的方法与源码，不运行烘焙。
主进程 `inspect-lightmap-browser` 同样只检查安装路径下两处明确的 Lightmap 包目录。
`startBake()` 明确要求改走主进程 `bake-workbench`，避免嵌套 scene 请求。
IPC 参数与结果只传 JSON，禁止传原生 Node / Asset / GFX 对象。

依据：Creator 3.8.8 安装包内 blank 扩展模板、asset-db / scene 消息声明，及官方
[操作当前场景](https://docs.cocos.com/creator/3.8/manual/zh/editor/extension/scene-script.html)、
[消息系统](https://docs.cocos.com/creator/3.8/manual/zh/editor/extension/messages.html)。
