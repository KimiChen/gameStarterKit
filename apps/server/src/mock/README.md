# mock/ —— 常驻假数据接口（供客户端无栈调试）

- `api/<接口>.ts` = 一个 mock 端点：default 导出 `defineMock({ method, path, handler })`，
  `index.ts` 启动扫描自动挂载（建文件即生效）；`data.ts` = 内存假数据（重启即失）
- 路径必须带 mock 前缀（启动断言），与真实接口天然隔离
- **生命周期**：真实实现落地后⛔不删除——在对应文件头标记
  `⚠ 已替换 → <真实实现路径>（日期）`；差异只允许是「假数据」，不允许是「假协议」
  （req/res 类型必须 import shared 契约，漂移由 typecheck 兜住）
