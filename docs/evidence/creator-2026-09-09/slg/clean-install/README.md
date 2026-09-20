# SLG 阶段 1 / 2a 干净安装验收

结果：最终制品在无 SLG 的临时宿主安装成功；按安装锁枚举 4 个测试文件，35/35 通过、0 失败、0 跳过。独立空 MySQL 库首次应用 SLG 两个迁移（4 + 3 条建表语句），重复 bootstrap 新应用 0、跳过全部 3 个 kit 迁移（含 arena）。

## 隔离与制品

- 临时宿主：`/private/var/folders/2g/50wg6pj54vs5yp9dvfk8kxm80000gn/T/slg-install-nr0uixbc`；临时库：`game_slgacc_ae91691eabb9`，运行结束已删除，清理退出码 0。
- 主树仅作为只读来源；未改主树源码、manifest 或 Git。宿主自有 `apps/kits/slg/kit.json` 仍无 `version`。
- 仅临时分发 manifest 添加 `version: 0.1.0`，以满足现有打包契约；这不是给正式宿主引入版本字段或宣布发布。
- 制品：`/tmp/slg-acceptance.zip`，64 个自有文件，SHA-256 `6ba80c57b51a612fc0cae6d2ba3a779b5ad81f0f1ba84bab0ab25bd3d33f7775`。
- 最后补入了根代理更新的静态地形镜像逐字节断言。逐文件比对确认：除上述临时 manifest 版本外，所有实现、资源和测试字节与主树一致。根代理在打包后仅给主树 README 补入临时分发版本/包测试说明，该文档追加未包含在本次已验收制品中；结构化报告明确记录这一项差异。
- 独立运行 `npm ci`，没有复用/软链主树 `node_modules`。`@game/shared` 实际解析到 `/private/var/folders/2g/50wg6pj54vs5yp9dvfk8kxm80000gn/T/slg-install-nr0uixbc/apps/shared`。运行时 `v26.5.0`。

## 执行步骤

1. 更新临时源码快照，排除 `.git`、`node_modules`、Creator 缓存和构建目录，临时 manifest 补分发版本；用临时 CLI 重新 `pack slg`。
2. 按制品 `files.lock` 删除临时宿主的 64 个 SLG 自有文件与空目录；临时 `git init/add/commit`。运行官方 `codegen:plugins -- --allow-delete slg --allow-delete SlgMap` 与 `sync:shared`，收缩生成物为无 SLG 宿主，再提交临时基线。
3. `plugin -- install /tmp/slg-acceptance.zip --no-git`，保留 postinstall，真实执行 codegen + shared/client 同步；结果 `written 64, unchanged 0, deleted 0`。
4. `plugin -- check`：包括 slg 在内的 6 个已安装包全部一致。
5. 初轮在既有本地库运行 bootstrap/包测试/重复 bootstrap；随后为首次建表验收创建此前不存在的独立 `PROJECT_ID`/MySQL 库，重复 bootstrap → 包测试 → bootstrap。
6. 最后更新 shared 测试后，重新 pack；恢复旧包字节以通过完整性检查，使用正式 `uninstall slg --no-git` 清走旧制品，再正式安装最终制品。最终制品重跑独立空库完整验证。
7. `plugin -- test slg --int` 按锁运行客户端 10、服务端领域 11、真实 SQL/Redis 集成 9、共享契约/地形 5 个测试，全部通过。SQL 测试在独立库内仍通过原子 INSERT 预留唯一测试区，并清理所有测试账号与区数据。

## 最终机器证据

| 证据 | 路径 | 结果 |
| --- | --- | --- |
| 重新打包 | [pack-final](pack-final.txt) | 64 files，slg@0.1.0 |
| 正式卸载旧制品 | [uninstall-old](uninstall-old.txt) | 删除 64 自有文件，保留 SQL 数据 |
| 最终干净安装 | [artifact-final](artifact-final.txt) | 安装退出码 0，postinstall 执行成功 |
| 包完整性 | [check-final](check-final.txt) | 6 个包一致 |
| 独立空库首次迁移 | [fresh-bootstrap](fresh-bootstrap.txt) | 新应用 3 个 kit 迁移文件，SLG 7 张表 |
| 最终包测试 | [fresh-package-tests](fresh-package-tests.txt) | 35/35，通过且无跳过 |
| 重复迁移 | [fresh-bootstrap-repeat](fresh-bootstrap-repeat.txt) | 新应用 0，跳过 3 |
| 结构化结果 | [结构化报告](report.json) | SHA、解析路径、步骤退出码、清理状态 |

此次验收覆盖可安装性、真实首次迁移和包自带测试；主树 `verify:all` 与 Creator 实证见[总验收记录](../README.md)。
