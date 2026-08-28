/**
 * Client strict-typecheck coverage guard.
 *
 * `apps/client/tsconfig.json` is the Creator-oriented ES2017 probe and covers
 * every source file with the local engine stubs. The headless probe is
 * `tsconfig.test.json`; keep both file sets explicit so a newly added
 * Main/View/page/gameplay module cannot silently fall out of compilation.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import ts from "typescript";
import { test } from "node:test";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLIENT_ROOT = join(ROOT, "apps/client");
const CONFIG_PATH = join(CLIENT_ROOT, "tsconfig.test.json");
const LEGACY_CONFIG_PATH = join(CLIENT_ROOT, "tsconfig.json");

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(resolve(path));
    }
  }
  return files;
}

function parseClientConfig(configPath = CONFIG_PATH): {
  readonly fileNames: readonly string[];
  readonly options: ts.CompilerOptions;
  readonly config: Record<string, unknown>;
} {
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(loaded.error, undefined, `无法读取 ${relative(ROOT, configPath)}`);
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    CLIENT_ROOT,
    undefined,
    configPath,
  );
  assert.equal(
    parsed.errors.length,
    0,
    `解析 ${relative(ROOT, configPath)} 失败: ${ts.flattenDiagnosticMessageText(
      parsed.errors.map((error) => error.messageText).join("; "),
      " | ",
    )}`,
  );
  return {
    fileNames: parsed.fileNames.map((file) => resolve(file)),
    options: parsed.options,
    config: loaded.config as Record<string, unknown>,
  };
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
}

test("client headless tsconfig strictly includes all source and test TypeScript files", () => {
  const config = parseClientConfig();
  assert.equal(config.options.strict, true, "client strict probe 不得关闭 strict");
  assert.equal(config.options.noEmit, true, "client strict probe 必须保持 noEmit");
  const included = new Set(config.fileNames);
  const sourceFiles = [
    ...collectTypeScriptFiles(join(CLIENT_ROOT, "src")),
    ...collectTypeScriptFiles(join(CLIENT_ROOT, "test")),
  ];

  const missing = sourceFiles
    .filter((file) => !included.has(file))
    .map((file) => relative(ROOT, file));
  assert.deepEqual(missing, [], "client strict probe 漏掉源码/测试文件");

  for (const required of [
    "client-test-stubs.d.ts",
    "src/Main.ts",
    "src/view/FguiView.ts",
    "src/view/ViewMgr.ts",
    "src/view/viewRegistry.ts",
    "src/view/pages.ts",
    "src/view/LoginView.ts",
    "src/view/AreaListView.ts",
    "src/view/LoginNoticeView.ts",
    "src/view/HomeView.ts",
    "src/view/ConfirmView.ts",
  ]) {
    assert.ok(included.has(resolve(CLIENT_ROOT, required)), `${required} 未纳入 client strict probe`);
  }
});

test("client legacy tsconfig covers every source TypeScript file", () => {
  const legacy = parseClientConfig(LEGACY_CONFIG_PATH);
  assert.equal(legacy.options.strict, true, "legacy probe 不得关闭 strict");
  assert.equal(legacy.options.noEmit, true, "legacy probe 必须保持 noEmit");
  assert.equal(legacy.options.noUnusedLocals, false,
    "legacy probe 只允许关闭 FGUI AUTO 字段的 noUnusedLocals 噪声");

  const include = legacy.config.include;
  assert.ok(Array.isArray(include) && include.includes("src/**/*.ts"),
    "legacy probe 必须使用递归 src/**/*.ts include，防止新增目录静默逃逸");

  const sourceFiles = collectTypeScriptFiles(join(CLIENT_ROOT, "src"));
  const included = new Set(legacy.fileNames);
  const missing = sourceFiles
    .filter((file) => !included.has(file))
    .map((file) => relative(ROOT, file));
  assert.deepEqual(missing, [], "legacy probe 漏掉客户端源码文件");

  // A future source-targeted exclude must fail this test rather than silently
  // reducing the ES2017 API-floor coverage.
  const sourceRoot = resolve(join(CLIENT_ROOT, "src")) + sep;
  const unexpected = [...included]
    .filter((file) => file.startsWith(sourceRoot) && !sourceFiles.includes(file))
    .map((file) => relative(ROOT, file));
  assert.deepEqual(unexpected, [], "legacy probe 纳入了不受文件集合守门的源码路径");

  for (const required of [
    "src/Main.ts",
    "src/gameplay/catalog.ts",
    "src/view/FguiView.ts",
    "src/view/ViewMgr.ts",
    "src/view/viewRegistry.ts",
    "src/view/rooms/ballMove/BallMoveView.ts",
  ]) {
    assert.ok(included.has(resolve(CLIENT_ROOT, required)), `${required} 未纳入 legacy probe`);
  }
});

test("client legacy probe enforces the ES2017 API floor", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "client-legacy-typecheck-"));
  const probe = join(fixtureRoot, "modern-api-probe.ts");
  try {
    writeFileSync(probe, [
      "export const entries = Object.fromEntries([[\"score\", 1]]);",
      "export const settled = Promise.allSettled([Promise.resolve(1)]);",
      "",
    ].join("\n"));

    const legacy = parseClientConfig(LEGACY_CONFIG_PATH);
    assert.equal(legacy.options.target, ts.ScriptTarget.ES2017, "legacy probe 必须钉 ES2017 target");
    assert.deepEqual(legacy.options.lib, ["lib.es2017.d.ts", "lib.dom.d.ts"]);
    const legacyProgram = ts.createProgram([...legacy.fileNames, probe], legacy.options);
    const legacyDiagnostics = ts.getPreEmitDiagnostics(legacyProgram)
      .filter((diagnostic) => diagnostic.file?.fileName === probe)
      .map(diagnosticText);
    assert.ok(
      legacyDiagnostics.some((message) => message.includes("fromEntries")),
      `legacy probe 必须拒绝 Object.fromEntries：${legacyDiagnostics.join(" | ")}`,
    );
    assert.ok(
      legacyDiagnostics.some((message) => message.includes("allSettled")),
      `legacy probe 必须拒绝 Promise.allSettled：${legacyDiagnostics.join(" | ")}`,
    );

    const modern = parseClientConfig(CONFIG_PATH);
    const modernProgram = ts.createProgram([...modern.fileNames, probe], modern.options);
    const modernDiagnostics = ts.getPreEmitDiagnostics(modernProgram)
      .filter((diagnostic) => diagnostic.file?.fileName === probe)
      .map(diagnosticText);
    assert.deepEqual(modernDiagnostics, [], `现代 client probe 不应拒绝探针：${modernDiagnostics.join(" | ")}`);

    const rootPackage = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    assert.equal(rootPackage.scripts?.["typecheck:client:legacy"], "tsc -p apps/client/tsconfig.json --noEmit");
    assert.match(rootPackage.scripts?.typecheck ?? "", /npm run typecheck:client:legacy/,
      "根 typecheck 必须串入 ES2017 legacy 门禁");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
