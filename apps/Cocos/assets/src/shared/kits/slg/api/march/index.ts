/** SLG march v1：命令冻结起终点/时间；地形不影响速度，不追踪兵力库存。 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";
import { gridFromTileId, validateSlgTileId, type ISlgPoint } from "../worldmap/index";

export const SLG_MARCH_COST = 1;
export const SLG_MAX_ACTIVE_MARCHES = 3;
export const SLG_MARCH_SPEED = 1;
export const SLG_SETTLEMENT_BATCH_SIZE = 32;
export type SlgMarchStatus = "marching" | "arrived" | "recalled";
export interface ISlgMarch {
    readonly marchId: string;
    readonly uid: string;
    readonly fromTile: number;
    readonly toTile: number;
    readonly departAt: number;
    readonly arriveAt: number;
    readonly status: SlgMarchStatus;
}
export function marchDurationMs(fromTile: number, toTile: number): number {
    const from = gridFromTileId(fromTile), to = gridFromTileId(toTile);
    if (fromTile === toTile) throw new RangeError("SLG march requires different endpoints");
    return Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 1000 / SLG_MARCH_SPEED);
}
export function positionAt(order: ISlgMarch, now: number): ISlgPoint {
    if (!Number.isFinite(now)) throw new RangeError("SLG time invalid");
    const from = gridFromTileId(order.fromTile), to = gridFromTileId(order.toTile);
    const t = Math.max(0, Math.min(1, (now - order.departAt) / (order.arriveAt - order.departAt)));
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
export function validateSlgMarch(value: unknown, path = "march"): ISlgMarch {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["marchId", "uid", "fromTile", "toTile", "departAt", "arriveAt", "status"], [], path);
    if (r.status !== "marching" && r.status !== "arrived" && r.status !== "recalled") throw new WireValidationError("SLG_MARCH_STATUS", `${path}.status`);
    const march: ISlgMarch = {
        marchId: boundedString(r.marchId, `${path}.marchId`, 1, 64),
        uid: boundedString(r.uid, `${path}.uid`, 1, 32),
        fromTile: validateSlgTileId(r.fromTile, `${path}.fromTile`), toTile: validateSlgTileId(r.toTile, `${path}.toTile`),
        departAt: finiteInteger(r.departAt, `${path}.departAt`, 0), arriveAt: finiteInteger(r.arriveAt, `${path}.arriveAt`, 1),
        status: r.status,
    };
    if (march.fromTile === march.toTile || march.arriveAt - march.departAt !== marchDurationMs(march.fromTile, march.toTile)) {
        throw new WireValidationError("SLG_MARCH_TIME", path);
    }
    return march;
}
