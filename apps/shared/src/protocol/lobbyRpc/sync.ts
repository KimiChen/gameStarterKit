import { assertExactKeys, boundedString, finiteInteger, isPlainRecord, type RuntimeValidator, WireValidationError } from "../http";

/** 已提交的单用户模块差异；reply 与服务端主动 sync 帧共用。 */
export type LobbySyncValue = null | boolean | number | string | LobbySyncValue[] | { readonly [key: string]: LobbySyncValue };

export interface ILobbyDataSync {
    readonly mods: { readonly [key: string]: LobbySyncValue };
}

const MAX_DEPTH = 16;
const MAX_FIELDS = 2048;
const MAX_ARRAY = 4096;

function syncValue(input: unknown, path: string, depth: number): LobbySyncValue {
    if (depth > MAX_DEPTH) throw new WireValidationError("SYNC_DEPTH", path);
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "string") return boundedString(input, path, 0, 64 * 1024);
    if (typeof input === "number") {
        if (!Number.isFinite(input)) throw new WireValidationError("SYNC_NUMBER", path);
        return input;
    }
    if (Array.isArray(input)) {
        if (input.length > MAX_ARRAY) throw new WireValidationError("SYNC_ARRAY", path);
        return input.map((value, index) => syncValue(value, `${path}[${index}]`, depth + 1));
    }
    if (!isPlainRecord(input)) throw new WireValidationError("SYNC_VALUE", path);
    const keys = Object.keys(input);
    if (keys.length > MAX_FIELDS) throw new WireValidationError("SYNC_FIELDS", path);
    const out: { [key: string]: LobbySyncValue } = {};
    for (const key of keys) {
        boundedString(key, `${path}.key`, 1, 128);
        out[key] = syncValue(input[key], `${path}.${key}`, depth + 1);
    }
    return out;
}

export const validateLobbyDataSync: RuntimeValidator<ILobbyDataSync> = (input) => {
    if (!isPlainRecord(input)) throw new WireValidationError("SYNC_OBJECT", "sync");
    assertExactKeys(input, ["mods"], [], "sync");
    if (!isPlainRecord(input.mods)) throw new WireValidationError("SYNC_MODS", "sync.mods");
    const mods = syncValue(input.mods, "sync.mods", 0);
    if (!isPlainRecord(mods)) throw new WireValidationError("SYNC_MODS", "sync.mods");
    return { mods };
};

/** 供客户端去重：ModSync 的 versions 不是全局版本，按模块独立递增。 */
export function syncVersions(sync: ILobbyDataSync): Readonly<Record<string, number>> {
    const raw = sync.mods.versions;
    if (!isPlainRecord(raw)) return {};
    const versions: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) continue;
        versions[key] = finiteInteger(value, `sync.mods.versions.${key}`, 0);
    }
    return versions;
}
