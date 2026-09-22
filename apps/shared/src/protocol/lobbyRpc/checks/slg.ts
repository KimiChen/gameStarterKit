/**
 * slg 域的非生成 wire 助手（BF2）。
 *
 * schema（`apps/shared/schema/protocols/C2S/slg.json`）用 `assert` 引用本文件的具名函数。
 * 三个不变量都是**跨元素 / 跨字段**判据（声明式约束表达不了），形状与错误码仍由 schema 声明：
 *  - `tiles` 顺序 + 「有主格必须非空 ownerUid」；
 *  - 行军起终点不同（`fromTile === toTile` 是无意义命令）；
 *  - 撤回响应必须是 `recalled` 终态。
 *
 * 格子 / 矩形 / 行军的**单元素**形状真源在 `kits/slg/api/{worldmap,march}/index`，
 * schema 直接 `check` 引用那两个面，⛔ 不在这里复制一份。
 */
import { WireValidationError } from "../../http";
import type { ISlgTile } from "../../../kits/slg/api/worldmap/index";

/**
 * 棋盘块不变量：tileId 严格升序、且「无主 ⇔ ownerUid 为空串」。
 * 顺序破了客户端会画错格；空 owner 会让归属判定把无主格当成敌人格。
 */
export function assertSlgTilesOrder(tiles: readonly ISlgTile[], path: string): void {
    for (let i = 0; i < tiles.length; i++) {
        if (tiles[i].ownerUid === "" || (i > 0 && tiles[i].tileId <= tiles[i - 1].tileId)) {
            throw new WireValidationError("SLG_TILES_ORDER", path);
        }
    }
}

/** 行军起终点必须不同（同一格行军没有语义，服务端也不会受理）。 */
export function assertSlgMarchEndpoints(
    march: { readonly fromTile: number; readonly toTile: number },
    path: string,
): void {
    if (march.fromTile === march.toTile) throw new WireValidationError("SLG_MARCH_ENDPOINT", `${path}.toTile`);
}

/** 撤回响应的行军必须是 `recalled` 终态（其余状态说明服务端与请求意图不一致）。 */
export function assertSlgMarchRecalled(march: { readonly status: string }, path: string): void {
    if (march.status !== "recalled") throw new WireValidationError("SLG_RECALL_STATUS", `${path}.status`);
}
