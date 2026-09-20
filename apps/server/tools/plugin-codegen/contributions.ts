/**
 * kit 贡献点收录（docs/MMO.md MF9 / docs/MMO-PLAN.md MF9-B2）：把插件 plugin.json `contributes` 填充的贡献，按 kit.json
 * `contributions` 声明的 kind / ends 汇成 `apps/<end>/src/kits/<kitId>/contributions.generated.ts`（kit 代码从自己目录
 * `./contributions.generated` 静态导入；K1 边界扫描对 `*.generated.ts` 豁免——生成物由本 writer 拥有，⛔ 不是 kit 手写依赖插件）。
 *  - module：插件模块（.ts）必须落在本插件的所有权推导集内（ownership.ts allowlist：⛔ 硬排除 / 受保护路径 / 别的包）、
 *    在贡献点声明的那一端源码树（apps/<end>/src/）、并真的导出声明的符号（TS 语法读取，⛔ 不执行）；渲染为静态字面量 import；
 *  - data：插件 JSON 必须在本插件所有权集内，按 kit 的 schema（pluginManifestSchema 解释器子集）校验后同源渲染到每个声明的端；
 *  - 未登记的 kit / 贡献点 id、越界路径、schema 不合、缺 export 一律 fail（codegen 是第一道闸；pack / install / check 各自再闸）；
 *  - kit 声明了某端有贡献点 ⇒ 该端文件**恒生成**（无人填充时是空列表，kit 代码可无条件导入）；声明撤销 ⇒ writer 删除孤儿文件。
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { classifyPath, deriveOwnership, readProtectedPaths } from "../plugin/ownership";
import { parsePluginManifest, treeIdentityOf } from "../plugin/manifest";
import {
  CONTRIBUTION_ENDS, validateAgainstSchema, type ContributionEnd, type KitRegistration, type PluginRegistration,
} from "./pluginManifestSchema";

export const CONTRIBUTIONS_BASENAME = "contributions.generated.ts";
/** 生成物路径形态（writer 允许输出集合 / 孤儿判定 / protected-paths `*` 条目共用）。 */
export const CONTRIBUTIONS_FILE_RE = /^apps\/(shared|server|client)\/src\/kits\/([a-z][A-Za-z0-9]{0,63})\/contributions\.generated\.ts$/u;

export function contributionsFileRelative(end: ContributionEnd, kitId: string): string {
  return `apps/${end}/src/kits/${kitId}/${CONTRIBUTIONS_BASENAME}`;
}

export type FilledContribution =
  | { readonly kind: "module"; readonly pluginId: string; readonly file: string; readonly exportName: string }
  | { readonly kind: "data"; readonly pluginId: string; readonly file: string; readonly value: unknown };

/** 一个 kit 一端的渲染输入：贡献点 id（排序）→ 填充列表（按插件 id 排序）。 */
export type KitContributionsPlan = {
  readonly kitId: string;
  readonly end: ContributionEnd;
  readonly ids: ReadonlyMap<string, readonly FilledContribution[]>;
};

export type ContributingPlugin = {
  readonly registration: PluginRegistration;
  /** plugin.json 原始 JSON（所有权推导要走打包工具的 manifest 解析）。 */
  readonly raw: unknown;
  readonly label: string;
};

function fail(pathLabel: string, message: string): never {
  throw new Error(`[plugin-codegen] ${pathLabel}: ${message}`);
}

function assertRegularFile(file: string, label: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    fail(label, `文件不存在：${file}`);
  }
  if (stat.isSymbolicLink()) fail(label, "symlink escape is not allowed");
  if (!stat.isFile()) fail(label, "must be a regular file");
}

/** 模块是否导出了名为 `name` 的**值**（function / class / const / let / var 声明，或本文件的 `export { name }`）。 */
export function hasExportedValue(source: string, label: string, name: string): boolean {
  const sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const isExported = (statement: ts.Statement): boolean =>
    (ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of sourceFile.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && isExported(statement) && statement.name?.text === name) return true;
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return true;
      }
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined && statement.exportClause !== undefined
      && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.some((element) => element.name.text === name)) {
      return true;
    }
  }
  return false;
}

/**
 * 解析全部插件的 contributes：三道校验（登记 / 所有权 / 形态与内容）后按 kit × end 汇成渲染计划。
 * 变异验证：跳过所有权判定 → plugin-codegen.test「越界贡献被拒」转红。
 */
export function resolveContributions(
  root: string,
  kits: ReadonlyMap<string, KitRegistration>,
  plugins: readonly ContributingPlugin[],
): readonly KitContributionsPlan[] {
  const filled = new Map<string, Map<string, FilledContribution[]>>();
  const protectedPaths = readProtectedPaths(root);
  for (const plugin of plugins) {
    const entries = Object.entries(plugin.registration.contributes);
    if (entries.length === 0) continue;
    const rules = deriveOwnership(treeIdentityOf(root, parsePluginManifest(plugin.raw, plugin.label)));
    const pluginId = plugin.registration.id;
    for (const [kitId, byId] of entries) {
      const kit = kits.get(kitId);
      if (kit === undefined) fail(`${plugin.label}.contributes.${kitId}`, `kit "${kitId}" 未登记（apps/kits/${kitId}/kit.json）`);
      for (const [id, file] of Object.entries(byId)) {
        const label = `${plugin.label}.contributes.${kitId}.${id}`;
        const spec = Object.prototype.hasOwnProperty.call(kit.contributions, id) ? kit.contributions[id] : undefined;
        if (spec === undefined) fail(label, `kit "${kitId}" 没有贡献点 "${id}"（已声明：${Object.keys(kit.contributions).join(", ") || "-"}）`);
        const verdict = classifyPath(file, rules, protectedPaths);
        if (!verdict.allowed) fail(label, `路径 "${file}" 不在插件 "${pluginId}" 的所有权推导集内（${verdict.reason}）——越界贡献`);
        const absolute = path.join(root, file);
        assertRegularFile(absolute, label);
        let entry: FilledContribution;
        if (spec.kind === "module") {
          if (!file.endsWith(".ts")) fail(label, `module 贡献必须是 .ts（读到 ${file}）`);
          const end = spec.ends[0] as ContributionEnd;
          if (!file.startsWith(`apps/${end}/src/`)) fail(label, `module 贡献点 "${id}" 声明在 ${end} 端：路径必须落在 apps/${end}/src/（读到 ${file}）`);
          if (!hasExportedValue(fs.readFileSync(absolute, "utf8"), file, spec.export)) fail(label, `${file} 没有导出贡献点要求的符号 "${spec.export}"`);
          entry = { kind: "module", pluginId, file, exportName: spec.export };
        } else {
          if (!file.endsWith(".json")) fail(label, `data 贡献必须是 .json（读到 ${file}）`);
          let value: unknown;
          try {
            value = JSON.parse(fs.readFileSync(absolute, "utf8"));
          } catch (error) {
            fail(label, `${file} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
          }
          validateAgainstSchema(spec.schema, value, `${label} → ${file}`);
          entry = { kind: "data", pluginId, file, value };
        }
        const byKit = filled.get(kitId) ?? new Map<string, FilledContribution[]>();
        const list = byKit.get(id) ?? [];
        list.push(entry);
        byKit.set(id, list);
        filled.set(kitId, byKit);
      }
    }
  }
  const plans: KitContributionsPlan[] = [];
  for (const kit of [...kits.values()].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))) {
    for (const end of CONTRIBUTION_ENDS) {
      const ids = Object.entries(kit.contributions).filter(([, spec]) => spec.ends.includes(end)).map(([id]) => id).sort();
      if (ids.length === 0) continue;
      const map = new Map<string, readonly FilledContribution[]>();
      for (const id of ids) {
        const list = [...(filled.get(kit.id)?.get(id) ?? [])].sort((left, right) => (left.pluginId < right.pluginId ? -1 : left.pluginId > right.pluginId ? 1 : 0));
        map.set(id, list);
      }
      plans.push({ kitId: kit.id, end, ids: map });
    }
  }
  return plans;
}

/** JSON → TS 字面量（4 空格缩进，续行按 indent 对齐）。 */
function jsonLiteral(value: unknown, indent: number): string {
  const text = JSON.stringify(value, null, 4);
  const pad = " ".repeat(indent);
  return text.split("\n").map((line, index) => (index === 0 ? line : `${pad}${line}`)).join("\n");
}

export function renderContributionsModule(plan: KitContributionsPlan): string {
  const relative = contributionsFileRelative(plan.end, plan.kitId);
  const dir = path.posix.dirname(relative);
  const imports: string[] = [];
  const body: string[] = [];
  for (const [id, filledList] of plan.ids) {
    const items: string[] = [];
    for (const filledEntry of filledList) {
      if (filledEntry.kind === "module") {
        const binding = `${filledEntry.pluginId}_${id}`;
        let specifier = path.posix.relative(dir, filledEntry.file.replace(/\.ts$/u, ""));
        if (!specifier.startsWith(".")) specifier = `./${specifier}`;
        imports.push(`import { ${filledEntry.exportName} as ${binding} } from "${specifier}";`);
        items.push(`        { pluginId: ${JSON.stringify(filledEntry.pluginId)}, value: ${binding} },`);
      } else {
        items.push(`        { pluginId: ${JSON.stringify(filledEntry.pluginId)}, value: ${jsonLiteral(filledEntry.value, 8)} },`);
      }
    }
    body.push(`    /** 贡献点 "${id}"：${filledList.length} 个插件填充（按插件 id 排序）。 */`);
    body.push(items.length === 0 ? `    ${id}: [],` : `    ${id}: [\n${items.join("\n")}\n    ],`);
  }
  const lines = [
    `/** AUTO-GENERATED by apps/server/tools/plugin-codegen/cli.ts from apps/kits/${plan.kitId}/kit.json (contributions) + apps/plugins/<id>/plugin.json (contributes). Do not edit. */`,
    ...(imports.length > 0 ? [...imports, ""] : []),
    `/** kit "${plan.kitId}" 在 ${plan.end} 端收到的贡献：贡献点 id → 填充列表；由 codegen:plugins 刷新（docs/KIT.md §4）。 */`,
    "export const KIT_CONTRIBUTIONS = {",
    ...body,
    "} as const;",
    "",
  ];
  return lines.join("\n");
}
