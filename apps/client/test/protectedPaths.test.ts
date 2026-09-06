/**
 * 保护路径无侵入矩阵（Non-intrusive §8.5 / §10.5「§11.3 的散文保护清单与 canonical
 * 规则文件双向比对一致」）。
 *
 * 真源 = `scripts/protected-paths.json`（显式治理锁；writer = 人工评审并在提交中显式声明）；
 * 本文件是它登记的 checker：随 `npm run test:client` 进入 `verify:core` 链。
 *
 * 守的形态（先例：verify-inventory 的「解析 Markdown 表 ⇔ package.json 双向 deepEqual」）：
 * 1. docs/Non-intrusive.md §11.3 与 §12.2 的两个散文代码块 ⇔ 规则文件的 pluginFlow.paths
 *    与 gameplayFlow.paths **各自双向 deepEqual**——从任一侧删掉 `pages.ts` 或
 *    `gameplay/services.ts` 都转红（⛔ 封死「先删规则条目、再重钉字节锁」的绕过路径）；
 * 2. §12.2 点名的中央文件（`GameRoom.ts` 等反引号 codespan）必须被规则文件覆盖；
 * 3. 每条保护路径都真实存在（改名/收敛后清单静默漂移即红）；
 * 4. generatedWriterOwned 的生成物存在、Do not edit 抬头在位、writer 命令真实可执行。
 *
 * ⛔ 本矩阵约束的是「普通 plugin / gameplay module 新增动线」的禁改集合；显式框架侵入
 * （Non-intrusive §12.3）必须同批更新规则文件与对应散文视图，本矩阵因此保持绿。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const RULES_PATH = join(ROOT, "scripts/protected-paths.json");
const DOC_PATH = join(ROOT, "docs/Non-intrusive.md");

interface WriterOwnedEntry {
  readonly path: string;
  readonly writer: string;
  readonly autoHeader: boolean;
}

interface ProtectedPathRules {
  readonly pluginFlow: { readonly prose: { readonly marker: string }; readonly paths: readonly string[] };
  readonly gameplayFlow: { readonly prose: { readonly marker: string }; readonly paths: readonly string[] };
  readonly generatedWriterOwned: { readonly entries: readonly WriterOwnedEntry[] };
  readonly semantics: Readonly<Record<string, string>>;
}

const rules = JSON.parse(readFileSync(RULES_PATH, "utf8")) as ProtectedPathRules;
const doc = readFileSync(DOC_PATH, "utf8");

/** 去掉 `/**` 尾缀后的实际检查落点（glob 条目对应目录）。 */
function fsTarget(path: string): { target: string; isGlob: boolean } {
  const isGlob = path.endsWith("/**");
  return { target: join(ROOT, isGlob ? path.slice(0, -3) : path), isGlob };
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * 散文视图 ⇔ 规则清单的双向 deepEqual。两条动线共用同一形态：
 * marker 必须在文档里恰好出现一次，其后紧跟的 ```text 块就是该动线的散文视图。
 * ⛔ 这是「先从规则文件删条目、再重钉 protected-paths.lock」那条绕过路径的封堵点——
 * 删条目必须同批删散文，否则本断言红（反之亦然）。
 */
function assertProseMatchesPaths(
  label: string,
  prose: { readonly marker: string },
  paths: readonly string[],
  minEntries: number,
): void {
  const marker = prose.marker;
  assert.ok(marker.length > 0, `${label}：规则文件必须声明散文 marker`);
  const occurrences = doc.split(marker).length - 1;
  assert.equal(occurrences, 1, `Non-intrusive.md 里 marker「${marker}」必须恰好出现一次，实际 ${occurrences} 次`);

  const after = doc.slice(doc.indexOf(marker) + marker.length);
  const block = after.match(/```text\r?\n([\s\S]*?)```/u);
  assert.ok(block, `${label}：marker 之后必须紧跟一个 \`\`\`text 代码块（散文视图）`);
  const proseList = block[1]
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // 双向：deepEqual 同时守「散文有而规则漏」与「规则有而散文漏」，且顺序一致。
  assert.deepStrictEqual(
    [...paths],
    proseList,
    `scripts/protected-paths.json ${label} 与其散文清单不一致——两者必须同批修改（散文只是视图，规则文件是真源）`,
  );
  assert.ok(proseList.length >= minEntries, `${label}：散文清单条目数异常（<${minEntries}）——解析被架空或清单被掏空`);
}

test("§11.3 散文清单 ⇔ pluginFlow.paths 双向 deepEqual（任一侧单方面增删即红）", () => {
  assertProseMatchesPaths("pluginFlow.paths", rules.pluginFlow.prose, rules.pluginFlow.paths, 10);
});

test("§12.2 散文清单 ⇔ gameplayFlow.paths 双向 deepEqual（封死「删条目再重钉」的绕过路径）", () => {
  assertProseMatchesPaths("gameplayFlow.paths", rules.gameplayFlow.prose, rules.gameplayFlow.paths, 5);
});

test("§12.2 点名的中央文件必须被保护集合覆盖（散文 → 规则第二方向）", () => {
  const sectionStart = doc.indexOf("### 12.2");
  assert.ok(sectionStart >= 0, "Non-intrusive.md 缺少 §12.2 标题");
  const sectionEnd = doc.indexOf("### 12.3", sectionStart);
  const section = doc.slice(sectionStart, sectionEnd > 0 ? sectionEnd : doc.length);

  const named = [...section.matchAll(/`([A-Za-z]+\.ts)`/gu)].map((match) => match[1]);
  assert.ok(named.includes("GameRoom.ts") && named.includes("RoomClient.ts"), "§12.2 应点名 GameRoom.ts 与 RoomClient.ts——散文被改动后本断言需人工复核");

  const protectedBasenames = new Set(
    [...rules.pluginFlow.paths, ...rules.gameplayFlow.paths].map((path) => path.split("/").pop() ?? path),
  );
  for (const base of new Set(named)) {
    assert.ok(
      protectedBasenames.has(base),
      `§12.2 点名的 ${base} 未被 protected-paths.json 覆盖（pluginFlow ∪ gameplayFlow）`,
    );
  }
});

test("每条保护路径真实存在（glob 条目为目录），且两组之间无重复", () => {
  const all = [...rules.pluginFlow.paths, ...rules.gameplayFlow.paths];
  assert.equal(new Set(all).size, all.length, "pluginFlow/gameplayFlow 存在重复条目");
  for (const path of all) {
    const { target, isGlob } = fsTarget(path);
    assert.ok(existsSync(target), `保护路径不存在：${path}（改名/收敛后必须同批更新规则文件与 §11.3 散文）`);
    if (isGlob) {
      assert.ok(statSync(target).isDirectory(), `glob 条目应指向目录：${path}`);
    } else {
      assert.ok(statSync(target).isFile(), `非 glob 条目应指向文件：${path}`);
    }
  }
});

test("semantics 注释无孤儿：键 ⊆ 保护路径集合，且 gameplayFlow 逐条带语义说明", () => {
  const all = new Set([...rules.pluginFlow.paths, ...rules.gameplayFlow.paths]);
  for (const key of Object.keys(rules.semantics)) {
    assert.ok(all.has(key), `semantics 登记了不在保护集合里的路径：${key}`);
  }
  // gameplayFlow 是本轮机读化新增的等价保护点，每条都必须说清「为什么受保护 / façade 语义」。
  for (const path of rules.gameplayFlow.paths) {
    const note = rules.semantics[path];
    assert.ok(typeof note === "string" && note.length > 0, `gameplayFlow 条目缺少 semantics 说明：${path}`);
  }
});

test("generatedWriterOwned：生成物存在、Do not edit 抬头在位、与保护集合不重叠", () => {
  const manual = new Set([...rules.pluginFlow.paths, ...rules.gameplayFlow.paths]);
  const seen = new Set<string>();
  for (const entry of rules.generatedWriterOwned.entries) {
    assert.ok(!seen.has(entry.path), `generatedWriterOwned 重复条目：${entry.path}`);
    seen.add(entry.path);
    assert.ok(!manual.has(entry.path), `条目同时出现在手写保护组与生成物组：${entry.path}`);
    const { target, isGlob } = fsTarget(entry.path);
    assert.ok(existsSync(target), `生成物/锁/镜像不存在：${entry.path}`);
    if (!entry.autoHeader) continue;
    const files = isGlob
      ? walkFiles(target).filter((file) => file.endsWith(".ts") || file.endsWith(".md"))
      : [target];
    assert.ok(files.length > 0, `autoHeader 条目下没有可检查的文件：${entry.path}`);
    for (const file of files) {
      const head = readFileSync(file, "utf8").split(/\r?\n/u, 3).join("\n");
      assert.ok(
        head.includes("Do not edit"),
        `${file} 首三行缺少 Do not edit 生成标记——生成物被手改接管或 writer 丢了抬头`,
      );
    }
  }
});

test("generatedWriterOwned：登记的 writer 命令真实存在（防止规则文件教一条不存在的刷新命令）", () => {
  const rootScripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
  const serverScripts = JSON.parse(readFileSync(join(ROOT, "apps/server/package.json"), "utf8")).scripts as Record<
    string,
    string
  >;
  for (const entry of rules.generatedWriterOwned.entries) {
    const workspace = entry.writer.match(/^npm --workspace @game\/server run ([A-Za-z0-9:_-]+)$/u);
    const root = entry.writer.match(/^npm run ([A-Za-z0-9:_-]+)$/u);
    // 直调 writer：仓内 scripts/ 或 tools/ 下的 .mjs（可带子目录与参数）。玩法自有生成物的
    // writer 刻意不做成根 npm script——根命令表是 AGENTS/CLAUDE/README 三份文档的双向相等
    // 集合，把玩法名塞进去正是本轮要拆掉的中央耦合。
    const script = entry.writer.match(/^node ((?:scripts|tools)\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.mjs)(?: |$)/u);
    if (workspace) {
      assert.ok(Object.hasOwn(serverScripts, workspace[1]), `writer 指向不存在的 @game/server 脚本：${entry.writer}`);
    } else if (root) {
      assert.ok(Object.hasOwn(rootScripts, root[1]), `writer 指向不存在的根脚本：${entry.writer}`);
    } else if (script) {
      assert.ok(existsSync(join(ROOT, script[1])), `writer 指向不存在的脚本文件：${entry.writer}`);
    } else {
      assert.fail(`writer 命令形态不可识别（应为 npm run / npm --workspace / node scripts|tools/**/*.mjs）：${entry.writer}`);
    }
  }
});
