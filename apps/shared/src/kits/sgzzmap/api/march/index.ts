/**
 * sgzzmap march v1：转折点路径、逐格展开与确定性插值的零依赖单源。
 *
 * 取自《三国志·战略版》2084.1768 `script/logic/army_move/move_util.lua`：
 *   gen_path_from_turning_points:38  服务端只下发**转折点**，客户端逐格展开
 *   dir_index:82                     段方向 1..6
 *   distance:113                     ⚠ 只对共线正确 —— 见 hexmap 的 sgzzStepsAlongDirection
 * ⛔ 没有客户端 A*：行军就是若干条直线段首尾相接。
 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";

import {
    sgzzCellOf, sgzzDecodeCell, sgzzDirIndex, sgzzNextPos, sgzzStepsAlongDirection,
    validateSgzzCell, type ISgzzCell,
} from "../hexmap/index";

/** 一格耗时。整数毫秒，⛔ 不要用浮点速度——到达时刻必须能被服务端精确重算。 */
export const SGZZ_MARCH_MS_PER_TILE = 1000;
/** 每人同时在途上限。 */
export const SGZZ_MAX_ACTIVE_MARCHES = 3;
/** 转折点个数上限（含起点终点）。 */
export const SGZZ_MAX_TURNING_POINTS = 8;
/** 单程总步数上限——同时是响应体积与结算代价的闸。 */
export const SGZZ_MAX_MARCH_STEPS = 64;
/** 一次事务最多结算多少条到达。 */
export const SGZZ_SETTLEMENT_BATCH_SIZE = 32;
/** 派遣费用（框架货币）。 */
export const SGZZ_MARCH_COST = 1;

export const SgzzMarchStatus = { MARCHING: "marching", ARRIVED: "arrived", RECALLED: "recalled" } as const;
export type SgzzMarchStatusValue = (typeof SgzzMarchStatus)[keyof typeof SgzzMarchStatus];
const STATUSES: readonly string[] = ["marching", "arrived", "recalled"];

export interface ISgzzMarch {
    readonly marchId: string;
    readonly uid: string;
    /** 转折点（cell），≥2 个，首个是出发格。⛔ 不是逐格路径。 */
    readonly path: readonly number[];
    readonly departAt: number;
    readonly arriveAt: number;
    readonly status: SgzzMarchStatusValue;
}

/**
 * 转折点 → 逐格路径（含起点与终点）。
 * ⚠ 每一段都必须是**共线**的：从 src 朝 dirIndex 走 steps 步要**恰好**落在 dest 上，
 * 否则这条路径是伪造的（六边形里「看着像直线」不等于是直线）。不合法直接抛。
 */
export function sgzzExpandPath(points: readonly number[]): number[] {
    if (points.length < 2 || points.length > SGZZ_MAX_TURNING_POINTS) {
        throw new WireValidationError("SGZZMAP_MARCH_PATH", "march.path");
    }
    let src: ISgzzCell = sgzzDecodeCell(points[0]);
    const out: number[] = [points[0]];
    for (let i = 1; i < points.length; i += 1) {
        const dest = sgzzDecodeCell(points[i]);
        if (dest.row === src.row && dest.col === src.col) {
            throw new WireValidationError("SGZZMAP_MARCH_PATH", `march.path[${i}]`);
        }
        const dir = sgzzDirIndex(src, dest);
        const steps = sgzzStepsAlongDirection(src, dest);
        if (steps < 1 || out.length + steps > SGZZ_MAX_MARCH_STEPS + 1) {
            throw new WireValidationError("SGZZMAP_MARCH_PATH", `march.path[${i}]`);
        }
        let cur = src;
        for (let s = 0; s < steps; s += 1) {
            cur = sgzzNextPos(cur.row, cur.col, dir);
            out.push(sgzzCellOf(cur.row, cur.col));
        }
        // ★ 共线硬校验：走完必须正好踩在 dest 上
        if (cur.row !== dest.row || cur.col !== dest.col) {
            throw new WireValidationError("SGZZMAP_MARCH_PATH", `march.path[${i}]`);
        }
        src = dest;
    }
    return out;
}

/** 总步数（= 逐格路径长度 − 1）。 */
export function sgzzMarchSteps(points: readonly number[]): number {
    return sgzzExpandPath(points).length - 1;
}
export function sgzzMarchDurationMs(points: readonly number[]): number {
    return sgzzMarchSteps(points) * SGZZ_MARCH_MS_PER_TILE;
}

export interface ISgzzMarchPosition {
    /** 当前已经踏上的格。 */
    readonly cell: number;
    /** 下一格；已到达时等于 cell。 */
    readonly nextCell: number;
    /** 在 cell → nextCell 之间的插值进度 [0,1]。 */
    readonly t: number;
    readonly stepIndex: number;
}

/**
 * 确定性插值。⚠ 时钟回跳 / 暂停都要钳在 [0,1]，⛔ 不能让 t 跑出界让客户端把部队画到地图外。
 * 原作：t = 1 − (next_grid_time − now) / one_grid_move_time。
 */
export function sgzzMarchPositionAt(march: ISgzzMarch, now: number): ISgzzMarchPosition {
    const cells = sgzzExpandPath(march.path);
    const total = cells.length - 1;
    if (march.status !== SgzzMarchStatus.MARCHING || total === 0) {
        const last = march.status === SgzzMarchStatus.MARCHING ? cells[0] : cells[cells.length - 1];
        return { cell: last, nextCell: last, t: 0, stepIndex: total };
    }
    const elapsed = Math.max(0, Math.min(march.arriveAt - march.departAt, now - march.departAt));
    const exact = elapsed / SGZZ_MARCH_MS_PER_TILE;
    const stepIndex = Math.min(total, Math.floor(exact));
    if (stepIndex >= total) {
        return { cell: cells[total], nextCell: cells[total], t: 0, stepIndex: total };
    }
    return {
        cell: cells[stepIndex], nextCell: cells[stepIndex + 1],
        t: Math.max(0, Math.min(1, exact - stepIndex)), stepIndex,
    };
}

export function validateSgzzMarch(value: unknown, path = "march"): ISgzzMarch {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["marchId", "uid", "path", "departAt", "arriveAt", "status"], [], path);
    if (typeof r.status !== "string" || STATUSES.indexOf(r.status) < 0) {
        throw new WireValidationError("SGZZMAP_MARCH_STATUS", `${path}.status`);
    }
    if (!Array.isArray(r.path)) throw new WireValidationError("SGZZMAP_MARCH_PATH", `${path}.path`);
    const points = r.path.map((v, i) => validateSgzzCell(v, `${path}.path[${i}]`));
    const departAt = finiteInteger(r.departAt, `${path}.departAt`, 0);
    const arriveAt = finiteInteger(r.arriveAt, `${path}.arriveAt`, 0);
    // ★ 到达时刻由路径重算，⛔ 不信任线上传来的数字
    if (arriveAt - departAt !== sgzzMarchDurationMs(points)) {
        throw new WireValidationError("SGZZMAP_MARCH_TIME", `${path}.arriveAt`);
    }
    return {
        marchId: boundedString(r.marchId, `${path}.marchId`, 1, 64),
        uid: boundedString(r.uid, `${path}.uid`, 1, 32),
        path: points, departAt, arriveAt, status: r.status as SgzzMarchStatusValue,
    };
}

/** 终点格。 */
export function sgzzMarchTarget(march: ISgzzMarch): number {
    return march.path[march.path.length - 1];
}
/** 出发格。 */
export function sgzzMarchOrigin(march: ISgzzMarch): number {
    return march.path[0];
}
