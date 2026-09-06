/**
 * arena kit · `board` api 面（shared，docs/KIT.md §4）：棋盘的零依赖类型、常量与校验器。
 * 插件只能 import 本门面（`@game/shared/kits/arena/api/board/index` / 客户端相对路径），⛔ 不 import kit 内部模块。
 * 本面任何导出变化都要 bump `apps/kits/arena/kit.json` 的 `api.board.version`。
 *
 * 规则（与服务端 api 同一真源，README「棋盘规则」）：
 *  - 棋盘固定 ARENA_TILE_COUNT 格（tile ∈ [0, ARENA_TILE_COUNT)），每格 { ownerUid, power }；
 *  - 无主格（ownerUid === ""）任何人可占：占领后 power = 1；
 *  - 自己的格再占一次 = 加固：power + 1（上限 ARENA_MAX_POWER），不发奖杯；
 *  - 别人的格 power > 0 时不可占（ARENA_TILE_TAKEN），但每次尝试让它 power − 1；power 归零后可被夺取（夺取即改主、power = 1）；
 *  - 每次改主（占无主格 / 夺取）经 outbox effect `kit:arena:trophy` 给占领者 +1 奖杯（写侧契约见 KIT.md §5）。
 */
import { WireValidationError } from "../../../../protocol/http";

/** 棋盘格数（4×4）。 */
export const ARENA_TILE_COUNT = 16;
/** 单格守备上限（加固 / 商店 boost 都封顶于此）。 */
export const ARENA_MAX_POWER = 99;
/** 商店 boost 一次加的守备值（`boostTile` 的固定增量）。 */
export const ARENA_BOOST_POWER = 5;

export interface IArenaTile {
    /** 格序号 [0, ARENA_TILE_COUNT) */
    readonly tile: number;
    /** 主人 uid；空串 = 无主 */
    readonly ownerUid: string;
    /** 守备值 ≥ 0 */
    readonly power: number;
}

/** tile 序号闸：整数且落在 [0, ARENA_TILE_COUNT)。 */
export function isArenaTileIndex(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < ARENA_TILE_COUNT;
}

/** 校验 tile 序号（wire 边界用：不合规抛 WireValidationError("ARENA_TILE", path)）。 */
export function validateTileIndex(value: unknown, path = "payload.tile"): number {
    if (!isArenaTileIndex(value)) throw new WireValidationError("ARENA_TILE", path);
    return value;
}

/** 一格是否可被 uid 直接占领（无主 / 自己的 / 守备已归零的敌格）。 */
export function canCaptureTile(tile: IArenaTile, uid: string): boolean {
    return tile.ownerUid === "" || tile.ownerUid === uid || tile.power <= 0;
}

/** 把缺失格补成无主格，按 tile 序号升序、恰好 ARENA_TILE_COUNT 项（服务端读表与客户端渲染共用）。 */
export function fillArenaBoard(rows: readonly IArenaTile[]): IArenaTile[] {
    const byTile = new Map<number, IArenaTile>();
    for (const row of rows) {
        if (isArenaTileIndex(row.tile)) byTile.set(row.tile, row);
    }
    const board: IArenaTile[] = [];
    for (let tile = 0; tile < ARENA_TILE_COUNT; tile++) {
        const row = byTile.get(tile);
        board.push(row ? { tile, ownerUid: row.ownerUid, power: row.power } : { tile, ownerUid: "", power: 0 });
    }
    return board;
}
