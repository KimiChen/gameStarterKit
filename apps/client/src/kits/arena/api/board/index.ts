/**
 * arena kit · `board` api 面（客户端，docs/KIT.md §4）：棋盘的纯展示模型与格式化助手 + 棋盘读取入口，给本 kit
 * 的页面与建在 board 面上的插件（arenaShop）共用。⛔ 不 import cc（铁律 9）；插件只能相对导入本门面，不得 import
 * kit 内部模块，也 ⛔ 不直接点名本 kit 的 RPC 路由（`arena.*` 的 wire 契约随本面 versioning：`arena.ts` 任何
 * 变化都要 bump `api.board.version`，插件经 `fetchArenaBoard` 读棋盘即受 `requires.kits.arena.board` 的闸保护）。
 * 本面任何导出变化都要 bump `apps/kits/arena/kit.json` 的 `api.board.version`。
 */
import type { LobbyRpcPort } from "../../../../app/ports";
import {
    ARENA_MAX_POWER, ARENA_TILE_COUNT, type IArenaTile, canCaptureTile,
} from "../../../../shared/kits/arena/api/board/index";
import { ArenaRpc, type IArenaBoardRes } from "../../../../shared/protocol/lobbyRpc/domains/arena";

export { ARENA_MAX_POWER, ARENA_TILE_COUNT, canCaptureTile };
export type { IArenaBoardRes, IArenaTile };

/** 只读整张棋盘 + 本人奖杯（arena.board）：插件经本入口读，⛔ 不自己 import ArenaRpc。 */
export function fetchArenaBoard(lobbyRpc: Pick<LobbyRpcPort, "query">): Promise<IArenaBoardRes> {
    return lobbyRpc.query(ArenaRpc.Board, {});
}

/** 棋盘边长（ARENA_TILE_COUNT 是完全平方数）。 */
export const ARENA_GRID_SIZE = Math.round(Math.sqrt(ARENA_TILE_COUNT));

export type ArenaTileOwnership = "empty" | "self" | "enemy";

/** 一格在 UI 里的展示模型。 */
export interface ArenaTileView {
    readonly tile: number;
    readonly label: string;
    readonly row: number;
    readonly col: number;
    readonly ownership: ArenaTileOwnership;
    readonly power: number;
    /** 当前是否可被本人直接占领（无主 / 自己的 / 守备归零的敌格） */
    readonly capturable: boolean;
}

/** 格坐标：tile 序号 → { row, col }（行优先）。 */
export function tileGridPosition(tile: number): { readonly row: number; readonly col: number } {
    return { row: Math.floor(tile / ARENA_GRID_SIZE), col: tile % ARENA_GRID_SIZE };
}

/** 棋盘坐标标签：A1 … D4（列字母 + 行号）。 */
export function tileLabel(tile: number): string {
    const { row, col } = tileGridPosition(tile);
    return `${String.fromCharCode(65 + col)}${row + 1}`;
}

export function tileOwnership(tile: IArenaTile, selfUid: string): ArenaTileOwnership {
    if (tile.ownerUid === "") return "empty";
    return tile.ownerUid === selfUid ? "self" : "enemy";
}

/** 整张棋盘 → 展示模型（按 tile 升序；输入缺格时按无主格补齐）。 */
export function describeBoard(tiles: readonly IArenaTile[], selfUid: string): ArenaTileView[] {
    const byTile = new Map(tiles.map((tile) => [tile.tile, tile]));
    const views: ArenaTileView[] = [];
    for (let index = 0; index < ARENA_TILE_COUNT; index++) {
        const tile = byTile.get(index) ?? { tile: index, ownerUid: "", power: 0 };
        const { row, col } = tileGridPosition(index);
        views.push({
            tile: index,
            label: tileLabel(index),
            row,
            col,
            ownership: tileOwnership(tile, selfUid),
            power: tile.power,
            capturable: canCaptureTile(tile, selfUid),
        });
    }
    return views;
}

/** 一格的一行文案（页面与商店共用）。 */
export function formatTile(view: ArenaTileView): string {
    switch (view.ownership) {
        case "self": return `${view.label} 我方 ${view.power}`;
        case "enemy": return `${view.label} 敌方 ${view.power}`;
        default: return `${view.label} 无主`;
    }
}
