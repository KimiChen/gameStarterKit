/**
 * mmo kit · `world` api 面（客户端，docs/MMO.md §7.2）：进世界入口（框架 world.enter）、观察者流的 token 集与 reconciler codec、
 * 实体表 / 私有态类型。⛔ 不 import cc（铁律 9）；本面任何导出变化都要 bump `api.world.version`。
 */
import type { LobbyRpcPort } from "../../../../app/ports";
import { ObserverReconciler, type ObserverReconcilerCodec } from "../../../../logic/rooms/observer/ObserverReconciler";
import type { ObserverStreamTypes } from "../../../../net/rooms/GameRoomTransport";
import { S2C, type IMmoEntityWire, type IMmoWorldEnter, type IMmoWorldLeave, type IMmoWorldPrivate, type IMmoWorldUpdate } from "../../../../shared/index";
import type { IMmoBagWire } from "../../../../shared/gameplays/mmoWorld/wire";
import { WorldRpc, type IWorldEnterRes } from "../../../../shared/protocol/lobbyRpc/domains/world";
import { clampToMap, integrate, withinRadius } from "../../../../shared/kits/mmo/api/world/index";

export { clampToMap, integrate, withinRadius };
export type { IMmoBagWire, IMmoEntityWire, IMmoWorldPrivate, IWorldEnterRes };

/** 本人私有态（private 流）：hp / mp + MK2-B1 冷却集合（spellId → 收到时的剩余 ms）与施法中 + MK3-B1 背包（进图一份、变化才来；未带 ⇒ 沿用上次）。 */
export interface MmoPrivateState {
    readonly hp: number;
    readonly hpMax: number;
    readonly mp: number;
    readonly mpMax: number;
    readonly cooldowns: Readonly<Record<string, number>>;
    readonly casting: { readonly spellId: string; readonly readyInMs: number } | null;
    readonly bag: IMmoBagWire | null;
}

/** mmoWorld 观察者六件 token（WorldRoomHandle.bindObserverStream 用）。 */
export const MMO_WORLD_STREAM_TYPES: ObserverStreamTypes = Object.freeze({
    enter: S2C.MmoWorldEnter,
    update: S2C.MmoWorldUpdate,
    leave: S2C.MmoWorldLeave,
    baselineBegin: S2C.MmoWorldBaselineBegin,
    baselineChunk: S2C.MmoWorldBaselineChunk,
    baselineEnd: S2C.MmoWorldBaselineEnd,
});

/** 玩法 wire → 通用实体的读取器（payload 已过 wire validator）。update 是变化投影：按 id 合并到上一版实体。 */
export const MMO_WORLD_RECONCILER_CODEC: ObserverReconcilerCodec<IMmoEntityWire, IMmoWorldEnter, IMmoWorldUpdate, IMmoWorldLeave> = {
    entityOfItem: (item) => item as IMmoEntityWire,
    entityOfEnter: (payload) => payload.entity,
    entityOfUpdate: (previous, payload) => ({
        ...previous,
        id: payload.id,
        kind: previous?.kind ?? "creature",
        templateId: previous?.templateId ?? "",
        name: previous?.name ?? "",
        x: payload.x,
        y: payload.y,
        rev: payload.rev,
        hp: payload.hp,
        hpMax: previous?.hpMax ?? Math.max(1, payload.hp),
        level: previous?.level ?? 1,
    }),
    idOfLeave: (payload) => payload.id,
};

export function createMmoWorldReconciler(): ObserverReconciler<IMmoEntityWire, IMmoWorldEnter, IMmoWorldUpdate, IMmoWorldLeave> {
    return new ObserverReconciler(MMO_WORLD_RECONCILER_CODEC);
}

/** 框架 world.enter：签发一次性凭据（query；凭据原文只在返回值里流转，⛔ 落日志）。 */
export function enterWorld(lobbyRpc: Pick<LobbyRpcPort, "query">, personaId: string, mapId: string): Promise<IWorldEnterRes> {
    return lobbyRpc.query(WorldRpc.Enter, { personaId, mapId });
}
