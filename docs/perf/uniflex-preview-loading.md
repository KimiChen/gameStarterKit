# UniFlex 目录加载优化与验证

2026-09-23。基线提交 `18f4800a`。本次只调整 Web 目录宿主，保留卡片直接交互；不修改
UniFlex vendor、Cocos 运行时、作者态、页面分包或组件依赖清单。

## 实现

- `PreviewQueue` 同时启动最多 3 张卡片，优先级为全屏、可见、附近预加载；离屏未完成任务取消。
  侧栏使用直接定位，首次 hash 路由也先定位后调度，避免沿途卡片占用队列。
- `PreviewResources` 按当前页面资源版本共享 SDK `ResourceStore`，复用正在加载的 Promise、
  冻结 JSON、字体与解码图片。各卡片导航、DOM、交互状态及资源租约仍独立。
  校验和、图片尺寸和字体载入检查保留；失败可重试；关闭一个卡片不取消其他卡片的资源加载。
- 通过 WebProvider 的 host 创建扩展点接入共享 resolver，保留 SDK compositor 和销毁行为。
  直接依赖 SDK DOMHostDriver 的适配代码仅在 `apps/web-ui-preview/preview-resources.ts`；升级 SDK
  时须复核这一接口。共享资源只在页面结束时整体释放，资源版本更新通过刷新页面取得新池。
- 离屏已完成卡片最多保留 12 张；超限回收实例后恢复默认预览状态。资源 store 最多保留 16 个
  无主资源上下文（仍有租约的上下文不会被强制回收）。全屏中的卡片不会因原位置离屏而回收。
  换肤只重启附近组件，远处组件下次进入时应用新皮肤。
- `data-preview-state` 记录 queued/loading/ready/error/idle，便于浏览器检查和回归验证。

## 加载对照

Chrome 152.0.7977.83、Node 22.22.2、macOS，本机 HTTP 服务，1440×1000、DPR 1。
每版独立新标签页测 3 轮，禁用 HTTP 缓存、重置目录偏好，不做网络或 CPU 降速。
修改前后的构建使用同一批 AOT、图片和字体，仅预览宿主代码不同。

时间判据为当前可见卡片全部有原生渲染节点后再等待两个动画帧，不等同于生产 TTI。
请求和创建次数在资源请求稳定后采集，包含附近预加载。时间取中位数；原始每轮汇总见
[uniflex-preview-loading.json](uniflex-preview-loading.json)。测量时未并行跑全量测试。

| 指标 | 修改前 | 修改后 | 变化 |
| --- | ---: | ---: | ---: |
| 首屏 12 张可见卡片出图 | 4129 ms | 1875 ms | -54.6% |
| 侧栏切到英雄分类 | 9227 ms | 2000 ms | -78.3% |
| 返回组件分类 | 1240 ms | 231 ms | -81.4% |
| 首屏资源 fetch 次数 | 910 | 70 | -92.3% |
| 完整往返资源 fetch 次数 | 3132 | 266 | -91.5% |
| catalog JSON 读取 | 46 | 1 | 去重 |
| ComponentSpecimen JSON 读取 | 27 | 1 | 去重 |
| FontFace 创建次数 | 46 | 1 | 去重 |
| 图片 decode 次数 | 2994 | 249 | -91.7% |
| 完整往返 Resource Timing 传输量中位数 | 549,920,891 B | 19,516,740 B | -96.5% |

这些数值只代表上述本机冷 HTTP 缓存场景。正常 HTTP 缓存可减少旧版传输量，但不能消除旧版
重复校验、JSON 处理、解码和字体实例；不同机器的耗时不能直接套用。

## 复测

先构建并同步生成物，再启动预览。已有常用端口时复用；比较两个 worktree 时为独立服务指定
不同本机端口。Chrome 复用本机 9222，不改动用户已有标签页。

```sh
npm run build:uniflex-ui
npm run sync:client
npm run dev:uniflex-web -- --host 127.0.0.1 --port 8101
node scripts/measure-uniflex-preview.mjs --url http://127.0.0.1:8101/ --out .cache/preview-loading/measurement.json --runs 3
node --import tsx --test scripts/uniflex-preview.test.mjs
npm run verify:all
```

测量脚本创建并关闭自己的测试标签页；注入计数器只存在于测试标签页。报告、截图、基线构建副本
保存在 ignored 的 `.cache/preview-loading/`，不入库。

浏览器交互检查覆盖：勾选切换、全屏前后保留状态、切皮肤、13 个目录分组逐组显示、离屏实例
上限、搜索后恢复、快速连续切分类、直接 hash 进入英雄分类（不请求 ComponentSpecimen）。
全程字体实例数为 1，未出现 console error 或未捕获异常。
另实测页面离开后返回：`pageshow.persisted === true`，bfcache 恢复后卡片正常且字体仍为 1 个实例。

本轮另补齐基线已缺失的 `StarLevel.tsx.meta`，用于通过现有同步门禁；不修改星级组件源码。

### 门禁结果与基线问题

- `verify:core` 通过（包括类型、AOT、同步、vendor、FGUI、清单/矩阵及 998 项客户端测试）。
- 新增预览专项 6 项通过；真实浏览器验证见上。
- UI 契约测试 77 项中 74 项通过，3 项 PSD 夹具失败。因此 `verify:all` **未全绿**。
  暂存本轮全部修改后，在 `18f4800a` 干净工作树上按名称复跑，同样的 3 项全部失败：
  `component document ids stay attached without rewriting pixels`（0 个链接目标却绑定 1 个）、
  `editing BackpackItemCard PSD overlays the shared restored copy and leaves originals`
  （缺 ItemSlot placed smart object）、
  `editing ActionButton PSD text skips pure prop bindings and reports them`（缺可编辑 Label）。
  本轮未修改这些 PSD、转换逻辑或相关测试。
- 服务端全量测试 1373 项：1362 通过、0 断言失败、11 取消；取消原因为
  `Promise resolution is still pending but the event loop has already resolved`。
  清空本轮修改后，在同一干净基线单独运行 `character-ready.test.ts` 与 `fault-mutation.test.ts`，
  同样复现 11 项取消（其余 9 项通过）。本轮未修改 server/shared，不把这项既有故障计为通过。

依赖在远端同步后重新按锁文件安装；PSD 契约测试所需的 `uv` 安装在 worktree 的 ignored 缓存目录，
只通过本次测试命令的 PATH 使用，未修改全局工具环境。加载效率测量本身不依赖 `uv`。

## 后续边界

组件预览仍准备 ComponentSpecimen 的完整资源依赖并构建其中的隐藏节点；还未按 part/skin 拆分。
首屏脚本仍是完整 bundle，搜索仍重建匹配卡片。它们属于后续优化，不计入本轮收益。
