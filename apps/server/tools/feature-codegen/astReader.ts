/**
 * Lobby RPC domain descriptor 的语法读取器（Non-intrusive §4.1/§4.2 阶段 3）。
 *
 * ⛔ 生成器绝不执行 domain 文件——只做 TS 语法读取（先例：gameplay-codegen/wireParser.ts）。
 * 因此 `domains/<域>.ts` 与 `coreErrors.ts` 顶层被约束为可静态读取的形态：
 *   import / 接口（含 type 别名）/ const 声明（路由名 as const 表、annotated validator、
 *   define* 调用）/ validator 函数声明 / export default defineLobbyRpcDomain(...)。
 * computed property、spread、define* 之外的函数调用、顶层副作用（表达式语句）、class、
 * enum、let/var 一律点名拒绝。validator 函数体内部不受限（逐字迁移的既有实现随意）。
 *
 * 类型解析约定：
 *  - 路由的 request/response 必须引用**本文件内导出**的 validator——
 *    `const v: RuntimeValidator<X> = ...` 或 `function v(...): X` 两种形态；
 *  - X 必须是单一类型标识符：本文件导出的接口/别名，或本文件 import 进来的类型
 *    （生成器会把 import specifier 重定位到 registry 所在目录）；
 *  - idempotent-write 路由的 X 必须是本文件声明的接口，且字面含必选 `clientReqId: string`。
 */
import ts from "typescript";

export type TypeRef = {
  readonly name: string;
  /** null = 在本模块内声明；否则为该模块 import 该类型时的原始 specifier。 */
  readonly specifier: string | null;
};

export type RouteDeclaration = {
  readonly type: string;
  readonly mode: "query" | "natural-write" | "idempotent-write";
  readonly requestValidator: string;
  readonly requestType: TypeRef;
  readonly responseValidator: string;
  readonly responseType: TypeRef;
  /** 契约版本（§6.11；缺省 1，正整数字面量）。 */
  readonly contractVersion: number;
  readonly operationGroup: string | null;
  readonly inspectable: boolean;
  readonly inspectsOperationGroup: string | null;
};

export type PushDeclaration = {
  readonly key: string;
  readonly type: string;
  readonly validator: string;
  readonly dataType: TypeRef;
};

export type DomainDeclaration = {
  readonly domain: string;
  readonly errorCodes: readonly string[];
  /** 本域拥有的 operation group（§6.13 受拥有 id；跨域重复由 lib 拒绝）。 */
  readonly ownsOperationGroups: readonly string[];
  /** group → 获准跨域查询该组的域列表（§6.13 exposesOperationGroupTo）。 */
  readonly exposesOperationGroupTo: { readonly [group: string]: readonly string[] };
  readonly pushes: readonly PushDeclaration[];
  readonly routes: readonly RouteDeclaration[];
};

export type CoreErrorsDeclaration = {
  readonly coreErrorCodes: readonly string[];
  readonly errorCodeOrder: readonly string[];
  readonly pushes: readonly PushDeclaration[];
};

const MODE_BY_BUILDER = new Map<string, RouteDeclaration["mode"]>([
  ["defineRpcQuery", "query"],
  ["defineRpcNaturalWrite", "natural-write"],
  ["defineRpcIdempotentWrite", "idempotent-write"],
]);

function fail(label: string, message: string): never {
  throw new Error(`[feature-codegen] ${label}: ${message}`);
}

function isExported(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function unwrapAsConst(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isAsExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

type ValidatorInfo = { readonly exported: boolean; readonly typeName: string | null };

type ModuleIndex = {
  readonly imports: ReadonlyMap<string, string>;
  readonly interfaces: ReadonlyMap<string, { readonly exported: boolean; readonly node: ts.InterfaceDeclaration }>;
  readonly typeAliases: ReadonlyMap<string, { readonly exported: boolean }>;
  readonly validators: ReadonlyMap<string, ValidatorInfo>;
  readonly routeConsts: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly defaultExport: ts.Expression | null;
};

/** 顶层语法约束 + 模块索引（imports/接口/validator/路由名 const/export default）。 */
function indexModule(sourceFile: ts.SourceFile, label: string): ModuleIndex {
  const imports = new Map<string, string>();
  const interfaces = new Map<string, { exported: boolean; node: ts.InterfaceDeclaration }>();
  const typeAliases = new Map<string, { exported: boolean }>();
  const validators = new Map<string, ValidatorInfo>();
  const routeConsts = new Map<string, Map<string, string>>();
  let defaultExport: ts.Expression | null = null;

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(specifier)) fail(label, "import specifier 必须是字符串字面量");
      const clause = statement.importClause;
      if (!clause) fail(label, "不允许裸副作用 import");
      if (clause.name) fail(label, "domain 文件不允许 default import");
      const bindings = clause.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) fail(label, "domain 文件不允许 namespace import");
      for (const element of bindings.elements) {
        imports.set(element.name.text, specifier.text);
      }
      continue;
    }
    if (ts.isInterfaceDeclaration(statement)) {
      interfaces.set(statement.name.text, { exported: isExported(statement), node: statement });
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement)) {
      typeAliases.set(statement.name.text, { exported: isExported(statement) });
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      if (!statement.name) fail(label, "顶层函数声明必须具名");
      const returnType = statement.type;
      validators.set(statement.name.text, {
        exported: isExported(statement),
        typeName: returnType && ts.isTypeReferenceNode(returnType) && ts.isIdentifier(returnType.typeName)
          ? returnType.typeName.text
          : null,
      });
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) fail(label, "不允许 export = 形态");
      if (defaultExport) fail(label, "只允许一个 export default");
      defaultExport = statement.expression;
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      // 命名 re-export 无副作用，放行（不参与 descriptor 解析）。
      continue;
    }
    if (!ts.isVariableStatement(statement)) {
      fail(
        label,
        "顶层只允许 import/接口/type 别名/const 声明/validator 函数声明/export default，"
        + `不允许：${ts.SyntaxKind[statement.kind]}`,
      );
    }
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
      fail(label, "顶层变量只允许 const 声明（禁 let/var）");
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) fail(label, "顶层 const 不允许解构声明");
      const name = declaration.name.text;
      const annotation = declaration.type;
      if (annotation && ts.isTypeReferenceNode(annotation)
        && ts.isIdentifier(annotation.typeName) && annotation.typeName.text === "RuntimeValidator"
        && annotation.typeArguments && annotation.typeArguments.length === 1) {
        const argument = annotation.typeArguments[0];
        validators.set(name, {
          exported: isExported(statement),
          typeName: ts.isTypeReferenceNode(argument) && ts.isIdentifier(argument.typeName)
            ? argument.typeName.text
            : null,
        });
        continue;
      }
      const initializer = declaration.initializer ? unwrapAsConst(declaration.initializer) : null;
      if (initializer && ts.isObjectLiteralExpression(initializer)) {
        const members = new Map<string, string>();
        let literalTable = true;
        for (const property of initializer.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)
            || !ts.isStringLiteral(property.initializer)) {
            literalTable = false;
            break;
          }
          members.set(property.name.text, property.initializer.text);
        }
        if (literalTable) routeConsts.set(name, members);
        continue;
      }
      // 其余 const（数组字面量、无注解 validator、别名引用等）不参与索引；
      // 被 descriptor 引用而未被识别为 validator 时会在解析处点名失败。
    }
  }
  return { imports, interfaces, typeAliases, validators, routeConsts, defaultExport };
}

function resolveType(index: ModuleIndex, typeName: string, label: string, context: string): TypeRef {
  const declaredInterface = index.interfaces.get(typeName);
  if (declaredInterface) {
    if (!declaredInterface.exported) fail(label, `${context} 的类型 "${typeName}" 必须导出（registry 需要 import 它）`);
    return { name: typeName, specifier: null };
  }
  const alias = index.typeAliases.get(typeName);
  if (alias) {
    if (!alias.exported) fail(label, `${context} 的类型 "${typeName}" 必须导出（registry 需要 import 它）`);
    return { name: typeName, specifier: null };
  }
  const imported = index.imports.get(typeName);
  if (imported) return { name: typeName, specifier: imported };
  fail(label, `${context} 的类型 "${typeName}" 既不在本文件声明也不在 import 内`);
}

function resolveValidator(
  index: ModuleIndex,
  expression: ts.Expression,
  label: string,
  context: string,
): { readonly identifier: string; readonly payloadType: TypeRef } {
  if (!ts.isIdentifier(expression)) {
    fail(label, `${context} 必须是本文件内 validator 的标识符引用`);
  }
  const name = expression.text;
  const info = index.validators.get(name);
  if (!info) {
    fail(label, `${context} 引用的 "${name}" 不是本文件的 annotated validator`
      + "（需要 `const v: RuntimeValidator<X>` 或 `function v(...): X` 形态）");
  }
  if (!info.exported) fail(label, `${context} 引用的 validator "${name}" 必须导出（registry 需要 import 它）`);
  if (!info.typeName) {
    fail(label, `${context} 引用的 validator "${name}" 缺少单一类型标识符的载荷类型注解`);
  }
  return { identifier: name, payloadType: resolveType(index, info.typeName, label, `${context}（validator "${name}"）`) };
}

function parseStringArray(node: ts.Expression, label: string, context: string): readonly string[] {
  const literal = unwrapAsConst(node);
  if (!ts.isArrayLiteralExpression(literal)) fail(label, `${context} 必须是数组字面量`);
  const values: string[] = [];
  for (const element of literal.elements) {
    if (!ts.isStringLiteral(element)) fail(label, `${context} 的元素必须是字符串字面量`);
    if (values.includes(element.text)) fail(label, `${context} 重复声明："${element.text}"`);
    values.push(element.text);
  }
  return values;
}

function parseRouteType(index: ModuleIndex, node: ts.Expression, label: string, context: string): string {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && ts.isIdentifier(node.name)) {
    const table = index.routeConsts.get(node.expression.text);
    const value = table?.get(node.name.text);
    if (value === undefined) {
      fail(label, `${context} 引用的 ${node.expression.text}.${node.name.text} 不是本文件 as const 路由名表的成员`);
    }
    return value;
  }
  fail(label, `${context} 必须是字符串字面量或本文件路由名表的成员引用`);
}

/** 对象字面量守门：只允许「标识符键: 值」的普通赋值（禁 spread/computed/shorthand/method）。 */
function objectEntries(
  node: ts.Expression,
  label: string,
  context: string,
): ReadonlyMap<string, ts.Expression> {
  if (!ts.isObjectLiteralExpression(node)) fail(label, `${context} 必须是对象字面量`);
  const entries = new Map<string, ts.Expression>();
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) fail(label, `${context} 不允许 spread`);
    if (!ts.isPropertyAssignment(property)) fail(label, `${context} 只允许普通「键: 值」赋值`);
    if (ts.isComputedPropertyName(property.name)) fail(label, `${context} 不允许 computed property`);
    if (!ts.isIdentifier(property.name)) fail(label, `${context} 的键必须是标识符`);
    if (entries.has(property.name.text)) fail(label, `${context} 重复键：${property.name.text}`);
    entries.set(property.name.text, property.initializer);
  }
  return entries;
}

function assertRequiredClientReqId(index: ModuleIndex, requestType: TypeRef, label: string, route: string): void {
  if (requestType.specifier !== null) {
    fail(label, `idempotent-write 路由 ${route} 的 request 接口必须在本域文件内声明（读到 import 的 "${requestType.name}"）`);
  }
  const declared = index.interfaces.get(requestType.name);
  if (!declared) {
    fail(label, `idempotent-write 路由 ${route} 的 request 类型 "${requestType.name}" 必须是接口声明`);
  }
  for (const member of declared.node.members) {
    if (!ts.isPropertySignature(member) || !member.name) continue;
    const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : null;
    if (name !== "clientReqId") continue;
    if (member.questionToken) {
      fail(label, `idempotent-write 路由 ${route} 的 "${requestType.name}.clientReqId" 不得是可选字段`
        + "（exactOptionalPropertyTypes 下可选会把路由静默剔出幂等域）");
    }
    if (!member.type || member.type.kind !== ts.SyntaxKind.StringKeyword) {
      fail(label, `idempotent-write 路由 ${route} 的 "${requestType.name}.clientReqId" 必须是 string`);
    }
    return;
  }
  fail(label, `idempotent-write 路由 ${route} 的 request 接口 "${requestType.name}" 字面缺少必选 clientReqId: string`);
}

function parsePushCall(
  index: ModuleIndex,
  node: ts.Expression,
  label: string,
  context: string,
): PushDeclaration {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "defineLobbyPush") {
    fail(label, `${context} 的元素必须是 defineLobbyPush(key, type, validator) 调用`);
  }
  if (node.arguments.length !== 3) fail(label, `${context} 的 defineLobbyPush 必须是三参形态`);
  const [keyArg, typeArg, validatorArg] = node.arguments;
  if (!ts.isStringLiteral(keyArg)) fail(label, `${context} 的推送 key 必须是字符串字面量`);
  if (!ts.isStringLiteral(typeArg)) fail(label, `${context} 的推送消息名必须是字符串字面量`);
  if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(keyArg.text)) {
    fail(label, `${context} 的推送 key "${keyArg.text}" 必须是标识符形态（聚合 LobbyPush 常量的成员名）`);
  }
  const resolved = resolveValidator(index, validatorArg, label, `${context} 的推送 "${typeArg.text}"`);
  return { key: keyArg.text, type: typeArg.text, validator: resolved.identifier, dataType: resolved.payloadType };
}

function parseRouteCall(index: ModuleIndex, node: ts.Expression, label: string): RouteDeclaration {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
    fail(label, "routes 的元素必须是 defineRpcQuery/defineRpcNaturalWrite/defineRpcIdempotentWrite 调用");
  }
  const mode = MODE_BY_BUILDER.get(node.expression.text);
  if (!mode) {
    fail(label, `routes 内不允许 "${node.expression.text}" 调用（define* 之外的函数调用一律拒绝）`);
  }
  if (node.arguments.length !== 2) fail(label, `${node.expression.text} 必须是 (type, {request, response, ...}) 两参形态`);
  const type = parseRouteType(index, node.arguments[0], label, `${node.expression.text} 的路由名`);
  const options = objectEntries(node.arguments[1], label, `路由 ${type} 的选项`);

  const allowed = new Set(["request", "response", "contractVersion"]);
  if (mode === "query") allowed.add("inspectsOperationGroup");
  if (mode === "idempotent-write") { allowed.add("operationGroup"); allowed.add("inspectable"); }
  for (const key of options.keys()) {
    if (!allowed.has(key)) fail(label, `路由 ${type}（${mode}）的选项含未知键：${key}`);
  }
  const requestNode = options.get("request");
  const responseNode = options.get("response");
  if (!requestNode || !responseNode) fail(label, `路由 ${type} 必须同时声明 request 与 response validator`);
  const request = resolveValidator(index, requestNode, label, `路由 ${type} 的 request`);
  const response = resolveValidator(index, responseNode, label, `路由 ${type} 的 response`);

  let contractVersion = 1;
  const contractVersionNode = options.get("contractVersion");
  if (contractVersionNode) {
    if (!ts.isNumericLiteral(contractVersionNode)) {
      fail(label, `路由 ${type} 的 contractVersion 必须是数字字面量（正整数）`);
    }
    const parsed = Number(contractVersionNode.text);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      fail(label, `路由 ${type} 的 contractVersion 必须是 ≥1 的安全整数（读到 "${contractVersionNode.text}"）`);
    }
    contractVersion = parsed;
  }
  let operationGroup: string | null = null;
  const operationGroupNode = options.get("operationGroup");
  if (operationGroupNode) {
    if (!ts.isStringLiteral(operationGroupNode)) fail(label, `路由 ${type} 的 operationGroup 必须是字符串字面量`);
    operationGroup = operationGroupNode.text;
  }
  let inspectable = false;
  const inspectableNode = options.get("inspectable");
  if (inspectableNode) {
    if (inspectableNode.kind !== ts.SyntaxKind.TrueKeyword && inspectableNode.kind !== ts.SyntaxKind.FalseKeyword) {
      fail(label, `路由 ${type} 的 inspectable 必须是布尔字面量`);
    }
    inspectable = inspectableNode.kind === ts.SyntaxKind.TrueKeyword;
  }
  let inspectsOperationGroup: string | null = null;
  const inspectsNode = options.get("inspectsOperationGroup");
  if (inspectsNode) {
    if (!ts.isStringLiteral(inspectsNode)) fail(label, `路由 ${type} 的 inspectsOperationGroup 必须是字符串字面量`);
    inspectsOperationGroup = inspectsNode.text;
  }

  if (mode === "idempotent-write") {
    assertRequiredClientReqId(index, request.payloadType, label, type);
  }
  return {
    type,
    mode,
    requestValidator: request.identifier,
    requestType: request.payloadType,
    responseValidator: response.identifier,
    responseType: response.payloadType,
    contractVersion,
    operationGroup,
    inspectable,
    inspectsOperationGroup,
  };
}

/** 解析 exposesOperationGroupTo：`{ group: ["domainA", ...] }` 的纯字面量对象。 */
function parseExposesOperationGroupTo(
  node: ts.Expression,
  label: string,
): { readonly [group: string]: readonly string[] } {
  const entries = objectEntries(unwrapAsConst(node), label, "exposesOperationGroupTo");
  const out: Record<string, readonly string[]> = {};
  for (const [group, value] of entries) {
    out[group] = parseStringArray(value, label, `exposesOperationGroupTo.${group}`);
  }
  return out;
}

/** 解析一份 domains/<域>.ts；违反顶层语法约束即 fail-fast。 */
export function parseDomainModule(source: string, label: string): DomainDeclaration {
  const sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const index = indexModule(sourceFile, label);
  if (!index.defaultExport) fail(label, "缺少 export default defineLobbyRpcDomain({...})");
  const call = index.defaultExport;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)
    || call.expression.text !== "defineLobbyRpcDomain") {
    fail(label, "export default 必须是 defineLobbyRpcDomain({...}) 调用");
  }
  if (call.arguments.length !== 1) fail(label, "defineLobbyRpcDomain 必须是单对象参数形态");
  const descriptor = objectEntries(call.arguments[0], label, "defineLobbyRpcDomain 的参数");
  for (const key of descriptor.keys()) {
    if (!["domain", "errorCodes", "ownsOperationGroups", "exposesOperationGroupTo", "pushes", "routes"].includes(key)) {
      fail(label, `defineLobbyRpcDomain 含未知键：${key}`);
    }
  }
  const domainNode = descriptor.get("domain");
  if (!domainNode || !ts.isStringLiteral(domainNode)) fail(label, "domain 必须是字符串字面量");
  const domain = domainNode.text;

  const errorCodesNode = descriptor.get("errorCodes");
  if (!errorCodesNode) fail(label, "errorCodes 必须显式声明（可为空数组）");
  const errorCodes = parseStringArray(errorCodesNode, label, "errorCodes");

  const ownsNode = descriptor.get("ownsOperationGroups");
  const ownsOperationGroups = ownsNode ? parseStringArray(ownsNode, label, "ownsOperationGroups") : [];
  const exposesNode = descriptor.get("exposesOperationGroupTo");
  const exposesOperationGroupTo = exposesNode ? parseExposesOperationGroupTo(exposesNode, label) : {};

  const pushes: PushDeclaration[] = [];
  const pushesNode = descriptor.get("pushes");
  if (pushesNode) {
    const literal = unwrapAsConst(pushesNode);
    if (!ts.isArrayLiteralExpression(literal)) fail(label, "pushes 必须是数组字面量");
    for (const element of literal.elements) {
      const push = parsePushCall(index, element, label, "pushes");
      if (pushes.some((existing) => existing.type === push.type)) fail(label, `重复声明推送消息名：${push.type}`);
      if (pushes.some((existing) => existing.key === push.key)) fail(label, `重复声明推送 key：${push.key}`);
      pushes.push(push);
    }
  }

  const routesNode = descriptor.get("routes");
  if (!routesNode) fail(label, "routes 必须声明");
  const routesLiteral = unwrapAsConst(routesNode);
  if (!ts.isArrayLiteralExpression(routesLiteral)) fail(label, "routes 必须是数组字面量");
  const routes: RouteDeclaration[] = [];
  for (const element of routesLiteral.elements) {
    const route = parseRouteCall(index, element, label);
    if (routes.some((existing) => existing.type === route.type)) fail(label, `重复声明路由：${route.type}`);
    routes.push(route);
  }
  if (routes.length === 0) fail(label, "routes 不得为空");

  return { domain, errorCodes, ownsOperationGroups, exposesOperationGroupTo, pushes, routes };
}

function findExportedConst(sourceFile: ts.SourceFile, name: string, label: string): ts.Expression {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      if (!declaration.initializer) fail(label, `${name} 必须有初始化器`);
      return declaration.initializer;
    }
  }
  fail(label, `找不到导出的 ${name}`);
}

/** 解析 coreErrors.ts：core 错误码、聚合顺序钉与 core 推送 descriptor。 */
export function parseCoreErrorsModule(source: string, label: string): CoreErrorsDeclaration {
  const sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const index = indexModule(sourceFile, label);
  if (index.defaultExport) fail(label, "coreErrors.ts 不允许 export default");

  const coreErrorCodes = parseStringArray(
    findExportedConst(sourceFile, "CORE_RPC_ERROR_CODES", label), label, "CORE_RPC_ERROR_CODES");
  const errorCodeOrder = parseStringArray(
    findExportedConst(sourceFile, "RPC_ERR_CODE_ORDER", label), label, "RPC_ERR_CODE_ORDER");

  const pushesLiteral = unwrapAsConst(findExportedConst(sourceFile, "CORE_LOBBY_PUSHES", label));
  if (!ts.isArrayLiteralExpression(pushesLiteral)) fail(label, "CORE_LOBBY_PUSHES 必须是数组字面量");
  const pushes: PushDeclaration[] = [];
  for (const element of pushesLiteral.elements) {
    const push = parsePushCall(index, element, label, "CORE_LOBBY_PUSHES");
    if (pushes.some((existing) => existing.type === push.type)) fail(label, `重复声明推送消息名：${push.type}`);
    if (pushes.some((existing) => existing.key === push.key)) fail(label, `重复声明推送 key：${push.key}`);
    pushes.push(push);
  }
  return { coreErrorCodes, errorCodeOrder, pushes };
}
