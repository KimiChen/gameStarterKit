/**
 * viewFixture mode（MMO MF5a-B5 SQL 视图房夹具；docs/MMO.md §5.4 MF5a「SQL 视图房夹具」）：⛔ 不进生产 registry / 默认撮合池，
 * 单测（内存源）与 test:int（`k_kitfix_view` 表）共用本模块，按注入 mode 直构 GameRoom 或临时登记进 registry。
 *
 * 分工示范（kit ⛔ 自建 AOI 差分 / 投递内核）：
 *  - mode 只做「候选 + 可见性 + 私有字段过滤」：视口（切比雪夫距离 ≤ VIEW_FIXTURE_RANGE）决定 visibleEntities 的**公开投影**
 *    （id / x / y / rev），私有字段 `note` 只经 `observers.emitPerSession(private)` 发给 owner 会话；
 *  - 框架做差分 / 编号 / baseline / 有界投递（GameRoom 每 tick 排空）。
 * 持久真源经 `ViewSource.load()` 拉取（内存或 SQL），每 `pollTicks` 个 tick 重拉一次（SQL 提交后的提示只是加速，不是权威）。
 */
import {
    VIEW_FIXTURE_RANGE,
    ViewFixtureBaselineBegin, ViewFixtureBaselineChunk, ViewFixtureBaselineEnd, ViewFixtureEnter, ViewFixtureLeave, ViewFixtureLook,
    ViewFixturePrivate, ViewFixtureResync, ViewFixtureUpdate, gameplayC2STokens,
    type IObserverEnvelope, type IViewFixtureEntityWire, type IViewFixtureLookReq,
} from "@game/shared";
import type { GameMode, GameModeContext, GameModeObserverCapability, GameplayCommandsFor } from "../../src/rooms/GameMode";
import type { ViewFixtureState } from "../../src/rooms/schema/GameRoomState";

export const VIEW_FIXTURE_MODE_ID = "viewFixture";

/** 持久真源里的一行（SQL k_kitfix_view / 内存表同形）。 */
export interface ViewRow {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    /** 公开投影修订号（x / y 变即 +1）。 */
    readonly rev: number;
    readonly ownerUid: string | null;
    /** 私有字段：只发给 owner。 */
    readonly note: string;
    readonly noteRev: number;
}

export interface ViewSource {
    load(): Promise<readonly ViewRow[]> | readonly ViewRow[];
}

/** 单测用内存真源：直接改行。 */
export class MemoryViewSource implements ViewSource {
    private readonly rows = new Map<string, ViewRow>();
    constructor(rows: readonly ViewRow[] = []) { for (const row of rows) this.rows.set(row.id, row); }
    load(): readonly ViewRow[] { return [...this.rows.values()]; }
    set(row: ViewRow): void { this.rows.set(row.id, row); }
    move(id: string, x: number, y: number): void {
        const row = this.rows.get(id);
        if (!row) throw new Error(`no row ${id}`);
        this.rows.set(id, { ...row, x, y, rev: row.rev + 1 });
    }
    note(id: string, note: string): void {
        const row = this.rows.get(id);
        if (!row) throw new Error(`no row ${id}`);
        this.rows.set(id, { ...row, note, noteRev: row.noteRev + 1 });
    }
    remove(id: string): void { this.rows.delete(id); }
}

type ViewEntity = IViewFixtureEntityWire;

export interface ViewFixtureModeOptions {
    readonly source: ViewSource;
    readonly roster?: { readonly min: number; readonly max: number; readonly autoStart: number };
    readonly limits?: GameModeObserverCapability["limits"];
    /** 每多少 tick 重拉真源；缺省 1（单测逐 tick 可见）。 */
    readonly pollTicks?: number;
}

export interface ViewFixtureMode extends GameMode<ViewFixtureState, { id: string; name: string }> {
    readonly __probe: {
        rows(): ReadonlyMap<string, ViewRow>;
        viewports(): ReadonlyMap<string, { readonly x: number; readonly y: number }>;
        refresh(): Promise<void>;
    };
}

const within = (viewport: { readonly x: number; readonly y: number }, row: ViewRow): boolean =>
    Math.abs(row.x - viewport.x) <= VIEW_FIXTURE_RANGE && Math.abs(row.y - viewport.y) <= VIEW_FIXTURE_RANGE;

export function createViewFixtureMode(options: ViewFixtureModeOptions): ViewFixtureMode {
    const rows = new Map<string, ViewRow>();
    const viewports = new Map<string, { x: number; y: number }>();
    const sessions = new Set<string>();
    /** session → (entity id → 已发出的 noteRev) */
    const privateSent = new Map<string, Map<string, number>>();
    const pollTicks = options.pollTicks ?? 1;
    let loading: Promise<void> | null = null;

    const applyRows = (loaded: readonly ViewRow[]): void => {
        rows.clear();
        for (const row of loaded) rows.set(row.id, row);
    };
    /** 内存源同步落地（同 tick 可见）；SQL 源异步落地（下一 tick 的差分吸收），进行中的加载不重入。 */
    const refresh = (): Promise<void> => {
        const loaded = options.source.load();
        if (Array.isArray(loaded)) { applyRows(loaded); return Promise.resolve(); }
        if (loading) return loading;
        loading = (loaded as Promise<readonly ViewRow[]>).then(applyRows).finally(() => { loading = null; });
        return loading;
    };

    const projectionOf = (row: ViewRow): ViewEntity => ({ id: row.id, x: row.x, y: row.y, rev: row.rev });

    const observer: GameModeObserverCapability<ViewFixtureState, ViewEntity, ViewEntity> = {
        tokens: { enter: ViewFixtureEnter, update: ViewFixtureUpdate, leave: ViewFixtureLeave },
        builders: {
            enter: (entity: ViewEntity, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, entity }),
            update: (entity: ViewEntity, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, ...entity }),
            leave: (entityId: string, envelope: IObserverEnvelope) => ({ seq: envelope.seq, tick: envelope.tick, id: entityId }),
        },
        baseline: {
            tokens: { begin: ViewFixtureBaselineBegin, chunk: ViewFixtureBaselineChunk, end: ViewFixtureBaselineEnd },
            builders: {
                begin: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, tick: meta.tick, chunkCount: meta.chunkCount, itemCount: meta.itemCount }),
                chunk: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, index: meta.index, items: meta.items }),
                end: (meta) => ({ baselineId: meta.baselineId, seq: meta.seq, checksum: meta.checksum }),
            },
            chunkItems: 2,
        },
        visibleEntities: (session) => {
            const viewport = viewports.get(session) ?? { x: 0, y: 0 };
            const visible = new Map<string, ViewEntity>();
            for (const row of rows.values()) {
                if (within(viewport, row)) visible.set(row.id, projectionOf(row));
            }
            return visible;
        },
        ...(options.limits ? { limits: options.limits } : {}),
    };

    return {
        id: VIEW_FIXTURE_MODE_ID,
        roster: options.roster ?? { min: 1, max: 8, autoStart: 1 },
        createPlayer: ({ sessionId, name }) => ({ id: sessionId, name }),
        observer: observer as unknown as GameMode<ViewFixtureState>["observer"],
        commands: {
            [ViewFixtureLook.type]: (context: GameModeContext<ViewFixtureState> & { readonly client: { readonly sessionId: string } }, payload: IViewFixtureLookReq): void => {
                const previous = viewports.get(context.client.sessionId) ?? { x: 0, y: 0 };
                viewports.set(context.client.sessionId, { x: payload.x, y: payload.y });
                // 兴趣集突变（跳出整个视野）⇒ 让框架重发只含兴趣集的 baseline，而不是一长串 leave / enter
                if (Math.abs(payload.x - previous.x) > VIEW_FIXTURE_RANGE * 2 || Math.abs(payload.y - previous.y) > VIEW_FIXTURE_RANGE * 2) {
                    context.observers.requestBaseline(context.client.sessionId);
                }
            },
            [ViewFixtureResync.type]: (context: GameModeContext<ViewFixtureState> & { readonly client: { readonly sessionId: string } }): void => {
                context.observers.requestBaseline(context.client.sessionId);
            },
        } satisfies GameplayCommandsFor<ViewFixtureState, typeof gameplayC2STokens.viewFixture> as unknown as GameMode<ViewFixtureState>["commands"],
        onAdmission: ({ client }) => { sessions.add(client.sessionId); return true; },
        onMatchInitialize: async ({ state }) => {
            await refresh();
            state.revision = Math.max(0, ...[...rows.values()].map((row) => row.rev));
        },
        onStep: (context) => {
            if (pollTicks <= 1 || context.state.tick % pollTicks === 0) {
                // 内存源同步完成；SQL 源异步到达（下一 tick 的差分自然吸收）
                void refresh();
            }
            let revision = 0;
            for (const row of rows.values()) revision = Math.max(revision, row.rev);
            context.state.revision = revision;
            // 本人私有流：只发给 owner 会话，noteRev 前进才发（不可丢类，与视野流共用单 seq 流）
            for (const session of sessions) {
                const uid = context.userIdOf(session);
                if (uid === null) continue;
                const sent = privateSent.get(session) ?? new Map<string, number>();
                privateSent.set(session, sent);
                for (const row of rows.values()) {
                    if (row.ownerUid !== uid || (sent.get(row.id) ?? -1) >= row.noteRev) continue;
                    sent.set(row.id, row.noteRev);
                    context.observers.emitPerSession(session, ViewFixturePrivate, {
                        seq: context.observers.nextSeq(session), tick: context.state.tick, id: row.id, note: row.note,
                    });
                }
            }
        },
        onPlayerLeaving: ({ client }) => {
            sessions.delete(client.sessionId);
            viewports.delete(client.sessionId);
            privateSent.delete(client.sessionId);
        },
        __probe: { rows: () => rows, viewports: () => viewports, refresh },
    };
}
