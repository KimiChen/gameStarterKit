# UniFlex 界面实现

按切图像素实现 UniFlex 页（不是 FairyGUI）时读本文。运行时 / kit / 迁移边界见 [UNIFLEX.md](UNIFLEX.md)，作者态与 PSD 闸见 [CLIENT.md](CLIENT.md#2-源码与工程壳)。

Web 预览：`npm run dev:uniflex-web` → `http://127.0.0.1:8001/`。已有 `8001` 就复用，不要另开。

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
| `apps/client/src/ui-uniflex/pages/<Page>/*.tsx` | `apps/Cocos/assets/src/`（`sync:client` 镜像，禁手改；新文件 `.meta` 除外） |
| `apps/client/src/ui-uniflex/components/` | `apps/client/src/ui-uniflex/generated/`（禁手改、不入库） |
| `apps/client/resources/ui/<Package>/` | `*Restored` 页、`RestoredPreviewHome`（PSD 回写线，见 §6） |
| 预览登记（§5） | server / shared / protocol（除非用户明确要接） |

相对 import 不带扩展名。这是纯客户端展示页：点击用 `onAction` / `onBack` / `onSelectTab` 打日志即可。

已有原稿页不要重做，除非用户点名改：`Alliance`（主页/成员/设置）、`AllianceAnnounce`、`AllianceCreate`、`AllianceJoin`、`AllianceMemberSettings`、`AllianceWar`、`AllianceTerritory`。

## 2. 页面骨架

1. `pages/<Page>/<Page>.tsx`：`defineView`。联盟全屏常见 `750×1624`，背包/设置常见 `750×1334`，以切图高度为准。全屏 `zIndex: 'screen'`，弹窗 `zIndex: 'window'`。
2. `pages/<Page>/<Page>Panel.tsx`：真正排版。可被别的页 overlay（如 Alliance 里 `visible={territoryOpen}` 打开领地）。
3. 页签 / 列表 / 卡片拆成同目录组件，不要把多个页签画在同一个巨大 JSX 里。
4. 后声明的兄弟节点在上层：页签画在内容面板之后。可点元素必须 `interaction="press"`（不要只挂在 `<image>` 上）。

```tsx
import { defineView, defineComponent, useState, useMemo, useRef, useEffect, VirtualList } from '@uniflex/compiler';
import { fontRef, imageRef, ArrayVirtualListDataSource } from '../../../kits/uniflex/api/core/index';
```

## 3. 布局与视觉

- 全屏壳：`position: 'absolute'` + 源图像素坐标。
- 列表 item：根用 `position: 'relative'`，内部控件相对卡片左上，不要用整页 canvas 坐标。
- flex 值用 UniFlex 驼峰：`flexStart`、`flexWrap: 'wrap'`，不要 `flex-start`。
- 九宫格：manifest `nineSlice: [left, top, right, bottom]`（原图像素）+ JSX `sizeMode: 'sliced'`，缺一不可。
- 联盟正文常见 `#3F3254`，次文 `#837A91`，标题白字 + `outlineColor: '#593D84'`。
- 没有富文本。长文尽量一个 `<text wrap>`；局部变色只能叠字。
- 底图高度以源图为准。不要发明「跟着内容收缩的底图」，除非用户明确要且源图如此。领地要塞 list-bg 是固定 `719×776 @ 15,544`。

先搜再造，组件在 `apps/client/src/ui-uniflex/components/`：

| 用途 | 组件 |
|---|---|
| 黄确定 / 绿取消 / 青前往 | `ConfirmButton` / `CancelButton` / `CyanButton` |
| 页签 | `PanelTab`；邮件/背包/联盟主页省略 `kind`；领地旗帜 `kind="flag"` |
| 弹窗 | `PopupBackground` / `PopupFrame` / `CloseButton` |
| 勾选 | `CheckBox` |
| 数量加减 / 滑条 | `QuantityControl` |
| 道具格 | `ItemSlot` |
| 全屏标题栏 | `ScreenHeader` |
| 底栏 / 红点 | `MainNav` / `NotificationBadge` |

按钮不要抄错皮：领地「驻防」和要塞「前往」不是同一张图；对照 assembled 量尺寸。

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
| 原稿（默认 `/`、`?ui=preview-home`） | `PreviewHome` | 手写页：`Alliance`、`AllianceTerritory`… |
| 还原（`?ui=restored-home`） | `RestoredPreviewHome` | PSD 回写的 `*Restored`。`applyTarget` 钉 `restored`，不覆盖原稿 |

新页 id 例如 `alliance-foo`，必须同时改：

1. `pages/<Page>/<Page>.tsx` 的 `defineView` 导出名 = 组件名
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

新 TSX 同步到 Cocos 后，给**新文件**补 `.meta`（uuid 小写 `8-4-4-4-12`，不要撞现有）。不要提交 `sync:client` 扫出来的无 `.meta` 的 `*Restored/` 镜像。

浏览器里点：页签、列表滚动、折叠、返回、从首页再进一次。截图不够。

## 8. 对照顺序

1. 读切图参数 + assembled，记下壳 / 页签 / 列表 / 按钮的 x,y,w,h
2. 登记或复用资源
3. 先壳（底图、header、tab 轨、content-bg、底栏返回），再页签组件，再 VL
4. 和 assembled 逐项对：间距、重叠、tab 选中、按钮大小、item 边距、list 底图
5. §5 接入预览 → build / sync / typecheck → 从首页点通 → 提交（不 push，除非用户明确说）

## 9. 参考

- 全屏壳 + 三页签 + VL：`apps/client/src/ui-uniflex/pages/AllianceTerritory/`
- 折叠 flatten VL：`pages/Alliance/AllianceMembersPanel.tsx`
- 弹窗 + 通用按钮：`pages/AllianceAnnounce/`、`pages/AllianceCreate/`
- CheckBox：`pages/AllianceMemberSettings/`
- 预览路由：`pages/PreviewHome/PreviewHome.tsx`、`apps/web-ui-preview/main.ts`、`screens.json`
- 资源：`apps/client/resources/ui/Alliance/manifest.json`
- kit：`apps/kits/uniflex/README.md`
