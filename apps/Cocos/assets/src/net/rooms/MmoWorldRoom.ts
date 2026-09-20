/**
 * mmoWorld 的 transport 适配（kits/mmo 的世界形态玩法）：joiner（world.enter 签凭据 → WorldRoomTransport.join）+ 绑定到**这一间**世界房句柄的
 * MmoWorldRoom 端口（意图 / baseline 请求 / 观察者流 → reconciler → 实体表回调 / 私有流 / 回执 / 掉线）。
 * 只消费框架 WorldRoomTransport / ObserverReconciler 类型，⛔ 不改 WorldRoomTransport.ts（kit 玩法与插件玩法同一约束）。
 * ⚠ MK0 单 world 进程：world.enter 的 endpoint 非空时仍沿用当前 SDK client（多进程直连归 MK1 / PS 轨道）；重同步请求的 authorityEpoch 取首个
 * baseline 之前未知 ⇒ 用 1（服务端 MK0 不校验，MK1 随根状态暴露到句柄后改）。
 */
import type { GameplayRoomJoiner } from "../../logic/gameplay/RoomController";
import type { MmoWorldRoom, MmoWorldRoomObserver } from "../../logic/rooms/mmoWorld/MmoWorldGameplay";
import { MMO_WORLD_GAMEPLAY_ID } from "../../logic/rooms/mmoWorld/MmoWorldGameplay";
import { MMO_WORLD_STREAM_TYPES, createMmoWorldReconciler, type IWorldEnterRes } from "../../kits/mmo/api/world/index";
import { C2S, S2C, type IMmoWorldBaselineBegin, type IMmoWorldBaselineChunk, type IMmoWorldBaselineEnd, type IMmoWorldEnter, type IMmoWorldLeave, type IMmoWorldOpResult, type IMmoWorldPos, type IMmoWorldPrivate, type IMmoWorldUpdate } from "../../shared/index";
import { WorldRoomTransport, type WorldRoomHandle } from "./WorldRoomTransport";

export interface MmoWorldJoinDeps {
    /** 世界房传输（生产 = WorldRoomTransport.forCurrentServer()，每次 join 惰性取；单测注入）。 */
    readonly transport: () => WorldRoomTransport;
    /** 框架 world.enter（生产 = kit runtime 经 Lobby RPC；单测注入）。 */
    readonly enter: (personaId: string, mapId: string) => Promise<IWorldEnterRes>;
}

/** 把玩法操作绑定到这一间世界房句柄（⛔ 不是全局 current）。 */
export function createMmoWorldRoom(handle: WorldRoomHandle): MmoWorldRoom {
    if (handle.mode !== MMO_WORLD_GAMEPLAY_ID) throw new TypeError("[MmoWorldRoom] 句柄 mode 与玩法不匹配");
    let seq = 0;
    const nextSeq = (): number => { seq += 1; return seq; };
    return {
        roomId: handle.roomId,
        sessionId: handle.sessionId,
        mapId: handle.mapId,
        get current() { return handle.current; },
        get dropping() { return handle.dropping; },
        move(dir) { const seq = nextSeq(); return handle.send(C2S.MmoWorldMove, { seq, dir }) ? seq : null; },
        moveTo(target) { const seq = nextSeq(); return handle.send(C2S.MmoWorldMove, { seq, target }) ? seq : null; },
        stop() { const seq = nextSeq(); return handle.send(C2S.MmoWorldMove, { seq, dir: { x: 0, y: 0 } }) ? seq : null; },
        requestBaseline(afterSeq) { return handle.send(C2S.MmoWorldBaselineRequest, { authorityEpoch: 1, afterSeq }); },
        observe(observer) { return observeMmoWorld(handle, observer); },
        leave: () => handle.leave(),
    };
}

function observeMmoWorld(handle: WorldRoomHandle, observer: MmoWorldRoomObserver): () => void {
    const reconciler = createMmoWorldReconciler();
    let active = true;
    const publish = (): void => {
        if (!active) return;
        observer.entities(reconciler.snapshot(), reconciler.isSynced);
        if (reconciler.needsResync) {
            observer.resync(reconciler.failure);
            handle.send(C2S.MmoWorldBaselineRequest, { authorityEpoch: 1, afterSeq: reconciler.seq });
            reconciler.reset();
        }
    };
    const offStream = handle.bindObserverStream(MMO_WORLD_STREAM_TYPES, {
        enter: (payload) => { reconciler.acceptEnter(payload as IMmoWorldEnter); publish(); },
        update: (payload) => { reconciler.acceptUpdate(payload as IMmoWorldUpdate); publish(); },
        leave: (payload) => { reconciler.acceptLeave(payload as IMmoWorldLeave); publish(); },
        baselineBegin: (payload) => { reconciler.acceptBaselineBegin(payload as IMmoWorldBaselineBegin); },
        baselineChunk: (payload) => { reconciler.acceptBaselineChunk(payload as IMmoWorldBaselineChunk); },
        baselineEnd: (payload) => { reconciler.acceptBaselineEnd(payload as IMmoWorldBaselineEnd); publish(); },
    });
    const offPrivate = handle.onMessage(S2C.MmoWorldPrivate, (payload: IMmoWorldPrivate) => {
        reconciler.acceptPrivate(payload);
        if (active) observer.privateState({ hp: payload.hp, hpMax: payload.hpMax, mp: payload.mp, mpMax: payload.mpMax });
        publish();
    });
    const offResult = handle.onMessage(S2C.MmoWorldOpResult, (payload: IMmoWorldOpResult) => { if (active) observer.opResult(payload); });
    // 本人移动回执（直发，不在观察者单流内）：预测器按 seq 和解
    const offPos = handle.onMessage(S2C.MmoWorldPos, (payload: IMmoWorldPos) => { if (active) observer.pos(payload); });
    const offDrop = handle.onDrop(() => { if (active) observer.dropped(); });
    const offReconnect = handle.onReconnect(() => { if (active) observer.reconnected(); });
    const offLeave = handle.onLeave((kind) => { if (active) observer.left(kind); });
    return () => {
        if (!active) return;
        active = false;
        for (const off of [offStream, offPrivate, offResult, offPos, offDrop, offReconnect, offLeave]) {
            try { off(); } catch (error) { console.error("[MmoWorldRoom] 解绑异常", error); }
        }
    };
}

/** joiner：world.enter（凭据）→ WorldRoomTransport.join → MmoWorldRoom；leave 经句柄。 */
export function createMmoWorldRoomJoiner(deps: MmoWorldJoinDeps): GameplayRoomJoiner<MmoWorldRoom> & { joinFor(personaId: string, mapId: string, signal: AbortSignal): { ready: Promise<MmoWorldRoom>; leave(): Promise<void> } } {
    const joinFor = (personaId: string, mapId: string, signal: AbortSignal) => {
        let handle: WorldRoomHandle | null = null;
        let abandoned = false;
        const ready = (async () => {
            const granted = await deps.enter(personaId, mapId);
            if (abandoned || signal.aborted) throw new Error("[MmoWorldRoom] join 已取消");
            const transport = deps.transport();
            const joined = await transport.join({ mode: MMO_WORLD_GAMEPLAY_ID, strategy: { mapId: granted.mapId, line: granted.line }, personaId, ticket: granted.ticket }, { signal });
            handle = joined;
            if (abandoned) {
                await joined.leave();
                throw new Error("[MmoWorldRoom] join 已取消");
            }
            return createMmoWorldRoom(joined);
        })();
        return {
            ready,
            leave: async () => {
                abandoned = true;
                if (handle) await handle.leave();
            },
        };
    };
    return {
        joinFor,
        join(signal, launch) {
            const input = launch as { readonly characterId?: string; readonly personaId?: string; readonly mapId?: string } | undefined;
            const personaId = input?.personaId;
            const mapId = input?.mapId;
            if (typeof personaId !== "string" || typeof mapId !== "string") throw new TypeError("[MmoWorldRoom] launch 缺 personaId / mapId（经 GameplayModule.validateLaunch 补全）");
            return joinFor(personaId, mapId, signal);
        },
    };
}
