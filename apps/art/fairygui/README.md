# apps/art/fairygui — FairyGUI 编辑器工程（设计师主战场）

用 FairyGUI 编辑器打开本目录的 `FairyGUI.fairy`。改完后**导出本地资源**（编辑器菜单名为“发布”，
输出目标已配好：`.bin` + 图集落 `apps/Cocos/assets/resources/ui/`），再开一次 Creator 生成 `.meta`
并连同导出物一起提交。
这里的“发布”只表示生成 Cocos 本地开发资源，不表示渠道打包、商店发行或线上发布。代码侧约定与联调动线
见[客户端资源导出说明](../../../docs/CLIENT.md#6-设计分辨率与资源导出)。

## 铁律

- ⛔ **别改代码依赖的元素命名**（命名 = 契约，改了本地契约测试会失败）；需代码访问的新元素**必须带类型前缀**
  （`btn_`/`txt_`/`img_`/`ld_`/`ld3_`/`lst_`/`pg_`/`tge_`/`go_`/`jb_`，词表真源
  `tools/fgui-codegen/binding.ts`），无前缀 = 纯装饰、代码永远不碰。
- 设计分辨率 **750×1624 竖屏 + MatchWidth**（编辑器 Adaptation 已配好，与代码 `designSpec.ts`
  有机检比对）；Cocos `project.json` 尚未被这项测试读取，完整缺口见[根收口计划](../../../plan-v3.md)。
  ⛔ 新组件别照抄旧稿的 1136×640/750×1334 尺寸。

## 出图 checklist（每个组件导出前过一遍）

```
□ 需代码访问的元素都有类型前缀；纯装饰元素不带前缀（别留 n0/n1 这种要代码碰的无名节点）
□ 由代码重复填充的 lst_* 配置了 defaultItem，并按组件复用语义确认是否需要 autoClearItems
□ 全屏/贴边元素配了 relation（宽高随屏；高度差由 relation 吸收）
□ 九宫图在资源属性里标了 scale9grid；平铺图标 tile
□ 代码需要换图或动态加载的图放包内并标「导出」（不导出会导致加载失败）
□ 主状态控制器命名 view，page 名小驼峰英文；布尔控制器 page 用 true/false
□ 按钮自带的 button 控制器是保留名，别挪用（现存按钮四态/六态两种形态都合法）
□ loader 的 clearOnPublish 只给"代码负责装载"的占位图用——勾了它而代码不装载 = 运行时空白
```

结构契约测试保留 `displayList` 的命名直接子元素作为 AUTO 绑定真源，同时检查嵌套组件/list item 的
显式路径、relation/controller、`defaultItem` 和 `ui://` 资源引用。`npm run verify:fgui` 还会钉住设计源、
package 资源声明及 Cocos `.bin`/图集导出物哈希；设计源重新发布后先运行
`node scripts/fgui-manifest.mjs --write`。`autoClearItems` 等编辑器行为仍需在 FairyGUI 编辑器和
Creator 预览中人工确认。

## 当前包目录

- 基础包：`Common_Btn`、`Common_ComboBox`、`Common_Component`、`Common_RGBA`
- 动态资源样例：`Dynamic_Login`、`Dynamic_Spine`
- 文本资源：`L10n_zh_hans`
- 页面包：`View_AreaList_AreaList`、`View_AreaList_Login`、`View_AreaList_LoginNotice`、
  `View_Home_Home`、`View_SharedWidget_Confirm`

包名和组件名会进入 `fguiContracts.ts` 与 `viewRegistry.ts`，以当前 `assets/` 目录和契约登记为准，
不要沿用仓库中不存在的旧 `assets/Original` 路径。
