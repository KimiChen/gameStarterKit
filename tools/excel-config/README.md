# Excel 配置表输入目录

策划维护的 xlsx 配置表放在本目录（`tools/excel-config/*.xlsx`），由
`tools/excel-to-json.mjs` 转换为游戏可直接读取的 JSON（工具收编自 Arthur
项目的导表通用核，玩法表已替换为示例道具表）。

## 命令

```bash
npm i -D xlsx@^0.18.5                          # 首次使用先装依赖（根 package.json）
node tools/excel-to-json.mjs                   # 导表：双写服务端 + 客户端 JSON
node tools/excel-to-json.mjs --check           # 只校验不写文件；出错 exit 1，可直接进 CI
node tools/excel-to-json.mjs --input=<目录>    # 覆盖输入目录（默认本目录）
node tools/excel-to-json.mjs --assets-root=<目录>   # 开启 icon 资源存在性校验（缺省跳过）
```

其余参数：`--output=<文件>` 覆盖服务端输出、`--client-output=<文件>` 覆盖客户端输出、
`--no-client-output` 跳过客户端输出。

找不到任何 xlsx 时（包括 `--check` 模式）脚本会**明确报错并 exit 1**，不会静默成功。
Excel 打开表格时产生的 `~$xxx.xlsx` 锁文件会被忽略。

## 三行表头约定（每张表通用）

每张表只读**首个 sheet**，前三行是表头，数据从**第 4 行**开始：

| 行号 | 内容 | 说明 |
| --- | --- | --- |
| 1 | 字段名 | 脚本按这一行索引数据列（必须与下方字段定义一致） |
| 2 | 字段类型 | 仅供策划参考，脚本不读（实际校验由脚本内各字段解析器执行） |
| 3 | 中文说明 | 仅供策划参考，脚本不读 |
| 4+ | 数据 | 全空行自动跳过；报错信息里的行号就是 Excel 的真实行号 |

## 示例表：items.xlsx（道具表）

文件名固定 `items.xlsx`（在脚本的 `sourceFiles` 映射中登记）。字段定义：

| 字段名 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| id | number | 道具 ID，整数且全表唯一 | `1001` |
| name | string | 道具名称，不能为空 | `回血药水` |
| desc | string | 道具描述，可空 | `使用后恢复少量生命` |
| icon | string | 图标路径（曾用名 `pic`，旧表可用但会警告）；缺省只归一化斜杠，传 `--assets-root` 才校验文件存在 | `icons/potion_hp.png` |
| price | number | 售价，整数且 ≥ 0；**服务端权威字段，客户端输出会裁掉** | `100` |
| tags | 数字列表 | 下划线分隔：`a_b_c` | `1_3` |
| reward | 复合列表 | `id&数值` 用下划线串联：`id&value_id&value` | `2001&10_2002&1` |

Excel 中前四行看起来像这样：

| id | name | desc | icon | price | tags | reward |
| --- | --- | --- | --- | --- | --- | --- |
| number | string | string | string | number | numberList | pairList |
| 道具ID | 道具名称 | 道具描述 | 图标路径 | 售价 | 标签列表 | 使用奖励 |
| 1001 | 回血药水 | 使用后恢复少量生命 | icons/potion_hp.png | 100 | 1_3 | 2001&10 |

## 输出（双输出语义）

| 输出 | 路径 | 内容 |
| --- | --- | --- |
| 服务端权威配置 | `apps/server/data/items.config.json` | 全量字段（含 `price` 等结算依据） |
| 客户端展示配置 | `apps/client/assets/resources/config/items.json` | 裁掉服务端敏感字段（示例中裁 `price`），防抓包改包、避免展示值被误当结算值 |

两份 JSON 均带 `schemaVersion`（运行时兼容判断）与 `sourceFiles`（来源溯源）；
导表成功后终端打印各表行数 summary。**只要有任何错误，两份文件都不会写入**。

## 接入真实玩法表

1. 在 `tools/excel-to-json.mjs` 的 `sourceFiles` 里登记新表文件名；
2. 参照 `buildItems` 写自己的 `buildXxx`（逐行解析 + `errors`/`warnings` 收集），
   复用 `numberValue` / `text` / `getField` / `parseDelimitedNumbers` / `parsePairs`；
3. 在 `run()` 里接上 `readRows`（声明必填字段）→ `assertUniqueIds` → `buildXxx` → 挂进输出 `data`；
4. 需要向客户端裁剪的字段在 `toClientData` 里处理。
