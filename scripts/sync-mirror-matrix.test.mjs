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

/**
 * 登记豁免：`package.json` 里每一个 `<解释器> <脚本> --check` 都必须**要么进 TARGETS、
 * 要么在这里带理由登记**——扫描面刻意不限于 `sync-*`：任何「有写模式 + 有 --check 模式」的
 * 脚本都适用本矩阵的立论（`--check` 是第二套判定实现、可能撒谎），只认 `sync-` 前缀等于
 * 把其余同形脚本留在扫描面之外。
 */
const CHECK_SCRIPT_EXEMPTIONS = {
  "scripts/sync-webplatform-contract.mjs":
    "源在 node_modules（夹具用 git ls-files 构建、不含它），该镜像无 README.md，且其 --check "
    + "与真同步共用同一个 expectedFiles()——结构上无法背离，本矩阵的立论对它不成立",
  "scripts/vendor-lock.mjs":
    "其写模式是「重新祝福当前字节」而非从独立真源恢复镜像——本矩阵的源/镜像场景表不适用；"
    + "产物集合不匹配时写模式直接抛错（vendor-lock.mjs:205-209），覆盖由 vendor-lock.test.mjs 承担",
  "scripts/protected-paths-lock.mjs":
    "与 vendor-lock 同形：写模式是「重新祝福受保护文件的当前字节」，没有可供恢复的独立真源，"
    + "因此本矩阵的核心断言（--check 红 ⟺ 同步会改动镜像）在它身上无从成立——它的 --write "
    + "永远不会去改那些受保护文件，只会接受它们。判别力覆盖由 "
    + "apps/client/test/protectedPathsLock.test.ts 承担（锁缺失/内容漂移/增删受保护文件"
    + "各自点名、--check 只读、--write 幂等、空锁与畸形行 fail closed）",
  "scripts/fgui-manifest.mjs":
    "manifest 新鲜度闸，产物是单文件而非镜像树，覆盖由 scripts/fgui-manifest.test.mjs 承担",
  "tools/excel-to-json.mjs":
    "配表产物新鲜度闸，其「只读、不静默修复」性质已由 tools/excel-to-json.test.mjs 的反例钉住"
    + "（见 plan-v3 P1-08）",
};


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
    // 上一条正例锁的是「合法同步状态不得假红」，但它对 devEnv **新鲜度检查**恒真——
    // 删掉那个检查它照样绿。这条负例才是钉住新鲜度的那颗钉：改了 PORT 却没跑同步必须红。
    // 端口值从夹具里**已生成的** devEnv.ts 读出当前生效值再取一个不同的（读可观测产物，
    // 不是拿 devenv-gen 去验 devenv-gen）；PORT 用 **prepend**，因为 .env 的语义是
    // 「同名键第一条声明生效」。
    name: "PORT 改值但未跑同步",
    expectClean: false,
    mutate: (root) => {
      const generated = join(root, "apps/client/src/core/devEnv.ts");
      const match = /DEV_SERVER_PORT = (\d+)/u.exec(readFileSync(generated, "utf8"));
      assert.ok(match, `夹具前提不成立：${generated} 里读不到 DEV_SERVER_PORT`);
      const next = match[1] === "3000" ? 3001 : 3000;
      const envFile = join(root, ".env.development");
      writeFileSync(envFile, `PORT=${next}\n${readFileSync(envFile, "utf8")}`);
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

  // ↓ 上一条只判「.meta 在不在」；下面三条判「.meta 对不对」。两者不能互相代替：
  //   一个内容坏掉 / uuid 撞车的 .meta 在缺失校验眼里完全合格（文件在、路径对）。
  {
    // uuid 是 Creator 的资源身份证。撞车时它只认一个，另一个的场景/prefab 引用会静默解析到
    // 错资源——文件都在、都是合法 JSON、缺失校验全绿，肉眼与 review 都看不出来。
    // 真实来路：三方合并把 .meta 两侧都留下、复制 .meta 改文件名、脚本批量造 .meta 忘换 uuid。
    // 刻意跨 src/ 与 resources/ 撞：uuid 命名空间是整个资源库，判定范围若只盯镜像目录，
    // 这条必假绿——这条同时钉住检查的**范围**。
    name: "两个入库 .meta 的 uuid 撞车（跨 src/ 与 resources/）",
    expectClean: false,
    syncCannotFix: ".meta 由 Cocos 编辑器生成，同步脚本不改写 uuid——check 红但同步无改动",
    mutate: (root, t) => {
      const mirrorMeta = join(root, `${t.mirror}/${t.sample}.meta`);
      assert.ok(existsSync(mirrorMeta), `夹具前提不成立：找不到 ${t.mirror}/${t.sample}.meta`);
      const victim = firstTrackedMetaOutside(root, t.mirror);
      const meta = JSON.parse(readFileSync(victim, "utf8"));
      meta.uuid = JSON.parse(readFileSync(mirrorMeta, "utf8")).uuid;
      writeFileSync(victim, `${JSON.stringify(meta, null, 2)}\n`);
    },
  },
  {
    // 半截写入 / 未解的冲突标记：Creator 导入期会当作无 .meta 处理并重铸 uuid，引用全断。
    name: "入库 .meta 不是合法 JSON",
    expectClean: false,
    syncCannotFix: ".meta 由 Cocos 编辑器生成，同步脚本不会修复它——check 红但同步无改动",
    mutate: (root, t) => writeFileSync(join(root, `${t.mirror}/${t.sample}.meta`), '{ "uuid": "半截\n'),
  },
  {
    // 手编 / 占位符 uuid：JSON 合法、字段也在，只有形状能拆穿它。
    name: "入库 .meta 的 uuid 形状非法",
    expectClean: false,
    syncCannotFix: ".meta 由 Cocos 编辑器生成，同步脚本不改写 uuid——check 红但同步无改动",
    mutate: (root, t) => {
      const file = join(root, `${t.mirror}/${t.sample}.meta`);
      const meta = JSON.parse(readFileSync(file, "utf8"));
      meta.uuid = "TODO-填一个";
      writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`);
    },
  },
];

/** 夹具内第一个**不在镜像目录下**的已跟踪 .meta（用于制造跨目录 uuid 撞车）。 */
function firstTrackedMetaOutside(root, mirror) {
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "apps/Cocos/assets"], {
    cwd: root, encoding: "buffer",
  }).toString().split("\0").filter(Boolean);
  const hit = tracked.find((file) => file.endsWith(".meta") && !file.startsWith(`${mirror}/`));
  assert.ok(hit, `夹具前提不成立：apps/Cocos/assets 下找不到 ${mirror}/ 之外的入库 .meta`);
  return join(root, hit);
}

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

/** 扫描面：任何「解释器 [flags] [./] (scripts|tools)/**.mjs --check」形态的脚本调用。
 * 刻意不限 `sync-` 前缀（立论适用所有「有写模式 + 有 --check」的脚本）；
 * 同时容忍 `./` 前缀、解释器与路径之间的 flag、以及子目录脚本——这三类此前都会静默逃逸。
 */
function checkScriptPaths(body) {
  return [...String(body).matchAll(
    /(?:^|\s)(?:node|tsx)(?:\s+--?[A-Za-z][\w=-]*)*\s+(?:\.\/)?((?:scripts|tools)\/[\w./-]+?\.mjs)\s+--check(?![\w-])/gu,
  )].map((match) => match[1]);
}

test("矩阵覆盖面钉住 package.json：新增镜像 --check 脚本必须进 TARGETS 或显式豁免", () => {
  // TARGETS 是本文件对「有哪几面镜子」的第二次表达。新增一面镜子若忘了登记，矩阵会
  // 一眼都不看它就全绿。这条钉把它和 package.json 的真实脚本文本对齐。
  const scripts = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts ?? {};
  const declared = new Set();
  for (const body of Object.values(scripts)) {
    for (const script of checkScriptPaths(body)) declared.add(script);
  }
  assert.deepEqual(
    [...declared].sort(),
    [...TARGETS.map((target) => target.script), ...Object.keys(CHECK_SCRIPT_EXEMPTIONS)].sort(),
    "package.json 里带 --check 的脚本必须等于 TARGETS ∪ 登记豁免（新增同形脚本必须显式决策）",
  );
  for (const [script, reason] of Object.entries(CHECK_SCRIPT_EXEMPTIONS)) {
    assert.ok(reason.trim().length > 0, `豁免 ${script} 必须写明理由`);
  }
});

test("覆盖面扫描面承认 ./ 前缀、解释器 flag 与子目录脚本（此前三类静默逃逸）", () => {
  const cases = [
    ["node ./scripts/x.mjs --check", "scripts/x.mjs"],
    ["node --import tsx scripts/lib/x.mjs --check", "scripts/lib/x.mjs"],
    ["tsx tools/deep/y.mjs --check", "tools/deep/y.mjs"],
    ["node --import tsx ./tools/x.mjs --check --force", "tools/x.mjs"],
  ];
  for (const [body, expected] of cases) {
    assert.deepEqual(checkScriptPaths(body), [expected], `形态「${body}」必须被扫描面命中`);
  }
  // 反向钉：--checksum 不是 --check；非 scripts/tools 路径与 python 解释器不得命中。
  for (const body of ["node scripts/x.mjs --checksum", "node bin/x.mjs --check", "python3 scripts/x.mjs --check"]) {
    assert.deepEqual(checkScriptPaths(body), [], `形态「${body}」不得被扫描面命中`);
  }
});
