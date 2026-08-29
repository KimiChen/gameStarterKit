import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { GameHttpContractMap } from "@game/shared";
import ts from "typescript";

const TOOL_SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTTP_SOURCE_RELATIVE_PATH = "src/http";
const GENERATED_MANIFEST_RELATIVE_PATH = "src/http/manifest.generated.ts";
const ROOT_INFRASTRUCTURE_FILES = new Set(["contract.ts", "index.ts", "manifest.generated.ts"]);
const SUPPORT_DIRECTORY = "_support";

export type HttpEndpointSource = {
  readonly contractKey: string;
  readonly relativePath: string;
};

export type HttpEndpointManifestOptions = {
  readonly serverRoot?: string;
  readonly expectedContractKeys?: readonly string[];
  readonly outputFile?: string;
};

function posixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function endpointFactoryNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "../contract"
      || !statement.importClause
      || statement.importClause.isTypeOnly
      || !statement.importClause.namedBindings
      || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      if (element.isTypeOnly) continue;
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === "createGameEndpoint") names.add(element.name.text);
    }
  }
  return names;
}

function endpointContractKey(file: string, relativePath: string): string {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const factoryNames = endpointFactoryNames(sourceFile);
  if (factoryNames.size === 0) {
    throw new Error(
      `[http-manifest] ${relativePath} 必须从 ../contract 命名导入 createGameEndpoint（允许 alias）`,
    );
  }
  const defaults = sourceFile.statements.filter(
    (statement): statement is ts.ExportAssignment => ts.isExportAssignment(statement) && !statement.isExportEquals,
  );
  if (defaults.length !== 1) {
    throw new Error(
      `[http-manifest] ${relativePath} 必须且只能 default export 一个 createGameEndpoint(...) 调用`,
    );
  }

  const expression = unwrapExpression(defaults[0].expression);
  const callee = ts.isCallExpression(expression) ? unwrapExpression(expression.expression) : null;
  if (!ts.isCallExpression(expression)
    || !callee
    || !ts.isIdentifier(callee)
    || !factoryNames.has(callee.text)) {
    throw new Error(`[http-manifest] ${relativePath} 的 default export 必须直接调用 createGameEndpoint(...)`);
  }
  const key = expression.arguments[0];
  if (!key || !ts.isStringLiteralLike(key) || key.text.length === 0) {
    throw new Error(`[http-manifest] ${relativePath} 的 createGameEndpoint contractKey 必须是非空字符串字面量`);
  }
  return key.text;
}

function endpointFiles(httpRoot: string): string[] {
  if (!fs.existsSync(httpRoot) || !fs.statSync(httpRoot).isDirectory()) {
    throw new Error(`[http-manifest] HTTP 源目录不存在：${httpRoot}`);
  }

  const files: string[] = [];
  const walk = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      compareText(left.name, right.name));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      const relativePath = posixPath(path.relative(httpRoot, full));
      if (entry.isSymbolicLink()) {
        throw new Error(`[http-manifest] HTTP 源目录不得包含符号链接：${relativePath}`);
      }
      if (entry.isDirectory()) {
        if (directory === httpRoot && entry.name === SUPPORT_DIRECTORY) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".tsx")) {
        throw new Error(`[http-manifest] endpoint 源文件只允许 .ts：${relativePath}`);
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
      if (!relativePath.includes("/")) {
        if (!ROOT_INFRASTRUCTURE_FILES.has(relativePath)) {
          throw new Error(`[http-manifest] endpoint 必须放在 <domain>/<method>.ts：${relativePath}`);
        }
        continue;
      }
      if (relativePath.split("/").length !== 2) {
        throw new Error(`[http-manifest] endpoint 必须恰好位于 <domain>/<method>.ts：${relativePath}`);
      }
      files.push(full);
    }
  };
  walk(httpRoot);
  return files;
}

function resolvedOptions(options: HttpEndpointManifestOptions): {
  readonly serverRoot: string;
  readonly httpRoot: string;
  readonly outputFile: string;
  readonly expectedContractKeys: readonly string[];
} {
  const serverRoot = path.resolve(options.serverRoot ?? TOOL_SERVER_ROOT);
  return {
    serverRoot,
    httpRoot: path.join(serverRoot, HTTP_SOURCE_RELATIVE_PATH),
    outputFile: path.resolve(options.outputFile ?? path.join(serverRoot, GENERATED_MANIFEST_RELATIVE_PATH)),
    expectedContractKeys: options.expectedContractKeys ?? Object.keys(GameHttpContractMap),
  };
}

export function discoverHttpEndpoints(options: HttpEndpointManifestOptions = {}): readonly HttpEndpointSource[] {
  const { httpRoot, expectedContractKeys } = resolvedOptions(options);
  const expected = new Set<string>();
  for (const key of expectedContractKeys) {
    if (typeof key !== "string" || key.length === 0) {
      throw new Error("[http-manifest] expectedContractKeys 只能包含非空字符串");
    }
    if (expected.has(key)) throw new Error(`[http-manifest] expectedContractKeys 重复：${key}`);
    expected.add(key);
  }

  const endpoints = endpointFiles(httpRoot).map((file): HttpEndpointSource => {
    const relativePath = posixPath(path.relative(httpRoot, file));
    const contractKey = endpointContractKey(file, relativePath);
    return { contractKey, relativePath };
  }).sort((left, right) =>
    compareText(left.contractKey, right.contractKey) || compareText(left.relativePath, right.relativePath));

  const byKey = new Map<string, string[]>();
  for (const endpoint of endpoints) {
    const files = byKey.get(endpoint.contractKey) ?? [];
    files.push(endpoint.relativePath);
    byKey.set(endpoint.contractKey, files);
  }
  const duplicates = [...byKey].filter(([, files]) => files.length > 1);
  if (duplicates.length > 0) {
    throw new Error(
      `[http-manifest] contractKey 重复：${duplicates.map(([key, files]) => `${key}=[${files.join(",")}]`).join(" ")}`,
    );
  }

  const actual = new Set(endpoints.map((endpoint) => endpoint.contractKey));
  const missing = [...expected].filter((key) => !actual.has(key)).sort(compareText);
  const unknown = [...actual].filter((key) => !expected.has(key)).sort(compareText);
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(
      `[http-manifest] endpoint contractKey 集合不一致：缺少=[${missing.join(",")}] 未知=[${unknown.join(",")}]`,
    );
  }
  return endpoints;
}

export function renderHttpEndpointManifest(options: HttpEndpointManifestOptions = {}): string {
  const endpoints = discoverHttpEndpoints(options);
  const imports = endpoints.map((endpoint, index) => {
    const modulePath = `./${endpoint.relativePath.replace(/\.ts$/u, "")}`;
    return `import endpoint${index} from ${JSON.stringify(modulePath)};`;
  });
  const definitions = endpoints.map((endpoint, index) =>
    `  ${JSON.stringify(endpoint.contractKey)}: endpoint${index},`);
  return [
    "/** AUTO-GENERATED by tools/http-endpoint-manifest.ts. Do not edit. */",
    "import type { Endpoint } from \"@colyseus/core\";",
    "import type { GameHttpContractKey } from \"@game/shared\";",
    ...imports,
    "",
    "export const gameRouteDefinitions = Object.freeze({",
    ...definitions,
    "} satisfies Record<GameHttpContractKey, Endpoint>);",
    "",
  ].join("\n");
}

export function assertHttpEndpointManifestFresh(options: HttpEndpointManifestOptions = {}): void {
  const resolved = resolvedOptions(options);
  const expected = renderHttpEndpointManifest(options);
  const actual = fs.existsSync(resolved.outputFile) ? fs.readFileSync(resolved.outputFile, "utf8") : null;
  if (actual !== expected) {
    const endpoints = discoverHttpEndpoints(options)
      .map((endpoint) => `${endpoint.contractKey}:${endpoint.relativePath}`)
      .join(",");
    throw new Error(
      `[http-manifest] manifest 缺失或陈旧：${posixPath(path.relative(resolved.serverRoot, resolved.outputFile))}; `
      + `endpoint=[${endpoints}]。运行 npm --workspace @game/server run codegen:http`,
    );
  }
}

export function writeHttpEndpointManifest(options: HttpEndpointManifestOptions = {}): boolean {
  const resolved = resolvedOptions(options);
  const content = renderHttpEndpointManifest(options);
  const current = fs.existsSync(resolved.outputFile) ? fs.readFileSync(resolved.outputFile, "utf8") : null;
  if (current === content) return false;
  fs.mkdirSync(path.dirname(resolved.outputFile), { recursive: true });
  fs.writeFileSync(resolved.outputFile, content, "utf8");
  return true;
}

function parseCli(argv: readonly string[]): { readonly check: boolean; readonly serverRoot?: string } {
  let check = false;
  let serverRoot: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      if (check) throw new Error("参数重复：--check");
      check = true;
    } else if (arg === "--root") {
      if (serverRoot !== undefined) throw new Error("参数重复：--root");
      const value = argv[++index];
      if (!value) throw new Error("--root 需要非空目录参数");
      serverRoot = value;
    } else if (arg.startsWith("--root=")) {
      if (serverRoot !== undefined) throw new Error("参数重复：--root");
      serverRoot = arg.slice("--root=".length);
      if (!serverRoot) throw new Error("--root 需要非空目录参数");
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return { check, ...(serverRoot ? { serverRoot } : {}) };
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCli(process.argv.slice(2));
    if (args.check) {
      assertHttpEndpointManifestFresh(args);
      console.log("[http-manifest] endpoint manifest 已是最新");
    } else {
      const changed = writeHttpEndpointManifest(args);
      console.log(`[http-manifest] endpoint manifest ${changed ? "已更新" : "无需更新"}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
