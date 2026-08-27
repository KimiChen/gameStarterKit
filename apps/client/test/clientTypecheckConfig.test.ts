/**
 * Client strict-typecheck coverage guard.
 *
 * `apps/client/tsconfig.json` remains the Creator-oriented legacy probe and
 * intentionally excludes engine-bound files. The headless probe is
 * `tsconfig.test.json`; keep its glob coverage broad enough that a newly added
 * Main/View/page/test cannot silently fall out of strict compilation.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { test } from "node:test";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLIENT_ROOT = join(ROOT, "apps/client");
const CONFIG_PATH = join(CLIENT_ROOT, "tsconfig.test.json");

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

function parseClientConfig(): { readonly fileNames: readonly string[]; readonly options: ts.CompilerOptions } {
  const loaded = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile);
  assert.equal(loaded.error, undefined, `无法读取 ${relative(ROOT, CONFIG_PATH)}`);
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    CLIENT_ROOT,
    undefined,
    CONFIG_PATH,
  );
  assert.equal(
    parsed.errors.length,
    0,
    `解析 ${relative(ROOT, CONFIG_PATH)} 失败: ${ts.flattenDiagnosticMessageText(
      parsed.errors.map((error) => error.messageText).join("; "),
      " | ",
    )}`,
  );
  return {
    fileNames: parsed.fileNames.map((file) => resolve(file)),
    options: parsed.options,
  };
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
