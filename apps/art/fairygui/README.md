# apps/art/fairygui — FairyGUI 编辑器工程（设计师主战场）

用 FairyGUI 编辑器打开本目录的 `FairyGUI.fairy`。改完**发布**（发布目标已配好：
`.bin` + 图集落 `apps/Cocos/assets/resources/ui/`），发布后开一次 Creator 生成 `.meta` 连产物一起提交。
代码侧约定与联调动线见 [docs/CLIENT.md §6](../../docs/CLIENT.md)。

## 铁律

- ⛔ **XML 只在 FairyGUI 编辑器里改**——任何人不得手工编辑 XML 文本（会破坏编辑器内部 id 一致性，
  坏法隐蔽且无法机检）。本仓一切"改结构"的要求都指编辑器内操作。
- ⛔ **别改代码依赖的元素命名**（命名 = 契约，改了 CI 契约测红）；需代码访问的新元素**必须带类型前缀**
  （`btn_`/`txt_`/`img_`/`ld_`/`ld3_`/`lst_`/`pg_`/`tge_`/`go_`/`jb_`，词表真源
  `tools/fgui-codegen/binding.ts`），无前缀 = 纯装饰、代码永远不碰。
- 设计分辨率 **750×1624 竖屏 + MatchWidth**（编辑器 Adaptation 已配好，与代码 `designSpec.ts`
  有机检比对）；⛔ 新组件别照抄旧稿的 1136×640/750×1334 尺寸。

## 出图 checklist（每个组件发布前过一遍）

```
□ 需代码访问的元素都有类型前缀；纯装饰元素不带前缀（别留 n0/n1 这种要代码碰的无名节点）
□ 每个 lst_* 列表设置了 defaultItem，且 autoClearItems="true"
□ 全屏/贴边元素配了 relation（宽高随屏；高度差由 relation 吸收）
□ 九宫图在资源属性里标了 scale9grid；平铺图标 tile
□ 运行时要代码换图/动态加载的图放包内并标「导出」（不导出 → 发布被裁 → 运行时加载失败）
□ 主状态控制器命名 view，page 名小驼峰英文；布尔控制器 page 用 true/false
□ 按钮自带的 button 控制器是保留名，别挪用（现存按钮四态/六态两种形态都合法）
□ loader 的 clearOnPublish 只给"代码负责装载"的占位图用——勾了它而代码不装载 = 运行时空白
```

## 常用公共组件（assets/Original）

- `CommonSpine` —— 需要动态生成 spine 时，实例化这个预制体
- `CommonEmptyButton` —— 只需要点击响应、没有对应按钮外观时用
- `CommonCompEmpty` —— 空节点：需要动态生成到 view 上的组件，先放一个空节点做容器
- `BtnBackgroundClose60` —— 全屏黑色遮罩按钮，点击自动关闭当前界面
- `assets/Original/icons` —— 图标从这里找
- `assets/Original/bgs` —— 背景从这里找，都是九宫格可拉伸的
