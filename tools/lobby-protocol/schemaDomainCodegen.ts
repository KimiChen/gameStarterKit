/**
 * 协议 schema → `apps/shared/src/protocol/lobbyRpc/domains/<域>.ts`（BF2）。
 *
 * 生成物包含四样东西，全部由 `apps/shared/schema/protocols/C2S/*.json` 决定：
 *  1. 路由名 as const 表；
 *  2. `types` 段里每个具名类型的 TS 声明（object → interface，其余 → type 别名）；
 *  3. 每条 API / 推送的运行时 validator（request / response / push.data 三个路径根）；
 *  4. `export default defineLobbyRpcDomain({...})` descriptor（路由、模式、错误码、推送）。
 *
 * **与非生成 shared 代码的唯一接口**是 `check` / `assert`：两者都只引用一个**具名函数**，
 * 函数体留在 kit api 面 / economy / `lobbyRpc/checks/<域>.ts`。生成物绝不内联那些实现——
 * 内联等于把真源搬回生成物，那就又变成两处真源了。
 *
 * 生成物的形态约束来自 `astReader.ts`：顶层只允许 import / 接口 / type 别名 / const /
 * 函数声明 / export default。因此所有嵌套解析都写成顶层 `function parse<类型>(input, path)`
 * 或内联 IIFE，⛔ 不生成 class / enum / 顶层副作用。
 */
import fs from "node:fs";
import path from "node:path";
import {
  parseProtocolLanguage,
  parseProtocolSchema,
  type ProtocolCheckRef,
  type ProtocolDomainDeclaration,
  type ProtocolLanguage,
  type ProtocolSchemaApi,
  type ProtocolSchemaType,
} from "../../apps/shared/src/schema/index";

const SCHEMA_ROOT = "apps/shared/schema/protocols";
const DOMAIN_ROOT = "apps/shared/src/protocol/lobbyRpc/domains";
const DEFAULT_ARRAY_MAX = 4096;

export type SchemaDomainArtifact = {
  readonly relative: string;
  readonly content: string;
};

function fail(message: string): never {
  throw new Error(`[schema-codegen] ${message}`);
}

// ---------------------------------------------------------------- 路径表达式

/**
 * 校验路径在生成物里的写法。三种模式：
 *  - `literal`  纯字面量（`"payload"` / `"response"`），可继续拼静态后缀；
 *  - `template` 模板串（`` `response.tiles[${i}]` ``），含运行时下标 / 键；
 *  - `raw`      已是表达式（`parse<类型>` 里的 `path` 参数），拼接时降级成模板串。
 */
type PathRef = {
  readonly text: string;
  readonly mode: "literal" | "template" | "raw";
};

const literalPath = (text: string): PathRef => ({ text, mode: "literal" });

function pathChild(parent: PathRef, name: string): PathRef {
  if (parent.mode === "literal")
    return { text: `${parent.text}.${name}`, mode: "literal" };
  if (parent.mode === "template")
    return { text: `${parent.text}.${name}`, mode: "template" };
  return { text: `\${${parent.text}}.${name}`, mode: "template" };
}

function pathDynamic(
  parent: PathRef,
  suffix: (head: string) => string,
): PathRef {
  const head = parent.mode === "raw" ? `\${${parent.text}}` : parent.text;
  return { text: suffix(head), mode: "template" };
}

function pathCode(ref: PathRef): string {
  if (ref.mode === "literal") return JSON.stringify(ref.text);
  if (ref.mode === "template") return `\`${ref.text}\``;
  return ref.text;
}

// ---------------------------------------------------------------- TS 类型渲染

/** `ref` 指向的 TS 名字：外部类型可被 `tsType` 改名，其余就是 `types` 表里的键。 */
function refTypeName(
  type: ProtocolSchemaType,
  types: ReadonlyMap<string, ProtocolSchemaType>,
): string {
  const name = type.ref as string;
  const target = types.get(name);
  if (target === undefined)
    fail(`ref ${name} 未被解析（解析器应已 fail-fast）`);
  return target.kind === "external" ? (target.tsType ?? name) : name;
}

function tsTypeOf(
  type: ProtocolSchemaType,
  types: ReadonlyMap<string, ProtocolSchemaType>,
  readonly: boolean,
): string {
  const base = ((): string => {
    switch (type.kind) {
      case "boolean":
        return "boolean";
      case "integer":
      case "number":
        return "number";
      case "string":
        return "string";
      case "json":
        return "unknown";
      case "enum":
        return (type.members ?? [])
          .map((member) => JSON.stringify(member))
          .join(" | ");
      case "ref":
        return refTypeName(type, types);
      case "external":
        return type.tsType ?? fail("external 类型缺少 tsType");
      case "array": {
        const inner = tsTypeOf(type.items as ProtocolSchemaType, types, false);
        return `${readonly ? "readonly " : ""}${inner}[]`;
      }
      case "record": {
        const inner = tsTypeOf(type.values as ProtocolSchemaType, types, false);
        // ⛔ 不加外层 `readonly`：`readonly` 前缀只对数组/元组字面量合法，
        // 对象字面量上会被 TS 拒（1354）。索引签名自己已经是 readonly。
        return `{ readonly [key: string]: ${inner} }`;
      }
      case "object": {
        const fields = (type.fields ?? []).map(
          (field) =>
            `${field.readonly ? "readonly " : ""}${field.name}${field.required ? "" : "?"}: ${tsTypeOf(field.type, types, field.readonly)}`,
        );
        return `{ ${fields.join("; ")} }`;
      }
      default:
        return fail(
          `unsupported schema type ${(type as { kind: string }).kind}`,
        );
    }
  })();
  if (type.nullable !== true) return base;
  return type.kind === "object" ||
    type.kind === "record" ||
    type.kind === "array"
    ? `(${base}) | null`
    : `${base} | null`;
}

/** 具名类型的顶层声明：object 走 interface（idempotent-write 的 clientReqId 闸要读字面字段）。 */
function renderTypeDeclaration(
  name: string,
  type: ProtocolSchemaType,
  types: ReadonlyMap<string, ProtocolSchemaType>,
): string {
  if (type.kind !== "object")
    return `export type ${name} = ${tsTypeOf(type, types, false)}\n`;
  if (type.check !== undefined) {
    fail(
      `${name}: 形状由具名校验器产出的类型请用 \`external\` 声明，⛔ 不要用带 check 的 object（TS 声明会与实际形状分叉）`,
    );
  }
  const fields = type.fields ?? [];
  if (fields.length === 0) {
    // 空载荷必须是「没有任何键」而不是「任意键」：`{}` 会接受 `{ anything: 1 }`。
    return `export interface ${name} {\n    readonly [key: string]: never\n}\n`;
  }
  const lines = fields.map((field) => {
    const prefix = field.readonly ? "    readonly " : "    ";
    return `${prefix}${field.name}${field.required ? "" : "?"}: ${tsTypeOf(field.type, types, field.readonly)}`;
  });
  return `export interface ${name} {\n${lines.join("\n")}\n}\n`;
}

// ---------------------------------------------------------------- validator 渲染

type RenderContext = {
  readonly types: ReadonlyMap<string, ProtocolSchemaType>;
};

/**
 * 与 `check` 互斥的约束键。
 *
 * `check` 的语义是「这个节点的**形状**由那个具名校验器独占产出」，因此同节点上再写
 * `minLength` / `items` / `ref` 之类的声明式约束必然是**死声明**：生成物只会渲染
 * `check.fn(raw, path)`，那些约束不会被消费。解析器看不到这一层（它只管语言 ↔ 解析器），
 * 所以在生成器这里 fail-fast —— 否则 schema 会写着限长而 wire 上不生效。
 */
const CHECK_EXCLUSIVE_KEYS = [
  "min",
  "max",
  "minLength",
  "maxLength",
  "pattern",
  "patternCode",
  "members",
  "enumCode",
  "fields",
  "items",
  "minItems",
  "maxItems",
  "sizeCode",
  "values",
  "keyPattern",
  "keyPatternCode",
  "maxKeys",
  "ref",
  "from",
  "tsType",
] as const;

function assertCheckOwnsShape(type: ProtocolSchemaType, label: string): void {
  if (type.check === undefined) return;
  const source = type as unknown as { [key: string]: unknown };
  const conflicting = CHECK_EXCLUSIVE_KEYS.filter(
    (key) => source[key] !== undefined,
  );
  if (conflicting.length > 0) {
    fail(
      `${label}: 声明了 \`check\` 就不能再声明 ${conflicting.join(" / ")}` +
        "（形状由那个具名校验器独占，多写的约束不会被生成物消费）",
    );
  }
}

/** 引用收集：外部类型（type-only import）与具名校验器（value import）按模块归集。 */
class Imports {
  readonly typeModules = new Map<string, Set<string>>();
  readonly valueModules = new Map<string, Set<string>>();
  readonly http = new Set<string>(["type RuntimeValidator"]);
  readonly primitives = new Set<string>();

  type(module: string, name: string): void {
    const names = this.typeModules.get(module) ?? new Set<string>();
    names.add(name);
    this.typeModules.set(module, names);
  }

  checkRef(ref: ProtocolCheckRef): void {
    const names = this.valueModules.get(ref.from) ?? new Set<string>();
    names.add(ref.fn);
    this.valueModules.set(ref.from, names);
  }
}

function regexLiteral(source: string): string {
  return `/${source.replace(/\//g, "\\/")}/u`;
}

/** 单节点解析（不含 `assert` / `nullable` 包装）。 */
function renderCore(
  type: ProtocolSchemaType,
  raw: string,
  at: PathRef,
  ctx: RenderContext,
  imports: Imports,
  field?: { readonly record: string; readonly name: string },
): string {
  // 具名校验器接管该节点的产出：形状由那个函数拥有，本层只声明「谁产出它」。
  if (type.check !== undefined) {
    assertCheckOwnsShape(type, `${type.kind}@${at.text}`);
    imports.checkRef(type.check);
    return `${type.check.fn}(${raw}, ${pathCode(at)})`;
  }
  switch (type.kind) {
    case "boolean": {
      if (field !== undefined) {
        imports.primitives.add("boolField");
        return `boolField(${field.record}, ${JSON.stringify(field.name)})`;
      }
      imports.primitives.add("boolAt");
      return `boolAt(${raw}, ${pathCode(at)})`;
    }
    case "integer": {
      imports.http.add("finiteInteger");
      return `finiteInteger(${raw}, ${pathCode(at)}, ${type.min ?? "Number.MIN_SAFE_INTEGER"}, ${type.max ?? "Number.MAX_SAFE_INTEGER"})`;
    }
    case "number": {
      imports.http.add("finiteNumber");
      return `finiteNumber(${raw}, ${pathCode(at)}, ${type.min ?? "-Infinity"}, ${type.max ?? "Infinity"})`;
    }
    case "string": {
      imports.http.add("boundedString");
      const min = type.minLength ?? 0;
      const max = type.maxLength ?? 1024;
      if (type.pattern === undefined)
        return `boundedString(${raw}, ${pathCode(at)}, ${min}, ${max})`;
      imports.http.add("WireValidationError");
      return (
        `((v) => { const parsed = boundedString(v, ${pathCode(at)}, ${min}, ${max}); ` +
        `if (!${regexLiteral(type.pattern)}.test(parsed)) throw new WireValidationError(${JSON.stringify(type.patternCode)}, ${pathCode(at)}); ` +
        `return parsed; })(${raw})`
      );
    }
    case "json":
      return raw;
    case "enum": {
      imports.http.add("WireValidationError");
      const members = type.members ?? [];
      const test = members
        .map((member) => `v !== ${JSON.stringify(member)}`)
        .join(" && ");
      return (
        `((v) => { if (${test}) throw new WireValidationError(${JSON.stringify(type.enumCode)}, ${pathCode(at)}); ` +
        `return v as ${tsTypeOf(type, ctx.types, false)}; })(${raw})`
      );
    }
    case "ref": {
      const name = type.ref as string;
      const target = ctx.types.get(name) as ProtocolSchemaType;
      // external 声明上的 `check` 就是该类型的运行时校验器（解析器保证它存在）。
      if (target.check !== undefined) {
        imports.checkRef(target.check);
        return `${target.check.fn}(${raw}, ${pathCode(at)})`;
      }
      if (target.kind === "external") fail(`external 类型 ${name} 缺少 check`);
      return `parse${name}(${raw}, ${pathCode(at)})`;
    }
    case "external": {
      // 不可达：`external` 恒带 `check`（解析器强制），已被上面的具名校验器分支接管；
      // 具名 external 类型本身也不进本函数（renderTypeFunction 跳过它们，只按 `ref` 引用）。
      // 留成分支是为了让「将来有人放松那条解析规则」在这里立刻炸，而不是静默产出无校验的值。
      return fail("external 类型的值必须由 `check` 产出，本分支不应被走到");
    }
    case "array": {
      imports.primitives.add("boundedArray");
      const min = type.minItems ?? 0;
      const max = type.maxItems ?? DEFAULT_ARRAY_MAX;
      const code = JSON.stringify(type.sizeCode ?? "WIRE_ARRAY");
      const item = renderValue(
        type.items as ProtocolSchemaType,
        "item",
        pathDynamic(at, (head) => `${head}[\${i}]`),
        ctx,
        imports,
      );
      return `boundedArray(${raw}, ${pathCode(at)}, ${min}, ${max}, ${code}).map((item, i) => ${item})`;
    }
    case "record": {
      imports.primitives.add("rpcRecord");
      const value = renderValue(
        type.values as ProtocolSchemaType,
        "entries[key]",
        pathDynamic(at, (head) => `${head}.\${key}`),
        ctx,
        imports,
      );
      const lines = [
        `((v) => { const entries = rpcRecord(v, ${pathCode(at)}); const keys = Object.keys(entries);`,
      ];
      if (type.maxKeys !== undefined) {
        imports.http.add("WireValidationError");
        lines.push(
          ` if (keys.length > ${type.maxKeys}) throw new WireValidationError(${JSON.stringify(type.sizeCode ?? "WIRE_KEYS")}, ${pathCode(at)});`,
        );
      }
      if (type.keyPattern !== undefined) {
        imports.http.add("WireValidationError");
        lines.push(
          ` for (const key of keys) if (!${regexLiteral(type.keyPattern)}.test(key)) throw new WireValidationError(${JSON.stringify(type.keyPatternCode ?? "WIRE_KEYS")}, ${pathCode(at)});`,
        );
      }
      lines.push(
        ` const out: Record<string, ${tsTypeOf(type.values as ProtocolSchemaType, ctx.types, false)}> = {};`,
      );
      lines.push(` for (const key of keys) out[key] = ${value};`);
      lines.push(` return out; })(${raw})`);
      return lines.join("");
    }
    case "object": {
      imports.http.add("assertExactKeys");
      imports.primitives.add("rpcRecord");
      const fields = type.fields ?? [];
      const required = fields.filter((item) => item.required);
      const optional = fields.filter((item) => !item.required);
      const lines = [
        `((v) => { const value = rpcRecord(v, ${pathCode(at)});`,
        ` assertExactKeys(value, [${required.map((item) => JSON.stringify(item.name)).join(", ")}], [${optional.map((item) => JSON.stringify(item.name)).join(", ")}], ${pathCode(at)});`,
        ` const out: ${tsTypeOf(type, ctx.types, false)} = {`,
      ];
      for (const item of required) {
        const rendered = renderValue(
          item.type,
          `value.${item.name}`,
          pathChild(at, item.name),
          ctx,
          imports,
          {
            record: "value",
            name: item.name,
          },
        );
        lines.push(`  ${item.name}: ${rendered},`);
      }
      lines.push(" };");
      for (const item of optional) {
        const rendered = renderValue(
          item.type,
          `value.${item.name}`,
          pathChild(at, item.name),
          ctx,
          imports,
          {
            record: "value",
            name: item.name,
          },
        );
        lines.push(
          ` if (value.${item.name} !== undefined) out.${item.name} = ${rendered};`,
        );
      }
      lines.push(` return out; })(${raw})`);
      return lines.join("");
    }
    default:
      return fail(`unsupported schema kind ${(type as { kind: string }).kind}`);
  }
}

/** 单节点解析 + `assert` 不变量。 */
function renderValueWithAsserts(
  type: ProtocolSchemaType,
  raw: string,
  at: PathRef,
  ctx: RenderContext,
  imports: Imports,
  field?: { readonly record: string; readonly name: string },
): string {
  const asserts = type.assert ?? [];
  if (asserts.length === 0)
    return renderCore(type, raw, at, ctx, imports, field);
  for (const ref of asserts) imports.checkRef(ref);
  const calls = asserts
    .map((ref) => `${ref.fn}(parsed, ${pathCode(at)})`)
    .join("; ");
  return `((v) => { const parsed = ${renderCore(type, "v", at, ctx, imports, field)}; ${calls}; return parsed; })(${raw})`;
}

/** 单节点解析 + `assert` + `nullable`。 */
function renderValue(
  type: ProtocolSchemaType,
  raw: string,
  at: PathRef,
  ctx: RenderContext,
  imports: Imports,
  field?: { readonly record: string; readonly name: string },
): string {
  if (type.nullable !== true)
    return renderValueWithAsserts(type, raw, at, ctx, imports, field);
  return `((v) => (v === null ? null : ${renderValueWithAsserts(type, "v", at, ctx, imports, field)}))(${raw})`;
}

/** 具名类型的顶层解析函数（`parse<类型名>`）：嵌套引用与载荷入口共用同一份实现。 */
function renderTypeFunction(
  name: string,
  type: ProtocolSchemaType,
  ctx: RenderContext,
  imports: Imports,
): string {
  const root: PathRef = { text: "path", mode: "raw" };
  // 返回类型写**具名类型**而不是 `tsTypeOf` 的内联展开：具名类型就是这个函数产出的东西，
  // 展开写会让签名与 interface 声明分叉（空对象还会退化成 `{ }` 这种什么都收的类型）。
  const lines = [
    `function parse${name}(input: unknown, path: string): ${name} {`,
  ];
  if (type.kind === "object" && type.check === undefined) {
    imports.http.add("assertExactKeys");
    imports.primitives.add("rpcRecord");
    const fields = type.fields ?? [];
    const required = fields.filter((item) => item.required);
    const optional = fields.filter((item) => !item.required);
    lines.push("    const value = rpcRecord(input, path)");
    lines.push(
      `    assertExactKeys(value, [${required.map((item) => JSON.stringify(item.name)).join(", ")}], [${optional.map((item) => JSON.stringify(item.name)).join(", ")}], path)`,
    );
    lines.push(`    const out: ${name} = {`);
    for (const item of required) {
      const rendered = renderValue(
        item.type,
        `value.${item.name}`,
        pathChild(root, item.name),
        ctx,
        imports,
        {
          record: "value",
          name: item.name,
        },
      );
      lines.push(`        ${item.name}: ${rendered},`);
    }
    lines.push("    }");
    for (const item of optional) {
      const rendered = renderValue(
        item.type,
        `value.${item.name}`,
        pathChild(root, item.name),
        ctx,
        imports,
        {
          record: "value",
          name: item.name,
        },
      );
      lines.push(
        `    if (value.${item.name} !== undefined) out.${item.name} = ${rendered}`,
      );
    }
    for (const ref of type.assert ?? []) {
      imports.checkRef(ref);
      lines.push(`    ${ref.fn}(out, path)`);
    }
    lines.push("    return out");
  } else {
    lines.push(`    return ${renderValue(type, "input", root, ctx, imports)}`);
  }
  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------- 载荷 / descriptor

/** 载荷路径根：request → `payload`，response → `response`，push.data → `push.data`。 */
type PayloadRoot = { readonly path: string; readonly wrap: string | null };

const REQUEST_ROOT: PayloadRoot = { path: "payload", wrap: null };
const RESPONSE_ROOT: PayloadRoot = { path: "response", wrap: null };
const PUSH_ROOT: PayloadRoot = { path: "push.data", wrap: "pushRecord" };

/**
 * 载荷 validator。
 *
 * 载荷必须是 `ref` 到具名类型：这样 request/response/push.data 的形状永远只有一个声明点，
 * `registry.generated.ts` 也才能按名字 import 到 payload 类型（AST 读取要求单一类型标识符）。
 */
function renderPayloadValidator(
  name: string,
  type: ProtocolSchemaType,
  root: PayloadRoot,
  ctx: RenderContext,
  imports: Imports,
): string {
  if (type.kind !== "ref")
    fail(`${name}: 载荷必须声明为 \`ref\` 到具名类型，实际是 \`${type.kind}\``);
  if (type.nullable === true)
    fail(`${name}: 载荷不得可空（wire 载荷恒为普通记录）`);
  const target = ctx.types.get(type.ref as string) as ProtocolSchemaType;
  const at = literalPath(root.path);
  let raw = "input";
  if (root.wrap !== null) {
    imports.primitives.add(root.wrap);
    raw = `${root.wrap}(input, ${JSON.stringify(root.path)})`;
  }
  let call: string;
  if (target.check !== undefined) {
    imports.checkRef(target.check);
    call = `${target.check.fn}(${raw}, ${pathCode(at)})`;
  } else if (target.kind === "external") {
    fail(`external 类型 ${type.ref} 缺少 check`);
  } else {
    call = `parse${type.ref as string}(${raw}, ${pathCode(at)})`;
  }
  const returns = tsTypeOf(type, ctx.types, false);
  const asserts = type.assert ?? [];
  if (asserts.length === 0) {
    return `export const ${name}: RuntimeValidator<${returns}> = (input) => ${call}`;
  }
  const lines = [
    `export const ${name}: RuntimeValidator<${returns}> = (input) => {`,
    `    const parsed = ${call}`,
  ];
  for (const ref of asserts) {
    imports.checkRef(ref);
    lines.push(`    ${ref.fn}(parsed, ${pathCode(at)})`);
  }
  lines.push("    return parsed", "}");
  return lines.join("\n");
}

function pushValidatorName(domain: string, type: string): string {
  const pascal = (value: string): string =>
    value.charAt(0).toUpperCase() + value.slice(1);
  return `validate${pascal(domain)}${pascal(type.slice(type.indexOf(".") + 1))}Push`;
}

function routeMember(route: string): string {
  const method = route.slice(route.indexOf(".") + 1);
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function domainPrefix(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function builderFor(mode: ProtocolSchemaApi["mode"]): string {
  if (mode === "query") return "defineRpcQuery";
  if (mode === "natural-write") return "defineRpcNaturalWrite";
  return "defineRpcIdempotentWrite";
}

function renderDomain(
  document: ProtocolDomainDeclaration,
  source: string,
  language: ProtocolLanguage,
): string {
  const domain = document.domain;
  const ctx: RenderContext = { types: document.types };
  const imports = new Imports();

  const typeFunctions: string[] = [];
  const declarations: string[] = [];
  for (const [name, type] of document.types) {
    if (type.kind === "external") {
      imports.type(type.from as string, type.tsType ?? name);
      continue;
    }
    declarations.push(renderTypeDeclaration(name, type, document.types));
    typeFunctions.push(renderTypeFunction(name, type, ctx, imports));
  }

  const payloadValidators: string[] = [];
  for (const api of document.apis) {
    payloadValidators.push(
      renderPayloadValidator(
        `validate${api.name}Req`,
        api.request,
        REQUEST_ROOT,
        ctx,
        imports,
      ),
    );
    payloadValidators.push(
      renderPayloadValidator(
        `validate${api.name}Res`,
        api.response,
        RESPONSE_ROOT,
        ctx,
        imports,
      ),
    );
  }
  for (const push of document.pushes) {
    payloadValidators.push(
      renderPayloadValidator(
        pushValidatorName(domain, push.type),
        push.data,
        PUSH_ROOT,
        ctx,
        imports,
      ),
    );
  }

  const builders = new Set<string>(["defineLobbyRpcDomain"]);
  if (document.pushes.length > 0) builders.add("defineLobbyPush");
  for (const api of document.apis) builders.add(builderFor(api.mode));

  const lines: string[] = [
    "/** AUTO-GENERATED from apps/shared/schema/protocols/C2S/*.json. Do not edit. */",
    `/** Source: ${source}; validators are generated, complex leaf checks stay in ../checks/. */`,
    `import { ${[...imports.http].sort().join(", ")} } from "../../http";`,
  ];
  if (imports.primitives.size > 0) {
    lines.push(
      `import { ${[...imports.primitives].sort().join(", ")} } from "../primitives";`,
    );
  }
  lines.push(
    `import { ${[...builders].sort().join(", ")} } from "../defineDomain";`,
  );
  for (const module of [...imports.typeModules.keys()].sort()) {
    const names = [...(imports.typeModules.get(module) as Set<string>)].sort();
    lines.push(`import type { ${names.join(", ")} } from "${module}";`);
  }
  for (const module of [...imports.valueModules.keys()].sort()) {
    const names = [...(imports.valueModules.get(module) as Set<string>)].sort();
    lines.push(`import { ${names.join(", ")} } from "${module}";`);
  }

  lines.push(
    "",
    `/** ${domain} 域路由名 */`,
    `export const ${domainPrefix(domain)}Rpc = {`,
  );
  for (const api of document.apis) {
    lines.push(`    ${routeMember(api.route)}: ${JSON.stringify(api.route)},`);
  }
  lines.push("} as const;", "");
  for (const declaration of declarations) lines.push(declaration);
  for (const fn of typeFunctions) lines.push(fn, "");
  for (const validator of payloadValidators) lines.push(validator, "");

  lines.push(
    "export default defineLobbyRpcDomain({",
    `    domain: ${JSON.stringify(domain)},`,
  );
  lines.push(`    contractVersion: ${document.contractVersion},`);
  lines.push(`    errorCodes: ${JSON.stringify(document.errorCodes)},`);
  if (document.ownsOperationGroups.length > 0) {
    lines.push(
      `    ownsOperationGroups: ${JSON.stringify(document.ownsOperationGroups)},`,
    );
  }
  if (Object.keys(document.exposesOperationGroupTo).length > 0) {
    lines.push(
      `    exposesOperationGroupTo: ${JSON.stringify(document.exposesOperationGroupTo)},`,
    );
  }
  if (document.pushes.length === 0) {
    lines.push("    pushes: [],");
  } else {
    lines.push("    pushes: [");
    for (const push of document.pushes) {
      lines.push(
        `        defineLobbyPush(${JSON.stringify(push.key)}, ${JSON.stringify(push.type)}, ${pushValidatorName(domain, push.type)}),`,
      );
    }
    lines.push("    ],");
  }
  lines.push("    routes: [");
  for (const api of document.apis) {
    const options = [
      `request: validate${api.name}Req`,
      `response: validate${api.name}Res`,
    ];
    if (api.contractVersion !== language.defaults.contractVersion)
      options.push(`contractVersion: ${api.contractVersion}`);
    if (api.operationGroup !== undefined)
      options.push(`operationGroup: ${JSON.stringify(api.operationGroup)}`);
    if (api.inspectable === true) options.push("inspectable: true");
    if (api.inspectsOperationGroup !== undefined) {
      options.push(
        `inspectsOperationGroup: ${JSON.stringify(api.inspectsOperationGroup)}`,
      );
    }
    lines.push(
      `        ${builderFor(api.mode)}(${domainPrefix(domain)}Rpc.${routeMember(api.route)}, { ${options.join(", ")} }),`,
    );
  }
  lines.push("    ],", "});", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------- 入口

function readDomainDocuments(repositoryRoot: string): {
  readonly documents: readonly ProtocolDomainDeclaration[];
  readonly language: ProtocolLanguage;
} {
  const schemaRoot = path.join(repositoryRoot, SCHEMA_ROOT);
  const languagePath = path.join(schemaRoot, "schema-v1.json");
  if (!fs.existsSync(languagePath))
    fail(`${SCHEMA_ROOT}/schema-v1.json is missing`);
  const language = parseProtocolLanguage(
    JSON.parse(fs.readFileSync(languagePath, "utf8")),
  );
  const c2s = path.join(schemaRoot, "C2S");
  if (!fs.existsSync(c2s)) fail(`${SCHEMA_ROOT}/C2S is missing`);
  const documents = fs
    .readdirSync(c2s)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const source = path.posix.join(SCHEMA_ROOT, "C2S", name);
      const value = JSON.parse(
        fs.readFileSync(path.join(c2s, name), "utf8"),
      ) as unknown;
      const document = parseProtocolSchema(value, { language, source });
      if (document.kind !== "domain")
        fail(`${source} must be a domain declaration`);
      return document;
    });
  return { documents, language };
}

export function renderSchemaDomainArtifacts(
  repositoryRoot: string,
): readonly SchemaDomainArtifact[] {
  const { documents, language } = readDomainDocuments(repositoryRoot);
  return documents.map((document) => ({
    relative: `${DOMAIN_ROOT}/${document.domain}.ts`,
    content: renderDomain(
      document,
      `${SCHEMA_ROOT}/C2S/${document.domain}.json`,
      language,
    ),
  }));
}

export function assertSchemaDomainArtifactsFresh(repositoryRoot: string): void {
  const artifacts = renderSchemaDomainArtifacts(repositoryRoot);
  const expected = new Set(artifacts.map((artifact) => artifact.relative));
  const stale: string[] = [];
  for (const artifact of artifacts) {
    const file = path.join(repositoryRoot, artifact.relative);
    if (!fs.existsSync(file)) stale.push(`${artifact.relative} (missing)`);
    else if (fs.readFileSync(file, "utf8") !== artifact.content)
      stale.push(artifact.relative);
  }
  const domainDirectory = path.join(repositoryRoot, DOMAIN_ROOT);
  if (fs.existsSync(domainDirectory)) {
    for (const entry of fs.readdirSync(domainDirectory, {
      withFileTypes: true,
    })) {
      const relative = `${DOMAIN_ROOT}/${entry.name}`;
      if (!expected.has(relative)) stale.push(`${relative} (extra)`);
    }
  }
  if (stale.length)
    throw new Error(
      `[schema-codegen] generated protocol domains are stale: ${stale.join(", ")}`,
    );
}

export function writeSchemaDomainArtifacts(
  repositoryRoot: string,
  artifacts: readonly SchemaDomainArtifact[] = renderSchemaDomainArtifacts(
    repositoryRoot,
  ),
): readonly string[] {
  const changed: string[] = [];
  for (const artifact of artifacts) {
    const file = path.join(repositoryRoot, artifact.relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (
      fs.existsSync(file) &&
      fs.readFileSync(file, "utf8") === artifact.content
    )
      continue;
    fs.writeFileSync(file, artifact.content, "utf8");
    changed.push(artifact.relative);
  }
  return changed;
}
