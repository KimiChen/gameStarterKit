/**
 * 竞技场商店逻辑（纯 TS，无头单测）：加载棋盘 → 只列出**自己的**格（经 arena kit 的 client board 面格式化）→
 * 点格购买 boost（在途闸 + 宿主就绪闸）→ 结果 / 错误翻译为一行提示。渲染归 ../view/ArenaShopView.ts；⛔ 不 import cc。
 * 插件只 import kit 的 api 门面（../../../kits/arena/api/board）与 shared 域文件，⛔ 不 import kit 内部模块。
 *
 * 错误分支只按 RpcError.code 分派（本域 / 框架经济码 / 客户端本地码），⛔ 不解析错误文案。
 */
import { type ArenaTileView, type IArenaTile, describeBoard, formatTile } from "../../../kits/arena/api/board/index";
import { ARENA_SHOP_BOOST_COST } from "../../../shared/protocol/lobbyRpc/domains/arenaShop";
import type { ArenaShopRuntime } from "./arenaShopRuntime";

export type ArenaShopNoticeKind = "idle" | "success" | "error";

export interface ArenaShopNotice {
    readonly kind: ArenaShopNoticeKind;
    readonly text: string;
}

const IDLE: ArenaShopNotice = { kind: "idle", text: `点自己的格花 ${ARENA_SHOP_BOOST_COST} 金币加守备` };
const NOT_READY: ArenaShopNotice = { kind: "error", text: "竞技场商店未就绪（plugin 未装载）" };

function errorCodeOf(error: unknown): string | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

export function describeArenaShopError(error: unknown): string {
    const code = errorCodeOf(error);
    switch (code) {
        case "ARENA_SHOP_TILE_NOT_OWNED": return "这格不是你的，先去竞技场占领";
        case "INSUFFICIENT_BALANCE": return "金币不足";
        case "CONN_LOST":
        case "TIMEOUT": return "网络不可用，稍后重试（已发出的购买不会重复扣款）";
        default: return code ? `购买失败（${code}）` : "购买失败，请稍后重试";
    }
}

export class ArenaShopLogic {
    /** 任一可见状态变化后的重绘通知（View 接线）。 */
    onChanged: () => void = () => {};

    private tiles: IArenaTile[] = [];
    private loaded = false;
    private busy = false;
    private balance: number | null = null;
    private notice: ArenaShopNotice;

    constructor(private readonly runtime: ArenaShopRuntime | null) {
        this.notice = runtime ? IDLE : NOT_READY;
    }

    isReady(): boolean { return this.runtime !== null; }
    isBusy(): boolean { return this.busy; }
    isLoaded(): boolean { return this.loaded; }
    /** 最近一次购买后的余额（未购买过为 null：本插件没有余额只读接口）。 */
    lastBalance(): number | null { return this.balance; }
    currentNotice(): ArenaShopNotice { return this.notice; }
    boostCost(): number { return ARENA_SHOP_BOOST_COST; }

    /** 自己占领的格（商店只对它们售卖 boost）。 */
    ownTiles(): ArenaTileView[] {
        return describeBoard(this.tiles, this.runtime?.selfUid() ?? "").filter((tile) => tile.ownership === "self");
    }

    canBuy(tile: number): boolean {
        return this.runtime !== null && !this.busy && this.loaded && this.ownTiles().some((item) => item.tile === tile);
    }

    /** 加载 / 刷新棋盘：返回是否成功（失败写提示，保留旧棋盘）。 */
    async refresh(keepNotice = false): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || this.busy) return false;
        this.busy = true;
        this.onChanged();
        try {
            const result = await runtime.board();
            this.tiles = result.tiles;
            this.loaded = true;
            return true;
        } catch (error) {
            if (!keepNotice) this.notice = { kind: "error", text: describeArenaShopError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    /** 购买 boost：返回是否成功。不满足闸时 no-op 返回 false（⛔ 不排队第二次写）。 */
    async buy(tile: number): Promise<boolean> {
        const runtime = this.runtime;
        if (!runtime || !this.canBuy(tile)) return false;
        const label = formatTile(this.ownTiles().find((item) => item.tile === tile)!);
        this.busy = true;
        this.onChanged();
        try {
            const result = await runtime.buyBoost(tile);
            // balance=null = 同 opId 账本重放（本次未扣款，服务端不带余额）：保留上次已知余额，提示里说明
            if (result.balance !== null) this.balance = result.balance;
            this.tiles = this.tiles.map((item) => (item.tile === tile ? { ...item, power: result.power } : item));
            this.notice = {
                kind: "success",
                text: result.balance === null
                    ? `${label} → 守备 ${result.power}（重放：本次未扣款）`
                    : `${label} → 守备 ${result.power}，余额 ${result.balance}`,
            };
            return true;
        } catch (error) {
            this.notice = { kind: "error", text: describeArenaShopError(error) };
            return false;
        } finally {
            this.busy = false;
            this.onChanged();
        }
    }

    close(): void {
        this.runtime?.close();
    }
}
