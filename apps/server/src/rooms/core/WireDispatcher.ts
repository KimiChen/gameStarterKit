/**
 * 房间 C2S 通用 dispatcher（MF3-B2 自 `GameRoom.dispatchGameMessage` 抽出；docs/Non-intrusive.md §4.5、
 * docs/MMO.md §5.4 MF3）。固定序 ⛔ 不得重排：
 *  1. disposed 短路；未选定 mode 即 fail-fast；先消耗基础预算（未知 / 畸形 type 也计费，flood 不因拼错消息名而免费）；
 *  2. type 非 string / 不在 wire catalog / owner 既非 core 也非当前 mode → BadRequest（唯一 owner 拒绝点，
 *     排在 validate 之前——他 mode 消息的 payload 零触碰）；
 *  3. exact validate（shared validator；二进制帧 fallback 会把 Uint8Array 原样交入，isPlainRecord 的原型检查负责拒绝）；
 *  4. rateCost > 1 时追加预算消耗（在昂贵后续处理之前）；
 *  5. phase：core 消息用壳注入的规则（Ping→W/P/S；Chat→W/P；Ready/Start→W），玩法消息用 token 声明；
 *  6. core 消息交壳的 core handler，玩法消息交壳的 mode command 入口。
 *
 * catch-all `messages["_"]` 形态不变：壳仍只注册一个 catch-all 并把 (client, type, message) 原样交进来。
 */
import type { Client } from "colyseus";
import {
    ErrorCode,
    GAME_WIRE_OWNERS,
    GAME_WIRE_PHASES,
    GAME_WIRE_RATE_COST,
    validateC2SPayload,
    type C2SType,
    type ErrorCodeType,
    type GamePhaseType,
} from "@game/shared";
import { MessageBudget } from "./MessageBudget";

export interface WireDispatcherHost {
    isDisposed(): boolean;
    /** 未选定 mode 即 throw（GameRoom.requireMode 的 fail-fast）；返回当前 mode id 供 owner 闸。 */
    requireModeId(): string;
    /** 玩法 C2S 的预算成本（缺省读生成的 wire catalog；测试可替换观察机制）。 */
    rateCostOf(type: string): number;
    currentPhase(): GamePhaseType;
    /** core 消息的 phase 规则由壳拥有（⛔ 不进玩法 wire catalog）。 */
    corePhaseAllows(type: C2SType, phase: GamePhaseType): boolean;
    sendError(client: Client, code: ErrorCodeType): void;
    handleCore(client: Client, type: C2SType, payload: unknown): void;
    handleMode(client: Client, type: C2SType, payload: unknown): void;
}

export interface WireDispatcherBudgetOptions {
    readonly limitPerSecond: number;
    readonly now: () => number;
}

/** 生成的 wire catalog 里的 rateCost；未登记按 1。 */
export const defaultWireRateCost = (type: string): number =>
    (GAME_WIRE_RATE_COST as Readonly<Partial<Record<string, number>>>)[type] ?? 1;

/** 玩法消息按其 wire token 声明的 phases 放行。 */
export function gameplayPhaseAllows(type: string, phase: GamePhaseType): boolean {
    const phases = (GAME_WIRE_PHASES as Readonly<Partial<Record<string, readonly string[]>>>)[type];
    return phases !== undefined && phases.includes(phase);
}

export class WireDispatcher {
    /** 每会话预算；壳在开局 / 回滚 / 离场 / dispose 时清理，测试直接读写窗口。 */
    readonly budget: MessageBudget;

    constructor(private readonly host: WireDispatcherHost, budget: WireDispatcherBudgetOptions) {
        this.budget = new MessageBudget(budget.limitPerSecond, budget.now);
    }

    dispatch(client: Client, type: unknown, message: unknown): void {
        const host = this.host;
        if (host.isDisposed()) return;
        const modeId = host.requireModeId();
        if (!this.budget.consume(client.sessionId)) {
            host.sendError(client, ErrorCode.BadRequest);
            return;
        }
        const owner = typeof type === "string"
            ? (GAME_WIRE_OWNERS as Readonly<Partial<Record<string, string>>>)[type]
            : undefined;
        if (owner === undefined || (owner !== "core" && owner !== modeId)) {
            host.sendError(client, ErrorCode.BadRequest);
            return;
        }
        const messageType = type as C2SType;
        let payload: unknown;
        try {
            payload = validateC2SPayload(messageType, message);
        } catch {
            // 含 S2C 消息名与未登记 C2S validator 的兜底（MESSAGE_TYPE 同样落到这里）。
            host.sendError(client, ErrorCode.BadRequest);
            return;
        }
        for (let extra = host.rateCostOf(messageType) - 1; extra > 0; extra--) {
            if (!this.budget.consume(client.sessionId)) {
                host.sendError(client, ErrorCode.BadRequest);
                return;
            }
        }
        const phase = host.currentPhase();
        const allowed = owner === "core"
            ? host.corePhaseAllows(messageType, phase)
            : gameplayPhaseAllows(messageType, phase);
        if (!allowed) {
            host.sendError(client, ErrorCode.BadRequest);
            return;
        }
        if (owner === "core") {
            host.handleCore(client, messageType, payload);
            return;
        }
        host.handleMode(client, messageType, payload);
    }
}
