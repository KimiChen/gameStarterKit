# Underground Idle UE PSD 批次 v01

本目录对应 `docs/undergroundIdle/11-ue-flow-and-wireframes.md` 的 UE-01～UE-11。
交付是在旧规范下生成的 **`sourceOnlyFromTarget` 美术/UE 审阅源**。按当前
[`docs/psd.md`](../../../psd.md) 的输入成熟度，它映射为 `referenceCompositeOnly`：只能作为整页视觉参考和 PSD
封装证据，不是 `artistEditableSource`、FairyGUI 设计源、G5 accepted 运行资产或 Creator 运行证据。

这里的失败仅指 G4/G5 元素级可编辑性与生产成熟度，不表示这些整页效果图在 G3 审美上失败。后续重建必须保持已批准
target 的 UI chrome、材质、边框、按钮、图标、装饰与角色质量；如需提升，先生成新的 G3 target，并重新完成审美批准与
hash 记录。不得把“不能作为生产 base”误读为“效果图不应有美术 UI”，也不得用程序素框替代原有视觉语言。

`40-production/SHA256SUMS` 覆盖的 sidecar 和 evidence 保留生成时的历史枚举值，不原地改写；本 README 负责记录
新规范下的能力映射。若后续重建元素级 PSD，必须建立新批次和新证据，不能覆盖本批历史文件。

## 可编辑性审计

这 11 份 PSD 的可见 ImageGen 内容仍以 `750×1624` 的完整 baked base 保存；除运行时文字预览外，按钮、面板、
图标、角色、建筑、状态件和光效没有形成逐项独立源。隐藏 `00_REFERENCE_TARGET` 还是所选 baked base 的重复像素，
UE-08 另含一张完整画布状态图。因此这些文件不能支持美术对上述元素独立移动、隐藏、替换或调色。

不得通过在完整 base 上再叠加可见裁片冒充拆层：base 中的旧元素会形成残影，被遮挡像素也没有恢复。升级路线固定为：

```text
整页 target（隐藏参考）
  → decomposition-spec 元素清单
  → 不含可调前景的背景 clean plate
  → 按 stableKey 逐元素生成、重绘和 Alpha/遮挡修整
  → 独立叶层重组 artistEditableSource PSD + source-reference-excluded composite
  → solo/消融/Photoshop 人工编辑验收
  → 逐 leaf 来源/许可/生产属性批准 → productionFromAcceptedAssets
  → G5 运行 PNG/质量检查 + runtime-reference-excluded composite/人工 A/B
  → FairyGUI Editor
```

共用壳层、资源条、底栏、面板、按钮和通用图标应先建立共享组件母版，由页面装配复用；各状态只保存局部 delta，
不得再为每个状态生成整页位图。

## 交付内容

- `40-production/psd/`：11 份 750×1624、RGB 8-bit 的 `referenceCompositeOnly` PSD；有审稿分组和独立文字预览，
  但没有完成可见 ImageGen 基底的元素级拆分。
- `40-production/source/`：12 份 ImageGen/批准 target 源；UE-08 有“远征中”和“待领取”两张同页状态源。
- `40-production/staging/composite/`：每份 PSD 的默认 sibling preview，以及隐藏状态的审阅 preview。
- `40-production/prompts/`：本批次最终 ImageGen 提示词与输入角色。
- `40-production/evidence/`：页面/状态索引、PSD 结构往返、像素对账与工具状态。
- `40-production/{delivery-spec.json,asset-manifest.json,assembly-recipe.json}`：本批次待人工审阅的 sidecar 草案。

## PSD 层级

```text
99_README__SOURCE_ONLY__DO_NOT_IMPORT_TO_FAIRYGUI
90_REVIEW_ONLY__SAFEAREA_AND_CONTRACT_GUIDES        # 默认隐藏
80_RUNTIME_TEXT__TYPE_DESCRIBED__FGUI_TEXT_AT_RUNTIME
  ├─ GLOBAL::shell
  └─ STATE::<stateKey>                              # 非默认状态隐藏
70_UI_COMPONENT__IMAGEGEN_FULL_CANVAS_SOURCE_ONLY
10_BG_UNDERLAY
00_REFERENCE_TARGET__HIDDEN_PIXEL_BASELINE          # 默认隐藏
```

ImageGen 底图不含运行时中文、数字、价格、等级或倒计时；审稿文案由项目字体
`SourceHanSansCN-Regular` 生成独立栅格预览，并同时写入 PSD Type 描述。尚未经过目标 Photoshop
打开—保存—关闭—重开，因此文字层状态只能称 `type-described`。

## 状态覆盖

| UE | 默认状态 | 同 PSD 隐藏状态 |
| --- | --- | --- |
| UE-01 | 共用壳层 | — |
| UE-02 | 初始矿场 | 仓库已满 |
| UE-03 | 正常升级 | 矿石不足、满级 |
| UE-04 | 四名矿工 | — |
| UE-05 | 调岗草案 | 岗位未变化 |
| UE-06 | 空远征槽 | — |
| UE-07 | 合法编队 | 能力不足 |
| UE-08 | 远征中 | 已归队/待领取（独立 full-canvas 状态层） |
| UE-09 | B 级未领取 | 已领取 |
| UE-10 | 正常离线收益 | 10 小时 + 满仓/上限 |
| UE-11 | ResultUnknown | LoadingSnapshot、Mutating、Reconnecting、StateConflict、DataLost/Corrupt |

## 已完成验证

- 11/11 文件由 `file` 识别为 `Adobe Photoshop Image, 750 x 1624, RGB, 3x 8-bit channels`。
- `ag-psd@31.0.2` 写入后立即同版本只读往返，画布、组、节点和 Type 描述均可解析。
- ImageMagick 7.1.2 将每个 `PSD[0]` 与 sibling preview 对账，11/11 均为 `AE=0`。
- 无 Photoshop/FairyGUI Editor/Creator 实机往返；`editorImportAllowed=false`，G4/G5/G6/G8 均未关闭。

## 批次内复建

`40-production/tools/` 是一次性批次脚本，不是仓库通用 `ui:psd:*` 能力。依赖应安装到工作区外临时目录：

```bash
deps_dir=$(mktemp -d)
npm install --prefix "$deps_dir" --no-audit --no-fund ag-psd@31.0.2 pngjs@7.0.0
work_dir=$(mktemp -d)
python3 40-production/tools/build_source_layers.py --work-dir "$work_dir"
UG_PSD_NODE_MODULES="$deps_dir/node_modules" node 40-production/tools/write-psd.cjs \
  "$work_dir/build-manifest.json" 40-production/psd 40-production/evidence/psd-build-report.json
```

批次未执行 Git 提交、拉取或推送。
