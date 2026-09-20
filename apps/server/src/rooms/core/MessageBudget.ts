/**
 * 每会话消息预算（MF3-B2 自 `GameRoom.consumeMessageBudget` 抽出；docs/MMO.md §5.4 MF3）。
 *
 * 语义与抽取前逐字等价：1 s 滚动窗口按会话计数，窗口起点由注入时钟决定（时钟倒退或跨窗即开新窗）；
 * `consume` 只回答「这一份预算能不能给」，超限时回什么错由调用方（WireDispatcher）决定。
 * Colyseus 也会在 transport 层按同一上限计数一次；房内再保留一份计数是为了让直接调用 handler
 * （测试 / 回放 / 未来的非 websocket transport）也拥有相同边界。输入频率不是玩法契约，故只在这里登记。
 *
 * `get` / `set` / `delete` / `clear` / `size` 保持与抽取前 `Map<string, BudgetWindow>` 相同的形态：
 * 既有测试直接读写窗口（`room.messageBudget.get(sessionId)?.count`）以钉住 rateCost 追加消耗的次数。
 */
export const GAME_ROOM_MAX_MESSAGES_PER_SECOND = 60;

export interface BudgetWindow {
    windowStart: number;
    count: number;
}

export class MessageBudget {
    private readonly windows = new Map<string, BudgetWindow>();

    constructor(
        private readonly limitPerSecond: number,
        private readonly now: () => number,
    ) {}

    /** 消耗 1 份基础预算；返回 false = 本会话本窗口已超限（调用方决定是否回错）。 */
    consume(sessionId: string): boolean {
        const now = this.now();
        const previous = this.windows.get(sessionId);
        const windowStart = previous && now >= previous.windowStart && now - previous.windowStart < 1000
            ? previous.windowStart
            : now;
        const count = previous && windowStart === previous.windowStart ? previous.count + 1 : 1;
        this.windows.set(sessionId, { windowStart, count });
        return count <= this.limitPerSecond;
    }

    get(sessionId: string): BudgetWindow | undefined {
        return this.windows.get(sessionId);
    }

    /** 测试注入窗口（与抽取前 Map.set 同形）。 */
    set(sessionId: string, window: BudgetWindow): this {
        this.windows.set(sessionId, window);
        return this;
    }

    delete(sessionId: string): boolean {
        return this.windows.delete(sessionId);
    }

    clear(): void {
        this.windows.clear();
    }

    get size(): number {
        return this.windows.size;
    }
}
