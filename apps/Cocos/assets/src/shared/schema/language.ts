/**
 * `apps/shared/schema/protocols/schema-v1.json` 的解析（BF1）。
 *
 * 这份语言文件是**唯一的**语言真源：字段种类、每种种类允许的约束键、API/推送/声明的键集合、
 * 缺省值与限制全在里面。解析器按它判定合法/非法，所以「语言变了」与「解析器变了」不可能分叉——
 * 只有一处可改。⛔ 语言文件本身也走同一套 fail-fast（写错就是硬错误，不是静默降级）。
 */
import {
    ProtocolSchemaError,
    assertNoDuplicates,
    assertSchemaKeys,
    assertSchemaRegex,
    requireSchemaKeys,
    schemaBoolean,
    schemaNonNegativeInteger,
    schemaPositiveInteger,
    schemaRecord,
    schemaString,
    schemaStringArray,
} from "./guards";
import type {
    ProtocolDeclarationRule,
    ProtocolFieldKindRule,
    ProtocolLanguage,
    ProtocolLanguageDefaults,
    ProtocolLanguageLimits,
} from "./types";

const LANGUAGE_KEYS = [
    "$schema",
    "title",
    "description",
    "schemaVersion",
    "identifier",
    "route",
    "errorCode",
    "modes",
    "serviceTypes",
    "fieldKinds",
    "fieldKeys",
    "typeExprKeys",
    "declarations",
    "apiKeys",
    "apiRequired",
    "pushKeys",
    "pushRequired",
    "defaults",
    "limits",
] as const;

const PATTERN_KEYS = ["pattern", "description"] as const;

const FIELD_KIND_KEYS = ["constraints", "requires"] as const;

const DECLARATION_KEYS = ["keys", "required", "discriminator", "priority"] as const;

const DEFAULT_KEYS = [
    "contractVersion",
    "required",
    "errorCodes",
    "ownsOperationGroups",
    "exposesOperationGroupTo",
] as const;

const LIMIT_KEYS = [
    "maxNestingDepth",
    "maxFieldsPerObject",
    "maxArrayItems",
    "maxStringLength",
    "maxApisPerDomain",
    "maxTypesPerFile",
    "maxPushesPerDomain",
    "maxErrorCodesPerDomain",
] as const;

/** `{ pattern, description }` 形态的形态闸（identifier / route / errorCode 三处同形）。 */
function parsePatternBlock(value: unknown, path: string): string {
    const block = schemaRecord(value, path);
    assertSchemaKeys(block, PATTERN_KEYS, path);
    requireSchemaKeys(block, ["pattern"], path);
    const pattern = schemaString(block.pattern, `${path}.pattern`);
    assertSchemaRegex(pattern, `${path}.pattern`);
    return pattern;
}

function parseFieldKinds(value: unknown, path: string): { [kind: string]: ProtocolFieldKindRule } {
    const kinds = schemaRecord(value, path);
    const names = Object.keys(kinds);
    if (names.length === 0) throw new ProtocolSchemaError("至少要有一种字段种类", path);
    const out: { [kind: string]: ProtocolFieldKindRule } = {};
    for (const name of names) {
        const at = `${path}.${name}`;
        const rule = schemaRecord(kinds[name], at);
        assertSchemaKeys(rule, FIELD_KIND_KEYS, at);
        requireSchemaKeys(rule, ["constraints"], at);
        const constraints = schemaStringArray(rule.constraints, `${at}.constraints`);
        assertNoDuplicates(constraints, "约束键", `${at}.constraints`);
        const requires =
            rule.requires === undefined ? [] : schemaStringArray(rule.requires, `${at}.requires`);
        for (const key of requires) {
            if (constraints.indexOf(key) < 0) {
                throw new ProtocolSchemaError(`\`requires\` 里的 \`${key}\` 不在 \`constraints\` 中`, at);
            }
        }
        out[name] = { constraints, requires };
    }
    return out;
}

function parseDeclarations(value: unknown, path: string): { [name: string]: ProtocolDeclarationRule } {
    const declarations = schemaRecord(value, path);
    const names = Object.keys(declarations);
    if (names.length === 0) throw new ProtocolSchemaError("至少要有一种声明形态", path);
    const out: { [name: string]: ProtocolDeclarationRule } = {};
    const discriminators = new Set<string>();
    const priorities = new Set<number>();
    for (const name of names) {
        const at = `${path}.${name}`;
        const rule = schemaRecord(declarations[name], at);
        assertSchemaKeys(rule, DECLARATION_KEYS, at);
        requireSchemaKeys(rule, ["keys", "required", "discriminator", "priority"], at);
        const keys = schemaStringArray(rule.keys, `${at}.keys`);
        assertNoDuplicates(keys, "声明键", `${at}.keys`);
        const required = schemaStringArray(rule.required, `${at}.required`);
        for (const key of required) {
            if (keys.indexOf(key) < 0) {
                throw new ProtocolSchemaError(`\`required\` 里的 \`${key}\` 不在 \`keys\` 中`, at);
            }
        }
        const discriminator = schemaString(rule.discriminator, `${at}.discriminator`);
        if (keys.indexOf(discriminator) < 0) {
            throw new ProtocolSchemaError(`\`discriminator\` \`${discriminator}\` 不在 \`keys\` 中`, at);
        }
        if (discriminators.has(discriminator)) {
            throw new ProtocolSchemaError(`判定键 \`${discriminator}\` 被多种声明形态共用`, at);
        }
        discriminators.add(discriminator);
        const priority = schemaPositiveInteger(rule.priority, `${at}.priority`);
        if (priorities.has(priority)) {
            throw new ProtocolSchemaError(`判定优先级 \`${priority}\` 被多种声明形态共用`, at);
        }
        priorities.add(priority);
        out[name] = { keys, required, discriminator, priority };
    }
    return out;
}

function parseLimits(value: unknown, path: string): ProtocolLanguageLimits {
    const limits = schemaRecord(value, path);
    assertSchemaKeys(limits, LIMIT_KEYS, path);
    requireSchemaKeys(limits, LIMIT_KEYS, path);
    const out = {
        maxNestingDepth: schemaPositiveInteger(limits.maxNestingDepth, `${path}.maxNestingDepth`),
        maxFieldsPerObject: schemaNonNegativeInteger(limits.maxFieldsPerObject, `${path}.maxFieldsPerObject`),
        maxArrayItems: schemaNonNegativeInteger(limits.maxArrayItems, `${path}.maxArrayItems`),
        maxStringLength: schemaNonNegativeInteger(limits.maxStringLength, `${path}.maxStringLength`),
        maxApisPerDomain: schemaNonNegativeInteger(limits.maxApisPerDomain, `${path}.maxApisPerDomain`),
        maxTypesPerFile: schemaNonNegativeInteger(limits.maxTypesPerFile, `${path}.maxTypesPerFile`),
        maxPushesPerDomain: schemaNonNegativeInteger(limits.maxPushesPerDomain, `${path}.maxPushesPerDomain`),
        maxErrorCodesPerDomain: schemaNonNegativeInteger(
            limits.maxErrorCodesPerDomain,
            `${path}.maxErrorCodesPerDomain`,
        ),
    };
    return out;
}

function parseDefaults(value: unknown, path: string): ProtocolLanguageDefaults {
    const defaults = schemaRecord(value, path);
    assertSchemaKeys(defaults, DEFAULT_KEYS, path);
    requireSchemaKeys(defaults, DEFAULT_KEYS, path);
    const exposes = schemaRecord(defaults.exposesOperationGroupTo, `${path}.exposesOperationGroupTo`);
    const exposesOut: { [group: string]: readonly string[] } = {};
    for (const group of Object.keys(exposes)) {
        exposesOut[group] = schemaStringArray(exposes[group], `${path}.exposesOperationGroupTo.${group}`);
    }
    return {
        contractVersion: schemaPositiveInteger(defaults.contractVersion, `${path}.contractVersion`),
        required: schemaBoolean(defaults.required, `${path}.required`),
        errorCodes: schemaStringArray(defaults.errorCodes, `${path}.errorCodes`),
        ownsOperationGroups: schemaStringArray(defaults.ownsOperationGroups, `${path}.ownsOperationGroups`),
        exposesOperationGroupTo: exposesOut,
    };
}

/**
 * 解析语言文件。⛔ 不接受缺省参数：语言必须由调用方显式提供（`schema-v1.json` 是文件，
 * shared 里读不了 fs，所以「用哪份语言」是调用方的责任，不能由解析器猜）。
 */
export function parseProtocolLanguage(input: unknown): ProtocolLanguage {
    const root = schemaRecord(input, "schema-v1.json");
    assertSchemaKeys(root, LANGUAGE_KEYS, "schema-v1.json");
    requireSchemaKeys(
        root,
        [
            "schemaVersion",
            "identifier",
            "route",
            "errorCode",
            "modes",
            "serviceTypes",
            "fieldKinds",
            "fieldKeys",
            "typeExprKeys",
            "declarations",
            "apiKeys",
            "apiRequired",
            "pushKeys",
            "pushRequired",
            "defaults",
            "limits",
        ],
        "schema-v1.json",
    );

    const schemaVersion = schemaPositiveInteger(root.schemaVersion, "schemaVersion");
    if (schemaVersion !== 1) {
        throw new ProtocolSchemaError(`不支持的协议声明语言版本 ${schemaVersion}`, "schemaVersion");
    }

    const fieldKinds = parseFieldKinds(root.fieldKinds, "fieldKinds");
    const fieldKeys = schemaStringArray(root.fieldKeys, "fieldKeys");
    const typeExprKeys = schemaStringArray(root.typeExprKeys, "typeExprKeys");
    assertNoDuplicates(fieldKeys, "字段键", "fieldKeys");
    assertNoDuplicates(typeExprKeys, "类型表达式键", "typeExprKeys");
    // 字段键与类型表达式键必须可判定地分开：两处同名会让「这个键是字段名还是约束」无法判定。
    for (const key of fieldKeys) {
        if (typeExprKeys.indexOf(key) >= 0) {
            throw new ProtocolSchemaError(`\`${key}\` 同时出现在 fieldKeys 与 typeExprKeys`, "fieldKeys");
        }
    }
    // 每种种类的约束键不得与 kind/字段键撞名（否则同键两义，解析器只能靠猜）。
    const reserved = fieldKeys.concat(typeExprKeys);
    for (const kind of Object.keys(fieldKinds)) {
        for (const key of fieldKinds[kind].constraints) {
            if (reserved.indexOf(key) >= 0) {
                throw new ProtocolSchemaError(
                    `字段种类 \`${kind}\` 的约束键 \`${key}\` 与保留键撞名`,
                    `fieldKinds.${kind}`,
                );
            }
        }
    }

    const modes = schemaStringArray(root.modes, "modes");
    assertNoDuplicates(modes, "执行模式", "modes");
    const serviceTypes = schemaStringArray(root.serviceTypes, "serviceTypes");
    assertNoDuplicates(serviceTypes, "serviceType", "serviceTypes");
    const apiKeys = schemaStringArray(root.apiKeys, "apiKeys");
    assertNoDuplicates(apiKeys, "API 键", "apiKeys");
    const apiRequired = schemaStringArray(root.apiRequired, "apiRequired");
    const pushKeys = schemaStringArray(root.pushKeys, "pushKeys");
    assertNoDuplicates(pushKeys, "推送键", "pushKeys");
    const pushRequired = schemaStringArray(root.pushRequired, "pushRequired");
    for (const [keys, required, what] of [
        [apiKeys, apiRequired, "apiRequired"],
        [pushKeys, pushRequired, "pushRequired"],
    ] as const) {
        for (const key of required) {
            if (keys.indexOf(key) < 0) {
                throw new ProtocolSchemaError(`\`${key}\` 不在对应键集合中`, what);
            }
        }
    }

    return {
        schemaVersion,
        identifierPattern: parsePatternBlock(root.identifier, "identifier"),
        routePattern: parsePatternBlock(root.route, "route"),
        errorCodePattern: parsePatternBlock(root.errorCode, "errorCode"),
        modes,
        serviceTypes,
        fieldKinds,
        fieldKeys,
        typeExprKeys,
        declarations: parseDeclarations(root.declarations, "declarations"),
        apiKeys,
        apiRequired,
        pushKeys,
        pushRequired,
        defaults: parseDefaults(root.defaults, "defaults"),
        limits: parseLimits(root.limits, "limits"),
    };
}
