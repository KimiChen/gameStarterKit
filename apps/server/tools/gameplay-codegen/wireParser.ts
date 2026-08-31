/**
 * 玩法 wire.ts 的语法读取器（Non-intrusive §4.5 阶段 2b）。
 *
 * ⛔ 生成器绝不执行 wire.ts——只做 TS 语法读取（先例：scripts/protocol-fingerprint.mjs
 * 同样 import typescript 做 AST 解析）。因此 wire.ts 顶层被约束为可静态读取的形态：
 *   import / 接口（含 type 别名）/ const 字面量 / defineC2S、defineS2C 调用 /
 *   validator 函数声明。
 * computed property、spread、顶层副作用（表达式语句）、class、enum、let/var 一律拒绝。
 * validator 函数体内部不受限（逐字迁移的既有 validator 会用展开等语法）。
 */
import ts from "typescript";

export type WireC2SDeclaration = {
  readonly exportName: string;
  readonly type: string;
  readonly payloadType: string;
  /** GamePhase 成员名（Waiting/Playing/Settle）。 */
  readonly phases: readonly string[];
  readonly rateCost: number;
};

export type WireS2CDeclaration = {
  readonly exportName: string;
  readonly type: string;
  readonly payloadType: string;
};

export type GameplayWireDeclarations = {
  readonly c2s: readonly WireC2SDeclaration[];
  readonly s2c: readonly WireS2CDeclaration[];
};

export type CoreWireNames = {
  readonly c2s: readonly { readonly key: string; readonly type: string }[];
  readonly s2c: readonly { readonly key: string; readonly type: string }[];
};

const GAME_PHASE_MEMBERS = new Set(["Waiting", "Playing", "Settle"]);

function fail(label: string, message: string): never {
  throw new Error(`[gameplay-codegen] ${label}: ${message}`);
}

function isExported(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

/** 无副作用的字面量表达式：token 之外的顶层 const 只允许这些形态。 */
function isLiteralExpression(node: ts.Expression): boolean {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true;
  if (node.kind === ts.SyntaxKind.TrueKeyword
    || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(node)
    && node.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(node.operand)) {
    return true;
  }
  if (ts.isAsExpression(node)) return isLiteralExpression(node.expression);
  if (ts.isPropertyAccessExpression(node)) {
    // 常量成员引用链（如 GamePhase.Playing）——语法级放行，成员合法性在消费处判定。
    let target: ts.Expression = node;
    while (ts.isPropertyAccessExpression(target)) target = target.expression;
    return ts.isIdentifier(target);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((element) => !ts.isSpreadElement(element) && isLiteralExpression(element));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((property) =>
      ts.isPropertyAssignment(property)
      && !ts.isComputedPropertyName(property.name)
      && isLiteralExpression(property.initializer));
  }
  return false;
}

function isDefineCall(node: ts.Expression): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && (node.expression.text === "defineC2S" || node.expression.text === "defineS2C");
}

type ModuleIndex = {
  readonly exportedInterfaces: ReadonlySet<string>;
  readonly validatorReturnTypes: ReadonlyMap<string, string | null>;
};

function indexModule(sourceFile: ts.SourceFile, label: string): ModuleIndex {
  const exportedInterfaces = new Set<string>();
  const validatorReturnTypes = new Map<string, string | null>();
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && isExported(statement)) {
      exportedInterfaces.add(statement.name.text);
    }
    if (ts.isFunctionDeclaration(statement)) {
      if (!statement.name) fail(label, "顶层函数声明必须具名");
      const returnType = statement.type;
      validatorReturnTypes.set(
        statement.name.text,
        returnType && ts.isTypeReferenceNode(returnType) && ts.isIdentifier(returnType.typeName)
          ? returnType.typeName.text
          : null,
      );
    }
  }
  return { exportedInterfaces, validatorReturnTypes };
}

function parsePayloadType(
  call: ts.CallExpression,
  index: ModuleIndex,
  label: string,
  wireType: string,
): string {
  const validatorArg = call.arguments[1];
  if (!validatorArg || !ts.isIdentifier(validatorArg)) {
    fail(label, `${wireType} 的 validator 必须是本文件内函数声明的标识符引用`);
  }
  const name = validatorArg.text;
  if (!index.validatorReturnTypes.has(name)) {
    fail(label, `${wireType} 引用的 validator "${name}" 不是本文件的顶层函数声明`);
  }
  const payloadType = index.validatorReturnTypes.get(name);
  if (!payloadType) {
    fail(label, `${wireType} 的 validator "${name}" 必须带单一接口标识符的返回类型注解`);
  }
  if (!index.exportedInterfaces.has(payloadType)) {
    fail(label, `${wireType} 的 payload 接口 "${payloadType}" 必须在本文件内声明并导出`);
  }
  return payloadType;
}

function parsePhases(node: ts.Expression, label: string, wireType: string): readonly string[] {
  if (!ts.isArrayLiteralExpression(node) || node.elements.length === 0) {
    fail(label, `${wireType} 的 phases 必须是非空数组字面量`);
  }
  const phases: string[] = [];
  for (const element of node.elements) {
    if (!ts.isPropertyAccessExpression(element)
      || !ts.isIdentifier(element.expression)
      || element.expression.text !== "GamePhase"
      || !GAME_PHASE_MEMBERS.has(element.name.text)) {
      fail(label, `${wireType} 的 phases 元素必须是 GamePhase.Waiting/Playing/Settle 字面量引用`);
    }
    if (phases.includes(element.name.text)) {
      fail(label, `${wireType} 的 phases 重复声明 GamePhase.${element.name.text}`);
    }
    phases.push(element.name.text);
  }
  return phases;
}

function parseC2SOptions(
  call: ts.CallExpression,
  label: string,
  wireType: string,
): { readonly phases: readonly string[]; readonly rateCost: number } {
  const optionsArg = call.arguments[2];
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) {
    fail(label, `${wireType} 的 defineC2S 第三参必须是对象字面量 { phases, rateCost? }`);
  }
  let phases: readonly string[] | null = null;
  let rateCost = 1;
  for (const property of optionsArg.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      fail(label, `${wireType} 的 defineC2S 选项不允许 spread/computed property`);
    }
    if (property.name.text === "phases") {
      phases = parsePhases(property.initializer, label, wireType);
    } else if (property.name.text === "rateCost") {
      if (!ts.isNumericLiteral(property.initializer)) {
        fail(label, `${wireType} 的 rateCost 必须是数字字面量`);
      }
      rateCost = Number(property.initializer.text);
      if (!Number.isSafeInteger(rateCost) || rateCost < 1) {
        fail(label, `${wireType} 的 rateCost 必须是 ≥1 的整数`);
      }
    } else {
      fail(label, `${wireType} 的 defineC2S 选项含未知键：${property.name.text}`);
    }
  }
  if (!phases) fail(label, `${wireType} 必须声明 phases`);
  return { phases, rateCost };
}

/** 解析一份玩法 wire.ts；违反顶层语法约束即 fail-fast。 */
export function parseGameplayWireModule(source: string, label: string): GameplayWireDeclarations {
  const sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const index = indexModule(sourceFile, label);
  const c2s: WireC2SDeclaration[] = [];
  const s2c: WireS2CDeclaration[] = [];
  const seenTypes = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement)
      || ts.isFunctionDeclaration(statement)) {
      continue;
    }
    if (!ts.isVariableStatement(statement)) {
      fail(
        label,
        "wire.ts 顶层只允许 import/接口/const 字面量/defineC2S、defineS2C 调用/validator 函数声明，"
        + `不允许：${ts.SyntaxKind[statement.kind]}`,
      );
    }
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
      fail(label, "wire.ts 顶层变量只允许 const 声明");
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) fail(label, "wire.ts 顶层 const 不允许解构声明");
      const exportName = declaration.name.text;
      const initializer = declaration.initializer;
      if (!initializer) fail(label, `顶层 const ${exportName} 必须有初始化器`);

      if (!isDefineCall(initializer)) {
        if (!isLiteralExpression(initializer)) {
          fail(label, `顶层 const ${exportName} 只允许字面量或 defineC2S/defineS2C 调用（禁 spread/computed/副作用）`);
        }
        continue;
      }

      const callee = (initializer.expression as ts.Identifier).text;
      const typeArg = initializer.arguments[0];
      if (!typeArg || !ts.isStringLiteral(typeArg)) {
        fail(label, `${exportName} 的消息名必须是字符串字面量`);
      }
      const wireType = typeArg.text;
      if (!isExported(statement)) {
        fail(label, `wire token ${exportName}（${wireType}）必须 export`);
      }
      if (seenTypes.has(wireType)) {
        fail(label, `重复声明消息名：${wireType}`);
      }
      seenTypes.add(wireType);

      if (callee === "defineC2S") {
        if (!wireType.startsWith("c2s.") || wireType.length <= "c2s.".length) {
          fail(label, `defineC2S 的消息名必须以 "c2s." 开头：${wireType}`);
        }
        if (initializer.arguments.length !== 3) {
          fail(label, `${wireType} 的 defineC2S 必须是 (type, validator, {phases, rateCost?}) 三参形态`);
        }
        const payloadType = parsePayloadType(initializer, index, label, wireType);
        const options = parseC2SOptions(initializer, label, wireType);
        c2s.push({ exportName, type: wireType, payloadType, phases: options.phases, rateCost: options.rateCost });
      } else {
        if (!wireType.startsWith("s2c.") || wireType.length <= "s2c.".length) {
          fail(label, `defineS2C 的消息名必须以 "s2c." 开头：${wireType}`);
        }
        if (initializer.arguments.length !== 2) {
          fail(label, `${wireType} 的 defineS2C 必须是 (type, validator) 两参形态`);
        }
        const payloadType = parsePayloadType(initializer, index, label, wireType);
        s2c.push({ exportName, type: wireType, payloadType });
      }
    }
  }
  return { c2s, s2c };
}

function parseCoreNameTable(
  sourceFile: ts.SourceFile,
  constantName: string,
  label: string,
): readonly { readonly key: string; readonly type: string }[] {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== constantName) continue;
      let initializer = declaration.initializer;
      if (initializer && ts.isAsExpression(initializer)) initializer = initializer.expression;
      if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
        fail(label, `${constantName} 必须是对象字面量（as const）`);
      }
      const entries: { key: string; type: string }[] = [];
      for (const property of initializer.properties) {
        if (!ts.isPropertyAssignment(property)
          || !ts.isIdentifier(property.name)
          || !ts.isStringLiteral(property.initializer)) {
          fail(label, `${constantName} 的成员必须是「标识符键: 字符串字面量」`);
        }
        entries.push({ key: property.name.text, type: property.initializer.text });
      }
      if (entries.length === 0) fail(label, `${constantName} 不得为空`);
      return entries;
    }
  }
  fail(label, `找不到导出的 ${constantName} 常量表`);
}

/** 从 protocol/messages.ts 语法读取 core 消息名表（CORE_C2S/CORE_S2C）。 */
export function parseCoreWireNames(source: string, label: string): CoreWireNames {
  const sourceFile = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return {
    c2s: parseCoreNameTable(sourceFile, "CORE_C2S", label),
    s2c: parseCoreNameTable(sourceFile, "CORE_S2C", label),
  };
}
