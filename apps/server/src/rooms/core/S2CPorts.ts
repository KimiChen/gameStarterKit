/**
 * S2C 出站口（MF3-B2 自 GameRoom 抽出；docs/MMO.md §5.4 MF3）：所有服务端 → 客户端的房间消息都经这里，
 * 发送前先过 validator——core 消息走 shared `validateS2CPayload`，玩法消息走 wire token 的
 * dir / owner 闸 + `token.validate`。⛔ 任何绕过本文件直接 `client.send` / `room.broadcast` 的路径都是暗道。
 *
 * host 是传输壳（GameRoom / MF4 WorldRoom）注入的最小接缝：disposed 短路、当前 mode id（owner 闸）、
 * 真正的房间广播落点。
 *
 * **perSession 闸（MMO MF5a-B3）**：`defineS2C(..., { perSession: true })` 的 token 只能按会话 `sendToken`（GameRoom 经
 * OutboundQueue 每 tick 排空），`broadcastToken` 对它 fail-closed——发送期按 token 自身 `perSession` 与生成表
 * `GAME_WIRE_PER_SESSION` 双判（任一命中即拒）；启动期（本模块加载时）断言生成表与运行时 token 逐条一致，
 * 陈旧的生成物（改了 wire.ts 没跑 codegen）在进程起来那一刻就炸，⛔ 不等到第一条广播。
 */
import type { Client } from "colyseus";
import {
    ErrorCode,
    ErrorMessage,
    GAME_WIRE_OWNERS,
    GAME_WIRE_PER_SESSION,
    S2C,
    gameplayS2CTokens,
    validateS2CPayload,
    type ErrorCodeType,
    type GameplayS2CToken,
    type IErrorRes,
    type S2CType,
} from "@game/shared";

type PerSessionCatalog = Readonly<Partial<Record<string, string | null>>>;
type S2CTokenTable = Readonly<Record<string, Readonly<Record<string, GameplayS2CToken<unknown>>>>>;

/**
 * 启动期断言：生成表 `GAME_WIRE_PER_SESSION` 必须与运行时 token 的 `perSession` / `coalesceKey` 逐条一致
 * （两者同源于 wire.ts，只会因生成物陈旧而分叉）。不一致 ⇒ throw，模块加载即失败。
 */
export function assertPerSessionCatalogConsistent(
    catalog: PerSessionCatalog = GAME_WIRE_PER_SESSION,
    tokens: S2CTokenTable = gameplayS2CTokens as unknown as S2CTokenTable,
): void {
    const seen = new Set<string>();
    for (const [modeId, table] of Object.entries(tokens)) {
        for (const token of Object.values(table)) {
            const listed = Object.prototype.hasOwnProperty.call(catalog, token.type);
            const key = listed ? (catalog[token.type] ?? null) : null;
            if (token.perSession !== listed || token.coalesceKey !== key) {
                throw new Error(`[S2CPorts] perSession 生成表与 ${modeId} 的 ${token.type} 不一致（表: ${listed ? String(key) : "缺席"}；`
                    + `token: perSession=${String(token.perSession)} coalesceKey=${String(token.coalesceKey)}）——跑 codegen:gameplays`);
            }
            seen.add(token.type);
        }
    }
    for (const type of Object.keys(catalog)) {
        if (!seen.has(type)) throw new Error(`[S2CPorts] perSession 生成表含运行时不存在的 token ${type}——跑 codegen:gameplays`);
    }
}
assertPerSessionCatalogConsistent();

/** 发送期判据：token 自身声明或生成表命中，任一为真即是 perSession（双判 fail-closed）。 */
export function isPerSessionToken(token: GameplayS2CToken<unknown>): boolean {
    return token.perSession === true || Object.prototype.hasOwnProperty.call(GAME_WIRE_PER_SESSION, token.type);
}

export interface S2CPortsHost {
    isDisposed(): boolean;
    /** 当前 mode id：token owner 必须 ∈ {core, 当前 mode}。 */
    modeId(): string;
    /** 房间广播落点（Room.broadcast）；收到的已是过完 validator 的 wire。 */
    broadcast(type: string, wire: unknown): void;
}

/** 确定性测试的假 client 可能没有 send；坏包必须是 no-op 而不是 throw 进房间循环。 */
export type S2CClient = Client | { send?(type: string, payload: unknown): void } | undefined;

export class S2CPorts {
    constructor(private readonly host: S2CPortsHost) {}

    /** core S2C：先过 shared runtime validator，再交给 transport。 */
    send(client: S2CClient, type: S2CType, payload: unknown): void {
        if (this.host.isDisposed()) return;
        const wire = validateS2CPayload(type, payload);
        this.deliver(client, type, wire);
    }

    /** core 广播：validate 先于进入房间扇出队列。 */
    broadcast(type: S2CType, payload: unknown): void {
        if (this.host.isDisposed()) return;
        const wire = validateS2CPayload(type, payload);
        this.host.broadcast(type, wire);
    }

    sendError(client: S2CClient, code: ErrorCodeType): void {
        const error: IErrorRes = { code, message: ErrorMessage[code] ?? ErrorMessage[ErrorCode.Unknown] };
        this.send(client, S2C.Error, error);
    }

    /**
     * mode 出站的 token 闸：dir 必须是 s2c，owner ∈ {core, 当前 mode}；payload 过 `token.validate`
     * （与 shared S2C validator 同一实现）。坏 token / 越权 token 是 mode 的实现缺陷，直接 throw
     * 交由调用 hook 的既有兜底记录。
     */
    assertModeToken(token: GameplayS2CToken<unknown>): void {
        const modeId = this.host.modeId();
        if (!token || typeof token !== "object" || token.dir !== "s2c" || typeof token.type !== "string") {
            throw new TypeError(`[GameRoom] mode ${modeId} 出站消息必须携带 s2c wire token`);
        }
        const owner = (GAME_WIRE_OWNERS as Readonly<Partial<Record<string, string>>>)[token.type];
        if (owner !== "core" && owner !== modeId) {
            throw new TypeError(`[GameRoom] mode ${modeId} 不得发送 ${token.type}（owner=${String(owner)}）`);
        }
    }

    sendToken<TPayload>(client: S2CClient, token: GameplayS2CToken<TPayload>, payload: TPayload): void {
        if (this.host.isDisposed()) return;
        this.assertModeToken(token);
        const wire = token.validate(payload);
        this.deliver(client, token.type, wire);
    }

    /**
     * 全房广播；perSession token 在这里 fail-closed（先于 owner 闸——这是 token 的结构属性，与谁发无关）。
     * 视野内 / 本人私有流只能按会话走 `sendToken`（GameRoom 经 OutboundQueue 排空）。
     */
    broadcastToken<TPayload>(token: GameplayS2CToken<TPayload>, payload: TPayload): void {
        if (this.host.isDisposed()) return;
        if (token && typeof token === "object" && isPerSessionToken(token as GameplayS2CToken<unknown>)) {
            throw new TypeError(`[GameRoom] ${String(token.type)} 是 perSession token，⛔ 不得广播——按会话 sendS2C（OutboundQueue）`);
        }
        this.assertModeToken(token);
        const wire = token.validate(payload);
        this.host.broadcast(token.type, wire);
    }

    private deliver(client: S2CClient, type: string, wire: unknown): void {
        try { client?.send?.(type, wire); } catch { /* connection may be closing */ }
    }
}
