/**
 * mmo kit · `world` api 面（shared，docs/MMO.md §7.2）：世界地址 / 向量 / 实体 id 与三档可见性的零依赖类型，以及 mmoWorld wire 契约的
 * 再导出（wire 契约属本面：任一 token 变化 bump `api.world.version`）。插件只能 import 本门面，⛔ 不 import kit 内部模块。
 * 三档可见性（§4.3）：全图公开（root：分线元数据）/ 视野内公开投影（IEntityCard = IMmoEntityWire，perSession 视野流）/ 本人私有（IMmoWorldPrivate）。
 * 移动纯函数（integrate / clampToMap）自 MK1-B1 起归 `movement` 面，此处再导出保持 v1 导出面不变。
 */
export type WorldAddress = string;
export type EntityId = string;
export type {
    IMmoEntityWire as IEntityCard, IMmoVec2 as Vec2, IMmoWorldBaselineBegin, IMmoWorldBaselineChunk, IMmoWorldBaselineEnd, IMmoWorldEnter, IMmoWorldLeave,
    IMmoWorldMoveReq, IMmoWorldOpResult, IMmoWorldPos, IMmoWorldPrivate, IMmoWorldTransferReady, IMmoWorldUpdate, MmoEntityKind,
} from "../../../../gameplays/mmoWorld/wire";
export { MMO_WORLD_COORD_MAX } from "../../../../gameplays/mmoWorld/wire";
export { clampToMap, integrate } from "../movement/index";

/** 分线号上限（WorldAddress 的一段；框架 IWorldRoomJoinOptions.line 同界）。 */
export const MMO_WORLD_MAX_LINE = 0xffff;

/** 分线元数据（k_mmo_instance 行 + 框架 world_instance 的键）。 */
export interface IInstanceMeta {
    readonly instanceId: string;
    readonly mapId: string;
    readonly line: number;
    readonly packId: string;
    readonly packVersion: number;
    readonly scriptRev: number;
}

export interface IWorldAddressParts {
    readonly sId: number;
    readonly mapId: string;
    readonly line: number;
}

const MAP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

export function isMapId(value: unknown): value is string {
    return typeof value === "string" && MAP_ID_RE.test(value);
}

/** `s<sId>/<mapId>/<line>`（与框架 rooms/core/WorldDirectory.worldAddressOf 同形；shared 侧自持一份纯函数）。 */
export function worldAddressOf(sId: number, mapId: string, line: number): WorldAddress {
    if (!Number.isSafeInteger(sId) || sId < 0 || sId > 0xffff) throw new RangeError(`sId ${sId} 非法`);
    if (!isMapId(mapId)) throw new RangeError(`mapId "${mapId}" 非法`);
    if (!Number.isSafeInteger(line) || line < 0 || line > MMO_WORLD_MAX_LINE) throw new RangeError(`line ${line} 非法`);
    return `s${sId}/${mapId}/${line}`;
}

export function parseWorldAddress(address: unknown): IWorldAddressParts | null {
    if (typeof address !== "string") return null;
    const match = /^s(\d{1,5})\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/(\d{1,5})$/u.exec(address);
    if (!match) return null;
    const sId = Number(match[1]);
    const line = Number(match[3]);
    if (sId > 0xffff || line > MMO_WORLD_MAX_LINE) return null;
    return { sId, mapId: match[2] as string, line };
}

export function distanceSq(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

/** 欧氏视距判定（内容包 aoi.viewRadius 用世界单位）。 */
export function withinRadius(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, radius: number): boolean {
    return distanceSq(a, b) <= radius * radius;
}
