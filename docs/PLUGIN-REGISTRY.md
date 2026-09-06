# 插件分享平台 plugin.gono.games——设计提案

> 状态：**提案（2026-09-05 拍板，待实施）**。本文是 [docs/PLUGIN.md](PLUGIN.md) §5 包格式/安装动线之上的
> **分发层**设计：可信同事（公司内部）把 `plugin -- pack` 出的 zip 发布到内网注册表，宿主用网页下载或命令行拉取，
> 像 apt / npm 那样按 id 与版本管理。⛔ 不登记进 plan-v5（用户决定）；实施状态只在本文 §7 回写。
>
> 设计前先做了一轮对抗审阅（两名审阅者从代码找机制余留问题、两名对着草案挑毛病），§1 是合并后的余留问题清单，
> §2 起是按审阅修订后的设计。已拍板的决定（2026-09-05）：
>
> | 决定项 | 结论 |
> | --- | --- |
> | 身份源 | WebPlatform SSO，登录方式 github.com（GitHub OAuth） |
> | 服务形态 | **自建**最小服务（⛔ 不借 Gitea / GitLab 的 package registry） |
> | 包的归属 | 「首发者拥有 id」，所有者以 GitHub 登录得到的 `username` / `id` 记录 |
> | 框架 API 门面 | `plugin-api/` + `PLUGIN_API_VERSION` + 导入边界机检**与注册表同期做** |
> | 兼容声明 | 索引里能声明「需要框架 ≥ X」（§4.3） |
> | 前置修复 | §1 的七条按 3 → 4 → 1 → 2 → 5 → 9 → 11 的顺序先修完（§7 回写） |

## 0. 定性

- **构建期分发**：注册表只搬运 `pack` 的产物；`install` 落盘后仍走既有 codegen、review、提交。不属 PLUGIN.md §10
  禁止的「运行时远程代码下载」。
- **制品目录即真相，索引只是派生物**：任何元数据（发布者、时间、下架、校验结果、所有者）都以制品旁的 sidecar 文件
  承载，`index.json` 随时可从制品目录重建（§3.1）。
- **内容身份 = `sha256(files.lock 规范文本)`**（`renderFilesLock(entries)` 的输出；pack 产物里的 `files.lock` 字节
  正是它）。宿主可离线从已安装锁复算，⛔ 不依赖 zip 字节（zip 字节取决于 zlib 版本）。zip 的 sha256 只管下载完整性。
- **威胁模型**沿用 PLUGIN.md §5.1「作者可信、包不可信」，并把「作者可信」落成可验证的东西：包绑定到 GitHub 身份
  （发布者记录 + 所有权 + 可选签名），⛔ 仍不承诺沙箱。

## 1. 插件机制余留问题（对抗审阅合并稿，2026-09-05）

按「多插件、多作者」场景排序；每条的 file:line 依据见审阅记录（本节只留结论）。**上注册表前必须先修的七条**加粗。

**A. 会把工作树搞坏的**

1. **postinstall 失败无回滚，树卡死。** 顺序是写文件 → 写锁 → git add → codegen；跨插件冲突（route id、entryId、
   View 名、域 contractVersion 未 bump）只在 codegen 里才报。失败后文件已暂存、锁已是新版、生成物还是旧的，
   `install` / `uninstall` 都因「受影响路径不干净」拒绝。PLUGIN.md §5.4「任何失败都发生在落盘之前」只对校验成立。
2. **升级包若删除域 / View / gameplay，postinstall 必败。** uninstall 会算 `--allow-delete` 集合，install 的
   postinstall 从不传。
3. **`--reinstall-from-tree` 可以吞并框架文件。** 审阅者用 scratch 副本实测：在 plugin.json 的 domains 里加上一个
   框架域并 bump，dry-run 报 `added 7`，guild 域的服务端实现、descriptor、向量全部被「adopted」进插件锁；之后
   `uninstall` 会按锁删掉框架功能。根因是 reinstall 路径把「从树上采集到的文件」自身当作 owned；`check` 也不比对
   domains 漂移。
4. **扁平目录按裸 `startsWith(id)` 归属。** `tally` 与 `tallyBoard` 不能共存；id 为 `red` 就拥有 `redis-route.test.ts`。
   install 只读本 id 的锁，check 不做锁间两两不交。

**B. 多作者协作缺的账本**

5. **锁不记录来源。** 分不清「同血统升级」「宿主 reinstall 后的本地分叉」「同 id 的另一个包」：上游更高版本会静默
   覆盖宿主改动。
6. 两人在各自分支装不同插件后的合并没有文档和机检（registry.generated.ts、指纹、FGUI manifest 都是单文件聚合体）。
7. 协议整数 bump 的人工决策没有机器痕迹（E4 的邻居）。

**C. 兼容与信任**

8. 插件对框架 API 没有兼容轴也没有导入边界（redeem 直接 import `core/infra/*`，tally import `GameMode`、
   `GameRoomState`）；typecheck 是唯一的闸而 install 不跑它。→ §4.3 与注册表同期做。
9. **`requires.*SchemaVersion` 事实上 fail-open**：可省略、不进已安装锁、check 不复核、比对基准是硬编码常量；
   tally 的 kinds 含 gameplay 却没钉 gameplaySchemaVersion。
10. 包完整性是自证的（files.lock 在 zip 里），包内测试在宿主 CI 里执行。→ 注册表的 sha256 / 发布者 / 签名（§3）。

**D. 资源与 `.meta`**

11. **随包 `.meta` 的 uuid 没有任何闸**：pack/install 只查文件存在；撞车后 sync-client 与插件锁给出互相矛盾的修法。
12. FGUI 包与 resources 从未被真实插件或 fixture 覆盖，allowlist 比 fgui-manifest 的产物定义窄。

**E. 小项**：`install --dry-run` 仍要求树干净；postinstall 对整棵 `apps/*/src` 做 `git add -A`；uninstall 的
`--no-postinstall` 残留与「卸载 → 提交 → 重装」无提示；nextSteps 三处不准；atomicWrite 的 `.tmp-<pid>` 落在插件
目录内；~~zip 未查「文件与其子路径并存」~~（✅ 读包阶段拒绝）和 NFC/NFD 同名未查。

## 2. 制品布局（静态目录；https 与 `file://` 同一形态）

```text
<registry>/
  index.json                                   全量索引（派生物，§3.1）
  packages/<id>/owners.json                    所有者（GitHub username + id 列表；首发者写入）
  packages/<id>/metadata.json                  单包详情（派生物：版本列表、latest、README 渲染源）
  packages/<id>/<version>/<id>-<version>.zip   pack 产物本体，一经落定不可变
  packages/<id>/<version>/publish.json         发布 sidecar（§2.1）
  packages/<id>/<version>/yank.json            下架 sidecar（存在即下架；who / when / reason）
  packages/<id>/<version>/<id>-<version>.zip.sig   可选签名（§3.3）
```

### 2.1 `publish.json`（每个版本的真相）

```json
{
  "id": "redeem", "version": "1.0.4",
  "publisher": { "login": "alice", "githubId": 12345 },
  "publishedAt": "2026-09-05T08:00:00Z",
  "zipSha256": "…", "filesLockSha256": "…", "zipBytes": 123456,
  "manifest": { "schemaVersion": 2, "kinds": ["client"], "constantName": null, "domains": ["redeem"], "fguiPackages": [],
                "requires": { "pluginApiVersion": 3 }, "description": "…" },
  "validatedAgainst": [
    { "at": "2026-09-05T08:00:01Z", "frameworkCommit": "75a64d3", "protectedPathsSha256": "…",
      "pluginApiVersion": 3, "result": "ok" }
  ],
  "signature": null
}
```

- `manifest` 是包内 `plugin.json`（v2：身份 + 客户端登记）经 `parsePluginManifest` 归一化后的身份摘要：`kinds` / `constantName`
  是派生值（PLUGIN.md §5.3），`requires` 只剩将来的 `pluginApiVersion`；⛔ 不接受任何表单字段。
- `validatedAgainst` 是**追加式数组**：框架 `main` 每次前进，CI 对所有未下架版本复验并追加一条（§3.2）。
- 索引字段一律由 `publish.json` / `owners.json` / `yank.json` 派生。

### 2.2 不可变与幂等

- `(id, version)` 一经落定永不改写：制品以 `open(…, "wx")` 语义落盘，重名即 409。
- 同 `(id, version)` 且 `filesLockSha256` 相同的重传 → 200 幂等返回既有记录（PUT 超时重试可判定）；不同 → 409
  「同版本不同内容」，与宿主 `install` 的规则同一口径。
- 只能 `yank`（下架标记，需 owner 权限，写 sidecar），⛔ 不删除；被下架版本仍可按精确版本下载；`latest` 在派生时
  按「semver 最大且未下架」重算。支持 `unyank`，同样审计。
- id 按大小写归一去重（与 PLUGIN.md §8 codegen 同口径）；`registry` 列为保留 id。

## 3. 服务（自建，最小）

一个 Node 进程 + nginx 静态托管制品目录：

| 面 | 职责 |
| --- | --- |
| 静态 | `index.json`（`Cache-Control: no-cache` + ETag）与 `packages/**`（`immutable, max-age=1y`）由 nginx 直接托管；内网公开读 |
| 上传 API | `PUT /api/packages`（multipart zip）：鉴权 → 体积上限（64 MB，与 `MAX_ENTRY_BYTES` 同量级）写临时文件 → 子进程校验（§3.2）→ 所有权检查 → `wx` 落盘 → 写 `publish.json` → 派生索引 |
| 管理 API | `POST /api/packages/<id>/<version>/yank|unyank`、`PUT /api/packages/<id>/owners`（owner 才能改；转让/增员写审计日志） |
| 鉴权 | WebPlatform SSO（GitHub OAuth）一次交换后，由注册表签发**自己的**短期、限范围 token（`publish`、`yank`、`owners`）；⛔ 不复用 WebPlatform 会话 accessToken（否则注册表要持有 Internal 密钥，且泄漏的 token 同时是可登录游戏的会话） |
| 索引写 | 单写者（进程内队列 + `index.lock`），每次从制品目录重新派生后 tmp + rename 整体替换；`registry rebuild-index` 可离线重建；CI 定期「重建 ⟷ 线上」deepEqual |
| 网页 | 列表（id / latest / kinds / 描述 / 发布者 / 时间）、单包页（README 取自 latest 未下架版本 zip 内 `apps/plugins/<id>/README.md`，Markdown 渲染禁原生 HTML + sanitizer + CSP；相对链接改写到框架仓在 `validatedAgainst` 最新 commit 的浏览 URL；版本历史、文件清单、sha256、一条安装命令） |
| 备份 | 备份对象就是 `packages/` 树（sidecar 在内）；索引可重建 |

### 3.1 索引（派生物）

`index.json`：`{ generatedAt, registry: { url, pluginApiVersion: <注册表校验检出的值> }, packages: [{ id, owners, latest,
versions: [{ version, zipSha256, filesLockSha256, zipBytes, kinds, constantName, domains, fguiPackages, requires,
publishedAt, publisher, yanked, validatedAgainst: <最新一条> }] }] }`。

### 3.2 发布侧校验（不跑包内代码）

复用仓内 `apps/server/tools/plugin` 作为库，新增**纯函数**子命令 `plugin -- validate <zip>`：

1. `readPackage`（清单自证）→ `validatePackage(pkg, root)`（身份交叉、allowlist、镜像/.meta 自洽，含 §1-11 的 uuid 闸）；
2. 目录级 `ownershipConflicts(root, rules, owned = pkg.files.keys())`（从 install.ts 导出）；
3. `requires` 与检出的 schemaVersion / `PLUGIN_API_VERSION` 比对（§4.3）；
4. ⛔ 不读 `scripts/plugins/<id>.lock` 做版本闸、不跑 git、不跑 postinstall——原草案用 `install --dry-run` 是错的：
   校验检出上已装 redeem@1.0.3，任何补丁线或同版本都会被当成降级拒掉。

校验在**固定 commit** 的一次性 worktree 里、子进程内跑（`--max-old-space-size`、超时、并发 1）；结果连同
`frameworkCommit`、`protected-paths.json` 的 sha256、`PLUGIN_API_VERSION` 写进 `validatedAgainst`。框架 `main` 前进时
CI 对所有未下架版本重跑一遍并追加。CLI 安装时比较本地检出与索引里最新通过的 commit，不匹配只警告，以本地
`validate` 为准。

### 3.3 完整性与签名

- 索引里的 `zipSha256` 是 CLI 下载校验的口径，`filesLockSha256` 是 `outdated` / 分叉判定的口径。
- 签名 v0 不强制，但位置从第一天定下：制品旁 `<zip>.sig`（`ssh-keygen -Y sign`，命名空间 `gono-plugin`），
  `publish.json.signature = { signer: <GitHub login>, keyFingerprint }`；allowed_signers 由 GitHub 账号登记的 SSH 公钥导出
  （`https://github.com/<login>.keys`）。先做「有签名就校验」，owners 落地后再改为强制。

## 4. 宿主侧（CLI 与锁）

### 4.1 命令（都挂在既有 `npm --workspace @game/server run plugin --`）

| 命令 | 语义 |
| --- | --- |
| `install --from-registry <id>[@version] [--registry <url>] [--replace-local-fork] …` | 模式开关沿用 `--reinstall-from-tree` 先例；⛔ 不复用 `<zip\|dir>` 位置参数（实测 `install redeem` 会解析成 `apps/server/redeem` 目录）；`@` 不在 id 字符集，按最后一个 `@` 切分无歧义；其余 flag 原样透传 |
| `fetch <id>[@version] \| --all [--registry <url>]` | 只下载不改仓：内容寻址缓存 `<home>/cache/blobs/<sha256>.zip`，索引按注册表 origin 分目录缓存；每次使用缓存都重新校验 sha256；下载先写 tmp 再 rename |
| `outdated [--registry <url>]` | 离线比对 `sha256(renderFilesLock(lock.entries))` 与索引 `filesLockSha256`；按锁头 `source` 三分类：`registry` / `local-fork` / `unknown-source`；已安装版本被下架时显式输出原因 |
| `publish <id> [--dry-run]` | 先 `check` 绿、插件推导集路径 git 干净，再 pack 到临时目录 → `validate` → PUT；返回 `(id, version, zipSha256, filesLockSha256)`。上传既有 zip 走网页 |
| `search [关键字]` / `info <id>` | 读索引 |
| `validate <zip>` | §3.2 的纯函数校验，注册表与作者本地共用 |
| `--registry <url>` / `PLUGIN_REGISTRY_URL` | 接受 https 与 `file://<dir>`（目录内 `index.json` + `packages/**`）；`file://` 同时是离线镜像与测试接缝（`plugin-tool.test.ts` 用临时目录当注册表）；注册表 URL 先做 CLI 常量 + 覆盖，⛔ 不落仓内 `plugins/registry.json` |
| `--home <dir>` / `PLUGIN_HOME` | 缓存与 token 目录（缺省 `~/.gono/plugins`，`config.json` 0600；token 只从该文件或 `GONO_PLUGIN_TOKEN` 读，⛔ 不回显） |

镜像 = 注册表目录布局的字节拷贝；`fetch --all` 写出该布局；`mirror verify` 逐项复算 sha256。

### 4.2 已安装锁的 `source` 抬头（§1-5 的修法，随前置修复落地）

`scripts/plugins/<id>.lock` 新增一行 `# source <json>`（`parseEntries` 本就跳过 `#` 行，旧读者向后兼容）：

```text
# source {"kind":"package","filesLockSha256":"…","registry":{"url":"https://plugin.gono.games","version":"1.0.4","zipSha256":"…","publisher":"alice"}}
# source {"kind":"tree","filesLockSha256":"…","forkedFrom":{"kind":"package",…}}
```

- 每个 writer 显式决定：`install <zip|dir>` 写 `package`（无 `registry` 子对象）；`install --from-registry` 写 `package` +
  `registry`；`--reinstall-from-tree` 写 `tree` 并把上一把锁的 `source` 放进 `forkedFrom`（树 ≡ 锁的幂等 no-op 保留原 source）。
- **分叉后的升级语义**：锁 `source.kind === "tree"` 时，普通 `install` 对「内容不同」的包一律拒绝并列出将被覆盖/删除的
  分叉文件，显式 `--replace-local-fork` 才放行（仍走三方比对与删除面 allowlist）。⛔ 不引入 `-local.N` 版本后缀
  （schema 与 `compareVersions` 都不认，且 gameplay/plugin 侧对 version 形态的假设未审）。
- `check` 保持离线，不校验 source 可达性；`outdated` 才用它。

### 4.3 框架 API 门面与「需要框架 ≥ X」（与注册表同期做）

- 三处门面：`apps/shared/src/plugin-api/index.ts`、`apps/server/src/plugin-api/index.ts`、`apps/client/src/plugin-api/index.ts`
  只 re-export 批准的表面（defineRpc / kPluginUser / kPluginShared / 受限 Redis 访问器 / GameMode 契约类型 /
  RoomClient、joinGameRoom / CocosView / PluginModule 类型 …）。
- `apps/shared/src/plugin-api/version.ts` 导出两个整数：`PLUGIN_API_VERSION`（门面任何变化都 +1，含纯追加）与
  `PLUGIN_API_MIN_SUPPORTED`（破坏性变化时抬高）。
- 插件 `plugin.json.requires.pluginApiVersion` = 构建时依赖的门面版本。兼容判定（install / check / `validate` / 索引）：
  `PLUGIN_API_MIN_SUPPORTED ≤ requires.pluginApiVersion ≤ PLUGIN_API_VERSION`。「需要框架 ≥ X」= 索引里
  `requires.pluginApiVersion = X`，宿主 `PLUGIN_API_VERSION < X` 即拒绝。
- 导入边界机检：新增 `apps/server/test/plugin-import-boundary.test.ts`，按 `scripts/plugins/*.lock` + `deriveOwnership`
  枚举插件文件，AST 解析 import 说明符，只允许三处门面、`@game/shared` 的 plugin-api、插件自身推导集内的相对路径；
  `core/infra/**`、`rooms/core/**`、`app/**`、`GameMode.ts`、`dispatcher.ts` 直接 import 即红。
  `GameModeRegistry.register` 的 `replace` 选项对生成 catalog 之外的调用方关闭。
- `install` 在 postinstall 末尾跑 `typecheck`（服务端 + 客户端）或提供 `--verify` 并在 nextSteps 明示，让
  「装得上但编不过」在安装当场暴露。
- 现有两个插件（redeem / tally）迁到门面后各 bump 一次、`--reinstall-from-tree`。

## 5. 明确不做（v0）

插件间依赖解析（插件只依赖框架）；付费 / 评分 / 评论；沙箱；公网开放；运行时热更新（PLUGIN.md §10）。

## 6. 分期

| 期 | 内容 |
| --- | --- |
| 前置 | §1 的 3 → 4 → 1 → 2 → 5 → 9 → 11（§7 回写） |
| v0 | 静态目录布局 + `validate` + `install --from-registry` / `fetch` / `outdated` + `file://` 测试接缝 + 最小上传接口（SSO 换 token、`wx` 落盘、`publish.json`、索引派生） |
| v1 | owners / yank / unyank、`main` 前进复验 CI、网页、plugin-api 门面 + `PLUGIN_API_VERSION` + 导入边界 + `requires.pluginApiVersion` |
| v2 | 签名强制、镜像 `mirror verify`、`plugin -- test [<id>]`（插件测试与宿主 CI 分 job） |

## 7. 实施状态（只在此回写）

| 项 | 状态 |
| --- | --- |
| §1-3 reinstall-from-tree 吞并框架文件 | ✅ 2026-09-05：身份变化闸（`--allow-identity-change`）+ git 跟踪闸（`--adopt-tracked`）+ `check` 身份漂移比对；钉：`plugin-tool.test.ts`「§1-3」用例（git fixture 重放 guild 场景） |
| §1-4 裸前缀所有权 / 锁间两两不交 | ✅ 2026-09-05：测试前缀改为 `<id>-*` / `<id>.*`（`matchesPrefixRule` 三处共用），pack/install/check 引入「其它已安装锁」（重叠即拒绝/点名），`registry` 保留 id；redeem 1.0.4 / tally 1.0.3 随之改名客户端测试并 `--reinstall-from-tree --adopt-tracked` 重钉；钉：「§1-4」用例（chamber 与 chamberBoard 共存） |
| §1-1 postinstall 失败回滚 | ✅ 2026-09-05：落盘日志 + 索引同步 + 生成物「本次新变脏」回退（用户 WIP 留下）；卸载后未提交的暂存删除视为干净；`InstallOptions.runner` 测试接缝；钉：「§1-1」两用例（无 git / git） |
| §1-2 升级删除面传 `--allow-delete` | ✅ 2026-09-05：`allowDeleteFor`（与 uninstall 同口径）、kinds 并集跑 codegen、`SYNC_FORCE=1`、报告/CLI/dry-run 打印删除面；钉：「§1-2」用例 + `allowDeleteFor` 单元 |
| §1-5 锁 `source` 抬头与分叉语义 | ✅ 2026-09-05：`LockSource`（package / tree + forkedFrom + 预留 registry 子对象）、`filesLockSha256Of`、`install --replace-local-fork`、`check` 显示来源；旧锁 = unknown（redeem / tally 在 §1-9 重钉时补上）；钉：「§1-5」用例 |
| §1-9 `requires` 必填、进锁、check 复核 | ✅ 2026-09-05（同日晚随 plugin.json v2 合并再收敛：`requires.*SchemaVersion` 整个去掉，兼容轴 = plugin.json 自身 `schemaVersion` const + gameplay manifest `schemaVersion` 读时比对；派生 kinds / constantName 进锁抬头）。原实施：schema `requires` 必填 + kind 相关轴必填，`CURRENT_*` 读自两个 schema 文件的 const，锁抬头登记 requires，`check` 复核两侧并点名旧锁；tally 补 `gameplaySchemaVersion`（1.0.4），redeem no-op 重写补齐锁抬头（两把锁同时得到 `# source`）；钉：manifest 用例 + 「§1-9」用例 |
| 目录形态阶段 1（PLUGIN.md §5.5）：插件目录搬到 `apps/plugins/<id>/`，plugin.json / README / gameplay 单源收进插件目录 | ✅ 2026-09-05：两个 codegen 各加第二个发现根（`apps/plugins/<id>/plugin.json`、`apps/plugins/<id>/gameplay/`），所有权规则只剩一条插件目录规则；redeem / tally 各 bump 1.0.5 并 `--reinstall-from-tree --adopt-tracked` 重钉；阶段 2 / 3 的取舍写在 §5.5 |
| §1-11 `.meta` uuid 闸 | ✅ 2026-09-05：`tools/plugin/meta.ts`（正则与 sync-client 逐字相等由测试钉住）、validatePackage 的形状/importer/包内唯一闸、install/reinstall 的宿主 uuid 撞车闸（落盘前拒绝）；fixture `.meta` 改为按路径派生的真 uuid；钉：「§1-11」用例 |
| feature → plugin 正名 + plugin.json v2（2026-09-05 晚，用户拍板）| ✅：登记单元并入 plugin.json（一个插件一个文件），宿主自有单元搬进 `apps/plugins/`（无 version = 不可打包/不进锁），`features/` 目录、`feature.json`、`FeatureHost`、`codegen:features`、`ft:` 前缀全部改名，`EXTRAS.md` → `EXTRAS.md`；`feature` 一词留给日常语义与地基层（kit，另开设计） |
| 对抗验证（三名审阅者实跑绕过） | ✅ 2026-09-05 晚：击穿 9 处全部收口——回滚精确到操作前（字节 + 索引快照，用户 WIP 逐字回来）、落盘阶段同套回滚、`git status -z`、暂存删除豁免限 HEAD 本插件锁、大小写改名不丢文件、包内「文件与子路径并存」拒绝、reinstall 不替作者删磁盘文件 + View 删除面从旧锁推出 + 共享命名空间吸收点名、分叉不可被同内容包洗白 + 旧锁 fail-closed + `check` 复核 source 形状/内容身份/id 大小写、requires ⟷ 随包 schemaVersion 交叉核对、孤儿 `.meta` 拒绝、宿主 `.meta` 不可解析即拒绝装、同路径 uuid 变化报告；未击穿：§1-3 git 跟踪闸、§1-4 前缀边界 / 锁间不交、§1-2 install 路径、§1-9 requires 形态。余留（记录，未做）：`--no-git` 与未跟踪文件的吸收仍是「全部吸收」（已点名 review）；subMetas 内 uuid 不在闸内（Creator 是否采信待验证）；NFC/NFD 同名未查 |
| v0 / v1 / v2 | 未开始 |
