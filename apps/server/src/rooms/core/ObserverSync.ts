/**
 * 观察者同步（MMO MF5a-B2，docs/MMO.md §4.3 / §5.4 MF5a）：把一个会话的「视野内实体投影」差分成
 * enter（完整）/ update（变化）/ leave（id）三类 perSession 消息，同一 tick 内有序（leave → enter → update，各按 id 升序），
 * 同一会话的三类消息与 baseline 共用**单条单调 seq 流**。
 *
 * 分工：候选与投影由 mode 决定（网格 / 可见性规则 / 私有字段过滤），本类只做差分、编号、投递；
 * token 与 payload 构造器由 mode 注入（wire 属 mode），三个 token 必须是 perSession（构造期 fail-closed）。
 * 投递落到 `sink.emit`（传输壳接 OutboundQueue），⛔ 本类不碰 Colyseus。
 */
import type { GameplayS2CToken, IObserverEnvelope } from "@game/shared";
import { InterestSet, type InterestDiff, type InterestView } from "./InterestSet";

/** mode 交来的可见投影：id 稳定、rev 随可见字段变化而变（不变 ⇒ 不发 update）。 */
export interface ObservedEntity {
    readonly id: string;
    readonly rev: number;
}

export interface ObserverSyncTokens<TEnter, TUpdate, TLeave> {
    readonly enter: GameplayS2CToken<TEnter>;
    readonly update: GameplayS2CToken<TUpdate>;
    readonly leave: GameplayS2CToken<TLeave>;
}

export interface ObserverSyncBuilders<TEntity extends ObservedEntity, TEnter, TUpdate, TLeave> {
    enter(entity: TEntity, envelope: IObserverEnvelope): TEnter;
    update(entity: TEntity, envelope: IObserverEnvelope): TUpdate;
    leave(entityId: string, envelope: IObserverEnvelope): TLeave;
}

/** 投递面（传输壳接 OutboundQueue.push；单测接记录器）。 */
export interface ObserverSyncSink {
    emit(session: string, token: GameplayS2CToken<unknown>, payload: unknown): void;
}

export function assertPerSessionToken(token: GameplayS2CToken<unknown>, role: string): void {
    if (!token || token.dir !== "s2c" || token.perSession !== true) {
        throw new TypeError(`[ObserverSync] ${role} token 必须是 perSession S2C：${String((token as { type?: unknown } | undefined)?.type)}`);
    }
}

export class ObserverSync<TEntity extends ObservedEntity, TEnter = unknown, TUpdate = unknown, TLeave = unknown> {
    private readonly seqBySession = new Map<string, number>();

    constructor(
        private readonly tokens: ObserverSyncTokens<TEnter, TUpdate, TLeave>,
        private readonly builders: ObserverSyncBuilders<TEntity, TEnter, TUpdate, TLeave>,
        private readonly sink: ObserverSyncSink,
        readonly interest: InterestSet = new InterestSet(),
    ) {
        assertPerSessionToken(tokens.enter as GameplayS2CToken<unknown>, "enter");
        assertPerSessionToken(tokens.update as GameplayS2CToken<unknown>, "update");
        assertPerSessionToken(tokens.leave as GameplayS2CToken<unknown>, "leave");
    }

    /** 该会话已发出的最后一个 seq（0 = 尚未发过）。 */
    seq(session: string): number {
        return this.seqBySession.get(session) ?? 0;
    }

    /** 领取下一个 seq（Baseline 与差分共用同一条流）。 */
    nextSeq(session: string): number {
        const next = this.seq(session) + 1;
        this.seqBySession.set(session, next);
        return next;
    }

    /**
     * 用这一 tick 的可见实体集替换上一版视图并投递差分：leave（id 升序）→ enter（id 升序）→ update（id 升序），
     * 每条一个 seq。返回差分供 mode 观察 / 测试断言。
     */
    diffAndEmit(session: string, entities: ReadonlyMap<string, TEntity>, tick: number): InterestDiff {
        const next = new Map<string, number>();
        for (const [id, entity] of entities) {
            if (entity.id !== id) throw new TypeError(`[ObserverSync] 实体键 ${id} 与 entity.id ${entity.id} 不一致`);
            next.set(id, entity.rev);
        }
        const { diff } = this.interest.replace(session, next as InterestView);
        for (const id of diff.left) {
            const envelope = this.envelope(session, tick);
            this.sink.emit(session, this.tokens.leave as GameplayS2CToken<unknown>, this.builders.leave(id, envelope));
        }
        for (const id of diff.entered) {
            const envelope = this.envelope(session, tick);
            this.sink.emit(session, this.tokens.enter as GameplayS2CToken<unknown>, this.builders.enter(entities.get(id) as TEntity, envelope));
        }
        for (const id of diff.updated) {
            const envelope = this.envelope(session, tick);
            this.sink.emit(session, this.tokens.update as GameplayS2CToken<unknown>, this.builders.update(entities.get(id) as TEntity, envelope));
        }
        return diff;
    }

    /** baseline 之后重置视图（不投递）：客户端已持有完整集合，后续差分相对它。 */
    rebase(session: string, entities: ReadonlyMap<string, TEntity>): void {
        const next = new Map<string, number>();
        for (const [id, entity] of entities) next.set(id, entity.rev);
        this.interest.rebase(session, next as InterestView);
    }

    /** 会话最终离开：视图与 seq 一起忘掉（重连宽限内 ⛔ 不调，seq 流要续）。 */
    forget(session: string): void {
        this.interest.remove(session);
        this.seqBySession.delete(session);
    }

    private envelope(session: string, tick: number): IObserverEnvelope {
        return { seq: this.nextSeq(session), tick };
    }
}
