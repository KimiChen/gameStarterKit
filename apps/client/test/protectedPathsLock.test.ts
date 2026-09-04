/**
 * 受保护路径字节锁的硬闸（姊妹件：protocolFingerprint.test.ts）。
 *
 * `scripts/protected-paths.json` 此前只是一张**名单**：谁改了名单上的中央文件，全仓没有任何
 * 东西会红——执行力 100% 依赖「提交里显式声明改了哪条」这条人工纪律。`protected-paths.lock`
 * 给名单配上机器执行力，本文件是它的判别力钉：
 *   1. 仓内现状必须自洽（锁 ⇔ 当前字节 ⇔ 规则文件展开面），且锁不得被掏空/替换成宽松形态；
 *   2. glob 条目在每次运行时**重新展开**——往 `app/**` 新增宿主件同样要过闸，⛔ 不得白得一个
 *      不受锁约束的新文件；
 *   3. CLI 的 fail-closed 形态：无参数退出 1、--check/--write 互斥、--check 只读、锁缺失即红。
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// 脚本域 .mjs（不进 Cocos，不受「相对导入不带扩展名」铁律约束）
import {
  collectLockedFiles,
  computeLockEntries,
  diffLock,
  parseLock,
  LOCK_RELATIVE,
} from "../../../scripts/protected-paths-lock.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SCRIPT = join(ROOT, "scripts/protected-paths-lock.mjs");

test("受保护路径锁：仓内锁 ⇔ 当前字节逐条一致（改了受保护文件忘重钉即红）", () => {
  const locked = parseLock(readFileSync(join(ROOT, LOCK_RELATIVE), "utf8"));
  const current = computeLockEntries(ROOT);
  assert.deepEqual(
    diffLock(locked, current),
    [],
    "受保护手写文件被改动但未重钉——若确属显式框架侵入（Non-intrusive §12.3），"
    + "在提交信息里声明改了哪条、为什么，再跑 node scripts/protected-paths-lock.mjs --write",
  );
});

test("受保护路径锁的覆盖面 = 规则文件两组手写路径的展开（⛔ 不含 generatedWriterOwned）", () => {
  const rules = JSON.parse(readFileSync(join(ROOT, "scripts/protected-paths.json"), "utf8")) as {
    featureFlow: { paths: string[] };
    gameplayFlow: { paths: string[] };
    generatedWriterOwned: { entries: Array<{ path: string }> };
  };
  const files = collectLockedFiles(ROOT);

  // 每条非 glob 保护路径必须**逐条**在锁的覆盖面里：整体计数相等对「一条掉了、另一条多展开
  // 一个文件」零判别力。
  const declared = [...rules.featureFlow.paths, ...rules.gameplayFlow.paths];
  for (const entry of declared.filter((path) => !path.endsWith("/**"))) {
    assert.ok(files.includes(entry), `保护路径未进锁：${entry}`);
  }
  // glob 条目必须真的展开出文件（展开为空 = 锁面被悄悄掏空一块）。
  for (const glob of declared.filter((path) => path.endsWith("/**"))) {
    const prefix = `${glob.slice(0, -"/**".length)}/`;
    assert.ok(files.some((file) => file.startsWith(prefix)), `glob 保护路径展开为空：${glob}`);
  }
  // 反方向：锁面里不得出现两组之外的文件（尤其不得把生成物拖进来——它们各自已有 writer 闸，
  // 再压字节锁会让每次正常重生成都要多钉一次，锁很快沦为噪音而被习惯性 --write）。
  const generated = new Set(rules.generatedWriterOwned.entries.map((entry) => entry.path));
  for (const file of files) {
    const covered = declared.some((entry) => (entry.endsWith("/**")
      ? file.startsWith(`${entry.slice(0, -"/**".length)}/`)
      : file === entry));
    assert.ok(covered, `锁面出现两组手写保护路径之外的文件：${file}`);
    assert.ok(!generated.has(file), `生成物被拖进手写锁面：${file}`);
  }
});

/** 最小夹具：只含规则文件与被它点名的两个手写文件（一条精确路径 + 一条 glob）。 */
function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "protected-paths-lock-"));
  const write = (relative: string, content: string): void => {
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    writeFileSync(join(root, relative), content);
  };
  write("scripts/protected-paths.json", `${JSON.stringify({
    featureFlow: { paths: ["src/Main.ts"] },
    gameplayFlow: { paths: ["src/app/**"] },
  }, null, 2)}\n`);
  write("src/Main.ts", "export const main = 1;\n");
  write("src/app/Host.ts", "export const host = 1;\n");
  return root;
}

function runCli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args, "--root", root], { encoding: "utf8" });
}

test("CLI：无参数打印用法并退出 1；--check 与 --write 互斥；未知参数拒绝", () => {
  const bare = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(bare.status, 1, "无参数必须退出 1（⛔ 没有隐式重钉形态）");
  assert.match(`${bare.stdout}${bare.stderr}`, /--check \| --write/u);

  const root = createFixture();
  try {
    const both = runCli(root, "--check", "--write");
    assert.equal(both.status, 1);
    assert.match(`${both.stdout}${both.stderr}`, /互斥/u);
    const unknown = runCli(root, "--frobnicate");
    assert.equal(unknown.status, 1);
    assert.match(`${unknown.stdout}${unknown.stderr}`, /未知参数/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI：锁缺失即红；--write 幂等；改一字节 / 增删受保护文件都逐条点名且 --check 只读", () => {
  const root = createFixture();
  const lockPath = join(root, LOCK_RELATIVE);
  try {
    const missing = runCli(root, "--check");
    assert.equal(missing.status, 1, "锁缺失必须 fail closed");
    assert.match(`${missing.stdout}${missing.stderr}`, /锁文件缺失/u);

    const first = runCli(root, "--write");
    assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
    const baseline = readFileSync(lockPath, "utf8");
    assert.equal(runCli(root, "--write").status, 0);
    assert.equal(readFileSync(lockPath, "utf8"), baseline, "--write 幂等：相同输入字节级相同锁");
    assert.equal(runCli(root, "--check").status, 0, "刚钉完必须绿");

    // ① 改内容一字节 → 点名该文件，且 --check 不得改写锁
    writeFileSync(join(root, "src/Main.ts"), "export const main = 2;\n");
    const drift = runCli(root, "--check");
    assert.equal(drift.status, 1);
    assert.match(`${drift.stdout}${drift.stderr}`, /内容已改：src\/Main\.ts/u);
    assert.equal(readFileSync(lockPath, "utf8"), baseline, "--check 不得改写锁文件");
    writeFileSync(join(root, "src/Main.ts"), "export const main = 1;\n");
    assert.equal(runCli(root, "--check").status, 0, "改回原字节应自动转绿");

    // ② 往 glob 目录新增文件 → 同样要过闸（glob 每次重新展开的意义所在）
    writeFileSync(join(root, "src/app/Extra.ts"), "export const extra = 1;\n");
    const added = runCli(root, "--check");
    assert.equal(added.status, 1);
    assert.match(`${added.stdout}${added.stderr}`, /新增受保护文件（锁中无）：src\/app\/Extra\.ts/u);
    rmSync(join(root, "src/app/Extra.ts"));

    // ③ 删掉受保护文件 → 点名消失，⛔ 不得被当成「没问题」
    rmSync(join(root, "src/app/Host.ts"));
    const removed = runCli(root, "--check");
    assert.equal(removed.status, 1);
    assert.match(`${removed.stdout}${removed.stderr}`, /受保护文件已消失（锁中有）：src\/app\/Host\.ts/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("锁格式解析 fail closed：畸形行、重复路径、空锁一律拒绝；注释与空行放行", () => {
  const hash = "a".repeat(64);
  assert.throws(() => parseLock(`src/Main.ts ${"A".repeat(64)}`), /格式非法/u, "大写十六进制不是合法 sha256");
  assert.throws(() => parseLock(`src/Main.ts ${"a".repeat(63)}`), /格式非法/u);
  assert.throws(() => parseLock("src/Main.ts"), /格式非法/u);
  assert.throws(() => parseLock(`src/Main.ts ${hash}\nsrc/Main.ts ${hash}`), /路径重复/u);
  assert.throws(() => parseLock("# 只剩注释\n\n"), /掏空/u, "空锁必须拒绝——否则删光条目即可全绿");
  assert.deepEqual(
    [...parseLock(`# 抬头\n\nsrc/Main.ts ${hash}\n`)],
    [["src/Main.ts", hash]],
  );
});

test("规则文件被掏空 / 保护路径不存在时 fail closed（⛔ 不静默缩小锁面）", () => {
  const root = createFixture();
  try {
    writeFileSync(
      join(root, "scripts/protected-paths.json"),
      `${JSON.stringify({ featureFlow: { paths: [] }, gameplayFlow: { paths: [] } })}\n`,
    );
    assert.throws(() => collectLockedFiles(root), /失去覆盖面/u);

    writeFileSync(
      join(root, "scripts/protected-paths.json"),
      `${JSON.stringify({ featureFlow: { paths: ["src/Ghost.ts"] }, gameplayFlow: { paths: [] } })}\n`,
    );
    assert.throws(() => collectLockedFiles(root), /保护路径不存在/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
