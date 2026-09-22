/**
 * arena 域的非生成 wire 助手（BF2）。
 *
 * schema（`apps/shared/schema/protocols/C2S/arena.json`）用 `check` / `assert` 引用本文件的
 * **具名函数**：路由·形状·错误码仍由 schema 声明，函数体是本文件独占的唯一实现点。
 * ⛔ 不要把这些实现内联进生成物 —— 内联等于把真源搬回生成物，那就又变成两处真源。
 *
 * 与 kit api 面的分工：格子序号闸与守备上限的真源在 `kits/arena/api/board/index`，
 * 本文件只按 wire 路径重述，⛔ 不复制常量值。
 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../http";
import { ARENA_MAX_POWER, ARENA_TILE_COUNT, type IArenaTile, validateTileIndex } from "../../../kits/arena/api/board/index";
import { rpcRecord } from "../primitives";

/** 一格棋盘的 wire 视图（`IArenaTile` 的运行时校验器；路径由调用点给定）。 */
export function validateArenaTile(input: unknown, path: string): IArenaTile {
    const value = rpcRecord(input, path);
    assertExactKeys(value, ["tile", "ownerUid", "power"], [], path);
    return {
        tile: validateTileIndex(value.tile, `${path}.tile`),
        ownerUid: boundedString(value.ownerUid, `${path}.ownerUid`, 0, 32),
        power: finiteInteger(value.power, `${path}.power`, 0, ARENA_MAX_POWER),
    };
}

/** 守备值闸：0..ARENA_MAX_POWER（上限真源在 kit api 面，⛔ 不在这里写死 99）。 */
export function validateArenaPower(value: unknown, path: string): number {
    return finiteInteger(value, path, 0, ARENA_MAX_POWER);
}

/**
 * 棋盘规模不变量：`IArenaBoardRes.tiles` 恰好 `ARENA_TILE_COUNT` 项。
 * 规模是**跨字段**约束（数组长度 = 常量），声明式约束表达不了 ⇒ 走 `assert`。
 */
export function assertArenaBoardSize(tiles: readonly IArenaTile[], path: string): void {
    if (tiles.length !== ARENA_TILE_COUNT) throw new WireValidationError("ARENA_BOARD_SIZE", path);
}

/** 棋盘顺序不变量：`tiles[i].tile === i`（客户端按下标直接渲染，错位即静默错图）。 */
export function assertArenaBoardOrder(tiles: readonly IArenaTile[], path: string): void {
    for (let i = 0; i < tiles.length; i++) {
        if (tiles[i].tile !== i) throw new WireValidationError("ARENA_BOARD_ORDER", `${path}[${i}].tile`);
    }
}
