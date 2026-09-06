# Excel 配置表输入目录

本目录保存 `items.xlsx` 示例和输入约定，`tools/excel-to-json.mjs` 展示把 xlsx 转成服务端/客户端
两份 JSON 的通用解析方式。它当前是
[额外功能中的配表参考](../../docs/EXTRAS.md#38-配表负载与-unity-实验)：默认输出作为生成物
新鲜度基线入库，但没有正式运行时消费者，不能描述成游戏已经直接读取的配置链。

## 命令

```bash
npm install                                    # xlsx 已在根 package.json / lock 中声明
npm run config:excel-to-json                   # 示例导表：写服务端 + 客户端 JSON
npm run config:excel-to-json:check             # 校验源表并逐字节比较双端入库 JSON，不写文件
node tools/excel-to-json.mjs --input=<目录>    # 覆盖输入目录（默认本目录）
node tools/excel-to-json.mjs --assets-root=<目录>   # 开启 icon 资源存在性校验（缺省跳过）
```

其余参数：`--output=<文件>` 覆盖服务端输出、`--client-output=<文件>` 覆盖客户端输出、
`--no-client-output` 跳过客户端输出。

找不到任何 xlsx 时（包括 `--check` 模式）脚本会**明确报错并 exit 1**，不会静默成功。
Excel 打开表格时产生的 `~$xxx.xlsx` 锁文件会被忽略。
`--check` 会在内存中构造与写入命令完全相同的规范 JSON，并逐字节比较服务端输出；未传
`--no-client-output` 时也比较客户端输出。任一输出缺失或陈旧都会明确失败并提示重新生成，检查过程不会
写入或修复文件。`--output` / `--client-output` 覆盖后的路径同样参与比较。

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

## 入库生成物（当前未接入运行时）

| 输出 | 路径 | 内容 |
| --- | --- | --- |
| 服务端权威配置 | `apps/server/data/items.config.json` | 全量字段（含 `price` 等结算依据） |
| 客户端展示配置 | `apps/Cocos/assets/resources/config/items.json` | 裁掉仅服务端字段（示例中裁 `price`）；展示值不得作为结算依据 |

两份 JSON 均带 `schemaVersion`（供采用方做兼容判断）与 `sourceFiles`（来源溯源）；
导表成功后终端打印各表行数 summary。源数据校验失败会在写文件前退出；当前写入不是跨文件事务，I/O
异常时仍可能只写出其中一份。

客户端裁掉 `price` 只演示“客户端展示数据不能成为结算权威”的分层方式，并不提供防篡改保证；实际项目
接入前仍需实现消费方、引用校验和服务端权威校验。

## 接入真实玩法表

1. 在 `tools/excel-to-json.mjs` 的 `sourceFiles` 里登记新表文件名；
2. 参照 `buildItems` 写自己的 `buildXxx`（逐行解析 + `errors`/`warnings` 收集），
   复用 `numberValue` / `text` / `getField` / `parseDelimitedNumbers` / `parsePairs`；
3. 在 `run()` 里接上 `readRows`（声明必填字段）→ `assertUniqueIds` → `buildXxx` → 挂进输出 `data`；
4. 需要向客户端裁剪的字段在 `toClientData` 里处理。
