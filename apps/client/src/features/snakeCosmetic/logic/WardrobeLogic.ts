/**
 * 衣柜面板逻辑（纯 TS，无头单测）：筛选、装备/合成提交闸、错误翻译、设备本地红点。
 * 渲染归 ../view/WardrobeView.ts；⛔ 不 import cc（铁律 9）。
 *
 * 错误分支只按 `RpcError.code` 分派（域错误码 + 客户端本地码 CONN_LOST/TIMEOUT），
 * ⛔ 不解析错误文案——`insufficientFragments` 的缺口由本层用已缓存的 profile 自算。
 */
import type {
    ISnakeCosmeticCatalogEntry,
    ISnakeCosmeticProfile,
} from "../../../shared/protocol/lobbyRpc/domains/snakeCosmetic";
import type { SnakeCosmeticRuntime } from "./snakeCosmeticRuntime";

export type WardrobeFilter = "all" | "owned" | "unowned" | "craftable";
export type WardrobeNoticeKind = "idle" | "success" | "error";

export interface WardrobeNotice {
    readonly kind: WardrobeNoticeKind;
    readonly text: string;
}

/** 一行皮肤的可渲染投影（View 只读这个，⛔ 不自己算业务判据）。 */
export interface WardrobeRow {
    readonly skinId: number;
    readonly displayName: string;
    readonly rarity: number;
    readonly rarityName: string;
    readonly acquisitionText: string;
    readonly owned: boolean;
    readonly equipped: boolean;
    /** 仅碎片皮肤有值：当前余额 / 门槛。 */
    readonly fragments: { readonly balance: number; readonly threshold: number } | null;
    readonly canEquip: boolean;
    readonly canCraft: boolean;
    readonly isNew: boolean;
}

/** 原作 6 档制的中文名（0..5），出处见 shared 域文件抬头与 S3 文档。 */
const RARITY_NAMES: readonly string[] = ["普通", "稀有", "史诗", "传说", "典藏", "至臻"];

const ACQUISITION_TEXT: Readonly<Record<string, string>> = {
    default: "默认拥有",
    levelUnlock: "等级解锁",
    achievementUnlock: "成就解锁",
    fragmentCraft: "碎片合成",
    locked: "暂不开放",
};

const IDLE: WardrobeNotice = { kind: "idle", text: "选择一件皮肤后装备或合成" };
const NOT_READY: WardrobeNotice = { kind: "error", text: "衣柜未就绪（feature 未装载）" };

/** 设备本地红点键。⛔ 只存已查看的皮肤 ID，不影响服务端 profile。 */
export const VIEWED_SKINS_STORAGE_KEY = "snakeCosmetic.viewedSkinIds.v1";

export interface WardrobeStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function errorCodeOf(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

export function describeWardrobeError(error: unknown): string {
    switch (errorCodeOf(error)) {
        case "SNAKE_SKIN_UNKNOWN": return "皮肤不存在或已下架";
        case "SNAKE_SKIN_NOT_OWNED": return "还没有这件皮肤，先合成或解锁";
        case "SNAKE_SKIN_NOT_CRAFTABLE": return "这件皮肤不支持碎片合成";
        case "SNAKE_SKIN_FRAGMENTS_INSUFFICIENT": return "碎片不足，先攒够再来";
        case "CONN_LOST":
        case "TIMEOUT": return "网络不可用，稍后重试";
        default: {
            const code = errorCodeOf(error);
            return code ? `操作失败（${code}）` : "操作失败，请稍后重试";
        }
    }
}

export class WardrobeLogic {
    onChanged: () => void = () => {};

    private profile: ISnakeCosmeticProfile | null = null;
    private catalog: readonly ISnakeCosmeticCatalogEntry[] = [];
    private filter: WardrobeFilter = "all";
    private busy = false;
    private loaded = false;
    private notice: WardrobeNotice;
    private viewed: Set<number>;

    constructor(
        private readonly runtime: SnakeCosmeticRuntime | null,
        private readonly storage: WardrobeStorage | null = null,
    ) {
        this.notice = runtime ? IDLE : NOT_READY;
        this.viewed = this.readViewed();
    }

    isReady(): boolean { return this.runtime !== null; }
    isBusy(): boolean { return this.busy; }
    isLoaded(): boolean { return this.loaded; }
    currentFilter(): WardrobeFilter { return this.filter; }
    currentNotice(): WardrobeNotice { return this.notice; }
    equippedSkinId(): number { return this.profile?.equippedSkinId ?? 0; }

    /** 打开面板时拉一次；这同时是服务端 profile 的**预热**入口。 */
    async load(): Promise<void> {
        const runtime = this.runtime;
        if (!runtime || this.busy) return;
        this.busy = true;
        this.onChanged();
        try {
            const snapshot = await runtime.getSnapshot();
            this.profile = snapshot.profile;
            this.catalog = snapshot.catalog;
            this.loaded = true;
            this.notice = IDLE;
        } catch (error) {
            this.notice = { kind: "error", text: describeWardrobeError(error) };
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    setFilter(filter: WardrobeFilter): void {
        if (this.filter === filter) return;
        this.filter = filter;
        this.onChanged();
    }

    /** 当前筛选下的行；⛔ 顺序固定按 catalog（服务端已按 sortOrder 排好）。 */
    rows(): readonly WardrobeRow[] {
        const profile = this.profile;
        const owned = new Set(profile?.ownedSkinIds ?? []);
        const all = this.catalog.map((entry) => this.rowOf(entry, owned, profile));
        switch (this.filter) {
            case "owned": return all.filter((row) => row.owned);
            case "unowned": return all.filter((row) => !row.owned);
            case "craftable": return all.filter((row) => row.canCraft);
            default: return all;
        }
    }

    private rowOf(
        entry: ISnakeCosmeticCatalogEntry,
        owned: ReadonlySet<number>,
        profile: ISnakeCosmeticProfile | null,
    ): WardrobeRow {
        const isOwned = owned.has(entry.skinId);
        const equipped = profile?.equippedSkinId === entry.skinId;
        const threshold = entry.fragmentThreshold;
        const balance = profile?.fragmentBalances[String(entry.skinId)] ?? 0;
        const fragments = threshold === null ? null : { balance, threshold };
        return {
            skinId: entry.skinId,
            displayName: entry.displayName,
            rarity: entry.rarity,
            rarityName: RARITY_NAMES[entry.rarity] ?? `档位 ${entry.rarity}`,
            acquisitionText: ACQUISITION_TEXT[entry.acquisition] ?? entry.acquisition,
            owned: isOwned,
            equipped,
            fragments,
            canEquip: isOwned && !equipped && !this.busy && this.runtime !== null,
            canCraft: !isOwned && fragments !== null && fragments.balance >= fragments.threshold
                && !this.busy && this.runtime !== null,
            isNew: isOwned && !this.viewed.has(entry.skinId),
        };
    }

    async equip(skinId: number): Promise<boolean> {
        return this.submit(skinId, (runtime) => runtime.equip(skinId), "已装备");
    }

    async craft(skinId: number): Promise<boolean> {
        return this.submit(skinId, (runtime) => runtime.unlock(skinId), "合成成功");
    }

    private async submit(
        skinId: number,
        call: (runtime: SnakeCosmeticRuntime) => Promise<{ profile: ISnakeCosmeticProfile }>,
        okText: string,
    ): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            const result = await call(runtime);
            this.profile = result.profile;
            this.notice = { kind: "success", text: okText };
            this.markViewed(skinId);
            return true;
        } catch (error) {
            this.notice = { kind: "error", text: describeWardrobeError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    /** 红点：设备本地，损坏或写失败时降级为内存状态，⛔ 不影响服务端 profile。 */
    markViewed(skinId: number): void {
        if (this.viewed.has(skinId)) return;
        this.viewed.add(skinId);
        try {
            this.storage?.setItem(VIEWED_SKINS_STORAGE_KEY, JSON.stringify([...this.viewed].sort((a, b) => a - b)));
        } catch {
            // 写失败只降级为内存态。
        }
    }

    private readViewed(): Set<number> {
        try {
            const raw = this.storage?.getItem(VIEWED_SKINS_STORAGE_KEY);
            if (!raw) return new Set();
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return new Set();
            return new Set(parsed.filter((value): value is number => Number.isSafeInteger(value)));
        } catch {
            return new Set();
        }
    }

    close(): void {
        this.runtime?.close();
    }
}
