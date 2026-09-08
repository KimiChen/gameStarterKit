/**
 * 矩阵测试套件共用的一次性检出夹具构建器。
 *
 * 四份矩阵套件（verify-inventory / sync-mirror / launcher / npm-reference）此前各自复制粘贴同一段
 * 「git ls-files → 逐文件复制出一次性检出」，排除清单也各自维护。这里收成一份，差异参数化。
 *
 * 临时根优先取 `path.dirname(REPO_ROOT)` 下的 `.tmp-fixture-*`（与仓同卷），该目录不可写时
 * 回退 `os.tmpdir()`。⛔ 临时目录不得放进仓内：那会进入 `git ls-files` 的扫描面，夹具会把自己
 * 递归进去。
 *
 * ⚠ 同卷的收益**不是**写时复制——别照着 clonefile 的思路再去优化它（2026-09-08 实测）：
 *   · Node 在 macOS 上根本不做 clonefile。libuv 只把 FICLONE 实现成 Linux 的 ioctl(FICLONE)，
 *     macOS 走普通 fcopyfile，`COPYFILE_FICLONE_FORCE` 在同卷/跨卷都返回 ENOSYS。
 *     同卷 512MB 判据：Node cpSync+FICLONE 掉 512MB 可用空间（全量复制），`/bin/cp -c` 掉 0MB（真克隆）。
 *   · 就算换成真克隆也不会更快：本仓夹具 2001 文件 / 82MB，`cp -Rc` 229ms vs Node 逐文件 187ms。
 *     文件平均 41KB，成本在元数据操作而非字节复制上。
 *   同卷仍然值得留着，但只是卷/设备差异：同卷 193ms vs 跨卷 245ms（约 21%）。
 *
 * 清理语义由调用方保留（各套件自己的 after/finally/exit hook），本模块只负责建。
 */
import { execFileSync } from "node:child_process";
import { constants, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * 与仓同卷的临时目录（`.tmp-fixture-<prefix><随机>` 落在仓的**旁**目录，不在仓内）；
 * 旁目录不可写时回退 os.tmpdir()。prefix 沿用 mkdtemp 约定，以 "-" 结尾。
 */
export function makeFixtureDir(prefix, repoRoot = REPO_ROOT) {
  try {
    return mkdtempSync(join(dirname(repoRoot), `.tmp-fixture-${prefix}`));
  } catch {
    return mkdtempSync(join(tmpdir(), prefix));
  }
}

/**
 * 把 git 可见的检出文件复制成一份一次性检出。包含未忽略的未跟踪文件（新 verifier/测试在首次
 * 提交前也必须可测）；被忽略的本地状态与凭据不进夹具。
 *
 * 排除清单的公共基线（四份套件一致）：`apps/website/`、`.env`、`.claude/`。
 * 唯一的有意差异由 `excludeEnvVariants` 参数化：默认 true 连 `.env.*` 一起排；
 * sync-mirror 传 false——已入库的 `.env.development` 必须进它的夹具（理由留在调用点注释）。
 *
 * `gitCommit: true` 时建完顺手 `git init + add -A + commit`：sync-client --check 用
 * `git ls-files` 判入库 `.meta`，非 git 目录会直接抛错而不是给出判定。
 */
export function buildCheckout({ prefix, excludeEnvVariants = true, gitCommit = false, repoRoot = REPO_ROOT }) {
  const root = makeFixtureDir(prefix, repoRoot);
  const checkoutFiles = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "buffer" },
  ).toString().split("\0").filter(Boolean);
  for (const file of checkoutFiles) {
    if (file === "apps/website" || file.startsWith("apps/website/")) continue;
    if (file === ".env" || (excludeEnvVariants && file.startsWith(".env."))) continue;
    // .claude/ 是 Claude Code 的会话目录（worktrees/ 里是别的检出副本），⛔ 不属于被测检出。
    if (file === ".claude" || file.startsWith(".claude/")) continue;
    const source = join(repoRoot, file);
    // A tracked deletion is still present in the index until commit; it is not
    // part of the checkout that the verifier must evaluate.
    if (!existsSync(source)) continue;
    // git ls-files 把嵌套 git 仓库/worktree 整体报成一个「目录」条目（末尾带 /）；
    // 按文件复制会 EISDIR 炸掉整个套件。这类条目从不属于被测检出。
    if (statSync(source).isDirectory()) continue;
    const destination = join(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
  if (gitCommit) {
    const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "matrix@example.invalid");
    git("config", "user.name", "sync matrix");
    git("add", "-A");
    git("commit", "-qm", "fixture");
  }
  return root;
}

/**
 * 从 pristine 检出复制一份**独占**副本：⛔ 用例对它的任何破坏都不会回流到 pristine。
 * 隔离性不依赖 clonefile——这台机器上它本就是全量复制（见文件头），全量复制反而更彻底。
 * `COPYFILE_FICLONE` 保留着只为在真支持 ioctl(FICLONE) 的平台（Linux + btrfs/XFS）上顺带受益；
 * 不支持时自动退化成普通复制，不会失败。
 */
export async function cloneCheckout(source, { prefix, repoRoot = REPO_ROOT }) {
  const root = makeFixtureDir(prefix, repoRoot);
  await cp(source, root, { recursive: true, mode: constants.COPYFILE_FICLONE });
  return root;
}

/**
 * 夹具清理。夹具根落在仓旁目录后进入了 Finder 的视野：Finder 会异步往目录里写 `.DS_Store`，
 * rm 的 readdir 与 rmdir 之间多出这个条目就是 ENOTEMPTY（本仓实测 2/115 用例中招）。
 * Node 的 rm/rmSync 对 ENOTEMPTY 在 maxRetries 内会重试，下一轮把新来的条目一并删掉。
 */
export async function removeFixture(root) {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

export function removeFixtureSync(root) {
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
