/**
 * 经济操作结果 —— mail.claimAttach / shop.purchase / shop.queryOp 共用的响应形状（真源）。
 * 服务端 core/economy/outbox.ts 的 Grant/PurchaseResult 即本文件类型的别名（04 三阶段协议读侧）。
 */

/** 一次发放的单条玩法副作用。货币不在此（权威在 MySQL，09·A2）。 */
export type IGrant =
    | { kind: "item"; itemId: number; count: number }
    | { kind: "star"; delta: number }
    | { kind: "setField"; field: string; value: string };

/**
 * Effect 的 wire/schema 版本。它与 user 档 schemaVersion 独立演进；
 * durable outbox 只接受这个精确版本，不能把数字字符串当成兼容值。
 */
export const EFFECT_SCHEMA_VERSION = 1 as const;

/** Effect 的运行时边界（shared/client/server 共用，不能只依赖 TypeScript 类型）。 */
export const EFFECT_MAX_GRANTS = 64;
export const EFFECT_MAX_QUANTITY = 1_000_000;
export const EFFECT_MAX_ITEM_ID = 1_000_000;
export const EFFECT_MAX_COUNT = 1_000_000;
export const EFFECT_MAX_DELTA = 1_000_000;
export const EFFECT_MAX_FIELD_LENGTH = 64;
/** Maximum UTF-8 byte length of one setField value (including drainProbe). */
export const EFFECT_MAX_VALUE_BYTES = 1024;
/** @deprecated Use EFFECT_MAX_VALUE_BYTES; retained for source compatibility. */
export const EFFECT_MAX_VALUE_LENGTH = EFFECT_MAX_VALUE_BYTES;

/** setField 允许写入的玩法字段。系统/路由/幂等字段不在此表内。 */
export const EFFECT_FIELD_ALLOWLIST = [
    "nickname", "avatarId", "province", "star", "maxRound", "wins", "losses",
    "stamina", "lastStaminaRecoverAt", "musicOn", "sfxOn", "guildId",
    // 测试与迁移探针使用的稳定字段；不是保留元数据字段。
    "drainProbe",
] as const;

type EffectField = (typeof EFFECT_FIELD_ALLOWLIST)[number];

/**
 * setField 的值域也属于 durable effect 契约，不能只靠调用方的 TypeScript 类型。
 * 数值和开关字段以 Redis hash 字符串持久化，因此这里明确规定其字符串编码；文本字段
 * 以 UTF-8 字节为单位复用用户视图的边界，避免一个坏值把后续所有读路径变成数据损坏。
 */
export type EffectFieldValueRule =
    | { readonly kind: "text"; readonly maxBytes: number }
    | { readonly kind: "integer"; readonly min: number; readonly max: number }
    | { readonly kind: "flag" };

export const EFFECT_FIELD_VALUE_RULES: { readonly [K in EffectField]: EffectFieldValueRule } = {
    nickname: { kind: "text", maxBytes: 128 },
    avatarId: { kind: "integer", min: -1, max: 999 },
    province: { kind: "text", maxBytes: 64 },
    star: { kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
    maxRound: { kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
    wins: { kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
    losses: { kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
    stamina: { kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
    lastStaminaRecoverAt: { kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
    musicOn: { kind: "flag" },
    sfxOn: { kind: "flag" },
    guildId: { kind: "integer", min: 0, max: Number.MAX_SAFE_INTEGER },
    drainProbe: { kind: "text", maxBytes: EFFECT_MAX_VALUE_BYTES },
};

/** 即使未来扩展 allowlist，也不能写入这些跨域元数据字段。 */
export const EFFECT_RESERVED_FIELDS = [
    "uid", "userId", "serverId", "sId", "schemaVersion", "version", "ver", "fence",
    "lastFence", "last_fence", "applied", "opId", "op_id", "effect", "status",
    "attempts", "createdAt", "updatedAt", "characterRegistration",
    "characterRegistrationCheckedAt",
] as const;

/** JSON 中持久化的完整 effect envelope。 */
export interface IEffect {
    schemaVersion: typeof EFFECT_SCHEMA_VERSION;
    grants: IGrant[];
}

export type EffectErrorCode =
    | "EFFECT_NOT_OBJECT"
    | "EFFECT_KEYS"
    | "EFFECT_SCHEMA_VERSION"
    | "EFFECT_GRANTS"
    | "EFFECT_TOO_LARGE"
    | "EFFECT_GRANT_NOT_OBJECT"
    | "EFFECT_GRANT_KEYS"
    | "EFFECT_UNKNOWN_KIND"
    | "EFFECT_ITEM_ID"
    | "EFFECT_COUNT"
    | "EFFECT_DELTA"
    | "EFFECT_QUANTITY"
    | "EFFECT_FIELD"
    | "EFFECT_RESERVED_FIELD"
    | "EFFECT_VALUE"
    | "EFFECT_DATA_CORRUPT";

/** shared 侧稳定的纯数据校验异常；服务端会把它规约成 INVALID_PAYLOAD。 */
export class EffectValidationError extends Error {
    readonly code: EffectErrorCode;
    readonly path: string;

    constructor(code: EffectErrorCode, path = "", detail = "") {
        super(`${code}${path ? ` at ${path}` : ""}${detail ? `: ${detail}` : ""}`);
        this.name = "EffectValidationError";
        this.code = code;
        this.path = path;
    }
}

const isEffectValidationError = (error: unknown): error is EffectValidationError => {
    try { return error instanceof EffectValidationError; }
    catch { return false; }
};

type RecordLike = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordLike => {
    try {
        if (typeof value !== "object" || value === null || Array.isArray(value)) { return false; }
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    } catch {
        return false;
    }
};

const exactKeys = (value: RecordLike, expected: readonly string[]): boolean => {
    try {
        const actual = Reflect.ownKeys(value);
        if (actual.some((key) => typeof key !== "string")) return false;
        const actualStrings = (actual as string[]).sort();
        const wanted = [...expected].sort();
        return actualStrings.length === wanted.length && actualStrings.every((key, i) => key === wanted[i]);
    } catch {
        return false;
    }
};

const fail = (code: EffectErrorCode, path: string, detail?: string): never => {
    throw new EffectValidationError(code, path, detail);
};

const finiteIntegerIn = (value: unknown, min: number, max: number): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;

const asciiField = (value: unknown): value is string =>
    typeof value === "string"
    && value.length >= 1
    && value.length <= EFFECT_MAX_FIELD_LENGTH
    && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);

const decimalInteger = /^-?[0-9]+$/;

/**
 * Count the bytes a JavaScript string occupies when encoded as UTF-8.
 * This is deliberately implemented without TextEncoder so shared stays ES2017-only.
 * Well-formed strings follow the same encoding as TextEncoder; an unpaired surrogate
 * is counted as the replacement character and rejected separately by the validator,
 * because Redis cjson cannot decode it from a JSON envelope.
 */
export function utf8ByteLength(value: string): number {
    let bytes = 0;
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code <= 0x7f) {
            bytes += 1;
        } else if (code <= 0x7ff) {
            bytes += 2;
        } else if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                bytes += 4;
                i++;
            } else {
                bytes += 3;
            }
        } else {
            // BMP code points and an unpaired low surrogate both encode to three
            // bytes under replacement-character UTF-8 encoding.
            bytes += 3;
        }
    }
    return bytes;
}

const isWellFormedUnicode = (value: string): boolean => {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                i++;
                continue;
            }
            return false;
        }
        if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
};

/** Validate the field-specific UTF-8 string encoding used by setField. */
export function validateEffectFieldValue(field: string, value: unknown, path = "grant.value"): string {
    if (typeof value !== "string") {
        fail("EFFECT_VALUE", path);
    }
    const text = value as string;
    if (!isWellFormedUnicode(text)) { fail("EFFECT_VALUE", path); }
    const byteLength = utf8ByteLength(text);
    if (byteLength > EFFECT_MAX_VALUE_BYTES) { fail("EFFECT_VALUE", path); }
    const rule = (EFFECT_FIELD_VALUE_RULES as Record<string, EffectFieldValueRule | undefined>)[field];
    if (rule === undefined) { return fail("EFFECT_FIELD", `${path}.field`); }
    if (rule.kind === "text") {
        if (byteLength > rule.maxBytes) { fail("EFFECT_VALUE", path); }
    } else if (rule.kind === "flag") {
        if (text !== "0" && text !== "1") { fail("EFFECT_VALUE", path); }
    } else {
        if (!decimalInteger.test(text)) { fail("EFFECT_VALUE", path); }
        const numeric = Number(text);
        if (!Number.isSafeInteger(numeric) || numeric < rule.min || numeric > rule.max) {
            fail("EFFECT_VALUE", path);
        }
    }
    return text;
}

/**
 * Validate one grant using the same limits as the durable effect envelope.
 * Response payloads (purchase/query) expose grants too, so keeping this
 * primitive public prevents the response validator from accepting a weaker
 * shape than the write path.
 */
export function validateGrant(input: unknown, path = "grant"): IGrant {
    try {
        if (!isRecord(input)) { fail("EFFECT_GRANT_NOT_OBJECT", path); }
        const grant = input as RecordLike;
        if (typeof grant.kind !== "string") { fail("EFFECT_UNKNOWN_KIND", `${path}.kind`); }

        if (grant.kind === "item") {
            if (!exactKeys(grant, ["kind", "itemId", "count"])) { fail("EFFECT_GRANT_KEYS", path); }
            if (!finiteIntegerIn(grant.itemId, 1, EFFECT_MAX_ITEM_ID)) {
                fail("EFFECT_ITEM_ID", `${path}.itemId`);
            }
            if (!finiteIntegerIn(grant.count, -EFFECT_MAX_COUNT, EFFECT_MAX_COUNT) || grant.count === 0) {
                fail("EFFECT_COUNT", `${path}.count`);
            }
            return { kind: "item", itemId: grant.itemId as number, count: grant.count as number };
        }
        if (grant.kind === "star") {
            if (!exactKeys(grant, ["kind", "delta"])) { fail("EFFECT_GRANT_KEYS", path); }
            if (!finiteIntegerIn(grant.delta, -EFFECT_MAX_DELTA, EFFECT_MAX_DELTA) || grant.delta === 0) {
                fail("EFFECT_DELTA", `${path}.delta`);
            }
            return { kind: "star", delta: grant.delta as number };
        }
        if (grant.kind === "setField") {
            if (!exactKeys(grant, ["kind", "field", "value"])) { fail("EFFECT_GRANT_KEYS", path); }
            if (EFFECT_RESERVED_FIELDS.includes(grant.field as (typeof EFFECT_RESERVED_FIELDS)[number])) {
                fail("EFFECT_RESERVED_FIELD", `${path}.field`);
            }
            if (!asciiField(grant.field)) { fail("EFFECT_FIELD", `${path}.field`); }
            if (!EFFECT_FIELD_ALLOWLIST.includes(grant.field as (typeof EFFECT_FIELD_ALLOWLIST)[number])) {
                fail("EFFECT_FIELD", `${path}.field`);
            }
            const value = validateEffectFieldValue(grant.field as string, grant.value, `${path}.value`);
            return { kind: "setField", field: grant.field as string, value };
        }
        return fail("EFFECT_UNKNOWN_KIND", `${path}.kind`);
    } catch (error) {
        if (isEffectValidationError(error)) throw error;
        return fail("EFFECT_DATA_CORRUPT", path);
    }
}

/**
 * 严格校验带版本的 effect envelope，并返回防止调用方后续 mutate 的规范化副本。
 * ⛔ 这里刻意不接受裸数组；存量数组由 normalizeEffect 显式升格到当前版本。
 */
export function validateEffect(input: unknown): IEffect {
    try {
        if (!isRecord(input)) { fail("EFFECT_NOT_OBJECT", "effect"); }
        const effect = input as RecordLike;
        if (!exactKeys(effect, ["schemaVersion", "grants"])) { fail("EFFECT_KEYS", "effect"); }
        if (effect.schemaVersion !== EFFECT_SCHEMA_VERSION) {
            fail("EFFECT_SCHEMA_VERSION", "effect.schemaVersion");
        }
        const grantList = effect.grants;
        if (!Array.isArray(grantList)) { fail("EFFECT_GRANTS", "effect.grants"); }
        const grantsInput = grantList as unknown[];
        if (grantsInput.length > EFFECT_MAX_GRANTS) {
            fail("EFFECT_TOO_LARGE", "effect.grants");
        }

        let quantity = 0;
        const grants: IGrant[] = [];
        for (let i = 0; i < grantsInput.length; i++) {
            const raw = grantsInput[i];
            const path = `effect.grants[${i}]`;
            const grant = validateGrant(raw, path);
            if (grant.kind === "item") quantity += Math.abs(grant.count);
            else if (grant.kind === "star") quantity += Math.abs(grant.delta);
            grants.push(grant);
            if (quantity > EFFECT_MAX_QUANTITY) { fail("EFFECT_QUANTITY", "effect.grants"); }
        }
        return { schemaVersion: EFFECT_SCHEMA_VERSION, grants };
    } catch (error) {
        if (isEffectValidationError(error)) throw error;
        return fail("EFFECT_DATA_CORRUPT", "effect");
    }
}

/** 兼容历史 outbox/mail JSON 数组；所有新写入在返回后都使用 envelope。 */
export function normalizeEffect(input: unknown): IEffect {
    try {
        let value = input;
        if (typeof value === "string") {
            try { value = JSON.parse(value) as unknown; }
            catch { fail("EFFECT_NOT_OBJECT", "effect"); }
        }
        // Keep Array.isArray and any array Proxy trap inside the same effect
        // error boundary as the rest of normalization.
        if (Array.isArray(value)) {
            return validateEffect({ schemaVersion: EFFECT_SCHEMA_VERSION, grants: value });
        }
        return validateEffect(value);
    } catch (error) {
        if (isEffectValidationError(error)) throw error;
        return fail("EFFECT_DATA_CORRUPT", "effect");
    }
}

/** 仅在需要返回旧版 API 形状时取 grants；仍先经过完整校验。 */
export function effectGrants(input: unknown): IGrant[] {
    return normalizeEffect(input).grants;
}

export function isValidEffect(input: unknown): boolean {
    try { normalizeEffect(input); return true; }
    catch { return false; }
}

/** status = 'granting' → 客户端用 shop.queryOp 短轮询，⛔ 不要「超时即失败」（04）。 */
export interface IPurchaseResult {
    opId: string;
    status: "done" | "granting" | "dead";
    /** 扣费后余额（分） */
    balance: number;
    granted?: IGrant[];
}
