# 原始输入

`RawInputRouter` 在业务 router 前固定 pointer 起点的 HUD / 世界归属。`RawInputPort.subscribe(owner, subscriber)`
是 gameplay 的消费面，经 `GameplayPresentationHost.rawInput` 注入；Cocos 世界页由基类
`subscribeRawInput(context, subscriber)` 接同一实例。事件含 Cocos pointer ID 与 `getUILocation()` 设计坐标，
wheel 独立按当前命中分流。`dispatchInput` 仍是意图入口，不承担命中判断。

一个活动世界订阅，替换时先清理旧指针、取消旧 subscriber 并移除 abort 监听；旧释放函数不能恢复或移除新 owner。
订阅必须绑定 signal / isActive，过期拒订阅；模态、hide、页面关闭和根重建都清空手势。
取消不检查 owner 是否仍有效，保证本地 router / joystick / boost 总能复位；正常派发须通过 owner 双守卫。
宿主在关闭业务输入通道前执行取消，让停止意图完成。释放幂等，不缓存事件到下一世代。

`FguiRawInput` 仅在存在 overlay 时由 FguiView 按当前 GRoot 安装。使用锁定 FairyGUI 1.2.2 的实例处理器、
`updateInfo` 相机坐标命中与 `_touches` 捕获记录，保存原描述符、按 onEnable/onDisable 绑定规则替换并恢复。
临时命中查询还原复用槽，取消清掉 downTargets / monitors 和 click 状态。未修改 vendor。
所有私有面仅在这个适配器内，升级 FairyGUI 需重跑真实双 WebGL 证据。
`CocosRawInput` 归 AppRuntime 生命周期所有，在 UI 适配器未捕获时作为全局后备，防止同一事件派发两次。

引擎对照：Creator 3.8.8 `cc.d.ts:33005`（EventMouse）、`:33215`（EventTouch）、`:33321`（可空 ID）、
`:34125`（Input 的事件名映射）；FairyGUI `runtime/fairygui.mjs:6448–6742`。
无头断言在 `raw-input.test.ts`、`viewLifecycle.test.ts`、`appRuntime.test.ts`，真实输入脚本见
[creator-preview](../../../../../tools/creator-preview/README.md#sc1-b9-原始输入验收)。
