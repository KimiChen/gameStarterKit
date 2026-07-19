# core/ —— 平台与基建桥（日常不动）

平台差异一律收敛到本目录；业务层 ⛔ 禁写 `if (platform === ...)` 判断。

- `http.ts`：XHR 请求底座 + token 存取（业务调用面在 net/）
- `wechat-compat.ts`：微信兼容补丁集（⚠ import 顺序敏感——必须先于 Colyseus SDK 首次使用执行，
  Main.ts 里保持最前；只加补丁不删）
- 将来第二发行平台出现时：`platform.ts`（平台探测/分发）、`huawei-compat.ts`、`webview.ts` 等都进这里
