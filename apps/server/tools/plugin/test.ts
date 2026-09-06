/**
 * `plugin -- test <id>`（docs/KIT.md §6/§7）：按已安装锁枚举包自带的测试文件单跑——
 * 锁登记的 `apps/server/test/*.test.ts`、`apps/client/test/*.test.ts`（与根 test:client 同一跑法：cwd apps/server），
 * `--int` 再加 `apps/server/test/int/*.test.ts`（要本地 Redis/MySQL）。没有测试文件不算失败（打印后返回 0）。
 * 审核清单里的「测试通过」机检项就是它；⛔ 不读工作树猜测试归属，只信锁。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { INSTALLED_LOCK_DIR, readInstalledLock } from "./lock";

export interface PackageTestOptions {
  readonly root: string;
  readonly id: string;
  readonly int?: boolean;
}

export interface PackageTestPlan {
  readonly id: string;
  /** 相对 apps/server 的测试文件路径（node --test 的参数形态）。 */
  readonly files: readonly string[];
  readonly skippedInt: readonly string[];
}

function fail(message: string): never {
  throw new Error(`[plugin] ${message}`);
}

const UNIT_PATTERN = /^apps\/server\/test\/[^/]+\.test\.ts$/u;
const INT_PATTERN = /^apps\/server\/test\/int\/[^/]+\.test\.ts$/u;
const CLIENT_PATTERN = /^apps\/client\/test\/[^/]+\.test\.ts$/u;

/** 从锁清单推出要跑的测试文件（纯函数，CLI 与测试共用）。 */
export function planPackageTests(root: string, id: string, includeInt: boolean): PackageTestPlan {
  const lock = readInstalledLock(root, id);
  if (!lock) fail(`包 "${id}" 未安装（没有 ${INSTALLED_LOCK_DIR}/${id}.lock）`);
  const files: string[] = [];
  const skippedInt: string[] = [];
  for (const entry of lock.entries) {
    const relative = entry.path;
    if (UNIT_PATTERN.test(relative) || CLIENT_PATTERN.test(relative)) {
      files.push(path.posix.relative("apps/server", relative));
    } else if (INT_PATTERN.test(relative)) {
      if (includeInt) files.push(path.posix.relative("apps/server", relative));
      else skippedInt.push(relative);
    }
  }
  return { id, files: files.sort(), skippedInt: skippedInt.sort() };
}

/** 跑测试；返回退出码（0 = 全过 / 无测试）。 */
export function runPackageTests(options: PackageTestOptions): number {
  const plan = planPackageTests(path.resolve(options.root), options.id, options.int === true);
  if (plan.skippedInt.length > 0) console.log(`[plugin] 跳过集成测试（--int 才跑）：${plan.skippedInt.join(", ")}`);
  if (plan.files.length === 0) {
    console.log(`[plugin] ${plan.id} 的锁没有登记任何测试文件`);
    return 0;
  }
  console.log(`[plugin] ${plan.id}：跑 ${plan.files.length} 个测试文件`);
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...plan.files], {
    cwd: path.join(path.resolve(options.root), "apps/server"),
    stdio: "inherit",
  });
  if (result.error) fail(`无法启动测试：${result.error.message}`);
  return result.status ?? 1;
}
