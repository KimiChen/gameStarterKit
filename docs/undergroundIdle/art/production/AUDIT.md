# Underground Idle 工程美术验收清单与待执行记录

> 计划范围：主界面 Bitmap-first 批次与 ART-01～ART-09 的黄金位图、PNG 语义资产、
> `asset-manifest.json`、重组/diff 证据和运行约束<br>
> 当前状态：G2～G5 均未开始；ART-01～ART-09 尚未执行正式生产审计

## 1. 当前 Gate 状态

| Gate | 状态 | 关闭前必须完成 | 证据位置 |
| --- | --- | --- | --- |
| G2 布局与几何裁定 | 未开始 | 几何决策、安全区、固定区、热区、极值文本和 08/09 同步完成 | 待填写 |
| G3 黄金 target / 视觉锁定 | 未开始 | 无字 target、高分辨率源、哈希、生成/编辑记录和人工签字齐全 | 待填写 |
| G4 生产拆分 | 未开始 | `asset-manifest.json` 的来源、mode、mask、Alpha、pivot、九宫格、状态、哈希和批准状态闭合 | 待填写 |
| G5 运行资产 | 未开始 | runtime PNG、composite、diff/allow-mask、自动报告和人工 A/B 全部通过 | 待填写 |

当前下一步是 G2。未关闭上一个 Gate 时不得把下一个 Gate 的候选标记为 accepted，也不得导入 FairyGUI 正式包。

## 2. ART 批次状态

| 包 | 计划验收内容 | 状态 | 证据位置 |
| --- | --- | --- | --- |
| ART-01 | 同画布运行层的尺寸、Alpha、来源、逻辑 750×1624 composite 与联系表 | To generate | 待填写 |
| ART-02 | 8 个 512×512 模块的 bbox、pivot 和至少 32px 安全边距 | To generate | 待填写 |
| ART-03 | 12 个建筑阶段、7 个通用状态、7 个首屏独立状态件及统一 pivot | To generate | 待填写 |
| ART-04 | 四头像、四场景 rig、计划拆件、来源哈希和角色 pivot | To generate | 待填写 |
| ART-05 | 三地点、路线、节点、锁、雾及引用闭包 | To generate | 待填写 |
| ART-06 | 11 个九宫格的尺寸、insets、透明边和无字约束 | To generate | 待填写 |
| ART-07 | 19 枚图标的安全边、64px 可辨性和无字约束 | To generate | 待填写 |
| ART-08 | C/B/A/S 四框、徽章、深层徽记和归队剪影 | To generate | 待填写 |
| ART-09 | 5 个单纹理、3 组四帧 atlas、帧边界和混合方式 | To generate | 待填写 |

状态只能在实际生成并附证据后依次更新为 `To audit`、`Needs revision` 或 `Accepted`。不得仅因文件名存在、脚本
可运行、哈希稳定或提示词已登记而更新为 `Accepted`。

## 3. 待执行：来源、完整性与格式

- [ ] 盘点计划文件与实际候选文件，记录缺失、多余和重复项；
- [ ] 锁定批准的无字黄金位图尺寸与 SHA-256；审稿文字版只作视觉参考，不得作为切图源；
- [ ] 检查所有候选 PNG 的尺寸、sRGB、RGBA/预期不透明口径与四角 Alpha；
- [ ] 检查 `asset-manifest.json` 可解析，源哈希、`mode`、source rect、mask/修复来源、pivot、九宫格、
  frame rect、运行尺寸与输出路径引用闭合；
- [ ] 只允许 `copy`、`regionCrop`、`inpaintCrop`、`alphaObject`、`fullCanvas`、`nineSlice`、`tile`、
  `generatedVariant`；直接 `regionCrop` 必须证明对象完整、无遮挡且无背景污染；
- [ ] 对补绘/inpaint 或局部 ImageGen 修复登记输入图、prompt/处理记录、修复 mask、输出哈希和允许变化区域；
- [ ] 对机械复制或确定性导出的文件执行 SHA-256/逐像素比对，并把结果写入证据记录；
- [ ] 将 `_raw_`、mask、repair、contact sheet、review、annotation、composite/diff 与 runtime PNG 分开登记；
- [ ] 检查 runtime PNG、manifest 和重组脚本只读取批准 PNG、mask/repair 与声明配置，不依赖 SVG 生产中间层。

预期范围可按 ART-01～09 README 的目标清单计算；实际计数必须在审计当天重新扫描，不得复用预估数量。

## 4. 待执行：透明边缘与 atlas

- [ ] 建筑和角色透明边缘没有浅色中性 halo、棋盘格或背景残留；
- [ ] 同组建筑保持固定画布、底部落点和 pivot，Stage 03 顶部/底座不裁切；
- [ ] atlas 每个 frame 的边界保持透明，frame rect、顺序、时长和 pivot 与 manifest 一致；
- [ ] `gold_sweep` 等需要裁切的纹理保留各包规范要求的透明边；
- [ ] 记录任何中 Alpha 离散像素并在目标运行尺寸下判断是否阻断，不能预先标记为非阻断。

## 5. 待执行：语义与视觉

- [ ] 所有运行资产无烘焙中文、数字、等级、价格、百分比、伪文字、水印或整页 UI；
- [ ] 使用 manifest 登记的 runtime PNG 确定性重组 750×1624 逻辑页面，并锁定重组图哈希；高分辨率作者源
  另按登记比例回归；
- [ ] 并排检查黄金图、重组图、差异图和修复 mask；声明 mask 外不得存在未解释差异，mask 内不得出现接缝、
  背景残留、光向冲突、材质降级、比例漂移或高低细节混杂；
- [ ] 四角色身份、服装、工具和轮廓与选定参考一致，手部和道具连接合理；
- [ ] 建筑三阶段只增加附件、灯光和轮廓复杂度，不改变建筑身份与交互占位；
- [ ] UI 面板、按钮、护角、铆钉、内阴影和图标与黄金位图使用同一材质与细节密度，禁止以低细节重绘替代；
- [ ] 图标在 64px 下可凭轮廓区分，不能只依赖颜色；
- [ ] 状态、锁定、领取和结果等级在关闭程序动效后仍能被理解；
- [ ] 联系表中的文字、网格和审稿标记不进入生产切图。

## 6. 待执行：FairyGUI 与 Creator

- [ ] 只向 FairyGUI Editor 导入 manifest 批准的 runtime PNG，不导入黄金整页、source-only mask/repair、
  review/diff、生产配置或运行时文字样例；
- [ ] FairyGUI `UndergroundIdle / UndergroundIdleMain`、750×1624 页面、文本槽、九宫格、pivot、Controller、Gear、Relation、热区和命名契约完成装配；
- [ ] XML、`package.xml` 和内部 ID 由 FairyGUI Editor 保存；`.bin` 和 atlas 由 Editor 正式发布，外部脚本不写入或伪造；
- [ ] Editor 完整重载后无资源丢失、ID 断链、gear/page 错配或未知组件；
- [ ] 发布到 `apps/Cocos/assets/resources/ui/` 后重新检查 `.bin`、图集和 manifest；
- [ ] 仅通过 Cocos Dashboard 启动 Creator，检查导入、`.meta`、控制台和 750×1624 预览；
- [ ] 覆盖长数字、满仓、锁定、离岗、断线和结果未知状态；
- [ ] 完成三秒信息扫描、角色身份与整体材质一致性的人工视觉签字。

## 7. 执行记录模板

| 日期 | 包 | 候选版本 | 执行人 | 自动检查 | 人工结论 | 阻断项 | 证据链接 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 待填写 | G2～G5 / ART-01～09 | 待填写 | 待填写 | Not run | Pending | 待填写 | 待填写 |

验收时只检查各包 README/manifest 指定的候选生产文件；不得把 `_raw_`、mask/repair、contact sheet、review、
审稿标注、整页黄金图或运行时文字示例计入运行交付。所有结论必须以当次生成候选、当次重组/diff 和当次
Editor/Creator 证据为准。
