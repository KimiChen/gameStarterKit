# G2S HTTP Action 适配

- 放置内部 HTTP 触发 Action 所需的 G2S 兼容适配件。
- HTTP 回调不得直接执行 Bean 逻辑，必须通过 `MessageHelper.syncDoFunc` 进入 ServerTask。
