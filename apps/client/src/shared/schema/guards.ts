/**
 * 协议 schema 的构建期校验积木（BF1）。
 *
 * 与 wire 侧的 `WireValidationError` 分开：那个是**运行期**的入站数据边界，这个是**生成期**的
 * 声明错误（写错 schema 的人要的是「哪个文件哪一行哪个键错了」，而不是一个 wire 错误码）。
 *
 * ⛔ 本模块不依赖 `../../http`：schema 层要能被只读 schema 的工具链（BF2 的 plugin-codegen）
 * 单独编译，把 950 行的 http 模块拖进依赖图没有收益。`isSchemaRecord` 的语义与
 * `http.isPlainRecord` 一致（普通对象、非数组、非 null），差别只在错误类型。
 */

/** 声明错误：只在生成/解析期抛出，带出错位置。 */
export class ProtocolSchemaError extends Error {
    /** 出错位置（如 `C2S/income.json#apis[1].request.fields[0]`）。 */
    readonly path: string;
    /** 不含位置的原始说明（包装/补充提示时用它，⛔ 不要从 `message` 里切字符串）。 */
    readonly detail: string;

    constructor(message: string, path: string) {
        super(path ? `${message} @ ${path}` : message);
        this.name = "ProtocolSchemaError";
        this.path = path;
        this.detail = message;
    }
}

/** 普通对象判定（非数组、非 null）；语义同 `http.isPlainRecord`。 */
export function isSchemaRecord(value: unknown): value is { [key: string]: unknown } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function schemaRecord(value: unknown, path: string): { [key: string]: unknown } {
    if (!isSchemaRecord(value)) throw new ProtocolSchemaError("必须是对象", path);
    return value;
}

/** 未知键一律拒绝：schema 里的错别字必须是硬错误，⛔ 不能静默当成「没声明」。 */
export function assertSchemaKeys(
    value: { [key: string]: unknown },
    allowed: readonly string[],
    path: string,
): void {
    const unknown = Object.keys(value).filter((key) => allowed.indexOf(key) < 0);
    if (unknown.length > 0) {
        throw new ProtocolSchemaError(
            `未知键 ${unknown.map((key) => `\`${key}\``).join(", ")}；允许的键：${allowed.join(", ")}`,
            path,
        );
    }
}

export function requireSchemaKeys(
    value: { [key: string]: unknown },
    required: readonly string[],
    path: string,
): void {
    const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
    if (missing.length > 0) {
        throw new ProtocolSchemaError(`缺少必填键 ${missing.map((key) => `\`${key}\``).join(", ")}`, path);
    }
}

export function schemaString(value: unknown, path: string): string {
    if (typeof value !== "string") throw new ProtocolSchemaError("必须是字符串", path);
    return value;
}

export function schemaNonEmptyString(value: unknown, path: string): string {
    const text = schemaString(value, path);
    if (text.length === 0) throw new ProtocolSchemaError("不能是空字符串", path);
    return text;
}

export function schemaBoolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") throw new ProtocolSchemaError("必须是布尔值", path);
    return value;
}

export function schemaSafeInteger(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new ProtocolSchemaError("必须是安全整数", path);
    }
    return value;
}

/** 非负安全整数（长度 / 条数 / 深度这类量）。 */
export function schemaNonNegativeInteger(value: unknown, path: string): number {
    const count = schemaSafeInteger(value, path);
    if (count < 0) throw new ProtocolSchemaError("必须是非负整数", path);
    return count;
}

/** 正安全整数（版本号这类量）。 */
export function schemaPositiveInteger(value: unknown, path: string): number {
    const count = schemaSafeInteger(value, path);
    if (count < 1) throw new ProtocolSchemaError("必须是 >= 1 的整数", path);
    return count;
}

export function schemaFiniteNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ProtocolSchemaError("必须是有限数值", path);
    }
    return value;
}

export function schemaStringArray(value: unknown, path: string): readonly string[] {
    if (!Array.isArray(value)) throw new ProtocolSchemaError("必须是字符串数组", path);
    return value.map((item, index) => schemaString(item, `${path}[${index}]`));
}

/** 形态闸：`pattern` 由语言文件提供（⛔ 不在这里硬编码标识符/路由形态）。 */
export function assertSchemaPattern(value: string, pattern: string, what: string, path: string): void {
    if (!new RegExp(pattern).test(value)) {
        throw new ProtocolSchemaError(`${what} \`${value}\` 不匹配 ${pattern}`, path);
    }
}

/**
 * 正则源合法性闸：schema 里声明的 `pattern` / `keyPattern` 会被生成物**逐字**写进 validator，
 * 编译不了的源会让生成物在 import 期炸（而不是在解析期报出是哪个文件的哪个键）。
 */
export function assertSchemaRegex(pattern: string, path: string): void {
    try {
        new RegExp(pattern);
    } catch (error) {
        throw new ProtocolSchemaError(`正则不合法（${String(error)}）`, path);
    }
}

/** 数组内重复项检查（重复的键/名字/路由都是硬错误）。 */
export function assertNoDuplicates(values: readonly string[], what: string, path: string): void {
    const seen = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) throw new ProtocolSchemaError(`${what} \`${value}\` 重复`, path);
        seen.add(value);
    }
}
