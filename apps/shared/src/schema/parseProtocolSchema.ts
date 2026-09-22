/**
 * 协议声明文件的解析与 fail-fast 校验（BF1）。
 *
 * 输入是**已解析的 JSON 值**（读文件是调用方的事，shared 里没有 fs）+ 已解析的语言文件。
 * 输出是规范化模型：缺省值已补齐（`contractVersion` / `required` / 空集合），键序保持声明序
 * （生成物的稳定性依赖这一点），引用已确认可解析（生成器只需按名字引用对方 validator）。
 *
 * 边界（⛔ 不要在本文件里扩）：
 *  - 本文件只管**单文件**规则：未知键、错类型、重复路由/类型/字段、非法引用、环引用、模式与
 *    元数据的自洽（如 idempotent-write 必须带必选 clientReqId）；
 *  - **跨文件/跨域**规则（域名重复、路由全集、operation group 所有权、error code 聚合顺序、
 *    推送 type 冲突）属于生成器（BF2/BF3）——它才看得到全集。
 */
import {
    ProtocolSchemaError,
    assertNoDuplicates,
    assertSchemaKeys,
    assertSchemaPattern,
    assertSchemaRegex,
    requireSchemaKeys,
    schemaBoolean,
    schemaFiniteNumber,
    schemaNonNegativeInteger,
    schemaPositiveInteger,
    schemaRecord,
    schemaSafeInteger,
    schemaString,
    schemaStringArray,
} from "./guards";
import type {
    ProtocolCheckRef,
    ProtocolDomainDeclaration,
    ProtocolFieldKind,
    ProtocolLanguage,
    ProtocolRouteMode,
    ProtocolSchemaApi,
    ProtocolSchemaDocument,
    ProtocolSchemaField,
    ProtocolSchemaPush,
    ProtocolSchemaType,
    ProtocolTypesDeclaration,
} from "./types";

/** 解析选项。`language` 必填（⛔ 不给缺省语言：语言文件是文件，解析器不猜）。 */
export interface ParseProtocolSchemaOptions {
    readonly language: ProtocolLanguage;
    /** 来源标识（如 `apps/shared/schema/protocols/C2S/income.json`），只用于报错与生成物抬头。 */
    readonly source: string;
    /** 外部可见类型（`common/types.json` 的解析结果）；本文件 ref 可指向它们。 */
    readonly commonTypes?: ProtocolTypesDeclaration;
}

/** 可写形态的类型表达式（内部构造用；对外只暴露只读的 `ProtocolSchemaType`）。 */
interface MutableType {
    kind: ProtocolFieldKind;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    patternCode?: string;
    members?: readonly (string | number | boolean)[];
    enumCode?: string;
    fields?: readonly ProtocolSchemaField[];
    items?: ProtocolSchemaType;
    minItems?: number;
    maxItems?: number;
    sizeCode?: string;
    values?: ProtocolSchemaType;
    keyPattern?: string;
    keyPatternCode?: string;
    maxKeys?: number;
    ref?: string;
    from?: string;
    tsType?: string;
    nullable?: boolean;
    check?: ProtocolCheckRef;
    assert?: readonly ProtocolCheckRef[];
}

const CHECK_REF_KEYS = ["fn", "from"] as const;

interface TypeScope {
    readonly language: ProtocolLanguage;
    readonly source: string;
    /** 本文件声明的原始类型表达式（键序 = 声明序）。 */
    readonly ownRaw: { [name: string]: unknown };
    readonly common: ReadonlyMap<string, ProtocolSchemaType>;
    readonly parsed: Map<string, ProtocolSchemaType>;
    readonly parsing: Set<string>;
}

interface DeclarationDetection {
    readonly kind: string;
    /** 同样命中判定键、但优先级更低（或更高）的其它候选；键校验失败时用来提示。 */
    readonly others: readonly string[];
}

/**
 * 判定声明形态。
 *
 * 命中规则（两条任一即算命中）：
 *  1. 判定键出现（正常路径）；
 *  2. 该形态的**任一必填键**出现——这样「漏写 `domain`」会被判成 domain 形态、报
 *     「缺少必填键 `domain`」，而不是退化成 types 形态后报一个莫名其妙的「未知键 `apis`」。
 *
 * 判定键**允许**同时命中：域声明可以带 `types`（域内具名类型），纯类型表只有 `types`，
 * 两者天然会撞在一起。胜者由语言文件的 `priority` 决定（小的胜），⛔ 不在解析器里写死先后——
 * 那是语言的一部分。落选者带回，键校验失败时报出来。
 */
function detectDeclarationKind(
    root: { [key: string]: unknown },
    language: ProtocolLanguage,
    source: string,
): DeclarationDetection {
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(root, key);
    const hits = Object.keys(language.declarations)
        .filter((name) => {
            const rule = language.declarations[name];
            return has(rule.discriminator) || rule.required.some(has);
        })
        .sort((left, right) => language.declarations[left].priority - language.declarations[right].priority);
    if (hits.length === 0) {
        throw new ProtocolSchemaError(
            `无法判定声明形态（缺判定键 ${Object.keys(language.declarations)
                .map((name) => `\`${language.declarations[name].discriminator}\``)
                .join(" / ")}）`,
            source,
        );
    }
    return { kind: hits[0], others: hits.slice(1) };
}

function assertKindConstraintKeys(
    value: { [key: string]: unknown },
    language: ProtocolLanguage,
    kind: string,
    path: string,
    extraAllowedKeys: readonly string[],
): void {
    const rule = language.fieldKinds[kind];
    assertSchemaKeys(
        value,
        language.typeExprKeys.concat(extraAllowedKeys, rule.constraints),
        path,
    );
    requireSchemaKeys(value, rule.requires, path);
}

/** 解析一条具名校验器引用（`{ fn, from }`）。 */
function parseCheckRef(value: unknown, path: string, identifierPattern: string): ProtocolCheckRef {
    const block = schemaRecord(value, path);
    assertSchemaKeys(block, CHECK_REF_KEYS, path);
    requireSchemaKeys(block, CHECK_REF_KEYS, path);
    const fn = schemaString(block.fn, `${path}.fn`);
    assertSchemaPattern(fn, identifierPattern, "校验器名", `${path}.fn`);
    const from = schemaString(block.from, `${path}.from`);
    assertRelativeSpecifier(from, `${path}.from`);
    return { fn, from };
}

/** 解析 `assert`（一条或一组具名校验器）。 */
function parseCheckRefs(value: unknown, path: string, identifierPattern: string): readonly ProtocolCheckRef[] {
    const list = Array.isArray(value) ? value : [value];
    if (list.length === 0) throw new ProtocolSchemaError("`assert` 不得为空", path);
    return list.map((item, index) => parseCheckRef(item, `${path}[${index}]`, identifierPattern));
}

/**
 * `from` 必须是相对 specifier：生成物按它 import，绝对或裸 specifier 会把「非生成 shared 文件」
 * 变成 npm 依赖（shared 零依赖，机检 `shared-zero-dep.test.ts`）。⛔ 不在这里解析到绝对路径——
 * 生成器才看得到仓库根。
 */
function assertRelativeSpecifier(specifier: string, path: string): void {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw new ProtocolSchemaError(`必须是相对 specifier（以 ./ 或 ../ 开头），实际是 \`${specifier}\``, path);
    }
}

/** 解析一个类型表达式（含字段形态：`name` + 可选 `required`/`readonly` + 内联类型表达式）。 */
function parseType(
    scope: TypeScope,
    input: unknown,
    path: string,
    depth: number,
    extraAllowedKeys: readonly string[] = [],
): ProtocolSchemaType {
    if (depth > scope.language.limits.maxNestingDepth) {
        throw new ProtocolSchemaError(
            `嵌套深度超过 ${scope.language.limits.maxNestingDepth}`,
            path,
        );
    }
    const value = schemaRecord(input, path);
    const kind = schemaString(value.kind, `${path}.kind`);
    if (!Object.prototype.hasOwnProperty.call(scope.language.fieldKinds, kind)) {
        throw new ProtocolSchemaError(
            `未知字段种类 \`${kind}\`；允许：${Object.keys(scope.language.fieldKinds).join(", ")}`,
            `${path}.kind`,
        );
    }
    // 第一道闸：语言文件允许该种类出现哪些约束键（⛔ 不在解析器里另留一份白名单）。
    assertKindConstraintKeys(value, scope.language, kind, path, extraAllowedKeys);
    // 第二道闸：本解析器**真的实现**了哪些约束键。语言登记了但这里没消费的键会被拒，
    // ⛔ 不会「放过去然后静默忽略」——那会让 schema 写着限长而 wire 上不生效。
    const consumed = scope.language.typeExprKeys.concat(extraAllowedKeys);

    const out: MutableType = { kind: kind as ProtocolFieldKind };
    // 与种类无关的三个约束：可空、具名校验器（产出值）、不变量。所有种类都允许。
    consumed.push("nullable", "check", "assert");
    const nullable = value.nullable === undefined ? undefined : schemaBoolean(value.nullable, `${path}.nullable`);
    if (nullable === true) out.nullable = true;
    if (value.check !== undefined) out.check = parseCheckRef(value.check, `${path}.check`, scope.language.identifierPattern);
    if (value.assert !== undefined) out.assert = parseCheckRefs(value.assert, `${path}.assert`, scope.language.identifierPattern);

    switch (kind) {
        case "boolean":
        case "json":
            break;
        case "integer": {
            consumed.push("min", "max");
            const min = value.min === undefined ? undefined : schemaSafeInteger(value.min, `${path}.min`);
            const max = value.max === undefined ? undefined : schemaSafeInteger(value.max, `${path}.max`);
            assertRange(min, max, path);
            if (min !== undefined) out.min = min;
            if (max !== undefined) out.max = max;
            break;
        }
        case "number": {
            consumed.push("min", "max");
            const min = value.min === undefined ? undefined : schemaFiniteNumber(value.min, `${path}.min`);
            const max = value.max === undefined ? undefined : schemaFiniteNumber(value.max, `${path}.max`);
            assertRange(min, max, path);
            if (min !== undefined) out.min = min;
            if (max !== undefined) out.max = max;
            break;
        }
        case "string": {
            consumed.push("minLength", "maxLength", "pattern", "patternCode");
            const minLength =
                value.minLength === undefined
                    ? undefined
                    : schemaNonNegativeInteger(value.minLength, `${path}.minLength`);
            const maxLength =
                value.maxLength === undefined
                    ? undefined
                    : schemaNonNegativeInteger(value.maxLength, `${path}.maxLength`);
            assertRange(minLength, maxLength, path);
            if (maxLength !== undefined && maxLength > scope.language.limits.maxStringLength) {
                throw new ProtocolSchemaError(
                    `maxLength ${maxLength} 超过上限 ${scope.language.limits.maxStringLength}`,
                    `${path}.maxLength`,
                );
            }
            if (minLength !== undefined) out.minLength = minLength;
            if (maxLength !== undefined) out.maxLength = maxLength;
            if (value.pattern !== undefined) {
                const pattern = schemaString(value.pattern, `${path}.pattern`);
                assertSchemaRegex(pattern, `${path}.pattern`);
                out.pattern = pattern;
                // 正则不匹配必须能被客户端按码分派 ⇒ 有 pattern 就必须显式给码（⛔ 不留缺省）。
                if (value.patternCode === undefined) {
                    throw new ProtocolSchemaError("声明 `pattern` 时必须同时声明 `patternCode`", `${path}.patternCode`);
                }
                out.patternCode = parseErrorCode(value.patternCode, `${path}.patternCode`, "WIRE_STRING", scope.language.errorCodePattern);
            } else if (value.patternCode !== undefined) {
                throw new ProtocolSchemaError("`patternCode` 只在声明了 `pattern` 时有意义", `${path}.patternCode`);
            }
            break;
        }
        case "enum": {
            consumed.push("members", "enumCode");
            out.members = parseEnumMembers(value.members, `${path}.members`);
            out.enumCode = parseErrorCode(value.enumCode, `${path}.enumCode`, undefined, scope.language.errorCodePattern);
            break;
        }
        case "object": {
            consumed.push("fields");
            out.fields = parseFields(scope, value.fields, path, depth);
            break;
        }
        case "array": {
            consumed.push("items", "minItems", "maxItems", "sizeCode");
            out.items = parseType(scope, value.items, `${path}.items`, depth + 1);
            const minItems =
                value.minItems === undefined
                    ? undefined
                    : schemaNonNegativeInteger(value.minItems, `${path}.minItems`);
            const maxItems =
                value.maxItems === undefined
                    ? undefined
                    : schemaNonNegativeInteger(value.maxItems, `${path}.maxItems`);
            assertRange(minItems, maxItems, path);
            if (maxItems !== undefined && maxItems > scope.language.limits.maxArrayItems) {
                throw new ProtocolSchemaError(
                    `maxItems ${maxItems} 超过上限 ${scope.language.limits.maxArrayItems}`,
                    `${path}.maxItems`,
                );
            }
            if (minItems !== undefined) out.minItems = minItems;
            if (maxItems !== undefined) out.maxItems = maxItems;
            out.sizeCode = parseErrorCode(value.sizeCode, `${path}.sizeCode`, "WIRE_ARRAY", scope.language.errorCodePattern);
            break;
        }
        case "record": {
            consumed.push("values", "keyPattern", "keyPatternCode", "maxKeys", "sizeCode");
            out.values = parseType(scope, value.values, `${path}.values`, depth + 1);
            if (value.keyPattern !== undefined) {
                const keyPattern = schemaString(value.keyPattern, `${path}.keyPattern`);
                assertSchemaRegex(keyPattern, `${path}.keyPattern`);
                out.keyPattern = keyPattern;
            }
            out.keyPatternCode = parseErrorCode(value.keyPatternCode, `${path}.keyPatternCode`, "WIRE_KEYS", scope.language.errorCodePattern);
            if (value.maxKeys !== undefined) {
                out.maxKeys = schemaNonNegativeInteger(value.maxKeys, `${path}.maxKeys`);
            }
            out.sizeCode = parseErrorCode(value.sizeCode, `${path}.sizeCode`, "WIRE_KEYS", scope.language.errorCodePattern);
            break;
        }
        case "ref": {
            consumed.push("ref");
            const name = schemaString(value.ref, `${path}.ref`);
            assertSchemaPattern(name, scope.language.identifierPattern, "引用名", `${path}.ref`);
            // 解析目标：既确认可解析（非法引用 fail-fast），也顺带做环检测。
            resolveNamedType(scope, name, `${path}.ref`, depth);
            out.ref = name;
            break;
        }
        case "external": {
            consumed.push("from", "tsType");
            const from = schemaString(value.from, `${path}.from`);
            assertRelativeSpecifier(from, `${path}.from`);
            out.from = from;
            if (value.tsType !== undefined) {
                const tsType = schemaString(value.tsType, `${path}.tsType`);
                assertSchemaPattern(tsType, scope.language.identifierPattern, "类型名", `${path}.tsType`);
                out.tsType = tsType;
            }
            // 外部类型没有生成物可依据的形状 ⇒ 必须由具名校验器产出值。
            if (out.check === undefined) {
                throw new ProtocolSchemaError(
                    "`external` 类型没有生成物可依据的形状，必须同时声明 `check`（指向拥有该校验的非生成模块）",
                    path,
                );
            }
            break;
        }
        default:
            throw new ProtocolSchemaError(`未实现的字段种类 \`${kind}\``, `${path}.kind`);
    }
    assertSchemaKeys(value, consumed, path);
    return out;
}

/** 可选的 wire 错误码键：缺省取 `fallback`（`undefined` = 该种类必须显式声明）。 */
function parseErrorCode(
    value: unknown,
    path: string,
    fallback: string | undefined,
    errorCodePattern: string,
): string {
    if (value === undefined) {
        if (fallback === undefined) throw new ProtocolSchemaError("必须显式声明 wire 错误码", path);
        return fallback;
    }
    const code = schemaString(value, path);
    assertSchemaPattern(code, errorCodePattern, "wire 错误码", path);
    return code;
}

function assertRange(min: number | undefined, max: number | undefined, path: string): void {
    if (min !== undefined && max !== undefined && min > max) {
        throw new ProtocolSchemaError(`min ${min} 大于 max ${max}`, path);
    }
}

function parseEnumMembers(value: unknown, path: string): readonly (string | number | boolean)[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new ProtocolSchemaError("enum 成员必须是非空数组", path);
    }
    const members: (string | number | boolean)[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const member = value[index];
        if (typeof member !== "string" && typeof member !== "number" && typeof member !== "boolean") {
            throw new ProtocolSchemaError("enum 成员只能是字符串 / 数字 / 布尔", `${path}[${index}]`);
        }
        if (members.indexOf(member) >= 0) {
            throw new ProtocolSchemaError(`enum 成员 \`${String(member)}\` 重复`, `${path}[${index}]`);
        }
        members.push(member);
    }
    return members;
}

function parseFields(
    scope: TypeScope,
    value: unknown,
    path: string,
    depth: number,
): readonly ProtocolSchemaField[] {
    if (!Array.isArray(value)) throw new ProtocolSchemaError("object 的 `fields` 必须是数组", path);
    if (value.length > scope.language.limits.maxFieldsPerObject) {
        throw new ProtocolSchemaError(
            `字段数 ${value.length} 超过上限 ${scope.language.limits.maxFieldsPerObject}`,
            path,
        );
    }
    const fields: ProtocolSchemaField[] = [];
    const names: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const at = `${path}[${index}]`;
        const field = schemaRecord(value[index], at);
        requireSchemaKeys(field, ["name"], at);
        const name = schemaString(field.name, `${at}.name`);
        assertSchemaPattern(name, scope.language.identifierPattern, "字段名", `${at}.name`);
        if (names.indexOf(name) >= 0) {
            throw new ProtocolSchemaError(`字段名 \`${name}\` 重复`, `${at}.name`);
        }
        names.push(name);
        const required =
            field.required === undefined
                ? scope.language.defaults.required
                : schemaBoolean(field.required, `${at}.required`);
        const readonly = field.readonly === undefined ? false : schemaBoolean(field.readonly, `${at}.readonly`);
        // 字段对象 = 字段键（name/required/readonly）+ 内联类型表达式；未知键由 parseType 的两道闸拒绝。
        fields.push({
            name,
            required,
            readonly,
            type: parseType(scope, field, at, depth + 1, scope.language.fieldKeys),
        });
    }
    return fields;
}

/** 解析具名类型：先查外部（common），再查本文件；本文件的解析带环检测。 */
function resolveNamedType(scope: TypeScope, name: string, path: string, depth: number): ProtocolSchemaType {
    const fromCommon = scope.common.get(name);
    if (fromCommon !== undefined) return fromCommon;
    if (!Object.prototype.hasOwnProperty.call(scope.ownRaw, name)) {
        throw new ProtocolSchemaError(`引用不存在的类型 \`${name}\``, path);
    }
    const cached = scope.parsed.get(name);
    if (cached !== undefined) return cached;
    if (scope.parsing.has(name)) {
        throw new ProtocolSchemaError(`类型 \`${name}\` 形成环引用（v1 不支持递归类型）`, path);
    }
    scope.parsing.add(name);
    try {
        const parsed = parseType(scope, scope.ownRaw[name], `${scope.source}#types.${name}`, depth);
        scope.parsed.set(name, parsed);
        return parsed;
    } finally {
        scope.parsing.delete(name);
    }
}

/**
 * 登记本文件声明的类型名（⛔ 只登记，不解析）：必须**先于** API/推送解析，否则本域类型
 * 在 `ref` 处会被误判成「引用不存在的类型」。
 */
function withOwnTypes(
    scope: TypeScope,
    raw: unknown,
    path: string,
    limit: number,
): TypeScope {
    const table = schemaRecord(raw, path);
    const names = Object.keys(table);
    if (names.length > limit) {
        throw new ProtocolSchemaError(`类型数 ${names.length} 超过上限 ${limit}`, path);
    }
    const ownRaw: { [name: string]: unknown } = {};
    for (const name of names) {
        assertSchemaPattern(name, scope.language.identifierPattern, "类型名", `${path}.${name}`);
        if (scope.common.has(name)) {
            throw new ProtocolSchemaError(`类型 \`${name}\` 与本文件外的同名类型冲突`, `${path}.${name}`);
        }
        ownRaw[name] = table[name];
    }
    return { ...scope, ownRaw };
}

/** 解析全部本文件类型（含未被引用的），返回解析结果；顺带覆盖环引用与非法引用。 */
function resolveAllTypes(scope: TypeScope, path: string): ReadonlyMap<string, ProtocolSchemaType> {
    for (const name of Object.keys(scope.ownRaw)) {
        resolveNamedType(scope, name, `${path}.${name}`, 1);
    }
    return scope.parsed;
}

/**
 * 把 `ref` 链解开到真正的形状节点。
 *
 * 载荷（request/response/push.data）与 `clientReqId` 自洽性都要看**形状**而不是「它是个 ref」：
 * `IWorldResolveTransferRes = IWorldEnterRes` 这类别名在 wire 上仍是普通记录。环引用在
 * `resolveNamedType` 已 fail-fast，这里再兜一层是因为别名链可以绕过单点检测。
 */
function deref(scope: TypeScope, type: ProtocolSchemaType, path: string, depth: number): ProtocolSchemaType {
    let current = type;
    const seen = new Set<string>();
    while (current.kind === "ref") {
        const name = current.ref as string;
        if (seen.has(name)) {
            throw new ProtocolSchemaError(`类型 \`${name}\` 形成环引用（v1 不支持递归类型）`, path);
        }
        seen.add(name);
        current = resolveNamedType(scope, name, path, depth);
    }
    return current;
}

/**
 * request / response / push.data 必须是**普通记录**（`rpcRecord` / `pushRecord`）。
 *
 * 唯一例外是「具名校验器产出的外部视图」（`kind: external` + `check`），例如 shop/mail 共用的
 * `IPurchaseResult`——它的形状由 `economy.ts` 拥有，schema 只声明「这个载荷由谁产出」。
 */
function assertObjectPayload(scope: TypeScope, type: ProtocolSchemaType, path: string): void {
    const resolved = deref(scope, type, path, 1);
    if (resolved.kind === "object") return;
    if (resolved.kind === "external" && resolved.check !== undefined) return;
    throw new ProtocolSchemaError(
        `必须是 \`object\`（wire 载荷恒为普通记录），实际是 \`${resolved.kind}\``,
        path,
    );
}

function parseApi(scope: TypeScope, input: unknown, path: string): ProtocolSchemaApi {
    const value = schemaRecord(input, path);
    assertSchemaKeys(value, scope.language.apiKeys, path);
    requireSchemaKeys(value, scope.language.apiRequired, path);

    const name = schemaString(value.name, `${path}.name`);
    assertSchemaPattern(name, scope.language.identifierPattern, "API 名", `${path}.name`);
    const route = schemaString(value.route, `${path}.route`);
    assertSchemaPattern(route, scope.language.routePattern, "路由", `${path}.route`);
    const serviceType = schemaString(value.serviceType, `${path}.serviceType`);
    if (scope.language.serviceTypes.indexOf(serviceType) < 0) {
        throw new ProtocolSchemaError(
            `未知 serviceType \`${serviceType}\`；允许：${scope.language.serviceTypes.join(", ")}`,
            `${path}.serviceType`,
        );
    }
    const mode = schemaString(value.mode, `${path}.mode`);
    if (scope.language.modes.indexOf(mode) < 0) {
        throw new ProtocolSchemaError(
            `未知执行模式 \`${mode}\`；允许：${scope.language.modes.join(", ")}`,
            `${path}.mode`,
        );
    }
    const ownerModule = schemaString(value.ownerModule, `${path}.ownerModule`);
    assertSchemaPattern(ownerModule, scope.language.identifierPattern, "ownerModule", `${path}.ownerModule`);
    const contractVersion =
        value.contractVersion === undefined
            ? scope.language.defaults.contractVersion
            : schemaPositiveInteger(value.contractVersion, `${path}.contractVersion`);

    const request = parseType(scope, value.request, `${path}.request`, 1);
    assertObjectPayload(scope, request, `${path}.request`);
    const response = parseType(scope, value.response, `${path}.response`, 1);
    assertObjectPayload(scope, response, `${path}.response`);

    const operationGroup =
        value.operationGroup === undefined ? undefined : schemaString(value.operationGroup, `${path}.operationGroup`);
    const inspectable =
        value.inspectable === undefined ? undefined : schemaBoolean(value.inspectable, `${path}.inspectable`);
    const inspectsOperationGroup =
        value.inspectsOperationGroup === undefined
            ? undefined
            : schemaString(value.inspectsOperationGroup, `${path}.inspectsOperationGroup`);

    if (operationGroup !== undefined) {
        assertSchemaPattern(
            operationGroup,
            scope.language.identifierPattern,
            "operation group",
            `${path}.operationGroup`,
        );
        if (mode !== "idempotent-write") {
            throw new ProtocolSchemaError("`operationGroup` 只能出现在 idempotent-write 路由上", `${path}.operationGroup`);
        }
    }
    if (inspectable !== undefined) {
        if (mode !== "idempotent-write") {
            throw new ProtocolSchemaError("`inspectable` 只能出现在 idempotent-write 路由上", `${path}.inspectable`);
        }
        if (operationGroup === undefined) {
            throw new ProtocolSchemaError("`inspectable` 必须同时声明 `operationGroup`", `${path}.inspectable`);
        }
    }
    if (inspectsOperationGroup !== undefined) {
        assertSchemaPattern(
            inspectsOperationGroup,
            scope.language.identifierPattern,
            "operation group",
            `${path}.inspectsOperationGroup`,
        );
        if (mode !== "query") {
            throw new ProtocolSchemaError(
                "`inspectsOperationGroup` 只能出现在 query 路由上",
                `${path}.inspectsOperationGroup`,
            );
        }
    }
    if (mode === "idempotent-write") assertClientReqId(scope, request, `${path}.request`);

    return {
        name,
        route,
        serviceType,
        mode: mode as ProtocolRouteMode,
        ownerModule,
        contractVersion,
        request,
        response,
        ...(operationGroup === undefined ? {} : { operationGroup }),
        ...(inspectable === undefined ? {} : { inspectable }),
        ...(inspectsOperationGroup === undefined ? {} : { inspectsOperationGroup }),
    };
}

/**
 * idempotent-write 的请求必须带**必选** `clientReqId`。
 *
 * 这是执行模式三分的落点：⛔ 模式不得由「请求里有没有 clientReqId」反推（`shop.queryOp`
 * 携带原操作 opId 但仍是 query），所以模式在 schema 里显式声明，而这里保证声明与载荷自洽——
 * 少了它，通用幂等闸就没有去重键，重放会真的重复扣钱。
 */
function assertClientReqId(scope: TypeScope, request: ProtocolSchemaType, path: string): void {
    const resolved = deref(scope, request, path, 1);
    const fields = resolved.fields ?? [];
    const field = fields.filter((item) => item.name === "clientReqId")[0];
    if (field === undefined) {
        throw new ProtocolSchemaError("idempotent-write 的请求必须声明 `clientReqId` 字段", path);
    }
    if (!field.required) {
        throw new ProtocolSchemaError("`clientReqId` 必须是必选字段（可选等于允许不带去重键）", path);
    }
    if (field.type.kind !== "string") {
        throw new ProtocolSchemaError("`clientReqId` 必须是 string", path);
    }
}

function parsePush(scope: TypeScope, input: unknown, path: string): ProtocolSchemaPush {
    const value = schemaRecord(input, path);
    assertSchemaKeys(value, scope.language.pushKeys, path);
    requireSchemaKeys(value, scope.language.pushRequired, path);
    const key = schemaString(value.key, `${path}.key`);
    assertSchemaPattern(key, scope.language.identifierPattern, "推送 key", `${path}.key`);
    const type = schemaString(value.type, `${path}.type`);
    assertSchemaPattern(type, scope.language.routePattern, "推送 type", `${path}.type`);
    const data = parseType(scope, value.data, `${path}.data`, 1);
    assertObjectPayload(scope, data, `${path}.data`);
    return { key, type, data };
}

function parseExposes(
    raw: unknown,
    ownsOperationGroups: readonly string[],
    language: ProtocolLanguage,
    path: string,
): { [group: string]: readonly string[] } {
    const value = schemaRecord(raw, path);
    const out: { [group: string]: readonly string[] } = {};
    for (const group of Object.keys(value)) {
        assertSchemaPattern(group, language.identifierPattern, "operation group", `${path}.${group}`);
        if (ownsOperationGroups.indexOf(group) < 0) {
            throw new ProtocolSchemaError(
                `只能暴露本域拥有的 operation group（\`${group}\` 不在 ownsOperationGroups 中）`,
                `${path}.${group}`,
            );
        }
        const domains = schemaStringArray(value[group], `${path}.${group}`);
        assertNoDuplicates(domains, "域名", `${path}.${group}`);
        for (const domain of domains) {
            assertSchemaPattern(domain, language.identifierPattern, "域名", `${path}.${group}`);
        }
        out[group] = domains;
    }
    return out;
}

function parseDomainDeclaration(
    scope: TypeScope,
    root: { [key: string]: unknown },
    source: string,
): ProtocolDomainDeclaration {
    const language = scope.language;
    const domain = schemaString(root.domain, `${source}#domain`);
    assertSchemaPattern(domain, language.identifierPattern, "域名", `${source}#domain`);
    const contractVersion =
        root.contractVersion === undefined
            ? language.defaults.contractVersion
            : schemaPositiveInteger(root.contractVersion, `${source}#contractVersion`);

    const errorCodes =
        root.errorCodes === undefined ? language.defaults.errorCodes : schemaStringArray(root.errorCodes, `${source}#errorCodes`);
    if (errorCodes.length > language.limits.maxErrorCodesPerDomain) {
        throw new ProtocolSchemaError(
            `错误码数 ${errorCodes.length} 超过上限 ${language.limits.maxErrorCodesPerDomain}`,
            `${source}#errorCodes`,
        );
    }
    assertNoDuplicates(errorCodes, "错误码", `${source}#errorCodes`);
    for (const code of errorCodes) {
        assertSchemaPattern(code, language.errorCodePattern, "错误码", `${source}#errorCodes`);
    }

    const ownsOperationGroups =
        root.ownsOperationGroups === undefined
            ? language.defaults.ownsOperationGroups
            : schemaStringArray(root.ownsOperationGroups, `${source}#ownsOperationGroups`);
    assertNoDuplicates(ownsOperationGroups, "operation group", `${source}#ownsOperationGroups`);
    for (const group of ownsOperationGroups) {
        assertSchemaPattern(group, language.identifierPattern, "operation group", `${source}#ownsOperationGroups`);
    }

    const exposesOperationGroupTo =
        root.exposesOperationGroupTo === undefined
            ? language.defaults.exposesOperationGroupTo
            : parseExposes(
                  root.exposesOperationGroupTo,
                  ownsOperationGroups,
                  language,
                  `${source}#exposesOperationGroupTo`,
              );

    if (!Array.isArray(root.apis)) throw new ProtocolSchemaError("`apis` 必须是数组", `${source}#apis`);
    if (root.apis.length > language.limits.maxApisPerDomain) {
        throw new ProtocolSchemaError(
            `API 数 ${root.apis.length} 超过上限 ${language.limits.maxApisPerDomain}`,
            `${source}#apis`,
        );
    }
    const apis = root.apis.map((item, index) => parseApi(scope, item, `${source}#apis[${index}]`));
    assertNoDuplicates(apis.map((api) => api.name), "API 名", `${source}#apis`);
    assertNoDuplicates(apis.map((api) => api.route), "路由", `${source}#apis`);

    const pushes =
        root.pushes === undefined
            ? []
            : (() => {
                  if (!Array.isArray(root.pushes)) {
                      throw new ProtocolSchemaError("`pushes` 必须是数组", `${source}#pushes`);
                  }
                  if (root.pushes.length > language.limits.maxPushesPerDomain) {
                      throw new ProtocolSchemaError(
                          `推送数 ${root.pushes.length} 超过上限 ${language.limits.maxPushesPerDomain}`,
                          `${source}#pushes`,
                      );
                  }
                  return root.pushes.map((item, index) =>
                      parsePush(scope, item, `${source}#pushes[${index}]`),
                  );
              })();
    assertNoDuplicates(pushes.map((push) => push.key), "推送 key", `${source}#pushes`);
    assertNoDuplicates(pushes.map((push) => push.type), "推送 type", `${source}#pushes`);

    const types = resolveAllTypes(scope, `${source}#types`);

    return {
        kind: "domain",
        source,
        domain,
        contractVersion,
        errorCodes,
        ownsOperationGroups,
        exposesOperationGroupTo,
        pushes,
        apis,
        types,
    };
}

/**
 * 解析一份协议声明文件（域声明或纯类型表）。
 *
 * 判定形态靠语言文件里各形态的 `discriminator`（`domain` / `types`）：命中恰好一种才继续。
 */
export function parseProtocolSchema(
    input: unknown,
    options: ParseProtocolSchemaOptions,
): ProtocolSchemaDocument {
    const { language, source } = options;
    const root = schemaRecord(input, source);
    const detection = detectDeclarationKind(root, language, source);
    const rule = language.declarations[detection.kind];
    try {
        assertSchemaKeys(root, rule.keys, source);
        requireSchemaKeys(root, rule.required, source);
    } catch (error) {
        if (error instanceof ProtocolSchemaError && detection.others.length > 0) {
            throw new ProtocolSchemaError(
                `${error.detail}（本文件也可能是 ${detection.others.join(" / ")} 形态：判定键同样命中，请检查键集合）`,
                source,
            );
        }
        throw error;
    }
    const declarationKind = detection.kind;

    const common = options.commonTypes?.types ?? new Map<string, ProtocolSchemaType>();
    // 先登记本文件类型名，再解析 API/推送（顺序不可交换，见 withOwnTypes 注释）。
    const scope = withOwnTypes(
        {
            language,
            source,
            ownRaw: {},
            common,
            parsed: new Map<string, ProtocolSchemaType>(),
            parsing: new Set<string>(),
        },
        root.types === undefined ? {} : root.types,
        `${source}#types`,
        language.limits.maxTypesPerFile,
    );

    if (declarationKind === "domain") return parseDomainDeclaration(scope, root, source);

    const declaration: ProtocolTypesDeclaration = {
        kind: "types",
        source,
        types: resolveAllTypes(scope, `${source}#types`),
    };
    return declaration;
}
