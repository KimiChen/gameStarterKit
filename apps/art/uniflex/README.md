# apps/art/uniflex — UniFlex 设计师 PSD

原稿功能页由 CLI 导出为分层 PSD，设计师改图、大小、位置和文字填色/描边/字号。导入按图层身份 overlay 回 UniFlex，不摊平组件结构。

当前 `catalog.json` 的 `applyTarget` 是 `restored`：PSD 改动写回 `*Restored` 页，不覆盖原稿。流程稳定后再切 `original`。

```text
原稿 UniFlex
  → npm run ui:art-export
  → <Page>/screen.psd
  → 设计师改 PSD
  → npm run ui:art-import / ui:art-sync
  → *Restored
```

| 命令 | 作用 |
|---|---|
| `npm run ui:art-export -- --screen backpack` | 从原稿导出这一页 |
| `npm run ui:art-export -- --all` | 导出缺 PSD 或原稿已变且 PSD 未改的页 |
| `npm run ui:art-import -- --screen backpack` | 该页 PSD overlay 到 Restored |
| `npm run ui:art-import -- --changed` | 只导 PSD 已改、尚未导入的页 |
| `npm run ui:art-sync` | 按「干净 PSD 则导出，脏 PSD 则导入」分流；两边都脏则失败 |
| `npm run ui:art-check` | 只读闸：PSD / 哈希 / Restored 是否新鲜 |

不要手改 `art.json`。不要把 PreviewHome 或 `*Restored` 自己再导出进这里。中间产物在 `.cache/psd/`，不入库。
导入字体共用 `apps/art/uniflex/fonts/`，不按页复制。

本机尚未装 Git LFS 时 `.psd` 按普通二进制入库；装上后执行
`git lfs install && git lfs track 'apps/art/uniflex/**/*.psd'` 再提交。
机器需要 Node 22、`uv`、Chrome，导出前先 `npm run build:uniflex-ui`。

CI 契约（本仓暂无 workflow 外壳，runner 后挂）：path 命中 `apps/art/uniflex/**` 或原稿 UniFlex 页时跑 `build:uniflex-ui` → `ui:art-sync` → `ui:art-check`。一阶段工作树只允许脏 `*Restored` 与 `apps/art/uniflex/**`；原稿页被改红。没有 bot-commit：本地 sync 后再推。`verify:all` 不跑导出。
