/**
 * S2C 出站口（MF3-B2 自 GameRoom 抽出；docs/MMO.md §5.4 MF3）：所有服务端 → 客户端的房间消息都经这里，
 * 发送前先过 validator——core 消息走 shared `validateS2CPayload`，玩法消息走 wire token 的
 * dir / owner 闸 + `token.validate`。⛔ 任何绕过本文件直接 `client.send` / `room.broadcast` 的路径都是暗道。
 *
 * host 是传输壳（GameRoom / MF4 WorldRoom）注入的最小接缝：disposed 短路、当前 mode id（owner 闸）、
 * 真正的房间广播落点。MF5a 在这里给 `broadcast` 加 perSession token 的 fail-closed 闸。
 */
import type { Client } from "colyseus";
import {
    ErrorCode,
    ErrorMessage,
    GAME_WIRE_OWNERS,
    S2C,
    validateS2CPayload,
    type ErrorCodeType,
    type GameplayS2CToken,
    type IErrorRes,
    type S2CType,
} from "@game/shared";

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

    broadcastToken<TPayload>(token: GameplayS2CToken<TPayload>, payload: TPayload): void {
        if (this.host.isDisposed()) return;
        this.assertModeToken(token);
        const wire = token.validate(payload);
        this.host.broadcast(token.type, wire);
    }

    private deliver(client: S2CClient, type: string, wire: unknown): void {
        try { client?.send?.(type, wire); } catch { /* connection may be closing */ }
    }
}
