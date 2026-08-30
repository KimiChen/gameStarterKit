/**
 * `sync-shared` / `sync-client` 的 `--check` 判定 vs 真实同步效果的一致性矩阵。
 *
 * 这两个脚本有两副面孔：`--check` 只读判「镜像是不是一致」，不带参数则真的把镜像同步成一致。
 * `verify:sync` 消费的是前者，而开发者相信的是「红灯 ⟺ 我需要去跑一次 sync」。
 * 这条等价关系此前没有任何东西守着——`--check` 可以在任意方向上说谎而不被发现。
 *
 * 这里给它配的地面真相不是再实现一遍判定逻辑（那只是拿判定验判定），而是**文件系统的可观测效果**：
 *   A. 门禁怎么说：`--check` 的退出码。
 *   B. 真实效果怎么样：把镜像树的「路径 → 内容哈希」快照下来，真的跑一次同步，再快照一次，
 *      看树到底变没变。
 *   默认断言二者等价：`--check` 红 ⟺ 同步会改动镜像。
 *
 * 不等价的情形**显式登记**在 `syncCannotFix` 里而不是从表里删掉——例如 `.meta` 由 Cocos 编辑器
 * 生成，同步脚本修不了它，于是 `--check` 红而同步无改动。将来谁让同步能修了，这里会红，
 * 提醒同步更新登记。
 *
 * 每个场景还额外断言**收敛性**：跑完同步后 `--check` 必须转绿（除非 syncCannotFix）。
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  {
    name: "sync-shared",
    script: "scripts/sync-shared.mjs",
    src: "apps/shared/src",
    mirror: "apps/client/src/shared",
    sample: "index.ts",
  },
  {
    name: "sync-client",
    script: "scripts/sync-client.mjs",
    src: "apps/client/src",
    mirror: "apps/Cocos/assets/src",
    sample: "Main.ts",
  },
];

const fixtures = [];
after(() => { for (const dir of fixtures) rmSync(dir, { recursive: true, force: true }); });

/**
 * 一次性 checkout 副本。必须是 git 仓库：`sync-client --check` 用 `git ls-files` 判断
 * 「入库文件是否缺入库 `.meta`」，非 git 目录下会直接抛错而不是给出判定。
 */
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "sync-matrix-"));
  fixtures.push(root);
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: REPO_ROOT, encoding: "buffer",
  }).toString().split("\0").filter(Boolean);
  for (const file of files) {
    if (file === "apps/website" || file.startsWith("apps/website/")) continue;
    if (file === ".env") continue; // 只排除含密钥的 .env；已入库的 .env.development 必须进夹具，
    // 否则「开发者改 PORT 并正常同步」的合法状态会被 devEnv 新鲜度检查按默认值重算成漂移（假红）。
    const source = join(REPO_ROOT, file);
    if (!existsSync(source)) continue;
    const destination = join(root, file);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(source));
  }
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "matrix@example.invalid");
  git("config", "user.name", "sync matrix");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return root;
}

/** 镜像树的可观测快照：相对路径 → 内容哈希。 */
function snapshot(root, relative) {
  const base = join(root, relative);
  const entries = new Map();
  const walk = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, item.name);
      if (item.isDirectory()) { walk(full); continue; }
      if (!item.isFile()) continue;
      entries.set(full.slice(base.length + 1), createHash("sha256").update(readFileSync(full)).digest("hex"));
    }
  };
  if (existsSync(base) && statSync(base).isDirectory()) walk(base);
  return entries;
}

const sameSnapshot = (left, right) => left.size === right.size
  && [...left].every(([key, value]) => right.get(key) === value);

/** A：`--check` 怎么说。true = 判为一致（绿）。 */
function checkSaysClean(root, script) {
  const result = spawnSync(process.execPath, [join(root, script), "--check"], {
    cwd: root, encoding: "utf8", timeout: 120_000,
  });
  assert.notEqual(
    result.status, null,
    `${script} --check 未正常退出（超时或被信号杀死）：${result.stderr}`,
  );
  return result.status === 0;
}

/** B：真的跑一次同步，镜像树变了没有。 */
function syncChangesMirror(root, script, mirror) {
  const before = snapshot(root, mirror);
  const result = spawnSync(process.execPath, [join(root, script)], {
    cwd: root, encoding: "utf8", timeout: 120_000,
  });
  assert.equal(result.status, 0, `${script} 同步本身应当成功：${result.stdout}\n${result.stderr}`);
  return !sameSnapshot(before, snapshot(root, mirror));
}

/**
 * 场景表。`mutate(root, target)` 制造一种状态，`expectClean` 是 `--check` 应有的判定。
 * 默认断言「`--check` 红 ⟺ 同步会改动镜像」；`syncCannotFix` 显式登记同步修不了的情形。
 */
const SCENARIOS = [
  { name: "原样未改动", expectClean: true, mutate: () => {} },
  {
    name: "镜像里的文件被改坏",
    expectClean: false,
    mutate: (root, t) => appendTo(join(root, t.mirror, t.sample), "\n// drift\n"),
  },
  {
    name: "镜像里的文件被删掉",
    expectClean: false,
    mutate: (root, t) => unlinkSync(join(root, t.mirror, t.sample)),
  },
  {
    name: "镜像里多出源目录没有的孤儿文件",
    expectClean: false,
    mutate: (root, t) => writeFileSync(join(root, t.mirror, "zz-orphan.ts"), "export const orphan = 1;\n"),
  },
  {
    name: "源目录新增文件但镜像未更新",
    expectClean: false,
    mutate: (root, t) => writeFileSync(join(root, t.src, "zzMatrixProbe.ts"), "export const probe = 1;\n"),
  },
  {
    name: "生成的警示 README 被改",
    expectClean: false,
    mutate: (root, t) => appendTo(join(root, t.mirror, "README.md"), "\n手改一行\n"),
  },
];

/** 只对 sync-client 有意义的 `.meta` 场景。 */
const CLIENT_SCENARIOS = [
  {
    // 开发者改 `.env.development` 的 PORT 并正常同步后的合法状态：夹具里的 .env.development
    // 与两端 devEnv.ts 必须一致，`--check` 应放行且同步无改动。用夹具内的真实 sync 脚本
    // 重生成，保证与开发者本地操作逐字节一致。
    name: "PORT 改值后 .env 与两端生成物一致",
    expectClean: true,
    mutate: (root) => {
      const envFile = join(root, ".env.development");
      writeFileSync(envFile, `${readFileSync(envFile, "utf8")}\nPORT=3000\n`);
      execFileSync("node", ["scripts/sync-client.mjs"], { cwd: root, stdio: "ignore" });
    },
  },

  {
    // 注意这条判的是 **git index** 而不是工作树：从磁盘上删掉 .meta 不会触发它
    // （`git ls-files` 仍列出该条目）。真正的失效形态是「文件入库了但它的 .meta 没入库」，
    // 所以这里用 `git rm --cached` 取消跟踪，文件本身留在磁盘上。
    name: "入库文件的 .meta 未入库",
    expectClean: false,
    syncCannotFix: ".meta 由 Cocos 编辑器生成，同步脚本不会补写——check 红但同步无改动",
    mutate: (root, t) => {
      const meta = `${t.mirror}/${t.sample}.meta`;
      assert.ok(existsSync(join(root, meta)), `夹具前提不成立：找不到 ${meta}`);
      execFileSync("git", ["rm", "--cached", "-q", "--", meta], { cwd: root, stdio: "ignore" });
    },
  },
];

function appendTo(file, text) {
  assert.ok(existsSync(file), `夹具前提不成立：找不到 ${file}`);
  writeFileSync(file, `${readFileSync(file, "utf8")}${text}`);
}

for (const target of TARGETS) {
  const scenarios = target.name === "sync-client"
    ? [...SCENARIOS, ...CLIENT_SCENARIOS]
    : SCENARIOS;

  test(`${target.name}：--check 判定与真实同步效果一致`, () => {
    const divergences = [];
    for (const scenario of scenarios) {
      const root = createFixture();
      scenario.mutate(root, target);

      const clean = checkSaysClean(root, target.script);
      if (clean !== scenario.expectClean) {
        divergences.push(`${scenario.name}\n    --check 判定=${clean ? "绿" : "红"}`
          + ` 期望=${scenario.expectClean ? "绿" : "红"}`);
        continue;
      }

      const changed = syncChangesMirror(root, target.script, target.mirror);
      if (scenario.syncCannotFix) {
        if (changed) {
          divergences.push(`${scenario.name}\n    已登记为「同步修不了」，但同步实际改动了镜像`
            + `\n    请去掉 syncCannotFix 并同步更新 plan-v3 的边界登记（${scenario.syncCannotFix}）`);
        }
        continue;
      }
      if (clean === changed) {
        divergences.push(`${scenario.name}\n    --check=${clean ? "绿" : "红"} 但同步${changed ? "改动了" : "没改动"}镜像`
          + `  → ${clean ? "假绿（说一致，实际同步还会改）" : "假红（说不一致，实际同步什么都没做）"}`);
        continue;
      }
      // 收敛性：同步之后必须转绿，否则「跑一次 sync 就好」这句话是假的。
      assert.equal(
        checkSaysClean(root, target.script), true,
        `${target.name} / ${scenario.name}：跑完同步后 --check 仍为红，未收敛`,
      );
    }
    assert.deepEqual(
      divergences, [],
      `${divergences.length}/${scenarios.length} 个场景与真实同步效果背离：\n  ${divergences.join("\n  ")}`,
    );
  });
}

test("矩阵本身有判别力：两侧探针都不是恒真", () => {
  const target = TARGETS[0];
  const root = createFixture();
  // 门禁侧：原样为绿，改坏后为红。
  assert.equal(checkSaysClean(root, target.script), true, "原样镜像必须判绿");
  appendTo(join(root, target.mirror, target.sample), "\n// drift\n");
  assert.equal(checkSaysClean(root, target.script), false, "改坏后必须判红");
  // 效果侧：改坏时同步会动树，原样时不会。
  assert.equal(syncChangesMirror(root, target.script, target.mirror), true, "改坏后同步必须改动镜像");
  assert.equal(syncChangesMirror(root, target.script, target.mirror), false, "已一致时同步不得再改动镜像");
});
