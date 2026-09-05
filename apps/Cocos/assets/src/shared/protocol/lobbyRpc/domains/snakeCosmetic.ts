/**
 * snakeCosmetic 域 ws-RPC 契约（S3-02 Demo 衣柜：getSnapshot / equip / unlock）。
 *
 * **执行模式**：GetSnapshot=query；Equip/Unlock=**natural-write**——写入天然可安全重复
 * （重复装备同一皮肤是 no-op、重复解锁已拥有皮肤不再扣碎片，判据在服务端用例层
 *  `rooms/modes/snake/cosmeticProfile.ts`），⛔ 不进通用幂等层、请求不带 `clientReqId`。
 * ⚠ 这不是风格选择：`defineRpcIdempotentWrite` 强制 request 接口字面含必选 `clientReqId`，
 * 与下面「入参只有 skinId」的拍板互斥。
 *
 * **拍板 A「服务端单方面权威」**（docs/s/README.md §9.1）：入参只有 `skinId`，
 * ⛔ 不加 `catalogHash`、⛔ 不采信客户端自报的皮肤目录。
 *
 * ⛔ wire validator 只做结构/边界校验，**不查皮肤目录**——目录判据留在服务端用例层，
 * 否则 `SNAKE_SKIN_UNKNOWN` 会被折叠成 `INVALID_PAYLOAD`，客户端丢掉可判别错误码。
 *
 * 顶层须保持可静态读取形态（生成器只做语法解析，约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, finiteInteger, WireValidationError, type RuntimeValidator } from "../../http";
import { defineLobbyRpcDomain, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";
import { emptyPayload, rpcRecord } from "../primitives";

/** snakeCosmetic 域路由名。⛔ 成员必须是「标识符键: 字符串字面量」，否则整表不被生成器索引。 */
export const SnakeCosmeticRpc = {
    /** 读当前 uid 的衣柜快照（首次由服务端触发 Redis 回灌） */
    GetSnapshot: "snakeCosmetic.getSnapshot",
    /** 装备一件已拥有的皮肤 */
    Equip: "snakeCosmetic.equip",
    /** 用专属碎片合成解锁 */
    Unlock: "snakeCosmetic.unlock",
} as const;

/** 衣柜快照。`version` 只供客户端刷新去重，⛔ 不是并发控制令牌，也不写进 Redis。 */
export interface ISnakeCosmeticProfile {
    readonly version: number;
    readonly equippedSkinId: number;
    /** 升序去重 */
    readonly ownedSkinIds: readonly number[];
    /** 键 = 碎片皮肤 ID 的十进制字符串；键集合由服务端业务目录权威决定，⛔ shared 不硬编码 */
    readonly fragmentBalances: Readonly<Record<string, number>>;
}

export interface ISnakeCosmeticGetSnapshotReq {}

export interface ISnakeCosmeticSkinReq {
    readonly skinId: number;
}

export interface ISnakeCosmeticProfileRes {
    readonly profile: ISnakeCosmeticProfile;
}

/** wire 侧规模硬顶。⛔ 不是业务判据——碎片皮肤集合的真源在服务端，shared 看不到。 */
const MAX_OWNED_SKIN_IDS = 512;
const MAX_FRAGMENT_KEYS = 64;
const FRAGMENT_KEY_PATTERN = /^[1-9][0-9]{0,8}$/u;

/**
 * 私有子 validator（descriptor 不引用它，⛔ 无需导出）。
 * ⚠ validator 是**重建对象**而不是「校验后放行」：客户端 resolve 的是这里的返回值，
 * 漏重建的字段会被静默丢掉，所以每个字段都必须显式写回。
 */
function validateSnakeCosmeticProfile(input: unknown, path: string): ISnakeCosmeticProfile {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["version", "equippedSkinId", "ownedSkinIds", "fragmentBalances"], [], path);

    const ownedRaw: unknown = value.ownedSkinIds;
    if (!Array.isArray(ownedRaw) || ownedRaw.length > MAX_OWNED_SKIN_IDS) {
        throw new WireValidationError("WIRE_ARRAY", `${path}.ownedSkinIds`);
    }
    const ownedSkinIds = (ownedRaw as readonly unknown[]).map(
        (item, index) => finiteInteger(item, `${path}.ownedSkinIds[${index}]`, 1),
    );

    // 开放键 Record：键集合是服务端权威，只能做「形态 + 规模 + 非负整数」的有界校验。
    const fragmentsPath = `${path}.fragmentBalances`;
    const fragmentsRaw = rpcRecord(value.fragmentBalances, fragmentsPath);
    const keys = Object.keys(fragmentsRaw);
    if (keys.length > MAX_FRAGMENT_KEYS) throw new WireValidationError("WIRE_KEYS", fragmentsPath);
    const fragmentBalances: Record<string, number> = {};
    for (const key of keys) {
        if (!FRAGMENT_KEY_PATTERN.test(key)) throw new WireValidationError("WIRE_KEYS", fragmentsPath);
        fragmentBalances[key] = finiteInteger(fragmentsRaw[key], `${fragmentsPath}.${key}`, 0);
    }

    return {
        version: finiteInteger(value.version, `${path}.version`, 0),
        equippedSkinId: finiteInteger(value.equippedSkinId, `${path}.equippedSkinId`, 1),
        ownedSkinIds,
        fragmentBalances,
    };
}

export const validateSnakeCosmeticGetSnapshotReq: RuntimeValidator<ISnakeCosmeticGetSnapshotReq> = emptyPayload;

export const validateSnakeCosmeticSkinReq: RuntimeValidator<ISnakeCosmeticSkinReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["skinId"], [], "payload");
    return { skinId: finiteInteger(value.skinId, "payload.skinId", 1) };
};

export const validateSnakeCosmeticProfileRes: RuntimeValidator<ISnakeCosmeticProfileRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["profile"], [], "response");
    return { profile: validateSnakeCosmeticProfile(value.profile, "response.profile") };
};

export default defineLobbyRpcDomain({
    domain: "snakeCosmetic",
    contractVersion: 1,
    errorCodes: [
        "SNAKE_SKIN_UNKNOWN",
        "SNAKE_SKIN_NOT_OWNED",
        "SNAKE_SKIN_NOT_CRAFTABLE",
        "SNAKE_SKIN_FRAGMENTS_INSUFFICIENT",
    ],
    pushes: [],
    routes: [
        defineRpcQuery(SnakeCosmeticRpc.GetSnapshot, {
            request: validateSnakeCosmeticGetSnapshotReq,
            response: validateSnakeCosmeticProfileRes,
        }),
        defineRpcNaturalWrite(SnakeCosmeticRpc.Equip, {
            request: validateSnakeCosmeticSkinReq,
            response: validateSnakeCosmeticProfileRes,
        }),
        defineRpcNaturalWrite(SnakeCosmeticRpc.Unlock, {
            request: validateSnakeCosmeticSkinReq,
            response: validateSnakeCosmeticProfileRes,
        }),
    ],
});
