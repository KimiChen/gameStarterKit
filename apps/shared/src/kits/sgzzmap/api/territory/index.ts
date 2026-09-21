/**
 * sgzzmap territory v1：19 态关系着色、连地判定与占领结算的零依赖单源。
 *
 * 取自《三国志·战略版》2084.1768：
 *   GRID_STATE 枚举   asset/config/S1/cn/res_pro/aoi_attr.lua:28（GRID_STATE_LIST）
 *   连地状态集         script/config/const.lua:238（COMMON_CONNECT_STATE）
 *
 * ⚠ 着色按**关系**，不按盟 id：一格的颜色取决于「观察者与地主的关系」，
 * 所以同一格对不同玩家可以是不同状态。⛔ 不要给每个同盟分配色相。
 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";

import { validateSgzzCell } from "../hexmap/index";

// ── 19 态 ────────────────────────────────────────────────────────────────────

/**
 * ⛔ 编号即线型：一经发布不得重排或复用。v1 不可达的那些也保留编号，
 * 免得以后加外交/国家系统时整表漂移。
 */
export const SgzzGridState = {
    UNDEFINE: 1,
    MY: 2,
    RIVAL: 3,
    UNION: 4,
    GANG_RIVAL: 5,
    GANG_FRIEND: 6,
    GANG_MASTER: 7,
    UNION_FALL: 8,
    UNION_CAPTURE: 9,
    FRIEND_UNION_CAPTURE: 10,
    FRIEND_UNION_FALL: 11,
    FRIEND_UNION_CAPTURE_PROTECTED: 12,
    UNION_COMRADE: 13,
    AI_FACTION_FRIEND: 14,
    WANDERING_RIVAL: 15,
    MY_ADDITION_LAND: 16,
    LEND_ROAD_UNION: 17,
    LEND_ROAD_GANG_FRIEND: 18,
    LEND_ROAD_RIVAL: 19,
} as const;
export type SgzzGridStateValue = (typeof SgzzGridState)[keyof typeof SgzzGridState];
export const SGZZ_GRID_STATE_MIN = 1;
export const SGZZ_GRID_STATE_MAX = 19;

/**
 * v1 够不到的状态，及各自缺的系统。
 * 一条用例钉住「可达集恰为本集合的补集」——加了新系统必须同时改这里，⛔ 不许悄悄多出一个状态。
 */
export const SGZZ_V1_UNREACHABLE_STATES: readonly SgzzGridStateValue[] = Object.freeze([
    SgzzGridState.GANG_RIVAL,                      // 需要外交（敌对同盟）
    SgzzGridState.GANG_FRIEND,                     // 需要外交（友盟）
    SgzzGridState.UNION_FALL,                      // 需要「陷落」态
    SgzzGridState.FRIEND_UNION_CAPTURE,            // 需要外交
    SgzzGridState.FRIEND_UNION_FALL,               // 需要外交 + 陷落
    SgzzGridState.FRIEND_UNION_CAPTURE_PROTECTED,  // 需要外交 + 保护期
    SgzzGridState.UNION_COMRADE,                   // 需要「战友」关系
    SgzzGridState.AI_FACTION_FRIEND,               // 需要 AI 势力
    SgzzGridState.WANDERING_RIVAL,                 // 需要流亡势力
    SgzzGridState.LEND_ROAD_UNION,                 // 需要借道（铺路车）
    SgzzGridState.LEND_ROAD_GANG_FRIEND,           // 需要借道 + 外交
    SgzzGridState.LEND_ROAD_RIVAL,                 // 需要借道
] as const);

/**
 * 可连地的状态集。
 * ⚠ 与原作 const.lua:238 的四项相比多了 GANG_MASTER 与 MY_ADDITION_LAND：
 * 本实现把「我的地」细分成 MY / MY_ADDITION_LAND、把「我盟的地」细分成 UNION / GANG_MASTER，
 * 不补进来会让盟主的地和自己的扩张地连不上，属实现细节而非规则改动。
 * ⚠ FRIEND_UNION（友盟**已落定**的地）刻意不在集合里——原作里友盟领土不延伸你的可及范围，
 * 只有它**正在攻占**的地才算。这条不对称有专门用例。
 */
export const SGZZ_COMMON_CONNECT_STATE: ReadonlySet<number> = Object.freeze(new Set<number>([
    SgzzGridState.MY,
    SgzzGridState.MY_ADDITION_LAND,
    SgzzGridState.UNION,
    SgzzGridState.GANG_MASTER,
    SgzzGridState.UNION_CAPTURE,
    SgzzGridState.FRIEND_UNION_CAPTURE,
])) as ReadonlySet<number>;

// ── 地块与观察者 ──────────────────────────────────────────────────────────────

export const SGZZ_MAX_DURABILITY = 99;
export const SGZZ_MAX_UID = 32;
export const SGZZ_MAX_AID = 32;

export interface ISgzzTile {
    readonly cell: number;
    /** "" = 无主格（数据库里没有这一行）。 */
    readonly ownerUid: string;
    /** 地主所属同盟，"" = 无盟。 */
    readonly ownerAid: string;
    /** 守军强度；无主格恒 0。 */
    readonly durability: number;
    /** 我方扩张地标记（原作 GRID_STATE_MY_ADDITION_LAND）。 */
    readonly addition: boolean;
    /** 正在攻占本格的同盟，"" = 无。P4 行军落地前恒 ""。 */
    readonly capturingAid: string;
}

export interface ISgzzViewer {
    readonly uid: string;
    /** 我的同盟，"" = 无盟。 */
    readonly aid: string;
    /** 我盟盟主 uid，"" = 无盟或未知。 */
    readonly leaderUid: string;
    /** 友盟 id。⚠ v1 恒空：没有外交系统。 */
    readonly friendAids: readonly string[];
}

export function sgzzEmptyTile(cell: number): ISgzzTile {
    return { cell, ownerUid: "", ownerAid: "", durability: 0, addition: false, capturingAid: "" };
}

export function validateSgzzTile(value: unknown, path = "tile"): ISgzzTile {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["cell", "ownerUid", "ownerAid", "durability", "addition", "capturingAid"], [], path);
    if (typeof r.addition !== "boolean") throw new WireValidationError("SGZZMAP_TILE", `${path}.addition`);
    const tile: ISgzzTile = {
        cell: validateSgzzCell(r.cell, `${path}.cell`),
        ownerUid: boundedString(r.ownerUid, `${path}.ownerUid`, 0, SGZZ_MAX_UID),
        ownerAid: boundedString(r.ownerAid, `${path}.ownerAid`, 0, SGZZ_MAX_AID),
        durability: finiteInteger(r.durability, `${path}.durability`, 0, SGZZ_MAX_DURABILITY),
        addition: r.addition,
        capturingAid: boundedString(r.capturingAid, `${path}.capturingAid`, 0, SGZZ_MAX_AID),
    };
    // 无主格必须干净：有主 ⇔ 有守军；无主不得带盟、不得带扩张标记
    if ((tile.ownerUid === "") !== (tile.durability === 0)) {
        throw new WireValidationError("SGZZMAP_TILE_OWNER", path);
    }
    if (tile.ownerUid === "" && (tile.ownerAid !== "" || tile.addition)) {
        throw new WireValidationError("SGZZMAP_TILE_OWNER", path);
    }
    return tile;
}

// ── 关系态推导 ────────────────────────────────────────────────────────────────

/**
 * 一格对某观察者呈现的关系态。纯函数，服务端与客户端跑同一份。
 * 判定次序有意义：攻占中优先于归属，自己优先于同盟。
 */
export function sgzzGridState(tile: ISgzzTile, viewer: ISgzzViewer): SgzzGridStateValue {
    const capturing = tile.capturingAid;
    if (capturing !== "") {
        if (viewer.aid !== "" && capturing === viewer.aid) return SgzzGridState.UNION_CAPTURE;
        if (viewer.friendAids.indexOf(capturing) >= 0) return SgzzGridState.FRIEND_UNION_CAPTURE;
    }
    if (tile.ownerUid === "") return SgzzGridState.UNDEFINE;
    if (tile.ownerUid === viewer.uid) {
        return tile.addition ? SgzzGridState.MY_ADDITION_LAND : SgzzGridState.MY;
    }
    if (tile.ownerAid !== "" && tile.ownerAid === viewer.aid) {
        return tile.ownerUid === viewer.leaderUid ? SgzzGridState.GANG_MASTER : SgzzGridState.UNION;
    }
    if (tile.ownerAid !== "" && viewer.friendAids.indexOf(tile.ownerAid) >= 0) {
        return SgzzGridState.GANG_FRIEND;
    }
    return SgzzGridState.RIVAL;
}

/** 这一格能不能给观察者「连地」。 */
export function sgzzConnects(tile: ISgzzTile, viewer: ISgzzViewer): boolean {
    return SGZZ_COMMON_CONNECT_STATE.has(sgzzGridState(tile, viewer));
}

// ── 占领结算 ─────────────────────────────────────────────────────────────────

export type SgzzTileOutcome = "captured" | "reinforced" | "damaged";

/**
 * 占领/加固/攻击的纯函数结算。与原作同形：打到守军归零的当次即改主，
 * ⛔ 不留下「无主但有守军」的中间行。
 */
export function applySgzzTileAction(tile: ISgzzTile, viewer: ISgzzViewer):
    { readonly tile: ISgzzTile; readonly outcome: SgzzTileOutcome } {
    if (!viewer.uid || viewer.uid.length > SGZZ_MAX_UID) throw new RangeError("SGZZ uid invalid");
    if (tile.ownerUid === viewer.uid) {
        return {
            tile: { ...tile, durability: Math.min(SGZZ_MAX_DURABILITY, tile.durability + 1) },
            outcome: "reinforced",
        };
    }
    if (tile.ownerUid !== "" && tile.durability > 1) {
        return { tile: { ...tile, durability: tile.durability - 1 }, outcome: "damaged" };
    }
    return {
        tile: {
            cell: tile.cell, ownerUid: viewer.uid, ownerAid: viewer.aid,
            durability: 1, addition: false, capturingAid: "",
        },
        outcome: "captured",
    };
}

/** 弃地：只有地主能弃，结果是回到无主格。 */
export function applySgzzTileAbandon(tile: ISgzzTile, viewer: ISgzzViewer): ISgzzTile {
    if (tile.ownerUid !== viewer.uid) throw new RangeError("SGZZ abandon requires ownership");
    return sgzzEmptyTile(tile.cell);
}

// ── 占领闸（纯判定部分） ──────────────────────────────────────────────────────

export const SGZZ_MAX_TILES_PER_PLAYER = 2000;

export type SgzzOccupyRefusal =
    | "SGZZMAP_IMPASSABLE"
    | "SGZZMAP_NOT_ADJACENT"
    | "SGZZMAP_TILE_LIMIT";

export interface ISgzzOccupyCheck {
    /** 目标地形是否可通行（调用方查 hexmap 的 terrain）。 */
    readonly passable: boolean;
    /** 我当前持地数。 */
    readonly heldTiles: number;
    /** 目标格是否落在出生区内（只在 heldTiles === 0 时有意义）。 */
    readonly inSpawnRegion: boolean;
    /** 目标格当前状态。 */
    readonly target: ISgzzTile;
    /** 目标格的六邻 ∪ 长程邻接，已裁边界。 */
    readonly neighbours: readonly ISgzzTile[];
}

/**
 * 纯判定：可占返回 null，不可占返回拒绝码。SQL 与锁由服务端 service 负责。
 * ⚠ 出生豁免只给「零地块且目标无主且在出生区」的玩家；⛔ 其余任何情况都要连地。
 */
export function sgzzOccupyRefusal(check: ISgzzOccupyCheck, viewer: ISgzzViewer): SgzzOccupyRefusal | null {
    if (!check.passable) return "SGZZMAP_IMPASSABLE";
    if (check.heldTiles >= SGZZ_MAX_TILES_PER_PLAYER
        && check.target.ownerUid !== viewer.uid) return "SGZZMAP_TILE_LIMIT";
    // ★ 目标就是自己的地 ⇒ 这是**加固**，天然连着自己的领地（它本身就是），⛔ 不查邻居。
    // ⚠ 早先漏了这条：只看六邻的话，一块**孤地**永远加固不了 —— 邻居都不是我的，
    //   于是加固自己的地被回 SGZZMAP_NOT_ADJACENT。真机重放里「回领地 → 加固」一直被拒就是这个。
    if (check.target.ownerUid === viewer.uid) return null;
    if (check.heldTiles === 0) {
        return (check.inSpawnRegion && check.target.ownerUid === "") ? null : "SGZZMAP_NOT_ADJACENT";
    }
    return check.neighbours.some((n) => sgzzConnects(n, viewer)) ? null : "SGZZMAP_NOT_ADJACENT";
}
