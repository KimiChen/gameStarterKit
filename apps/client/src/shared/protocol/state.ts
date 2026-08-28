import { GamePhase, MAX_PLAYERS, type GamePhaseType } from "../constants/game";
import { assertExactKeys, boundedString, finiteInteger, finiteNumber, guardWire, isPlainRecord, type PlainRecord, WireValidationError } from "./http";

/**
 * 房间状态的纯数据镜像接口 —— 双端共享。
 *
 * 服务端使用 @colyseus/schema 定义真正的 Schema 状态类（见 server/src/rooms/schema/）；
 * Schema 类依赖 @colyseus/schema 运行时，不能放进零依赖的 shared 包。
 * 客户端通过 colyseus.js 的反射握手解码状态，无需 Schema 类，
 * 本文件的接口只用来给客户端的 room.state 提供类型标注。
 *
 * ⚠ 服务端 Schema 字段增删时，必须同步修改本文件。
 */

export interface IPlayerState {
    /** Colyseus sessionId */
    id: string;
    name: string;
    /** 逻辑坐标 */
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    /** 是否已准备/存活等演示用标记 */
    alive: boolean;
}

export interface IGameRoomState {
    /** 逻辑帧号 */
    tick: number;
    /** 房间阶段，取值见 constants/game.ts 的 GamePhase */
    phase: GamePhaseType;
    /**
     * 本局唯一 id：进入 Playing 时生成一次、结算/证据链/去重全部复用同一 id
     * （服务端框架 M8a，09·K4）；Waiting 阶段为空串。
     */
    matchId: string;
    /** key 为 sessionId */
    players: Map<string, IPlayerState>;
}

function stateRecord(input: unknown, path: string): PlainRecord {
    if (isPlainRecord(input)) return input;

    // The server owns the @colyseus/schema classes, while this package must
    // remain dependency-free.  Schema instances expose a JSON projection that
    // contains only their decorated wire fields (and omits internal `~`/`_`
    // bookkeeping).  Accept that explicit projection here so a server-side
    // state can be checked by the same validator used at the client boundary.
    // Arbitrary class instances without a plain-data `toJSON()` result remain
    // rejected, preserving the exact-key contract for ordinary wire objects.
    if (typeof input === "object" && input !== null) {
        try {
            // `~changes`/`~refId` are the non-enumerable bookkeeping markers
            // installed by @colyseus/schema's Schema.initialize(). Requiring
            // them keeps an arbitrary application class that happens to expose
            // toJSON() outside this wire boundary.
            if (Object.prototype.hasOwnProperty.call(input, "~changes")
                && Object.prototype.hasOwnProperty.call(input, "~refId")) {
                const serializer = (input as { toJSON?: unknown }).toJSON;
                if (typeof serializer === "function") {
                    const projected = serializer.call(input);
                    if (isPlainRecord(projected)) return projected;
                }
            }
        } catch {
            // Keep hostile getters/serializers inside the wire error domain.
            throw new WireValidationError("WIRE_DATA_CORRUPT", path);
        }
    }
    throw new WireValidationError("STATE_OBJECT", path);
}

export function validatePlayerState(input: unknown, path = "player"): IPlayerState {
    return guardWire(path, () => {
        const value = stateRecord(input, path);
        assertExactKeys(value, ["id", "name", "x", "y", "hp", "maxHp", "alive"], [], path);
        if (typeof value.alive !== "boolean") throw new WireValidationError("STATE_BOOLEAN", `${path}.alive`);
        const maxHp = finiteNumber(value.maxHp, `${path}.maxHp`, 0, Number.MAX_SAFE_INTEGER);
        const hp = finiteNumber(value.hp, `${path}.hp`, 0, maxHp);
        return {
            id: boundedString(value.id, `${path}.id`, 1, 64),
            name: boundedString(value.name, `${path}.name`, 1, 128),
            x: finiteNumber(value.x, `${path}.x`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
            y: finiteNumber(value.y, `${path}.y`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
            hp,
            maxHp,
            alive: value.alive as boolean,
        };
    });
}

function entriesOfPlayers(input: unknown, path: string): Array<[string, unknown]> {
    if (input instanceof Map) {
        const entries: Array<[string, unknown]> = [];
        for (const [key, value] of input.entries()) {
            if (entries.length >= MAX_PLAYERS) throw new WireValidationError("STATE_PLAYERS", path);
            entries.push([key, value]);
        }
        return entries;
    }
    // Colyseus decodes map fields as MapSchema, which deliberately has a custom
    // prototype but exposes the standard `entries()` iterator. Keep the shared
    // package dependency-free by using this narrow structural adapter instead of
    // importing @colyseus/schema.
    if (typeof input === "object" && input !== null) {
        const entriesMethod = (input as { entries?: unknown }).entries;
        if (typeof entriesMethod === "function") {
            try {
                const iterable = (entriesMethod as () => Iterable<unknown>).call(input);
                const iterator = iterable[Symbol.iterator]();
                const entries: Array<[string, unknown]> = [];
                for (;;) {
                    const step = iterator.next();
                    if (step.done) break;
                    const pair = step.value;
                    if (!Array.isArray(pair) || pair.length !== 2) {
                        throw new WireValidationError("STATE_PLAYERS", path);
                    }
                    if (entries.length >= MAX_PLAYERS) throw new WireValidationError("STATE_PLAYERS", path);
                    entries.push([pair[0] as string, pair[1]]);
                }
                return entries;
            } catch (error) {
                if (error instanceof WireValidationError) throw error;
                throw new WireValidationError("STATE_PLAYERS", path);
            }
        }
    }
    if (isPlainRecord(input)) {
        return Object.keys(input).map((key) => [key, input[key]]);
    }
    throw new WireValidationError("STATE_PLAYERS", path);
}

/** Colyseus state 反射后的纯数据校验；未知字段或非法 phase 不得进入渲染/玩法回调。 */
export function validateGameRoomState(input: unknown): IGameRoomState {
    return guardWire("state", () => {
        const value = stateRecord(input, "state");
        assertExactKeys(value, ["tick", "phase", "matchId", "players"], [], "state");
        const phase = value.phase;
        if (phase !== GamePhase.Waiting && phase !== GamePhase.Playing && phase !== GamePhase.Settle) {
            throw new WireValidationError("STATE_PHASE", "state.phase");
        }
        const entries = entriesOfPlayers(value.players, "state.players");
        if (entries.length > MAX_PLAYERS) throw new WireValidationError("STATE_PLAYERS", "state.players");
        const players = new Map<string, IPlayerState>();
        for (const [id, player] of entries) {
            if (typeof id !== "string" || id.length < 1 || id.length > 64 || players.has(id)) {
                throw new WireValidationError("STATE_PLAYER_ID", "state.players");
            }
            const parsed = validatePlayerState(player, `state.players.${id}`);
            if (parsed.id !== id) throw new WireValidationError("STATE_PLAYER_ID", `state.players.${id}.id`);
            players.set(id, parsed);
        }
        return {
            tick: finiteInteger(value.tick, "state.tick", 0),
            phase: phase as GamePhaseType,
            matchId: boundedString(value.matchId, "state.matchId", 0, 128),
            players,
        };
    });
}
