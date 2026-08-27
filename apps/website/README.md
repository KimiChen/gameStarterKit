# gameStarterKit 说明站点

`gameStarterKit` 的单页说明站点，用于介绍开发期游戏工程骨架，而不是某个具体 Demo 的游戏官网。
它属于[额外功能与参考实现](../../docs/EXTRAFEATURES.md#31-项目说明站静态导出与托管适配)，
不构成核心框架能力或验收约束。

页面沿用 [Web Standard Kit](https://github.com/KimiChen/wheels/tree/main/web-standard-kit)
的基础标准：集中式设计令牌、浅色/深色主题、低优先级 `@layer wsk`、键盘可访问交互与
`prefers-reduced-motion` 降级。

## 本地开发

该目录不在根 npm workspaces 中，使用独立 `package-lock.json`，要求 Node.js `>=22.13.0`。命令需在
`apps/website` 内执行；根目录的 `npm install` 不会安装这里的依赖。

```bash
npm install
npm run dev
```

## 验证

```bash
npm test
npm run lint
```

`npm test` 已先执行 build，再运行 3 项 rendered-HTML 测试；无需为了同一轮验证预先重复执行
`npm run build`。站点源码位于 `app/`；本文件只记录本地开发与验证方式。

历史托管文档只保留为非核心索引，见 [DEPLOY.md](DEPLOY.md)；静态导出、适配代码、当前限制和非承诺
说明统一以 [EXTRAFEATURES](../../docs/EXTRAFEATURES.md#31-项目说明站静态导出与托管适配) 为准。
