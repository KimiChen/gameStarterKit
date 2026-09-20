/**
 * sgzzmap kit v1（P2：近景视窗 + 占领 / 弃地）。
 * view 会先推进到期事件，因此是 natural-write；occupy/abandon 是幂等写。
 *
 * ⚠ 响应体积：框架硬上限 64 KB（MAX_WS_PAYLOAD_BYTES）、幂等写结果上限 32 KB
 * （IDEM_RESULT_MAX_BYTES，超了会变 done-oversize 墓碑）。本域按 ≤28 KB 设计：
 * 一次 view 最多 4 chunk = 400 格，地块行只带**下标**，uid/同盟 折叠进 owners/alliances 字典。
 */
import {
    assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError,
} from "../../http";
import {
    SGZZ_CHUNK_TILES, SGZZ_MAX_QUERY_CHUNKS, sgzzGridRectForChunkRect, sgzzRectArea,
    validateSgzzCell, validateSgzzChunkRect, type ISgzzRect,
} from "../../../kits/sgzzmap/api/hexmap/index";
import {
    SGZZ_MAX_AID, SGZZ_MAX_DURABILITY, SGZZ_MAX_UID,
    validateSgzzTile, type ISgzzTile, type SgzzTileOutcome,
} from "../../../kits/sgzzmap/api/territory/index";
import {
    isSgzzAllianceAct, validateSgzzAlliance, validateSgzzAllianceName, validateSgzzAllianceTag,
    validateSgzzMembership, type ISgzzAlliance, type ISgzzMembership, type SgzzAllianceAct,
} from "../../../kits/sgzzmap/api/alliance/index";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcNaturalWrite, defineRpcQuery } from "../defineDomain";
import { requiredId, rpcRecord } from "../primitives";

export const SgzzmapRpc = {
    View: "sgzzmap.view",
    Tile: "sgzzmap.tile",
    Occupy: "sgzzmap.occupy",
    Abandon: "sgzzmap.abandon",
    Alliance: "sgzzmap.alliance",
} as const;

/** 一次 view 最多回多少个非默认地块。 */
export const SGZZ_MAX_VIEW_TILES = SGZZ_MAX_QUERY_CHUNKS * SGZZ_CHUNK_TILES * SGZZ_CHUNK_TILES;
export const SGZZ_MAX_VIEW_OWNERS = SGZZ_MAX_VIEW_TILES;
export const SGZZ_MAX_VIEW_ALLIANCES = 256;

/** 地主引用。alliance 是 alliances[] 的下标，-1 = 无盟。 */
export interface ISgzzOwnerRef { uid: string; alliance: number }
/** 地块行：owner 是 owners[] 下标（-1 = 无主），capturing 是 alliances[] 下标（-1 = 无）。 */
export interface ISgzzTileRef {
    cell: number; owner: number; durability: number; addition: boolean; capturing: number;
}
/** 观察者自身的关系上下文，客户端用它跑 sgzzGridState。 */
export interface ISgzzViewerWire { uid: string; aid: string; leaderUid: string; friendAids: string[] }

export interface ISgzzViewReq { rect: ISgzzRect }
export interface ISgzzViewRes {
    rect: ISgzzRect; revision: number; viewer: ISgzzViewerWire;
    alliances: string[]; owners: ISgzzOwnerRef[]; tiles: ISgzzTileRef[];
}
export interface ISgzzTileReq { cell: number }
export interface ISgzzTileRes { tile: ISgzzTile; viewer: ISgzzViewerWire }
export interface ISgzzOccupyReq { clientReqId: string; cell: number }
export interface ISgzzOccupyRes { tile: ISgzzTile; outcome: SgzzTileOutcome; heldTiles: number }
export interface ISgzzAbandonReq { clientReqId: string; cell: number }
export interface ISgzzAbandonRes { cell: number; heldTiles: number }
/** 三个动作共用一条路由：它们锁的是同一组表，拆三条零契约收益。 */
export interface ISgzzAllianceReq {
    clientReqId: string; act: SgzzAllianceAct;
    name?: string; tag?: string; allianceId?: string;
}
/** 退盟后两者都为 null。 */
export interface ISgzzAllianceRes { membership: ISgzzMembership | null; alliance: ISgzzAlliance | null }

export interface SgzzmapRpcMap {
    [SgzzmapRpc.View]: { req: ISgzzViewReq; res: ISgzzViewRes };
    [SgzzmapRpc.Tile]: { req: ISgzzTileReq; res: ISgzzTileRes };
    [SgzzmapRpc.Occupy]: { req: ISgzzOccupyReq; res: ISgzzOccupyRes };
    [SgzzmapRpc.Abandon]: { req: ISgzzAbandonReq; res: ISgzzAbandonRes };
    [SgzzmapRpc.Alliance]: { req: ISgzzAllianceReq; res: ISgzzAllianceRes };
}

function validateViewer(value: unknown, path: string): ISgzzViewerWire {
    const r = rpcRecord(value, path);
    assertExactKeys(r, ["uid", "aid", "leaderUid", "friendAids"], [], path);
    if (!Array.isArray(r.friendAids) || r.friendAids.length > SGZZ_MAX_VIEW_ALLIANCES) {
        throw new WireValidationError("SGZZMAP_VIEWER", `${path}.friendAids`);
    }
    return {
        uid: boundedString(r.uid, `${path}.uid`, 0, SGZZ_MAX_UID),
        aid: boundedString(r.aid, `${path}.aid`, 0, SGZZ_MAX_AID),
        leaderUid: boundedString(r.leaderUid, `${path}.leaderUid`, 0, SGZZ_MAX_UID),
        friendAids: r.friendAids.map((v, i) => boundedString(v, `${path}.friendAids[${i}]`, 1, SGZZ_MAX_AID)),
    };
}

export const validateSgzzViewReq: RuntimeValidator<ISgzzViewReq> = (input) => {
    const r = rpcRecord(input);
    assertExactKeys(r, ["rect"], [], "payload");
    return { rect: validateSgzzChunkRect(r.rect) };
};
export const validateSgzzViewRes: RuntimeValidator<ISgzzViewRes> = (input) => {
    const r = rpcRecord(input, "response");
    assertExactKeys(r, ["rect", "revision", "viewer", "alliances", "owners", "tiles"], [], "response");
    const rect = validateSgzzChunkRect(r.rect, "response.rect");
    if (!Array.isArray(r.alliances) || r.alliances.length > SGZZ_MAX_VIEW_ALLIANCES
        || !Array.isArray(r.owners) || r.owners.length > SGZZ_MAX_VIEW_OWNERS
        || !Array.isArray(r.tiles) || r.tiles.length > SGZZ_MAX_VIEW_TILES) {
        throw new WireValidationError("SGZZMAP_VIEW_SIZE", "response");
    }
    const alliances = r.alliances.map((v, i) => boundedString(v, `response.alliances[${i}]`, 1, SGZZ_MAX_AID));
    const owners = r.owners.map((v, i) => {
        const o = rpcRecord(v, `response.owners[${i}]`);
        assertExactKeys(o, ["uid", "alliance"], [], `response.owners[${i}]`);
        return {
            uid: boundedString(o.uid, `response.owners[${i}].uid`, 1, SGZZ_MAX_UID),
            alliance: finiteInteger(o.alliance, `response.owners[${i}].alliance`, -1, alliances.length - 1),
        };
    });
    // 格矩形用来校验每一行确实落在请求窗内 —— ⛔ 不能回视窗外的格
    const grid = sgzzGridRectForChunkRect(rect);
    const tiles = r.tiles.map((v, i) => {
        const t = rpcRecord(v, `response.tiles[${i}]`);
        assertExactKeys(t, ["cell", "owner", "durability", "addition", "capturing"], [], `response.tiles[${i}]`);
        if (typeof t.addition !== "boolean") throw new WireValidationError("SGZZMAP_TILE", `response.tiles[${i}].addition`);
        const cell = validateSgzzCell(t.cell, `response.tiles[${i}].cell`);
        const row = Math.floor(cell / 10000), col = cell % 10000;
        if (row < grid.minRow || row > grid.maxRow || col < grid.minCol || col > grid.maxCol) {
            throw new WireValidationError("SGZZMAP_VIEW_RANGE", `response.tiles[${i}].cell`);
        }
        return {
            cell,
            owner: finiteInteger(t.owner, `response.tiles[${i}].owner`, -1, owners.length - 1),
            durability: finiteInteger(t.durability, `response.tiles[${i}].durability`, 0, SGZZ_MAX_DURABILITY),
            addition: t.addition,
            capturing: finiteInteger(t.capturing, `response.tiles[${i}].capturing`, -1, alliances.length - 1),
        };
    });
    for (let i = 0; i < tiles.length; i += 1) {
        // 升序且无重复：客户端按序合并，⛔ 不容忍重复行
        if (i > 0 && tiles[i].cell <= tiles[i - 1].cell) {
            throw new WireValidationError("SGZZMAP_VIEW_ORDER", "response.tiles");
        }
        // 稀疏语义：回来的每一行都必须是「非默认」的
        if (tiles[i].owner < 0 && tiles[i].capturing < 0) {
            throw new WireValidationError("SGZZMAP_VIEW_DEFAULT", `response.tiles[${i}]`);
        }
        if ((tiles[i].owner < 0) !== (tiles[i].durability === 0)) {
            throw new WireValidationError("SGZZMAP_TILE_OWNER", `response.tiles[${i}]`);
        }
    }
    return {
        rect, revision: finiteInteger(r.revision, "response.revision", 0),
        viewer: validateViewer(r.viewer, "response.viewer"), alliances, owners, tiles,
    };
};
export const validateSgzzTileReq: RuntimeValidator<ISgzzTileReq> = (input) => {
    const r = rpcRecord(input);
    assertExactKeys(r, ["cell"], [], "payload");
    return { cell: validateSgzzCell(r.cell) };
};
export const validateSgzzTileRes: RuntimeValidator<ISgzzTileRes> = (input) => {
    const r = rpcRecord(input, "response");
    assertExactKeys(r, ["tile", "viewer"], [], "response");
    return { tile: validateSgzzTile(r.tile, "response.tile"), viewer: validateViewer(r.viewer, "response.viewer") };
};
export const validateSgzzOccupyReq: RuntimeValidator<ISgzzOccupyReq> = (input) => {
    const r = rpcRecord(input);
    assertExactKeys(r, ["clientReqId", "cell"], [], "payload");
    return { clientReqId: requiredId(r, "clientReqId"), cell: validateSgzzCell(r.cell) };
};
export const validateSgzzOccupyRes: RuntimeValidator<ISgzzOccupyRes> = (input) => {
    const r = rpcRecord(input, "response");
    assertExactKeys(r, ["tile", "outcome", "heldTiles"], [], "response");
    if (r.outcome !== "captured" && r.outcome !== "reinforced" && r.outcome !== "damaged") {
        throw new WireValidationError("SGZZMAP_OUTCOME", "response.outcome");
    }
    return {
        tile: validateSgzzTile(r.tile, "response.tile"), outcome: r.outcome,
        heldTiles: finiteInteger(r.heldTiles, "response.heldTiles", 0),
    };
};
export const validateSgzzAbandonReq: RuntimeValidator<ISgzzAbandonReq> = (input) => {
    const r = rpcRecord(input);
    assertExactKeys(r, ["clientReqId", "cell"], [], "payload");
    return { clientReqId: requiredId(r, "clientReqId"), cell: validateSgzzCell(r.cell) };
};
export const validateSgzzAbandonRes: RuntimeValidator<ISgzzAbandonRes> = (input) => {
    const r = rpcRecord(input, "response");
    assertExactKeys(r, ["cell", "heldTiles"], [], "response");
    return {
        cell: validateSgzzCell(r.cell, "response.cell"),
        heldTiles: finiteInteger(r.heldTiles, "response.heldTiles", 0),
    };
};

export const validateSgzzAllianceReq: RuntimeValidator<ISgzzAllianceReq> = (input) => {
    const r = rpcRecord(input);
    assertExactKeys(r, ["clientReqId", "act"], ["name", "tag", "allianceId"], "payload");
    if (!isSgzzAllianceAct(r.act)) throw new WireValidationError("SGZZMAP_ALLIANCE_ACT", "payload.act");
    const out: ISgzzAllianceReq = { clientReqId: requiredId(r, "clientReqId"), act: r.act };
    // 每个动作只允许带自己需要的字段，⛔ 多余字段一律拒（fail-closed）
    if (r.act === "create") {
        if (r.allianceId !== undefined) throw new WireValidationError("SGZZMAP_ALLIANCE_ACT", "payload.allianceId");
        return { ...out, name: validateSgzzAllianceName(r.name), tag: validateSgzzAllianceTag(r.tag) };
    }
    if (r.act === "join") {
        if (r.name !== undefined || r.tag !== undefined) {
            throw new WireValidationError("SGZZMAP_ALLIANCE_ACT", "payload.name");
        }
        return { ...out, allianceId: boundedString(r.allianceId, "payload.allianceId", 1, SGZZ_MAX_AID) };
    }
    if (r.name !== undefined || r.tag !== undefined || r.allianceId !== undefined) {
        throw new WireValidationError("SGZZMAP_ALLIANCE_ACT", "payload");
    }
    return out;
};
export const validateSgzzAllianceRes: RuntimeValidator<ISgzzAllianceRes> = (input) => {
    const r = rpcRecord(input, "response");
    assertExactKeys(r, ["membership", "alliance"], [], "response");
    const membership = r.membership === null ? null : validateSgzzMembership(r.membership, "response.membership");
    const alliance = r.alliance === null ? null : validateSgzzAlliance(r.alliance, "response.alliance");
    // 要么都在（入盟/建盟），要么都不在（退盟）；⛔ 不允许半截状态
    if ((membership === null) !== (alliance === null)) {
        throw new WireValidationError("SGZZMAP_ALLIANCE_SHAPE", "response");
    }
    if (membership && alliance && membership.allianceId !== alliance.allianceId) {
        throw new WireValidationError("SGZZMAP_ALLIANCE_SHAPE", "response.membership.allianceId");
    }
    return { membership, alliance };
};

/** 请求窗的 chunk 数上限由 validateSgzzChunkRect 保证；这里再导出便于测试直接断言。 */
export function sgzzViewRequestChunks(rect: ISgzzRect): number {
    return sgzzRectArea(rect);
}

export default defineLobbyRpcDomain({
    domain: "sgzzmap", contractVersion: 2,
    errorCodes: [
        "SGZZMAP_IMPASSABLE", "SGZZMAP_NOT_ADJACENT", "SGZZMAP_TILE_LIMIT",
        "SGZZMAP_NOT_OWNED", "SGZZMAP_SETTLEMENT_PENDING",
        "SGZZMAP_ALLIANCE_EXISTS", "SGZZMAP_ALLIANCE_NOT_FOUND", "SGZZMAP_ALLIANCE_FULL",
        "SGZZMAP_ALLIANCE_NOT_MEMBER", "SGZZMAP_ALLIANCE_LEADER_BUSY", "SGZZMAP_ALLIANCE_TAG_TAKEN",
    ],
    pushes: [],
    routes: [
        defineRpcNaturalWrite(SgzzmapRpc.View, { request: validateSgzzViewReq, response: validateSgzzViewRes }),
        defineRpcQuery(SgzzmapRpc.Tile, { request: validateSgzzTileReq, response: validateSgzzTileRes }),
        defineRpcIdempotentWrite(SgzzmapRpc.Occupy, { request: validateSgzzOccupyReq, response: validateSgzzOccupyRes }),
        defineRpcIdempotentWrite(SgzzmapRpc.Abandon, { request: validateSgzzAbandonReq, response: validateSgzzAbandonRes }),
        defineRpcIdempotentWrite(SgzzmapRpc.Alliance, { request: validateSgzzAllianceReq, response: validateSgzzAllianceRes }),
    ],
});
