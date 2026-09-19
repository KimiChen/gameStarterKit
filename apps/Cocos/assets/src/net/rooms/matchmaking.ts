/**
 * GameRoom matchmaking strategy（Non-intrusive §4.4）：客户端选用哪种 SDK 方法不属于 wire，
 * 收敛为本地 launch request 的判别联合。三形态与 SDK 方法一一对应：
 *  - join-or-create → client.joinOrCreate(roomName, options)（默认撮合，filterBy 隔离）
 *  - create        → client.create(roomName, options)（私房房主：prepareCreate 后带 creationTicket）
 *  - join-by-id    → client.joinById(roomId, options)（私房好友：resolve 后带 joinTicket）
 *
 * endpoint、strategy、roomName/roomId 与完整 join options 共同进入 RoomClient 的
 * connection ownership key；token/ticket 只参与内存比较，⛔ 不打印（§4.4）。
 */
import { GAMEPLAY_CATALOG, RoomName, validateWorldMapId } from "../../shared/index";

export type GameRoomMatchmakingStrategy =
    | { readonly kind: "join-or-create"; readonly roomName: string }
    | { readonly kind: "create"; readonly roomName: string }
    | { readonly kind: "join-by-id"; readonly roomId: string };

/** 缺省 profile id（§4.4：v8 起 wire 必填；"default" = auto + matchmaking，与历史行为一致）。 */
export const DEFAULT_GAME_ROOM_PROFILE = "default";

/** 缺省 strategy：现状 joinOrCreate("game") 的显式形态。 */
export function defaultGameRoomStrategy(): GameRoomMatchmakingStrategy {
    return { kind: "join-or-create", roomName: RoomName.Game };
}

/**
 * 该玩法 manifest 的契约版本（client catalog 单源，⛔ 不手写字面量）；
 * join options 的 `modeVersion` 从这里取（§4.8 第三层）。
 */
export function gameRoomModeVersion(mode: string): number {
    const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, { readonly modeVersion: number }>>>)[mode];
    if (!entry) {
        throw new TypeError(`[matchmaking] mode ${mode} 不在 client catalog——modeVersion 无从取得`);
    }
    return entry.modeVersion;
}

function strategyName(value: unknown, path: string): string {
    if (typeof value !== "string" || value.length < 1 || value.length > 128) {
        throw new TypeError(`[matchmaking] strategy.${path} 必须是 1..128 字符串`);
    }
    return value;
}

/**
 * strategy 的本地校验（防御 hostile getter / 未知形态；normalize 后是冻结的浅拷贝，
 * join 在途期间外部 mutating 不会改写连接身份）。
 */
export function normalizeGameRoomStrategy(input: unknown): GameRoomMatchmakingStrategy {
    if (input === undefined || input === null) return defaultGameRoomStrategy();
    let kind: unknown;
    let roomName: unknown;
    let roomId: unknown;
    try {
        const value = input as Record<string, unknown>;
        kind = value.kind;
        roomName = value.roomName;
        roomId = value.roomId;
    } catch {
        throw new TypeError("[matchmaking] strategy 无法读取");
    }
    switch (kind) {
        case "join-or-create":
        case "create": {
            if (roomId !== undefined) throw new TypeError(`[matchmaking] ${kind} 不接受 roomId`);
            return Object.freeze({ kind, roomName: strategyName(roomName, "roomName") });
        }
        case "join-by-id": {
            if (roomName !== undefined) throw new TypeError("[matchmaking] join-by-id 不接受 roomName");
            return Object.freeze({ kind, roomId: strategyName(roomId, "roomId") });
        }
        default:
            throw new TypeError("[matchmaking] 未知 strategy kind");
    }
}

// ── 世界房（MMO MF4-B7，docs/MMO.md §4.2 / §5.4 MF4）────────────────────────────────────────

/**
 * 世界房撮合 strategy：`{ kind: "world", mapId, line? }` → `client.joinOrCreate(RoomName.World, worldOptions)`
 * （服务端 filterBy sId / mode / profile / mapId / line；缺 line = 服务端分配）。与 GameRoomMatchmakingStrategy **分表**：
 * RoomClient（match 形态）⛔ 不认识它，只有 net/rooms/WorldRoomTransport.ts 消费；ticket / personaId 不属 strategy（进 join options）。
 */
export type WorldRoomMatchmakingStrategy = {
    readonly kind: "world";
    readonly mapId: string;
    readonly line?: number;
};

/** 世界房唯一 profile（服务端 WorldProfile：AccessPolicy world-ticket、无 StartPolicy）。 */
export const WORLD_ROOM_PROFILE = "world";

export function normalizeWorldRoomStrategy(input: unknown): WorldRoomMatchmakingStrategy {
    let kind: unknown;
    let mapId: unknown;
    let line: unknown;
    try {
        const value = input as Record<string, unknown>;
        kind = value.kind;
        mapId = value.mapId;
        line = value.line;
    } catch {
        throw new TypeError("[matchmaking] world strategy 无法读取");
    }
    if (kind !== "world") throw new TypeError("[matchmaking] 世界房 strategy kind 必须是 \"world\"");
    let normalizedMapId: string;
    try {
        normalizedMapId = validateWorldMapId(mapId, "strategy.mapId");
    } catch {
        throw new TypeError("[matchmaking] strategy.mapId 必须是 1..64 的 [A-Za-z0-9._-] 串");
    }
    if (line === undefined) return Object.freeze({ kind: "world", mapId: normalizedMapId });
    if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 0 || line > 0xffff) {
        throw new TypeError("[matchmaking] strategy.line 必须是 0..65535 的整数");
    }
    return Object.freeze({ kind: "world", mapId: normalizedMapId, line });
}

/** world 形态玩法的契约版本（client catalog 单源）；非 world 形态（manifest kind ≠ "world"）即拒，⛔ 不能进世界房。 */
export function worldRoomModeVersion(mode: string): number {
    const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, { readonly modeVersion: number; readonly kind?: string }>>>)[mode];
    if (!entry) {
        throw new TypeError(`[matchmaking] mode ${mode} 不在 client catalog——modeVersion 无从取得`);
    }
    if (entry.kind !== "world") {
        throw new TypeError(`[matchmaking] mode ${mode} 不是 world 形态（manifest kind:"${entry.kind ?? "match"}"），⛔ 不能进世界房`);
    }
    return entry.modeVersion;
}
