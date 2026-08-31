/**
 * Lobby RPC 校验积木（原 index.ts 私有小积木逐字迁出；阶段 3 起为各域 domain 文件共用）。
 *
 * 语义保持不变：exact keys / 有限数值 / 边界字符串全部继续走 ../http 的 wire 积木；
 * `guardRpcValidator` 让 validator map 的直接消费者停留在同一 wire 异常边界内。
 */
import { assertExactKeys, boundedString, guardWire, isPlainRecord, type PlainRecord, type RuntimeValidator, WireValidationError } from "../http";

export function rpcRecord(input: unknown, path = "payload"): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("RPC_PAYLOAD_OBJECT", path);
    return input;
}

export function emptyPayload(input: unknown): Record<string, never> {
    const value = rpcRecord(input);
    assertExactKeys(value, [], [], "payload");
    return {};
}

export function requiredId(value: PlainRecord, key: string, max = 64): string {
    return boundedString(value[key], `payload.${key}`, 1, max);
}

export function optionalRpcString(value: PlainRecord, key: string, max: number): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === undefined) return undefined;
    return boundedString(value[key], `payload.${key}`, 0, max);
}

export function boolField(value: PlainRecord, key: string): boolean {
    if (typeof value[key] !== "boolean") throw new WireValidationError("RPC_BOOLEAN", `payload.${key}`);
    return value[key] as boolean;
}

/** 推送 data 的 record 闸（原 push.ts 私有 pushRecord 逐字迁出）。 */
export function pushRecord(input: unknown, path: string): PlainRecord {
    if (!isPlainRecord(input)) throw new WireValidationError("PUSH_OBJECT", path);
    return input;
}

/** 通用 `{ ok: boolean }` 响应 validator（原 index.ts 的 validateOkRes；多域按各自 res 类型别名引用）。 */
export const validateOkRes: RuntimeValidator<{ ok: boolean }> = (input) => {
    const value = rpcRecord(input, "response"); assertExactKeys(value, ["ok"], [], "response"); return { ok: boolField(value, "ok") };
};

/** Keep direct consumers of the exported validator maps inside the same wire boundary. */
export const guardRpcValidator = <T>(path: string, validator: RuntimeValidator<T>): RuntimeValidator<T> =>
    (input: unknown) => guardWire(path, () => validator(input));
