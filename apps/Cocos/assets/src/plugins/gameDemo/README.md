# gameDemo 客户端

`index.ts` 把宿主 `lobbyRpc`、`lobbyDataSync`、时钟与导航 ports 组装成 Runtime；`logic` 为纯 TS，`view` 只负责 Cocos 节点与事件。
页面通过 `.view.json` sidecar 与 `apps/plugins/gameDemo/plugin.json` 生成登记，不改 Main/net/ViewMgr。

界面复用宿主 ThemeClassic 的按钮、标题栏、页签、输入框和列表底图；通用提示直接走 Confirm 路由。资源通过生成的 resource-map 加载，固定数量的皮肤缓存持有独立 addRef，避免 UniFlex 弹框关闭时释放仍被页面使用的贴图。新宿主需构建内置 UniFlex 资源。

炼丹提交返回即已扣料、产丹并计分，2 秒只由 Logic 的本地动画时钟控制，数量不影响时长；动画结束不发送请求，刷新页面直接展示服务端已入账结果。空闲丹房不按秒重建按钮，避免中断触摸。

Boss 页订阅 `gameDemoBossRoom` 模块的 sync：版本比当前快照新时在下一帧刷新；战斗表现只消费服务端事件，首次快照建立序号基线，不用客户端定时扣血，也不逐快照销毁场景节点。

手机竖屏验收使用 Creator CLI 的 `web-mobile` 构建；`web-desktop` 默认 HTML 外壳固定宽度，缩小浏览器不能代表移动端适配。gameDemo 在宿主 tick 中检查所属 UI 层的尺寸，仅尺寸变化时重新布局并重建战斗表现，保留 Logic 状态。
