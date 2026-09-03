/** Snake V2 分块 baseline / 有序 delta 消费与插值；纯 Logic，无引擎/网络依赖。 */
import {
    snakeWireChecksum,
    validateSnakeWorldSnapshot,
    type ISnakeBaselineBegin,
    type ISnakeBaselineChunk,
    type ISnakeBaselineEnd,
    type ISnakeDisplayRankEntry,
    type ISnakeRunDelta,
    type ISnakeSnapshotFood,
    type ISnakeSnapshotSnake,
    type ISnakeSnapshotTool,
    type ISnakeSnapshotWreck,
    type ISnakeWorldDelta,
    type ISnakeWorldSnapshot,
    type SnakeBaselineChunkKind,
} from "../../../shared/index";
import { SNAKE_RULESET } from "../../../shared/gameplays/snake/ruleset";

export type SnakeSnapshotLike = ISnakeWorldSnapshot;
export type SnakeSnapshotSnakeLike = ISnakeSnapshotSnake;
export type SnakeSnapshotPointLike = ISnakeSnapshotSnake["points"][number];

export interface SnakeRenderSnake extends Omit<ISnakeSnapshotSnake, "points"> {
    readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface SnakeRenderFrame {
    readonly tick: number;
    readonly envelopeTick: number;
    readonly seq: number;
    readonly snakes: readonly SnakeRenderSnake[];
    readonly foods: readonly ISnakeSnapshotFood[];
    readonly wrecks: readonly ISnakeSnapshotWreck[];
    readonly tools: readonly ISnakeSnapshotTool[];
    readonly runs: readonly ISnakeRunDelta[];
    readonly displayRank: readonly ISnakeDisplayRankEntry[];
}

interface BaselineAssembly {
    readonly begin: ISnakeBaselineBegin;
    readonly chunks: ISnakeBaselineChunk[];
}

export interface SnakeResyncRequest {
    readonly roomEpochId: string;
    readonly afterSeq: number;
    readonly reason: string;
}

export class SnakeSnapshotBuffer {
    private roomEpochId: string | null = null;
    private lastSeq = 0;
    private lastTick = -1;
    private previous: ISnakeWorldSnapshot | null = null;
    private latest: ISnakeWorldSnapshot | null = null;
    private assembly: BaselineAssembly | null = null;
    private resync: SnakeResyncRequest | null = null;
    private resyncDispatched = false;
    private readonly seenToolIds = new Set<number>();

    attach(roomEpochId: string): void {
        if (this.roomEpochId !== roomEpochId) this.reset(roomEpochId);
    }

    reset(roomEpochId: string | null = null): void {
        this.roomEpochId = roomEpochId;
        this.lastSeq = 0;
        this.lastTick = -1;
        this.previous = null;
        this.latest = null;
        this.assembly = null;
        this.resync = null;
        this.resyncDispatched = false;
        this.seenToolIds.clear();
    }

    get ready(): boolean { return this.latest !== null && this.resync === null; }
    get latestTick(): number { return this.latest?.tick ?? 0; }
    get latestSnapshot(): ISnakeWorldSnapshot | null { return this.latest; }

    takeResyncRequest(): SnakeResyncRequest | null {
        if (!this.resync || this.resyncDispatched) return null;
        this.resyncDispatched = true;
        return this.resync;
    }

    private fail(reason: string): false {
        if (this.roomEpochId && !this.resync) {
            this.resync = { roomEpochId: this.roomEpochId, afterSeq: this.lastSeq, reason };
            this.resyncDispatched = false;
        }
        this.assembly = null;
        return false;
    }

    acceptBaselineBegin(begin: ISnakeBaselineBegin): boolean {
        if (!this.roomEpochId || begin.roomEpochId !== this.roomEpochId) return this.fail("baseline-epoch");
        if (begin.seq <= this.lastSeq || begin.chunkCount < 1) return this.fail("baseline-seq");
        this.assembly = { begin, chunks: [] };
        return true;
    }

    acceptBaselineChunk(chunk: ISnakeBaselineChunk): boolean {
        const assembly = this.assembly;
        if (!assembly || chunk.baselineId !== assembly.begin.baselineId
            || chunk.roomEpochId !== assembly.begin.roomEpochId
            || chunk.seq !== assembly.begin.seq
            || chunk.envelopeTick !== assembly.begin.envelopeTick
            || chunk.index !== assembly.chunks.length
            || chunk.index >= assembly.begin.chunkCount) {
            return this.fail("baseline-chunk-order");
        }
        assembly.chunks.push(chunk);
        return true;
    }

    acceptBaselineEnd(end: ISnakeBaselineEnd): boolean {
        const assembly = this.assembly;
        if (!assembly || end.baselineId !== assembly.begin.baselineId
            || end.roomEpochId !== assembly.begin.roomEpochId
            || end.seq !== assembly.begin.seq
            || end.envelopeTick !== assembly.begin.envelopeTick
            || assembly.chunks.length !== assembly.begin.chunkCount) {
            return this.fail("baseline-end");
        }
        const collected: Record<SnakeBaselineChunkKind, unknown[]> = {
            snakes: [], foods: [], wrecks: [], tools: [], runs: [], displayRank: [],
        };
        for (const chunk of assembly.chunks) collected[chunk.kind].push(...chunk.items);
        const snakes = collected.snakes as unknown as ISnakeSnapshotSnake[];
        const foods = collected.foods as unknown as ISnakeSnapshotFood[];
        const wrecks = collected.wrecks as unknown as ISnakeSnapshotWreck[];
        const tools = collected.tools as unknown as ISnakeSnapshotTool[];
        const runs = collected.runs as unknown as ISnakeRunDelta[];
        const displayRank = collected.displayRank as unknown as ISnakeDisplayRankEntry[];
        const pointCount = snakes.reduce((sum, snake) => sum + snake.points.length, 0);
        if (snakes.length !== assembly.begin.snakeCount || foods.length !== assembly.begin.foodCount
            || wrecks.length !== assembly.begin.wreckCount || tools.length !== assembly.begin.toolCount
            || runs.length !== assembly.begin.runCount || pointCount !== assembly.begin.pointCount) {
            return this.fail("baseline-count");
        }
        const snapshot: ISnakeWorldSnapshot = {
            roomEpochId: assembly.begin.roomEpochId,
            matchId: assembly.begin.roomEpochId,
            tick: assembly.begin.envelopeTick,
            envelopeTick: assembly.begin.envelopeTick,
            seq: assembly.begin.seq,
            snakes,
            foods,
            wrecks,
            tools,
            runs,
            displayRank,
        };
        let validated: ISnakeWorldSnapshot;
        try { validated = validateSnakeWorldSnapshot(snapshot); }
        catch { return this.fail("baseline-content"); }
        if (snakeWireChecksum(validated) !== end.checksum) return this.fail("baseline-checksum");
        const currentToolIds = new Set(this.latest?.tools.map((tool) => tool.id) ?? []);
        for (const tool of validated.tools) {
            if (!currentToolIds.has(tool.id) && this.seenToolIds.has(tool.id)) return this.fail("tool-id-reuse");
        }
        this.assembly = null;
        this.previous = this.latest;
        this.latest = validated;
        this.lastSeq = validated.seq;
        this.lastTick = validated.tick;
        for (const tool of tools) this.seenToolIds.add(tool.id);
        this.resync = null;
        this.resyncDispatched = false;
        return true;
    }

    acceptDelta(delta: ISnakeWorldDelta): boolean {
        const previous = this.latest;
        if (this.resync) return false;
        if (!this.roomEpochId || !previous || delta.roomEpochId !== this.roomEpochId) return this.fail("delta-epoch");
        if (delta.baseSeq !== this.lastSeq || delta.seq !== this.lastSeq + 1 || delta.tick < this.lastTick) {
            return this.fail("delta-seq");
        }
        const apply = <T extends { readonly id: string | number }>(
            current: readonly T[], removals: readonly (string | number)[], upserts: readonly T[],
        ): readonly T[] => {
            const values = new Map<string | number, T>(current.map((item) => [item.id, item]));
            for (const id of removals) values.delete(id);
            for (const item of upserts) values.set(item.id, item);
            return [...values.values()];
        };
        const currentToolIds = new Set(previous.tools.map((tool) => tool.id));
        for (const tool of delta.toolUpserts) {
            if (!currentToolIds.has(tool.id) && this.seenToolIds.has(tool.id)) return this.fail("tool-id-reuse");
        }
        const runs = new Map(previous.runs.map((run) => [run.id, run]));
        for (const id of delta.runRemovals) runs.delete(id);
        for (const run of delta.runUpdates) runs.set(run.id, run);
        const upsertedSnakeIds = new Set(delta.snakeUpserts.map((snake) => snake.id));
        const removedSnakeIds = new Set(delta.snakeRemovals);
        const snakes = apply(previous.snakes, delta.snakeRemovals, delta.snakeUpserts);
        const snakeById = new Map(snakes.map((snake) => [snake.id, snake]));
        for (const pathDelta of delta.snakePathDeltas) {
            const snake = snakeById.get(pathDelta.id);
            if (!snake || upsertedSnakeIds.has(pathDelta.id) || removedSnakeIds.has(pathDelta.id)
                || pathDelta.trimTail > snake.points.length) return this.fail("snake-path-target");
            const retained = snake.points.slice(0, snake.points.length - pathDelta.trimTail);
            const points = [...pathDelta.append, ...retained];
            if (points.length < 1 || points.length > SNAKE_RULESET.snapshotMaxPointsPerSnake) {
                return this.fail("snake-path-capacity");
            }
            snakeById.set(pathDelta.id, { ...snake, points });
        }
        const candidate: ISnakeWorldSnapshot = {
            roomEpochId: delta.roomEpochId,
            matchId: delta.roomEpochId,
            tick: delta.tick,
            envelopeTick: delta.envelopeTick,
            seq: delta.seq,
            snakes: snakes.map((snake) => snakeById.get(snake.id) ?? snake),
            foods: apply(previous.foods, delta.foodRemovals, delta.foodUpserts),
            wrecks: apply(previous.wrecks, delta.wreckRemovals, delta.wreckUpserts),
            tools: apply(previous.tools, delta.toolRemovals, delta.toolUpserts),
            runs: [...runs.values()],
            displayRank: delta.displayRank,
        };
        let validated: ISnakeWorldSnapshot;
        try { validated = validateSnakeWorldSnapshot(candidate); }
        catch { return this.fail("delta-content"); }
        if (snakeWireChecksum(validated) !== delta.checksum) return this.fail("delta-checksum");
        this.previous = previous;
        this.latest = validated;
        this.lastSeq = validated.seq;
        this.lastTick = validated.tick;
        for (const tool of delta.toolUpserts) this.seenToolIds.add(tool.id);
        this.resync = null;
        return true;
    }

    /** 测试/本地预览完整模型入口；线上只走 baseline/delta。 */
    offer(snapshot: ISnakeWorldSnapshot): boolean {
        if (!this.roomEpochId || snapshot.roomEpochId !== this.roomEpochId || snapshot.matchId !== this.roomEpochId) return false;
        if (snapshot.seq <= this.lastSeq || snapshot.tick < this.lastTick) return false;
        let validated: ISnakeWorldSnapshot;
        try { validated = validateSnakeWorldSnapshot(snapshot); }
        catch { return false; }
        const currentToolIds = new Set(this.latest?.tools.map((tool) => tool.id) ?? []);
        for (const tool of validated.tools) {
            if (!currentToolIds.has(tool.id) && this.seenToolIds.has(tool.id)) return this.fail("tool-id-reuse");
        }
        this.previous = this.latest;
        this.latest = validated;
        this.lastSeq = validated.seq;
        this.lastTick = validated.tick;
        for (const tool of validated.tools) this.seenToolIds.add(tool.id);
        this.resync = null;
        this.resyncDispatched = false;
        return true;
    }

    sample(renderTick: number): SnakeRenderFrame | null {
        const latest = this.latest;
        if (!latest) return null;
        const previous = this.previous;
        if (!previous || renderTick >= latest.tick) return frameOf(latest, latest);
        if (renderTick <= previous.tick) return frameOf(previous, previous);
        const span = latest.tick - previous.tick;
        return frameOf(latest, latest, previous, span > 0 ? (renderTick - previous.tick) / span : 1);
    }
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function frameOf(
    latest: ISnakeWorldSnapshot,
    base: ISnakeWorldSnapshot,
    previous?: ISnakeWorldSnapshot,
    alpha = 1,
): SnakeRenderFrame {
    const priorById = new Map(previous?.snakes.map((snake) => [snake.id, snake]) ?? []);
    const snakes = latest.snakes.map((snake): SnakeRenderSnake => {
        const prior = priorById.get(snake.id);
        return {
            ...snake,
            points: snake.points.map((point, index) => {
                const old = prior?.points[index];
                return !old || !snake.alive || !prior?.alive
                    ? { x: point.x, y: point.y }
                    : { x: lerp(old.x, point.x, alpha), y: lerp(old.y, point.y, alpha) };
            }),
        };
    });
    return {
        tick: base.tick,
        envelopeTick: base.envelopeTick,
        seq: base.seq,
        snakes,
        foods: latest.foods,
        wrecks: latest.wrecks,
        tools: latest.tools,
        runs: latest.runs,
        displayRank: latest.displayRank,
    };
}
