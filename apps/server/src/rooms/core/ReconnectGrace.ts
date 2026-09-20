/**
 * 非主动断线的重连宽限 + generation fence（MF3-B2 自 GameRoom.onLeave 抽出；docs/MMO.md §5.4 MF3）。
 *
 * 微信小游戏切后台必断 socket，实机常态不是异常——没有宽限就等于「切个后台 = 弃赛」（回流自 Arthur 三房间标配）。
 * 宽限期间座位 / owner / Ready 由壳原样保留；本类只回答三态：
 *  - `reconnected`：客户端用 SDK reconnection token 归位（⛔ 不重复消费 access ticket）；
 *  - `expired`：宽限到期未归，壳按真离开走最终清理；
 *  - `stale`：await 期间房间已 dispose 或生命周期代际前移——迟到的重连 / 到期都不得再簿记
 *    （dispose 已把 generation 前移；此前壳只在到期分支短路 disposed，重连成功分支没有 fence）。
 */
import type { Client } from "colyseus";

export const RECONNECT_GRACE_S = 10;

export interface ReconnectGraceHost {
    /**
     * Colyseus Room.allowReconnection（返回其自家 Deferred 而非标准 Promise，故只约束为可 await 的 thenable；
     * 测试可在实例上替换为受控 Promise）。
     */
    allowReconnection(client: Client, seconds: number): unknown;
    /** 生命周期代际（GameRoom.lifecycleGeneration）；dispose 前移。 */
    generation(): number;
    isDisposed(): boolean;
}

export type ReconnectOutcome = "reconnected" | "expired" | "stale";

export class ReconnectGrace {
    constructor(
        private readonly host: ReconnectGraceHost,
        private readonly graceSeconds: number = RECONNECT_GRACE_S,
    ) {}

    async await(client: Client): Promise<ReconnectOutcome> {
        const generation = this.host.generation();
        let reconnected: boolean;
        try {
            await Promise.resolve(this.host.allowReconnection(client, this.graceSeconds));
            reconnected = true;
        } catch {
            reconnected = false;
        }
        if (this.host.isDisposed() || this.host.generation() !== generation) return "stale";
        return reconnected ? "reconnected" : "expired";
    }
}
