# gameStarterKit 原生说明站

`apps/website` 是 `gono / gameStarterKit` 的项目说明站。信息展示采用
[Web Standard Kit](https://github.com/KimiChen/wheels/tree/main/web-standard-kit)
与 [wheel.do](https://wheel.do) 的卡片网格语言：原生 HTML、集中式 CSS 令牌、
浅色/深色主题、点阵画布和轻量可访问交互。

产品源码只有三份文件：

- `index.html`：卡片网格与项目内容；
- `style.css`：`@layer wsk` 令牌、卡片变体与响应式布局；
- `script.js`：主题切换、锚点滚动、卡片按压反馈和复制命令。

站点不使用 React、Next、Vinext 或运行时 UI 框架。`scripts/build.mjs` 只把静态文件复制到
`dist/client`，并生成供 Sites/Cloudflare Worker 使用的最小 `dist/server/index.js`。

## 本地开发

```bash
npm run dev
```

默认打开 <http://127.0.0.1:3000>。如端口被占用，脚本会自动尝试下一个端口。

## 验证与导出

```bash
npm test
npm run lint
npm run build
npm run export:static -- /absolute/path/to/empty-output
```

静态导出目录包含 `index.html`、`style.css`、`script.js`、`og.png` 和 `_headers`，可直接作为域名
根路径的静态站点。`.openai/hosting.json` 只保留 Sites 项目标识，不属于页面内容。

## 服务器部署

`deploy.sh` 只同步页面的三份核心文件（`index.html`、`style.css`、`script.js`），目标为
`root@129.211.70.96:/www/wwwroot/gono.games/`，使用 `~/.ssh/id_rsa_nopassword`：

```bash
./deploy.sh
```

首次运行会把服务器主机 key 写入本机 `~/.ssh/known_hosts`；之后如果主机指纹发生变化，SSH 会继续拒绝连接，
不会静默跳过校验。
