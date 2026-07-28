# gameStarterKit 官网

`gameStarterKit` 的单页产品官网，内容定位为微信小游戏工程脚手架，而不是仓库内实现 Demo 的游戏官网。

页面沿用 [Web Standard Kit](https://github.com/KimiChen/wheels/tree/main/web-standard-kit)
的基础标准：集中式设计令牌、浅色/深色主题、低优先级 `@layer wsk`、键盘可访问交互与
`prefers-reduced-motion` 降级。

## 本地开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm run build
npm test
```

站点源码位于 `app/`，部署配置位于 `.openai/hosting.json`。
