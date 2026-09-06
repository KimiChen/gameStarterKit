/**
 * arena 域 ws-RPC 契约——arena kit（apps/kits/arena，docs/KIT.md §8 K0-5 样本）自带的域文件。
 * 只使用框架已有的 defineDomain / primitives / http 助手与本 kit 的 shared `board` api 面。
 *
 * 执行模式：Board=query（只读快照）；Capture=idempotent-write（同一 clientReqId 重放返回首次结果）。
 * 棋盘规则见 kits/arena/api/board/index.ts 抬头与 apps/kits/arena/README.md。
 * 文件顶层保持可静态读取形态（约束见 ../defineDomain.ts 抬头）。
 */
import { assertExactKeys, boundedString, finiteInteger, type RuntimeValidator, WireValidationError } from "../../http";
import { ARENA_MAX_POWER, ARENA_TILE_COUNT, type IArenaTile, validateTileIndex } from "../../../kits/arena/api/board/index";
import { defineLobbyRpcDomain, defineRpcIdempotentWrite, defineRpcQuery } from "../defineDomain";
import { emptyPayload, requiredId, rpcRecord } from "../primitives";

/** arena 域路由名 */
export const ArenaRpc = {
    /** 读整张棋盘 + 自己的奖杯数 */
    Board: "arena.board",
    /** 占领 / 加固 / 夺取一格 */
    Capture: "arena.capture",
} as const;

export interface IArenaBoardReq {
    readonly [key: string]: never;
}
export interface IArenaBoardRes {
    /** 恰好 ARENA_TILE_COUNT 项，按 tile 升序 */
    tiles: IArenaTile[];
    /** 本人奖杯数（kt:arena:stats 的 trophies 字段；经 outbox effect 累加，读到的是已 apply 的值） */
    myTrophies: number;
}

export interface IArenaCaptureReq {
    /** 幂等 id（09·I2） */
    clientReqId: string;
    tile: number;
}
export interface IArenaCaptureRes {
    tile: number;
    /** 操作后该格守备值 */
    power: number;
    /** 操作后本人奖杯数（本次改主的 +1 由 relayer apply，可能尚未计入） */
    trophies: number;
}

/** 路由名 → { req, res } */
export interface ArenaRpcMap {
    [ArenaRpc.Board]: { req: IArenaBoardReq; res: IArenaBoardRes };
    [ArenaRpc.Capture]: { req: IArenaCaptureReq; res: IArenaCaptureRes };
}

function validateTileView(input: unknown, path: string): IArenaTile {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["tile", "ownerUid", "power"], [], path);
    return {
        tile: validateTileIndex(value.tile, `${path}.tile`),
        ownerUid: boundedString(value.ownerUid, `${path}.ownerUid`, 0, 32),
        power: finiteInteger(value.power, `${path}.power`, 0, ARENA_MAX_POWER),
    };
}

export const validateArenaBoardReq: RuntimeValidator<IArenaBoardReq> = (input) => emptyPayload(input);

export const validateArenaBoardRes: RuntimeValidator<IArenaBoardRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["tiles", "myTrophies"], [], "response");
    const tiles = value.tiles;
    if (!Array.isArray(tiles) || tiles.length !== ARENA_TILE_COUNT) throw new WireValidationError("ARENA_BOARD_SIZE", "response.tiles");
    const parsed = tiles.map((item, i) => validateTileView(item, `response.tiles[${i}]`));
    for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].tile !== i) throw new WireValidationError("ARENA_BOARD_ORDER", `response.tiles[${i}].tile`);
    }
    return { tiles: parsed, myTrophies: finiteInteger(value.myTrophies, "response.myTrophies", 0) };
};

export const validateArenaCaptureReq: RuntimeValidator<IArenaCaptureReq> = (input) => {
    const value = rpcRecord(input);
    assertExactKeys(value, ["clientReqId", "tile"], [], "payload");
    return { clientReqId: requiredId(value, "clientReqId"), tile: validateTileIndex(value.tile, "payload.tile") };
};

export const validateArenaCaptureRes: RuntimeValidator<IArenaCaptureRes> = (input) => {
    const value = rpcRecord(input, "response");
    assertExactKeys(value, ["tile", "power", "trophies"], [], "response");
    return {
        tile: validateTileIndex(value.tile, "response.tile"),
        power: finiteInteger(value.power, "response.power", 0, ARENA_MAX_POWER),
        trophies: finiteInteger(value.trophies, "response.trophies", 0),
    };
};

export default defineLobbyRpcDomain({
    domain: "arena",
    contractVersion: 1,
    errorCodes: ["ARENA_TILE_TAKEN"],
    pushes: [],
    routes: [
        defineRpcQuery(ArenaRpc.Board, { request: validateArenaBoardReq, response: validateArenaBoardRes }),
        defineRpcIdempotentWrite(ArenaRpc.Capture, { request: validateArenaCaptureReq, response: validateArenaCaptureRes }),
    ],
});
