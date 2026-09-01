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
import { GAMEPLAY_CATALOG, RoomName } from "../../shared/index";

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
