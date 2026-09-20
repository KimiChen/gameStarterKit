/**
 * 观察者同步的客户端 reconcile（MMO MF5a-B5，docs/MMO.md §4.3）：纯 Logic，无引擎 / 网络依赖。
 *
 * 消费服务端 rooms/core/{ObserverSync,Baseline} 的 perSession 流：
 *  - baseline（Begin → Chunk* → End）：按 baselineId 拼块、按 Begin 计数核对、End 的 checksum 用共享 `wireChecksum` 复算，
 *    通过才整体替换本地实体集并把 cursor 推到 baseline 的 seq；缺块 / 乱序 / 错内容一律 fail 并标记需要重同步；
 *  - enter / update / leave：必须紧接 cursor（seq === lastSeq + 1）且已有 baseline，否则标记重同步（⛔ 不猜、不补洞）；
 *  - 同一会话的私有流与视野流共用 seq，调用方把私有消息也交给 `acceptPrivate` 推进 cursor。
 * 具体 payload 形状归各玩法 wire；本类经 codec 读 id / seq / 实体，不解释玩法字段。
 */
import { wireChecksum } from "../../../shared/protocol/observerSync";

export interface ObserverEnvelopeLike {
    readonly seq: number;
}

export interface ObserverBaselineBeginLike extends ObserverEnvelopeLike {
    readonly baselineId: string;
    readonly chunkCount: number;
    readonly itemCount: number;
}

export interface ObserverBaselineChunkLike extends ObserverEnvelopeLike {
    readonly baselineId: string;
    readonly index: number;
    readonly items: readonly unknown[];
}

export interface ObserverBaselineEndLike extends ObserverEnvelopeLike {
    readonly baselineId: string;
    readonly checksum: string;
}

/** 玩法 wire → 通用实体的读取器（⛔ 不做校验：payload 已过该玩法 wire validator）。 */
export interface ObserverReconcilerCodec<TEntity extends { readonly id: string }, TEnter, TUpdate, TLeave> {
    entityOfItem(item: unknown): TEntity;
    entityOfEnter(payload: TEnter): TEntity;
    /** update 可以是变化投影：给上一版实体与 payload，返回合并后的实体。 */
    entityOfUpdate(previous: TEntity | undefined, payload: TUpdate): TEntity;
    idOfLeave(payload: TLeave): string;
}

export type ObserverReconcileResult = "applied" | "resync";

export type ObserverReconcileFailure =
    | "no-baseline" | "seq-gap" | "baseline-begin" | "baseline-chunk" | "baseline-end" | "baseline-count" | "baseline-checksum" | "unknown-entity";

interface BaselineAssembly {
    readonly begin: ObserverBaselineBeginLike;
    readonly chunks: Map<number, readonly unknown[]>;
}

export class ObserverReconciler<TEntity extends { readonly id: string }, TEnter extends ObserverEnvelopeLike, TUpdate extends ObserverEnvelopeLike, TLeave extends ObserverEnvelopeLike> {
    private readonly entities = new Map<string, TEntity>();
    private lastSeq = 0;
    private synced = false;
    private assembly: BaselineAssembly | null = null;
    private resyncNeeded = false;
    private lastFailure: ObserverReconcileFailure | null = null;

    constructor(private readonly codec: ObserverReconcilerCodec<TEntity, TEnter, TUpdate, TLeave>) {}

    /** 当前本地实体集（只读视图）。 */
    snapshot(): ReadonlyMap<string, TEntity> {
        return this.entities;
    }

    get seq(): number {
        return this.lastSeq;
    }

    get isSynced(): boolean {
        return this.synced;
    }

    /** 置位后由调用方向服务端发 resync（玩法 wire 自定），收到新 baseline 即清。 */
    get needsResync(): boolean {
        return this.resyncNeeded;
    }

    get failure(): ObserverReconcileFailure | null {
        return this.lastFailure;
    }

    reset(): void {
        this.entities.clear();
        this.lastSeq = 0;
        this.synced = false;
        this.assembly = null;
        this.resyncNeeded = false;
        this.lastFailure = null;
    }

    acceptEnter(payload: TEnter): ObserverReconcileResult {
        if (!this.advance(payload)) return "resync";
        const entity = this.codec.entityOfEnter(payload);
        this.entities.set(entity.id, entity);
        return "applied";
    }

    acceptUpdate(payload: TUpdate): ObserverReconcileResult {
        if (!this.advance(payload)) return "resync";
        const probe = this.codec.entityOfUpdate(undefined, payload);
        const previous = this.entities.get(probe.id);
        if (!previous) return this.fail("unknown-entity");
        this.entities.set(probe.id, this.codec.entityOfUpdate(previous, payload));
        return "applied";
    }

    acceptLeave(payload: TLeave): ObserverReconcileResult {
        if (!this.advance(payload)) return "resync";
        const id = this.codec.idOfLeave(payload);
        if (!this.entities.delete(id)) return this.fail("unknown-entity");
        return "applied";
    }

    /** 私有流 / 回执：不改实体集，只推进 cursor（与视野流共用单 seq 流）。 */
    acceptPrivate(payload: ObserverEnvelopeLike): ObserverReconcileResult {
        return this.advance(payload) ? "applied" : "resync";
    }

    acceptBaselineBegin(payload: ObserverBaselineBeginLike): ObserverReconcileResult {
        if (payload.seq <= this.lastSeq && this.synced) return this.fail("baseline-begin");
        this.assembly = { begin: payload, chunks: new Map() };
        return "applied";
    }

    acceptBaselineChunk(payload: ObserverBaselineChunkLike): ObserverReconcileResult {
        const assembly = this.assembly;
        if (!assembly || payload.baselineId !== assembly.begin.baselineId || payload.seq !== assembly.begin.seq
            || payload.index < 0 || payload.index >= assembly.begin.chunkCount || assembly.chunks.has(payload.index)) {
            return this.fail("baseline-chunk");
        }
        assembly.chunks.set(payload.index, payload.items);
        return "applied";
    }

    acceptBaselineEnd(payload: ObserverBaselineEndLike): ObserverReconcileResult {
        const assembly = this.assembly;
        if (!assembly || payload.baselineId !== assembly.begin.baselineId || payload.seq !== assembly.begin.seq) return this.fail("baseline-end");
        if (assembly.chunks.size !== assembly.begin.chunkCount) return this.fail("baseline-count");
        const items: unknown[] = [];
        for (let index = 0; index < assembly.begin.chunkCount; index += 1) items.push(...(assembly.chunks.get(index) ?? []));
        if (items.length !== assembly.begin.itemCount) return this.fail("baseline-count");
        if (wireChecksum(items) !== payload.checksum) return this.fail("baseline-checksum");
        this.entities.clear();
        for (const item of items) {
            const entity = this.codec.entityOfItem(item);
            this.entities.set(entity.id, entity);
        }
        this.lastSeq = payload.seq;
        this.synced = true;
        this.assembly = null;
        this.resyncNeeded = false;
        this.lastFailure = null;
        return "applied";
    }

    private advance(payload: ObserverEnvelopeLike): boolean {
        if (!this.synced) { this.fail("no-baseline"); return false; }
        // 一旦失步，本地实体集已不可信：后续差分一律拒，直到新 baseline 整体替换（⛔ 不补洞、不猜）
        if (this.resyncNeeded) return false;
        if (payload.seq !== this.lastSeq + 1) { this.fail("seq-gap"); return false; }
        this.lastSeq = payload.seq;
        return true;
    }

    private fail(reason: ObserverReconcileFailure): "resync" {
        this.lastFailure = reason;
        this.resyncNeeded = true;
        this.assembly = null;
        return "resync";
    }
}
