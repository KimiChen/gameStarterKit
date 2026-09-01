/**
 * PendingOperationJournal（Non-intrusive §7.2 阶段 5b）：feature-session scoped 的
 * 未决幂等写日志。ResultUnknown ⛔ 不只保存在 route Logic——route 关闭只断开渲染
 * 订阅，不删除未决操作；重开后仍复用原 clientReqId。
 *
 * 四条硬约束（§7.2，逐字落实）：
 *  1. **write-ahead**：条目必须写在 send 之前（begin 落
 *     clientReqId+route+规范化 payload+expectedStateVersion+状态=inflight，再 send）。
 *     ⛔ 不允许收到响应或 onDrop 时才补写；`markInflightUnknown()`（onDrop 接线）只做
 *     inflight → unknown 状态迁移，⛔ 不产生新条目。
 *  2. **上限与溢出**：maxEntries + 单条 maxPayloadBytes。超 payload 上限只保留
 *     clientReqId+route+「oversize」占位记号+expectedStateVersion（客户端 ⛔ 不算
 *     SHA-256——摘要只在服务端计算，恢复按领域收据查询而非本地重放）。达 maxEntries
 *     时 ⛔ 不得淘汰任何未决（inflight/unknown）条目——先淘汰已终态条目，仍满则
 *     fail closed 拒绝新写（JournalFullError）。
 *  3. **重发必须字节等同**：只能原样发送 journal 已存的那份规范化串（shared 的
 *     canonicalJsonString 是仓库唯一 canonicalizer；canonical 形态是重解析的不动点，
 *     resendPayloadOf 返回原串）。⛔ 不得在重发时重新规范化。
 *  4. **账号边界**：feature-session scoped。主动登出与任何 uid 变化都同步清空整个
 *     journal（ensureUid 在每次写入点校验），clientReqId ⛔ 不跨 uid 复用。
 *
 * 生命周期分叉（§7.3）：auth-invalid = session ended → 清空（clearForSessionEnd，
 * AppRuntime 在 onAuthInvalid 同步栈接线）；final-loss → **保留**，重进成功后对账
 * （reconcileAfterRejoin——本阶段无服务端 operation 查询路由，对账 = 把 unknown 条目
 * 交给调用方重发或维持 unknown；服务端 inspect 消费者留待有产品 feature 时接入）。
 */
import { canonicalJsonString } from "../shared/index";

export type JournalEntryState = "inflight" | "unknown" | "applied" | "failed" | "abandoned";

export interface JournalEntry {
    readonly clientReqId: string;
    readonly route: string;
    /** canonicalJsonString(payload)；oversize 条目为 null（只留占位记号）。 */
    readonly payload: string | null;
    /** payload 超限占位记号（客户端不算 hash，只标记「有过这笔写」）。 */
    readonly oversize: boolean;
    readonly expectedStateVersion?: number;
    readonly state: JournalEntryState;
}

interface MutableEntry {
    readonly clientReqId: string;
    readonly route: string;
    readonly payload: string | null;
    readonly oversize: boolean;
    readonly expectedStateVersion?: number;
    state: JournalEntryState;
}

/** maxEntries fail-closed 的可判别错误（调用方提示用户等待既有操作收敛）。 */
export class JournalFullError extends Error {
    readonly code = "JOURNAL_FULL" as const;
    constructor() {
        super("[PendingOperationJournal] 未决操作已达上限，请等待既有操作收敛后重试");
        this.name = "JournalFullError";
    }
}

export interface PendingOperationJournalOptions {
    readonly maxEntries?: number;
    readonly maxPayloadBytes?: number;
}

const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_PAYLOAD_BYTES = 16_384;

/** UTF-8 字节数（ES2017 无 TextEncoder 依赖的实现；代理对按 4 字节计）。 */
function utf8ByteLength(text: string): number {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i++; }
        else bytes += 3;
    }
    return bytes;
}

function isTerminal(state: JournalEntryState): boolean {
    return state === "applied" || state === "failed" || state === "abandoned";
}

export class PendingOperationJournal {
    private readonly maxEntries: number;
    private readonly maxPayloadBytes: number;
    /** 插入序 Map：clientReqId → entry（淘汰终态时按最旧优先）。 */
    private readonly entriesById = new Map<string, MutableEntry>();
    private uid: string | null = null;

    constructor(options: PendingOperationJournalOptions = {}) {
        this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
        this.maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    }

    /** 账号边界（约束 4）：uid 变化同步清空整本 journal。每次写入点必须先调用。 */
    ensureUid(uid: string): void {
        if (this.uid !== null && this.uid !== uid) {
            this.entriesById.clear();
        }
        this.uid = uid;
    }

    currentUid(): string | null {
        return this.uid;
    }

    /**
     * write-ahead 写入（约束 1）：send 之前落 inflight 条目。
     * 超 payload 上限降级为 oversize 占位（约束 2）；达 maxEntries 且无终态可淘汰
     * 时抛 JournalFullError（fail closed，⛔ 不淘汰未决条目）。
     */
    begin(input: {
        readonly uid: string;
        readonly clientReqId: string;
        readonly route: string;
        readonly payload: unknown;
        readonly expectedStateVersion?: number;
    }): JournalEntry {
        this.ensureUid(input.uid);
        if (this.entriesById.has(input.clientReqId)) {
            throw new Error(`[PendingOperationJournal] clientReqId 重复: ${input.clientReqId}`);
        }
        this.evictTerminalIfFull();
        if (this.entriesById.size >= this.maxEntries) {
            throw new JournalFullError();
        }
        const canonical = canonicalJsonString(input.payload);
        const oversize = utf8ByteLength(canonical) > this.maxPayloadBytes;
        const entry: MutableEntry = {
            clientReqId: input.clientReqId,
            route: input.route,
            payload: oversize ? null : canonical,
            oversize,
            state: "inflight",
        };
        if (input.expectedStateVersion !== undefined) {
            (entry as { expectedStateVersion?: number }).expectedStateVersion = input.expectedStateVersion;
        }
        this.entriesById.set(input.clientReqId, entry);
        return { ...entry };
    }

    private evictTerminalIfFull(): void {
        if (this.entriesById.size < this.maxEntries) return;
        for (const [id, entry] of this.entriesById) {
            if (isTerminal(entry.state)) {
                this.entriesById.delete(id);
                if (this.entriesById.size < this.maxEntries) return;
            }
        }
    }

    /** 结算一条操作（applied / failed / abandoned / unknown）。未知 id 静默忽略（已被淘汰的终态）。 */
    settle(clientReqId: string, state: Exclude<JournalEntryState, "inflight">): void {
        const entry = this.entriesById.get(clientReqId);
        if (!entry) return;
        entry.state = state;
    }

    /** onDrop 接线（约束 1 尾款）：只做 inflight → unknown，⛔ 不新增条目。 */
    markInflightUnknown(): void {
        for (const entry of this.entriesById.values()) {
            if (entry.state === "inflight") entry.state = "unknown";
        }
    }

    /**
     * 重发字节等同（约束 3）：返回 begin 时存下的那份规范化串（canonical 形态是
     * JSON.parse→canonicalJsonString 的不动点，调用方 parse 后经原 clientReqId 重发）。
     * oversize / 未知 id 返回 null（按领域收据查询恢复，不本地重放）。
     */
    resendPayloadOf(clientReqId: string): string | null {
        const entry = this.entriesById.get(clientReqId);
        if (!entry || entry.oversize) return null;
        return entry.payload;
    }

    entryOf(clientReqId: string): JournalEntry | null {
        const entry = this.entriesById.get(clientReqId);
        return entry ? { ...entry } : null;
    }

    /** 未决（inflight/unknown）条目快照（重进对账/诊断用）。 */
    pendingEntries(): readonly JournalEntry[] {
        const result: JournalEntry[] = [];
        for (const entry of this.entriesById.values()) {
            if (!isTerminal(entry.state)) result.push({ ...entry });
        }
        return result;
    }

    entries(): readonly JournalEntry[] {
        return [...this.entriesById.values()].map((entry) => ({ ...entry }));
    }

    get size(): number {
        return this.entriesById.size;
    }

    /** session ended（auth-invalid / 主动登出）：同步清空。final-loss ⛔ 不调用本方法。 */
    clearForSessionEnd(): void {
        this.entriesById.clear();
        this.uid = null;
    }

    /**
     * final-loss 重进成功后的对账（§7.3「先对账、后拉快照」中的对账步）。本阶段无
     * 服务端 operation 查询路由：将 unknown 条目交给注入的 resend 执行器逐条重发
     * （字节等同），无执行器则维持 unknown。返回仍未决的条目数。
     */
    async reconcileAfterRejoin(
        resend?: (entry: JournalEntry, canonicalPayload: string) => Promise<"applied" | "failed" | "unknown">,
    ): Promise<number> {
        if (resend) {
            for (const entry of [...this.entriesById.values()]) {
                if (entry.state !== "unknown" || entry.oversize || entry.payload === null) continue;
                try {
                    const outcome = await resend({ ...entry }, entry.payload);
                    entry.state = outcome;
                } catch {
                    entry.state = "unknown";
                }
            }
        }
        return this.pendingEntries().length;
    }
}
