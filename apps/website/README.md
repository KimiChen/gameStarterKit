# gameStarterKit 说明站点

`gameStarterKit` 的单页说明站点，用于介绍开发期游戏工程骨架，而不是某个具体 Demo 的游戏官网。

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

站点源码位于 `app/`；本文件只记录本地开发与验证方式。
