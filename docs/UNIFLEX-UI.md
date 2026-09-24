# UniFlex 界面实现

按切图像素实现 UniFlex 页（不是 FairyGUI）时读本文。运行时 / kit / 迁移边界见 [UNIFLEX.md](UNIFLEX.md)，作者态与 PSD 闸见 [CLIENT.md](CLIENT.md#2-源码与工程壳)。

Web 预览：`npm run dev:uniflex-web` → `http://127.0.0.1:8001/`。已有 `8001` 就复用，不要另开。

目录使用可见卡片优先调度与共享资源缓存；离屏已完成卡片最多保留 12 张，回收后恢复默认状态。
加载效率对照、缓存生命周期与复测命令见 [预览加载验证](perf/uniflex-preview-loading.md)。

## 1. 何时读、写哪里

切图目录一般是：

```text
…/AI标准化/<模块>/L-…_切图/
  sprites/
  切图参数.json
  reference/*_assembled.png
```

以 **assembled 整图 + 切图参数的 x/y/w/h** 为验收真源，不要凭感觉排。

| 写 | 不写 |
|---|---|
| `apps/client/src/ui-uniflex/modules/<module>/<Page>/*.tsx` | `apps/Cocos/assets/src/`（`sync:client` 镜像，禁手改；新文件 `.meta` 除外） |
| `apps/client/src/ui-uniflex/components/`、`gamecomponents/` | `apps/client/src/ui-uniflex/generated/`（禁手改、不入库） |
| `apps/client/resources/ui/<Package>/` | `*Restored` 页、`RestoredPreviewHome`（PSD 回写线，见 §6） |
| 预览登记（§5） | server / shared / protocol（除非用户明确要接） |

相对 import 不带扩展名。这是纯客户端展示页：点击用 `onAction` / `onBack` / `onSelectTab` 打日志即可。

已有原稿页不要重做，除非用户点名改：`Alliance`（主页/成员/设置）、`AllianceAnnounce`、`AllianceCreate`、`AllianceJoin`、`AllianceMemberSettings`、`AllianceWar`、`AllianceTerritory`。

## 2. 页面骨架

1. `modules/<module>/<Page>/<Page>.tsx`：`defineView`。联盟全屏常见 `750×1624`，背包/设置常见 `750×1334`，以切图高度为准。全屏 `zIndex: 'screen'`，弹窗 `zIndex: 'window'`。
2. `modules/<module>/<Page>/<Page>Panel.tsx`：真正排版。可被别的页 overlay（如 Alliance 里 `visible={territoryOpen}` 打开领地）。
3. 页签 / 列表 / 卡片拆成同目录组件，不要把多个页签画在同一个巨大 JSX 里。
4. 后声明的兄弟节点在上层：页签画在内容面板之后。可点元素必须 `interaction="press"`（不要只挂在 `<image>` 上）。

```tsx
import { defineView, defineComponent, useState, useMemo, useRef, useEffect, VirtualList } from '@uniflex/compiler';
import { fontRef, imageRef, ArrayVirtualListDataSource } from '../../../../kits/uniflex/api/core/index';
```

## 3. 布局与视觉

- 全屏壳：`position: 'absolute'` + 源图像素坐标。
- 列表 item：根用 `position: 'relative'`，内部控件相对卡片左上，不要用整页 canvas 坐标。
- flex 值用 UniFlex 驼峰：`flexStart`、`flexWrap: 'wrap'`，不要 `flex-start`。
- 九宫格：manifest `nineSlice: [left, top, right, bottom]`（原图像素）+ JSX `sizeMode: 'sliced'`，缺一不可。
- 联盟正文常见 `#3F3254`，次文 `#837A91`，标题白字 + `outlineColor: '#593D84'`。
- 没有富文本。长文尽量一个 `<text wrap>`；局部变色只能叠字。
- 底图高度以源图为准。不要发明「跟着内容收缩的底图」，除非用户明确要且源图如此。领地要塞 list-bg 是固定 `719×776 @ 15,544`。

先搜再造，通用控件在 `apps/client/src/ui-uniflex/components/`，玩法控件在 `gamecomponents/`：

| 用途 | 组件 |
|---|---|
| 黄确定 / 绿取消 / 青前往 / 关闭 / 返回 | `ConfirmButton` / `CancelButton` / `CyanButton` / `CloseButton` / `BackButton` |
| 页签 | `TabBar` / `Tab` |
| 弹窗 | `PopupFrame` |
| 勾选 | `CheckBox` |
| 数量加减 / 滑条 | `QuantityControl` |
| 进度条 | `ProgressBar`（`progressBarSkins.ts` 提供英雄碎片、升星、联盟行军、联盟领地、战斗绿/红六种 skin） |
| 横向滚动公告 | `Marquee`（`text` + 视口尺寸；可设 `speed` / `gap` / `paused` / 精确 `textWidth`） |
| 倒计时 | `Countdown`：传 `target`（`Date`、Unix 毫秒、10/13 位时间戳字符串、ISO 日期时间，或本地 `YYYY-MM-DD HH:mm:ss` / `YYYY/MM/DD HH:mm:ss`）或 `durationSeconds`；`format` 可用 `D/DD` 天、`H/HH` 时、`m/mm` 分、`s/ss` 秒，如 `D天 HH:mm:ss`、`HH:mm:ss`、`mm:ss`、`D天HH时mm分ss秒`。无天位时小时累计，无小时位时分钟累计；到零后触发一次 `onComplete`。无时区日期字符串按本地时间解释 |
| 飘字 / 图标＋文本提示 | `FloatingHint` 播放单条；多条用 `FloatingHintQueue` 按触发时间起飘（同时触发时默认最少错开 120 ms，允许动画重叠），`onComplete` 从 `items` 移除已结束项。传 `idleText` 可在队列空闲时循环展示一条；目录示例按钮按实际点击时间入队 |
| 星级 | `StarRow` |
| 输入框 | `InputText` |
| 下拉框 | `Dropdown`（`dropdownSkins.ts` 提供皮肤） |
| 宽菜单 | `WideMenuButton` |
| 空态 | `EmptyState` |
| 资源条 | `ResourceCounter` |
| 道具格 | `ItemSlot` |
| 奖励道具 | `RewardItem` |
| 科技图标 | `TechIcon` |
| 全屏标题栏 | `ScreenHeader` |
| 全屏底栏 | `ScreenFooter` |
| 底栏 / 红点 | `MainNav` / `NotificationBadge` |

按钮不要抄错皮：领地「驻防」和要塞「前往」不是同一张图；对照 assembled 量尺寸。

`Dropdown` 用 `items`（唯一 `id`、`label`、可选图标与禁用状态）、`selected`、`onSelect`、
`skin` 和 `left/top` 配置。选中值由调用方持有，组件只管理展开状态；找不到选中项时显示
`placeholder`，空选项或 `disabled` 时不能展开。皮肤注入底图、箭头、字体和尺寸，
不把业务筛选规则写进组件。`HeroFilterBar` 只保留英雄选项与页面位置。
面板使用 `Floating` 定位并处理点外关闭，不依赖整页固定尺寸；超过 `maxVisibleItems`（默认 6）
的选项通过 `VirtualList` 滚动。图标 `icon` 的位置相对选项行，`triggerIcon` 可覆盖收起时的图标位置。
组件目录的「下拉框」示例展示带图标的五种英雄筛选选项，切换后收起框同步显示对应图标与文字。

`ScreenHeader` 提供可选内容插槽，内容用 `() => <view ... />` 作为子项传入（单个 JSX 根节点），
坐标相对标题栏左上角；图片与点击回调由调用页提供。示例见 `HeroScreen` 的招募按钮。
未传内容时保持原有标题栏用法。内部用 `ScopedSlot args={[]}` + 隐藏空节点兜底，
因为当前 UniFlex 的普通 `Slot` 要求调用方必须传入一个 JSX 子节点。

`ScreenFooter` 使用相同的可选插槽写法，保留底图、返回按钮和贴底定位，未传内容时无需改调用方。
底部页签、操作按钮、输入面板由页面通过 `() => <view ... />` 提供，示例见 `HeroDetail`、
`MailBattleReport`、`AllianceBoardPanel`。多项内容放进绝对定位、`width/height: '100%'` 的容器；
容器不加 `interaction="press"`，避免拦截返回按钮。插槽坐标相对底栏，页面绝对 `top` 要换算，
贴底元素的 `bottom` 可保留；不要让内容撑高底栏，`SCREEN_FOOTER_HEIGHT` 仍为经典皮肤的 110。

## 4. VirtualList

可滚动、重复行必须包 `VirtualList` + `ArrayVirtualListDataSource`。

- 定高：`itemSize={N}`。
- 变高（折叠头 + 卡片）：flatten 成一种 item，`sizeKey="height"`。参考 `AllianceMembersPanel`、`AllianceTerritoryFortPanel`。
- `useMemo` 建 source，`useEffect` 里 `source.dispose()`。
- **禁止 VL 套 VL**（含卡片里再 VL 道具）。少量道具绝对定位。嵌套 VL 首帧会空。
- 折叠行数由数据决定，不要写死「每个职级两个」。

## 5. 预览路由（少一项就点不开）

切图新页走 **原稿**，不要进还原首页。

两条预览线：

| 线 | 入口 | 页面 |
|---|---|---|
| 目录（默认 `/`） | Web 预览壳 | 侧栏里先是组件卡片，再是原稿界面。还原页不进目录。`?ui=preview-home` 仍是旧按钮首页，目录里不放 |
| 原稿（`?ui=preview-home`） | `PreviewHome` | 手写页：`Alliance`、`AllianceTerritory`… |
| 还原（`?ui=restored-home`） | `RestoredPreviewHome` | PSD 回写的 `*Restored`。`applyTarget` 钉 `restored`，不覆盖原稿 |

目录顶部主题旁的「还原预览」直接展示使用还原主题的设置界面，可在弹窗内点击体验。
当前只有设置界面具有独立的还原主题外观；弹窗固定使用该主题，不改变目录当前的主题选择。

新页 id 例如 `alliance-foo`，必须同时改：

1. `modules/<module>/<Page>/<Page>.tsx` 的 `defineView` 导出名 = 组件名
2. `PreviewHome.tsx`：union 增加 target + 两列里一颗按钮（首页已 `flexWrap` 两列）
3. `apps/web-ui-preview/screens.json`：id / aliases / canvas / componentName / rootName / source
4. `apps/web-ui-preview/main.ts`：generated import + `case`
5. `apps/client/src/ui-uniflex/preview.ts`：`createXxxPreview`
6. `UniFlexPreview.ts`：Cocos `?screen=` 分支（画布高度一并改）

PreviewHome 与还原预览首页不进 art catalog。从首页点入口验收，不要只开直链。

## 6. 资源

`apps/client/resources/ui/<Package>/assets/` + 同级 `manifest.json`（`version: 1`，`assets[]`）。

- id：`ui/alliance/flag-header`；代码 `imageRef('ui/alliance/flag-header')`
- 新图：复制 png → 量宽高 → `shasum -a 256` 写入 sha256
- 相同字节只登记一次
- 优先复用：`ui/hero/bond-bg`、`ui/mail/back`、`ui/mail/header`、`ui/button/confirm` / `cancel` / `cyan`、`ui/backpack/item-blue`
- 构建会校验 hash 和 nineSlice 不超过原图

## 7. AOT

`npm run build:uniflex-ui` 编译 TSX。违反下面任意一条，预览 `start()` 抛错后只剩黑底。

- 禁止 style getter；从 props 抽局部变量再放进 JSX（`const width = p.width`）。
- `useMemo` 回调保持简单。不要在 inline `useMemo(() => { let sum = 0; for (...) })` 里写 for——会编成 `Invalid compiler hook id`。
- 撤回一段 hooks 代码后必须重新 build，否则 generated 仍是旧的。
- 空白页：看容器里的「预览启动失败」或 console，先重建 AOT 再查布局。

```bash
npm run build:uniflex-ui
npm run sync:client
npm run typecheck:uniflex-ui
```

普通页面、组件、资源或预览登记改动，本地专项验收到这里再加受影响页面的浏览器交互检查即可。
改编译器、UniFlex kit、PSD 往返或预览基础设施时，才补对应的 `test:uniflex-ui-contract` 等专项测试；
改到 Cocos 运行时或资源导入时补 Creator 真实引擎预览。普通切图页不运行
`verify:core` / `verify:all`、清单/镜像/工具链矩阵或服务端测试；CI 的全量检查另行执行。

新 TSX 同步到 Cocos 后，给**新文件**补 `.meta`（uuid 小写 `8-4-4-4-12`，不要撞现有）。不要提交 `sync:client` 扫出来的无 `.meta` 的 `*Restored/` 镜像。

浏览器里点：页签、列表滚动、折叠、返回、从首页再进一次。截图不够。

## 8. 对照顺序

1. 读切图参数 + assembled，记下壳 / 页签 / 列表 / 按钮的 x,y,w,h
2. 登记或复用资源
3. 先壳（底图、header、tab 轨、content-bg、底栏返回），再页签组件，再 VL
4. 和 assembled 逐项对：间距、重叠、tab 选中、按钮大小、item 边距、list 底图
5. §5 接入预览 → build / sync / typecheck → 从首页点通 → 提交（不 push，除非用户明确说）

## 9. 参考

- 全屏壳 + 三页签 + VL：`apps/client/src/ui-uniflex/modules/alliance/AllianceTerritory/`
- 折叠 flatten VL：`modules/alliance/Alliance/AllianceMembersPanel.tsx`
- 弹窗 + 通用按钮：`modules/alliance/AllianceAnnounce/`、`modules/alliance/AllianceCreate/`
- CheckBox：`modules/alliance/AllianceMemberSettings/`
- 预览路由：`modules/preview/PreviewHome/PreviewHome.tsx`、`apps/web-ui-preview/main.ts`、`screens.json`
- 资源：`apps/client/resources/ui/Alliance/manifest.json`
- kit：`apps/kits/uniflex/README.md`
