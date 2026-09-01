# UG-MAIN-GOLDEN-V02 几何裁定记录

> 状态：`G2 已完成 / G3 视觉稿已由用户选定 / G4 候选待联合审阅 / G5 未开始`
> 日期：2026-09-01
> 决策：`adoptConceptGeometry`
> 选定源：`exec-53aa6312-22bd-4b18-91f0-0701dc29b469.png`

## 裁定

用户明确选择该 ImageGen 输出作为主界面唯一视觉稿。G2 不再把它切开、压缩或重组成旧版
`0/108/207/369/1307/1502/1624` 边界，而是将 08/09 的布局契约同步到选定像素。当前
`ug_main_golden_v02.png` 保持所选图自然构图；选稿前的 `regenerateInContractGeometry` 候选只作为历史证据。

## AUTHORING_LOCAL 基准

画布为 750×1624、左上原点、四边安全区为 0。以下区域连续覆盖整页：

| 区域 | `(x,y,w,h)` | 内容 |
| --- | --- | --- |
| R1 | `(0,0,750,178)` | 公会徽章、标题槽、设置 |
| R2 | `(0,178,750,102)` | 三资源槽 |
| R3 | `(0,280,750,184)` | 仓库、容量轨、收取 |
| R4 | `(0,464,750,754)` | 三层矿井舞台 |
| R5 | `(0,1218,750,249)` | 四指标卡 |
| R6 | `(0,1467,750,157)` | 三页签底栏 |
| Mask | `(0,460,750,776)` | R4 上 4px、下 18px bleed；由 R3/R5 chrome 遮盖 |

十个常驻热区、十三个文字槽、四指标卡/状态轨和六个岗位锚点的完整坐标以
[`09-fairygui-undergroundidle-main-assembly.md`](../undergroundIdle/09-fairygui-undergroundidle-main-assembly.md#3-固定区安全区文字槽与热区)
第 3 节为权威。派生标注证据：

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `ug_spec_main_geometry_v02.png` | target 上叠加 R/Mask/H/T/A | `cf1b2c229a47608294257b2c77321ef893cf2c7fc15bd5233c4a58b8b6397543` |
| `ug_spec_main_safearea_88_68_v02.png` | `750×1624 / T=88 / B=68` 的纯几何派生图 | `7b14c7509a80d69bd8350a2dfa5f4ace0cc98d2bc30620cc74d52f4d9db2b608` |

两张 SPEC 图是审阅证据，不是运行资产，也不能反向成为 FairyGUI 内部 ID 或最终节点矩形真源。

## 运行时安全区决策

运行时读取父容器实际 `W/H` 与 `sys.getSafeAreaRect(false)` 的四边 `L/T/R/B`。正常/长屏使用
`SAFE_CONTENT_STACK`：顶部 464px 与底部 406px 保持原尺寸，R4 使用剩余安全高度；场景只移动语义 pivot，
角色、建筑和图标不做纵向拉伸。R4 的最低可接受高度固定为 598px；低于该值或横向安全宽度小于 750px 时，
整套 750×1624 内容进入 `UNIFORM_CONTAIN`，等比缩放并用 `#182129` underlay 填补余量。

关键公式：

```text
safeW = W - L - R
safeH = H - T - B
stageH = safeH - 870
contentX = L + (safeW - 750) / 2

SAFE_CONTENT_STACK:
R1=(contentX,T,750,178); R2=(contentX,T+178,750,102); R3=(contentX,T+280,750,184)
R4=(contentX,T+464,750,stageH)
R5=(contentX,H-B-406,750,249); R6=(contentX,H-B-157,750,157)
Mask=(contentX,R4.y-4,750,R4.h+22)
sceneY(v)=R4.y+(v-464)/754*R4.h       # 只映射 pivot/透明热区端点

UNIFORM_CONTAIN:
k=min(safeW/750,safeH/1624)
ox=L+(safeW-750*k)/2; oy=T+(safeH-1624*k)/2
rect/pivot 按同一 k 等比变换
```

`W/H=750/1624, T/B=0/0` 精确回到选定 target。`T/B=88/68` 时 R4 为
`(0,552,750,598)`、Mask 为 `(0,548,750,620)`、R5.y 为 `1150`、R6.y 为 `1399`、H11 为
`(301,803,148,96)`。`750×1334 / 0/0` 触发 contain：`k=0.8214286`、水平偏移 `66.96`、内容宽
`616.07`，不裁掉三层矿井。

当前 `FguiView.safeTopInset()` 只提供顶部并使用默认对称安全区，不能表达 `88/68`。真实四边读取、审稿 fixture、
resize/orientation 重算、测试桩与客户端测试属于 G7；Creator 编辑器中的 88/68 必须由 fixture 注入，不能把 0 inset
桌面预览冒充设备证据。

## 检查与限制

- target：750×1624、8-bit RGB、无设备外框、无运行时中文或数值；
- 原始源：853×1844，已归档并校验哈希；没有虚构 1500×3248 作者源；
- 角色：恰好三名，矿工、运输工、侦察员身份和工具清晰；
- 初始语义：容量轨约 5%、开采瓶颈、升降机正常、深层锁定；
- 常规与极值 review 的差异只落在登记文字槽；
- H01～H10 在 AUTHORING_LOCAL 下不重叠并均大于 88×88；
- 建筑透明 bbox、角色局部 pivot、岗位牌矩形、clean plate flex seam 和九宫格仍属于 G4/G5，不从扁平图猜测；
- FairyGUI Editor 保存后的节点 world rect 必须回读复测，不能把本文坐标直接复制成客户端常量。

## Gate 结论

- `G2`：`完成`；选定图、08/09、SPEC 和安全区/短屏决策一致；
- `G3`：`用户已选定视觉稿`；
- `G4`：`asset-manifest 候选已建立 / 待联合审阅和预算决策`；
- `G5`：`未开始`；
- `Gate A`：`未关闭`。

`asset-manifest.json` 候选已建立。下一步是联合审阅其 clean plate、动态件、
三层 flex 场景、遮挡补绘、透明画布、pivot、九宫格与状态变体，并决定目标设备/纹理预算；G4、G5 与 Gate A
全部通过前不得创建 XML 候选、导入或发布正式 `UndergroundIdle / UndergroundIdleMain`。
