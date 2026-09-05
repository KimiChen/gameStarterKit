/**
 * S3 Demo 衣柜 profile：**进程内唯一真相 + Redis best-effort 镜像**。
 *
 * 形态沿用 S2R 的 `demoBalances`（`lifecycle.ts`）：模块级 Map、同步改内存、再 fire-and-forget
 * 写 Redis，写失败只告警不回滚。两点与 S2R 不同，都是 docs/s/s3 的显式判据：
 *  1. **读函数返回深拷贝**——⛔ 绝不把模块内可变对象交给 handler 或客户端（s3「对外返回排序后的副本」）。
 *  2. **回灌用白名单 `HMGET`**——⛔ 全仓禁 `HGETALL`（09·R1，见 `core/userRecord.ts` 抬头与 docs/SERVER.md）。
 *
 * ⚠ 本模块只读写三个 cosmetic field（`equippedSkinId` / `ownedSkinIds` / `fragmentBalances`）。
 * `coinBalance` 归 S2R 的钱包路径独占；⛔ 不要在这里合并写——两条 fire-and-forget 路径各持一份
 * 可能过期的快照，合并写会让后到者用旧值覆盖新值。S4 统一终局写入时再处理。
 */

import { clientFor } from "../../../core/infra/redisRoute";
import { kSnakeUser } from "./keys";
import { SNAKE_FRAGMENT_SKIN_IDS, SNAKE_FRAGMENT_SKIN_THRESHOLDS } from "./skinBusinessCatalog";
import { DEFAULT_SNAKE_SKIN, isPlayerUsableSnakeSkin } from "@game/shared";

/** Redis HASH 中本阶段允许的三个 field，⛔ 不含 `sId`、run、状态或时间戳。 */
export const SNAKE_COSMETIC_FIELDS = Object.freeze(["equippedSkinId", "ownedSkinIds", "fragmentBalances"] as const);

export type SnakeFragmentBalances = Readonly<Record<string, number>>;

export interface SnakeDemoCosmeticProfile {
    /** 只用于当前进程内刷新 UI，⛔ 不是 Redis 并发控制，也不写进 Redis。 */
    readonly version: number;
    readonly equippedSkinId: number;
    /** 升序去重。 */
    readonly ownedSkinIds: readonly number[];
    /** 固定四个碎片皮肤 ID 为键。 */
    readonly fragmentBalances: SnakeFragmentBalances;
}

export type SnakeCosmeticFailure =
    | { readonly kind: "unknownSkin" }
    | { readonly kind: "notOwned" }
    | { readonly kind: "notCraftable" }
    | { readonly kind: "insufficientFragments"; readonly required: number; readonly balance: number };

export type SnakeCosmeticResult =
    | { readonly kind: "ok"; readonly profile: SnakeDemoCosmeticProfile }
    | SnakeCosmeticFailure;

type MutableProfile = {
    version: number;
    equippedSkinId: number;
    ownedSkinIds: number[];
    fragmentBalances: Record<string, number>;
};

const profiles = new Map<string, MutableProfile>();
/** 已尝试过 Redis 回灌的 uid：失败也记，避免每次 RPC 重复打 Redis。 */
const hydrated = new Set<string>();

const defaultFragmentBalances = (): Record<string, number> =>
    Object.fromEntries(SNAKE_FRAGMENT_SKIN_IDS.map((skinId) => [String(skinId), 0]));

const defaultProfile = (): MutableProfile => ({
    version: 0,
    equippedSkinId: DEFAULT_SNAKE_SKIN.skinId,
    ownedSkinIds: [DEFAULT_SNAKE_SKIN.skinId],
    fragmentBalances: defaultFragmentBalances(),
});

/** 对外快照：深拷贝 + 升序，⛔ 调用方拿到的任何改动都不会回流到模块内。 */
const snapshot = (profile: MutableProfile): SnakeDemoCosmeticProfile => ({
    version: profile.version,
    equippedSkinId: profile.equippedSkinId,
    ownedSkinIds: [...profile.ownedSkinIds].sort((a, b) => a - b),
    fragmentBalances: { ...profile.fragmentBalances },
});

const ensure = (uid: string): MutableProfile => {
    let profile = profiles.get(uid);
    if (!profile) {
        profile = defaultProfile();
        profiles.set(uid, profile);
    }
    return profile;
};

// ── Redis 编解码：任何不合法输入都退回默认值，⛔ 坏值不得进入客户端或玩法 ──────────────

const parseOwnedSkinIds = (raw: string): number[] | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const out: number[] = [];
    for (const value of parsed) {
        if (!Number.isSafeInteger(value) || (value as number) <= 0) return null;
        if (!isPlayerUsableSnakeSkin(value as number)) return null;
        if (out.includes(value as number)) return null;
        out.push(value as number);
    }
    if (!out.includes(DEFAULT_SNAKE_SKIN.skinId)) out.push(DEFAULT_SNAKE_SKIN.skinId);
    return out.sort((a, b) => a - b);
};

const parseFragmentBalances = (raw: string): Record<string, number> | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const expected = SNAKE_FRAGMENT_SKIN_IDS.map(String).sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
    const out: Record<string, number> = {};
    for (const key of expected) {
        const value = record[key];
        if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
        out[key] = value as number;
    }
    return out;
};

const parseEquippedSkinId = (raw: string, owned: readonly number[]): number | null => {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    if (!isPlayerUsableSnakeSkin(value) || !owned.includes(value)) return null;
    return value;
};

export interface SnakeCosmeticPersistenceRecord {
    readonly uid: string;
    readonly equippedSkinId: number;
    readonly ownedSkinIds: readonly number[];
    readonly fragmentBalances: SnakeFragmentBalances;
}

export type SnakeCosmeticPersistence = (record: SnakeCosmeticPersistenceRecord) => Promise<void>;
export type SnakeCosmeticHydration = (uid: string) => Promise<readonly (string | null)[]>;

/** 单条 `HSET` 写三个 field，⛔ 不带 `coinBalance`（见文件抬头）。 */
const persistToRedis: SnakeCosmeticPersistence = async (record): Promise<void> => {
    await clientFor(record.uid).hset(
        kSnakeUser(record.uid),
        "equippedSkinId", String(record.equippedSkinId),
        "ownedSkinIds", JSON.stringify([...record.ownedSkinIds].sort((a, b) => a - b)),
        "fragmentBalances", JSON.stringify(record.fragmentBalances),
    );
};

/** 白名单 `HMGET`，⛔ 不用 `HGETALL`。 */
const hydrateFromRedis: SnakeCosmeticHydration = async (uid) =>
    clientFor(uid).hmget(kSnakeUser(uid), ...SNAKE_COSMETIC_FIELDS);

export interface SnakeCosmeticStoreOptions {
    readonly persistence?: SnakeCosmeticPersistence;
    readonly hydration?: SnakeCosmeticHydration;
    readonly reportError?: (error: unknown) => void;
    readonly reportCorrupt?: (uid: string, field: string) => void;
}

/**
 * Demo 衣柜用例层。所有写操作**同步**完成内存变更并立即返回，Redis 镜像不等待结果。
 */
export class SnakeDemoCosmeticStore {
    private readonly persistence: SnakeCosmeticPersistence;
    private readonly hydration: SnakeCosmeticHydration;
    private readonly reportError: (error: unknown) => void;
    private readonly reportCorrupt: (uid: string, field: string) => void;

    constructor(options: SnakeCosmeticStoreOptions = {}) {
        this.persistence = options.persistence ?? persistToRedis;
        this.hydration = options.hydration ?? hydrateFromRedis;
        this.reportError = options.reportError
            ?? ((error) => console.warn("[snake] demo cosmetic Redis mirror failed; in-process result is kept", error));
        this.reportCorrupt = options.reportCorrupt
            ?? ((uid, field) => console.warn(`[snake] demo cosmetic profile field ${field} is corrupt; falling back to default (uid=${uid})`));
    }

    /** 当前进程内快照（深拷贝）。未回灌过也能用——返回默认 profile。 */
    getSnapshot(uid: string): SnakeDemoCosmeticProfile {
        return snapshot(ensure(uid));
    }

    /**
     * 首次普通 Lobby RPC 的回灌：只在该 uid 尚未回灌过时打一次 Redis。
     * Redis 不可用或数据非法都不抛错——保留默认 profile 并告警。
     */
    async hydrate(uid: string): Promise<SnakeDemoCosmeticProfile> {
        if (hydrated.has(uid)) return this.getSnapshot(uid);
        hydrated.add(uid);
        let raw: readonly (string | null)[];
        try {
            raw = await this.hydration(uid);
        } catch (error) {
            this.reportError(error);
            return this.getSnapshot(uid);
        }
        const profile = ensure(uid);
        const [equippedRaw, ownedRaw, fragmentsRaw] = raw;
        if (ownedRaw !== null && ownedRaw !== undefined) {
            const owned = parseOwnedSkinIds(ownedRaw);
            if (owned === null) this.reportCorrupt(uid, "ownedSkinIds");
            else profile.ownedSkinIds = owned;
        }
        if (fragmentsRaw !== null && fragmentsRaw !== undefined) {
            const fragments = parseFragmentBalances(fragmentsRaw);
            if (fragments === null) this.reportCorrupt(uid, "fragmentBalances");
            else profile.fragmentBalances = fragments;
        }
        if (equippedRaw !== null && equippedRaw !== undefined) {
            const equipped = parseEquippedSkinId(equippedRaw, profile.ownedSkinIds);
            if (equipped === null) this.reportCorrupt(uid, "equippedSkinId");
            else profile.equippedSkinId = equipped;
        }
        return this.getSnapshot(uid);
    }

    /** 装备。目录存在且已拥有才生效；重复装备同一皮肤是 no-op（⛔ 不涨 version、不写 Redis）。 */
    equip(uid: string, skinId: number): SnakeCosmeticResult {
        if (!Number.isSafeInteger(skinId) || !isPlayerUsableSnakeSkin(skinId)) return { kind: "unknownSkin" };
        const profile = ensure(uid);
        if (!profile.ownedSkinIds.includes(skinId)) return { kind: "notOwned" };
        if (profile.equippedSkinId === skinId) return { kind: "ok", profile: snapshot(profile) };
        profile.equippedSkinId = skinId;
        profile.version += 1;
        return this.commit(uid, profile);
    }

    /** 碎片合成解锁。仅四款碎片皮肤；已拥有直接返回快照且⛔ 不再扣碎片。 */
    unlock(uid: string, skinId: number): SnakeCosmeticResult {
        if (!Number.isSafeInteger(skinId) || !isPlayerUsableSnakeSkin(skinId)) return { kind: "unknownSkin" };
        const threshold = SNAKE_FRAGMENT_SKIN_THRESHOLDS.get(skinId);
        if (threshold === undefined) return { kind: "notCraftable" };
        const profile = ensure(uid);
        if (profile.ownedSkinIds.includes(skinId)) return { kind: "ok", profile: snapshot(profile) };
        const key = String(skinId);
        const balance = profile.fragmentBalances[key] ?? 0;
        if (balance < threshold) return { kind: "insufficientFragments", required: threshold, balance };
        // 精确扣门槛并保留超额。
        profile.fragmentBalances[key] = balance - threshold;
        profile.ownedSkinIds = [...profile.ownedSkinIds, skinId].sort((a, b) => a - b);
        profile.version += 1;
        return this.commit(uid, profile);
    }

    private commit(uid: string, profile: MutableProfile): SnakeCosmeticResult {
        const result = snapshot(profile);
        void this.persistence({
            uid,
            equippedSkinId: result.equippedSkinId,
            ownedSkinIds: result.ownedSkinIds,
            fragmentBalances: result.fragmentBalances,
        }).catch(this.reportError);
        return { kind: "ok", profile: result };
    }
}

/**
 * 玩法侧**同步**读取当前装备皮肤（S3-03 的 run 起始锁存用）。
 *
 * ⚠ 只读进程内已预热的 profile：`createPlayer` 是同步的，⛔ 不能在这里 await Redis 回灌。
 * 未预热（客户端没先调 `snakeCosmetic.getSnapshot`）、uid 缺失、或装备值因目录漂移而失效时，
 * 一律回退默认皮肤 1——⛔ 绝不因为衣柜数据异常而让玩家进不了房。
 */
export function equippedSkinIdOf(uid: string | null): number {
    if (uid === null) return DEFAULT_SNAKE_SKIN.skinId;
    const profile = profiles.get(uid);
    if (!profile) return DEFAULT_SNAKE_SKIN.skinId;
    const { equippedSkinId } = profile;
    // 防御性复核：store 的写路径已保证「已拥有且可用」，但目录可能在两次发布之间漂移。
    if (!isPlayerUsableSnakeSkin(equippedSkinId) || !profile.ownedSkinIds.includes(equippedSkinId)) {
        return DEFAULT_SNAKE_SKIN.skinId;
    }
    return equippedSkinId;
}

/** 测试 seam：清空模块级状态。⛔ 运行时不要调用。 */
export function __resetSnakeCosmeticProfilesForTest(): void {
    profiles.clear();
    hydrated.clear();
}

/**
 * 测试 seam：绕过 equip 的校验直接写装备值，用于构造「目录漂移导致装备值失效」的场景。
 * ⛔ 运行时不要调用——正常写路径是 `equip()`，它保证「已拥有且可用」。
 */
export function __forceEquippedSkinIdForTest(uid: string, skinId: number): void {
    ensure(uid).equippedSkinId = skinId;
}

/** 测试 seam：直接注入碎片余额（S4 才有真正的发放路径）。⛔ 运行时不要调用。 */
export function __grantSnakeFragmentsForTest(uid: string, skinId: number, amount: number): void {
    const profile = ensure(uid);
    const key = String(skinId);
    profile.fragmentBalances[key] = (profile.fragmentBalances[key] ?? 0) + amount;
}
